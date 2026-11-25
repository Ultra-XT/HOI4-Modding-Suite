// ⛔ #a-duplicate-state-file-that-cannot-be-removed-is-said (tool campaign B3-12).
//
// fixDuplicateStateFiles removes a leftover duplicate state block, and removeStateBlockFromFile deletes the file when the block was all
// it held — but it swallowed a failed delete (`try { fs.unlinkSync(p); } catch (_) {}`) and answered true. So a stub another program
// held open (an editor, a sync or antivirus program) was reported REMOVED by both of its callers — Mod Health's "🔧 Fix duplicate states"
// ("Removed 1 stray duplicate block(s).") and the map's Auto-fix ("removed 1 duplicate state definition") — while the stub and the rule
// stayed. A file it cannot take away is now reported, as repairRegionOverlaps reports a file it cannot write (`errors`).
//   1. with the delete refused: the stub is not in `removed`, `errors` names it and why, it is still on disk, its id is not "kept";
//   2. control: the same fixture with the delete allowed removes the stub and reports no error;
//   3. through autoFixMap the answer carries the same, and the page's summary says it could not remove it and not that it did;
//   4. Mod Health's duplicateFixNote says it could not be removed;
//   5. source (comments masked): removeStateBlockFromFile reports a failed delete instead of swallowing it.
// The refusal is injected by wrapping fs.unlinkSync for the stub's path (map-data.js calls it through the shared fs module).
// Binds no port. Run: node test-a-duplicate-state-file-that-cannot-be-removed-is-said.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dup-unremovable-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const TL = require("./testlib-map-page.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const STUB = "1-restored.txt";   // id 1, so Auto-fix's id-gap closer has nothing to slide (renumberStateId renames a file)
function world(label) {
  const mod = path.join(ROOT, label);
  mk(path.join(mod, "descriptor.mod"), 'name="DU"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\n1;10;0;0;land;false;plains;1\n");
  mk(path.join(mod, "history", "states", "1-STATE_1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "states", STUB), "state={\n\tid=1\n}\n");
  return mod;
}
const realUnlink = fs.unlinkSync;
function refusingTheStub(fn) {
  fs.unlinkSync = function (p, ...rest) {
    if (path.basename(String(p)) === STUB) { const e = new Error(`EBUSY: resource busy or locked, unlink '${p}'`); e.code = "EBUSY"; throw e; }
    return realUnlink.call(fs, p, ...rest);
  };
  try { return fn(); } finally { fs.unlinkSync = realUnlink; }
}
const stubThere = (mod) => fs.existsSync(path.join(mod, "history", "states", STUB));
function liftModHealthNote() {
  const src = fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8").replace(/\r\n/g, "\n");
  const masked = maskJsComments(src);
  const first = "  function duplicateFixNote(res) {";
  const a = masked.indexOf(first);
  if (a < 0 || masked.indexOf(first, a + 1) !== -1) throw new Error("duplicateFixNote not found once");
  const b = masked.indexOf("\n  }\n", a);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return new Function("esc", src.slice(a, b + 4) + "\nreturn duplicateFixNote;")(esc);
}

try {
  console.log("=== 1. the delete is refused ===");
  {
    const mod = world("refused");
    const r = refusingTheStub(() => md.fixDuplicateStateFiles({ modRoot: mod }));
    ok("the stub is not reported removed", !(r.removed || []).some((x) => x.file === STUB), r);
    ok("`errors` names it, its id and why", (r.errors || []).some((e) => e.file === STUB && e.id === 1 &&/EBUSY/.test(e.error)), r.errors);
    ok("the stub is still on disk", stubThere(mod));
    ok("its id is not counted as kept (resolved)", !(r.keptIds || []).includes(1), r.keptIds);
    ok("the duplicate is still reported by the map check (the state-file conflicts /api/map/validate adds)", md.findStateFileConflicts(mod).some((p) => p.rule === "duplicate_state_id"));

    console.log("=== 2. control: the delete allowed ===");
    const k = md.fixDuplicateStateFiles({ modRoot: mod });
    ok("the stub is removed and said", (k.removed || []).some((x) => x.file === STUB) && !stubThere(mod) && !(k.errors || []).length, k);
  }

  console.log("=== 3. through Auto-fix, and the page's summary ===");
  {
    const mod = world("autofix");
    const fr = refusingTheStub(() => md.autoFixMap({ modRoot: mod }));
    ok("autoFixMap ok", fr && fr.ok, fr && fr.error);
    const dsf = (fr.fixes || {}).dupStateFiles || {};
    ok("fixes.dupStateFiles names the file it could not remove, and not as removed", (dsf.errors || []).some((e) => e.file === STUB) && !(dsf.removed || []).some((x) => x.file === STUB), dsf);
    ok("the stub is still on disk", stubThere(mod));
    const line = TL.autoFixSummary(fr);
    ok("the summary says it could not remove it, and does not say it removed it",
      /could not remove 1 duplicate state file/.test(line) && line.includes(STUB) && !/removed 1 duplicate state definition/.test(line), line);
  }

  console.log("=== 4. Mod Health's note ===");
  {
    const note = liftModHealthNote();
    const s = note({ ok: true, removed: [], unresolved: [], keptIds: [], errors: [{ id: 1029, file: STUB, error: "EBUSY: resource busy or locked" }] });
    ok("the note says the file could not be removed, and what to do", /could not be removed/.test(s) && s.includes(STUB) && /click again/.test(s) && /Removed 0 stray duplicate block/.test(s), s);
    ok("control: a clean answer reads as before", note({ ok: true, removed: [{ id: 1, file: "x.txt" }], unresolved: [] }) === "Removed 1 stray duplicate block(s).");
  }

  console.log("=== 5. source (comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const opening = "function removeStateBlockFromFile(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    const body = masked.slice(span[0], span[1] + 1);
    ok("the delete's failure is not swallowed", !/unlinkSync\(p\);\s*\}\s*catch\s*\(_\)\s*\{\s*\}/.test(body) && /unlinkSync\(p\)[\s\S]{0,300}failures/.test(body), body.slice(0, 600));
  }
  console.log(`\ntest-a-duplicate-state-file-that-cannot-be-removed-is-said: ${pass} checks passed`);
} finally {
  fs.unlinkSync = realUnlink;
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixture */ }
}
