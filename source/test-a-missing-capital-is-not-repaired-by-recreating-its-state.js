// #recreating-a-capital-state-above-the-highest-id-is-not-a-repair
//
// capital_state_missing closed with "Recreate that state, or change the capital", as if those were two equal
// choices. They are two only when the id sits in a HOLE under the highest state the map has. A state id ABOVE
// the highest cannot be given back on its own: state_id_gap fires for exactly that, and it is the STRONGER of
// the two fatals — capital_state_missing is FATAL "untested" (country.cpp refuses the capital and returns),
// state_id_gap is FATAL "refuses-to-load", quoting hoi4.exe's own MAP_ERROR and the failed map load.
//
// 📊 MEASURED with validateMapModel itself, and this file re-measures it rather than asserting a sentence:
// a world of states 1..5 whose AFA points at state 908 reports capital_state_missing. Re-create state 908 as
// the old message said → state_id_gap, refuses-to-load. Re-point AFA at a state that exists → nothing at all.
// On the owner's own built world (own the map → Delete map → Generate land 35% → Auto-fix ×2, highest state
// 832) all 46 missing capital ids are above 832 and none sits in a hole, so the repair named first was the
// wrong one for every single one of them.
//
// …and whose files they are, which is what decides who can do anything about it: all 46 come from base-game
// country files and the mod ships none, so "change the capital" was addressed to someone who cannot — a
// history/countries file replaces the same-named file below it whole, exactly as the stranded-fleet rule says
// of history/units.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let checks = 0;
const fails = [];
const tmps = [];
const rec = (name, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400)));
  if (!ok) fails.push(name);
};
const rules = (model) => (md.validateMapModel(model) || []).map((p) => p.rule);
const capMsg = (model) => String(((md.validateMapModel(model) || []).find((p) => p.rule === "capital_state_missing") || {}).message || "");
// ⭐ AFA OWNS STATE 5. capital_state_missing gates Save only for a country that owns land (the 2026-09-23 split,
// #a-refused-capital-is-what-two-shipping-maps-already-do); a landless AFA now raises capital_state_missing_no_land
// and this file is about the fatal half's message. Before the split AFA owned nothing here.
const AFA_STATE = 5;
const states = (ids) => ids.map((id) => ({ id, name: "S" + id, provinces: [id * 10], owner: id === AFA_STATE ? "AFA" : "JOR" }));

