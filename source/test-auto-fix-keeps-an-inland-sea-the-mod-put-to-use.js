// One Auto-fix click must not drain a deliberate inland sea, and must not delete the ports anchored to it.
// #auto-fix-drains-a-sea-the-mod-put-to-use
//
// THE DEFECT. fixInlandSeas turns every sea component except the largest into LAND, guarded by exactly two things:
// the component sits in a majority-water strategic region (the Caspian case), or the layers BELOW the mod already
// ship that sea cut off (baseInlandSeaProvinces). A mod that OWNS its map has neither — baseInlandSeaProvinces
// subtracts only what a LOWER layer supplies — so its own deliberate inland sea falls through both.
//
// ⭐ OWNERSHIP IS NOT AUTHORSHIP. A mod that owns its map never "cut off" anything: it drew it. Nova's own
// validate reports zero problems about such a sea and never names it, so nothing a modder was shown asked for
// this — the fixer's own comment says as much.
//
// MEASURED, read-only, on the six installed shipping maps (fixInlandSeas dryRun, which writes nothing), against
// the code as it stood before this change:
//
//     vanilla  0 targets      R56  0 targets      NV  0 targets      RoN  0 targets
//     MD       1 target: 13277  ← 4 naval_base_spawn rows anchored to it, 10 sea-only unitstacks rows
//     OWB      1 target:  5894  ← 4 naval_base_spawn rows anchored to it, 10 sea-only unitstacks rows
//
// Both maps launch with those seas. On a COPY of Millennium Dawn one click made 13277 "land;false;mountain;6",
// and the later passes of the SAME click then deleted its four naval_base_spawn rows, its ten unitstacks rows and
// `naval_base = 1` on the province facing it, flipped four coastal flags and repainted the 34.6 MB provinces.bmp.
//
// THE FIX. Two discriminators that live in the mod's OWN map files and were never consulted: a sea province used
// as the 7th column (the sea zone) of a map/buildings.txt row, and a sea-only unitstacks.txt slot (types 11-18 and
// 30-37) sitting on it. Nothing that carries a port is an accident. Such a component is kept and counted as
// keptSeaBodies, exactly as the Caspian case is.
//
// ⭐⭐ THE SET IS READ ONCE, BEFORE ANY FIXER IN THE CLICK RUNS, and that half is load-bearing, not decorative.
// MEASURED on the post-erase fixture of section 5b: autoFixMap's EARLY fixCoastalNoPort pass (which runs 26 lines
// above fixInlandSeas) writes "1;naval_base_spawn;7.00;9.50;4.00;0.00;9" — a port facing the very sea the fixer is
// about to judge — and a fixInlandSeas that read buildings.txt for itself then answered {fixed:0, keptSeaBodies:1}
// and spared it. The click would have manufactured its own evidence and talked itself out of a repair. Back out
// just that half, at BOTH call sites, and sections 4 and 5b fail; back it out at one, and the other pass still
// drains the sea, which is the two passes disagreeing inside one click.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-usesea-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-usesea-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// ── the fixture map ─────────────────────────────────────────────────────────────────────────────────
// 20 x 8. Province 2 is a block of land with a 2x2 lake (province 9) inside it; 6 and 7 are the open ocean
// off to the east. Sea components are therefore { 9 } and { 6, 7 } — 9 is not the largest, so it is a
// fixInlandSeas target. Region 100 holds 1 2 3 9 (one water of four, so NOT majority-water: the Caspian
// guard does not fire), and the base game below types 9 as LAND, so baseInlandSeaProvinces has nothing to
// subtract either. Both existing guards miss it, which is the shape Millennium Dawn and Old World Blues are in.
const W = 20, H = 8;
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 6: [0, 200, 200], 7: [100, 150, 200], 9: [120, 60, 180] };
const LAKE = (x, y) => x >= 8 && x <= 9 && y >= 3 && y <= 4;
const provAt = (x, y) => (x >= 16 ? (y >= 4 ? 6 : 7) : x >= 12 ? 3 : x >= 6 ? (LAKE(x, y) ? 9 : 2) : 1);
const BMP = bmp24(W, H, (x, y) => COL[provAt(x, y)]);
const defRow = (id, type, coastal, terrain, continent) => `${id};${COL[id].join(";")};${type};${coastal};${terrain};${continent}`;
// ⚠️ `own` gives province 1 a terrain of its own. Without it the mod's definition.csv differs from the base game's
// ONLY in province 9, so the moment the fixer drains 9 the two files are identical again — and every later pass
// gated on modChangedMapFile("map/definition.csv") skips with "the mod has not changed definition.csv". Measured:
// the unitstacks pass reported exactly that and left its contradicting rows alone, which would have made the
// "its slots are still there" check pass for the wrong reason, before and after the fix alike.
const DEF = (nine, own, coastal2) => ["0;0;0;0;unknown;false;unknown;0",
  defRow(1, "land", "false", own ? "hills" : "plains", 1),
  // Province 2 faces the lake, so it is coastal in the MOD and landlocked in the base game below, where 9 is land.
  // Giving the base the mod's "true" instead would make the flip fixCoastalFlags wants an INHERITED one, which it
  // subtracts and skips — measured: coastalFlags reported {changed:0, inherited:1} and the check below passed for
  // the wrong reason. `coastal2` overrides it for the post-erase shape in section 6.
  defRow(2, "land", coastal2 || (own ? "true" : "false"), "plains", 1),
  defRow(3, "land", "true", "plains", 1),
  defRow(6, "sea", "true", "ocean", 0),
  defRow(7, "sea", "true", "ocean", 0),
  nine === "sea" ? defRow(9, "sea", "true", "ocean", 0) : defRow(9, "land", "false", "plains", 1),
].join("\r\n") + "\r\n";
const reg = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs} }\n\tweather={}\n}\n`;
// The naval buildings belong to the MOD alone: the modder built them because they drew the water. Shipping them in
// the base game too would make fixNavalBuildingsWithoutCoast's removal an INHERITED one, which it subtracts and
// skips — measured: navalNoCoast reported {removed:0} and the dockyard check passed for the wrong reason.
const stateA = (own) => 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n' +
  '\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n' +
  (own ? '\t\t\tdockyard = 1\n\t\t\t2 = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n' : "") + '\t\t}\n\t}\n}\n';
const stateB = (mp) => `state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = ${mp}\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;

