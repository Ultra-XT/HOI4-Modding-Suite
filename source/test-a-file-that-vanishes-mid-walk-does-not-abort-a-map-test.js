// A file that disappears between readdirSync and readFileSync must not abort a two-layer map test.
// #a-file-listed-is-not-a-file-still-there
//
// THE DEFECT. testlib-two-layer-map.js's tree() hashes every file under a mod, and many map tests call it before and
// after a click to say exactly what was written. It read every name readdirSync handed it, with no allowance for the
// name dying in between — and on this machine names do. Watching os.tmpdir() through six runs of
// test-restoring-a-removed-country-leaves-no-copy-of-a-base-state-file.js caught "<NAME>.TXT.tmp" — the target's name
// uppercased, bare ".tmp" — appear in the fixture's history/states about 10ms after each safeModWrite rename and die
// within a millisecond. It is not Nova's: no .js in the repo holds a bare ".tmp" (safeModWrite writes
// "<file>.tmp-<pid>-<ts>"), an fs hook over every creating call logged zero in-process creations, and plain
// writeFileSync+renameSync in a scratch folder never made one. An on-access scanner, per ⛔2 in CLAUDE.md.
//
// THE EVIDENCE. On f86c096 and on the merge above it, that test failed 1 run in 3 with
//   ENOENT: no such file or directory, open '…\mods\m3\history\states\2-B.TXT.tmp'
//     at walk (D:\Nova\testlib-two-layer-map.js:88:268)
// and — the part that matters more than the flake — the throw ended the file at check 15 of 24. NINE checks never
// ran, and the summary still read like a test that had run.
//
// WHAT IS TOLERATED, AND WHAT IS NOT. Only ENOENT, and only for a path the walk itself just listed. A file that
// really went away is absent from the tree either way, which is what written() compares, so the tolerance cannot
// hide a deletion. Every other error still throws — a read denied or a disk giving up is not a vanished file.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanish-walk-"));
const realRead = fs.readFileSync;
/** Make ONE path behave like a file that died between the listing and the read. */
const whileReadFails = (victim, code, fn) => {
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p) === path.resolve(victim)) {
      const err = new Error(code + ": simulated, open '" + p + "'");
      err.code = code;
      throw err;
    }
    return realRead.call(this, p, ...rest);
  };
  try { return fn(); } finally { fs.readFileSync = realRead; }
};

