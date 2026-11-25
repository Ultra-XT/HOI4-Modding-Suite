// Numeric write-safety for the equipment EDIT path. /api/equipment/save's `over` helper (bare Number(v)) and the
// statsAll loop (isNaN, which PASSES Infinity) let a huge / scientific-notation value through, and serializeEquipment
// emitted year/stats/resources/statsAll RAW — so typing "1e999" (→ Infinity) or "1e21" (→ "1e+21") into a stat or the
// year wrote an INVALID Clausewitz token that fails the WHOLE equipments block on load (and, when editing an inherited
// weapon seeded from the dependency's full file, corrupts a file redefining many weapons). serializeEquipment now routes
// year through safeYear and every number through formatHoi4Number, matching the create-path serializers.
// Run: node test-equipment-save-numeric.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const bad = (s) => /\bInfinity\b|\bNaN\b|[0-9]e[+\-]/i.test(s); // any invalid Clausewitz numeric token

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqnum-"));
const EQ = "common/units/equipment/custom_tank.txt";
const p = path.join(mod, EQ);
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="eq save numeric"\n');
fs.writeFileSync(p, [
  "equipments = {",
  "\tnova_tank_equipment = {",
  "\t\tyear = 1936",
  "\t\tarchetype = tank_equipment",
  "\t\tsoft_attack = 5",
  "\t\tarmor_value = 30",
  "\t}",
  "}",
  "",
].join("\n"));
const eqFile = () => fs.readFileSync(p, "utf8");

const PORT = 3978, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (body) => fetch(`${BASE}/api/equipment/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    // Core stat + year: Infinity (from "1e999") and a huge finite ("1e21") must NOT write an invalid token.
    const r1 = await post({ modPath: mod, id: "nova_tank_equipment", softAttack: "1e999", buildCostIc: "1e21", year: "1e999", defense: 7 });
    ok("save ok", r1 && r1.ok === true, r1 && r1.error);
    let txt = eqFile();
    ok("no invalid numeric token anywhere in the equipment file", !bad(txt), txt);
    ok("the normal stat survived (defense = 7)", /defense\s*=\s*7\b/.test(txt), txt);
    ok("year is a plain finite integer (not Infinity)", /year\s*=\s*\d+/.test(txt) && !/year\s*=\s*Infinity/.test(txt), txt.slice(txt.indexOf("year")));

    // statsAll: a huge/Infinity generic stat must sanitize; a normal one survives.
    const r2 = await post({ modPath: mod, id: "nova_tank_equipment", statsAll: { armor_value: "1e30", maximum_speed: 12 } });
    ok("statsAll save ok", r2 && r2.ok === true, r2 && r2.error);
    txt = eqFile();
    ok("statsAll huge value has NO invalid token", !bad(txt), txt);
    ok("the normal statsAll value survived (maximum_speed = 12)", /maximum_speed\s*=\s*12\b/.test(txt), txt);

    // resources: a huge resource cost must sanitize.
    const r3 = await post({ modPath: mod, id: "nova_tank_equipment", resources: { steel: "1e999", tungsten: 2 } });
    ok("resources save ok", r3 && r3.ok === true, r3 && r3.error);
    txt = eqFile();
    ok("resources huge value has NO invalid token", !bad(txt), txt.slice(txt.indexOf("resources")));

    ok("file is brace-balanced", (txt.match(/\{/g) || []).length === (txt.match(/\}/g) || []).length, txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nEQUIPMENT-SAVE-NUMERIC: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