// map/buildings.txt — state;type;x;y;z;rotation;anchor. z maps to the bitmap row as y = H-1-z, so z = 4 is row 3.
// The naval_base_spawn stands on province 2's land at (7,3) and its 7th column is the lake it faces: 9.
const PORT_ROW = "1;naval_base_spawn;7.00;9.50;4.00;0.00;9";
const BUILDINGS = (withPort) => ["1;arms_factory;3.00;10.00;4.00;0.00;0", "2;arms_factory;13.00;10.00;4.00;0.00;0"]
  .concat(withPort ? [PORT_ROW] : []).join("\n") + "\n";

// map/unitstacks.txt — province;type;x;y;z;rotation;scale. The sea floor every sea province in vanilla carries.
const SEA_FLOOR = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38];
const SEA_ONLY = new Set([11, 12, 13, 14, 15, 16, 17, 18, 30, 31, 32, 33, 34, 35, 36, 37]);
const stackRows = (pid, types, x, z) => types.map((t) => [pid, t, x.toFixed(2), "9.50", z.toFixed(2), "0.00", "0.24"].join(";"));
const UNITSTACKS = (nineStacked) => [].concat(
  stackRows(1, [1, 2], 3, 4), stackRows(2, [1, 2], 7, 4), stackRows(3, [1, 2], 13, 4),
  stackRows(6, SEA_FLOOR, 18, 2), stackRows(7, SEA_FLOOR, 18, 6),
  nineStacked ? stackRows(9, SEA_FLOOR, 8.5, 4.5) : [],
).join("\n") + "\n";

const GAME = dir("game", {
  "map/provinces.bmp": BMP,
  "map/definition.csv": DEF("land", false),        // ← below the mod, 9 is LAND: nothing for the inherited set to hold
  "map/strategicregions/100-Land.txt": reg(100, "1 2 3 9"),
  "map/strategicregions/300-Ocean.txt": reg(300, "6 7"),
  "map/buildings.txt": BUILDINGS(false),
  "map/unitstacks.txt": UNITSTACKS(false),
  "history/states/1-A.txt": stateA(false),
  "history/states/2-B.txt": stateB(1000),
});

/** A mod that OWNS its whole map and draws province 9 as a deliberate inland sea. `port` / `stacks` decide
 *  which of the two discriminators its own files carry. State 2 has no manpower — the one problem on the
 *  screen, so "Auto-fix all" actually runs rather than returning nothingToFix. */
