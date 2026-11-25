// ⛔ #a-raised-province-is-cut-to-land-size — A PROVINCE RAISED FROM THE OCEAN IS CUT INTO LAND-SIZED PIECES, AND THE CUT
// LEAVES A MAP THE GAME LOADS.
//
// Generate land raised ocean provinces whole: TEST 31's land had a median of 566 px against vanilla's 160, and 1,842
// provinces over 1,000 px against 735. splitProvincesIntoPieces is the pure cutter (an id raster in, one out). Pinned here on
// a 512×256 world of 16 px sea cells, each its own province, with eight parents drawn over it — every expectation derived
// from the fixture (k = round(area / target) in the test, the pocket, the seam, the pinch read off the shapes):
//   · a rectangle, a concave L, a C (whose Voronoi cells come apart into strays), a 3 px ribbon;
//   · a tadpole — a body, a 1 px tail and a 36 px knob — whose knob's cell is a sliver and merges;
//   · a body plus a 12 px pocket enclosed by land nobody is cutting: only the body is cut, the pocket keeps the parent id;
//   · a parent across the x seam: it is cut whole, so a piece straddles the seam, joined only across it;
//   · a ring whose two ends meet at one corner, between the sea and the province it rings: once the cut puts the ends in
//     two pieces, the only way to take the X-crossing away is to join the corner pixel diagonally — and it is LISTED.
// Checks: pixels outside the split set are byte-identical; every piece is at least max(minPx, .3·target); 0 X-crossings on
// the wrapped map; the anchor's piece keeps the parent id (and the largest does where there is no anchor); new ids are
// contiguous in (parent, centroid row, col) order; the pieces that are not 4-connected are EXACTLY report.xDiagonal; the
// same seed gives the same bytes and another seed does not.
// PLUS the 8×5 block where the first X pass flipped one pixel between pieces 16807 and 16808 of parent 5482 for all twelve
// passes (wf-world/provinces/dbg-x7.js, sigma .7 seed 1, rows 1172–1176 × columns 768–775): fed to the exported X pass
// alone, it has 0 X-crossings afterwards. #the-x-pass-only-goes-down
// PLUS parents SIDE BY SIDE, which every shape above is not (each sits in its own sea): where one parent's pocket meets its
// main body only at a corner, between two other parents, no two 4-adjacent pixels of the X there share a parent, so only a
// pixel handed to a neighbouring parent takes it away without a diagonal join. Forbidding that turned 2 diagonal joins into
// 5 on the owner-flow world (seed 1; 1 into 7 on seed 2). Pinned on the real block from that world (10×8 round (2002, 652))
// fed to the X pass alone, and on a three-parent fixture through the whole cutter, whose movedBetweenParents a writer reads
// to know it must write EVERY changed pixel. And a nextId that would reuse an id on the raster is refused
// (#a-new-id-is-new). And the cut spends no more border segments per new id than the allowance counted on: this world's
// cut spends 3.05, like the real maps' 2.98–3.05, and at 3 per new id a cut to the full allowance landed past the budget.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-core-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

// ── the judges, the test's own (not the cutter's helpers) ────────────────────────────────────────────────────────────────
function xCrossings(ids, W, H) {
  const out = [];
  for (let y = 0; y + 1 < H; y++) for (let x = 0; x < W; x++) {
    const xr = (x + 1) % W, a = ids[y * W + x], b = ids[y * W + xr], c = ids[(y + 1) * W + x], d = ids[(y + 1) * W + xr];
    if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) out.push([x, y]);
  }
  return out;
}
/** 4-connected parts of every id in `want`, x wrapping unless wrap === false → Map(id → [part size, …]). */
function partsOf(ids, W, H, want, wrap = true) {
  const seen = new Uint8Array(W * H), out = new Map();
  for (let s = 0; s < W * H; s++) {
    const id = ids[s];
    if (seen[s] || !want.has(id)) continue;
    let n = 0;
    const st = [s]; seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W; n++;
      const nb = [x > 0 ? i - 1 : (wrap ? i + W - 1 : -1), x < W - 1 ? i + 1 : (wrap ? i - W + 1 : -1), i - W, i + W];
      for (const j of nb) if (j >= 0 && j < W * H && !seen[j] && ids[j] === id) { seen[j] = 1; st.push(j); }
    }
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(n);
  }
  return out;
}

