// test-event-days.js
// Verifies the event "fire after N days" bridge end to end:
//  - days>0 writes the block form  country_event = { id = X days = N }
//  - days=0/unset writes the bare form  country_event = X
//  - status endpoint detects BOTH forms and reports back the days value
//  - toggling delay on/off never duplicates the country_event line
//  - removal cleans both forms; unrelated history is preserved
//
// Run: node test-event-days.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3599;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  PASS " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); }
};
const post = async (r, b) => {
  const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return await res.json();
};
const get = async (r) => (await fetch(BASE + r)).json();

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdays-"));
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EvDate"\n', "utf8");
  const hist = path.join(mod, "history", "countries", "GER - Germany.txt");
  fs.writeFileSync(hist, "capital = 64\n", "utf8");
  const enc = encodeURIComponent(mod);
  try {
    console.log("\nEvent fire-after-N-days bridge:");

    // 1. Delayed event (days=30) -> block form
    let r = await post("/api/history/set-startup", { tag: "GER", itemId: "my_events.1", itemType: "event", active: true, eventDays: 30, modPath: mod });
    ok(r.ok, "delayed event set ok", r);
    let c = fs.readFileSync(hist, "utf8");
    ok(/country_event\s*=\s*\{\s*id\s*=\s*my_events\.1\s+days\s*=\s*30\s*\}/.test(c), "block form with days=30 written", c);

    // 2. Status detects the block form AND returns the days
    r = await get(`/api/history/startup-status?tag=GER&itemId=my_events.1&itemType=event&modPath=${enc}`);
    ok(r.active === true, "status: delayed event reads as active", r);
    ok(r.eventDays === 30, "status: returns eventDays=30", r);

    // 3. Toggle to day-one (no days) -> reliable hours=1 form (bare lands on the never-firing hour-0 boundary), no dupe
    r = await post("/api/history/set-startup", { tag: "GER", itemId: "my_events.1", itemType: "event", active: true, eventDays: 0, modPath: mod });
    c = fs.readFileSync(hist, "utf8");
    ok(/country_event\s*=\s*\{\s*id\s*=\s*my_events\.1\s+hours\s*=\s*1\s*\}/.test(c) && !/days\s*=\s*30/.test(c), "toggled to day-one hours=1 form (not the never-firing bare/hour-0 form)", c);
    ok((c.match(/country_event\s*=/g) || []).length === 1, "exactly one country_event line (no dupe)");
    r = await get(`/api/history/startup-status?tag=GER&itemId=my_events.1&itemType=event&modPath=${enc}`);
    ok(r.active === true && r.eventDays === 0, "status: bare form active, days=0", r);

    // 4. Remove entirely
    r = await post("/api/history/set-startup", { tag: "GER", itemId: "my_events.1", itemType: "event", active: false, modPath: mod });
    c = fs.readFileSync(hist, "utf8");
    ok(!/my_events\.1/.test(c), "event removed cleanly");
    ok(/capital = 64/.test(c), "unrelated content (capital) preserved");

    // 5. Re-add delayed after removal -> single block, no leftover
    r = await post("/api/history/set-startup", { tag: "GER", itemId: "my_events.1", itemType: "event", active: true, eventDays: 90, modPath: mod });
    c = fs.readFileSync(hist, "utf8");
    ok((c.match(/country_event\s*=/g) || []).length === 1 && /days\s*=\s*90/.test(c), "re-add delayed = single block days=90");

    // 6. Absent event -> inactive, days 0
    r = await get(`/api/history/startup-status?tag=GER&itemId=nope.9&itemType=event&modPath=${enc}`);
    ok(r.active === false && r.eventDays === 0, "absent event: inactive, days 0", r);

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) {
    console.error(e); fail++;
  } finally {
    // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
