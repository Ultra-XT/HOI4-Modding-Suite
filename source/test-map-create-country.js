// Map ✨ New country (paint-first create): mapData.createCountry registers the tag, writes the country
// definition (+colour) and history (capital + defaults), sets colors.txt, and assigns every claimed state's
// owner — atomically, reusing setCountryColor + writeStateOwner. The capital is always one of the owned
// states (no dangling-capital crash). Run: node test-map-create-country.js  (auto-picked up by run-tests.js)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const mapData = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newctry-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Nova New Country"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="common/countries"\n');
  // Two states currently owned by OLD — the new country will claim both.
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = OLD\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = OLD\n\t}\n}\n');
  return mod;
}
const read = (mod, ...p) => fs.readFileSync(path.join(mod, ...p), "utf8");
const ownerOf = (txt) => { const m = /owner\s*=\s*([A-Z0-9_]+)/.exec(txt); return m ? m[1] : null; };

(() => {
  console.log("=== Map: createCountry (paint-first new country) ===");
  const made = [];
  try {
    // ── Happy path: claim states 1 & 2, capital = 1, orange colour. ──
    {
      const mod = buildMod(); made.push(mod);
      const r = mapData.createCountry({ modRoot: mod, gameRoot: null, tag: "ZZZ", name: "Atlantis", rgb: [200, 100, 50], stateIds: [1, 2], capitalStateId: 1 });
      ok("returns ok", r.ok === true, r);
      ok("owned both claimed states", r.owned === 2 && r.failedStates.length === 0, r);
      ok("capital is one of the states", r.states.includes(r.capital) && r.capital === 1, r);
      // The FILENAME is the thing: common/country_tags is read in filename order, and anything sorting
      // after vanilla's zz_dynamic_countries.txt is a throwaway civil-war tag the game never builds a flag
      // for. "zz_nova_countries.txt" sorted after it, so every country Nova made crashed HOI4 in
      // flagtextureatlas.cpp as the menu painted, with an empty error.log.
      // #a-country-after-dynamic-tags-is-not-a-country
      ok("tag registered in country_tags", /ZZZ\s*=\s*"countries\/Atlantis\.txt"/.test(read(mod, "common", "country_tags", "00_nova_countries.txt")));
      ok("...in a file that sorts BEFORE zz_dynamic_countries.txt", "00_nova_countries.txt" < "zz_dynamic_countries.txt");
      ok("definition file written with colour", /color\s*=\s*\{\s*200 100 50\s*\}/.test(read(mod, "common", "countries", "Atlantis.txt")));
      ok("definition has a graphical_culture", /graphical_culture\s*=/.test(read(mod, "common", "countries", "Atlantis.txt")));
      ok("history file has the capital", /capital\s*=\s*1/.test(read(mod, "history", "countries", "ZZZ - Atlantis.txt")));
      ok("colors.txt got ZZZ's colour", JSON.stringify(mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).ZZZ) === JSON.stringify([200, 100, 50]), mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).ZZZ);
      ok("state 1 owner is now ZZZ", ownerOf(read(mod, "history", "states", "1.txt")) === "ZZZ", ownerOf(read(mod, "history", "states", "1.txt")));
      ok("state 2 owner is now ZZZ", ownerOf(read(mod, "history", "states", "2.txt")) === "ZZZ", ownerOf(read(mod, "history", "states", "2.txt")));
    }

    // ── The capital is auto-added to the owned set even if not painted. ──
    {
      const mod = buildMod(); made.push(mod);
      const r = mapData.createCountry({ modRoot: mod, gameRoot: null, tag: "QQQ", name: "Quux", rgb: [10, 20, 30], stateIds: [2], capitalStateId: 1 });
      ok("auto-includes the capital state in the owned set", r.ok && r.states.includes(1) && r.states.includes(2), r);
      ok("capital state 1 owned even though only 2 was 'painted'", ownerOf(read(mod, "history", "states", "1.txt")) === "QQQ");
    }

    // ── Validation. ──
    {
      const mod = buildMod(); made.push(mod);
      ok("rejects a non-3-char tag", mapData.createCountry({ modRoot: mod, gameRoot: null, tag: "TOOLONG", name: "X", rgb: [1, 2, 3], stateIds: [1], capitalStateId: 1 }).ok === false);
      ok("rejects an empty name", mapData.createCountry({ modRoot: mod, gameRoot: null, tag: "AAA", name: "", rgb: [1, 2, 3], stateIds: [1], capitalStateId: 1 }).ok === false);
      ok("rejects a missing capital", mapData.createCountry({ modRoot: mod, gameRoot: null, tag: "AAA", name: "X", rgb: [1, 2, 3], stateIds: [1], capitalStateId: 0 }).ok === false);
      ok("rejects no modRoot", mapData.createCountry({ tag: "AAA", name: "X", rgb: [1, 2, 3], stateIds: [1], capitalStateId: 1 }).ok === false);
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\nMAP-CREATE-COUNTRY: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
