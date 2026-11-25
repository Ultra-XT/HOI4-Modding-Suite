// ⛔ #a-generated-coast-is-not-the-oceans-border — A RAISED SEA KEPT THE OCEAN'S OUTLINE.
//
// Generate land retypes whole sea provinces, so every coast it made was an old province border: the smooth arcs the base game
// drew between two OCEAN provinces. Measured on TEST 31 against vanilla: 0.0078 coast edges per land pixel against 0.0265, and
// capes and bays at every scale a quarter to a fifth as common. Now the pixels along the new coast move between the raised province
// and the sea beside it, BEFORE anything else reads provinces.bmp, through the owner's own flow: Delete map, then Generate land.
//
// Pinned on a world of square ocean provinces, whose borders are long straight lines (the worst case — no coast at all is rough),
// with two lakes in it, generated three times with one seed: twice as the page calls it, and once with `roughenCoast: false` as
// the control. The seed is one where the raised land reaches the lakes, and a CONTROL counts that shore: a lake no raised province
// touches cannot show a lake moving. Everything compared against the control is derived from the control's own files:
//   · the coast is rough: more coast edges per land pixel, by the test's own walk round the wrap seam;
//   · only coast pixels moved, and only between a province raised by this click and the sea — never a lake, never land to land;
//   · every province pair is still there and no new one appeared, every border that is not a coast keeps its length, and every
//     province is still as many pieces as it was — so the states, the neighbour graph and the rail search Generate land built
//     on stay right;
//   · the raise, the beach and the terrain paint follow the NEW outline: no sea pixel stands above the sea floor, the shore's
//     median height is the beach ramp's first step, and no land pixel is painted as water;
//   · Map Errors finds nothing on it the control does not, no province reaches round the wrap seam, and the same seed is the
//     same world byte for byte;
//   · the report says how many pixels moved, and that count is the one on disk; the page says it in a sentence.
//
// Run: node test-a-generated-coast-is-not-the-oceans-border.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-roughcoast-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");

// ── the fixture: Delete map's ocean, as square provinces ─────────────────────────────────────────────────────────────
const S = 24, COLS = 16, ROWS = 8, W = S * COLS, H = S * ROWS, PROVINCES = COLS * ROWS;
const idAt = (x, y) => Math.floor(y / S) * COLS + Math.floor(x / S) + 1;
const colourOf = (id) => [(id * 37) & 255, id, 120];
const LAKES = new Set([idAt(5 * S, 3 * S), idAt(10 * S, 4 * S)]);
const regionOf = (id) => { const i = id - 1; return Math.floor((i % COLS) / 4) + 4 * Math.floor(Math.floor(i / COLS) / 4) + 1; };
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, urban: 13, lakes: 14, ocean: 15 };
const WATER = ["ocean", "lakes"];

function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp8(fn) {
  const off = 54 + 1024, b = Buffer.alloc(off + IRS * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(IRS * H, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * IRS + x] = fn(x, y);
  return b;
}
const terrainFile = () => "categories = {\n"
  + Object.keys(TABLE).map((c) => `\t${c} = {${WATER.includes(c) ? " is_water = yes" : ""} color = { 100 120 140 } movement_cost = 1.0 }`).join("\n")
  + "\n}\nterrain = {\n" + Object.entries(TABLE).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n";

function makeMod(tag) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Rough Coast"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(LAKES.has(id) ? `${id};${r};${g};${b};lake;false;lakes;0` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24((x, y) => colourOf(idAt(x, y))));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(() => md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8((x, y) => (LAKES.has(idAt(x, y)) ? TABLE.lakes : TABLE.ocean)));
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), terrainFile());
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { if (LAKES.has(id)) continue; const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  return mod;
}

