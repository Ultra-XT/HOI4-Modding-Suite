// An erased coast must join the sea beside it, even when that sea's strategic region is mostly land.
// #an-erased-coast-joins-a-mostly-land-naval-region
//
// Erasing a coastal province to sea (the erase brush, replayed on Save as POST /api/map/flip-province-sea
// { provinceId } -> flipProvinceToSea) moves the new sea out of its old LAND strategic region into the region of
// the sea beside it. The comment on that step says why: water left in a land region is "dead water" the naval
// engine cannot use, and the map loads but crashes (IsMapInGoodState=no, recorded against a real Millennium Dawn
// crash dump, 2026-06-20). Auto-fix's half-converted-sea cleanup (fixSeaProvinceLeftovers) makes the same move.
//
// Both asked findAdjacentOceanRegion, which decided what counts as a naval region with a water-MAJORITY test,
// `sea >= land`. The same file already records that test as wrong: fixFractionedRegions says a region is naval iff
// it CONTAINS at least one sea province — "the in-game rule — e.g. 'Taiwan Strait' is only 19% water but is naval.
// A water-RATIO test missed those." Nobody went back to the other function. When every sea region beside the
// province was mostly land it returned null, the province stayed in its land region, and the erase answered ok.
//
// Measured on the six shipping maps (read-only probe of definition.csv, strategicregions and provinces.bmp),
// coastal land provinces the ratio test leaves in a region whose sea they do not touch:
//
//     vanilla 104 of 2,362 · Millennium Dawn 213 of 2,750 · Road to 56 144 of 2,544
//     Old World Blues 66 of 4,421 · Novum Vexillum 155 of 2,752 · Rise of Nations 121 of 2,358
//
// — the Tyrrhenian, Aegean, Black Sea, Caribbean, East China and Java/Banda coastlines. Vanilla province 3772 sits
// in 21-Alpine Region (0 sea / 101 land) and its only sea neighbour is in 169-Tyrrhenian Sea (6 sea / 11 land).
// With the in-game rule every one of those finds a region: 0 left behind on all six.
//
// ⚠️ The ratio is kept as a PREFERENCE (sections 5 and 6), and that was measured rather than assumed. Swapping the
// predicate alone re-routed coasts that already had an answer — vanilla 17, MD 39, R56 37, OWB 23, NV 28, RoN 32,
// one of them into Old World Blues' region 104 (26 sea inside 4,235 land) — and moved 3 provinces (MD 2, NV 1)
// out of a region whose sea they already touched. As built, over every coastal land province of the six maps,
// cross-checked against the real function on ten of them per map: 0 re-routed, 0 moved out of a region they
// touch, and the only coasts whose outcome changes are exactly the stranded ones counted above.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}

// 12 x 4. Columns 0-2: two coastal LAND provinces, 1 on top and 5 below. Columns 3-5: the SEA, province 2.
// Columns 6-8 and 9-11: two more LAND provinces, 3 then 4. So 1 and 5 open onto the sea on their right, and 3 on
// its left.
const COL = { 1: [200, 0, 0], 5: [180, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0], 4: [0, 150, 0] };
const provAt = (x, y) => (x < 3 ? (y < 2 ? 1 : 5) : x < 6 ? 2 : x < 9 ? 3 : 4);

