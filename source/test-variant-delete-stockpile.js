// Deleting a designed variant must not leave a DANGLING add_equipment_to_stockpile { variant_name = "X" }
// behind (HOI4 can't resolve the name to a deleted design). The delete now UNPINS such entries — the
// starting-stockpile entry stays and seeds the base type, just without the stale variant_name.
// Run: node test-variant-delete-stockpile.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const NOVA_VAR_START = "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>";
const NOVA_VAR_END = "# <<< NOVA equipment variants <<<";

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delorphan-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="delete orphan test"\n');
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "custom.txt"), "equipments = {\n\tnova_rifle = { year = 1936 is_archetype = yes type = infantry }\n}\n");
const hdr = "# NOVA-VARIANT " + JSON.stringify({ name: "My Rifle", chassisType: "nova_rifle", dlc: "No Step Back", modules: [], upgrades: {}, fallbackType: "nova_rifle", fallbackUpgrades: {}, icon: "", obsolete: false });
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), ["capital = 1", "", NOVA_VAR_START, hdr, NOVA_VAR_END, "", "1936.1.1 = {", "}", ""].join("\n"));
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");

(async () => {
  const PORT = 3989, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    // Seed a stockpile entry that PINS the variant by name.
    await post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_rifle", variant_name: "My Rifle", amount: 500 }] });
    let txt = fs.readFileSync(histPath, "utf8");
    ok("stockpile seeded with variant_name pin", /variant_name\s*=\s*"My Rifle"/.test(txt), txt.slice(txt.indexOf("stockpile")));

    // Delete the designed variant.
    const del = await post("/api/equipment/variant/delete", { modPath: mod, tag: "TST", name: "My Rifle" });
    ok("delete ok, reports it unpinned 1 stockpile entry", del && del.ok === true && del.stockpileUnpinned === 1, del);
    txt = fs.readFileSync(histPath, "utf8");
    ok("the dangling variant_name is GONE", !/variant_name\s*=\s*"My Rifle"/.test(txt), txt);
    ok("the stockpile entry itself SURVIVES (still seeds the base type + amount)", /add_equipment_to_stockpile\s*=\s*\{[\s\S]*type\s*=\s*nova_rifle[\s\S]*amount\s*=\s*500/.test(txt), txt.slice(txt.indexOf("instant_effect")));
    ok("the variant block is removed", !/name = "My Rifle"/.test(txt) && !/NOVA-VARIANT/.test(txt), txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nVARIANT-DELETE-STOCKPILE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