// ── the test's own reads of what is on disk ──────────────────────────────────────────────────────────────────────────
function typesOf(mod) {
  const t = new Map();
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = ln.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0]) || c[0] === "0") continue;
    t.set(parseInt(c[0], 10), c[4]);
  }
  return t;
}
function idsOf(mod) {
  const b = fs.readFileSync(path.join(mod, "map", "provinces.bmp")), off = b.readUInt32LE(10), rs = (W * 3 + 3) & ~3;
  const byColour = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, bl] = colourOf(id); byColour.set((r << 16) | (g << 8) | bl, id); }
  const ids = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = off + (H - 1 - y) * rs + x * 3; ids[y * W + x] = byColour.get((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) || 0; }
  return ids;
}
const bytes8 = (mod, rel) => { const b = fs.readFileSync(path.join(mod, ...rel.split("/"))), off = b.readUInt32LE(10); return (x, y) => b[off + (H - 1 - y) * IRS + x]; };
// every 4-neighbour edge, the wrap seam included (column W-1 meets column 0; the top and bottom rows do not meet)
function eachEdge(fn) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; fn(i, y * W + (x + 1) % W); if (y + 1 < H) fn(i, i + W); } }
function bordersOf(ids) {
  const m = new Map();
  eachEdge((i, j) => { const a = ids[i], b = ids[j]; if (a === b) return; const k = a < b ? a + "-" + b : b + "-" + a; m.set(k, (m.get(k) || 0) + 1); });
  return m;
}
function piecesOf(ids) {
  const seen = new Uint8Array(W * H), out = new Map();
  for (let s = 0; s < W * H; s++) {
    if (seen[s]) continue;
    const p = ids[s]; out.set(p, (out.get(p) || 0) + 1);
    const q = [s]; seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i - x) / W;
      for (const j of [y * W + (x + 1) % W, y * W + (x + W - 1) % W, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1]) if (j >= 0 && !seen[j] && ids[j] === p) { seen[j] = 1; q.push(j); }
    }
  }
  return out;
}
const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[(s.length - 1) >> 1] : null; };

