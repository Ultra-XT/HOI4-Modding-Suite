// 🎨 #the-tint-boxes-still-sit-on-the-old-world — A COLOUR-GRADING BOX IS PLACED FOR ONE MAP.
//
// gfx/posteffect_volumes.txt grades the picture's colours by where the camera is: a green box over Brazil's jungle, a warm
// one over the Sahara, deep blue over open ocean. A world Nova generated keeps the base game's boxes, so the camera switched
// to a desert grading over open sea and to a deep-water one over a new continent — 20 of vanilla's 27 boxes sit over ground
// that is no longer what they were made for (scratchpad pfx-judge.js; every installed map mod that keeps vanilla's boxes
// stays above an overlap of 0.657).
//
// Pinned on a small game with four provinces, one per quarter, and a box over each:
//   · where a box is: `position` is its CENTRE and z counts up from the map's BOTTOM row — the fixture is lopsided, so the
//     corner reading and the top-down reading each pick a different box;
//   · Map Errors names the box whose ground changed, as a warning, and only that one;
//   · Auto-fix takes that box out — with the comment above it — and leaves every other byte of the file as it was, in its
//     own line endings; the mod gets its own copy; a second click writes nothing and Map Errors is quiet;
//   · a mod's own file: a box carried verbatim from below is still judged (so a world regenerated after a fix is too), a box
//     the mod placed itself is its own business;
//   · a mod that owns no map file is never judged and never given the file;
//   · Auto-fix calls the step and the page reports it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const L = require("./public/map-rule-labels.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tint-box-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the game: 64 x 32, a province per quarter. z counts up from the bottom row, so the SOUTH is the bottom of the picture.
//    south-west 1 sea · south-east 2 desert · north-west 3 forest · north-east 4 sea
const W = 64, H = 32;
const COL = { 1: [10, 10, 200], 2: [200, 200, 0], 3: [0, 150, 0], 4: [10, 10, 150] };
const provAtZ = (x, z) => (z < 16 ? (x < 32 ? 1 : 2) : (x < 32 ? 3 : 4));
const DEF = {
  1: "1;10;10;200;sea;true;ocean;0", 2: "2;200;200;0;land;true;desert;1",
  3: "3;0;150;0;land;true;forest;1", 4: "4;10;10;150;sea;true;ocean;0",
};
const defCsv = (over = {}) => ["0;0;0;0;land;false;unknown;0", ...[1, 2, 3, 4].map((id) => over[id] || DEF[id])].join("\n") + "\n";
const game = tmp("game");
write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAtZ(x, H - 1 - y)]));
write(game, "map/definition.csv", defCsv());

// Each box's footprint is one quarter's middle: 24 x 12 around the quarter's centre. Under the CORNER reading the south-west
// box would reach into three other quarters (44% of it over the sea that changes: kept); under the TOP-DOWN reading the two
// western boxes would swap quarters. Only the centre-and-bottom reading drops exactly the south-western box below.
const box = (name, day, x, z, extra = "") => [
  `\tposteffect_volume = {${extra}`,
  `\t\tname = ${name}`,
  ``,
  `\t\tposteffect_values_day = ${day}`,
  `\t\tposteffect_values_night = ${day}_night`,
  ``,
  `\t\tposition = { ${x}.0 300.0 ${z}.0 }`,
  `\t\tsize = { 24.0 800.0 12.0 }`,
  `\t\tfade_distance = 75.0`,
  `\t}`,
];
const PFX_LINES = [
  "posteffect_values = {",
  "\tname = default",
  "\thdr_exposure = 1.0",
  "}",
  "",
  "posteffect_volumes = {",
  "\tposteffect_height_volume = {",
  "\t\tname = \"Base\"",
  "\t\tposteffect_values_day = default",
  "\t\theight = 0",
  "\t\tfade_distance = 0",
  "\t}",
  "",
  "############ SOUTH ############",
  "",
  // vanilla's banner over South America closes with a rule line straight above Brazil's box: the banner's, not the box's
  "#################################",
  "\t# the southern sea's deep blue",
  ...box("SouthSea", "blue_water", 16, 8),
  "",
  ...box("SouthDesert", "africa_values", 48, 8),
  "",
  "############ NORTH ############",
  "",
  ...box("NorthForest", "green", 16, 24),
  "",
  "\t#posteffect_volume = {",
  "\t#\tname = OldSouthSea",
  "\t#\tposition = { 16.0 300.0 8.0 }",
  "\t#\tsize = { 24.0 800.0 12.0 }",
  "\t#}",
  ...box("NorthSea", "blue_water", 48, 24),
  "}",
  "",
];
// the base game's file is CRLF: the mod's copy must stay so, and not a single bare LF may appear in it
const PFX = PFX_LINES.join("\r\n");
write(game, "gfx/posteffect_volumes.txt", PFX);

