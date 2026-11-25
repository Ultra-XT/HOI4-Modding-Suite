// A raw NUL byte in a source file makes ripgrep stop reading it — and answer "No matches found".
// #no-source-file-hides-itself-from-search
//
// map-data.js line 7954 read:
//
//     const key = `${modRoot}<NUL>${gameRoot}<NUL>${relPath}`.toLowerCase();
//
// The author meant the two-character escape \0, and at runtime there is no difference whatsoever: \0 in a
// string or template literal IS U+0000, so the cache key separated exactly as intended and every test
// passed. This shell mangles backslashes even inside quoted heredocs — CLAUDE.md says so in bold — and a
// heredoc that emitted `\0` put the byte itself into the file. Committed, and invisible.
//
// ⭐⭐⭐ WHAT IT COST. ripgrep applies binary detection to files it reaches by DIRECTORY TRAVERSAL, and on
// the first NUL it stops and prints "binary file matches". A file named EXPLICITLY on the command line is
// read whole. So the damage was silent and one-sided:
//
//     rg "function setCountryCapital" map-data.js   ->  line 8542          (file named directly)
//     rg -g "*.js" "function setCountryCapital"     ->  NO MATCHES FOUND   (found by traversal)
//
// Both are true statements about the same symbol on the same day. Every repo-wide search silently missed
// lines 7954-9307 of map-data.js — 1,353 lines, 14.5% of the file, including setCountryCapital,
// swapCountryStates and the whole export block — and reported a clean "no" rather than an error.
//
// That is the exact failure shape CLAUDE.md already names for line endings: it appears to work, and does
// not. A search that answers "nothing" is worse than one that crashes, because "nothing" is an answer you
// act on. "Does anything call this?" and "is this rule wired up?" are questions this project answers by
// grep constantly, and for lines 7954+ of its second-largest file the answer was always no.
//
// ⚠️ THE RULE IS "NO RAW NUL IN SOURCE", NOT "NO NUL". The bytes are wanted — a NUL is the right join
// separator precisely because no path or file body contains one. Both offenders keep their NUL; they spell
// it \0. And 49 tracked files are genuine binaries (PNG, DDS, ICO, EXE) full of NULs, which is correct.
// The set checked here is therefore extension-derived, and check 4 pins that those binaries exist, so a
// future widening of the extension list cannot quietly turn this guard into a failing mess.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const nulOffsets = (buf) => {
  const out = [];
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0) out.push(i);
  return out;
};
const lineOf = (buf, off) => {
  let line = 1;
  for (let k = 0; k < off; k++) if (buf[k] === 10) line++;
  return line;
};

