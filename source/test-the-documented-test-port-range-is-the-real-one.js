// CLAUDE.md tells every reader — human or agent — which ports the suite binds, and which are safe to use
// beside it. It said "the 53400–53700 band" and "anything concurrent must use 54000+".
//
// Both halves were wrong. Measured 2026-09-23: 195 test files claim a port, from 50000 to 54790, and EIGHTEEN
// of them live in 54100–54799 — the very band the note called safe. One claims 54790, which a scratch
// world-build script had been defaulting to, so running a build beside the suite collided with
// test-a-port-you-asked-for-is-not-quietly-swapped.js: the one test about ports not being quietly swapped.
//
// A number in prose has no way to notice that the code moved. This derives both sides and compares them, so
// the note fails a test instead of misleading a reader. Same reason the line-endings paragraph in CLAUDE.md
// carries its own correction: "do not trust the list; MEASURE".
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DOC = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");

// ── what the tests actually claim, derived ────────────────────────────────────────────────────────────────
// The runner reads each file's claim out of its own source; this reads the same thing the same way, so a new
// test that binds a port joins this check without anyone editing it.
const ports = [];
const claimants = new Map();
for (const f of fs.readdirSync(ROOT)) {
  if (!/^test-.*\.js$/.test(f) || f === path.basename(__filename)) continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of src.matchAll(/\b(5[0-9]{4})\b/g)) {
    const p = +m[1];
    if (p < 50000 || p > 60000) continue;
    ports.push(p);
    if (!claimants.has(p)) claimants.set(p, []);
    if (!claimants.get(p).includes(f)) claimants.get(p).push(f);
  }
}
assert.ok(ports.length > 50, "expected the suite to claim plenty of ports, found " + ports.length);
const lo = Math.min(...ports), hi = Math.max(...ports);

// ── what CLAUDE.md says ───────────────────────────────────────────────────────────────────────────────────
const stated = /Tests bind ports from \*\*(\d+) to (\d+)\*\*|Tests bind ports from (\d+) to (\d+)/.exec(DOC);
assert.ok(stated, 'CLAUDE.md no longer contains a "Tests bind ports from X to Y" sentence — the port note is the thing this test guards; if it moved, move this anchor with it');
const docLo = +(stated[1] || stated[3]), docHi = +(stated[2] || stated[4]);

assert.strictEqual(docLo, lo, `CLAUDE.md says the suite's lowest port is ${docLo}; it is ${lo} (${(claimants.get(lo) || []).slice(0, 2).join(", ")})`);
assert.strictEqual(docHi, hi, `CLAUDE.md says the suite's highest port is ${docHi}; it is ${hi} (${(claimants.get(hi) || []).slice(0, 2).join(", ")})`);

// ── and that the port it recommends for concurrent work is above every port a test claims ─────────────────
const rec = /For concurrent work use \*\*(\d+)\+\*\*/.exec(DOC);
assert.ok(rec, 'CLAUDE.md no longer recommends a floor for concurrent work ("For concurrent work use **N+**")');
const floor = +rec[1];
const inTheWay = [...new Set(ports)].filter((p) => p >= floor).sort((a, b) => a - b);
assert.deepStrictEqual(inTheWay, [],
  `CLAUDE.md tells concurrent work to use ${floor}+, but ${inTheWay.length} test port(s) sit there: `
  + inTheWay.map((p) => p + " (" + (claimants.get(p) || []).join(", ") + ")").join("; ")
  + " — that is the mistake this test exists to stop: the advice sent work straight into the suite's own ports.");

// ── the hazard the range sits in, recorded so the note cannot quietly lose it ─────────────────────────────
// Windows' default dynamic range is 49152-65535 (netsh int ipv4 show dynamicport tcp). Every port above is
// inside it, so any outbound connection on the box can transiently hold one and a test fails alone-passing.
assert.ok(/49152/.test(DOC),
  "CLAUDE.md no longer mentions 49152 — the suite's ports all sit inside Windows' ephemeral range, which is why "
  + "a lone 'another Nova may be holding this port' failure is usually not a real collision. That warning is "
  + "the difference between re-running a file and hunting a ghost for an hour.");

console.log("PASS: CLAUDE.md's port note matches the suite — " + new Set(ports).size + " distinct ports across "
  + [...new Set(ports)].length + " claims, " + lo + ".." + hi + ", and nothing at or above the " + floor + " floor it recommends");
