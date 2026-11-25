// A raise that meets land which stays must not stand a straight wall against it.
// #a-raise-stands-on-the-land-around-it
//
// THE OWNER, TEST 32 (8.webp): "shanghai is between huge mountains and the rail just climb the mountains, while those
// mountains can be real the railway cant just be climbing them". The town is Shagrei, province 2568. Its own relief to the
// west (103 -> 167 over 12 px) is real ground. The two straight walls are not: Auto-fix filled three cut-off seas beside the
// town one province at a time, and the raise lifted each of them, and the 94 ring of the town's own beach, to the relief
// field at FULL strength — no water anywhere near, so depth 0 — while the 97..103 beach the town had built for that water
// never moved. One-pixel steps of up to 131 inside 2568 (97 | 228), and both railway arrows out of it climbed them (66, 63).
// Over that world, 2,181 one-pixel land steps of 30+ against the base game's 61, max 136 against 48.
//
// Generate land now fills those seas inside its own single raise (inlandSeaPlan), so the owner's flow no longer builds them.
// The WRITER still did, on every other path that raises land beside land that stays: a second Generate land beside an
// earlier one (every wall in the OLD land: its 94 ring lifted beside its unmoved 97), a lake turned to land, and any sea
// Auto-fix or the inspector fills inside land. So the rule is in the writer: no pixel the raise settles stands more than
// HEIGHTMAP_RAISE_RIM_SLOPE per pixel above the land OUTSIDE its domain beside it, and none goes under the curve's floor.
//
// …and none stands more than S per pixel BELOW it either (sections 8 and 9). The cap alone was one-sided: a lake in a mountain
// valley turned to land took the field (~105) under shores of 140..160, and over every Millennium Dawn lake that left 45
// one-pixel steps of 20+ down from the shore, up to 51 — the lake's own bank, which stood over water and now stood over land.
// Where the land on the two sides disagrees by more than S a step across the domain, no height meets both and the cap wins.
//
// Sections 4 and 5 read the installed game, and FAIL when it is missing: a check that cannot run is not a pass.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const NOGAME = path.join(os.tmpdir(), "__no_game_rim__");
const tmps = [];
// the writer's own numbers, read off the module rather than typed in
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL;
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const S = md.HEIGHTMAP_RAISE_RIM_SLOPE;
const FLOOR = Math.min(...md.HEIGHTMAP_RELIEF_CDF.map((p) => p[1]));
const STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function makeMod(W, H, idAt, ids, tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rim-" + tag + "-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RIM"\nreplace_path="map"\n');
  const col = (id) => [(id * 37) & 255, (id * 91 + 11) & 255, (id * 53 + 7) & 255];
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = col(idAt(x, y)); bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  // everything starts as sea, exactly as Delete map leaves it
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const i of ids) { const c = col(i); rows.push(`${i};${c[0]};${c[1]};${c[2]};sea;false;ocean;0`); }
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz, 89);
  hb.write("BM", 0, "ascii"); hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return { d, W, H, hrs, idAt };
}
const grid = (f) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); const g = new Uint8Array(f.W * f.H); for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) g[y * f.W + x] = b[off + (f.H - 1 - y) * f.hrs + x]; return g; };
// a modder's own heights, written straight into the bitmap, as the layer below would carry them
const setHeights = (f, pick, h) => { const hp = path.join(f.d, "map", "heightmap.bmp"), b = fs.readFileSync(hp), off = b.readUInt32LE(10); for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) if (pick(x, y)) b[off + (f.H - 1 - y) * f.hrs + x] = h; fs.writeFileSync(hp, b); };
// …or a height per pixel (null leaves it), for ground that climbs
const paint = (f, hOf) => { const hp = path.join(f.d, "map", "heightmap.bmp"), b = fs.readFileSync(hp), off = b.readUInt32LE(10); for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) { const h = hOf(x, y); if (h !== null) b[off + (f.H - 1 - y) * f.hrs + x] = h; } fs.writeFileSync(hp, b); };
const retype = (f, id, type) => {
  const p = path.join(f.d, "map", "definition.csv");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("\n").map((l) => { const c = l.split(";"); return c[0] === String(id) ? c.map((v, i) => (i === 4 ? type : i === 6 ? (type === "land" ? "plains" : type === "lake" ? "lakes" : "ocean") : v)).join(";") : l; }).join("\n"));
};
const raise = (f, ids) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: ids, raise: true });

