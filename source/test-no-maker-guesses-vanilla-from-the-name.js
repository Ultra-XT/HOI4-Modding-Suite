// Every maker had its own copy of the same wrong idea: decide "am I looking at the read-only base game?"
// from the mod selector's DISPLAY TEXT. That text is the mod's own `name` from descriptor.mod, so any mod
// called "Vanilla Plus", "Improved Vanilla" or "Beyond Vanilla" was treated as vanilla.
//
// The consequences were not cosmetic. In the Research maker it refused every save AND made the app
// unquittable without discarding the work. In Events, Decisions, Ideas, Characters and Country Setup it
// called setWriteControlsLocked(true), so the editing controls were disabled outright. In Army it showed the
// read-only banner over the user's own mod.
//
// ⭐ server.js has published the answer all along, with a comment beside it saying exactly this:
// `isVanilla:true` is the AUTHORITATIVE (path-based) flag clients should key off, "NOT a 'vanilla' substring
// in the name, which false-positives on real mods like 'Vanilla Plus' / 'Improved Vanilla'".
//
// This is the inverse of the usual shape here. Normally one caller misses a fix that exists next door; this
// time the rule was written down and NO caller adopted it. So the guard is a sweep, derived from the files
// themselves rather than a hand-kept list — a list would rot the same way.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PUB = path.join(__dirname, "public");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The server still publishes the flag it tells clients to use");
  const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  rec("the vanilla entry carries isVanilla: true", /mods\.unshift\(\{[^}]*isVanilla: true/.test(SERVER));
  rec("…and no enumerated mod is given it", !/mods\.push\(\{[^}]*isVanilla: true/.test(SERVER),
    "a real mod carrying the flag would trip every read-only path");

  console.log("\n2. DERIVED sweep: no maker decides vanilla from a name or an option's text");
  // Every public/*.js, not a list. A file added later is covered the day it appears.
  const files = fs.readdirSync(PUB).filter((f) => /\.js$/.test(f));
  rec("there are makers to scan", files.length > 5, files.length + " files");

  const offenders = [];
  for (const f of files) {
    const src = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
    // The shapes that caused this: a /vanilla/i test against a mod NAME, an option's TEXT, or a selector's
    // selected text. A test against a PATH is fine — that is what the flag itself is derived from.
    const bad = [
      /\/vanilla\/i\.test\(\s*selectedText/,
      /\/vanilla\/i\.test\(\s*selectedOpt[^)]*\.text/,
      /\/vanilla\/i\.test\(\s*o\.textContent/,
      /\/vanilla\/i\.test\(\s*opt[^)]*\.text/,
      /\/vanilla\/i\.test\(\s*m\.name/,
      /\/vanilla\/i\.test\(\s*mod\.name/,
      /selectedOptionText\.toLowerCase\(\)\.includes\("vanilla"\)/,
    ].filter((re) => re.test(src));
    if (bad.length) offenders.push(`${f} (${bad.length} shape${bad.length > 1 ? "s" : ""})`);
  }
  rec("no maker guesses vanilla from a name", offenders.length === 0, offenders);

  console.log("\n3. …and the ones that need the flag actually set it");
  // A maker that READS dataset.vanilla but never SETS it would silently treat everything as non-vanilla —
  // the opposite failure, and just as bad: the base game would look editable.
  for (const f of files) {
    const src = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
    const reads = /dataset\.vanilla/.test(src) && !/dataset\.vanillaLocked/.test(src.replace(/dataset\.vanilla(?!Locked)/g, ""));
    if (!/dataset\.vanilla(?!Locked)/.test(src)) continue;
    const sets = /dataset\.vanilla\s*=/.test(src);
    rec(`${f} both sets and reads the flag`, sets, "reads it without ever setting it — the base game would look editable");
  }

  console.log("\n4. Every setter derives it from isVanilla, with a path fallback");
  for (const f of files) {
    const src = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
    if (!/dataset\.vanilla\s*=/.test(src)) continue;
    rec(`${f} sets it from the server flag`, /isVanilla === true|m\.isVanilla\)|mod\.isVanilla\)|\.isVanilla\b/.test(src),
      "the flag must come from the server, not from the name");
  }

  console.log("\n5. The rule, composed over real mod names");
  const isVanillaOpt = (mod, norm) => mod.isVanilla === true
    || (mod.isVanilla === undefined && norm(mod.path).includes("steamapps/common/hearts of iron iv"));
  const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  rec("the base game is vanilla",
    isVanillaOpt({ path: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", isVanilla: true }, norm) === true);
  for (const name of ["Vanilla Plus", "Improved Vanilla", "Beyond Vanilla"]) {
    rec(`"${name}" is not`, isVanillaOpt({ name, path: "D:/mods/x", isVanilla: false }, norm) === false);
  }
  rec("an older server with no flag falls back to the path",
    isVanillaOpt({ path: "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV" }, norm) === true,
    "the normalizer must lowercase, or a Windows path never matches");
  rec("…and that fallback does not catch a mod", isVanillaOpt({ path: "D:/mods/vanilla_plus" }, norm) === false);

  console.log("\n6. This would have rejected what shipped");
  const OLD = (text) => /vanilla/i.test(text);
  rec("the old rule called a real mod vanilla", OLD("Vanilla Plus") === true);
  rec("…and would be caught by the sweep above",
    /\/vanilla\/i\.test\(\s*selectedText/.test('const isVanilla = /vanilla/i.test(selectedText);'));

  console.log(`\n=== no maker guesses vanilla from the name: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
