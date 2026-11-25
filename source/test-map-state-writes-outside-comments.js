// #state-writes-land-in-comments — SAVING A STATE WITHOUT CHANGING ANYTHING COMMENTED OUT ITS CLOSING BRACE.
//
// The state writers in map-data.js regexed over the raw block, which still contains comments, while the
// READER (parseStatesText) strips comments first. The two therefore disagreed about what the file says, and
// the disagreement was destructive rather than merely wrong.
//
// Vanilla's own 836-Bale.txt ships:
//
//     buildings = {
//         # infrastructure = 1
//     }
//
// The reader cannot see a commented key, so the map panel renders that building's input as 0 and — on a save
// where the user changed NOTHING — sends 0 back. `setBuildingsInHistory` then found `infrastructure = 1`
// INSIDE THE COMMENT, took the "level is 0, remove it" branch, and its removal regex consumes the trailing
// newline. That spliced the next line onto the `#`. The next line was the block's closing brace, so the brace
// was commented out and the file stopped parsing.
//
// Measured on a scratch copy of the vanilla corpus before the fix: 11 of the 21 affected states ended
// brace-unbalanced, 10 became unreadable to Nova's own parser, and /api/map/validate — which public/map.js
// runs immediately after every save precisely to catch a map-breaking write — reported ok with 0 problems.
//
// THE RULE: match outside comments, splice into the original. map-data.js already had maskComments() and
// this exact technique written down for #color-edits-a-comment, used by ONE caller. The nine state writers
// (and findBraceBlock underneath them) never adopted it — the dominant bug shape: the fix already exists
// next door and a caller never took it up.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

