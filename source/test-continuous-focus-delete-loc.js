// Regression: deleting a CONTINUOUS focus must strip its localization — a continuous focus carries a
// name loc (<id>:0, written via localization/upsert on save), and the delete-focus op only removed the
// palette block, ORPHANING the loc (same class as the national-focus/tech/idea deletes). Anchored, so
// zztest_cf deletion must NOT take the prefix-sharing sibling zztest_cf_keep. Found by deep UI testing.
// Run: node test-continuous-focus-delete-loc.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3500, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfloc-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CFLoc"\n');
  const palFile = path.join(mod, "common", "continuous_focus", "generic.txt");
  mk(palFile,
    "continuous_focus_palette = {\n" +
    "\tid = generic_focus\n\tcountry = { factor = 1 }\n\tdefault = yes\n\tposition = { x = 50 y = 1000 }\n" +
    "\tfocus = {\n\t\tid = zztest_cf\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n" +
    "\tfocus = {\n\t\tid = zztest_cf_keep\n\t\tx = 1\n\t\ty = 0\n\t\tcost = 10\n\t}\n" +
    "}\n");
  const locFile = path.join(mod, "localisation", "english", "cf_l_english.yml");
  mk(locFile, "﻿l_english:\n zztest_cf:0 \"CF One\"\n zztest_cf_desc:0 \"\"\n zztest_cf_keep:0 \"CF Keep (sibling)\"\n");
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  try {
    const r = await post("/api/continuous-focus/save", { modPath: mod, op: "delete-focus", paletteId: "generic_focus", file: "generic.txt", focusId: "zztest_cf" });
    ok(r.ok, "delete-focus ok", r);
    const pal = fs.readFileSync(palFile, "utf8");
    ok(!/\bid\s*=\s*zztest_cf\b(?!_)/.test(pal), "the continuous focus block is removed from the palette");
    ok(/id\s*=\s*zztest_cf_keep/.test(pal), "the sibling continuous focus is preserved");
    const loc = fs.readFileSync(locFile, "utf8");
    ok(!/zztest_cf:0/.test(loc), "the name loc is stripped (no orphan)");
    ok(!/zztest_cf_desc:0/.test(loc), "the _desc loc is stripped (no orphan)");
    ok(/zztest_cf_keep:0/.test(loc), "the prefix-sharing SIBLING loc survives (anchored)");
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
