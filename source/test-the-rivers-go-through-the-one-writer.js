// rivers.bmp is written in one place for a stroke or a plan — writeRiversPaint — and Generate land's rivers go through it.
// #a-generated-world-has-rivers (batch B, B3; critic R3) — "the fix exists next door and one caller never adopted it"
//
// writeRiversPaint materialises the inherited file, keeps a copy (safeModWrite), patches only the bytes asked for and then gives
// every river it touched a source (fixMalformedRivers onlyTouching). The design's first generateRivers re-implemented all of it
// under a new backup tag — a third copy of the block clearAllRivers had already duplicated once
// (#clearing-every-river-promises-a-backup-that-does-not-exist). So: every function of map-data.js that hands safeModWrite a
// rivers.bmp is one of the writers named here, each still doing so (an allow-list entry that outlived its call is stale), and
// generateRivers writes only through writeRiversPaint. Derived from the source, comments masked.
"use strict";

const fs = require("fs");
const path = require("path");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const raw = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
const code = maskJsLiterals(raw), text = maskJsComments(raw);
// every top-level function, as [name, body text with comments masked]
const fns = [];
for (const m of code.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)) {
  const span = jsBodyAt(code, m.index);
  if (span) fns.push([m[1], text.slice(span[0], span[1] + 1)]);
}
rec("THE CONTROL: the functions of map-data.js are found", fns.length > 500, fns.length);

// a function writes rivers.bmp when it names the file and hands safeModWrite something
const WRITERS = ["writeRiversPaint", "clearAllRivers", "fixMalformedRivers"];
const writes = fns.filter(([, b]) => /rivers\.bmp/.test(b) && /\bsafeModWrite\(/.test(b)).map(([n]) => n);
rec("THE CONTROL: the writers named here are found writing", WRITERS.every((w) => writes.includes(w)), { writes, WRITERS });
rec("⭐ no other function hands safeModWrite a rivers.bmp", writes.every((w) => WRITERS.includes(w)), writes.filter((w) => !WRITERS.includes(w)));

const gen = (fns.find(([n]) => n === "generateRivers") || [])[1] || "";
rec("THE CONTROL: generateRivers is found", gen.length > 0);
rec("⭐ generateRivers writes through writeRiversPaint", /\bwriteRiversPaint\(/.test(gen));
rec("⭐ …and never on its own (no safeModWrite, no patchRiversBmp, no fs write)", !/\bsafeModWrite\(|\bpatchRiversBmp\(|\bfs\.(writeFileSync|renameSync|copyFileSync)\(/.test(gen));
// the gate's own rules are pinned on plans made wrong by hand (test-a-generated-world-has-rivers.js 7b); the planner never makes
// one, so that it stands between the plan and the writer is read here
const gateAt = gen.indexOf("riverPlanGate("), writeAt = gen.indexOf("writeRiversPaint(");
rec("⭐ generateRivers judges the plan by riverPlanGate before it writes, and returns without writing when the gate finds a problem",
  gateAt > 0 && gateAt < writeAt && /\bif \(gate\.problems\.length\) return no\(/.test(gen.slice(gateAt, writeAt)), gen.slice(gateAt, gateAt + 200));

const gl = (fns.find(([n]) => n === "generateLand") || [])[1] || "";
rec("⭐ generateLand draws its rivers by generateRivers, and never writes rivers.bmp itself", /\bgenerateRivers\(/.test(gl) && !/\bwriteRiversPaint\(|\bpatchRiversBmp\(/.test(gl));

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
