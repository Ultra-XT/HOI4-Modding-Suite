// #discarded-state-leaves-its-writes
//
// DISCARDING AN UNSAVED NEW STATE LEFT EVERY OTHER WRITE STILL ADDRESSED TO IT.
//
// A new state is staged with a provisional NEGATIVE id until Save hands back a real one. Deleting it before
// saving cancelled its pending create — and only that. The province moves queued while it existed each
// carry { toStateId: -1 }, and the id remapping at save time only knows ids the SERVER handed back; with the
// create gone, nothing maps -1 to anything. Save then posted move-province with a toStateId for a state that
// will never exist, on every save, for the rest of the session.
//
// Reachable with nothing failing anywhere: make a new state, click a few provinces into it, change your
// mind, delete it.
//
// Two halves to the fix. Drop every queued write that names the provisional id, not just the create. And put
// the provinces back where they came from — otherwise they are unassigned on screen while the file still has
// them in their original states. doMoveProvince is handed that origin and used to throw it away; it records
// it in the write's meta now, which is where a cancelled move can still find it. The BODY is unchanged: the
// server scans and clears all sources on Save, so it never needed one.
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
const { stripJsComments } = require("./testlib-strip-comments.js");
const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));

console.log("\n[the origin is recorded] so a cancelled move can be undone");
{
  // (its meta carries more since #a-moved-coast-takes-its-dockyards: the dockyards the click moved on the page, `yards`)
  rec("doMoveProvince records where the province came from", /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}, \{ fromStateId(?: \}\)|, )/.test(JS), "the origin is thrown away again");
  // The body must NOT gain a source — the server clears all sources itself, and changing the body would
  // change what every existing test and the server contract expect.
  rec("…in the meta, leaving the request body alone", !/move-province", \{ provinceId, toStateId, fromStateId \}/.test(JS), "the write body changed shape");
  // Undo copies meta, so a restored snapshot can still undo a move.
  rec("…and the snapshot carries meta across undo", /meta: Object\.assign\(\{\}, w\.meta\)/.test(JS), "meta would be lost on undo, taking the origin with it");
}