try {
  console.log("1. The tracked source set, derived from git");
  // ⭐ DERIVED, not listed. The gitignored backup trees hold thousands of files and must stay out of it
  // without a hand-kept skip list that would rot on the first rename.
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { cwd: __dirname, maxBuffer: 64 * 1024 * 1024 })
      .toString("utf8").split("\0").filter(Boolean);
  } catch (e) {
    // Not a skip. A guard that cannot run must say so out loud — a skip reads as a pass.
    rec("git ls-files could enumerate the tracked files", false, String(e && e.message).slice(0, 120));
  }
  const sources = tracked.filter((f) => /\.(js|css|html|md|json)$/i.test(f));
  rec("there are tracked source files to check", sources.length > 50, sources.length + " files");

  console.log("\n2. No tracked source file carries a raw NUL");
  const offenders = [];
  for (const f of sources) {
    let buf;
    try { buf = fs.readFileSync(path.join(__dirname, f)); } catch (_) { continue; }
    const nuls = nulOffsets(buf);
    if (!nuls.length) continue;
    const total = buf.toString("utf8").split("\n").length;
    const first = lineOf(buf, nuls[0]);
    offenders.push(`${f} (${nuls.length} NUL, first at line ${first} of ${total} — hides ${total - first} lines from repo-wide search)`);
  }
  rec("⭐⭐⭐ every tracked source file is readable end to end by a repo-wide search", offenders.length === 0, offenders.slice(0, 10));

  console.log("\n3. The two that did carry one still separate on a NUL — spelled \\0");
  // The fix must not have removed the separator. A `.join(" ")` would look identical in a git diff (git
  // renders a raw NUL as a space) and would silently start colliding on paths that contain a space.
  const mapData = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  rec("map-data.js's cache key still joins on a NUL escape",
    /\$\{modRoot\}\\0\$\{gameRoot\}\\0\$\{relPath\}/.test(mapData),
    "modChangedMapFile's key must not collide when a path contains the separator");
  // …and it must still BE a NUL at runtime, not the literal two characters.
  const probe = `a\0b`;
  rec("…and \\0 evaluates to U+0000, so behaviour is unchanged", probe.length === 3 && probe.charCodeAt(1) === 0);

  console.log("\n4. Genuine binaries are untouched — the rule is about SOURCE");
  const binaries = tracked.filter((f) => /\.(png|dds|ico|exe|tga|bmp|zip|ttf|woff2?)$/i.test(f));
  let withNul = 0;
  for (const f of binaries) {
    let buf;
    try { buf = fs.readFileSync(path.join(__dirname, f)); } catch (_) { continue; }
    if (nulOffsets(buf).length) withNul++;
  }
  rec("the repo does track NUL-bearing binaries, and they are correctly out of scope", withNul > 0, withNul + " of " + binaries.length + " binaries");
  rec("…and none of them matched the source extension list", sources.every((f) => !/\.(png|dds|ico|exe)$/i.test(f)));

  console.log("\n5. The detector bites");
  // Composed, so check 2 cannot pass by measuring nothing.
  rec("a buffer with a NUL is detected", nulOffsets(Buffer.from("ab\0cd", "utf8")).length === 1);
  rec("a buffer without one is not", nulOffsets(Buffer.from("abcd", "utf8")).length === 0);
  rec("the line number is the NUL's own line", lineOf(Buffer.from("a\nb\n\0c", "utf8"), 4) === 3);

  console.log("\n6. ⭐⭐ THE REASON, measured against the real ripgrep");
  // The whole rule rests on a claim about a tool. Prove the claim rather than assert it: write two
  // fixtures differing ONLY in one byte and ask rg the same question of each.
  //
  // ⚠️ ABSENCE IS NOT A FAILURE, AND NOT A SILENT SKIP EITHER. ripgrep is a developer's tool, not a
  // dependency of this app — it is in no package.json and the suite must not go red on a machine that
  // lacks it, which would be the cry-wolf CLAUDE.md forbids. But a check that quietly evaporates reads as
  // a pass, so absence prints an unmissable NOTE and check 2 continues to carry the actual rule alone.
  // Present-and-wrong is a real failure and is treated as one. Set RIPGREP_PATH to point at a binary.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nul-rg-"));
  try {
    const body = (sep) => `const key = "a" + ${sep} + "b";\n` + "x\n".repeat(20) + `function findMeAfterTheSeparator() {}\n`;
    fs.mkdirSync(path.join(dir, "clean"));
    fs.mkdirSync(path.join(dir, "raw"));
    fs.writeFileSync(path.join(dir, "clean", "f.js"), body('"\\0"'), "utf8");             // the escape
    fs.writeFileSync(path.join(dir, "raw", "f.js"), body('"\0"'), "utf8");                // the raw byte
    const candidates = [process.env.RIPGREP_PATH, "rg", "rg.exe"].filter(Boolean);
    let rgBin = null;
    for (const c of candidates) {
      try { execFileSync(c, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); rgBin = c; break; } catch (_) { /* try the next */ }
    }
    const askRg = (cwd) => {
      // Traversal, not a named file — that distinction IS the bug.
      try {
        return execFileSync(rgBin, ["-g", "*.js", "findMeAfterTheSeparator", "."], { cwd, encoding: "utf8" });
      } catch (e) {
        if (e && e.status === 1) return "";        // rg exits 1 for "no matches"
        return null;                                // rg errored
      }
    };
    const cleanOut = rgBin ? askRg(path.join(dir, "clean")) : null;
    const rawOut = rgBin ? askRg(path.join(dir, "raw")) : null;
    if (!rgBin) {
      console.log("  NOTE ⚠️  ripgrep is not on PATH, so the REASON for this rule went unmeasured on this run.");
      console.log("       The rule itself is check 2 above and it ran. Set RIPGREP_PATH to measure the reason.");
    } else if (cleanOut === null || rawOut === null) {
      rec("ripgrep answered both fixtures", false, "rg is present (" + rgBin + ") but errored — that IS a failure");
    } else {
      rec("⭐ rg finds the symbol when the file spells the separator \\0", /findMeAfterTheSeparator/.test(cleanOut), JSON.stringify(cleanOut.trim()).slice(0, 90));
      rec("⭐⭐⭐ …and does NOT when the same file carries the raw byte — one byte, silently no result",
        !/findMeAfterTheSeparator/.test(rawOut), JSON.stringify(rawOut.trim()).slice(0, 90));
      rec("…while naming the file directly still finds it, which is why this went unnoticed for so long",
        (() => {
          try { return /findMeAfterTheSeparator/.test(execFileSync("rg", ["findMeAfterTheSeparator", "f.js"], { cwd: path.join(dir, "raw"), encoding: "utf8" })); }
          catch (e) { return e && e.status === 1 ? false : true; }
        })());
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n=== no source file hides itself from search: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
