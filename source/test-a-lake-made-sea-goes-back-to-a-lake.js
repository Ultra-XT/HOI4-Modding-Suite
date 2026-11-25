// ⛔ #a-lake-made-sea-goes-back-to-a-lake (B1-27) — a cut-off sea that WAS A LAKE is repaired by making it that lake again, never land.
//
// The inspector's Type -> sea on a lake writes `sea` and keeps the `lakes` terrain; the lake is then a sea cut off from the ocean, which
// fixInlandSeas and fixLoneSeas repair. Both made it LAND: vanilla's lake 2703 (4,288 px) became marsh and the Caspian 1496 (4,055 px)
// desert, 10-15 picture files were repainted, and the summary said "reverted ... to land" of a province that was never land. The one
// correct answer is the lake the layer below has — or, with nothing below, the lake the row's own `lakes` terrain says it was (vanilla
// ships no sea row on `lakes`) — and a type change to lake repaints no picture. A cut-off sea that was never a lake still becomes land.
//
// Fixtures: a 24×4 provinces.bmp, column -> province: 1 land | 2 SEA cut off (land region) | 3 land | 4 SEA (sea region, kept) | 5 land |
// 6,7 the ocean | 8 land. Run: node test-a-lake-made-sea-goes-back-to-a-lake.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0], 5: [200, 0, 200], 6: [0, 200, 200], 7: [100, 150, 200], 8: [150, 100, 50] };
const provAtX = (x) => (x <= 3 ? 1 : x <= 5 ? 2 : x <= 9 ? 3 : x <= 11 ? 4 : x <= 15 ? 5 : x <= 17 ? 6 : x <= 19 ? 7 : 8);
const defRows = (row2) => [
  "0;0;0;0;land;false;unknown;0;",
  "1;200;0;0;land;false;plains;3;",
  row2,
  "3;0;0;200;land;false;hills;3;",
  "4;200;200;0;sea;false;ocean;0;",
  "5;200;0;200;land;false;plains;3;",
  "6;0;200;200;sea;false;ocean;0;",
  "7;100;150;200;sea;false;ocean;0;",
  "8;150;100;50;land;false;desert;3;",
].join("\r\n") + "\r\n";
const reg = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs} }\n\tweather={}\n}\n`;
function writeMap(root, row2) {
  mk(path.join(root, "map", "provinces.bmp"), bmp24(24, 4, (x) => COL[provAtX(x)]));
  mk(path.join(root, "map", "definition.csv"), defRows(row2));
  mk(path.join(root, "map", "strategicregions", "land.txt"), reg(100, "1 2 3 5 8"));
  mk(path.join(root, "map", "strategicregions", "caspian.txt"), reg(200, "4"));
  mk(path.join(root, "map", "strategicregions", "ocean.txt"), reg(300, "6 7"));
}
/** a mod that replaces map/ outright (no layer below): province 2 is `row2` */
function totalConversion(row2) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakesea-tc-"));
  mk(path.join(mod, "descriptor.mod"), 'name="LakeSea"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  writeMap(mod, row2);
  return { mod, game: null };
}
/** an add-on over a base whose province 2 is a LAKE; the add-on's own definition.csv has it `row2` */
function addOnOverLake(row2) {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakesea-game-"));
  writeMap(game, "2;0;200;0;lake;false;lakes;0;");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakesea-mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="LakeSeaAddOn"\n');
  mk(path.join(mod, "map", "definition.csv"), defRows(row2));
  return { mod, game };
}
const rowOf = (mod, id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");
const snapshot = (root) => {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.set(path.relative(root, f).replace(/\\/g, "/"), crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex")); } };
  walk(root);
  return out;
};
const changedFiles = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
const keep = [];
const done = (fx) => keep.push(fx);

console.log("=== fixInlandSeas: a cut-off sea that was a lake becomes that lake ===");
(() => {
  const fx = totalConversion("2;0;200;0;sea;false;lakes;0;"); done(fx);
  const before = snapshot(fx.mod);
  const r = md.fixInlandSeas({ modRoot: fx.mod });
  ok("one province repaired", r.fixed === 1, r);
  ok("…and counted as a lake (r.lakes)", r.lakes === 1, r);
  ok("…and said as a lake in its details", r.details && r.details[0] && r.details[0].province === 2 && r.details[0].lake === true, r.details);
  ok("disk: province 2 is a LAKE again, on lakes (no layer below: its own terrain said lake)", rowOf(fx.mod, 2) === "2;0;200;0;lake;false;lakes;0;", rowOf(fx.mod, 2));
  ok("disk: only map/definition.csv changed — no picture repainted", JSON.stringify(changedFiles(before, snapshot(fx.mod))) === JSON.stringify(["map/definition.csv"]), changedFiles(before, snapshot(fx.mod)));
  ok("the sea-region sea and the ocean stay sea", /;sea;/.test(rowOf(fx.mod, 4)) && /;sea;/.test(rowOf(fx.mod, 6)) && /;sea;/.test(rowOf(fx.mod, 7)));
  const r2 = md.fixInlandSeas({ modRoot: fx.mod });
  ok("a second pass repairs nothing", r2.fixed === 0 && !r2.lakes, r2);
})();
(() => {
  const fx = addOnOverLake("2;0;200;0;sea;false;ocean;0;"); done(fx);
  const r = md.fixInlandSeas({ modRoot: fx.mod, gameRoot: fx.game });
  ok("an add-on: the layer below's lake decides, whatever the row's terrain now", r.lakes === 1 && rowOf(fx.mod, 2) === "2;0;200;0;lake;false;lakes;0;", { r, row: rowOf(fx.mod, 2) });
})();
(() => {
  // CONTROL: a cut-off sea that was never a lake is still made land, as before
  const fx = totalConversion("2;0;200;0;sea;false;ocean;0;"); done(fx);
  const r = md.fixInlandSeas({ modRoot: fx.mod });
  ok("CONTROL: a cut-off sea on ocean is made land, and not counted a lake", r.fixed === 1 && !r.lakes && /;land;/.test(rowOf(fx.mod, 2)), { r, row: rowOf(fx.mod, 2) });
})();

console.log("=== fixLoneSeas: a lone sea that was a lake becomes that lake ===");
(() => {
  const fx = totalConversion("2;0;200;0;sea;false;lakes;0;"); done(fx);
  const before = snapshot(fx.mod);
  const r = md.fixLoneSeas({ modRoot: fx.mod, targets: [2] });
  ok("one lone sea repaired, said as a lake", r.fixed === 1 && r.lakes === 1 && r.details[0].lake === true && r.details[0].province === 2, r);
  ok("disk: province 2 is a LAKE again", rowOf(fx.mod, 2) === "2;0;200;0;lake;false;lakes;0;", rowOf(fx.mod, 2));
  ok("disk: only map/definition.csv changed — no heightmap raise, no picture", JSON.stringify(changedFiles(before, snapshot(fx.mod))) === JSON.stringify(["map/definition.csv"]), changedFiles(before, snapshot(fx.mod)));
})();
(() => {
  const fx = addOnOverLake("2;0;200;0;sea;false;ocean;0;"); done(fx);
  const r = md.fixLoneSeas({ modRoot: fx.mod, gameRoot: fx.game, targets: [2] });
  ok("an add-on: the layer below's lake decides for a lone sea too", r.lakes === 1 && rowOf(fx.mod, 2) === "2;0;200;0;lake;false;lakes;0;", { r, row: rowOf(fx.mod, 2) });
})();
(() => {
  const fx = totalConversion("2;0;200;0;sea;false;ocean;0;"); done(fx);
  const r = md.fixLoneSeas({ modRoot: fx.mod, targets: [2] });
  ok("CONTROL: a lone sea on ocean is made land", r.fixed === 1 && !r.lakes && /;land;/.test(rowOf(fx.mod, 2)), { r, row: rowOf(fx.mod, 2) });
})();

console.log("=== the Auto-fix summary says a lake is a lake (public/map.js, comments masked) ===");
(() => {
  const src = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  const at = src.indexOf("fr.fixes.inlandSeas");
  ok("the summary reads fixes.inlandSeas", at > 0);
  const tail = src.slice(at, src.indexOf("fr.fixes.loneSeas", at) + 4000);
  ok("…and never says a repaired inland sea was 'reverted … to land' by the whole count", !/reverted \$\{isea\.fixed\}/.test(tail));
  ok("…counts the lakes apart (isea.lakes) and filters the lone seas' lakes (d.lake)", /isea\.lakes/.test(tail) && /lone\.details[^;]*\.filter\(\(d\) => d\.lake\)/.test(tail));
  // the fixers both ask the one predicate before they make land
  const raw = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const mdSrc = maskJsComments(raw), lit = maskJsLiterals(raw);
  for (const fn of ["fixInlandSeas", "fixLoneSeas"]) {
    const i = lit.indexOf(`function ${fn}(`);
    const span = i >= 0 ? jsBodyAt(lit, i) : null;
    const body = span ? mdSrc.slice(span[0], span[1] + 1) : "";
    const ask = body.indexOf("lakeACutOffSeaWas("), land = body.indexOf('type: "land"');
    ok(`${fn} asks lakeACutOffSeaWas before it writes type land`, ask > 0 && land > ask, { ask, land });
  }
})();

console.log("=== the lone-sea rule says what the click makes of a lake (review of B1-27: it said 'make it land') ===");
(() => {
  // the fixture's 2 and 4 are both lone seas (no other sea beside either); 2 was a lake (its own lakes terrain), 4 never was
  const fx = totalConversion("2;0;200;0;sea;false;lakes;0;"); done(fx);
  const p = (md.validateMapBitmap({ modRoot: fx.mod }) || []).find((q) => q.rule === "lone_sea_nobody_uses");
  ok("CONTROL: the rule names both lone seas, 2 and 4", !!p && JSON.stringify(p.provinces) === "[2,4]", p);
  ok("…and names 2 as the lake the click makes it, the rest land", !!p && JSON.stringify(p.lakes) === "[2]" && /to make sea 2 the lake it was and the rest land,/.test(p.message), p && p.message);
  const fx2 = totalConversion("2;0;200;0;sea;false;ocean;0;"); done(fx2);
  const q = (md.validateMapBitmap({ modRoot: fx2.mod }) || []).find((x) => x.rule === "lone_sea_nobody_uses");
  ok("CONTROL: with no lake among them it still says land", !!q && !q.lakes && /to make them land,/.test(q.message), q && q.message);
  const r = md.fixLoneSeas({ modRoot: fx.mod, targets: p.provinces });
  ok("…and the click does what the words said: 2 the lake, 4 land", r.lakes === 1 && rowOf(fx.mod, 2) === "2;0;200;0;lake;false;lakes;0;" && /;land;/.test(rowOf(fx.mod, 4)), { r, rows: [rowOf(fx.mod, 2), rowOf(fx.mod, 4)] });
  const labels = fs.readFileSync(path.join(__dirname, "public", "map-rule-labels.js"), "utf8");
  const hint = (/lone_sea_nobody_uses: "([^"]*)"[^\n]*\n(?![\s\S]*lone_sea_nobody_uses: ")/.exec(labels) || [])[1] || "";
  ok("…and the rule's fix hint names the lake as well as the land", /Auto-fix makes it land/.test(hint) && /that lake again/.test(hint), hint);
})();

console.log("=== …and only the same province below: a map the mod draws itself shares the base's ids, not its places (review of B1-27) ===");
(() => {
  // a mod that ships its own provinces.bmp + definition.csv with no replace_path="map" (a 🌍 generated world is one): the base's
  // province 2 is a LAKE of another colour — another place that only shares the id
  const overBase = (c2) => {
    const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakesea-game-"));
    writeMap(game, `2;${c2.join(";")};lake;false;lakes;0;`);
    mk(path.join(game, "map", "provinces.bmp"), bmp24(24, 4, (x) => (provAtX(x) === 2 ? c2 : COL[provAtX(x)])));
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakesea-own-"));
    mk(path.join(mod, "descriptor.mod"), 'name="OwnMap"\n');
    writeMap(mod, "2;0;200;0;sea;false;ocean;0;");
    return { mod, game };
  };
  const other = overBase([10, 20, 30]); done(other);
  const v = (md.validateMapBitmap({ modRoot: other.mod, gameRoot: other.game }) || []).find((q) => q.rule === "lone_sea_nobody_uses");
  ok("the lone-sea words do not call another map's province 'the lake it was'", !!v && !v.lakes && /to make it land,/.test(v.message), v && { lakes: v.lakes, message: v.message });
  const r = md.fixInlandSeas({ modRoot: other.mod, gameRoot: other.game });
  ok("…and the repair makes it land, not the lake of the base's other place", r.fixed === 1 && !r.lakes && /;land;/.test(rowOf(other.mod, 2)), { r, row: rowOf(other.mod, 2) });
  const same = overBase([0, 200, 0]); done(same);
  const r2 = md.fixInlandSeas({ modRoot: same.mod, gameRoot: same.game });
  ok("CONTROL: the same province below (same colour) is still made its lake", r2.lakes === 1 && rowOf(same.mod, 2) === "2;0;200;0;lake;false;lakes;0;", { r2, row: rowOf(same.mod, 2) });
})();

for (const fx of keep) for (const d of [fx.mod, fx.game]) if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${pass} passed`);
