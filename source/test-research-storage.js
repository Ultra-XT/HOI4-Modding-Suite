// LOCALSTORAGE resilience invariants (#storage-degrades). NO BUG WAS FOUND — this records the two
// properties that make the swallowed failures acceptable, because "we ignore the error here" is only
// defensible while both hold, and a future edit can break either without any visible symptom.
//
// A great deal of editor state lives in localStorage: annotations, dragged label positions, all four
// year-override maps, custom tabs, layout overrides. Every write is wrapped in `try { } catch (_) {}`
// and every read defaults on a parse failure. That LOOKS like the silent-data-loss shape this campaign
// kept finding — a write that fails, nobody told, work gone on reload. Two measurements say otherwise:
//
//   QUOTA IS NOT REACHABLE. Measured on a real profile with Millennium Dawn loaded: 2 keys, 0.2 KB
//   used, ~5 MB of headroom. Even the pathological case — a user dragging every one of MD's 1568
//   section labels — is about 94 KB. A write cannot realistically fail, so swallowing it loses nothing.
//
//   CORRUPTION DEGRADES, IT DOES NOT BREAK. Poisoning all nine staged-state keys with invalid JSON and
//   loading the page gives 985 techs, 11 tabs and zero page errors: every read falls back to its
//   default. That is the RIGHT behaviour — refusing to open the editor because one cached override is
//   unreadable would be worse than losing the override.
//
// What must never happen is an UNGUARDED JSON.parse of a stored value: that throws during boot and
// white-screens the research page over a single corrupt byte. That is what this file prevents.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const lines = src.split(/\r?\n/);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// ---- 1. NO UNGUARDED PARSE OF A STORED VALUE ----
// A parse of localStorage content must sit inside a try, or a corrupt value throws during boot.
const unguarded = [];
for (let i = 0; i < lines.length; i++) {
  if (!/JSON\.parse\s*\(/.test(lines[i])) continue;
  const window5 = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
  if (!/localStorage\.getItem/.test(window5)) continue;
  // the guard may be on this line or open a few lines above
  const ctx = lines.slice(Math.max(0, i - 6), i + 2).join("\n");
  if (!/try\s*\{/.test(ctx)) unguarded.push(i + 1);
}
ok(unguarded.length === 0,
  `every JSON.parse of a stored value is guarded — an unguarded one white-screens the page on a corrupt byte (offenders: ${unguarded.join(", ")})`);

// ---- 2. THE STAGED-EDIT WRITES STAY GUARDED ----
// These carry work that only exists in the browser until Save. A throw here (storage disabled, private
// mode) must not abort the operation that was mid-flight — losing the persistence is survivable,
// aborting a save flush is not.
const STAGED = [
  "research_annotations_", "research_gui_label_overrides_",
  "research_gui_year_pos_", "research_gui_year_val_",
  "research_gui_year_hidden_", "research_gui_year_custom_",
];
for (const key of STAGED) {
  const i = lines.findIndex((l) => l.includes(`localStorage.setItem(\`${key}`));
  ok(i !== -1, `the ${key}* write exists`);
  if (i === -1) continue;
  const ctx = lines.slice(Math.max(0, i - 2), i + 2).join("\n");
  ok(/try\s*\{/.test(ctx) && /catch/.test(ctx), `the ${key}* write cannot throw out of its caller`);
}

// ---- 3. THE HISTORY DOES NOT DEPEND ON STORAGE ----
// Undo/redo keeps its snapshots in memory, so a storage failure can never cost you an undo step.
const hi = src.indexOf("function histSnapshot(");
const hopen = src.indexOf("{", hi);
let d = 0, hend = hopen;
for (let j = hopen; j < src.length; j++) {
  if (src[j] === "{") d++;
  else if (src[j] === "}") { d--; if (!d) { hend = j; break; } }
}
ok(!/localStorage/.test(src.slice(hopen, hend)), "the undo snapshot is held in memory, not in localStorage");

console.log(`test-research-storage: ${checks} checks passed`);
