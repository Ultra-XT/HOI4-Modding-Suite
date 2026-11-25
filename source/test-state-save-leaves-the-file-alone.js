// #no-edit-save-rewrites-authored-values + #edit-hits-the-wrong-duplicate
//
// Two findings from round-tripping every REAL state file — 7,495 of them, across vanilla and five installed
// workshop mods — rather than the hand-made fixtures the earlier tests used.
//
// ── 1. A save that changed nothing edited 1,623 of those 7,495 files ────────────────────────────────
// Four separate causes, each the same shape: the panel echoes back what the reader saw, and the writer could
// not tell an echo from an instruction.
//
//     infrastructure = 0   deleted        the panel sends 0 for every building the state lacks, and the
//                                         writer read that as "remove it" even when the file said 0 itself
//     aluminium = 10.000   → 10           Number("10.000") is 10; writing it back reformatted the author
//     state_category="city" → =city       both parse the same; rewriting one as the other is pure churn
//     victory_points {…}   collapsed      the "did it change?" test matched /-?\d+/ on `3878 30.0`, got
//                                         THREE numbers, never matched, and rewrote every time
//     history = { }        minted         128 Old World Blues states have no history block; the writers
//                                         called ensureHistoryBlock before asking if there was anything
//                                         to put in it
//
// After: 1 file of 7,495 changes, and that one is deliberate — manpower is floored at 1 because a state with
// 0 manpower is unplayable ("State has no people living in it").
//
// ── 2. Editing a duplicated key saved successfully and changed nothing ──────────────────────────────
// 13 of the 7,495 files state the same building or resource twice in one block. Millennium Dawn's
// 1006-Ash-Sharqiyah.txt has `arms_factory = 3` and later `arms_factory = 2`. Clausewitz takes the LAST and
// so does parseStatesText — but the writers edited the FIRST. So the editor showed 2, the user typed 9, the
// writer set the first entry to 9, the trailing `= 2` still won, and the game kept 2.
//
// The fix writes to the last STATE-LEVEL entry: a buildings block also holds province sub-blocks like
// `12702 = { naval_base = 8 }`, and "the last match" could otherwise land inside one of those and edit a
// province's building instead of the state's.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const PANEL = ["infrastructure", "arms_factory", "industrial_complex", "air_base", "dockyard"];
function panelEcho(st) {
  const buildings = {};
  for (const b of PANEL) buildings[b] = (st.buildings && st.buildings[b]) || 0;
  return { owner: st.owner || "", clearOwner: false, cores: (st.cores || []).slice(),
    manpower: String(st.manpower || 0), category: st.category || "",
    victoryPoints: (st.victoryPoints || []).map((v) => ({ province: v.province, value: v.value })),
    buildings, resources: Object.assign({}, st.resources || {}) };
}
const braces = (t) => { let d = 0; for (const c of String(t).replace(/#[^\n]*/g, "")) { if (c === "{") d++; else if (c === "}") d--; } return d; };

console.log("\n[the five churn causes, each as a fixture]");
{
  const cases = [
    // ⚠️ Every fixture states its manpower, as every real state file does. Without it the deliberate
    // floor-at-1 adds a `manpower = 1` line and the fixture measures that instead of what it is about.
    ["a building the file explicitly states as 0 is kept",
     "state = {\n\tid = 1\n\tmanpower = 100\n\tstate_category = rural\n\thistory = {\n\t\tbuildings = {\n\t\t\tinfrastructure = 0\n\t\t}\n\t}\n\tprovinces = { 1 }\n}\n"],
    ["a resource written as x.000 is not reformatted",
     "state = {\n\tid = 2\n\tmanpower = 100\n\tstate_category = rural\n\tresources = {\n\t\taluminium = 10.000\n\t}\n\tprovinces = { 1 }\n}\n"],
    ["a quoted state_category keeps its quotes",
     "state = {\n\tid = 3\n\tmanpower = 100\n\tstate_category=\"city\"\n\tprovinces = { 1 }\n}\n"],
    ["a multi-line victory_points block is not collapsed",
     "state = {\n\tid = 4\n\tmanpower = 100\n\tstate_category = rural\n\thistory = {\n\t\tvictory_points = {\n\t\t\t3878 30.0\n\t\t}\n\t}\n\tprovinces = { 1 }\n}\n"],
    ["a state with no history block does not gain an empty one",
     "state={\n\tid=5\n\tname=\"STATE_5\"\n\tprovinces={\n\t\t1\n\t}\n\tmanpower=100\n\tstate_category=rural\n}\n"],
  ];
  for (const [label, text] of cases) {
    const st = md.parseStatesText(text, "x.txt")[0];
    rec(`fixture parses: ${label}`, !!st, "did not parse");
    if (!st) continue;
    const out = md.setStateFieldsInBlock(text, panelEcho(st));
    rec(label, out === text, (() => {
      const a = text.split("\n"), b = out.split("\n");
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `line ${i + 1}: ${JSON.stringify(a[i])} -> ${JSON.stringify(b[i])}`;
      return "differs";
    })());
  }
}

console.log("\n[THE SILENT NO-OP] editing a duplicated key must take effect");
{
  // Exactly Millennium Dawn's shape: the same building twice, plus a province sub-block after it.
  const text = "state = {\n\tid = 6\n\tmanpower = 100\n\tstate_category = rural\n\thistory = {\n\t\tbuildings = {\n"
    + "\t\t\tarms_factory = 3\n\t\t\tdockyard = 2\n\t\t\tarms_factory = 2\n"
    + "\t\t\t12702 = {\n\t\t\t\tnaval_base = 8\n\t\t\t}\n\t\t}\n\t}\n\tprovinces = { 1 }\n}\n";
  const st = md.parseStatesText(text, "x.txt")[0];
  rec("the reader takes the LAST duplicate", st.buildings.arms_factory === 2, st.buildings);
  const f = panelEcho(st);
  f.buildings.arms_factory = 9;
  const out = md.setStateFieldsInBlock(text, f);
  const re = md.parseStatesText(out, "x.txt")[0];
  rec("the edit actually takes effect", re.buildings.arms_factory === 9, re.buildings);
  // …and it must not have edited the province's building instead.
  rec("the province sub-block is untouched", /12702 = \{\s*naval_base = 8/.test(out.replace(/\s+/g, " ").replace(/ \{ /g, " { ")), out);
  rec("the file still parses", braces(out) === 0, braces(out));

  // Clearing it must remove EVERY copy — leaving one behind would resurrect the building.
  const f0 = panelEcho(st);
  f0.buildings.arms_factory = 0;
  const cleared = md.parseStatesText(md.setStateFieldsInBlock(text, f0), "x.txt")[0];
  rec("clearing it removes every duplicate", !cleared.buildings.arms_factory, cleared.buildings);
}

console.log("\n[THE CORPUS] every real state file, round-tripped");
{
  const roots = [["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"]];
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  try {
    for (const d of fs.readdirSync(WS)) {
      const p = path.join(WS, d, "history", "states");
      if (fs.existsSync(p)) roots.push([`ws/${d}`, path.join(WS, d)]);
    }
  } catch (_) {}

  let files = 0, drift = 0, broke = 0, lost = 0;
  const examples = [];
  for (const [label, root] of roots) {
    const dir = path.join(root, "history", "states");
    let list = [];
    try { list = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
    for (const f of list) {
      let txt = "";
      try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      const st = md.parseStatesText(txt, f)[0];
      if (!st) continue;
      files++;
      const out = md.setStateFieldsInBlock(txt, panelEcho(st));
      if (out !== txt) { drift++; if (examples.length < 5) examples.push(`${label}/${f}`); }
      if (braces(out) !== braces(txt)) broke++;
      // a REAL edit must land and take nothing else with it
      const fields = panelEcho(st);
      fields.manpower = String((st.manpower || 0) + 1234);
      const re2 = md.parseStatesText(md.setStateFieldsInBlock(txt, fields), f)[0];
      if (!re2 || JSON.stringify(re2.buildings) !== JSON.stringify(st.buildings)
          || JSON.stringify(re2.cores) !== JSON.stringify(st.cores) || (re2.owner || "") !== (st.owner || "")) lost++;
    }
  }
  if (!files) {
    // ⚠️ A skip reads as a pass. Say so rather than letting the count imply coverage.
    console.log("  SKIP no shipping corpus on this machine — the corpus checks did NOT run");
  } else {
    rec(`a real corpus was read (${files} state files)`, files > 1000, files);
    rec("no file's brace balance moves", broke === 0, `${broke} broke`);
    rec("no real edit loses other content", lost === 0, `${lost} lost something`);
    // One file legitimately changes: manpower is floored at 1 because 0 makes a state unplayable.
    rec("at most the deliberate manpower floor changes on a no-edit save", drift <= 1, `${drift} files drifted: ${examples.join(", ")}`);
  }
}

console.log(`\n=== state save leaves the file alone: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
