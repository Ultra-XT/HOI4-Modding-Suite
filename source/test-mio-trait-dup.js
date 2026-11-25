// A MIO trait's `token` is its UNIQUE node identity within the organization — any_parent/all_parents/
// relative_position_id resolve to it, and add_trait/has_trait key on it. POST /api/mio pushed every trait with no
// uniqueness check, so two traits sharing a token wrote two `trait = { token = X }` nodes with the same identity
// (the second collides with the first; any parent/position reference to that token is ambiguous). MD ships ZERO
// within-org duplicate tokens. The create endpoint now refuses a repeat, like the dup-MIO-id / dup-variant-name guards.
// Run: node test-mio-trait-dup.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miotraitdup-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="mio trait dup test"\n');

const PORT = 3984, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const base = { modPath: mod, name: "Dup Test", allowedTag: "USA", equipmentType: ["mio_cat_eq_x"] };
  const orgDir = path.join(mod, "common", "military_industrial_organization", "organizations");
  const orgTxt = () => (fs.existsSync(orgDir) ? fs.readdirSync(orgDir).map((f) => fs.readFileSync(path.join(orgDir, f), "utf8")).join("\n") : "");
  try {
    // Two traits sharing a token → REFUSED.
    const dup = await post("/api/mio", Object.assign({ id: "USA_dup_co", traits: [
      { token: "USA_dup_co_flex", name: "Flex", x: 1, y: 1, equipmentBonus: { reliability: 0.05 } },
      { token: "USA_dup_co_flex", name: "Flex Two", x: 2, y: 2, equipmentBonus: { reliability: 0.03 } },
    ] }, base));
    ok("duplicate trait token is REJECTED", dup && dup.ok === false, dup);
    ok("the error names the offending token", dup && /USA_dup_co_flex/.test(String(dup.error || "")) && /unique/i.test(String(dup.error || "")), dup && dup.error);
    ok("NO MIO file was written for the rejected save", !/USA_dup_co\s*=/.test(orgTxt()), orgTxt());

    // Two DISTINCT tokens → accepted (the guard doesn't over-reject legitimate multi-trait orgs).
    const okSave = await post("/api/mio", Object.assign({ id: "USA_ok_co", traits: [
      { token: "USA_ok_co_a", name: "A", x: 1, y: 1, equipmentBonus: { reliability: 0.05 } },
      { token: "USA_ok_co_b", name: "B", x: 2, y: 2, equipmentBonus: { reliability: 0.03 } },
    ] }, base));
    ok("two distinct trait tokens save fine (2 traits)", okSave && okSave.ok === true && okSave.traits === 2, okSave);
    const txt = orgTxt();
    ok("both distinct tokens are in the file", /token\s*=\s*USA_ok_co_a/.test(txt) && /token\s*=\s*USA_ok_co_b/.test(txt), txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-TRAIT-DUP: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
