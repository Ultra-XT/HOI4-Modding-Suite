// #year-flush-failure-swallowed
//
// A FAILED YEAR WRITE CLEARED ITS OWN DIRTY FLAG AND SAID NOTHING.
//
// saveAllChanges flushes three kinds of staged research-GUI work: the year labels, the section-label fonts,
// and the section-label texts. Two of them follow a rule the file states in full:
//
//     A FLUSH THAT FAILED STAYS QUEUED (#save-failure-retry). These loops used to clear the whole
//     pending map afterwards regardless of outcome, so a write that failed was announced once in an
//     alert and then thrown away — pressing Save again would not retry it, and the edit was gone.
//
// The third did not. It was:
//
//     if (yearsDirty) {
//       try { await applyYearsToGame({ silent: true }); } catch (_) { }
//       yearsDirty = false;
//     }
//
// `yearsDirty = false` outside the catch, and the catch empty. silent: true also suppresses every message
// applyYearsToGame would otherwise show. So a failed write to countrytechtreeview.gui cleared the flag,
// said nothing at all, and let Save report success — and pressing Save again would not retry it. The year
// design the user had just laid out was gone with no trace.
//
// Quieter still: with no research folder tab open, applyYearsToGame returns null WITHOUT writing and
// WITHOUT throwing, so the flag was cleared for a write that never started.
//
// This is the shape that keeps recurring in this codebase: the fix already existed next door, and one
// caller never adopted it.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));

// The block under test, taken from the source rather than retyped.
const START = "      let flushFailures = 0;";
const startAt = SRC.indexOf(START);
let BLOCK = "";
if (startAt !== -1) {
  const ifAt = SRC.indexOf("if (yearsDirty) {", startAt);
  let i = SRC.indexOf("{", ifAt), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) { BLOCK = SRC.slice(startAt, i + 1); break; } }
  }
}

console.log("\n[the contract] all three staged flushes obey the same rule");
{
  rec("the years block was found", BLOCK.length > 200, BLOCK.length);
  rec("the fonts flush keeps its failures", /stillPending\[key\] = p; flushFailures \+= 1;/.test(SRC), "the sibling this was modelled on regressed");
  rec("…and there are exactly two such loops (fonts, texts)", (SRC.match(/stillPending\[key\] = p; flushFailures \+= 1;/g) || []).length === 2,
    (SRC.match(/stillPending\[key\] = p; flushFailures \+= 1;/g) || []).length);
  rec("…and any failure re-marks the editor dirty and fails the save", /if \(flushFailures > 0\) \{ dirty = true; return false; \}/.test(SRC),
    "a failed flush would report success");

  // ⭐ THE DEFECT IN ONE LINE. The assignment has to be INSIDE the try, after the call that can throw.
  rec("the years block clears its flag inside the try", /const applied = await applyYearsToGame\(\{ silent: true \}\);[\s\S]{0,220}yearsDirty = false;[\s\S]{0,40}\} catch/.test(BLOCK), BLOCK.slice(0, 400));
  rec("…and its catch is no longer empty", !/catch \(_\) \{\s*\}/.test(BLOCK) && /flushFailures \+= 1;/.test(BLOCK), BLOCK.slice(-300));
  rec("…and it tells the user, since silent: true swallows every message inside applyYearsToGame",
    /nbAlert\("Couldn't write the year labels/.test(BLOCK), "it would fail in total silence");
  rec("…saying the tech changes DID save, which is true", /Your tech changes were saved\./.test(BLOCK), "it would read as a total failure");
  rec("…and that a retry is real", /press Save Changes again to retry/.test(BLOCK), "the user would not know to press it again");
  rec("a null return is treated as a write that did not happen", /if \(applied === null\) throw new Error/.test(BLOCK), "no folder open would clear the flag silently");
}

(async () => {

console.log("\n[RUN IT] the real block, over each thing applyYearsToGame can do");
{
  // Wrap the extracted block in a function so the real statements run against a controllable stand-in.
  async function runBlock(behaviour) {
    const alerts = [];
    const ctx = {
      yearsDirty: true,
      applyYearsToGame: async () => {
        if (behaviour === "throws") throw new Error("EACCES: countrytechtreeview.gui is read-only");
        if (behaviour === "null") return null;   // no folder tab open — it never even tried
        if (behaviour === "zero") return 0;      // nothing to write, which is a legitimate success
        return 7;                                // wrote 7 markers
      },
      nbAlert: (m) => alerts.push(String(m)),
      out: null,
    };
    vm.createContext(ctx);
    await vm.runInContext(`(async () => {\n${BLOCK}\nout = { flushFailures, yearsDirty };\n})()`, ctx);
    return { alerts, ...ctx.out };
  }

  {
    const r = await runBlock("ok");
    rec("RUN: a year write that lands clears the flag", r.yearsDirty === false, r);
    rec("RUN: …with no failure and no alert", r.flushFailures === 0 && r.alerts.length === 0, r);
  }
  {
    const r = await runBlock("zero");
    rec("RUN: nothing to write is a success, not a failure", r.yearsDirty === false && r.flushFailures === 0, r);
  }
  {
    // ⭐ THE REPORTED CASE.
    const r = await runBlock("throws");
    rec("RUN: a FAILED year write keeps the flag", r.yearsDirty === true, "the design is gone and cannot be retried");
    rec("RUN: …counts as a flush failure, so Save reports failure", r.flushFailures === 1, r);
    rec("RUN: …and says so", r.alerts.length === 1 && /year labels/.test(r.alerts[0]), r.alerts);
    rec("RUN: …naming the reason the server gave", /read-only/.test(r.alerts[0] || ""), r.alerts[0]);
  }
  {
    const r = await runBlock("null");
    rec("RUN: a write that never started keeps the flag too", r.yearsDirty === true, "the flag would clear for a write that did not happen");
    rec("RUN: …and is reported", r.flushFailures === 1 && /no research folder tab/.test(r.alerts[0] || ""), r.alerts);
  }
}

console.log("\n[CONTROL] the surrounding save still works");
{
  rec("the years are still applied from Save, not a separate button", /await applyYearsToGame\(\{ silent: true \}\)/.test(SRC), "the fold-into-Save behaviour went");
  rec("…and undo still restores the flag rather than arming a GUI write", /yearsDirty = yearsDirtyBefore;/.test(SRC), "Ctrl+Z would arm a year write again");
  rec("…and only the two real edit paths set it", (SRC.match(/^\s*yearsDirty = true;$/gm) || []).length === 2, (SRC.match(/^\s*yearsDirty = true;$/gm) || []).length);
  rec("flushFailures is declared exactly once", (SRC.match(/let flushFailures = 0;/g) || []).length === 1, (SRC.match(/let flushFailures = 0;/g) || []).length);
}

console.log(`\n=== year flush failure is not swallowed: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }

})();
