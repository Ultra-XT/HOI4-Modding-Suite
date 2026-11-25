// ⛔ #a-generated-coast-is-not-the-oceans-border — A ROUGH COAST KEEPS THE COAST IT INHERITED (freeze (a)).
//
// The coast step roughens the coast Generate land MADE. A stretch of the new coast can also be one the mod inherited: in the
// owner's flow Delete map drowns the base game's land, Generate land raises some of it again, and where a raised province meets a
// sea that was sea in the layer below too, that edge is the base game's own coastline (14% of TEST 31's). It stays as it is: a
// pixel is held where the mod's province there is the layer below's own province AND that edge was land on one side and sea on the
// other below. That is asked of the layer below's provinces.bmp pixel by pixel, so when that bitmap is another size (Old World Blues
// is 5632 × 2304, vanilla 5632 × 2048) no pixel of one is a pixel of the other: the freeze is skipped, and the answer says so —
// never guessed by province id.
//
// Pinned on square provinces over a layer below with a continent, in the Delete-map state:
//   · the step's call raises the continent's western half and an island in the old ocean; every inherited edge (the test's own
//     count) is held, pixel for pixel, while the island's coast moves, and so does the new coast across the old continent (land
//     below on both sides: a coast Nova made, not one it inherited);
//   · the same provinces painted half a province east hold only the stretches still on the layer below's pixels — not every edge
//     a lookup by province id would (the prototype's rule, which only worked because TEST 31 kept vanilla's shapes);
//   · over a layer below one row of provinces taller, nothing throws, the freeze says it was skipped and why, the coast is still
//     reshaped — and Generate land itself makes its land and says it on the page.
//
// Run: node test-a-rough-coast-keeps-the-coast-it-inherited.js
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastinherit-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── the world: square provinces; below, a continent the mod's Delete map has drowned ───────────────────────────────────────
const S = 24, COLS = 16, ROWS = 8, W = S * COLS, H = S * ROWS, PROVINCES = COLS * ROWS;
const idAt = (x, y) => Math.floor(y / S) * COLS + Math.floor(x / S) + 1;
const colAt = (id) => (id - 1) % COLS, rowAt = (id) => Math.floor((id - 1) / COLS);
const colourOf = (id) => [(id * 37) & 255, id & 255, 120 + (id >> 8)];
const LAKE = idAt(14 * S, 6 * S);
const landBelow = (id) => colAt(id) >= 3 && colAt(id) <= 8 && rowAt(id) >= 2 && rowAt(id) <= 5;
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * h);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (h - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const bmp8 = (v) => { const off = 54 + 1024, b = Buffer.alloc(off + IRS * H, v); b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(IRS * H, 34); b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50); for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; } return b; };

/** A layer below of `rows` rows of provinces (ROWS, or one more: a taller map whose first ROWS rows are this world's). */
function makeBelow(tag, rows) {
  const dir = fs.mkdtempSync(path.join(SANDBOX, tag + "-")), n = rows * COLS, out = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= n; id++) { const [r, g, b] = colourOf(id); out.push(id === LAKE ? `${id};${r};${g};${b};lake;false;lakes;0` : landBelow(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(dir, "map", "definition.csv"), out.join("\r\n") + "\r\n");
  mk(path.join(dir, "map", "provinces.bmp"), bmp24(W, rows * S, (x, y) => colourOf(idAt(x, y))));
  return dir;
}
/** The mod in the Delete-map state: every province sea but the lake. `roll` moves its whole bitmap that many pixels east — the
 *  same provinces, no longer on the same pixels as below. */
function makeMod(tag, roll = 0) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Inherited Coast"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(id === LAKE ? `${id};${r};${g};${b};lake;false;lakes;0` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt((x - roll + W) % W, y))));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8(15));
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), "categories = {\n\tplains = { color = { 100 120 140 } movement_cost = 1.0 }\n\tforest = { color = { 100 120 140 } movement_cost = 1.0 }\n\tlakes = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n\tocean = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n}\nterrain = {\n\tplains_g = { type = plains color = { 0 } texture = 1 }\n\tforest_g = { type = forest color = { 1 } texture = 1 }\n\tlakes_g = { type = lakes color = { 14 } texture = 1 }\n\tocean_g = { type = ocean color = { 15 } texture = 1 }\n}\n");
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { if (id === LAKE) continue; const r = Math.floor(colAt(id) / 4) + 4 * Math.floor(rowAt(id) / 4) + 1; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  return mod;
}

