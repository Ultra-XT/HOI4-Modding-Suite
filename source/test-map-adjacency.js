// Adjacency editor backend: parse + add/remove rows in map/adjacencies.csv, preserving the header, the
// optional "-1" terminator row, and the file's CRLF line endings. Pure functions + the mod-only disk
// writer (materialises the effective file like the other map writers). Node test (run-tests.js picks it up).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
// A vanilla-style file (CRLF) WITH a -1 terminator.
const withTerm = [HEADER, "7071;13275;sea;5322;-1;-1;-1;-1;;Kinmen", "11645;9645;impassable;-1;-1;-1;-1;-1;;Caucasus", "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";
// An MD-style file (CRLF) with NO terminator (last line is a real data row), trailing newline.
const noTerm = [HEADER, "7071;13275;sea;5322;-1;-1;-1;-1;;Kinmen", "4545;7624;impassable;-1;-1;-1;-1;-1;;Caucasus"].join("\r\n") + "\r\n";

// ── Part A: pure parse ──
const parsed = md.parseAdjacencies(withTerm);
ok("parse skips header + terminator (2 data rows)", parsed.length === 2, parsed.length);
ok("parse reads a sea strait row", parsed[0].from === 7071 && parsed[0].to === 13275 && parsed[0].type === "sea" && parsed[0].through === 5322, parsed[0]);
ok("parse reads an impassable row", parsed[1].type === "impassable" && parsed[1].comment === "Caucasus", parsed[1]);

// ── Part B: add — inserts BEFORE the terminator, preserves it + CRLF ──
const added = md.addAdjacencyRow(withTerm, { from: 100, to: 200, type: "sea", through: 300, comment: "Strait" });
ok("add: CRLF preserved", added.includes("\r\n") && !/[^\r]\n/.test(added), JSON.stringify(added.slice(-40)));
{
  const lines = added.split("\r\n").filter((l) => l.trim());
  ok("add: terminator row is still LAST", (lines[lines.length - 1].split(";")[0]) === "-1", lines[lines.length - 1]);
  ok("add: new row sits just before the terminator", /^100;200;sea;300;/.test(lines[lines.length - 2]), lines[lines.length - 2]);
  ok("add: parse now sees 3 data rows", md.parseAdjacencies(added).length === 3);
}

// ── Part B2: add to a file WITHOUT a terminator (MD-style) → appended after the last data row ──
const added2 = md.addAdjacencyRow(noTerm, { from: 1, to: 2, type: "impassable" });
{
  const data = md.parseAdjacencies(added2);
  ok("add (no terminator): 3 data rows now", data.length === 3, data.length);
  ok("add (no terminator): the new row is present", data.some((a) => a.from === 1 && a.to === 2 && a.type === "impassable"), data);
  ok("add (no terminator): CRLF preserved", added2.includes("\r\n"));
}

// ── Part C: remove — drops the matching row, keeps header + terminator ──
const rem = md.removeAdjacencyRow(withTerm, 7071, 13275);
ok("remove: reported 1 removed", rem.removed === 1, rem.removed);
ok("remove: the row is gone", !md.parseAdjacencies(rem.text).some((a) => a.from === 7071), md.parseAdjacencies(rem.text));
ok("remove: terminator still last", rem.text.split("\r\n").filter((l) => l.trim()).pop().split(";")[0] === "-1");
ok("remove: header still first", rem.text.split("\r\n")[0] === HEADER);
ok("remove: non-existent pair removes nothing", md.removeAdjacencyRow(withTerm, 999, 888).removed === 0);

// ── Part D: disk writer (mod-only, materialise) ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adj-"));
const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjbase-"));
try {
  // (D1) materialise: mod has no csv, a "base/vanilla" root does → writer reads base, writes mod copy.
  fs.mkdirSync(path.join(base, "map"), { recursive: true });
  fs.writeFileSync(path.join(base, "map", "adjacencies.csv"), withTerm);
  let r = md.writeAdjacency({ modRoot: mod, gameRoot: base, dependencyRoots: [], action: "add", from: 11, to: 22, type: "sea", through: 33, comment: "Test strait" });
  ok("writer add (materialise) changed", r.changed && r.wroteFullCsv, r);
  let modCsv = fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");
  ok("writer add: mod file has the new strait", md.parseAdjacencies(modCsv).some((a) => a.from === 11 && a.to === 22 && a.through === 33), modCsv);
  ok("writer add: terminator preserved in mod file", modCsv.split("\r\n").filter((l) => l.trim()).pop().split(";")[0] === "-1");
  ok("writer add: CRLF preserved in mod file", modCsv.includes("\r\n"));

  // (D2) remove from the now-existing mod file.
  r = md.writeAdjacency({ modRoot: mod, gameRoot: base, dependencyRoots: [], action: "remove", from: 11, to: 22 });
  ok("writer remove changed (removed 1)", r.changed && r.removed === 1, r);
  modCsv = fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");
  ok("writer remove: strait gone from mod file", !md.parseAdjacencies(modCsv).some((a) => a.from === 11 && a.to === 22), modCsv);

  // (D3) guards.
  ok("writer: sea adjacency without a through province is rejected", !md.writeAdjacency({ modRoot: mod, gameRoot: base, action: "add", from: 5, to: 6, type: "sea" }).changed);
  ok("writer: self-adjacency rejected", !md.writeAdjacency({ modRoot: mod, gameRoot: base, action: "add", from: 9, to: 9, type: "impassable" }).changed);

  // (D4) fresh file when none exists anywhere (add to an empty base).
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adj2-"));
  try {
    const r2 = md.writeAdjacency({ modRoot: mod2, gameRoot: "", dependencyRoots: [], action: "add", from: 1, to: 2, type: "impassable", comment: "Wall" });
    ok("writer add (no file anywhere) creates a fresh adjacencies.csv", r2.changed && fs.existsSync(path.join(mod2, "map", "adjacencies.csv")), r2);
    const t2 = fs.readFileSync(path.join(mod2, "map", "adjacencies.csv"), "utf8");
    ok("fresh file has header + the row", t2.split("\r\n")[0] === HEADER && md.parseAdjacencies(t2).some((a) => a.from === 1 && a.to === 2), t2);
  } finally { fs.rmSync(mod2, { recursive: true, force: true }); }
} finally {
  fs.rmSync(mod, { recursive: true, force: true });
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\nMAP-ADJACENCY TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
