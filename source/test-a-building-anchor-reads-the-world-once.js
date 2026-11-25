// ⏱ #the-anchor-walked-the-whole-world-once-per-state — A BUILDING ANCHOR IS ASKED PER STATE; THE WORLD IS READ PER MAP.
//
// stateBuildingAnchor has to find one state's provinces among every pixel of provinces.bmp, and its callers ask it
// state after state: generateLand once for each state it creates, fixStatesWithoutBuildingSlots once for each state
// it repairs. It used to read and walk the whole bitmap — and rebuild the whole map model, and read the whole
// heightmap — on every one of those calls. Measured on the owner's own flow (a fresh mod over vanilla, Delete map →
// Generate land 35% → Auto-fix ×2, 13,414 provinces on a 5,632×2,048 bitmap): Generate land created 832 states and
// read map/provinces.bmp 832 times, 27.6 GB, walking 11.5 million pixels each time. That loop was 156 of Generate
// land's 195 seconds, and the click came out byte-for-byte identical without it.
//
// This pins the two halves that make the reuse safe rather than merely fast:
//   1. N states, asked one after another, read the bitmap ONCE — the count derived from the fixture's own state
//      list, never typed in.
//   2. The moment the bitmap CHANGES, the answer changes with it. A stale extent would put a state's buildings on
//      another state's land, which is exactly the damage #a-new-states-slots-land-in-another-state measured on
//      1,065 of vanilla's 1,081 states. So the reuse is keyed on the file's own identity plus the province table,
//      and repainting the map must move the anchor.
//   3. And the reuse must not change the answer: every anchor is recomputed with the caches cleared between calls
//      and must come back identical.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { bmp24 } = require("./testlib-two-layer-map.js");
const md = require("./map-data.js");

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("  ok " + name); }
  else { failed++; console.log("  ✗ " + name); }
}

// ── Fixture: four land provinces in four quadrants of a 64×64 world, one state each, plus a sea province ──
const W = 64, H = 64;
const QUAD = { 2: [0, 0], 3: [1, 0], 4: [0, 1], 5: [1, 1] };      // province id -> [column, row] of its quadrant
const COLOUR = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 200, 200] };
const half = (n) => Math.floor(n / 2);
/** Province at a pixel: the four quadrants, with `seaColumn` columns on the left given to the sea instead. */
const provAt = (seaColumn) => (x, y) => {
  if (x < seaColumn) return 1;
  for (const id of Object.keys(QUAD)) {
    const [cx, cy] = QUAD[id];
    if ((x < half(W)) === (cx === 0) && (y < half(H)) === (cy === 0)) return Number(id);
  }
  return 1;
};
const paint = (seaColumn) => { const at = provAt(seaColumn); return bmp24(W, H, (x, y) => COLOUR[at(x, y)]); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchor-once-mod-"));
const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchor-once-game-"));
fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
fs.writeFileSync(path.join(mod, "map", "definition.csv"),
  ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0"]
    .concat(Object.keys(QUAD).map((id) => `${id};${COLOUR[id].join(";")};land;false;plains;1`)).join("\r\n") + "\r\n", "utf8");
fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), paint(0));

// An 8-bit indexed heightmap the size of provinces.bmp — what the anchor reads its `y` out of.
function heightmap8(fill) {
  const rowSize = (W + 3) & ~3, off = 54 + 256 * 4, size = off + rowSize * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28);
  b.writeUInt32LE(rowSize * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rowSize + x] = fill(x, y);
  return b;
}
fs.writeFileSync(path.join(mod, "map", "heightmap.bmp"), heightmap8(() => 120));

// The states, and the province each owns — the fixture's own list, which is what the counts below are derived from.
const STATES = Object.keys(QUAD).map((id, i) => ({ id: i + 1, province: Number(id) }));
for (const s of STATES) {
  fs.writeFileSync(path.join(mod, "history", "states", `${s.id}-S${s.id}.txt`),
    `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${s.province} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`, "utf8");
}

console.log("BUILDING ANCHOR READS THE WORLD ONCE:");