// ── the world ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const W = 512, H = 256, CELL = 16;
// sea cells laid like bricks, every other row half a cell along, so the cells meet in T-junctions and not in X-crossings;
// the courses sit off the shapes' edges (3 px down, 5 px along), so no parent's corner lands on a brick's corner either
const seaAt = (x, y) => { const row = Math.floor((y + 3) / CELL), off = 5 + (row % 2 ? CELL / 2 : 0); return 1 + row * (W / CELL) + (Math.floor((x + off) / CELL) % (W / CELL)); };
function world() {
  const ids = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ids[y * W + x] = seaAt(x, y);
  const fill = (x0, x1, y0, y1, id) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids[y * W + ((x % W) + W) % W] = id; };
  fill(20, 139, 20, 79, RECT);
  fill(170, 199, 20, 139, ELL); fill(200, 289, 110, 139, ELL);
  fill(320, 419, 20, 119, CEE); for (let y = 40; y <= 99; y++) for (let x = 340; x <= 419; x++) ids[y * W + x] = seaAt(x, y);
  fill(440, 499, 20, 79, BODY); fill(440, 469, 90, 113, ENCLOSER); fill(POCKET.x0, POCKET.x1, POCKET.y0, POCKET.y1, BODY);
  fill(W - 30, W + 29, 150, 189, SEAM);
  fill(60, 459, 240, 242, RIBBON);
  // a tadpole: a body, a 1 px tail and a 36 px knob at its end — the knob's cell is a sliver, and merges
  fill(40, 89, 160, 189, TADPOLE); fill(90, 189, 175, 175, TADPOLE); fill(190, 195, 172, 177, TADPOLE);
  // the ring: 4 px thick round RINGED; its top-left 4×4 corner left as sea, so the top arm and the left arm meet only at
  // PINCH, diagonally, between the sea cell at (PINCH.x - 1, PINCH.y) … and RINGED at (PINCH.x, PINCH.y + 1)
  fill(300, 379, 140, 219, RING); fill(304, 375, 144, 215, RINGED);
  for (let y = 140; y <= 143; y++) for (let x = 300; x <= 303; x++) ids[y * W + x] = seaAt(x, y);
  return ids;
}
const RECT = 1001, ELL = 1002, CEE = 1003, BODY = 1004, SEAM = 1005, RIBBON = 1006, RING = 1007, TADPOLE = 1008, ENCLOSER = 900, RINGED = 901;
const POCKET = { x0: 450, x1: 452, y0: 100, y1: 103 };
const PINCH = { x: 304, y: 143 };   // the top arm's corner pixel; the left arm's is (303, 144)
const TARGET = { [RECT]: 600, [ELL]: 700, [CEE]: 650, [BODY]: 900, [SEAM]: 800, [RIBBON]: 300, [RING]: 200, [TADPOLE]: 400 };
const ANCHOR = { [RECT]: 22 * W + 22, [BODY]: 22 * W + 497 };
const NEXT = 2000, MIN_PX = 8;
const IDS = world();
const parents = Object.keys(TARGET).map(Number).map((id) => ({ id, target: TARGET[id], anchor: ANCHOR[id] !== undefined ? ANCHOR[id] : -1 }));
const run = (seed) => md.splitProvincesIntoPieces({ W, H, ids: IDS, parents, nextId: NEXT, seed, minPx: MIN_PX });

// what the fixture holds, derived from it
const parentSet = new Set(parents.map((p) => p.id));
const partsBefore = partsOf(IDS, W, H, parentSet);
const pocketPx = [];
for (let y = POCKET.y0; y <= POCKET.y1; y++) for (let x = POCKET.x0; x <= POCKET.x1; x++) pocketPx.push(y * W + x);
/** the main 4-connected body of each parent, as a set of pixels (the test's own walk) */
const mainBody = new Map();
for (const p of parentSet) {
  const seen = new Set(); let best = null;
  for (let s = 0; s < W * H; s++) {
    if (IDS[s] !== p || seen.has(s)) continue;
    const part = [s]; seen.add(s);
    for (let h = 0; h < part.length; h++) { const i = part[h], x = i % W; for (const j of [x > 0 ? i - 1 : i + W - 1, x < W - 1 ? i + 1 : i - W + 1, i - W, i + W]) if (j >= 0 && j < W * H && IDS[j] === p && !seen.has(j)) { seen.add(j); part.push(j); } }
    if (!best || part.length > best.length) best = part;
  }
  mainBody.set(p, new Set(best));
}
const kOf = (p) => Math.round(mainBody.get(p).size / TARGET[p]);

