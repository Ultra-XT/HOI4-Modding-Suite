// Unit test: /api/events/save validates namespace + id. A missing namespace used to silently write a garbage
// "undefined.txt" full of "undefined.undefined" events and return 200 OK (found by the copy-a-country deep
// test). Now it rejects with 400. Run: node test-event-save-validation.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0; const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evval-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EvVal"\n');
const PORT = 39560, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (o) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const r1 = await post({ modPath: mod, id: "1", type: "country_event", title: "T", options: [] });
    ok("missing namespace → 400 with a namespace message", r1.s === 400 && /namespace/i.test(r1.b.error || ""), r1);
    const r1b = await post({ modPath: mod, namespace: "", id: "1", type: "country_event", title: "T", options: [] });
    ok("empty namespace → 400", r1b.s === 400, r1b);
    const r2 = await post({ modPath: mod, namespace: "testns", type: "country_event", title: "T", options: [] });
    ok("missing id → 400 with an id message", r2.s === 400 && /id/i.test(r2.b.error || ""), r2);
    const r3 = await post({ modPath: mod, namespace: "testns", id: "1", type: "country_event", title: "T", options: [{ name: "testns.1.a", title: "OK", script: "" }] });
    ok("valid namespace+id → 200", r3.s === 200, r3);
    ok("NO undefined.txt written", !fs.existsSync(path.join(mod, "events", "undefined.txt")));
    ok("testns.txt written", fs.existsSync(path.join(mod, "events", "testns.txt")));
    // id = "0" is a legit event id and must NOT be rejected as empty
    const r4 = await post({ modPath: mod, namespace: "testns", id: "0", type: "country_event", title: "T", options: [{ name: "x", title: "OK", script: "" }] });
    ok("id '0' is accepted (not treated as empty)", r4.s === 200, r4);
    console.log(`\ntest-event-save-validation: ${pass} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} server.close(() => process.exit(pass >= 7 ? 0 : 1)); }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
