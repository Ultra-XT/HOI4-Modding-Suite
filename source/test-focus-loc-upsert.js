// /api/localization/upsert is how the FOCUS editor writes focus name/desc localization. Dogfooding a
// full mod build surfaced that it wrote entries at COLUMN 0 (`lux_pol_1:0 "..."`) while every other
// maker (characters/events/decisions/techs) and HOI4's own convention put a LEADING SPACE after the
// `l_english:` header. This locks the leading space, the de-dup-on-edit, and a valid single header+BOM.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusloc-"));
const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const locPath = path.join(locDir, "test_focus_l_english.yml");
// A valid, pre-existing loc file (BOM + header) — upsert requires the file to exist.
fs.writeFileSync(locPath, "﻿l_english:\n", "utf8");

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
    const r1 = await post("/api/localization/upsert", {
      path: locPath, modPath: mod,
      entries: { lux_alpha: { name: "Alpha Focus", desc: "The first focus" }, lux_beta: { name: "Beta Focus", desc: "" } },
    });
    check("upsert returned 200", r1.status === 200, r1.status + " " + r1.body);

    let txt = fs.readFileSync(locPath, "utf8");
    check("BOM preserved", txt.charCodeAt(0) === 0xFEFF, txt.charCodeAt(0));
    check("exactly one l_english: header", (txt.match(/^﻿?l_english:\s*$/gm) || []).length === 1, JSON.stringify(txt.slice(0, 40)));
    // The crux: every entry carries a LEADING SPACE (not column 0).
    check("name line has a leading space", /^ lux_alpha:0 "Alpha Focus"$/m.test(txt), txt);
    check("desc line has a leading space", /^ lux_alpha_desc:0 "The first focus"$/m.test(txt), txt);
    check("second focus name has a leading space", /^ lux_beta:0 "Beta Focus"$/m.test(txt));
    check("NO column-0 entry (regression guard)", !/^lux_[a-z]+(?:_desc)?:0 /m.test(txt), txt);

    // Editing a focus name re-upserts: the old stanza is replaced (no duplicate), still leading-space.
    const r2 = await post("/api/localization/upsert", {
      path: locPath, modPath: mod, entries: { lux_alpha: { name: "Alpha Renamed", desc: "The first focus" } },
    });
    check("re-upsert returned 200", r2.status === 200, r2.status + " " + r2.body);
    txt = fs.readFileSync(locPath, "utf8");
    check("rename replaced the name (no stale value)", /^ lux_alpha:0 "Alpha Renamed"$/m.test(txt) && !/Alpha Focus/.test(txt), txt);
    check("exactly one lux_alpha name line (no duplicate)", (txt.match(/^ lux_alpha:0 /gm) || []).length === 1, (txt.match(/^ lux_alpha:0 /gm) || []).length);
    check("untouched focus still present", /^ lux_beta:0 "Beta Focus"$/m.test(txt));
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nFOCUS-LOC-UPSERT TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
