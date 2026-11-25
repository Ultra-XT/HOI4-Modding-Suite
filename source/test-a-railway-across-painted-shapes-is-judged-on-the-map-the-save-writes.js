// ⛔ #a-railway-is-judged-on-the-map-its-write-meets — A RAILWAY LINK ACROSS PROVINCE SHAPES PAINTED AND NOT SAVED IS JUDGED ON THE MAP THE
// SAVE WRITES IT TO, AND ON THE MAP THE SAVE LEAVES.
//
// The Railway tool refuses a click on a province that does not touch the line's last one (railLinkReason, #a-railway-link-joins-neighbours),
// and asked pidGrid. pidGrid is not one map: a ✏ Paint shape stroke leaves it as it was, and an undo or redo rebuilds it from the image
// WITH the staged stroke in it (applyMapSnapshot → buildPidGrid). The Save writes every queued railway before the painted shapes
// (flushMapSaves runs /api/map/paint-provinces after its pendingWrites loop), and writeRailway asks provinces.bmp on disk. Review R7 of the
// city and rail fix: a band of province 1 painted over 2 into 3 and an undo, and the tool took 1 → 3, which writeRailway refuses — so the
// Save stopped at that railway every time; without the undo the tool refused the same click by telling the modder the two do not touch
// and to add an adjacency, across a border they could see they had just painted.
//
// A link now stands only when it holds on both maps — the one the write meets (as saved) and the one the Save leaves (as painted) —
// and a refusal says which one it fails on. Pinned on a strip of four provinces 1 | 2 | 3 | 4 (1 and 4 touch across the east–west seam):
//   0. the premise, read from the page: the Save sends the railway writes before the painted shapes;
//   1. with nothing painted, the tool and writeRailway agree as before;
//   2. a band that makes 1 touch 3 only in the painted shapes: refused, before an undo and after one, by "save the shapes first"; the
//      write refuses it on the disk; and once the shapes are saved, the tool takes it and the write writes it;
//   3. a column that takes the 1 | 2 border away in the painted shapes: 1 → 2 is refused (the game would drop it once the paint is
//      saved, which writeRailway on the painted map confirms), and 1 → 3 by "save first";
//   4. an adjacencies.csv row, and the seam, still join a pair on both maps;
//   5. Finish railway asks again of the whole line, since an undo between two clicks can bring a stroke back.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-paint-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the world: 1 | 2 | 3 | 4, each 10 x 10 px, one state each ───────────────────────────────────────────────────────────────────
const CS = 10, W = 40, H = 10, IDS = [1, 2, 3, 4];
const provAt = (x) => Math.floor(x / CS) + 1;
const colour = (id) => [id * 40, (id * 70) % 256, 50 + id];
const GAME = path.join(ROOT, "game");
write(GAME, "hoi4.exe", "");
write(GAME, "map/provinces.bmp", bmp24(W, H, (x) => colour(provAt(x))));
const DEF = ["0;0;0;0;land;false;unknown;0", ...IDS.map((id) => `${id};${colour(id).join(";")};land;false;plains;1`)].join("\n") + "\n";
write(GAME, "map/definition.csv", DEF);
for (const id of IDS) write(GAME, `history/states/${id}-S.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=town\n\tprovinces={ ${id} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
let n = 0;
const freshMod = () => { const m = path.join(ROOT, "mod" + (++n)); write(m, "descriptor.mod", 'name="rail over paint"\n'); return m; };
const rail = (mod, provinces) => md.writeRailway({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], action: "add", provinces, level: 1 });
// the map the Save leaves: the painted shapes written as the paint save writes them, into the mod
const savedPainted = (paint) => {
  const m = freshMod();
  const at = new Map(paint.map((p) => [p.x + "," + p.y, p.id]));
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at.has(x + "," + y) ? at.get(x + "," + y) : provAt(x))));
  write(m, "map/definition.csv", DEF);
  return m;
};

// the page: its own functions, over images of the strip
const image = (paint) => {
  const at = new Map((paint || []).map((p) => [p.x + "," + p.y, p.id]));
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = colour(at.has(x + "," + y) ? at.get(x + "," + y) : provAt(x)), i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return d;
};
const colorToProvince = new Map(IDS.map((id) => { const c = colour(id); return [(c[0] << 16) | (c[1] << 8) | c[2], id]; }));
const provinceType = new Map(IDS.map((id) => [id, "land"]));
const queued = [];
const fns = ["function buildPidGrid(", "function buildProvNeighbors(", "function supplyRailReason(", "function railLinkReason(", "function handleRailwayClick(", "function updateRailBar(", "function finishRailway("];
// the helper the fix added, when it is there (a back-out that takes it away fails the checks below, rather than the lift)
if (P.MASKED.indexOf("\n  function railLinkTouches(") !== -1) fns.push("function railLinkTouches(");
const { sb, statuses } = P.runPage(fns, P.loadGlobals({
  imgW: W, imgH: H, baseImageData: null, baseImageDataPristine: null, colorToProvince, provinceType,
  model: { provinceToState: { 1: 1, 2: 2, 3: 3, 4: 4 }, adjacencies: [], railways: [] },
  railPath: [], pidGrid: null, borderEdges: null, provNeighborsCache: null, seaAdjacent: null, draw() {},
  pushUndo() {}, queueWrite: (url, body) => queued.push({ url, body }),
}));
const last = () => statuses[statuses.length - 1] || "";
/**
 * The page holding `paint` staged (not saved), its pidGrid built as `grid` says: "disk" — the image before the stroke, as a stroke leaves
 * it — or "painted" — the image with the stroke in it, as an undo or redo rebuilds it.
 */
const stage = (paint, grid) => {
  const disk = image([]), now = image(paint);
  sb.baseImageDataPristine = { data: disk, width: W, height: H };
  sb.baseImageData = { data: grid === "painted" ? now : new Uint8ClampedArray(disk), width: W, height: H };
  sb.buildPidGrid();
  sb.baseImageData = { data: now, width: W, height: H };   // …and the stroke on screen, in baseImageData, as stampBrushAt leaves it
  sb.paintDiff = new Map(paint.map((p) => { const c = colour(p.id); return [p.x + "," + p.y, { x: p.x, y: p.y, r: c[0], g: c[1], b: c[2] }]; }));
  sb.model.adjacencies = [];
  sb.railPath = [];
};
const line = (...ids) => { sb.railPath = []; for (const p of ids) sb.handleRailwayClick(p); return sb.railPath.slice(); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SAVE_FIRST = /not saved/i, SAVE_BUTTON = /💾 Save/, GONE = /once they are saved|in the province shapes you have painted/i;

console.log("\n-- 0. the premise, read from the page: a Save writes its railways before the painted shapes --");
{
  const flush = maskJsComments(P.lift("async function flushMapSaves(", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"));
  const loop = flush.indexOf("while (pendingWrites.length)"), paint = flush.indexOf('"/api/map/paint-provinces"');
  ok(loop >= 0 && paint > loop, "flushMapSaves sends /api/map/paint-provinces after its pendingWrites loop (so a queued railway meets provinces.bmp as saved)", { loop, paint });
}

console.log("\n-- 1. nothing painted: the tool and the write agree --");
{
  stage([], "disk");
  const mod = freshMod();
  ok(same(line(1, 2), [1, 2]) && rail(mod, [1, 2]).changed, "THE CONTROL: 1 → 2, across a border, is taken by the tool and written", sb.railPath);
  const r = rail(freshMod(), [1, 3]);
  ok(same(line(1, 3), [1]) && /does not touch/.test(last()) && !r.changed && /does not touch/.test(r.error || ""), "THE CONTROL: 1 → 3 is refused by both, the tool saying they do not touch", { path: sb.railPath, status: last(), write: r });
  ok(same(line(1, 4), [1, 4]) && rail(freshMod(), [1, 4]).changed, "THE CONTROL: 1 → 4, across the east–west seam, is taken and written", sb.railPath);
}

// a band of province 1 along the top row over 2 and onto 3's first column: 1 touches 3 only in the painted shapes
const BAND = []; for (let x = 10; x <= 20; x++) BAND.push({ x, y: 0, id: 1 });
console.log("\n-- ⭐ 2. a band painted (not saved) makes 1 touch 3 --");
for (const grid of ["disk", "painted"]) {
  stage(BAND, grid);
  const when = grid === "disk" ? "right after the stroke" : "after an undo or redo (pidGrid rebuilt from the painted image)";
  ok(same(line(1, 3), [1]), `⭐⭐⭐ ${when}: the tool refuses 1 → 3, which the Save would write to a map where they do not touch`, { path: sb.railPath, status: last() });
  ok(SAVE_FIRST.test(last()) && SAVE_BUTTON.test(last()) && !/Adjacency/.test(last()), `⭐⭐ …and says they touch only in shapes not saved yet, and to 💾 Save them first — not to add an adjacency`, last());
  ok(same(line(1, 2), [1, 2]), `…1 → 2, touching on both maps, is still taken (${grid})`, { path: sb.railPath, status: last() });
}
{
  const r = rail(freshMod(), [1, 3]);
  ok(!r.changed && /does not touch/.test(r.error || ""), "…and it is the write's own answer: writeRailway refuses 1 → 3 on provinces.bmp as saved, which is the map the Save's railway write meets", r);
  // the Save has written the shapes: the page reloads its baseline (pristine := painted, paintDiff cleared, pidGrid rebuilt)
  const mod = savedPainted(BAND);
  sb.baseImageDataPristine = { data: image(BAND), width: W, height: H };
  sb.baseImageData = { data: image(BAND), width: W, height: H };
  sb.paintDiff = new Map();
  sb.buildPidGrid();
  const w = rail(mod, [1, 3]);
  ok(same(line(1, 3), [1, 3]) && w.changed, "⭐⭐ once the shapes are saved, the tool takes 1 → 3 and writeRailway writes it", { path: sb.railPath, status: last(), write: w });
}

// province 3's colour painted down 2's first column: 1 now touches 3, and no longer 2, in the painted shapes
const COLUMN = []; for (let y = 0; y < H; y++) COLUMN.push({ x: 10, y, id: 3 });
console.log("\n-- ⭐ 3. a column painted (not saved) takes the 1 | 2 border away --");
for (const grid of ["disk", "painted"]) {
  stage(COLUMN, grid);
  const when = grid === "disk" ? "right after the stroke" : "after an undo or redo";
  ok(same(line(1, 2), [1]) && GONE.test(last()), `⭐⭐⭐ ${when}: the tool refuses 1 → 2, which touch on the map as saved and not once the painted shapes are`, { path: sb.railPath, status: last() });
  ok(same(line(1, 3), [1]) && SAVE_FIRST.test(last()), `⭐ …and 1 → 3, which touch only in the painted shapes, by "save the shapes first" (${grid})`, { path: sb.railPath, status: last() });
}
{
  const disk = rail(freshMod(), [1, 2]), after = rail(savedPainted(COLUMN), [1, 2]);
  ok(disk.changed && !after.changed && /does not touch/.test(after.error || ""), "…the refusal is the game's: 1 → 2 is written to the map as saved, and on the map the Save leaves writeRailway refuses it (the game would drop the link)", { disk, after });
}

console.log("\n-- 4. what joins a pair on both maps still does --");
{
  stage(BAND, "painted");
  sb.model.adjacencies = [{ from: 1, to: 3, type: "sea", through: -1 }];
  ok(same(line(1, 3), [1, 3]), "an adjacencies.csv row joining 1 and 3 joins them on both maps: taken", { path: sb.railPath, status: last() });
  sb.model.adjacencies = [];
  ok(same(line(1, 4), [1, 4]), "⭐ …and so does the east–west seam, with a stroke staged elsewhere (the painted-map read wraps too)", { path: sb.railPath, status: last() });
  stage([{ x: 0, y: 4, id: 2 }, { x: 39, y: 5, id: 3 }], "disk");
  ok(same(line(1, 4), [1, 4]), "…and with the seam's own pixels painted on both sides, the rows left untouched still join 1 and 4", { path: sb.railPath, status: last() });
}

console.log("\n-- ⭐ 5. Finish railway asks again of the whole line --");
{
  stage([], "disk");
  queued.length = 0;
  line(1, 2); sb.finishRailway();
  ok(queued.length === 1 && same(queued[0].body, { action: "add", provinces: [1, 2], level: 1 }), "THE CONTROL: with nothing painted, Finish queues the line 1 → 2", queued);
  queued.length = 0; sb.model.railways = [];
  stage([], "disk");
  line(1, 2);
  // …and an undo then brings back a stroke that takes the 1 | 2 border away (applyMapSnapshot: paintDiff restored, pidGrid rebuilt)
  const keep = sb.railPath.slice();
  stage(COLUMN, "painted"); sb.railPath = keep;
  sb.finishRailway();
  ok(queued.length === 0 && (sb.model.railways || []).length === 0, "⭐⭐ after an undo brings back a stroke that parts 1 and 2, Finish queues nothing", { queued, railways: sb.model.railways });
  ok(GONE.test(last()) && /Cancel/.test(last()), "⭐ …and says why, and how to start again (Cancel)", last());
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
