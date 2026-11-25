// #prereq-or-group-evaluated-as-and — 1,870 FOCUSES THE SIMULATOR COULD NEVER COMPLETE.
//
// In HOI4, several `focus =` entries inside ONE `prerequisite = { }` block are ALTERNATIVES (OR); separate
// blocks are all required (AND). This codebase already knew that: collectFocusPrerequisiteGroups parses the
// blocks into exactly that shape, and the comment beside the prerequisite WRITER states the rule outright —
// "Grouping several ids into one block (OR) is what `prerequisiteGroups` carries for content read off disk".
//
// arePrereqsCompleted was the caller that never adopted it. It ran a flat `.every()` over the FLATTENED id
// list, so an OR became an AND. Alternatives are usually mutually exclusive — that is the normal reason to
// offer them — so "all of them" could never be satisfied and the focus was locked forever.
//
// Measured over the shipping corpora: 1,826 of vanilla's 10,608 focuses carry a multi-id prerequisite block,
// and 884 of those are permanently unreachable under AND; Millennium Dawn 2,154 of 22,017 with 986
// unreachable. One MD focus requires one of TWELVE mutually exclusive alternatives.
//
// Three consumers were wrong together: Run Full Path skipped these focuses, clicking one answered
// "Prerequisites not completed, or mutually exclusive branch already active", and the canvas drew them
// permanently greyscale.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const CODE = stripJsComments(APP);

// ── Run the REAL evaluator, lifted from source ──────────────────────────────────────────────────────────
function lift(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    const c = CODE[i];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return null;
}

console.log("\n[the real evaluator] lifted out of app.js");
const src = lift("arePrereqsCompleted");
rec("arePrereqsCompleted was found", !!src, "not found");
let met = null;
if (src) {
  try {
    // eslint-disable-next-line no-new-func
    met = new Function(`${src}; return arePrereqsCompleted;`)();
  } catch (e) { rec("…and is runnable", false, e.message); }
}
rec("…and is callable", typeof met === "function", typeof met);
const can = (focus, done) => (typeof met === "function" ? met(focus, new Set(done)) : null);

console.log("\n[CONTROL] separate blocks are an AND and must stay one");
{
  // Two blocks, one id each: the writer emits exactly this for a chain of requirements.
  const f = { prerequisites: ["A", "B"], prerequisiteGroups: [["A"], ["B"]] };
  rec("neither parent done -> locked", can(f, []) === false, can(f, []));
  rec("only A done -> still locked", can(f, ["A"]) === false, can(f, ["A"]));
  // ⚠️ If this passes with only one parent, the fix has turned every AND into an OR — the opposite defect.
  rec("both done -> unlocked", can(f, ["A", "B"]) === true, can(f, ["A", "B"]));
}

console.log("\n[THE BUG] several ids in ONE block are alternatives");
{
  const f = { prerequisites: ["A", "B"], prerequisiteGroups: [["A", "B"]] };
  rec("neither done -> locked", can(f, []) === false, can(f, []));
  // Before the fix these were false: it required BOTH.
  rec("either alternative unlocks it (A)", can(f, ["A"]) === true, can(f, ["A"]));
  rec("either alternative unlocks it (B)", can(f, ["B"]) === true, can(f, ["B"]));
  rec("both done also unlocks it", can(f, ["A", "B"]) === true, can(f, ["A", "B"]));

  // The shape that made focuses PERMANENTLY unreachable: twelve mutually exclusive alternatives.
  const many = Array.from({ length: 12 }, (_, i) => `O${i}`);
  const g = { prerequisites: many, prerequisiteGroups: [many] };
  rec("one of twelve alternatives is enough", can(g, ["O7"]) === true, can(g, ["O7"]));
}

console.log("\n[mixed] an OR block AND a required block together");
{
  const f = { prerequisites: ["A", "B", "C"], prerequisiteGroups: [["A", "B"], ["C"]] };
  rec("an alternative alone is not enough — C is still required", can(f, ["A"]) === false, can(f, ["A"]));
  rec("C alone is not enough either", can(f, ["C"]) === false, can(f, ["C"]));
  rec("one alternative plus C unlocks it", can(f, ["B", "C"]) === true, can(f, ["B", "C"]));
}

console.log("\n[CONTROL] focuses with no prerequisites, and content authored this session");
{
  rec("no prerequisites -> unlocked", can({ prerequisites: [], prerequisiteGroups: [] }, []) === true, "locked");
  rec("undefined prerequisites -> unlocked", can({}, []) === true, "locked");
  // A focus added in the editor has no groups yet; the writer emits one block per parent, so the flat list
  // is the honest reading and must still behave as an AND.
  const fresh = { prerequisites: ["A", "B"] };
  rec("no groups yet: flat list is still an AND", can(fresh, ["A"]) === false, can(fresh, ["A"]));
  rec("…and satisfied when all are done", can(fresh, ["A", "B"]) === true, can(fresh, ["A", "B"]));
}

