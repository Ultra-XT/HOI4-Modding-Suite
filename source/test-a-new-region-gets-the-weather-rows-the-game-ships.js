// A new strategic region's weather rows must look like the ones the game actually ships.
// #weatherpositions-invented-a-size
//
// ensureWeatherPositionsForRegion required every region to carry both a "small" row and a "large" row in
// map/weatherpositions.txt, and appended whichever was missing. Measured over every weatherpositions.txt
// installed on this machine — vanilla plus five workshop mods:
//
//   · the size tokens in use are `big` and `small`. "large" appears ZERO times in any of them.
//   · NO region anywhere carries both a "small" and a "large".
//   · the real shape is TWO ROWS OF THE SAME SIZE (vanilla: 174 big+big, 45 small+small, only 7 mixed),
//     and 23 regions ship a single row and load fine.
//
// So creating a region appended a row whose size token the game has never been given, to satisfy a rule no
// shipping map meets — the cry-wolf shape, one step worse because it WRITES.
//
// ⚠️ Every number below is derived from the installed corpus at run time. The point of this test is that the
// rule follows the data; typing the data into it would defeat that.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WEATHER = path.join(GAME, "map", "weatherpositions.txt");
const tmps = [];
const parse = (text) => {
  const byRegion = new Map(), tokens = new Map();
  for (const ln of text.split(/\r?\n/)) {
    const c = ln.split(";");
    if (c.length < 5) continue;
    const rid = parseInt(c[0], 10);
    if (!Number.isFinite(rid)) continue;
    const size = (c[4] || "").trim().toLowerCase();
    tokens.set(size, (tokens.get(size) || 0) + 1);
    if (!byRegion.has(rid)) byRegion.set(rid, []);
    byRegion.get(rid).push(size);
  }
  return { byRegion, tokens };
};

if (!fs.existsSync(WEATHER)) {
  console.log("\n  ..   (the base game is not installed — this test measures its data)");
} else {
  console.log("\n=== 🈯 what the shipped data actually says ===");
  const vanilla = parse(fs.readFileSync(WEATHER, "utf8"));
  {
    ok(vanilla.byRegion.size > 100, `vanilla ships weather rows for ${vanilla.byRegion.size} regions`, vanilla.byRegion.size);
    ok(!vanilla.tokens.has("large"),
      "⭐⭐⭐ …and the token “large” appears NOWHERE in it", [...vanilla.tokens.keys()]);
    ok(vanilla.tokens.has("big") && vanilla.tokens.has("small"),
      "…the tokens it uses are big and small", [...vanilla.tokens.entries()]);
    let both = 0, sameSize = 0;
    for (const [, sizes] of vanilla.byRegion) {
      if (sizes.includes("small") && sizes.includes("large")) both++;
      if (sizes.length >= 2 && new Set(sizes).size === 1) sameSize++;
    }
    ok(both === 0,
      "⭐⭐⭐ NO vanilla region has both a small and a large — the old rule was met by none of them", both);
    ok(sameSize > vanilla.byRegion.size / 3,
      `⭐⭐ the normal shape is repeated rows of ONE size (${sameSize} of ${vanilla.byRegion.size} regions)`, sameSize);
    const singles = [...vanilla.byRegion.values()].filter((v) => v.length === 1).length;
    ok(singles > 0,
      `⚠️ …and ${singles} region(s) ship a single row and the game loads them, so "must have two" is not a law either`, singles);
  }

  console.log("\n=== …and that is what a new region is given ===");
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weather-")); tmps.push(d);
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="WX"\n');
    const before = fs.readFileSync(WEATHER, "utf8");
    const newId = Math.max(...vanilla.byRegion.keys()) + 7;   // an id the base file has no rows for
    const r = md.ensureWeatherPositionsForRegion({ modRoot: d, gameRoot: GAME, dependencyRoots: [] }, newId);
    ok(!!r && Array.isArray(r.added), "it writes rows for a region that has none", r);
    ok(r.added.indexOf("large") < 0,
      "⭐⭐⭐ …and NOT one of them is “large”", r.added);
    const dominant = [...vanilla.tokens.entries()].sort((a, b) => b[1] - a[1])[0][0];
    ok(r.added.every((t) => t === dominant),
      `⭐⭐ …they use the token the file itself uses most (“${dominant}”)`, r.added);
    ok(r.added.length === 2 && new Set(r.added).size === 1,
      "⭐⭐ …two rows of ONE size, the shape vanilla repeats", r.added);

    const after = parse(fs.readFileSync(path.join(d, "map", "weatherpositions.txt"), "utf8"));
    ok((after.byRegion.get(newId) || []).length === 2,
      "on disk the new region has exactly two rows", after.byRegion.get(newId));
    ok(!after.tokens.has("large"),
      "⭐⭐⭐ …and the written file still contains no “large” anywhere", [...after.tokens.keys()]);
    ok(after.byRegion.size === vanilla.byRegion.size + 1,
      "…and no other region was touched", { was: vanilla.byRegion.size, now: after.byRegion.size });

    // ⚠️ CONTROL: a region that already has rows is LEFT ALONE. 23 vanilla regions ship a single row, and
    // "topping them up" is exactly the invented rule this replaced.
    const existing = [...vanilla.byRegion.entries()].find(([, v]) => v.length === 1);
    if (existing) {
      const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weather2-")); tmps.push(d2);
      fs.writeFileSync(path.join(d2, "descriptor.mod"), 'name="WX2"\n');
      const r2 = md.ensureWeatherPositionsForRegion({ modRoot: d2, gameRoot: GAME, dependencyRoots: [] }, existing[0]);
      ok(r2 === null,
        `⚠️⚠️ region ${existing[0]} already has ${existing[1].length} row — it is left exactly as it is`, r2);
      ok(!fs.existsSync(path.join(d2, "map", "weatherpositions.txt")),
        "⚠️⚠️ …and the mod does not even acquire a copy of the file to do nothing to", true);
    }
    ok(before === fs.readFileSync(WEATHER, "utf8"), "⚠️ the base game's own file is untouched throughout");
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a new region gets the weather rows the game ships: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
