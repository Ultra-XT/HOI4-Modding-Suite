// The equipment-name and MIO-name loc writers (upsertEquipmentLoc / upsertMioLoc) rewrite the id:0 "Name" line
// with String.replace on the UPDATE path (re-save / re-edit). A replacement STRING interprets `$&`/`$'`/`$1` as
// backreferences, so a `$` in the name spliced the matched loc line into the value and corrupted the yml. Both
// now use a replacement FUNCTION. Run: node test-loc-dollar.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locdollar-"));
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="loc dollar"\n');
const PORT = 3993, BASE = `http://127.0.0.1:${PORT}`;
const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const DOLLAR = "HE $& $1 $` $$ AP"; // every replacement-special sequence

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // ── #1 equipment name loc: create (insert), then re-save with a $ name (UPDATE path) ──
    const fam = await post("/api/equipment/family", { modPath: mod, id: "nova_r_equipment", name: "First Rifle", domain: "land", type: "infantry", tierCount: 1 });
    ok("family created", fam && fam.ok === true, fam && fam.error);
    const eqSave = await post("/api/equipment/save", { modPath: mod, id: "nova_r_equipment", name: DOLLAR });
    ok("equipment re-save ok", eqSave && eqSave.ok === true, eqSave && eqSave.error);
    const eqLoc = fs.readFileSync(path.join(mod, "localisation", "english", "custom_equipment_l_english.yml"), "utf8");
    ok("equipment loc has the `$` name written LITERALLY", eqLoc.includes(`nova_r_equipment:0 "${DOLLAR}"`), eqLoc);
    ok("equipment loc: exactly one line for the id (no spliced duplicate)", (eqLoc.match(/^\s*nova_r_equipment:/gm) || []).length === 1, eqLoc);

    // ── #2 MIO name loc: create (insert), then re-edit with a $ name (UPDATE path) ──
    const mio1 = await post("/api/mio", { modPath: mod, id: "USA_x_co", name: "First Co", equipmentType: ["mio_cat_eq_all_medium_tank"] });
    ok("MIO created", mio1 && mio1.ok === true, mio1 && mio1.error);
    const mio2 = await post("/api/mio", { modPath: mod, id: "USA_x_co", name: DOLLAR, equipmentType: ["mio_cat_eq_all_medium_tank"] });
    ok("MIO re-edit ok", mio2 && mio2.ok === true, mio2 && mio2.error);
    const mioLoc = fs.readFileSync(path.join(mod, "localisation", "english", "nova_mio_l_english.yml"), "utf8");
    ok("MIO loc has the `$` name written LITERALLY", mioLoc.includes(`USA_x_co:0 "${DOLLAR}"`), mioLoc);
    ok("MIO loc: exactly one line for the id (no spliced duplicate)", (mioLoc.match(/^\s*USA_x_co:/gm) || []).length === 1, mioLoc);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nLOC-DOLLAR: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
