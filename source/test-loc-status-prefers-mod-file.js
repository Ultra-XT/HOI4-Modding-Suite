// /api/localization/status returns the mod's english loc files; the focus editor auto-picks files[0]
// as its loc target. Dogfooding showed focus name/desc loc landing in custom_characters_l_english.yml
// (the Characters maker's file) just because "c" sorts before the mod's slug. The endpoint now floats
// the mod's own <slug>_l_english.yml (made by /api/mod/create) to the front so it's the default target.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// A mod whose folder (slug) is "myaddon" — so its main loc file is myaddon_l_english.yml.
const parent = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locstatus-"));
const mod = path.join(parent, "myaddon");
const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const mk = (name) => fs.writeFileSync(path.join(locDir, name), "﻿l_english:\n", "utf8");
// Deliberately create the slug file LAST and give it a name that sorts AFTER an existing file,
// so a naive alphabetical order would not put it first.
mk("custom_characters_l_english.yml");
mk("custom_decisions_l_english.yml");
mk("myaddon_l_english.yml");
mk("zz_extra_l_english.yml");

const app = createApp();
const server = http.createServer(app);
function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method: "GET" }, (res) => {
      let out = ""; res.on("data", (c) => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject); req.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const r = await get("/api/localization/status?modPath=" + encodeURIComponent(mod));
    check("status returned 200", r.status === 200, r.status + " " + r.body);
    const data = JSON.parse(r.body);
    const files = Array.isArray(data.files) ? data.files : [];
    const names = files.map((f) => path.basename(f));
    check("found all four loc files", names.length === 4, JSON.stringify(names));
    check("the mod's own <slug>_l_english.yml is first (auto-pick default)", path.basename(files[0]).toLowerCase() === "myaddon_l_english.yml", JSON.stringify(names));
    check("no loc file was dropped by the reorder", ["custom_characters_l_english.yml", "custom_decisions_l_english.yml", "myaddon_l_english.yml", "zz_extra_l_english.yml"].every((n) => names.includes(n)), JSON.stringify(names));
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(parent, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nLOC-STATUS-PREFERS-MOD-FILE TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
