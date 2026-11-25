// variant/update edits an upgrade level in place. The level was coerced with `Math.max(0, Math.round(Number(v)
// || 0))`, which lets Infinity through (Number("1e999") === Infinity is truthy), so a fuzz/huge value wrote
// `<upgrade> = Infinity` (or a sci-notation token) into the country file — unparseable. Now finite-guarded +
// clamped. (Found by a solo grep sweep for `.replace(re, `…${userinput}`)` — a missed instance of the round-5
// numeric class.) Run: node test-variant-update-upgrade-num.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const badNum = (s) => /\bInfinity\b|\bNaN\b|[0-9]e[+\-]/i.test(s);

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upnum-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="upgrade num"\n');
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), [
  "capital = 1", "",
  "create_equipment_variant = {", '\tname = "Tank A"', "\ttype = medium_tank_chassis_1",
  "\tupgrades = {", "\t\tarmor_up = 2", "\t\tspeed_up = 1", "\t}", "}", "",
  "1936.1.1 = {", "}", "",
].join("\n"));
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");
const PORT = 3998, BASE = `http://127.0.0.1:${PORT}`;
const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    const all = await fetch(`${BASE}/api/equipment/variants/all?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const v = (all.variants || []).find((x) => x.name === "Tank A");
    ok("fixture variant found", !!v, all.variants);
    // Infinity (from "1e999") and a huge finite ("1e30") and a normal value.
    const upd = await post("/api/equipment/variant/update", { modPath: mod, file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type }, set: { upgrades: { armor_up: "1e999", speed_up: "1e30" } } });
    ok("update ok", upd && upd.ok === true, upd && upd.error);
    const txt = fs.readFileSync(histPath, "utf8");
    ok("no invalid numeric token written (no Infinity / e+)", !badNum(txt), txt.slice(txt.indexOf("upgrades")));
    ok("Infinity level coerced to a finite 0 (armor_up = 0)", /armor_up = 0\b/.test(txt), txt);
    ok("huge finite level clamped to a plain integer (speed_up = 1000000)", /speed_up = 1000000\b/.test(txt), txt);
    ok("file is brace-balanced", (txt.replace(/#.*$/gm, "").match(/{/g) || []).length === (txt.replace(/#.*$/gm, "").match(/}/g) || []).length, txt);
    // A normal level still works.
    const upd2 = await post("/api/equipment/variant/update", { modPath: mod, file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type }, set: { upgrades: { armor_up: 5 } } });
    ok("a normal level round-trips (armor_up = 5)", upd2 && upd2.ok === true && /armor_up = 5\b/.test(fs.readFileSync(histPath, "utf8")), upd2);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nVARIANT-UPDATE-UPGRADE-NUM: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
