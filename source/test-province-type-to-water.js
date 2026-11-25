// #province-type-makes-a-sea-inside-a-state — the map province panel's "Type" dropdown (land / sea / lake)
// turned land into water by just RETYPING the province, which is not what that change means.
//
// Two things were missing, and the Erase brush already does both:
//
//   * an INLAND province turned to water is an orphaned sea/lake with no naval connection. HOI4 loads it and
//     then divides by zero building the gamestate — a real crash. Erase refuses this outright ("only coastal
//     land can become water"); the dropdown allowed it with no warning at all.
//   * a water province must not remain inside a land state. Erase removes it from its state and handles the
//     state being left empty (an empty state is itself a crash). The dropdown left it listed there, so the
//     mod shipped a sea province inside a land state.
//
// So the same control could produce, silently, the exact map-definition damage the brush beside it hard-
// refuses. The fix delegates to that proven path rather than re-implementing it, which also means the
// dropdown now inherits its isolated-water guard, its emptied-state handling and its messaging.
//
// The reverse direction (water → land) leaves a province in NO state. This header used to say HOI4 reports that
// as a map error and loads past it; hoi4.exe fails the map load for it ("MAP_ERROR: The land province … has no
// state."; outside --debug, "Failed to load the map"), so land_not_in_state gates Save
// (#a-map-the-game-refuses-to-load). It still warns instead of refusing, because painting the province into a state,
// or Auto-fix adopting it into a neighbour, repairs it before the map is played.
//
// This is a client-side control, so the test reads the shipped public/map.js and checks the wiring. The
// behaviour it delegates to (eraseProvinceLocal's guard + state removal) is already covered by the map tests.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

// Slice the handler so "somewhere in the file" cannot pass — the same mistake that nearly hid the AI-generate
// bug in ideas.js, where the guard existed but in a different handler.
const at = src.indexOf("async function saveProvinceTerrain");
ok("the Type/terrain handler exists", at !== -1);
// Slice to the handler's real end rather than a guessed character count. A fixed window silently truncates
// as the function grows — a 3400-char guess here already cut off the terrain write and the second coastal
// guard, reporting two regressions that were not there.
const handlerEnd = src.indexOf("\n  }", src.indexOf("setStatus(`Province ${pid} terrain set", at));
const handler = src.slice(at, handlerEnd === -1 ? at + 8000 : handlerEnd);
ok("…and the slice reaches its end", /set-province-terrain/.test(handler), handler.length + " chars");

ok("it detects a land → water change", /wasWater/.test(handler) && /nowWater/.test(handler), handler.slice(0, 200));
ok("…and delegates to the erase path rather than a bare retype",
  /beginEraseStroke\(\)/.test(handler) && /eraseProvinceLocal\(pid\)/.test(handler) && /commitEraseStroke\(\)/.test(handler),
  handler.slice(0, 600));
ok("…so a refusal puts the dropdown back to what the province really is",
  /miTypeSel"\)\.value = pdef\.type/.test(handler), handler);
ok("…and it explains itself", /province-type-makes-a-sea-inside-a-state/.test(handler), "no marker comment");

// The warning's wording moved with #a-map-the-game-refuses-to-load (it now says the game will not load land that belongs
// to no state); the pin is on what it tells the user, not on the old phrase "stateless land".
ok("the reverse direction warns about land that belongs to no state",
  /wasWater && !nowWater/.test(handler) && /belongs to no state/i.test(handler), handler);
ok("…and lets the user back out", /\$\("miTypeSel"\)\.value = pdef\.type \|\| "sea"/.test(handler), handler);

// The path being delegated to must still hold its two guarantees, or the delegation is worthless.
const erase = src.slice(src.indexOf("function eraseProvinceLocal"), src.indexOf("function eraseAt"));
ok("eraseProvinceLocal still refuses an inland province", /pdef\.coastal/.test(erase) && /eraseSkippedInland\.add/.test(erase), erase.slice(0, 400));
ok("…and still removes the province from its state",
  /s\.provinces = s\.provinces\.filter/.test(erase), erase);
ok("…and still records a state left empty", /eraseEmptied\.add/.test(erase), erase);
ok("…and drops the province's owner", /delete provinceToOwner\[pid\]/.test(erase), erase);

// A plain terrain or coastal edit must NOT go down the erase path.
ok("a terrain-only edit still takes the ordinary path",
  /pushUndo\("Edit terrain"\)/.test(handler) && handler.indexOf('pushUndo("Edit terrain")') > handler.indexOf("beginEraseStroke()"),
  "ordinary path missing or ordered before the water branch");
ok("…and still queues the terrain write", /set-province-terrain/.test(handler), handler);

// The existing coastal guards must survive.
ok("the landlocked-coastal warning is still there", /doesn't border any sea province, so it isn't really coastal \(a lake shore is not a coast\)/.test(handler), handler);
ok("the un-coastal warning is still there", /borders the sea, so it is genuinely coastal/.test(handler), handler);

console.log("\ntest-province-type-to-water: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 15 ? 0 : 1;