// The known answer, computed here and not by the writer: the raise's domain (the target's pixels at or below the waterline,
// plus land pixels at or below it reachable within the beach's depth), depth from water that is still water, the field — the
// lift: the highest land OUTSIDE the domain beside it (a land province's or the target's own standing pixel), less S per step
// through the domain — and then the cap: the lowest such land plus S per step, never under the curve's floor, so where the two
// disagree the cap wins. Plain Bellman-Ford relaxation, not the writer's buckets, and no lower bound on the lift: one no higher
// than the field changes nothing, which is what lets the writer stop its walk at the beach's 94.
// ⚠️ The field answers every depth, the beach included (#a-beach-climbs-like-the-base-games: it was the flat ramp for depth 1..8
// until TEST 33's ledge), x wraps and the rows off the map are water to the depth (#a-raise-knows-where-the-map-ends) — the writer's
// rules since then, so the model's too.
function expected(f, before, isLandId, targetIds) {
  const { W, H, idAt } = f, N = W * H;
  // the neighbour of (x, y) one step along (dx, dy): x wraps, and a row off the map is -1 — water to the depth, nothing to the walks
  const nb = (x, y, dx, dy) => { const b = y + dy; return b < 0 || b >= H ? -1 : b * W + (x + dx + W) % W; };
  const kind = new Uint8Array(N); // 0 water, 1 target, 2 land
  for (let i = 0; i < N; i++) { const id = idAt(i % W, (i - (i % W)) / W); kind[i] = targetIds.has(id) ? 1 : isLandId(id) ? 2 : 0; }
  const inD = new Uint8Array(N); let front = [];
  for (let i = 0; i < N; i++) if (kind[i] === 1 && before[i] <= SEA_LEVEL) { inD[i] = 1; front.push(i); }
  const domain = front.slice();
  for (let s = 0; s < RAMP.length && front.length; s++) {
    const nx = [];
    for (const k of front) { const x = k % W, y = (k - x) / W; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (inD[j] || kind[j] !== 2 || before[j] > SEA_LEVEL) continue; inD[j] = 1; domain.push(j); nx.push(j); } }
    front = nx;
  }
  const depth = new Int32Array(N); let q = [];
  for (const k of domain) { const x = k % W, y = (k - x) / W; if (STEP4.some(([dx, dy]) => { const j = nb(x, y, dx, dy); return j < 0 || (kind[j] === 0 && before[j] <= SEA_LEVEL); })) { depth[k] = 1; q.push(k); } }
  for (let d = 2; q.length; d++) { const nx = []; for (const k of q) { const x = k % W, y = (k - x) / W; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (!inD[j] || depth[j]) continue; depth[j] = d; nx.push(j); } } q = nx; }
  const relief = md.heightmapReliefField(W);
  const want = new Map(), field = new Map();
  for (const k of domain) { const x = k % W, y = (k - x) / W, d = depth[k]; want.set(k, relief(x, y, d)); }
  for (const [k, v] of want) field.set(k, v);
  const lift = new Map();
  for (const k of domain) { const x = k % W, y = (k - x) / W; let hi = -Infinity; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (!inD[j] && kind[j] !== 0) hi = Math.max(hi, before[j]); } if (hi > -Infinity) lift.set(k, hi - S); }
  let lifting = true;
  while (lifting) { lifting = false; for (const k of domain) { const l = lift.get(k); if (l === undefined) continue; const x = k % W, y = (k - x) / W; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (!inD[j]) continue; const h = lift.get(j); if (h === undefined || l - S > h) { lift.set(j, l - S); lifting = true; } } } }
  for (const [k, l] of lift) if (l > want.get(k)) want.set(k, l);
  const cap = new Map();
  for (const k of domain) { const x = k % W, y = (k - x) / W; let lo = Infinity; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (!inD[j] && kind[j] !== 0) lo = Math.min(lo, before[j]); } if (lo < Infinity) cap.set(k, lo + S); }
  let changed = true;
  while (changed) { changed = false; for (const k of domain) { const c = cap.get(k); if (c === undefined) continue; const x = k % W, y = (k - x) / W; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j < 0) continue; if (!inD[j]) continue; const h = cap.get(j); if (h === undefined || c + S < h) { cap.set(j, c + S); changed = true; } } } }
  const limOf = (k) => { const c = cap.get(k); return c !== undefined && c < 255 ? Math.max(c, FLOOR) : Infinity; };
  for (const k of domain) want.set(k, Math.min(want.get(k), limOf(k)));
  // what the writer gave before the lift: the field under the cap — the wall a one-sided cap leaves below the land beside it
  const capped = new Map(); for (const k of domain) capped.set(k, Math.min(field.get(k), limOf(k)));
  return { domain, want, field, lift, limOf, capped, depth, inD, kind, relief };
}

console.log("\n=== 🈯 the slope is a named, exported constant ===");
ok(Number.isInteger(S) && S > 0, "HEIGHTMAP_RAISE_RIM_SLOPE is exported", S);
ok(FLOOR > SEA_LEVEL, "the curve's floor the cap stops at stands above the waterline", { FLOOR, SEA_LEVEL });

