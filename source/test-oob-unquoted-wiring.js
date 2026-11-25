// A country whose history wires its land OOB with an UNQUOTED token (set_oob = PRC_1936 — vanilla ships this)
// must be recognised as already-wired. extractLandOobNames only matched QUOTED names, so such a country read
// as un-wired: the editor reported oobWired=false and a Save injected a redundant top-level oob= line into the
// hand-authored country history. Run: node test-oob-unquoted-wiring.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unquoted-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "history", "units"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="unquoted oob test"\n');
// UNQUOTED set_oob inside a dated block — exactly vanilla PRC's shape.
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "capital = 1\n\n1936.1.1 = {\n\tset_oob = TST_1936\n}\n");
fs.writeFileSync(path.join(mod, "history", "units", "TST_1936.txt"), [
  "division_template = {", '\tname = "Inf"', "\tregiments = { infantry = { x = 0 y = 0 } }", "}", "",
  "units = {", "\tdivision = {", '\t\tname = "1. Div"', "\t\tlocation = 100", '\t\tdivision_template = "Inf"', "\t}", "}", "",
].join("\n"));
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");

(async () => {
  const PORT = 3988, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // GET must recognise the unquoted wiring and edit the referenced file.
    const g = await fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
    ok("GET reports oobWired = true for an UNQUOTED set_oob", g && g.oobWired === true, { oobWired: g && g.oobWired, file: g && g.file });
    ok("GET edits the REFERENCED file (TST_1936.txt), not a fresh TST_nova.txt", g && g.file === "TST_1936.txt", g && g.file);
    ok("GET reads the referenced file's division", g && (g.divisions || []).length === 1, g && g.divisions);

    // Save must NOT inject a redundant top-level oob= line (the country is already wired via set_oob).
    const save = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "TST", templates: [{ name: "Inf", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }], divisions: [{ name: "1. Div", location: 100, template: "Inf", _dirty: true }] }),
    }).then((r) => r.json());
    ok("save ok", save && save.ok === true, save && save.error);
    const hist = fs.readFileSync(histPath, "utf8");
    ok("NO redundant top-level `oob = ...` line injected into the hand-authored history", !/(^|\n)[ \t]*oob\s*=/.test(hist), hist);
    ok("the original unquoted set_oob is still there, untouched", /set_oob\s*=\s*TST_1936/.test(hist), hist);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nOOB-UNQUOTED-WIRING: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
