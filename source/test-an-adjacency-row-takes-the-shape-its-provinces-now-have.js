// ⛔ #a-row-written-for-the-map-below — TEST 32's 60 adjacency rows in shapes no shipping map ships, and Millennium Dawn's 19.
//
// A row of map/adjacencies.csv means its Type read together with the definition.csv types of From, To and Through. Measured on
// the rehearsal t32b (the same on TEST 31): 44 `impassable` rows with a sea end, all between provinces that touch in
// provinces.bmp — walls standing in the sea; 8 rule-less `sea` rows joining two seas through land — army straits the world turned
// inside out; 8 `sea` rows with one shore. Across the eight installed maps that own definition.csv: 0 of 1,740 impassable rows
// with a sea end. fixAdjacenciesForProvinceTypes retyped none of them — and on the other side it retyped 19 of Millennium Dawn's
// own ruled straits (Malacca, Dover, Palk …) for an add-on that changed one unrelated province, because its only gate was "the
// mod changed definition.csv".
//
// So a row is retyped only when the layer it was copied from wrote it as it stands AND a province of it changed class (land /
// water / other; sea↔lake is no change), and then by retypeAdjacencyRow's table. No row is ever removed (every row is an edge of
// the fractioned-region flood). What this pins, row by row, against the test's own oracle and its own pixel walk:
//   WALL_TOUCH opened · WALL_APART left (the pixels do not join it) · WALL_LAND left · CANAL_RULELESS a sea link ·
//   RULED_CANAL and DOVER left (types unchanged) · ONESHORE_TOUCH a plain border · ONESHORE_APART a link nobody crosses ·
//   MOD_OWN_WALL and HAND_RETYPED left (the modder's) · INVERTED_RULED a sea link, and its rule out by the rule pass ·
//   CANAL_LAKE left (sea→lake is no change) · LAKE_WALL, LAKE_SEA_WALL and LAKE_SHORE left (no unit enters a lake) ·
//   WALL_RAISED left (its sea end is land now: a wall between two land provinces) · DRIED a
//   land crossing · DROWNED a sea link · MD_BLANK_THROUGH, Millennium Dawn's blank-Through form, a plain border;
// the counters, the row count, CRLF, the new warning before and after, a second round, a mod that changed only a terrain, a
// world with no provinces.bmp, one with no definition.csv below, and one real Auto-fix click and a second one on the
// inverted army strait.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-row-shape-"));
const APP = path.join(SCRATCH, "appdata");
fs.mkdirSync(APP, { recursive: true });
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = path.join(SCRATCH, "home");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));
const P = require(path.join(__dirname, "testlib-map-page.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let seq = 0;

function bmp24(W, H, fn) {
  const rs = (W * 3 + 3) & ~3, is = rs * H; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const COL = (id) => [id % 256, Math.floor(id / 256), 77];

// ── the cases: four 2×2-pixel cells in a row of their own, a filler province above and below. A pair at cells 0-1, 1-2, 2-3
// or 3-0 (the map wraps) touches; 0-2 and 1-3 do not. Cell letters: a b = From To, t = Through, p q = padding.
const L = "land", S = "sea", K = "lake";
const CASES = [
  { name: "WALL_TOUCH", cells: "abpq", below: "LLLL", now: { a: S }, row: "a;b;impassable;-1" },
  { name: "WALL_APART", cells: "apbq", below: "LLLL", now: { a: S }, row: "a;b;impassable;-1" },
  { name: "WALL_LAND", cells: "abpq", below: "LLLL", now: { p: S }, row: "a;b;impassable;-1" },
  { name: "CANAL_RULELESS", cells: "atbq", below: "LSLL", now: { a: S, b: S, t: L }, row: "a;b;sea;t" },
  { name: "RULED_CANAL", cells: "atbq", below: "SLSL", now: {}, row: "a;b;sea;t", rule: "CANAL_R", required: "t" },
  { name: "DOVER", cells: "atbq", below: "SSSL", now: {}, row: "a;b;sea;t", rule: "DOVER", required: "t" },
  { name: "ONESHORE_TOUCH", cells: "abtq", below: "LLSL", now: { a: S }, row: "a;b;sea;t" },
  { name: "ONESHORE_APART", cells: "atbq", below: "LSLL", now: { a: S }, row: "a;b;sea;t" },
  { name: "MOD_OWN_WALL", cells: "abpq", below: "LLLL", now: { a: S }, row: null, modRow: "a;b;impassable;-1" },
  { name: "HAND_RETYPED", cells: "abtq", below: "LLSL", now: { a: S }, row: "a;b;sea;t", modRow: "a;b;impassable;-1" },
  { name: "INVERTED_RULED", cells: "atbq", below: "LSLL", now: { a: S, b: S, t: L }, row: "a;b;sea;t", rule: "ARMY_X", required: "a b" },
  { name: "CANAL_LAKE", cells: "atbq", below: "SLSL", now: { a: K }, row: "a;b;sea;t", rule: "CANAL_L", required: "t" },
  { name: "LAKE_WALL", cells: "abpq", below: "LLLL", now: { a: K }, row: "a;b;impassable;-1" },
  // a lake at one end and the sea at the other: the sea end alone used to open it
  { name: "LAKE_SEA_WALL", cells: "abpq", below: "LLLL", now: { a: K, b: S }, row: "a;b;impassable;-1" },
  // a wall whose sea end was raised: two land provinces the wall still keeps apart
  { name: "WALL_RAISED", cells: "abpq", below: "LSLL", now: { b: L }, row: "a;b;impassable;-1" },
  { name: "LAKE_SHORE", cells: "abtq", below: "LLSL", now: { a: K }, row: "a;b;sea;t" },
  { name: "DRIED", cells: "atbq", below: "LSLL", now: { t: L }, row: "a;b;sea;t" },
  { name: "DROWNED", cells: "atbq", below: "LSLL", now: { a: S, b: S }, row: "a;b;sea;t" },
  // Millennium Dawn's form: 19 `sea` rows between two seas with the Through left BLANK (Malacca, Dover, Palk …), one end raised
  { name: "MD_BLANK_THROUGH", cells: "abpq", below: "SSLL", now: { a: L }, row: "a;b;sea;" },
];
const T = { L, S, K };
const BELOW = {}, NOW = {};
const FILLER = [];
CASES.forEach((c, k) => {
  c.id = {};
  [...c.cells].forEach((ch, i) => { c.id[ch] = 10 * (k + 1) + i + 1; BELOW[c.id[ch]] = T[c.below[i]]; });
  for (const [ch, t] of Object.entries(c.now)) NOW[c.id[ch]] = t;
  const sub = (s) => s.replace(/\b[abtpq]\b/g, (ch) => c.id[ch]);
  c.base = c.row ? `${sub(c.row)};-1;-1;-1;-1;${c.rule || ""};${c.name}` : null;
  c.mod = c.modRow ? `${sub(c.modRow)};-1;-1;-1;-1;${c.rule || ""};${c.name}` : c.base;
  if (c.required) c.req = sub(c.required);
});
for (let k = 0; k <= CASES.length; k++) { FILLER.push(900 + k); BELOW[900 + k] = L; }
for (const id of Object.keys(BELOW)) if (!(id in NOW)) NOW[id] = BELOW[id];
// pixel rows: filler, case 1, filler, case 2, … filler — each 2 px high, cells 2 px wide
const W = 8, H = 2 * (2 * CASES.length + 1);
const idAt = (x, y) => { const band = Math.floor(y / 2); return band % 2 === 0 ? FILLER[band / 2] : CASES[(band - 1) / 2].id[CASES[(band - 1) / 2].cells[Math.floor(x / 2)]]; };
const BMP = bmp24(W, H, (x, y) => COL(idAt(x, y)));

const defn = (types) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(types).map((id) => {
  const [r, g, b] = COL(+id);
  return `${id};${r};${g};${b};${types[id]};false;${types[id] === L ? "plains" : types[id] === K ? "lakes" : "ocean"};${types[id] === L ? 1 : 0}`;
})).join("\n") + "\n";
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const END = "-1;-1;-1;-1;-1;-1;-1;-1;-1";
const csv = (rows) => [HEADER, ...rows, END, ""].join("\r\n");
const BASE_CSV = csv(CASES.filter((c) => c.base).map((c) => c.base));
const MOD_CSV = csv(CASES.filter((c) => c.mod).map((c) => c.mod));
// #a-strait-nobody-can-hold — the Bosphorus's neutral block: a rule nobody holds whose neutral shuts nothing is only its icon,
// and is left alone unless the mod already owns both files, which this one does not
const RULES = CASES.filter((c) => c.rule).map((c) => `adjacency_rule =\n{\n\tname = "${c.rule}"\n\tenemy = { army = no navy = no submarine = no trade = no }\n\tneutral = { army = no navy = no submarine = no trade = yes }\n\trequired_provinces = { ${c.req} }\n\ticon = ${c.req.split(" ")[0]}\n\toffset = { 0 0 0 }\n}\n`).join("\n");

function makeWorld({ types = NOW, bitmap = true, modCsv = MOD_CSV, baseDef = true } = {}) {
  const d = path.join(SCRATCH, "w" + (++seq)), game = path.join(d, "game"), mod = path.join(d, "mod");
  if (baseDef) mk(path.join(game, "map", "definition.csv"), defn(BELOW));
  if (bitmap) mk(path.join(game, "map", "provinces.bmp"), BMP);
  mk(path.join(game, "map", "adjacencies.csv"), BASE_CSV);
  mk(path.join(game, "map", "adjacency_rules.txt"), RULES);
  mk(path.join(mod, "descriptor.mod"), 'name="row shapes"\n');
  mk(path.join(mod, "map", "definition.csv"), defn(types));
  if (modCsv) mk(path.join(mod, "map", "adjacencies.csv"), modCsv);
  return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
}

// ── the oracle: its own pixel walk, and the table, read off the fixture ──────────────────────────────────────────────────
const touching = new Set();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = idAt(x, y);
  for (const b of [idAt((x + 1) % W, y), y + 1 < H ? idAt(x, y + 1) : a]) if (a !== b) touching.add(a < b ? `${a}-${b}` : `${b}-${a}`);
}
const touches = (a, b) => touching.has(a < b ? `${a}-${b}` : `${b}-${a}`);
const cls = (t) => (t === L ? "land" : t === S || t === K ? "water" : "other");
const baseRows = new Map(BASE_CSV.split("\r\n").filter((l) => /^\d+;/.test(l) && !l.startsWith("-1")).map((l) => l.split(";")).map((c) => [[+c[0], +c[1]].sort((x, y) => x - y).join("-"), c]));
function expected(line) {
  const c = line.split(";"), from = +c[0], to = +c[1], thr = +c[3] > 0 ? +c[3] : -1, kind = c[2];
  const b = baseRows.get([from, to].sort((x, y) => x - y).join("-"));
  if (!b || b[2] !== kind || (+b[3] > 0 ? +b[3] : -1) !== thr) return { line, kind: null };              // not the layer below's row as it stands
  if (![from, to, thr].some((p) => p > 0 && cls(NOW[p]) !== cls(BELOW[p]))) return { line, kind: null };    // nothing changed class
  const n = c.slice();
  const water = (p) => cls(NOW[p]) === "water", land = (p) => NOW[p] === L, sea = (p) => NOW[p] === S, lake = (p) => NOW[p] === K;
  if (kind === "sea" && water(from) && water(to)) { n[2] = ""; n[3] = "-1"; return { line: n.join(";"), kind: "seaLink" }; }
  if (kind === "sea" && land(from) && land(to) && (thr === -1 || land(thr))) { n[2] = ""; n[3] = "-1"; return { line: n.join(";"), kind: "landCrossing" }; }
  if (kind === "sea" && ((land(from) && sea(to)) || (sea(from) && land(to)))) { n[2] = touches(from, to) ? "" : "impassable"; n[3] = "-1"; return { line: n.join(";"), kind: "oneShore", touching: touches(from, to) }; }
  // a wall in the sea, joined by the pixels — never one with a lake end: no unit enters a lake
  if (kind === "impassable" && (sea(from) || sea(to)) && !lake(from) && !lake(to) && touches(from, to)) { n[2] = ""; return { line: n.join(";"), kind: "wall" }; }
  return { line, kind: null };
}
const want = new Map(CASES.filter((c) => c.mod).map((c) => [c.name, expected(c.mod)]));
const count = (k) => [...want.values()].filter((e) => e.kind === k).length;
const retypedWant = [...want.values()].filter((e) => e.kind).length;
const lineOf = (text, name) => text.split("\r\n").find((l) => l.endsWith(";" + name)) || "";
const mineOf = (ctx) => fs.readFileSync(path.join(ctx.modRoot, "map", "adjacencies.csv"), "utf8");
const warningOf = (ctx) => (md.validateMapBitmap(ctx) || []).find((p) => p.rule === "adjacency_describes_another_map");
const byName = Object.fromEntries(CASES.map((c) => [c.name, c]));
const pair = (n) => [byName[n].id.a, byName[n].id.b];

try {
  console.log("=== THE CONTROLS: the fixture has the shapes it says ===");
  rec("THE CONTROL: the walk sees WALL_TOUCH's, ONESHORE_TOUCH's and LAKE_WALL's pairs touch, and WALL_APART's and ONESHORE_APART's not",
    touches(...pair("WALL_TOUCH")) && touches(...pair("ONESHORE_TOUCH")) && touches(...pair("LAKE_WALL")) && !touches(...pair("WALL_APART")) && !touches(...pair("ONESHORE_APART")));
  rec("THE CONTROL: CANAL_LAKE's end went sea → lake, and LAKE_WALL's and LAKE_SHORE's land → lake",
    BELOW[byName.CANAL_LAKE.id.a] === S && NOW[byName.CANAL_LAKE.id.a] === K && BELOW[byName.LAKE_WALL.id.a] === L && NOW[byName.LAKE_WALL.id.a] === K
    && BELOW[byName.LAKE_SHORE.id.a] === L && NOW[byName.LAKE_SHORE.id.a] === K);
  rec("THE CONTROL: DOVER is a `sea` row between two seas through sea — the shape the per-mod gate rewrote on Millennium Dawn",
    /;sea;/.test(byName.DOVER.base) && [byName.DOVER.id.a, byName.DOVER.id.b, byName.DOVER.id.t].every((p) => BELOW[p] === S));
  rec("THE CONTROL: LAKE_SEA_WALL's pair touches and has a sea end, so only its lake end keeps the wall shut",
    touches(...pair("LAKE_SEA_WALL")) && [NOW[byName.LAKE_SEA_WALL.id.a], NOW[byName.LAKE_SEA_WALL.id.b]].sort().join() === [K, S].sort().join());
  rec("THE CONTROL: WALL_RAISED's pair touches and an end of it changed class, so only the wall's sea test keeps it shut",
    touches(...pair("WALL_RAISED")) && BELOW[byName.WALL_RAISED.id.b] === S && NOW[byName.WALL_RAISED.id.b] === L && NOW[byName.WALL_RAISED.id.a] === L);
  // parseAdjacencies reads a blank Through as NaN, so the layer below's row matches the mod's only once both say -1
  const mdBelow = md.parseAdjacencies(BASE_CSV).find((x) => x.comment === "MD_BLANK_THROUGH");
  rec("THE CONTROL: MD_BLANK_THROUGH's Through is blank in the layer below, and read raw it is not -1",
    byName.MD_BLANK_THROUGH.base.split(";")[3] === "" && !!mdBelow && Number.isNaN(mdBelow.through), mdBelow);
  rec("THE CONTROL: the oracle retypes some of every kind and leaves the rest", count("seaLink") >= 2 && count("landCrossing") >= 1 && count("oneShore") === 3 && count("wall") >= 1
    && [...want.values()].filter((e) => !e.kind).length >= 7, Object.fromEntries([...want].map(([n, e]) => [n, e.kind])));

  console.log("\n=== the retype, row by row ===");
  const ctx = makeWorld();
  const before = mineOf(ctx);
  const w0 = warningOf(ctx);
  rec("⭐⭐⭐ the new warning reports the rows the oracle retypes, before the click", !!w0 && w0.total === retypedWant && w0.severity === "warning", w0);
  rec("⭐⭐ …a warning with a label and long text of its own, not in the fatal set",
    !labels.isFatalRule("adjacency_describes_another_map") && !!labels.LABELS.adjacency_describes_another_map && labels.mapRuleFixHint("adjacency_describes_another_map").length > 40);
  const dry = md.fixAdjacenciesForProvinceTypes({ ...ctx, dryRun: true });
  rec("⭐⭐ the dry run writes nothing", dry.retyped === retypedWant && mineOf(ctx) === before, dry);
  const r = md.fixAdjacenciesForProvinceTypes(ctx);
  const after = mineOf(ctx);
  for (const c of CASES.filter((x) => x.mod)) {
    const e = want.get(c.name);
    rec(`${e.kind ? "⭐⭐⭐" : "⭐⭐"} ${c.name}: ${e.kind ? `${e.kind}${e.kind === "oneShore" ? (e.touching ? ", a plain border" : ", a link nobody crosses") : ""} → ${e.line.split(";").slice(0, 4).join(";")}` : "left as it is"}`,
      lineOf(after, c.name) === e.line, { got: lineOf(after, c.name), want: e.line });
  }
  rec("⭐⭐⭐ the counters say what was done", r.retyped === retypedWant && r.seaLinks === count("seaLink") && r.landCrossings === count("landCrossing") && r.oneShore === count("oneShore")
    && r.oneShoreTouching === [...want.values()].filter((e) => e.kind === "oneShore" && e.touching).length && r.wallsOpened === count("wall") && r.changed === true && r.materialized === false, r);
  const rows = (t) => t.split("\r\n").filter((l) => /^\d+;/.test(l));
  const B = before.split("\r\n"), A = after.split("\r\n");
  const wantLine = new Map([...want.values()].map((e, i) => [CASES.filter((c) => c.mod)[i].mod, e.line]));
  rec("⭐⭐⭐ no row is removed or moved, and every line is what the oracle says — the same bytes where it retypes nothing",
    rows(after).length === rows(before).length && A.length === B.length && B.every((l, i) => A[i] === (wantLine.has(l) ? wantLine.get(l) : l)), { A, B });
  rec("⭐⭐ the CRLF file stays CRLF, header and terminator kept", (after.match(/\r\n/g) || []).length === (after.match(/\n/g) || []).length && after.startsWith(HEADER + "\r\n") && after.includes("\r\n" + END + "\r\n"));
  rec("⭐⭐⭐ the warning is silent afterwards", !warningOf(ctx), warningOf(ctx));

  console.log("\n=== the rule pass after it, and a second round ===");
  const rr = md.fixAdjacencyRulesLeftOnLand(ctx);
  rec("⭐⭐ the inverted army strait's rule is taken out by the rule pass, and only it", rr.fixed === 1 && rr.rules.join() === "ARMY_X" && rr.byKind.land.join() === "ARMY_X", rr);
  const mid = mineOf(ctx);
  rec("⭐⭐ …and its row is the sea link, with the name off", lineOf(mid, "INVERTED_RULED") === want.get("INVERTED_RULED").line.replace(";ARMY_X;", ";;"), lineOf(mid, "INVERTED_RULED"));
  const r2 = md.fixAdjacenciesForProvinceTypes(ctx), rr2 = md.fixAdjacencyRulesLeftOnLand(ctx);
  rec("⭐⭐⭐ a second round writes nothing", r2.retyped === 0 && rr2.fixed === 0 && mineOf(ctx) === mid, { r2, rr2 });

  console.log("\n=== a mod that changed only a terrain ===");
  const tc = makeWorld({ types: BELOW, modCsv: null });
  fs.writeFileSync(path.join(tc.modRoot, "map", "definition.csv"), defn(BELOW).replace(/(\n900;[^\n]*;)plains;/, (m, head) => head + "hills;"));
  rec("THE CONTROL: its definition.csv differs from the base's, in one terrain", fs.readFileSync(path.join(tc.modRoot, "map", "definition.csv"), "utf8") !== defn(BELOW)
    && md.fixAdjacenciesForProvinceTypes({ ...tc, dryRun: true }).skipped === undefined);
  const t = md.fixAdjacenciesForProvinceTypes(tc);
  rec("⭐⭐⭐ nothing is retyped and no copy of the base's file is made — DOVER and the ruled canal are the layer below's own",
    t.retyped === 0 && !fs.existsSync(path.join(tc.modRoot, "map", "adjacencies.csv")), t);

  console.log("\n=== a world with no provinces.bmp ===");
  const nb = makeWorld({ bitmap: false, modCsv: null });
  let threw = null, n = null;
  try { n = md.fixAdjacenciesForProvinceTypes(nb); } catch (e) { threw = String(e && e.message); }
  const asked = CASES.filter((c) => c.base && ["wall", "oneShore"].includes((want.get(c.name) || {}).kind));
  rec("THE CONTROL: the fixture has rows only a bitmap can decide", asked.length >= 3, asked.map((c) => c.name));
  const nbOut = fs.existsSync(path.join(nb.modRoot, "map", "adjacencies.csv")) ? mineOf(nb) : "";
  rec("⭐⭐⭐ with no bitmap to ask, nothing throws, and no wall or one-shore row is retyped — an unknown answer changes nothing",
    !threw && !!n && n.wallsOpened === 0 && n.oneShore === 0 && !!nbOut && asked.every((c) => lineOf(nbOut, c.name) === c.base), { threw, n });
  rec("⭐⭐ …while the rows that need no bitmap are retyped as before", !!n && n.seaLinks === count("seaLink") && n.landCrossings === count("landCrossing")
    && n.retyped === count("seaLink") + count("landCrossing"), n);

  console.log("\n=== a layer below with no definition.csv ===");
  const nd = makeWorld({ modCsv: null, baseDef: false });
  rec("THE CONTROL: the layer below has the rows and no definition.csv",
    fs.existsSync(path.join(nd.gameRoot, "map", "adjacencies.csv")) && !fs.existsSync(path.join(nd.gameRoot, "map", "definition.csv")));
  const ndr = md.fixAdjacenciesForProvinceTypes(nd);
  rec("⭐⭐ with no types below to read the rows by, the pass stands aside — skipped, not a failed read the summary lists as unfinished — and writes nothing",
    !!ndr.skipped && !ndr.error && ndr.retyped === 0 && !fs.existsSync(path.join(nd.modRoot, "map", "adjacencies.csv")), ndr);

  console.log("\n=== the summary ===");
  const line = P.autoFixSummary({ ok: true, fixes: { adjacencyTypes: r } });
  const oneT = [...want.values()].filter((e) => e.kind === "oneShore" && e.touching).length;
  rec("⭐⭐ the Auto-fix summary words the one-shore straits and the walls it opened",
    line.includes(`${r.oneShore} strait(s) left with one shore became ${oneT} plain border(s) and ${r.oneShore - oneT} link(s) nobody crosses`)
    && line.includes(`${r.wallsOpened} impassable border(s) now in the sea were opened`), line.slice(0, 700));

  console.log("\n=== one real Auto-fix click, and a second ===");
  // the inverted army strait alone, beside an ocean that joins its two drowned shores, so no other pass has a sea to drain
  const d = path.join(SCRATCH, "click"), game = path.join(d, "game"), mod = path.join(d, "mod");
  const [a, tt, b, q, o] = [1, 2, 3, 4, 5];
  mk(path.join(game, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL(y >= 2 ? o : [a, tt, b, q][Math.floor(x / 2)])));
  mk(path.join(game, "map", "definition.csv"), defn({ [a]: L, [tt]: S, [b]: L, [q]: L, [o]: S }));
  mk(path.join(game, "map", "adjacencies.csv"), csv([`${a};${b};sea;${tt};-1;-1;-1;-1;ARMY_X;Army strait`]));
  mk(path.join(game, "map", "adjacency_rules.txt"), `adjacency_rule =\n{\n\tname = "ARMY_X"\n\tenemy = { army = no navy = no submarine = no trade = no }\n\trequired_provinces = { ${a} ${b} }\n\ticon = ${a}\n\toffset = { 0 0 0 }\n}\n`);
  mk(path.join(mod, "descriptor.mod"), 'name="one click"\n');
  mk(path.join(mod, "map", "definition.csv"), defn({ [a]: S, [tt]: L, [b]: S, [q]: L, [o]: S }));
  const cc = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
  const c1 = md.autoFixMap(cc);
  const f1 = (c1 && c1.fixes) || {};
  const own = (rel) => (fs.existsSync(path.join(mod, rel)) ? fs.readFileSync(path.join(mod, rel), "utf8") : "");
  rec("⭐⭐⭐ one click makes the inverted army strait a sea link AND takes its rule out",
    (f1.adjacencyTypes || {}).seaLinks === 1 && (f1.rulesOnLand || {}).fixed === 1 && own("map/adjacencies.csv").includes(`\r\n${a};${b};;-1;-1;-1;-1;-1;;Army strait\r\n`)
    && /^#\tname = "ARMY_X"$/m.test(own("map/adjacency_rules.txt")), { at: f1.adjacencyTypes, rol: f1.rulesOnLand, adj: own("map/adjacencies.csv") });
  const snap = [own("map/adjacencies.csv"), own("map/adjacency_rules.txt")];
  const c2 = md.autoFixMap(cc);
  const f2 = (c2 && c2.fixes) || {};
  rec("⭐⭐⭐ …and a second click writes neither file", !(f2.adjacencyTypes || {}).retyped && !(f2.rulesOnLand || {}).fixed
    && own("map/adjacencies.csv") === snap[0] && own("map/adjacency_rules.txt") === snap[1], { at: f2.adjacencyTypes, rol: f2.rulesOnLand, nothing: c2 && c2.nothingToFix });
} finally {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
