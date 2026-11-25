// #a-fleet-berthed-where-the-map-took-the-land-away — THE CASE THAT COST THE OWNER FOURTEEN LAUNCHES.
//
// findUnitsStrandedByTheMap had two conditions and neither covered it:
//     fleets    — location is LAND WITH NO COAST
//     divisions — location is SEA OR LAKE where the layer below had land
// The water branch only ever added to the division set, and the chain that consumed it was if/else-if, so a
// TASK FORCE standing on water fell past both arms. A fleet's location is its PORT: it has to be land it can
// tie up against.
//
// The owner's rebuilt world berthed hundreds of task forces in provinces Generate land had turned to ocean.
// Nova reported 246 of a different thing (fleet_starts_on_land_with_no_sea) and nothing at all about these.
// The minidump named it exactly — country.cpp "Invalid fleet" -> fleet.cpp -> taskforce.cpp "Invalid
// province" -> ref.h "This Object is not created or a valid CReferenceObject" — one address across six test
// mods, and removing the fleets moved the crash to a different address for the first time in the campaign.
//
// ⚠️ A WARNING, NOT AN ERROR, AND NOT FATAL. Four of the eight installed maps do this at small scale and all
// eight launch. Everything below re-derives that from the installed corpus rather than trusting the numbers.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); } };
const mask = (s) => s.replace(/#[^\n]*/g, (m) => " ".repeat(m.length));

// ── count a map's own fleets berthed off its own land, straight from the files ───────────────────────────
const offLandIn = (root) => {
  const defF = fs.existsSync(path.join(root, "map", "definition.csv")) ? path.join(root, "map", "definition.csv") : path.join(GAME, "map", "definition.csv");
  const type = new Map();
  for (const l of fs.readFileSync(defF, "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length >= 8 && /^\d+$/.test(c[0])) type.set(+c[0], (c[4] || "").trim());
  }
  // The EFFECTIVE set, the way the game reads it: the base game's files, with any same-named file the map
  // ships replacing it whole. Reading only the map's own folder undercounts a mod that ships a few OOBs and
  // inherits the rest, and reading only the base game's ignores what it changed.
  // ⚠️ AND replace_path CUTS THE LAYER BELOW OFF ENTIRELY. Hearts of Minecraft declares
  // replace_path="history/units", so none of the base game's orders of battle load for it — merging them in
  // read 294 fleets berthed off its map, every one of them a ship the game never places there.
  let replacesUnits = false;
  try { replacesUnits = /replace_path\s*=\s*"history\/units"/.test(fs.readFileSync(path.join(root, "descriptor.mod"), "utf8")); } catch (_) {}
  const files = new Map();
  for (const r of (replacesUnits ? [root] : [GAME, root])) {
    const d = path.join(r, "history", "units");
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.txt$/i.test(f)) files.set(f.toLowerCase(), path.join(d, f));
  }
  let total = 0, off = 0;
  for (const p of files.values()) {
    const t = mask(fs.readFileSync(p, "latin1").replace(/^\uFEFF/, ""));
    // \u26A0\uFE0F ONLY THE BERTHS INSIDE A `fleet` BLOCK. The first version of this counted every `location = N` in
    // the file, which is also how a DIVISION is placed \u2014 and a division on water is legal (Millennium Dawn
    // and Rise of Nations both ship some and launch). That read Old World Blues as 67 off land instead of 8
    // and made the threshold look far too tight. A fleet's berth and a division's location are different
    // questions; only the first one is this rule's.
    for (const m of t.matchAll(/\b(?:fleet|navy)\s*=\s*\{/g)) {
      let i = t.indexOf("{", m.index), d = 0, end = -1;
      for (; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { end = i; break; } } }
      if (end < 0) break;
      const body = t.slice(m.index, end + 1);
      // The rule counts started TASK FORCES, so this counts the same thing: `location`, the berth a task
      // force starts in. `naval_base` is the fleet's home port — a different field and a different question,
      // and counting both made the corpus read 36 where the rule would see a different number entirely.
      for (const loc of body.matchAll(/\blocation\s*=\s*(\d+)/g)) {
        total++;
        if (type.get(+loc[1]) !== "land") off++;
      }
    }
  }
  return { total, off };
};

console.log("\n-- ⭐ the corpus, re-derived from the installed maps --");
const corpus = [];
{
  const roots = [["vanilla", GAME]];
  try { for (const d of fs.readdirSync(WS)) { const p = path.join(WS, d); if (fs.existsSync(path.join(p, "map", "definition.csv")) && fs.existsSync(path.join(p, "history", "units"))) roots.push([d, p]); } } catch (_) {}
  for (const [name, root] of roots) {
    const r = offLandIn(root);
    corpus.push({ name, ...r });
    console.log("   " + name.padEnd(14) + String(r.total).padStart(6) + " berths, " + String(r.off).padStart(4) + " off land");
  }
  ok(roots.length >= 2, "there are shipping maps to measure", roots.length);
  const worst = Math.max(...corpus.map((c) => c.off));
  const vanilla = corpus.find((c) => c.name === "vanilla");
  ok(vanilla && vanilla.off === 0, "the base game berths every one of its fleets on land", vanilla);
  // The rule's threshold must be at least what the corpus actually carries, or it cries wolf on a map that ships.
  ok(worst <= md.SHIPPING_MAX_FLEETS_OFF_LAND,
    `the rule's threshold (${md.SHIPPING_MAX_FLEETS_OFF_LAND}) is not below what a shipping map carries (${worst})`,
    { worst, threshold: md.SHIPPING_MAX_FLEETS_OFF_LAND, corpus });
  ok(corpus.some((c) => c.off > 0),
    "…and at least one shipping map DOES berth a fleet off land, so a zero-tolerance rule would cry wolf",
    corpus.filter((c) => c.off > 0));
}

console.log("\n-- the rule is registered and is not fatal --");
ok(typeof labels.mapRuleLabel === "function" && labels.mapRuleLabel("fleet_starts_off_land") !== "fleet_starts_off_land",
  "it has a label a modder can read", labels.mapRuleLabel && labels.mapRuleLabel("fleet_starts_off_land"));
ok(!labels.isFatalRule("fleet_starts_off_land"),
  "⚠️ …and is NOT in the fatal set — four of eight shipping maps carry it and all of them launch");

console.log("\n-- ⭐⭐⭐ a fleet whose berth the map flooded is reported --");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fleetoff-"));
  const mod = path.join(tmp, "mod");
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'version="1"\nname="drowned berth"\nsupported_version="1.19.*"\npath="mod/x"\n');
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
  // Flood the world: every land province becomes sea, so every inherited berth is off land.
  md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });

  const before = offLandIn(GAME).off;
  const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const st = md.findUnitsStrandedByTheMap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model });
  console.log("   base game berths off land: " + before + "   ·   after flooding: " + st.fleetsOffLand.length
    + "   (fleets on a coastless land province: " + st.fleets.length + ")");
  ok(before === 0, "the base game is the control and reports none", before);
  ok(st.fleetsOffLand.length > 100,
    "⭐⭐⭐ flooding the map strands the inherited fleets, and the rule SEES them — this is the half that did not exist",
    st.fleetsOffLand.length);
  ok(st.fleetsOffLand.every((u) => u.kind === "task_force" || u.kind === "navy"),
    "…and every one of them is a task force, not a division picked up by mistake",
    st.fleetsOffLand.filter((u) => u.kind !== "task_force" && u.kind !== "navy").slice(0, 3));

  // and the validator publishes it, with its true weight rather than a capped array
  const probs = md.validateMapModel(model).concat(md.validateMapBitmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }));
  const p = probs.find((x) => x.rule === "fleet_starts_off_land");
  ok(!!p, "the validator publishes it", probs.map((x) => x.rule).slice(0, 12));
  if (p) {
    ok(p.severity === "warning", "…as a warning", p.severity);
    ok(p.total === st.fleetsOffLand.length,
      "⭐⭐ …carrying its own `total`, because `items` is capped at 40 and a summary that measured the payload would report 40",
      { total: p.total, items: (p.items || []).length, real: st.fleetsOffLand.length });
    ok(/no longer land/i.test(String(p.message)), "…and says what happened", String(p.message).slice(0, 120));
    ok(String(p.message).includes(String(md.SHIPPING_MAX_FLEETS_OFF_LAND)),
      "…and quotes the corpus rather than asserting a bare threshold");
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== a fleet berthed where the map took the land away: ${pass + fail} checks, ${fail} failed ===`);
if (fail) process.exitCode = 1;
