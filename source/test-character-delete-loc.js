// Unit test: deleting a character also removes its name localization (<token>). The character delete used to
// drop only the script block, orphaning the loc (parity with events/decisions/ideas/focuses now). Guards the
// prefix collision: deleting "TST_alpha" must NOT remove "TST_alpha_two". Run: node test-character-delete-loc.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chardel-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CharDel"\n');
const charDir = path.join(mod, "common", "characters"); fs.mkdirSync(charDir, { recursive: true });
fs.writeFileSync(path.join(charDir, "TST.txt"), `characters = {\n\tTST_alpha = {\n\t\tname = TST_alpha\n\t\tadvisor = { slot = political_advisor idea_token = tst_alpha }\n\t}\n\tTST_alpha_two = {\n\t\tname = TST_alpha_two\n\t\tadvisor = { slot = political_advisor idea_token = tst_alpha_two }\n\t}\n}\n`);
const locDir = path.join(mod, "localisation", "english"); fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(locDir, "TST_l_english.yml"), `﻿l_english:\n TST_alpha:0 "Alpha One"\n TST_alpha_two:0 "Alpha Two"\n`);

const PORT = 39563, app = createApp();
const server = app.listen(PORT, async () => {
  const call = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const del = await call("/api/characters/delete", { modPath: mod, token: "TST_alpha", file: "TST.txt" });
    ok("delete TST_alpha → 200", del.s === 200, del);
    const def = fs.readFileSync(path.join(charDir, "TST.txt"), "utf8");
    ok("TST_alpha def block removed", !/\bTST_alpha\s*=\s*\{/.test(def), def.replace(/\s+/g, " ").slice(0, 90));
    ok("TST_alpha_two def block SURVIVES", /\bTST_alpha_two\s*=\s*\{/.test(def));
    const loc = fs.readFileSync(path.join(locDir, "TST_l_english.yml"), "utf8");
    ok("TST_alpha name loc removed (the fix)", !/^\s*TST_alpha:/m.test(loc), (loc.match(/^\s*TST_alpha[^\n]*/gm) || []));
    ok("TST_alpha_two loc SURVIVES (prefix-collision guard)", /^\s*TST_alpha_two:/m.test(loc));
    console.log(`\ntest-character-delete-loc: ${pass}/${total} checks passed`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    process.exitCode = pass === total && total >= 5 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
