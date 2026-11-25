// Generate land must GROW LANDMASSES. It scattered provinces. #generate-land-must-grow-landmasses
//
// The owner builds a world with: new mod → Delete map → Generate land → Auto-fix. He launched the result in
// HOI4 and it LOADED — main menu, 1936 game, no map error — and the world was still wrong: vanilla's
// coastlines with dark holes punched through them and pale shards scattered across every ocean.
//
// generateLand chose its provinces with a seeded Fisher-Yates over EVERY eligible sea province followed by
// `pool.slice(0, n)`. That is a uniform random sample of the ocean, and a uniform random sample of an ocean
// is not a continent. Measured through his own workflow on a scratch copy of vanilla's map (Delete map, then
// Generate land, count 1094, seed 7), over provinceNeighbourGraph:
//
//     BEFORE   847 landmasses · 662 of them a SINGLE province · largest 6 · 0.00% of the new land in a mass of 10+
//     AFTER     14 landmasses ·   4 of them a single province · largest 790 · 97.99% in a mass of 10+
//     vanilla  132 landmasses ·  78 of them a single province · largest 7354 · 97.97% in a mass of 10+
//
// The yardsticks below are the six maps installed on this machine, measured over the same graph — the one
// hoi4.exe itself floods, wrap seam and adjacencies.csv included:
//
//     map                land   masses   largest share   land in masses >= 10
//     vanilla          10,155      132        .724             .9797
//     Millennium Dawn  13,222      175        .686             .9806
//     Road to 56       10,279      136        .731             .9788
//     Novum Vexillum   13,553      146        .725             .9852
//     Rise of Nations  10,213      137        .726             .9788
//     Old World Blues  20,624       77        .911             .9933
//
// So a shipping world is one dominant landmass holding about 72% of the land and almost all the rest in
// masses of ten or more. The thresholds here are the WEAKEST the six maps clear (half the land in the largest
// mass, 90% in masses of ten or more), so they say "this is a world" without pinning Nova to one seed's
// arithmetic — and the old shuffle fails every one of them.
//
// Run: node test-generate-land-grows-landmasses-not-a-scatter.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genshape-"));
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

// An all-sea canvas — the shape Delete map leaves — as a W x H grid of one-pixel provinces, so the province
// neighbour graph is a plain lattice (plus the wrap seam, which joins column 0 to column W-1 exactly as it
// does on the real map). Eight strategic regions partition it into 6 x 8 blocks, so "no state spans two
// regions" still has something to be wrong about.
const W = 24, H = 16;
const PROVINCES = W * H;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 77];
const regionOf = (id) => { const i = id - 1, x = i % W, y = Math.floor(i / W); return Math.floor(x / 6) + 4 * Math.floor(y / 8) + 1; };

function makeMod({ withBitmap = true } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, "mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Shape"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  if (withBitmap) mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) {
    mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  }
  return mod;
}

