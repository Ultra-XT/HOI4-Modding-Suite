// ⛔ #a-harbour-faces-its-sea — A PORT NOVA TURNED TO ITS SEA STILL FACES IT ONCE REDRAW REGIONS MAKES THE LAKE BESIDE IT SEA.
//
// Every coast row Nova writes (the port fixCoastalNoPort adds, the dockyard, fort, hub and HQ a generated coast is given) is turned by
// coastFacing to the sea round it — and coastFacing reads a lake as no sea. Redraw strategic regions then turns each lake the sea
// surrounds into sea (planLakeRetypes), after Auto-fix has written those rows. On the owner's flow at the merge of the four chains
// (New mod, Delete map, Generate land 35% seed 1, Auto-fix, Redraw regions: 74 lakes to sea), 15 of 3,207 coast rows were left facing
// the sea as it was — 9 ports among them, a sea route's harbour (3685) and a navy's home (4038), one with its water side off the sea
// (review of the merge, F3). So the redraw re-turns, in the mod's own buildings.txt, each coast row whose rotation is exactly what
// coastFacing gave before the lakes turned and whose answer they change; a rotation a modder set is not that answer and stays.
//
//   1. returnCoastRowsToTheirSea, pure, on a synthetic map: Nova's turn beside the lake re-turned to the new answer; a modder's own
//      rotation, a row the lake is out of reach of, and a row of a type Nova does not turn left alone; every other byte kept, CRLF and
//      LF, no final newline; nothing to turn returns the very text.
//   2. Redraw regions end to end (testlib-region-rebuild-world.js: the islet and the lake L beside it, which becomes sea): the dry run
//      counts the row and the dialog says map/buildings.txt; the click turns Nova's row beside L to the answer on the map it leaves,
//      and the modder's row and the far row are byte-identical; a mod with no buildings.txt of its own gets none; a click that
//      fails later puts buildings.txt back byte for byte.
// Fixture-only: binds no port. Run: node test-a-lake-that-becomes-sea-turns-the-harbours-beside-it.js
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };

