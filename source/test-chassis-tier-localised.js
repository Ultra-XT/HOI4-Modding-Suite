// #chassis-tier-unlocalised — NAME THE THING THE PLAYER ACTUALLY PICKS.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `POST /api/equipment/chassis-new` writes TWO entries: the archetype `<id>` and the buildable tier `<id>_1`.
// It localised only the first. The archetype is a grouping; the TIER is what appears in the designer's chassis
// picker and in the production list — so the thing the player actually picks rendered as its raw token, while
// the field that produced it is labelled "Display name — what players see".
//
// Vanilla names both halves: `light_tank_chassis: "Light Tank"` AND `light_tank_chassis_1: "Basic Light Tank"`.
// Across every vanilla equipment entry carrying an `archetype =`, 260 of 261 are localised; the lone exception
// is a `year = 1954` leftover past the end of the game.
//
// The sibling multi-tier writer in the same file already does this —
// `for (const t of tiers) if (t.name) upsertEquipmentLoc(activeRoot, t.id, t.name)`. Same step, one caller
// short: the shape this codebase keeps producing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chtier-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-chtier-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  return dir;
}
function locText(dir) {
  const d = path.join(dir, "localisation", "english");
  if (!fs.existsSync(d)) return "";
  return fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), "utf8")).join("\n");
}

let PORT = 47000;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function newChassis(api, dir, name) {
  const tpl = await api.get(`/api/equipment/chassis-slot-template?modPath=${encodeURIComponent(dir)}&type=armor`);
  return api.post("/api/equipment/chassis-new", {
    modPath: dir, id: "nova_hull", name: name || "Orbital Platform",
    domain: "armor", type: "armor", slots: (tpl.b && tpl.b.slots) || [],
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] vanilla names the tier, not just the archetype");
    const locDir = path.join(VANILLA, "localisation", "english");
    if (fs.existsSync(locDir)) {
      // Scan the WHOLE localisation folder. Filtering to files named *equipment* found 3 archetypes and 0
      // tiers and made this block fail — the modular tank names ship in the No Step Back files, not in
      // anything called "equipment". A filter that quietly excludes the evidence reads like an absence of it.
      let all = "";
      for (const f of fs.readdirSync(locDir)) {
        if (!f.toLowerCase().endsWith(".yml")) continue;
        try { all += fs.readFileSync(path.join(locDir, f), "utf8") + "\n"; } catch (_) {}
      }
      rec("the archetype has a name", /light_tank_chassis:\s*\d*\s*"/.test(all), "not found");
      rec("…and so does the buildable tier the player picks",
        /light_tank_chassis_1:\s*\d*\s*"/.test(all), "not found");
      const arch = (all.match(/^\s*\w*_chassis:\s*\d*\s*"/gm) || []).length;
      const tiers = (all.match(/^\s*\w*_chassis_\d+:\s*\d*\s*"/gm) || []).length;
      rec("…and that is the pattern, not one lucky pair", tiers >= arch && tiers > 10, { arch, tiers });
      console.log(`  --   measured: ${arch} chassis archetypes named, ${tiers} chassis tiers named`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[a new chassis] names both halves");
    const dir = mkMod();
    const r = await newChassis(api, dir);
    rec("the chassis is created", r.b.ok === true, r.b);
    rec("…and reports the tier it wrote", r.b.tier === "nova_hull_1", r.b);
    const loc = locText(dir);
    rec("the archetype is named", /nova_hull:\s*\d*\s*"Orbital Platform"/.test(loc), loc);
    rec("…and so is the tier, which is what the designer lists",
      /nova_hull_1:\s*\d*\s*"Orbital Platform"/.test(loc), loc);
    rec("…exactly one key each, not a duplicate pair",
      (loc.match(/nova_hull:/g) || []).length === 1 && (loc.match(/nova_hull_1:/g) || []).length === 1, loc);

    console.log("\n[the equipment list] agrees — nothing shows a raw token");
    const list = await api.get(`/api/equipment/list?modPath=${encodeURIComponent(dir)}`);
    const rows = (list.b.equipment || list.b.items || list.b.list || []);
    const arch = rows.find((e) => (e.id || e.name) === "nova_hull");
    const tier = rows.find((e) => (e.id || e.name) === "nova_hull_1");
    if (rows.length) {
      rec("both entries are listed", !!arch && !!tier, rows.map((e) => e.id).slice(0, 8));
      const named = (e) => e && typeof e === "object" && Object.values(e).some((v) => v === "Orbital Platform");
      rec("…and the tier carries the display name, not its id", named(tier), tier);
    } else {
      console.log("  --   /api/equipment/list returned no rows here; the loc assertions above are the check");
    }
    api.stop(); api = null;

    console.log("\n[back-out] localise the archetype only, as before");
    {
      const built = controlApp("archonly", [[
        "      upsertEquipmentLoc(activeRoot, id, chassisName);\n      upsertEquipmentLoc(activeRoot, tier.tierId, chassisName);",
        "      upsertEquipmentLoc(activeRoot, id, chassisName);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await newChassis(capi, cdir);
          const cloc = locText(cdir);
          rec("…the control still creates the chassis", c.b.ok === true, c.b);
          rec("…still names the archetype", /nova_hull:\s*\d*\s*"Orbital Platform"/.test(cloc), cloc);
          rec("…and leaves the tier the player picks as a raw token",
            !/nova_hull_1:/.test(cloc), "the tier was localised — the control did not reproduce the bug");
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== chassis tier localised: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
