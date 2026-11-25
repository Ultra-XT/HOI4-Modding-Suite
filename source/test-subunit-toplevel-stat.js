// POST /api/subunits/edit overwrote the FIRST textual `<stat> = value` in the sub_unit body, regardless of brace
// depth. MD's recon battalions declare `battalion_mult = { soft_attack = 0.05 }` BEFORE the real top-level
// `soft_attack = -0.66`, so editing Soft attack silently corrupted the hidden battalion_mult modifier and left the
// intended top-level stat untouched — and it stayed brace-balanced, so it committed with "✓ Saved" and no error.
// The writer now edits only the TOP-LEVEL (brace-depth 0) stat, mirroring the reader. Run: node test-subunit-toplevel-stat.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sustat-"));
fs.mkdirSync(path.join(mod, "common", "units"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="subunit stat test"\n');
// A sub_unit whose battalion_mult nests soft_attack/defense AHEAD of the real top-level stats.
fs.writeFileSync(path.join(mod, "common", "units", "nova_land.txt"), [
  "sub_units = {",
  "\tMot_Recce = {",
  "\t\tsprite = motorized",
  "\t\tbattalion_mult = {",
  "\t\t\tsoft_attack = 0.05",
  "\t\t\tdefense = 0.10",
  "\t\t}",
  "\t\ttype = { infantry }",
  "\t\tgroup = mobile",
  "\t\tsoft_attack = -0.66",
  "\t\tdefense = 2.0",
  "\t\tmax_strength = 25",
  "\t}",
  "}",
  "",
].join("\n"));
const landFile = () => fs.readFileSync(path.join(mod, "common", "units", "nova_land.txt"), "utf8");

const PORT = 3979, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (body) => fetch(`${BASE}/api/subunits/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    const d = await post({ modPath: mod, key: "Mot_Recce", fileName: "nova_land.txt", stats: { soft_attack: 9.99, defense: 3.33 } });
    ok("subunit edit ok", d && d.ok === true, d);
    const txt = landFile();
    // TOP-LEVEL stats updated…
    ok("top-level soft_attack updated to 9.99", /(^|\n)\s*soft_attack\s*=\s*9\.99/.test(txt), txt);
    ok("top-level defense updated to 3.33", /(^|\n)\s*defense\s*=\s*3\.33/.test(txt), txt);
    // …and the NESTED battalion_mult modifiers are LEFT INTACT.
    ok("nested battalion_mult soft_attack still 0.05 (NOT corrupted)", /battalion_mult\s*=\s*\{[\s\S]*?soft_attack\s*=\s*0\.05/.test(txt), txt.slice(txt.indexOf("battalion_mult"), txt.indexOf("battalion_mult") + 120));
    ok("nested battalion_mult defense still 0.10 (NOT corrupted)", /battalion_mult\s*=\s*\{[\s\S]*?defense\s*=\s*0\.10/.test(txt), txt.slice(txt.indexOf("battalion_mult"), txt.indexOf("battalion_mult") + 120));
    // Exactly one top-level soft_attack, and the nested 0.05 is still present exactly once.
    ok("no accidental extra soft_attack lines", (txt.match(/soft_attack\s*=/g) || []).length === 2, (txt.match(/soft_attack\s*=/g) || []).length);
    ok("file brace-balanced", (txt.match(/\{/g) || []).length === (txt.match(/\}/g) || []).length, txt);

    // Appending a stat that isn't present at all still works (append path).
    const d2 = await post({ modPath: mod, key: "Mot_Recce", fileName: "nova_land.txt", stats: { hard_attack: 4.4 } });
    ok("edit ok (append case)", d2 && d2.ok === true, d2);
    ok("a not-previously-present top-level stat is appended", /(^|\n)\s*hard_attack\s*=\s*4\.4/.test(landFile()), landFile());
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nSUBUNIT-TOPLEVEL-STAT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
