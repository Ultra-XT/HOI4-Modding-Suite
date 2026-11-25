// ⛔ #a-redraw-keeps-what-it-does-not-model — REDRAW STRATEGIC REGIONS SPLICES; IT DOES NOT REBUILD.
//
// The redraw decides four things about a region: its name, provinces, naval terrain and weather. The first version rebuilt
// every block it touched from those four and deleted everything else. The adversarial review of 60ed681 found TEST 26's ten
// shark-infested seas (vanilla's `static_modifiers = { water_modifier_shark_infested = always }`) came out with none, and a
// modder's comments inside a block vanished. Six of the seven installed map mods carry 10-16 such blocks. CLAUDE.md's
// writing contract: "Splice, don't rebuild."
//
//   1. Over a base game with static_modifiers and an in-block comment: the shadows the redraw writes keep both.
//   2. Over the mod's OWN multi-block file (BOM, CRLF, a commented-out block, comments inside and outside blocks, a region
//      above the top id that still lists provinces): everything but the four fields stays, byte for byte where untouched.
//   3. A region named after a base region is named by THAT region's key, so the translations below keep resolving (the
//      first version wrote NOVA_REGION_<id> in English only; vanilla names its regions in ten languages).
//   4. A second click writes nothing.
// Back-out control (by hand, 2026-09-24): with blockFor ignoring its template (the rebuild the review found), the
// static_modifiers and in-block-comment checks below fail.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { makeRegionWorld, treeHash } = require("./testlib-region-rebuild-world.js");

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };

const W = makeRegionWorld("keeps", { modifiers: true, baseLoc: true });
process.env.APPDATA = path.join(W.ROOT, "appdata");
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");
const roots = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };
const regionFile = (root, f) => fs.readFileSync(path.join(root, "map", "strategicregions", f), "utf8");
const blockOf = (text, id) => { const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id); return b ? text.slice(b.start, b.end) : ""; };

// ── 1. shadows of the base game's files ──
const r1 = md.rebuildStrategicRegions({ ...roots, opts });
ok(r1.ok, `the redraw is written: ${JSON.stringify(r1).slice(0, 300)}`);
const m1 = md.buildMapModel(roots);
const dir1 = path.join(W.MOD, "map", "strategicregions");
const blockById = (id) => { for (const f of fs.readdirSync(dir1)) { const b = blockOf(regionFile(W.MOD, f), id); if (b) return b; } return ""; };
const east = blockOf(regionFile(W.MOD, "5-East Sea.txt"), 5);
ok(/static_modifiers\s*=\s*\{\s*water_modifier_shark_infested\s*=\s*always\s*\}/.test(east), `⭐⭐⭐ region 5, spliced into the base game's block, keeps its static_modifiers:\n${east.slice(0, 400)}`);
ok(/naval_terrain\s*=\s*water_deep_ocean/.test(east), "…and its naval terrain");
// every sea region made out of the old east sea (the base sea region it overlaps most) is still shark-infested
const eastPieces = m1.strategicRegions.filter((r) => r.provinces.length && r.provinces.every((p) => W.baseRegion(p) === 5 && W.modType(p) !== "land"));
ok(eastPieces.length >= 1, `the old east sea is redrawn as ${eastPieces.length} sea region(s)`);
const bare = eastPieces.filter((r) => !/water_modifier_shark_infested/.test(blockById(+r.id)));
ok(bare.length === 0, `⭐⭐⭐ every piece of the shark-infested east sea is still shark-infested (without it: ${bare.map((r) => r.id)})`);
const west = regionFile(W.MOD, "1-West Sea.txt");
ok(/water_modifier_shark_infested/.test(west), "⭐⭐ …and so is the west sea's shadow");
ok(!m1.strategicRegions.some((r) => r.provinces.some((p) => W.modType(p) === "land") && !r.provinces.some((p) => W.modType(p) === "sea") && /water_modifier_shark_infested/.test(blockById(+r.id)) && !/^[1-7]$/.test(String(r.id))),
  "no NEW land region is given a water modifier");
