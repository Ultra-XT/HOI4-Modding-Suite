// End-to-end for the Event Maker's newly-modeled advanced fields: `after` (effects once an option is
// chosen) and `timeout_days` (auto-pick the first option after N days). Proves the full authoring path:
// a fresh save writes them; the parser (/api/events/list) reads them back so editing repopulates the form;
// and re-saving with them CLEARED removes them from the file exactly once (no orphan, no duplicate).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evt-adv-"));
fs.mkdirSync(path.join(mod, "events"), { recursive: true });
const evtPath = path.join(mod, "events", "advns.txt");

const app = createApp();
const server = http.createServer(app);
function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {} }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const post = (p, b) => req("POST", p, b);
const getJson = async (p) => JSON.parse((await req("GET", p)).body);

const baseBody = {
  modPath: mod, namespace: "advns", id: "1", type: "country_event",
  title: "Advanced", description: "Advanced event", picture: "GFX_report_event_001",
  triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0,
  trigger: "", immediate: "",
  options: [{ name: "advns.1.a", title: "OK", script: "add_political_power = 10" }],
};

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── 1. Save a NEW event with after + timeout_days. ──
    const save1 = await post("/api/events/save", { ...baseBody,
      after: "add_stability = 0.05\nadd_war_support = 0.02", timeoutDays: 20 });
    check("save #1 returned 200", save1.status === 200, save1.status + " " + save1.body);

    let disk = fs.readFileSync(evtPath, "utf8");
    check("file brace-balanced after create", balanced(disk), disk);
    check("emits after block w/ both effects", /after\s*=\s*\{[\s\S]*add_stability\s*=\s*0\.05[\s\S]*add_war_support/.test(disk), disk);
    check("emits timeout_days = 20", /\btimeout_days\s*=\s*20\b/.test(disk));
    check("exactly one advns.1 event block", count(disk, /\bid\s*=\s*advns\.1\b/g) === 1);

    // ── 2. Parser reads them back so the form repopulates on edit. ──
    const list = await getJson(`/api/events/list?modPath=${encodeURIComponent(mod)}`);
    const evt = (list.events || []).find(e => e.fullId === "advns.1");
    check("parser found the event", !!evt, JSON.stringify(list).slice(0, 160));
    if (evt) {
      check("parsed after body", /add_stability/.test(evt.after || "") && /add_war_support/.test(evt.after || ""), evt.after);
      check("parsed timeoutDays", evt.timeoutDays === 20, evt.timeoutDays);
    }

    // ── 3. Edit: clear after + timeout_days → both vanish, nothing duplicates. ──
    const save2 = await post("/api/events/save", { ...baseBody, after: "", timeoutDays: 0 });
    check("save #2 (edit) returned 200", save2.status === 200, save2.status + " " + save2.body);
    disk = fs.readFileSync(evtPath, "utf8");
    check("file brace-balanced after edit", balanced(disk), disk);
    check("cleared after is GONE", !/\bafter\s*=\s*\{/.test(disk), disk);
    check("cleared timeout_days is GONE", !/\btimeout_days\s*=/.test(disk), disk);
    check("still exactly one advns.1 event block", count(disk, /\bid\s*=\s*advns\.1\b/g) === 1);

    // ── 4. Re-add after; confirm it comes back exactly once (managed, no accumulation). ──
    const save3 = await post("/api/events/save", { ...baseBody, after: "add_stability = 0.10", timeoutDays: 5 });
    check("save #3 returned 200", save3.status === 200, save3.status + " " + save3.body);
    disk = fs.readFileSync(evtPath, "utf8");
    check("after present exactly once after re-add", count(disk, /\bafter\s*=\s*\{/g) === 1, count(disk, /\bafter\s*=\s*\{/g));
    check("timeout_days present exactly once after re-add", count(disk, /\btimeout_days\s*=/g) === 1);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.stack || e);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nEVENT-ADVANCED-ROUNDTRIP: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
