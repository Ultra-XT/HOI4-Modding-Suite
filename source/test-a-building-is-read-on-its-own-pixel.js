// buildings.txt's z maps to the bitmap row H - 1 - floor(z). One row out reads the NEIGHBOUR.
// #a-building-is-read-one-pixel-north
//
// The formula was spelled out at four sites in map-data.js and two of them disagreed:
//
//   fixCoastalNoPort (reader + writer)             H - 1 - z        <- measured, correct
//   buildingsTxtPlacementScan (validator + fixer)  H - Math.floor(z)   one row north
//   rekeyBuildingAnchorsForProvince (writer)       H - Math.floor(z)   one row north
//   fixWaterSupplyRail (stranded-building drop)    H - Math.floor(z)   one row north
//
// readBmp24 hands back TOP-DOWN pixels, so those are one province boundary apart — and near a boundary that
// is a different province in a different state. Measured across all three shipping maps (re-derived below,
// so the numbers cannot rot): rows landing on land whose state column matches the province's real owner,
//
//                y = H-1-z      y = H-z        naval_base_spawn on land  (H-1-z / H-z)
//     vanilla       64,345        61,150              2,362 of 2,362  /  1,659
//     Millennium    75,966        72,584              2,750 of 2,750  /  1,866
//     Old World    110,123       104,924              4,421 of 4,421  /  3,317
//
// H - 1 - z puts EVERY naval_base_spawn in all three maps on land with a matching state. H - z loses about
// a thousand per map, and on vanilla leaves 179 land rows looking mis-stated where the right formula leaves
// 10 — which the validator reported as the modder's problem and Auto-fix then "repaired" by re-homing them
// into the neighbouring state. One off-by-one produced both the cry-wolf and the corruption.
//
// ⭐ The fix is ONE named helper, not four corrected copies: the previous fix reached one of the four sites
// and nothing in the other three said they were answering the same question.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

// ── the helper itself ────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the mapping, and its inverse ===");
{
  ok(md.buildingZToPixelY(1000, 10) === 989, "z 10 on a 1000-row map is row 989 (H - 1 - z)", md.buildingZToPixelY(1000, 10));
  ok(md.buildingZToPixelY(1000, 10.9) === 989, "…and a fractional z floors, it does not round", md.buildingZToPixelY(1000, 10.9));
  ok(md.pixelYToBuildingZ(1000, 989) === 10, "the writer's mapping is the exact inverse", md.pixelYToBuildingZ(1000, 989));
  ok(md.buildingZToPixelY(1000, 0) === 999 && md.buildingZToPixelY(1000, 999) === 0,
    "…and both ends of the map round-trip, with no row off the edge", true);
}

