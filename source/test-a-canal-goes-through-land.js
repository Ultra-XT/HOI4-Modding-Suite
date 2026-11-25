// ⛔ #a-canal-goes-through-land — NOVA COULD NOT WRITE A CANAL, INCLUDING THE THREE VANILLA SHIPS.
//
// A sea adjacency names a `through` province: "a province that serves as a gateway for the adjacency for
// the sea type" (wiki, Map modding → adjacencies). Nova required that province to be SEA, and refused
// anything else with "a strait's through province must be SEA".
//
// That rule is invented, and the base game breaks it three times. Of vanilla's 151 sea-type adjacency rows,
// 148 pass through a sea province — ordinary straits — and exactly three pass through LAND:
//
//     8857;2284;sea;7617;1560;1009;1556;1016;PANAMA_CANAL;Panama
//     2729;2408;sea;6257;2949;1598;2962;1612;KIEL_CANAL;Kiel
//     5388;803;sea;1155;-1;-1;-1;-1;SUEZ_CANAL;Suez
//
// Which is the whole point: a sea route cut through land IS a canal. So Nova could not build Suez, Panama,
// Kiel or any canal of the modder's own — and could not even re-write the rows already sitting in the file
// it was editing. The wiki never says the through province must be sea; asked directly, that page only
// gives an example.
//
// The province must still EXIST. What is no longer required is that it be water.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "adjacencies.csv"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const mkMod = () => {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-canal-"));
    roots.push(m);
    fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="canal"\n', "utf8");
    return m;
  };
  const add = (m, o) => md.writeAdjacency(Object.assign({ modRoot: m, gameRoot: GAME, dependencyRoots: [], action: "add" }, o));

  try {
    console.log("\n-- ⭐ the base game itself: what does a canal look like --");
    {
      // DERIVED, so a patch that changes vanilla's canals is visible here rather than silently assumed.
      const type = new Map();
      for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
        const c = l.split(";");
        if (c.length >= 8) type.set(+c[0], c[4]);
      }
      const rows = fs.readFileSync(path.join(GAME, "map", "adjacencies.csv"), "utf8").split(/\r?\n/).slice(1);
      let seaThrough = 0;
      const landThrough = [];
      for (const l of rows) {
        const c = l.split(";");
        if (c.length < 4 || (c[2] || "").trim() !== "sea") continue;
        const th = parseInt(c[3], 10);
        if (!Number.isFinite(th) || th < 0) continue;
        if (type.get(th) === "sea") seaThrough++; else landThrough.push({ through: th, name: (c[8] || "").trim() });
      }
      ok(seaThrough > 100, `${seaThrough} vanilla sea adjacencies pass through a SEA province — ordinary straits`, seaThrough);
      ok(landThrough.length === 3, `…and exactly ${landThrough.length} pass through LAND`, landThrough);
      const names = landThrough.map((x) => x.name).sort().join(",");
      ok(/PANAMA_CANAL/.test(names) && /KIEL_CANAL/.test(names) && /SUEZ_CANAL/.test(names),
        "…and they are Panama, Kiel and Suez — canals, not mistakes", names);
    }

    console.log("\n-- Nova can now write a canal --");
    {
      const m = mkMod();
      const suez = add(m, { from: 5388, to: 803, type: "sea", through: 1155, ruleName: "SUEZ_CANAL", comment: "Suez" });
      ok(suez && suez.changed, "vanilla's own Suez row can be written back", suez && suez.error);

      const mine = add(m, { from: 8857, to: 6257, type: "sea", through: 7617, comment: "test canal" });
      ok(mine && mine.changed, "…and a canal of the modder's own, through a land province", mine && mine.error);

      const csv = fs.readFileSync(path.join(m, "map", "adjacencies.csv"), "utf8");
      ok(/5388;803;sea;1155;.*SUEZ_CANAL/.test(csv), "the Suez row is on disk with its rule name", csv.split("\n").find((l) => l.startsWith("5388;")));
      ok(/8857;6257;sea;7617;/.test(csv), "…and so is the new one", csv.split("\n").find((l) => l.startsWith("8857;6257")));
    }

    console.log("\n-- an ordinary strait through SEA is unaffected --");
    {
      const m = mkMod();
      const strait = add(m, { from: 12251, to: 10321, type: "sea", through: 8313, comment: "Andaman" });
      ok(strait && strait.changed, "a sea-through-sea strait still writes", strait && strait.error);
    }

    console.log("\n-- ⭐ but the through province must still be REAL --");
    {
      // Relaxing "must be sea" must not relax "must exist" — a row naming a province that is not in
      // definition.csv is the shape that makes HOI4 fail to load the map.
      const m = mkMod();
      const bad = add(m, { from: 12251, to: 10321, type: "sea", through: 999999 });
      ok(bad && bad.changed === false, "a through province that does not exist is refused", bad);
      ok(/does not exist/i.test(String(bad.error)), "…saying so plainly", bad && bad.error);
      ok(!fs.existsSync(path.join(m, "map", "adjacencies.csv")), "…and nothing was written");
    }

    console.log("\n-- and a sea adjacency still needs a through province at all --");
    {
      const m = mkMod();
      const none = add(m, { from: 12251, to: 10321, type: "sea" });
      ok(none && none.changed === false, "omitting it is still refused", none);
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
