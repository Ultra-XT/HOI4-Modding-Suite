// ⛔ #the-border-budget — THE CUT SPENDS NO MORE NEW PROVINCES THAN THE BORDER BUDGET ALLOWS, AND WHERE THE BUDGET DOES NOT
// BIND THE PIECES COME OUT THE SIZE OF THE LAYER BELOW'S LAND.
//
// The game stops DISPLAYING province borders past 65,536 (the wiki's Map_modding page; Old World Blues ships 65,460 border
// segments and loads). Cutting TEST 31's raised land to vanilla's mean (399.1 px) would make 9,644 new provinces and 69,644
// segments, over it; so provinceSplitPlan gives each parent a target T_p = s × weight_p and finds the scale s at which the
// projected new ids, Σ max(0, round(A_p / T_p) − 1), stay inside `allowed` (provinceSplitAllowance). Pinned on six parents of
// three weights drawn on a sea of brick-laid cells, every expectation derived from the fixture:
//   1. a budget that does not bind: the targets lean on the weights exactly (T_p ∝ w_p), and the pieces the cutter makes
//      average the layer below's mean T0 within ±10% — although the weights come in at a scale of their own;
//   2. a budget that binds: the projection AND the cutter's real new ids stay inside it, T_p ∝ w_p still, and the scale is
//      the smallest that fits (a hair smaller would spend more than allowed);
//   3. a budget of 0: nothing is cut;
//   4. the allowance itself, derived from the two exported constants;
//   5. a slip allows nothing (#a-slip-allows-nothing): a count that is not a number (undefined, or provinceBorderSegments'
//      whole result instead of its .segments) gave a NaN allowance, and a NaN cap switched the budget OFF — the plan spent
//      the whole free cut.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-plan-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

// ── the world: six 64×48 parents in two rows on a brick-laid sea of 16 px cells ──────────────────────────────────────────
const W = 512, H = 256, CELL = 16;
const seaAt = (x, y) => { const row = Math.floor((y + 3) / CELL), off = 5 + (row % 2 ? CELL / 2 : 0); return 1 + row * (W / CELL) + (Math.floor((x + off) / CELL) % (W / CELL)); };
const PARENTS = [
  { id: 1001, x0: 20, y0: 20, weight: 1 }, { id: 1002, x0: 180, y0: 20, weight: 2 }, { id: 1003, x0: 340, y0: 20, weight: 3 },
  { id: 1004, x0: 20, y0: 140, weight: 1 }, { id: 1005, x0: 180, y0: 140, weight: 2 }, { id: 1006, x0: 340, y0: 140, weight: 3 },
];
const PW = 64, PH = 48;
const IDS = new Int32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) IDS[y * W + x] = seaAt(x, y);
for (const p of PARENTS) for (let y = p.y0; y < p.y0 + PH; y++) for (let x = p.x0; x < p.x0 + PW; x++) IDS[y * W + x] = p.id;
const areaOf = new Map();
for (const v of IDS) if (v > 1000) areaOf.set(v, (areaOf.get(v) || 0) + 1);
// T0 is the layer below's land mean: here, the mean of a few land provinces of a layer below written out by size
const BELOW_LAND = [120, 260, 310, 95, 600, 415];
const T0 = BELOW_LAND.reduce((a, b) => a + b, 0) / BELOW_LAND.length;
const planParents = PARENTS.map((p) => ({ id: p.id, area: areaOf.get(p.id), weight: p.weight }));
const weightOf = new Map(PARENTS.map((p) => [p.id, p.weight]));
const projectedAt = (s) => { let n = 0; for (const p of planParents) { const k = Math.round(p.area / (s * p.weight)); if (k >= 2) n += k - 1; } return n; };
const cut = (plan) => md.splitProvincesIntoPieces({ W, H, ids: IDS, parents: PARENTS.map((p) => ({ id: p.id, target: plan.targets.get(p.id), anchor: -1 })), nextId: 2000, seed: 1 });
const proportional = (plan) => { const r = PARENTS.map((p) => plan.targets.get(p.id) / p.weight); return r.every((v) => Math.abs(v - r[0]) <= 1e-9 * r[0]); };

console.log("\n0. The fixture can tell right from wrong");
ok(planParents.every((p) => p.area === PW * PH), "every parent is its whole rectangle", planParents.map((p) => p.area));
{
  const sumA = planParents.reduce((s, p) => s + p.area, 0), harmonic = sumA / planParents.reduce((s, p) => s + p.area / p.weight, 0);
  ok(Math.abs(harmonic - 1) > 0.3, "the weights' own scale is far from 1 (their area-weighted harmonic mean), so pieces cut at s = T0 would NOT average T0", harmonic);
}

console.log("\n1. A budget that does not bind");
{
  const plan = md.provinceSplitPlan({ parents: planParents, T0 });
  ok(plan.binds === false && plan.scale === plan.free && plan.allowed === Infinity, "with no allowance nothing binds, and the scale is the free one", { binds: plan.binds, scale: plan.scale, free: plan.free });
  ok(proportional(plan), "T_p ∝ weight_p", [...plan.targets]);
  const res = cut(plan);
  let pieces = 0, area = 0;
  for (const [p, fam] of res.pieces) { pieces += fam.length; area += areaOf.get(p); }
  for (const p of PARENTS) if (!res.pieces.has(p.id)) { pieces++; area += areaOf.get(p.id); }
  const mean = area / pieces;
  ok(Math.abs(mean - T0) <= 0.1 * T0, `the cutter's pieces average the layer below's land mean T0 = ${T0.toFixed(1)} within ±10%`, { mean, pieces });
  ok(res.newIds.length > 0, "…and that is a real cut (control)", res.newIds.length);
}

