// A railways.txt row is judged the way HOI4 reads it: a level the game will cap or skip, and a row the game will
// skip or misread, are reported — for a railways.txt the mod ships. #a-railway-row-is-read-the-way-the-game-reads-it
//
// Two gaps found by the 2026-09-11 engine gap analysis, each confirmed by an adversarial verifier reading hoi4.exe:
//
//   ⛔ LEVEL. SetRailway (railway_manager.cpp) logs "Railway level > NDefines::NSupply::MAX_RAILWAY_LEVEL (province %i,
//      neighbor index %i, level %i)" and writes the define back into the slot — a clamp, not a crash — and returns
//      without storing a level of 0 ("Level > 0"). MAX_RAILWAY_LEVEL is a define: vanilla 5 (00_defines.lua:4263),
//      Millennium Dawn 6, Old World Blues 5. Nova never looked at a row's level, and writeRailway puts no ceiling on it.
//
//   ⛔ SHAPE. The loader reads map/railways.txt as ONE token stream — level, count, then `count` province ids — with no
//      resync at line breaks, and drops a path of fewer than 2 ("PathLength > 1"). Nova's parseRailways reads LINES and
//      silently drops a row with fewer than three tokens or any non-number, so a malformed row vanished from every
//      check, and a row whose count disagrees with its own line makes the game read every later railway differently
//      from what the editor shows.
//
// Measured on vanilla, MD, R56, OWB, NV and RoN (909/1,284/979/1,424/1,655/898 rows): 0 levels outside 1..the map's own
// define, 0 counts under 2, 0 count/line mismatches, 0 non-integer tokens, 0 `#`. NV ships 2 rows that visit a province
// twice — a loop is not malformed. Both rules are warnings: the game logs, caps or skips; nothing shows a crash.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-railrow-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");
const tmps = [SANDBOX];
const NOGAME = path.join(os.tmpdir(), "nova-no-game-dir");

const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-railrow-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const found = (opts, rule) => md.validateMapFiles(opts).filter((p) => p.rule === rule);

try {
  console.log("1. ⛔ A level the game will skip (0) or cap (above MAX_RAILWAY_LEVEL) is reported");
  {
    const mod = mkRoot("levels", { "descriptor.mod": 'name="Levels"\n', "map/railways.txt": "3 2 1 2\n0 2 3 4\n7 2 5 6\n" });
    const p = found({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }, "railway_level_out_of_range");
    rec("reported once", p.length === 1, p.map((x) => x.message.slice(0, 80)));
    const lines = ((p[0] || {}).items || []).map((i) => i.line).sort();
    rec("⭐⭐⭐ the level-0 row (line 2) and the level-7 row (line 3) — not the level-3 row", JSON.stringify(lines) === "[2,3]", (p[0] || {}).items);
    rec("⭐ the message names the define and the cap it used", !!p[0] && /MAX_RAILWAY_LEVEL/.test(p[0].message) && /\b5\b/.test(p[0].message), p[0] && p[0].message);
    rec("…a warning, not fatal", !!p[0] && p[0].severity === "warning" && isFatalRule("railway_level_out_of_range") === false, p[0] && p[0].severity);
    rec("…with a label", mapRuleLabel("railway_level_out_of_range") !== "Railway level out of range", mapRuleLabel("railway_level_out_of_range"));
  }

  console.log("\n2. ⛔ A mod that raises MAX_RAILWAY_LEVEL is judged by its own value (Millennium Dawn sets 6)");
  {
    const mod = mkRoot("raised", {
      "descriptor.mod": 'name="Raised"\n',
      "map/railways.txt": "3 2 1 2\n0 2 3 4\n7 2 5 6\n",
      "common/defines/01_mine.lua": "\tNDefines.NSupply.MAX_RAILWAY_LEVEL = 8 -- update railway texture as well\n",
    });
    const p = found({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }, "railway_level_out_of_range");
    const lines = ((p[0] || {}).items || []).map((i) => i.line);
    rec("⭐⭐⭐ level 7 is fine under a cap of 8", !lines.includes(3), lines);
    rec("⭐⭐ …while level 0 is still reported — the define is read, not switched off", lines.includes(2), lines);
  }

  console.log("\n3. ⛔ A row the game will skip or misread is reported; a comment or a loop is not");
  {
    const mod = mkRoot("shape", {
      "descriptor.mod": 'name="Shape"\n',
      "map/railways.txt": [
        "# a note the editor wrote",   // line 1: a comment is not a token
        "1 3 4 5 4",                   // line 2: a loop — NV ships two of these
        "1 2 10 11 # trailing note",   // line 3: fine, with a trailing comment
        "1 1 5",                       // line 4: a path of one — HOI4 drops it
        "1 3 7 8",                     // line 5: says 3, has 2 — from here the game reads different railways
        "1 2 9 x",                     // line 6: not a number
      ].join("\n") + "\n",
    });
    const p = found({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }, "railway_malformed_row");
    rec("reported once", p.length === 1, p.map((x) => x.message.slice(0, 80)));
    const items = (p[0] || {}).items || [];
    const at = (kind) => items.filter((i) => i.kind === kind).map((i) => i.line);
    rec("⭐⭐⭐ the one-province path on line 4", JSON.stringify(at("too-short")) === "[4]", items);
    rec("⭐⭐⭐ the first line whose count disagrees with its own ids, line 5 — and only the first", JSON.stringify(at("misaligned")) === "[5]", items);
    rec("⭐⭐ the non-number on line 6", JSON.stringify(at("not-a-number")) === "[6]", items);
    rec("⭐⭐ the comment lines and the loop are not reported", !items.some((i) => [1, 2, 3].includes(i.line)), items);
    rec("⭐ the message says the game reads the file as one stream", !!p[0] && /stream|from (here|there) on/i.test(p[0].message), p[0] && p[0].message);
    rec("…a warning, not fatal", !!p[0] && p[0].severity === "warning" && isFatalRule("railway_malformed_row") === false);
    rec("…with a label", mapRuleLabel("railway_malformed_row") !== "Railway malformed row", mapRuleLabel("railway_malformed_row"));
  }

  console.log("\n4. ⛔ Only a railways.txt the mod ships");
  {
    const base = mkRoot("base", { "map/railways.txt": "0 2 3 4\n1 1 5\n9 2 1 2\n" });
    const addon = mkRoot("addon", { "descriptor.mod": 'name="Addon"\n' });
    const opts = { modRoot: addon, gameRoot: base, dependencyRoots: [] };
    rec("⭐⭐⭐ an add-on is not told about the base's out-of-range levels", found(opts, "railway_level_out_of_range").length === 0);
    rec("⭐⭐⭐ …nor about the base's malformed rows", found(opts, "railway_malformed_row").length === 0);
  }

  console.log("\n5. A clean file says nothing");
  {
    const mod = mkRoot("clean", { "descriptor.mod": 'name="Clean"\n', "map/railways.txt": "1 3 1 2 3\n5 2 4 5\n" });
    const opts = { modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] };
    rec("no level report", found(opts, "railway_level_out_of_range").length === 0);
    rec("no shape report", found(opts, "railway_malformed_row").length === 0);
  }

  console.log(`\n=== a railway row is read the way the game reads it: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