const ownMap = (tag, { port, stacks, coastal2, navy = true }) => dir(tag, {
  "descriptor.mod": `name="${tag}"\n`,
  "map/provinces.bmp": BMP,
  "map/definition.csv": DEF("sea", true, coastal2),
  "map/strategicregions/100-Land.txt": reg(100, "1 2 3 9"),
  "map/strategicregions/300-Ocean.txt": reg(300, "6 7"),
  "map/buildings.txt": BUILDINGS(port),
  "map/unitstacks.txt": UNITSTACKS(stacks),
  "history/states/1-A.txt": stateA(navy),
  "history/states/2-B.txt": stateB(0),
});
const opts = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
const typeIn = (d, id) => {
  const p = path.join(d, "map", "definition.csv");
  if (!fs.existsSync(p)) return null;
  const l = fs.readFileSync(p, "utf8").split(/\r?\n/).find((x) => x.split(";")[0] === String(id));
  return l ? l.split(";")[4] : null;
};
const coastalIn = (d, id) => {
  const p = path.join(d, "map", "definition.csv");
  if (!fs.existsSync(p)) return null;
  const l = fs.readFileSync(p, "utf8").split(/\r?\n/).find((x) => x.split(";")[0] === String(id));
  return l ? l.split(";")[5] : null;
};
const portRowsFacing = (d, pid) => {
  const p = path.join(d, "map", "buildings.txt");
  if (!fs.existsSync(p)) return 0;
  return fs.readFileSync(p, "utf8").split("\n").filter((ln) => {
    const t = ln.trim(); if (!t || t.startsWith("#")) return false;
    const c = t.split(";"); return c.length >= 7 && parseInt(c[6], 10) === pid;
  }).length;
};
const seaOnlyStacksOn = (d, pid) => {
  const p = path.join(d, "map", "unitstacks.txt");
  if (!fs.existsSync(p)) return 0;
  return fs.readFileSync(p, "utf8").split("\n").filter((ln) => {
    const t = ln.trim(); if (!t || t.startsWith("#")) return false;
    const c = t.split(";"); return c.length >= 7 && parseInt(c[0], 10) === pid && SEA_ONLY.has(parseInt(c[1], 10));
  }).length;
};
const stateOneText = (d) => fs.readFileSync(path.join(d, "history", "states", "1-A.txt"), "utf8");