try {
  console.log("=== a rough coast keeps the coast it inherited ===\n");
  const below = makeBelow("below", ROWS);
  const mod = makeMod("mod");
  const bmpBefore = sha(fs.readFileSync(path.join(mod, "map", "provinces.bmp")));
  const model = md.buildMapModel({ modRoot: mod, gameRoot: below, dependencyRoots: [] });

  console.log("1. A mod that keeps the layer below's shapes");
  // raised: the continent's western half (land below), and an island out in the old ocean (sea below)
  const WEST = []; for (let id = 1; id <= PROVINCES; id++) if (landBelow(id) && colAt(id) <= 5) WEST.push(id);
  const ISLAND = idAt(12 * S, 6 * S);
  const picked = [...WEST, ISLAND].map(String);
  const raised = new Set(picked.map(Number));
  const isSea = (p) => !raised.has(p) && p !== LAKE && p >= 1 && p <= PROVINCES;
  // the inherited coast, by the test's own walk round the wrap: an edge whose two pixels are, in the mod, a raised province and a sea
  // — the very provinces the layer below has on those two pixels — and was land on one side and sea on the other below
  const belowIds = Int32Array.from({ length: W * H }, (_, i) => idAt(i % W, Math.floor(i / W)));
  const rolled = (roll) => Int32Array.from({ length: W * H }, (_, i) => idAt((i % W - roll + W) % W, Math.floor(i / W)));
  const heldEdges = (ids) => {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const j of [y * W + (x + 1) % W, y + 1 < H ? i + W : -1]) {
        if (j < 0) continue;
        const a = ids[i], b = ids[j];
        if (a === b || belowIds[i] !== a || belowIds[j] !== b) continue;
        if ((raised.has(a) && landBelow(a) && isSea(b) && !landBelow(b)) || (raised.has(b) && landBelow(b) && isSea(a) && !landBelow(a))) out.push([i, j]);
      }
    }
    return out;
  };
  const ids0 = rolled(0), held = heldEdges(ids0);
  const r = md.roughenGeneratedCoast({ modRoot: mod, gameRoot: below, dependencyRoots: [], picked, model, seed: 3 });
  const after = r.raster ? r.raster.ids : ids0;
  const inh = (r.report && r.report.freezes && r.report.freezes.inherited) || {};
  rec("the step reshaped the coast, and its own check passed it", !!(r.report && r.report.changed && r.changed.length > 0 && !r.report.refused), r.report);
  rec("…and wrote nothing: it computes, the writer writes", sha(fs.readFileSync(path.join(mod, "map", "provinces.bmp"))) === bmpBefore);
  rec("⭐⭐ it held exactly the inherited coast's edges — the test's own count of them", held.length > 0 && inh.edges === held.length, { held: held.length, report: inh });
  const movedOnIt = held.filter(([i, j]) => after[i] !== ids0[i] || after[j] !== ids0[j]);
  rec("⭐⭐⭐ not one pixel of the coast it inherited moved", movedOnIt.length === 0, movedOnIt.slice(0, 5).map(([i]) => ({ x: i % W, y: Math.floor(i / W) })));
  const changed = r.changed || [];
  const touches = (pred) => changed.filter((i) => pred(ids0[i]) || pred(after[i])).length;
  rec("⭐⭐ …while the island out in the old ocean has its coast reshaped", touches((p) => p === ISLAND) > 0, touches((p) => p === ISLAND));
  rec("⭐ …and so does the new coast across the old continent (land below on both sides, so not inherited)", touches((p) => landBelow(p) && !raised.has(p)) > 0, touches((p) => landBelow(p) && !raised.has(p)));

  // the same provinces painted half a province east: the layer below's coast is no longer where the mod's provinces meet, so only
  // the stretches where the two bitmaps still agree pixel for pixel are held — asked of the pixels, never of the ids
  const ROLL = S / 2, modR = makeMod("rolled", ROLL), idsR = rolled(ROLL), heldR = heldEdges(idsR);
  const rr = md.roughenGeneratedCoast({ modRoot: modR, gameRoot: below, dependencyRoots: [], picked, model: md.buildMapModel({ modRoot: modR, gameRoot: below, dependencyRoots: [] }), seed: 3 });
  const inhR = (rr.report && rr.report.freezes && rr.report.freezes.inherited) || {};
  const byId = held.length;   // what a lookup by id alone would hold here: every raised-land | sea-below edge, wherever it is drawn
  rec(`⭐⭐ a mod whose shapes are its own: it holds exactly the ${heldR.length} edges still on the layer below's pixels, not the ${byId} a lookup by id would`, heldR.length > 0 && heldR.length < byId && inhR.edges === heldR.length, { held: heldR.length, report: inhR });
  const afterR = rr.raster ? rr.raster.ids : idsR;
  rec("…and none of those moved", heldR.every(([i, j]) => afterR[i] === idsR[i] && afterR[j] === idsR[j]));

  console.log("\n2. A layer below of another size");
  const tall = makeBelow("tall", ROWS + 1);
  const mod2 = makeMod("mod2");
  let r2 = null, threw = "";
  try { r2 = md.roughenGeneratedCoast({ modRoot: mod2, gameRoot: tall, dependencyRoots: [], picked, model: md.buildMapModel({ modRoot: mod2, gameRoot: tall, dependencyRoots: [] }), seed: 3 }); } catch (e) { threw = e.message; }
  const inh2 = (r2 && r2.report && r2.report.freezes && r2.report.freezes.inherited) || {};
  rec("nothing throws", !threw, threw);
  rec(`⭐⭐⭐ the inherited-coast freeze is skipped, and says why: the sizes (${W} × ${H + S} below, ${W} × ${H} here)`, !!inh2.skipped && inh2.skipped.includes(`${W} × ${H + S}`) && inh2.skipped.includes(`${W} × ${H}`) && inh2.edges === undefined, inh2);
  rec("⭐ …and the coast is still reshaped", !!(r2 && r2.report && r2.report.changed), r2 && r2.report);
  const g = md.generateLand({ modRoot: makeMod("mod3"), gameRoot: tall, dependencyRoots: [], count: 30, provincesPerState: 6, seed: 7 });
  const ginh = (g.coasts && g.coasts.freezes && g.coasts.freezes.inherited) || {};
  rec("⭐⭐ through Generate land itself: the land is made, the coast reshaped, the freeze skipped", g.changed === true && g.flippedProvinces === 30 && !!(g.coasts && g.coasts.changed) && !!ginh.skipped, { error: g.error, coasts: g.coasts });
  const note = P.runPage(["function generatedCoastNote("]).sb.generatedCoastNote(g);
  rec("⭐ …and the page says the coast underneath was not held, and why", /not held in place/.test(note) && note.includes(ginh.skipped || "\u0000"), note);

  console.log(`\n=== a rough coast keeps the coast it inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