// ── Count the reads of the two bitmaps the anchor walks ───────────────────────────────────────────────────
const realRead = fs.readFileSync;
const reads = { "provinces.bmp": 0, "heightmap.bmp": 0 };
fs.readFileSync = function (p, ...rest) {
  const base = path.basename(String(p || ""));
  if (reads[base] !== undefined) reads[base]++;
  return realRead.call(fs, p, ...rest);
};
const anchorsFor = () => STATES.map((s) => md.stateBuildingAnchor({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [s.province] }));

md.clearMapLayerCache();
const first = anchorsFor();
check(`every one of the ${STATES.length} states got an anchor`, first.every((a) => a && Number.isFinite(a.x)));
check(`provinces.bmp read once for ${STATES.length} states (was once per state)`, reads["provinces.bmp"] === 1);
check(`heightmap.bmp read once for ${STATES.length} states`, reads["heightmap.bmp"] === 1);

// Asking again must not re-read either: nothing has changed on disk.
const again = anchorsFor();
check("a second pass over the same states reads neither bitmap again", reads["provinces.bmp"] === 1 && reads["heightmap.bmp"] === 1);
check("and answers identically", JSON.stringify(again) === JSON.stringify(first));

// ── The answer must be the state's own land, not a neighbour's ────────────────────────────────────────────
const at0 = provAt(0);
const insideOwnProvince = first.every((a, i) => {
  const p = STATES[i].province;
  // `z` is bottom-up (pixelYToBuildingZ), so the top-down row is H-1-z. Read the fixture's own paint at that pixel.
  const row = H - 1 - Math.round(a.z);
  return at0(Math.round(a.x), row) === p;
});
check("every anchor stands on its own state's province", insideOwnProvince);

// ── …and the reuse must not be what produced it ───────────────────────────────────────────────────────────
const uncached = STATES.map((s) => {
  md.clearMapLayerCache();
  return md.stateBuildingAnchor({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [s.province] });
});
check("clearing the caches between calls changes no answer", JSON.stringify(uncached) === JSON.stringify(first));

// ── A REPAINTED WORLD MOVES THE ANCHOR. The reuse is keyed on the bitmap, not on the process ───────────────
const readsBefore = reads["provinces.bmp"];
fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), paint(half(W)));   // the sea takes the left half
const repainted = anchorsFor();
check("a repainted provinces.bmp is read again", reads["provinces.bmp"] > readsBefore);
const leftIds = new Set(Object.keys(QUAD).filter((id) => QUAD[id][0] === 0).map(Number));
const movedOrGone = STATES.every((s, i) => (leftIds.has(s.province)
  ? repainted[i] === null                                    // its land is all sea now — no anchor to give
  : JSON.stringify(repainted[i]) === JSON.stringify(first[i])));
check("the states whose land was painted away lose their anchor; the others keep theirs", movedOrGone);

// ── …AND SO DOES A RECOLOURED PROVINCE, WHICH CHANGES NO BYTE OF THE BITMAP ───────────────────────────────
// The extents are a reading of provinces.bmp THROUGH definition.csv's colour table, so the table is part of the
// key. Give province 3 a colour no pixel carries and its pixels belong to nobody: a state holding 3 and 5 must
// anchor in 5 instead. Nothing in map/provinces.bmp moves, so a key that watches only the file would miss it.
fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), paint(0));
md.clearMapLayerCache();
const twoProvinceState = md.stateBuildingAnchor({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [3, 5] });
const defPath = path.join(mod, "map", "definition.csv");
fs.writeFileSync(defPath, fs.readFileSync(defPath, "utf8").replace(`3;${COLOUR[3].join(";")};land`, "3;7;7;7;land"));
const afterRecolour = md.stateBuildingAnchor({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [3, 5] });
check("the two-province state anchored in 3 while 3 had pixels", twoProvinceState
  && at0(Math.round(twoProvinceState.x), H - 1 - Math.round(twoProvinceState.z)) === 3);
check("a recoloured province is no longer chosen, with the bitmap unchanged", afterRecolour
  && at0(Math.round(afterRecolour.x), H - 1 - Math.round(afterRecolour.z)) === 5);

fs.readFileSync = realRead;
try { fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(game, { recursive: true, force: true }); } catch (_) {}
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
