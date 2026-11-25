// Region ordering: the Nova variant region must always sit ABOVE the Nova stockpile region in a country
// history file. HOI4 runs the head top-to-bottom, and add_equipment_to_stockpile { variant_name } only
// resolves a variant CREATED above it. writeCountryVariants used to re-append the variant region at the END,
// so re-saving a variant flipped an existing file to [stockpile, variant] and the country silently received
// no starting equipment for that entry. Run: node test-oob-region-order.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

const NOVA_VAR_START = "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>";
const NOVA_VAR_END = "# <<< NOVA equipment variants <<<";
const NOVA_SP_START = "# >>> NOVA starting stockpile (managed by Nova — do not edit inside) >>>";

(async () => {
  const PORT = 3962, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionorder-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Region Order Test"\n');
  mk("common/units/equipment/custom.txt", "equipments = {\n\tnova_tank_equipment = { year = 1936 is_archetype = yes type = armor }\n}\n");
  // Country file already carries a Nova variant region (variant "Alpha") + a dated tail.
  const hdr = "# NOVA-VARIANT " + JSON.stringify({ name: "Alpha", chassisType: "nova_tank_equipment", dlc: "No Step Back", modules: [], upgrades: {}, fallbackType: "nova_tank_equipment", fallbackUpgrades: {}, icon: "", obsolete: false });
  mk("history/countries/TST - Test.txt", ["capital = 1", "", NOVA_VAR_START, hdr, NOVA_VAR_END, "", "1939.1.1 = {", "\tset_politics = { ruling_party = neutrality }", "}", ""].join("\n"));
  const histPath = path.join(mod, "history", "countries", "TST - Test.txt");
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const order = (txt) => ({ varAt: txt.indexOf(NOVA_VAR_START), spAt: txt.indexOf(NOVA_SP_START) });

  try {
    // 1) Add a stockpile entry that references the variant → SP region lands after the existing VAR region.
    const sv = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_tank_equipment", variant_name: "Alpha", amount: 10 }] });
    ok("stockpile save ok", sv && sv.ok === true, sv);
    let txt = fs.readFileSync(histPath, "utf8");
    let o = order(txt);
    ok("baseline: both regions present, VAR before SP", o.varAt >= 0 && o.spAt >= 0 && o.varAt < o.spAt, o);

    // 2) Re-write the variant region (delete a non-existent variant → Alpha survives, writeCountryVariants runs).
    const del = await post("/api/equipment/variant/delete", { modPath: mod, tag: "TST", name: "Ghost" });
    ok("variant re-write ok", del && del.ok === true, del);
    txt = fs.readFileSync(histPath, "utf8");
    o = order(txt);
    ok("AFTER re-writing the variant region: VAR is STILL before SP (not flipped)", o.varAt >= 0 && o.spAt >= 0 && o.varAt < o.spAt, o);
    ok("the variant survived the re-write", /"name":"Alpha"/.test(txt) || /name = "Alpha"/.test(txt), txt.slice(0, 200));
    ok("the stockpile entry survived", /add_equipment_to_stockpile/.test(txt) && /variant_name\s*=\s*"Alpha"/.test(txt), txt.slice(0, 200));
    ok("file stays brace-balanced", balanced(txt), txt);
    ok("dated tail (1939.1.1) untouched", /1939\.1\.1\s*=\s*\{[\s\S]*ruling_party\s*=\s*neutrality/.test(txt));

    // 3) Re-saving the stockpile keeps SP after VAR (writeCountryStockpile appends after the variant region).
    await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_tank_equipment", variant_name: "Alpha", amount: 25 }] });
    txt = fs.readFileSync(histPath, "utf8");
    o = order(txt);
    ok("after re-saving stockpile: VAR still before SP", o.varAt >= 0 && o.spAt >= 0 && o.varAt < o.spAt, o);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nOOB-REGION-ORDER: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
