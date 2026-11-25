// ⛔ #the-border-budget — A PROVINCE BORDER IS COUNTED THE WAY THE BUDGET COUNTS IT: ONE SEGMENT PER RUN OF BORDER BETWEEN
// ONE PAIR OF PROVINCES, ON A MAP THAT IS A CYLINDER.
//
// The cutter's budget (provinceSplitAllowance) is spent in border segments: a pair's shared border split into the runs whose
// unit pixel edges join at a corner — vanilla 40,694 over 39,715 pairs, Old World Blues 65,460 under the display limit of
// 65,536. provinceBorderSegments is pinned on hand grids whose count can be read off the drawing:
//   1. two squares side by side in a sea: three pairs, one run each — and the sea and one square alone: one;
//   2. a ring: the ringed province and the ring meet in one closed loop, the ring and the sea in another;
//   3. one pair meeting in two runs, a third province between them: two segments of that pair;
//   4. a checkerboard corner: two diagonal pixels of one province in a sea — the four edges at the shared corner are one run;
//   5. a province across the x seam: one loop on the cylinder (two on a flat map);
//   6. a scrambled grid, against the test's own count (unit edges joined per corner and pair through a string-keyed
//      union-find, written independently of the function).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-border-segments-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
/** A W×H grid of `sea`, with rectangles [x0, x1, y0, y1, id] (inclusive, x wrapping) drawn over it in order. */
function grid(W, H, sea, rects) {
  const ids = new Int32Array(W * H).fill(sea);
  for (const [x0, x1, y0, y1, id] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids[y * W + ((x % W) + W) % W] = id;
  return { W, H, ids };
}
const seg = (g) => md.provinceBorderSegments(g);

console.log("\n1. Two squares side by side in a sea");
{
  const g = grid(12, 8, 1, [[2, 4, 2, 4, 2], [5, 7, 2, 4, 3]]);
  const r = seg(g);
  ok(r.pairs === 3 && r.segments === 3, "three pairs (square–square, each square–sea), one run each", r);
  const alone = seg(grid(12, 8, 1, [[2, 4, 2, 4, 2]]));
  ok(alone.pairs === 1 && alone.segments === 1, "…and one square alone in the sea: its whole outline is ONE run (its corners join it)", alone);
}

console.log("\n2. A ring");
{
  const r = seg(grid(14, 12, 1, [[2, 10, 2, 9, 2], [4, 8, 4, 7, 3]]));
  ok(r.pairs === 2 && r.segments === 2, "ringed–ring is one closed loop, ring–sea another", r);
}

console.log("\n3. One pair meeting in two runs");
{
  // P on the left, Q on the right, touching along x = 5|6 above and below a third province S that parts them
  const r = seg(grid(14, 10, 1, [[2, 5, 2, 7, 2], [6, 9, 2, 7, 3], [5, 6, 4, 5, 4]]));
  // pairs: P–Q, P–S, Q–S, and each of P, Q, S with the sea? S is enclosed by P and Q, so it does not touch the sea
  ok(r.pairs === 5, "five pairs: P–Q, P–S, Q–S, P–sea, Q–sea", r);
  ok(r.segments === 6, "P–Q is TWO runs (above S and below it); every other pair one", r);
}

console.log("\n4. A checkerboard corner");
{
  const r = seg(grid(8, 8, 1, [[3, 3, 3, 3, 2], [4, 4, 4, 4, 2]]));
  ok(r.pairs === 1 && r.segments === 1, "two diagonal pixels of one province: the four edges at the shared corner join, so one run", r);
}

console.log("\n5. A province across the x seam");
{
  const g = grid(12, 8, 1, [[10, 13, 2, 4, 2]]);   // columns 10, 11, 0, 1
  ok(g.ids[2 * 12 + 0] === 2 && g.ids[2 * 12 + 11] === 2 && g.ids[2 * 12 + 2] === 1 && g.ids[2 * 12 + 9] === 1, "control: the province sits on both edge columns and nowhere between");
  const r = seg(g);
  ok(r.pairs === 1 && r.segments === 1, "its outline is ONE loop on the cylinder, not two halves", r);
}

console.log("\n6. A scrambled grid, against the test's own count");
{
  const W = 64, H = 32, ids = new Int32Array(W * H);
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  // blobs, not noise: each 4×4 block takes one of six ids, then a few pixels are scattered
  for (let by = 0; by < H / 4; by++) for (let bx = 0; bx < W / 4; bx++) { const v = 1 + Math.floor(rnd() * 6); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ids[(by * 4 + y) * W + bx * 4 + x] = v; }
  for (let n = 0; n < 200; n++) ids[Math.floor(rnd() * W * H)] = 1 + Math.floor(rnd() * 6);
  // the test's own count: every unit edge between two provinces, keyed by its two corner points; edges of one pair that
  // share a corner point are one run
  const edges = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ids[y * W + x], r = ids[y * W + (x + 1) % W];
    if (a !== r) edges.push({ pair: Math.min(a, r) + "-" + Math.max(a, r), p: [((x + 1) % W) + "," + y, ((x + 1) % W) + "," + (y + 1)] });
    if (y + 1 < H) { const d = ids[(y + 1) * W + x]; if (a !== d) edges.push({ pair: Math.min(a, d) + "-" + Math.max(a, d), p: [x + "," + (y + 1), ((x + 1) % W) + "," + (y + 1)] }); }
  }
  const up = edges.map((_, i) => i), find = (i) => (up[i] === i ? i : (up[i] = find(up[i])));
  const firstAt = new Map();
  edges.forEach((e, i) => { for (const p of e.p) { const k = p + "|" + e.pair; if (firstAt.has(k)) up[find(i)] = find(firstAt.get(k)); else firstAt.set(k, i); } });
  const want = { segments: new Set(edges.map((_, i) => find(i))).size, pairs: new Set(edges.map((e) => e.pair)).size };
  const r = seg({ W, H, ids });
  ok(want.segments > 50 && r.segments === want.segments && r.pairs === want.pairs, "provinceBorderSegments agrees with the test's own count, segment for segment", { got: r, want });
}

console.log(`\n=== a province border is counted in segments: ${pass} passed, ${fail} failed ===`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
if (fail) process.exitCode = 1;
