// Regression + correctness proof for the mod-index DISK cache (Home load perf). The mod-index payload (Home's
// counts + health strip) was only cached IN MEMORY, so it rebuilt ~2.5s on EVERY relaunch of a big mod. It now
// persists to disk keyed by a cheap stat-based fingerprint — a match on a cold session serves the previous
// payload instantly; ANY file change flips the fingerprint so stale data can never be served. This test proves
// the round-trip and, critically, the invalidation (an edit → fingerprint miss → the endpoint would rebuild).
// Run: node test-modindex-disk-cache.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-midx-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIdx"\n');
const w = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const focusFile = w("common/national_focus/tree.txt", "focus_tree = { id = t focus = { id = f1 x=0 y=0 } }\n");
w("common/ideas/spirits.txt", "ideas = { country = { my_spirit = { picture = x } } }\n");
w("events/e.txt", "add_namespace = e\ncountry_event = { id = e.1 }\n");

const payload = { counts: { focus: 1, idea: 1, event: 1 }, problems: [], entities: [{ type: "focus", id: "f1" }] };

try {
  // fingerprint is deterministic for unchanged files
  const fp1 = S.modIndexFingerprint(mod);
  const fp1b = S.modIndexFingerprint(mod);
  ok("fingerprint is stable across calls when nothing changed", fp1 === fp1b, [fp1.slice(0, 8), fp1b.slice(0, 8)]);
  ok("fingerprint is a non-empty hash", typeof fp1 === "string" && fp1.length >= 16);

  // disk round-trip: write with fp1, read with fp1 → same payload back
  ok("disk read is a MISS before any write", S.readModIndexDisk(mod, fp1) === null);
  S.writeModIndexDisk(mod, fp1, payload);
  const got = S.readModIndexDisk(mod, fp1);
  ok("disk read returns the persisted payload on a fingerprint match", got && got.counts && got.counts.focus === 1, got);

  // a DIFFERENT fingerprint must not match the saved payload (would force a rebuild)
  ok("disk read is a MISS on a fingerprint mismatch", S.readModIndexDisk(mod, "deadbeef" + fp1.slice(8)) === null);

  // EDIT a scanned file → fingerprint changes → the endpoint's fp no longer matches the saved one
  const before = fs.statSync(focusFile).mtimeMs;
  fs.writeFileSync(focusFile, "focus_tree = { id = t focus = { id = f1 x=0 y=0 } focus = { id = f2 x=1 y=0 } }\n");
  // ensure mtime actually advanced (fast filesystems can land on the same ms)
  const after = fs.statSync(focusFile).mtimeMs;
  if (after === before) { const t = new Date(Date.now() + 1500); fs.utimesSync(focusFile, t, t); }
  const fp2 = S.modIndexFingerprint(mod);
  ok("editing a scanned file FLIPS the fingerprint", fp2 !== fp1, [fp1.slice(0, 8), fp2.slice(0, 8)]);
  ok("the stale disk payload is NOT served after an edit (rebuild would trigger)", S.readModIndexDisk(mod, fp2) === null);

  // adding a brand-new file also flips it (catches new content, not just edits)
  w("common/decisions/d.txt", "cat = { d1 = { cost = 1 } }\n");
  ok("adding a scanned file FLIPS the fingerprint", S.modIndexFingerprint(mod) !== fp2);

  // a change OUTSIDE the scanned set does NOT flip it (no needless rebuilds)
  w("gfx/notes.txt", "irrelevant");
  const fp3 = S.modIndexFingerprint(mod);
  w("gfx/notes2.txt", "also irrelevant");
  ok("an unrelated (non-scanned) file does NOT flip the fingerprint", S.modIndexFingerprint(mod) === fp3);
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
finally {
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nMODINDEX-DISK-CACHE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