// ── ⛔ 1. the owner's Shagrei: a sea filled inside land stands on the land around it ───────────────────────────────────────────
console.log("\n=== ⛔ 1. a sea filled inside land meets that land within S per pixel ===");
{
  const W = 512, H = 128, LX0 = 300, LX1 = 420, LY0 = 8, LY1 = 119, P = 16;
  const relief = md.heightmapReliefField(W);
  // put the pocket where the old writer's wall is tallest: the field on the ring around it, against the beach's 97
  let best = null;
  for (let y0 = LY0 + 12; y0 + P <= LY1 - 12; y0 += 2) for (let x0 = LX0 + 12; x0 + P <= LX1 - 12; x0 += 2) {
    let mx = 0; for (let x = x0 - 1; x <= x0 + P; x++) { mx = Math.max(mx, relief(x, y0 - 1, 0), relief(x, y0 + P, 0)); } for (let y = y0; y < y0 + P; y++) mx = Math.max(mx, relief(x0 - 1, y, 0), relief(x0 + P, y, 0));
    if (!best || mx > best.mx) best = { x0, y0, mx };
  }
  const { x0, y0 } = best;
  const inPocket = (x, y) => x >= x0 && x < x0 + P && y >= y0 && y < y0 + P;
  const idAt = (x, y) => (x >= LX0 && x <= LX1 && y >= LY0 && y <= LY1 ? (inPocket(x, y) ? 3 : 2) : 1);
  const f = makeMod(W, H, idAt, [1, 2, 3], "fill");
  retype(f, 2, "land");
  raise(f, [2]);
  const g1 = grid(f);
  // the beach's second pixel is the field two from the water since #a-beach-climbs-like-the-base-games (it was RAMP[1], 97)
  ok(g1[(y0 + 2) * W + (x0 - 1)] === RAMP[0] && g1[(y0 + 2) * W + (x0 - 2)] === relief(x0 - 2, y0 + 2, 2), "precondition: the land built a beach facing the pocket while it was water", [g1[(y0 + 2) * W + (x0 - 1)], g1[(y0 + 2) * W + (x0 - 2)]]);
  const oldWall = best.mx - RAMP[1];
  console.log("     pocket at x " + x0 + " y " + y0 + "; the field on its ring reaches " + best.mx + " — the old writer's wall against the 97 beach: " + oldWall);
  ok(oldWall > 2 * S, "precondition: without the cap this fixture stands a wall of more than 2·S (the back-out must bite)", { oldWall, S });

  retype(f, 3, "land");
  const r = raise(f, [3]);
  const g2 = grid(f);
  const isLand = (id) => id === 2 || id === 3;
  const ex = expected(f, g1, isLand, new Set([3]));
  let moved = 0, outside = 0, under = 0, mism = 0, firstMism = null, upStep = 0, inStep = 0, fieldStep = 0, atField = 0, standingMoved = 0;
  for (let i = 0; i < W * H; i++) {
    if (g2[i] !== g1[i]) { moved++; if (!ex.inD[i]) outside++; if (g1[i] > SEA_LEVEL && idAt(i % W, (i - (i % W)) / W) === 2) standingMoved++; }
    if (ex.inD[i]) {
      if (g2[i] <= SEA_LEVEL && idAt(i % W, (i - (i % W)) / W) === 3) under++;
      if (g2[i] !== ex.want.get(i)) { mism++; if (!firstMism) firstMism = { x: i % W, y: (i - (i % W)) / W, got: g2[i], want: ex.want.get(i) }; }
      const x = i % W, y = (i - x) / W;
      if (ex.depth[i] === 0 && inPocket(x, y) && g2[i] === ex.relief(x, y, 0)) atField++;
      for (const [dx, dy] of STEP4) {
        const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const j = b * W + a; if (!isLand(idAt(a, b))) continue;
        if (!ex.inD[j]) upStep = Math.max(upStep, g2[i] - g2[j]);
        else { inStep = Math.max(inStep, Math.abs(g2[i] - g2[j])); fieldStep = Math.max(fieldStep, Math.abs(ex.relief(x, y, 0) - ex.relief(a, b, 0))); }
      }
    }
  }
  console.log("     moved " + moved + " px; highest it stands above the land beside it " + upStep + "; largest step inside " + inStep + " (the field's own " + fieldStep + ")");
  ok(under === 0, "every pixel of the filled sea is above the waterline", under);
  ok(upStep <= S, "⭐⭐⭐ no pixel the fill wrote stands more than S above the land that stays beside it — the Shagrei wall", { upStep, S, oldWall });
  ok(inStep <= Math.max(S, fieldStep), "⭐⭐ …and no step inside what it wrote is steeper than S or the field's own", { inStep, S, fieldStep });
  ok(outside === 0, "⭐⭐ nothing outside the raise's own domain moved", outside);
  ok(standingMoved === 0, "⭐⭐ …so the town's own ground that stood above the waterline keeps every height — the cap reads it, never writes it", standingMoved);
  ok(mism === 0, "⭐⭐ every pixel is the known answer: the field, under the cap from the land around it", { mism, firstMism });
  ok(atField > 0, "⭐ …a bound, not a flattening: the middle of the filled sea still takes the field", atField);
  ok(r.pixels === moved, "the writer reports the pixels that moved, capped ones included", { reported: r.pixels, moved });
  ok(g2[64 * W + LX0] === RAMP[0] && g2[64 * W + LX0 + 1] === relief(LX0 + 1, 64, 2), "the open coast still steps 94 then the field two from the water", [g2[64 * W + LX0], g2[64 * W + LX0 + 1]]);
  const hp = path.join(f.d, "map", "heightmap.bmp"), b0 = fs.readFileSync(hp), mt = fs.statSync(hp).mtimeMs;
  const again = raise(f, [2, 3]);
  ok(again.changed === false && Buffer.compare(b0, fs.readFileSync(hp)) === 0 && fs.statSync(hp).mtimeMs === mt, "⭐⭐ a second raise settles: nothing to write (#a-second-raise-must-not-re-cut-the-coast)", { changed: again.changed, pixels: again.pixels });
}

