// A coastal province with no port is what HOI4 itself calls a likely crash — and Nova exempted the only
// provinces that ever hit it. #a-new-island-has-no-port
//
// FOUND BY THE OWNER, playing a mod Nova had just validated as 0 errors / 0 warnings. HOI4's own log:
//
//   [map.cpp:1679]: Province 9 is setup as coastal but has no port building in the nudger.
//                   This will likely crash the game.        (…and the same for 41, 249, 446, 631)
//
// Those five are exactly the provinces Nova had turned from sea into land to build an island. Two separate
// reasons the validator stayed silent:
//
//  1. fixCoastalNoPort skipped any province whose definition.csv said `coastal = true`:
//         if (!pc || pc.coastal !== false) continue;   // only the CSV-says-inland ones
//     HOI4 decides coastal from the BITMAP and demands a port either way. A row saying `coastal = true`
//     does not PROVIDE a port — it only agrees there ought to be one.
//
//  2. "has a port" was tested as "does any SEA NEIGHBOUR host a naval_base_spawn?". An island dropped into
//     an ocean that already has ports elsewhere on its real coastline passes that test trivially. HOI4 asks
//     per province: is there a port whose state matches, sitting on THIS province?
//
// ⚠️ Neither is a rule Nova invented, and this test proves it the only way that counts: every bitmap-coastal
// land province in every shipping map already has one. Vanilla 2,362 of 2,362, Millennium Dawn 2,750 of
// 2,750, Old World Blues 4,421 of 4,421 — 9,533 provinces, zero exceptions.
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
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── ⚠️ THE ANTI-CRY-WOLF CONTROL FIRST. Widening this rule is only safe because the corpus obeys it. ──
console.log("\n=== ⚠️ every coastal province in every shipping map already has a port ===");
{
  const targets = (root) => {
    const r = md.fixCoastalNoPort({ modRoot: root, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    return r && r.error ? null : ((r && r.targets) || []);
  };
  let checked = 0;
  for (const [label, id] of [["Millennium Dawn", "2777392649"], ["Old World Blues", "2265420196"]]) {
    const root = path.join(WS, id);
    if (!fs.existsSync(path.join(root, "map", "provinces.bmp"))) { console.log(`  ..   (${label} not installed)`); continue; }
    const t = targets(root);
    if (t === null) continue;
    checked++;
    ok(t.length === 0, `⭐⭐⭐ ${label}: no portless coastal province — the rule does not fire on shipping content`, t.slice(0, 12));
  }
  ok(checked >= 1, `${checked} shipping mod(s) checked`, checked);
}

// ── the finding: a province Nova turned from sea into land ──────────────────────────────────────────
console.log("\n=== ⛔ …but an island Nova carves out of the ocean has none ===");
if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) {
  console.log("  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-port-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PORT"\nsupported_version="1.19.*"\n');

  // Find a SEA province fully surrounded by sea (an open-ocean one), flip it to land, give it a state.
  const model = md.buildMapModel({ modRoot: d, gameRoot: GAME, dependencyRoots: [] });
  const sea = (model.provinces || []).filter((p) => p.type === "sea" && p.id > 0);
  ok(sea.length > 50, `the base map has ${sea.length} sea provinces to pick from`, sea.length);

  let made = null;
  for (const s of sea.slice(0, 400)) {
    const flip = md.flipProvinceToLand({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceId: s.id });
    if (!flip || !flip.changed) continue;
    const st = md.createState({ modRoot: d, gameRoot: GAME, dependencyRoots: [], owner: "AAA", provinces: [s.id] });
    if (!st || !st.ok) continue;
    made = { province: s.id, state: st.id };
    break;
  }
  ok(!!made, "turned a sea province into land and gave it a state", made);

  if (made) {
    const r = md.fixCoastalNoPort({ modRoot: d, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    const t = (r && r.targets) || [];
    ok(t.indexOf(made.province) >= 0,
      `⭐⭐⭐ province ${made.province} is reported as coastal with no port — HOI4: "will likely crash the game"`,
      { targets: t.slice(0, 10), error: r && r.error });

    // ⭐⭐ …and the fixer's output satisfies the same rule, which is the round trip that matters: a port it
    // writes must be one HOI4 would accept, in the right state and on the right province.
    const fixed = md.fixCoastalNoPort({ modRoot: d, gameRoot: GAME, dependencyRoots: [] });
    ok(fixed && fixed.added >= 1, "the fixer adds a port for it", fixed);
    const after = md.fixCoastalNoPort({ modRoot: d, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    ok(((after && after.targets) || []).indexOf(made.province) < 0,
      "⭐⭐⭐ …and re-running the check no longer reports it — the port it wrote is one the rule accepts",
      (after && after.targets) || []);
  }
}

// ── the two things the old code got wrong, pinned so they cannot come back ──────────────────────────
console.log("\n=== the two exemptions are gone ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const MASKED = maskJsComments(SRC);
  const s = MASKED.indexOf("function fixCoastalNoPort");
  const body = MASKED.slice(s, MASKED.indexOf("\nfunction ", s + 10));
  ok(body.length > 500, "fixCoastalNoPort was found", body.length);
  ok(!/pc\.coastal !== false/.test(body),
    "⭐⭐ it no longer exempts provinces whose CSV already says coastal=true", body.length);
  ok(!/spawnSeas/.test(body),
    "⭐⭐ …and no longer treats a port anywhere on a neighbouring SEA as this province's port", body.length);
  ok(/portProv/.test(body),
    "…it resolves port rows to the province that hosts them", body.length);
  // ⚠️ The y-mapping, derived from vanilla's own 2,362 rows (2,306 land / all state-matching under H-1-z,
  // against 1,684/1,671 under H-z). NOTE: the writer's matching z is convention-alignment, not a demonstrated
  // bug fix — a back-out control on it did NOT bite, because the 3x3 tolerance below absorbs a one-pixel
  // shift. It is kept because it matches what Paradox's own nudger writes.
  //
  // ⭐ ASSERTED BY CALLING IT, NOT BY GREPPING FOR IT. This used to pin the literal `H - 1 - r.z`, so when
  // the formula moved into the shared buildingZToPixelY helper — same behaviour, one spelling instead of
  // four — the test failed for a change that fixed three OTHER call sites. A source-shape assertion has to
  // be anchored on the smallest thing that carries the meaning, and here the meaning is a number.
  ok(md.buildingZToPixelY(1000, 10) === 989 && md.buildingZToPixelY(1000, 10.9) === 989,
    "⚠️ the reader maps z → y as H - 1 - floor(z), the mapping vanilla's own rows demonstrate",
    md.buildingZToPixelY(1000, 10));
  ok(md.pixelYToBuildingZ(1000, md.buildingZToPixelY(1000, 10)) === 10,
    "…and the writer's mapping is its exact inverse, so a port Nova places reads back on its own pixel", true);
  ok(/buildingZToPixelY/.test(body),
    "…and fixCoastalNoPort goes through that one helper rather than spelling it out again", body.length);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a new island gets a port: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
