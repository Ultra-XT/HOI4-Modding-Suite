// A province in no strategic region is put into its state's region by Auto-fix — only for a state the mod ships —
// and the error stops pointing at a fixer that cannot help.
// #a-province-in-no-region-had-no-fixer
//
// province_no_region guards an invariant with no exceptions on the installed corpus: 0 of the 95,434 provinces
// across the six shipping maps are in no strategic region. That is exactly why a hand-built or externally
// generated map is what breaks it. The error then advised: "Move each into an adjacent region (Region tool), or
// Auto-fix region overlaps first if regions were edited."
//
// repairRegionOverlaps opens its state loop with `(st.provinces || []).filter((p) => provRegions.has(p))
// // provinces that have a region` — a province in NO region is dropped on the first line. Measured on a fixture,
// province_no_region was [3,4,5] before and identically [3,4,5] after repairRegionOverlaps (region file
// byte-identical), after fixFractionedRegions, and after all 27 of autoFixMap's sub-fixers. The fixer the message
// named could never reach the condition the message was attached to.
//
// For a province that belongs to a state there is exactly one answer that does not split the state: the region
// the rest of that state is already in. repairRegionOverlaps now adds it there, in the same add-before-remove
// batch — but ONLY for a state the mod ships itself (#inherited-problem-not-yours: problemIsTheModsOwn, the test the
// validator itself applies). A province in no state (a sea or lake), or a state none of whose provinces has
// a region, has no single right answer; it is left alone, and the message now says how to place it by hand.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = { owner = AAA }\n}\n`;
const rg = (id, name, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "${name}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
const landRow = (i) => `${i};${i};${i};${i};land;false;plains;1`;
const BASE_ROWS = ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map(landRow));

// THE BASE LAYER: regions 10 = {1 2 3} and 20 = {4 5 6}; states 1 = {1 2}, 2 = {3}, 3 = {4 5 6}.
function writeBase(root, { extraRows = [], state3 = "4 5 6" } = {}) {
  mk(path.join(root, "map", "definition.csv"), BASE_ROWS.concat(extraRows).join("\r\n") + "\r\n");
  mk(path.join(root, "map", "strategicregions", "10-North.txt"), rg(10, "North", "1 2 3"));
  mk(path.join(root, "map", "strategicregions", "20-South.txt"), rg(20, "South", "4 5 6"));
  mk(path.join(root, "history", "states", "1-S.txt"), st(1, "1 2"));
  mk(path.join(root, "history", "states", "2-S.txt"), st(2, "3"));
  mk(path.join(root, "history", "states", "3-S.txt"), st(3, state3));
}
// THE MOD, an overlay on that base (no replace_path). It adds three provinces and none of them to a region:
//   7 — land, added to the mod's own copy of state 1, whose other provinces are all in region 10
//   8 — land, the only province of the mod's own new state 4, so no province of that state has a region
//   9 — sea, in no state at all
function writeMod(root) {
  mk(path.join(root, "descriptor.mod"), 'name="Own"\n');
  mk(path.join(root, "map", "definition.csv"), BASE_ROWS.concat([landRow(7), landRow(8), "9;0;0;99;sea;false;ocean;0"]).join("\r\n") + "\r\n");
  mk(path.join(root, "history", "states", "1-S.txt"), st(1, "1 2 7"));
  mk(path.join(root, "history", "states", "4-S.txt"), st(4, "8"));
}

