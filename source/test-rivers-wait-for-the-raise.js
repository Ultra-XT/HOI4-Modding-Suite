// Generate land draws its rivers LAST, over the land the raise stood up, and never over land the game still draws under the water.
// #a-generated-world-has-rivers (batch B, B3; critic R9)
//
// THE ORDER. The rivers read the final coast, borders and heights (planGeneratedRivers routes over the heightmap), so they are the
// last thing the click draws: after the raise and after the supply network. A raise that fails leaves the new land at the sea floor
// (89 against a sea level of 95), and a plan routed over it runs on noise the game draws as sea — so generateRivers measures how
// much of the new land stands above the waterline and refuses under half, and the hook says why when the raise itself threw.
//
// THE PIECES (#5). A raised province larger than the land below is cut to land size before the raise (#a-raised-province-is-cut-to-
// land-size), and its pieces are new ids the cut puts on the click's list: the raise and the rivers must be asked of them as of the
// rest of the land. Asked of the parents alone, a piece kept the sea's terrain on every pixel and the sea floor's height wherever the
// beach walk from its parent did not reach (492 of this world's 4,822 piece pixels), and no river ran on one; on the owner's flow the
// pieces are 6,806 of 11,318 land provinces — and every one of the 74 tests that call Generate land stayed green (merge review MR-1).
//
// Fixture: the base game holds the hand-drawn sample of testlib-river-world.js (its rivers.bmp is what is learnt); the mod owns an
// all-sea Voronoi world of the same size, as Delete map leaves one, with a blank rivers.bmp of its own and one strategic region.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rivers-raise-"));
process.env.NOVA_HOME_DIR = path.join(TMP, "home");
process.env.NOVA_APP_DATA_DIR = path.join(TMP, "appdata");
process.env.APPDATA = path.join(TMP, "roaming");
process.env.XDG_CONFIG_HOME = path.join(TMP, "xdg");
for (const d of [process.env.NOVA_HOME_DIR, process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });

const md = require("./map-data.js");
const RW = require("./testlib-river-world.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const sha = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");

const GAME = path.join(TMP, "game");
const S = RW.gridSample();
RW.writeMap(GAME, S);
// the mod's world: Voronoi provinces the size of the sample's map, every one of them sea (Delete map's world), the sea floor at 89
const V = RW.voronoiWorld({ W: S.W, H: S.H, lake: null });
const SEA = { ...V, type: new Uint8Array(V.N).fill(2), land: new Uint8Array(V.N), water: new Uint8Array(V.N).fill(1), height: new Uint8Array(V.N).fill(89) };
const terrainFile = "categories = {\n\tplains = { color = { 100 120 140 } movement_cost = 1.0 }\n\tocean = { is_water = yes color = { 10 20 140 } movement_cost = 1.0 }\n}\n"
  + "terrain = {\n\tplains_g = { type = plains color = { 0 } texture = 1 }\n\tocean_g = { type = ocean color = { 15 } texture = 1 }\n}\n";
// …and for section 6, the same with ground the game builds a city on (spawn_city), so the towns at the victory points have ground to paint
const cityTerrainFile = terrainFile.replace("\tocean = {", "\turban = { color = { 120 110 100 } movement_cost = 1.0 }\n\tocean = {")
  .replace("\tocean_g = {", "\turban_g = { type = urban color = { 13 } texture = 1 spawn_city = yes }\n\tocean_g = {");
const grey = Array.from({ length: 256 }, (_, i) => ({ r: i, g: i, b: i }));

