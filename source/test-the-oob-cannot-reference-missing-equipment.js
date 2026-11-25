// #oob-references-equipment-that-does-not-exist — THE STARTING NAVY AND AIR FORCE ACCEPTED ANYTHING.
//
// naAddShip and naAddGroup validated only that what was typed LOOKS like a Paradox token
// (/^[A-Za-z_][A-Za-z0-9_]*$/). Type destroyer_99, or mistype fighter_equipment_1, and Nova staged it,
// saved it into the order of battle, and the game could not resolve the unit. The user reported it as
// "a bare template may break the game".
//
// The stockpile card next door had refused exactly this for ages, and said where to find a real one:
//   "No design is named X anywhere in this mod. Click the box to pick one, or clear it to stockpile the
//    plain equipment."
// It even checks the design's TYPE matches the equipment. These two never adopted any of it — the dominant
// bug shape in this codebase: the fix already exists next door and one caller never took it.
//
// The data was already in hand. loadOobEquipmentLists fills S.naNavalRows and S.naAirRows from
// /api/army/oob-equipment, and those are exactly what the Browse pickers offer. So the guard costs nothing.
//
// Verified in the running app against Millennium Dawn before this test was written:
//   destroyer_99            -> refused, 0 rows added
//   battleship_hull_1       -> "Ship staged - Save navy when ready."
//   fighter_equipment_999   -> refused
//   medium_plane_airframe_2 -> "Group staged - Save air force when ready."
//
// Comments are stripped first: the fix explains itself in prose right above the code, and a naive grep
// would match its own explanation instead of the guard.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ARMY = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + detail));
  if (!ok) fails.push(label);
};

// The body of a named function, up to the next one at the same indent.
function bodyOf(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return "";
  const next = src.indexOf("\n  function ", at + 10);
  return src.slice(at, next === -1 ? at + 4000 : next);
}

try {
  const ship = bodyOf(ARMY, "naAddShip");
  const air = bodyOf(ARMY, "naAddGroup");
  rec("both add-to-OOB paths were found", ship.length > 100 && air.length > 100,
    "naAddShip " + ship.length + " chars, naAddGroup " + air.length);

  console.log("\n1. Neither path will stage equipment nothing defines");
  for (const [label, body, rows] of [["naAddShip", ship, "naNavalRows"], ["naAddGroup", air, "naAirRows"]]) {
    rec(label + " checks the id against the list the picker offers",
      new RegExp("S\\." + rows + "[\\s\\S]{0,200}?\\.some\\(").test(body), "a typo goes straight into the OOB");
    rec(label + " …and refuses rather than staging it",
      /naWarn\([^)]*exists in this mod[\s\S]{0,120}?return;/.test(body), "it warns but stages anyway");
    // Guarding only once the list has loaded is deliberate: a slow fetch must never block real input.
    // stockpileAdd does the same, and that is the behaviour being copied.
    rec(label + " …only once the list has actually loaded",
      new RegExp("Array\\.isArray\\(S\\." + rows + "\\)\\s*&&\\s*S\\." + rows + "\\.length").test(body),
      "an unloaded list would reject everything");
  }

  console.log("\n2. The message points at the way out");
  // A refusal that does not say what to do instead is a dead end — the picker is right there.
  for (const [label, body] of [["naAddShip", ship], ["naAddGroup", air]]) {
    rec(label + " tells the user to Browse for a real one", /click Browse/i.test(body), "the refusal is a dead end");
    rec(label + " names the offending value back", /\$\{equipment\}/.test(body), "the user cannot see what was wrong");
  }

  console.log("\n3. The pattern this was copied from is still intact");
  // If stockpileAdd ever loses its guard, the thing these two were modelled on is gone and this test should
  // say so rather than quietly measuring a copy of something that no longer exists.
  const stock = bodyOf(ARMY, "stockpileAdd");
  rec("stockpileAdd still refuses a design no mod defines",
    /S\.allVariants[\s\S]{0,300}?No design is named/.test(stock), "the reference implementation regressed");

  console.log("\n4. The checks can fail (composed here, not assumed)");
  const OLD = 'function naAddShip() {\n' +
    '    const equipment = ($("naShipEq").value || "").trim();\n' +
    '    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(equipment)) { naWarn("Enter a ship equipment archetype."); return; }\n' +
    '    (S.na.ships = S.na.ships || []).push({ equipment });\n';
  rec("the version that shipped the bug is rejected",
    !/S\.naNavalRows[\s\S]{0,200}?\.some\(/.test(OLD));

  console.log(`\n=== the OOB cannot reference missing equipment: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
