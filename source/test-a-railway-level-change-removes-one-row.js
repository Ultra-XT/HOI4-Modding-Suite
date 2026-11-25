// Changing one railway's level must not delete a different railway.
// #a-railway-level-change-removes-one-row
//
// removeRailwayRow deleted EVERY row whose province path matched, forward or reversed, with no early exit
// and no level check. The client's changeRailwayLevel was remove-then-add (one relevel write since review R6), and removeRailway splices exactly
// ONE entry out of its model. So on any file carrying the same path twice, one click on the level arrow:
//
//     disk  : both rows removed, one added back          -> a railway the user never touched is gone
//     screen: one row changed level                      -> the editor shows a map the file no longer has
//
// Shipping maps do carry duplicates: Millennium Dawn's railways 1251 and 1252 share a path, and on Road to 56
// changing railway 612 also removed railway 871 at the other end of the file (measured by the overnight
// invariant audit, confirmed by an independent verifier).
//
// ⚠️ LEVEL IS PART OF THE IDENTITY. First-match alone is not enough: with rows [L1 path, L2 path] and the user
// raising the SECOND, removing the first path match would delete the L1 row and leave the model and the file
// disagreeing again. So remove takes the level the client is looking at, and prefers the row that has it.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rl-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

const rows = (text) => String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

try {
  console.log("1. ⛔ A path listed twice loses exactly one row");
  {
    const text = "1 2 10 11 \n1 2 10 11 \n";
    const r = md.removeRailwayRow(text, [10, 11]);
    rec("⭐⭐⭐ exactly one row is removed, not both", r.removed === 1, r.removed);
    rec("…and the other copy is still in the file", rows(r.text).length === 1 && rows(r.text)[0] === "1 2 10 11", rows(r.text));
  }
  {
    const text = "1 2 10 11 \n1 2 11 10 \n";
    const r = md.removeRailwayRow(text, [10, 11]);
    rec("⭐⭐ a forward and a reversed copy: still only one removed", r.removed === 1, r.removed);
  }

  console.log("\n2. ⭐⭐⭐ Level picks WHICH row, so model and file stay in step");
  {
    const text = "1 2 10 11 \n2 2 10 11 \n";
    const r = md.removeRailwayRow(text, [10, 11], 2);
    rec("removing the level-2 copy removes the level-2 row", r.removed === 1 && rows(r.text).length === 1 && rows(r.text)[0] === "1 2 10 11", rows(r.text));
    const r1 = md.removeRailwayRow(text, [10, 11], 1);
    rec("…and asking for level 1 removes the level-1 row instead", r1.removed === 1 && rows(r1.text)[0] === "2 2 10 11", rows(r1.text));
    const rNone = md.removeRailwayRow(text, [10, 11], 5);
    rec("⚠️ a level nobody has falls back to the first path match, rather than refusing", rNone.removed === 1, rNone.removed);
  }

  console.log("\n3. The contract the existing tests pin still holds");
  {
    const rails = "1 2 3030 3133 \n1 3 1 2 3 \n";
    rec("an exact path is removed", md.removeRailwayRow(rails, [3030, 3133]).removed === 1);
    rec("…the reversed path too", md.removeRailwayRow(rails, [3133, 3030]).removed === 1);
    rec("…a path nobody has removes nothing", md.removeRailwayRow(rails, [1, 2, 3, 4]).removed === 0);
    rec("…and the unrelated railway survives", rows(md.removeRailwayRow(rails, [3030, 3133]).text).includes("1 3 1 2 3"));
  }

  console.log("\n4. ⭐⭐ Through the real writer, the way a level change arrives from the client");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rl-mod-")); tmps.push(mod);
    const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
    mk(path.join(mod, "descriptor.mod"), 'name="RL"\nreplace_path="map"\nreplace_path="history/states"\n');
    mk(path.join(mod, "map", "definition.csv"),
      ["0;0;0;0;land;false;unknown;0", "10;10;0;0;land;false;plains;1", "11;20;0;0;land;false;plains;1", "12;30;0;0;land;false;plains;1"].join("\r\n") + "\r\n");
    mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 10 11 12 }\n\thistory = { owner = AAA }\n}\n');
    // Two railways on the same path at different levels, and an unrelated one.
    mk(path.join(mod, "map", "railways.txt"), "1 2 10 11 \n2 2 10 11 \n1 2 11 12 \n");
    const A = { modRoot: mod, gameRoot: "", dependencyRoots: [] };

    // The user raises the SECOND railway (level 2 -> 3): remove at its current level, then add at the new one.
    const rm = md.writeRailway(Object.assign({ action: "remove", provinces: [10, 11], level: 2 }, A));
    const add = md.writeRailway(Object.assign({ action: "add", provinces: [10, 11], level: 3 }, A));
    rec("the remove and the add both succeeded", !rm.error && !add.error, { rm: rm.error, add: add.error });
    const after = rows(fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8"));
    rec("⭐⭐⭐ the level-1 railway on the same path is untouched", after.includes("1 2 10 11"), after);
    rec("⭐⭐ …the raised railway is now level 3", after.includes("3 2 10 11"), after);
    rec("…the level-2 row is gone", !after.includes("2 2 10 11"), after);
    rec("…and the unrelated railway survives", after.includes("1 2 11 12"), after);
    rec("…three rows in, three rows out", after.length === 3, after);
    // #a-railway-level-change-is-one-write — the level arrow's write since review R6: one `relevel`, the row's level changed where it
    // stands. The same identity rule: the level names WHICH copy of a path.
    const before = rows(fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8"));
    const rl = md.writeRailway(Object.assign({ action: "relevel", provinces: [10, 11], level: 3, to: 4 }, A));
    const now = rows(fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8"));
    rec("⭐⭐ a relevel changes the level-3 copy, in its own place, and nothing else", !rl.error && now.length === before.length
      && now.every((l, i) => (before[i] === "3 2 10 11" ? l === "4 2 10 11" : l === before[i])), { before, now, error: rl.error });
  }

  console.log("\n5. The client sends the level it is looking at");
  {
    // ⚠️ SOURCE-SHAPE, and labelled as such: section 4 is the behavioural control (and test-a-railway-link-joins-neighbours.js
    // runs changeRailwayLevel itself through the endpoint). This only pins that the two client callers pass `level`, because
    // without it the server cannot tell the copies apart: the level change's one `relevel` write (#a-railway-level-change-is-one-write)
    // and removeRailway's remove.
    const src = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r/g, "");
    const body = (name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; return src.slice(i, src.indexOf("\n  }", i)); };
    rec("changeRailwayLevel sends the current level on its relevel",
      /queueWrite\("\/api\/map\/railway",\s*\{\s*action:\s*"relevel",[^}]*level:\s*cur\b/.test(body("changeRailwayLevel")), body("changeRailwayLevel").slice(0, 80));
    rec("removeRailway sends the level on remove",
      /queueWrite\("\/api\/map\/railway",\s*\{\s*action:\s*"remove",[^}]*level:/.test(body("removeRailway")), body("removeRailway").slice(0, 80));
  }

  console.log(`\n=== a railway level change removes one row: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
