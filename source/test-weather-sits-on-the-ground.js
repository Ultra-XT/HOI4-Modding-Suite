// ⛔ #weather-sits-on-the-ground — A WEATHER POSITION STANDS ON THE GROUND UNDER IT, AS EVERY ONE OF THE BASE GAME'S DOES.
//
// map/weatherpositions.txt is `region;x;y;z;size`, and y is a height. Vanilla's rows stand on the ground: its land rows fit
// y = 0.079 + 0.0995 h, 1 of 588 more than 0.5 under it, and its sea rows sit at 9.50, the water. Nova wrote every row at the
// MEDIAN y of the file it started from, so all 732 of TEST 31's stand at 10.10 — 307 of its 530 land rows more than 0.5 under the
// ground (a tenth of them 3.8 or more) and its 202 sea rows 0.60 over the water. And when the ground moved afterwards nothing followed it:
// the re-seat every height write runs read only the 7-column shape of buildings.txt, so it re-seated 0 of those 732 rows.
//
// Pinned here:
//   1. Redraw strategic regions writes every row at modelYForHeight of the heightmap that loads under it — the mod's own over the
//      layer below's, and the layer below's for a mod that ships none — and a row over the sea at 9.50; a heightmap of another size
//      than provinces.bmp is not read at all (each of its two sides on its own), and the rows keep the median, as before;
//   2. a raise moves the rows of the mod's OWN weatherpositions.txt that stand on the ground it raised, and no other byte; an
//      inherited file is not copied in to do it;
//   3. a region created with provinces gets its rows on its first province's own ground, never off a heightmap of another size;
//      one created empty — what the page does — keeps the borrowed row, and does not throw.
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let md = null;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const heightAt = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };
/** the data rows of a weatherpositions.txt: { i, line, region, x, y, z, row } — `row` the pixel row, counted down from the top */
const weatherRows = (file, H) => fs.readFileSync(file, "utf8").split("\n").map((raw, i) => {
  const line = raw.replace(/\r$/, ""), c = line.split(";");
  if (c.length < 5 || !/^\d+$/.test(c[0])) return null;
  return { i, line, region: +c[0], x: Math.floor(+c[1]), y: c[2], z: +c[3], row: H - 1 - Math.floor(+c[3]) };
}).filter(Boolean);
/** the ground of a heightmap of the WRONG size, one height all over: a row read off it shows as this height's y, or NaN */
const WRONG_H = 150;

// the redraw's world (testlib-region-rebuild-world.js) makes the scratch folder and points NOVA_HOME_DIR into it; everything here
// lives under it, app data included, and it goes at the end
const R = makeRegionWorld("weather-ground");
const ROOT = R.ROOT;
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
md = require("./map-data.js");

