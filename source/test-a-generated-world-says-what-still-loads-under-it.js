// ⛔ #the-world-underneath-a-generated-one — A MOD IS AN OVERLAY, AND THE VALIDATOR NEVER SAID SO.
//
// history/states MERGES file by file. Unless descriptor.mod says replace_path="history/states", every state
// file in the base game (and in any mod depended on) keeps loading underneath the mod's own, with its owner,
// its cores, its victory points and its buildings — standing on whatever the mod's definition.csv now says
// those provinces are.
//
// MEASURED on the owner's own flow (Nova's wizard, provinces.bmp copied in, Delete map, Generate land,
// Auto-fix ×3 until it reported nothing left to do) against the real base game:
//
//   after Generate land   1,913 states load — 832 the mod's, 1,081 vanilla's;  3,163 provinces in two states
//   after Auto-fix ×3     1,425 states load —   854 the mod's,   571 vanilla's;      0 provinces in two states
//
// Auto-fix resolves every double claim and stops. 571 files the mod does not own were still loading, 363 of
// them owning nothing but ocean, and /api/map/validate reported 8 problems, 0 fatal. blankSurvivors already
// computes this and is wired to exactly one button (Delete map); after that click nothing in Nova mentions it
// again. The owner launched that world and said "its still the same world but full of holes".
//
// 🚫 The fix is NOT "also replace map/strategicregions". All five shipping map mods declare it, and all five
// ship 222-298 region files of their own; Nova generates none. Declaring it on the generated world takes the
// loaded regions from 304 to 0 and leaves all 4,651 land provinces in no strategic region. Delete map and
// Generate land keep the province partition (ids and pixels), so the regions below still fit: 1 land province
// in no region, before and after.
//
// Run: node test-a-generated-world-says-what-still-loads-under-it.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const RULE = "inherited_states_still_load";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-underneath-"));
const w = (root, rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };

// ── the base game beneath every case: three land provinces, one state standing on two of them ──
const game = path.join(tmp, "game");
w(game, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;0\n2;20;20;20;land;false;plains;0\n3;30;30;30;land;false;plains;0\n");
w(game, "history/states/1-Base.txt", 'state = { id = 1 name = "Base" provinces = { 1 2 } history = { owner = GER } }');

/** Build a mod beside it and return the problems of one rule. `opts` is what varies between the cases. */
function probe(name, { replacePath = false, ownDefinition = true, shipsTheBaseFile = false, baseDrowns = false } = {}) {
  const mod = path.join(tmp, name);
  w(mod, "descriptor.mod", 'name="' + name + '"\n' + (replacePath ? 'replace_path="history/states"\n' : ""));
  // The mod's OWN world: province 1 retyped to sea. That is the water this rule is about.
  if (ownDefinition) w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n2;20;20;20;land;false;plains;0\n3;30;30;30;land;false;plains;0\n");
  if (shipsTheBaseFile) w(mod, "history/states/1-Base.txt", 'state = { id = 1 name = "Base" provinces = { 1 2 } history = { owner = GER } }');
  w(mod, "history/states/50-Mine.txt", 'state = { id = 50 name = "Mine" provinces = { 3 } history = { owner = FRA } }');
  // The control for "the water was already there": the BASE game types province 1 as sea and the mod ships
  // no definition.csv at all, so nothing the mod wrote drowned anything.
  const g = baseDrowns ? path.join(tmp, "game-wet") : game;
  if (baseDrowns && !fs.existsSync(g)) {
    w(g, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n2;20;20;20;land;false;plains;0\n3;30;30;30;land;false;plains;0\n");
    w(g, "history/states/1-Base.txt", 'state = { id = 1 name = "Base" provinces = { 1 2 } history = { owner = GER } }');
  }
  const model = md.buildMapModel({ modRoot: mod, gameRoot: g, dependencyRoots: [] });
  return { model, hits: (md.validateMapModel(model) || []).filter((p) => p.rule === RULE) };
}

console.log("=== a generated world says what still loads under it ===");

// ── 1. THE CASE THAT BIT THE OWNER ───────────────────────────────────────────────────────────────
const plain = probe("plain");
ok(plain.model.states.length === 2, "the base state loads alongside the mod's — a mod is an overlay", plain.model.states.map((s) => s.id));
ok(plain.hits.length === 1, "the rule reports the inherited state standing on the mod's water", plain.hits.length);
const hit = plain.hits[0] || {};
ok(hit.total === 1 && Array.isArray(hit.states) && hit.states[0] === 1, "it names the inherited state, not the mod's own", { total: hit.total, states: hit.states });
ok(hit.severity === "error", "severity is error", hit.severity);
// Derived from the model, never typed: exactly the provinces the mod retyped under a state it does not own.
const drownedUnderBase = (plain.model.states.find((s) => s.id === 1) || {}).provinces
  .filter((p) => (plain.model.provinces.find((q) => q.id === +p) || {}).type !== "land").length;
ok(new RegExp("standing on " + drownedUnderBase + " province").test(String(hit.message)),
  "the message's province count is the one the model actually shows", { drownedUnderBase, message: String(hit.message).slice(0, 90) });

// ── 2. IT NAMES THE ONE LINE THAT REMOVES THEM, AND THE FILE TO PUT IT IN ─────────────────────────
ok(String(hit.message).includes('replace_path="history/states"'), "the message names the descriptor line");
ok(String(hit.message).includes("descriptor.mod"), "the message names the file that line goes in");
// ⚠️ The advice must NOT be "replace the strategic regions too". Nova generates no region files, and the
// province partition survives Delete map + Generate land, so that line would empty the region list outright.
ok(/Do NOT add replace_path="map\/strategicregions"/.test(String(hit.message)),
  "the message warns AGAINST replacing a folder the mod does not populate");

// ── 3. THE GATES — none of these may fire, or the rule cries wolf on shipping content ─────────────
ok(probe("replaced", { replacePath: true }).hits.length === 0,
  "silent once the mod declares replace_path=\"history/states\" — nothing inherited is left to load");
const owns = probe("owns-it", { shipsTheBaseFile: true });
ok(owns.hits.length === 0, "silent when the mod ships that state file itself — then it is the mod's to fix", owns.hits.length);
const wet = probe("base-was-wet", { ownDefinition: false, baseDrowns: true });
ok(wet.model.states.length === 2 && wet.hits.length === 0,
  "silent when the base game typed that province as water and the mod ships no definition.csv — #inherited-problem-not-yours", wet.hits.length);

// ── 4. THE PANEL MUST NOT SHOW A RAW snake_case NAME ──────────────────────────────────────────────
ok(!!labels.LABELS[RULE], "the rule has a curated friendly label", labels.mapRuleLabel(RULE));
// Not in the curated fatal set: this world LOADS and PLAYS. It is simply not the world the modder built.
ok(labels.isFatalRule(RULE) === false, "it is NOT treated as guaranteed-fatal — the game loads this map");

// ── 5. THE ANTI-CRY-WOLF CONTROL, against the real base game when it is installed ─────────────────
// Vanilla edited directly has no layer beneath it, so the rule can have nothing to say about it.
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  const m = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  ok((md.validateMapModel(m) || []).filter((p) => p.rule === RULE).length === 0,
    "the base game, opened as the mod, reports nothing — there is no layer below it");
} else {
  ok(true, "base game not installed here — the fixture gates above still ran");
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
