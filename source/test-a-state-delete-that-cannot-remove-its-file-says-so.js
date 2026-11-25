// ⛔ #a-state-delete-that-cannot-remove-its-file-says-so (review of tool campaign B2-2; the class of B3-12, in deleteState).
//
// deleteState removes a state that is alone in its file by deleting the file, and it swallowed a failed delete
// (`try { fs.unlinkSync(p); } catch (_) {}`) and answered changed:true. Since B2-2, Auto-fix's empty-state sweep deletes the empty
// capital state of a country that owns no land through it, so a state file another program held open (an editor, a sync or antivirus
// program, the game) was reported "removed 1 empty state … state 3 was the capital only of BBB" while the file, the state and the FATAL
// empty_capital_state all stayed; the Delete state button reported success the same way. Measured on the review's probe with a real
// share-read lock (EBUSY): deleted [3], landlessCapitals [3: BBB], file still there, FATAL left.
//   1. with the delete refused: deleteState answers changed:false and an error naming the file; the file and the state are still there;
//   2. fixEmptyStates does not count it: not in `deleted`, not in `landlessCapitals`, `skipped` carries the reason;
//   3. through autoFixMap the page's own summary says the state was left alone and why, and not that it was removed;
//   4. control: the same fixture with the delete allowed deletes the state (so the refusal is what bites);
//   5. source (comments masked): deleteState's delete is not wrapped in an empty catch.
// The refusal is injected by wrapping fs.unlinkSync for the one file's path (map-data.js calls it through the shared fs module), as
// test-a-duplicate-state-file-that-cannot-be-removed-is-said.js does. Binds no port.
// Run: node test-a-state-delete-that-cannot-remove-its-file-says-so.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delete-unremovable-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const TL = require("./testlib-map-page.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
const provAtX = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : 3);
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;
const LOCKED = "3-S3.txt";
// States 1..3; the highest (3) is empty and the capital only of BBB, which owns no land, so the sweep deletes it and no id gap opens.
function world(label) {
  const mod = path.join(ROOT, label);
  mk(path.join(mod, "descriptor.mod"), 'name="DL"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 3 } }');
  for (const [id, owner, provs] of [[1, "AAA", "1 2"], [2, "CCC", "3"], [3, "AAA", ""]]) mk(path.join(mod, "history", "states", `${id}-S${id}.txt`), state(id, owner, provs));
  for (const [tag, cap] of [["AAA", 1], ["CCC", 2], ["BBB", 3]]) mk(path.join(mod, "history", "countries", `${tag}.txt`), `capital = ${cap}\n`);
  return mod;
}
const realUnlink = fs.unlinkSync;
function refusingTheFile(fn) {
  fs.unlinkSync = function (p, ...rest) {
    if (path.basename(String(p)) === LOCKED) { const e = new Error(`EBUSY: resource busy or locked, unlink '${p}'`); e.code = "EBUSY"; throw e; }
    return realUnlink.call(fs, p, ...rest);
  };
  try { return fn(); } finally { fs.unlinkSync = realUnlink; }
}
const there = (mod) => fs.existsSync(path.join(mod, "history", "states", LOCKED));
const stateIds = (mod) => (md.buildMapModel({ modRoot: mod }).states || []).map((s) => s.id);
const fatalRules = (mod) => md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.severity === "error" && labels.isFatalRule(p.rule)).map((p) => p.rule);

try {
  console.log("=== 1. deleteState, with the file's delete refused ===");
  {
    const mod = world("one");
    const r = refusingTheFile(() => md.deleteState({ modRoot: mod, stateId: 3 }));
    ok("deleteState answers changed:false", r && r.changed === false, r);
    ok("…with an error that names the file and says the state is still there", /history\/states\/3-S3\.txt/.test(r.error || "") && /state 3 is still in your mod/.test(r.error || ""), r.error);
    ok("the file and the state are still there", there(mod) && stateIds(mod).includes(3), stateIds(mod));
  }

  console.log("=== 2. fixEmptyStates does not count what it could not delete ===");
  {
    const mod = world("two");
    const r = refusingTheFile(() => md.fixEmptyStates({ modRoot: mod }));
    ok("state 3 is not in `deleted`", !(r.deleted || []).includes(3), r);
    ok("…nor said as a landless capital it removed", !(r.landlessCapitals || []).some((c) => c.id === 3), r.landlessCapitals);
    ok("…and `skipped` carries why", (r.skipped || []).some((s) => s.id === 3 && /Couldn't delete history\/states\/3-S3\.txt/.test(s.reason || "")), r.skipped);
    ok("the FATAL it could not clear is still reported", there(mod) && fatalRules(mod).includes("empty_capital_state"), fatalRules(mod));
  }

  console.log("=== 3. through autoFixMap: the page's summary says it was left alone, and not that it was removed ===");
  {
    const mod = world("three");
    const fr = refusingTheFile(() => md.autoFixMap({ modRoot: mod }));
    const es = (fr && fr.fixes && fr.fixes.emptyStates) || {};
    ok("the answer does not list state 3 as deleted", !(es.deleted || []).includes(3) && !(es.landlessCapitals || []).length, es);
    const line = TL.autoFixSummary(fr);
    ok("the summary does not say it removed the empty state", !/removed 1 empty state/.test(line) && !/capital only of BBB/.test(line), line);
    ok("…and says it was left alone, naming the file", /empty state left alone — Couldn't delete history\/states\/3-S3\.txt/.test(line), line);
  }

  console.log("=== 4. control: the delete allowed ===");
  {
    const mod = world("four");
    const r = md.fixEmptyStates({ modRoot: mod });
    ok("state 3 is deleted and said", (r.deleted || []).includes(3) && (r.landlessCapitals || []).some((c) => c.id === 3) && !there(mod), r);
  }

  console.log("=== 5. source: deleteState's delete is not wrapped in an empty catch (comments masked) ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const masked = maskJsComments(src);
    const opening = "function deleteState(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    if (!span) throw new Error("map-data.js: no body for " + opening);
    const body = masked.slice(span[0], span[1] + 1);
    ok("deleteState calls fs.unlinkSync", /fs\.unlinkSync\(\s*p\s*\)/.test(body));
    ok("…and never swallows it", !/fs\.unlinkSync\(\s*p\s*\)\s*;?\s*\}\s*catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(body));
  }
  console.log(`\ntest-a-state-delete-that-cannot-remove-its-file-says-so: ${pass} checks passed`);
} finally {
  fs.unlinkSync = realUnlink;
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixtures and app-data */ }
}
