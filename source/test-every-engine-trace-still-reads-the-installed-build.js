// #an-engine-trace-pinned-to-a-build-that-is-gone-reads-as-a-pass — WHEN THE GAME UPDATES, EVERY TRACE PINNED TO THE OLD
// BUILD STOPS RUNNING AND NOTHING SAYS SO.
//
// THE DEFECT. Fifteen files in this repo read hoi4.exe and assert things about the engine at exact virtual addresses. An
// address belongs to one build, so each one gates itself on the exe's byte size and SKIPS when it does not match. That is
// the right gate — but a skip reads as a pass. Steam replaced 1.19.2 (55,680,632 bytes) with 1.19.3 (55,778,424) on
// 2026-09-17, and from that moment fourteen of those files kept reporting green with their engine sections dead. Two of
// them are the files that hold this project to "a map message claims only what the engine shows"; one of those, at the
// time this was written, had 123 checks passing and a section 5 that had not executed since the update.
//
// Nothing in the suite could see it. run-tests.js counts skips per RUN and prints the number, which catches a whole file
// that did not run — but these are skips INSIDE a green file, and the only way to know was to read that file's output.
// The knowledge was not even missing: map-data.js and test-a-generated-world-gets-a-supply-network.js both carry a note
// saying Steam replaced the build mid-batch and every VA moved. The note existed; the guard did not. #a-guard-that-matters
// -goes-in-test-star
//
// WHAT THIS DOES. It derives, from the shipped sources, every exe byte-size that a live gate compares against — with
// comments masked, because half these files also NAME the old size in their prose — and holds each one to the exe that is
// actually installed. A gate on a build that is not here is a dead section, and this FAILS for it, naming the file. That
// is a re-derivation request, not noise: a trace against a build that no longer exists is worse than no trace, because it
// still reads as evidence in the file's comments while proving nothing.
//
// ⭐⭐⭐ IT REPORTS EACH DORMANT FILE AS A SKIP, AND IT DOES NOT FAIL FOR THEM. That is this project's own settled answer
// to a skip reading as a pass, written down in CLAUDE.md about the runners: "What they do NOT do is fail on skips — so
// the summary line names the skip count explicitly and counts it out of the denominator." Failing here would paint the
// whole suite red for a debt that predates this file and that clears only when someone re-derives twelve files' worth of
// addresses; a suite that is red for weeks stops being read, which is the decay it was meant to prevent.
//
// So the two halves compose. This file DERIVES which traces are dormant and emits one SKIP naming them; run-tests.js was
// taught in the same commit to collect SKIP lines out of files that PASSED and name them in the summary, the way it
// already refuses to let a skipped FILE read as a pass. A full run now ends on "All green — but N check group(s) inside
// M passing file(s) did not run (listed above)". #fix-it-in-the-runner-not-in-N-files
//
// ⚠️ WHAT IT DOES FAIL FOR is the mechanism going dead: the scraper finding no gates at all, or NOT ONE trace in the tree
// reading the installed build. Either means the engine evidence has stopped being maintained altogether rather than
// lagging one update, and that is worth a red run.
//
// HOW TO CLEAR IT. Re-derive that file's addresses against the installed build and move its gate. The method is in
// test-a-missing-capital-stops-save-only-for-a-country-with-land.js section 1 and in the note above generateSupplyNetwork
// in map-data.js: find the STRING, find what references it, walk out from there. Never re-point a gate at the new size
// without re-reading the bytes — that turns a dead section into a lying one.
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";

// Every live gate: `<something>.size !== N`, `<something>.length !== N`, or `const X = N` beside an EXE
// constant. Comments masked length-preservingly so line numbers survive and the prose that names the old
// size is not mistaken for a gate. Derived from source — a hand-kept list of these files is exactly what
// goes stale between game updates, which is the bug this file exists for.
const GATE = /(?:\.size|\.length)\s*(?:!==|!=|===|==)\s*(\d{7,9})\b|\bEXE_BYTES\s*=\s*(\d{7,9})\b/g;