const W1 = makeRegionWorld("lake-harbours");
process.env.APPDATA = path.join(W1.ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");
const sandboxes = [W1.ROOT];

console.log("=== 1. returnCoastRowsToTheirSea, pure ===");
{
  // 20 x 12 px: land 1 at x 5..9, y 4..7; lake 2 at x 10..13, y 4..7; sea 3 everywhere else
  const ex = { W: 20, H: 12, pidAt: (x, y) => (y >= 4 && y <= 7 && x >= 5 && x <= 9 ? 1 : y >= 4 && y <= 7 && x >= 10 && x <= 13 ? 2 : 3) };
  const before = (id) => ({ 1: "land", 2: "lake", 3: "sea" })[id], after = (id) => (id === 2 ? "sea" : before(id));
  const z = (y) => ex.H - 1 - y;   // buildings.txt z is bottom-up
  const f = (typeOf, x, y) => md.coastFacing(ex, typeOf, x, z(y));
  const near = [9, 4], far = [5, 7];   // the land's top-right pixel, the lake beside it; its bottom-left, 4 px and more from the lake
  rec("THE FIXTURE: beside the lake the answer changes when the lake is sea; far from it, it does not",
    f(before, ...near) != null && f(after, ...near) != null && f(before, ...near) !== f(after, ...near) && f(before, ...far) === f(after, ...far),
    { near: [f(before, ...near), f(after, ...near)], far: [f(before, ...far), f(after, ...far)] });
  const row = (type, [x, y], rot, sea = 3) => `1;${type};${x.toFixed(2)};9.50;${z(y).toFixed(2)};${rot.toFixed(2)};${sea}`;
  const lines = [row("naval_base_spawn", near, f(before, ...near)), row("naval_base_spawn", near, 2.5), row("dockyard", far, f(before, ...far)),
    row("arms_factory", near, f(before, ...near), 0), row("naval_headquarters", near, f(before, ...near), 0)];
  rec("THE FIXTURE: the modder's 2.50 is not the answer before", Math.abs(2.5 - f(before, ...near)) > 0.01);
  for (const eol of ["\r\n", "\n"]) {
    const text = lines.join(eol);   // no final newline: HOI4 reads one as an empty record, and Nova writes none
    const r = md.returnCoastRowsToTheirSea(text, ex, before, after);
    const out = r.text.split(eol);
    const want = f(after, ...near).toFixed(2);
    rec(`⭐⭐⭐ (${JSON.stringify(eol)}) Nova's port beside the lake is turned to the answer with the lake as sea (${want})`, out[0] === lines[0].replace(/;[^;]*;3$/, `;${want};3`), out[0]);
    rec(`⭐⭐ (${JSON.stringify(eol)}) …and so is its HQ, a coast row of the slot lists`, out[4].split(";")[5] === want, out[4]);
    rec(`⭐⭐⭐ (${JSON.stringify(eol)}) the modder's own rotation, the far dockyard and the factory are byte-identical`, out[1] === lines[1] && out[2] === lines[2] && out[3] === lines[3], out);
    rec(`⭐ (${JSON.stringify(eol)}) every line keeps its ending, and the text still ends without one`, out.length === lines.length && r.text.split(/\r?\n/).length === lines.length
      && (eol === "\n" ? !r.text.includes("\r") : (r.text.match(/\r\n/g) || []).length === lines.length - 1) && !/\n$/.test(r.text));
    rec(`(${JSON.stringify(eol)}) …and it says what it turned`, r.turned.length === 2 && r.turned.every((t) => t.to === f(after, ...near)) && r.turned.map((t) => t.type).join() === "naval_base_spawn,naval_headquarters", r.turned);
  }
  const none = lines.slice(1, 4).join("\r\n");
  const rn = md.returnCoastRowsToTheirSea(none, ex, before, after);
  rec("⭐ nothing to turn: the very text back, and nothing said", rn.text === none && rn.turned.length === 0, rn.turned);
  rec("…and the same with no lake retyped", md.returnCoastRowsToTheirSea(lines.join("\n"), ex, before, before).turned.length === 0);
}

console.log("\n=== 2. Redraw strategic regions re-turns Nova's rows beside a lake it makes sea ===");
// the world's islet i (one province, its own state) has the lake L on its east and sea on its other sides: Redraw makes L sea
const W = 512, H = 256, CELL = 32;
const isletState = (Wd) => Wd.states.findIndex((ps) => ps.includes(Wd.PROV.islet)) + 1;
const ix0 = (W1.PROV.islet - 1) % 16 * CELL, iy0 = Math.floor((W1.PROV.islet - 1) / 16) * CELL;   // the islet's top-left pixel
// what the map says before the redraw and after it, by the fixture's own manifest: L a lake, then sea
const pixelId = (x, y) => W1.idAt(Math.floor((((x % W) + W) % W) / CELL), Math.floor(y / CELL));
const typeBefore = (id) => W1.modType(id), typeAfter = (id) => (id === W1.PROV.lakeIslet ? "sea" : W1.modType(id));
const ex = { W, H, pidAt: pixelId };
const zOf = (y) => H - 1 - y;
const NEAR = [ix0 + CELL - 1, iy0], MODDER = [ix0 + CELL - 1, iy0 + CELL - 1], FAR = [ix0, iy0];   // top-right, bottom-right, top-left
const answer = (typeOf, [x, y]) => md.coastFacing(ex, typeOf, x, zOf(y));
const buildingsFor = (Wd) => {
  const st = isletState(Wd), above = Wd.idAt(8, 0), below = Wd.idAt(8, 2);
  const row = (type, [x, y], rot, sea) => `${st};${type};${x.toFixed(2)};9.50;${zOf(y).toFixed(2)};${rot.toFixed(2)};${sea}`;
  return [row("naval_base_spawn", NEAR, answer(typeBefore, NEAR), above), row("naval_base_spawn", MODDER, 1.23, below), row("coastal_bunker", FAR, answer(typeBefore, FAR), 0)];
};
rec("THE FIXTURE: L is a lake beside the islet, and the redraw's own plan makes it sea", W1.modType(W1.PROV.lakeIslet) === "lake" && W1.modType(W1.PROV.islet) === "land"
  && pixelId(NEAR[0] + 1, NEAR[1]) === W1.PROV.lakeIslet && pixelId(NEAR[0], NEAR[1]) === W1.PROV.islet);
rec("THE FIXTURE: beside L the answer changes when L is sea; at the islet's far corner it does not; the modder's 1.23 is not the answer",
  answer(typeBefore, NEAR) !== answer(typeAfter, NEAR) && answer(typeBefore, NEAR) != null && answer(typeBefore, FAR) === answer(typeAfter, FAR)
    && Math.abs(1.23 - answer(typeBefore, MODDER)) > 0.01, { near: [answer(typeBefore, NEAR), answer(typeAfter, NEAR)], far: [answer(typeBefore, FAR), answer(typeAfter, FAR)] });
const rows0 = buildingsFor(W1);
const bFile = path.join(W1.MOD, "map", "buildings.txt");
fs.writeFileSync(bFile, rows0.join("\r\n"));
const roots = { modRoot: W1.MOD, gameRoot: W1.GAME, dependencyRoots: [] };

const dry = md.rebuildStrategicRegions({ ...roots, opts, dryRun: true });
const s = (dry && dry.summary) || {};
rec("the dry run plans L into sea", dry.ok === true && (s.lakesToSeaSample || []).includes(W1.PROV.lakeIslet), dry.error || s);
rec("⭐⭐ …and counts the one coast row it turns, and says buildings.txt is written", s.coastRowsTurned === 1 && s.files && s.files.buildings === true, { turned: s.coastRowsTurned, files: s.files });
{
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function redrawRegionsBody("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has redrawRegionsBody", !!body);
  const say = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const text = say(s);
  rec("⭐ the dialog says the port beside the lake turns, and that map/buildings.txt is written", text.includes("1 port or coastal building beside them turns to face the new sea") && text.includes("map/buildings.txt"), text);
  rec("…and says neither with nothing to turn", !/map\/buildings\.txt|turns? to face/.test(say(Object.assign({}, s, { coastRowsTurned: 0, files: Object.assign({}, s.files, { buildings: false }) }))));
}
const r = md.rebuildStrategicRegions({ ...roots, opts });
rec("the click writes, and L is sea", r.ok === true && (r.retyped || []).includes(W1.PROV.lakeIslet), r.error || r.retyped);
const rows1 = fs.readFileSync(bFile, "utf8").split("\r\n");
const want = answer(typeAfter, NEAR).toFixed(2);
rec(`⭐⭐⭐ Nova's port beside L now faces the sea the map has (${want}, was ${answer(typeBefore, NEAR).toFixed(2)})`, rows1[0] === rows0[0].replace(/;[^;]*;(\d+)$/, `;${want};$1`), rows1[0]);
{
  // …and the map the click leaves agrees: read back, L is sea, and coastFacing over it gives what the row says
  const model = md.buildMapModel({ ...roots, cacheStableLayers: false });
  const t = new Map(model.provinces.map((p) => [+p.id, p.type]));
  rec("…and on the map as written, coastFacing gives what the row says", t.get(W1.PROV.lakeIslet) === "sea" && md.coastFacing(ex, (id) => t.get(id), NEAR[0], zOf(NEAR[1])).toFixed(2) === rows1[0].split(";")[5]);
}
rec("⭐⭐⭐ the modder's own rotation and the far fort are byte-identical, and nothing else changed", rows1.length === 3 && rows1[1] === rows0[1] && rows1[2] === rows0[2], rows1);
rec("⭐ the click says what it turned", r.coastRows && r.coastRows.turned === 1 && (r.coastRows.byType || {}).naval_base_spawn === 1 && (r.writtenFiles || []).includes("map/buildings.txt"), r.coastRows);

// a mod with no buildings.txt of its own: no turn of Nova's to keep, and the inherited file is not copied in
{
  const W2 = makeRegionWorld("lake-harbours-none");
  sandboxes.push(W2.ROOT);
  const r2 = md.rebuildStrategicRegions({ modRoot: W2.MOD, gameRoot: W2.GAME, dependencyRoots: [], opts });
  rec("⭐⭐ with no buildings.txt of its own, the mod gets none, and the click still turns its lakes", r2.ok === true && (r2.retyped || []).includes(W2.PROV.lakeIslet)
    && !fs.existsSync(path.join(W2.MOD, "map", "buildings.txt")) && (r2.summary || {}).coastRowsTurned === 0, r2.error || r2.summary);
}

// a click that fails after the turn puts buildings.txt back (#a-failed-redraw-puts-back-bytes)
{
  const W3 = makeRegionWorld("lake-harbours-fail");
  sandboxes.push(W3.ROOT);
  const b3 = path.join(W3.MOD, "map", "buildings.txt");
  fs.writeFileSync(b3, buildingsFor(W3).join("\r\n"));
  const was = fs.readFileSync(b3);
  const locked = path.join(W3.MOD, "map", "strategicregions", "5-East Sea.txt");
  fs.mkdirSync(path.dirname(locked), { recursive: true });
  fs.copyFileSync(path.join(W3.GAME, "map", "strategicregions", "5-East Sea.txt"), locked);
  fs.chmodSync(locked, 0o444);
  let r3;
  try { r3 = md.rebuildStrategicRegions({ modRoot: W3.MOD, gameRoot: W3.GAME, dependencyRoots: [], opts }); } finally { try { fs.chmodSync(locked, 0o644); } catch (_) {} }
  rec("THE FIXTURE: the click fails on the read-only region file, after the lakes", r3 && r3.ok === false && /5-East Sea\.txt/.test(r3.error || ""), r3 && r3.error);
  rec("⭐⭐ …and buildings.txt is put back byte for byte", Buffer.compare(fs.readFileSync(b3), was) === 0 && !(r3.unrestored || []).includes("map/buildings.txt"), { unrestored: r3 && r3.unrestored });
}

for (const d of sandboxes) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