console.log("\n[#prereq-groups-go-stale] the groups are set ONCE, by the parser, and never updated");
{
  // Everything that edits prerequisites afterwards touches `focus.prerequisites` only — linking a parent
  // pushes to it (app.js ~4071), unlinking filters it (~4046), and the delete and rename passes rewrite it
  // (~17735, ~17859). None of them touch prerequisiteGroups. Reading the groups directly therefore means
  // reading what the file said when it was OPENED. The evaluator now derives them the way the WRITER does.

  // 1. A parent linked after load is in no group — it must still be required, not silently ignored.
  const linked = { prerequisites: ["A", "B"], prerequisiteGroups: [["A"]] };
  rec("a newly linked parent is still required", can(linked, ["A"]) === false, can(linked, ["A"]));
  rec("…and satisfied once it is done", can(linked, ["A", "B"]) === true, can(linked, ["A", "B"]));

  // 2. An unlinked parent lingers in its group — it must stop being required.
  const unlinked = { prerequisites: ["A"], prerequisiteGroups: [["A", "B"]] };
  rec("an unlinked parent stops being required", can(unlinked, ["A"]) === true, can(unlinked, ["A"]));

  // 3. THE BAD ONE. After a rename or a delete the group keeps an id nothing can ever complete. Under a
  //    raw read that focus is locked forever — exactly the failure this whole file exists to prevent.
  const renamed = { prerequisites: ["A_renamed"], prerequisiteGroups: [["A"]] };
  rec("a renamed parent does not lock the focus forever", can(renamed, ["A_renamed"]) === true, can(renamed, ["A_renamed"]));
  const deleted = { prerequisites: [], prerequisiteGroups: [["A"]] };
  rec("a deleted parent leaves the focus reachable", can(deleted, []) === true, can(deleted, []));

  // 4. An empty group must read as "no requirement" — vanilla ships 614 empty prerequisite/
  //    mutually_exclusive blocks, and Nova's own delete produces one when it removes the last entry.
  const emptyGroup = { prerequisites: ["A"], prerequisiteGroups: [[], ["A"]] };
  rec("an empty group is not an impossible requirement", can(emptyGroup, ["A"]) === true, can(emptyGroup, ["A"]));

  // 5. CONTROL — with groups that ARE current, nothing about the OR/AND reading changed.
  const fresh = { prerequisites: ["A", "B", "C"], prerequisiteGroups: [["A", "B"], ["C"]] };
  rec("a current OR group still needs only one of its ids", can(fresh, ["B", "C"]) === true, can(fresh, ["B", "C"]));
  rec("…and a current AND block is still required", can(fresh, ["A", "B"]) === false, can(fresh, ["A", "B"]));
}

console.log("\n[the parser already carried it] the grouping is not something this fix invented");
{
  rec("collectFocusPrerequisiteGroups exists", /function collectFocusPrerequisiteGroups\(/.test(CODE), "gone");
  rec("…and the parse attaches prerequisiteGroups to each focus", /prerequisiteGroups,/.test(CODE), "not attached");
  rec("…and the evaluator now reads them", /focus\.prerequisiteGroups/.test(CODE), "still ignored");
}

console.log("\n[the corpus] how many focuses this frees");
{
  const DIRS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus"],
  ];
  const brace = (t, o) => { let d = 0; for (let i = o; i < t.length; i++) { const c = t[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) return i; } } return -1; };
  let measured = false;
  for (const [label, dir] of DIRS) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    if (!files.length) continue;
    measured = true;
    let total = 0, withOr = 0;
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
      const re = /(^|\n)\s*(focus|shared_focus)\s*=\s*\{/g;
      let m;
      while ((m = re.exec(t))) {
        const o = t.indexOf("{", m.index);
        const c = brace(t, o);
        if (c === -1) break;
        const block = t.slice(o + 1, c);
        total++;
        const pre = /(^|\n)\s*prerequisites?\s*=\s*\{/g;
        let pm;
        while ((pm = pre.exec(block))) {
          const po = block.indexOf("{", pm.index);
          const pc = brace(block, po);
          if (pc === -1) break;
          const ids = [...block.slice(po, pc + 1).matchAll(/\bfocus\s*=\s*(\{?\s*([A-Za-z0-9_.:-]+)\s*\}?)/g)];
          if (ids.length > 1) { withOr++; break; }
          pre.lastIndex = pc + 1;
        }
        re.lastIndex = c + 1;
      }
    }
    console.log(`     ${label}: ${withOr} of ${total} focuses carry a multi-id prerequisite block`);
    rec(`${label}: OR groups are common in real content`, withOr > 100, { withOr, total });
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus check is skipped only because the games are absent", true, "skipped");
  }
}

console.log(`\n=== prereq or groups: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
