// ⛔ #a-file-nova-could-not-read-scanned-as-clean — AN UNREADABLE FILE AND AN EMPTY ONE ARE NOT THE SAME.
//
// mod-index's readSafe() returns "" when a read fails, and an empty file produces no problems. So a file
// Nova could not open was silently treated as containing nothing, and Mod Health reported the mod healthy
// without having looked at it — the one thing Mod Health exists to prevent.
//
// ⚠️ HOW NARROW THIS IS, stated honestly, because the first demonstration of it was wrong. The file walker
// filters with `e.isFile()`, so a directory named like a .txt is walked INTO and never offered to readSafe
// — the probe that "proved" the bug never reached the code it was about. The only real trigger is a lock or
// a permission change BETWEEN the walk and the read: launching Hearts of Iron IV mid-scan, an antivirus
// quarantine, a sync client. That race cannot be staged through buildModIndex, so the mechanism is proven
// directly and the wiring is proven at source level.
//
// ⭐ Reporting it cannot cry wolf, and that was measured BEFORE it was written: across vanilla and all five
// installed workshop mods — 41,195 files under common/, history/, localisation/, events/ and map/ — ZERO
// failed to read, and there are zero directories named like a data file. It fires only when something has
// genuinely gone wrong on the user's machine.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}

const mi = require("./mod-index.js");

console.log("\n[⭐ a failed read is recorded, not silently turned into an empty file]");
{
  mi.resetReadFailures();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unread-"));
  try {
    const good = path.join(dir, "good.txt");
    fs.writeFileSync(good, "hello", "utf8");
    rec("a readable file comes back as its contents", mi.readSafe(good) === "hello");
    rec("…and records no failure", mi.takeReadFailures().length === 0, mi.takeReadFailures());

    // A directory read as a file is the portable way to make readFileSync throw.
    mi.resetReadFailures();
    const asDir = path.join(dir, "cannot-open.txt");
    fs.mkdirSync(asDir);
    rec("an unreadable path still returns \"\" — callers are unchanged", mi.readSafe(asDir) === "");
    const recorded = mi.takeReadFailures();
    rec("…but the failure is now recorded", recorded.length === 1, recorded);
    rec("…naming the file", recorded[0] && recorded[0].file === asDir, recorded[0]);
    rec("…and why", recorded[0] && /EISDIR|EACCES|EPERM|EBUSY|ENOENT/.test(String(recorded[0].error)), recorded[0]);

    // Deduped: reference extraction and validation both read the same files.
    mi.resetReadFailures();
    mi.readSafe(asDir); mi.readSafe(asDir); mi.readSafe(asDir);
    rec("…once, however many times it is read", mi.takeReadFailures().length === 1, mi.takeReadFailures());

    // Reset per scan, so a failure from an earlier mod cannot be reported against the next one.
    mi.resetReadFailures();
    rec("…and cleared between scans", mi.takeReadFailures().length === 0);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }
}

console.log("\n[the scan turns a recorded failure into a problem the user reads]");
{
  // LF whatever the checkout: the first pattern below spans a line end (#a-lift-reads-lf)
  const SRC = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8").replace(/\r\n/g, "\n");
  rec("buildModIndex clears the record first", /resetReadFailures\(\);\n\s*const entities = \[/.test(SRC),
    "a failure from a previous scan would be blamed on this mod");
  rec("…and drains it into problems", /for \(const \{ file, error \} of takeReadFailures\(\)\)/.test(SRC));
  rec("…as rule file_unreadable", /rule: "file_unreadable"/.test(SRC));
  rec("…a warning, not an error — the mod may be fine and HOI4 may read it happily",
    /severity: "warning",\s*\n\s*rule: "file_unreadable"/.test(SRC));
  rec("…saying the clean result does not cover that file", /does \` \+\s*\n\s*\`not cover that file/.test(SRC) || /not cover that file/.test(SRC));
  rec("…and naming the read error, so it is actionable", /\$\{error\}/.test(SRC));
  rec("⭐ a file outside the mod is not blamed on the modder", /if \(rel\.startsWith\("\.\."\)\) continue;/.test(SRC),
    "vanilla and dependency files are read too, and they are not the user's to fix");
}

console.log("\n[the rule has a label, or the UI shows a raw id]");
{
  const MH = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
  rec("modhealth.js labels file_unreadable", /file_unreadable:\s*"/.test(MH),
    "the filter chip and the score sub-line would show the raw rule id");
  // Derived: every rule mod-index can emit must have a label.
  const SRC = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8");
  const emitted = new Set([...SRC.matchAll(/rule:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
  const labelled = new Set([...MH.matchAll(/^\s*([a-z0-9_]+):\s*"/gm)].map((m) => m[1]));
  const unlabelled = [...emitted].filter((r) => !labelled.has(r));
  rec(`${emitted.size} rules are emitted, and every one has a label`, unlabelled.length === 0, unlabelled);
}

console.log("\n[⭐ CONTROL: it does not fire on real content]");
{
  // The measurement that made this safe to add. If a shipped mod ever does contain a file that cannot be
  // read, this stops being a free check and the decision needs re-making.
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(GAME)) rec(true, "(base game not installed — corpus control skipped)");
  else {
    mi.resetReadFailures();
    let files = 0, failed = 0;
    const walk = (d) => {
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && /\.(txt|yml)$/i.test(e.name)) { files++; mi.readSafe(p); }
      }
    };
    walk(path.join(GAME, "common"));
    failed = mi.takeReadFailures().length;
    rec(`${files} base-game files read, ${failed} failures`, failed === 0 && files > 1000, { files, failed });
    mi.resetReadFailures();
  }
}

console.log(`\n=== a file Nova could not read is not clean: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
