// One Auto-fix click must leave every coastal province with a port, and no port pointing at land.
// #one-auto-fix-click-leaves-every-coast-with-a-port
//
// Found by test-map-stress.js on the date seed 20260911 — and present before that day's batch, which the seed never
// happened to reach. HOI4's own words for the result: "Province N is setup as coastal but has no port building in the
// nudger. This will likely crash the game." Two defects, each hiding the other:
//
// ⛔ 1. A SEA TURNED BACK INTO LAND KEPT THE PORTS THAT POINTED AT IT — when they were the majority.
//    removePortsAnchoredTo decides which building types are anchored to land on purpose (floating_harbor) by a
//    vote over the file's own rows, and it runs AFTER the province has become land. So the edit's own stranded
//    rows vote "anchored to land": on a small map, 4 stranded naval_base_spawn rows out-voted the 3 healthy ones,
//    the type was judged anchor-keyed, and all four were kept. naval_base_water_is_gone — a FATAL rule the owner
//    reproduced as a crash a second after the menu — then used the same vote and said nothing.
//    The rows anchored at the province that JUST changed cannot be floating harbours (those anchor to land, and
//    this province was water a moment ago), so they no longer vote. A blanket "a land-standing row pointing at
//    land casts no vote" was measured and REFUTED first: Old World Blues ships 1,050 floating harbours standing
//    on land and pointing at land.
//
// ⛔ 2. AUTO-FIX ADDED MISSING PORTS BEFORE IT REMOVED STRANDED ONES. fixCoastalNoPort runs early; the fixers that
//    delete a stranded port (fixPortsWhoseWaterIsGone) or turn an inland sea back into land (fixInlandSeas) run
//    after it. Removing a coastal province's only port — which was pointing at land — left it portless when the
//    click ended, and only a SECOND click repaired it. The port fixers now settle after those passes.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastport-home-"));
process.env.NOVA_HOME_DIR = HOME;
const M = require("./map-data.js");
const tmps = [HOME];

// The stress fixture: a 4x4 grid of 64px cells on a 256x256 bmp. Provinces 1..12 land (rows 0-2), 13..16 sea (row 3),
// so provinces 9-12 are the coast. States 1={1 2 3} 2={4 5 6} 3={7 8 9} 4={10 11 12}; one land and one naval region.
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
// A row standing at pixel (x, y), in the file's own coordinates: map_x = x, map_z = H - 1 - y.
const row = (state, type, x, y, anchor) => `${state};${type};${x.toFixed(2)};9.50;${(255 - y).toFixed(2)};0.00;${anchor}`;

