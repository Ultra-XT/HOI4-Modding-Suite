// #role-checkbox-cannot-turn-off — the second save in a session
//
// A ROLE COULD BE ADDED AND THEN NEVER REMOVED AGAIN WITHOUT RELOADING THE CHARACTER.
//
// The server cannot tell "the user un-ticked this role" from "the maker doesn't model this role", so the
// form sends what it was LOADED with and rolesRemovedByForm compares the two. That record, loadedRoles, was
// set when a character was loaded and never refreshed after a save — even though the two lines directly
// above it in save() re-anchor editingFile and loadedToken for precisely the same reason, with a comment
// explaining precisely this failure ("a SECOND rename in the same session still sent the ORIGINAL token").
//
// So within one session, without reloading the character:
//   • tick Advisor → Save (added) → untick Advisor → Save. `was.advisor` is still false, so nothing is
//     dropped and the advisor block cannot be removed at all.
//   • switch a commander corps_commander → field_marshal → Save → navy_leader → Save. `was.generalType` is
//     still corps_commander, so field_marshal is never dropped and the character ends up recruitable as
//     BOTH — the exact harm rolesRemovedByForm exists to prevent, in its own words.
//
// Measured in the running Character maker on ABK_kirilli_bechvaya, with the save endpoint stubbed so the
// payloads could be read. Before: save 1 sent roleAdvisor true / loadedRoles.advisor false; save 2 sent
// roleAdvisor FALSE and loadedRoles.advisor STILL FALSE. After: save 2 sends loadedRoles.advisor true, and
// the fourth save sends loadedRoles.generalType "field_marshal" — so both drops happen.
//
// This runs the real derivations out of both files, so the client's two anchors and the server's rule are
// checked against each other rather than against a description of them.
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
const CH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));
const SV = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

// Both places the client decides "what roles was this form loaded with". There must be exactly two, and
// they must agree — one on load, one after a save commits.
const anchors = [...CH.matchAll(/loadedRoles = \{\s*leader: !!(\w+)\.roleLeader,\s*advisor: !!\1\.roleAdvisor,\s*generalType: \1\.roleGeneral \? \(\1\.generalType \|\| "corps_commander"\) : null,\s*\}/g)];