// ── ⭐⭐⭐ THE MEASUREMENT, re-derived from the shipped maps ─────────────────────────────────────────
console.log("\n=== ⭐⭐⭐ which formula puts the shipped ports on land? ===");
{
  const roots = [["vanilla", GAME]];
  for (const [id, label] of [["2777392649", "Millennium Dawn"], ["2265420196", "Old World Blues"]]) {
    if (fs.existsSync(path.join(WS, id, "map", "buildings.txt"))) roots.push([label, path.join(WS, id)]);
  }
  if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    let checked = 0;
    for (const [label, root] of roots) {
      const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const p2s = m.provinceToState || {};
      const typeOf = new Map((m.provinces || []).map((p) => [p.id, p.type]));

      let bmpPath = path.join(root, "map", "provinces.bmp");
      if (!fs.existsSync(bmpPath)) bmpPath = path.join(GAME, "map", "provinces.bmp");
      const buf = fs.readFileSync(bmpPath);
      const dataOff = buf.readUInt32LE(10), W = buf.readInt32LE(18), H = buf.readInt32LE(22);
      const rs = Math.floor((24 * W + 31) / 32) * 4;
      const c2i = new Map();
      for (const p of m.provinces || []) c2i.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.id);
      const idAt = (x, y) => {   // top-down y, the convention every reader in map-data.js uses
        if (x < 0 || y < 0 || x >= W || y >= H) return 0;
        const o = dataOff + (H - 1 - y) * rs + x * 3;
        const id = c2i.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0);
        return id === undefined ? 0 : id;
      };

      let bpath = path.join(root, "map", "buildings.txt");
      if (!fs.existsSync(bpath)) bpath = path.join(GAME, "map", "buildings.txt");
      const acc = { right: { spawnOk: 0, landMismatch: 0 }, north: { spawnOk: 0, landMismatch: 0 } };
      let spawnRows = 0;
      for (const ln of fs.readFileSync(bpath, "utf8").split(/\r?\n/)) {
        const t = ln.trim(); if (!t || t.startsWith("#")) continue;
        const c = t.split(";"); if (c.length < 6) continue;
        const st = parseInt(c[0], 10), x = parseFloat(c[2]), z = parseFloat(c[4]);
        if (![st, x, z].every(Number.isFinite)) continue;
        const spawn = (c[1] || "").trim().toLowerCase() === "naval_base_spawn";
        if (spawn) spawnRows++;
        for (const [k, py] of [["right", md.buildingZToPixelY(H, z)], ["north", H - Math.floor(z)]]) {
          const pid = idAt(Math.floor(x), py);
          if (!(pid > 0) || typeOf.get(pid) !== "land") continue;
          if (p2s[pid] === st) { if (spawn) acc[k].spawnOk++; } else acc[k].landMismatch++;
        }
      }
      checked++;
      console.log(`     ${label}: ports on their own state's land ${acc.right.spawnOk}/${spawnRows} (H-1-z) vs ${acc.north.spawnOk} (H-z)` +
        `  ·  land rows looking mis-stated ${acc.right.landMismatch} vs ${acc.north.landMismatch}`);
      ok(acc.right.spawnOk === spawnRows,
        `⭐⭐⭐ ${label}: EVERY naval_base_spawn lands on its own state's land under H - 1 - z`,
        { got: acc.right.spawnOk, of: spawnRows });
      ok(acc.north.spawnOk < acc.right.spawnOk,
        `⚠️ …and one row north loses ${acc.right.spawnOk - acc.north.spawnOk} of them — the formulas are not interchangeable`,
        { north: acc.north.spawnOk, right: acc.right.spawnOk });
      ok(acc.right.landMismatch < acc.north.landMismatch,
        `⭐⭐ …and it cries wolf ${acc.north.landMismatch - acc.right.landMismatch} fewer times about a shipping map`,
        { right: acc.right.landMismatch, north: acc.north.landMismatch });
    }
    ok(checked >= 1, `${checked} shipping map(s) measured`, checked);
  }
}

// ── ⭐⭐⭐ THE CRY-WOLF TEST: what does the RULE now say about shipping content? ─────────────
console.log("\n=== ⭐⭐⭐ building_wrong_state on maps that ship and launch ===");
{
  const shipping = [["vanilla", GAME]];
  if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
    if (fs.existsSync(path.join(WS, id, "map", "buildings.txt")) && fs.existsSync(path.join(WS, id, "map", "provinces.bmp"))) {
      shipping.push(["ws-" + id, path.join(WS, id)]);
    }
  }
  if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    let checked = 0;
    for (const [label, root] of shipping.slice(0, 6)) {
      const model = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const probs = md.findBuildingPlacementProblems({ modRoot: root, gameRoot: GAME, dependencyRoots: [], model });
      checked++;
      ok(probs.length === 0,
        `⭐⭐⭐ ${label}: not one building_wrong_state — a rule about the modder's mistakes says nothing about shipped content`,
        probs.map((p) => String(p.message).slice(0, 110)));
    }
    ok(checked >= 2, `${checked} shipping map(s) checked`, checked);
  }
}

// ── ⭐⭐ ONE spelling, derived from source ────────────────────────────────────────────────────────────
console.log("\n=== ⭐⭐ the formula is written once ===");
{
  // Comments masked first: the prose above this fix (and in map-data.js) contains the wrong formula on
  // purpose, and would satisfy a raw grep for it. #strip-comments
  const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const stray = [];
  const re = /H\s*-\s*Math\.floor\(\s*z\s*\)|\bH\s*-\s*1\s*-\s*(?:Math\.floor\(\s*)?[a-z][\w.]*\.z\b/g;
  let m;
  while ((m = re.exec(src))) stray.push(m[0].trim() + " @line " + src.slice(0, m.index).split("\n").length);
  ok(stray.length === 0,
    "⭐⭐ no site spells the z→row mapping out for itself — they all call buildingZToPixelY", stray);

  const uses = (src.match(/buildingZToPixelY\(/g) || []).length;
  ok(uses >= 4, "…and at least the four sites that used to disagree go through it", uses);
}

console.log(`\n=== a building is read on its own pixel: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