// ── ⛔ 2. a second Generate land beside an earlier one: the OLD land's beach ring must not stand a wall ────────────────────────
console.log("\n=== ⛔ 2. new land raised against an older coast meets it within S per pixel ===");
{
  const W = 512, H = 128;
  const relief = md.heightmapReliefField(W);
  // the old coast where the field (at the depth the new land gives it) is highest
  let bx = -1, bv = -1;
  for (let x = 40; x <= 300; x += 4) { let mx = 0; for (let y = 10; y < H - 10; y++) mx = Math.max(mx, relief(x, y, 81)); if (mx > bv) { bv = mx; bx = x; } }
  const A0 = bx - 40, A1 = bx, B1 = bx + 81;
  const idAt = (x, y) => (y < 6 || y >= H - 6 ? 1 : x >= A0 && x <= A1 ? 4 : x > A1 && x <= B1 ? 5 : 1);
  const f = makeMod(W, H, idAt, [1, 4, 5], "second");
  retype(f, 4, "land");
  raise(f, [4]);
  const g1 = grid(f);
  const oldWall = bv - RAMP[1];
  ok(oldWall > 2 * S, "precondition: the field the old coast's 94 ring would take stands more than 2·S over its 97", { oldWall, bx });
  retype(f, 5, "land");
  raise(f, [5]);
  const g2 = grid(f);
  let upStep = 0, oldMoved = 0, oldHighMoved = 0;
  for (let y = 0; y < H; y++) for (let x = A0; x <= A1; x++) {
    const i = y * W + x; if (idAt(x, y) !== 4) continue;
    if (g2[i] !== g1[i]) { oldMoved++; if (g1[i] > SEA_LEVEL) oldHighMoved++; }
    for (const [dx, dy] of STEP4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H) continue; const j = b * W + a; if (idAt(a, b) === 1) continue; if (g2[j] !== g1[j] && g2[i] === g1[i]) upStep = Math.max(upStep, g2[j] - g2[i]); }
  }
  console.log("     old coast at x " + A1 + "; old-land pixels re-settled " + oldMoved + "; highest a moved pixel stands over unmoved old land " + upStep);
  ok(oldMoved > 0, "precondition: the old coast's ring under the waterline was re-settled", oldMoved);
  ok(oldHighMoved === 0, "the old land standing above the waterline keeps every height", oldHighMoved);
  ok(upStep <= S, "⭐⭐⭐ the old beach ring rises no more than S above the old ramp beside it", { upStep, S, oldWall });
  ok(g2[64 * W + B1] === RAMP[0] && g2[64 * W + B1 - 1] === relief(B1 - 1, 64, 2), "the new coast still steps 94 then the field two from the water", [g2[64 * W + B1], g2[64 * W + B1 - 1]]);
}

// ── ⛔ 3. a raise with no land beside it is exactly the field — Generate land after Delete map is untouched ─────────────────
console.log("\n=== ⛔ 3. on a blank canvas the cap changes nothing, even where the field itself is steeper than S ===");
{
  // the full map width, so the field reaches the heights it reaches on a real map and its own coast seam is steeper than S
  const W = 5632, H = 40;
  const idAt = (x, y) => (y >= 4 && y < H - 4 ? 7 : 1);
  const f = makeMod(W, H, idAt, [1, 7], "blank");
  retype(f, 7, "land");
  raise(f, [7]);
  const g = grid(f);
  const ex = expected(f, new Uint8Array(W * H).fill(89), (id) => id === 7, new Set([7]));
  let selfStep = 0; for (const k of ex.domain) { const x = k % W; if (x + 1 < W && ex.inD[k + 1]) selfStep = Math.max(selfStep, Math.abs(ex.want.get(k) - ex.want.get(k + 1))); if (ex.inD[k + W]) selfStep = Math.max(selfStep, Math.abs(ex.want.get(k) - ex.want.get(k + W))); }
  ok(selfStep > S, "precondition: the field itself steps more than S somewhere here (a cap read off the raise's own pixels would show)", { selfStep, S });
  let m0 = 0, first0 = null; for (const k of ex.domain) if (g[k] !== ex.want.get(k)) { m0++; if (!first0) first0 = { x: k % W, y: (k - (k % W)) / W, got: g[k], want: ex.want.get(k) }; }
  ok(m0 === 0, "⭐⭐ land raised with no land beside it is exactly the ramp and the field — nothing is capped by the raise's own pixels", { m0, first0, of: ex.domain.length });
}

