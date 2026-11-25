// Unit test: deleting a decision also removes its localization (<id> name + <id>_desc). The decisions
// delete used to drop only the script block, orphaning the loc (parity with events/ideas/focuses now).
// Guards the prefix collision: deleting "mydec" must NOT remove "mydec_2". Run: node test-decision-delete-loc.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decdel-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DecDel"\n');
const decDir = path.join(mod, "common", "decisions"); fs.mkdirSync(decDir, { recursive: true });
fs.writeFileSync(path.join(decDir, "testcat.txt"), `testcat = {\n\tmydec = {\n\t\ticon = GFX_decision_generic\n\t\tcost = 50\n\t}\n\tmydec_2 = {\n\t\ticon = GFX_decision_generic\n\t\tcost = 50\n\t}\n}\n`);
const locDir = path.join(mod, "localisation", "english"); fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(locDir, "testcat_l_english.yml"), `﻿l_english:\n mydec:0 "My Dec"\n mydec_desc:0 "desc one"\n mydec_2:0 "My Dec 2"\n mydec_2_desc:0 "desc two"\n`);

const PORT = 39562, app = createApp();
const server = app.listen(PORT, async () => {
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const del = await call("/api/decisions/delete-definition", { modPath: mod, categoryId: "testcat", decisionId: "mydec" });
    ok("delete mydec → 200", del.s === 200, del);
    const def = fs.readFileSync(path.join(decDir, "testcat.txt"), "utf8");
    ok("mydec def block removed", !/\bmydec\s*=\s*\{/.test(def), def.replace(/\s+/g, " ").slice(0, 80));
    ok("mydec_2 def block SURVIVES", /\bmydec_2\s*=\s*\{/.test(def));
    const loc = fs.readFileSync(path.join(locDir, "testcat_l_english.yml"), "utf8");
    ok("mydec loc removed (the fix)", !/^\s*mydec:/m.test(loc), (loc.match(/^\s*mydec[^\n]*/gm) || []));
    ok("mydec_desc loc removed", !/^\s*mydec_desc:/m.test(loc));
    ok("mydec_2 loc SURVIVES (prefix-collision guard)", /^\s*mydec_2:/m.test(loc));
    ok("mydec_2_desc loc SURVIVES", /^\s*mydec_2_desc:/m.test(loc));
    console.log(`\ntest-decision-delete-loc: ${pass}/${total} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    // Reliable teardown (mirrors test-decision-desc.js): set exitCode + closeAllConnections + close and let
    // the process exit naturally. A forced process.exit() races libuv's handle cleanup on Windows and aborts
    // with "UV_HANDLE_CLOSING"; closeAllConnections drops the fetch keep-alive sockets so the loop drains.
    process.exitCode = pass === total && total >= 7 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