function writeWorld(root, { oneIsSea = false, strait = [2, 3, 4], land = [1, 5], more = null } = {}) {
  mk(path.join(root, "descriptor.mod"), 'name="Coast"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n');
  mk(path.join(root, "map", "provinces.bmp"), bmp24(12, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(root, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    oneIsSea ? "1;200;0;0;sea;false;ocean;0" : "1;200;0;0;land;true;plains;1",
    "2;0;0;200;sea;false;ocean;0",
    "3;0;200;0;land;true;plains;1",
    "4;0;150;0;land;false;plains;1",
    "5;180;0;0;land;true;plains;1",
  ].join("\r\n") + "\r\n");
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
  mk(path.join(root, "history", "states", "1-S.txt"), st(1, "1 5"));
  mk(path.join(root, "history", "states", "2-S.txt"), st(2, "3 4"));
  const rg = (id, name, provs, naval) => `strategic_region = {\n\tid = ${id}\n\tname = "${name}"\n\tprovinces = { ${provs.join(" ")} }\n`
    + (naval ? "\tnaval_terrain = water_littoral\n" : "") + "\tweather = {}\n}\n";
  mk(path.join(root, "map", "strategicregions", "100-Land.txt"), rg(100, "LAND", land, false));
  mk(path.join(root, "map", "strategicregions", "200-Strait.txt"), rg(200, "STRAIT", strait, true));
  if (more) mk(path.join(root, "map", "strategicregions", "300-More.txt"), rg(300, "MORE", more, false));
}

// Which region files list a province, read off the disk rather than out of Nova's own model.
const regionsHolding = (root, pid) => {
  const dir = path.join(root, "map", "strategicregions");
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = parseInt((/\bid\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const body = (/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "";
    if ((body.match(/\d+/g) || []).map(Number).includes(pid)) out.push(id);
  }
  return out.sort((a, b) => a - b);
};

const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-nogame-"));
tmps.push(NOGAME);

// A region's sea and land count, derived from the model Nova builds — the fixture states its shape, it does not
// just assume it.
const composition = (root, rid) => {
  md.clearMapLayerCache();
  const m = md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true });
  const types = new Map((m.provinces || []).map((p) => [p.id, p.type]));
  const r = (m.strategicRegions || []).find((x) => x.id === rid) || { provinces: [] };
  return { sea: r.provinces.filter((p) => types.get(p) === "sea").length, land: r.provinces.filter((p) => types.get(p) === "land").length };
};

try {
  console.log("1. ⛔ Erasing a coast that opens onto a strait whose region is mostly land");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-strait-")); tmps.push(mod);
    writeWorld(mod);
    const c = composition(mod, 200);
    rec("the fixture is the shape the ratio refused: region 200 holds sea, but less sea than land", c.sea > 0 && c.sea < c.land, c);
    rec("province 1 starts in the land region, and only there", regionsHolding(mod, 1).join(",") === "100", regionsHolding(mod, 1));

    // Exactly the fields the endpoint hands over for the brush's queued write.
    const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1 });
    rec("the erase itself went through, so a region result below is not a refused erase", !!r && r.changed === true && r.type === "sea", r && (r.error || r.type));
    rec("⭐⭐⭐ province 1 LEFT the land region — no dead water is left in it", !regionsHolding(mod, 1).includes(100), regionsHolding(mod, 1));
    rec("⭐⭐⭐ …and JOINED the region of the strait it now opens onto", regionsHolding(mod, 1).join(",") === "200", regionsHolding(mod, 1));
    rec("⭐ …and the response says which region that was", !!r && r.navalRegion === 200, r && r.navalRegion);
    const dry = md.fixFractionedRegions({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], dryRun: true });
    rec("⚠️ …without fracturing that region — the fractioned-region check finds nothing to move",
      !!dry && !dry.error && !(dry.provinces || []).length, dry);
  }

  console.log("\n2. ⛔ The same choice in Auto-fix's cleanup of a half-converted sea");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-leftover-")); tmps.push(mod);
    // Province 1 is already sea in definition.csv, but state 1 still lists it and it is still in the land region.
    writeWorld(mod, { oneIsSea: true });
    const r = md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    rec("the cleanup took the sea province out of the land state", !!r && r.provincesRemoved === 1, r);
    rec("⭐⭐⭐ …and re-filed it into the strait's region instead of leaving it in the land one",
      regionsHolding(mod, 1).join(",") === "200", { regions: regionsHolding(mod, 1), regionsMoved: r && r.regionsMoved });
  }

  console.log("\n3. The control: a region that is all sea was always joined");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-ocean-")); tmps.push(mod);
    writeWorld(mod, { strait: [2], more: [3, 4] });
    const c = composition(mod, 200);
    rec("region 200 is all sea here", c.sea === 1 && c.land === 0, c);
    const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1 });
    rec("province 1 joins it — the harness does see a move when one is made", !!r && r.changed === true && regionsHolding(mod, 1).join(",") === "200", regionsHolding(mod, 1));
  }

  console.log("\n4. ⚠️ A coast already inside the strait's own region stays where it is");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-stay-")); tmps.push(mod);
    writeWorld(mod);
    const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 3 });
    rec("province 3 became sea", !!r && r.changed === true && r.type === "sea", r && (r.error || r.type));
    rec("⚠️ …and stayed in region 200, whose sea it already touches", regionsHolding(mod, 3).join(",") === "200", regionsHolding(mod, 3));
    rec("…with no region move made at all", !!r && r.regionMove == null, r && r.regionMove);
  }

  // A second world, 20 x 4, for a coast that opens onto TWO seas in two different regions.
  //   x 0-3   province 1 (land)            — sea 2 beside its top half, sea 6 beside its bottom half
  //   x 4-7   sea 2 (rows 0-1) · sea 6 (rows 2-3)
  //   x 8-11  land 3 (rows 0-1) · sea 7 (rows 2-3)
  //   x 12-15 land 4 (rows 0-1) · land 8 (rows 2-3)
  //   x 16-19 land 5 (rows 0-1) · land 9 (rows 2-3)
  const COL2 = { 1: [200, 0, 0], 2: [0, 0, 200], 6: [0, 0, 150], 3: [0, 200, 0], 7: [0, 0, 100], 4: [0, 150, 0], 8: [0, 100, 0], 5: [0, 120, 0], 9: [0, 80, 0] };
  const SEA2 = new Set([2, 6, 7]);
  const prov2At = (x, y) => { const top = y < 2; if (x < 4) return 1; if (x < 8) return top ? 2 : 6; if (x < 12) return top ? 3 : 7; if (x < 16) return top ? 4 : 8; return top ? 5 : 9; };
  const writeTwoSeas = (root, regions) => {
    mk(path.join(root, "descriptor.mod"), 'name="Coast2"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n');
    mk(path.join(root, "map", "provinces.bmp"), bmp24(20, 4, (x, y) => COL2[prov2At(x, y)]));
    mk(path.join(root, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COL2).map(Number).sort((a, b) => a - b).map((id) => {
      const [r, g, b] = COL2[id];
      return SEA2.has(id) ? `${id};${r};${g};${b};sea;false;ocean;0` : `${id};${r};${g};${b};land;${id === 1 || id === 3 || id === 8};plains;1`;
    })).join("\r\n") + "\r\n");
    const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
    mk(path.join(root, "history", "states", "1-S.txt"), st(1, "1 4 5"));
    mk(path.join(root, "history", "states", "2-S.txt"), st(2, "3 8 9"));
    for (const [id, provs] of Object.entries(regions)) {
      mk(path.join(root, "map", "strategicregions", `${id}-R.txt`), `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n`
        + (provs.some((p) => SEA2.has(p)) ? "\tnaval_terrain = water_littoral\n" : "") + "\tweather = {}\n}\n");
    }
  };

  console.log("\n5. ⚠️⚠️ A coast whose OWN mostly-land region holds the sea beside it keeps that region");
  {
    // Region 100 holds province 1 and the sea above it; region 200 holds the sea below it, and more of it.
    // Neither is mostly water. Moving province 1 into 200 would only take it out of a region whose sea it joins.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-own-")); tmps.push(mod);
    writeTwoSeas(mod, { 100: [1, 2, 3, 4], 200: [6, 7, 8, 9, 5] });
    const c100 = composition(mod, 100), c200 = composition(mod, 200);
    rec("the fixture: both regions hold sea, both are mostly land, and 200 holds more sea than 100",
      c100.sea > 0 && c100.sea < c100.land && c200.sea < c200.land && c200.sea > c100.sea, { c100, c200 });
    const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1 });
    rec("province 1 became sea", !!r && r.changed === true && r.type === "sea", r && (r.error || r.type));
    rec("⚠️⚠️ …and stayed in region 100, whose sea it already touches", regionsHolding(mod, 1).join(",") === "100", regionsHolding(mod, 1));
    rec("…with no region move made", !!r && r.regionMove == null && r.navalRegion == null, r && { regionMove: r.regionMove, navalRegion: r.navalRegion });
  }

  console.log("\n6. ⚠️⚠️ A mostly-WATER region beside the coast still wins over a mostly-land one with more sea");
  {
    // Exactly what the ratio chose before: every coast that already had an answer keeps it.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-ocean-first-")); tmps.push(mod);
    writeTwoSeas(mod, { 100: [1, 4, 5], 200: [2], 300: [6, 7, 3, 8, 9] });
    const c200 = composition(mod, 200), c300 = composition(mod, 300);
    rec("the fixture: 200 is all sea, 300 is mostly land but holds more sea", c200.land === 0 && c300.sea > c200.sea && c300.sea < c300.land, { c200, c300 });
    const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1 });
    rec("⚠️⚠️ province 1 joins the all-sea region 200, as it did before", regionsHolding(mod, 1).join(",") === "200", regionsHolding(mod, 1));
    rec("…and says so", !!r && r.navalRegion === 200, r && r.navalRegion);
  }

  console.log(`\n=== an erased coast joins a naval region that is mostly land: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
