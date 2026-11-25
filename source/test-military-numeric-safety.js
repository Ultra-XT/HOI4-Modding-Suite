// Numeric write safety: a huge or non-finite stat/amount must never be written as an invalid Clausewitz token.
// The sanitizers used `!isNaN(n)`, which PASSES Infinity (Number("1e999") === Infinity), and serializers emitted
// the raw value, so `soft_attack = Infinity` / `amount = 1e+21` reached the file and made it unparseable.
// Sanitizers now use Number.isFinite and serializers route through formatHoi4Number (which clamps + avoids
// exponential notation). Run: node test-military-numeric-safety.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const bad = (s) => /\bInfinity\b|\bNaN\b|[0-9]e[+\-]/i.test(s); // any invalid numeric token

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-num-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="numeric safety"\n');
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "base.txt"), "equipments = {\n\tinfantry_equipment = { year = 1936 is_archetype = yes type = infantry }\n}\n");
fs.writeFileSync(path.join(mod, "history", "countries", "GER - Germany.txt"), "capital = 64\n\n1936.1.1 = {\n}\n");
const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const PORT = 3992, BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // MODULE add_stats: Infinity (from "1e999") dropped; a huge finite ("1e30") clamped to a plain decimal; a
    // normal value kept.
    const m = await post("/api/equipment/module", { modPath: mod, id: "nova_probe_mod", category: "tank_engine_type", add_stats: { soft_attack: "1e999", hard_attack: "1e30", defense: "5" } });
    ok("module save ok", m && m.ok === true, m && m.error);
    const modFile = fs.readdirSync(path.join(mod, "common", "units", "equipment", "modules")).map((f) => fs.readFileSync(path.join(mod, "common", "units", "equipment", "modules", f), "utf8")).join("\n");
    ok("module file has NO invalid numeric token (no Infinity / NaN / e+)", !bad(modFile), modFile.slice(modFile.indexOf("add_stats")));
    ok("the normal stat survived (defense = 5)", /defense = 5\b/.test(modFile), modFile);

    // FAMILY core stat: a non-finite stat must not be written.
    const fam = await post("/api/equipment/family", { modPath: mod, id: "nova_gun_equipment", name: "Gun", domain: "land", type: "infantry", tierCount: 1, soft_attack: "1e999", defense: "7" });
    ok("family save ok", fam && fam.ok === true, fam && fam.error);
    const famFile = fs.readFileSync(path.join(mod, "common", "units", "equipment", fam.file), "utf8");
    ok("family file has NO invalid numeric token", !bad(famFile), famFile);

    // STOCKPILE amount: Infinity coerces to a finite, plain integer.
    const sp = await post("/api/army/stockpile", { modPath: mod, tag: "GER", entries: [{ type: "infantry_equipment", amount: "1e999" }, { type: "infantry_equipment", amount: "1e30" }] });
    ok("stockpile save ok", sp && sp.ok === true, sp && sp.error);
    const hist = fs.readFileSync(path.join(mod, "history", "countries", "GER - Germany.txt"), "utf8");
    ok("stockpile file has NO invalid numeric token in amounts", !bad(hist), hist.slice(hist.indexOf("instant_effect")));
    ok("every amount written is a plain finite integer", [...hist.matchAll(/amount\s*=\s*(\S+)/g)].every((x) => Number.isFinite(Number(x[1])) && !/e/i.test(x[1])), [...hist.matchAll(/amount\s*=\s*(\S+)/g)].map((x) => x[1]));

    // MIO trait POSITION + BONUS: a huge/Infinity/tiny x/y or bonus value must not write an invalid token.
    // (equipment_bonus values go through cleanBonus, which allows 1e-7 / 1e21 — those serialize as sci-notation.)
    const mio = await post("/api/mio", { modPath: mod, id: "USA_probe_mio", name: "Probe", equipmentType: ["mio_cat_eq_all_medium_tank"], initial: { equipmentBonus: { reliability: "0.0000001", build_cost_ic: "1e30" } }, traits: [{ token: "t_probe", x: "1e999", y: "1e30", equipmentBonus: { armor_value: "1e-8" } }] });
    ok("MIO save ok", mio && mio.ok === true, mio && mio.error);
    const mioDir = path.join(mod, "common", "military_industrial_organization", "organizations");
    const mioTxt = fs.existsSync(mioDir) ? fs.readdirSync(mioDir).map((f) => fs.readFileSync(path.join(mioDir, f), "utf8")).join("\n") : "";
    ok("MIO trait position + bonus values have NO invalid numeric token (no Infinity / e+/e-)", !bad(mioTxt), mioTxt.slice(mioTxt.indexOf("initial_trait")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMILITARY-NUMERIC-SAFETY: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
