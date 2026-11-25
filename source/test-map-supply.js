// Supply hubs + railways backend: parse + add/remove lines in map/supply_nodes.txt and map/railways.txt,
// preserving the files' LF line endings and only appending/removing whole lines (existing lines untouched).
// Pure functions + the mod-only disk writers. Node test (run-tests.js picks it up).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// MD-style samples: LF, trailing space per line, trailing newline.
const supply = "1 70 \n1 81 \n1 86 \n";
const rails = "1 4 3277 11251 317 6389 \n1 2 3030 3133 \n";

// ── parse ──
const sn = md.parseSupplyNodes(supply);
ok("parseSupplyNodes: 3 hubs", sn.length === 3, sn);
ok("parseSupplyNodes: level + province read", sn[0].level === 1 && sn[0].province === 70, sn[0]);
const rw = md.parseRailways(rails);
ok("parseRailways: 2 railways", rw.length === 2, rw);
ok("parseRailways: first path is the 4 provinces", JSON.stringify(rw[0].provinces) === JSON.stringify([3277, 11251, 317, 6389]), rw[0]);
ok("parseRailways: second path is 2 provinces", JSON.stringify(rw[1].provinces) === JSON.stringify([3030, 3133]), rw[1]);

// ── supply node add/remove (pure) ──
let r = md.addSupplyNodeRow(supply, 999, 1);
ok("addSupplyNode: appended", r.changed && md.parseSupplyNodes(r.text).some((n) => n.province === 999), r.text);
ok("addSupplyNode: LF preserved (no CRLF)", !r.text.includes("\r\n"));
ok("addSupplyNode: existing lines untouched", r.text.indexOf("1 70 \n1 81 \n1 86 \n") === 0, JSON.stringify(r.text));
ok("addSupplyNode: duplicate province is a no-op", !md.addSupplyNodeRow(supply, 70).changed);
const rsn = md.removeSupplyNodeRow(supply, 81);
ok("removeSupplyNode: removed 1", rsn.removed === 1 && !md.parseSupplyNodes(rsn.text).some((n) => n.province === 81), rsn);
ok("removeSupplyNode: others kept", md.parseSupplyNodes(rsn.text).length === 2);

// ── railway add/remove (pure) ──
let rr = md.addRailwayRow(rails, [10, 20, 30], 1);
ok("addRailway: appended a 3-province path", rr.changed && md.parseRailways(rr.text).some((x) => JSON.stringify(x.provinces) === JSON.stringify([10, 20, 30])), rr.text);
ok("addRailway: line is '1 3 10 20 30 '", /\n1 3 10 20 30 /.test("\n" + rr.text), JSON.stringify(rr.text));
ok("addRailway: rejects <2 provinces", !md.addRailwayRow(rails, [5]).changed);
ok("removeRailway: removes an exact path", md.removeRailwayRow(rails, [3030, 3133]).removed === 1);
ok("removeRailway: matches the REVERSED path too", md.removeRailwayRow(rails, [3133, 3030]).removed === 1);
ok("removeRailway: non-existent path removes nothing", md.removeRailwayRow(rails, [1, 2, 3]).removed === 0);

// ── disk writers (mod-only, materialise from a base root) ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sup-"));
const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-supbase-"));
try {
  fs.mkdirSync(path.join(base, "map"), { recursive: true });
  fs.writeFileSync(path.join(base, "map", "supply_nodes.txt"), supply);
  fs.writeFileSync(path.join(base, "map", "railways.txt"), rails);

  let w = md.writeSupplyNode({ modRoot: mod, gameRoot: base, dependencyRoots: [], action: "add", province: 555, level: 2 });
  ok("writeSupplyNode add (materialise) changed", w.changed && w.wroteFullFile, w);
  let t = fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8");
  ok("writeSupplyNode: mod file has hub 555 at level 2", md.parseSupplyNodes(t).some((n) => n.province === 555 && n.level === 2), t);
  ok("writeSupplyNode: original hubs preserved", md.parseSupplyNodes(t).length === 4 && !t.includes("\r\n"), t);
  w = md.writeSupplyNode({ modRoot: mod, gameRoot: base, action: "remove", province: 555 });
  ok("writeSupplyNode remove", w.changed && w.removed === 1 && !md.parseSupplyNodes(fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8")).some((n) => n.province === 555));

  w = md.writeRailway({ modRoot: mod, gameRoot: base, dependencyRoots: [], action: "add", provinces: [10, 20, 30], level: 1 });
  ok("writeRailway add changed", w.changed, w);
  t = fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8");
  ok("writeRailway: mod file has the new path", md.parseRailways(t).some((x) => JSON.stringify(x.provinces) === JSON.stringify([10, 20, 30])), t);
  w = md.writeRailway({ modRoot: mod, gameRoot: base, action: "remove", provinces: [10, 20, 30] });
  ok("writeRailway remove", w.changed && w.removed === 1);

  ok("writeRailway: rejects a 1-province path", !md.writeRailway({ modRoot: mod, gameRoot: base, action: "add", provinces: [9] }).changed);

  // fresh-file creation when none exists anywhere.
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sup2-"));
  try {
    const fr = md.writeSupplyNode({ modRoot: mod2, gameRoot: "", action: "add", province: 7, level: 1 });
    ok("writeSupplyNode creates a fresh file when none exists", fr.changed && fs.existsSync(path.join(mod2, "map", "supply_nodes.txt")), fr);
  } finally { fs.rmSync(mod2, { recursive: true, force: true }); }
} finally {
  fs.rmSync(mod, { recursive: true, force: true });
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\nMAP-SUPPLY TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