const north = regionFile(W.MOD, "3-A North.txt");
ok(north.includes("# the north of continent A, drawn by hand"), "⭐⭐ a comment inside a base block survives its shadow");
// a comment INSIDE the weather — Millennium Dawn's `#temperature_day_night` in every period of all 212 of its region files. The
// first splice copied the comment MASK and turned each one into a run of spaces (round-two review)
const withWeather = fs.readdirSync(dir1).filter((f) => /weather\s*=\s*\{\s*\S/.test(regionFile(W.MOD, f)));
const lost = withWeather.filter((f) => !regionFile(W.MOD, f).includes("#temperature_day_night={ 5.0 -5.0 }"));
ok(withWeather.length > 5 && lost.length === 0, `⭐⭐⭐ every region file the redraw wrote keeps the comment inside its weather (${withWeather.length} with weather, lost in: ${lost})`);
ok(!fs.readdirSync(dir1).some((f) => /\t {20,}/.test(regionFile(W.MOD, f))), "…and no run of blanks is left where a comment was");
// no two regions are named by one key (the fallback keys are reserved before any base key is handed out)
const keyCount = new Map();
for (const r of m1.strategicRegions) if (r.provinces.length) keyCount.set(r.name, (keyCount.get(r.name) || 0) + 1);
ok([...keyCount.values()].every((n) => n === 1), `⭐ no two regions share a name key (${[...keyCount].filter(([, n]) => n > 1).map(([k]) => k)})`);
const named5 = m1.strategicRegions.find((r) => r.name === "STRATEGICREGION_5");
ok(!!named5 && eastPieces.some((r) => r === named5), `⭐⭐ the largest piece of the east sea is named by the base region's own key, so every translation below still resolves (${named5 && named5.id})`);
ok(!m1.strategicRegions.some((r) => r !== named5 && r.name === "STRATEGICREGION_5"), "…and no other region shares that key");
const german = fs.readFileSync(path.join(W.GAME, "localisation", "german", "regions_l_german.yml"), "utf8");
ok(/STRATEGICREGION_5:0 "East Sea \(de\)"/.test(german), "…the German name the layer below gives that key");
// a region that is land now carries no naval terrain, whatever the block it was spliced into said
for (const r of m1.strategicRegions) {
  const land = r.provinces.filter((p) => W.modType(p) === "land").length, sea = r.provinces.filter((p) => W.modType(p) === "sea" || p === W.PROV.lakeSea || p === W.PROV.lakeIslet).length;
  if (!land || sea) continue;
  const f = fs.readdirSync(path.join(W.MOD, "map", "strategicregions")).find((x) => blockOf(regionFile(W.MOD, x), +r.id));
  ok(!/naval_terrain/.test(blockOf(regionFile(W.MOD, f), +r.id)), `land region ${r.id} carries no naval_terrain`);
}
const h1 = treeHash(W.MOD);
const again = md.rebuildStrategicRegions({ ...roots, opts });
ok(again.ok && JSON.stringify(treeHash(W.MOD)) === JSON.stringify(h1), "⭐ a second click writes nothing");

// ── 2. the mod's OWN multi-block file ──
const V = makeRegionWorld("keeps-own", { modifiers: true });
const vRoots = { modRoot: V.MOD, gameRoot: V.GAME, dependencyRoots: [] };
const own = path.join(V.MOD, "map", "strategicregions", "00_mod_regions.txt");
fs.mkdirSync(path.dirname(own), { recursive: true });
const OUTSIDE = "# regions of my own, drawn by hand";
const DEAD = "#strategic_region={ id=99 name=\"OLD\" provinces={ 1 } }";
const INSIDE = "# keep the sharks";
const CAPTION = "#Jingzhou, as Road to 56 captions its lines";
const OLD_LINE = "#1014 1142 1296 an old list I keep";
const WEATHER_NOTE = "#my own weather for this sea";
const OLD5 = md.buildMapModel(vRoots).strategicRegions.find((r) => +r.id === 5).provinces;
const text = "﻿" + [
  OUTSIDE,
  "strategic_region={",
  "\tid=5",
  "\tname=\"MY_EAST_SEA\"",
  `\t${INSIDE}`,
  // Road to 56's shapes: a caption on a province line, a commented-out province line, and a weather of the mod's own with a
  // comment on it — the four comments a real redraw of that mod lost, and the weather an overlay redraw replaced with the base's
  "\tprovinces={",
  "\t\t" + OLD5.slice(0, 5).join(" ") + "\t\t" + CAPTION,
  "\t\t" + OLD_LINE,
  "\t\t" + OLD5.slice(5).join(" "),
  "\t}",
  "\tstatic_modifiers={",
  "\t\twater_modifier_shark_infested=always",
  "\t}",
  `\tweather={\t${WEATHER_NOTE}`,
  "\t\tperiod={ between={ 0.0 30.11 } temperature={ 0.0 20.0 } no_phenomenon=1.0 }",
  "\t}",
  "}",
  DEAD,
  "strategic_region={",
  "\tid=40",
  "\tname=\"MY_FAR_REGION\"",
  `\tprovinces={ ${V.PROV.islet} }`,
  "\tstatic_modifiers={ water_modifier_shark_infested=always }",
  "\tweather={ period={ between={ 0.0 30.11 } temperature={ 0.0 20.0 } no_phenomenon=1.0 } }",
  "}",
  "",
].join("\r\n");
fs.writeFileSync(own, text);
const r2 = md.rebuildStrategicRegions({ ...vRoots, opts });
ok(r2.ok, `the redraw over the mod's own file is written: ${JSON.stringify(r2).slice(0, 300)}`);
const after = fs.readFileSync(own, "utf8");
ok(after.charCodeAt(0) === 0xfeff, "the BOM is kept");
ok(!/(^|[^\r])\n/.test(after), "⭐ the file is still wholly CRLF");
ok(after.includes(OUTSIDE) && after.includes(DEAD), "⭐ the comment and the commented-out block outside the blocks are kept");
const b5 = blockOf(after, 5), b40 = blockOf(after, 40);
ok(b5.includes(INSIDE), `⭐⭐⭐ the comment INSIDE block 5 is kept:\n${b5.slice(0, 300)}`);
// the province list was spliced at the id level, not rewritten
const mV5 = md.buildMapModel(vRoots).strategicRegions.find((r) => +r.id === 5);
ok(mV5 && mV5.provinces.slice().sort((a, b) => a - b).join() !== OLD5.slice().sort((a, b) => a - b).join(), "region 5's provinces really changed (so the list was edited, not left alone)");
ok(b5.includes(CAPTION) && b5.includes(OLD_LINE), `⭐⭐⭐ a caption on a province line and a commented-out province line both survive the list changing:\n${b5.slice(0, 500)}`);
// the region is still what it was (its own block is its weather donor), so the mod's OWN weather stays — not the base game's
ok(b5.includes(WEATHER_NOTE) && /no_phenomenon=1\.0/.test(b5), `⭐⭐⭐ the mod's own weather for region 5, and its comment, are kept:\n${b5.slice(0, 600)}`);
ok(/static_modifiers=\{\r\n\t\twater_modifier_shark_infested=always\r\n\t\}/.test(b5), "⭐⭐⭐ block 5's static_modifiers is kept byte for byte");
ok(/static_modifiers=\{ water_modifier_shark_infested=always \}/.test(b40) && /provinces=\{\s*\}/.test(b40), `⭐⭐ region 40, above the top id, is emptied and keeps its static_modifiers:\n${b40}`);
const mV = md.buildMapModel(vRoots);
const listed = new Map();
for (const r of mV.strategicRegions) for (const p of r.provinces) listed.set(p, (listed.get(p) || 0) + 1);
ok([...listed.values()].every((n) => n === 1) && V.ALL.every((p) => listed.has(p)), "every province is in exactly one region afterwards");
const hV = treeHash(V.MOD);
const againV = md.rebuildStrategicRegions({ ...vRoots, opts });
ok(againV.ok && JSON.stringify(treeHash(V.MOD)) === JSON.stringify(hV), "⭐ a second click writes nothing here either");

// ── 3. a base sea with one island in it is still a SEA for naming (vanilla: 37 such regions) ──
// The first rule called a base region land-kind if it held a single land pixel, so the sea redrawn over the base East Sea
// could not be named "East Sea" once that sea had an island (round-two review).
{
  const I = makeRegionWorld("keeps-island", { baseIsland: true });
  const iRoots = { modRoot: I.MOD, gameRoot: I.GAME, dependencyRoots: [] };
  const ri = md.rebuildStrategicRegions({ ...iRoots, opts });
  ok(ri.ok, `the redraw over a base sea holding an island is written: ${JSON.stringify(ri).slice(0, 200)}`);
  const mi = md.buildMapModel(iRoots);
  const named5 = mi.strategicRegions.find((r) => r.name === "STRATEGICREGION_5");
  ok(!!named5 && named5.provinces.every((p) => I.modType(p) !== "land"), `⭐⭐ the base East Sea, island and all, still names a SEA region (${named5 ? named5.id : "none"})`);
  ok(!mi.strategicRegions.some((r) => r.name === "STRATEGICREGION_5" && r.provinces.some((p) => I.modType(p) === "land") && !r.provinces.some((p) => I.modType(p) !== "land")), "…and no land region takes its name");
}

console.log(`✓ test-a-redraw-keeps-what-it-does-not-model.js — ${pass} checks`);
