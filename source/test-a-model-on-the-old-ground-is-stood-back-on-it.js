// ⛔ #a-model-left-on-the-old-ground — A MODEL THE HEIGHT WRITE NEVER SAW IS STOOD BACK ON THE GROUND, AND SAID.
//
// map/buildings.txt and map/unitstacks.txt store a height for every model (column 4, y), and on every shipping map it is the ground
// under the model. #a-model-stands-on-the-ground-that-moved re-seats rows AT the height write, in files the mod owns THEN, and
// fixUnitStacks re-seats the copy it takes in. Nothing looked again afterwards, so three kinds of row stayed on the old ground:
//   · a paint or erase on an add-on that inherits the model files: one stroke of land out over the base game's sea left 21 unit rows
//     and a building 1.13 under the new land, and no rule said so;
//   · a copy of one of those files taken in AFTER the height write, by an Auto-fix step that needed it for a repair of its own;
//   · every world Nova built before any re-seat existed: TEST 31 keeps 1,044 unit rows more than 1 off its ground, 1,031 of them
//     floating over its new seas, each byte for byte vanilla's line.
// models_stand_on_the_old_ground reports a row when the ground under it changed at all, it stands more than 1 off the ground it has
// now, the move is what put it there (it stood within 1 of the old ground, or the ground crossed the waterline or moved by more
// than 1), and it is still the layer below's row (an inherited file, or in the mod's own file the layer below's y for the same key —
// a building's key without its state, which the buildings pass rewrites). A building Nova wrote on the sea floor before the land
// was raised is reported by its shape. Auto-fix stands the rows of a file the mod owns on its ground, byte-surgically; an inherited
// file is never copied in only to move heights, and is said instead, with what the modder can do about it.
//
// Pinned here:
//   0. the fixture's base game sets rows off its own ground, as vanilla does, so a rule on height alone would cry wolf on it;
//   1. ⭐ a mod owning verbatim copies of the base game's heightmap and model files reports nothing (the ground-moved gate, without a
//      workshop install);
//   2. ⭐ a paint on an add-on, driven with the body POST /api/map/paint-provinces sends: exactly the rows it put under the new land
//      are reported, declined by Auto-fix, and no map/unitstacks.txt is written — and the message names the way out;
//   3. ⭐ once the add-on owns a copy of that file (that way out, or a later copy-in), one click stands exactly those rows on the
//      ground, every other byte stays, a file that changed under the click is left, and a second click writes nothing;
//   3b. ⭐ a copy another step of the click takes in is stood on the ground in that same click (the step runs after every copy-in),
//      the row the buildings pass re-homes in it too;
//   4. ⭐ an old world: the mod's own verbatim copy over ground it sank — low land at 97 drowned to 89 under a row 1.5 over it is
//      reported (any change of ground, not a change of more than 0.5), a row the modder moved is never touched, nor one within 1 of
//      the new ground, the file keeps its CRLF and a byte that is not UTF-8, and a mod that replaces map/ has nothing below to be
//      judged against;
//   4b. ⭐ a heightmap one grey level up over verbatim model files: the rows the base game set off its OWN ground are not the mod's
//      doing, and one is reported only where the ground really moved under it;
//   4c. ⭐ buildings written on the sea floor before the land was raised are reported and stood on it; a row with a rotation, a
//      fractional place or a sea province of its own is somebody's hand and kept;
//   5. ⭐ a direct call for a mod that owns no heightmap reads no model file;
//   5b. ⭐ a layer below of another size is declined; a file inherited from a dependency is said to be the dependency's; a row
//      standing off the map is not read as the pixel its x wraps to;
//   6. the installed shipping maps, each as the active mod over the base game, at their pinned counts.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oldground-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const RULE = "models_stand_on_the_old_ground";
// ── the fixture of test-a-height-write-reseats-models.js: bmp24, bmp8, makeGame ─────────────────────────────────────────────
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
/** rows of a buildings.txt / unitstacks.txt: { i (line), line, key, y, px, row } */
const rowsOf = (file, H) => fs.readFileSync(file, "utf8").split("\n").map((raw, i) => { const line = raw.replace(/\r$/, ""), c = line.split(";"); if (c.length < 7) return null; return { i, line, key: c[0] + ";" + c[1] + ";" + c[2] + ";" + c[4], y: c[3], px: Math.floor(+c[2]), row: H - 1 - Math.floor(+c[4]) }; }).filter(Boolean);

const CELL = 16, COLS = 8, ROWS = 4, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const landBelow = (id) => Math.floor((id - 1) / COLS) < 3;
const centre = (id) => { const c = (id - 1) % COLS, r = Math.floor((id - 1) / COLS); return [c * CELL + 8, r * CELL + 8]; };
const zOf = (row) => H - 1 - row;
const LAND_H = 106, OUTLIER = "15.00";
// ⛔ #a-painted-coast-rises-like-the-generators — THE COAST THE STROKE OF SECTIONS 2, 3, 3b, 4c AND 5b IS PAINTED OUT FROM STANDS HIGH.
// A paint's new land is settled as Generate land settles it: the beach at the waterline and the field behind it, held within
// HEIGHTMAP_RAISE_RIM_SLOPE a pixel of the land round it. Painted out from a coast at 106, the stroke's new land under the sea's rows
// reads 98..100, so a row at the sea's 9.50 stands 0.35..0.55 under it: within 1, and nothing is left on the old ground. This file
// pinned a flat 106 there until the paint raised land as the generator does. Out from a coast at COAST_H the rim holds the new land up
// behind it, 8 a pixel, and the rows the stroke covers stand more than 1 under it, as on a mountain coast. Every height the new land
// has is read off the disk after the stroke, never typed in.
const LANDP = idAt(3, 2), SEAP = idAt(3, 3), CX = 57, CY = 53, R = 6, COAST_H = 200;
const inDisc = (x, y) => (x - CX) * (x - CX) + (y - CY) * (y - CY) <= R * R;
const landH = (id) => (id === LANDP ? COAST_H : LAND_H);
const SUNK = idAt(5, 2), LOW_H = 97, RAISE = idAt(0, 3);
const lowStrip = (x, y) => provAt(x, y) === SUNK && y % CELL >= CELL - 4;
const heightBelow = (x, y) => (lowStrip(x, y) ? LOW_H : landBelow(provAt(x, y)) ? landH(provAt(x, y)) : 89);
const yOff = (h, d) => (md.modelYForHeight(h) + d).toFixed(2);
const PLANTED = {
  high08: { id: SUNK, t: 3, x: centre(SUNK)[0] + 4, row: centre(SUNK)[1], y: yOff(LAND_H, 0.8) },
  high20: { id: SUNK, t: 4, x: centre(SUNK)[0] + 4, row: centre(SUNK)[1] + 1, y: yOff(LAND_H, 2.0) },
  low15: { id: SUNK, t: 5, x: centre(SUNK)[0], row: 3 * CELL - 2, y: yOff(LOW_H, 1.5) },
  near08: { id: SUNK, t: 6, x: centre(SUNK)[0] + 4, row: centre(SUNK)[1] + 2, y: yOff(89, 0.8) },
  still08: { id: idAt(0, 0), t: 3, x: centre(idAt(0, 0))[0] + 4, row: centre(idAt(0, 0))[1], y: yOff(LAND_H, 0.8) },
  sea25: { id: RAISE, t: 3, x: centre(RAISE)[0] + 4, row: centre(RAISE)[1], y: yOff(89, 2.5) },
};
const keyOf = (p) => `${p.id};${p.t};${p.x}.00;${zOf(p.row)}.00`;
// …and a bunker the base game itself keeps at the sea floor's 9.50 inside its own land, in the shape Nova's slot writer leaves
const BURIED = `4;bunker;${centre(idAt(7, 0))[0] + 3}.00;9.50;${zOf(centre(idAt(7, 0))[1] + 3)}.00;0.00;0`;
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
    const [x, row] = centre(id), y = landBelow(id) ? md.modelYForHeight(landH(id)).toFixed(2) : "9.50";
    if (landBelow(id)) b.push(`${Math.ceil(((id - 1) % COLS + 1) / 2)};arms_factory;${x}.00;${y};${zOf(row)}.00;0.00;0`);
    for (const t of (landBelow(id) ? [0, 1, 2, 19, 20] : [0, 1, 2, 9, 10, 11, 12, 38])) u.push(`${id};${t};${x + t % 3}.00;${y};${zOf(row) - (t % 2)}.00;0.00;0.24`);
  }
  u.push(`${idAt(7, 0)};21;${centre(idAt(7, 0))[0]}.00;${OUTLIER};${zOf(centre(idAt(7, 0))[1])}.00;0.00;0.24`);
  for (const p of Object.values(PLANTED)) u.push(`${p.id};${p.t};${p.x}.00;${p.y};${zOf(p.row)}.00;0.00;0.24`);
  b.push(BURIED);
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
const G = (mod) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
const ruleOf = (mod) => md.validateMapBitmap(G(mod)).filter((p) => p.rule === RULE);
// the finder, or an empty answer where it does not exist, so every check below still runs (and says what is missing) on older code
const find = (g) => (typeof md.findModelsOnTheOldGround === "function" ? md.findModelsOnTheOldGround(g) : { total: 0, files: [], reason: "there is no findModelsOnTheOldGround" });
const said = (res) => require("./testlib-map-page.js").autoFixSummary(res);
const hGame = heightAt(game);
const off1 = (r, h) => Math.abs(+r.y - md.modelYForHeight(h)) > 1;
const gameRows = { b: rowsOf(path.join(game, "map", "buildings.txt"), H), u: rowsOf(path.join(game, "map", "unitstacks.txt"), H) };

