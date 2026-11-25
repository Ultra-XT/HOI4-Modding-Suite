// Generate land leaves a sea that was cut off BEFORE the click alone, and never takes it for the ocean. #generate-land-leaves-no-sea-cut-off
//
// THE RISK. The ponds fix fills a sea the click cut off without the half-water test, which cannot tell a designed sea from a drowned
// ocean. Asked of the wrong seas, that fills a modder's own: on an add-on over Hearts of Minecraft that owns its shapes but ships no
// buildings.txt (the state Nova's own refusal tells the modder to create), a 30-province click filled BOTH of that map's designed
// oceans — 1,532 provinces — because "cut off before the click" had been read as "what the repair would have filled", which leaves
// out every sea the half-water rule keeps. And "the ocean" was the largest body the click left: on Hearts of Minecraft that is one
// of its designed oceans at 3 of 6 seeds of a 35% click, and the pieces of the REAL ocean then read as cut off by the click.
//
// THE RULE. Every sea cut off before the click is not this click's: Generate land neither joins, fills nor counts it (the half-water
// rule and a flipped verdict still judge it, as before); nor is a sea the layers below ship cut off, though the mod's own map opened
// it (review R-P3: no test turned red without that clause). The ocean is the body that holds most of the ocean as it was. And the page
// counts only the seas THIS click cut off — "1,532 sea provinces the new land cut off stayed sea" after a 26-province click that cut
// none of them off is a sentence about the wrong seas.
//
// Fixtures: maps of province COLUMNS (16 x 4 pixels, one province per column), the strategic regions saying which the growth can
// pick. Everything expected is derived from the column tables below and a probe run with the fill off.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-designedsea-"));
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
const typesIn = (mod) => {
  const t = new Map();
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = ln.split(";");
    if (c.length > 4 && /^\d+$/.test(c[0])) t.set(+c[0], c[4]);
  }
  return t;
};
const same = (a, b) => JSON.stringify([...a].map(Number).sort((x, y) => x - y)) === JSON.stringify([...b].map(Number).sort((x, y) => x - y));

/**
 * A map of province columns. `cols`: the province id of each column, west to east (the east edge touches the west across the seam).
 * `land`: the ids typed land. `regions`: { regionId: [ids] }. `port`: a sea a port in the mod's own buildings.txt opens onto.
 * `overlay`: true leaves out the replace_path lines, so the layers below the mod load beneath its map.
 */
