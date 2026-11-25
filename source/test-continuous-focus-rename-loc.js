// Regression (bug-hunt #4): RENAMING a continuous focus must strip the OLD name loc key — the rename-focus
// op only swapped the palette id, leaving <oldId>:0 orphaned (delete-focus already stripped; rename didn't).
// Anchored: renaming zztest_cf must NOT touch the prefix-sharing sibling zztest_cf_keep.
// Run: node test-continuous-focus-rename-loc.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfren-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CFRen"\n');
  const palFile = path.join(mod, "common", "continuous_focus", "generic.txt");
  mk(palFile,
    "continuous_focus_palette = {\n" +
    "\tid = generic_focus\n\tcountry = { factor = 1 }\n\tdefault = yes\n\tposition = { x = 50 y = 1000 }\n" +
    "\tfocus = {\n\t\tid = zztest_cf\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n" +
    "\tfocus = {\n\t\tid = zztest_cf_keep\n\t\tx = 1\n\t\ty = 0\n\t\tcost = 10\n\t}\n" +
    "}\n");
  const locFile = path.join(mod, "localisation", "english", "cf_l_english.yml");
  mk(locFile, "﻿l_english:\n zztest_cf:0 \"CF One\"\n zztest_cf_keep:0 \"CF Keep (sibling)\"\n");
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  try {
    const r = await post("/api/continuous-focus/save", { modPath: mod, op: "rename-focus", paletteId: "generic_focus", file: "generic.txt", focusId: "zztest_cf", newId: "zztest_cf_new" });
    ok(r.ok, "rename-focus ok", r);
    const pal = fs.readFileSync(palFile, "utf8");
    ok(/id\s*=\s*zztest_cf_new\b/.test(pal), "palette id renamed to zztest_cf_new");
    ok(!/\bid\s*=\s*zztest_cf\b(?!_)/.test(pal), "old palette id gone");
    ok(/id\s*=\s*zztest_cf_keep/.test(pal), "sibling focus preserved");
    const loc = fs.readFileSync(locFile, "utf8");
    ok(!/zztest_cf:0/.test(loc), "OLD name loc key stripped (no orphan) — the bug fix");
    ok(/zztest_cf_keep:0/.test(loc), "prefix-sharing SIBLING loc survives (anchored, not a substring wipe)");
  } catch (e) { ok(false, "threw: " + e.message + "\n" + (e.stack || "")); }
  finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    console.log(`\n  ${pass} passed, ${fail} failed`);
  }
})();