console.log("\n-- ⭐ 1. Redraw strategic regions stands every row on the ground that loads under it --");
{
  const pb = fs.readFileSync(path.join(R.MOD, "map", "provinces.bmp")), W = pb.readInt32LE(18), H = pb.readInt32LE(22);
  const cell = W / 16;   // the world is 16 provinces wide (testlib-region-rebuild-world.js)
  const provAt = (x, y) => R.idAt(Math.floor(x / cell), Math.floor(y / cell));
  // three copies of the mod as it stands — no heightmap of its own yet — for 1b and 1c below
  const copyOf = (tag) => { const to = path.join(path.dirname(R.MOD), tag); fs.cpSync(R.MOD, to, { recursive: true }); return to; };
  const BELOW = copyOf("no-heightmap"), NARROW = copyOf("narrow-heightmap"), SHORT = copyOf("short-heightmap");
  const OPTS = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };
  // the mod's own ground rises from west to east; the layer below's is one flat height, so a row read off the wrong one shows
  write(R.MOD, "map/heightmap.bmp", bmp8(W, H, (x, y) => (R.modType(provAt(x, y)) === "land" ? 100 + Math.floor((x * 100) / W) : md.HEIGHTMAP_SEA_VALUE)));
  write(R.GAME, "map/heightmap.bmp", bmp8(W, H, (x, y) => (R.baseType(provAt(x, y)) === "land" ? 120 : md.HEIGHTMAP_SEA_VALUE)));
  const baseYs = weatherRows(path.join(R.GAME, "map", "weatherpositions.txt"), H).map((q) => q.y);
  const r = md.rebuildStrategicRegions({ modRoot: R.MOD, gameRoot: R.GAME, dependencyRoots: [], opts: OPTS });
  ok(r && r.ok && (r.writtenFiles || []).includes("map/weatherpositions.txt"), "the redraw was written, weather rows included", r && (r.error || r.writtenFiles));
  const own = heightAt(path.join(R.MOD, "map", "heightmap.bmp")), below = heightAt(path.join(R.GAME, "map", "heightmap.bmp"));
  const rows = weatherRows(path.join(R.MOD, "map", "weatherpositions.txt"), H);
  const want = (q) => md.modelYForHeight(own(q.x, q.row)).toFixed(2);
  const land = rows.filter((q) => R.modType(provAt(q.x, q.row)) === "land"), sea = rows.filter((q) => R.modType(provAt(q.x, q.row)) === "sea");
  const SEA_Y = md.modelYForHeight(md.HEIGHTMAP_SEA_VALUE).toFixed(2);
  ok(land.length >= 4 && sea.length >= 4, `the fixture: ${rows.length} rows, ${land.length} on land and ${sea.length} over the sea`);
  ok(new Set(land.map(want)).size >= 2 && rows.some((q) => !baseYs.includes(want(q))),
    "CONTROL: the ground under the land rows is more than one height, and not the height the file started at — so one y for all, the median, cannot pass", { wants: [...new Set(land.map(want))], started: [...new Set(baseYs)] });
  ok(land.some((q) => md.modelYForHeight(below(q.x, q.row)).toFixed(2) !== want(q)), "CONTROL: under some land row the layer below's ground is another height than the mod's own");
  const off = rows.filter((q) => q.y !== want(q));
  ok(!off.length, "⭐⭐ every row stands on the ground under it, at modelYForHeight of the mod's own heightmap", off.slice(0, 6).map((q) => [q.line, want(q)]));
  ok(sea.every((q) => q.y === SEA_Y), `⭐ every row over the sea stands on the water, ${SEA_Y}`, sea.filter((q) => q.y !== SEA_Y).map((q) => q.line));

  // the y every row took before, and still takes with no heightmap to read: the median of the file the redraw starts from (none of
  // the copies has one, so the layer below's)
  const started = baseYs.map(Number).sort((a, b) => a - b), MEDIAN = started[Math.floor(started.length / 2)].toFixed(2);

  console.log("\n-- ⭐ 1b. …a mod that ships no heightmap stands them on the layer below's, the one the game loads --");
  const rb = md.rebuildStrategicRegions({ modRoot: BELOW, gameRoot: R.GAME, dependencyRoots: [], opts: OPTS });
  ok(rb && rb.ok && (rb.writtenFiles || []).includes("map/weatherpositions.txt") && !fs.existsSync(path.join(BELOW, "map", "heightmap.bmp")),
    "a copy of the mod with no map/heightmap.bmp was redrawn, weather rows included", rb && (rb.error || rb.writtenFiles));
  const rowsB = weatherRows(path.join(BELOW, "map", "weatherpositions.txt"), H), wantB = (q) => md.modelYForHeight(below(q.x, q.row)).toFixed(2);
  ok(rowsB.length === rows.length && new Set(rowsB.map(wantB)).size >= 2 && !rowsB.some((q) => wantB(q) === MEDIAN),
    `CONTROL: under its ${rowsB.length} rows the layer below's ground is more than one height, and never the median ${MEDIAN} — so the median cannot pass`, [...new Set(rowsB.map(wantB))]);
  const offB = rowsB.filter((q) => q.y !== wantB(q));
  ok(!offB.length, "⭐⭐ every row stands on the layer below's ground", offB.slice(0, 6).map((q) => [q.line, wantB(q)]));

  console.log("\n-- ⭐ 1c. …and a heightmap not the size of provinces.bmp is not read: the rows keep the median, as before --");
  const WRONG_Y = md.modelYForHeight(WRONG_H).toFixed(2);
  for (const [mod, w, h, what] of [[NARROW, W / 2, H, "half as wide"], [SHORT, W, H / 2, "half as tall"]]) {
    write(mod, "map/heightmap.bmp", bmp8(w, h, () => WRONG_H));
    const rw = md.rebuildStrategicRegions({ modRoot: mod, gameRoot: R.GAME, dependencyRoots: [], opts: OPTS });
    const rowsW = rw && rw.ok ? weatherRows(path.join(mod, "map", "weatherpositions.txt"), H) : [];
    ok(rowsW.length === rows.length && WRONG_Y !== MEDIAN && rowsW.some((q) => q.x < w && q.row < h),
      `CONTROL: ${what}: the redraw wrote ${rowsW.length} rows, some over the heightmap's own pixels, whose ground (${WRONG_Y}) is not the median`, rw && (rw.error || rw.writtenFiles));
    const offW = rowsW.filter((q) => q.y !== MEDIAN);
    ok(rowsW.length && !offW.length, `⭐ ${what}: every row stands at the median, ${MEDIAN} — none was read off a heightmap of another size`, offW.slice(0, 6).map((q) => q.line));
  }
}

