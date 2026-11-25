// resolveDependencyRootsForAssets(activeRoot) runs on the hot path — every sprite/icon/portrait
// request consults it. Its #1 contract (the one task #117's perf fix depends on) is to return []
// *cheaply and without throwing* for the common cases: vanilla, a mod with no dependencies, or a
// malformed descriptor. Only a mod that actually declares dependencies pays the candidate scan.
// Positive name->dir matching can't be exercised hermetically (candidates come from the real Steam
// workshop / Paradox mods dir), so this locks the guard/early-return contract, which is where a
// regression would silently reintroduce the editor-wide slowdown.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveDependencyRootsForAssets } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const isEmptyArr = (v) => Array.isArray(v) && v.length === 0;

// --- Falsy / wrong-type activeRoot: cheap [] with no throw, no disk access. ---
check("null → []", isEmptyArr(resolveDependencyRootsForAssets(null)));
check("undefined → []", isEmptyArr(resolveDependencyRootsForAssets(undefined)));
check("empty string → []", isEmptyArr(resolveDependencyRootsForAssets("")));
check("number → []", isEmptyArr(resolveDependencyRootsForAssets(42)));
check("object → []", isEmptyArr(resolveDependencyRootsForAssets({ root: "x" })));

// --- A directory with no descriptor.mod (e.g. a bare path) → []. ---
const noDesc = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-nodesc-"));
check("dir without descriptor.mod → []", isEmptyArr(resolveDependencyRootsForAssets(noDesc)));

// --- descriptor.mod present but NO dependencies block: the common add-on/standalone case.
//     Must NOT mistake the quoted name/version/tags strings for dependencies. ---
const noDeps = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-nodeps-"));
fs.writeFileSync(path.join(noDeps, "descriptor.mod"),
  'name="My Standalone Mod"\nversion="1.0"\nsupported_version="1.16.*"\ntags={ "Gameplay" }\n', "utf8");
check("descriptor with name/version/tags but no dependencies block → []",
  isEmptyArr(resolveDependencyRootsForAssets(noDeps)), resolveDependencyRootsForAssets(noDeps));

// --- Empty dependencies block → []. ---
const emptyDeps = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-empty-"));
fs.writeFileSync(path.join(emptyDeps, "descriptor.mod"), 'name="X"\ndependencies={ }\n', "utf8");
check("empty dependencies block → []", isEmptyArr(resolveDependencyRootsForAssets(emptyDeps)), resolveDependencyRootsForAssets(emptyDeps));

// --- Declared dependency that matches nothing on disk → [] (does the scan, finds no match, no throw). ---
const ghostDep = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-ghost-"));
fs.writeFileSync(path.join(ghostDep, "descriptor.mod"),
  'name="Add-on"\ndependencies={\n\t"Nova Nonexistent Base Mod ZZZ 9f3a2"\n}\n', "utf8");
const ghostRes = resolveDependencyRootsForAssets(ghostDep);
check("unmatched dependency name → [] (no throw)", isEmptyArr(ghostRes), ghostRes);

// --- Multiple unmatched dependencies → still [] (no throw on a multi-entry block). ---
const multiDep = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-multi-"));
fs.writeFileSync(path.join(multiDep, "descriptor.mod"),
  'name="Add-on"\ndependencies={\n\t"Ghost Mod One 111"\n\t"Ghost Mod Two 222"\n}\n', "utf8");
check("multiple unmatched dependencies → [] (no throw)", isEmptyArr(resolveDependencyRootsForAssets(multiDep)));

// --- Garbage / truncated descriptor content → [] (robustness, no throw). ---
const garbage = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dep-garbage-"));
fs.writeFileSync(path.join(garbage, "descriptor.mod"), 'dependencies={ "unterminated', "utf8");
let threw = false, gres = [];
try { gres = resolveDependencyRootsForAssets(garbage); } catch (_) { threw = true; }
check("garbage descriptor → no throw", !threw);
check("garbage descriptor → []", isEmptyArr(gres), gres);

// --- Always returns an array (never undefined/null), for every input above. ---
check("return type is always an array", Array.isArray(resolveDependencyRootsForAssets(undefined)) && Array.isArray(resolveDependencyRootsForAssets(noDeps)));

for (const d of [noDesc, noDeps, emptyDeps, ghostDep, multiDep, garbage]) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nDEPENDENCY-ASSET-ROOTS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