function seaMod(name, { heightmap = null, cityGround = false } = {}) {
  const d = path.join(TMP, "mods", name);
  fs.mkdirSync(path.join(d, "map", "strategicregions"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n`);
  RW.writeMap(d, SEA, { idx: new Uint8Array(SEA.N).fill(RW.SEA_BG) });   // provinces.bmp, definition.csv, heightmap.bmp and a blank rivers.bmp
  if (heightmap) fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), heightmap);
  fs.writeFileSync(path.join(d, "map", "terrain.bmp"), RW.bmp8(SEA.W, SEA.H, new Uint8Array(SEA.N).fill(15), grey));
  fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"), cityGround ? cityTerrainFile : terrainFile);
  const ids = [...new Set(SEA.pid)].filter((p) => p !== 100000).sort((a, b) => a - b);   // the west strip stays the ocean, in no region
  fs.writeFileSync(path.join(d, "map", "strategicregions", "r1.txt"), `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
  return d;
}
const generate = (mod, extra = {}) => md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 120, provincesPerState: 8, seed: 1, ...extra });
const riversOf = (m) => path.join(m, "map", "rivers.bmp");
// an uncompressed BMP as written, top row first: a 24-bit pixel as packed rgb, an 8-bit one as its palette index — read here, not by
// a reader of Nova's
function readBmp(file) {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), W = b.readInt32LE(18), rawH = b.readInt32LE(22), bpp = b.readUInt16LE(28), H = Math.abs(rawH);
  const row = ((W * bpp / 8) + 3) & ~3, px = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    const o = off + (rawH < 0 ? y : H - 1 - y) * row;
    for (let x = 0; x < W; x++) px[y * W + x] = bpp === 24 ? ((b[o + 3 * x + 2] << 16) | (b[o + 3 * x + 1] << 8) | b[o + 3 * x]) : b[o + x];
  }
  return { W, H, px };
}

