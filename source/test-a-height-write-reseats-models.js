// ⛔ #a-model-stands-on-the-ground-that-moved — WHEN THE GROUND MOVES, THE BUILDINGS AND THE UNIT MODELS MOVE WITH IT.
//
// map/buildings.txt and map/unitstacks.txt store a HEIGHT for every model they place (column 4, y), and on every shipping map
// it is the ground under the model: y = 0.2617 + heightmap × 0.09785, held to 9.50..23.80 — vanilla's buildings and unit
// stacks sit within 1 of it on 99.7% of their land rows (measured 09-26; Old World Blues is the loosest at 86.5%).
// Nova writes heights and never moved a model. Measured 09-26 on the owner's flow (vanilla → Delete map → Generate land 35%):
//   · all 32,179 building rows on the new land are stored at 9.50, the sea floor they were written over before the land was
//     raised — 53% of them more than 1 below the ground they now stand on;
//   · the unit stacks it inherits from vanilla stand at Earth's heights: 52% of the rows on land off by more than 1, and 47%
//     of the rows over the new seas still at the height of the land that sank.
//
// Pinned here:
//   1. the height-to-y rule is the one the installed base game's own rows follow (re-derived, not typed in);
//   2. Generate land leaves every building on the new land standing on it;
//   3. an erase lowers the models on the province it sank to the waterline and leaves every other line byte for byte;
//   4. Auto-fix's unit-stack repair, which copies an inherited unitstacks.txt into the mod, re-seats every row whose ground
//      changed under it, sunk or raised — the layer below's own rows stand up to 4 off its ground, so in a COPY "follows the old
//      ground" is not the test — and leaves a row set off ground that never moved, by a modder or by the layer below;
//   4b. …and never re-seats the mod's OWN unitstacks.txt against the layer below's ground, where a total conversion's own terrain
//      reads as ground that moved;
//   4c. the copy's rule on the installed base game's own rows, over a sunk box and over its sea raised to land;
//   5. every function that rewrites heights re-seats the models (derived from the source).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-reseat-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
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
const heightAt = (root) => { const b = fs.readFileSync(path.join(root, "map", "heightmap.bmp")), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };
/** rows of a buildings.txt / unitstacks.txt: { line, x, y, z, px, row } */
const rowsOf = (file, H) => fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => { const c = line.split(";"); if (c.length < 7) return null; return { line, key: c[0] + ";" + c[1] + ";" + c[2] + ";" + c[4], y: c[3], px: Math.floor(+c[2]), row: H - 1 - Math.floor(+c[4]) }; }).filter(Boolean);

// ── 1. THE RULE, from the installed base game's own rows ─────────────────────────────────────────────────────────────────
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
console.log("\n-- 1. the height-to-y rule is the one the base game's own models follow --");
if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp"))) {
  ok(false, "the base game is installed, to re-derive the rule from (a skip reads as a pass, so this fails)");
} else {
  const b = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4;
  for (const f of ["buildings.txt", "unitstacks.txt"]) {
    let land = 0, near = 0;
    for (const r of rowsOf(path.join(GAME, "map", f), H)) {
      if (r.px < 0 || r.px >= W || r.row < 0 || r.row >= H) continue;
      const h = b[off + (H - 1 - r.row) * rs + r.px];
      if (h < 95) continue;
      land++; if (Math.abs(+r.y - md.modelYForHeight(h)) <= 1) near++;
    }
    ok(land > 10000 && near / land >= 0.99, `vanilla's ${f}: ${(100 * near / Math.max(1, land)).toFixed(2)}% of ${land} rows on land stand within 1 of modelYForHeight`);
  }
  ok(md.modelYForHeight(0) === 9.5 && md.modelYForHeight(255) === 23.8, "…held to the range vanilla uses, 9.50..23.80", [md.modelYForHeight(0), md.modelYForHeight(255)]);
}