console.log("\n0. The fixture can tell right from wrong");
ok(xCrossings(IDS, W, H).length === 0, "the world before the cut has no X-crossing (every X after it is the cut's)");
ok(parents.every((p) => kOf(p.id) >= 2), "every parent is big enough to be cut (k = round(main body / target) ≥ 2)", parents.map((p) => [p.id, kOf(p.id)]));
ok((partsBefore.get(BODY) || []).length === 2 && pocketPx.every((i) => IDS[i] === BODY), "the pocket parent is in two 4-connected parts, the 12 px pocket one of them", partsBefore.get(BODY));
ok([...parentSet].filter((p) => p !== BODY).every((p) => (partsBefore.get(p) || []).length === 1), "every other parent is one 4-connected part (its pieces must be too)");
ok(IDS[PINCH.y * W + PINCH.x] === RING && IDS[(PINCH.y + 1) * W + PINCH.x - 1] === RING && IDS[PINCH.y * W + PINCH.x - 1] !== RING && IDS[(PINCH.y + 1) * W + PINCH.x] === RINGED && !parentSet.has(IDS[PINCH.y * W + PINCH.x - 1]),
  "the ring's ends meet only diagonally at the pinch, between a sea cell and the ringed province — neither one being cut");
{
  let left = false, right = false;
  for (const i of mainBody.get(SEAM)) { const x = i % W; if (x === 0) left = true; if (x === W - 1) right = true; }
  ok(left && right && (partsOf(IDS, W, H, new Set([SEAM]), false).get(SEAM) || []).length === 2, "the seam parent sits on both edge columns: one part on the cylinder, two without the wrap");
}

const res = run(1);
const out = res.ids;
const parentOf = new Map();
for (const [p, fam] of res.pieces) for (const id of fam) parentOf.set(id, p);
console.log("\n1. The cut happened, and exercised every step");
ok(parents.every((p) => res.pieces.has(p.id) && res.pieces.get(p.id)[0] === p.id && res.pieces.get(p.id).length >= 2), "every parent came back in pieces, its own id first", [...res.pieces].map(([p, f]) => [p, f.length]));
ok(parents.every((p) => res.pieces.get(p.id).length <= kOf(p.id)), "no parent in more pieces than k (a merge only removes pieces)", parents.map((p) => [p.id, res.pieces.get(p.id).length, kOf(p.id)]));
ok(res.report.reassignedComponents > 0, "the fixture makes strays (a piece's smaller 4-parts), so their repair is exercised", res.report.reassignedComponents);
ok(res.report.merged > 0, "the fixture makes slivers, so their merge is exercised", res.report.merged);
ok(res.report.xFoundPerPass[0] > 0, "the cut made X-crossings, so the X pass is exercised", res.report.xFoundPerPass);
ok(res.report.multiPartParents === [...parentSet].filter((p) => (partsBefore.get(p) || []).length > 1).length, "report.multiPartParents counts the fixture's multi-part parents", res.report.multiPartParents);
ok(res.report.seamParents === 1, "report.seamParents counts the one parent on the seam", res.report.seamParents);

console.log("\n2. Nothing outside the split set moves");
{
  let moved = 0;
  for (let i = 0; i < W * H; i++) if (!parentSet.has(IDS[i]) && out[i] !== IDS[i]) moved++;
  ok(moved === 0, "every pixel of a province nobody is cutting is byte-identical", moved);
  let foreign = 0;
  for (let i = 0; i < W * H; i++) if (parentSet.has(IDS[i]) && !parentOf.has(out[i])) foreign++;
  ok(foreign === 0, "…and every pixel of a parent is still in the split set (no parent pixel went to the sea)", foreign);
}