try {
  console.log("\n=== 0. THE POSITIVE CONTROL: with nothing in the mod's files using it, the sea IS still drained ===");
  {
    const m = ownMap("bare", { port: false, stacks: false, navy: false });
    const r = md.fixInlandSeas(opts(m));
    rec("⭐⭐⭐ a mod's isolated sea that NOTHING uses is still converted to land — the fixer is not disarmed",
      !!r && !r.error && r.fixed === 1 && (r.details || []).map((x) => x.province).join() === "9", r);
    rec("…and it is not counted as a kept sea body", !!r && r.keptSeaBodies === 0, r);
  }

  console.log("\n=== 1. a sea a map/buildings.txt row faces is KEPT, and counted as a kept sea body ===");
  {
    const m = ownMap("port", { port: true, stacks: false });
    const before = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8");
    const r = md.fixInlandSeas(opts(m));
    rec("⭐⭐⭐ fixInlandSeas converts nothing", !!r && !r.error && r.fixed === 0 && !(r.details || []).length, r);
    rec("⭐⭐⭐ …and counts it as a kept sea body, exactly as the Caspian case is", !!r && r.keptSeaBodies === 1, r);
    rec("…province 9 is still a sea in the mod's definition.csv", typeIn(m, 9) === "sea", typeIn(m, 9));
    rec("…and definition.csv was not rewritten at all", fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8") === before, "definition.csv changed");
  }

  console.log("\n=== 2. …and so is a sea carrying sea-only unitstacks slots, with no port row at all ===");
  {
    const m = ownMap("stacks", { port: false, stacks: true });
    rec("the fixture really has no buildings.txt row facing 9 — the port half is not what is being measured", portRowsFacing(m, 9) === 0, portRowsFacing(m, 9));
    rec("…and does carry sea-only slots on it", seaOnlyStacksOn(m, 9) === SEA_FLOOR.filter((t) => SEA_ONLY.has(t)).length, seaOnlyStacksOn(m, 9));
    const r = md.fixInlandSeas(opts(m));
    rec("⭐⭐⭐ fixInlandSeas keeps it on the unit stacks alone", !!r && !r.error && r.fixed === 0 && r.keptSeaBodies === 1, r);
    rec("…province 9 is still a sea", typeIn(m, 9) === "sea", typeIn(m, 9));
  }

  console.log("\n=== 3. THE WHOLE CLICK — the later passes must not undo it either ===");
  {
    const m = ownMap("click", { port: true, stacks: true });
    const stacksBefore = seaOnlyStacksOn(m, 9), portsBefore = portRowsFacing(m, 9);
    const t0 = Date.now();
    const r = md.autoFixMap(opts(m));
    const ms = Date.now() - t0;
    rec(`the click ran every fixer — it was not "nothing to fix" (${ms} ms)`, !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("…and repaired the one problem the fixture really has", ((r.fixes || {}).noManpower || {}).fixed === 1, (r.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click converts no sea", ((r.fixes || {}).inlandSeas || {}).fixed === 0, (r.fixes || {}).inlandSeas);
    rec("⭐⭐⭐ …province 9 is still a sea when the click ends", typeIn(m, 9) === "sea", typeIn(m, 9));
    rec("⭐⭐⭐ …the naval_base_spawn rows facing it are all still there", portRowsFacing(m, 9) === portsBefore && portsBefore === 1,
      { before: portsBefore, after: portRowsFacing(m, 9) });
    rec("⭐⭐⭐ …its sea-only unitstacks slots are all still there", seaOnlyStacksOn(m, 9) === stacksBefore && stacksBefore > 0,
      { before: stacksBefore, after: seaOnlyStacksOn(m, 9), unitStacks: (r.fixes || {}).unitStacks });
    console.log("       (unitStacks " + JSON.stringify((r.fixes || {}).unitStacks) + " · coastalFlags " + JSON.stringify((r.fixes || {}).coastalFlags)
      + " · navalNoCoast " + JSON.stringify((r.fixes || {}).navalNoCoast) + " · strandedPorts " + JSON.stringify((r.fixes || {}).strandedPorts) + ")");
    rec("⭐⭐ …the naval_base on the province facing it survives", /2 = \{[\s\S]*?naval_base = 1/.test(stateOneText(m)), stateOneText(m));
    rec("⭐⭐ …and so does the state's dockyard", /dockyard = 1/.test(stateOneText(m)), stateOneText(m));
    rec("⭐⭐ …the coastal flag of the province facing it is not flipped", coastalIn(m, 2) === "true", coastalIn(m, 2));
  }

  console.log("\n=== 4. THE CONTROL THAT MUST BITE: take the evidence away and the same click drains it again ===");
  {
    const m = ownMap("click-bare", { port: false, stacks: false, navy: false });
    const r = md.autoFixMap(opts(m));
    rec("the click ran", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐⭐ with nothing using it, the click DOES convert the sea — so it is the discriminator that saves it",
      ((r.fixes || {}).inlandSeas || {}).fixed >= 1 && typeIn(m, 9) === "land", { inlandSeas: (r.fixes || {}).inlandSeas, nine: typeIn(m, 9) });
  }

  console.log("\n=== 5. a port this very click added does NOT vote to keep the sea it faces ===");
  {
    // fixCoastalNoPort runs BEFORE fixInlandSeas in the same click and can give a coastal province a port
    // facing an isolated sea. The evidence must therefore be read once, before any fixer runs — otherwise
    // the click would talk itself out of a repair it was about to make. Section 4 is the live proof of this
    // (its fixture starts with no port at all), and this pins the mechanism directly.
    const bare = ownMap("preclick", { port: false, stacks: false, navy: false });
    const pre = md.seaProvincesPutToUse({ modRoot: bare });
    rec("⭐⭐ the evidence set of a mod whose files use nothing is empty of 9", !pre.has(9), [...pre]);
    const used = ownMap("preclick2", { port: true, stacks: true });
    rec("…and of a mod whose files do use it, holds 9", md.seaProvincesPutToUse({ modRoot: used }).has(9), [...md.seaProvincesPutToUse({ modRoot: used })]);
    const r = md.fixInlandSeas({ ...opts(bare), inUse: new Set() });
    rec("⭐⭐ an explicitly empty evidence set converts the sea, whatever the files say now", !!r && r.fixed === 1, r);
  }

  console.log("\n=== 5b. THE LIVE FORM OF THAT: the genuine repair an erase needs still happens ===");
  {
    // The post-erase shape the fixer exists for: the bitmap shows province 2 facing water, its CSV still says
    // coastal = false, and nothing has a port. That is exactly what fixCoastalNoPort repairs — and it runs in the
    // same click, BEFORE fixInlandSeas, so it writes a naval_base_spawn whose 7th column is the isolated sea 9.
    // If fixInlandSeas read buildings.txt for itself it would find that row and spare the very sea it was about
    // to drain. Reading the evidence once, before any fixer runs, is what keeps this repair working.
    const m = ownMap("erased", { port: false, stacks: false, coastal2: "false", navy: false });
    rec("the fixture starts with no port row at all", portRowsFacing(m, 9) === 0, portRowsFacing(m, 9));
    const r = md.autoFixMap(opts(m));
    const added = ((r.fixes || {}).coastalNoPort || {}).added || 0;
    if (!added) { skip("fixCoastalNoPort added no port on this fixture — the live half of 5b did NOT run"); }
    else rec("⭐⭐⭐ fixCoastalNoPort DID add a port facing 9 earlier in this same click…", added > 0, (r.fixes || {}).coastalNoPort);
    rec("⭐⭐⭐ …and the click still drained the sea, because the evidence was read before that port existed",
      ((r.fixes || {}).inlandSeas || {}).fixed >= 1 && typeIn(m, 9) === "land",
      { inlandSeas: (r.fixes || {}).inlandSeas, nine: typeIn(m, 9), coastalNoPort: (r.fixes || {}).coastalNoPort });
  }

  // ⛔ #a-sea-a-navy-needs-is-put-to-use — state 1's only coast is that sea, and it holds a dockyard and a naval base: evidence no pass of a click can
  // manufacture, unlike the port above. With it filled, fixNavalBuildingsWithoutCoast stripped both (the review of the sea fill, AS-1).
  console.log("\n=== 5c. a sea that is the last coast of a state's navy is put to use, port or no port ===");
  {
    const m = ownMap("navy-only", { port: false, stacks: false });
    const r = md.fixInlandSeas({ ...opts(m), inUse: new Set() });
    rec("⭐⭐⭐ fixInlandSeas keeps it on the dockyard and the naval base alone, whatever the evidence it was handed", !!r && !r.error && r.fixed === 0 && r.keptSeaBodies === 1 && typeIn(m, 9) === "sea", r);
    const m2 = ownMap("navy-click", { port: false, stacks: false });
    const c = md.autoFixMap(opts(m2));
    rec("⭐⭐⭐ the whole click converts no sea, and the state keeps both", ((c.fixes || {}).inlandSeas || {}).fixed === 0 && typeIn(m2, 9) === "sea" && /dockyard = 1/.test(stateOneText(m2)) && /naval_base = 1/.test(stateOneText(m2)), { inlandSeas: (c.fixes || {}).inlandSeas, nine: typeIn(m2, 9), state: stateOneText(m2) });
  }

  console.log("\n=== 6. the real corpus, READ-ONLY: the witness seas carry exactly this evidence ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
    for (const [name, id, pid] of [["Old World Blues", "2265420196", 5894], ["Millennium Dawn", "2777392649", 13277]]) {
      const root = WS + id;
      if (!fs.existsSync(path.join(root, "map", "buildings.txt")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
        skip(`${name} or the base game is not installed — that half did NOT run`); continue;
      }
      const use = md.seaProvincesPutToUse({ modRoot: root });
      rec(`⭐⭐⭐ ${name}'s isolated sea ${pid} is one its own map files put to use`, use.has(pid), { has: use.has(pid), size: use.size });
      rec(`…by a buildings.txt row facing it (${portRowsFacing(root, pid)}) and sea-only unit slots on it (${seaOnlyStacksOn(root, pid)})`,
        portRowsFacing(root, pid) > 0 && seaOnlyStacksOn(root, pid) > 0, { ports: portRowsFacing(root, pid), stacks: seaOnlyStacksOn(root, pid) });
    }
  }

  console.log("\n=== 7. the add-on-over-a-shipping-map control still passes: nothing of the layer below is touched ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
    for (const [name, id, desc] of [["Millennium Dawn", "2777392649", "Millennium Dawn: A Modern Day Mod"], ["Old World Blues", "2265420196", "Old World Blues"]]) {
      const root = WS + id;
      if (!fs.existsSync(path.join(root, "map", "definition.csv")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
        skip(`${name} or the base game is not installed — that half did NOT run`); continue;
      }
      const t0 = Date.now();
      const a = dir("addon-" + id, { "descriptor.mod": `name="${name} addon"\ndependencies={ "${desc}" }\n` });
      const r = md.fixInlandSeas({ modRoot: a, gameRoot: VAN, dependencyRoots: [root] });
      rec(`⭐⭐⭐ an add-on over ${name} still converts none of its seas (${Date.now() - t0} ms)`, !!r && !r.error && r.fixed === 0, r);
      const written = fs.existsSync(path.join(a, "map")) ? fs.readdirSync(path.join(a, "map")) : [];
      rec("…and no copy of its definition.csv, heightmap.bmp or buildings.txt is written into it", written.length === 0, written);
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix keeps an inland sea the mod put to use: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
