// ⛔ #a-factory-stands-off-the-shallow-ring, #a-small-states-models-are-spread-over-its-land — RULES OF THE ROW PLACERS THAT NO OTHER
// TEST ASKS, each where it decides: the review of wave 6 (F5) backed the first three out and the related suite stayed green; the
// fourth's three are the pile fix's own, which its fixtures did not reach either.
//
//   1. shoreFreeAround: a row off the map is not water — a pixel at the map's top or bottom edge of an all-land map is off the shore
//      (the game draws no water past the edge). Backed out to "off the map is water", every edge pixel read as shore.
//   2. buildingSpreadPositions on a state too thin for its rings (fewer than BUILDING_SPREAD_LEAST positions, so the town points make
//      up the number): every position whose 3x3 is not off the shore is still marked `shore`, so the factories go round it. Backed
//      out (the second pass not told which pixels are land), the thin state's positions read as dry.
//   3. provinceSiteSpots over several provinces (`pids`, the call siteSpotRows makes for a state's own rows): a model is judged by the
//      STATE'S land, so it may stand across the border of two of its provinces — the base game's anti-air guns do on 47% of rows.
//      Backed out (the pixels off the province under the point counted there too), no gun crossed the border: each was pushed off it.
//   4. #a-pile-spreads-over-its-dry-land — a pile's factory that no strict spot took, asked again `loose`: (a) for a step on no shore
//      pixel it takes no shore pixel, even with every other pixel taken (backed out, a shore pixel); (b) it is ranked by its model's
//      pixels off the state's land before its spacing (backed out, a spot 2 px from the rows whose model is over the sea); (c) siteSpotRows
//      stands it on the runway's block only where its step is on it (backed out, a factory under the runway with its step off it).
// Pure calls on in-memory fixtures. Binds no port. Run: node test-a-shore-and-province-rule-holds-where-it-is-rarely-asked.js
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
/** an in-memory map: rectangles [x0, y0, x1, y1) of land provinces (rows top-down) on a sea, province 1 */
function world(W, H, RECT) {
  const SEA = 1;
  const pidAt = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return -1; for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
  const box = new Map(Object.entries(RECT).map(([id, [x0, y0, x1, y1]]) => [+id, { minX: x0, maxX: x1 - 1, minY: y0, maxY: y1 - 1 }]));
  return { ex: { W, H, pidAt, box }, isLand: (p) => p > 1 };
}
const zOf = (H, row) => md.pixelYToBuildingZ(H, row);

console.log("\n=== 1. a row off the map is not water ===");
{
  const W = 12, H = 8;
  const { ex, isLand } = world(W, H, { 2: [0, 0, W, H] });                // all land, edge to edge
  const at = { W, H, pidAt: ex.pidAt, isLand };
  ok(md.shoreFreeAround(at, 5, 0) && md.shoreFreeAround(at, 5, H - 1) && md.shoreFreeAround(at, 5, 1), "⭐⭐ on an all-land map the top and bottom rows' pixels are off the shore — past the edge is not water");
  const { ex: ex2, isLand: isLand2 } = world(W, H, { 2: [0, 0, W, H - 2] });   // two rows of sea along the bottom
  ok(!md.shoreFreeAround({ W, H, pidAt: ex2.pidAt, isLand: isLand2 }, 5, H - 4), "(CONTROL: a pixel 2 rows from the sea is on the shore)");
}

console.log("\n=== 2. a thin state's positions are marked on the shore, the second pass's too ===");
{
  // two provinces in a strip 3 px tall, 7 px each: its rings give one position, so the town points make up the number
  const W = 20, H = 12, RECT = { 2: [1, 5, 8, 8], 3: [8, 5, 15, 8] };
  const { ex, isLand } = world(W, H, RECT);
  const ownLand = (p) => p === 2 || p === 3;
  const townPoints = new Map([[2, { x: 4.5, z: zOf(H, 6) + 0.5 }], [3, { x: 11.5, z: zOf(H, 6) + 0.5 }]]);
  const P = md.buildingSpreadPositions({ ex, provinces: [2, 3], home: 2, townPoints, ownLand, isLand });
  const onTown = P.some((p) => Math.floor(p.x) === 11 && md.buildingZToPixelY(H, p.z) === 6);
  ok(P.length >= 2 && onTown, `(the fixture: ${P.length} positions, one on the neighbour's town point — the second pass ran)`, P);
  const wet = P.filter((p) => !md.shoreFreeAround({ W, H, pidAt: ex.pidAt, isLand }, Math.floor(p.x), md.buildingZToPixelY(H, p.z)));
  ok(wet.length === P.length, "(the fixture: every pixel of a strip 3 px tall is on the shore)", wet.length);
  ok(wet.every((p) => p.shore === true), "⭐⭐ every position on the shore is marked so — the ones the second pass took too", P);
}

