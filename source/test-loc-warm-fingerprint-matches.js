// #loc-warm-fingerprint-never-matches — THE STARTUP WARM WAS PURE WASTE.
//
// Startup warms the localisation map so the first page does not pay for parsing every .yml in vanilla, the
// dependencies and the mod. It stored its result under a fingerprint it computed itself — and that
// computation differed from getLocalizationMap's in TWO ways at once:
//
//   · it hashed sha1(parts) where the reader hashes sha1("locparse-v2\n" + parts). The "locparse-vN"
//     prefix exists so a PARSER change can bust the on-disk cache even when no .yml has moved; leaving it
//     off makes a different string, and a different string hashes to a different value;
//   · and its file list was [...vanilla, ...mod] where the reader's is [...vanilla, ...dependencies,
//     ...mod]. On an add-on the warm was building a map with the base mod's localisation missing entirely.
//
// So the fingerprint the warm stored could never equal the one the reader computed, and the first real
// request rebuilt the whole map from scratch — exactly the work the warm exists to have already done.
// Nobody saw a wrong ANSWER, because the reader checks the fingerprint before trusting the cache and
// therefore always missed; what was lost was the entire benefit, silently, on every launch.
//
// ⭐ Both sides now call one locMapFingerprint(), because two places computing "the same" hash separately
// is what allowed them to drift apart in the first place.
//
// ⚠️ HONEST LIMIT OF THIS TEST: the checks below are STRUCTURAL. The only user-visible symptom was startup
// cost — the answers were never wrong, because the reader checks the fingerprint before trusting the cache
// and so simply always missed — and a timing assertion on a warm that runs once per process launch would
// be noise, not evidence. What can be pinned exactly is the mechanism: one shared hash, and a warm whose
// file list and fingerprint parts are assembled in the same three layers, in the same order, from the same
// resolver as the reader's. Every one of those bites when backed out.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const CODE = stripJsComments(SRC); // ⚠️ the fix's own prose names every symbol this greps for

function bodyAround(code, needle, name) {
  const at = code.indexOf(needle);
  if (at === -1) return "";
  // walk back to the enclosing function head, then forward by braces
  const before = code.slice(0, at);
  const headAt = before.lastIndexOf(`function ${name}`);
  if (headAt === -1) return "";
  const open = code.indexOf("{", headAt);
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (!d) return code.slice(headAt, i + 1); }
  }
  return "";
}

console.log("\n[one hash] both sides must compute the fingerprint the same way");
{
  rec("a shared fingerprint function exists", /function locMapFingerprint\(/.test(CODE), "no shared helper");
  const callers = (CODE.match(/locMapFingerprint\(/g) || []).length - 1; // minus the definition
  console.log(`     locMapFingerprint( callers: ${callers}`);
  rec("…and BOTH the reader and the warm use it", callers >= 2, callers);
  // …and nobody still hand-rolls a loc fingerprint next to it. Exactly ONE such expression may exist:
  // the shared helper's own body. A second is a second opinion, which is what this whole finding was.
  const strays = (CODE.match(/createHash\("sha1"\)\.update\("locparse/g) || []).length;
  rec("only the shared helper computes it", strays === 1, strays + " locparse hash expressions");
}

console.log("\n[the prefix] a parser change must still be able to bust the on-disk cache");
{
  // If the prefix were simply deleted from both sides the two would agree — and the ability to invalidate
  // a stale parse would be gone. Agreement is not the only requirement.
  rec("the locparse-vN prefix is still in the hash", /"locparse-v\d+/.test(CODE), "the version prefix is gone");
}

console.log("\n[⭐ the dependency layer] the warm must fingerprint what the reader fingerprints");
{
  // The reader's list is [...vanilla, ...dependencies, ...mod]. The warm's was [...vanilla, ...mod].
  // ⚠️ ANCHOR ON THE WARM, not on the first `const allFiles = …` in the file — that one belongs to
  // getLocalizationMap, several thousand lines earlier, and checking it reported the warm as unfixed while
  // reading the reader's own (correct) list.
  const callAt = CODE.indexOf("await warmLocalizationMapAsync(allFiles");
  const near = callAt === -1 ? "" : CODE.slice(Math.max(0, callAt - 2400), callAt);
  rec("the warm's call site is findable", callAt !== -1, "not found");
  rec("…and it now includes the dependency loc files", /depLocFiles/.test(near), near.slice(0, 240));
  rec("…in vanilla, dependencies, mod order",
    /cachedVanillaLocFiles,\s*\.\.\.depLocFiles,\s*\.\.\.modFiles/.test(near.replace(/\s+/g, " ")), near.slice(0, 240));
  rec("…and its fingerprint parts are in the same order",
    /cachedVanillaFingerprintParts,\s*\.\.\.depFingerprintParts,\s*\.\.\.modFingerprintParts/.test(near.replace(/\s+/g, " ")),
    near.slice(0, 400));
  // …and it resolves those dependencies with the SAME resolver the reader uses, or the lists can differ
  // in content even when they agree in shape.
  rec("…resolved with resolveDependencyRootsForAssets, as the reader does",
    /resolveDependencyRootsForAssets\(activeRoot\)/.test(near), near.slice(0, 300));
}

console.log("\n[the reader] still assembles the list it always did");
{
  const at = CODE.indexOf("const allFiles = [...cachedVanillaLocFiles, ...cachedDepLocFiles, ...modFiles]");
  rec("the reader's three-layer list is intact", at !== -1, "the reader's list changed shape");
  const fpAt = CODE.indexOf("const fingerprintParts = [...cachedVanillaFingerprintParts, ...cachedDepLocFingerprintParts, ...modFingerprintParts]");
  rec("…and so are its fingerprint parts", fpAt !== -1, "the reader's fingerprint parts changed shape");
}

console.log(`\n=== loc warm fingerprint matches: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