console.log("\n[the client anchors the record twice, the same way]");
{
  rec("the load path records what the character had", CH.indexOf("loadedRoles = {") !== -1, "the record is gone entirely");
  rec("…and the save path re-anchors it", anchors.length === 2, `${anchors.length} derivation(s) found — expected load + save`);
  // replaceAll, not replace: the variable name appears three times in each derivation, and swapping only the
  // first left `c.roleAdvisor` against `body.roleAdvisor` and reported a difference that was not one.
  const normalise = (a) => a[0].split(a[1] + ".").join("X.").replace(/\s+/g, " ");
  rec("…identically, field for field", anchors.length === 2 && normalise(anchors[0]) === normalise(anchors[1]),
    anchors.map(normalise).map((s) => s.slice(0, 140)));
  // The re-anchor has to sit AFTER the response was accepted, next to the other two.
  const okAt = CH.indexOf('if (!res.ok || data.error) throw new Error(data.error || "Save failed");');
  const tokenAt = CH.indexOf("loadedToken = body.token;");
  const rolesAt = anchors.length === 2 ? CH.indexOf(anchors[1][0]) : -1;
  rec("…only once the save actually succeeded", rolesAt > okAt && okAt !== -1, { okAt, rolesAt });
  rec("…beside the two anchors that already did this", rolesAt > tokenAt && Math.abs(rolesAt - tokenAt) < 1400, { tokenAt, rolesAt });
  rec("CONTROL: editingFile is still re-anchored", /editingFile = body\.file;/.test(CH), "a second file move would send the wrong file");
  rec("CONTROL: …and loadedToken", /loadedToken = body\.token;/.test(CH), "a second rename would orphan the intermediate character");
  rec("CONTROL: a blank form still clears the record", /loadedRoles = null; \/\/ a blank form had no roles/.test(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8")) || /loadedRoles = null;/.test(CH),
    "a new character would inherit the last one's roles");
}

console.log("\n[RUN IT] a whole session, through the real server rule");
{
  // The server's rule, lifted out of server.js rather than restated.
  const at = SV.indexOf("function rolesRemovedByForm(c) {");
  let ruleSrc = "";
  if (at !== -1) {
    let i = SV.indexOf("{", at), d = 0;
    for (; i < SV.length; i++) { if (SV[i] === "{") d++; else if (SV[i] === "}") { d--; if (d === 0) { ruleSrc = SV.slice(at, i + 1); break; } } }
  }
  rec("the server rule was extracted", ruleSrc.length > 250, ruleSrc.length);
  // …and the client's re-anchor, as a function of the payload.
  const reanchor = anchors.length === 2 ? `function anchor(body) { let loadedRoles; ${anchors[1][0]}; return loadedRoles; }` : "";
  rec("the client re-anchor was extracted", reanchor.length > 100, reanchor.length);

  const ctx = {};
  vm.createContext(ctx);
  // A missing re-anchor is the defect itself, so it must produce NAMED failures below rather than a crash
  // that says only "ReferenceError". anchor() falls back to null — which is exactly what the old code
  // effectively left behind — and every check below is written to survive that.
  vm.runInContext(ruleSrc + "\n" + (reanchor || "function anchor() { return null; }")
    + "\nfunction dropped(form, was) { return [...rolesRemovedByForm(Object.assign({}, form, { loadedRoles: was }))].sort(); }", ctx);
  const dropped = (form, was) => vm.runInContext("dropped(" + JSON.stringify(form) + "," + JSON.stringify(was === undefined ? null : was) + ")", ctx);
  const anchor = (form) => vm.runInContext("anchor(" + JSON.stringify(form) + ")", ctx) || null;

  // A character loaded as country leader only.
  const loadedAs = { roleLeader: true, roleAdvisor: false, roleGeneral: false, generalType: "corps_commander" };
  let was = anchor(loadedAs);
  rec("RUN: the record matches what was loaded", !!was && was.leader === true && was.advisor === false && was.generalType === null, was);

  // SAVE 1 — advisor on.
  const form1 = { roleLeader: true, roleAdvisor: true, roleGeneral: false, generalType: "corps_commander" };
  rec("RUN: turning a role ON drops nothing", dropped(form1, was).length === 0, dropped(form1, was));
  const wasStale = was;          // what the old code kept
  was = anchor(form1);           // what the fix records
  rec("RUN: …and the record now says the character HAS it", !!was && was.advisor === true, was);

  // SAVE 2 — advisor off again.
  const form2 = { roleLeader: true, roleAdvisor: false, roleGeneral: false, generalType: "corps_commander" };
  rec("RUN: ⭐ turning it back off DROPS the advisor block", dropped(form2, was).includes("advisor"), dropped(form2, was));
  rec("RUN: …which the stale record could not do — THE BUG", dropped(form2, wasStale).length === 0, dropped(form2, wasStale));
  was = anchor(form2);

  // SAVE 3 — becomes a field marshal.
  const form3 = { roleLeader: true, roleAdvisor: false, roleGeneral: true, generalType: "field_marshal" };
  rec("RUN: becoming a commander drops nothing", dropped(form3, was).length === 0, dropped(form3, was));
  const wasStale3 = was;
  was = anchor(form3);
  rec("RUN: …and the record records the type", !!was && was.generalType === "field_marshal", was);

  // SAVE 4 — switches type again.
  const form4 = { roleLeader: true, roleAdvisor: false, roleGeneral: true, generalType: "navy_leader" };
  rec("RUN: ⭐ switching type again drops the OLD commander block", dropped(form4, was).includes("field_marshal"), dropped(form4, was));
  rec("RUN: …and only that one", dropped(form4, was).length === 1, dropped(form4, was));
  rec("RUN: …where the stale record left the character recruitable as BOTH", !dropped(form4, wasStale3).includes("field_marshal"), dropped(form4, wasStale3));

  // SAVE 5 — nothing touched. Re-anchoring must never invent a drop.
  rec("RUN: saving again with nothing changed drops nothing", dropped(form4, anchor(form4)).length === 0, dropped(form4, anchor(form4)));

  // ⭐ THE SAFETY PROPERTY. A character holding TWO commander roles: the reader surfaces only the first, so
  // the second is never in the record and can never be dropped. Re-anchoring must preserve that.
  const twoRole = { roleLeader: false, roleAdvisor: false, roleGeneral: true, generalType: "corps_commander" };
  const wasTwo = anchor(twoRole);
  rec("RUN: a hidden second commander role is not in the record", !!wasTwo && wasTwo.generalType === "corps_commander", wasTwo);
  rec("RUN: …so saving unchanged never drops it", dropped(twoRole, wasTwo).length === 0, dropped(twoRole, wasTwo));
  rec("RUN: …and switching type drops only the one that was shown",
    JSON.stringify(dropped({ roleLeader: false, roleAdvisor: false, roleGeneral: true, generalType: "navy_leader" }, wasTwo)) === '["corps_commander"]',
    dropped({ roleLeader: false, roleAdvisor: false, roleGeneral: true, generalType: "navy_leader" }, wasTwo));

  // No record at all (a brand-new character, or an older client) must still mean preserve.
  rec("RUN: no record at all still means preserve", dropped(form2, null).length === 0, dropped(form2, null));
}

console.log(`\n=== loaded roles re-anchor: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
