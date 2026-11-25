// ⛔ #army-foreign-province-note — THE ONE PLACEMENT WORTH FLAGGING READ EXACTLY LIKE AN ORDINARY ONE.
//
// The unit placer deliberately lets you drop a division in a province another country owns: a modder stages
// divisions in land an event or a war is about to hand over, and refusing that would break a real workflow.
// The author knew, and wrote the warning:
//
//     if (p.owner && p.owner !== armyTag) setStatus(`Note: province … is …'s, not …'s — placed anyway.`);
//
// Four lines later, unconditionally:
//
//     setStatus(`Placed ${armyTemplate} at province ${p.pid} (${…} total).`);
//
// Same status line, same synchronous block — the note was gone before a frame was painted. Measured by
// driving the real editor: with GER picked, clicking Denmark's Faroe Islands (province 13003) reported
// "Placed Infanterie-Division at province 13003 (33 total)." and nothing else, and saved a GER division
// into DEN's territory. The panel above it says "Click GER's provinces to place divisions", and the placer
// does refuse a SEA province out loud — so the only case the modder could not see was the one that needed
// saying.
//
// A scan of all 31 public/*.js files for this shape (a conditional setStatus overwritten by an
// unconditional one in the same straight-line block) found no other instance — the other five candidates
// are all if/else pairs. This is a lone bug, not a class.
//
// armyClickAt is lifted out of public/map.js and given its dependencies, rather than reimplemented — a
// reimplementation would test the copy, which is how this project's false findings usually start.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

function liftFunction(name) {
  const a = SRC.indexOf("function " + name + "(");
  if (a < 0) return null;
  let d = 0, end = -1;
  for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : SRC.slice(a, end);
}

const fnSrc = liftFunction("armyClickAt");
ok(!!fnSrc, "armyClickAt was found in public/map.js");

// Everything armyClickAt closes over. armyTag and armyTemplate are read-only here; armyRemovedSinceSave is
// assigned in the remove branch, so it is a parameter rather than a free variable.
const makeClick = new Function(
  "armyProvinceAt", "armyTag", "armyTemplate", "armyRemoveMode", "armyModel", "armyRemovedSinceSave",
  "setStatus", "renderArmyPanel", "draw", "armyHasUnsaved", "armyLoad", "confirm",
  "return (" + fnSrc + ")");

// One harness per case: a fake map where each screen x maps to a province with a known owner and type.
function harness(provinces, { tag = "GER", template = "Infanterie-Division", divisions = [] } = {}) {
  const statuses = [];
  const model = { divisions: divisions.slice() };
  const click = makeClick(
    (cx) => provinces[cx] || null,
    tag, template, false, model, false,
    (s) => statuses.push(String(s)),
    () => {}, () => {}, () => false, () => {}, () => true);
  return { click, statuses, model, last: () => statuses[statuses.length - 1] || "" };
}

const OWN = { pid: 4861, owner: "GER", type: "land" };
const FOREIGN = { pid: 13003, owner: "DEN", type: "land" };
const SEA = { pid: 8413, owner: undefined, type: "sea" };

console.log("\n-- placing in another country's province is still ALLOWED --");
{
  const h = harness({ 10: FOREIGN });
  h.click(10, 0, false);
  ok(h.model.divisions.length === 1, "the division is placed, not refused", h.model.divisions);
  ok(h.model.divisions[0].location === 13003, "…at the province that was clicked", h.model.divisions[0]);
}

console.log("\n-- …but the modder is told whose province it is, in the message they actually see --");
{
  // ⭐ THE BUG: the note went to the same status line and was overwritten before it could be read. Assert on
  // the LAST status, which is the only one a user ever sees, not on the multiset of everything written.
  const h = harness({ 10: FOREIGN });
  h.click(10, 0, false);
  ok(/DEN/.test(h.last()), "the surviving message names the owning country", h.statuses);
  ok(/GER/.test(h.last()), "…and the country whose army is being edited", h.statuses);
  ok(/13003/.test(h.last()), "…and the province", h.statuses);
  ok(/placed anyway/i.test(h.last()), "…and says it went ahead", h.statuses);
  ok(/Placed Infanterie-Division/.test(h.last()),
    "…while still reporting the placement itself, so nothing was traded away", h.statuses);
}

console.log("\n-- the ordinary case is not made noisy by the fix --");
{
  const h = harness({ 10: OWN });
  h.click(10, 0, false);
  ok(h.model.divisions.length === 1, "a division in the country's own province is placed");
  ok(!/⚠/.test(h.last()) && !/anyway/i.test(h.last()),
    "…and carries no warning", h.last());
  ok(/Placed Infanterie-Division at province 4861/.test(h.last()), "…just the placement", h.last());
}

console.log("\n-- the guard that DOES refuse still refuses, and is still the last word --");
{
  const h = harness({ 10: SEA });
  h.click(10, 0, false);
  ok(h.model.divisions.length === 0, "a land division is not placed in a sea province", h.model.divisions);
  ok(/sea provinces/i.test(h.last()), "…and the refusal is what the modder is left looking at", h.statuses);
}

console.log("\n-- a stateless/unowned land province is neither refused nor warned about --");
{
  // Wasteland has no owner. `p.owner &&` guards this; without it every wasteland placement would claim the
  // province belonged to "undefined".
  const h = harness({ 10: { pid: 999, owner: undefined, type: "land" } });
  h.click(10, 0, false);
  ok(h.model.divisions.length === 1, "it is placed");
  ok(!/undefined/.test(h.last()), "…and nothing in the message says \"undefined\"", h.last());
}

console.log(`\n=== placing a division abroad says so: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
