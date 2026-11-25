// Starting stockpile writer (add_equipment_to_stockpile): seed a country's national reserve at game start
// with a type + optional named variant. Managed sentinel region in the country-history head; must round-trip,
// stay brace-balanced, coexist with the Nova variant region, and never touch the dated tail.
// Run: node test-army-stockpile.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3941, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stockpile-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Stockpile Test"\n');
  // A real equipment type the catalog will resolve.
  mk("common/units/equipment/custom.txt", 'equipments = {\n\tnova_gun_equipment = { year = 1936 is_archetype = yes type = infantry }\n\tnova_tank_equipment = { year = 1936 is_archetype = yes type = armor }\n}\n');
  // A country history with a dated block (the tail) that must never be touched.
  mk("history/countries/TST - Test.txt", "capital = 1\n\n1939.1.1 = {\n\tset_politics = { ruling_party = neutrality }\n}\n");
  const histPath = path.join(mod, "history", "countries", "TST - Test.txt");

  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const getSp = () => fetch(`${BASE}/api/army/stockpile?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());

  try {
    console.log("=== write two stockpile entries ===");
    const sv = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [
      { type: "nova_tank_equipment", variant_name: "Nova Cruiser", amount: 20, producer: "GER" },
      { type: "nova_gun_equipment", amount: 500 },
    ] });
    ok("save ok, count 2", sv && sv.ok === true && sv.count === 2, sv);
    let txt = fs.readFileSync(histPath, "utf8");
    ok("file brace-balanced", balanced(txt), txt);
    // #stockpile-instant-effect — this used to assert the entries were wrapped in ONE instant_effect block.
    // That wrapper is valid in a history/units OOB file and NOT a country-history command: HOI4 logs
    // "Unknown History Command ==>'instant_effect'<==" and discards the whole block, so every stockpile Nova
    // wrote was inert. Counted: instant_effect appears in 0 of vanilla's 355 country histories and 329 of its
    // history/units files, and the 9 vanilla country histories that seed a stockpile call
    // add_equipment_to_stockpile directly. The assertion now pins the shape the GAME accepts.
    ok("wrote NO instant_effect wrapper (invalid in country history)", !/instant_effect/.test(txt), txt);
    ok("wrote both add_equipment_to_stockpile effects at top level",
      (txt.match(/(?:^|\n)add_equipment_to_stockpile\s*=\s*\{/g) || []).length === 2, txt);
    ok("entry 1: type + variant_name + amount + producer", /add_equipment_to_stockpile\s*=\s*\{[\s\S]*type\s*=\s*nova_tank_equipment[\s\S]*variant_name\s*=\s*"Nova Cruiser"[\s\S]*amount\s*=\s*20[\s\S]*producer\s*=\s*GER/.test(txt), txt);
    ok("entry 2: type + amount, no producer", /type\s*=\s*nova_gun_equipment[\s\S]*amount\s*=\s*500/.test(txt), txt);
    ok("dated tail (1939.1.1) untouched", /1939\.1\.1\s*=\s*\{[\s\S]*ruling_party\s*=\s*neutrality/.test(txt), txt);
    ok("capital = 1 head survived", /(^|\n)\s*capital\s*=\s*1/.test(txt), txt);

    console.log("\n=== round-trip: GET reflects the JSON headers ===");
    const g1 = await getSp();
    ok("GET returns 2 entries with the fields", g1 && g1.ok === true && g1.entries.length === 2 && g1.entries[0].type === "nova_tank_equipment" && g1.entries[0].variant_name === "Nova Cruiser" && g1.entries[0].amount === 20 && g1.entries[0].producer === "GER", g1 && g1.entries);

    console.log("\n=== re-save replaces the region (no growth) + clear ===");
    const sv2 = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_gun_equipment", amount: 100 }] });
    txt = fs.readFileSync(histPath, "utf8");
    ok("re-save keeps exactly one add_equipment and still no wrapper",
      sv2.ok === true && !/instant_effect/.test(txt) && (txt.match(/add_equipment_to_stockpile/g) || []).length === 1, txt);
    ok("re-save dropped the old tank entry", !/nova_tank_equipment/.test(txt), txt);
    const clr = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [] });
    txt = fs.readFileSync(histPath, "utf8");
    ok("empty clears the region entirely (no instant_effect, tail intact)", clr.ok === true && !/instant_effect/.test(txt) && /1939\.1\.1/.test(txt) && balanced(txt), txt);

    console.log("\n=== validation guards ===");
    const bad1 = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "does_not_exist", amount: 5 }] });
    ok("unknown equipment type rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_gun_equipment", amount: 5, producer: "12" }] });
    ok("bad producer tag rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/army/stockpile", { modPath: mod, tag: "T", entries: [] });
    ok("bad country tag rejected", bad3.ok === false, bad3);
    // A quote/newline-injection in variant_name must be neutralised: the quote + newline are stripped so the
    // payload can't break OUT of the string. It ends up as a single harmless quoted token on one line.
    const inj = await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_gun_equipment", variant_name: 'evil"\n\tset_country_flag = hacked', amount: 1 }] });
    txt = fs.readFileSync(histPath, "utf8");
    const m = /variant_name\s*=\s*"([^"\n]*)"/.exec(txt);
    ok("variant_name quote+newline stripped → single safe quoted token, file balanced, no statement-level injection",
      inj.ok === true && balanced(txt) && !!m && !/(^|\n)\s*set_country_flag\s*=\s*hacked/.test(txt), { token: m && m[1], balanced: balanced(txt) });
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nARMY-STOCKPILE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
