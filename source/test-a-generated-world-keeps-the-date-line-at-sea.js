// ⛔ #a-generated-world-keeps-the-date-line-at-sea — A CONTINENT THAT REACHES THE DATE LINE ENDS IN A RULER-STRAIGHT COAST.
//
// TEST 33's rehearsal (Delete map → Generate land 35% seed 1 → Auto-fix → Redraw): 140 rows of its coast ran down the date line —
// land at x 5631 against sea at x 0, two runs of 100 and 40 pixels — and seed 2's continent crossed it, 1,879 rows of land on both
// sides. All eight shipping maps measured have 0 of either. growLandmasses grows over provinceNeighbourGraph, which joins the seam,
// and nothing stopped a mass taking a seam province without its partner across the line; roughenCoastline's own date-line guard
// (#a-rough-coast-does-not-cross-the-date-line) then rightly refused to roughen a coast that IS the seam, so it stayed the seam's
// own straight line.
//
// So when the layer below keeps the date line at sea — no land in either edge column of the provinces.bmp it loads — every sea
// province with a pixel in either edge column is BLOCKED: never a seed, never taken off a frontier. Nothing is blocked with no layer
// below to ask (an unknown forbids nothing) or with land on the seam below (Old World Blues runs land into it). A count the blocked
// provinces leave short is clamped and said, never quietly made up elsewhere.
//
// "The layer below" is the one directly beneath the mod — a dependency before the game under it (D2b) — and it is the same layer
// every other reader of the click asks, the latitude mix among them, even on a mod that declares replace_path="map" (D3b). Neither
// was pinned, and the review's mutants of both passed this file (GRV-1, GRV-3).
//
// And two bitmaps are read, each for its own question: whether the date line is at sea is asked of the layer below's OWN
// provinces.bmp, with its own definition.csv (D6b); the provinces kept at sea are read off the provinces.bmp that LOADS — the mod's
// own, when it ships a map whose provinces are not where the layer below has them (D6). Every other fixture here draws the mod and
// the layers below with one lattice, so both bitmaps gave one answer: a mutant that blocked by the layer below's edge columns passed
// this file, and on D6 it raises 19 of the 32 provinces on the mod's own date line (GRV2-1).
//
// Pinned on the one-pixel lattice of test-generate-land-grows-landmasses-not-a-scatter.js (24 × 16, eight regions), with a base game
// (and in D2b a dependency) beneath it holding the same lattice.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dateline-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// the lattice: one-pixel provinces, id = y * W + x + 1, so the province neighbour graph is the grid plus the wrap seam
const W = 24, H = 16, PROVINCES = W * H;
const idAt = (x, y) => y * W + x + 1, colOf = (id) => (id - 1) % W;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 77];
const regionOf = (id) => { const i = id - 1, x = i % W, y = Math.floor(i / W); return Math.floor(x / 6) + 4 * Math.floor(y / 8) + 1; };
const onSeam = (id) => colOf(id) === 0 || colOf(id) === W - 1;
const SEAM = []; for (let id = 1; id <= PROVINCES; id++) if (onSeam(id)) SEAM.push(id);

// a layer beneath: the same lattice; `landBelow(id)` says which of its provinces are land
function makeLayer(prefix, landBelow) {
  const dir = fs.mkdtempSync(path.join(SANDBOX, prefix + "-"));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(landBelow(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(dir, "map", "definition.csv"), rows.join("\n") + "\n");
  mk(path.join(dir, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return dir;
}
// …the base game
function makeGame(tag, landBelow = () => false) {
  const game = makeLayer("game-" + tag, landBelow);
  mk(path.join(game, "hoi4.exe"), "");
  return game;
}
// …and a mod the mod depends on, between it and the game
function makeDep(tag, landBelow) {
  const dep = makeLayer("dep-" + tag, landBelow);
  mk(path.join(dep, "descriptor.mod"), 'name="DateLineBelow"\n');
  return dep;
}
// the province the mod's own provinces.bmp draws at (x, y): the lattice, or with `shift` the same provinces `shift` columns further
// west — its own map, whose edge columns hold provinces the layer below has inland
const drawnAt = (shift) => (x, y) => idAt((x + shift) % W, y);
// the mod: the same shapes, all sea (what Delete map leaves), its own regions; it replaces history/states, and map only when asked
function makeMod(tag, { replacesMap = false, shift = 0 } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, "mod-" + tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="DateLine"\nreplace_path="history/states"\n' + (replacesMap ? 'replace_path="map"\n' : ""));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\n") + "\n");
  const at = drawnAt(shift);
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(at(x, y))));
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  return mod;
}
const landOf = (mod) => {
  const out = [];
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = ln.split(";"); if (/^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land") out.push(parseInt(c[0], 10)); }
  return out;
};
const generate = (mod, game, count, seed = 1, deps = []) => md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: deps, count, provincesPerState: 8, seed, fillCutOffSeas: false });
let d1 = null, d4 = null;   // the answers D5 reads the page's line off