try {
  console.log("\n-- 0. the fixture's base game sets rows off its own ground, as vanilla does --");
  const offOwnGround = gameRows.u.concat(gameRows.b).filter((r) => off1(r, hGame(r.px, r.row)));
  // vanilla: 186 buildings and 426 unit rows more than 1 off its own ground; a rule on height alone reports them on every mod
  ok(offOwnGround.length >= 3 && offOwnGround.some((r) => r.y === OUTLIER) && offOwnGround.some((r) => r.key === keyOf(PLANTED.high20)) && offOwnGround.some((r) => r.line === BURIED),
    `CONTROL: ${offOwnGround.length} of the base game's rows stand more than 1 off its own ground — what a rule without the ground-moved gate would report`, offOwnGround.map((r) => r.line));

  console.log("\n-- ⭐ 1. a mod that owns verbatim copies of the base game's heightmap and model files: nothing moved, nothing reported --");
  {
    ok(typeof md.findModelsOnTheOldGround === "function" && typeof md.fixModelsOnTheOldGround === "function", "map-data.js has the finder and its Auto-fix step");
    const mod = path.join(ROOT, "same");
    write(mod, "descriptor.mod", 'name="old ground: verbatim"\n');
    for (const f of ["heightmap.bmp", "buildings.txt", "unitstacks.txt"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const found = find(G(mod));
    ok(found.total === 0 && found.files.length === 0 && !found.reason, "⭐⭐ the finder reports none of the rows the base game sets off its own ground", found);
    ok(ruleOf(mod).length === 0, "…and neither does Map Errors");
  }

  console.log("\n-- ⭐ 2. a paint of land out over the sea, on an add-on that inherits the model files --");
  const addon = path.join(ROOT, "addon");
  // the rows the stroke covers: on a pixel of the sea it paints — and those it puts under the new land, more than 1 off the ground the
  // stroke left there, read off the disk once it has run (derived)
  const onStroke = (rows) => rows.filter((r) => inDisc(r.px, r.row) && provAt(r.px, r.row) === SEAP);
  const underNewLand = (rows, hNew) => onStroke(rows).filter((r) => off1(r, hNew(r.px, r.row)));
  let expected = [], hAddon = () => 0;
  {
    write(addon, "descriptor.mod", 'name="old ground: paint"\n');
    // what public/map.js sends to POST /api/map/paint-provinces: { modPath, diff: [{ x, y, r, g, b }] }, one entry per painted pixel;
    // the endpoint hands `diff` to applyProvinceDiff with the mod's dependency roots (none here)
    const [r, g, b] = colour(LANDP), diff = [];
    for (let y = CY - R; y <= CY + R; y++) for (let x = CX - R; x <= CX + R; x++) if (inDisc(x, y)) diff.push({ x, y, r, g, b });
    const res = md.applyProvinceDiff({ ...G(addon), diff });
    ok(res && res.ok !== false && res.heightmap && res.heightmap.changed && res.heightmap.raised > 0, "the stroke raised the sea it painted", res && (res.error || res.heightmap));
    ok(fs.existsSync(path.join(addon, "map", "heightmap.bmp")) && !fs.existsSync(path.join(addon, "map", "unitstacks.txt")) && !fs.existsSync(path.join(addon, "map", "buildings.txt")),
      "CONTROL: the add-on now owns its heightmap, and still inherits both model files (the paint copies neither in)");
    hAddon = heightAt(addon);
    expected = underNewLand(gameRows.u, hAddon).concat(underNewLand(gameRows.b, hAddon));
    const covered = onStroke(gameRows.u).concat(onStroke(gameRows.b));
    ok(covered.length === 8 && expected.length === covered.length && expected.every((q) => q.y === "9.50" && hGame(q.px, q.row) === 89),
      `CONTROL: ${expected.length} of the base game's unit rows stood on the sea the stroke painted, at the waterline's 9.50, and every one is more than 1 under the ground the stroke left there (${expected.map((q) => hAddon(q.px, q.row)).join(" ")})`, { covered: covered.map((q) => q.line), ground: covered.map((q) => hAddon(q.px, q.row)) });

    const found = find(G(addon));
    const f = found.files[0] || {};
    ok(found.total === expected.length && found.files.length === 1 && f.name === "unitstacks.txt" && f.own === false && f.from === "base game",
      `⭐⭐ the finder reports ${found.total} rows, in the base game's map/unitstacks.txt the add-on uses`, { total: found.total, files: found.files.map((x) => ({ name: x.name, own: x.own, from: x.from, n: x.rows.length })) });
    const keys = new Set((f.rows || []).map((q) => q.key));
    ok(expected.every((q) => keys.has(q.key)) && keys.size === expected.length, "⭐⭐ …exactly the rows the stroke put under the new land, and no other", [...keys]);
    const wantOf = new Map(expected.map((q) => [q.key, md.modelYForHeight(hAddon(q.px, q.row)).toFixed(2)]));
    ok((f.rows || []).length > 0 && f.rows.every((q) => q.want === wantOf.get(q.key)), "…each wanting the height of the new ground under it", (f.rows || []).map((q) => [q.want, wantOf.get(q.key)]));

    const p = ruleOf(addon);
    ok(p.length === 1 && p[0].severity === "warning" && p[0].total === expected.length, `⭐ Map Errors reports ${RULE} once, as a warning naming ${expected.length}`, p);
    ok(p[0] && p[0].autoFix === false, "⭐⭐ …and declines Auto-fix for it: the file is the base game's, and copying it in only to change heights is not a repair", p[0] && p[0].autoFix);
    ok(p[0] && /map\/unitstacks\.txt/.test(p[0].message) && /the base game's copy, which your mod uses/.test(p[0].message) && /Auto-fix leaves map\/unitstacks\.txt alone/.test(p[0].message),
      "…and says whose file it is and that Auto-fix leaves it alone", p[0] && p[0].message);
    // #a-report-with-no-way-out — no number of clicks clears an inherited file's rows, and the Save line repeats the warning: the
    // message names what the MODDER can do (section 3 does it, and the rows are stood on the ground)
    ok(p[0] && p[0].message.includes(`To have them moved now, copy unitstacks.txt from the base game's map folder into your mod's map folder yourself and click "Auto-fix all"`),
      "⭐⭐ …and what the modder can do about it: copy the file in by hand, and click again", p[0] && p[0].message.slice(-420));
    ok(p[0] && !p[0].message.includes(ROOT) && !p[0].message.includes(ROOT.replace(/\\/g, "/")), "…naming the file and whose folder it is in, not a path on this machine", p[0] && p[0].message.slice(-420));
    ok(/copy that file into your mod's map folder yourself/.test(L.FIX_HINTS[RULE] || ""), "⭐ …as the explanation beside the rule does", L.FIX_HINTS[RULE]);
    ok(!L.isFatalRule(RULE) && !!L.LABELS[RULE] && !!L.FIX_HINTS[RULE], "…not in the fatal set (the game loads it), with a label and an explanation");

    const af = md.autoFixMap(G(addon));
    const fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    ok(af && af.ok && !af.nothingToFix, "CONTROL: the click ran", af && (af.error || af.note));
    ok(!fs.existsSync(path.join(addon, "map", "unitstacks.txt")), "⭐⭐⭐ Auto-fix writes no map/unitstacks.txt into the add-on", fx);
    ok(!fx.changed && Array.isArray(fx.leftInherited) && fx.leftInherited.length === 1 && fx.leftInherited[0].file === "map/unitstacks.txt" && fx.leftInherited[0].rows === expected.length && fx.leftInherited[0].from === "base game",
      "⭐ …and the step says what it left, and whose file it is", fx);
    const line = said(af);
    ok(new RegExp(`${expected.length} model position\\(s\\) in map/unitstacks\\.txt left at the old ground's height — your mod uses the base game's copy`).test(line), "⭐ …and so does the summary the modder reads", line.slice(-600));
    ok(/copy it into your mod's map folder yourself to have them moved\)/.test(line), "⭐ …with the same way out", line.slice(-300));
    // …and the way out is needed: a second and a third click leave the same rows on the list
    md.autoFixMap(G(addon));
    const af3 = md.autoFixMap(G(addon)), p3 = ruleOf(addon);
    ok(((af3.fixes || {}).modelsOnOldGround || {}).leftInherited && p3.length === 1 && p3[0].total === expected.length && p3[0].autoFix === false && !fs.existsSync(path.join(addon, "map", "unitstacks.txt")),
      "CONTROL: a third click leaves them too — nothing but the modder's own copy clears the report", p3.map((q) => ({ total: q.total, autoFix: q.autoFix })));
  }

  console.log("\n-- ⭐ 3. …and once the add-on owns a copy of the file, one click stands those rows on the new ground --");
  {
    // what the message tells the modder to do, and what an Auto-fix step does when it takes the file in for a repair of its own: a
    // copy, with the layer below's heights in it
    const file = write(addon, "map/unitstacks.txt", fs.readFileSync(path.join(game, "map", "unitstacks.txt")));
    const before = fs.readFileSync(file, "utf8").split("\n");
    const p = ruleOf(addon);
    ok(p.length === 1 && p[0].autoFix === true && p[0].total === expected.length && p[0].items.length === 1 && p[0].items[0].own === true,
      "⭐ the rule reports the copy's rows as the mod's own now, and offers Auto-fix", p);
    ok(p[0] && p[0].message === p[0].message.trim() && !/ {2}/.test(p[0].message) && /never a row you gave a height of your own\.$/.test(p[0].message), "…in a message that ends where its last sentence does", p[0] && p[0].message.slice(-120));
    {
      // ⭐ the file changes between the rule's read and the click's — an editor saving one line in at the top moves every row down one.
      // The step is handed the rule's answer (line numbers), so it must find the row the rule saw there, or write nothing.
      find(G(addon));
      const real = fs.readFileSync;
      let reads = 0;
      fs.readFileSync = function (q, ...rest) {
        const out = real.call(fs, q, ...rest);
        if (path.resolve(String(q)) !== path.resolve(file) || typeof out !== "string") return out;
        reads++;
        return "# a line an editor saved in\n" + out;
      };
      let raced;
      try { raced = md.fixModelsOnTheOldGround(G(addon)); } finally { fs.readFileSync = real; }
      ok(reads === 1, "CONTROL: the step read the file once, and was handed the rows from the answer the rule already had", reads);
      ok(!!raced && raced.rows && raced.rows.unitstacks === 0 && !(raced.files || {})["map/unitstacks.txt"] && fs.readFileSync(file, "utf8") === before.join("\n"),
        "⭐⭐ a file that changed under the click is left as it is: the step rewrites the row the rule saw, or nothing", raced);
    }
    const af = md.autoFixMap(G(addon));
    const fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    ok(fx.changed === true && fx.files && fx.files["map/unitstacks.txt"] === expected.length && fx.rows.unitstacks === expected.length && !fx.leftInherited,
      `⭐⭐ the click stood ${expected.length} rows back on the ground`, fx);
    const after = fs.readFileSync(file, "utf8").split("\n");
    const wantAt = new Map(expected.map((q) => [q.i, md.modelYForHeight(hAddon(q.px, q.row)).toFixed(2)]));
    const changed = after.map((l, i) => (l !== before[i] ? i : -1)).filter((i) => i >= 0);
    const onDisc = new Set(expected.map((q) => q.i));
    ok(after.length === before.length && changed.length === expected.length && changed.every((i) => onDisc.has(i)),
      "⭐⭐ exactly those lines changed; every other line is byte for byte the base game's", { changed, expected: [...onDisc] });
    ok(changed.length > 0 && changed.every((i) => { const a = before[i].split(";"), b = after[i].split(";"); return b[3] === wantAt.get(i) && a.every((c, k) => k === 3 || c === b[k]); }),
      "⭐ …and in each, only the height, now the new ground's under it", changed.map((i) => [after[i], wantAt.get(i)]));
    const line = said(af);
    ok(new RegExp(`stood ${expected.length} model position\\(s\\) back on the ground your map has now \\(${expected.length} in map/unitstacks\\.txt`).test(line), "⭐ the summary says how many, and where", line.slice(0, 900));
    const bytes = fs.readFileSync(file);
    const af2 = md.autoFixMap(G(addon));
    const fx2 = (af2 && af2.fixes && af2.fixes.modelsOnOldGround) || {};
    ok(!fx2.changed && Buffer.compare(bytes, fs.readFileSync(file)) === 0, "⭐⭐ a second click writes nothing", fx2);
    ok(ruleOf(addon).length === 0, "…and Map Errors is quiet");
  }

  console.log("\n-- ⭐ 3b. a copy an Auto-fix step takes in during the click is stood on the ground in the same click --");
  {
    // The base game keeps two bunkers on the sea the stroke paints: one keyed to state 2, whose land the stroke extends, and one
    // keyed to state 1, which the buildings.txt pass must re-home once it stands on state 2's land. Steps of the click take the base
    // game's buildings.txt in to write their repairs (the port pass first here, for the ports the new coast lacks, and the buildings
    // pass would); both bunkers come along in that copy, still at the sea's 9.50. The second carries a rotation, as a row the nudger
    // wrote does, so nothing but its being the layer below's row tells the rule it is one (#a-row-written-on-the-sea-floor's shape
    // would otherwise catch it here as well).
    const game2 = makeGame("game-bunkers");
    const zRow = (row) => `${zOf(row)}.00`;
    const OURS = `2;bunker;56.00;9.50;${zRow(52)};0.00;0`, THEIRS = `1;bunker;58.00;9.50;${zRow(52)};1.57;0`;
    fs.appendFileSync(path.join(game2, "map", "buildings.txt"), OURS + "\n" + THEIRS + "\n");
    const mod = path.join(ROOT, "addon-bunkers");
    write(mod, "descriptor.mod", 'name="old ground: a copy in the click"\n');
    const [r, g, b] = colour(LANDP), diff = [];
    for (let y = CY - R; y <= CY + R; y++) for (let x = CX - R; x <= CX + R; x++) if (inDisc(x, y)) diff.push({ x, y, r, g, b });
    const G2 = { modRoot: mod, gameRoot: game2, dependencyRoots: [] };
    const res = md.applyProvinceDiff({ ...G2, diff });
    const hM = heightAt(mod), wantOurs = md.modelYForHeight(hM(56, 52)).toFixed(2), wantTheirs = md.modelYForHeight(hM(58, 52)).toFixed(2);
    ok(res && res.ok !== false && !fs.existsSync(path.join(mod, "map", "buildings.txt")) && off1({ y: "9.50" }, hM(56, 52)) && off1({ y: "9.50" }, hM(58, 52)),
      "CONTROL: the stroke raised the bunkers' sea, and the add-on still inherits buildings.txt", res && (res.error || res.heightmap));
    // before the click the rule counts both bunkers in the inherited file, and promises the copy-in will stand them on the ground
    const pre = find(G2).files.find((f) => f.name === "buildings.txt") || { rows: [] };
    ok(pre.own === false && pre.rows.length === 2, "CONTROL: before the click both bunkers are reported, in the base game's buildings.txt the add-on uses", pre.rows.map((q) => q.key + "@" + q.y));
    const af = md.autoFixMap(G2);
    const bt = (af && af.fixes && af.fixes.buildingsTxt) || {}, fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    ok(fs.existsSync(path.join(mod, "map", "buildings.txt")) && bt.changed && bt.rehomed === 1 && fx.leftInherited && fx.leftInherited.length === 1 && fx.leftInherited[0].file === "map/unitstacks.txt",
      "CONTROL: the click took buildings.txt in and re-homed the other state's bunker (unitstacks.txt, which nothing copied, is left and said)", { bt, fx });
    const after = rowsOf(path.join(mod, "map", "buildings.txt"), H), ours = after.find((q) => q.line.startsWith("2;bunker;56.00;"));
    ok(!!ours && ours.y === wantOurs, `⭐⭐ …and the bunker that came along in that copy stands on the new land, ${wantOurs}, in the same click`, { ours: ours && ours.line, fx });
    // #a-re-homed-row-is-still-the-layer-belows — the other one is the same row of the layer below with one column rewritten by this
    // very click. With the state in the key it matched nothing below, stayed at 9.50 and dropped off the list: a second click left it.
    // Picked out by x AND z: since #a-fort-stands-off-its-depot the bunkers the click writes for state 2's other provinces stand on
    // spots of their own, one of them at x 58 too (on their town points, none was), so x alone found two rows.
    const [, , theirX, , theirZ] = THEIRS.split(";");
    const theirs = after.filter((q) => { const c = q.line.split(";"); return c[1] === "bunker" && c[2] === theirX && c[4] === theirZ; });
    ok(theirs.length === 1 && theirs[0].line === `2;bunker;58.00;${wantTheirs};${zRow(52)};1.57;0`,
      `⭐⭐⭐ …and so does the bunker the buildings pass re-homed to state 2 in the same click: only its state and its height differ from the base game's row`, theirs.map((q) => q.line));
    ok(fx.rows && fx.rows.buildings === 2, "⭐ the step counts both", fx.rows);
    const left = find(G2);
    ok(left.files.every((f) => f.name !== "buildings.txt"), "…and no building is left on the list", left.files.map((f) => ({ name: f.name, n: f.rows.length })));
  }

  console.log("\n-- ⭐ 4. an old world: the mod's own verbatim copies, the ground sunk under them, one row the modder moved --");
  {
    const mod = path.join(ROOT, "old");
    write(mod, "descriptor.mod", 'name="old ground: an old world"\n');
    // a world built before any re-seat: the heights were written, the model files copied from the base game and never moved
    write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SUNK ? 89 : heightBelow(x, y))));
    write(mod, "map/buildings.txt", fs.readFileSync(path.join(game, "map", "buildings.txt")));
    const NUDGED = { id: SUNK, t: 0 }, NUDGED_Y = "13.37";
    const u = fs.readFileSync(path.join(game, "map", "unitstacks.txt"), "utf8").split("\n").map((l) => (l.startsWith(`${NUDGED.id};${NUDGED.t};`) ? l.split(";").map((c, k) => (k === 3 ? NUDGED_Y : c)).join(";") : l));
    // …saved by the modder's editor: CRLF, and a comment in cp1252 — a byte that is not UTF-8, which a decode and re-encode destroys
    const COMMENT = Buffer.from("# Côte d'Ivoire's stacks, placed by hand\r\n", "latin1");
    const file = write(mod, "map/unitstacks.txt", Buffer.concat([COMMENT, Buffer.from(u.join("\r\n"), "latin1")]));
    const hMod = heightAt(mod), rows = rowsOf(file, H);
    const nudged = rows.find((q) => q.line.startsWith(`${NUDGED.id};${NUDGED.t};`));
    // the rows the rule must report, derived: on ground that changed, more than 1 off it, and still the base game's line
    const baseLines = new Set(gameRows.u.map((q) => q.line));
    const expectU = rows.filter((q) => hMod(q.px, q.row) !== hGame(q.px, q.row) && off1(q, hMod(q.px, q.row)) && baseLines.has(q.line));
    const expectB = rowsOf(path.join(mod, "map", "buildings.txt"), H).filter((q) => hMod(q.px, q.row) !== hGame(q.px, q.row) && off1(q, hMod(q.px, q.row)));
    const low = rows.find((q) => q.key === keyOf(PLANTED.low15));
    const dLow = Math.abs(md.modelYForHeight(LOW_H) - md.modelYForHeight(89));
    ok(!!low && hGame(low.px, low.row) === LOW_H && hMod(low.px, low.row) === 89 && dLow <= 0.5 && off1(low, 89),
      `CONTROL: the row set 1.5 over the low strip (${PLANTED.low15.y}) stands on ground sunk ${LOW_H} → 89, which moves the ground's y by only ${dLow.toFixed(2)} — a "moved by more than 0.5" gate does not see it`, low && low.line);
    ok(!!nudged && off1(nudged, 89) && hMod(nudged.px, nudged.row) !== hGame(nudged.px, nudged.row), "CONTROL: the row the modder moved to 13.37 stands off ground that moved too — only its height tells it from the base game's", nudged && nudged.line);
    ok(expectU.length >= 5 && expectB.length === 1 && expectU.some((q) => q === low) && !expectU.includes(nudged), `CONTROL: ${expectU.length} unit rows and ${expectB.length} building on the sunk province are the base game's, off the new ground`, { u: expectU.map((q) => q.line), b: expectB.map((q) => q.line) });

    const found = find(G(mod));
    const byName = (n) => found.files.find((f) => f.name === n) || { rows: [] };
    const gotU = new Set(byName("unitstacks.txt").rows.map((q) => q.i)), gotB = new Set(byName("buildings.txt").rows.map((q) => q.i));
    ok(found.total === expectU.length + expectB.length && expectU.every((q) => gotU.has(q.i)) && gotU.size === expectU.length && expectB.every((q) => gotB.has(q.i)) && gotB.size === expectB.length,
      `⭐⭐ the finder reports exactly those ${expectU.length + expectB.length} rows of the mod's own files`, { total: found.total, u: [...gotU], b: [...gotB] });
    ok(gotU.has(low.i), "⭐⭐ …the row over the low strip among them: ANY change of the ground under it", low.line);
    ok(!gotU.has(nudged.i), "⭐⭐ …and never the row the modder moved", nudged.line);
    // the threshold, without a workshop install: the base game's row on the same sunk ground, 0.8 over the sea it became
    const near = rows.find((q) => q.key === keyOf(PLANTED.near08)), dNear = near ? Math.abs(+near.y - md.modelYForHeight(89)) : -1;
    ok(!!near && baseLines.has(near.line) && hMod(near.px, near.row) !== hGame(near.px, near.row) && dNear > 0.5 && dNear <= 1,
      `CONTROL: a base-game row stands ${dNear.toFixed(2)} over the same sunk ground — off it, by less than 1`, near && near.line);
    ok(!!near && !gotU.has(near.i), "⭐⭐ …nor a row within 1 of the ground it has now: more than 1 off is the rule, not any difference", near && near.line);
    const still = rows.find((q) => q.key === keyOf(PLANTED.still08)), outlier = rows.find((q) => q.y === OUTLIER);
    ok(!!still && !!outlier && !gotU.has(still.i) && !gotU.has(outlier.i), "⭐ …nor a row set off ground that never moved, by the base game or by a modder", [still && still.line, outlier && outlier.line]);
    const p = ruleOf(mod);
    ok(p.length === 1 && p[0].autoFix === true && p[0].total === found.total && p[0].items.every((it) => it.own), "the rule reports them as the mod's own, and offers Auto-fix", p);

    const before = { u: fs.readFileSync(file, "utf8").split("\n") };
    const af = md.autoFixMap(G(mod));
    const fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    ok(fx.changed === true && fx.rows.unitstacks === expectU.length && fx.rows.buildings === expectB.length, "⭐⭐ the click stood them on the ground", fx);
    const afterU = fs.readFileSync(file, "utf8").split("\n"), afterB = rowsOf(path.join(mod, "map", "buildings.txt"), H);
    const sunkY = md.modelYForHeight(89).toFixed(2);
    // only the height: each line as it was with column 4 alone rewritten
    const reseated = (was, now) => { const a = was.split(";"), b = String(now).split(";"); return b[3] === sunkY && a.length === b.length && a.every((c, k) => k === 3 || c === b[k]); };
    ok(expectU.every((q) => reseated(before.u[q.i], afterU[q.i])), `⭐ …each unit row at the sunk ground's ${sunkY}, and only its height changed`, expectU.map((q) => afterU[q.i]));
    // buildings.txt is rewritten by other steps of the click too (it takes ports and slots), so its row is found by its key
    ok(expectB.every((q) => afterB.filter((a) => a.key === q.key).length === 1 && reseated(q.line, afterB.find((a) => a.key === q.key).line)),
      `⭐ …and the building on the sunk province too`, expectB.map((q) => (afterB.find((a) => a.key === q.key) || {}).line));
    ok(afterU[nudged.i] === before.u[nudged.i], "⭐⭐ the row the modder moved keeps its bytes", afterU[nudged.i]);
    const otherU = afterU.filter((l, i) => !gotU.has(i) && l !== before.u[i]);
    ok(afterU.length === before.u.length && !otherU.length, "…and every other line of map/unitstacks.txt is what it was", otherU);
    const bytes = fs.readFileSync(file);
    const loneLf = [...bytes].filter((c, k) => c === 10 && bytes[k - 1] !== 13).length;
    ok(bytes.subarray(0, COMMENT.length).equals(COMMENT) && loneLf === 0, "⭐ …byte for byte: the cp1252 comment keeps its byte, and every line still ends in CRLF", { head: bytes.subarray(0, COMMENT.length).toString("latin1"), loneLf });
    const fx2 = (md.autoFixMap(G(mod)).fixes || {}).modelsOnOldGround || {};
    ok(!fx2.changed && Buffer.compare(bytes, fs.readFileSync(file)) === 0, "⭐ a second click writes nothing", fx2);
    ok(ruleOf(mod).length === 0, "…and Map Errors is quiet");

    // …and the same world declaring replace_path="map": the game loads nothing beneath its map, so no row is the layer below's
    const rep = path.join(ROOT, "old-replaces");
    write(rep, "descriptor.mod", 'name="old ground: replaces map"\nreplace_path="map"\n');
    write(rep, "map/heightmap.bmp", fs.readFileSync(path.join(mod, "map", "heightmap.bmp")));
    for (const f of ["buildings.txt", "unitstacks.txt"]) write(rep, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const r = find(G(rep));
    ok(found.total > 0 && r.total === 0 && /no layer below/.test(r.reason || ""), `⭐ a mod that replaces map/ has no layer below to have left a row on (the same ground and rows without the line: ${found.total})`, r);
  }

  console.log("\n-- ⭐ 4b. a heightmap one grey level up, a hill raised and a plain lowered: the base game's own outliers are not the mod's doing --");
  {
    // #the-layer-belows-own-outlier — an image editor's levels tweak: all the base game's land one grey level up, 0.098 of a model
    // unit. And two provinces really reshaped, land to land: a hill raised under the rows of one, the plain of another lowered 0.59.
    const mod = path.join(ROOT, "levels");
    write(mod, "descriptor.mod", 'name="old ground: levels"\n');
    const HILL = SUNK, HILL_H = 140, DIP = idAt(0, 0), DIP_H = 100;
    write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y), h = heightBelow(x, y); return p === HILL ? HILL_H : p === DIP ? DIP_H : h > 95 ? h + 1 : h; }));
    for (const f of ["buildings.txt", "unitstacks.txt"]) write(mod, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const hMod = heightAt(mod), yAt = (h) => md.modelYForHeight(h);
    const rows = rowsOf(path.join(mod, "map", "unitstacks.txt"), H), bRows = rowsOf(path.join(mod, "map", "buildings.txt"), H);
    const was = (q) => hGame(q.px, q.row), now = (q) => hMod(q.px, q.row);
    const outlier = rows.find((q) => q.y === OUTLIER), buried = bRows.find((q) => q.line === BURIED);
    const high20 = rows.find((q) => q.key === keyOf(PLANTED.high20)), still08 = rows.find((q) => q.key === keyOf(PLANTED.still08));
    // what "the ground changed at all" reported: every row of the base game's on changed ground, more than 1 off it
    const anyChange = rows.concat(bRows).filter((q) => now(q) !== was(q) && off1(q, now(q)));
    ok(!!outlier && !!buried && anyChange.includes(outlier) && anyChange.includes(buried) && off1(outlier, was(outlier)) && off1(buried, was(buried)) && now(outlier) === was(outlier) + 1 && now(buried) === was(buried) + 1,
      `CONTROL: the base game's ${OUTLIER} and its buried bunker stand more than 1 off ground the mod moved by one grey level — as they stood more than 1 off it before`, [outlier && outlier.line, buried && buried.line]);
    const found = find(G(mod));
    const byName = (n) => found.files.find((f) => f.name === n) || { rows: [] };
    const gotU = new Set(byName("unitstacks.txt").rows.map((q) => q.i)), gotB = new Set(byName("buildings.txt").rows.map((q) => q.i));
    ok(!!outlier && !gotU.has(outlier.i), "⭐⭐⭐ the row the base game set 4.37 over its own ground is not reported: a grey level did not put it there", outlier && outlier.line);
    ok(!!buried && !gotB.has(buried.i), "⭐⭐ …nor the base game's own bunker at the sea floor's height: it is the layer below's row, judged by the move and not by its shape", buried && buried.line);
    // exactly: every base row on the hill (each more than 1 under it now), and the one row the lowered plain left more than 1 over it
    const expectU = rows.filter((q) => provAt(q.px, q.row) === HILL).concat(still08 ? [still08] : []), expectB = bRows.filter((q) => provAt(q.px, q.row) === HILL);
    ok(expectU.length === 10 && expectB.length === 1 && expectU.concat(expectB).every((q) => off1(q, now(q))),
      `CONTROL: ${expectU.length} unit rows and ${expectB.length} building stand more than 1 off the two provinces really reshaped`, expectU.concat(expectB).map((q) => q.line));
    ok(found.total === expectU.length + expectB.length && expectU.every((q) => gotU.has(q.i)) && gotU.size === expectU.length && expectB.every((q) => gotB.has(q.i)) && gotB.size === expectB.length,
      "⭐⭐ the finder reports exactly those", { total: found.total, u: [...gotU], b: [...gotB] });
    ok(!!high20 && gotU.has(high20.i) && off1(high20, was(high20)) && was(high20) > 95 && Math.abs(yAt(HILL_H) - yAt(was(high20))) > 1,
      `⭐⭐ …a row the base game set 2.0 over its own ground among them: the hill moved the ground by ${Math.abs(yAt(HILL_H) - yAt(LAND_H)).toFixed(2)} under it, land to land`, high20 && high20.line);
    ok(!!still08 && gotU.has(still08.i) && !off1(still08, was(still08)) && Math.abs(yAt(DIP_H) - yAt(LAND_H)) <= 1,
      `⭐⭐ …and a row that stood within 1 of the old ground, which a move of only ${Math.abs(yAt(DIP_H) - yAt(LAND_H)).toFixed(2)} left more than 1 over the new`, still08 && still08.line);
    const p = ruleOf(mod), msg = (p[0] && p[0].message) || "";
    ok(p.length === 1 && p[0].total === found.total && /still store the height of ground your map has since moved/.test(msg) && /these store the height the map below yours gives them\. /.test(msg) && !/stand at the height the ground has/.test(msg),
      "⭐ the message claims what holds for every one of them — the height the map below gives the row — not that it stood on the old ground", msg.slice(0, 520));
    // …and the same heightmap over INHERITED model files, where every row is the layer below's: the same rows, the same two left out
    const bare = path.join(ROOT, "levels-inherits");
    write(bare, "descriptor.mod", 'name="old ground: levels, inherited files"\n');
    write(bare, "map/heightmap.bmp", fs.readFileSync(path.join(mod, "map", "heightmap.bmp")));
    const inh = find(G(bare)), lines = (res, n) => ((res.files.find((f) => f.name === n) || { rows: [] }).rows.map((q) => q.i).join(","));
    ok(inh.total === found.total && inh.files.length === 2 && inh.files.every((f) => f.own === false && f.from === "base game" && f.floor === 0) && ["buildings.txt", "unitstacks.txt"].every((n) => lines(inh, n) === lines(found, n)),
      "⭐⭐ the same heightmap over inherited files reports the same rows of the base game's — its outlier and its buried bunker left out there too", inh.files.map((f) => ({ name: f.name, own: f.own, n: f.rows.length, floor: f.floor })));
  }

  console.log("\n-- ⭐ 4c. a world built before the re-seat: buildings written on the sea floor, and the land raised under them afterwards --");
  {
    // #a-row-written-on-the-sea-floor — what Delete map → Generate land left before 6a1fd27: a state's slots written over the sea at
    // the floor's 9.50, in the slot writer's shape (a whole-pixel x and z, no rotation, no sea province), and the land raised under
    // them afterwards. None is a row of the layer below's, so nothing but that shape tells the rule what they are.
    const mod = path.join(ROOT, "floor");
    write(mod, "descriptor.mod", 'name="old ground: the sea floor"\n');
    const [r, g, b] = colour(LANDP), diff = [];
    for (let y = CY - R; y <= CY + R; y++) for (let x = CX - R; x <= CX + R; x++) if (inDisc(x, y)) diff.push({ x, y, r, g, b });
    const res = md.applyProvinceDiff({ ...G(mod), diff });
    const zr = (row) => `${zOf(row)}.00`, FLOOR_Y = md.modelYForHeight(0).toFixed(2);
    // three on the sea the stroke raised — and one where the land stands at the very height the base game has there, as 144 of TEST
    // 29's do: the ground such a row was written on was the mod's own sea, which the layer below's heightmap says nothing about
    const SAME = `2;arms_factory;44.00;${FLOOR_Y};${zr(40)};0.00;0`;
    const NOVA = [`2;arms_factory;55.00;${FLOOR_Y};${zr(54)};0.00;0`, `2;arms_factory;56.00;${FLOOR_Y};${zr(54)};0.00;0`, `2;industrial_complex;57.00;${FLOOR_Y};${zr(55)};0.00;0`, SAME];
    // …and three that are somebody's hand: a rotation (the nudger's), a place between pixels, and a port — it names its sea
    // province, and sits at the waterline by design
    const TURNED = `2;bunker;58.00;${FLOOR_Y};${zr(54)};1.57;0`, BETWEEN = `2;bunker;58.50;${FLOOR_Y};${zr(55)};0.00;0`;
    const PORT = `2;naval_base;57.00;${FLOOR_Y};${zr(56)};0.00;${SEAP}`;
    const file = write(mod, "map/buildings.txt", fs.readFileSync(path.join(game, "map", "buildings.txt"), "utf8") + NOVA.concat([TURNED, BETWEEN, PORT]).join("\n") + "\n");
    const hMod = heightAt(mod), rows = rowsOf(file, H), lineOf = (l) => rows.find((q) => q.line === l);
    const mine = NOVA.concat([TURNED, BETWEEN, PORT]).map(lineOf), same = lineOf(SAME);
    // the height each row wants: the ground under it, as the stroke left it (read off the disk, #a-painted-coast-rises-like-the-generators)
    const wantOf = (q) => md.modelYForHeight(hMod(q.px, q.row)).toFixed(2), wantFor = (l) => wantOf(lineOf(l));
    ok(res && res.ok !== false && mine.every((q) => q && q.y === "9.50" && hMod(q.px, q.row) > md.HEIGHTMAP_SEA_LEVEL && off1(q, hMod(q.px, q.row))) && mine.filter((q) => hGame(q.px, q.row) === 89).length === 6 && hGame(same.px, same.row) === LAND_H && hMod(same.px, same.row) === LAND_H
      && !gameRows.b.some((q) => mine.some((m) => m.key.split(";").slice(1).join(";") === q.key.split(";").slice(1).join(";"))),
      `CONTROL: seven rows of the mod's own stand at the floor's 9.50, each more than 1 under the land it is in (${mine.map((q) => q && hMod(q.px, q.row)).join(" ")}) — six where the stroke raised the sea, one where the land is as high as the base game's — and none is a row of the base game's`, mine.map((q) => q && q.line));
    const found = find(G(mod));
    const fb = found.files.find((f) => f.name === "buildings.txt") || { rows: [] };
    const got = new Set(fb.rows.map((q) => q.i));
    const wantAtLine = new Map(rows.map((q) => [q.i, wantOf(q)]));
    ok(fb.own === true && NOVA.every((l) => got.has(lineOf(l).i)) && got.size === NOVA.length && fb.floor === NOVA.length && fb.under === NOVA.length && fb.rows.every((q) => q.floor === true && q.want === wantAtLine.get(q.i)),
      `⭐⭐⭐ the finder reports exactly the ${NOVA.length} rows in the slot writer's shape, as rows on the sea floor, each wanting the ground under it`, fb);
    ok(got.has(same.i), "⭐⭐ …the one on land as high as the base game's among them: a sea-floor row is judged against the ground the mod has, not the layer below's", SAME);
    ok(!got.has(lineOf(TURNED).i), "⭐⭐ …never the one with a rotation: the nudger wrote that, or a modder", TURNED);
    ok(!got.has(lineOf(BETWEEN).i), "⭐⭐ …nor the one placed between two pixels", BETWEEN);
    ok(!got.has(lineOf(PORT).i), "⭐⭐ …nor the port, which names its sea province and sits at the waterline by design", PORT);
    const p = ruleOf(mod), msg = (p[0] && p[0].message) || "";
    ok(p.length === 1 && p[0].autoFix === true && new RegExp(`or the sea floor's 9\\.50, where a building was placed before the land under it was raised \\(${NOVA.length} of them\\)\\. `).test(msg),
      "⭐ Map Errors says which of them those are, and offers Auto-fix", msg);
    const af = md.autoFixMap(G(mod)), fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    const after = fs.readFileSync(file, "utf8").split("\n").map((l) => l.replace(/\r$/, ""));
    ok(fx.changed === true && fx.rows.buildings === NOVA.length && NOVA.every((l) => after.includes(l.replace(`;${FLOOR_Y};`, `;${wantFor(l)};`)) && !after.includes(l)),
      "⭐⭐ one click stands them on the land under each, and changes nothing else of the row", { fx, rows: after.filter((l) => /;5[5-8]\.\d\d;/.test(l)) });
    ok([TURNED, BETWEEN, PORT].every((l) => after.includes(l)), "⭐⭐ …and the other three keep their bytes", after.filter((l) => l.includes(`;${FLOOR_Y};`)));
    const bytes = fs.readFileSync(file);
    const fx2 = (md.autoFixMap(G(mod)).fixes || {}).modelsOnOldGround || {};
    ok(fx2.rows && fx2.rows.buildings === 0 && Buffer.compare(bytes, fs.readFileSync(file)) === 0 && find(G(mod)).files.every((f) => f.name !== "buildings.txt"), "⭐ a second click writes nothing, and no building is left on the list", fx2);
  }

  console.log("\n-- ⭐ 5. a direct call for a mod that owns no heightmap reads no model file --");
  {
    const bare = path.join(ROOT, "bare");
    write(bare, "descriptor.mod", 'name="old ground: bare"\n');
    const spyOn = (fn) => {
      const real = fs.readFileSync, seen = [];
      fs.readFileSync = function (p, ...rest) { seen.push(String(p)); return real.call(fs, p, ...rest); };
      try { return { out: fn(), seen }; } finally { fs.readFileSync = real; }
    };
    const modelReads = (seen) => seen.filter((p) => /(buildings|unitstacks)\.txt$|heightmap\.bmp$/.test(p.replace(/\\/g, "/")));
    md.clearMapLayerCache();
    const a = spyOn(() => find(G(bare)));
    ok(a.out.total === 0 && /does not own map\/heightmap\.bmp/.test(a.out.reason || ""), "the finder answers at once for a mod with no heightmap of its own", a.out);
    ok(modelReads(a.seen).length === 0, "⭐⭐ …and reads neither heightmap nor either model file", modelReads(a.seen));
    // CONTROL: the spy sees the reads when there is something to read (the cache emptied, so the finder asks the disk)
    md.clearMapLayerCache();
    const b = spyOn(() => find(G(path.join(ROOT, "same"))));
    ok(modelReads(b.seen).length >= 4, "CONTROL: for a mod that owns its heightmap the same spy sees both heightmaps and the model files read", modelReads(b.seen));
  }

  console.log("\n-- ⭐ 5b. a layer below of another size; a file inherited from a dependency; a row standing off the map --");
  {
    // another size: nothing can be compared pixel for pixel (Old World Blues over the base game is 5632x2304 over 5632x2048)
    const tall = path.join(ROOT, "taller");
    write(tall, "descriptor.mod", 'name="old ground: another size"\n');
    write(tall, "map/heightmap.bmp", bmp8(W, H + CELL, () => 130));
    for (const f of ["buildings.txt", "unitstacks.txt"]) write(tall, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const offFlat = gameRows.u.concat(gameRows.b).filter((q) => off1(q, 130)).length;
    const t = find(G(tall));
    ok(offFlat > 100 && t.total === 0 && t.files.length === 0 && t.reason === `the layer below is ${W}x${H}, this map ${W}x${H + CELL}`,
      `⭐⭐ a map of another size than the layer below is declined, and says why (${offFlat} of its verbatim rows stand more than 1 off its flat ground, there to be reported by a comparison at the wrong pixels)`, t);

    // a map mod between the add-on and the base game: it owns the unit stacks the add-on uses — the base game's rows, and one more
    // that stands a whole map's width off the right edge
    const dep = path.join(ROOT, "dep");
    write(dep, "descriptor.mod", 'name="old ground: the map mod below"\n');
    const OFF_MAP = `${SEAP};0;${W + CX}.00;9.50;${zOf(CY + 1)}.00;0.00;0.24`;
    const depFile = write(dep, "map/unitstacks.txt", fs.readFileSync(path.join(game, "map", "unitstacks.txt"), "utf8") + OFF_MAP + "\n");
    const on = path.join(ROOT, "addon-on-dep");
    write(on, "descriptor.mod", 'name="old ground: paint over a dependency"\ndependencies={ "old ground: the map mod below" }\n');
    const GD = { modRoot: on, gameRoot: game, dependencyRoots: [dep] };
    const [r, g, b] = colour(LANDP), diff = [];
    for (let y = CY - R; y <= CY + R; y++) for (let x = CX - R; x <= CX + R; x++) if (inDisc(x, y)) diff.push({ x, y, r, g, b });
    const res = md.applyProvinceDiff({ ...GD, diff });
    const depRows = rowsOf(depFile, H), offMap = depRows.find((q) => q.line === OFF_MAP), under = underNewLand(depRows, heightAt(on));
    // a row of this heightmap is W bytes, so an x of W + CX read with no bounds check is the pixel (CX, row - 1): the middle of the stroke,
    // whose new ground stands more than 1 above a row at the sea's 9.50
    ok(res && res.ok !== false && off1({ y: "9.50" }, heightAt(on)(CX, CY)) && !fs.existsSync(path.join(on, "map", "unitstacks.txt")) && !!offMap && offMap.px === W + CX && offMap.row - 1 === CY && under.length === expected.length && !under.includes(offMap),
      `CONTROL: the add-on inherits the dependency's unit stacks: the ${under.length} rows under the stroke, and one standing ${W} px off the map whose x wraps onto the stroke's middle`, offMap && offMap.line);
    const found = find(GD), f = found.files[0] || { rows: [] };
    ok(found.files.length === 1 && f.name === "unitstacks.txt" && f.own === false && f.from === "dependency",
      "⭐⭐ the finder says the file is the dependency's", { name: f.name, own: f.own, from: f.from });
    const got = new Set(f.rows.map((q) => q.i));
    ok(under.every((q) => got.has(q.i)) && got.size === under.length, "⭐ …with exactly the rows under the stroke", f.rows.map((q) => q.key));
    ok(!!offMap && !got.has(offMap.i), "⭐⭐ …and never the row off the map: it stands on no pixel", offMap && offMap.line);
    const p = md.validateMapBitmap(GD).filter((q) => q.rule === RULE), msg = (p[0] && p[0].message) || "";
    ok(p.length === 1 && p[0].autoFix === false && /in map\/unitstacks\.txt \(the copy in the mod yours depends on, which your mod uses\)/.test(msg) && msg.includes("copy unitstacks.txt from the map folder of the mod yours depends on into your mod's map folder yourself"),
      "⭐⭐ Map Errors says whose copy it is, and names the dependency's folder as the one to copy it from", msg);
    const af = md.autoFixMap(GD), fx = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
    ok(Array.isArray(fx.leftInherited) && fx.leftInherited.length === 1 && fx.leftInherited[0].from === "dependency" && fx.leftInherited[0].rows === under.length && !fs.existsSync(path.join(on, "map", "unitstacks.txt")),
      "⭐ the click leaves it, and says it is the dependency's", fx);
    const line = said(af);
    ok(new RegExp(`${under.length} model position\\(s\\) in map/unitstacks\\.txt left at the old ground's height — your mod uses the copy of the mod it depends on`).test(line), "⭐⭐ …as the summary does", line.slice(-420));
  }

  console.log("\n-- 6. the installed shipping maps, each the active mod over the base game --");
  {
    // Derived: every workshop map that owns map/heightmap.bmp. Pinned: what the rule reports on each, measured 2026-09-30 — each
    // really more than 1 off the ground that map gave it (`floor`: how many of them for the sea floor's height and the slot writer's
    // shape). Any other map reports nothing; one row more is seen here. ⚠ A Steam update of a map moves its count: re-measure
    // before blaming the rule.
    // ⚠ A skip reads as a pass: sections 1-5 carry the guard; this pins the corpus where it is installed.
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    const PINNED = { 2777392649: { "buildings.txt": 3, "unitstacks.txt": 4, floor: 2 }, 3721160655: { "buildings.txt": 4, floor: 1 }, 820260968: { "buildings.txt": 33 } };
    if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp")) || !fs.existsSync(WS)) console.log("  ..   (the base game or the workshop is not installed — the shipping maps were NOT measured)");
    else {
      const maps = fs.readdirSync(WS).filter((id) => fs.existsSync(path.join(WS, id, "map", "heightmap.bmp")));
      ok(maps.length >= 1, `found ${maps.length} installed map(s) that own a heightmap`, maps);
      for (const id of maps) {
        const found = find({ modRoot: path.join(WS, id), gameRoot: GAME, dependencyRoots: [] });
        const got = {}, floor = found.files.reduce((s, f) => s + (f.floor || 0), 0);
        for (const f of found.files) got[f.name] = f.rows.length;
        if (floor) got.floor = floor;
        const want = PINNED[id] || {};
        ok(JSON.stringify(got) === JSON.stringify(want), `${id}: ${found.total} row(s) ${JSON.stringify(got)}${found.reason ? ` (${found.reason})` : ""}, pinned ${JSON.stringify(want)}`, { got, want });
      }
    }
  }
} catch (e) {
  fail++; console.log("  FAIL harness error: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
