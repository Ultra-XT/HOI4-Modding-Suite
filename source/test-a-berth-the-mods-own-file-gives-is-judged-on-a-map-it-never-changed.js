// ⛔ #a-berth-the-mods-own-file-gives-is-judged-on-a-map-it-never-changed — A FLEET THE MOD'S OWN FILE BERTHS ON LAND WITH NO SEA IS A
// CRASH WHETHER OR NOT THE MOD CHANGED ITS MAP, AND MAP ERRORS SAYS SO.
//
// THE DEFECT (review of the units-baseline fixes, R1). 41ed3e58 taught findUnitsStrandedByTheMap to judge a berth the mod's own
// order-of-battle file gives (`ownBerth`) by the mod's map alone. But validateMapBitmapRules asked the search only behind
// `modChangedMapFile(provinces.bmp) || definitionAffectsNavalShape(…)`, a gate whose reason — "only what the mod took away" — belongs to
// the half judged against the layer below. So a mod that changes no map file and ships its own orders of battle was never asked:
//   • the Army tool, on a new mod with no map files, saved Germany a fleet with naval_base 563 (the body army.js's naSave sends — the task
//     force inherits it as its location). 563 is German land with no sea beside it. The save answered ok, warning only that it "doesn't
//     look like a coastal province, so it may not be able to hold a naval base"; Map Errors said 0 errors, 0 warnings; Auto-fix answered
//     "Nothing to fix"; the search itself found the fleet.
//   • a copy of the base game's GER_1936_naval_mtg.txt with one task force moved inland (and its GER_1936.txt with a division moved to sea):
//     the search found both, Map Errors neither, and Auto-fix's own two fixers — called directly — moved both.
// fleet_starts_on_land_with_no_sea is in the curated fatal set: eleven crashes of a Nova-built world each named a fleet like this.
//
// THE RULE NOW. A mod that ships history/units of its own is asked too, and with its map unchanged keeps only the berths that are its own:
// with nothing its map took away, the layer-below half has nothing to say, and an inherited berth (the base game's own, or kept in the
// mod's copy of the base game's file) keeps its excuse. The Army tool judges a task force's location with the validator's own test
// (landProvincesTouchingSea) and refuses one on land with no sea, writing nothing; a fleet's naval_base there only warns, as Map Errors'
// fleet_home_port_has_no_sea does.
//
// THE FIXTURE (part 1, no port, no game install): the 8x8 world of test-a-berth-the-mods-own-file-gives-is-judged-by-the-map.js's layer
// below — provinces of 32 px, ids 1..64 by row; land rows 0-2 (1..24), row 2 (17..24) the coast, rows 0-1 inland; AAA owns rows 0 and 2
// with a harbour on 20, BBB row 1 (9..16) and no harbour (a country that owns no state starts no order of battle). Its AAA_naval berths "Home Fleet" (home 20, "Bay Squadron" on 20) and "Old Fleet" (home 6, "Old Hulk" on 6 — land with no
// sea, the base game's own shape); its AAA_1936 places "Home Guard" on 2 and "Sailors" on 40 (sea, the base game's own shape).
// The mod has NO map file at all. Its own AAA_naval keeps both fleets and adds "Inland Fleet" (home 12, "Inland Squadron" on 12), its own
// AAA_1936 keeps both divisions and adds "Wet Guard" on 44, and — the Army tool's shape — its own BBB history points set_naval_oob at
// BBB_nova_navy, a file no layer below has, berthing "Hill Fleet" (home 7, "Hill Squadron" on 7).
// Part 2 drives /api/army/naval-air (listen(0)) against the installed base game, and asserts the index is usable rather than skipping.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownberth-unchanged-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownberth-unchanged-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   -> " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR, MODS];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownberth-unchanged-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// …laid like bricks, each odd row half a cell along (the map is a cylinder), so no four provinces meet at a point: a grid's corners are
// map_x_crossing problems, and with any problem on the screen Auto-fix runs whatever this test is about (it must answer "Nothing to fix"
// with the gate backed out)
const cellAt = (x, y) => { const r = Math.floor(y / 32); return Math.floor(((x + (r % 2 ? 16 : 0)) % 256) / 32) + r * 8 + 1; };
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const definition = (n, isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= n; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("") + `\t\t}\n\t}\n}\n`;
const ship = (n, tag) => `ship = { name = "${n}" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = ${tag} } } }`;
const fleet = (tag, name, base, tfName, loc) => [`\tfleet = {`, `\t\tname = "${name}"`, `\t\tnaval_base = ${base}`,
  `\t\ttask_force = {`, `\t\t\tname = "${tfName}"`, `\t\t\tlocation = ${loc}`, `\t\t\t${ship(tfName + " 1", tag)}`, `\t\t}`, `\t}`];
const division = (name, loc) => `\tdivision = {\n\t\tname = "${name}"\n\t\tlocation = ${loc}\n\t\tdivision_template = "Inf"\n\t}`;
const TEMPLATE = 'division_template = {\n\tname = "Inf"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n';

const BASE_NAVAL = ["units = {", ...fleet("AAA", "Home Fleet", 20, "Bay Squadron", 20), ...fleet("AAA", "Old Fleet", 6, "Old Hulk", 6), "}", ""].join("\n");
const BASE_ARMY = [TEMPLATE + "units = {", division("Home Guard", 2), division("Sailors", 40), "}", ""].join("\n");
const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(cellAt(x, y))));
mk(GAME, "map/definition.csv", definition(64, (p) => p <= 24));
mk(GAME, "history/states/1.txt", state(1, [...range(1, 8), ...range(17, 24)], "AAA", [20]));
mk(GAME, "history/states/2.txt", state(2, range(9, 16), "BBB", []));
mk(GAME, "history/countries/AAA - Aland.txt", 'capital = 1\noob = "AAA_1936"\nset_naval_oob = "AAA_naval"\n');
mk(GAME, "history/countries/BBB - Bland.txt", "capital = 2\n");
mk(GAME, "history/units/AAA_naval.txt", BASE_NAVAL);
mk(GAME, "history/units/AAA_1936.txt", BASE_ARMY);