function columnsMod(tag, { cols, land, regions, port = 0, overlay = false }) {
  const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(m, "descriptor.mod"), overlay ? 'name="Designed"\n' : 'name="Designed"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  const ids = [...new Set(cols)].sort((a, b) => a - b);
  const colour = (id) => [id * 7 % 256, id * 13 % 256, 40];
  mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(ids.map((i) => {
    const t = land.includes(i) ? "land" : "sea";
    return `${i};${colour(i).join(";")};${t};false;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`;
  })).join("\r\n") + "\r\n");
  mk(path.join(m, "map", "provinces.bmp"), bmp24(cols.length, 4, (x) => colour(cols[x])));
  for (const [r, provs] of Object.entries(regions)) mk(path.join(m, "map", "strategicregions", `${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  if (port) mk(path.join(m, "map", "buildings.txt"), `1;naval_base_spawn;${cols.indexOf(port)}.00;9.90;1.00;0.00;${port}\r\n`);
  return m;
}
// the sea bodies of a column map (each column touches the next, and the last the first), largest first
const seaBodies = (cols, isSea) => {
  const ids = [...new Set(cols)], adj = new Map(ids.map((i) => [i, new Set()]));
  for (let x = 0; x < cols.length; x++) { const a = cols[x], b = cols[(x + 1) % cols.length]; if (a !== b) { adj.get(a).add(b); adj.get(b).add(a); } }
  const seen = new Set(), out = [];
  for (const s of ids.sort((a, b) => a - b)) {
    if (seen.has(s) || !isSea(s)) continue;
    const q = [s]; seen.add(s);
    for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i])) if (!seen.has(n) && isSea(n)) { seen.add(n); q.push(n); }
    out.push(q.sort((a, b) => a - b));
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
};

let note = null;
try {
  const lib = require("./testlib-map-page.js");
  note = vm.runInNewContext(lib.lift("function generatedInlandSeasNote(") + "\ngeneratedInlandSeasNote", {});
} catch (e) { note = null; }

try {
  console.log("=== Generate land leaves a designed inland sea alone ===\n");

  console.log("1. A designed sea in a mostly-water region, cut off before the click, and a click elsewhere");
  {
    // columns: land 4 | the designed sea 2 (no way out) | land 3 | sea 1, the only province the growth can pick | ocean 5, 6, 7.
    // REGION_2 = { 2 3 } is half water, so the repair keeps sea 2 as an inland sea — before the click AND after it (1 is elsewhere).
    const SEA = 2, PICK = 1;
    const shape = { cols: [4, 4, 2, 2, 3, 3, 1, 1, 5, 5, 5, 5, 6, 6, 7, 7], land: [3, 4], regions: { 1: [1], 2: [2, 3] } };
    for (const port of [0, SEA]) {
      const tag = port ? "…and the same sea with a port in the mod's own buildings.txt opening onto it" : "with no port";
      console.log(`   ${tag}`);
      const was = md.fixInlandSeas({ modRoot: columnsMod("before", { ...shape, port }), gameRoot: null, dependencyRoots: [], plan: true });
      rec(`THE CONTROL (${port ? "port" : "no port"}): before the click the sea is cut off, and the repair keeps it`,
        !(was.fill || []).length && (same((was.kept || {}).caspian || [], [SEA]) || same((was.kept || {}).inUse || [], [SEA])), was);
      const m = columnsMod("click", { ...shape, port });
      const g = md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
      const t = typesIn(m), is = g.inlandSeas || {};
      rec(`THE CONTROL (${port ? "port" : "no port"}): the click raised 1, in another region`, g.changed === true && t.get(PICK) === "land", { err: g.error });
      rec(`⭐⭐⭐ (${port ? "port" : "no port"}) the designed sea is still sea`, t.get(SEA) === "sea", { sea: t.get(SEA), seas: is });
      rec(`⭐⭐ (${port ? "port" : "no port"}) …and the click neither filled, joined nor counted it as one it cut off`,
        is.filled === 0 && !(is.provinces || []).length && is.joined === 0 && !(is.leftSea || []).length
        && is.kept && is.kept.caspian === 0 && is.kept.inUse === 0 && is.kept.inherited === 0, is);
      if (note) rec(`⭐⭐ (${port ? "port" : "no port"}) …and the page says nothing about it`, note(g) === "", note(g));
      else rec("public/map.js has generatedInlandSeasNote", false);
    }
  }

  console.log("\n2. A designed ocean larger than what the click leaves of the real one");
  {
    // (a) THE JOIN. Columns: land 90 | 11 (pickable) | the real ocean 21-24 | 12 (pickable) | 31, 32 | land 91 | a designed ocean
    // 41-45, cut off before | land 92. Only 11 and 12 are in a strategic region, so a click of two raises both. Before it, the real
    // ocean (21-24, 11, 12, 31, 32: 8) is the largest body; after it, the designed ocean (5) is larger than any piece of it (4, 2).
    // 31-32 is in no strategic region, so it cannot become land: it must go back to the ocean — the real one.
    const REAL = [21, 22, 23, 24], POCKET = [31, 32], DESIGNED = [41, 42, 43, 44, 45];
    const cols = [90, 11, 21, 22, 23, 24, 12, 31, 32, 91, 41, 42, 43, 44, 45, 92];
    const shape = { cols, land: [90, 91, 92], regions: { 1: [11, 12] } };
    const types0 = typesIn(columnsMod("join-shape", shape));
    const before = seaBodies(cols, (id) => types0.get(id) === "sea");
    const after = seaBodies(cols, (id) => types0.get(id) === "sea" && id !== 11 && id !== 12);
    rec("THE CONTROL: before the click the real ocean is the largest body; after it the designed ocean is larger than any piece of it",
      before[0].includes(21) && before[0].length > DESIGNED.length && same(after[0], DESIGNED), { before: before.map((b) => b.length), after: after.map((b) => b.length) });
    const m = columnsMod("join", shape);
    const g = md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 2, provincesPerState: 8, seed: 1 });
    const t = typesIn(m), is = g.inlandSeas || {};
    const bodies = seaBodies(cols, (id) => t.get(id) === "sea");
    rec("THE CONTROL: the click raised 11, the pick nothing hangs on", g.changed === true && t.get(11) === "land", { err: g.error, seas: is });
    rec("⭐⭐⭐ the pocket goes back to the REAL ocean: one body holds both, and the designed ocean is the only other",
      bodies.length === 2 && [...REAL, ...POCKET].every((p) => bodies[0].includes(p)) && same(bodies[1], DESIGNED), bodies);
    rec("…through the pick between them, left sea", same(is.leftSea || [], [12]) && is.joined === 1, is);

    // (b) THE PLAN. Columns: land 90 | the real ocean 21-24 | 13 | 33 | land 91 | the designed ocean 41-45 | land 92, 93, 94. 21-24,
    // 13 and 33 share one strategic region, so the growth can pick any of them; the probe finds a seed whose one pick is 13. That walls
    // 33 off — one province behind one pick, so it is filled — and leaves the real ocean (4) smaller than the designed one (5).
    const cols2 = [90, 21, 22, 23, 24, 13, 33, 91, 41, 42, 43, 44, 45, 92, 93, 94];
    const shape2 = { cols: cols2, land: [90, 91, 92, 93, 94], regions: { 1: [21, 22, 23, 24, 13, 33] } };
    let seed = 0;
    for (let s = 1; s <= 64 && !seed; s++) {
      const p = columnsMod("plan-probe", shape2);
      md.generateLand({ modRoot: p, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: s, fillCutOffSeas: false });
      const tp = typesIn(p);
      if (tp.get(13) === "land" && [...REAL, 33].every((id) => tp.get(id) === "sea")) seed = s;
    }
    const after2 = seaBodies(cols2, (id) => !shape2.land.includes(id) && id !== 13);
    rec("THE CONTROL: a seed raises 13 alone, and then the designed ocean is the largest body, and 33 a sea of one behind one pick",
      seed > 0 && same(after2[0], DESIGNED) && after2.some((b) => same(b, [33])), { seed, after: after2 });
    const m2 = columnsMod("plan", shape2);
    const g2 = md.generateLand({ modRoot: m2, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: seed || 1 });
    const t2 = typesIn(m2), is2 = g2.inlandSeas || {};
    rec("⭐⭐⭐ the real ocean stays sea — the plan takes it, not the designed ocean, for the ocean", REAL.every((p) => t2.get(p) === "sea"), { types: REAL.map((p) => t2.get(p)), seas: is2 });
    rec("⭐⭐ the one sea the click did cut off becomes land with it, though its region is mostly water", t2.get(33) === "land" && same(is2.provinces || [], [33]), is2);
    rec("⭐⭐ …and the designed ocean is left as it was", DESIGNED.every((p) => t2.get(p) === "sea"), DESIGNED.map((p) => t2.get(p)));
  }

  console.log("\n3. A sea the layers below ship cut off is theirs, though the mod's own map opened it to the ocean");
  {
    // Columns: land 90 | the ocean 21-24 | 12, the one pickable province | a sea 51-53 in no strategic region | land 91-96. Below the
    // mod, 12 is LAND, so the layers below ship 51-53 cut off; the mod's own map opened it through 12. Raising 12 walls it off again.
    // Without the layer below it must go back to the ocean (no region: it cannot become land); with it, it is not this click's.
    const SEA = [51, 52, 53];
    const shape = { cols: [90, 21, 22, 23, 24, 12, 51, 52, 53, 91, 92, 93, 94, 95, 96, 97], land: [90, 91, 92, 93, 94, 95, 96, 97], regions: { 1: [12] }, overlay: true };
    const GAME = columnsMod("game", { ...shape, land: [...shape.land, 12], regions: {} });
    const below = md.fixInlandSeas({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    rec("THE CONTROL: the layer below ships the sea cut off, and its repair would fill it", !below.error && same(below.targets || [], SEA), below);
    const alone = columnsMod("alone", shape);
    const ga = md.generateLand({ modRoot: alone, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
    rec("THE CONTROL: with nothing below, the click keeps the sea open through 12 — it cannot become land",
      ga.changed === false && same((ga.inlandSeas || {}).leftSea || [], [12]), { err: ga.error, seas: ga.inlandSeas });
    const m = columnsMod("over", shape);
    const g = md.generateLand({ modRoot: m, gameRoot: GAME, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
    const t = typesIn(m), is = g.inlandSeas || {};
    rec("⭐⭐⭐ over the layer below, the click raises 12 and joins nothing: the sea is left cut off, as the layers below ship it",
      g.changed === true && t.get(12) === "land" && SEA.every((p) => t.get(p) === "sea") && !(is.leftSea || []).length && is.joined === 0, { err: g.error, seas: is });
  }

  console.log(`\n=== Generate land leaves a designed inland sea alone: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
