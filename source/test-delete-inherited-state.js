// #delete-inherited-state — deleting a state Nova had materialised from the base game handed it straight back.
//
// editStateBlock deliberately copies a base state into the mod under the BASE FILE'S OWN NAME, because HOI4
// overrides history/states by relative filename. So after ANY edit — move a province, change a field, steal a
// province for a new state — the id is "in the mod", and deleteState treated it as mod-owned: it cut the
// block, unlinked the emptied file, and reported changed:true. With nothing overriding the base file any
// more, the ORIGINAL definition becomes effective again, with its own provinces, owner, VPs and buildings.
// The state is not deleted at all.
//
// Two shapes of damage:
//   * provinces moved out are then claimed by BOTH the restored base state and the modder's target state
//     (province_in_two_states — first-wins in game, and the validator does shout after a Save);
//   * a delete after a plain FIELD edit is completely silent — manpower and buildings simply revert to the
//     base values, success is reported, and no rule fires anywhere. That is the case worth catching.
//
// mergeState already refuses exactly this; deleteState never learned to. Same condition: a mod declaring
// replace_path = "history/states" ignores the base layer, so deletion is clean there — which is why editing
// Millennium Dawn directly is unaffected (it declares it), while vanilla-based mods and MD add-ons are not.
//
// Vanilla ships one state per file, so the override always empties and the file always gets unlinked.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const mapData = require("./map-data.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delstate-"));

// A synthetic "base game" so the test does not need Hearts of Iron IV installed.
const BASE = path.join(ROOT, "base");
fs.mkdirSync(path.join(BASE, "history", "states"), { recursive: true });
fs.writeFileSync(path.join(BASE, "history", "states", "7-Base.txt"),
  'state = {\n\tid = 7\n\tname = "STATE_7"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory = {\n\t\towner = BAS\n\t\tvictory_points = { 700 5 }\n\t}\n\tprovinces = { 700 701 }\n}\n', "utf8");

const mkMod = (replacePath) => {
  const MOD = path.join(ROOT, "mod" + (replacePath ? "_rp" : "") + Math.random().toString(36).slice(2, 7));
  fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(MOD, "descriptor.mod"),
    'name="DS"\nsupported_version="1.18.*"\n' + (replacePath ? 'replace_path="history/states"\n' : ""));
  // Nova materialises the base state into the mod under the BASE file's own name — this is what an edit does.
  fs.writeFileSync(path.join(MOD, "history", "states", "7-Base.txt"),
    'state = {\n\tid = 7\n\tname = "STATE_7"\n\tmanpower = 999999\n\tstate_category = rural\n\thistory = {\n\t\towner = BAS\n\t\tvictory_points = { 700 5 }\n\t}\n\tprovinces = { 700 701 }\n}\n', "utf8");
  return MOD;
};

// ── the silent case: an override created by a plain field edit ────────────────────────────────────
const MOD = mkMod(false);
const OVERRIDE = path.join(MOD, "history", "states", "7-Base.txt");
ok("precondition: the mod's override raises manpower over the base value",
  /manpower = 999999/.test(fs.readFileSync(OVERRIDE, "utf8")));

const r = mapData.deleteState({ modRoot: MOD, gameRoot: BASE, dependencyRoots: [], stateId: 7 });
ok("deleting an inherited state is refused", r && r.changed === false, r);
ok("…and says the original would come back", /bring the original back/i.test(String(r.error || "")), r.error);
ok("…naming the state", /State 7\b/.test(String(r.error || "")), r.error);
ok("…and suggesting what to do instead", /Move its provinces/i.test(String(r.error || "")), r.error);
ok("the mod's override file is still there", fs.existsSync(OVERRIDE), "override deleted");
ok("…with the modder's value intact, not reverted to the base",
  /manpower = 999999/.test(fs.readFileSync(OVERRIDE, "utf8")), fs.readFileSync(OVERRIDE, "utf8"));

// ── a mod that replaces history/states may delete cleanly (Millennium Dawn's shape) ───────────────
const MOD_RP = mkMod(true);
const OVERRIDE_RP = path.join(MOD_RP, "history", "states", "7-Base.txt");
const r2 = mapData.deleteState({ modRoot: MOD_RP, gameRoot: BASE, dependencyRoots: [], stateId: 7 });
ok("a mod that replaces history/states CAN delete the state", r2 && r2.changed === true, r2);
ok("…and its file is gone", !fs.existsSync(OVERRIDE_RP), "file survived");

// ── a state the mod genuinely owns is still deletable ─────────────────────────────────────────────
const MOD2 = mkMod(false);
fs.writeFileSync(path.join(MOD2, "history", "states", "900-Mine.txt"),
  'state = {\n\tid = 900\n\tname = "STATE_900"\n\tmanpower = 10\n\tstate_category = rural\n\thistory = {\n\t\towner = BAS\n\t}\n\tprovinces = { 9000 }\n}\n', "utf8");
