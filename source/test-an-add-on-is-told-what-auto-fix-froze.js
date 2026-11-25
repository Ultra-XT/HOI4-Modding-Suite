// ⛔ #an-add-on-is-told-what-auto-fix-froze — AN AUTO-FIX STEP THAT COPIED A FILE INTO THE MOD SAYS THE MOD NOW OWNS IT.
//
// B6-16 (tool campaign, CONFIRMED, medium): on an add-on over Millennium Dawn with one state emptied by hand, one 🔧 click added MD's
// history/states/63-Provence.txt (stateless land homed in it) and MD's map/buildings.txt (4,001,600 bytes) to the add-on, and the line
// named neither. From then on the add-on pins those files as MD has them today (the overlay rule). The steps beside them already carry
// the clause " — to do it, <file> is now YOUR mod's, frozen at this build of the map below"; the steps that home stateless land, give a
// coast its port and re-home a map building did not.
//
// The page's half (public/map.js materialisedNote): those three steps say the clause for each file their answer names as copied in —
// `materialised` (the list the other steps answer), or the buildings step's `materialized` + `file`, which it answers today. An answer
// without the field is an older server's, and nothing more is said (the old line). The data half — fixStatelessLand and the first
// buildings.txt writer answering what they copied in — is map-data.js's.
//
// Run, not read: the page's own Auto-fix summary (testlib-map-page.autoFixSummary), on answers of both shapes.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
const line = (fixes) => { try { return T.autoFixSummary({ ok: true, fixes }); } catch (e) { return "THREW " + e.message; } };
const FROZE = (files) => ` — to do it, ${files} now YOUR mod's, frozen at this build of the map below`;

// the helper, alone
{
  let sb = null;
  try { sb = T.runPage(["function materialisedNote("]).sb; } catch (e) { rec("materialisedNote is lifted out of public/map.js", false, e.message); }
  if (sb) {
    rec("one file", sb.materialisedNote(["map/buildings.txt"]) === FROZE("map/buildings.txt is"), sb.materialisedNote(["map/buildings.txt"]));
    rec("two files", sb.materialisedNote(["history/states/63-Provence.txt", "map/buildings.txt"]) === FROZE("history/states/63-Provence.txt and map/buildings.txt are"), sb.materialisedNote(["a", "b"]));
    rec("nothing copied in, or an older server's answer: nothing said", sb.materialisedNote([]) === "" && sb.materialisedNote(undefined) === "" && sb.materialisedNote(null) === "", "");
  }
}

// the B6-16 click: stateless land homed in a dependency's state, ports given to the land it homed, map buildings re-homed
{
  const withData = line({
    statelessLand: { fixed: 2, details: [{ province: 1, addedToState: 63 }, { province: 2, addedToState: 63 }], materialised: ["history/states/63-Provence.txt"] },
    coastalNoPort: { added: 2, provinces: [1, 2], materialised: ["map/buildings.txt"] },
    buildingsTxt: { changed: true, rehomed: 37, file: "map/buildings.txt", materialized: false },
  });
  rec("⭐⭐⭐ the homed land's step names the state file it copied in, as now the mod's", withData.includes("added 2 stateless land province(s) to a neighbouring state" + FROZE("history/states/63-Provence.txt is")), withData);
  rec("⭐⭐⭐ the port step names map/buildings.txt, which its first row copied in", withData.includes("a port (") && withData.includes("“will likely crash the game”)" + FROZE("map/buildings.txt is")), withData);
  rec("⭐ …and the re-home, which wrote into the mod's own copy by then, claims no copy of its own", !/re-homed 37 map building\(s\)[^·]*YOUR mod's/.test(withData), withData);
  const btFirst = line({ buildingsTxt: { changed: true, rehomed: 37, file: "map/buildings.txt", materialized: true } });
  rec("⭐⭐ the re-home step, when it is the one that copied map/buildings.txt in (its answer today: materialized + file)", btFirst.includes(`(HOI4 silently drops "building not within specified state")` + FROZE("map/buildings.txt is")), btFirst);
  const btList = line({ buildingsTxt: { changed: true, rehomed: 3, materialised: ["map/buildings.txt"] } });
  rec("…or with the list shape the others answer", btList.includes(FROZE("map/buildings.txt is")), btList);
  const older = line({
    statelessLand: { fixed: 2, details: [] },
    coastalNoPort: { added: 2, provinces: [1, 2] },
    buildingsTxt: { changed: true, rehomed: 37, file: "map/buildings.txt", materialized: false },
  });
  rec("⭐⭐ an answer without the fields (an older server's, or nothing copied in) says the old line, and no copy", !/YOUR mod's/.test(older)
    && older.includes("added 2 stateless land province(s) to a neighbouring state") && older.includes("re-homed 37 map building(s)"), older);
}

console.log(`\n=== an add-on is told what Auto-fix froze: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
