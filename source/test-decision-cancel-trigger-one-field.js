// #cancel-trigger-has-two-boxes
//
// ONE FIELD, TWO BOXES, AND SAVE READ ONLY ONE OF THEM.
//
// cancel_trigger can be authored in two places in the Decisions maker: the mission block's "Cancelled when"
// (#decisionCancelTrigger, shown when the type is Mission) and the Advanced section's
// #decisionCancelTriggerAdv, which is on the page in both modes. Loading a decision fills BOTH from the same
// dec.cancelTrigger — decisions.js:552 and decisions.js:576 — so they look like one field, because they are.
//
// Save does not treat them as one. It reads the mission box in mission mode and the Advanced box otherwise,
// and each half of that is there for a reason: cancel_trigger is not mission-only (481 of vanilla's 603
// users are ordinary decisions), so the Advanced box has to work; and the mission box is the obvious one
// when it is on screen. The gap is a mission with the Advanced section open — both boxes visible, the user
// edits the Advanced one, Save reads the other, writes back the value that was loaded, and marks the editor
// clean. Confirmed on the running page: with the type set to Mission, BOTH boxes report
// getClientRects().length > 0.
//
// Mirroring them makes "which one does Save read" stop mattering.
//
// Verified in the running Decision Maker on Millennium Dawn:
//     type = Mission, type into the ADVANCED box   → mirrors into the mission box,
//                                                    and Save posts cancelTrigger with that text
//     type = Mission, type into the MISSION box    → mirrors into the Advanced box
//     type = Normal,  type into the ADVANCED box   → Save posts it, exactly as before
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
const JS = stripJsComments(fs.readFileSync(path.join(PUB, "decisions.js"), "utf8"));
const HTML = fs.readFileSync(path.join(PUB, "decisions.html"), "utf8");

console.log("\n[the premise] two boxes, both real, both loaded from the same value");
{
  rec("the mission box exists", /id="decisionCancelTrigger"/.test(HTML), "the mission box went");
  rec("the advanced box exists", /id="decisionCancelTriggerAdv"/.test(HTML), "the advanced box went");
  rec("loading fills the mission box", /getElementById\("decisionCancelTrigger"\)\.value = dec\.cancelTrigger/.test(JS), "the mission box is no longer loaded");
  rec("…and the advanced box, from the same field", /setAdv\("decisionCancelTriggerAdv", dec\.cancelTrigger\)/.test(JS), "they are no longer one field on load");
  // If Save ever reads just one of them for both modes, the mirror is redundant but harmless — still, the
  // note above would be stale, so say so.
  rec("Save still picks between them by mode", /isMission\s*\?\s*document\.getElementById\("decisionCancelTrigger"\)[\s\S]{0,80}advVal\("decisionCancelTriggerAdv"\)/.test(JS), "the save no longer branches — re-read the note");
}

