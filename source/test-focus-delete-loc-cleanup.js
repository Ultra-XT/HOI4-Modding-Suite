// Regression: deleting a focus from the tree must strip its localization (title + _desc) from the loc
// .yml on save — otherwise the strings ORPHAN (the focus-tree save only re-writes EDITED focuses' loc,
// never the DELETED ones). The new /api/focus/strip-localization probes EVERY english loc file (the id
// may live in a file not named after it) and anchors the key so a prefix-sharing sibling survives.
// Found by deep UI testing (same orphan class as the ideas/events/decisions/characters deletes).
// Run: node test-focus-delete-loc-cleanup.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3498, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusloc-"));
  mk(path.join(mod, "descriptor.mod"), 'name="FocusLoc"\n');
  // Loc lives in a file NOT named after the focus (the editor may pick a different file for upsert) — the
  // strip must still find it. zztest_focus_a_two shares a prefix and MUST survive (anchored key removal).
  // zztest_focus_b has a MULTI-LINE desc value to exercise the multi-line stanza removal.
  const locFile = path.join(mod, "localisation", "english", "country_focus_l_english.yml");
  mk(locFile,
    "﻿l_english:\n" +
    ' zztest_focus_a:0 "Focus A"\n' +
    ' zztest_focus_a_desc:0 "Description for A"\n' +
    ' zztest_focus_a_two:0 "Focus A Two (sibling)"\n' +
    ' zztest_focus_b:0 "Focus B"\n' +
    ' zztest_focus_b_desc:0 "Line one\n  still the desc\n  last line"\n' +
    ' keep_focus:0 "Keep Me"\n');
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  try {
    // delete two focuses at once; only their keys should go
    const r = await post("/api/focus/strip-localization", { modPath: mod, focusIds: ["zztest_focus_a", "zztest_focus_b"] });
    ok(r.ok, "strip-localization ok", r);
    ok(r.stripped >= 2, "reports at least the two stripped focuses", r);
    ok(Array.isArray(r.files) && r.files.some((f) => /country_focus_l_english\.yml$/.test(f)), "names the cleaned loc file (probe found it)", r.files);
    const loc = fs.readFileSync(locFile, "utf8");
    ok(!/zztest_focus_a:0/.test(loc), "focus A title removed");
    ok(!/zztest_focus_a_desc:0/.test(loc), "focus A _desc removed");
    ok(/zztest_focus_a_two:0/.test(loc), "the prefix-sharing SIBLING survives (anchored, not collateral)");
    ok(!/zztest_focus_b:0/.test(loc), "focus B title removed");
    ok(!/zztest_focus_b_desc:0/.test(loc), "focus B multi-line _desc removed");
    ok(!/still the desc/.test(loc) && !/last line/.test(loc), "the continued lines of B's multi-line desc are gone too");
    ok(/keep_focus:0/.test(loc), "unrelated focus loc is preserved");
    ok(/^﻿?l_english:/m.test(loc), "the l_english header is intact after strip");

    // idempotent / no-op for ids not present: no error, nothing changed
    const r2 = await post("/api/focus/strip-localization", { modPath: mod, focusIds: ["zztest_focus_a", "not_here_xyz"] });
    ok(r2.ok && r2.stripped === 0 && r2.files.length === 0, "re-strip of already-gone/absent ids is a clean no-op", r2);

    // rejects vanilla / game root is covered by checkActiveRootNotGameRoot; bad ids are filtered
    const r3 = await post("/api/focus/strip-localization", { modPath: mod, focusIds: ["../../etc/passwd", "has space"] });
    ok(r3.ok && r3.stripped === 0, "malformed ids are filtered, not acted on", r3);
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    // Reliable teardown on Windows: exitCode + closeAllConnections + close (NEVER process.exit).
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