// ── the world for 2 and 3: 8 x 4 provinces of 16 x 16 px. Below: rows 0-2 land at 106, row 3 sea at 89 ────────────────────────
const CELL = 16, COLS = 8, ROWS = 4, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const landBelow = (id) => Math.floor((id - 1) / COLS) < 3;
const centre = (id) => { const c = (id - 1) % COLS, r = Math.floor((id - 1) / COLS); return [c * CELL + 8, r * CELL + 8]; };
const regionOf = (id) => Math.floor(((id - 1) % COLS) / 2) + 1;
const LAND_H = 106;
const game = path.join(ROOT, "game2");
{
  write(game, "hoi4.exe", "");
  write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${landBelow(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(game, "map/definition.csv", rows.join("\n") + "\n");
  write(game, "map/heightmap.bmp", bmp8(W, H, (x, y) => (landBelow(provAt(x, y)) ? LAND_H : md.HEIGHTMAP_SEA_VALUE)));
  write(game, "map/terrain.bmp", bmp8(W, H, (x, y) => (landBelow(provAt(x, y)) ? 0 : 15)));
  write(game, "common/terrain/00_terrain.txt", "categories = {\n\tplains = { color = { 200 200 100 } }\n\tocean = { color = { 0 0 200 } is_water = yes }\n}\nterrain = {\n\tplains = { type = plains color = { 0 } }\n\tocean = { type = ocean color = { 15 } }\n}\n");
  for (let s = 1; s <= 4; s++) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r));
    write(game, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  }
  for (let g = 1; g <= 4; g++) {
    const ids = []; for (let id = 1; id <= COLS * ROWS; id++) if (regionOf(id) === g) ids.push(id);
    write(game, `map/strategicregions/r${g}.txt`, `strategic_region={\n\tid=${g}\n\tname="REGION_${g}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
  }
}
const RAISE = idAt(3, 3), STILL_SEA = idAt(6, 3), ELSEWHERE = idAt(1, 0);
const zOf = (row) => H - 1 - row;
const rowAt = (id, y) => { const [x, row] = centre(id); return `${regionOf(id)};${x}.00;${y};${zOf(row)}.00;small`; };
// a header line, a row over the sea the raise turns to land, a row set off unmoved ground on purpose, and a row over sea that stays
const WEATHER = ["# weather positions, kept by hand", rowAt(RAISE, "9.50"), rowAt(ELSEWHERE, "12.34"), rowAt(STILL_SEA, "9.50"), rowAt(RAISE, "9.50").replace(";small", ";big")];
function makeMod(tag, ownWeather) {
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", `name="${tag}"\n`);
  for (const f of ["provinces.bmp", "definition.csv", "heightmap.bmp", "terrain.bmp"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  if (ownWeather) write(mod, "map/weatherpositions.txt", WEATHER.join("\r\n") + "\r\n");
  return mod;
}

console.log("\n-- ⭐ 2. a raise moves the mod's own weather rows on the ground it raised, and nothing else --");
{
  const mod = makeMod("raise", true);
  const file = path.join(mod, "map", "weatherpositions.txt");
  const before = fs.readFileSync(file, "utf8").split("\n");
  // what the inspector's Type dropdown sends to turn one sea province into land (public/map.js saveProvinceTerrain)
  const r = md.setProvinceDefinition({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: RAISE, type: "land", terrain: "plains", coastal: false, continent: 1 });
  ok(r && r.changed && r.heightmap && r.heightmap.changed, "the sea province " + RAISE + " was raised to land", r && (r.error || r.reason || r.heightmap));
  const hNow = heightAt(path.join(mod, "map", "heightmap.bmp")), [rx, rrow] = centre(RAISE);
  ok(hNow(rx, rrow) > md.HEIGHTMAP_SEA_LEVEL, `CONTROL: the ground rose under the two rows over ${RAISE} (${md.HEIGHTMAP_SEA_VALUE} → ${hNow(rx, rrow)})`);
  const after = fs.readFileSync(file, "utf8").split("\n");
  const want = md.modelYForHeight(hNow(rx, rrow)).toFixed(2);
  const moved = weatherRows(file, H).filter((q) => provAt(q.x, q.row) === RAISE);
  ok(moved.length === 2 && moved.every((q) => q.y === want), `⭐⭐ both rows over the raised province stand on its new ground, ${want}, not on the sea's 9.50`, moved.map((q) => q.line));
  const changedLines = after.map((l, i) => (l === before[i] ? -1 : i)).filter((i) => i >= 0);
  ok(after.length === before.length && changedLines.length === 2 && changedLines.every((i) => moved.some((q) => q.i === i)),
    "⭐ …and every other byte of the file is what it was — the header, the row set 12.34 on purpose, the row over the sea that stayed", changedLines.map((i) => after[i]));
  ok(after.every((l, i) => i === after.length - 1 || l.endsWith("\r")), "…in the file's own CRLF");
  const said = r.heightmap && r.heightmap.models;
  ok(said && said.files && said.files["weatherpositions.txt"] === 2, "the raise says how many weather rows it re-seated", said);

  const inherit = makeMod("inherit", false);
  write(game, "map/weatherpositions.txt", WEATHER.join("\n") + "\n");
  const r2 = md.setProvinceDefinition({ modRoot: inherit, gameRoot: game, dependencyRoots: [], provinceId: RAISE, type: "land", terrain: "plains", coastal: false, continent: 1 });
  ok(r2 && r2.changed && !fs.existsSync(path.join(inherit, "map", "weatherpositions.txt")), "a mod that inherits weatherpositions.txt is not given a copy to re-seat (an edit does not take a file in)", r2 && (r2.error || r2.heightmap));
  fs.rmSync(path.join(game, "map", "weatherpositions.txt"), { force: true });
  // the row re-seat on its own, without the file loop around it: told the game's 5-column shape (region;x;y;z;size, as weatherRows
  // reads it), it moves y in the third column and nothing else — where the 7-column guard it had skipped every weather row
  const one = [rowAt(RAISE, "9.50") + "\r"];
  const n = md.reseatModelRows(one, { W, H, hNow: (x, row) => (provAt(x, row) === RAISE ? LAND_H : md.HEIGHTMAP_SEA_VALUE), mask: new Uint8Array(W * H).fill(1), cols: { minCols: 5, x: 1, y: 2, z: 3 } });
  ok(n === 1 && one[0] === rowAt(RAISE, md.modelYForHeight(LAND_H).toFixed(2)) + "\r", "reseatModelRows reads a weather row by the columns it is given, and keeps its \\r", { n, one });
}

console.log("\n-- ⭐ 3. a new region's rows stand on its own first province; an empty one keeps the borrowed row --");
{
  const mod = makeMod("create", true);
  const file = path.join(mod, "map", "weatherpositions.txt");
  const first = weatherRows(file, H)[0];
  const borrowed = first.line.split(";").slice(1, 4).join(";");
  let empty = null, threw = "";
  try { empty = md.createStrategicRegion({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [] }); } catch (e) { threw = e.message; }
  ok(!threw && empty && empty.ok && empty.weatherPositions && empty.weatherPositions.added.length === 2, "a region created with no provinces does not throw, and gets its two rows", threw || empty);
  const emptyRows = empty ? weatherRows(file, H).filter((q) => q.region === empty.id) : [];
  ok(emptyRows.length === 2 && emptyRows.every((q) => q.line.split(";").slice(1, 4).join(";") === borrowed), `…on the file's first row's place, ${borrowed}, as before: a region with no province has no ground of its own`, emptyRows.map((q) => q.line));

  const P1 = idAt(5, 1), P2 = idAt(2, 2);
  const made = md.createStrategicRegion({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [P1, P2] });
  ok(made && made.ok && made.weatherPositions && made.weatherPositions.added.length === 2, `a region created with provinces ${P1} and ${P2} gets its two rows`, made);
  const madeRows = made ? weatherRows(file, H).filter((q) => q.region === made.id) : [];
  const ground = heightAt(path.join(mod, "map", "heightmap.bmp"));
  ok(provAt(first.x, first.row) !== P1, `CONTROL: the borrowed row stands outside ${P1} (in ${provAt(first.x, first.row)}), so a borrowed row cannot pass`);
  ok(madeRows.length === 2 && madeRows.every((q) => provAt(q.x, q.row) === P1), `⭐⭐ both rows stand on a pixel of the region's first province, ${P1}`, madeRows.map((q) => [q.line, provAt(q.x, q.row)]));
  ok(madeRows.length === 2 && madeRows.every((q) => q.y === md.modelYForHeight(ground(q.x, q.row)).toFixed(2)), "⭐ …at the height of the ground there", madeRows.map((q) => [q.line, md.modelYForHeight(ground(q.x, q.row)).toFixed(2)]));

  // …and over a heightmap of another size than provinces.bmp, the province still places the rows but the ground is not read: y
  // stays the borrowed row's. P3 sits in the top-left corner, on pixels both wrong heightmaps have, so a read would land on one.
  const WRONG_Y = md.modelYForHeight(WRONG_H).toFixed(2), P3 = idAt(1, 1);
  for (const [w, h, what] of [[W / 2, H, "half as wide"], [W, H / 2, "half as tall"]]) {
    const odd = makeMod(w < W ? "create-narrow" : "create-short", true), oddFile = path.join(odd, "map", "weatherpositions.txt");
    write(odd, "map/heightmap.bmp", bmp8(w, h, () => WRONG_H));
    const oddFirst = weatherRows(oddFile, H)[0];
    const [px, prow] = centre(P3);
    ok(oddFirst.y !== WRONG_Y && px < w && prow < h && provAt(oddFirst.x, oddFirst.row) !== P3,
      `CONTROL: ${what}: ${P3}'s middle lies on the heightmap's own pixels, whose ground (${WRONG_Y}) is not the borrowed y (${oddFirst.y}), and the borrowed row stands outside ${P3}`);
    const m = md.createStrategicRegion({ modRoot: odd, gameRoot: game, dependencyRoots: [], provinces: [P3, P2] });
    const oddRows = m && m.ok ? weatherRows(oddFile, H).filter((q) => q.region === m.id) : [];
    ok(oddRows.length === 2 && oddRows.every((q) => provAt(q.x, q.row) === P3 && q.y === oddFirst.y),
      `⭐ ${what}: both rows stand on ${P3} at the borrowed y, ${oddFirst.y} — not read off a heightmap of another size`, oddRows.map((q) => q.line));
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
