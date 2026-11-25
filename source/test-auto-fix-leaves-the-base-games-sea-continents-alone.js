// Auto-fix must not "repair" a definition.csv row the validator deliberately refuses to report.
// #auto-fix-leaves-the-base-games-sea-continents-alone
//
// sea_province_has_continent carries two ownership gates, and says why: the base game ships sea provinces
// with a continent set (5257 is `sea;true;ocean;2` and vanilla launches), and definition.csv is a whole-file
// override, so the moment a mod carries a copy it "owns" all 13,000 of vanilla's rows. Owning the file is not
// authoring the row. So the RULE reports only rows the mod itself changed.
//
// fixSeaContinents, the fixer for that exact rule, had NEITHER gate. It walked every sea province in the
// effective model and called setProvinceDefinition({continent: 0}) on each. Two consequences, both measured
// by the overnight invariant audit and confirmed by an independent verifier:
//
//   * On a vanilla-based mod with one unrelated problem, one Auto-fix click reported "reset 1 sea
//     province(s) to continent 0" for a problem the validator counted as ZERO before and after.
//   * On a mod that did not own definition.csv at all, setProvinceDefinition MATERIALISED the base game's
//     whole file into the mod to make that invisible edit — the whole-file-override class this project has
//     hit before, from the fixer side this time.
//
// The fixer now asks the rule's own two questions, so it acts on exactly what the rule reports.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// A base game whose definition.csv has a sea province WITH a continent — the shape vanilla really ships.
const BASE_ROWS = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;0;0;land;false;plains;1",
  "2;20;0;0;sea;true;ocean;2",      // shipped by the base game this way, like vanilla's 5257
  "3;30;0;0;sea;false;ocean;0",
  "4;40;0;0;land;false;plains;1",
];
const csv = (rows) => rows.join("\r\n") + "\r\n";
const contOf = (file, id) => {
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(id + ";"));
  return line ? parseInt(line.split(";")[7], 10) : NaN;
};
const report = (modRoot, gameRoot) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] }))
  .filter((p) => p.rule === "sea_province_has_continent");

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-game-")); tmps.push(GAME);
  mk(path.join(GAME, "map", "definition.csv"), csv(BASE_ROWS));

  console.log("1. ⛔ A mod holding the base game's definition.csv verbatim is left alone");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-verbatim-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Verbatim"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(BASE_ROWS));
    const file = path.join(mod, "map", "definition.csv");
    const before = fs.readFileSync(file);

    rec("the rule reports nothing — the row is the base game's, not the mod's", report(mod, GAME).length === 0, report(mod, GAME).length);
    const r = md.fixSeaContinents({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ …and the fixer fixes nothing either", (r.fixed || 0) === 0, r);
    rec("⭐⭐ …the file is byte-identical", Buffer.compare(before, fs.readFileSync(file)) === 0);
    rec("…province 2 keeps the continent the base game ships", contOf(file, 2) === 2, contOf(file, 2));
  }

  console.log("\n2. ⛔⛔ A mod that owns NO definition.csv gets none copied into it");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-none-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="None"\n');
    const r = md.fixSeaContinents({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ nothing is fixed", (r.fixed || 0) === 0, r);
    rec("⭐⭐⭐ …and the base game's definition.csv was NOT materialised into the mod",
      !fs.existsSync(path.join(mod, "map", "definition.csv")),
      fs.existsSync(path.join(mod, "map")) ? fs.readdirSync(path.join(mod, "map")) : "(no map dir)");
  }

  console.log("\n3. ⭐ A sea continent the MOD introduced is still repaired");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-authored-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Authored"\n');
    // The mod turned land 4 into sea but left its continent at 1 — a row the mod itself wrote wrongly.
    const rows = BASE_ROWS.slice(); rows[4] = "4;40;0;0;sea;false;ocean;1";
    mk(path.join(mod, "map", "definition.csv"), csv(rows));
    const file = path.join(mod, "map", "definition.csv");

    const rep = report(mod, GAME);
    rec("the rule reports the mod's own row", rep.length === 1 && (rep[0].provinces || []).includes(4), rep.map((p) => p.provinces));
    const r = md.fixSeaContinents({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ the fixer repairs exactly that row", r.fixed === 1 && (r.provinces || [])[0] === 4, r);
    rec("…province 4 is now continent 0", contOf(file, 4) === 0, contOf(file, 4));
    rec("⭐⭐ …while the base game's own sea continent on province 2 is untouched", contOf(file, 2) === 2, contOf(file, 2));
    rec("⭐ …and the rule and the fixer agree afterwards", report(mod, GAME).length === 0, report(mod, GAME).length);
  }

  console.log("\n4. The existing contract: a fixture with no base game still gets fixed");
  {
    // test-map-fix-rivers-continents.js runs with no gameRoot at all. With nothing to compare against, the row
    // is attributed to the mod — the same answer provinceRowIsTheModsOwn and modOwnsMapFile already give.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sc-bare-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Bare"\nreplace_path="map"\n');
    mk(path.join(mod, "map", "definition.csv"), csv(["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;false;plains;3", "2;20;0;0;sea;false;ocean;5"]));
    const r = md.fixSeaContinents({ modRoot: mod });
    rec("no base game: the sea continent is repaired", r.fixed === 1 && (r.provinces || [])[0] === 2, r);
  }

  console.log(`\n=== auto-fix leaves the base game's sea continents alone: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
