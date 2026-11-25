// ⛔ #a-generated-coast-is-not-the-oceans-border — A ROUGH COAST NEEDS A BITMAP OF THE MOD'S OWN.
//
// A rough coast is pixels, so the coast step needs a map/provinces.bmp the mod OWNS. A mod that inherits its province shapes
// (the base game's, or another mod's) still gets its land — whole ocean provinces retyped, as Generate land always made them —
// but no bitmap is written for it: copying the one underneath into the mod to reshape a coast would make the mod the owner of
// every province shape in the world (34.6 MB on vanilla), the trap blankMapToSea and fixMapXCrossings decline too. The answer says
// so, and the page says it in a sentence.
//
// Pinned on a mod with no map folder over a layer below that ships the whole map: the land is made, the answer carries the skip and
// its reason, the mod has no provinces.bmp afterwards, and every file of the layer below is byte for byte what it was. CONTROL: the
// same click on a twin that owns a copy of that bitmap does reshape its coast — so the fixture is one the step would act on.
//
// Run: node test-a-rough-coast-needs-a-bitmap-of-its-own.js
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastownbmp-"));
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
const walk = (d, rel = "", out = []) => { if (!fs.existsSync(d)) return out; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, rel + f + "/", out); else out.push(rel + f); } return out; };
const hashes = (d) => new Map(walk(d).map((f) => [f, sha(fs.readFileSync(path.join(d, ...f.split("/"))))]));

// ── the layer below: square provinces, two continents and an ocean, every map file a world needs ───────────────────────────
const S = 24, COLS = 16, ROWS = 8, W = S * COLS, H = S * ROWS, PROVINCES = COLS * ROWS;
const idAt = (x, y) => Math.floor(y / S) * COLS + Math.floor(x / S) + 1;
const colAt = (id) => (id - 1) % COLS, rowAt = (id) => Math.floor((id - 1) / COLS);
const colourOf = (id) => [(id * 37) & 255, id, 120];
const continentOf = (id) => (colAt(id) >= 3 && colAt(id) <= 8 && rowAt(id) >= 2 && rowAt(id) <= 5 ? 1 : colAt(id) >= 11 && colAt(id) <= 12 && rowAt(id) >= 1 && rowAt(id) <= 2 ? 2 : 0);
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const bmp8 = (fn) => { const off = 54 + 1024, b = Buffer.alloc(off + IRS * H); b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(IRS * H, 34); b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50); for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; } for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * IRS + x] = fn(x, y); return b; };
const BELOW = fs.mkdtempSync(path.join(SANDBOX, "below-"));
{
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id), c = continentOf(id); rows.push(c ? `${id};${r};${g};${b};land;false;plains;${c}` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(BELOW, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(BELOW, "map", "provinces.bmp"), bmp24((x, y) => colourOf(idAt(x, y))));
  mk(path.join(BELOW, "map", "heightmap.bmp"), bmp8((x, y) => (continentOf(idAt(x, y)) ? 110 : md.HEIGHTMAP_SEA_VALUE)));
  mk(path.join(BELOW, "map", "terrain.bmp"), bmp8((x, y) => (continentOf(idAt(x, y)) ? 0 : 15)));
  mk(path.join(BELOW, "map", "buildings.txt"), "# no building rows\r\n");
  mk(path.join(BELOW, "common", "terrain", "00_terrain.txt"), "categories = {\n\tplains = { color = { 100 120 140 } movement_cost = 1.0 }\n\tforest = { color = { 100 120 140 } movement_cost = 1.0 }\n\tlakes = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n\tocean = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n}\nterrain = {\n\tplains_g = { type = plains color = { 0 } texture = 1 }\n\tforest_g = { type = forest color = { 1 } texture = 1 }\n\tlakes_g = { type = lakes color = { 14 } texture = 1 }\n\tocean_g = { type = ocean color = { 15 } texture = 1 }\n}\n");
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = Math.floor(colAt(id) / 4) + 4 * Math.floor(rowAt(id) / 4) + 1; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(BELOW, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
}
const makeMod = (tag) => { const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-")); mk(path.join(mod, "descriptor.mod"), 'name="Own Bitmap"\nreplace_path="history/states"\n'); return mod; };

const GEN = { gameRoot: BELOW, dependencyRoots: [], count: 3, provincesPerState: 3, seed: 7 };
try {
  console.log("=== a rough coast needs a bitmap of its own ===\n");
  const belowBefore = hashes(BELOW);
  const mod = makeMod("inherits");
  const g = md.generateLand({ modRoot: mod, ...GEN });
  const c = g.coasts || {};
  console.log(`     coasts: ${JSON.stringify(c)}`);
  rec("the land is made all the same", g.changed === true && g.flippedProvinces === GEN.count && !g.refusedRebuildsInheritedWorld, { error: g.error, flipped: g.flippedProvinces, claim: g.claim && g.claim.over });
  rec("⭐⭐⭐ the coast step is skipped, and says why", c.changed === false && /no map\/provinces\.bmp of its own/.test(c.skipped || "") && !c.pixels && !c.error, c);
  const listing = walk(mod);
  rec("⭐⭐⭐ the mod has no provinces.bmp afterwards — none was copied in to reshape", !listing.includes("map/provinces.bmp") && listing.includes("map/definition.csv"), listing.filter((f) => f.startsWith("map/")));
  const belowAfter = hashes(BELOW), changedBelow = [...belowBefore].filter(([f, h]) => belowAfter.get(f) !== h).map(([f]) => f);
  rec("⭐⭐ every file of the layer below is byte for byte what it was", belowAfter.size === belowBefore.size && changedBelow.length === 0, changedBelow);
  const note = P.runPage(["function generatedCoastNote("]).sb.generatedCoastNote(g);
  rec("⭐ the page says the coast was left as the ocean drew it, and why", /left as the ocean's province borders/.test(note) && /provinces\.bmp of its own/.test(note), note);

  console.log("\n CONTROL: the same click on a twin that owns a copy of the bitmap");
  const twin = makeMod("owns");
  fs.mkdirSync(path.join(twin, "map"), { recursive: true });
  fs.copyFileSync(path.join(BELOW, "map", "provinces.bmp"), path.join(twin, "map", "provinces.bmp"));
  const gt = md.generateLand({ modRoot: twin, ...GEN });
  rec("⭐⭐ CONTROL: there the coast is reshaped, so this world is one the step acts on", gt.changed === true && !!(gt.coasts && gt.coasts.changed && gt.coasts.pixels > 0), gt.coasts);

  console.log(`\n=== a rough coast needs a bitmap of its own: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
