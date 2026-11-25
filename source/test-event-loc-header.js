// Regression: saving an event must REPAIR a localisation file that exists without a valid `l_english:`
// header (or lost its BOM). Without the header/BOM, HOI4 ignores the whole file → every event title/desc
// shows as a missing key in-game. Events were the one maker that read its loc file raw; now it uses
// ensureOrRepairLocalizationHeader + writeUtf8BomFile like decisions/characters/ideas.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evloc-"));
fs.mkdirSync(path.join(mod, "events"), { recursive: true });
const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const locPath = path.join(locDir, "custom_events_l_english.yml");
// A BROKEN loc file: no BOM, no `l_english:` header, just a stray key (as a hand-edit or other tool
// might leave it). HOI4 would ignore this whole file.
fs.writeFileSync(locPath, " some_old_key:0 \"Old\"\n", "utf8");

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

server.listen(0, "127.0.0.1", async () => {
  try {
    const r = await post("/api/events/save", {
      modPath: mod, namespace: "evloc", id: "1", type: "country_event",
      title: "My Event Title", description: "My event desc", picture: "GFX_report_event_001",
      triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "",
      options: [{ name: "evloc.1.a", title: "OK", script: "" }],
    });
    check("event save returned 200", r.status === 200, r.status + " " + r.body);

    const raw = fs.readFileSync(locPath); // bytes (to check BOM)
    const txt = raw.toString("utf8");
    check("file now starts with the UTF-8 BOM", raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF, [raw[0], raw[1], raw[2]].join(","));
    check("first line is the l_english: header", txt.replace(/^﻿/, "").split(/\r?\n/)[0].trim() === "l_english:", JSON.stringify(txt.slice(0, 40)));
    check("new event title key written", /\bevloc\.1\.t:0\s+"My Event Title"/.test(txt), txt);
    check("new event desc key written", /\bevloc\.1\.d:0\s+"My event desc"/.test(txt));
    check("the pre-existing stray key is preserved (not lost)", /some_old_key:0\s+"Old"/.test(txt));
    check("exactly one l_english: header (not duplicated)", (txt.match(/^﻿?l_english:/gm) || []).length === 1, txt);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nEVENT-LOC-HEADER TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
