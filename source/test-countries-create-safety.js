// /api/countries/create MUST reject a country name that could path-traverse out of the mod dir (the name
// becomes on-disk filenames: common/countries/<name>.txt + history/countries/<TAG> - <name>.txt). Mirrors the
// guard the create-template endpoint already applies. Run: node test-countries-create-safety.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== /api/countries/create path-traversal guard ===");
  const PORT = 3924, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cc-"));
  const mod = path.join(parent, "themod");
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova CC Safety"\n');

  const create = async (tag, name) => {
    const r = await fetch(`${BASE}/api/countries/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, name, capitalStateId: 1, modPath: mod }),
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    for (const bad of ["../../evil", "..\\..\\evil", "foo/bar", "a:b", "x..y"]) {
      const r = await create("ABC", bad);
      ok(`rejected traversal/invalid name ${JSON.stringify(bad)} (400)`, r.status === 400 && r.body && r.body.error && /invalid characters/i.test(r.body.error), r);
    }
    // belt-and-suspenders: nothing escaped the mod dir
    ok("no evil.txt written outside the mod", !fs.existsSync(path.join(parent, "evil.txt")) && !fs.existsSync(path.join(parent, "..", "evil.txt")));

    // a valid name still works and writes INSIDE the mod
    const good = await create("ABD", "Valorland");
    ok("valid name creates the country", good.body && (good.body.ok === true || good.status === 200), good);
    ok("common/countries file written inside the mod", fs.existsSync(path.join(mod, "common", "countries", "Valorland.txt")));
    ok("history file written inside the mod", fs.existsSync(path.join(mod, "history", "countries", "ABD - Valorland.txt")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(parent, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRIES-CREATE-SAFETY: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
