// /api/history/set-startup grants/ungrants a country's startup items (events/decisions/spirits/
// characters) by editing its history/countries file. Dogfooding an add-on surfaced that a REMOVE
// (active=false) on a country with no mod override yet still materialized a full vanilla-copy of that
// country's history into the mod — silently overriding a whole country (it dropped "GER - Germany.txt"
// into the mod because a maker startup-sync called this with the focus tree's owner tag + active=false).
// This locks: (A) remove-on-absent is a no-op (no file created); (B) add still works; (C) remove of a
// real present item still works.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-startup-guard-"));
const histDir = path.join(mod, "history", "countries");

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
const listHist = () => (fs.existsSync(histDir) ? fs.readdirSync(histDir) : []);

server.listen(0, "127.0.0.1", async () => {
  try {
    // (A) Remove an item from a country with NO mod override yet → no-op, no file created.
    const rA = await post("/api/history/set-startup", { tag: "GER", itemId: "nfd_events.1", itemType: "event", active: false, modPath: mod });
    check("remove-on-absent returns ok", rA.status === 200, rA.status + " " + rA.body);
    check("remove-on-absent created NO country file (the fix)", listHist().length === 0, JSON.stringify(listHist()));

    // (B) Add an item → the mod's country override IS created and contains the item.
    const rB = await post("/api/history/set-startup", { tag: "GER", itemId: "nfd_events.1", itemType: "event", active: true, modPath: mod });
    check("add returns ok", rB.status === 200, rB.status + " " + rB.body);
    const gerFiles = listHist().filter((f) => /GER/.test(f));
    check("add created the GER override", gerFiles.length === 1, JSON.stringify(listHist()));
    const afterAdd = gerFiles.length ? fs.readFileSync(path.join(histDir, gerFiles[0]), "utf8") : "";
    check("add wrote the event reference", /nfd_events\.1/.test(afterAdd), afterAdd.slice(0, 200));

    // (C) Remove the now-present item → still works (file remains, item gone).
    const rC = await post("/api/history/set-startup", { tag: "GER", itemId: "nfd_events.1", itemType: "event", active: false, modPath: mod });
    check("remove-present returns ok", rC.status === 200, rC.status + " " + rC.body);
    const afterRemove = gerFiles.length ? fs.readFileSync(path.join(histDir, gerFiles[0]), "utf8") : "";
    check("remove-present took the event back out", !/nfd_events\.1/.test(afterRemove), afterRemove.slice(0, 200));
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nSTARTUP-NOOP-GUARD TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
