// The army/save oob auto-wiring must place `oob = "..."` OUTSIDE the Nova-managed variant/stockpile region.
// A brand-new Nova country's file is just that region, whose sentinel + `# NOVA-*` header lines are comments;
// a skip-leading-comments insert landed the oob INSIDE the region, so the next variant/stockpile save (which
// rebuilds the whole region span from its JSON headers) silently DELETED the oob line — and the country then
// started with no divisions. Run: node test-oob-wiring-outside-region.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const NOVA_VAR_START = "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>";
const NOVA_VAR_END = "# <<< NOVA equipment variants <<<";

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobwire-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="oob wire test"\n');
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "custom.txt"), "equipments = {\n\tnova_tank = { year = 1936 is_archetype = yes type = armor }\n}\n");
// A brand-new Nova country: only a variant region (variant "Alpha") + a dated tail. NO oob line yet.
const hdr = "# NOVA-VARIANT " + JSON.stringify({ name: "Alpha", chassisType: "nova_tank", dlc: "No Step Back", modules: [], upgrades: {}, fallbackType: "nova_tank", fallbackUpgrades: {}, icon: "", obsolete: false });
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), ["capital = 1", "", NOVA_VAR_START, hdr, NOVA_VAR_END, "", "1936.1.1 = {", "}", ""].join("\n"));
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");
const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const PORT = 3995, BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // Save a land OOB → auto-wires the oob line.
    const save = await post("/api/army/save", { modPath: mod, tag: "TST", templates: [{ name: "Inf", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }], divisions: [{ name: "1. Div", location: 1, template: "Inf", _dirty: true }] });
    ok("army save ok, oob wired", save && save.ok === true && save.oobWired === true, save);
    let txt = fs.readFileSync(histPath, "utf8");
    const oobAt = txt.search(/(^|\n)[ \t]*oob\s*=/);
    ok("oob line was written", oobAt >= 0, txt);
    ok("oob line is OUTSIDE the Nova region (before NOVA_VAR_START)", oobAt >= 0 && oobAt < txt.indexOf(NOVA_VAR_START), { oobAt, regionAt: txt.indexOf(NOVA_VAR_START) });

    // Now re-write the variant region (delete a non-existent variant → Alpha survives, region rebuilt).
    const del = await post("/api/equipment/variant/delete", { modPath: mod, tag: "TST", name: "Ghost" });
    ok("variant re-write ok", del && del.ok === true, del);
    txt = fs.readFileSync(histPath, "utf8");
    ok("the oob line SURVIVES the region rebuild (not discarded)", /(^|\n)[ \t]*oob\s*=\s*"[^"]+"/.test(txt), txt);
    ok("the variant region + tail are intact", /"name":"Alpha"/.test(txt) && /1936\.1\.1/.test(txt), txt);
    ok("file is brace-balanced", (txt.replace(/#.*$/gm, "").match(/{/g) || []).length === (txt.replace(/#.*$/gm, "").match(/}/g) || []).length, txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nOOB-WIRING-OUTSIDE-REGION: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
