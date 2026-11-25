// Integration: /api/history/set-startup must toggle a spirit/decision in a country's history file
// idempotently — adding twice never duplicates, removing leaves no stray line, and a re-add after a
// remove works. Also exercises the escaped-id regex path (setIdeaInHistoryText / setEffectInHistoryText).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hist-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
const histPath = path.join(mod, "history", "countries", "GRE - Greece.txt");
fs.writeFileSync(histPath, "capital = 47\noob = \"GRE_1936\"\nset_technology = { infantry_weapons = 1 }\n", "utf8");

const app = createApp();
const server = http.createServer(app);
function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let out = ""; res.on("data", (c) => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject); req.write(data); req.end();
  });
}
function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: pathname }, (res) => {
      let out = ""; res.on("data", (c) => out += c); res.on("end", () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({}); } });
    }).on("error", reject);
  });
}
const statusOf = (itemId, itemType) => get(`/api/history/startup-status?modPath=${encodeURIComponent(mod)}&tag=GRE&itemId=${itemId}&itemType=${itemType}`);
const count = (s, re) => (s.match(re) || []).length;

server.listen(0, "127.0.0.1", async () => {
  try {
    const tag = "GRE";
    const spirit = (active) => post("/api/history/set-startup", { modPath: mod, tag, itemId: "GRE_test_spirit", itemType: "spirit", active });
    const decision = (active) => post("/api/history/set-startup", { modPath: mod, tag, itemId: "GRE_test_decision", itemType: "decision", active });

    // Add a spirit, then add again → no duplicate.
    await spirit(true); await spirit(true);
    let txt = fs.readFileSync(histPath, "utf8");
    check("spirit added once (no duplicate on double-add)", count(txt, /\bGRE_test_spirit\b/g) === 1, txt);
    check("spirit lives in an add_ideas block", /add_ideas\s*=\s*\{[^}]*GRE_test_spirit/.test(txt.replace(/\n/g, " ")));

    // Remove the spirit → gone, file still has its other content.
    await spirit(false);
    txt = fs.readFileSync(histPath, "utf8");
    check("spirit removed cleanly", count(txt, /\bGRE_test_spirit\b/g) === 0, txt);
    check("removal preserved capital/oob/tech", /capital = 47/.test(txt) && /oob =/.test(txt) && /set_technology/.test(txt));

    // Re-add after remove works.
    await spirit(true);
    txt = fs.readFileSync(histPath, "utf8");
    check("spirit re-adds after removal", count(txt, /\bGRE_test_spirit\b/g) === 1);

    // Reader/writer agreement: the status endpoint must report what the file actually contains.
    check("status reports spirit ACTIVE when present", (await statusOf("GRE_test_spirit", "spirit")).active === true);
    await spirit(false);
    check("status reports spirit INACTIVE after removal", (await statusOf("GRE_test_spirit", "spirit")).active === false);
    await spirit(true); // restore for later checks

    // Decision toggle: add twice → one activate_decision line; remove → gone.
    await decision(true); await decision(true);
    txt = fs.readFileSync(histPath, "utf8");
    check("activate_decision added once (no dup)", count(txt, /activate_decision\s*=\s*GRE_test_decision\b/g) === 1, txt);
    check("status reports decision ACTIVE when present", (await statusOf("GRE_test_decision", "decision")).active === true);
    await decision(false);
    txt = fs.readFileSync(histPath, "utf8");
    check("activate_decision removed cleanly", count(txt, /GRE_test_decision/g) === 0);
    check("status reports decision INACTIVE after removal", (await statusOf("GRE_test_decision", "decision")).active === false);

    // Sanity: the file is still brace-balanced after all the toggling.
    const balanced = (() => { let d = 0; for (const c of txt) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })();
    check("history file stays brace-balanced", balanced, txt);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nHISTORY-TOGGLE TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
