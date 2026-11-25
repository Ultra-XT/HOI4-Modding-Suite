// 🗺 #a-rebuilt-world-needs-its-own-regions + #a-new-region-file-mixes-line-endings — A REDRAWN FILE IS ONE LINE ENDING.
//
// Redraw strategic regions writes a region file per id, cloning each one's weather body out of the base game's file, and
// rewrites map/weatherpositions.txt. Four of the installed maps (Road to 56, Old World Blues, Novum Vexillum, Rise of Nations)
// ship those CRLF, vanilla LF. A cloned CRLF body inside an LF-built block is exactly how createStrategicRegion used to make
// MIXED files, and an anchored edit into a mixed file is the most common way an edit here "succeeds" and does nothing.
// So on a CRLF base map and on an LF one: every file the redraw wrote is wholly one line ending, and a file it CREATED takes
// the ending the map's region files already use.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };
const kind = (t) => { const crlf = (t.match(/\r\n/g) || []).length, lf = (t.match(/(^|[^\r])\n/g) || []).length; return crlf && lf ? "MIXED" : crlf ? "CRLF" : lf ? "LF" : "none"; };

let md = null;
for (const crlf of [true, false]) {
  const W = makeRegionWorld(crlf ? "eol-crlf" : "eol-lf", { crlf });
  if (!md) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; md = require("./map-data.js"); }
  const want = crlf ? "CRLF" : "LF";
  const base = fs.readFileSync(path.join(W.GAME, "map", "strategicregions", "1-West Sea.txt"), "utf8");
  ok(kind(base) === want, `the fixture's base region files are ${want} (${kind(base)})`);
  const r = md.rebuildStrategicRegions({ modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [], opts });
  ok(r.ok && r.written > 0, `the redraw is written on the ${want} map: ${JSON.stringify(r).slice(0, 200)}`);
  const written = (r.writtenFiles || []).filter((f) => /^map\/(strategicregions\/|weatherpositions)/.test(f));
  ok(written.length > 5, `it wrote region files and weather rows (${written.length})`);
  const mixed = written.filter((f) => kind(fs.readFileSync(path.join(W.MOD, ...f.split("/")), "utf8")) === "MIXED");
  ok(mixed.length === 0, `⭐⭐ no file the redraw wrote on the ${want} map mixes line endings (${mixed})`);
  const regionFiles = written.filter((f) => f.startsWith("map/strategicregions/"));
  const other = regionFiles.filter((f) => kind(fs.readFileSync(path.join(W.MOD, ...f.split("/")), "utf8")) !== want);
  ok(other.length === 0, `⭐ every region file it wrote follows the map's own ${want} (${other})`);
  const wp = fs.readFileSync(path.join(W.MOD, "map", "weatherpositions.txt"), "utf8");
  ok(kind(wp) === want, `map/weatherpositions.txt keeps the ${want} of the file it started from (${kind(wp)})`);
}
console.log(`✓ test-a-redrawn-region-file-keeps-one-line-ending.js — ${pass} checks`);
