// A state cannot keep a dockyard once nothing in it touches the sea. HOI4 refuses the building. (This once said HOI4 then
// divides by zero; that launch's crash was the flag atlas — #a-naval-building-the-game-refuses-claims-no-crash.)
// #a-dockyard-with-no-coast
//
// THE OWNER'S ISLAND CRASH, isolated. Ten map tools were pointed at one mod; splitting them proved it:
//
//   Nova ISOLATE rest    nine tools, no island   -> LAUNCHED, and they played it for days
//   Nova ISOLATE island  four sea->land, a new state, a new country -> EXCEPTION_INT_DIVIDE_BY_ZERO
//
// Building the island out of four OCEAN provinces took the only sea neighbour away from ten provinces on
// the other side of the world. Two of those (351, 6300) carry a naval_base, and their states (131 and 121,
// Northern England and the Scottish Lowlands) carry a dockyard:
//
//   statehistory.cpp:306  Trying to set invalid province building "naval_base" to province #6300.
//   statehistory.cpp:270  Trying to set invalid state building "dockyard" to state #121.
//
// A dockyard builds ships. A state with one and nowhere to float them is a division waiting to happen.
//
// ⚠️ THE INVARIANT, measured — states carrying a naval-only building with NOT ONE province touching sea:
//     vanilla 0 · Novum Vexillum 0 · Rise of Nations 0 · Old World Blues 0 · Millennium Dawn 0 · R56 0
// Zero across every installed map, 2 in a mod whose only edit was making an island. Gated FATAL.
//
// ⚠️⚠️ IT EDITS STATES THE MOD DOES NOT OWN, ON PURPOSE. 121 and 131 are vanilla's and the mod never
// touched their files — but the mod's edit is what landlocked them, so the damage is the mod's and the
// repair materialises those two files into it. #inherited-problem-not-yours covers a problem the mod
// merely INHERITED; it does not cover one the mod caused at a distance.
//
// Removal is the honest repair: HOI4 has already refused both buildings, so nothing that works is lost.
//
// ⛔ #a-coast-taken-away-keeps-its-naval-buildings — …OF THE GAME, AND NOT OF THE MOD (review of the coast rows, CR-R3): the buildings are
// the modder's. Auto-fix now moves them with the coast — a naval base onto a coastal province of its state, a coastless state's dockyards
// and naval bases to its country's nearest coastal state (test-a-sea-made-land-keeps-the-naval-buildings-of-the-coast-it-took.js) — and
// deletes none. This fixture's world has no sea left at all once province 4 is land, so no state of AAA can take them: they stay where
// they are, Auto-fix says so, and the rule goes on reporting them, for the modder to decide.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── ⚠️ ANTI-CRY-WOLF FIRST — a FATAL rule must never fire on content that ships ──────────────────────
console.log("\n=== ⚠️ no shipping map keeps a naval building without a coast ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let checked = 0, statesSeen = 0;
    for (const [label, root] of roots) {
      const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      statesSeen += (m.states || []).length;
      // ⚠️ THROUGH THE VALIDATOR, NOT THE FIXER. fixNavalBuildingsWithoutCoast refuses the game
      // directory outright — correctly — so asking IT about vanilla returns an error, and an early cut of
      // this test read that refusal as a finding. validateMapBitmap is read-only and is what the user sees.
      const probs = md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: [] })
        .filter((p) => p.rule === "state_naval_building_without_coast");
      checked++;
      ok(probs.length === 0, `⭐⭐ ${label}: nothing reported`, probs.map((p) => String(p.message).slice(0, 110)));
    }
    ok(checked >= 2 && statesSeen > 4000,
      `${checked} shipping map(s), ${statesSeen} states examined — not a vacuous pass`, { checked, statesSeen });
  }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 16x4: provinces 1, 2 land (state 1); 3 land (state 2); 4 sea. State 1 has a dockyard and a naval_base on
// province 2. `raiseSea` turns province 4 into land, which landlocks state 1 completely.
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dockyard-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="DY"\nreplace_path="map"\nreplace_path="history/states"\n');
  const W = 16, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  // ⚠️ ORDER MATTERS: 1 | 2 | 4(sea) | 3, so province 2 genuinely borders the ocean and state 1 starts
  // COASTAL. An early cut laid them out 1|2|3|4, which left state 1 landlocked before the test began and
  // the "nothing is touched yet" control could never pass.
  const order = [1, 2, 4, 3];
  const provAtX = (x) => order[Math.min(3, Math.floor(x / 4))];
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;land;true;plains;1",
    "4;40;40;40;sea;false;ocean;0",
  ].join("\n") + "\n");
  // State 1 holds BOTH kinds: a state-level dockyard and a province-level naval_base, plus ordinary
  // buildings that must survive untouched.
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n' +
    '\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 4\n\t\t\tdockyard = 2\n\t\t\tindustrial_complex = 3\n' +
    '\t\t\t2 = {\n\t\t\t\tnaval_base = 5\n\t\t\t\tbunker = 1\n\t\t\t}\n\t\t}\n\t}\n}\n');
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"),
    'state = {\n\tid = 2\n\tname = "S2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  return d;
}
const NOGAME = path.join(os.tmpdir(), "__no_game_dockyard__");
const stateText = (d) => fs.readFileSync(path.join(d, "history", "states", "1.txt"), "utf8");

// ── ✅ while the coast is there, nothing is touched ──────────────────────────────────────────────────
console.log("\n=== ✅ a coastal state keeps its dockyard ===");
{
  const d = makeMod();
  const r = md.fixNavalBuildingsWithoutCoast({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], dryRun: true });
  ok(r.removed === 0, "⭐⭐ state 1 touches the sea, so its dockyard and naval base are left alone", r);
  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "state_naval_building_without_coast");
  ok(probs.length === 0, "…and the validator says nothing", probs.map((p) => String(p.message).slice(0, 90)));
}

