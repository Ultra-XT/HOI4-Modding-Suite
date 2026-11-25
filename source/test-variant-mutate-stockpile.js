// A starting-stockpile entry pins a design by NAME (add_equipment_to_stockpile { variant_name = "X" }). The
// /variant/delete endpoint already unpins such an entry when the design is deleted (#stockpile-orphan), but the two
// SIBLING in-place Arsenal mutations left the pin dangling:
//   · remove-block (Arsenal ×)  -> the entry kept variant_name = "X" with no design of that name -> unresolvable.
//   · update set.name (rename)  -> the entry still said the OLD name; the design lived on under the NEW name.
// Both now reconcile the stockpile: removal UNPINS (fall back to the base type), a rename RE-POINTS to the new name.
// Crucially, neither touches the pin when a has_dlc same-name SIBLING still resolves it (the verifier's caveat).
// Run: node test-variant-mutate-stockpile.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-varmut-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="variant mutate stockpile test"\n');
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "custom.txt"), "equipments = {\n\tnova_rifle = { year = 1936 is_archetype = yes type = infantry }\n}\n");
const histPath = path.join(mod, "history", "countries", "TST - Test.txt");

// Write a country file with N raw create_equipment_variant blocks (each named "My Rifle") in the head, then seed a
// stockpile entry that pins "My Rifle". The stockpile seed only rewrites the stockpile region, preserving the raw
// blocks — so after seeding the raw variant blocks keep their file-order indices (0..N-1).
const rawVariant = '\tcreate_equipment_variant = {\n\t\tname = "My Rifle"\n\t\ttype = nova_rifle\n\t}';
function resetFile(nBlocks) {
  const blocks = Array.from({ length: nBlocks }, () => rawVariant).join("\n");
  fs.writeFileSync(histPath, ["capital = 1", "", blocks, "", "1936.1.1 = {", "}", ""].join("\n"));
}

(async () => {
  const PORT = 3986, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const seedPin = () => post("/api/army/stockpile", { modPath: mod, tag: "TST", entries: [{ type: "nova_rifle", variant_name: "My Rifle", amount: 500 }] });
  const EXPECT = { name: "My Rifle", type: "nova_rifle" };
  try {
    // ── (A) remove-block UNPINS the dangling entry ──────────────────────────────────────────────────────────
    resetFile(1);
    await seedPin();
    let txt = fs.readFileSync(histPath, "utf8");
    ok("A: stockpile seeded with the variant_name pin", /variant_name\s*=\s*"My Rifle"/.test(txt), txt.slice(txt.indexOf("stockpile")));
    ok("A: the raw variant block survived the stockpile seed", /create_equipment_variant\s*=\s*\{[\s\S]*?name\s*=\s*"My Rifle"/.test(txt), txt);
    const rm = await post("/api/equipment/variant/remove-block", { modPath: mod, file: "TST - Test.txt", blockIdx: 0, expect: EXPECT });
    ok("A: remove-block ok, reports 1 stockpile entry unpinned", rm && rm.ok === true && rm.stockpileUnpinned === 1, rm);
    txt = fs.readFileSync(histPath, "utf8");
    ok("A: the dangling variant_name is GONE", !/variant_name\s*=\s*"My Rifle"/.test(txt), txt);
    ok("A: the stockpile entry SURVIVES (still seeds the base type + amount)", /add_equipment_to_stockpile\s*=\s*\{[\s\S]*?type\s*=\s*nova_rifle[\s\S]*?amount\s*=\s*500/.test(txt), txt.slice(txt.indexOf("instant_effect")));
    ok("A: the variant block itself is removed", !/name\s*=\s*"My Rifle"/.test(txt), txt);

    // ── (B) rename RE-POINTS the entry to the new name ──────────────────────────────────────────────────────
    resetFile(1);
    await seedPin();
    const up = await post("/api/equipment/variant/update", { modPath: mod, file: "TST - Test.txt", blockIdx: 0, expect: EXPECT, set: { name: "My Rifle Mk2" } });
    ok("B: rename ok, reports 1 stockpile entry re-pointed", up && up.ok === true && up.stockpileRepointed === 1, up);
    txt = fs.readFileSync(histPath, "utf8");
    ok("B: the variant block is renamed", /create_equipment_variant\s*=\s*\{[\s\S]*?name\s*=\s*"My Rifle Mk2"/.test(txt), txt);
    ok("B: the stockpile pin now tracks the NEW name", /variant_name\s*=\s*"My Rifle Mk2"/.test(txt), txt.slice(txt.indexOf("stockpile")));
    ok("B: no stale pin to the OLD name remains", !/variant_name\s*=\s*"My Rifle"(?!\s*Mk2)/.test(txt) && !/variant_name\s*=\s*"My Rifle"\s/.test(txt.replace(/"My Rifle Mk2"/g, "")), txt);

    // ── (C) has_dlc SIBLING guard: removing ONE of two same-name blocks must NOT unpin (sibling still resolves) ──
    resetFile(2);
    await seedPin();
    const rm2 = await post("/api/equipment/variant/remove-block", { modPath: mod, file: "TST - Test.txt", blockIdx: 0, expect: EXPECT });
    ok("C: remove-block ok, reports 0 unpinned (a sibling still carries the name)", rm2 && rm2.ok === true && rm2.stockpileUnpinned === 0, rm2);
    txt = fs.readFileSync(histPath, "utf8");
    ok("C: the pin is LEFT INTACT (the remaining sibling still resolves it)", /variant_name\s*=\s*"My Rifle"/.test(txt), txt.slice(txt.indexOf("stockpile")));
    // count create_equipment_variant blocks (NOT `name = "My Rifle"`, which also matches the stockpile's variant_name pin)
    ok("C: exactly one variant block remains (one of the two was removed)", (txt.match(/create_equipment_variant\s*=/g) || []).length === 1, (txt.match(/create_equipment_variant\s*=/g) || []).length);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nVARIANT-MUTATE-STOCKPILE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