function trackedJsFiles() {
  // git ls-files, so the gitignored backup trees stay out without a hand-kept skip list.
  const out = execFileSync("git", ["ls-files", "-z", "*.js"], { cwd: __dirname, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  return out.toString("utf8").split("\0").filter(Boolean);
}

(() => {
  console.log("\n=== every engine trace is pinned to the build that is installed ===");

  let files = [];
  try { files = trackedJsFiles(); } catch (e) { files = []; }
  rec("THE CONTROL: the tracked .js files were listed", files.length > 100, files.length);
  if (files.length <= 100) { files = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f)); }

  // (1) scrape the gates
  const gates = new Map();   // size -> [file, …]
  for (const rel of files) {
    let src = "";
    try { src = fs.readFileSync(path.join(__dirname, rel), "utf8"); } catch (_) { continue; }
    if (!/hoi4\.exe/i.test(src)) continue;
    const masked = maskJsComments(src);
    GATE.lastIndex = 0;
    let m;
    const seen = new Set();
    while ((m = GATE.exec(masked))) {
      const n = Number(m[1] || m[2]);
      if (!Number.isFinite(n) || n < 1000000) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      if (!gates.has(n)) gates.set(n, []);
      gates.get(n).push(rel);
    }
  }
  // THE CONTROL for the scraper itself: it must find the gate this very file's neighbour carries, and it
  // must NOT find a size that appears only in prose. Both are real properties of the tree right now.
  const allPinned = [...gates.keys()].sort();
  rec("THE SCRAPER'S CONTROL: it found live exe gates at all", gates.size > 0, allPinned);
  rec("…and more than one file carries one, which is why this is one guard and not fourteen",
    [...gates.values()].reduce((n, v) => n + v.length, 0) >= 5, Object.fromEntries([...gates].map(([k, v]) => [k, v.length])));
  {
    // A size written ONLY in a comment must not be scraped. Built here rather than assumed about the tree.
    const proseOnly = maskJsComments("// hoi4.exe 1.0.0 (12,345,678 bytes)\nconst x = 1;\n");
    GATE.lastIndex = 0;
    rec("⭐⭐ THE CONTROL: a build size that appears only in prose is not read as a gate", GATE.exec(proseOnly) === null);
  }

  // (2) the installed build
  let installed = 0;
  try { installed = fs.statSync(EXE).size; } catch (_) { installed = 0; }
  if (!installed) {
    skip("hoi4.exe is not installed at " + EXE + " — every one of these gates skips legitimately here, and nothing this machine had has been lost. " +
      (gates.size ? "Pinned builds in the tree: " + allPinned.join(", ") : ""));
    skip("…so the live check DID NOT RUN. On the machine that owns these traces it does.");
  } else {
    console.log("  ..   installed hoi4.exe is " + installed.toLocaleString() + " bytes; the tree pins " + allPinned.map((n) => n.toLocaleString()).join(", "));
    const live = gates.get(installed) || [];
    const dead = [...gates].filter(([n]) => n !== installed);
    const deadFiles = [...new Set([].concat(...dead.map(([, v]) => v)))].sort();
    rec("⭐⭐⭐ THE MECHANISM IS ALIVE: at least one file's engine section runs against the installed build", live.length > 0,
      { installed: installed.toLocaleString(), pinned: allPinned.map((n) => n.toLocaleString()) });
    if (deadFiles.length) {
      // One SKIP line, naming the count — run-tests.js lifts it into the summary of a full run.
      skip(`${deadFiles.length} file(s) pin an engine gate to a build that is NOT installed (${dead.map(([n, v]) => n.toLocaleString() + "×" + v.length).join(", ")} vs the installed ${installed.toLocaleString()}) — their engine sections DID NOT RUN and those files are green anyway`);
      for (const f of deadFiles) console.log("       · " + f);
      console.log("       To clear: re-derive that file's addresses from the STRINGS against the installed build, then move its gate.");
      console.log("       ⛔ Never move a gate without re-reading the bytes — that turns a dormant section into a lying one.");
    } else {
      rec("⭐⭐ every engine gate in the tree names the installed build", true, installed.toLocaleString());
    }
  }

  console.log(`\n=== every engine trace still reads the installed build: ${checks} checks, ${fails.length} failed, ${skips} SKIPPED (not counted as passes) ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