const MOD_NAVAL = ["units = {", ...fleet("AAA", "Home Fleet", 20, "Bay Squadron", 20), ...fleet("AAA", "Old Fleet", 6, "Old Hulk", 6),
  ...fleet("AAA", "Inland Fleet", 12, "Inland Squadron", 12), "}", ""].join("\n");
const MOD_ARMY = [TEMPLATE + "units = {", division("Home Guard", 2), division("Sailors", 40), division("Wet Guard", 44), "}", ""].join("\n");
const writeMod = (m, { units = true } = {}) => {
  mk(m, "descriptor.mod", 'name="own berths on an unchanged map"\n');
  if (!units) return m;
  mk(m, "history/units/AAA_naval.txt", MOD_NAVAL);
  mk(m, "history/units/AAA_1936.txt", MOD_ARMY);
  mk(m, "history/countries/BBB - Bland.txt", 'capital = 2\nset_naval_oob = "BBB_nova_navy"\n');
  mk(m, "history/units/BBB_nova_navy.txt", ["units = {", ...fleet("BBB", "Hill Fleet", 7, "Hill Squadron", 7), "}", ""].join("\n"));
  return m;
};
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const read = (root, f) => { const p = path.join(root, "history", "units", f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const at = (us) => (us || []).map((u) => `${u.name}@${u.province}`).sort();
const locOf = (text, name) => { const i = text.indexOf(`name = "${name}"`); const m = i < 0 ? null : /location = (\d+)/.exec(text.slice(i)); return m ? +m[1] : null; };
const homeOf = (text, name) => { const i = text.indexOf(`name = "${name}"`); const m = i < 0 ? null : /naval_base = (\d+)/.exec(text.slice(i)); return m ? +m[1] : null; };
const FLEET = "fleet_starts_on_land_with_no_sea", DIV = "division_starts_on_water", HOMES = "fleet_home_port_has_no_sea";
const UNIT_RULES = [FLEET, DIV, HOMES, "fleet_starts_off_land", "fleet_loaded_on_land_with_no_sea", "fleet_loaded_on_land_the_map_cut_off", "division_loaded_on_water"];
const unitRows = (probs) => (probs || []).filter((p) => UNIT_RULES.includes(p.rule));

(async () => {
  console.log("=== THE CONTROLS: the fixture is the shape it claims ===");
  const MOD = writeMod(tmp("mod"));
  {
    rec("THE CONTROL: the mod has no map file at all", !fs.existsSync(path.join(MOD, "map")));
    const model = md.buildMapModel(ctx(MOD));
    const coast = md.landProvincesTouchingSea({ ...ctx(MOD), model });
    const type = new Map(model.provinces.map((p) => [+p.id, p.type]));
    rec("THE CONTROL: 6, 7 and 12 are land with no sea beside it, 20 is the coast, 40 and 44 are sea — on the mod's map, which is the base game's",
      [6, 7, 12].every((p) => type.get(p) === "land" && !coast.has(p)) && coast.has(20) && [40, 44].every((p) => type.get(p) === "sea"),
      [6, 7, 12, 20, 40, 44].map((p) => `${p}:${type.get(p)}:${coast.has(p)}`));
    const st = md.findUnitsStrandedByTheMap(ctx(MOD));
    rec("THE CONTROL: the search already found the mod's own three (the defect was in who asked it)",
      at(st.fleets).join() === "Hill Squadron@7,Inland Squadron@12" && at(st.divisions).join() === "Wet Guard@44", { fleets: at(st.fleets), divisions: at(st.divisions) });
  }

  console.log("\n=== 1. Map Errors and the Save gate, on a mod that changes no map file ===");
  {
    const probs = md.validateMapBitmap(ctx(MOD)) || [];
    const f = probs.find((p) => p.rule === FLEET), d = probs.find((p) => p.rule === DIV), h = probs.find((p) => p.rule === HOMES);
    rec("⭐⭐⭐ fleet_starts_on_land_with_no_sea counts the two task forces the mod's own files berth inland, as an error in the FATAL set the Save gate stops on",
      !!f && f.total === 2 && f.severity === "error" && labels.isFatalRule(FLEET), f ? { total: f.total, severity: f.severity, items: at(f.items) } : probs.map((p) => p.rule));
    rec("⭐⭐⭐ THE CONTROL: …and not the inherited one the mod's copy keeps as the base game had it (Old Hulk, 6)",
      !!f && at(f.items).join() === "Hill Squadron@7,Inland Squadron@12", f && at(f.items));
    rec("⭐⭐ …with Auto-fix offered for them", !!f && f.autoFix === true && f.movable === 2, f && { autoFix: f.autoFix, movable: f.movable });
    const fm = String((f || {}).message || "");
    rec("⭐⭐ …saying the berths are the mod's own, not that its map edits took the sea away",
      /They are berthed there by your mod's own order-of-battle files/.test(fm) && !/your map edits took it away/.test(fm), fm.slice(0, 600));
    rec("⭐⭐⭐ division_starts_on_water counts the one the mod's own file stands at sea (Wet Guard, 44), not the inherited Sailors on 40",
      !!d && d.total === 1 && d.severity === "warning" && at(d.items).join() === "Wet Guard@44", d ? { total: d.total, items: at(d.items) } : null);
    rec("⭐⭐ fleet_home_port_has_no_sea counts the two homes the mod's own files give inland (12, 7), not the inherited Old Fleet on 6",
      !!h && h.total === 2 && at(h.items).join() === "Hill Fleet@7,Inland Fleet@12", h ? { total: h.total, items: at(h.items) } : null);
    rec("THE CONTROL: no row says the map was changed under a unit (fleet_starts_off_land, the cut-off loaded fleet)",
      !probs.some((p) => p.rule === "fleet_starts_off_land" || p.rule === "fleet_loaded_on_land_the_map_cut_off"), unitRows(probs).map((p) => p.rule));
  }

  console.log("\n=== 2. the controls: a mod with no orders of battle of its own, and one whose copy is the base game's ===");
  {
    const bare = writeMod(tmp("bare"), { units: false });
    rec("⭐⭐⭐ THE CONTROL: a mod with no history/units of its own is told nothing about the base game's own inland Old Hulk or the Sailors at sea",
      unitRows(md.validateMapBitmap(ctx(bare))).length === 0, unitRows(md.validateMapBitmap(ctx(bare))).map((p) => `${p.rule} ${p.total}`));
    // …nor anything else: so what Auto-fix sees on the mod in part 3 is the units alone, and with them unreported it says "Nothing to fix"
    const rb = md.autoFixMap(ctx(bare));
    rec("THE CONTROL: …and Auto-fix on it answers \"Nothing to fix\" — the world itself has no problem of the mod's", (md.validateMapBitmap(ctx(bare)) || []).length === 0 && rb && rb.nothingToFix === true,
      { rows: (md.validateMapBitmap(ctx(bare)) || []).map((p) => p.rule), nothingToFix: rb && rb.nothingToFix });
    const copy = writeMod(tmp("copy"), { units: false });
    mk(copy, "history/units/AAA_naval.txt", BASE_NAVAL);
    mk(copy, "history/units/AAA_1936.txt", BASE_ARMY);
    rec("⭐⭐⭐ THE CONTROL: …nor is a mod whose own files are byte-for-byte copies of the base game's",
      unitRows(md.validateMapBitmap(ctx(copy))).length === 0, unitRows(md.validateMapBitmap(ctx(copy))).map((p) => `${p.rule} ${p.total}`));
  }

  console.log("\n=== 3. Auto-fix, which answered \"Nothing to fix\" while Map Errors was empty ===");
  {
    const r = md.autoFixMap(ctx(MOD));
    rec("⭐⭐⭐ Auto-fix all runs (no \"Nothing to fix\")", r && r.ok === true && !r.nothingToFix, r && { ok: r.ok, nothingToFix: r.nothingToFix, note: r.note });
    const fx = (r && r.fixes) || {};
    rec("⭐⭐⭐ …and re-berths both task forces (one at a harbour, one at sea) and moves the division",
      (fx.fleetBerths || {}).moved === 1 && (fx.fleetBerths || {}).toSea === 1 && (fx.drownedDivisions || {}).moved === 1,
      { fleetBerths: fx.fleetBerths && { moved: fx.fleetBerths.moved, toSea: fx.fleetBerths.toSea, error: fx.fleetBerths.error }, drownedDivisions: fx.drownedDivisions && { moved: fx.drownedDivisions.moved, error: fx.drownedDivisions.error } });
    const a = read(MOD, "AAA_naval.txt"), b = read(MOD, "BBB_nova_navy.txt"), d = read(MOD, "AAA_1936.txt");
    rec("⭐⭐ the Inland Squadron and its home go to AAA's harbour on 20", locOf(a, "Inland Squadron") === 20 && homeOf(a, "Inland Fleet") === 20, [locOf(a, "Inland Squadron"), homeOf(a, "Inland Fleet")]);
    rec("⭐⭐ the Hill Squadron (a country with no harbour) goes to sea", ["sea", "lake"].includes((md.buildMapModel(ctx(MOD)).provinces.find((p) => +p.id === locOf(b, "Hill Squadron")) || {}).type), locOf(b, "Hill Squadron"));
    rec("⭐⭐ the Wet Guard stands on AAA's land", [...range(1, 8), ...range(17, 24)].includes(locOf(d, "Wet Guard")), locOf(d, "Wet Guard"));
    rec("THE CONTROL: the inherited berths are untouched (Old Hulk 6, Old Fleet 6, Sailors 40, Home Guard 2)",
      locOf(a, "Old Hulk") === 6 && homeOf(a, "Old Fleet") === 6 && locOf(d, "Sailors") === 40 && locOf(d, "Home Guard") === 2);
    rec("⭐⭐ THE CONTROL: Auto-fix wrote no map file into a mod that has none", !fs.existsSync(path.join(MOD, "map")),
      fs.existsSync(path.join(MOD, "map")) ? fs.readdirSync(path.join(MOD, "map")) : []);
    const after = unitRows(md.validateMapBitmap(ctx(MOD)));
    rec("⭐⭐ Map Errors has no unit row afterwards", after.length === 0, after.map((p) => `${p.rule} ${p.total}`));
  }

  console.log("\n=== 4. the Army tool (/api/army/naval-air, the body army.js's naSave sends) against the installed base game ===");
  {
    const { createApp } = require("./server.js");
    const server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    try {
      const GAMEROOT = require("./server.js").constants.resolveHoi4GameRoot();
      const gm = GAMEROOT ? md.buildMapModel({ modRoot: GAMEROOT, gameRoot: GAMEROOT, dependencyRoots: [], cacheStableLayers: true }) : { provinces: [], states: [] };
      const coast = GAMEROOT ? md.landProvincesTouchingSea({ modRoot: GAMEROOT, gameRoot: GAMEROOT, dependencyRoots: [], model: gm }) : null;
      const type = new Map((gm.provinces || []).map((p) => [+p.id, p.type]));
      const ger = [];
      for (const s of gm.states || []) if (String(s.owner).toUpperCase() === "GER") for (const p of s.provinces) if (type.get(+p) === "land") ger.push(+p);
      const inland = coast ? ger.find((p) => !coast.has(p)) : undefined, coastal = coast ? ger.find((p) => coast.has(p)) : undefined;
      rec("the base game is installed and has German land both inland and on the coast (needed: this part asserts, it does not skip)", !!inland && !!coastal, { GAMEROOT, inland, coastal });
      const army = path.join(MODS, "army_mod");
      mk(army, "descriptor.mod", 'name="army tool"\n');
      const ship1 = [{ name: "Z1", definition: "destroyer", equipment: "destroyer_1", amount: 1, owner: "GER" }];
      const navyFile = () => path.join(army, "history", "units", "GER_nova_navy.txt");
      const r1 = await post("/api/army/naval-air", { modPath: army, tag: "GER", domain: "naval", fleets: [{ name: "Inland Fleet", naval_base: inland, ships: ship1 }] });
      rec(`⭐⭐⭐ a fleet whose task force would lie on German land with no sea (${inland}) is REFUSED`, r1 && r1.ok === false, r1);
      rec("⭐⭐ …saying it is land with no sea beside it, that it crashes the game, and the rule Map Errors names it by",
        /land with no sea beside it/.test(String(r1 && r1.error)) && /crashed/.test(String(r1 && r1.error)) && /fleet_starts_on_land_with_no_sea/.test(String(r1 && r1.error)) && /Nothing was written/.test(String(r1 && r1.error)), r1 && r1.error);
      rec("⭐⭐ …and nothing was written: no order of battle, no country history", !fs.existsSync(navyFile()) && !fs.existsSync(path.join(army, "history", "countries")),
        fs.existsSync(path.join(army, "history")) ? fs.readdirSync(path.join(army, "history")) : []);
      const r2 = await post("/api/army/naval-air", { modPath: army, tag: "GER", domain: "naval", fleets: [{ name: "Coast Fleet", naval_base: coastal, ships: ship1 }] });
      rec(`⭐⭐ THE CONTROL: the same fleet on the German coast (${coastal}) saves, with no warning about its berth`,
        r2 && r2.ok === true && fs.existsSync(navyFile()) && !(r2.warnings || []).some((w) => /sea|coastal/.test(w)), r2);
      const r3 = await post("/api/army/naval-air", { modPath: army, tag: "GER", domain: "naval",
        fleets: [{ name: "Split Fleet", naval_base: inland, taskForces: [{ name: "Split TF", location: coastal, ships: ship1 }] }] });
      rec("⭐ a fleet whose task force lies on the coast but whose home port is inland saves, with a warning naming the home port and fleet_home_port_has_no_sea",
        r3 && r3.ok === true && (r3.warnings || []).some((w) => new RegExp(`Naval base ${inland} is land with no sea beside it`).test(w) && /fleet_home_port_has_no_sea/.test(w)), r3);
      const probs = md.validateMapBitmap({ modRoot: army, gameRoot: GAMEROOT, dependencyRoots: [] }) || [];
      const h = probs.find((p) => p.rule === HOMES);
      rec("⭐⭐ …and Map Errors lists that home port, on a mod that changes no map file", !!h && h.total === 1 && h.items[0].province === inland && !probs.some((p) => p.rule === FLEET),
        unitRows(probs).map((p) => `${p.rule} ${p.total}`));
    } finally {
      try { server.closeAllConnections(); } catch (_) {}
      await new Promise((res) => server.close(res));
    }
  }

  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n=== a berth the mod's own file gives is judged on a map it never changed: ${pass + fails.length} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
  assert.ok(pass > 0);
  process.exit(0);
})().catch((e) => { console.log("CRASHED " + (e && e.stack)); process.exit(1); });