console.log("\n2. A budget that binds");
{
  const free = md.provinceSplitPlan({ parents: planParents, T0 });
  const allowed = Math.floor(free.projected / 3);
  ok(allowed > 0 && free.projected > allowed, "control: the free plan would spend more than this allowance", { free: free.projected, allowed });
  const plan = md.provinceSplitPlan({ parents: planParents, T0, allowed });
  ok(plan.binds === true && plan.projected <= allowed, "the plan binds, and projects no more new ids than allowed", { projected: plan.projected, allowed });
  ok(proportional(plan), "T_p ∝ weight_p still", [...plan.targets]);
  ok(projectedAt(plan.scale * 0.999) > allowed, "…and the scale is the smallest that fits: a hair smaller would spend more", { scale: plan.scale, at999: projectedAt(plan.scale * 0.999) });
  const res = cut(plan);
  ok(res.newIds.length <= allowed && res.newIds.length > 0, "the cutter's REAL new ids stay inside the allowance", { newIds: res.newIds.length, allowed });
  const per = PARENTS.map((p) => (res.pieces.get(p.id) || [p.id]).length);
  ok(PARENTS.every((p, j) => j < 3 || per[j] === per[j - 3]) && per[0] > per[2], "the weight decides the count: the same shape cuts into fewer pieces where its weight is higher", per);
}

console.log("\n3. A budget of 0");
{
  const plan = md.provinceSplitPlan({ parents: planParents, T0, allowed: 0 });
  const res = cut(plan);
  ok(plan.projected === 0 && res.newIds.length === 0, "nothing is cut", { projected: plan.projected, newIds: res.newIds.length });
  ok(Buffer.compare(Buffer.from(res.ids.buffer), Buffer.from(IDS.buffer)) === 0, "…and the raster comes back byte-identical");
}

console.log("\n4. The allowance");
{
  const B = md.PROVINCE_BORDER_BUDGET, S = md.PROVINCE_SEGMENTS_PER_NEW_ID;
  // S need not be a whole number (a real cut spends a little over 3 per new id — see provinceSplitAllowance), so the
  // headroom is taken in whole segments: the least that allows 10 is ceil(10 × S)
  ok(Number.isInteger(B) && Number.isFinite(S) && S > 0, "the budget and the segments per new id are exported numbers", { B, S });
  const h10 = Math.ceil(10 * S);
  ok(md.provinceSplitAllowance(B - h10) === 10 && md.provinceSplitAllowance(B - h10 - 1) === 10 && md.provinceSplitAllowance(B - h10 + 1) === 9,
    "a map with ceil(10 × PROVINCE_SEGMENTS_PER_NEW_ID) segments to spare may add 10, one segment fewer only 9 (rounding down)", { h10, at: md.provinceSplitAllowance(B - h10), less: md.provinceSplitAllowance(B - h10 + 1) });
  ok(md.provinceSplitAllowance(B) === 0 && md.provinceSplitAllowance(B + 5000) === 0, "a map at or over the budget may add none (never a negative allowance)");
}

console.log("\n5. A slip allows nothing (#a-slip-allows-nothing)");
{
  const seg = md.provinceBorderSegments({ W, H, ids: IDS });
  const free = md.provinceSplitPlan({ parents: planParents, T0 });
  ok(md.provinceSplitAllowance(seg.segments) > 0 && free.projected > 0, "control: this map's own count allows new ids, and the free plan would spend some", { allowance: md.provinceSplitAllowance(seg.segments), free: free.projected });
  const counts = [["undefined", undefined], ["NaN", NaN], ["provinceBorderSegments' whole result", seg], ["the count as a string", String(seg.segments)]];
  ok(counts.every(([, v]) => md.provinceSplitAllowance(v) === 0), "provinceSplitAllowance of anything but a finite count is 0 — never NaN", counts.map(([k, v]) => [k, md.provinceSplitAllowance(v)]));
  ok([undefined, null, Infinity].every((v) => { const p = md.provinceSplitPlan({ parents: planParents, T0, allowed: v }); return !p.binds && p.projected === free.projected; }), "control: an allowance left out (undefined, null, Infinity) binds nothing");
  const caps = [["NaN", NaN], ["provinceBorderSegments' whole result", seg], ["a string", "12"], ["−Infinity", -Infinity]];
  const plans = caps.map(([k, v]) => [k, md.provinceSplitPlan({ parents: planParents, T0, allowed: v })]);
  ok(plans.every(([, p]) => p.binds && p.projected === 0 && p.allowed === 0), "an allowance that is not a finite number allows NONE (a NaN cap made the plan spend the whole free cut)", plans.map(([k, p]) => [k, p.binds, p.projected, p.allowed]));
}

console.log(`\n=== the split plan keeps inside the border budget: ${pass} passed, ${fail} failed ===`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
if (fail) process.exitCode = 1;