console.log("\n3. Every piece is land-sized, not a sliver");
{
  const area = new Map();
  for (let i = 0; i < W * H; i++) if (parentOf.has(out[i]) && !(out[i] === BODY && pocketPx.includes(i))) area.set(out[i], (area.get(out[i]) || 0) + 1);
  const small = [];
  for (const [p, fam] of res.pieces) for (const id of fam) if ((area.get(id) || 0) < Math.max(MIN_PX, 0.3 * TARGET[p])) small.push([p, id, area.get(id)]);
  ok(small.length === 0, "every piece is at least max(minPx, .3·target) — the parent's own id counted without its pocket", small);
}

console.log("\n4. The map the game reads has no X-crossing");
ok(xCrossings(out, W, H).length === 0, "0 X-crossings on the whole wrapped map", xCrossings(out, W, H).slice(0, 5));
ok(res.xLeft.length === 0 && res.report.xLeft === 0, "…and the report says so too");

console.log("\n5. The anchor's piece keeps the parent id");
for (const p of [RECT, BODY]) {
  const fam = res.pieces.get(p), area = new Map();
  for (const i of mainBody.get(p)) area.set(out[i], (area.get(out[i]) || 0) + 1);
  const largest = [...area].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  ok(out[ANCHOR[p]] === p, `parent ${p}: the pixel at its anchor still carries the parent id`, out[ANCHOR[p]]);
  ok(largest !== p && fam.includes(largest), `…control: the anchor's piece is NOT the parent's largest, so the rule is what decided it (largest ${largest})`);
}
for (const p of [ELL, CEE, SEAM, RIBBON, RING, TADPOLE]) {
  const area = new Map();
  for (const i of mainBody.get(p)) area.set(out[i], (area.get(out[i]) || 0) + 1);
  const best = Math.max(...area.values());
  ok(area.get(p) === best, `parent ${p} has no anchor: its largest piece keeps the id`, [...area]);
}
ok(pocketPx.every((i) => out[i] === BODY), "the 12 px pocket keeps the parent id: only the main body is cut", pocketPx.map((i) => out[i]));

console.log("\n6. The seam parent is cut as one shape");
{
  const fam = res.pieces.get(SEAM), straddle = [];
  for (const id of fam) {
    let both = false;
    for (let y = 0; y < H && !both; y++) if (out[y * W] === id && out[y * W + W - 1] === id) both = true;
    if (both) straddle.push(id);
  }
  ok(straddle.length >= 1, "a piece of the seam parent straddles the seam (the same row, column 0 and column W − 1)", straddle);
  const wrapped = partsOf(out, W, H, new Set(straddle)), flat = partsOf(out, W, H, new Set(straddle), false);
  ok(straddle.length >= 1 && straddle.every((id) => wrapped.get(id).length === 1 && flat.get(id).length === 2), "…and it is ONE piece joined only across the seam: one part on the cylinder, two on the flat map", straddle.map((id) => [id, wrapped.get(id), flat.get(id)]));
}

console.log("\n7. New ids: contiguous, in (parent, centroid row, col) order");
{
  ok(res.newIds.length === res.report.newIds && res.newIds.every((id, j) => id === NEXT + j), "new ids are NEXT, NEXT + 1, … with no gap", res.newIds.slice(0, 5));
  const famNew = [...res.pieces].map(([p, fam]) => [p, fam.slice(1)]);
  ok(famNew.every(([p], j) => j === 0 || famNew[j - 1][0] < p) && famNew.every(([, ids], j) => j === 0 || !ids.length || famNew[j - 1][1].every((q) => q < ids[0])), "a lower parent's new ids all come before a higher parent's");
  const bad = [];
  for (const [p, ids] of famNew) {
    const cen = ids.map((id) => {
      let n = 0, sx = 0, sy = 0;
      for (const i of mainBody.get(p)) if (out[i] === id) { let x = i % W; if (p === SEAM && x < W / 2) x += W; n++; sx += x; sy += Math.floor(i / W); }
      return [sy / n, sx / n];
    });
    for (let j = 1; j < cen.length; j++) if (cen[j][0] < cen[j - 1][0] || (cen[j][0] === cen[j - 1][0] && cen[j][1] < cen[j - 1][1])) bad.push([p, ids[j]]);
  }
  ok(bad.length === 0, "within a parent, its new ids run in centroid row order, then column (the seam parent unwrapped)", bad);
}