const landOf = (mod) => {
  const out = [];
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = ln.split(";");
    if (!/^\d+$/.test(c[0]) || c[0] === "0" || c.length < 5) continue;
    if (c[4] === "land") out.push(parseInt(c[0], 10));
  }
  return out;
};
const statesOf = (mod) => {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort().map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    return { file: f, text: t, provs: (((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").match(/\d+/g) || []).map(Number) };
  });
};
const graphOf = (mod) => {
  const model = md.buildMapModel({ modRoot: mod, gameRoot: null, dependencyRoots: [], cacheStableLayers: true });
  return md.provinceNeighbourGraph({ modRoot: mod, gameRoot: null, dependencyRoots: [], model });
};
// connected pieces of `members` over `adj`, largest first
function pieceSizes(members, adj) {
  const inR = new Set(members), seen = new Set(), sizes = [];
  for (const s of members) {
    if (seen.has(s)) continue;
    let n = 0; const q = [s]; seen.add(s);
    while (q.length) { const c = q.pop(); n++; for (const nb of (adj.get(c) || [])) if (inR.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); } }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

const N = 80;
try {
  console.log("=== generate land grows landmasses, it does not scatter provinces ===\n");

  console.log(`1. The shape of what it made (${N} of ${PROVINCES} sea provinces, seed 7)`);
  const mod = makeMod();
  const gen = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
  rec("the generator ran", gen.changed === true && !gen.error, gen.error || gen.flippedProvinces);
  // ⛔⛔ AND IT SAYS WHETHER IT GREW. growLandmasses falls back to the old scatter when it has no graph, which is
  // the right thing to do rather than refusing to make land — but the fallback used to be SILENT, and a silent
  // fallback is indistinguishable from success in every field a caller can read. On 2026-09-17 a whole map came
  // out scattered and the result still said changed: true with the full quota flipped. Assert the common path
  // actually GREW, so a degradation fails here instead of being discovered on a screenshot.
  rec("⭐⭐⭐ …and reports that it GREW the land rather than scattering it",
    gen.grown === true && !gen.neighbourGraphError, { grown: gen.grown, err: gen.neighbourGraphError });

  const land = landOf(mod);
  // #generate-land-fills-the-seas-it-cuts-off — …and the seas the grown coast cut off from the ocean became land with it, named in
  // the result (which ones they must be is test-generate-land-fills-the-seas-it-cuts-off.js's). Every shape check below includes them.
  const filled = ((gen.inlandSeas || {}).provinces) || [];
  rec("the quota is met exactly — every province asked for became land, and the only others are the cut-off seas it names",
    land.length === N + filled.length && gen.flippedProvinces === land.length && filled.every((p) => land.includes(p)),
    { land: land.length, reported: gen.flippedProvinces, filled: filled.length });

  const adj = graphOf(mod);
  rec("there is a province neighbour graph to judge the shape by", !!adj && adj.size > 0, adj ? adj.size : null);
  const sizes = pieceSizes(land, adj);
  const inMassesOf = (k) => sizes.filter((s) => s >= k).reduce((a, b) => a + b, 0) / (land.length || 1);
  const largestShare = sizes[0] / (land.length || 1);
  console.log(`     masses=${sizes.length} sizes=${JSON.stringify(sizes.slice(0, 8))} largestShare=${largestShare.toFixed(3)} inMassesGE10=${inMassesOf(10).toFixed(4)}`);

  // The three that the shuffle cannot pass. Thresholds are the weakest of the six shipping maps, halved where
  // a small canvas makes the corpus figure unreasonable to demand exactly.
  rec("⭐⭐⭐ the new land is a HANDFUL of landmasses, not a scatter of provinces",
    sizes.length <= Math.ceil(land.length / 10), { masses: sizes.length, ceiling: Math.ceil(land.length / 10) });
  rec("⭐⭐⭐ one dominant landmass holds at least half the new land (the six shipping maps: .686 to .911)",
    largestShare >= 0.5, { largest: sizes[0], of: land.length, share: +largestShare.toFixed(3) });
  rec("⭐⭐⭐ at least 90% of the new land sits in a mass of ten provinces or more (shipping maps: .9788 to .9933)",
    inMassesOf(10) >= 0.9, { share: +inMassesOf(10).toFixed(4) });
  rec("every landmass is made of provinces that were eligible sea (ids stayed inside the map)",
    land.every((id) => id >= 1 && id <= PROVINCES));

  console.log("\n2. The crash-safety rule the generator already had is untouched");
  const states = statesOf(mod);
  rec("every new province is in exactly one state", (() => {
    const all = states.flatMap((s) => s.provs);
    return all.length === land.length && land.every((p) => all.filter((q) => q === p).length === 1);
  })(), { provincesInStates: states.flatMap((s) => s.provs).length, land: land.length });
  rec("no state spans two strategic regions", states.every((s) => new Set(s.provs.map(regionOf)).size <= 1),
    states.filter((s) => new Set(s.provs.map(regionOf)).size > 1).map((s) => s.file));

  // Slicing the growth list `per` at a time gave a state provinces from all over its region: 110 of the 172
  // states the owner's workflow made were in more than one piece, one in eight. Each state is now grown out of
  // its region's own remaining provinces. Vanilla ships 28 of 1,081 states in pieces, so this is not a rule
  // about maps in general — it is about what a generator has any reason to hand a modder.
  const inPieces = states.filter((s) => s.provs.length && pieceSizes(s.provs, adj).length > 1);
  rec("⭐⭐ every generated state is ONE PIECE — no state scattered across a sea",
    inPieces.length === 0, inPieces.map((s) => ({ file: s.file, pieces: pieceSizes(s.provs, adj).length })));
  rec("…and no state is bigger than the provinces-per-state it was asked for",
    states.every((s) => s.provs.length >= 1 && s.provs.length <= 8), states.map((s) => s.provs.length).sort((x, y) => y - x).slice(0, 3));

  console.log("\n3. Deterministic — the same seed is the same world, down to the order it was grown in");
  const twin = makeMod();
  md.generateLand({ modRoot: twin, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
  rec("same seed → the same set of provinces became land", JSON.stringify(landOf(twin)) === JSON.stringify(land));
  const a = statesOf(mod).map((s) => s.provs.join(" ")).join(" | ");
  const b = statesOf(twin).map((s) => s.provs.join(" ")).join(" | ");
  rec("⭐ …and the same states, so the GROWTH ORDER is deterministic too, not just the set", a === b);

  const other = makeMod();
  md.generateLand({ modRoot: other, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 8 });
  rec("a different seed is a different world (the seed is not being ignored)", JSON.stringify(landOf(other)) !== JSON.stringify(land));
  const otherSizes = pieceSizes(landOf(other), graphOf(other));
  rec("…and that world is grown too, not scattered", otherSizes.length <= Math.ceil(N / 10) && otherSizes[0] / N >= 0.5,
    { masses: otherSizes.length, largest: otherSizes[0] });

  console.log("\n4. A mod with no provinces.bmp anywhere still gets its land");
  {
    const blind = makeMod({ withBitmap: false });
    const g = md.generateLand({ modRoot: blind, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
    rec("no graph to grow along → the generator still flips the whole quota rather than refusing",
      g.changed === true && g.flippedProvinces === N && landOf(blind).length === N, g.error || g.flippedProvinces);
    rec("…and still never puts two strategic regions in one state",
      statesOf(blind).every((s) => new Set(s.provs.map(regionOf)).size <= 1));
    rec("⭐⭐⭐ …and SAYS it could not grow, instead of passing a scatter off as a world",
      g.grown === false && typeof g.neighbourGraphError === "string" && g.neighbourGraphError.length > 0,
      { grown: g.grown, err: g.neighbourGraphError });
  }

  console.log(`\n=== generate land grows landmasses, not a scatter: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