try {
  console.log("1. A raised world gets its rivers, from the hook after the raise");
  {
    const m = seaMod("Raised");
    const before = sha(riversOf(m));
    const r = generate(m);
    rec("THE CONTROL: land was generated and raised", r.changed === true && r.flippedProvinces > 0 && r.heightmap && r.heightmap.changed === true && !r.heightmap.error, { flipped: r.flippedProvinces, hm: r.heightmap && { changed: r.heightmap.changed, error: r.heightmap.error, reason: r.heightmap.reason } });
    rec("⭐ the result carries the rivers it drew, and the mod's rivers.bmp changed", !!r.rivers && r.rivers.changed === true && r.rivers.systems > 0 && sha(riversOf(m)) !== before, r.rivers);
  }

  console.log("\n2. drawRivers: false — a caller about something else");
  {
    const m = seaMod("Off");
    const before = sha(riversOf(m));
    const r = generate(m, { drawRivers: false });
    rec("⭐ no river drawn, the result says it was turned off, and rivers.bmp is byte for byte as it was", r.changed === true && r.rivers && r.rivers.changed === false && /turned off/.test(r.rivers.skipped || "") && sha(riversOf(m)) === before, r.rivers);
  }

  console.log("\n3. The raise did not stand the land up → no river, and the reason");
  {
    // a heightmap the raise cannot write (not the size of provinces.bmp): the land stays at the sea floor
    const m = seaMod("Not Raised", { heightmap: RW.bmp8(SEA.W, SEA.H - 2, new Uint8Array(SEA.W * (SEA.H - 2)).fill(89), grey) });
    const before = sha(riversOf(m));
    const r = generate(m);
    rec("THE CONTROL: the raise did not run, and said why as a `reason` (it did not throw)", r.changed === true && r.heightmap && r.heightmap.changed !== true && !!r.heightmap.reason && !r.heightmap.error, r.heightmap);
    rec("⭐ no river drawn, rivers.bmp untouched, and a reason", r.rivers && r.rivers.changed === false && sha(riversOf(m)) === before && String(r.rivers.reason || r.rivers.skipped || r.rivers.error || "").length > 0, r.rivers);
    // a raise `reason` is not skipped by the hook: generateRivers reads the heightmap itself and says what it found there
    rec("⭐ …the reason is generateRivers' own, read off the heightmap — not a skip by the hook", !r.rivers.skipped && /heightmap\.bmp/.test(r.rivers.reason || ""), r.rivers);
  }

  console.log("\n4. Where the hook stands in generateLand (comments stripped)");
  {
    const raw = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    // braces counted where a brace is code (jsBodyAt over maskJsLiterals); the text read with comments blanked, same length
    const code = maskJsLiterals(raw), s = code.indexOf("function generateLand(");
    const span = s >= 0 ? jsBodyAt(code, s) : null, body = span ? maskJsComments(raw).slice(span[0], span[1] + 1) : "";
    const at = (needle) => body.indexOf(needle);
    rec("THE CONTROL: generateLand, its raise, its supply network and its rivers are all found", s >= 0 && at("sinkProvincesInHeightmap(") > 0 && at("generateSupplyNetwork(") > 0 && at("generateRivers(") > 0);
    rec("⭐ the rivers come after the raise and after the supply network", at("generateRivers(") > at("sinkProvincesInHeightmap(") && at("generateRivers(") > at("generateSupplyNetwork("));
    // ⛔ the writers of the map, DERIVED (review R-2): every function of map-data.js whose body hands safeModWrite a file it names under
    // map/, and every function that calls one, closed over the calls. A hand-typed list of five let a province-type changer added after
    // the rivers (fixInlandSeas) pass. Calls are read where a name is code (maskJsLiterals); the map/ path where a string is text.
    const text = maskJsComments(raw), spans = new Map();
    for (const m of code.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)) { const sp = jsBodyAt(code, m.index); if (sp) spans.set(m[1], sp); }
    const callsIn = (s) => new Set([...s.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
    const writers = new Set();
    for (const [n, [a, b]] of spans) if (/\bsafeModWrite\(/.test(code.slice(a, b + 1)) && /(["'`])map\1|["'`]map[\/\\]/.test(text.slice(a, b + 1))) writers.add(n);
    const calls = new Map([...spans].map(([n, [a, b]]) => [n, callsIn(code.slice(a, b + 1))]));
    for (let grew = true; grew;) { grew = false; for (const [n, c] of calls) if (!writers.has(n) && [...c].some((x) => writers.has(x))) { writers.add(n); grew = true; } }
    rec("THE CONTROL: the derived writers hold every one the old list named and the seas' filler, and no reader of the map",
      ["writeProvincesRaster", "sinkProvincesInHeightmap", "generateSupplyNetwork", "layOutUnitPositions", "fixInlandSeas", "generateRivers"].every((n) => writers.has(n))
      && !["buildMapModel", "riverPlanGate", "planGeneratedRivers", "readRiverSample"].some((n) => writers.has(n)), writers.size);
    const tail = span ? code.slice(span[0], span[1] + 1).slice(at("generateRivers(") + "generateRivers(".length) : "";
    const late = [...callsIn(tail)].filter((n) => writers.has(n));
    // ⚠️ MOVED WITH #a-victory-point-has-a-town: ONE writer comes after the rivers on purpose — the small towns at the victory points
    // (paintCityLooksForTerrain), which must see the rivers (the game builds nothing within 2 px of one) and writes only terrain.bmp, the
    // colour map and trees.bmp, none of which a river is planned from or drawn into. Excused by name; the excuse is checked for staleness
    // below, and what the towns write is measured against a world without them in section 6.
    const AFTER_RIVERS = ["paintCityLooksForTerrain"];
    const lateOthers = late.filter((n) => !AFTER_RIVERS.includes(n));
    rec("⭐ generateRivers is called once, and nothing after it writes the map but the victory points' towns", body.split("generateRivers(").length === 2 && !lateOthers.length && !/\bsafeModWrite\(/.test(tail), late);
    rec("…and that excuse is not stale: the towns' writer is still a writer of the map, and still called after the rivers", AFTER_RIVERS.every((n) => writers.has(n) && late.includes(n)), { late });
    // ⛔ review R-3: the click's own seed, so every seed is not drawn the same rivers
    rec("⭐ the hook hands generateRivers generateLand's own seed", /\bgenerateRivers\(\{[^}]*\bseed(\s*[,}]|:\s*(parseInt\(\s*)?seed\b)/.test(body), body.slice(at("generateRivers("), at("generateRivers(") + 160));
    const hook = body.slice(at("drawRivers"), at("generateRivers("));
    rec("⭐ a raise that threw (heightmap.error) skips the rivers — and a raise that only gave a reason does not", /heightmap\.error/.test(hook) && !/heightmap\.reason/.test(hook), hook.slice(0, 300));
  }

  console.log("\n5. The pieces the cut made are raised and carry rivers, as the rest of the raised land is and does");
  {
    // this world's Voronoi cells are larger than the sample's land, so the click cuts the largest it raises; the pieces are new ids,
    // and the raise and the rivers are asked of the click's list once the cut has put them on it
    const m = seaMod("Cut");
    const H0 = readBmp(path.join(m, "map", "heightmap.bmp")), T0 = readBmp(path.join(m, "map", "terrain.bmp"));   // the sea, before the click
    const r = generate(m);
    const record = md.readProvinceSplitRecord(m);
    const piece = new Set();
    for (const f of record.families || []) for (const q of f.pieces) piece.add(q);
    rec("THE CONTROL: the click cut raised provinces into pieces, raised the land and drew rivers",
      r.changed === true && !!r.provinceSplit && r.provinceSplit.changed === true && piece.size > 0 && piece.size === r.provinceSplit.newIds
      && !!r.heightmap && r.heightmap.changed === true && !!r.rivers && r.rivers.changed === true,
      { split: r.provinceSplit, pieces: piece.size, heightmap: r.heightmap && r.heightmap.changed, rivers: r.rivers && r.rivers.changed });
    // every land pixel by its province, off the files as written: definition.csv's colours over provinces.bmp
    const idOf = new Map(), land = new Set();
    for (const l of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
      const c = l.split(";");
      if (!/^\d+$/.test(c[0]) || +c[0] === 0) continue;
      idOf.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]);
      if (c[4] === "land") land.add(+c[0]);
    }
    const P = readBmp(path.join(m, "map", "provinces.bmp")), Hm = readBmp(path.join(m, "map", "heightmap.bmp")), Tb = readBmp(path.join(m, "map", "terrain.bmp")), Rv = readBmp(riversOf(m));
    // per pixel: still the sea floor's height it had before the click, still the sea's terrain, above the waterline, a river on it
    const tally = { piece: { px: 0, heightAsBefore: 0, terrainAsBefore: 0, up: 0, river: 0 }, rest: { px: 0, heightAsBefore: 0, terrainAsBefore: 0, up: 0, river: 0 } }, withRiver = new Set();
    for (let k = 0; k < P.px.length; k++) {
      const id = idOf.get(P.px[k]);
      if (!land.has(id)) continue;
      const t = tally[piece.has(id) ? "piece" : "rest"];
      t.px++;
      if (Hm.px[k] === H0.px[k]) t.heightAsBefore++;
      if (Tb.px[k] === T0.px[k]) t.terrainAsBefore++;
      if (Hm.px[k] > md.HEIGHTMAP_SEA_LEVEL) t.up++;
      if (RW.isRiverIndex(Rv.px[k])) { t.river++; if (piece.has(id)) withRiver.add(id); }
    }
    const pc = (t) => (t.px ? (100 * t.up / t.px).toFixed(1) : "0");
    console.log(`   the pieces: ${tally.piece.px} px, ${pc(tally.piece)}% above the waterline, ${tally.piece.heightAsBefore} at the height and ${tally.piece.terrainAsBefore} on the terrain they had as sea, ${tally.piece.river} river px on ${withRiver.size} of ${piece.size}`
      + ` · the rest: ${tally.rest.px} px, ${pc(tally.rest)}%, ${tally.rest.heightAsBefore} / ${tally.rest.terrainAsBefore}, ${tally.rest.river} river px`);
    rec("(control: every file is the map's size; the same world's other raised land left the sea's height and terrain on every pixel, and carries rivers)",
      [H0, T0, Hm, Tb, Rv].every((b) => b.px.length === P.px.length) && tally.piece.px > 0 && tally.rest.px > 0
      && tally.rest.heightAsBefore === 0 && tally.rest.terrainAsBefore === 0 && tally.rest.river > 0, tally);
    rec("⭐⭐ the raise was asked of the pieces: none of their pixels is left at the sea floor's height or on the sea's terrain",
      tally.piece.heightAsBefore === 0 && tally.piece.terrainAsBefore === 0, tally.piece);
    let drawn = null;
    try { drawn = JSON.parse(fs.readFileSync(md.generatedRiversRecordPath(m), "utf8")).provinces; } catch (_) { drawn = null; }
    rec("⭐⭐ the rivers were drawn over the pieces: the record of the land Nova drew rivers on names every one, and rivers run on them",
      Array.isArray(drawn) && [...piece].every((q) => drawn.includes(q)) && withRiver.size > 0,
      { missing: Array.isArray(drawn) ? [...piece].filter((q) => !drawn.includes(q)).slice(0, 8) : "no record", withRiver: withRiver.size, pieces: piece.size });
  }

  console.log("\n6. The towns at the victory points, painted after the rivers, change nothing a river is planned from or drawn into");
  {
    // #a-victory-point-has-a-town: the same world three times from the same seed — twice without the towns (whether the click is the
    // same click at all), once with them; what the towns may change is terrain.bmp, the colour map and trees.bmp, and nothing else
    const a = seaMod("Towns", { cityGround: true }), b = seaMod("No Towns", { cityGround: true }), c = seaMod("No Towns Again", { cityGround: true });
    rec("THE CONTROL: the fixture's terrain file declares city ground (13) and still everything the other sections' declares",
      cityTerrainFile !== terrainFile && /urban_g = \{ type = urban color = \{ 13 \}[^}]*spawn_city = yes/.test(cityTerrainFile) && /plains_g/.test(cityTerrainFile) && /ocean_g/.test(cityTerrainFile)
      && /\burban = \{/.test(cityTerrainFile));
    const ra = generate(a), rb = generate(b, { victoryPointTowns: false }), rc = generate(c, { victoryPointTowns: false });
    const towns = (r) => r && r.cities && r.cities.towns;
    rec("THE CONTROL: all three were raised and drew rivers; one painted towns at its victory points, the other two were told not to",
      [ra, rb, rc].every((r) => r.changed === true && r.rivers && r.rivers.changed === true)
      && !!towns(ra) && towns(ra).painted > 0 && [rb, rc].every((r) => !!towns(r) && towns(r).changed === false && /turned off/.test(towns(r).skipped || "")),
      { a: towns(ra), b: towns(rb), c: towns(rc) });
    const RIVER_INPUTS = ["map/rivers.bmp", "map/heightmap.bmp", "map/provinces.bmp", "map/definition.csv"];
    const differ = (x, y, files) => files.filter((f) => sha(path.join(x, f)) !== sha(path.join(y, f)));
    rec("THE CONTROL: the click is the same click — two worlds without towns are byte for byte the same in those files and in terrain.bmp",
      !differ(b, c, [...RIVER_INPUTS, "map/terrain.bmp"]).length, differ(b, c, [...RIVER_INPUTS, "map/terrain.bmp"]));
    rec("(control: the towns did paint — terrain.bmp differs between the world with them and the one without)", differ(a, b, ["map/terrain.bmp"]).length === 1);
    rec("⭐⭐ rivers.bmp, heightmap.bmp, provinces.bmp and definition.csv are byte for byte the same with the towns and without them", !differ(a, b, RIVER_INPUTS).length, differ(a, b, RIVER_INPUTS));
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