console.log("\n[the fix] they mirror, so it does not matter which one is read");
{
  rec("a mirror is wired", /mirrorCancelTriggerBoxes/.test(JS), "the two boxes drifted apart again");
  // Capture from the OPENING paren of the IIFE, not from `function` — otherwise the trailing `})();` is
  // unbalanced and the vm below refuses to parse it.
  const fn = /\(function mirrorCancelTriggerBoxes\(\)[\s\S]*?\n  \}\)\(\);/.exec(JS);
  rec("…and it is findable", !!fn, "mirror function not found");
  const body = fn ? fn[0] : "";
  rec("…linking mission → advanced", /link\(mission, advanced\)/.test(body), body.slice(0, 300));
  rec("…and advanced → mission", /link\(advanced, mission\)/.test(body), body.slice(0, 300));
  rec("…on both input and change", /addEventListener\("input", copy\)/.test(body) && /addEventListener\("change", copy\)/.test(body), body.slice(0, 400));
  // ⚠️ Checking merely that the word `syncing` appears is not a check: the declaration and the assignments
  // survive removing it from the condition, so a back-out that deleted the guard changed nothing here.
  // Pin the condition, and then test the situation the guard exists for.
  rec("…and it cannot loop", /if \(syncing \|\| to\.value === from\.value\) return;/.test(body), "the re-entrancy guard is not in the condition");
  rec("…and does nothing when the boxes are absent", /if \(!mission \|\| !advanced\) return;/.test(body), "it would throw on a page without them");

  // RUN the mirror against stand-in textareas.
  const els = {};
  const mk = (id) => {
    const listeners = {};
    return { id, value: "", addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
             fire: (t) => (listeners[t] || []).forEach((f) => f()) };
  };
  els.decisionCancelTrigger = mk("decisionCancelTrigger");
  els.decisionCancelTriggerAdv = mk("decisionCancelTriggerAdv");
  const ctx = { document: { getElementById: (id) => els[id] || null } };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);

  els.decisionCancelTriggerAdv.value = "has_war = no";
  els.decisionCancelTriggerAdv.fire("input");
  rec("RUN: typing in the advanced box reaches the mission box", els.decisionCancelTrigger.value === "has_war = no", els.decisionCancelTrigger.value);

  els.decisionCancelTrigger.value = "has_civil_war = no";
  els.decisionCancelTrigger.fire("input");
  rec("RUN: …and the other way round", els.decisionCancelTriggerAdv.value === "has_civil_war = no", els.decisionCancelTriggerAdv.value);

  // An identical value must not bounce — the guard plus the equality check.
  let bounces = 0;
  els.decisionCancelTrigger.addEventListener("input", () => bounces++);
  els.decisionCancelTriggerAdv.value = "has_civil_war = no";
  els.decisionCancelTriggerAdv.fire("input");
  rec("RUN: an unchanged value does not bounce back", bounces === 0, bounces);

  // ⭐ THE SCENARIO THE GUARD IS FOR. Assigning .value does not fire input today, so the equality check
  // alone happens to be enough — which is exactly why the guard's removal was invisible. Model a page where
  // something DOES dispatch on assignment (a future handler, a framework, a devtools shim): without the
  // re-entrancy guard the two boxes call each other until the stack gives out.
  {
    const live = {};
    const mkLive = (id) => {
      const listeners = {};
      const el = { id, addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
                   fire: (t) => (listeners[t] || []).forEach((f) => f()) };
      let v = "";
      Object.defineProperty(el, "value", {
        get: () => v,
        set: (nv) => { v = nv; el.fire("input"); }, // assignment dispatches, as a live page one day might
      });
      return el;
    };
    live.decisionCancelTrigger = mkLive("decisionCancelTrigger");
    live.decisionCancelTriggerAdv = mkLive("decisionCancelTriggerAdv");
    const ctx2 = { document: { getElementById: (id) => live[id] || null } };
    vm.createContext(ctx2);
    vm.runInContext(body, ctx2);
    let threw = null;
    try { live.decisionCancelTriggerAdv.value = "has_war = no"; }
    catch (e) { threw = String(e && e.message).slice(0, 60); }
    rec("RUN: it terminates even when assigning .value dispatches input", threw === null, threw);
    rec("…and still mirrored the value across", live.decisionCancelTrigger.value === "has_war = no", live.decisionCancelTrigger.value);
  }
}

console.log("\n[CONTROL] the rest of the save is unchanged");
{
  rec("the decision save still posts one body", /fetch\("\/api\/decisions\/save"/.test(JS), "the save endpoint changed");
  rec("…and still reads the form fresh at click time", /getElementById\("decisionId"\)\.value/.test(JS), "the save stopped reading the live form");
  rec("the advanced section is still a <details>", /<details[^>]*id="decisionAdvanced"/.test(HTML), "the advanced container changed — re-check what is visible when");
  rec("the mission block is still mode-gated", /show\("cancelTriggerGroup", isMission\)/.test(JS), "the mission box visibility rule changed");
}

console.log(`\n=== decision cancel_trigger is one field: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
