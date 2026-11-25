// ⛔ #a-split-province-is-the-size-of-its-ground — THE PROVISIONAL GROUND IS DEALT AGAIN UNTIL IT IS DEALT AT THE SCALE IT CUTS AT, AND NO
// MORE THAN SPLIT_PROVISIONAL_DEALS TIMES. splitWeightsByGround's loop has two exits: the scale its last deal was weighed at is the
// scale those weights cut at (within SPLIT_DEAL_SCALE_TOLERANCE), or the cap. The cap is the loop's ONLY bound — a scale that never
// settles (each deal moving the scale the next one is weighed at) would otherwise deal forever, inside Generate land's request — and
// the split test never reaches it: with the cap removed, or the convergence exit removed, it stayed 53/53 (review of b09ae613).
// Pure: splitWeightsByGround called directly on SW's world, with `scaleOf` the test's own.
//   1. a scale that alternates 4, 1, 4, 1 …: dealt exactly SPLIT_PROVISIONAL_DEALS times, scaleOf asked at most one more, by the ground;
//   2. a scale that is the same every time: dealt once — the second ask is the first's, within the tolerance;
//   3. a scale that settles (by three quarters of its distance each time): dealt until it is within the tolerance, and no further.
// Binds no port. Run: node test-the-provisional-ground-is-dealt-a-bounded-number-of-times.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deal-bound-"));
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
process.env.HOI4_ROOT = path.join(ROOT, "game");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + JSON.stringify(detail).slice(0, 600)));
  if (!cond) fails.push(label);
};

try {
  const S = SW.makeShapes();
  SW.makeGame(process.env.HOI4_ROOT, S, { terrain: true });
  const modRoot = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "deal"), S, { name: "deal" });
  const { W, H } = S, ids = S.modIds;
  const picked = [];
  for (let id = 1; id <= S.N; id++) if (S.typeOf(id) === "sea") picked.push(String(id));
  const area = new Float64Array(S.N + 1), sy = new Float64Array(S.N + 1);
  for (let i = 0; i < W * H; i++) { const p = ids[i]; area[p]++; sy[p] += Math.floor(i / W); }
  const landAfter = new Set(picked.map(Number));
  for (let id = 1; id <= S.N; id++) if (S.typeOf(id) === "land") landAfter.add(id);
  const ground = { adj: null, landAfter, palette: SW.TERRAINS.slice() };
  const CAP = md.SPLIT_PROVISIONAL_DEALS, TOL = md.SPLIT_DEAL_SCALE_TOLERANCE;
  rec(`(the cap and the tolerance are exported numbers: ${CAP} deals, ${TOL})`, Number.isInteger(CAP) && CAP >= 2 && CAP <= 10 && TOL > 0 && TOL < 0.5, { CAP, TOL });
  // a scaleOf that refuses to be asked forever: past 50 asks it throws, which splitWeightsByGround reports as the density field
  const run = (seq) => {
    let asked = 0;
    const scaleOf = () => { asked++; if (asked > 50) throw new Error("scaleOf asked 50 times"); return seq(asked); };
    const r = md.splitWeightsByGround({ modRoot, gameRoot: process.env.HOI4_ROOT, dependencyRoots: [], W, H, ids, picked, area, sy, ground, seed: 1,
      cuttable: (p) => area[p] > 0, scaleOf });
    return { r: r.report || {}, asked };
  };
  const control = run(() => 2);
  rec("(control: the world is dealt by the ground, by the pieces it makes)", control.r.by === "ground" && control.r.dealtBy === "pieces", control.r);

  // 1. never settles
  const alt = run((n) => (n % 2 ? 4 : 1));
  rec(`⭐ a scale that never settles is dealt exactly ${CAP} times — and still by the ground, its last deal standing`,
    alt.r.by === "ground" && Array.isArray(alt.r.scales) && alt.r.scales.length === CAP && alt.asked <= CAP + 1, { by: alt.r.by, why: alt.r.why, error: alt.r.error, scales: alt.r.scales, asked: alt.asked });
  // 2. already settled
  rec("⭐ a scale that is the same every time is dealt once: the second ask is the first's", Array.isArray(control.r.scales) && control.r.scales.length === 1 && control.asked === 2,
    { scales: control.r.scales, asked: control.asked });
  // 3. settles by three quarters of its distance each time: 1.2, 1.05, 1.0125 … → 1; within TOL of the last after the step that moves less than TOL
  const half = run((n) => 1 + 0.2 / Math.pow(4, n - 1));
  let want = 0;
  for (let n = 1; n < 50; n++) { const s = 1 + 0.2 / Math.pow(4, n - 1), t = 1 + 0.2 / Math.pow(4, n); want++; if (Math.abs(t / s - 1) <= TOL || want >= CAP) break; }
  rec(`⭐ a scale that settles is dealt until it is within ${TOL} of the last deal's (${want} deals here), and no further`,
    half.r.by === "ground" && Array.isArray(half.r.scales) && half.r.scales.length === want, { scales: half.r.scales, want, asked: half.asked });
  // 4. what the page names (classOrder) is the grounds the deal USED — never every ground the layer below grows. SW's layer below grows
  // all seven; the palette here is two of them, so a classOrder read off the layer below's whole terrain list names five grounds the
  // click can never write (on vanilla: "smaller in the cities and hills" — urban is not generatable). The split test's layer below
  // grows exactly the grounds its cut uses, so a classOrder over all of them stayed green there.
  const two = md.splitWeightsByGround({ modRoot, gameRoot: process.env.HOI4_ROOT, dependencyRoots: [], W, H, ids, picked, area, sy,
    ground: Object.assign({}, ground, { palette: ["plains", "desert"] }), seed: 1, cuttable: (p) => area[p] > 0, scaleOf: () => 2 }).report || {};
  const named = (two.classOrder || []).map((x) => x[0]).sort(), dealt = Object.keys(two.provisional || {}).sort();
  rec(`(control: the layer below grows more grounds than the palette — ${SW.TERRAINS.join(", ")})`, SW.TERRAINS.length > 2 && dealt.length > 0, { dealt });
  rec("⭐ the grounds the page names are the ones the deal used, each once — none the palette lacks", two.by === "ground" && JSON.stringify(named) === JSON.stringify(dealt)
    && named.every((t) => t === "plains" || t === "desert"), { named, dealt });
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== the provisional ground is dealt a bounded number of times: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