console.log("\n8. The pieces that are not 4-connected are EXACTLY the listed diagonal joins");
{
  const ids = new Set(parentOf.keys()), now = partsOf(out, W, H, ids);
  const broken = [];
  for (const [id, sizes] of now) {
    const before = id === BODY ? partsBefore.get(BODY).length : 1;   // the pocket parent was in two parts before the cut
    if (sizes.length > before) broken.push(id);
  }
  const listed = [...new Set(res.xDiagonal.map((d) => d.id))];
  ok(JSON.stringify(broken.sort((a, b) => a - b)) === JSON.stringify(listed.sort((a, b) => a - b)), "the set of pieces in more parts than their parent had = the set report.xDiagonal names", { broken, listed });
  ok(res.xDiagonal.length === res.report.xDiagonal && res.xForced.length === 0, "…each join counted in the report, and no pixel was forced off a province's only link", { diag: res.xDiagonal, forced: res.xForced });
  const atPinch = res.xDiagonal.filter((d) => (d.x === PINCH.x && d.y === PINCH.y) || (d.x === PINCH.x - 1 && d.y === PINCH.y + 1));
  ok(atPinch.length === 1 && parentOf.get(atPinch[0].id) === RING && parentOf.get(atPinch[0].from) === RING, "control: the ring's pinch is joined diagonally, once, between two of the ring's own pieces", res.xDiagonal);
}

console.log("\n9. Deterministic");
{
  const again = run(1), other = run(2);
  ok(Buffer.compare(Buffer.from(again.ids.buffer), Buffer.from(out.buffer)) === 0, "the same seed gives the same bytes");
  ok(Buffer.compare(Buffer.from(other.ids.buffer), Buffer.from(out.buffer)) !== 0, "another seed gives other bytes (the seed is used)");
  ok(xCrossings(other.ids, W, H).length === 0, "…and that cut leaves no X-crossing either");
}

console.log("\n10. The block where the first X pass cycled (dbg-x7, rows 1172–1176, columns 768–775 of the real run)");
{
  const BLOCK = [
    [14392, 14392, 14392, 14392, 15941, 15941, 15941, 15941],
    [14392, 14392, 14392, 14392, 15941, 15941, 15941, 15941],
    [14392, 14392, 14392, 16808, 16807, 16807, 16807, 16807],
    [14889, 14889, 14889, 16808, 16807, 16807, 16807, 16807],
    [14889, 14889, 16808, 16808, 16807, 16807, 16807, 16807],
  ];
  // each piece's parent in that run
  const PARENT = new Map([[14392, 2377], [15941, 4672], [16808, 5482], [16807, 5482], [14889, 2628]]);
  const BW = BLOCK[0].length, BH = BLOCK.length, ids = Int32Array.from(BLOCK.flat());
  const before = Int32Array.from(ids);
  ok(xCrossings(ids, BW, BH).length === 1, "control: the block holds the one X-crossing the first pass left", xCrossings(ids, BW, BH));
  const r = md.clearSplitXCrossings({ W: BW, H: BH, ids, parentOf: PARENT });
  ok(xCrossings(ids, BW, BH).length === 0 && r.xLeft.length === 0, "fed to the exported X pass alone: 0 X-crossings afterwards", { left: xCrossings(ids, BW, BH), report: r });
  ok(r.foundPerPass.every((n, j) => j === 0 || n < r.foundPerPass[j - 1]), "…the count it finds only goes down, pass after pass", r.foundPerPass);
  let changed = 0, offParent = 0;
  for (let i = 0; i < ids.length; i++) if (ids[i] !== before[i]) { changed++; if (PARENT.get(ids[i]) !== PARENT.get(before[i])) offParent++; }
  ok(changed === 1 && offParent === 0, "…by one pixel, handed between two pieces of the same parent", { changed, offParent });
}