// ── the world: 8 x 4 provinces of 16 x 16 px. Below: rows 0-2 land at 106, row 3 sea at 89 ────────────────────────────────
const CELL = 16, COLS = 8, ROWS = 4, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const landBelow = (id) => Math.floor((id - 1) / COLS) < 3;
const centre = (id) => { const c = (id - 1) % COLS, r = Math.floor((id - 1) / COLS); return [c * CELL + 8, r * CELL + 8]; };
const zOf = (row) => H - 1 - row;
const LAND_H = 106, OUTLIER = "15.00";
// #a-copied-row-keeps-the-old-grounds-offset — the layer below's rows do not all stand on its ground: vanilla has 1,514 unit rows
// more than 0.5 off it, and TEST 31 kept 1,048 of them off the new ground by more than 1 after this repair copied them in. So the
// province section 4 sinks carries rows set off its ground the way vanilla's are, and a strip of LOW land at 97 on its south
// edge, facing the sea: sinking 97 to 89 moves the ground's y by 0.25 only, which a "moved by more than 0.5" rule does not see.
// And a row set 2.5 over a SEA that section 4 raises to land, the Generate-land half of the owner's flow: the ground rises under
// it, which a rule for sunk ground alone does not see (review of bf09133 — on TEST 31 that rule left 16 more rows more than 1 off).
const SUNK = idAt(5, 2), LOW_H = 97, RAISE = idAt(0, 3);   // at the sea's end, so raising it cuts no sea off from the rest
const lowStrip = (x, y) => provAt(x, y) === SUNK && y % CELL >= CELL - 4;
const heightBelow = (x, y) => (lowStrip(x, y) ? LOW_H : landBelow(provAt(x, y)) ? LAND_H : 89);
const yOff = (h, d) => (md.modelYForHeight(h) + d).toFixed(2);
const PLANTED = {
  high08: { id: SUNK, t: 3, x: centre(SUNK)[0] + 4, row: centre(SUNK)[1], y: yOff(LAND_H, 0.8) },          // 11.43
  high20: { id: SUNK, t: 4, x: centre(SUNK)[0] + 4, row: centre(SUNK)[1] + 1, y: yOff(LAND_H, 2.0) },      // 12.63
  low15: { id: SUNK, t: 5, x: centre(SUNK)[0], row: 3 * CELL - 2, y: yOff(LOW_H, 1.5) },                   // 11.25, on the strip
  still08: { id: idAt(0, 0), t: 3, x: centre(idAt(0, 0))[0] + 4, row: centre(idAt(0, 0))[1], y: yOff(LAND_H, 0.8) },   // never moves
  sea25: { id: RAISE, t: 6, x: centre(RAISE)[0] + 4, row: centre(RAISE)[1], y: yOff(89, 2.5) },           // 12.00, over the sea
};
// ⛔ #a-new-province-has-its-unit-positions — sea25 is a slot NO land province of this layer below carries (6): the raised province
// is laid out as land by the step after this repair in the same click, which now moves every slot still the sea's to where the
// land below puts its own (a type 3 went beside the Standstill, and this asked for it at the place it left). A slot the land below
// never carries has no land layout to be given and stays where it stands, so this still asks the repair alone about it.
const keyOf = (p) => `${p.id};${p.t};${p.x}.00;${zOf(p.row)}.00`;
function makeGame(tag) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${landBelow(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/heightmap.bmp", bmp8(W, H, heightBelow));
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => (landBelow(provAt(x, y)) ? 0 : 15)));
  write(g, "common/terrain/00_terrain.txt", "categories = {\n\tplains = { color = { 200 200 100 } }\n\tforest = { color = { 0 120 0 } }\n\tocean = { color = { 0 0 200 } is_water = yes }\n}\nterrain = {\n\tplains = { type = plains color = { 0 } }\n\tforest = { type = forest color = { 1 } }\n\tocean = { type = ocean color = { 15 } }\n}\n");
  const b = [], u = [];
  for (let id = 1; id <= COLS * ROWS; id++) {
    const [x, row] = centre(id), y = landBelow(id) ? md.modelYForHeight(LAND_H).toFixed(2) : "9.50";
    if (landBelow(id)) b.push(`${Math.ceil(((id - 1) % COLS + 1) / 2)};arms_factory;${x}.00;${y};${zOf(row)}.00;0.00;0`);
    for (const t of (landBelow(id) ? [0, 1, 2, 19, 20] : [0, 1, 2, 9, 10, 11, 12, 38])) u.push(`${id};${t};${x + t % 3}.00;${y};${zOf(row) - (t % 2)}.00;0.00;0.24`);
  }
  // a modder's own choice: one unit stack on unmoved ground, set off it on purpose
  u.push(`${idAt(7, 0)};21;${centre(idAt(7, 0))[0]}.00;${OUTLIER};${zOf(centre(idAt(7, 0))[1])}.00;0.00;0.24`);
  for (const p of Object.values(PLANTED)) u.push(`${p.id};${p.t};${p.x}.00;${p.y};${zOf(p.row)}.00;0.00;0.24`);
  write(g, "map/buildings.txt", b.join("\n") + "\n");
  write(g, "map/unitstacks.txt", u.join("\n") + "\n");
  for (let s = 1; s <= 4; s++) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r));
    write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  }
  for (let r = 0; r < 4; r++) {
    const ids = []; for (let row = 0; row < ROWS; row++) for (const c of [2 * r, 2 * r + 1]) ids.push(idAt(c, row));
    write(g, `map/strategicregions/r${r + 1}.txt`, `strategic_region={\n\tid=${r + 1}\n\tname="REGION_${r + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
  }
  return g;
}
const game = makeGame("game");

console.log("\n-- ⭐ 2. Generate land leaves every building standing on the new land --");
{
  const mod = path.join(ROOT, "gen");
  write(mod, "descriptor.mod", 'name="reseat"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(W, H, () => 89));
  write(mod, "map/terrain.bmp", bmp8(W, H, () => 15));
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: 24, provincesPerState: 6, seed: 5 });
  // #generate-land-fills-the-seas-it-cuts-off — the 24 asked for, and the seas the grown coast cut off, which became land with it
  // #generate-land-leaves-no-sea-cut-off — …less the picks left sea to keep a sea it would have cut off open to the ocean
  ok(r && r.changed && r.flippedProvinces === 24 - ((r.inlandSeas || {}).leftSea || []).length + ((r.inlandSeas || {}).filled || 0), "Generate land raised 24 provinces", r && (r.error || r.flippedProvinces));
  const hAt = heightAt(mod), rowsB = rowsOf(path.join(mod, "map", "buildings.txt"), H);
  const onLand = rowsB.filter((q) => hAt(q.px, q.row) >= 95);
  const off = onLand.filter((q) => q.y !== md.modelYForHeight(hAt(q.px, q.row)).toFixed(2));
  const above = onLand.filter((q) => md.modelYForHeight(hAt(q.px, q.row)) > 9.6);
  ok(onLand.length >= 24 && above.length >= 12, `the fixture: ${onLand.length} building rows on the new land, ${above.length} of them on ground above the waterline's 9.50`);
  ok(!off.length, "⭐⭐ every one of them stands on the ground under it, not on the sea floor it was written over", off.slice(0, 6).map((q) => [q.line, md.modelYForHeight(hAt(q.px, q.row)).toFixed(2)]));
  ok(r.heightmap && r.heightmap.models && r.heightmap.models.rows > 0, "the raise says how many models it re-seated", r.heightmap && r.heightmap.models);
}

console.log("\n-- ⭐ 3. an erase lowers the models on the province it sank, and nothing else --");
{
  const mod = path.join(ROOT, "erase");
  write(mod, "descriptor.mod", 'name="reseat erase"\n');
  for (const f of ["provinces.bmp", "definition.csv", "heightmap.bmp", "terrain.bmp", "buildings.txt", "unitstacks.txt"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const before = { b: rowsOf(path.join(mod, "map", "buildings.txt"), H), u: rowsOf(path.join(mod, "map", "unitstacks.txt"), H) };
  const target = idAt(2, 2);   // on the coast: row 3 is sea
  const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: target });
  ok(r && r.changed && r.type === "sea", "province " + target + " was erased to sea", r && r.error);
  for (const [f, k] of [["buildings.txt", "b"], ["unitstacks.txt", "u"]]) {
    const after = rowsOf(path.join(mod, "map", f), H);
    const onIt = after.filter((q) => provAt(q.px, q.row) === target);
    const elsewhereBefore = before[k].filter((q) => provAt(q.px, q.row) !== target).map((q) => q.line);
    const elsewhereAfter = after.filter((q) => provAt(q.px, q.row) !== target).map((q) => q.line);
    // an erase takes a sunk province's building SLOTS out of buildings.txt altogether (its own rule), so there a row need only
    // not be left standing at the land's height; unitstacks.txt keeps its rows and must show them moved
    if (f === "buildings.txt") ok(onIt.every((q) => q.y === "9.50"), `${f}: nothing is left standing on the sunk province at the land's height`, onIt.map((q) => q.y));
    else ok(onIt.length > 0 && onIt.every((q) => q.y === "9.50"), `⭐ ${f}: the models on the sunk province went down to the waterline, 9.50`, onIt.map((q) => q.y));
    ok(JSON.stringify(elsewhereBefore) === JSON.stringify(elsewhereAfter), `…and every other ${f} line is what it was, byte for byte`);
  }
}

console.log("\n-- ⭐ 3b. raising a sea re-seats the models on the beach beside it, which the raise settles too --");
{
  // A raise settles the target AND the low beach of the land beside it (a land pixel under the waterline that faced the water
  // it fills in) — pixels whose height moves without crossing. Only what crossed was re-seated, so a unit stack on that beach
  // was left at the old beach's height (review of 6a1fd27).
  const mod = path.join(ROOT, "raise");
  write(mod, "descriptor.mod", 'name="reseat raise"\n');
  for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "buildings.txt"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const target = idAt(3, 3), shore = idAt(3, 2);   // a sea province, and the land province north of it
  const BEACH = 94, beachRow = (y) => Math.floor(y / CELL) === 2 && y % CELL >= CELL - 4;   // the shore row's southmost 4 pixel rows
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === shore && beachRow(y) ? BEACH : landBelow(provAt(x, y)) ? LAND_H : 89)));
  const bx = centre(shore)[0], brow = 3 * CELL - 2;   // a pixel of the shore's beach, two above the sea
  const stack = `${shore};0;${bx}.00;${md.modelYForHeight(BEACH).toFixed(2)};${zOf(brow)}.00;0.00;0.24`;
  write(mod, "map/unitstacks.txt", fs.readFileSync(path.join(game, "map", "unitstacks.txt"), "utf8") + stack + "\n");
  const r = md.setProvinceDefinition({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: target, type: "land", terrain: "plains", coastal: false, continent: 1 });
  ok(r && r.changed, "the sea province " + target + " was raised to land", r && (r.error || r.reason));
  const now = heightAt(mod)(bx, brow);
  ok(now !== BEACH, `CONTROL: the raise settled the shore's beach too (${BEACH} → ${now})`, now);
  const row = rowsOf(path.join(mod, "map", "unitstacks.txt"), H).find((q) => q.line.startsWith(`${shore};0;${bx}.00;`) && q.row === brow);
  ok(!!row && row.y === md.modelYForHeight(now).toFixed(2), "⭐⭐ …and the unit stack on it stands on its new height, not the old beach's", row && { y: row.y, want: md.modelYForHeight(now).toFixed(2) });
}