function buildMod(buildingRows) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastport-")); tmps.push(mod);
  const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", 'name="CoastPort"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\nreplace_path="common/country_tags"\n');
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COLOF(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk("map/definition.csv", rows.join("\n") + "\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tvictory_points = { ${provs.split(" ")[0]} ${id} }\n\t}\n}\n`;
  mk("history/states/1.txt", st(1, "1 2 3", "AAA"));
  mk("history/states/2.txt", st(2, "4 5 6", "BBB"));
  mk("history/states/3.txt", st(3, "7 8 9", "AAA"));
  mk("history/states/4.txt", st(4, "10 11 12", "BBB"));
  mk("history/countries/AAA.txt", "capital = 1\n");
  mk("history/countries/BBB.txt", "capital = 2\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk("map/strategicregions/2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`);
  mk("map/weatherpositions.txt", "1;100.00;9.90;100.00;small\n1;110.00;9.90;110.00;large\n2;40.00;9.90;230.00;small\n2;50.00;9.90;230.00;large\n");
  mk("map/buildings.txt", ["1;arms_factory;20.00;9.60;20.00;0.00;0"].concat(buildingRows).join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/supplyareas/1.txt", `supply_area={\n\tid=1\n\tname="SA1"\n\tvalue=1\n\tstates={ 1 2 3 4 }\n}\n`);
  return mod;
}
const opts = (mod) => ({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
const typeOf = (mod) => { const t = new Map(); for (const p of M.buildMapModel(opts(mod)).provinces) t.set(p.id, p.type); return t; };
const buildingRows = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(";"));
// Read the FILE, not the validator: the validator shares the vote this test is about.
const portsPointingAtLand = (mod) => { const t = typeOf(mod); return buildingRows(mod).filter((c) => c[1] === "naval_base_spawn" && t.get(parseInt(c[6], 10)) === "land"); };
const problems = (mod, rule) => M.validateMapBitmap(opts(mod)).filter((p) => p.rule === rule);

try {
  console.log("1. ⛔ A sea turned back into land takes EVERY port that pointed at it — even when they are the majority");
  {
    // Four ports on the coast of province 6 (made sea) against three on the real coast, plus one floating harbour.
    const mod = buildMod([
      row(1, "naval_base_spawn", 100, 60, 6),   // province 2, pointing down at 6
      row(2, "naval_base_spawn", 60, 100, 6),   // province 5, pointing right at 6
      row(3, "naval_base_spawn", 196, 100, 6),  // province 7, pointing left at 6
      row(4, "naval_base_spawn", 100, 132, 6),  // province 10, pointing up at 6
      row(3, "naval_base_spawn", 32, 190, 13),  // province 9 → sea 13
      row(4, "naval_base_spawn", 160, 190, 15), // province 11 → sea 15
      row(4, "naval_base_spawn", 224, 190, 16), // province 12 → sea 16
      row(4, "floating_harbor", 224, 220, 12),  // stands in sea 16, anchored to land 12 — by design
    ]);
    const flip = M.flipProvinceToSea({ ...opts(mod), provinceId: 6, waterType: "sea" });
    rec("setup: province 6 became sea", flip && flip.changed === true && typeOf(mod).get(6) === "sea", flip && flip.error);
    const back = M.setProvinceDefinition({ ...opts(mod), provinceId: 6, type: "land", terrain: "plains", coastal: false, continent: 1 });
    rec("…and then land again", back && back.changed === true && typeOf(mod).get(6) === "land", back && back.error);
    const left = portsPointingAtLand(mod);
    rec("⭐⭐⭐ no naval base still points at the land province 6", left.length === 0, left.map((c) => c.join(";")));
    rec("⭐ …the orphan cleanup reports all four it removed", back && back.orphanedPorts && back.orphanedPorts.removed === 4, back && back.orphanedPorts);
    const rows = buildingRows(mod);
    rec("⭐⭐ the three healthy ports are untouched", rows.filter((c) => c[1] === "naval_base_spawn" && ["13", "15", "16"].includes(c[6])).length === 3, rows.map((c) => c.join(";")));
    rec("⭐⭐ the floating harbour anchored to land on purpose is untouched", rows.some((c) => c[1] === "floating_harbor" && c[6] === "12"), rows.map((c) => c.join(";")));
  }

  console.log("\n2. ⛔ One click replaces a coastal province's only port when it removes it for pointing at land");
  {
    const mod = buildMod([
      row(3, "naval_base_spawn", 32, 190, 13),   // province 9 → sea 13
      row(4, "naval_base_spawn", 96, 190, 6),    // province 10 → LAND 6: stranded, and 10's only port
      row(4, "naval_base_spawn", 160, 190, 15),  // province 11 → sea 15
      row(4, "naval_base_spawn", 224, 190, 16),  // province 12 → sea 16
    ]);
    rec("setup: the validator sees the port pointing at land", problems(mod, "naval_base_water_is_gone").length === 1,
      problems(mod, "naval_base_water_is_gone").map((p) => p.provinces));
    rec("setup: …and does not yet call province 10 portless", !problems(mod, "coastal_no_port").some((p) => (p.provinces || []).includes(10)));
    const r = M.autoFixMap(opts(mod));
    rec("Auto-fix ran", r && r.ok === true, r && r.error);
    rec("⭐⭐ the stranded port is gone", portsPointingAtLand(mod).length === 0, portsPointingAtLand(mod).map((c) => c.join(";")));
    const portless = problems(mod, "coastal_no_port");
    rec("⭐⭐⭐ ONE click: province 10 is not left without a port", portless.length === 0, portless.map((p) => p.message.slice(0, 120)));
    // Province 10 is the cell x 64..127. Which sea it faces depends on how the X-crossing repair re-paints the corner
    // it shares with 13 and 14, so ask only that it stands on 10's coast, keyed to 10's state, facing water.
    const t2 = typeOf(mod);
    const hosts10 = buildingRows(mod).some((c) => c[1] === "naval_base_spawn" && c[0] === "4"
      && Math.round(parseFloat(c[2])) >= 63 && Math.round(parseFloat(c[2])) <= 128 && t2.get(parseInt(c[6], 10)) === "sea");
    rec("⭐ …it has a new one, on province 10's coast, facing water", hosts10, buildingRows(mod).map((c) => c.join(";")));
    const again = M.autoFixMap(opts(mod));
    rec("⭐ a second click has nothing left to do for ports",
      !((again.fixes || {}).coastalNoPort || {}).added && !((again.fixes || {}).strandedPorts || {}).removed, again.fixes && { coastalNoPort: again.fixes.coastalNoPort, strandedPorts: again.fixes.strandedPorts });
  }

  console.log("\n3. ⛔ The stress fuzzer's cycle-1 shape: an inland sea made and reverted inside one click");
  {
    const mod = buildMod([]);
    const flip = M.flipProvinceToSea({ ...opts(mod), provinceId: 6, waterType: "sea" });
    rec("setup: inland province 6 became sea", flip && flip.changed === true, flip && flip.error);
    const r = M.autoFixMap(opts(mod));
    rec("Auto-fix ran", r && r.ok === true, r && r.error);
    rec("the inland sea was turned back into land", typeOf(mod).get(6) === "land", (r.fixes || {}).inlandSeas);
    rec("⭐⭐⭐ no naval base points at it afterwards", portsPointingAtLand(mod).length === 0, portsPointingAtLand(mod).map((c) => c.join(";")));
    rec("⭐⭐⭐ and no coastal province is left without a port", problems(mod, "coastal_no_port").length === 0,
      problems(mod, "coastal_no_port").map((p) => p.provinces));
    rec("⭐ nor any stranded-port problem", problems(mod, "naval_base_water_is_gone").length === 0);
  }

  console.log(`\n=== one auto-fix click leaves every coast with a port: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
