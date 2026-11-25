// Verify the vanilla-edit toggle gates the guards correctly: OFF by default (vanilla writes
// blocked), ON after POST (allowed), and resets per-process. Uses set-startup against the
// vanilla game root as the probe (it calls checkActiveRootNotGameRoot).
const { createApp, constants } = require("./server.js");
const PORT = 3491, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }
async function get(r) { const res = await fetch(BASE + r); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const gameRoot = constants.resolveHoi4GameRoot();
  try {
    if (!gameRoot) { console.log("  (no vanilla game root resolvable here; skipping live guard probe)"); }

    // 1. Default state is OFF
    let r = await get("/api/settings/allow-vanilla-edits");
    ok(r.json && r.json.allowed === false, "default: vanilla edits OFF", r.json);

    if (gameRoot) {
      // 2. With OFF, a write targeting the vanilla root is refused by the guard.
      r = await post("/api/history/set-startup", { tag: "GER", itemId: "x_probe_spirit", itemType: "spirit", active: true, modPath: gameRoot });
      ok(r.json && /vanilla|enable .allow|select.*mod/i.test(r.json.error || ""), "OFF: vanilla write refused", r.json);
    }

    // 3. Turn it ON
    r = await post("/api/settings/allow-vanilla-edits", { allowed: true });
    ok(r.json && r.json.allowed === true, "POST allowed:true -> ON", r.json);
    r = await get("/api/settings/allow-vanilla-edits");
    ok(r.json && r.json.allowed === true, "GET reflects ON", r.json);

    // 4. Turn it back OFF (don't leave the probe enabled; we won't actually write to vanilla)
    r = await post("/api/settings/allow-vanilla-edits", { allowed: false });
    ok(r.json && r.json.allowed === false, "POST allowed:false -> OFF again", r.json);

    if (gameRoot) {
      // 5. Back to OFF: vanilla write refused again (proves the flag truly gates the guard)
      r = await post("/api/history/set-startup", { tag: "GER", itemId: "x_probe_spirit", itemType: "spirit", active: true, modPath: gameRoot });
      ok(r.json && /vanilla|enable .allow|select.*mod/i.test(r.json.error || ""), "OFF again: vanilla write refused", r.json);
    }

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  // Let the process exit naturally (drain) instead of process.exit(): calling process.exit() while the
  // server handle is still mid-close trips a libuv teardown assertion on Windows (UV_HANDLE_CLOSING).
  finally { process.exitCode = fail ? 1 : 0; try { server.closeAllConnections(); } catch (_) {} server.close(); }
})();