console.log("\n[the discard] takes every write that named the state");
{
  const block = /const PROVISIONAL_ID_FIELDS = \[[\s\S]*?pendingWrites = kept;/.exec(JS);
  rec("the discard logic is findable", !!block, "not found");
  const b = block ? block[0] : "";
  rec("…it drops the pending create", /w\.meta && w\.meta\.create && w\.meta\.provisionalId === sid/.test(b), b.slice(0, 300));
  rec("…and every other write naming the id", /PROVISIONAL_ID_FIELDS\.some\(\(k\) => w\.body && w\.body\[k\] === sid\)/.test(b), b.slice(0, 400));
  rec("…putting the moved provinces back", /model\.provinceToState\[pid\] = from;/.test(b), b.slice(0, 600));
  rec("…and their owner with them", /provinceToOwner\[pid\] = back\.owner/.test(b), b.slice(0, 700));
  rec("…and saying so", /went back to where/.test(JS), "the user is not told the provinces moved back");

  // ⭐ ONE LIST, DERIVED. The save path remaps a fixed set of id fields; the discard must cover the same
  // set, or a write naming the provisional id in a field nobody remaps is just as orphaned.
  //
  // That set used to be read back out of five hand-written `if ("X" in body)` lines in the flush. It is now
  // a named constant the flush loops over — #provisional-id-lost-when-a-save-stops-halfway needed the same
  // list in a second place, and two hand-written copies is how they drift. Read the constant; if it ever
  // goes back to inline ifs, this finds nothing and says so rather than passing on an empty set.
  const remapped = ((/const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(JS) || [, ""])[1].match(/"(\w+)"/g) || []).map((s) => s.replace(/"/g, "")).sort();
  const dropped = ((/const PROVISIONAL_ID_FIELDS = \[([^\]]*)\]/.exec(JS) || [, ""])[1].match(/"(\w+)"/g) || []).map((s) => s.replace(/"/g, "")).sort();
  rec("the save path remaps a known set of id fields", remapped.length >= 5, remapped);
  rec("…and the discard covers exactly that set", JSON.stringify(remapped) === JSON.stringify(dropped), { remapped, dropped });
}

console.log("\n[RUN IT] the filter, over a staged session");
{
  const block = (/const PROVISIONAL_ID_FIELDS = \[[\s\S]*?pendingWrites = kept;/.exec(JS) || [""])[0];
  rec("the block was extracted for running", block.length > 300, block.length);

  // (⛔ #a-moved-coast-takes-its-dockyards — the block gives back the dockyards a cancelled move's click moved on the page, through the
  // page's own unmirrorDroppedMove and reconcileNavalCarry, lifted with it)
  const { lift } = require("./testlib-map-page.js");
  // (…and ⛔ #a-deleted-state-says-every-dockyard-it-takes — the helpers reconcileNavalCarry keeps the dated levels in step with)
  const helpers = ["function unmirrorDroppedMove(", "function reconcileNavalCarry(", "function moveProvinceLevels(", "function stateNavalLevels(", "function navalDatedAfterCarry(", "function giveNavalDated("].map((o) => lift(o)).join("\n");
  const run = (writes, states) => {
    const ctx = {
      sid: -1, st: { id: -1, provinces: [], victoryPoints: [], provinceBuildings: {} },   // (the handler's local: the state being discarded, already off the model)
      pendingWrites: writes,
      model: { provinceToState: { 11: -1, 12: -1 } },
      provinceToOwner: { 11: "NEW", 12: "NEW" },
      stateById: new Map(states.map((s) => [s.id, s])),
      returnedOut: null,
    };
    vm.createContext(ctx);
    vm.runInContext(helpers + "\n" + block + "\nreturnedOut = returned;", ctx);
    return ctx;
  };

  const states = [{ id: 42, owner: "FRA", provinces: [] }, { id: 43, owner: "GER", provinces: [] }];
  const writes = [
    { url: "/api/map/create-state", body: {}, meta: { create: true, provisionalId: -1 } },
    { url: "/api/map/move-province", body: { provinceId: 11, toStateId: -1 }, meta: { fromStateId: 42 } },
    { url: "/api/map/move-province", body: { provinceId: 12, toStateId: -1 }, meta: { fromStateId: 43 } },
    { url: "/api/map/set-owner", body: { stateId: 7, owner: "ITA" }, meta: {} }, // unrelated, must survive
  ];
  const ctx = run(writes, states);

  rec("the create is gone", !ctx.pendingWrites.some((w) => w.meta && w.meta.create), ctx.pendingWrites.map((w) => w.url));
  // ⭐ THE BUG: these used to survive and be posted with toStateId -1.
  rec("…and so is every move into the discarded state", !ctx.pendingWrites.some((w) => w.body && w.body.toStateId === -1), ctx.pendingWrites.map((w) => w.body));
  rec("…while unrelated writes survive", ctx.pendingWrites.some((w) => w.url === "/api/map/set-owner"), ctx.pendingWrites.map((w) => w.url));
  rec("…leaving exactly the unrelated one", ctx.pendingWrites.length === 1, ctx.pendingWrites.length);

  rec("province 11 went back to state 42", ctx.model.provinceToState[11] === 42, ctx.model.provinceToState);
  rec("…and 12 back to 43", ctx.model.provinceToState[12] === 43, ctx.model.provinceToState);
  rec("…and each state lists it again", states[0].provinces.includes(11) && states[1].provinces.includes(12), states);
  rec("…with the owner that state has", ctx.provinceToOwner[11] === "FRA" && ctx.provinceToOwner[12] === "GER", ctx.provinceToOwner);
  rec("…and both are reported as returned", (ctx.returnedOut || []).length === 2, ctx.returnedOut);

  // A move whose origin is unknown (an older queued write, or a province that came from nowhere) must still
  // have its orphaned write dropped — it just cannot be put back.
  const ctx2 = run([{ url: "/api/map/move-province", body: { provinceId: 99, toStateId: -1 }, meta: {} }], states);
  rec("an orphan with no recorded origin is still dropped", ctx2.pendingWrites.length === 0, ctx2.pendingWrites);
  rec("…and is not counted as returned", (ctx2.returnedOut || []).length === 0, ctx2.returnedOut);

  // ⛔ #a-moved-coast-takes-its-dockyards — province 11 was state 42's last coast, so its click moved 42's 3 dockyards to the new state on
  // the page (the move's meta.yards); the discard cancels that move, and the files still hold the 3 in 42, so the page's copy does too
  const yardStates = [{ id: 42, owner: "FRA", provinces: [], buildings: { infrastructure: 2 } }];
  const ctx3 = run([
    { url: "/api/map/create-state", body: {}, meta: { create: true, provisionalId: -1 } },
    { url: "/api/map/move-province", body: { provinceId: 11, toStateId: -1 }, meta: { fromStateId: 42, yards: [{ from: 42, keys: { dockyard: 3 } }] } },
  ], yardStates);
  rec("a discarded move's dockyards go back to the state they came from", ctx3.pendingWrites.length === 0 && yardStates[0].buildings.dockyard === 3 && yardStates[0].buildings.infrastructure === 2, yardStates[0].buildings);

  // (a write queued since that names the state the paint came from now refuses the discard, before this block runs:
  // ⛔ #a-dropped-paint-refuses-what-rests-on-it, test-a-dropped-paint-refuses-what-rests-on-it.js)
}

console.log("\n[CONTROL] the rest of the staging model is unchanged");
{
  rec("a REAL state still queues a delete", /queueWrite\("\/api\/map\/delete-state", \{ stateId: sid \}\)/.test(JS), "deleting a saved state changed");
  rec("the save still remaps provisional ids it was given", /idMap\[w\.meta\.provisionalId\] = res\.id/.test(JS), "the remap that makes provisional ids work went");
  rec("…and still drains pendingWrites one at a time", /while \(pendingWrites\.length\)/.test(JS), "the drain changed shape");
  rec("the dirty count still follows the queue", /setMapDirty\(pendingWrites\.length > 0/.test(JS), "the unsaved indicator no longer tracks the queue");
}

console.log(`\n=== map discard new state: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