const modelOf = (mod, game) => { md.clearMapLayerCache(); return md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true }); };
const problems = (mod, game, rule) => md.validateMapModel(modelOf(mod, game)).filter((p) => p.rule === rule);
const listed = (mod, game, rule) => [].concat(...problems(mod, game, rule).map((p) => p.provinces || [])).sort((a, b) => a - b);
const regionFile = (root, f) => path.join(root, "map", "strategicregions", f);
const provincesIn = (file) => (((/provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(file, "utf8")) || [])[1] || "").match(/\d+/g) || []).map(Number).sort((a, b) => a - b);

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-game-")); tmps.push(GAME);
  writeBase(GAME);

  console.log("1. ⛔⛔ The mod's own state gained a province in no region");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-own-")); tmps.push(mod);
    writeMod(mod);
    rec("the fixture: provinces 7, 8 and 9 are in no strategic region", listed(mod, GAME, "province_no_region").join(",") === "7,8,9", listed(mod, GAME, "province_no_region"));

    const r = md.repairRegionOverlaps({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("the repair ran", !!r && r.ok === true, r);
    const m = modelOf(mod, GAME);
    rec("⭐⭐⭐ province 7 is now in region 10, the region the rest of state 1 is in", m.provinceToRegion[7] === 10, m.provinceToRegion[7]);
    rec("⭐ …and the result says so, so Auto-fix's summary can", !!r && r.orphansPlaced === 1, r && r.orphansPlaced);
    rec("⭐⭐ the mod's copy of region 10 keeps every province it inherited, plus 7",
      fs.existsSync(regionFile(mod, "10-North.txt"))
        && provincesIn(regionFile(mod, "10-North.txt")).join(",") === provincesIn(regionFile(GAME, "10-North.txt")).concat([7]).sort((a, b) => a - b).join(","),
      fs.existsSync(regionFile(mod, "10-North.txt")) ? provincesIn(regionFile(mod, "10-North.txt")) : "(not written)");
    rec("⭐⭐⭐ region 20, which did not need to change, was NOT copied into the mod", !fs.existsSync(regionFile(mod, "20-South.txt")),
      fs.existsSync(path.join(mod, "map", "strategicregions")) ? fs.readdirSync(path.join(mod, "map", "strategicregions")) : "(none)");
    rec("⚠️⚠️ 8 (a state with no region anywhere in it) and 9 (sea, no state) are left for the modder — no single right answer",
      listed(mod, GAME, "province_no_region").join(",") === "8,9", listed(mod, GAME, "province_no_region"));
    rec("⚠️ …and no state was split to do it", problems(mod, GAME, "state_split_strategic_regions").length === 0, problems(mod, GAME, "state_split_strategic_regions").length);

    const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
    const before = readIf(regionFile(mod, "10-North.txt"));
    const r2 = md.repairRegionOverlaps({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("⚠️ a second run places nothing and writes nothing",
      before !== null && !!r2 && !r2.orphansPlaced && readIf(regionFile(mod, "10-North.txt")) === before, r2);
  }

  console.log("\n2. ⛔⛔⛔ An add-on is not handed the base layer's problem");
  {
    // The base itself ships province 7 in state 3 and in no region. The add-on ships nothing but its descriptor.
    const GAME2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-game2-")); tmps.push(GAME2);
    writeBase(GAME2, { extraRows: [landRow(7)], state3: "4 5 6 7" });
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-addon-")); tmps.push(addon);
    mk(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    const m = modelOf(addon, GAME2);
    rec("the fixture: the inherited state 3 lists province 7, which is in no region",
      m.provinceToRegion[7] == null && ((m.states || []).find((s) => s.id === 3) || { provinces: [] }).provinces.includes(7), m.provinceToRegion[7]);
    const r = md.repairRegionOverlaps({ modRoot: addon, gameRoot: GAME2, dependencyRoots: [] });
    rec("⭐⭐⭐ the repair places nothing", !!r && !r.orphansPlaced, r);
    rec("⭐⭐⭐ …and copies no region file into the add-on", !fs.existsSync(path.join(addon, "map", "strategicregions")),
      fs.existsSync(path.join(addon, "map", "strategicregions")) ? fs.readdirSync(path.join(addon, "map", "strategicregions")) : "(none)");
  }

  console.log("\n3. The Auto-fix all path — POST /api/map/auto-fix { modPath }");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-autofix-")); tmps.push(mod);
    writeMod(mod);
    const r = md.autoFixMap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("Auto-fix ran", !!r && r.ok === true, r && r.error);
    rec("⭐⭐⭐ province 7 is in region 10 afterwards", modelOf(mod, GAME).provinceToRegion[7] === 10, modelOf(mod, GAME).provinceToRegion[7]);
    rec("⭐⭐ …and Auto-fix copied no region file it did not need", !fs.existsSync(regionFile(mod, "20-South.txt")),
      fs.existsSync(path.join(mod, "map", "strategicregions")) ? fs.readdirSync(path.join(mod, "map", "strategicregions")) : "(none)");
  }

  console.log("\n4. ⭐⭐ The message stops naming a fixer that cannot help");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-msg-")); tmps.push(mod);
    writeMod(mod);
    const p = problems(mod, GAME, "province_no_region")[0] || {};
    const msg = String(p.message || "");
    rec("the rule fired", msg.length > 0, p);
    rec("⭐⭐⭐ it no longer sends the modder to “Auto-fix region overlaps”, which skips every province with no region", !/region overlaps/i.test(msg), msg.slice(0, 260));
    rec("⭐ …it says what Auto-fix all does place", /Auto-fix all/.test(msg), msg.slice(0, 260));
    rec("⭐ …and where to place the rest by hand", /province inspector/i.test(msg), msg.slice(0, 320));
  }

  console.log("\n5. ⚠️⚠️ Only a real land or lake province, and only when its state's answer is a single region");
  {
    // The mod's state 1 lists: 7 (land) · 13 (a lake — lakes sit inside states on every shipping map) ·
    // 10 (no definition.csv row at all) · 11 (sea) · 12 (land, ALSO listed by the mod's copy of state 3, which
    // is in region 20 — so two of the mod's own states want it in two different regions).
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noregion-guards-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Guards"\n');
    mk(path.join(mod, "map", "definition.csv"), BASE_ROWS.concat([landRow(7), "11;0;0;111;sea;false;ocean;0", landRow(12), "13;0;0;113;lake;false;lakes;0"]).join("\r\n") + "\r\n");
    mk(path.join(mod, "history", "states", "1-S.txt"), st(1, "1 2 7 10 11 12 13"));
    mk(path.join(mod, "history", "states", "3-S.txt"), st(3, "4 5 6 12"));
    const r = md.repairRegionOverlaps({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const m = modelOf(mod, GAME);
    const in10 = fs.existsSync(regionFile(mod, "10-North.txt")) ? provincesIn(regionFile(mod, "10-North.txt")) : [];
    const in20 = fs.existsSync(regionFile(mod, "20-South.txt")) ? provincesIn(regionFile(mod, "20-South.txt")) : [];
    rec("⭐ province 7 (land) is placed in region 10", m.provinceToRegion[7] === 10, m.provinceToRegion[7]);
    rec("⭐ …and so is province 13, a lake", m.provinceToRegion[13] === 10, m.provinceToRegion[13]);
    rec("…which is exactly two placements", !!r && r.orphansPlaced === 2, r);
    rec("⚠️⚠️ 10, an id with no definition.csv row, is written into no region", !in10.includes(10) && !in20.includes(10), { in10, in20 });
    rec("⚠️⚠️ 11, a sea province, is not put into a land region", !in10.includes(11) && !in20.includes(11), { in10, in20 });
    rec("⚠️⚠️ 12, wanted in two regions by two of the mod's states, is placed in neither", m.provinceToRegion[12] == null && !in10.includes(12) && !in20.includes(12), { in10, in20 });
  }

  console.log(`\n=== a province in no region joins the region of its state: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