// seed 5: both lakes border land this click raises (at seed 7 neither did, and a lake-moving step passed); the CONTROL below says
// so if a change to the land's growth ever takes that away
const GEN = { gameRoot: null, dependencyRoots: [], count: 40, provincesPerState: 6, seed: 5 };
try {
  console.log("=== a generated coast is not the ocean's border ===\n");
  const pristine = makeMod("pristine");
  const before = idsOf(pristine);

  const rough = makeMod("rough"), twin = makeMod("twin"), control = makeMod("control");
  const g = md.generateLand({ modRoot: rough, ...GEN });
  const gt = md.generateLand({ modRoot: twin, ...GEN });
  const gc = md.generateLand({ modRoot: control, ...GEN, roughenCoast: false });
  const c = g.coasts || {};
  console.log(`     coasts: ${JSON.stringify(c).slice(0, 400)}`);

  console.log("1. Generate land ran, and reshaped the coast");
  rec("all three runs made their land", [g, gt, gc].every((r) => r.changed === true && !r.error && r.flippedProvinces === GEN.count), [g, gt, gc].map((r) => r.error || r.flippedProvinces));
  rec("…and the control was told it was turned off", !!(gc.coasts && gc.coasts.changed === false && /roughenCoast: false/.test(gc.coasts.skipped || "")), gc.coasts);
  rec("⚠ the control's provinces.bmp is byte for byte the ocean it started as (nothing else in Generate land writes it)", sha(path.join(control, "map", "provinces.bmp")) === sha(path.join(pristine, "map", "provinces.bmp")));
  const types = typesOf(rough), ctypes = typesOf(control);
  const land = new Set([...types].filter(([, t]) => t === "land").map(([id]) => id));
  rec("both worlds raised the same provinces (the coast step comes after the choice)", JSON.stringify([...types]) === JSON.stringify([...ctypes]), land.size);
  rec("⭐⭐⭐ the coast step moved pixels", c.changed === true && c.pixels > 0, c);

  const after = idsOf(rough);
  const moved = [];
  for (let i = 0; i < W * H; i++) if (after[i] !== before[i]) moved.push(i);
  rec("⭐ …and the count it reports is the count on disk", moved.length === c.pixels && c.toLand + c.toSea === c.pixels, { onDisk: moved.length, reported: c.pixels, toLand: c.toLand, toSea: c.toSea });
  const kindOf = (p) => (land.has(p) ? "land" : types.get(p));
  const strays = moved.filter((i) => !((kindOf(before[i]) === "land" && kindOf(after[i]) === "sea") || (kindOf(before[i]) === "sea" && kindOf(after[i]) === "land")));
  rec("⭐⭐ every moved pixel went between a province this click raised and the sea — never a lake, never land to land", strays.length === 0, strays.slice(0, 5).map((i) => ({ x: i % W, y: (i - i % W) / W, from: before[i], to: after[i] })));
  // A lake that touches no raised province has nothing to move against, so "never a lake" holds whatever the step thinks a lake
  // is: at seed 7 neither lake touched one, and the step treating lakes as sea passed every check. Counted, so a seed that loses
  // its lake shore says so instead of passing.
  const lakeShore = (ids) => { let e = 0; eachEdge((i, j) => { if ((LAKES.has(ids[i]) && land.has(ids[j])) || (LAKES.has(ids[j]) && land.has(ids[i]))) e++; }); return e; };
  rec("⭐⭐ CONTROL: lakes are in the world, and a lake borders a province this click raised — so that has something to be wrong about", [...LAKES].every((l) => types.get(l) === "lake") && lakeShore(before) > 0, { lakeShorePx: lakeShore(before) });
  const toLand = moved.filter((i) => land.has(after[i])).length;
  rec("pixels moved both ways — bays as well as capes", toLand > 0 && toLand < moved.length && toLand === c.toLand, { toLand, toSea: moved.length - toLand });

  console.log("\n2. The coast is rough");
  const coastPer = (ids) => { let e = 0, n = 0; eachEdge((i, j) => { if (land.has(ids[i]) !== land.has(ids[j]) && kindOf(ids[i]) !== "lake" && kindOf(ids[j]) !== "lake") e++; }); for (let i = 0; i < W * H; i++) if (land.has(ids[i])) n++; return { e, n, per: e / n }; };
  const cr = coastPer(after), cc = coastPer(before);
  console.log(`     coast edges per land px: control ${cc.per.toFixed(4)} (${cc.e}/${cc.n})  rough ${cr.per.toFixed(4)} (${cr.e}/${cr.n})`);
  rec("⭐⭐⭐ at least 1.2 × the control's coast edges per land pixel", cr.per >= 1.2 * cc.per, { rough: +cr.per.toFixed(4), control: +cc.per.toFixed(4) });

  console.log("\n3. Nothing but the coast changed");
  const bb = bordersOf(before), ba = bordersOf(after);
  const lost = [...bb.keys()].filter((k) => !ba.has(k)), gained = [...ba.keys()].filter((k) => !bb.has(k));
  rec("⭐⭐⭐ the province pair graph is the control's: no pair lost, none gained", lost.length === 0 && gained.length === 0, { lost, gained });
  const isCoast = (k) => { const [a, b] = k.split("-").map(Number); return (land.has(a) && kindOf(b) === "sea") || (kindOf(a) === "sea" && land.has(b)); };
  const resized = [...bb].filter(([k, n]) => !isCoast(k) && ba.get(k) !== n);
  rec("⭐⭐ every border that is not a coast keeps its length to the pixel (land-land, sea-sea, lake shores)", resized.length === 0 && [...bb.keys()].filter((k) => !isCoast(k)).length > 0, resized.slice(0, 5));
  const pb = piecesOf(before), pa = piecesOf(after);
  const split = [...pb].filter(([p, n]) => pa.get(p) !== n);
  rec("⭐⭐ every province is as many pieces as it was", split.length === 0, split.slice(0, 5));
  const seam = (ids) => { const w = new Set(), e = new Set(); for (let y = 0; y < H; y++) { w.add(ids[y * W]); e.add(ids[y * W + W - 1]); } return [...w].filter((p) => e.has(p)); };
  rec("⭐ no province reaches round the wrap seam", seam(after).length === 0 && seam(before).length === 0, seam(after));
  // X-crossings by the test's own walk, the seam's blocks included: this grid of squares has one at every corner, so a count says
  // more than the validator's one row for all of them
  const xs = (ids) => { let n = 0; for (let y = 0; y + 1 < H; y++) for (let x = 0; x < W; x++) { const x1 = (x + 1) % W, a = ids[y * W + x], b = ids[y * W + x1], c = ids[(y + 1) * W + x], d = ids[(y + 1) * W + x1]; if (new Set([a, b, c, d]).size === 4) n++; } return n; };
  rec("⭐ exactly as many X-crossings as the ocean had (the grid's own corners): none made, none moved", xs(after) === xs(before) && xs(before) > 0, { rough: xs(after), control: xs(before) });
  // A problem ROW is not a problem COUNT: each rule weighed by its own total or list, so one row of 3 is not one row of 1
  const flagged = (mod) => { const m = new Map(); for (const p of md.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] })) m.set(p.rule, (m.get(p.rule) || 0) + (p.total || (p.provinces || p.coords || p.items || []).length || 1)); return m; };
  const vr = flagged(rough), vc = flagged(control);
  const worse = [...vr].filter(([rule, n]) => n > (vc.get(rule) || 0));
  rec("⭐⭐ Map Errors finds nothing on it the control does not", worse.length === 0, { rough: [...vr], control: [...vc] });

  console.log("\n4. The raise, the beach and the paint follow the new outline");
  const h = bytes8(rough, "map/heightmap.bmp"), t = bytes8(rough, "map/terrain.bmp");
  let seaHigh = 0, landLow = 0, landWet = 0, seaDry = 0;
  const shore = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = after[y * W + x];
    if (kindOf(p) === "sea") { if (h(x, y) !== md.HEIGHTMAP_SEA_VALUE) seaHigh++; if (t(x, y) !== TABLE.ocean) seaDry++; continue; }
    if (!land.has(p)) continue;
    if (h(x, y) < md.HEIGHTMAP_BEACH_RAMP[0]) landLow++;
    if (t(x, y) === TABLE.ocean || t(x, y) === TABLE.lakes) landWet++;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => b >= 0 && b < H).map(([a, b]) => after[b * W + (a + W) % W]);
    if (nb.some((q) => kindOf(q) === "sea")) shore.push(h(x, y));
  }
  rec("⭐⭐⭐ no sea pixel stands above the sea floor — a pixel the coast gave back to the sea was not raised", seaHigh === 0, seaHigh);
  rec("⭐⭐⭐ no land pixel is below the beach — a pixel the coast gave to the land was raised", landLow === 0, landLow);
  rec(`⭐⭐ the median height 1 px from the sea is the beach ramp's first step (${md.HEIGHTMAP_BEACH_RAMP[0]})`, shore.length > 0 && median(shore) === md.HEIGHTMAP_BEACH_RAMP[0], { n: shore.length, median: median(shore) });
  rec("⭐⭐ no land pixel is painted as water, and no sea pixel as land", landWet === 0 && seaDry === 0, { landWet, seaDry });

  console.log("\n5. The same seed is the same world");
  const files = ["map/provinces.bmp", "map/heightmap.bmp", "map/terrain.bmp", "map/definition.csv"];
  const differ = files.filter((f) => sha(path.join(rough, ...f.split("/"))) !== sha(path.join(twin, ...f.split("/"))));
  rec("⭐ same seed → the same bytes in every map file it wrote", differ.length === 0 && JSON.stringify(gt.coasts && gt.coasts.pixels) === JSON.stringify(c.pixels), differ);

  console.log("\n6. The page says what the coast step did");
  let note = null;
  try { note = P.runPage(["function generatedCoastNote("]).sb.generatedCoastNote; } catch (e) { note = null; }
  rec("generatedCoastNote was lifted out of public/map.js and runs", typeof note === "function");
  const said = note ? note({ coasts: c }) : "";
  rec("⭐ it says how many pixels moved, across how many provinces, each way", said.includes(c.pixels.toLocaleString() + " pixels reshaped") && said.includes((c.landProvinces + c.seaProvinces).toLocaleString() + " provinces") && said.includes(c.toLand.toLocaleString() + " to land"), said);
  rec("…and nothing about a coast below to keep when there is no map underneath", !/not held in place/.test(said) && !!(c.freezes && c.freezes.inherited && c.freezes.inherited.none), c.freezes);
  const off = note ? note({ coasts: gc.coasts }) : "";
  rec("the control's note says the coast was left as the ocean drew it, and why", /left as the ocean's province borders/.test(off) && /roughenCoast: false/.test(off), off);
  const MAP = maskJsComments(P.MAP);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = (P.generateLandReportLine(MAP).match(/reloadAfterImmediateWrite\(`🌍 Generated [^\n]*/) || [""])[0];
  rec("⭐ the Generate land status line carries the coast note (comments stripped)", /const coastNote = generatedCoastNote\(res\);/.test(MAP) && line.includes("${coastNote}"), line.slice(0, 160));

  console.log(`\n=== a generated coast is not the ocean's border: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
