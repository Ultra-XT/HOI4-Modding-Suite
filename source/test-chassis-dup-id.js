// POST /api/equipment/chassis-new writes an archetype `id` AND a buildable tier `id_1` via an UPSERT that replaces a
// colliding top-level entry — so creating a chassis whose id (or `id_1`) collides with a DIFFERENT archetype/tier
// silently overwrote/orphaned it. The sharp case: a new chassis literally named `X_1` overwrites chassis `X`'s tier,
// leaving X with no buildable variant, while the endpoint reports {ok:true}. Re-saving your OWN chassis (same id, same
// file) is a legit upsert and must still work; every OTHER collision (a tier, an inherited/vanilla archetype, or a
// mod archetype in a different file such as a family) is now rejected. Run: node test-chassis-dup-id.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chassisdup-"));
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="chassis dup test"\n');

const PORT = 3980, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (body) => fetch(`${BASE}/api/equipment/chassis-new`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const mk = (id) => ({ modPath: mod, id, type: "armor", domain: "armor", slots: [{ name: "main_armament", categories: ["tank_gun_type"] }] });
  const chassisFile = () => { const p = path.join(mod, "common", "units", "equipment", "nova_custom_chassis.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
  try {
    // Create a chassis → writes archetype nova_medium + tier nova_medium_1.
    const c1 = await post(mk("nova_medium"));
    ok("first chassis creates ok", c1 && c1.ok === true && c1.tier === "nova_medium_1", c1);
    ok("archetype + tier both written", /nova_medium\s*=\s*\{/.test(chassisFile()) && /nova_medium_1\s*=\s*\{/.test(chassisFile()), chassisFile());

    // Re-saving the SAME chassis (same id, same file) is a legit UPSERT — must still be allowed, one archetype + one tier.
    const c2 = await post(mk("nova_medium"));
    ok("re-saving your own chassis id is ALLOWED (upsert)", c2 && c2.ok === true, c2);
    ok("upsert keeps exactly one archetype + one tier", (chassisFile().match(/(^|\n)\s*nova_medium\s*=\s*\{/g) || []).length === 1 && (chassisFile().match(/(^|\n)\s*nova_medium_1\s*=\s*\{/g) || []).length === 1, chassisFile());

    // SHARP case: a NEW chassis literally named `nova_medium_1` collides with nova_medium's auto-generated tier → REJECTED.
    const c3 = await post(mk("nova_medium_1"));
    ok("a chassis whose id collides with an existing TIER is REJECTED", c3 && c3.ok === false && /nova_medium_1/.test(String(c3.error || "")), c3);
    ok("nova_medium's tier survives (still exactly one nova_medium_1 block)", (chassisFile().match(/(^|\n)\s*nova_medium_1\s*=\s*\{/g) || []).length === 1, (chassisFile().match(/(^|\n)\s*nova_medium_1\s*=\s*\{/g) || []).length);

    // A fresh, unique id still works (the guard doesn't over-reject).
    const c4 = await post(mk("nova_heavy"));
    ok("a fresh unique chassis id still creates ok", c4 && c4.ok === true, c4);

    // A chassis colliding with an INHERITED vanilla archetype (light_tank_chassis) is REJECTED (would strip-override it).
    const cv = await post(mk("light_tank_chassis"));
    ok("collision with a vanilla archetype is REJECTED", cv && cv.ok === false && /already exists/.test(String(cv.error || "")), cv);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCHASSIS-DUP-ID: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
