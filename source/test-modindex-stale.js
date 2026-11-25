// test-modindex-stale.js
// Verifies the Home progress strip's stale-while-revalidate cache (GET /api/mod/index):
//  - first request builds and caches (not stale)
//  - after a mod write invalidates the cache, the next request serves the LAST-KNOWN counts
//    INSTANTLY with stale:true (so Home never blocks to re-scan) and rebuilds in the background
//  - once the background build finishes, the cache is fresh again and the counts have caught up
//
// Run: node test-modindex-stale.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3617;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const get = async (p) => (await fetch(BASE + p)).json();
const post = async (p, b) => (await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mistale-"));
  fs.mkdirSync(path.join(mod, "events"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIStale"\n');
  fs.writeFileSync(path.join(mod, "events", "seed.txt"),
    "add_namespace = { namespace = seed }\ncountry_event = { id = seed.1 }\ncountry_event = { id = seed.2 }\n");
  const enc = encodeURIComponent(mod);
  try {
    console.log("\nHome index stale-while-revalidate:");
    const a = await get("/api/mod/index?modPath=" + enc);
    ok(!a.stale, "first build is not stale", a.stale);
    const firstCount = a.counts.event || 0;
    ok(firstCount === 2, "first build counts the 2 seed events", firstCount);

    // A real maker write -> safeModWrite -> invalidates the index cache.
    const sv = await post("/api/events/save", {
      modPath: mod, namespace: "extra", id: "9", type: "country_event",
      title: "Extra", description: "d", picture: "GFX_report_event_generic_sit_table",
      triggeredOnly: "no", hidden: "no", fireOnce: "yes", major: "no", mtthDays: 10,
      trigger: "", immediate: "",
      options: [{ name: "extra.9.a", title: "OK", script: "add_political_power = 1" }],
    });
    ok(sv && sv.ok !== false, "events/save wrote the new event", sv && sv.error);

    // Next request must come back INSTANTLY with the last-known counts + stale flag.
    const b = await get("/api/mod/index?modPath=" + enc);
    ok(b.stale === true, "after the write: served stale (instant), not a blocking rebuild", b.stale);
    ok((b.counts.event || 0) === 2, "stale payload still shows the previous counts", b.counts.event);

    // After the background rebuild settles, it's fresh and the new event is counted.
    let fresh = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      fresh = await get("/api/mod/index?modPath=" + enc);
      if (!fresh.stale) break;
    }
    ok(fresh && !fresh.stale, "background rebuild makes it fresh again", fresh && fresh.stale);
    ok(fresh && (fresh.counts.event || 0) === 3, "refreshed counts include the new event (3)", fresh && fresh.counts.event);

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) {
    console.error(e); fail++;
  } finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
