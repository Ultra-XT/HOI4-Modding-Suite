// ⛔ #new-state-saved-with-no-provinces — SAVE WROTE A STATE THAT CRASHES THE GAME.
//
// "New state" stages a provisional state and arms Fill mode: "Now CLICK provinces on the map to add them to
// it (each click moves one in). Switch tools to stop, then 💾 Save." Nothing ever required that anyone did.
// Click New state, switch tools, hit Save, and /api/map/create-state writes `provinces = { }` to disk —
// `empty_state`, one of the FATAL rules (hoi4.exe loads the map past it, then refuses to start a game: strategicair
// finds no air base site on a state with no land and shows "Failed to load the map").
//
// Found by driving the map endpoints in the client's own order against a fresh mod and validating after
// every single step: the very first call took the mod from 0 errors to 1 fatal, and it was still there at
// the end. The endpoint answered ok.
//
// ⭐ THE FIX WAS ONE FUNCTION AWAY. This file already purges writes that point at a provisional state which
// no longer exists (#discarded-state-leaves-its-writes) — Undo, or the auto-delete of a state whose last
// province was moved out. The mirror case, a create for a state nobody ever filled, had no such purge.
//
// Dropped rather than refused: refusing the save would hold back every other edit in the batch over a state
// the modder demonstrably never filled. Nothing else can reference it either — a state with no provinces
// has no move-province writes naming it — so dropping the create is complete as well as safe.
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

const fnSrc = lift("emptyNewStateWrites");
ok(!!fnSrc, "emptyNewStateWrites was found in public/map.js");
const emptyNewStateWrites = fnSrc && new Function("return (" + fnSrc + ")")();

const createW = (id) => ({ url: "/api/map/create-state", body: { name: "", owner: "GER" }, meta: { create: true, provisionalId: id } });
const moveW = (pid, to) => ({ url: "/api/map/move-province", body: { provinceId: pid, toStateId: to }, meta: { fromStateId: 5 } });
const S = (id, provs) => ({ id, name: "S" + id, displayName: "New state " + (-id), provinces: provs });

console.log("\n-- ⭐ a new state nobody filled is dropped --");
{
  const byId = new Map([[-1, S(-1, [])]]);
  const writes = [createW(-1)];
  const out = emptyNewStateWrites(writes, byId);
  ok(out.length === 1 && out[0].meta.provisionalId === -1, "its create is picked out", out.length);
}

console.log("\n-- …and a new state that WAS filled is not --");
{
  const byId = new Map([[-1, S(-1, [923, 6862])]]);
  const writes = [createW(-1), moveW(923, -1), moveW(6862, -1)];
  ok(emptyNewStateWrites(writes, byId).length === 0,
    "⚠️ THE CONTROL: the normal flow is untouched", emptyNewStateWrites(writes, byId).length);
}

console.log("\n-- a mix is separated in one pass --");
{
  const byId = new Map([[-1, S(-1, [])], [-2, S(-2, [77])], [-3, S(-3, [])]]);
  const writes = [createW(-1), createW(-2), moveW(77, -2), createW(-3)];
  const out = emptyNewStateWrites(writes, byId);
  ok(out.map((w) => w.meta.provisionalId).sort((a, b) => a - b).join(",") === "-3,-1",
    "both empty ones go, the filled one stays", out.map((w) => w.meta.provisionalId));
}

console.log("\n-- it only ever touches a CREATE --");
{
  // A move or a set-owner naming a real state must never be swept up by this, whatever the model says.
  const byId = new Map([[64, S(64, [])]]);
  const writes = [
    { url: "/api/map/set-owner", body: { stateId: 64, owner: "GER" }, meta: {} },
    { url: "/api/map/delete-state", body: { stateId: 64 }, meta: {} },
    { url: "/api/map/move-province", body: { provinceId: 1, toStateId: 64 }, meta: {} },
  ];
  ok(emptyNewStateWrites(writes, byId).length === 0,
    "an ordinary write against an empty EXISTING state is left alone", emptyNewStateWrites(writes, byId));
}
{
  // A create whose provisional state is already gone from the model is the ORPHAN case, handled by
  // orphanedQueuedWrites — this one must not claim it too, or the two purges fight over the same write.
  const writes = [createW(-9)];
  ok(emptyNewStateWrites(writes, new Map()).length === 0,
    "a create whose state has already left the model belongs to the orphan purge, not this one");
}

console.log("\n-- it is wired into the save, beside the purge it mirrors --");
{
  ok(/emptyNewStateWrites\(pendingWrites, stateById\)/.test(SRC),
    "the save calls it with the live queue and model");
  const save = SRC.slice(SRC.indexOf("const emptyNew = emptyNewStateWrites(pendingWrites, stateById)"));   // the first of the two purges now (#a-save-walks-the-queue)
  const seg = save.slice(0, 2000);
  // Moved with #a-map-message-says-when-the-game-stops: hoi4.exe loads the map past an empty state and refuses to start a
  // game with one (strategicair's air-base walk), so the editor no longer says it "crashes HOI4 before the main menu".
  ok(/HOI4 will not start a game with an empty state/.test(seg),
    "…and says why the state went: HOI4 will not start a game with one", seg.slice(0, 200));
  ok(/stateById\.delete\(id\)/.test(seg),
    "…and drops it from the local model too, so the map stops drawing a state that will not exist");
  ok(/Saving the rest/.test(seg),
    "…while the rest of the batch still saves — one unfilled state does not block 40 real edits");
}

console.log(`\n=== a new state with no provinces is not saved: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