// ── 🈯 4. the base game: every one of its lakes turned to land ─────────────────────────────────────────────────────────────────
console.log("\n=== 🈯 4. vanilla's lakes turned to land stand within S of their shores ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), dp = path.join(GAME, "map", "definition.csv"), pp = path.join(GAME, "map", "provinces.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(dp) || !fs.existsSync(pp)) ok(false, "vanilla's lakes turned to land: the base game is not installed, so this check cannot run", GAME);
  else {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rim-lakes-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RIMLAKES"\n');
    const lakes = [];
    const rows = fs.readFileSync(dp, "utf8").split(/\r?\n/).map((l) => { const c = l.split(";"); if (c.length >= 8 && c[4].trim().toLowerCase() === "lake") { lakes.push(parseInt(c[0], 10)); return c.map((v, i) => (i === 4 ? "land" : i === 6 ? "plains" : v)).join(";"); } return l; });
    fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n"));
    const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceIds: lakes, raise: true });
    ok(r.changed === true && lakes.length > 0, "the base game's lakes were raised", { lakes: lakes.length, pixels: r.pixels });
    const van = fs.readFileSync(hp), mine = fs.readFileSync(path.join(d, "map", "heightmap.bmp"));
    const hm = md.readIndexedBmp(van);
    const W = hm.width, H = hm.height;
    // land/lake per pixel from provinces.bmp + the retyped definition
    const pb = fs.readFileSync(pp), off = pb.readUInt32LE(10), prow = Math.floor((24 * W + 31) / 32) * 4;
    const landRgb = new Set(); for (const l of rows) { const c = l.split(";"); if (c.length >= 5 && c[4].trim().toLowerCase() === "land") landRgb.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0); }
    const land = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let o = off + (H - 1 - y) * prow; for (let x = 0; x < W; x++, o += 3) land[y * W + x] = landRgb.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0) ? 1 : 0; }
    let up = 0, at = null, walls = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = hm.pixelOffset(x, y); if (mine[o] === van[o]) continue;
      for (const [dx, dy] of STEP4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H || !land[b * W + a]) continue; const o2 = hm.pixelOffset(a, b); if (mine[o2] !== van[o2]) continue; const s = mine[o] - mine[o2]; if (s > up) { up = s; at = [x, y]; } if (s >= 30) walls++; }
    }
    console.log("     " + lakes.length + " lakes; highest a raised pixel stands over the shore beside it: " + up + " at " + JSON.stringify(at) + "; one-pixel walls of 30+: " + walls);
    ok(up <= S, "⭐⭐⭐ no lake turned to land stands more than S over its shore", { up, at, walls });
  }
}

// ── 🈯 5. S is vanilla's own: the p99 one-pixel step inside its mountain provinces ───────────────────────────────────────────────
console.log("\n=== 🈯 5. S is the base game's mountains' p99 one-pixel step ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), dp = path.join(GAME, "map", "definition.csv"), pp = path.join(GAME, "map", "provinces.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(dp) || !fs.existsSync(pp)) ok(false, "S against the base game's mountains: the base game is not installed, so this check cannot run", GAME);
  else {
    const van = fs.readFileSync(hp), hm = md.readIndexedBmp(van), W = hm.width, H = hm.height;
    const mtn = new Set(); for (const l of fs.readFileSync(dp, "utf8").split(/\r?\n/)) { const c = l.split(";"); if (c.length >= 7 && c[4].trim().toLowerCase() === "land" && c[6].trim().toLowerCase() === "mountain") mtn.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0); }
    const pb = fs.readFileSync(pp), off = pb.readUInt32LE(10), prow = Math.floor((24 * W + 31) / 32) * 4;
    const isM = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let o = off + (H - 1 - y) * prow; for (let x = 0; x < W; x++, o += 3) isM[y * W + x] = mtn.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0) ? 1 : 0; }
    const hist = new Float64Array(256); let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isM[y * W + x]) continue; const h = van[hm.pixelOffset(x, y)];
      if (x + 1 < W && isM[y * W + x + 1]) { hist[Math.abs(h - van[hm.pixelOffset(x + 1, y)])]++; n++; }
      if (y + 1 < H && isM[(y + 1) * W + x]) { hist[Math.abs(h - van[hm.pixelOffset(x, y + 1)])]++; n++; }
    }
    let acc = 0, p99 = -1; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.99 * n) { p99 = v; break; } }
    console.log("     " + n + " mountain pixel pairs; p99 one-pixel step " + p99);
    ok(n > 0 && S === p99, "⭐⭐ HEIGHTMAP_RAISE_RIM_SLOPE is the base game's mountain p99, derived here, not typed", { S, p99, pairs: n });
  }
}

// ── ⛔ 6. land standing BELOW the sea floor beside a fill: the cap never takes a pixel under the curve's floor ───────────────
console.log("\n=== ⛔ 6. a depression deeper than the beach beside a fill: no pixel goes under the waterline ===");
{
  // vanilla ships land pixels at or below 88 (a polder, a depression). Here one stands 20 px wide beside a pocket of sea: the
  // raise reaches 8 px into it (land at or below the waterline) and the 9th is land that stays, at 80.
  const W = 128, H = 48;
  const idAt = (x, y) => (x < 8 || x >= W - 8 || y < 4 || y >= H - 4 ? 1 : (x >= 40 && x < 52 && y >= 18 && y < 30) ? 3 : (x >= 52 && x < 72 && y >= 12 && y < 36) ? 6 : 2);
  const f = makeMod(W, H, idAt, [1, 2, 3, 6], "low");
  retype(f, 2, "land"); retype(f, 6, "land");
  raise(f, [2]);
  setHeights(f, (x, y) => idAt(x, y) === 6, 80);
  const g1 = grid(f);
  retype(f, 3, "land");
  raise(f, [3]);
  const g2 = grid(f);
  const ex = expected(f, g1, (id) => id === 2 || id === 3 || id === 6, new Set([3]));
  let fixedLow = 0; for (let i = 0; i < W * H; i++) if (!ex.inD[i] && idAt(i % W, (i - (i % W)) / W) === 6 && g1[i] < 88 && STEP4.some(([dx, dy]) => { const x = i % W + dx, y = (i - (i % W)) / W + dy; return x >= 0 && y >= 0 && x < W && y < H && ex.inD[y * W + x]; })) fixedLow++;
  ok(fixedLow > 0, "precondition: land below the sea floor stays beside what the raise settles", fixedLow);
  let under = 0, at = null, mism = 0; for (const k of ex.domain) { if (g2[k] <= SEA_LEVEL && (g1[k] <= SEA_LEVEL)) { under++; if (!at) at = [k % W, (k - (k % W)) / W, g2[k]]; } if (g2[k] !== ex.want.get(k)) mism++; }
  ok(under === 0, "⭐⭐ no pixel the raise settles is left at or under the waterline — the cap stops at the curve's floor", { under, at });
  ok(mism === 0, "…and every one is the known answer", mism);
}