console.log("\n11. Where parents meet side by side (the owner-flow world's block round (2002, 652), 10×8, seed 1 of the first plan)");
{
  const BLOCK = [
    [16641, 16641, 16641, 16641, 16641, 16641, 16514, 16514, 16514, 16514],
    [16641, 16641, 16641, 16641, 16641, 16641, 16514, 16514, 16514, 16514],
    [16641, 16641, 16641, 16641, 16641, 16514, 16514, 16514, 16514, 16514],
    [16641, 16641, 16641, 16641, 16641, 16514, 16514, 16514, 16514, 16514],
    [16590, 16590, 16590, 16590, 16590, 5423, 16514, 16514, 16514, 16514],
    [16590, 16590, 16590, 16590, 16590, 5423, 16514, 16514, 16514, 16514],
    [16590, 16590, 16590, 16590, 16590, 16514, 16514, 16514, 16514, 16514],
    [16590, 16590, 16590, 16590, 16590, 16514, 16514, 16514, 16514, 16514],
  ];
  // each piece's parent in that run: 5423's 2 px pocket (its own id) touches 5423's piece 16641 only at a corner
  const PARENT = new Map([[16641, 5423], [5423, 5423], [16514, 5362], [16590, 5399]]);
  const BW = BLOCK[0].length, BH = BLOCK.length, ids = Int32Array.from(BLOCK.flat());
  const before = Int32Array.from(ids);
  const xs = xCrossings(ids, BW, BH);
  ok(xs.length === 1, "control: the block holds one X-crossing", xs);
  const [bx, by] = xs.length ? xs[0] : [0, 0];
  // the X's four pixels clockwise from its top left, by parent
  const round = [[bx, by], [bx + 1, by], [bx + 1, by + 1], [bx, by + 1]].map(([x, y]) => PARENT.get(ids[y * BW + x]));
  ok(round.every((p, j) => p !== round[(j + 1) % 4]) && (round[0] === round[2] || round[1] === round[3]),
    "control: round that X no two 4-adjacent pixels share a parent, and the two that do sit diagonally — a move inside one parent could only join them at the corner", round);
  const r = md.clearSplitXCrossings({ W: BW, H: BH, ids, parentOf: PARENT });
  ok(xCrossings(ids, BW, BH).length === 0 && r.xLeft.length === 0 && r.xDiagonal.length === 0 && r.xForced.length === 0,
    "fed to the exported X pass alone: 0 X-crossings, with no diagonal join and no forced move", { left: xCrossings(ids, BW, BH), diag: r.xDiagonal, forced: r.xForced });
  let changed = 0, offParent = 0;
  for (let i = 0; i < ids.length; i++) if (ids[i] !== before[i]) { changed++; if (PARENT.get(ids[i]) !== PARENT.get(before[i])) offParent++; }
  ok(changed === 1 && offParent === 1, "…by one pixel, handed to a piece of ANOTHER parent", { changed, offParent });
}

console.log("\n12. Parents side by side through the whole cutter: the pixel handed across is counted");
{
  // three parents on a 256×128 brick-laid sea: P has a 2 px pocket that meets its main body's bottom-right corner only
  // diagonally, with Q right of that corner and R below it — the shape section 11 was cut from
  const SW = 256, SH = 128;
  const seaAt2 = (x, y) => { const row = Math.floor((y + 3) / CELL), off = 5 + (row % 2 ? CELL / 2 : 0); return 1 + row * (SW / CELL) + (Math.floor((x + off) / CELL) % (SW / CELL)); };
  const P = 1101, Q = 1102, R = 1103;
  const sids = new Int32Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) sids[y * SW + x] = seaAt2(x, y);
  const fill = (x0, x1, y0, y1, id) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sids[y * SW + x] = id; };
  fill(20, 79, 20, 59, P); fill(80, 139, 20, 79, Q); fill(20, 79, 60, 79, R); fill(80, 80, 60, 61, P);
  const CORNER = 59 * SW + 79, POCKET_TOP = 60 * SW + 80;
  const sparents = [{ id: P, target: 600, anchor: 22 * SW + 22 }, { id: Q, target: 900, anchor: -1 }, { id: R, target: 600, anchor: -1 }];
  const sset = new Set([P, Q, R]), partsP = partsOf(sids, SW, SH, sset).get(P) || [];
  ok(xCrossings(sids, SW, SH).length === 0, "control: no X-crossing before the cut");
  ok(partsP.length === 2 && partsP.includes(2) && sids[CORNER] === P && sids[POCKET_TOP] === P && sids[CORNER + 1] === Q && sids[CORNER + SW] === R,
    "control: P is a main body plus a 2 px pocket touching the body's corner only diagonally, between Q and R", partsP);
  const sr = md.splitProvincesIntoPieces({ W: SW, H: SH, ids: sids, parents: sparents, nextId: NEXT, seed: 1, minPx: MIN_PX });
  const sParentOf = new Map([...sset].map((p) => [p, p]));
  for (const [p, fam] of sr.pieces) for (const id of fam) sParentOf.set(id, p);
  ok(sparents.every((p) => (sr.pieces.get(p.id) || []).length >= 2) && sr.report.xFoundPerPass[0] > 0, "control: all three were cut, and the cut made X-crossings", { pieces: [...sr.pieces].map(([p, f]) => [p, f.length]), found: sr.report.xFoundPerPass });
  ok(xCrossings(sr.ids, SW, SH).length === 0 && sr.xDiagonal.length === 0 && sr.xForced.length === 0, "0 X-crossings, with no diagonal join and no forced move", { diag: sr.xDiagonal, forced: sr.xForced });
  const now = partsOf(sr.ids, SW, SH, new Set(sParentOf.keys()));
  ok([...now].every(([id, s]) => s.length === (id === P ? 2 : 1)), "every piece is one 4-connected part (P's own id two: its piece and the pocket, as before)", [...now].filter(([id, s]) => s.length !== (id === P ? 2 : 1)));
  const across = [];
  for (let i = 0; i < SW * SH; i++) if (sset.has(sids[i]) && sParentOf.get(sr.ids[i]) !== sids[i]) across.push(i);
  ok(across.length === 1 && [CORNER, CORNER + 1, CORNER + SW, POCKET_TOP].includes(across[0]), "one pixel went to another parent, in the 2×2 block where the pocket meets the corner", across.map((i) => [i % SW, Math.floor(i / SW)]));
  ok(sr.movedBetweenParents === across.length && sr.report.movedBetweenParents === across.length, "…and movedBetweenParents counts it (a writer reads it to know a parent's own pixels changed hands)", { moved: sr.movedBetweenParents, report: sr.report.movedBetweenParents, across: across.length });
}

