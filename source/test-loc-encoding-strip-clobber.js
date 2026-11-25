// #legacy-loc-strip-clobber — deleting one entry destroyed every accented character in a legacy-encoded
// localisation file, including keys the user never touched.
//
// Nova already refuses to rewrite a non-UTF-8 .yml on the SAVE paths (readLocalizationTextForWrite, added for
// #legacy-encoded-loc-clobbered). Five callers never adopted it — the same shape as every other guard in this
// codebase that exists next door and was adopted by one sibling and not the others:
//
//   * removeEventLocalizationLines and removeExactKeyLocalizationLines, the DELETE cleanup sweeps, walked
//     every .yml under localisation/ with fs.readFileSync(p, "utf8") and handed the result to
//     writeUtf8BomFile. Node maps every undecodable byte to U+FFFD on the read and the write re-encodes it as
//     EF BF BD, so "Réformer l'armée" became "R<?>former l'arm<?>e" permanently — because somebody deleted an
//     unrelated third entry.
//   * three in-place writers (event names, character names, technology names) did the same on save.
//
// The two sweeps must not THROW the way the save paths do: they run after the definition has already been
// removed, so aborting would leave the delete half-applied. They skip the file instead and say which one —
// an orphaned loc key is invisible in game, mojibake is permanent and visible.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locenc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const S = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "locenc");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocEnc"\nsupported_version="1.19.*"\n', "utf8");

// A genuinely Windows-1252 file: the accented characters are SINGLE bytes (0xE9 = é, 0xFC = ü), which is not
// valid UTF-8. This is the ordinary shape of a loc file inherited from an older mod or edited in Notepad
// before Windows made UTF-8 the default.
const LEGACY = path.join(MOD, "localisation", "english", "legacy_l_english.yml");
const legacyText =
  "l_english:\n" +
  ' doomed_key:0 "Doomed"\n' +
  ' untouched_french:0 "R\xE9former l\'arm\xE9e"\n' +
  ' untouched_german:0 "M\xFCnchner Abkommen"\n';
fs.writeFileSync(LEGACY, Buffer.from(legacyText, "latin1"));

// …and a normal UTF-8 file alongside it, so the fix cannot be "stop stripping".
const CLEAN = path.join(MOD, "localisation", "english", "clean_l_english.yml");
fs.writeFileSync(CLEAN, "﻿l_english:\n doomed_key:0 \"Doomed\"\n keeper_key:0 \"Kept\"\n", "utf8");

try {
  console.log("\n[fixture] the legacy file really is undecodable as UTF-8");
  const before = fs.readFileSync(LEGACY);
  rec("it contains a byte no UTF-8 sequence can produce", before.includes(0xe9), [...before].filter((b) => b > 0x7f));
  rec("…and decoding it as utf8 is lossy", !Buffer.from(before.toString("utf8"), "utf8").equals(before), "round-trips cleanly");
  rec("…and it holds keys unrelated to what we are about to delete",
    /untouched_french/.test(before.toString("latin1")) && /untouched_german/.test(before.toString("latin1")),
    before.toString("latin1"));

  console.log("\n[the bug] a delete sweep must not rewrite a file it cannot decode");
  const touched = S.removeExactKeyLocalizationLines(MOD, "doomed_key");
  const after = fs.readFileSync(LEGACY);
  rec("the legacy file is byte-for-byte what it was", after.equals(before),
    { beforeLen: before.length, afterLen: after.length, after: after.toString("latin1") });
  rec("…so no accented character was replaced with U+FFFD", !after.includes(0xef) || !after.toString("utf8").includes("�"),
    after.toString("utf8"));
  rec("…and é and ü are still there", after.includes(0xe9) && after.includes(0xfc), [...after].filter((b) => b > 0x7f));

  console.log("\n[control] the UTF-8 file next to it was still cleaned");
  const cleanAfter = fs.readFileSync(CLEAN, "utf8");
  rec("the doomed key was removed from the decodable file", !/doomed_key/.test(cleanAfter), cleanAfter);
  rec("…and the unrelated key survived", /keeper_key:0 "Kept"/.test(cleanAfter), cleanAfter);
  rec("…and the sweep reported it as changed", Array.isArray(touched) && touched.some((p) => /clean_l_english/.test(p)), touched);
  rec("…and did NOT report the skipped one as changed", !(touched || []).some((p) => /legacy_l_english/.test(p)), touched);

  console.log("\n[the bug] the same for the event-shaped sweep");
  const LEGACY2 = path.join(MOD, "localisation", "english", "legacy2_l_english.yml");
  const legacy2 =
    "l_english:\n" +
    ' nsx.1.t:0 "Doomed Event"\n' +
    ' keep_accent:0 "Cr\xE9ation d\'une arm\xE9e"\n';
  fs.writeFileSync(LEGACY2, Buffer.from(legacy2, "latin1"));
  const b2 = fs.readFileSync(LEGACY2);
  S.removeEventLocalizationLines(MOD, "nsx", new Set());
  const a2 = fs.readFileSync(LEGACY2);
  rec("the legacy event loc file is untouched", a2.equals(b2), a2.toString("latin1"));
  rec("…and its accented key is intact", a2.includes(0xe9), [...a2].filter((b) => b > 0x7f));

  console.log("\n[the user is told] a silent skip would just be a quieter bug");
  const warn = typeof S.drainRefWriteWarningForTest === "function" ? S.drainRefWriteWarningForTest() : null;
  if (warn === null) {
    // The drain lives inside createApp; assert the wiring instead of reaching into it.
    const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("the skip is recorded, not swallowed", /_locEncodingSkips\.push\(rel\)/.test(SRC), "no record");
    rec("…and drained into the warning every handler already surfaces",
      /drainLocEncodingSkips\(\)/.test(SRC) && /const skipped = drainLocEncodingSkips\(\);/.test(SRC), "not drained");
    rec("…and the message says what to do about it", /re-save it as UTF-8 \(with BOM\)/.test(SRC), "no remedy");
  }

  console.log("\n[the other three] the in-place save writers read through the guard too");
  const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  rec("no loc writer still reads existing.file as raw utf8",
    !/fs\.readFileSync\(existing\.file, "utf8"\)/.test(SRC), "one left");
  rec("…nor existingLoc.file", !/fs\.readFileSync\(existingLoc\.file, "utf8"\)/.test(SRC), "one left");
  rec("…and the guard they use is the one that throws with a remedy",
    /function readLocalizationTextForWrite/.test(SRC) && /isn't saved as UTF-8, so Nova won't rewrite it/.test(SRC), "guard missing");

  console.log(`\n=== loc encoding strip clobber: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