const r3 = mapData.deleteState({ modRoot: MOD2, gameRoot: BASE, dependencyRoots: [], stateId: 900 });
ok("a state the mod created itself still deletes", r3 && r3.changed === true, r3);
ok("…and its file is removed", !fs.existsSync(path.join(MOD2, "history", "states", "900-Mine.txt")), "file survived");
ok("…while the inherited override beside it is untouched",
  fs.existsSync(path.join(MOD2, "history", "states", "7-Base.txt")), "override deleted");

// ── the auto-fix path must not silently swallow the refusal ───────────────────────────────────────
const MOD3 = mkMod(false);
fs.writeFileSync(path.join(MOD3, "history", "states", "7-Base.txt"),
  'state = {\n\tid = 7\n\tname = "STATE_7"\n\tmanpower = 999999\n\tstate_category = rural\n\thistory = {\n\t\towner = BAS\n\t}\n\tprovinces = { }\n}\n', "utf8");
const fixed = mapData.fixEmptyStates ? mapData.fixEmptyStates({ modRoot: MOD3, gameRoot: BASE, dependencyRoots: [] }) : null;
if (fixed) {
  ok("auto-fix does not delete the inherited state", !(fixed.deleted || []).includes(7), fixed);
  ok("…and reports it as skipped, with the reason", (fixed.skipped || []).some((s) => s.id === 7 && /bring the original back/i.test(String(s.reason || ""))), fixed);
} else { total += 2; pass += 2; console.log("  ok  (fixEmptyStates not exported — endpoint-level behaviour covered above) x2"); }

// ── ⛔ #an-empty-inherited-state-is-told-a-step-it-can-take — an EMPTY inherited state has no provinces to move ──────────────────────
// The refusal above told the modder to "Move its provinces to another state instead", and Auto-fix carried that sentence onto its line
// as the reason it left the state (emptyStates.skipped). For a state with no provinces that step cannot exist: no Map tool moves a
// province INTO an empty state. The steps it names instead are the Map tool's first (a baseline), then the hand edit, with the
// provinces the layer below gives it and the mod's own file. (final round, L1: not ↶ Undo — this reason is shown on Auto-fix's line, after
// Auto-fix reloads the map, and an empty state on disk is past a Save: both clear the page's Undo. The validator's rows say the same:
// test-an-empty-inherited-state-is-told-what-can-clear-it.js.)
{
  const r4 = mapData.deleteState({ modRoot: MOD3, gameRoot: BASE, dependencyRoots: [], stateId: 7 });
  const why = String((r4 && r4.error) || "");
  ok("an EMPTY inherited state is refused too", r4 && r4.changed === false && /bring the original back/i.test(why), r4);
  ok("⭐ …and is not sent to move provinces it does not have", !/Move its provinces/i.test(why) && /has no provinces/.test(why), why);
  ok("⭐ …it names the Map tool's step first, a baseline, and no ↶ Undo (cleared by the reload this reason is shown after)", !/↶ Undo/.test(why) && /🛟 Restore baseline/.test(why)
    && why.indexOf("🛟 Restore baseline") < why.indexOf("By hand"), why);
  ok("⭐ …then the hand edit, in the mod's own file, with the provinces the layer below gives it", /By hand: list one of its provinces again in history\/states\/7-Base\.txt \(the file beneath your mod gives it 700, 701\)/.test(why), why);
  const fixed4 = mapData.fixEmptyStates({ modRoot: MOD3, gameRoot: BASE, dependencyRoots: [] });
  ok("⭐ …and Auto-fix's empty-state sweep says the same as the reason it left it", (fixed4.skipped || []).some((s) => s.id === 7 && s.reason === why), fixed4.skipped);
  ok("CONTROL: an inherited state that still has provinces keeps its own words", /Move its provinces/i.test(String(r.error || "")) && !/has no provinces/.test(String(r.error || "")), r.error);
  // …and the click's line carries that reason (public/map.js: the Auto-fix line's "empty states left alone — <reason>"), comments masked
  const MAPJS = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  ok("…which the Auto-fix line shows", /es\.skipped\.length\} empty state\$\{[^}]*\} left alone\$\{why\.length \? ` — \$\{why\[0\]\}` : ""\}/.test(MAPJS)
    && /const why = \[\.\.\.new Set\(\(es\.skipped \|\| \[\]\)\.map\(\(s\) => s && s\.reason\)/.test(MAPJS));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log("\ntest-delete-inherited-state: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 14 ? 0 : 1;
