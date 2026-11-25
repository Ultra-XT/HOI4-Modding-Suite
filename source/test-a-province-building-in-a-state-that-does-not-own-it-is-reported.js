// A state history that sets a province building on a province the state does not list is reported, and Auto-fix clears
// the undated one without touching a dated one. #a-province-building-in-a-state-that-does-not-own-it
//
// hoi4.exe logs "State Error: Trying to set province building in state that doesn't own it. Province #… in state #…"
// and skips the building — a naval base or bunker the map says is there and the game does not have. The usual cause is
// a province that moved state without its `<pid> = { … }` block.
//
// It is the sibling of vp_not_in_state (a victory point on a province the state does not own), and nothing reported it:
// empty_state_with_content only looks at states with no provinces at all. Measured on the six shipping maps, undated
// province building blocks for a province the state does not list: Rise of Nations 1 (1094-Natuna Island.txt, province
// 4399, which state 627 holds), vanilla / Millennium Dawn / Road to 56 / Old World Blues / Novum Vexillum 0 — out of
// 579 / 758 / 632 / 373 / 812 / 527 undated province blocks. Rise of Nations launches, so this is a WARNING.
//
// fixOrphanedStateBuildings already removed these on Auto-fix; it read the FIRST `buildings = {` in history, though,
// which in a state whose only buildings block is dated is the dated one — and dated content is the modder's call, as
// dated_naval_building_without_coast already decided.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-provbldg-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel, mapRuleFixHint } = require("./public/map-rule-labels.js");
const RULE = "province_building_not_in_state";
const NOGAME = path.join(ROOT, "no-game");
const RON = "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968";
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const STATES = {
  // state 1 lists 1 and 2 and sets a naval base on 3, which state 2 holds
  "1-A.txt": "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\t3 = { naval_base = 2 }\n\t\t}\n\t}\n}\n",
  // state 2's block is for its own province: fine
  "2-B.txt": "state = {\n\tid = 2\n\tname = \"STATE_2\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tbuildings = {\n\t\t\t4 = { bunker = 1 }\n\t\t}\n\t}\n}\n",
  // state 3's only buildings block is DATED and names province 6, which state 4 holds: out of scope, and not Auto-fix's to delete
  "3-C.txt": "state = {\n\tid = 3\n\tname = \"STATE_3\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 5 }\n\thistory = {\n\t\towner = CCC\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t6 = { naval_base = 1 }\n\t\t\t}\n\t\t}\n\t}\n}\n",
  "4-D.txt": "state = {\n\tid = 4\n\tname = \"STATE_4\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 6 }\n\thistory = {\n\t\towner = DDD\n\t}\n}\n",
};
function writeRoot(root, { descriptor = null, states = STATES, map = true } = {}) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  if (descriptor) mk("descriptor.mod", descriptor);
  if (map) {
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let p = 1; p <= 6; p++) rows.push(`${p};${p * 20};0;0;land;true;plains;1`);
    mk("map/definition.csv", rows.join("\n") + "\n");
  }
  for (const [f, body] of Object.entries(states)) mk("history/states/" + f, body);
  return root;
}
const reported = (modRoot, gameRoot) => M.validateMapModel(M.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false })).filter((p) => p.rule === RULE);

try {
  console.log("1. The mod's own stray block is reported — a warning, quoting the engine");
  {
    const mod = writeRoot(path.join(ROOT, "mod"), { descriptor: 'name="PB"\nreplace_path="history/states"\nreplace_path="map"\n' });
    const p = reported(mod, NOGAME);
    rec("⭐⭐⭐ reported once", p.length === 1, p.map((x) => [x.stateId, x.province]));
    const it = p[0] || {};
    rec("⭐⭐ …for province 3 in state 1", it.stateId === 1 && it.province === 3, it);
    rec("…naming the state that does hold it", /state 2\b/.test(String(it.message)), String(it.message).slice(0, 240));
    rec("⭐ …quoting what HOI4 logs", /Trying to set province building in state that doesn't own it/.test(String(it.message)), String(it.message).slice(0, 300));
    rec("⭐ …as a warning", it.severity === "warning", it.severity);
    rec("⭐⭐ …not in the fatal set: Rise of Nations ships one and launches", isFatalRule(RULE) === false);
    rec("…with a label a modder can read", mapRuleLabel(RULE) !== "Province building not in state", mapRuleLabel(RULE));
    rec("…and a fix hint", mapRuleFixHint(RULE).length > 15, mapRuleFixHint(RULE));
    rec("⚠️ a block for a province the state DOES list is not reported", !p.some((x) => x.stateId === 2));
    rec("⚠️ a DATED block is not reported by this rule", !p.some((x) => x.stateId === 3 || x.province === 6), p);

    console.log("\n2. Auto-fix clears it, and leaves the dated block and the state's own buildings alone");
    const r = M.autoFixMap({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    rec("Auto-fix ran", r && r.ok === true, r && r.error);
    rec("⭐⭐ the rule is satisfied", reported(mod, NOGAME).length === 0, reported(mod, NOGAME));
    const a = fs.readFileSync(path.join(mod, "history", "states", "1-A.txt"), "utf8");
    rec("⭐ state 1 no longer sets a building on province 3", !/(?<![0-9])3\s*=\s*\{/.test(a), a);
    rec("…and keeps its own infrastructure", /infrastructure\s*=\s*2/.test(a), a);
    rec("⚠️ state 2's own province block is untouched", /4\s*=\s*\{\s*bunker\s*=\s*1\s*\}/.test(fs.readFileSync(path.join(mod, "history", "states", "2-B.txt"), "utf8")));
    const c = fs.readFileSync(path.join(mod, "history", "states", "3-C.txt"), "utf8");
    rec("⭐⭐ the DATED block in state 3 is left exactly as written", c === STATES["3-C.txt"], c);
  }

  console.log("\n3. ⛔ An add-on is told only about what it could have caused");
  {
    const base = writeRoot(path.join(ROOT, "base"));
    const addon = writeRoot(path.join(ROOT, "addon"), { descriptor: 'name="Addon"\n', states: {}, map: false });
    rec("⭐⭐ an add-on shipping no state file is not told about the base's stray block", reported(addon, base).length === 0, reported(addon, base));
    const holder = writeRoot(path.join(ROOT, "holder"), { descriptor: 'name="Holder"\n', states: { "2-B.txt": STATES["2-B.txt"] }, map: false });
    rec("⭐ an add-on shipping the state that HOLDS the province is told — it could have moved it", reported(holder, base).length === 1, reported(holder, base));
  }

  console.log("\n4. ⭐ The shipping map that has one reports exactly that one");
  if (!fs.existsSync(path.join(RON, "history", "states", "1094-Natuna Island.txt"))) console.log("  ..   (Rise of Nations is not installed)");
  else {
    const p = reported(RON, GAME);
    rec("⭐⭐ Rise of Nations: exactly one — state 1094, province 4399", p.length === 1 && p[0].stateId === 1094 && p[0].province === 4399, p.map((x) => [x.stateId, x.province]));
    if (fs.existsSync(path.join(GAME, "history", "states"))) rec("⚠️ the base game: none", reported(GAME, GAME).length === 0, reported(GAME, GAME).map((x) => [x.stateId, x.province]));
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== a province building in a state that does not own it: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
}