console.log("\n=== 3. over several provinces a model is judged by the state's land, not by its province ===");
{
  // two provinces of one state side by side, its town on their border; twelve anti-air rows round it
  const W = 40, H = 20, RECT = { 2: [5, 5, 15, 15], 3: [15, 5, 25, 15] };
  const { ex } = world(W, H, RECT);
  const ownLand = (p) => p === 2 || p === 3;
  const R = md.LAND_ROW_REACH.anti_air_building;
  const spots = md.provinceSiteSpots({ ex, pids: [2, 3], town: { x: 15, z: zOf(H, 10) + 0.5 }, ownLand, kept: [], runways: [], reaches: new Array(12).fill(R) });
  ok(spots.length === 12 && spots.every(Boolean), `(the fixture: ${spots.length} spots for 12 rows)`, spots);
  const across = spots.filter(Boolean).filter((s) => { const b = { c0: Math.floor(s.x - R.west), c1: Math.ceil(s.x + R.east) - 1 }; return b.c0 < 15 && b.c1 >= 15; });
  const offLand = spots.filter(Boolean).filter((s) => { const Y = H - s.z; for (let r = Math.floor(Y - R.north); r <= Math.ceil(Y + R.south) - 1; r++) for (let x = Math.floor(s.x - R.west); x <= Math.ceil(s.x + R.east) - 1; x++) if (!ownLand(ex.pidAt(x, r))) return true; return false; });
  ok(!offLand.length, "every gun's model on the state's land", offLand);
  ok(across.length >= 1, `⭐⭐ ${across.length} of the 12 guns stand across the border of the state's two provinces — the province under the point is not asked`, spots);
}