// ── ⛔ 7. a lake turned to land whose OWN shore stands above the waterline: the cap reads the target's standing pixels ────────
console.log("\n=== ⛔ 7. a lake whose own shore band stands is filled within S of that band ===");
{
  // Vanilla's lakes carry such a band: 391 of their 50,395 pixels stand above 95 (median 97, p90 102, max 120), in 29 of the
  // 126 lakes, 314 of them on the lake's own rim. Those pixels are the TARGET's, not a land province's, and they stay — the raise
  // only lifts what is at or below the waterline — so they are land beside the domain as much as any neighbour's is.
  const W = 512, H = 128, LX0 = 300, LX1 = 420, LY0 = 8, LY1 = 119, P = 20, BAND = 2, BAND_H = 100;
  const relief = md.heightmapReliefField(W);
  // the lake where the field just inside its band is highest: that is the wall a raise blind to the band stands against it
  let best = null;
  for (let y0 = LY0 + 12; y0 + P <= LY1 - 12; y0 += 2) for (let x0 = LX0 + 12; x0 + P <= LX1 - 12; x0 += 2) {
    let mx = 0;
    for (let y = y0 + BAND; y < y0 + P - BAND; y++) for (let x = x0 + BAND; x < x0 + P - BAND; x++) {
      if (x === x0 + BAND || x === x0 + P - BAND - 1 || y === y0 + BAND || y === y0 + P - BAND - 1) mx = Math.max(mx, relief(x, y, 0));
    }
    if (!best || mx > best.mx) best = { x0, y0, mx };
  }
  const { x0, y0 } = best;
  const inLake = (x, y) => x >= x0 && x < x0 + P && y >= y0 && y < y0 + P;
  const inBand = (x, y) => inLake(x, y) && (x < x0 + BAND || x >= x0 + P - BAND || y < y0 + BAND || y >= y0 + P - BAND);
  const idAt = (x, y) => (x >= LX0 && x <= LX1 && y >= LY0 && y <= LY1 ? (inLake(x, y) ? 3 : 2) : 1);
  const f = makeMod(W, H, idAt, [1, 2, 3], "band");
  retype(f, 2, "land"); retype(f, 3, "lake");
  raise(f, [2]);
  setHeights(f, inBand, BAND_H);
  const g1 = grid(f);
  const oldWall = best.mx - BAND_H;
  console.log("     lake at x " + x0 + " y " + y0 + "; the field just inside its band reaches " + best.mx + " — a wall of " + oldWall + " over the band's " + BAND_H);
  ok(oldWall > 2 * S, "precondition: a raise that does not read the lake's own band stands a wall of more than 2·S against it", { oldWall, S });
  retype(f, 3, "land");
  raise(f, [3]);
  const g2 = grid(f);
  const ex = expected(f, g1, (id) => id === 2 || id === 3, new Set([3]));
  let up = 0, upAt = null, bandMoved = 0, inner = 0, mism = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (inBand(x, y) && g2[i] !== g1[i]) bandMoved++;
    if (!inLake(x, y) || inBand(x, y)) continue;
    inner++;
    if (g2[i] !== ex.want.get(i)) mism++;
    if (g2[i] === g1[i]) continue;
    for (const [dx, dy] of STEP4) { const j = (y + dy) * W + x + dx; if (g2[j] === g1[j] && g2[i] - g2[j] > up) { up = g2[i] - g2[j]; upAt = [x, y, g2[i], g2[j]]; } }
  }
  console.log("     " + inner + " px inside the band raised; highest one stands over the unmoved band beside it: " + up);
  ok(bandMoved === 0, "the lake's own standing band keeps its heights", bandMoved);
  ok(up <= S, "⭐⭐⭐ no pixel of the filled lake stands more than S above its own shore — the target's standing pixels are land beside the domain", { up, upAt, S, oldWall });
  ok(mism === 0, "⭐ …and every pixel is the known answer", mism);
}

