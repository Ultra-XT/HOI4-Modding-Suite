// #a-rebuilt-world-needs-its-own-regions — Redraw strategic regions is safe to press twice, and refuses before it writes.
//
//   1. A second click on an unchanged world plans the same layout and writes NO file (the whole mod tree hashed between
//      the clicks). Control: change one state between the clicks and at least one file does change — so the hash can see
//      a write, and "nothing changed" is not a probe that cannot fail.
//   2. A mod with land in no state is refused (regions are built from whole states), and so is an add-on that does not
//      own definition.csv and provinces.bmp (its regions are drawn over a map another layer owns). Both leave the tree
//      byte-identical. Control: the same world made valid does write.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { makeRegionWorld, treeHash } = require("./testlib-region-rebuild-world.js");

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };
const changed = (a, b) => Object.keys(Object.assign({}, a, b)).filter((k) => a[k] !== b[k]);

const W = makeRegionWorld("twice");
process.env.APPDATA = path.join(W.ROOT, "appdata");
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");
const roots = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };

const first = md.rebuildStrategicRegions({ ...roots, opts });
ok(first.ok && first.written > 0, `the first click writes: ${JSON.stringify(first).slice(0, 300)}`);
const h1 = treeHash(W.MOD);
const second = md.rebuildStrategicRegions({ ...roots, opts });
ok(second.ok, `the second click succeeds: ${JSON.stringify(second).slice(0, 300)}`);
const h2 = treeHash(W.MOD);
ok(changed(h1, h2).length === 0, `the second click changes no file (changed: ${changed(h1, h2)})`);
ok((second.retyped || []).length === 0, "…and turns no further lake to sea");
// ⛔ a field that already says what the plan says is not touched: the modder captions a province line and comments a weather
// period (Road to 56's `11886\t\t#Jingzhou`, Millennium Dawn's `#temperature_day_night`) and changes nothing else. The next
// press must find nothing to write, and a click must leave both comments where they are (round-two review: it rewrote the
// block, re-sorted the list and dropped both).
{
  const dir = path.join(W.MOD, "map", "strategicregions");
  const f = fs.readdirSync(dir).find((x) => { const t = fs.readFileSync(path.join(dir, x), "utf8"); return /provinces\s*=\s*\{\s*\d/.test(t) && /period\s*=\s*\{/.test(t); });
  const orig = fs.readFileSync(path.join(dir, f), "utf8");
  const captioned = orig.replace(/(provinces\s*=\s*\{[^}]*?\d)( ?\r?\n)/, (_m, a, b) => `${a}\t\t#a caption of my own${b}`).replace(/(\t*)no_phenomenon=/, (_m, t) => `${t}#my note on the weather\n${t}no_phenomenon=`);
  ok(captioned !== orig && captioned.includes("#a caption of my own") && captioned.includes("#my note on the weather"), `the fixture file ${f} was captioned`);
  fs.writeFileSync(path.join(dir, f), captioned);
  const hC = treeHash(W.MOD);
  const dryC = md.rebuildStrategicRegions({ ...roots, opts, dryRun: true });
  ok(dryC.ok && dryC.summary.nothingToWrite === true, `⭐⭐ with only comments added, the next press has nothing to write (${JSON.stringify(dryC.summary && dryC.summary.files)})`);
  const clickC = md.rebuildStrategicRegions({ ...roots, opts });
  ok(clickC.ok && changed(hC, treeHash(W.MOD)).length === 0, `⭐⭐ …and a click writes nothing, both comments kept (changed: ${changed(hC, treeHash(W.MOD))})`);
}
// control: move one province between two states of continent B, and the next click must write
const sFile = path.join(W.MOD, "history", "states", "9-S.txt");
const s10 = path.join(W.MOD, "history", "states", "10-S.txt");
const t9 = fs.readFileSync(sFile, "utf8"), t10 = fs.readFileSync(s10, "utf8");
const moved = /provinces=\{ (\d+) /.exec(t10)[1];
fs.writeFileSync(s10, t10.replace(`provinces={ ${moved} `, "provinces={ "));
fs.writeFileSync(sFile, t9.replace("provinces={ ", `provinces={ ${moved} `));
const third = md.rebuildStrategicRegions({ ...roots, opts });
const h3 = treeHash(W.MOD);
ok(third.ok && changed(h2, h3).length > 1, `control: after a state changes, the click writes again (${changed(h2, h3).length} file(s), ${JSON.stringify(third).slice(0, 200)})`);

// refusals
const S = makeRegionWorld("stateless", { statelessLand: true });
const sRoots = { modRoot: S.MOD, gameRoot: S.GAME, dependencyRoots: [] };
const sBefore = treeHash(S.MOD);
const sRes = md.rebuildStrategicRegions({ ...sRoots, opts });
ok(!sRes.ok && sRes.refused === "stateless-land" && /Auto-fix/.test(sRes.error), `land in no state is refused, pointing at Auto-fix: ${JSON.stringify(sRes).slice(0, 300)}`);
ok(changed(sBefore, treeHash(S.MOD)).length === 0, "…and nothing is written");
const A = makeRegionWorld("addon", { addOn: true });
const aRoots = { modRoot: A.MOD, gameRoot: A.GAME, dependencyRoots: [] };
const aBefore = treeHash(A.MOD);
const aRes = md.rebuildStrategicRegions({ ...aRoots, opts });
ok(!aRes.ok && aRes.refused === "map-not-owned", `a mod that does not own the map is refused: ${JSON.stringify(aRes).slice(0, 300)}`);
ok(changed(aBefore, treeHash(A.MOD)).length === 0, "…and nothing is written");
// control: the stateless world made valid (its missing province put back in a state) is written
const s1 = path.join(S.MOD, "history", "states", "1-S.txt");
fs.writeFileSync(s1, fs.readFileSync(s1, "utf8").replace("provinces={ ", `provinces={ ${S.idAt(3, 0)} `));
const sFixed = md.rebuildStrategicRegions({ ...sRoots, opts });
ok(sFixed.ok && sFixed.written > 0, `control: the same world with every land province in a state is written (${JSON.stringify(sFixed).slice(0, 200)})`);
// #a-redraw-names-the-cause — two shapes the planner cannot place are refused BY NAME, before planning (review of 60ed681:
// both used to come back as gate names of the plan's own making — "province_in_two_regions", "region_without_weather_rows")
{
  const Q = makeRegionWorld("sea-in-state");
  const qRoots = { modRoot: Q.MOD, gameRoot: Q.GAME, dependencyRoots: [] };
  const sea = Q.idAt(7, 0);                               // an open-sea province next to continent A, put into state 1
  const s1 = path.join(Q.MOD, "history", "states", "1-S.txt");
  fs.writeFileSync(s1, fs.readFileSync(s1, "utf8").replace("provinces={ ", `provinces={ ${sea} `));
  const qBefore = treeHash(Q.MOD);
  const q = md.rebuildStrategicRegions({ ...qRoots, opts });
  ok(!q.ok && q.refused === "sea-in-state" && q.error.includes(`${sea} in state 1`) && /Auto-fix/.test(q.error), `⭐ a sea province in a state is refused naming it and Auto-fix: ${q.error}`);
  ok(changed(qBefore, treeHash(Q.MOD)).length === 0, "…and nothing is written");
  const P = makeRegionWorld("no-pixels");
  const pRoots = { modRoot: P.MOD, gameRoot: P.GAME, dependencyRoots: [] };
  const def = path.join(P.MOD, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8") + "200;1;2;3;sea;false;ocean;0\n");
  const pBefore = treeHash(P.MOD);
  const pr = md.rebuildStrategicRegions({ ...pRoots, opts });
  ok(!pr.ok && pr.refused === "province-no-pixels" && pr.error.includes("200"), `⭐ a province with no pixels is refused naming it: ${pr.error}`);
  ok(changed(pBefore, treeHash(P.MOD)).length === 0, "…and nothing is written");
}
// …and the coastline warning sends a mod to the button only when the button can act on it: a mod with regions of its own but
// no definition.csv of its own is told to move provinces itself (the button needs the mod's own land and sea)
{
  const A2 = makeRegionWorld("coast-addon", { addOn: true });
  const a2Roots = { modRoot: A2.MOD, gameRoot: A2.GAME, dependencyRoots: [] };
  const rd = path.join(A2.MOD, "map", "strategicregions");
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, "1-West Sea.txt"), `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${A2.ALL.join(" ")} }\n\tweather={ }\n}\n`);
  for (const f of fs.readdirSync(path.join(A2.GAME, "map", "strategicregions"))) if (!f.startsWith("1-")) fs.writeFileSync(path.join(rd, f), `strategic_region={\n\tid=${parseInt(f, 10)}\n\tname="R${parseInt(f, 10)}"\n\tprovinces={ }\n\tweather={ }\n}\n`);
  const w = (md.validateMapBitmap(a2Roots) || []).find((p) => p.rule === "regions_ignore_the_coastline");
  ok(w && !/Click 🗺 Redraw regions/.test(w.message) && /definition\.csv of its own/.test(w.message), `⭐ the warning does not send a mod the button would refuse to the button: ${w && w.message.slice(-260)}`);
  const refused = md.rebuildStrategicRegions({ ...a2Roots, opts, dryRun: true });
  ok(!refused.ok && refused.refused === "map-not-owned", "…and the button does refuse it");
  // a mod that owns its definition.csv but draws on the layer below's provinces.bmp — what Nova's own 1.0.6 builds — is its
  // own land and sea, and is redrawn (the redraw reads the bitmap and writes only files of the mod's own)
  const D2 = makeRegionWorld("inherited-bmp", { addOn: true });
  const donor = makeRegionWorld("inherited-bmp-def");
  fs.mkdirSync(path.join(D2.MOD, "map"), { recursive: true });
  fs.copyFileSync(path.join(donor.MOD, "map", "definition.csv"), path.join(D2.MOD, "map", "definition.csv"));
  const d2 = md.rebuildStrategicRegions({ modRoot: D2.MOD, gameRoot: D2.GAME, dependencyRoots: [], opts });
  ok(d2.ok && d2.written > 0 && !fs.existsSync(path.join(D2.MOD, "map", "provinces.bmp")), `⭐ a mod with its own definition.csv over the base bitmap is redrawn, and no bitmap is copied in (${JSON.stringify(d2).slice(0, 200)})`);
}
// the game root itself is never a target
const g = md.rebuildStrategicRegions({ modRoot: W.GAME, gameRoot: W.GAME, dependencyRoots: [], opts });
ok(!g.ok, "the base game itself is refused");

console.log(`✓ test-a-region-redraw-twice-writes-nothing.js — ${pass} checks`);
