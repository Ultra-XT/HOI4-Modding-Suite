// Unit test: deleting an event also removes its localization (title .t, desc .d, option loc). The events
// delete used to drop only the script block, orphaning the loc keys (ideas + focuses already cleaned theirs;
// this brings events to parity). Also guards the prefix collision: deleting "delns.1" must NOT remove
// "delns.10" (the "." anchor). Run: node test-event-delete-loc.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// concat every loc .yml under the mod so the assertion doesn't depend on which file the writer chose
function allLocText(mod) {
  const root = path.join(mod, "localisation"); let out = "";
  const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) { try { out += fs.readFileSync(p, "utf8"); } catch (_) {} } } };
  walk(root); return out;
}

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdel-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EvDel"\n');
const PORT = 39561, app = createApp();
const server = app.listen(PORT, async () => {
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const sv1 = await call("/api/events/save", { modPath: mod, namespace: "delns", id: "1", type: "country_event", title: "One", description: "DescOne", options: [{ name: "delns.1.a", title: "OK", script: "" }] });
    const sv10 = await call("/api/events/save", { modPath: mod, namespace: "delns", id: "10", type: "country_event", title: "Ten", description: "DescTen", options: [{ name: "delns.10.a", title: "OK", script: "" }] });
    ok("both events saved (200)", sv1.s === 200 && sv10.s === 200, { sv1: sv1.s, sv10: sv10.s });
    const before = allLocText(mod);
    ok("delns.1.t + delns.10.t both present before delete", /delns\.1\.t/.test(before) && /delns\.10\.t/.test(before));

    const del = await call("/api/events/delete-definition", { modPath: mod, eventId: "delns.1" });
    ok("delete delns.1 → 200", del.s === 200, del);

    const defTxt = fs.existsSync(path.join(mod, "events", "delns.txt")) ? fs.readFileSync(path.join(mod, "events", "delns.txt"), "utf8") : "";
    ok("delns.1 def block removed", !/id\s*=\s*delns\.1\b/.test(defTxt));
    ok("delns.10 def block SURVIVES", /id\s*=\s*delns\.10\b/.test(defTxt));

    const after = allLocText(mod);
    ok("delns.1.t loc removed (the fix — no orphan)", !/delns\.1\.t\b/.test(after), (after.match(/delns\.1\.[a-z]/g) || []));
    ok("delns.1.d loc removed", !/delns\.1\.d\b/.test(after));
    ok("delns.1.a option loc removed", !/delns\.1\.a\b/.test(after));
    ok("delns.10.t loc SURVIVES (prefix-collision guard)", /delns\.10\.t\b/.test(after));
    ok("delns.10.d loc SURVIVES", /delns\.10\.d\b/.test(after));

    console.log(`\ntest-event-delete-loc: ${pass}/${total} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    // Reliable teardown (mirrors test-decision-desc.js): set exitCode + closeAllConnections + close and let
    // the process exit naturally. A forced process.exit() races libuv's handle cleanup on Windows and aborts
    // with "UV_HANDLE_CLOSING"; closeAllConnections drops the fetch keep-alive sockets so the loop drains.
    process.exitCode = pass === total && total >= 10 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