console.log("\n13. A new id is new (#a-new-id-is-new)");
{
  let top = -1;
  for (const v of IDS) if (v > top) top = v;
  const refusal = (nextId) => { try { md.splitProvincesIntoPieces({ W, H, ids: IDS, parents, nextId, seed: 1, minPx: MIN_PX }); return ""; } catch (e) { return String((e && e.message) || e); } };
  const uncut = IDS[0];   // a sea cell nobody is cutting
  ok(refusal(top + 1) === "" && !parentSet.has(uncut) && uncut < top, "control: one above the largest id on the raster cuts", { top, uncut });
  ok([top, uncut].every((n) => refusal(n) !== ""), "a nextId at or under an id already on the raster is refused — the pieces would have merged into the province that has it", [top, uncut].map((n) => [n, refusal(n)]));
  ok([undefined, top + 1.5].every((n) => refusal(n) !== ""), "…and so is one that is not a whole number (undefined wrote id 0, a fraction a truncated id)", [undefined, top + 1.5].map((n) => [String(n), refusal(n)]));
}

console.log("\n14. The cut spends no more border segments than the allowance counted on (#the-border-budget)");
{
  // provinceSplitAllowance gives a map h segments under PROVINCE_BORDER_BUDGET floor(h / S) new ids, S =
  // PROVINCE_SEGMENTS_PER_NEW_ID; so the least headroom that allows a cut's n new ids is ceil(n × S), and a cut to the full
  // allowance lands inside the budget only if it spends no more than that
  const S = md.PROVINCE_SEGMENTS_PER_NEW_ID, B = md.PROVINCE_BORDER_BUDGET;
  const segBefore = md.provinceBorderSegments({ W, H, ids: IDS }).segments;
  for (const seed of [1, 2]) {
    const c = seed === 1 ? res : run(seed);
    const n = c.newIds.length, spent = md.provinceBorderSegments({ W, H, ids: c.ids }).segments - segBefore, room = Math.ceil(n * S);
    ok(spent > 3 * n, `seed ${seed}, control: the cut spends more than the 3 borders a planar map spends per new face (its borders wiggle along their parents' edges)`, { n, spent });
    ok(md.provinceSplitAllowance(B - room) === n && spent <= room, `seed ${seed}: on a map with just the headroom the allowance needs for its ${n} new ids, the cut lands inside PROVINCE_BORDER_BUDGET`, { n, spent, room, perNewId: spent / n });
  }
}

console.log(`\n=== a raised province is cut to land size: ${pass} passed, ${fail} failed ===`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
if (fail) process.exitCode = 1;