const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
const mkMod = () => { const m = tmp("mod"); write(m, "descriptor.mod", 'name="tint box test"\n'); return m; };
const names = (o) => (o && o.stale ? o.stale.map((b) => b.name).sort() : o);
const lfOnly = (s) => (s.match(/(^|[^\r])\n/g) || []).length;
/** The file with the named boxes' lines — and the comment line straight above each — taken out. */
const without = (lines, drop, eol) => {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\tposteffect_volume = \{/.test(lines[i]) ? /name = (\S+)/.exec(lines[i + 1]) : null;
    if (m && drop.includes(m[1])) {
      // prose only: a commented-out box's closing `#}` is not a caption (captionStart's own rule)
      if (out.length && /^\t# /.test(out[out.length - 1])) out.pop();
      while (lines[i] !== "\t}") i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join(eol);
};

try {
  console.log("\n-- the ground under each box: centre, counted from the bottom --");
  const m = mkMod();
  // the south-western sea is land now; nothing else changed
  write(m, "map/definition.csv", defCsv({ 1: "1;10;10;200;land;true;plains;1" }));
  const o = md.posteffectBoxesOutOfStep(G(m));
  ok(!!o && o.judged === 4, "four boxes are judged — the commented-out one is not a box", o && o.judged);
  ok(JSON.stringify(names(o)) === JSON.stringify(["SouthSea"]), "⭐ only the box over the sea that became land is stale", names(o));

  console.log("\n-- Map Errors names it, as a warning --");
  const probs = md.validateMapBitmap(G(m));
  const p = probs.find((q) => q.rule === "posteffect_boxes_placed_for_another_map");
  ok(!!p && p.severity === "warning" && p.autoFix === true && p.total === 1, "Map Errors reports one box placed for another map, offering Auto-fix", p);
  ok(!!p && JSON.stringify((p.items || []).map((i) => i.name)) === JSON.stringify(["SouthSea"]), "…and names it", p && p.items);
  ok(!L.isFatalRule("posteffect_boxes_placed_for_another_map"), "…not as a crash: the game loads a box anywhere");

  console.log("\n-- Auto-fix takes that box out and nothing else --");
  const fx = md.autoFixMap(G(m));
  const f = fx && fx.fixes && fx.fixes.posteffect;
  ok(!!f && f.changed === true && f.removed === 1 && f.materialized === true && JSON.stringify(f.boxes) === JSON.stringify(["SouthSea"]), "Auto-fix's step removed the one box, into the mod's own copy", f);
  const own = path.join(m, "gfx", "posteffect_volumes.txt");
  const shaOf = (p) => (fs.existsSync(p) ? sha(fs.readFileSync(p)) : "(no file)");
  const got = fs.existsSync(own) ? fs.readFileSync(own, "utf8") : "";
  const want = without(PFX_LINES, ["SouthSea"], "\r\n");
  ok(got === want, "⭐ the copy is the base game's file minus that box and the comment above it, byte for byte", got.length + " vs " + want.length);
  ok(lfOnly(got) === 0, "…in the file's own CRLF line endings", lfOnly(got));
  ok(got.includes("posteffect_height_volume") && got.includes("posteffect_values = {") && got.includes("\t#\tname = OldSouthSea") && got.includes("############ SOUTH ############"),
    "…the height volume, the value sets, the commented-out box and the banners all stay");
  ok(got.includes("\r\n#################################\r\n"),
    "⭐ …the rule line that closed the banner right above the box stays too — it was the banner's, not the box's (review of 509c00a)", got.slice(got.indexOf("SOUTH"), got.indexOf("SOUTH") + 160));
  ok(p && /\(\d+ KB\)/.test(p.message) && !/a few KB/.test(p.message), "the warning says how big the copy will be, measured", p && p.message.slice(-120));
  ok(!md.validateMapBitmap(G(m)).some((q) => q.rule === "posteffect_boxes_placed_for_another_map"), "Map Errors is quiet afterwards");
  const snap = shaOf(own);
  const fx2 = md.autoFixMap(G(m));
  ok(fs.existsSync(own) && shaOf(own) === snap && !(fx2.fixes.posteffect && fx2.fixes.posteffect.changed), "a second Auto-fix leaves the file byte-identical", fx2.fixes.posteffect);

  console.log("\n-- the world is regenerated after the fix: the boxes it kept are still judged --");
  write(m, "map/definition.csv", defCsv({ 1: "1;10;10;200;land;true;plains;1", 4: "4;10;10;150;land;true;hills;1" }));
  const o2 = md.posteffectBoxesOutOfStep(G(m));
  ok(JSON.stringify(names(o2)) === JSON.stringify(["NorthSea"]), "a box the mod's own copy carries verbatim from below is judged against the map below", names(o2));
  const f3 = md.fixPosteffectBoxesPlacedForAnotherMap(G(m));
  const got3 = fs.existsSync(own) ? fs.readFileSync(own, "utf8") : "";
  ok(f3.changed && f3.materialized === false && got3 === without(PFX_LINES, ["SouthSea", "NorthSea"], "\r\n"), "…and taken out of the mod's own file the same way", f3);

  console.log("\n-- a box the mod placed itself is its own business --");
  {
    const m2 = mkMod();
    write(m2, "map/definition.csv", defCsv({ 1: "1;10;10;200;land;true;plains;1" }));
    // the mod moved the south-western box by one pixel: not the base game's box any more
    write(m2, "gfx/posteffect_volumes.txt", PFX.replace("position = { 16.0 300.0 8.0 }", "position = { 17.0 300.0 8.0 }"));
    const o3 = md.posteffectBoxesOutOfStep(G(m2));
    ok(!!o3 && o3.judged === 3 && o3.stale.length === 0, "three boxes are judged (the verbatim ones), none stale — the moved one is not judged", o3 && { judged: o3.judged, stale: names(o3) });
    const before = sha(fs.readFileSync(path.join(m2, "gfx", "posteffect_volumes.txt")));
    ok(!md.fixPosteffectBoxesPlacedForAnotherMap(G(m2)).changed && sha(fs.readFileSync(path.join(m2, "gfx", "posteffect_volumes.txt"))) === before, "…and Auto-fix's step leaves the file alone");
  }

  console.log("\n-- a mod that owns no map file is never judged and never given the file --");
  {
    const m3 = mkMod();
    write(m3, "common/ideas/x.txt", "ideas = { }\n");
    ok(md.posteffectBoxesOutOfStep(G(m3)) === null, "nothing to judge");
    ok(!md.fixPosteffectBoxesPlacedForAnotherMap(G(m3)).changed && !fs.existsSync(path.join(m3, "gfx")), "…and nothing copied in");
  }

  console.log("\n-- land that stays land but changes its kind is changed ground too --");
  {
    const m4 = mkMod();
    // the south-eastern desert grows a forest: still land, but the warm desert grading is made for sand
    write(m4, "map/definition.csv", defCsv({ 2: "2;200;200;0;land;true;forest;1" }));
    ok(JSON.stringify(names(md.posteffectBoxesOutOfStep(G(m4)))) === JSON.stringify(["SouthDesert"]), "the box over the desert that became forest is stale", names(md.posteffectBoxesOutOfStep(G(m4))));
  }

  console.log("\n-- 🈯 CRY-WOLF: the shipping maps that keep the base game's boxes, re-derived here --");
  {
    // Every installed map mod that keeps vanilla's boxes stays above an overlap of 0.657 (Millennium Dawn, the lowest), so
    // none of them may be told its boxes were placed for another map. Old World Blues is the other direction: a different
    // continent under vanilla's boxes, which is exactly what the rule is for.
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    const quiet = [["Millennium Dawn", "2777392649"], ["Novum Vexillum", "1827273767"], ["The Road to 56", "820260968"]];
    if (!fs.existsSync(path.join(GAME, "gfx", "posteffect_volumes.txt"))) console.log("  ..   (the base game is not installed — the shipping maps were NOT measured)");
    else {
      for (const [name, id] of quiet) {
        const root = path.join(WS, id);
        if (!fs.existsSync(path.join(root, "map", "definition.csv"))) { console.log(`  ..   (${name} is not installed)`); continue; }
        const o = md.posteffectBoxesOutOfStep({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
        ok(!!o && o.judged === 27 && o.stale.length === 0, `${name}: all 27 of the base game's boxes judged, none stale`, o && { judged: o.judged, stale: names(o) });
      }
      const owb = path.join(WS, "2265420196");
      if (!fs.existsSync(path.join(owb, "map", "definition.csv"))) console.log("  ..   (Old World Blues is not installed)");
      else {
        const o = md.posteffectBoxesOutOfStep({ modRoot: owb, gameRoot: GAME, dependencyRoots: [] });
        ok(!!o && o.stale.length >= 15, `Old World Blues — another continent under the base game's boxes — has ${o && o.stale.length} of them stale`, o && names(o));
      }
    }
  }

  console.log("\n-- the wiring --");
  {
    const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const a = src.indexOf("function autoFixMap("), b = src.indexOf("\nfunction ", a + 10);
    const body = a !== -1 && b > a ? src.slice(a, b) : "";
    ok(/fixes\.posteffect\s*=\s*fixPosteffectBoxesPlacedForAnotherMap\(/.test(body), "Auto-fix calls the step");
    // the second inland-sea pass near the end of the click can still raise a sea: the step must judge the ground after it
    const step = body.search(/fixPosteffectBoxesPlacedForAnotherMap\(/), lastSea = body.lastIndexOf("fixInlandSeas(");
    ok(step > -1 && lastSea > -1 && step > lastSea, "…after the last inland-sea pass", { step, lastSea });
    const page = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
    ok(/fr\.fixes\s*&&\s*fr\.fixes\.posteffect/.test(page), "the page reads its result");
    ok(!!L.LABELS.posteffect_boxes_placed_for_another_map && !!L.FIX_HINTS.posteffect_boxes_placed_for_another_map, "the rule has a label and an explanation");
  }
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
