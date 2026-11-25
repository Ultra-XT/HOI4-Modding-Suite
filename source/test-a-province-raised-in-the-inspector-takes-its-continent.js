// ⛔ #a-raised-province-takes-the-generators-continent — a sea or lake province the province inspector turns to land takes the continent
// Generate land would give it, not 1.
//
// The inspector's Type dropdown posts { provinceId, terrain, type, coastal } to /api/map/set-province-terrain, with no continent, and
// setProvinceDefinition clamped the land row's continent of 0 to 1 (#land-row-continent-zero): `europe` on the base game and on five of
// the seven installed workshop maps that own a definition.csv, wherever the province is. Generate land stopped doing exactly that
// (#generated-land-is-all-europe,
// #a-raised-province-keeps-its-continent): a province that was this same land below keeps the continent it had there
// (continentsOfTheLandBelow), and one that touches land takes the continent it shares the longest border with
// (continentsFromNeighbouringLand). The inspector now asks those two, and 1 only where neither answers. A continent the caller sends is
// written as sent, and a land province's terrain edit keeps the continent it has.
//
// Fixture: a base game 48 × 24 — land A on continent 3, land B on continent 5, a strait S of sea touching A along 16 pixels and B along
// 8, an islet T of sea in the open ocean, and land D on continent 4 that the mod has made sea (its own definition.csv says so) — and a
// mod over it, each retype sent as the page sends it.
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
const tmps = [];
const W = 48, H = 24;
const OCEAN = 1, A = 2, B = 3, S = 4, T = 5, D = 6;
const inBox = (x, y, x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const idAt = (x, y) => inBox(x, y, 2, 13, 4, 19) ? A : inBox(x, y, 14, 17, 4, 19) ? S : inBox(x, y, 18, 29, 12, 19) ? B
  : inBox(x, y, 40, 43, 4, 7) ? T : inBox(x, y, 34, 37, 14, 19) ? D : OCEAN;
const col = (id) => [(id * 41) & 255, (id * 97 + 13) & 255, (id * 59 + 29) & 255];
const BASE_ROWS = { [OCEAN]: "sea;false;ocean;0", [A]: "land;false;plains;3", [B]: "land;false;plains;5", [S]: "sea;false;ocean;0", [T]: "sea;false;ocean;0", [D]: "land;false;hills;4" };
const defText = (rows) => ["0;0;0;0;land;false;unknown;0", ...Object.keys(rows).map((id) => `${id};${col(+id).join(";")};${rows[id]}`)].join("\r\n") + "\r\n";
function bmp24() {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = col(idAt(x, y)), o = 54 + (H - 1 - y) * rs + x * 3; b[o] = c[2]; b[o + 1] = c[1]; b[o + 2] = c[0]; }
  return b;
}
function bmp8(fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const mkdtemp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inspcont-" + tag + "-")); tmps.push(d); return d; };

const game = mkdtemp("game");
write(game, "map/provinces.bmp", bmp24());
write(game, "map/definition.csv", defText(BASE_ROWS));
write(game, "map/heightmap.bmp", bmp8((x, y) => ([A, B, D].includes(idAt(x, y)) ? 110 : 89)));
// a mod over the base game that has made D sea (Erase does this), and owns its definition.csv for that
function makeMod(tag) {
  const mod = mkdtemp(tag);
  write(mod, "descriptor.mod", 'name="inspector continent"\nsupported_version="1.*"\n');
  write(mod, "map/definition.csv", defText({ ...BASE_ROWS, [D]: "sea;false;ocean;0" }));
  return mod;
}
const rowOf = (mod, id) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "";
const continentOf = (mod, id) => Number(rowOf(mod, id).split(";")[7]);
// what public/map.js's saveProvinceTerrain queues for a Type change: { provinceId, terrain, type, coastal } — the terrain box still holding
// the sea's own terrain — and what /api/map/set-province-terrain hands setProvinceDefinition (continent: the body's, which is absent)
const asThePageSends = (mod, provinceId, extra = {}) => {
  const body = { provinceId, terrain: "ocean", type: "land", coastal: false, ...extra };
  return md.setProvinceDefinition({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: body.provinceId, terrain: body.terrain, coastal: body.coastal, type: body.type, continent: body.continent });
};
// the generator's own answer for one province, asked as generateLand asks it
const generatorsAnswer = (mod, id) => {
  const rows = md.parseDefinitionCsv(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8"));
  const below = md.continentsOfTheLandBelow({ modRoot: mod, gameRoot: game, dependencyRoots: [], rows, provinceIds: [id] });
  return md.continentsFromNeighbouringLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], rows, provinceIds: [id], seeds: below }).get(id) || 0;
};

