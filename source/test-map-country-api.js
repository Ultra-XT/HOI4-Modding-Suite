// HTTP-level tests for the reversible country-removal endpoints:
//   POST /api/map/delete-country, GET /api/map/removed-countries, POST /api/map/restore-country.
// Complements test-map-country.js (which tests the map-data logic directly) by exercising the Express
// wiring + input handling against a self-contained temp mod. Headless, no AI key.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

const PORT = 3491, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }
async function get(r) { const res = await fetch(BASE + r); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delcountry-"));
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Del Country Test"\nreplace_path="history/states"\nreplace_path="history/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "ABC.txt"),
    'state = { id = 1 name = "S1" provinces = { 10 11 } history = { owner = ABC add_core_of = ABC } }', "utf8");
  fs.writeFileSync(path.join(mod, "history", "countries", "ABC - Abcland.txt"), "capital = 1\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const statePath = path.join(mod, "history", "states", "ABC.txt");
  const histPath = path.join(mod, "history", "countries", "ABC - Abcland.txt");
  try {
    // 0. guards
    let r = await post("/api/map/delete-country", { modPath: mod });
    ok(r.status === 400 && r.json && !r.json.ok, "delete with no tag → 400", r.json);
    r = await post("/api/map/delete-country", { modPath: mod, tag: "ZZZ" });
    ok(r.status === 400 && r.json && /isn't present/i.test(r.json.error || ""), "delete absent country → 400 not present", r.json);

    // 1. remove ABC (make land unowned)
    r = await post("/api/map/delete-country", { modPath: mod, tag: "ABC" });
    ok(r.json && r.json.ok && r.json.statesChanged === 1 && r.json.capitalRemoved, "delete-country ok", r.json);
    ok(!/owner\s*=\s*ABC/.test(fs.readFileSync(statePath, "utf8")), "state file no longer owns ABC");
    ok(!/\bcapital\s*=/.test(fs.readFileSync(histPath, "utf8")), "country file capital cleared");

    // 2. it shows in the restorable list
    r = await get(`/api/map/removed-countries?modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.ok && (r.json.countries || []).some((c) => c.tag === "ABC" && c.stateCount === 1), "removed-countries lists ABC", r.json);

    // 3. restore
    r = await post("/api/map/restore-country", { modPath: mod, tag: "ABC" });
    ok(r.json && r.json.ok && r.json.statesRestored === 1, "restore-country ok", r.json);
    ok(/owner\s*=\s*ABC/.test(fs.readFileSync(statePath, "utf8")), "state file owns ABC again");
    ok(/\bcapital\s*=\s*1/.test(fs.readFileSync(histPath, "utf8")), "country file capital restored");

    // 4. list empty again
    r = await get(`/api/map/removed-countries?modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.ok && (r.json.countries || []).length === 0, "removed-countries empty after restore", r.json);

    // 5. restore with no snapshot → 400
    r = await post("/api/map/restore-country", { modPath: mod, tag: "ABC" });
    ok(r.status === 400 && r.json && !r.json.ok, "restore w/o snapshot → 400", r.json);

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  finally {
    // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
