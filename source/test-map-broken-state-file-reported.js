// #broken-state-file-reads-as-healthy — BREAKING A STATE FILE MADE MOD HEALTH GO QUIET.
//
// Every rule in the map validator reasons about the states it could READ. A state file whose braces stop
// matching yields no states at all, so it contributed nothing to reason about and the panel reported a clean
// bill of health — for the one file the user most needed telling about.
//
// Measured, before the fix, through the real /api/map/validate that public/map.js runs right after every save:
//
//     healthy one-state mod            -> ok, 4 problems
//     same mod, that file broken       -> ok, 0 problems
//
// The panel was anti-correlated with the health of the files it was checking. That is the sibling of the
// "a rule that only ever goes quiet is indistinguishable from a dead rule" pattern: here the breakage itself
// is what silences the rules, so the worse the mod gets the healthier it looks.
//
// This matters because the state writers could produce exactly that file (#state-writes-land-in-comments: a
// no-edit save commented out a closing brace), and validate — the safety net placed directly after the save
// for this purpose — said nothing.
//
// CRY-WOLF CONTROL: the rule is measured against real shipping corpora, because a validator that fires on
// files the game loads fine is worse than one that stays quiet. 7,495 real state files (vanilla + every
// installed workshop mod) produced 0 flags when the rule was written; this test re-measures vanilla's.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brokenstate-"));
function modWith(files) {
  const dir = fs.mkdtempSync(path.join(ROOT, "m-"));
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, "history", "states", f), t);
  return dir;
}
const rules = (dir) => md.findStateFileConflicts(dir).map((p) => p.rule);
const broke = (rs) => rs.filter((r) => /state_file_unbalanced_braces|state_file_unreadable/.test(r));

const GOOD = [
  "state = {", "\tid = 9001", '\tname = "STATE_9001"', "\tmanpower = 100", "\tstate_category = rural",
  "\thistory = {", "\t\towner = ENG", "\t\tbuildings = {", "\t\t\tinfrastructure = 3", "\t\t}", "\t}",
  "\tprovinces = {", "\t\t900001 900002", "\t}", "}", "",
].join("\n");

console.log("\n[control] a healthy file is not reported");
{
  const rs = rules(modWith({ "9001-Test.txt": GOOD }));
  rec("fixture: the healthy file really parses", md.parseStatesText(GOOD, "9001-Test.txt").length === 1, "fixture does not parse");
  rec("no breakage reported for a good file", broke(rs).length === 0, rs);
}