// ⛔ #a-pile-spreads-over-its-dry-land — provinceSiteSpots' `loose` (a pile's factory with no strict spot) and siteSpotRows' asking
// it: three of its rules the pile fixtures (test-a-factorys-copy-stands-on-a-spot-of-its-own.js) do not reach, each backed out in turn
console.log("\n=== 4. a pile's factory with no spot of its own: the loose rules ===");
{
  const AF = md.LAND_ROW_REACH.arms_factory, AA = md.LAND_ROW_REACH.anti_air_building;
  const blockOff = (ex, ownLand, H, s, R) => { const Y = H - s.z; let n = 0; for (let r = Math.floor(Y - R.north); r <= Math.ceil(Y + R.south) - 1; r++) for (let x = Math.floor(s.x - R.west); x <= Math.ceil(s.x + R.east) - 1; x++) if (!ownLand(ex.pidAt(x, r))) n++; return n; };
  const gapTo = (H, kept, x, r) => kept.reduce((m, k) => Math.min(m, Math.max(Math.abs(Math.floor(k.x) - x), Math.abs(md.buildingZToPixelY(H, k.z) - r))), Infinity);
  // 4a. a step on no shore pixel and with no 3x3 of the state's own (a neighbour's land beside it): every pixel off the shore taken, a
  //     loose spot is not on the shore either
  {
    const W = 20, H = 12, RECT = { 2: [2, 2, 10, 10], 3: [10, 2, 14, 10] };   // the state's province 2, a neighbour's 3 east of it
    const { ex, isLand } = world(W, H, RECT);
    const ownLand = (p) => p === 2;
    const shoreAt = (x, r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isLand(ex.pidAt(x + dx, r + dy)));
    const kept = [];
    for (let r = 2; r < 10; r++) for (let x = 2; x < 10; x++) if (!shoreAt(x, r)) kept.push({ x, z: zOf(H, r) });
    const step = { x: 9, z: zOf(H, 5) };
    const ask = (st) => md.provinceSiteSpots({ ex, pids: [2], town: { x: 5, z: zOf(H, 5) }, ownLand, kept, runways: [], reaches: [AF], isLand, modes: [{ strict: true, loose: true, step: st }] })[0];
    const onShore = (s) => !!s && shoreAt(Math.floor(s.x), md.buildingZToPixelY(H, s.z));
    const ctl = ask({ x: 2, z: zOf(H, 5) });
    ok(!shoreAt(9, 5) && ownLand(ex.pidAt(9, 5)) && ex.pidAt(10, 5) === 3 && onShore(ctl), "(CONTROL: the step is on no shore pixel, its 3x3 reaches the neighbour; a step ON the shore is given a shore pixel)", ctl);
    const got = ask(step);
    ok(!onShore(got), "⭐⭐ a loose spot for a step off the shore is on no shore pixel — no spot rather than one (backed out, a shore pixel)", got);
  }
  // 4b. ranked by its model's pixels off the state's land before its spacing: a spot a pixel from the rows whose model is on the land,
  //     not one 2 px from them whose model is over the sea
  {
    const W = 20, H = 18, RECT = { 2: [2, 2, 14, 14] };
    const { ex, isLand } = world(W, H, RECT);
    const ownLand = (p) => p === 2;
    const P = { x: 8, r: 6 };
    const kept = [];
    for (let r = 3; r <= 10; r++) for (let x = 5; x <= 11; x++) if (!(x === P.x && r === P.r)) kept.push({ x, z: zOf(H, r) });
    const got = md.provinceSiteSpots({ ex, pids: [2], town: { x: 8, z: zOf(H, 8) }, ownLand, kept, runways: [], reaches: [AA], isLand, modes: [{ strict: true, loose: true, step: { x: 8, z: zOf(H, 8) } }] })[0];
    const shoreAt = (x, r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isLand(ex.pidAt(x + dx, r + dy)));
    let spaced = 0;
    for (let r = 2; r < 14; r++) for (let x = 2; x < 14; x++) if (gapTo(H, kept, x, r) >= 2 && !shoreAt(x, r)) spaced++;
    const spacedOnLand = (() => { for (let r = 2; r < 14; r++) for (let x = 2; x < 14; x++) if (gapTo(H, kept, x, r) >= 2 && blockOff(ex, ownLand, H, { x, z: zOf(H, r) }, AA) === 0) return true; return false; })();
    ok(spaced > 0 && !spacedOnLand && gapTo(H, kept, P.x, P.r) === 1 && blockOff(ex, ownLand, H, { x: P.x, z: zOf(H, P.r) }, AA) === 0, `(CONTROL: ${spaced} pixels off the shore 2 px or more from every row, and none of them nor any other so spaced with its model on the land; one a pixel from them with its model on it)`);
    ok(!!got && Math.floor(got.x) === P.x && md.buildingZToPixelY(H, got.z) === P.r, "⭐⭐ the loose spot is that one, its model on the state's land (backed out, spacing first: a spot whose model is over the sea)", got);
  }
  // 4c. siteSpotRows: a pile's factory whose step is off the runway's block is not stood on it, the off-runway land all taken; one
  //     whose step is on it is (the pile its runway stands over, the Dutch capital's)
  {
    const W = 16, H = 10, RECT = { 2: [2, 2, 12, 8] };
    const { ex, isLand } = world(W, H, RECT);
    const ownLand = (p) => p === 2;
    const runway = { c0: 7, c1: 11, r0: 3, r1: 6 };
    const kept = [];
    for (let r = 2; r < 8; r++) for (let x = 2; x <= 5; x++) kept.push({ x, z: zOf(H, r) });
    const pos = { ex, ownLand, typeOf: (p) => (p > 1 ? "land" : "sea"), x: 3, z: zOf(H, 3), home: 2, reach: md.AIRFIELD_REACH, buildingRules: () => null };
    const ask = (fb) => { const w = { type: "industrial_complex", k: 0, n: 0, fb, mode: "strict", pile: true }; return md.siteSpotRows({ modRoot: "", gameRoot: "", pos, provinces: [2], runway, wanted: [w], kept }).get(w); };
    const onRw = (s) => !!s && Math.floor(s.x) >= runway.c0 - 1 && Math.floor(s.x) <= runway.c1 + 1 && md.buildingZToPixelY(H, s.z) >= runway.r0 - 1 && md.buildingZToPixelY(H, s.z) <= runway.r1 + 1;
    const ctl = ask({ x: 8, z: zOf(H, 4) });
    ok(onRw(ctl), "(CONTROL: a step on the runway's block is given a spot on it)", ctl);
    const got = ask({ x: 4, z: zOf(H, 4) });
    ok(!got, "⭐⭐ a step off the runway's block is given none on it — it keeps its step (backed out, a spot under the runway)", got);
  }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
