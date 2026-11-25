// CLAUDE.md calls line endings "the single most common way an edit here appears to work and does not":
// a scripted edit anchored on a bare \n in a CRLF file matches nothing AND REPORTS SUCCESS. The defence is
// to detect per file — matchExistingLineEndings() — and that defence assumes each file HAS one answer.
//
// Six tracked files had two. public/events.js, public/decisions.js and public/ideas.js each carried exactly
// nine bare-LF lines in an otherwise all-CRLF file — the #vanilla-by-name fix, written into three makers by
// a tool that emitted \n while the files around it used \r\n. Nothing broke at runtime; JavaScript does not
// care. What it does is seed the failure the rule exists to prevent, in the three files most likely to be
// edited next, where the next anchored edit silently matches nothing in the very region last touched.
//
// ⚠️ This asserts CONSISTENCY, not a particular ending. The mix across the repo is real and per-file — LF in
// server.js and research.js, CRLF in app.js and styles.css — and CLAUDE.md is explicit that it cannot be
// predicted from the filename. Demanding one ending repo-wide would be a different (and wrong) rule.
//
// ⭐ The file set is DERIVED FROM GIT, not listed. The backup directories hold 28 more mixed files and are
// correctly gitignored; a hand-written skip list would have to name them, and would rot the first time one
// was added or renamed.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const endings = (buf) => {
  let crlf = 0, lf = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 10) { if (i > 0 && buf[i - 1] === 13) crlf++; else lf++; }
  }
  return { crlf, lf };
};

try {
  console.log("1. The tracked source set, derived from git");
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { cwd: __dirname, maxBuffer: 64 * 1024 * 1024 })
      .toString("utf8").split("\0").filter(Boolean);
  } catch (e) {
    // Not a skip. A guard that cannot run must say so out loud — a skip reads as a pass.
    rec("git ls-files could enumerate the tracked files", false, String(e && e.message).slice(0, 120));
  }
  const sources = tracked.filter((f) => /\.(js|css|html)$/i.test(f));
  rec("there are tracked source files to check", sources.length > 50, sources.length + " files");

  console.log("\n2. No tracked source file mixes the two");
  const mixed = [];
  for (const f of sources) {
    let buf;
    try { buf = fs.readFileSync(path.join(__dirname, f)); } catch (_) { continue; }
    const { crlf, lf } = endings(buf);
    if (crlf > 0 && lf > 0) mixed.push(`${f} (CRLF=${crlf} LF=${lf})`);
  }
  rec("every tracked source file is internally consistent", mixed.length === 0, mixed.slice(0, 12));

  console.log("\n3. The mix BETWEEN files is real — so nothing here should 'fix' it");
  // Assert the corpus exercises both branches. If every tracked file were CRLF, check 2 would be trivially
  // true and this guard would be measuring nothing — and the day someone normalised the repo to one ending,
  // matchExistingLineEndings would start looking like dead code.
  let allCrlf = 0, allLf = 0;
  for (const f of sources) {
    let buf;
    try { buf = fs.readFileSync(path.join(__dirname, f)); } catch (_) { continue; }
    const { crlf, lf } = endings(buf);
    if (crlf > 0 && lf === 0) allCrlf++;
    else if (lf > 0 && crlf === 0) allLf++;
  }
  rec("some tracked sources are CRLF", allCrlf > 0, allCrlf + " files");
  rec("…and some are LF", allLf > 0, allLf + " files");
  rec("…so detecting per file is still load-bearing", allCrlf > 0 && allLf > 0,
    "if this ever fails, the repo was normalised and matchExistingLineEndings needs re-justifying");

  console.log("\n4. The detector bites");
  // Composed, so the check above cannot pass by measuring nothing.
  rec("a mixed buffer is detected", (() => { const e = endings(Buffer.from("a\r\nb\nc\r\n", "utf8")); return e.crlf > 0 && e.lf > 0; })());
  rec("a pure CRLF buffer is not", (() => { const e = endings(Buffer.from("a\r\nb\r\n", "utf8")); return !(e.crlf > 0 && e.lf > 0); })());
  rec("a pure LF buffer is not", (() => { const e = endings(Buffer.from("a\nb\n", "utf8")); return !(e.crlf > 0 && e.lf > 0); })());
  // A lone \r (old Mac) is not a line ending we produce, and must not be miscounted as either.
  rec("a stray CR is not counted as a line", (() => { const e = endings(Buffer.from("a\rb", "utf8")); return e.crlf === 0 && e.lf === 0; })());

  console.log(`\n=== no source file has mixed line endings: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