// ── ⛔ 8. an inlet of the sea filled between banks that climb: the fill stands within S BELOW them as well ─────────────────────
console.log("\n=== ⛔ 8. a fjord filled between climbing banks stands no more than S below them either ===");
{
  // The banks climb G a pixel inland from a coast at the beach's own top (G = S/2: steep, and inside the base game's mountains),
  // and the inlet stays open to the sea at its mouth, so the fill takes the beach and then the relief fading in — under banks
  // that stand higher every pixel. At the mouth the beach's 94 meets a bank already at 103, more than S over it; at the head the
  // bank across the end stands G over the banks along the sides, so its corners have two shores and must take the higher.
  const W = 512, H = 128, LX0 = 300, LX1 = 420, LY0 = 8, LY1 = 119, FL = 30, FW = 6, G = S / 2;
  const bank = (x) => RAMP[RAMP.length - 1] + G * (x - LX0);
  const relief = md.heightmapReliefField(W);
  // the inlet where the old writer's step down from its banks is tallest: bank − field along the two rows beside them
  let best = null;
  for (let y0 = LY0 + 12; y0 + FW <= LY1 - 12; y0 += 2) {
    let mx = 0;
    for (let k = 0; k < FL; k++) { const x = LX0 + k, d = k + 1; for (const y of [y0, y0 + FW - 1]) mx = Math.max(mx, bank(x) - relief(x, y, d)); }
    if (!best || mx > best.mx) best = { y0, mx };
  }
  const fy0 = best.y0;
  const inInlet = (x, y) => x >= LX0 && x < LX0 + FL && y >= fy0 && y < fy0 + FW;
  const idAt = (x, y) => (x >= LX0 && x <= LX1 && y >= LY0 && y <= LY1 ? (inInlet(x, y) ? 3 : 2) : 1);
  const f = makeMod(W, H, idAt, [1, 2, 3], "fjord");
  retype(f, 2, "land");
  paint(f, (x, y) => (idAt(x, y) === 2 ? bank(x) : null));
  const g1 = grid(f);
  retype(f, 3, "land");
  const r = raise(f, [3]);
  const g2 = grid(f);
  const ex = expected(f, g1, (id) => id === 2 || id === 3, new Set([3]));
  let oldDown = 0, down = 0, downAt = null, up = 0, inStep = 0, fieldStep = 0, mism = 0, firstMism = null, lifted = 0, atField = 0, moved = 0;
  for (const i of ex.domain) {
    const x = i % W, y = (i - x) / W;
    if (g2[i] !== ex.want.get(i)) { mism++; if (!firstMism) firstMism = { x, y, got: g2[i], want: ex.want.get(i) }; }
    if (g2[i] > ex.capped.get(i)) lifted++;
    if (g2[i] === ex.field.get(i)) atField++;
    if (g2[i] !== g1[i]) moved++;
    for (const [dx, dy] of STEP4) {
      const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const j = b * W + a;
      if (ex.inD[j]) { inStep = Math.max(inStep, Math.abs(g2[i] - g2[j])); fieldStep = Math.max(fieldStep, Math.abs(ex.field.get(i) - ex.field.get(j))); continue; }
      if (ex.kind[j] === 0) continue;   // the sea at the mouth
      oldDown = Math.max(oldDown, g1[j] - ex.capped.get(i));
      if (g2[j] - g2[i] > down) { down = g2[j] - g2[i]; downAt = [x, y, g2[i], g2[j]]; }
      up = Math.max(up, g2[i] - g2[j]);
    }
  }
  let outside = 0, bankMoved = 0;
  for (let i = 0; i < W * H; i++) if (g2[i] !== g1[i]) { if (!ex.inD[i]) outside++; if (idAt(i % W, (i - (i % W)) / W) === 2) bankMoved++; }
  console.log("     inlet at y " + fy0 + "; under the cap alone the fill stood " + oldDown + " below its banks; now " + down + " (" + lifted + " px lifted), " + up + " over them; largest step inside " + inStep + " (the field's own " + fieldStep + ")");
  ok(bank(LX0 + FL) < 255, "precondition: the bank across the head still fits a height byte", bank(LX0 + FL));
  ok(oldDown > 2 * S, "precondition: under the cap alone the fill stands more than 2·S below its banks (the back-out must bite)", { oldDown, S });
  ok(bank(LX0) - RAMP[0] > S, "precondition: at the mouth the bank stands more than S over the beach's 94", { bank: bank(LX0), beach: RAMP[0], S });
  ok(down <= S, "⭐⭐⭐ no pixel the fill wrote stands more than S below the bank beside it — the valley lake's wall", { down, downAt, S, oldDown });
  ok(up <= S, "⭐⭐ …nor more than S above it", { up, S });
  ok(inStep <= Math.max(S, fieldStep), "⭐⭐ …and no step inside what it wrote is steeper than S or the field's own: the lift reaches past the first ring", { inStep, S, fieldStep });
  ok(g2[fy0 * W + LX0] === bank(LX0) - S && g2[(fy0 + 2) * W + LX0] === RAMP[0], "⭐ the beach at the mouth rises to S under the bank beside it, and keeps its 94 away from it", [g2[fy0 * W + LX0], g2[(fy0 + 2) * W + LX0]]);
  ok(outside === 0 && bankMoved === 0, "⭐⭐ nothing outside the raise's domain moved — the banks keep every height", { outside, bankMoved });
  ok(mism === 0, "⭐⭐ every pixel is the known answer: the field, lifted from the banks, under the cap", { mism, firstMism });
  ok(atField > 0, "⭐ …a bound, not a fill: some of the inlet still takes the field", atField);
  ok(r.pixels === moved, "the writer reports the pixels that moved, lifted ones included", { reported: r.pixels, moved });
  const hp = path.join(f.d, "map", "heightmap.bmp"), b0 = fs.readFileSync(hp), mt = fs.statSync(hp).mtimeMs;
  const again = raise(f, [3]);
  ok(again.changed === false && Buffer.compare(b0, fs.readFileSync(hp)) === 0 && fs.statSync(hp).mtimeMs === mt, "⭐⭐ a second raise settles — the mouth's lifted beach is the same beach the second time", { changed: again.changed, pixels: again.pixels });
}

