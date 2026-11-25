// ⛔ #a-generated-coast-is-not-the-oceans-border / #one-provinces-bmp-write — A COAST THAT FAILS ITS CHECK WRITES NOTHING, AND THE
// ONE provinces.bmp WRITER WRITES ONLY WHAT IT WAS ASKED TO.
//
// Generate land reshapes its new coast in memory, has verifyCoastlineMove judge the result, and only then hands it to
// writeProvincesRaster — the one provinces.bmp writer of the world pipeline, which the province split will share. Two promises:
//   1. a reshaped coast the check refuses is NOT written: provinces.bmp stays byte for byte what it was, the land is still made
//      (the coast is best-effort, the land is not), and the answer says it refused and why. Driven end to end through
//      generateLand with a raster broken on purpose through its documented test-only `_coastTestTamper` option (the endpoint
//      cannot pass it: JSON carries no functions) — and a coast the check passes but the WRITER refuses is reported the same way,
//      never as pixels reshaped (the same option takes a colour the writer needs);
//   2. the writer changes the listed pixels' three bytes and NOTHING else — header, row padding and every other pixel stay the
//      file's own bytes — goes through safeModWrite (a backup of what it overwrote), and refuses, writing nothing, when the
//      result would have an X-crossing the file does not have (the wrap seam's blocks included), when the list leaves out a pixel
//      the raster changed, or when the mod has no provinces.bmp of its own (it never creates one).
// Every expected byte offset and X position is derived from the fixture.
//
// Run: node test-a-rough-coast-that-fails-its-check-writes-nothing.js
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastrefuse-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { BACKUP_DIR } = require("./safe-write.js");
const P = require("./testlib-map-page.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── a 24-bit bitmap, bottom-up, with row padding filled with GARBAGE and resolution fields nobody writes by default, so a writer
//    that re-encodes instead of setting pixels in place shows up byte for byte ─────────────────────────────────────────────────
function bmp24(W, H, colourAt) {
  const rs = (W * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * H, 0xab);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(0, 6); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(rs * H, 34);
  b.writeInt32LE(1234, 38); b.writeInt32LE(4321, 42); b.writeUInt32LE(0, 46); b.writeUInt32LE(0, 50);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = colourAt(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const pixelOffset = (W, H, i) => { const x = i % W, y = (i - x) / W; return 54 + (H - 1 - y) * ((W * 3 + 3) & ~3) + x * 3; };

try {
  console.log("=== a coast that fails its check writes nothing ===\n");

  // ── 1. end to end: Generate land on Delete map's ocean, the reshaped raster broken before the check ─────────────────────────
  console.log("1. A refused coast, through Generate land");
  const S = 24, COLS = 16, ROWS = 8, W = S * COLS, H = S * ROWS, PROVINCES = COLS * ROWS;
  const idAt = (x, y) => Math.floor(y / S) * COLS + Math.floor(x / S) + 1;
  const colourOf = (id) => [(id * 37) & 255, id, 120];
  const LAKE = idAt(5 * S, 3 * S);
  const IRS = Math.floor((8 * W + 31) / 32) * 4;
  const bmp8 = (v) => { const off = 54 + 1024, b = Buffer.alloc(off + IRS * H, v); b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(IRS * H, 34); b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50); for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; } return b; };
  const makeMod = (tag) => {
    const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
    mk(path.join(mod, "descriptor.mod"), 'name="Refused Coast"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(id === LAKE ? `${id};${r};${g};${b};lake;false;lakes;0` : `${id};${r};${g};${b};sea;false;ocean;0`); }
    mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
    mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
    mk(path.join(mod, "map", "heightmap.bmp"), bmp8(md.HEIGHTMAP_SEA_VALUE));
    mk(path.join(mod, "map", "terrain.bmp"), bmp8(15));
    mk(path.join(mod, "common", "terrain", "00_terrain.txt"), "categories = {\n\tplains = { color = { 100 120 140 } movement_cost = 1.0 }\n\tforest = { color = { 100 120 140 } movement_cost = 1.0 }\n\tlakes = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n\tocean = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n}\nterrain = {\n\tplains_g = { type = plains color = { 0 } texture = 1 }\n\tforest_g = { type = forest color = { 1 } texture = 1 }\n\tlakes_g = { type = lakes color = { 14 } texture = 1 }\n\tocean_g = { type = ocean color = { 15 } texture = 1 }\n}\n");
    const byRegion = new Map();
    for (let id = 1; id <= PROVINCES; id++) { if (id === LAKE) continue; const r = Math.floor(((id - 1) % COLS) / 4) + 4 * Math.floor(Math.floor((id - 1) / COLS) / 4) + 1; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
    for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
    return mod;
  };
  const GEN = { gameRoot: null, dependencyRoots: [], count: 40, provincesPerState: 6, seed: 7 };
  const pristine = fs.readFileSync(path.join(makeMod("pristine"), "map", "provinces.bmp"));
  const plain = makeMod("plain"), broken = makeMod("broken");
  const gp = md.generateLand({ modRoot: plain, ...GEN });
  // the break: the lake's middle pixel handed to the province east of it — a lake never moves, and that province gains a far piece
  let tamperedAt = -1;
  const gb = md.generateLand({ modRoot: broken, ...GEN, _coastTestTamper: (ids, raster) => { const i = (3 * S + S / 2) * raster.W + 5 * S + S / 2; tamperedAt = i; ids[i] = LAKE + 1; } });
  rec("CONTROL: the same click without the break reshapes the coast and writes provinces.bmp", !!(gp.coasts && gp.coasts.changed) && sha(fs.readFileSync(path.join(plain, "map", "provinces.bmp"))) !== sha(pristine), gp.coasts);
  rec("the break reached the check (the tamper ran on the reshaped raster)", tamperedAt >= 0);
  rec("⭐⭐⭐ the check refused it, and Generate land says so", !!(gb.coasts && gb.coasts.changed === false && gb.coasts.refused && gb.coasts.violations && gb.coasts.violations.wrongKind > 0), gb.coasts);
  rec("⭐⭐⭐ provinces.bmp is byte for byte what it was", sha(fs.readFileSync(path.join(broken, "map", "provinces.bmp"))) === sha(pristine));
  const landRows = (mod) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).filter((l) => l.split(";")[4] === "land" && l.split(";")[0] !== "0").length;
  // #generate-land-fills-the-seas-it-cuts-off — the count asked for, less the picks the click left sea to keep a cut-off sea open
  // (#generate-land-leaves-no-sea-cut-off), plus the cut-off seas it raised with it: it reports both
  const raisedBy = (g) => { const is = (g && g.inlandSeas) || {}; return GEN.count - (is.leftSea || []).length + (Number(is.filled) || 0); };
  rec("⭐⭐ …and the land is still made: the same provinces raised, in states", gb.changed === true && gb.flippedProvinces === raisedBy(gb) && raisedBy(gb) === raisedBy(gp) && landRows(broken) === raisedBy(gb) && gb.createdStates === gp.createdStates, { flipped: gb.flippedProvinces, raised: [raisedBy(gb), raisedBy(gp)], rows: landRows(broken), states: [gb.createdStates, gp.createdStates] });
  const note = P.runPage(["function generatedCoastNote("]).sb.generatedCoastNote;
  const said = note(gb);
  rec("⭐ the page says the coast was left as the ocean drew it, and that none of it was written", /left as the ocean's province borders/.test(said) && /none of it was written to map\/provinces\.bmp/.test(said), said);

  // ── 1b. the check passes and the WRITER refuses: the province split (batch B) will cut this raster between the two and give every
  //    new id a colour; an id it leaves without one is refused at the writer, and Generate land must not then report a coast it never
  //    wrote. The tamper takes the colour of the first province a pixel moved into out of raster.colourOf, which only the writer reads.
  console.log("\n1b. A coast the check passes and the writer refuses, through Generate land");
  const unwritten = makeMod("unwritten");
  let uncoloured = null;
  const gu = md.generateLand({ modRoot: unwritten, ...GEN, _coastTestTamper: (ids, raster) => {
    const i = ids.findIndex((p, k) => p !== raster.ids[k]);
    if (i >= 0) { uncoloured = { id: ids[i], x: i % raster.W, y: Math.floor(i / raster.W) }; raster.colourOf.delete(ids[i]); }
  } });
  rec("the tamper found a moved pixel and took its new province's colour", !!uncoloured, uncoloured);
  rec("⭐⭐⭐ the writer refused it, and Generate land says so — not the pixels the check passed", !!(gu.coasts && uncoloured && gu.coasts.changed === false && (gu.coasts.refused || "").includes(`province ${uncoloured.id}, which has no colour`) && !gu.coasts.violations), gu.coasts);
  rec("⭐⭐⭐ provinces.bmp is byte for byte what it was", sha(fs.readFileSync(path.join(unwritten, "map", "provinces.bmp"))) === sha(pristine));
  rec("⭐⭐ …and the land is still made", gu.changed === true && gu.flippedProvinces === raisedBy(gu) && landRows(unwritten) === raisedBy(gu), { flipped: gu.flippedProvinces, raised: raisedBy(gu), rows: landRows(unwritten) });
  const saidU = note(gu);
  rec("⭐ the page says none of it was written, and why — never that pixels were reshaped", /none of it was written to map\/provinces\.bmp/.test(saidU) && saidU.includes("has no colour") && !/pixels reshaped/.test(saidU), saidU);

  // ── 2. the writer, on bitmaps built to catch it ─────────────────────────────────────────────────────────────────────────
  console.log("\n2. The one provinces.bmp writer");
  const w = 30, h = 12;                                   // 90 bytes of pixels per row, padded to 92: two garbage bytes a row
  const COL = { A: [200, 10, 10], B: [10, 200, 10], C: [10, 10, 200], D: [200, 200, 10], E: [10, 200, 200] };
  const rows = Object.entries(COL).map(([k, [r, g, b]], n) => ({ id: n + 1, key: k, r, g, b, type: "sea" }));
  const idOf = Object.fromEntries(rows.map((r) => [r.key, r.id]));
  // A above row 6; below it B west of column 15 and C east of it; D a 2 × 2 island in A's far corner; E one column at x = 29
  const layout = (x, y) => (x >= 26 && x < 28 && y >= 1 && y < 3 ? "D" : y < 6 ? "A" : x === w - 1 ? "E" : x < 15 ? "B" : "C");
  const writerMod = (tag, own = true) => { const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-")); if (own) mk(path.join(mod, "map", "provinces.bmp"), bmp24(w, h, (x, y) => COL[layout(x, y)])); return mod; };
  const load = (mod) => { const buf = fs.readFileSync(path.join(mod, "map", "provinces.bmp")); return { buf, raster: md.provinceIdRaster(buf, rows) }; };
  const xsOf = (W2, H2, ids) => { const o = []; for (let y = 0; y + 1 < H2; y++) for (let x = 0; x < W2; x++) { const x1 = (x + 1) % W2; if (new Set([ids[y * W2 + x], ids[y * W2 + x1], ids[(y + 1) * W2 + x], ids[(y + 1) * W2 + x1]]).size === 4) o.push(`${x},${y}`); } return o; };
  const fileOf = (mod) => fs.readFileSync(path.join(mod, "map", "provinces.bmp"));

  // (a) a clean change: B takes three of C's pixels along their border, in rows 8..10
  {
    const mod = writerMod("clean"), { buf, raster } = load(mod), before = Buffer.from(buf);
    const ids = Int32Array.from(raster.ids), changed = [];
    for (let y = 8; y <= 10; y++) { const i = y * w + 15; ids[i] = idOf.B; changed.push(i); }
    rec("(the change makes no X-crossing of its own, by the test's own walk)", xsOf(w, h, ids).length === xsOf(w, h, raster.ids).length);
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed });
    const after = fileOf(mod);
    const diff = []; for (let k = 0; k < after.length; k++) if (after[k] !== before[k]) diff.push(k);
    const mine = new Set(changed.flatMap((i) => { const o = pixelOffset(w, h, i); return [o, o + 1, o + 2]; }));
    rec("it wrote", r.changed === true && r.pixels === changed.length, r);
    rec("⭐⭐⭐ every byte that differs is a listed pixel's — the header, the garbage row padding and every other pixel are the file's own", after.length === before.length && diff.length > 0 && diff.every((k) => mine.has(k)), { differ: diff.length, strays: diff.filter((k) => !mine.has(k)).slice(0, 8) });
    rec("⭐⭐ …and the file decodes to the raster it was handed", sha(Buffer.from(md.provinceIdRaster(after, rows).ids.buffer)) === sha(Buffer.from(ids.buffer)));
    const copies = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((f) => /provinces/i.test(f)) : [];
    rec("⭐ it went through safeModWrite: a backup copy of the bitmap it overwrote, byte for byte", copies.some((f) => sha(fs.readFileSync(path.join(BACKUP_DIR, f))) === sha(before)), copies);
  }
  // (b) a new X: one of A's pixels at the B|C junction handed to D, so A, D, B and C meet at one corner
  {
    const mod = writerMod("x"), { buf, raster } = load(mod), before = sha(fileOf(mod));
    const ids = Int32Array.from(raster.ids), i = 5 * w + 15; ids[i] = idOf.D;
    const made = xsOf(w, h, ids).filter((k) => !xsOf(w, h, raster.ids).includes(k));
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed: [i] });
    rec("(the change makes an X-crossing, by the test's own walk)", made.length === 1, made);
    rec("⭐⭐⭐ a new X-crossing is refused, and named where it is", r.changed === false && /X-crossing/.test(r.refused || "") && (r.xCrossings || []).map((b) => `${b.x},${b.y}`).join("|") === made.join("|"), r);
    rec("⭐⭐ …and nothing is written", sha(fileOf(mod)) === before);
  }
  // (c) a new X ACROSS THE SEAM: column 0's pixel at the A|B line handed to D, where A, D, E (column 29) and B (column 0) meet
  {
    const mod = writerMod("seamx"), { buf, raster } = load(mod), before = sha(fileOf(mod));
    const ids = Int32Array.from(raster.ids), i = 5 * w + 0; ids[i] = idOf.D;
    const made = xsOf(w, h, ids).filter((k) => !xsOf(w, h, raster.ids).includes(k));
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed: [i] });
    rec("(the change makes an X-crossing on the seam's own block, by the test's own walk)", made.length === 1 && made[0] === `${w - 1},5`, made);
    rec("⭐⭐⭐ a new X-crossing across the date line is refused too", r.changed === false && /X-crossing/.test(r.refused || ""), r);
    rec("⭐⭐ …and nothing is written", sha(fileOf(mod)) === before);
  }
  // (d) an X the file already has is not the writer's to refuse: a world with one, and a clean change elsewhere
  {
    const mod = fs.mkdtempSync(path.join(SANDBOX, "oldx-"));
    const oldX = { "7,3": "D", "8,3": "E", "7,4": "C", "8,4": "B" };                 // four provinces round one corner, inside A
    mk(path.join(mod, "map", "provinces.bmp"), bmp24(w, h, (x, y) => COL[oldX[`${x},${y}`] || layout(x, y)]));
    const { buf, raster } = load(mod);
    const had = xsOf(w, h, raster.ids);
    const ids = Int32Array.from(raster.ids), i = 9 * w + 15; ids[i] = idOf.B;
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed: [i] });
    rec("(the fixture has an X-crossing of its own)", had.length > 0, had);
    rec("⭐⭐ a change that makes no NEW X-crossing is written, though the file has one", r.changed === true, r);
  }
  // (e) a list that leaves out a pixel the raster changed
  {
    const mod = writerMod("unlisted"), { buf, raster } = load(mod), before = sha(fileOf(mod));
    const ids = Int32Array.from(raster.ids), a = 8 * w + 15, b = 9 * w + 15; ids[a] = idOf.B; ids[b] = idOf.B;
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed: [a] });
    rec("⭐⭐⭐ a change list that is not the whole change is refused — the file must decode to the raster", r.changed === false && /not in the list/.test(r.refused || ""), r);
    rec("⭐⭐ …and nothing is written", sha(fileOf(mod)) === before);
  }
  // (f) no provinces.bmp of the mod's own — a map/ folder with its own definition.csv, the shapes inherited: never created
  {
    const own = writerMod("donor"), { buf, raster } = load(own);
    const mod = writerMod("none", false);
    mk(path.join(mod, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\r\n");
    const ids = Int32Array.from(raster.ids), i = 8 * w + 15; ids[i] = idOf.B;
    const r = md.writeProvincesRaster({ modRoot: mod, buf, raster: { ...raster, ids }, changed: [i] });
    const listing = fs.readdirSync(path.join(mod, "map"));
    rec("⭐⭐⭐ a mod with no provinces.bmp of its own is skipped, and none is created", r.changed === false && !!r.skipped && JSON.stringify(listing) === JSON.stringify(["definition.csv"]), { r, listing });
  }

  console.log(`\n=== a coast that fails its check writes nothing: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
