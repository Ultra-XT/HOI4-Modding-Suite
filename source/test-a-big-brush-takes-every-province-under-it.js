// ⛔ #a-big-brush-takes-every-province-under-it — THE ERASE AND TERRAIN BRUSHES ACT ON EVERY PROVINCE UNDER THEIR DISC (tool campaign B1-14).
//
// Both sampled a lattice of every floor(R/24)th pixel of the disc, on the belief that provinces are at least 8 px across. From a brush of
// 48 px a step of 2 or more skipped thin and small provinces: one Terrain click at brush 256 on the base game's map left about one in ten of
// the provinces inside the disc unpainted, 39 of them lying entirely inside it, and the page's count line said nothing. Now one helper,
// provincesUnderDisc, reads every pixel of the disc and gives each province once, the one under the centre first.
//
// provincesUnderDisc lifted from public/map.js and checked against a brute-force disc on maps of 1-px stripes and 1-px islands; eraseAt and
// paintTerrainAt lifted and run on the same map; the page read (comments masked) for any lattice left. Binds no port.
// Run: node test-a-big-brush-takes-every-province-under-it.js
"use strict";
const vm = require("vm");
const { lift, MASKED } = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + JSON.stringify(x).slice(0, 600) : "")); }
};

// maps: `stripes` = each column its own province (1 px wide); `islands` = province 1 everywhere, with a 1-px province every 5 px
const W = 600, H = 600;
const stripes = new Int32Array(W * H), islands = new Int32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  stripes[y * W + x] = 1000 + x;
  islands[y * W + x] = x % 5 === 2 && y % 5 === 3 ? 100000 + y * W + x : 1;
}
const brute = (grid, p, R) => {
  const s = new Set();
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    s.add(grid[y * W + x]);
  }
  return s;
};
const sandbox = (grid, extra = {}) => {
  const sb = Object.assign({ imgW: W, imgH: H, pidGrid: grid }, extra);
  vm.createContext(sb);
  return sb;
};

console.log("=== 1. provincesUnderDisc: every province the disc covers, each once, the centre's first ===");
const HELPER = lift("function provincesUnderDisc(");
for (const [name, grid] of [["1-px stripes", stripes], ["1-px islands", islands]]) {
  const sb = sandbox(grid); vm.runInContext(HELPER + "\nglobalThis.__f = provincesUnderDisc;", sb);
  for (const R of [0, 1, 5, 47, 48, 100, 255]) for (const p of [{ x: 300, y: 300 }, { x: 3, y: 590 }]) {
    const got = sb.__f(p, R), want = brute(grid, p, R);
    const same = got.length === want.size && got.every((id) => want.has(id));
    ok(same && new Set(got).size === got.length && got[0] === grid[p.y * W + p.x],
      `${name}, radius ${R} at (${p.x},${p.y}): ${got.length} provinces, the full disc has ${want.size}`, { got: got.length, want: want.size, first: got[0] });
  }
}

console.log("=== 2. the Erase and Terrain brushes take every one of them ===");
{
  const ERASE = lift("function eraseAt(");
  const hit = [];
  const sb = sandbox(stripes, { brushRadius: 101, imgXYAt: () => ({ x: 300, y: 300 }), eraseProvinceLocal: (pid) => { hit.push(pid); return false; }, recolorAll() {}, draw() {} });
  vm.runInContext(HELPER + "\n" + ERASE + "\nglobalThis.__f = eraseAt;", sb);
  sb.__f(0, 0);
  const want = brute(stripes, { x: 300, y: 300 }, 100);
  ok(hit.length === want.size && hit.every((id) => want.has(id)) && new Set(hit).size === hit.length,
    `🧹 Erase at brush 101 asks about every province under the disc, once each (${hit.length} of ${want.size})`, { hit: hit.length, want: want.size });
}
{
  const TERRAIN = lift("function paintTerrainAt(");
  const queued = [];
  const types = new Map(), defs = new Map();
  for (let x = 0; x < W; x++) { types.set(1000 + x, "land"); defs.set(1000 + x, { id: 1000 + x, terrain: "plains" }); }
  const sb = sandbox(stripes, {
    brushRadius: 101, imgXYAt: () => ({ x: 300, y: 300 }), terrainPaintType: "forest", terrainStroke: new Set(), terrainChanged: 0,
    provinceType: types, provinceDef: defs, pendingWrites: [], queueWrite: (url, body) => queued.push(body), setStatus() {}, recolorAll() {}, draw() {},
    setMapDirty() {}, paintDiff: new Map(),
  });
  vm.runInContext(HELPER + "\n" + TERRAIN + "\nglobalThis.__f = paintTerrainAt;", sb);
  sb.__f(0, 0);
  const want = brute(stripes, { x: 300, y: 300 }, 100);
  ok(queued.length === want.size && queued.every((b) => want.has(b.provinceId)),
    `🏔 Terrain at brush 101 paints every province under the disc (${queued.length} of ${want.size})`, { queued: queued.length, want: want.size });
}

console.log("=== 3. no brush samples a lattice any more ===");
for (const fn of ["function eraseAt(", "function paintTerrainAt("]) {
  const at = MASKED.indexOf("\n  " + fn), body = MASKED.slice(at, MASKED.indexOf("\n  }", at));
  ok(/provincesUnderDisc\(p, R\)/.test(body), `${fn.slice(9, -1)} reads the disc through provincesUnderDisc`);
  ok(!/dy \+= step|dx \+= step|Math\.floor\(R \/ 24\)/.test(body), `${fn.slice(9, -1)} steps over no pixel`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