console.log("\n-- ⭐ 4. Auto-fix's unit-stack repair re-seats, in the copy it takes, every row whose ground moved --");
{
  const mod = path.join(ROOT, "inherit");
  write(mod, "descriptor.mod", 'name="reseat inherited"\n');
  for (const f of ["provinces.bmp", "definition.csv", "heightmap.bmp", "terrain.bmp"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const target = SUNK;
  const e = md.flipProvinceToSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: target });
  ok(e && e.changed && !fs.existsSync(path.join(mod, "map", "unitstacks.txt")), "an erase in a mod that inherits unitstacks.txt does not copy it in (that is Auto-fix's call)", e && e.error);
  // …and a sea raised to land, as the inspector's Type dropdown sends it (public/map.js saveProvinceTerrain)
  const up = md.setProvinceDefinition({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: RAISE, terrain: "plains", type: "land", coastal: false });
  ok(up && up.changed && !fs.existsSync(path.join(mod, "map", "unitstacks.txt")), "…nor does a raise of the sea province " + RAISE, up && (up.error || up.reason));
  const hNow = heightAt(mod), hGame = heightAt(game), L = PLANTED.low15, S = PLANTED.sea25;
  ok(hGame(L.x, L.row) === LOW_H && hNow(L.x, L.row) === 89, `CONTROL: the erase took the low strip under one stack from ${LOW_H} to 89, which moves the ground's y by only ${(md.modelYForHeight(LOW_H) - md.modelYForHeight(89)).toFixed(2)}`, [hGame(L.x, L.row), hNow(L.x, L.row)]);
  const upY = md.modelYForHeight(hNow(S.x, S.row));
  ok(hNow(S.x, S.row) > hGame(S.x, S.row) && Math.abs(+S.y - upY) > 0.5 && Math.abs(+S.y - md.modelYForHeight(hGame(S.x, S.row))) > 0.5,
    `CONTROL: the raise lifted the ground under the stack set ${S.y} over the sea (${hGame(S.x, S.row)} → ${hNow(S.x, S.row)}), and it stands more than 0.5 off both grounds — so "follows the old ground" does not take it`, [hGame(S.x, S.row), hNow(S.x, S.row), upY.toFixed(2)]);
  // what POST /api/map/auto-fix {modPath} runs
  const res = md.autoFixMap({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const fx = (res && res.fixes && res.fixes.unitStacks) || {};
  ok(fx.changed && fx.materialised, "Auto-fix's unit-stack repair copied the file in", res && (res.error || fx));
  const after = rowsOf(path.join(mod, "map", "unitstacks.txt"), H);
  const onIt = after.filter((q) => provAt(q.px, q.row) === target);
  ok(onIt.length > 0 && onIt.every((q) => q.y === "9.50"), "⭐⭐ the stacks left on the sunk province stand at the waterline, not on the land that went under", onIt.map((q) => q.line));
  const at = (p) => (after.find((q) => q.key === keyOf(p)) || {}).y;
  ok(at(PLANTED.high08) === "9.50" && at(PLANTED.high20) === "9.50", `⭐⭐ …the two the layer below set 0.8 and 2.0 off the ground it had (${PLANTED.high08.y}, ${PLANTED.high20.y}) too: a copied row was measured on the old ground, however far off it it stood`, [at(PLANTED.high08), at(PLANTED.high20)]);
  ok(at(PLANTED.low15) === "9.50", `⭐⭐ …and the one 1.5 over the low strip (${PLANTED.low15.y}): any change of ground under a copied row, not a change of more than 0.5`, at(PLANTED.low15));
  const upNow = md.modelYForHeight(heightAt(mod)(S.x, S.row)).toFixed(2);
  ok(at(S) === upNow, `⭐⭐ …and the one the layer below set ${S.y} over the sea the mod raised stands on the new land, ${upNow}: ground that rose moved as much as ground that sank`, at(S));
  ok(at(PLANTED.still08) === PLANTED.still08.y, `⭐ …while the one the layer below set 0.8 off ground that never moved keeps its bytes (${PLANTED.still08.y})`, at(PLANTED.still08));
  const kept = after.find((q) => q.y === OUTLIER);
  ok(!!kept, "⭐ …and the modder's stack set off unmoved ground on purpose keeps its height", after.filter((q) => provAt(q.px, q.row) === idAt(7, 0)).map((q) => q.y));
  // A row is known here by its province and type, not by where it stands. This asked "the same place, another height" until the
  // sea's layout stopped asking that the layer below's star stand in its default slot (map-data.js unitStandstills `seaLayout`):
  // this fixture's sea rows keep the star two pixels off that slot, so the province raised above is now laid out as land by the
  // step that follows this repair in the same click, and its Standstill and its star — re-seated here first — are no longer where
  // the base game had them. Counted by place they dropped out of the count, which read 11 against the repair's 13.
  const idType = (q) => q.line.split(";").slice(0, 2).join(";"), below = rowsOf(path.join(game, "map", "unitstacks.txt"), H);
  const was = new Map(below.map((q) => [idType(q), q.y])), laid = (res && res.fixes && res.fixes.unitPositions) || {};
  ok(was.size === below.length && laid.changed && laid.exSea === 1 && laid.standstills + laid.markers > 0,
    `CONTROL: no two of the base game's rows share a province and a type, and the layout step moved the raised province's own (${laid.standstills} Standstill, ${laid.markers} star)`, [was.size, below.length, laid]);
  const moved = after.filter((q) => was.has(idType(q)) && was.get(idType(q)) !== q.y);
  ok(moved.length > 0 && fx.reseated === moved.length && moved.every((q) => hNow(q.px, q.row) !== hGame(q.px, q.row)),
    `the repair says how many it re-seated: ${fx.reseated}, exactly the ${moved.length} rows of the copy whose height changed, every one on ground that moved`, { reseated: fx.reseated, moved: moved.map((q) => q.line) });
  // …and the Auto-fix line says so, and does not call a copy whose rows it moved "frozen at this build of the map below"
  // (review of 6a1fd27). The page's own summary code, on this real answer.
  const said = require("./testlib-map-page.js").autoFixSummary({ ok: true, fixes: { unitStacks: fx } });
  ok(new RegExp(`stood ${fx.reseated} unit position\\(s\\) back on the ground your map has now`).test(said), "⭐ the Auto-fix summary says how many unit positions it stood back on the ground", said);
  ok(!/frozen at this build of the map below/.test(said) && /moved onto your ground/.test(said), "⭐ …and that the copy it took is moved onto the mod's ground, not frozen as the map below's", said);
  ok(fx.copiedFrom === "base game" && /no longer picks up the base game's changes/.test(said), "…a copy of the base game's file says the base game's changes stop reaching it", { copiedFrom: fx.copiedFrom, said });
  // The same repair over a copy that came from a mod this one depends on: the base game is not whose changes stop (review of
  // 3d0f85e — the line blamed the base game whatever the copy's source, where the posteffect warning already told them apart).
  const dep = path.join(ROOT, "dep-stacks"), mod2 = path.join(ROOT, "inherit-dep");
  write(dep, "map/unitstacks.txt", fs.readFileSync(path.join(game, "map", "unitstacks.txt")));
  write(mod2, "descriptor.mod", 'name="reseat from a dependency"\n');
  for (const f of ["provinces.bmp", "definition.csv", "heightmap.bmp", "terrain.bmp"]) write(mod2, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const e2 = md.flipProvinceToSea({ modRoot: mod2, gameRoot: game, dependencyRoots: [dep], provinceId: target });
  const fx2 = md.fixUnitStacks({ modRoot: mod2, gameRoot: game, dependencyRoots: [dep] });
  const said2 = require("./testlib-map-page.js").autoFixSummary({ ok: true, fixes: { unitStacks: fx2 } });
  ok(e2 && e2.changed && fx2 && fx2.changed && fx2.materialised && fx2.copiedFrom === "dependency", "the repair over a dependency's unitstacks.txt copies that one in, and says so", fx2);
  ok(!/base game's changes/.test(said2) && /no longer picks up the changes the mod it came from makes/.test(said2), "⭐ …and the summary blames that mod, not the base game", said2);
}

console.log("\n-- ⭐ 4b. …and it never re-seats the mod's OWN unitstacks.txt against the ground of the map below --");
{
  // A total conversion owns its heightmap and its model files, and its terrain differs from the base game's nearly everywhere
  // (Millennium Dawn: 9,044,968 pixels). Judged against the base game's ground, all of it reads as ground that moved: on a scratch
  // copy of Millennium Dawn, one erased province had this repair rewrite 594 rows in 218 provinces nobody touched. Here the mod
  // raised a province of its own to 140 and kept its rows at the base game's height, as Millennium Dawn's do.
  const mod = path.join(ROOT, "own");
  write(mod, "descriptor.mod", 'name="reseat own"\n');
  for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "buildings.txt", "unitstacks.txt"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const RAISED = idAt(1, 0), RAISED_H = 140, target = idAt(2, 2);
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === RAISED ? RAISED_H : heightBelow(x, y))));
  // ⛔ #a-model-left-on-the-old-ground — …AND THOSE ROWS ARE THE TOTAL CONVERSION'S OWN, as Millennium Dawn's are: of its 445 unit rows
  // more than 1 off the ground it moved, 439 carry a key the base game has not (its own layout) and 4 are the base game's line byte
  // for byte; its 410 such buildings are all its own. A verbatim copy of the layer below's rows over ground the mod moved is another
  // thing — an old world's copy — and models_stand_on_the_old_ground stands those on the ground at an Auto-fix click
  // (test-a-model-on-the-old-ground-is-stood-back-on-it.js). So the rows on the raised province are laid out by the mod here: half a
  // pixel east of the base game's, on the same pixel, still at the base game's height.
  for (const f of ["buildings.txt", "unitstacks.txt"]) {
    const own = fs.readFileSync(path.join(mod, "map", f), "utf8").split("\n").map((l) => {
      const c = l.split(";");
      if (c.length < 7 || provAt(Math.floor(+c[2]), H - 1 - Math.floor(+c[4])) !== RAISED) return l;
      c[2] = (+c[2] + 0.5).toFixed(2);
      return c.join(";");
    });
    write(mod, "map/" + f, own.join("\n"));
  }
  const file = path.join(mod, "map", "unitstacks.txt");
  const e = md.flipProvinceToSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: target });
  ok(e && e.changed && e.type === "sea", "province " + target + " was erased to sea in a mod that owns its unitstacks.txt", e && e.error);
  const raisedRows = (rows) => rows.filter((q) => provAt(q.px, q.row) === RAISED).map((q) => q.line);
  const before = raisedRows(rowsOf(file, H));
  // CONTROL: the fixture can tell — the rule for a file with no mask (follows the old ground) would move exactly those rows
  const probe = fs.readFileSync(file, "utf8").split("\n");
  const wouldMove = md.reseatModelRows(probe, { W, H, hNow: heightAt(mod), hBelow: heightAt(game) });
  ok(before.length > 0 && wouldMove === before.length, `CONTROL: judged against the base game's ground, the ${before.length} rows on the province the mod raised would be re-seated (${wouldMove})`, { before, wouldMove });
  const dry = md.fixUnitStacks({ modRoot: mod, gameRoot: game, dependencyRoots: [], dryRun: true });
  ok(dry && dry.dryRun && dry.removed > 0 && dry.reseated === 0, "⭐ a dry run of the repair has slots to drop and re-seats nothing in the mod's own file", dry);
  const res = md.autoFixMap({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const fx = (res && res.fixes && res.fixes.unitStacks) || {};
  ok(fx.changed && !fx.materialised && fx.removed > 0, "CONTROL: the click ran the repair on the mod's own file", res && (res.error || fx));
  ok(fx.reseated === 0, "⭐⭐ …and it re-seated nothing", fx);
  const after = rowsOf(file, H);
  ok(JSON.stringify(raisedRows(after)) === JSON.stringify(before), "⭐⭐ the rows on the province the mod raised keep their bytes", raisedRows(after));
  const onIt = after.filter((q) => provAt(q.px, q.row) === target);
  ok(onIt.length > 0 && onIt.every((q) => q.y === "9.50"), "…while the erase itself stood the rows on the province it sank at the waterline, on the pixels it moved", onIt.map((q) => q.y));
  const said = require("./testlib-map-page.js").autoFixSummary(res);
  ok(/brought map\/unitstacks\.txt back in line/.test(said) && !/stood [\d,]+ unit position\(s\) back/.test(said), "⭐ the Auto-fix summary reports the repair and no unit positions stood back", said);
}

console.log("\n-- ⭐ 4c. in a copy of the base game's own rows, none is left off ground that moved --");
if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp"))) {
  ok(false, "the base game is installed, to run the rule over its rows (a skip reads as a pass, so this fails)");
} else {
  const b = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp")), VW = b.readInt32LE(18), VH = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * VW + 31) / 32) * 4;
  const hBelow = (x, row) => b[off + (VH - 1 - row) * rs + x];
  // a box sunk to 89 — the erase brush over a coast, in pixel rows counted down from the top, as reseatModelRows counts them
  const X0 = 2800, X1 = 3100, R0 = 300, R1 = 600;
  const inBox = (x, row) => x >= X0 && x < X1 && row >= R0 && row < R1;
  const hNow = (x, row) => (inBox(x, row) ? 89 : hBelow(x, row));
  const lines = fs.readFileSync(path.join(GAME, "map", "unitstacks.txt"), "utf8").split("\n");
  const parse = (line) => { const c = line.split(";"); if (c.length < 7) return null; const x = Math.floor(parseFloat(c[2])), y = parseFloat(c[3]), row = md.buildingZToPixelY(VH, parseFloat(c[4])); return x >= 0 && x < VW && row >= 0 && row < VH && Number.isFinite(y) ? { x, y, row } : null; };
  // rows on a pixel whose ground changed, standing more than 0.5 off the ground it has now
  const offMoved = (ls) => ls.map(parse).filter((r) => r && hNow(r.x, r.row) !== hBelow(r.x, r.row) && Math.abs(r.y - md.modelYForHeight(hNow(r.x, r.row))) > 0.5);
  const asShipped = offMoved(lines);
  const copy = lines.slice(), own = lines.slice();
  md.reseatModelRows(copy, { W: VW, H: VH, hNow, hBelow, copied: true });
  md.reseatModelRows(own, { W: VW, H: VH, hNow, hBelow });
  // the first draft of this fix: stale where the row follows the old ground or the ground's y moved by more than 0.5
  const halfRule = asShipped.filter((r) => { const want = md.modelYForHeight(hNow(r.x, r.row)), was = md.modelYForHeight(hBelow(r.x, r.row)); return Math.abs(r.y - was) > 0.5 && Math.abs(want - was) <= 0.5; });
  ok(asShipped.length > 0 && halfRule.length > 0, `CONTROL: the box has ${asShipped.length} of the base game's unit rows off the ground the sink moved, and a rule asking whether the ground's y moved by more than 0.5 would leave ${halfRule.length} of them — low land drowned moves it less`, { asShipped: asShipped.length, halfRule: halfRule.length });
  ok(offMoved(copy).length === 0, "⭐⭐ with copied: true, none of them is left off the ground that moved", offMoved(copy).slice(0, 6));
  ok(offMoved(own).length > 0, `…where the follows-the-old-ground rule leaves ${offMoved(own).length} — the rule a copy must not use`, offMoved(own).length);
  const offOwnGround = lines.map(parse).filter((r) => r && Math.abs(r.y - md.modelYForHeight(hBelow(r.x, r.row))) > 0.5 && Math.abs(r.y - md.modelYForHeight(hBelow(r.x, r.row))) <= 4).length;
  ok(offOwnGround >= 1000, `the base game's own rows: ${offOwnGround} stand 0.5 to 4 off its own ground, so the offsets section 4 plants are the layer below's shape, not invented`, offOwnGround);
  // …and the other way, the Generate-land half of the owner's flow: every pixel of its sea raised to land at 106. Some of the rows
  // over its sea are set off it, and a rule for sunk ground alone leaves those (review of bf09133).
  const hUp = (x, row) => (hBelow(x, row) < 95 ? 106 : hBelow(x, row));
  const offRaised = (ls) => ls.map(parse).filter((r) => r && hUp(r.x, r.row) !== hBelow(r.x, r.row) && Math.abs(r.y - md.modelYForHeight(hUp(r.x, r.row))) > 0.5);
  const upCopy = lines.slice(), upOwn = lines.slice();
  md.reseatModelRows(upCopy, { W: VW, H: VH, hNow: hUp, hBelow, copied: true });
  md.reseatModelRows(upOwn, { W: VW, H: VH, hNow: hUp, hBelow });
  ok(offRaised(upOwn).length > 0, `CONTROL: over its sea raised to land, the follows-the-old-ground rule leaves ${offRaised(upOwn).length} of the base game's rows off the ground that rose — the ones it set off its sea`, offRaised(upOwn).length);
  ok(offRaised(upCopy).length === 0, "⭐⭐ …and with copied: true, none of them", offRaised(upCopy).slice(0, 6));
}

console.log("\n-- 5. every function that rewrites heights re-seats the models --");
{
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const bodies = [];
  for (let i = src.indexOf("writeWorldNormalFromHeightmap("); i >= 0; i = src.indexOf("writeWorldNormalFromHeightmap(", i + 1)) {
    if (src.slice(Math.max(0, i - 9), i) === "function ") continue;
    const f = src.lastIndexOf("\nfunction ", i), e = src.indexOf("\nfunction ", i);
    bodies.push(src.slice(f + 1, e < 0 ? undefined : e));
  }
  ok(bodies.length >= 2, `found the functions that rewrite heights (${bodies.length})`);
  const missing = bodies.filter((b) => !/reseatModelHeights\(/.test(b)).map((b) => b.slice(9, b.indexOf("(")));
  ok(!missing.length, "…and every one of them re-seats the models", missing);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