try {
  console.log("\n=== ⛔ i. a strait turned to land takes the continent of the land it shares the longest border with ===");
  {
    const mod = makeMod("strait");
    const gen = generatorsAnswer(mod, S);
    ok(gen === 3, "precondition: the generator's walk gives the strait continent 3 (16 pixels of border with A on 3, 8 with B on 5)", gen);
    const r = asThePageSends(mod, S);
    ok(r && r.changed === true, "the retype is written", r && r.error);
    const row = rowOf(mod, S).split(";");
    ok(row[4] === "land" && row[6] === "plains", "…as land on plains (the sea's terrain replaced, #a-flipped-sea-keeps-its-ocean-terrain)", rowOf(mod, S));
    ok(continentOf(mod, S) === gen, `⭐⭐ …on continent ${gen}, the generator's answer, not 1`, rowOf(mod, S));
  }

  console.log("\n=== ⛔ ii. land the mod made sea, turned back to land, takes the continent it had below ===");
  {
    const mod = makeMod("below");
    const gen = generatorsAnswer(mod, D);
    ok(gen === 4, "precondition: the generator keeps D's continent from the layer below (4): it touches no land to copy one from", gen);
    const r = asThePageSends(mod, D);
    ok(r && r.changed === true, "the retype is written", r && r.error);
    ok(continentOf(mod, D) === 4, "⭐⭐ …on continent 4, the one it had below, not 1", rowOf(mod, D));
  }

  console.log("\n=== iii. an islet in the open ocean, which touches no land and was none below, takes 1 ===");
  {
    const mod = makeMod("islet");
    ok(generatorsAnswer(mod, T) === 0, "precondition: the generator's walk has no answer for it either", generatorsAnswer(mod, T));
    const r = asThePageSends(mod, T);
    ok(r && r.changed === true && continentOf(mod, T) === 1, "⭐ …so it is written on 1, the land row's floor (#land-row-continent-zero)", rowOf(mod, T));
  }

  console.log("\n=== iv. CONTROLS: a continent the caller sends is written as sent; a land province's terrain edit keeps its continent ===");
  {
    const mod = makeMod("controls");
    const r = asThePageSends(mod, S, { continent: 5 });
    ok(r && r.changed === true && continentOf(mod, S) === 5, "⭐ a continent sent with the retype (flipProvinceToLand sends one) is kept", rowOf(mod, S));
    const r2 = md.setProvinceDefinition({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: B, terrain: "forest", coastal: false, type: "land" });
    ok(r2 && r2.changed === true && continentOf(mod, B) === 5 && rowOf(mod, B).split(";")[6] === "forest", "⭐ a land province's terrain edit keeps the continent it has", rowOf(mod, B));
  }

  console.log("\n=== iv-b. a sea row carrying a continent of its own, raised with none named, takes the land's too ===");
  {
    const mod = makeMod("sea-with-a-continent");
    write(mod, "map/definition.csv", defText({ ...BASE_ROWS, [D]: "sea;false;ocean;0", [S]: "sea;false;ocean;2" }));
    const r = asThePageSends(mod, S);
    ok(r && r.changed === true && continentOf(mod, S) === 3, "⭐⭐ the strait's sea row said 2: raised, it stands on 3, the land's, as a row on 0 does (#a-raised-province-takes-its-neighbours-continent)", rowOf(mod, S));
    const mod2 = makeMod("named-on-a-sea-with-a-continent");
    write(mod2, "map/definition.csv", defText({ ...BASE_ROWS, [D]: "sea;false;ocean;0", [S]: "sea;false;ocean;2" }));
    const named = asThePageSends(mod2, S, { continent: 5 });
    ok(named && named.changed === true && continentOf(mod2, S) === 5, "THE CONTROL: with one named, the row has that one", rowOf(mod2, S));
    const SRC2 = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const a2 = SRC2.indexOf("function setProvinceDefinition("), body2 = SRC2.slice(a2, SRC2.indexOf("\nfunction ", a2 + 10));
    ok((body2.match(/continentsFromNeighbouringLand\(/g) || []).length === 1, "⭐ …and setProvinceDefinition asks the walk once: each ask is a full read of provinces.bmp", (body2.match(/continentsFromNeighbouringLand\(/g) || []).length);
  }

  console.log("\n=== v. the wiring, read from the code ===");
  {
    const SRC = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const a = SRC.indexOf("function setProvinceDefinition(");
    const body = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10));
    ok(/continentsFromNeighbouringLand\(/.test(body) && /continentsOfTheLandBelow\(/.test(body), "⭐ setProvinceDefinition asks the generator's two continent readers", body.length);
  }
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${fails.length ? "FAILED" : "PASSED"} ${pass}/${pass + fails.length}`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
