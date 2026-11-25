// Integration: deleting an event/decision must remove ONLY the targeted block — siblings in the same
// file stay intact, braces stay balanced, and the file header (add_namespace / category wrapper) is
// preserved. Deleting from a multi-item file is a classic place to over-delete and corrupt the file.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-del-"));
fs.mkdirSync(path.join(mod, "events"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "decisions"), { recursive: true });

const ev = (id) => `country_event = {\n\tid = ${id}\n\ttitle = ${id}.t\n\tdesc = ${id}.d\n\tis_triggered_only = yes\n\toption = { name = ${id}.a }\n}\n`;
const evPath = path.join(mod, "events", "test.txt");
fs.writeFileSync(evPath, `add_namespace = test\n\n${ev("test.1")}\n${ev("test.2")}\n${ev("test.3")}\n`, "utf8");

const dec = (id) => `\t${id} = {\n\t\ticon = GFX_decision_generic\n\t\tcost = 50\n\t\tcomplete_effect = { add_political_power = 10 }\n\t}\n`;
const decPath = path.join(mod, "common", "decisions", "political_decisions.txt");
fs.writeFileSync(decPath, `political_decisions = {\n${dec("dec_a")}\n${dec("dec_b")}\n${dec("dec_c")}\n}\n`, "utf8");

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
const count = (s, re) => (s.match(re) || []).length;

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── Delete the MIDDLE event (test.2) ──
    const r1 = await post("/api/events/delete-definition", { modPath: mod, eventId: "test.2" });
    check("event delete returned 200", r1.status === 200, r1.status + " " + r1.body);
    let txt = fs.readFileSync(evPath, "utf8");
    check("deleted event (test.2) is gone", !/\bid = test\.2\b/.test(txt), txt);
    check("sibling test.1 survived", /\bid = test\.1\b/.test(txt));
    check("sibling test.3 survived", /\bid = test\.3\b/.test(txt));
    check("add_namespace header preserved", /add_namespace = test/.test(txt));
    check("exactly two country_event blocks remain", count(txt, /country_event\s*=\s*\{/g) === 2, count(txt, /country_event\s*=\s*\{/g));
    check("events file stays brace-balanced", balanced(txt), txt);

    // ── Delete the MIDDLE decision (dec_b) ──
    const r2 = await post("/api/decisions/delete-definition", { modPath: mod, categoryId: "political_decisions", decisionId: "dec_b" });
    check("decision delete returned 200", r2.status === 200, r2.status + " " + r2.body);
    let dtxt = fs.readFileSync(decPath, "utf8");
    check("deleted decision (dec_b) is gone", !/\bdec_b\s*=\s*\{/.test(dtxt), dtxt);
    check("sibling dec_a survived", /\bdec_a\s*=\s*\{/.test(dtxt));
    check("sibling dec_c survived", /\bdec_c\s*=\s*\{/.test(dtxt));
    check("category wrapper preserved", /political_decisions\s*=\s*\{/.test(dtxt));
    check("exactly two decision blocks remain", count(dtxt, /\bdec_[ac]\s*=\s*\{/g) === 2);
    check("decisions file stays brace-balanced", balanced(dtxt), dtxt);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nDELETE-DEFINITION TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