try {
  // ── 1. THE MEASUREMENT THE MESSAGE RESTS ON, re-run here so it cannot go stale ────────────────────────
  console.log("=== what each of the two repairs actually does ===");
  const LIVE = [1, 2, 3, 4, 5], AWAY = 908;
  const broken = { capitals: { AFA: AWAY, JOR: 1 }, states: states(LIVE) };
  rec("THE CONTROL: a capital above the highest state id is capital_state_missing", rules(broken).includes("capital_state_missing"), rules(broken));
  rec("…and that rule is FATAL \"untested\"", labels.fatalOutcome("capital_state_missing") === "untested", labels.fatalOutcome("capital_state_missing"));

  const recreated = rules({ capitals: { AFA: AWAY, JOR: 1 }, states: states([...LIVE, AWAY]) });
  rec("⭐⭐⭐ re-creating that state opens a state_id_gap", recreated.includes("state_id_gap"), recreated);
  rec("⭐⭐⭐ …which is the STRONGER fatal: it makes HOI4 refuse to load the map",
    labels.fatalOutcome("state_id_gap") === "refuses-to-load", labels.fatalOutcome("state_id_gap"));

  // …at a state AFA itself owns: pointing it at one of JOR's would be capital_state_owned_by_other instead.
  const repointed = rules({ capitals: { AFA: AFA_STATE, JOR: 1 }, states: states(LIVE) });
  rec("⭐⭐ re-pointing the capital at a state that exists leaves nothing at all", repointed.length === 0, repointed);

  // ── 2. SO THE MESSAGE MUST NOT OFFER THE FIRST ONE THERE ──────────────────────────────────────────────
  console.log("\n=== the message above the highest id ===");
  const above = capMsg(broken);
  rec("⭐⭐⭐ it does not tell the modder to recreate the state", !/\brecreate\b/i.test(above), above);
  rec("⭐⭐ it says the id is above the highest the map has, and names it", above.includes("above " + Math.max(...LIVE)), above);
  rec("⭐⭐ it names the gap that would open instead", /state_id_gap/.test(above), above);
  rec("⭐⭐ …attributed, as an untested rule's message must be", /\bwiki\b/i.test(above), above);
  rec("⭐⭐ and it offers the repair that measured clean", /point that capital at a state this map has/i.test(above), above);

  // ── 3. …AND MUST STILL OFFER IT WHERE IT IS RIGHT ─────────────────────────────────────────────────────
  console.log("\n=== the message for a hole under the highest id ===");
  // A modder who deleted state 3 of 1..5 really should put state 3 back.
  const hole = { capitals: { AFA: 3, JOR: 1 }, states: states([1, 2, 4, 5]) };
  const holeMsg = capMsg(hole);
  rec("THE CONTROL: a capital in a hole is still reported", holeMsg.length > 0, rules(hole));
  rec("⭐⭐⭐ …and recreating the state IS offered there", /\brecreate\b/i.test(holeMsg), holeMsg);
  rec("⭐ it does not claim that id is above the highest", !/above \d+, the highest/.test(holeMsg), holeMsg);

  // ── 4. WHOSE COUNTRY FILE IT IS ───────────────────────────────────────────────────────────────────────
  console.log("\n=== whose country file sets the capital ===");
  const mk = (which) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "novacap-" + which + "-"));
    tmps.push(root);
    fs.mkdirSync(path.join(root, "history", "countries"), { recursive: true });
    fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
    return root;
  };
  const game = mk("game"), mod = mk("mod");
  // State 2 is AFA's, so AFA owns land in these file-based fixtures too and keeps raising the FATAL rule.
  const fileOwner = (id) => (id === 2 ? "AFA" : "JOR");
  for (const id of [1, 2]) {
    fs.writeFileSync(path.join(game, "history", "states", id + "-S.txt"),
      `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id * 10} }\n\thistory = {\n\t\towner = ${fileOwner(id)}\n\t}\n}\n`);
  }
  // The base game points AFA at a state that will not exist. The mod ships no country file of its own.
  fs.writeFileSync(path.join(game, "history", "countries", "AFA - Afar.txt"), "capital = 908\n");
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1"\nname="cap"\nreplace_path="history/states"\n');
  for (const id of [1, 2]) {
    fs.writeFileSync(path.join(mod, "history", "states", id + "-M.txt"),
      `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id * 10} }\n\thistory = {\n\t\towner = ${fileOwner(id)}\n\t}\n}\n`);
  }
  const inheritedMsg = capMsg(md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] }));
  rec("THE CONTROL: the inherited capital is reported", inheritedMsg.length > 0, inheritedMsg.slice(0, 120));
  rec("⭐⭐⭐ it says the country file is not the mod's", /not your mod's/.test(inheritedMsg), inheritedMsg);
  rec("⭐⭐ …and names the layer that supplies it", /the base game supplies/i.test(inheritedMsg), inheritedMsg);
  rec("⭐⭐ it says what shipping one costs — the file below is replaced whole",
    /replaces the same-named file below it whole/.test(inheritedMsg), inheritedMsg);
  rec("⭐⭐ …and names the descriptor line that stops them loading",
    /replace_path="history\/countries"/.test(inheritedMsg) && inheritedMsg.includes(path.join(mod, "descriptor.mod")), inheritedMsg);

  // The mod's OWN country file must not be blamed on a layer below.
  fs.writeFileSync(path.join(mod, "history", "countries", "AFA - Afar.txt"), "capital = 907\n");
  const ownMsg = capMsg(md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] }));
  rec("THE CONTROL: the mod's own broken capital is still reported", ownMsg.length > 0, ownMsg.slice(0, 120));
  rec("⭐⭐⭐ a capital the mod set itself is not called somebody else's", !/not your mod's/.test(ownMsg), ownMsg);
  rec("⭐ …and it is not told to add replace_path for its own file", !/replace_path/.test(ownMsg), ownMsg);

  // And a model with no mod at all (the base game browsed directly) claims nothing about ownership.
  rec("⭐ a model with no mod root attributes nothing", !/not your mod's/.test(above), above);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n=== a missing capital is not repaired by recreating its state: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
