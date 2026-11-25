// ⛔ #auto-fix-queued-a-delete-that-could-never-run — AND REPORTED IT AS FIXED.
//
// Moving (or erasing) a state's LAST province leaves it empty, and an empty state crashes HOI4 before the
// main menu ("no provinces in state", state.cpp). Nova auto-fixes that by deleting the state, which is the
// right move — and it already declines to do it for a country's CAPITAL, keeping the state and warning
// instead.
//
// It never asked whether the state could be deleted at all. deleteState refuses a state that comes from the
// base game or a dependency when the mod does not replace history/states: the mod's copy would just stop
// overriding and the original would come back. So emptying an INHERITED state queued a delete that could not
// succeed, under the message "✅ Auto-fixed: deleted the now-empty state".
//
// Measured on a fresh vanilla-based mod, moving Faroe Islands' only province (13003) into Iceland:
//
//     "✅ Auto-fixed: deleted the now-empty state Faroe Islands (an empty state would crash the game)."
//     Save -> "Save stopped at step 2: State 337 comes from the base game or a dependency…"
//
// and because the move was step 1 it had already been written, so state 337 was left on disk with
// `provinces = { }` and `buildings = { infrastructure = 2 }` — empty_state_with_content, one of the twelve
// FATAL rules. The map was left in exactly the crash the auto-fix claimed to have prevented, and the batch
// stopped, so nothing queued after it saved either.
//
// ⚠️ Stripping the state's buildings would not have rescued it: an empty state is fatal with or without
// content (empty_state fires for the blank case too). The state must simply not be left empty — which is the
// same situation as a capital, and now gets the same treatment: keep it, change nothing, say so plainly.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
function lift(name) {
  const a = SRC.indexOf("function " + name + "(");
  if (a < 0) return null;
  let paren = 0, bodyStart = -1;
  for (let i = SRC.indexOf("(", a); i < SRC.length; i++) {
    if (SRC[i] === "(") paren++;
    else if (SRC[i] === ")") { paren--; if (!paren) { bodyStart = SRC.indexOf("{", i); break; } }
  }
  if (bodyStart < 0) return null;
  let d = 0, end = -1;
  for (let i = bodyStart; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : SRC.slice(a, end);
}

const fnSrc = lift("deleteEmptiedStates");
ok(!!fnSrc, "deleteEmptiedStates was found in public/map.js");

function harness(states, capitals) {
  const model = { states: states.slice(), capitals: capitals || {} };
  const stateById = new Map(states.map((s) => [s.id, s]));
  const queued = [];
  const run = new Function("model", "stateById", "pendingWrites", "queueWrite", "return (" + fnSrc + ")")(
    model, stateById, [], (url, body) => queued.push({ url, body }));
  return { run, model, stateById, queued };
}

const S = (id, extra) => Object.assign({ id, name: "S" + id, displayName: "State " + id, provinces: [] }, extra || {});

console.log("\n-- a state the MOD defines is still auto-deleted, exactly as before --");
{
  const h = harness([S(900, { inBaseLayer: false })]);
  const r = h.run([h.stateById.get(900)]);
  ok(r.deleted.length === 1 && r.deleted[0].id === 900, "it is deleted", r);
  ok(r.keptInherited.length === 0, "…and not held back", r.keptInherited);
  ok(h.queued.length === 1 && h.queued[0].url === "/api/map/delete-state", "…with the delete queued", h.queued);
  ok(!h.stateById.has(900), "…and dropped from the local model, so the map redraws without it");
}

console.log("\n-- ⭐ a state that comes from the base game is KEPT, and no delete is queued --");
{
  const h = harness([S(337, { inBaseLayer: true, displayName: "Faroe Islands" })]);
  const r = h.run([h.stateById.get(337)]);
  ok(r.deleted.length === 0, "it is not deleted", r.deleted);
  ok(r.keptInherited.length === 1 && r.keptInherited[0].id === 337, "…it is reported as kept-inherited", r.keptInherited);
  ok(h.queued.length === 0, "⭐ …and NOTHING is queued, so the save cannot stop on it", h.queued);
  ok(h.stateById.has(337),
    "…and it stays in the local model, so the map does not show a state that is still there as gone");
}

// (⛔ #an-empty-capital-of-a-landless-country-is-deleted — the capital rule is a rule about a country that OWNS LAND: each capital case
// below gives its country a state with a province, as a real map does. A capital only landless countries name is deleted now, the case
// after them; test-an-empty-capital-of-a-landless-country-is-deleted-on-the-page.js holds the rest.)
const LAND = (id, owner) => S(id, { owner, provinces: [id * 10] });
console.log("\n-- the capital rule is untouched, and outranks the new one --");
{
  const h = harness([S(64, { inBaseLayer: true }), LAND(65, "GER")], { GER: 64 });
  const r = h.run([h.stateById.get(64)]);
  ok(r.keptCapitals.length === 1, "a capital is still kept for its own reason", r);
  ok(r.keptInherited.length === 0, "…and not double-reported as inherited", r.keptInherited);
  ok(h.queued.length === 0, "…and still queues nothing");
}
{
  const h = harness([S(900, { inBaseLayer: false }), LAND(901, "AAA")], { AAA: 900 });
  const r = h.run([h.stateById.get(900)]);
  ok(r.keptCapitals.length === 1 && r.deleted.length === 0,
    "a MOD-defined capital is kept too — deleting a capital crashes differently", r);
}
{
  const h = harness([S(900, { inBaseLayer: false })], { AAA: 900 });
  const r = h.run([h.stateById.get(900)]);
  ok(r.keptCapitals.length === 0 && r.deleted.length === 1 && (r.landlessCapitals || []).length === 1 && h.queued.length === 1 && h.queued[0].url === "/api/map/delete-state",
    "…but one only a country with NO land names is deleted (what is left, capital_state_missing_no_land, is a warning)", r);
}

console.log("\n-- a mix is sorted into the right three buckets in one pass --");
{
  const h = harness([
    S(900, { inBaseLayer: false }),          // deletable
    S(337, { inBaseLayer: true }),           // inherited
    S(64, { inBaseLayer: true }),            // capital (wins over inherited)
    S(901, { inBaseLayer: false }),          // deletable
    LAND(65, "GER"),                         // GER owns land, so its capital is the capital rule's
  ], { GER: 64 });
  const r = h.run(h.model.states.filter((s) => !s.provinces.length));   // the emptied ones (not GER's land)
  ok(r.deleted.map((s) => s.id).sort().join() === "900,901", "the two mod states are deleted", r.deleted.map((s) => s.id));
  ok(r.keptInherited.map((s) => s.id).join() === "337", "the inherited one is kept", r.keptInherited.map((s) => s.id));
  ok(r.keptCapitals.map((s) => s.id).join() === "64", "the capital is kept", r.keptCapitals.map((s) => s.id));
  ok(h.queued.length === 2, "…and exactly two deletes are queued", h.queued.length);
}

console.log("\n-- both callers report it, in the same words --");
{
  // Move and Erase share deleteEmptiedStates; they must also share the sentence, or one of them goes quiet.
  ok(/function inheritedEmptyWarning\(/.test(SRC), "there is one shared warning builder");
  const uses = (SRC.match(/inheritedEmptyWarning\(keptInherited/g) || []).length;
  ok(uses === 2, "…used by both the Move and the Erase paths", uses);
  const w = lift("inheritedEmptyWarning") || "";
  ok(/base game/.test(w) && /Undo/.test(w),
    "…and it says where the state came from and how to back out", w.slice(0, 200));
  ok(!/Auto-fixed/.test(w), "…and never claims to have fixed anything", w.slice(0, 200));
  // ⚠️ On a Millennium Dawn add-on the state comes from MD, not vanilla — MD declares
  // replace_path="history/states", so vanilla's states are not even loaded. Saying only "the base game"
  // sends that modder looking in the wrong place, and it is the phrase deleteState itself avoids.
  ok(/or a dependency/.test(w),
    "…and says \"or a dependency\", because on an MD add-on it is MD's state, not vanilla's", w.slice(0, 200));
}

console.log(`\n=== an auto-fix does not queue a delete that cannot run: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
