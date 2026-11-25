// A map/buildings.txt row whose position is over water or off the bitmap is reported, and the building positions Nova
// writes for a state stand on that state's own land. #a-building-over-water
//
// hoi4.exe's buildings.txt loader: ": map building location is not over the land - ignoring instance." The row is
// dropped at load, so a state whose air base, factories or bunkers stand on the sea has nowhere to build them.
//
// buildingsTxtPlacementScan skipped every sea-pixel row on purpose, saying "a coastal port's position often sits a pixel
// into the water and the game snaps it to adjacent land". MEASURED FALSE with the bottom-up z every reader now uses: on
// the six shipping maps 0 rows of any type but floating_harbor stand on a non-land pixel — including all 17,187
// naval_base_spawn rows, every one on its own state's land — while floating_harbor, which floats by design and is keyed
// by its anchor, has 2,309 / 2,702 / 2,415 / 2,686 / 2,692 / 2,330 on water. So the scan's silence hid only real faults.
//
// ⛔ AND NOVA WROTE THEM. stateBuildingAnchor put all 34 standard positions at the centroid of the state's largest
// province, and a centroid is only inside a province that is convex: a coastal province wrapped round a bay has its
// centroid in the bay. Replicated over every state of the six shipping maps, the centroid is on water for 33 / 35 / 37 /
// 13 / 45 / 38 states (vanilla / MD / R56 / OWB / NV / RoN), in another state for 1 / 3 / 0 / 10 / 2 / 0, and the 3x3
// spread the writer adds around it leaves the state's own land for 60 / 82 / 72 / 40 / 120 / 102. Every state made in
// Nova — "New state", Generate land, and Auto-fix's own state_no_air_base_or_rocket_site repair — goes through it.
//
// A WARNING: the engine ignores the instance and loads on.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-overwater-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel, mapRuleFixHint } = require("./public/map-rule-labels.js");
const { createApp } = require("./server.js");
const RULE = "building_not_over_land";
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// #a-slot-is-per-land-province-not-per-state - three of the thirteen types are written once per LAND
// province of the state, so the total a state gets depends on its own geography. Everything below is
// DERIVED from the two tables; the literal it replaced was 34, which was the old flat-4 table.
const SLOT_TYPES = new Set([...M.STATE_BUILDING_SLOTS.map(([t]) => t), ...M.PER_LAND_PROVINCE_BUILDING_SLOTS]);
const CONST_SLOTS = M.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0);
const slotsFor = (landProvinces) => CONST_SLOTS + M.PER_LAND_PROVINCE_BUILDING_SLOTS.length * landProvinces;

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 256x256. x < 20: land 2 (state 1). 20 <= x < 200: land 1 (state 1), C-shaped round a bay of sea 3 at [60,200)x[80,176).
// x >= 200: ocean 4. Province 1 is state 1's largest, and its centroid — about (101, 128) — is in the bay.
const provAt = (x, y) => (x < 20 ? 2 : x >= 200 ? 4 : (x >= 60 && y >= 80 && y < 176) ? 3 : 1);
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
const Z = (y) => (255 - y).toFixed(2);
const pixelOf = (row) => { const c = row.split(";"); return { x: Math.floor(parseFloat(c[2])), y: M.buildingZToPixelY(256, parseFloat(c[4])) }; };
const onWhat = (row) => { const { x, y } = pixelOf(row); return (x < 0 || y < 0 || x >= 256 || y >= 256) ? "offmap" : provAt(x, y); };