/** Brace balance ignoring comments — a HOI4 file whose balance is not 0 does not load. */
const braces = (t) => {
  let d = 0;
  for (const ch of String(t).replace(/#[^\n]*/g, "")) { if (ch === "{") d++; else if (ch === "}") d--; }
  return d;
};
const comments = (t) => (String(t).match(/#[^\n]*/g) || []).map((s) => s.trim());

// The five buildings the panel renders an input for. Every one is sent on every save.
const PANEL_BUILDINGS = ["infrastructure", "arms_factory", "industrial_complex", "air_base", "dockyard"];

/**
 * Exactly what public/map.js:1262 builds for a save where the user touched nothing: every field echoed back
 * from what the READER returned. Buildings the reader did not see render as 0 and are sent as 0 — that is
 * the whole trigger, and it is not a mistake by the user or by the panel.
 */
function panelEchoOf(st) {
  const buildings = {};
  for (const b of PANEL_BUILDINGS) buildings[b] = (st.buildings && st.buildings[b]) || 0;
  return {
    owner: st.owner || "",
    clearOwner: false,
    cores: (st.cores || []).slice(),
    manpower: String(st.manpower || 0),
    category: st.category || "",
    victoryPoints: (st.victoryPoints || []).map((v) => ({ province: v.province, value: v.value })),
    buildings,
    resources: Object.assign({}, st.resources || {}),
  };
}

// ── The fixtures. Each is a real vanilla shape with a comment in the place that bit. ────────────────────
const FIXTURES = [
  {
    name: "commented building above the closing brace (vanilla 836-Bale.txt)",
    key: "infrastructure",
    text: [
      "state = {", "\tid = 836", '\tname = "STATE_836"', "\tmanpower = 12345",
      "\tstate_category = rural", "", "\thistory = {", "\t\towner = ITA",
      "\t\tbuildings = {", "\t\t\t# infrastructure = 1", "\t\t}", "\t\tadd_core_of = ITA",
      "\t}", "", "\tprovinces = {", "\t\t3838 9999", "\t}", "}", "",
    ].join("\n"),
  },
  {
    name: "commented building beside a live one",
    key: "dockyard",
    text: [
      "state = {", "\tid = 837", '\tname = "STATE_837"', "\tmanpower = 500", "",
      "\thistory = {", "\t\towner = GER", "\t\tbuildings = {", "\t\t\tarms_factory = 2",
      "\t\t\t# dockyard = 4   # disabled for 1936", "\t\t\tair_base = 1", "\t\t}",
      "\t}", "", "\tprovinces = {", "\t\t100", "\t}", "}", "",
    ].join("\n"),
  },
  {
    name: "commented owner, core, manpower and resource",
    key: "owner",
    text: [
      "state = {", "\tid = 838", '\tname = "STATE_838"', "\t# manpower = 99999",
      "\tmanpower = 250", "\tresources = {", "\t\t# oil = 12", "\t\tsteel = 3", "\t}", "",
      "\thistory = {", "\t\t# owner = SOV", "\t\towner = POL", "\t\t# add_core_of = SOV",
      "\t\tadd_core_of = POL", "\t\t# victory_points = { 100 5 }", "\t\tvictory_points = { 101 3 }",
      "\t}", "", "\tprovinces = {", "\t\t100 101", "\t}", "}", "",
    ].join("\n"),
  },
  {
    name: "commented-out province building block",
    key: "province",
    text: [
      "state = {", "\tid = 839", '\tname = "STATE_839"', "\tmanpower = 10", "",
      "\thistory = {", "\t\towner = FRA", "\t\tbuildings = {",
      "\t\t\t# 100 = { bunker = 3 }", "\t\t\t101 = { naval_base = 2 }", "\t\t}",
      "\t}", "", "\tprovinces = {", "\t\t100 101", "\t}", "}", "",
    ].join("\n"),
  },
];

console.log("\n[the fixtures really have the property]  a control that PASSES may be measuring nothing");
for (const f of FIXTURES) {
  const st = md.parseStatesText(f.text, "x.txt")[0];
  f.state = st;
  rec(`${f.name}: parses`, !!st, "parseStatesText returned nothing");
  rec(`${f.name}: file starts brace-balanced`, braces(f.text) === 0, braces(f.text));
  rec(`${f.name}: has commented text to trip over`, comments(f.text).length > 0, "no comments in fixture");
}
{
  // The disagreement itself: the reader is blind to the commented keys, so the panel echoes 0/absent for
  // them. If this ever stops being true the fixtures no longer reproduce the bug.
  const s0 = FIXTURES[0].state, s2 = FIXTURES[2].state, s3 = FIXTURES[3].state;
  rec("the reader does not see a commented building", !(s0.buildings || {}).infrastructure, s0.buildings);
  rec("…nor a commented owner", s2.owner === "POL", s2.owner);
  rec("…nor a commented core", JSON.stringify(s2.cores) === '["POL"]', s2.cores);
  rec("…nor a commented manpower", s2.manpower === 250, s2.manpower);
  rec("…nor a commented resource", !(s2.resources || {}).oil, s2.resources);
  rec("…nor a commented VP", (s2.victoryPoints || []).length === 1, s2.victoryPoints);
  rec("…nor a commented province block", !(s3.provinceBuildings || {})[100], s3.provinceBuildings);
}

console.log("\n[THE BUG] a save that changes nothing must change nothing");
for (const f of FIXTURES) {
  const out = md.setStateFieldsInBlock(f.text, panelEchoOf(f.state));
  const bAfter = braces(out);
  rec(`${f.name}: still brace-balanced`, bAfter === 0, `balance ${braces(f.text)} -> ${bAfter}`);
  rec(`${f.name}: every comment survives`, comments(out).join("|") === comments(f.text).join("|"), {
    before: comments(f.text), after: comments(out),
  });
  // The strongest form: a no-op save is byte-identical. Nothing the user did asked for a single byte to move.
  rec(`${f.name}: byte-identical`, out === f.text, firstDiff(f.text, out));
  // …and it still reads back the same, which is what the game and Nova both depend on.
  const re = md.parseStatesText(out, "x.txt")[0];
  rec(`${f.name}: re-reads identically`, JSON.stringify(re) === JSON.stringify(f.state), {
    before: f.state, after: re,
  });
}

console.log("\n[the province-building writer] same rule, its own entry point");
{
  const f = FIXTURES[3];
  // Editing province 101 must not be confused by the commented block for province 100…
  let out = md.setProvinceBuildingInHistory(f.text, 101, "naval_base", 5);
  rec("edits the live province block", /101\s*=\s*\{[^{}]*naval_base = 5/.test(out), firstDiff(f.text, out));
  rec("…leaves the commented block alone", /#\s*100 = \{ bunker = 3 \}/.test(out), "the comment was edited");
  rec("…and stays balanced", braces(out) === 0, braces(out));
  // …and setting the COMMENTED province's building must add a real one, not edit the comment.
  out = md.setProvinceBuildingInHistory(f.text, 100, "bunker", 4);
  rec("a commented province gains a REAL block", /(^|\n)[^#\n]*100\s*=\s*\{[^{}]*bunker = 4/.test(out), firstDiff(f.text, out));
  rec("…the comment is still a comment", /#\s*100 = \{ bunker = 3 \}/.test(out), "the comment was rewritten");
  rec("…and stays balanced", braces(out) === 0, braces(out));
}

console.log("\n[POSITIVE CONTROL] the writers must still write — this is not a fix that just stops working");
{
  const f = FIXTURES[1];
  const fields = panelEchoOf(f.state);
  fields.buildings.arms_factory = 7;      // change a live value
  fields.buildings.industrial_complex = 3; // add one that is not there at all
  fields.buildings.air_base = 0;           // remove a live one
  fields.owner = "SOV";
  fields.manpower = "4321";
  fields.cores = ["GER", "SOV"];
  fields.resources = { steel: 6 };
  fields.victoryPoints = [{ province: 100, value: 9 }];
  const out = md.setStateFieldsInBlock(f.text, fields);
  const st = md.parseStatesText(out, "x.txt")[0];
  rec("a changed building lands", st.buildings.arms_factory === 7, st.buildings);
  rec("a new building is added", st.buildings.industrial_complex === 3, st.buildings);
  rec("a zeroed building is removed", !st.buildings.air_base, st.buildings);
  rec("owner changes", st.owner === "SOV", st.owner);
  rec("manpower changes", st.manpower === 4321, st.manpower);
  rec("cores change", JSON.stringify(st.cores) === '["GER","SOV"]', st.cores);
  rec("resources change", st.resources.steel === 6, st.resources);
  rec("victory points change", st.victoryPoints[0] && st.victoryPoints[0].value === 9, st.victoryPoints);
  rec("the commented dockyard is untouched", /#\s*dockyard = 4/.test(out), "the comment was edited");
  rec("…and no dockyard leaked into the real block", !st.buildings.dockyard, st.buildings);
  rec("…and the file is still balanced", braces(out) === 0, braces(out));
}

console.log("\n[the block finder] a commented block must not be mistaken for the real one");
{
  // findBraceBlock is what every writer above uses to locate `history` / `buildings` / `resources`. It is
  // exercised through the writers here: a commented-out buildings block shadowing the real one.
  const text = [
    "state = {", "\tid = 900", '\tname = "STATE_900"', "", "\thistory = {",
    "\t\towner = ENG",
    "\t\t# buildings = {",
    "\t\t#\tinfrastructure = 9",
    "\t\t# }",
    "\t\tbuildings = {", "\t\t\tarms_factory = 1", "\t\t}",
    "\t}", "", "\tprovinces = {", "\t\t1", "\t}", "}", "",
  ].join("\n");
  const st = md.parseStatesText(text, "x.txt")[0];
  rec("fixture: the reader sees only the live block", st.buildings.arms_factory === 1 && !st.buildings.infrastructure, st.buildings);
  const fields = panelEchoOf(st);
  fields.buildings.arms_factory = 4;
  const out = md.setStateFieldsInBlock(text, fields);
  const re = md.parseStatesText(out, "x.txt")[0];
  rec("the edit lands in the LIVE block", re.buildings.arms_factory === 4, re.buildings);
  rec("the commented block is untouched", /#\s*buildings = \{/.test(out) && /#\s*infrastructure = 9/.test(out), "commented block was rewritten");
  rec("the file is still balanced", braces(out) === 0, braces(out));
}

console.log("\n[the rule, in the source] every state writer matches outside comments");
{
  // ⭐ Strip comments first: this fix's own explanation quotes the expressions it removed, so grepping the
  // raw file finds the SENTENCE and reports the bug as still present.
  const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const fn = (name) => {
    const at = CODE.indexOf(`function ${name}(`);
    if (at === -1) return "";
    const nxt = CODE.indexOf("\nfunction ", at + 1);
    return CODE.slice(at, nxt === -1 ? CODE.length : nxt);
  };
  rec("the helpers exist", /function replaceOutsideComments\(/.test(CODE) && /function testOutsideComments\(/.test(CODE) && /function replaceAllOutsideComments\(/.test(CODE), "a helper is missing");
  rec("findBraceBlock scans the mask", /maskComments\(text\)/.test(fn("findBraceBlock")), fn("findBraceBlock").slice(0, 200));
  for (const name of [
    "setOwnerInStateBlock", "removeOwnerFromStateBlock", "upsertStateScalar", "setCoresInHistory",
    "setVictoryPointsInHistory", "setBuildingsInHistory", "setProvinceBuildingInHistory", "setResourcesInBlock",
  ]) {
    const body = fn(name);
    // #a-victory-point-edit-keeps-its-comments-and-place — the victory-point writer splices pairs it reads off maskComments (the
    // mask the *OutsideComments helpers are built on) instead of stripping every block with a regex, so that is its helper.
    // #a-core-edit-keeps-the-dated-and-conditional-cores — and so does the core writer now: it splices the add_core_of lines it reads off
    // maskComments instead of stripping every one with replaceAllOutsideComments.
    const aware = (name === "setVictoryPointsInHistory" || name === "setCoresInHistory") ? /OutsideComments\(|maskComments\(/ : /OutsideComments\(/;
    rec(`${name} uses the comment-aware helpers`, aware.test(body), body ? "no helper call" : "function not found");
  }
}

function firstDiff(a, b) {
  const al = String(a).split("\n"), bl = String(b).split("\n");
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}: ${JSON.stringify(al[i])} -> ${JSON.stringify(bl[i])}`;
  }
  return "identical";
}

console.log(`\n=== map state writes outside comments: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
