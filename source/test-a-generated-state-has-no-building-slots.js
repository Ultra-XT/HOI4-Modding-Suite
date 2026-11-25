// Every state must have building slots, and the land generator wrote states with none.
// #a-generated-state-has-no-building-slots
//
// map/buildings.txt holds the model positions for everything buildable, keyed by state. The nudger's own
// wiki page says of that section: "Will cause crashes if a new state is created without that being
// adjusted." The invariant is absolute in shipping content — re-derived here on every run rather than
// quoted: vanilla 1081/1081, Novum Vexillum 1371/1371, Rise of Nations 1154/1154, Old World Blues
// 1524/1524, Millennium Dawn 1221/1221, Road to 56 1143/1143. **6,494 states, not one without slots.**
//
// createState already calls ensureBuildingSlotsForState for exactly this reason — that was the fix for
// "Nova wrote 0". generateLand writes its state files directly with safeModWrite and never adopted it. That
// is the dominant bug shape in this project: the fix exists next door and one caller missed it.
//
// ⚠️ MEASURED ON THE OWNER'S OWN WORKFLOW. Delete map, then Generate land, then Auto-fix — the documented
// way to build a map from scratch. The 32 generated states ended up sharing **40 rows**, every single one a
// naval_base_spawn that fixCoastalNoPort had added because the province was coastal. Not one arms_factory,
// industrial_complex, bunker, supply_node or air_base between them: 32 states in which the player cannot
// build anything. With the helper adopted the same run writes **1,088 rows — 34 per state**, which is the
// universal 13-type template every one of vanilla's 1,081 states carries.
//
// ⚠️ It also hid behind a passing symptom. buildings_empty (FATAL) cleared after Auto-fix on that journey,
// because 40 naval bases are enough to make the file non-empty. The map looked repaired.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gs-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [HOME];

// Rows in a buildings.txt, grouped by the state they are keyed to.
const slotsByState = (file) => {
  const by = new Map();
  let txt = "";
  try { txt = fs.readFileSync(file, "utf8"); } catch (_) { return by; }
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const c = t.split(";");
    if (c.length < 7) continue;
    if (!by.has(c[0])) by.set(c[0], []);
    by.get(c[0]).push((c[1] || "").trim());
  }
  return by;
};

try {
  console.log("1. 🈯 The invariant, re-derived from every installed map");
  {
    const roots = [];
    if (fs.existsSync(path.join(GAME, "map", "buildings.txt"))) roots.push(["vanilla", GAME]);
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const r = path.join(WS, id);
      if (fs.existsSync(path.join(r, "map", "buildings.txt")) && fs.existsSync(path.join(r, "history", "states"))) roots.push([id, r]);
    }
    if (roots.length < 3) {
      rec("enough installed maps to derive the invariant", false, roots.length + " found — a skip reads as a pass, so this fails");
    } else {
      let totalStates = 0, totalMissing = 0;
      for (const [, r] of roots) {
        const by = slotsByState(path.join(r, "map", "buildings.txt"));
        for (const f of fs.readdirSync(path.join(r, "history", "states"))) {
          if (!f.toLowerCase().endsWith(".txt")) continue;
          let t = "";
          try { t = fs.readFileSync(path.join(r, "history", "states", f), "utf8"); } catch (_) { continue; }
          const m = /(^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(t.replace(/#[^\n]*/g, ""));
          if (!m) continue;
          totalStates++;
          if (!by.has(m[2])) totalMissing++;
        }
      }
      rec("the corpus is big enough to mean something", totalStates > 5000, totalStates + " states across " + roots.length + " maps");
      rec("⭐⭐⭐ NOT ONE shipping state is missing its building slots", totalMissing === 0, totalMissing + " missing");
    }
  }

  console.log("\n2. ⛔ Generated states get slots");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gs-mod-")); tmps.push(mod);
    fs.writeFileSync(path.join(mod, "descriptor.mod"),
      'version="1"\nname="GS"\nsupported_version="1.19.*"\nreplace_path="history/states"\n');
    const A = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };

    const g = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 16, provincesPerState: 8, seed: 3, owner: "ENG", manpower: 10000, continent: 1 });
    rec("the generator ran", g.changed === true && g.createdStates > 0, { changed: g.changed, created: g.createdStates, error: g.error });
    rec("…and reported no slot failures", (g.slotFailures || []).length === 0, g.slotFailures);

    const by = slotsByState(path.join(mod, "map", "buildings.txt"));
    const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
    const made = [];
    for (let sid = g.firstStateId; sid <= g.lastStateId; sid++) made.push(String(sid));
    const without = made.filter((s) => !by.has(s));
    rec("⭐⭐⭐ every state the generator made has slots", without.length === 0, without.slice(0, 8));

    // …and they are the real template, not one stray row.
    const counts = made.map((s) => (by.get(s) || []).length);
    rec("⭐⭐ …a full template each, not a single stray row", counts.every((n) => n >= 20), counts.slice(0, 8));
    const types = new Set([].concat(...made.map((s) => by.get(s) || [])));
    rec("⭐⭐ …covering the buildings a player actually builds", ["arms_factory", "industrial_complex", "air_base"].every((t) => types.has(t)),
      [...types].slice(0, 10));
    rec("⚠️ …and NOT just the naval bases the port fixer would have added",
      !(types.size === 1 && types.has("naval_base_spawn")), [...types].length + " distinct types");

    // the whole map, not just the new states
    const missingAnywhere = (model.states || []).filter((s) => !by.has(String(s.id)));
    rec("⭐ no state anywhere in the mod is left without slots", missingAnywhere.length === 0, missingAnywhere.slice(0, 6).map((s) => s.id));
  }

  console.log("\n3. ⭐ createState — the caller that already had it — still does");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gs-mod2-")); tmps.push(mod);
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1"\nname="GS2"\nsupported_version="1.19.*"\n');
    const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
    const land = (model.provinces || []).find((p) => p.type === "land" && p.id > 0);
    if (!land) {
      rec("a land province to build a state on", false, "the base game did not yield one");
    } else {
      const r = md.createState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], name: "SlotCheck", provinces: [land.id] });
      rec("createState made a state", !r.error && r.id != null, r.error || r.id);
      const by = slotsByState(path.join(mod, "map", "buildings.txt"));
      rec("⭐⭐ …and it has slots, so both creators now agree", by.has(String(r.id)), { id: r.id, rows: (by.get(String(r.id)) || []).length });
    }
  }

  console.log(`\n=== a generated state has no building slots: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