function makeMod(name, rows, { descriptor = null } = {}) {
  const mod = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", descriptor || `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n`);
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COL[provAt(x, y)]));
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;true;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;sea;false;ocean;0", "4;40;40;40;sea;false;ocean;0"].join("\n") + "\n");
  mk("history/states/1-Bay.txt", 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk("history/countries/AAA - Bayland.txt", "capital = 1\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1-Land.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 }\n${weather}}\n`);
  mk("map/strategicregions/2-Sea.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 3 4 }\n\tnaval_terrain = water_deep_ocean\n${weather}}\n`);
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/buildings.txt", rows.join("\n"));
  return mod;
}
// Always present: a port on province 1's shore facing the bay, and a floating harbour over the bay anchored to province 1
// (floating_harbor floats by design — never "not over land").
const PORT = `1;naval_base_spawn;100.00;9.50;${Z(79)};0.00;3`;
const HARBOR = `1;floating_harbor;110.00;9.50;${Z(120)};0.00;1`;
const rowsOf = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const validate = (mod, gameRoot = GAME) => M.validateMapBitmap({ modRoot: mod, gameRoot, dependencyRoots: [] });

const server = createApp().listen(0, async () => {
  const PORTN = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORTN}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("0. ⚠️ Nothing that ships trips it");
    if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
    else {
      const p = M.validateMapBitmap({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).filter((x) => x.rule === RULE);
      const n = fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "utf8").split("\n").filter((l) => l.includes(";") && l.split(";")[1] !== "floating_harbor").length;
      rec("⭐⭐ the base game: nothing reported", p.length === 0, p.map((x) => String(x.message).slice(0, 160)));
      rec(`…over ${n} rows that are not floating harbours — not a vacuous pass`, n > 60000, n);
    }

    console.log("\n1. ⛔ The positions Nova writes for a state stand on that state's own land");
    {
      // A state with no positions at all — what "+ New state" leaves — repaired the way the modder repairs it: Auto-fix.
      const mod = makeMod("slots", [PORT, HARBOR]);
      rec("the fixture reports the missing site", validate(mod).some((x) => x.rule === "state_no_air_base_or_rocket_site"));
      const r = await post("/api/map/auto-fix", { modPath: mod });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("…and gave state 1 its positions", r.b && r.b.fixes && r.b.fixes.stateSites && (r.b.fixes.stateSites.states || []).includes(1), r.b && r.b.fixes && r.b.fixes.stateSites);
      const added = rowsOf(mod).filter((l) => SLOT_TYPES.has(l.split(";")[1]));
      rec(`${slotsFor(2)} standard positions were written`, added.length === slotsFor(2), added.length);   // state 1 holds provinces 1 and 2, both land
      const off = added.filter((l) => ![1, 2].includes(onWhat(l)));
      rec("⭐⭐⭐ every one stands on state 1's own land — none in the bay", off.length === 0, { off: off.length, first: off[0], on: off[0] && onWhat(off[0]) });
      const after = validate(mod);
      rec("⭐⭐ …so nothing is reported over water", !after.some((x) => x.rule === RULE), after.filter((x) => x.rule === RULE).map((x) => x.message.slice(0, 160)));
      rec("…the state has its sites", !after.some((x) => x.rule === "state_no_air_base_or_rocket_site"), after.map((x) => x.rule));
      rec("…and no position was handed to another state", !after.some((x) => x.rule === "building_wrong_state"), after.filter((x) => x.rule === "building_wrong_state"));
    }

    // 1b and 1c call the slot fixer directly — the one Auto-fix calls for state_no_air_base_or_rocket_site — so that no other
    // fixer in the click (inland seas, coasts) reshapes these small fixtures before the anchor is chosen.
    const bareMap = (name, provOf, defs, states, regions) => {
      const mod = path.join(ROOT, name);
      const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
      mk("descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\n`);
      mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COL[provOf(x, y)]));
      mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...defs].join("\n") + "\n");
      for (const [id, provs] of states) mk(`history/states/${id}-S.txt`, `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
      regions.forEach((provs, i) => mk(`map/strategicregions/${i + 1}-R.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="R${i + 1}"\n\tprovinces={ ${provs} }\n}\n`));
      mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
      mk("map/buildings.txt", "");
      fs.writeFileSync(path.join(mod, "map", "buildings.txt"), "9;radar_station;1.00;9.50;1.00;0.00;0\n");   // a file to append to
      return mod;
    };

    console.log("\n1b. ⛔ A province too thin for a 3x3 gets its positions ON it, not a pixel either side");
    {
      // Province 1 is a strip two pixels wide between two seas: no pixel of it has a 3x3 of land, so a sideways spread lands in the sea.
      const provOf = (x) => (x < 100 ? 3 : x < 102 ? 1 : 4);
      const mod = bareMap("thin", provOf, ["1;10;10;10;land;true;plains;1", "3;30;30;30;sea;false;ocean;0", "4;40;40;40;sea;false;ocean;0"], [[1, "1"]], ["1", "3 4"]);
      const r = M.fixStatesWithoutBuildingSlots({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
      rec("the slot fixer furnished state 1", (r.states || []).includes(1), r);
      const added = rowsOf(mod).filter((l) => l.startsWith("1;"));
      const off = added.filter((l) => { const { x } = pixelOf(l); return provOf(x) !== 1; });
      rec("⭐⭐⭐ every one stands on the strip itself", added.length === slotsFor(1) && off.length === 0, { added: added.length, want: slotsFor(1), off: off.length, first: off[0] });
    }

    console.log("\n1c. ⛔ A state whose largest province is a LAKE gets its positions on its land");
    {
      // Lakes inside states are ordinary (vanilla has 118). Here the lake is the state's biggest province by far.
      const provOf = (x, y) => (x < 64 && y < 64 ? 1 : x >= 64 ? 2 : 3);
      const mod = bareMap("lake", provOf, ["1;10;10;10;land;false;plains;1", "2;20;20;20;lake;false;lakes;0", "3;30;30;30;sea;false;ocean;0"], [[1, "1 2"]], ["1 2", "3"]);
      const r = M.fixStatesWithoutBuildingSlots({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
      rec("the slot fixer furnished state 1", (r.states || []).includes(1), r);
      const added = rowsOf(mod).filter((l) => l.startsWith("1;"));
      const off = added.filter((l) => { const { x, y } = pixelOf(l); return provOf(x, y) !== 1; });
      rec("⭐⭐⭐ every one stands on the land province, none on the lake", added.length === slotsFor(1) && off.length === 0, { added: added.length, want: slotsFor(1), off: off.length, first: off[0] });   // province 2 is a lake, so one land province
    }

    console.log("\n2. A map that already has buildings over water is told so");
    {
      const rows = [PORT, HARBOR];
      for (const [t, n] of M.STATE_BUILDING_SLOTS) for (let k = 0; k < n; k++) rows.push(`1;${t};${(100 + (k % 3)).toFixed(2)};9.50;${Z(128)};0.00;0`);  // the old writer's output: in the bay
      // #a-slot-is-per-land-province-not-per-state - and one of each varying type per land province of state 1 (provinces 1 and 2 are both land)
      for (const t of M.PER_LAND_PROVINCE_BUILDING_SLOTS) for (let k = 0; k < 2; k++) rows.push(`1;${t};${(100 + (k % 3)).toFixed(2)};9.50;${Z(128)};0.00;0`);
      rows.push(`1;dockyard;230.00;9.50;${Z(40)};0.00;0`);         // not a standard position, over the ocean
      rows.push(`1;bunker;300.00;9.50;${Z(40)};0.00;0`);           // off the bitmap entirely
      const mod = makeMod("carries", rows);
      const probs = validate(mod);
      const p = probs.filter((x) => x.rule === RULE);
      rec("⭐⭐⭐ reported, once", p.length === 1, probs.map((x) => x.rule));
      const it = p[0] || {};
      // ⚠️ MOVED WITH #a-site-row-off-its-own-land. This pinned 36 rows: the 34 in the bay, the dockyard and the bunker. Two
      // of the 34 are state 1's ONLY air_base and rocket_site_spawn rows, and hoi4.exe drops a row over water before
      // strategicair.cpp looks for a state's sites — so state 1 has none, a map the game refuses to load. Those two are
      // named once, as state 1's missing sites (test-a-state-whose-only-site-row-stands-off-its-land-is-refused.js); this
      // warning counts the rest.
      const want2 = slotsFor(2) - 2 + 2;   // every standard position written above, less the two named as missing sites, plus the dockyard and the bunker
      rec(`⭐⭐ …counting the rest in the bay, the dockyard and the off-map bunker — ${want2} rows`, Array.isArray(it.items) && it.items.length === want2 && String(it.message).includes(String(want2)), { items: it.items && it.items.length, want: want2, message: String(it.message).slice(0, 120) });
      const siteProbs = probs.filter((x) => x.rule === "state_no_air_base_or_rocket_site");
      rec("⭐⭐ …while state 1's only air base and rocket site rows, in the bay, are named once, as its missing sites",
        siteProbs.length === 1 && (siteProbs[0].items || []).some((x) => x.stateId === 1 && (x.misplaced || []).length === 2)
          && Array.isArray(it.items) && !it.items.some((x) => x.type === "air_base" || x.type === "rocket_site_spawn"),
        siteProbs.map((x) => x.items));
      rec("⚠️ …and NOT the floating harbour, which floats by design", Array.isArray(it.items) && !it.items.some((x) => x.type === "floating_harbor"), it.items && it.items.filter((x) => x.type === "floating_harbor"));
      rec("⚠️ …nor the port on the shore", Array.isArray(it.items) && !it.items.some((x) => x.type === "naval_base_spawn"));
      rec("⭐ …quoting the engine", /not over the land - ignoring instance/.test(String(it.message)), String(it.message).slice(0, 300));
      rec("⭐ …as a warning", it.severity === "warning", it.severity);
      rec("⭐⭐ …not in the fatal set: the engine ignores the instance and loads", isFatalRule(RULE) === false);
      rec("…with a label a modder can read", mapRuleLabel(RULE) !== "Building not over land", mapRuleLabel(RULE));
      rec("…and a fix hint", mapRuleFixHint(RULE).length > 15, mapRuleFixHint(RULE));
      rec("⚠️ the same rows are not also called wrong-state", !probs.some((x) => x.rule === "building_wrong_state"), probs.filter((x) => x.rule === "building_wrong_state"));

      console.log("\n3. Auto-fix puts the standard positions back on land, and leaves what it cannot place");
      const r = await post("/api/map/auto-fix", { modPath: mod });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const now = rowsOf(mod);
      const slots = now.filter((l) => SLOT_TYPES.has(l.split(";")[1]));
      rec("⭐⭐⭐ no standard position is left over water", !slots.some((l) => ![1, 2].includes(onWhat(l))), slots.filter((l) => ![1, 2].includes(onWhat(l))).slice(0, 3));
      const perType = {};
      for (const l of slots) if (l.startsWith("1;")) perType[l.split(";")[1]] = (perType[l.split(";")[1]] || 0) + 1;
      rec("⭐⭐ …and state 1 still has every standard position, at vanilla's count",
        M.STATE_BUILDING_SLOTS.every(([t, n]) => perType[t] === n)
          && M.PER_LAND_PROVINCE_BUILDING_SLOTS.every((t) => perType[t] === 2), perType);   // one per land province, and state 1 has two
      rec("⚠️ the dockyard, which Nova has no position for, is kept", now.some((l) => l.startsWith("1;dockyard;230.00;")), now.filter((l) => /dockyard/.test(l)));
      rec("⚠️ the floating harbour and the port are kept word for word", now.includes(HARBOR) && now.includes(PORT));
      const after = validate(mod).filter((x) => x.rule === RULE);
      rec("⭐ what is still reported is only what Auto-fix could not place", after.length === 1 && after[0].items.length === 1 && after[0].items[0].type === "dockyard", after.map((x) => x.items));
    }

    console.log("\n4. ⛔ An add-on is not told about the base map's rows");
    {
      const rows = [PORT, HARBOR, `1;arms_factory;100.00;9.50;${Z(128)};0.00;0`];
      const base = makeMod("base", rows, { descriptor: 'name="Base"\n' });
      const addon = path.join(ROOT, "addon");
      fs.mkdirSync(addon, { recursive: true });
      fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
      rec("the base itself reports its row", validate(base, base).some((x) => x.rule === RULE));
      rec("⭐⭐ an add-on inheriting it is not told", !validate(addon, base).some((x) => x.rule === RULE), validate(addon, base).filter((x) => x.rule === RULE).map((x) => x.items));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a building over water: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
