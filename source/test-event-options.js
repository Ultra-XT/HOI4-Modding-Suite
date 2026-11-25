// Event writer correctness: unique option names + a default option for non-hidden events.
// (A) Two nameless options must NOT collide on one loc key. (B) A non-hidden event with zero options
// would softlock the player → the writer adds a default "OK" option. (C) Hidden events keep zero options.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3493, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtopt-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Evt Opt Test"\n', "utf8");
  const countOpt = (txt) => (txt.match(/option\s*=\s*\{/g) || []).length;
  const names = (txt) => (txt.match(/name\s*=\s*([A-Za-z0-9_.]+)/g) || []).map((s) => s.replace(/name\s*=\s*/, ""));
  try {
    // (A) two nameless options
    let r = await post("/api/events/save", { modPath: mod, namespace: "gre_test", id: "1", type: "country_event", title: "T", description: "D", options: [{ name: "", title: "First", script: "" }, { name: "", title: "Second", script: "" }] });
    ok(r.json && (r.json.ok || r.json.success), "saved event with 2 nameless options", r.json);
    let txt = fs.readFileSync(path.join(mod, "events", "gre_test.txt"), "utf8");
    const optNames = names(txt).filter((n) => n.startsWith("gre_test.1."));
    ok(countOpt(txt) === 2, "two option blocks written", countOpt(txt));
    ok(new Set(optNames).size === 2, "the two option names are UNIQUE", optNames);
    const loc = fs.readFileSync(path.join(mod, "localisation", "english", "custom_events_l_english.yml"), "utf8");
    ok(/First/.test(loc) && /Second/.test(loc), "both option titles localised (no overwrite)", loc.split("\n").filter((l) => /gre_test/.test(l)));

    // (B) non-hidden event, zero options → default option added
    r = await post("/api/events/save", { modPath: mod, namespace: "gre_test", id: "2", type: "country_event", title: "T2", description: "D2", options: [] });
    ok(r.json && (r.json.ok || r.json.success), "saved non-hidden event with 0 options", r.json);
    txt = fs.readFileSync(path.join(mod, "events", "gre_test.txt"), "utf8");
    const ev2 = txt.slice(txt.indexOf("id = gre_test.2"));
    ok(/option\s*=\s*\{/.test(ev2.slice(0, ev2.indexOf("\n}"))), "a default option was added (no softlock)", ev2.slice(0, 200));

    // (C) hidden event, zero options → stays optionless
    r = await post("/api/events/save", { modPath: mod, namespace: "gre_test", id: "3", type: "country_event", title: "T3", description: "D3", hidden: "yes", options: [] });
    txt = fs.readFileSync(path.join(mod, "events", "gre_test.txt"), "utf8");
    const ev3 = txt.slice(txt.indexOf("id = gre_test.3"));
    const ev3body = ev3.slice(0, ev3.indexOf("\n}") + 2);
    ok(/hidden\s*=\s*yes/.test(ev3body) && !/option\s*=\s*\{/.test(ev3body), "hidden event stays optionless", ev3body.slice(0, 160));

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