// ── ⛔ 9. a lake between a low shore and a high one: where no height meets both, the cap wins ───────────────────────────────────
console.log("\n=== ⛔ 9. a lake between a low shore and a high one: where no height meets both, the cap wins ===");
{
  // Where the land on two sides of the domain disagrees by more than S a step across it, no height stands within S of both. A
  // raise must never stand over land — that is the wall the cap exists for — so the lifts go in first and the cap has the last
  // word: every pixel between the shores stands at its cap, and the high shore keeps the rest, (HIGH − LOW) − S·width, the least
  // any fill under the cap can leave it.
  const W = 512, H = 128, LX0 = 300, LX1 = 420, LY0 = 8, LY1 = 119, LW = 3, LH = 30, LOW = FLOOR, HIGH = FLOOR + S * (LW + 3);
  const relief = md.heightmapReliefField(W);
  // the lake where the field is lowest, so the fill under the cap alone stands below its cap (the lift's back-out must bite)
  let best = null;
  for (let y0 = LY0 + 12; y0 + LH <= LY1 - 12; y0 += 2) for (let x0 = LX0 + 12; x0 + LW <= LX1 - 12; x0 += 2) {
    let mn = Infinity; for (let y = y0; y < y0 + LH; y++) for (let x = x0; x < x0 + LW; x++) mn = Math.min(mn, relief(x, y, 0));
    if (!best || mn < best.mn) best = { x0, y0, mn };
  }
  const { x0, y0 } = best;
  const inLake = (x, y) => x >= x0 && x < x0 + LW && y >= y0 && y < y0 + LH;
  const idAt = (x, y) => (x >= LX0 && x <= LX1 && y >= LY0 && y <= LY1 ? (inLake(x, y) ? 3 : 2) : 1);
  const f = makeMod(W, H, idAt, [1, 2, 3], "shores");
  retype(f, 2, "land"); retype(f, 3, "lake");
  paint(f, (x, y) => (idAt(x, y) === 2 ? (x < x0 + LW ? LOW : HIGH) : null));
  const g1 = grid(f);
  retype(f, 3, "land");
  raise(f, [3]);
  const g2 = grid(f);
  const ex = expected(f, g1, (id) => id === 2 || id === 3, new Set([3]));
  // the rows the lake's two ends cannot reach: beside each pixel there the land is the low shore to the west, the high one east
  const mid = []; for (let y = y0 + LW + 1; y < y0 + LH - LW - 1; y++) for (let x = x0; x < x0 + LW; x++) mid.push(y * W + x);
  let conflict = 0, under = 0, offCap = 0, firstOff = null, down = 0, oldDown = 0, up = 0, upAt = null, mism = 0;
  for (const i of mid) {
    const x = i % W, c = x - x0;
    if (ex.lift.get(i) > ex.limOf(i)) conflict++;
    if (ex.capped.get(i) < ex.limOf(i)) under++;
    if (g2[i] !== Math.max(LOW + S * (c + 1), FLOOR)) { offCap++; if (!firstOff) firstOff = { x, y: (i - x) / W, got: g2[i], want: LOW + S * (c + 1) }; }
    if (c === LW - 1) { down = Math.max(down, g2[i + 1] - g2[i]); oldDown = Math.max(oldDown, g1[i + 1] - ex.capped.get(i)); }
  }
  for (const i of ex.domain) {
    if (g2[i] !== ex.want.get(i)) mism++;
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of STEP4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H) continue; const j = b * W + a; if (!ex.inD[j] && ex.kind[j] !== 0 && g2[i] - g2[j] > up) { up = g2[i] - g2[j]; upAt = [x, y, g2[i], g2[j]]; } }
  }
  console.log("     lake at x " + x0 + " y " + y0 + " between shores at " + LOW + " and " + HIGH + "; the high shore stands " + down + " over the fill (under the cap alone " + oldDown + "); highest the fill stands over any shore " + up);
  ok(HIGH - LOW > S * (LW + 1), "precondition: the shores disagree by more than S a step across the lake", { HIGH, LOW, LW, S });
  ok(conflict === mid.length, "precondition: so between them every lift stands over its cap", { conflict, of: mid.length });
  ok(under > 0, "precondition: under the cap alone the fill stands below its cap somewhere (the lift's back-out must bite)", under);
  ok(up <= S, "⭐⭐⭐ no pixel of the filled lake stands more than S over the land beside it — the cap wins", { up, upAt, S });
  ok(offCap === 0, "⭐⭐ every pixel between the shores stands AT its cap, S a step from the low shore: the lift takes all the cap leaves", { offCap, firstOff });
  ok(down === HIGH - LOW - S * LW, "⭐⭐ …so the high shore stands (HIGH − LOW) − S·width over the fill beside it, and no more", { down, want: HIGH - LOW - S * LW, oldDown });
  ok(mism === 0, "⭐ every pixel is the known answer", mism);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== a raise stands on the land around it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((l) => console.log("   FAILED: " + l));
process.exit(fails.length ? 1 : 0);