// ── ⛔ take the coast away and both are reported ─────────────────────────────────────────────────────
console.log("\n=== ⛔ landlock the state and the crash-class appears ===");
{
  const d = makeMod();
  // Turn the ocean into land, exactly as building an island does.
  const csv = fs.readFileSync(path.join(d, "map", "definition.csv"), "utf8")
    .replace("4;40;40;40;sea;false;ocean;0", () => "4;40;40;40;land;true;plains;1");
  fs.writeFileSync(path.join(d, "map", "definition.csv"), csv);

  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "state_naval_building_without_coast");
  ok(probs.length === 1, "⭐⭐⭐ the validator reports it", probs.map((p) => p.rule));
  ok(probs.length === 1 && probs[0].severity === "error", "…as an ERROR", probs[0] && probs[0].severity);
  // ⛔ #a-refused-dockyard-is-not-a-save-gate — moved 2026-11-19 (B1-31): HOI4 refuses the building and plays on; precautionary only
  ok(isFatalRule("state_naval_building_without_coast") === false,
    "⭐⭐ …and it is NOT in the curated FATAL set: Save reports it and does not stop", false);
  ok(mapRuleLabel("state_naval_building_without_coast") !== "State naval building without coast",
    "…and it has a human label", mapRuleLabel("state_naval_building_without_coast"));
  // Moved with #a-naval-building-the-game-refuses-claims-no-crash: this asserted the message named a divide-by-zero. The
  // divide-by-zero of the island launches is the flag atlas (hoi4.exe 1.19.2 0x14122BA06, flagtextureatlas.cpp), and it struck a
  // launch with no refused building too; what the game is shown to do with a dockyard here is refuse it.
  ok(probs.length === 1 && /Trying to set invalid state building/.test(String(probs[0].message)) && !/divide/i.test(String(probs[0].message)),
    "…and the message names what the game does: it refuses the building", probs[0] && String(probs[0].message).slice(0, 160));

  // …and Auto-fix deletes neither kind (#a-coast-taken-away-keeps-its-naval-buildings): with no sea left anywhere, no state of AAA has a
  // coast to take them, so both stay, and the answer says each and why.
  const before = stateText(d);
  const fix = md.fixNavalBuildingsWithoutCoast({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const left = (fix.left || []).map((l) => `${l.stateId}:${l.key}${l.province != null ? "@" + l.province : ""}`).sort();
  ok(fix.removed === 0 && !(fix.states || []).length && JSON.stringify(left) === JSON.stringify(["1:dockyard", "1:naval_base@2"]) && (fix.left || []).every((l) => /no other state of AAA has a coast/.test(l.why || "")),
    "⭐⭐⭐ Auto-fix deletes neither the dockyard nor the naval base: no state of its country has a coast to take them, so it leaves both and says why", fix);

  const after = stateText(d);
  ok(after === before, "⭐⭐ …and writes nothing: the state file is byte for byte as it was", after.slice(after.indexOf("buildings"), after.indexOf("buildings") + 200));
  ok(/(^|[^A-Za-z0-9_])dockyard\s*=\s*2/.test(after) && /naval_base\s*=\s*5/.test(after), "…the dockyard and the naval base are still there", after.slice(after.indexOf("buildings"), after.indexOf("buildings") + 200));
  ok(/infrastructure\s*=\s*4/.test(after) && /industrial_complex\s*=\s*3/.test(after),
    "⚠️ …and so are the ordinary state buildings", after.slice(after.indexOf("buildings"), after.indexOf("buildings") + 200));
  ok(/bunker\s*=\s*1/.test(after),
    "⚠️ …and the bunker sharing the province block with the naval base", after.slice(after.indexOf("buildings"), after.indexOf("buildings") + 220));
  const o = (after.match(/\{/g) || []).length, c = (after.match(/\}/g) || []).length;
  ok(o === c, "…and the file is still balanced", { open: o, close: c });

  const rest = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "state_naval_building_without_coast");
  ok(rest.length === 1 && /deletes none/.test(String(rest[0].message)), "⭐⭐ …and the rule goes on reporting it, saying Auto-fix deletes none: the modder decides", rest.map((p) => String(p.message).slice(-200)));
}

// ── ⚠️ depth: a state-level key must not be confused with one inside a province block ────────────────
console.log("\n=== ⚠️ the remover only touches STATE-level keys ===");
{
  const block = 'state = {\n\tid = 9\n\thistory = {\n\t\tbuildings = {\n\t\t\tdockyard = 3\n\t\t\t77 = {\n\t\t\t\tdockyard = 9\n\t\t\t}\n\t\t}\n\t}\n}\n';
  const out = md.removeStateBuildingFromHistory(block, "dockyard");
  ok(/77 = \{[\s\S]*dockyard = 9/.test(out),
    "⭐⭐ a dockyard written inside a province block is left alone", out);
  ok(!/^\s*dockyard = 3/m.test(out), "…while the state-level one is removed", out);
  const o = (out.match(/\{/g) || []).length, c = (out.match(/\}/g) || []).length;
  ok(o === c, "…and the block stays balanced", { open: o, close: c });

  // a commented-out one is the modder's, not ours
  const commented = 'state = {\n\thistory = {\n\t\tbuildings = {\n\t\t\t#dockyard = 3\n\t\t\tinfrastructure = 2\n\t\t}\n\t}\n}\n';
  ok(md.removeStateBuildingFromHistory(commented, "dockyard") === commented,
    "⭐⭐ a commented-out dockyard is left exactly as written", true);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a dockyard with no coast: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