try {
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  const keep1 = path.join(dir, "history", "states", "1-A.txt");
  const keep2 = path.join(dir, "history", "states", "3-C.txt");
  const doomed = path.join(dir, "history", "states", "2-B.TXT.tmp");   // the shape the scanner leaves
  fs.writeFileSync(keep1, "state = { id = 1 }\n");
  fs.writeFileSync(keep2, "state = { id = 3 }\n");
  fs.writeFileSync(doomed, "whatever the scanner put here\n");

  console.log("1. A name that dies between the listing and the read");
  {
    let threw = null, t = null;
    try { t = whileReadFails(doomed, "ENOENT", () => lib.tree(dir)); } catch (e) { threw = e; }
    rec("⭐ tree() does not throw", threw === null, threw && threw.message);
    rec("…and still hashes every file that was really there",
      !!t && Object.keys(t).sort().join("|") === "history/states/1-A.txt|history/states/3-C.txt",
      t && Object.keys(t).sort());
    rec("…and says what vanished, without it showing up as a file",
      !!t && t.__vanished && t.__vanished.join("|") === "history/states/2-B.TXT.tmp"
        && !("history/states/2-B.TXT.tmp" in t),
      t && t.__vanished);
  }

  console.log("2. CONTROL: only a vanished file is forgiven");
  {
    let threw = null;
    try { whileReadFails(doomed, "EPERM", () => lib.tree(dir)); } catch (e) { threw = e; }
    rec("⭐ a read that fails any other way still throws", !!threw && threw.code === "EPERM", threw && threw.code);
  }

  console.log("3. CONTROL: a file that really went away is still reported as gone");
  {
    const before = lib.tree(dir);
    fs.unlinkSync(keep2);
    const after = lib.tree(dir);
    rec("it is in the before tree", "history/states/3-C.txt" in before);
    rec("…gone from the after tree", !("history/states/3-C.txt" in after));
    rec("⭐ …and written() names it, so the tolerance hides no deletion",
      lib.written(before, after).join("|") === "history/states/3-C.txt", lib.written(before, after));
    rec("…and nothing was recorded as vanished on either walk",
      before.__vanished.length === 0 && after.__vanished.length === 0,
      { before: before.__vanished, after: after.__vanished });
  }

  console.log("4. ⭐⭐ Every two-layer map test whose own walker reads each name it lists outlasts one that vanishes, or walks with tree()");
  {
    // test-an-auto-fix-copies-the-names-it-writes.js had a walker of its own beside this one, which read every name it was handed and
    // threw ENOENT out of a run now and then (b2b4 integration, group s): the fix was next door, and one caller never adopted it. Derived:
    // every test that loads testlib-two-layer-map.js, every withFileTypes listing in it (comments masked), and the read that follows.
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const LISTING = /readdirSync\([^,()]+, \{ withFileTypes: true \}\)/g;
    /** the lines of `src` where a walker reads a name it listed, with no ENOENT allowance and no game-file filter before the read */
    const bare = (src) => {
      const m = maskJsComments(src), out = [];
      for (const x of m.matchAll(LISTING)) {
        const w = m.slice(x.index, x.index + 400);
        const read = /readFileSync\(p[,)]|\bsha1?\(p\)/.exec(w);
        if (!read) continue;
        const filtered = /\/\\\.[A-Za-z0-9]+\$\/i?\.test\(e\.name\)/.test(w.slice(0, read.index));
        if (!filtered && !/ENOENT/.test(w)) out.push(m.slice(0, x.index).split("\n").length);
      }
      return out;
    };
    const twoLayer = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f) && f !== path.basename(__filename))
      .filter((f) => /require\("\.\/testlib-two-layer-map\.js"\)/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
    let walkers = 0;
    const offenders = [];
    for (const f of twoLayer) {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      walkers += (maskJsComments(src).match(LISTING) || []).length;
      const b = bare(src);
      if (b.length) offenders.push(`${f}:${b.join(",")}`);
    }
    rec("the scan reads the two-layer map tests, and finds walkers of their own in them", twoLayer.length >= 20 && walkers >= 5, { twoLayer: twoLayer.length, walkers });
    rec("⭐⭐ none of them reads every name it lists without outlasting one that vanishes", offenders.length === 0, offenders);
    rec("CONTROL: the walker test-an-auto-fix-copies-the-names-it-writes.js had is caught",
      bare(`const filesOf = (dir) => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).split(path.sep).join("/"), sha(p)); } }; if (fs.existsSync(dir)) walk(dir); return out; };`).length === 1);
    rec("CONTROL: …and one that reads only the game files it filters to, or allows ENOENT, is not",
      bare(`const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); continue; } if (!/\\.yml$/i.test(e.name)) continue; t += fs.readFileSync(p, "utf8"); } };`).length === 0
      && bare(`const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else { let b; try { b = fs.readFileSync(p); } catch (err) { if (err && err.code === "ENOENT") continue; throw err; } out.set(p, b); } } };`).length === 0);
  }

  console.log("5. The walk is unchanged for a tree with nothing wrong");
  {
    const t = lib.tree(dir);
    rec("every remaining file is hashed", Object.keys(t).length === 2, Object.keys(t));
    rec("…by content, not by name",
      t["history/states/1-A.txt"] !== t["history/states/2-B.TXT.tmp"] &&
      /^[0-9a-f]{40}$/.test(t["history/states/1-A.txt"] || ""), t["history/states/1-A.txt"]);
  }
} finally {
  fs.readFileSync = realRead;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}

console.log(`\n=== a file that vanishes mid-walk does not abort a map test: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