console.log("\n[THE BUG] a file the game cannot read must be named");
const BREAKAGES = [
  {
    name: "closing brace swallowed by a comment (what a state save produced)",
    text: GOOD.replace("\t\t\tinfrastructure = 3\n\t\t}", "\t\t\t# infrastructure = 3\n\t\t#\t\t}"),
    rule: "state_file_unbalanced_braces",
  },
  { name: "file truncated mid-block", text: GOOD.slice(0, GOOD.length - 30), rule: "state_file_unbalanced_braces" },
  { name: "a stray closing brace", text: GOOD + "}\n", rule: "state_file_unbalanced_braces" },
  {
    name: "the whole state block commented out but a brace left live",
    text: GOOD.split("\n").map((l, i) => (i === 0 ? l : "# " + l)).join("\n") + "}\n",
    rule: "state_file_unbalanced_braces",
  },
];
for (const b of BREAKAGES) {
  // The fixture must genuinely be broken, or this test certifies nothing.
  const parsed = md.parseStatesText(b.text, "9001-Test.txt").length;
  const bal = (() => { let d = 0, m = 0; for (const c of b.text.replace(/#[^\n]*/g, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < m) m = d; } } return { d, m }; })();
  rec(`${b.name}: fixture is genuinely broken`, bal.d !== 0 || bal.m < 0 || parsed === 0, { bal, parsed });
  const rs = rules(modWith({ "9001-Test.txt": b.text }));
  rec(`${b.name}: reported`, rs.includes(b.rule), rs);
  const p = md.findStateFileConflicts(modWith({ "9001-Test.txt": b.text })).find((x) => x.rule === b.rule);
  rec(`${b.name}: names the file`, !!p && /9001-Test\.txt/.test(String(p.message)) && p.file === "9001-Test.txt", p && p.message);
  rec(`${b.name}: is an error, not a warning`, !!p && p.severity === "error", p && p.severity);
  // ⭐ validator-crywolf: say what is true, and do not promise a crash.
  // #a-map-message-matches-what-the-engine-checks — a MISSING brace is not "cannot read": Clausewitz closes a block
  // left open at end of file (vanilla's common/ideas/SOV.txt is one "}" short and loads), so the file loads and the
  // lines after the gap land inside the wrong block. An EXTRA brace keeps its old wording — nobody has measured it.
  const said = String(p && p.message);
  const truthful = bal.d > 0
    ? /end of the file/i.test(said) && !/cannot read it|will not load/i.test(said)
    : /will not load|cannot read|skip/i.test(said);
  rec(`${b.name}: message says what actually happens`, !!p && truthful, p && p.message);
}

console.log("\n[CRY-WOLF CONTROL] things that are fine must stay quiet");
{
  const quiet = [
    ["an empty file", ""],
    ["a whitespace-only file", "\n\n\t\n"],
    ["a comments-only file", "# nothing here yet\n# reserved for the Balkans rework\n"],
    ["a fully commented-out state", GOOD.split("\n").map((l) => "# " + l).join("\n") + "\n"],
    ["braces inside comments only", "state = {\n\tid = 9002\n\tstate_category = rural\n\t# buildings = { x = 1 }\n\tprovinces = { 1 }\n}\n"],
    ["a state with a nested victory_points block", GOOD.replace("\t\towner = ENG", "\t\towner = ENG\n\t\tvictory_points = { 900001 5 }")],
    ["CRLF line endings", GOOD.replace(/\n/g, "\r\n")],
  ];
  for (const [label, text] of quiet) {
    const rs = broke(rules(modWith({ "9001-Test.txt": text })));
    rec(`${label}: stays quiet`, rs.length === 0, rs);
  }
}

console.log("\n[CRY-WOLF CONTROL] the real corpus — a rule that fires on shipping files is worse than none");
{
  const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/states";
  let files = [];
  try { files = fs.readdirSync(V).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) {}
  if (!files.length) {
    // ⚠️ A skip reads as a pass. Say so loudly rather than letting the count imply coverage.
    console.log("  SKIP the vanilla install is not present — the corpus control did NOT run");
  } else {
    // Read only. Nothing here writes, copies, renames or deletes anything under the install.
    const flagged = [];
    for (const f of files) {
      let txt = "";
      try { txt = fs.readFileSync(path.join(V, f), "utf8"); } catch (_) { continue; }
      const bare = txt.replace(/#[^\n]*/g, "");
      let d = 0, m = 0;
      for (const c of bare) { if (c === "{") d++; else if (c === "}") { d--; if (d < m) m = d; } }
      const looksLikeState = /(^|[^A-Za-z0-9_])state\s*=\s*\{/.test(bare);
      if (d !== 0 || m < 0 || (looksLikeState && md.parseStatesText(txt, f).length === 0)) flagged.push(f);
    }
    rec(`vanilla's ${files.length} state files are read`, files.length > 500, files.length);
    rec("…and none is flagged", flagged.length === 0, flagged.slice(0, 8));
  }
}

console.log("\n[the seam] the rule reaches the panel through the same call validate makes");
{
  // validate composes findStateFileConflicts(activeModRoot) into `problems`. A rule that exists but is never
  // composed in is a dead rule — the mistake this whole file is about.
  const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const at = SRV.indexOf('app.get("/api/map/validate"');
  const body = at === -1 ? "" : SRV.slice(at, at + 2600);
  rec("validate calls findStateFileConflicts", /findStateFileConflicts\(/.test(body), "not called");
  rec("…and folds its result into problems", /\.\.\.fileConflicts/.test(body), "result discarded");
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}

console.log(`\n=== broken state file reported: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