try {
  console.log("=== a generated world keeps the date line at sea where the layer below does ===\n");

  // ── the pure half: growLandmasses never takes a blocked province, and without one draws exactly as before ─────────────────────
  console.log("0. growLandmasses with blocked provinces");
  if (typeof md.growLandmasses !== "function") rec("map-data.js exports growLandmasses", false);
  else {
    const mod = makeMod("pure"), game = makeGame("pure");
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
    const adj = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
    const eligible = []; for (let id = 1; id <= PROVINCES; id++) eligible.push(String(id));
    const seeded = (s) => () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const blocked = new Set(SEAM.map(String));
    const n = Math.round(0.95 * PROVINCES);
    const free = md.growLandmasses({ eligible, adj, n, rnd: seeded(3) }), none = md.growLandmasses({ eligible, adj, n, rnd: seeded(3), blocked: new Set() });
    const kept = md.growLandmasses({ eligible, adj, n: eligible.length - blocked.size, rnd: seeded(3), blocked });
    const scatter = md.growLandmasses({ eligible, adj: null, n: eligible.length - blocked.size, rnd: seeded(3), blocked });
    rec("CONTROL: grown freely to 95% of the sea, the land takes seam provinces — so the fixture can tell", free.filter((p) => blocked.has(p)).length > 0, free.filter((p) => blocked.has(p)).length);
    rec("⭐⭐ an empty blocked set draws exactly as no blocked set", JSON.stringify(free) === JSON.stringify(none), { free: free.length, none: none.length });
    rec("⭐⭐⭐ given every unblocked province to grow, it takes all of them and not one blocked", kept.length === eligible.length - blocked.size && kept.every((p) => !blocked.has(p)), { got: kept.length, want: eligible.length - blocked.size, blockedTaken: kept.filter((p) => blocked.has(p)).length });
    rec("⭐ …and so does the scatter it falls back to with no graph", scatter.length === eligible.length - blocked.size && scatter.every((p) => !blocked.has(p)), scatter.length);
  }

  // ── D1. a layer below with the date line at sea: no generated province touches it ────────────────────────────────────────────
  console.log("\nD1. the layer below keeps the date line at sea");
  {
    const mod = makeMod("d1"), game = makeGame("d1");
    const count = Math.round(0.6 * PROVINCES);
    const r = d1 = generate(mod, game, count);
    const land = landOf(mod), onIt = land.filter(onSeam);
    rec("the generator ran and grew", r.changed === true && r.grown === true && !r.error, r.error || { flipped: r.flippedProvinces });
    rec("⭐⭐⭐ D1. not one generated province has a pixel in the first or last column — the date line stays at sea", onIt.length === 0, onIt.slice(0, 10));
    rec("⭐⭐ D1. …and the land is the count asked for", r.flippedProvinces === count && land.length === count, { flipped: r.flippedProvinces, land: land.length, count });
    const sb = r.seamBlocked || {};
    rec("⭐⭐ D1. the report says how many seam provinces it kept at sea, and why", sb.count === SEAM.length && /date line/.test(String(sb.reason)) && sb.keptAtSea === 0, sb);
  }

  // ── D2. a layer below with land on the seam: nothing is blocked ──────────────────────────────────────────────────────────────
  console.log("\nD2. the layer below has land on the date line");
  {
    const mod = makeMod("d2"), game = makeGame("d2", (id) => colOf(id) === 0);
    const count = Math.round(0.95 * PROVINCES);
    const r = generate(mod, game, count);
    const onIt = landOf(mod).filter(onSeam);
    rec("the generator ran", r.changed === true && !r.error, r.error || r.flippedProvinces);
    rec("⭐⭐ D2. nothing is blocked where the world below runs land into the seam itself", (r.seamBlocked || {}).count === 0 && /land on the date line/.test(String((r.seamBlocked || {}).reason)), r.seamBlocked);
    rec("⭐⭐ D2. …so 95% of the sea reaches it", onIt.length > 0 && count > PROVINCES - SEAM.length, { onSeam: onIt.length, count, notSeam: PROVINCES - SEAM.length });
  }

  // ── D2b. an add-on: its dependency runs land into the seam, the game beneath that keeps it at sea — the dependency answers ───────
  console.log("\nD2b. the layer directly below has land on the date line, the game beneath it does not");
  {
    const mod = makeMod("d2b"), game = makeGame("d2b"), dep = makeDep("d2b", (id) => colOf(id) === 0);
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
    const alone = md.seamSeaProvinces({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
    const count = Math.round(0.95 * PROVINCES);
    const r = generate(mod, game, count, 1, [dep]);
    const onIt = landOf(mod).filter(onSeam), sb = r.seamBlocked || {};
    rec("CONTROL: asked of the game alone, every seam province is blocked — so the fixture can tell which layer answered", alone.blocked.size === SEAM.length, { blocked: alone.blocked.size, seam: SEAM.length });
    rec("the generator ran", r.changed === true && !r.error, r.error || r.flippedProvinces);
    rec("⭐⭐⭐ D2b. the layer directly beneath the mod answers, not the game under it: the dependency runs land into the seam, so nothing is blocked", sb.count === 0 && /land on the date line/.test(String(sb.reason)), sb);
    rec("⭐ D2b. …so 95% of the sea reaches it", onIt.length > 0, { onSeam: onIt.length, count });
  }

  // ── D3. no layer below: nothing is blocked, and it says why ──────────────────────────────────────────────────────────────────
  console.log("\nD3. no layer below to ask");
  {
    const mod = makeMod("d3");
    const count = Math.round(0.95 * PROVINCES);
    const r = generate(mod, null, count);
    rec("the generator ran", r.changed === true && !r.error, r.error || r.flippedProvinces);
    rec("⭐⭐ D3. with nothing below to ask, nothing is blocked — an unknown forbids nothing — and the report says so", (r.seamBlocked || {}).count === 0 && /no layer below/.test(String((r.seamBlocked || {}).reason)) && landOf(mod).some(onSeam), r.seamBlocked);
  }

  // ── D3b. a mod that replaces map: the date line is asked of the same world beneath as the rest of the click ─────────────────────
  console.log("\nD3b. the mod declares replace_path=\"map\"");
  {
    const mod = makeMod("d3b", { replacesMap: true }), game = makeGame("d3b", (id) => colOf(id) === W / 2);
    const mix = md.terrainMixByLatitude({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    const count = Math.round(0.6 * PROVINCES);
    const r = generate(mod, game, count);
    const onIt = landOf(mod).filter(onSeam), sb = r.seamBlocked || {};
    rec("CONTROL: the same click's latitude mix reads the game beneath the mod, its replace_path notwithstanding", !!mix && path.resolve(mix.from) === path.resolve(game), mix && mix.from);
    rec("the generator ran and grew", r.changed === true && r.grown === true && !r.error, r.error || { flipped: r.flippedProvinces });
    rec("⭐⭐⭐ D3b. …and so does the date line: that game keeps it at sea, so every seam province is kept at sea and no generated one touches it", sb.count === SEAM.length && /keeps the date line at sea/.test(String(sb.reason)) && onIt.length === 0, { sb, onSeam: onIt.length });
  }

  // ── D6. a mod with its own map: the provinces kept at sea are the ones on ITS edge columns, not the layer below's ───────────────
  // Shifted two columns, so the two seams share no province: a reader asking the wrong bitmap blocks none of the right ones.
  const SHIFT = 2, modSeamOf = (shift) => { const at = drawnAt(shift), s = new Set(); for (let y = 0; y < H; y++) { s.add(at(0, y)); s.add(at(W - 1, y)); } return s; };
  console.log("\nD6. the mod's own provinces.bmp puts other provinces on the date line than the layer below's");
  {
    const mod = makeMod("d6", { shift: SHIFT }), game = makeGame("d6"), modSeam = modSeamOf(SHIFT);
    rec("CONTROL: no province on the mod's own seam is on the layer below's — so the fixture can tell which bitmap was read", modSeam.size === SEAM.length && ![...modSeam].some(onSeam), { modSeam: modSeam.size, shared: [...modSeam].filter(onSeam).length });
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
    const s = md.seamSeaProvinces({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
    const got = [...s.blocked].map(Number).sort((a, b) => a - b), want = [...modSeam].sort((a, b) => a - b);
    rec("⭐⭐⭐ D6. the provinces kept at sea are exactly those on the mod's OWN first and last columns", JSON.stringify(got) === JSON.stringify(want), { got: got.length, want: want.length, offTheModsSeam: got.filter((id) => !modSeam.has(id)).length, reason: s.reason });
    const count = Math.round(0.6 * PROVINCES);
    const r = generate(mod, game, count);
    const land = landOf(mod), onIt = land.filter((id) => modSeam.has(id)), sb = r.seamBlocked || {};
    rec("the generator ran and grew", r.changed === true && r.grown === true && !r.error, r.error || { flipped: r.flippedProvinces });
    rec("⭐⭐⭐ D6. …so not one generated province is on the mod's own date line, and the land is the count asked for", onIt.length === 0 && land.length === count && sb.count === modSeam.size && /keeps the date line at sea/.test(String(sb.reason)), { onTheModsSeam: onIt.length, of: modSeam.size, land: land.length, count, sb });
  }

  // ── D6b. …and whether the date line is at sea is asked of the layer below's OWN bitmap, read with its own definition ────────────
  console.log("\nD6b. the layer below runs land into its own date line, the mod's own map puts its sea provinces there");
  {
    const landBelow = (id) => colOf(id) === 0;
    const mod = makeMod("d6b", { shift: SHIFT }), game = makeGame("d6b", landBelow), modSeam = modSeamOf(SHIFT);
    rec("CONTROL: the layer below has land on its own seam and none on the mod's — so the fixture can tell which bitmap was asked", SEAM.some(landBelow) && ![...modSeam].some(landBelow), { onItsSeam: SEAM.filter(landBelow).length, onTheModsSeam: [...modSeam].filter(landBelow).length });
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
    const s = md.seamSeaProvinces({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
    rec("⭐⭐⭐ D6b. the world below runs land into the date line, so nothing is kept at sea — whatever the mod's own map puts on its edge", s.blocked.size === 0 && /land on the date line/.test(String(s.reason)), { blocked: s.blocked.size, reason: s.reason });
  }

  // ── D4. asked for every province: the seam is what is left, and that is said ────────────────────────────────────────────────
  console.log("\nD4. asked for all of the sea");
  {
    const mod = makeMod("d4"), game = makeGame("d4");
    const r = d4 = generate(mod, game, PROVINCES);
    const land = landOf(mod);
    const sb = r.seamBlocked || {};
    rec("the generator ran", r.changed === true && !r.error, r.error || r.flippedProvinces);
    rec("⭐⭐⭐ D4. asked for every sea province, it raises every one but the seam's", r.flippedProvinces === PROVINCES - SEAM.length && land.length === PROVINCES - SEAM.length && !land.some(onSeam), { flipped: r.flippedProvinces, want: PROVINCES - SEAM.length });
    rec("⭐⭐ D4. …and says how many of the count it kept at sea for the date line", sb.keptAtSea === SEAM.length && sb.count === SEAM.length, sb);
  }

  // ── D5. the page says what the date line cost, in the Generate land report ──────────────────────────────────────────────────
  console.log("\nD5. the page says it");
  {
    const vm = require("vm");
    const lib = require("./testlib-map-page.js");
    const { stripJsComments } = require("./testlib-strip-comments.js");
    let note = null;
    try { note = vm.runInNewContext(lib.lift("function generatedDateLineNote(") + "\ngeneratedDateLineNote", {}); } catch (e) { note = null; rec("public/map.js has generatedDateLineNote", false, e.message); }
    if (note) {
      const k = SEAM.length, said = note(d4);
      rec("⭐⭐ D5. when the date line cost land, the line says how many fewer provinces were raised, and why", said.startsWith(` ${k.toLocaleString()} fewer province`) && /date line/.test(said) && /stay sea/.test(said), said);
      rec("CONTROL: a click it cost nothing says nothing", note(d1) === "" && note({}) === "" && note(null) === "", [note(d1)]);
      const why = "the read threw";
      const failed = note({ seamBlocked: { count: 0, reason: "", keptAtSea: 0, error: why } });
      rec("⭐ a read that failed is said, with its reason — the new land may then run onto the date line", failed.includes("⚠") && failed.includes(why), failed);
      // the click's success line is the LAST reload before its .catch (as #generate-land-fills-the-seas-it-cuts-off reads it)
      const page = stripJsComments(lib.MAP), post = page.indexOf('fetch("/api/map/generate-land"');
      const caught = post < 0 ? -1 : page.indexOf(".catch(", post), done = caught < 0 ? -1 : page.lastIndexOf("reloadAfterImmediateWrite(", caught);
      // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
      // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
      const line = lib.generateLandReportLine(page);
      const name = (/(\w+)\s*=\s*generatedDateLineNote\(res\)/.exec(line) || [])[1];
      rec("⭐⭐ D5. the Generate land report on the page carries it", !!name && line.slice(line.lastIndexOf("reloadAfterImmediateWrite(")).includes("${" + name + "}"), line.slice(-200));
    }
  }
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}

console.log(`\n=== a generated world keeps the date line at sea: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((l) => console.log("   FAILED: " + l));
process.exit(fails.length ? 1 : 0);
