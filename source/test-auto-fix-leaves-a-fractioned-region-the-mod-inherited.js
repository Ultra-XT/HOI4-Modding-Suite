// "Auto-fix all" repairs the fractioned naval regions the mod made, and leaves alone the ones it inherited — so it
// never copies the base game's strategic-region files into a mod to "fix" what the validator never reported.
// #auto-fix-leaves-an-inherited-fractioned-region
//
// THE DEFECT. The fractioned_naval_region RULE subtracts the base layer's own fragments (baseFractionedProvinces):
// "The base game ships these and launches, so handing them back as 'your map will crash' buries the one or two the
// modder actually caused." Its FIXER, fixFractionedRegions, which autoFixMap runs up to four passes, never did — it
// moved every fragment it found. autoFixMap only asks whether the screen shows ANY problem, so an add-on with one
// unrelated problem of its own got the base game's regions rewritten into it. The sibling that already refuses this:
// fixDuplicateStateFiles ("a fixer must not be more opinionated than the rule that reported it").
//
// THE EVIDENCE (measured 2026-09-11 on the base commit): a brand-new vanilla add-on whose only problem was one empty
// state. One "Auto-fix all" click copied 12 of vanilla's strategic-region files into the add-on (83 Soloman Sea, 86
// Tasman Sea, 88 Bering Sea, 95/96/97, 105, 112, 172, 176, 178, 180) and moved 82 provinces — 76 sea, 6 land —
// between them. The validator had reported none of it. An add-on to Old World Blues, which ships genuine fragments,
// stays exposed even once the wrap-seam artefact behind most of vanilla's 76 is gone.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhfrac-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhfrac-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(W, H, idAt, colour) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, buf = Buffer.alloc(54 + rs * H);
  buf.write("BM", 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = colour[idAt(x, y)], o = 54 + (H - 1 - y) * rs + x * 3;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r;
  }
  return buf;
}

// THE BASE GAME. Stripes of provinces over an ocean row (9) that joins every sea, so no sea is inland:
//   x:  0-1  2-3  4-5  6-7  8-9  10-11 12-13 14-15
//        6    1    2    3    5    4     7     8        (2 and 4 are land, the rest sea)
// Naval region 10 = { 1 3 } is ALREADY cut in two by land 2 — the base game ships it that way, exactly as vanilla
// ships its own. Region 30 = { 5 } and region 50 = { 7 8 } are whole.
const STRIPES = [6, 6, 1, 1, 2, 2, 3, 3, 5, 5, 4, 4, 7, 7, 8, 8];
const W = STRIPES.length, H = 4;
const idAt = (x, y) => (y === H - 1 ? 9 : STRIPES[x]);
const COLOUR = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [0, 120, 0], 5: [120, 0, 0], 6: [0, 0, 120], 7: [60, 60, 200], 8: [200, 60, 60], 9: [10, 10, 90] };
const LAND = new Set([2, 4]);
const BASE_REGIONS = { 10: [1, 3], 20: [2], 30: [5], 40: [4], 50: [7, 8], 60: [6], 90: [9] };
const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;

function makeBaseGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhfrac-game-")); tmps.push(g);
  fs.mkdirSync(path.join(g, "map"), { recursive: true });
  fs.writeFileSync(path.join(g, "map", "provinces.bmp"), bmp24(W, H, idAt, COLOUR));
  mk(path.join(g, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COLOUR).map(Number).sort((a, b) => a - b).map((id) => {
    const [r, gg, b] = COLOUR[id];
    return LAND.has(id) ? `${id};${r};${gg};${b};land;true;plains;1` : `${id};${r};${gg};${b};sea;true;ocean;0`;
  })).join("\r\n") + "\r\n");
  for (const [id, provs] of Object.entries(BASE_REGIONS)) mk(path.join(g, "map", "strategicregions", `${id}.txt`), region(id, provs));
  return g;
}
const mod = (tag, files) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhfrac-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n`);
  for (const [rel, body] of Object.entries(files)) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const modelOf = (m, g) => { md.clearMapLayerCache(); return md.buildMapModel({ modRoot: m, gameRoot: g, dependencyRoots: [], cacheStableLayers: true }); };
// Both validators, as /api/map/validate concatenates them; fractioned_naval_region lives in validateMapBitmap.
const validate = (m, g) => md.validateMapModel(modelOf(m, g)).concat(md.validateMapBitmap({ modRoot: m, gameRoot: g, dependencyRoots: [] }));
const fracOf = (probs) => [].concat(...probs.filter((p) => p.rule === "fractioned_naval_region").map((p) => p.provinces || []));
const regionFilesIn = (m) => { const d = path.join(m, "map", "strategicregions"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };

try {
  const game = makeBaseGame();

  console.log("0. The fixture is honest");
  {
    rec("the base map has no X-crossing", md.findMapXCrossings({ modRoot: game }).length === 0);
    const dry = md.fixFractionedRegions({ modRoot: game, gameRoot: game, dependencyRoots: [], dryRun: true });
    rec("the base game's own naval region 10 is fractioned — province 3 is the fragment", (dry.provinces || []).join(",") === "3", dry);
  }

  console.log("\n1. ⛔⛔ An add-on whose only problem is an empty state of its own");
  {
    const addon = mod("addon", { "history/states/1-Empty.txt": 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n}\n' });
    const before = validate(addon, game);
    rec("the add-on's screen shows its own problem, so Auto-fix runs its fixers", before.some((p) => p.rule === "empty_state"), before.map((p) => p.rule));
    rec("…and does NOT show the inherited fractioned region", fracOf(before).length === 0, fracOf(before));
    const r = md.autoFixMap({ modRoot: addon, gameRoot: game, dependencyRoots: [] });
    rec("Auto-fix ran", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐⭐ no strategic-region file was copied into the add-on", regionFilesIn(addon).length === 0, regionFilesIn(addon));
    rec("⭐⭐ …and the fixer says it moved nothing", !!r.fixes && !!r.fixes.fractionedRegions && r.fixes.fractionedRegions.moved === 0, r.fixes && r.fixes.fractionedRegions);
    const m = modelOf(addon, game);
    rec("⭐ province 3 is still in the region the base game put it in", m.provinceToRegion[3] === 10, m.provinceToRegion[3]);
  }

  console.log("\n2. ⭐⭐ A mod that fractions a region ITSELF still gets it repaired — and only that one");
  {
    // The mod moves sea 8 into region 30, where it touches nothing else of region 30: its own fragment.
    const own = mod("own", { "map/strategicregions/30.txt": region(30, [5, 8]), "map/strategicregions/50.txt": region(50, [7]) });
    const before = validate(own, game);
    rec("the validator reports the mod's own fragment, province 8, and not the base game's 3", fracOf(before).join(",") === "8", fracOf(before));
    const r = md.autoFixMap({ modRoot: own, gameRoot: game, dependencyRoots: [] });
    rec("Auto-fix ran", !!r && r.ok === true, r && r.error);
    const m = modelOf(own, game);
    rec("⭐⭐⭐ the mod's own fragment was repaired: province 8 left region 30", m.provinceToRegion[8] !== 30, m.provinceToRegion[8]);
    rec("⭐⭐⭐ the base game's fragment was NOT: province 3 is still in region 10", m.provinceToRegion[3] === 10, m.provinceToRegion[3]);
    rec("⭐⭐ …so the mod ships no copy of region 10", !regionFilesIn(own).includes("10.txt"), regionFilesIn(own));
    rec("⭐ and the screen is clear afterwards", fracOf(validate(own, game)).length === 0, fracOf(validate(own, game)));
  }

  console.log(`\n=== auto-fix leaves a fractioned region the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
