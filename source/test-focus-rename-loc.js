// #focus-rename-loc — renaming a focus left its NAME behind under the old key.
//
// The rename handler moves the string between the in-memory localisation maps, which makes the editor look
// correct, and then the save writes localisation ONLY for focuses sitting in `pendingLocalizationEdits`. A
// pure ID rename never put anything there, because no name or description was edited. So the .yml kept
//
//     NUA_army:0 "Standing Army"
//
// while the focus tree now said `NUA_standing_army`. In game the renamed focus shows as its raw id, with the
// two old keys orphaned beside it — and the editor still displays the right name, because its in-memory map
// was updated, so nothing on screen suggests anything is wrong.
//
// This is a CLIENT-side fix, so the guard is on the client source: the rename must queue the write under the
// new id and queue the strip of the old one. The behaviour itself was verified through the real page (the
// yml goes from NUA_army/NUA_army_desc to NUA_standing_army/NUA_standing_army_desc with no orphan left).
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");

// ── the rename handler's exact span ──────────────────────────────────────────────────────────────
const start = src.indexOf("function applySelectedFocusIdEdit");
ok("the focus rename handler still exists", start !== -1);
const bodyOpen = src.indexOf("{", start);
let depth = 0, bodyClose = -1, inStr = false, strCh = "";
for (let i = bodyOpen; i < src.length; i++) {
  const ch = src[i], prev = src[i - 1];
  if (inStr) { if (ch === strCh && prev !== "\\") inStr = false; continue; }
  if (ch === '"' || ch === "'" || ch === "`") { inStr = true; strCh = ch; continue; }
  if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
  if (ch === "{") depth++;
  else if (ch === "}") { depth--; if (depth === 0) { bodyClose = i; break; } }
}
ok("…and its body is brace-balanced", bodyClose !== -1);
const body = src.slice(bodyOpen, bodyClose === -1 ? undefined : bodyClose);
const code = body.replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));

// ── it must move the in-memory maps (the part that already worked) ───────────────────────────────
ok("the rename carries the name in the localisation map", /localizationMap\[nextId\]\s*=\s*localizationMap\[oldId\]/.test(code), code.slice(0, 200));
ok("…and the description", /localizationDescMap\[nextDescKey\]\s*=\s*localizationDescMap\[oldDescKey\]/.test(code));

// ── THE REGRESSION: it must also queue the on-disk write and the on-disk strip ────────────────────
ok("the rename QUEUES a localisation write under the new id",
  /pendingLocalizationEdits\.set\(\s*nextId\s*,/.test(code),
  "no pendingLocalizationEdits.set(nextId, …) in the rename handler");
ok("…and queues the OLD id for stripping, so its keys do not orphan",
  /pendingLocalizationDeletes\.add\(\s*oldId\s*\)/.test(code),
  "no pendingLocalizationDeletes.add(oldId) in the rename handler");

// The queued write must carry the strings, not blanks — writing empty values would replace the name with "".
const setBlock = /pendingLocalizationEdits\.set\(\s*nextId\s*,\s*\{([\s\S]{0,220}?)\}\s*\)/.exec(code);
ok("…and the queued entry carries the real name/desc rather than blanks",
  !!setBlock && /carriedName|localizationMap\[nextId\]/.test(setBlock[1]) && /carriedDesc|localizationDescMap/.test(setBlock[1]),
  setBlock ? setBlock[1].trim().slice(0, 160) : "no set(nextId, {…}) found");

// ── the save must still be the thing that consumes those queues ──────────────────────────────────
ok("the save writes queued localisation edits", /pendingLocalizationEdits\.size\s*>\s*0/.test(src));
ok("…and strips queued localisation deletes", /pendingLocalizationDeletes\.size\s*>\s*0/.test(src));

console.log("\ntest-focus-rename-loc: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 8 ? 0 : 1;
