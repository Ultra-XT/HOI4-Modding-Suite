// Integration: editing a state's owner / fields via the map editor must PRESERVE every other directive
// in its history block (cores, victory_points, buildings, demilitarized zone, etc.) and the state's other
// top-level fields — it edits in place, it must not rebuild-and-drop. Re-saving owner is a common edit.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stateRT-"));
fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
// The mod declares replace_path="history/states", so its state 1 is the only one that loads. Without it the installed game's
// 1-France.txt loads beside 1-Test.txt and, sorting first, is the state 1 HOI4 keeps and the one Nova edits
// (#the-state-the-game-keeps). This test is about what an edit preserves, not about which file loads.
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="State round trip"\nreplace_path="history/states"\n', "utf8");
const stPath = path.join(mod, "history", "states", "1-Test.txt");
fs.writeFileSync(stPath, `state = {
\tid = 1
\tname = "STATE_1"
\tmanpower = 120000
\tstate_category = town
\tresources = { oil = 5 }
\tprovinces = { 100 101 102 }
\thistory = {
\t\towner = AAA
\t\tadd_core_of = AAA
\t\tadd_core_of = BBB
\t\tset_demilitarized_zone = yes
\t\tvictory_points = { 100 50 }
\t\tbuildings = {
\t\t\tinfrastructure = 4
\t\t\tarms_factory = 2
\t\t\t101 = { naval_base = 3 }
\t\t}
\t}
}
`, "utf8");

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
    // 1) Change OWNER → AAA becomes CCC, everything else intact.
    const r1 = await post("/api/map/set-owner", { modPath: mod, stateId: 1, owner: "CCC" });
    check("set-owner returned ok", r1.status === 200 && /"ok":true|"changed":true/.test(r1.body), r1.status + " " + r1.body);
    let txt = fs.readFileSync(stPath, "utf8");
    check("owner is now CCC", /owner\s*=\s*CCC/.test(txt) && !/owner\s*=\s*AAA/.test(txt), txt);
    check("both add_core_of survived", /add_core_of\s*=\s*AAA/.test(txt) && /add_core_of\s*=\s*BBB/.test(txt));
    check("set_demilitarized_zone survived", /set_demilitarized_zone\s*=\s*yes/.test(txt));
    check("victory_points survived", /victory_points\s*=\s*\{\s*100 50/.test(txt.replace(/\s+/g, " ")));
    check("buildings survived (infra + province naval_base)", /infrastructure\s*=\s*4/.test(txt) && /101\s*=\s*\{\s*naval_base\s*=\s*3/.test(txt));
    check("top-level manpower/category/resources/provinces survived", /manpower\s*=\s*120000/.test(txt) && /state_category\s*=\s*town/.test(txt) && /oil\s*=\s*5/.test(txt) && /provinces\s*=\s*\{\s*100 101 102/.test(txt.replace(/\s+/g, " ")));
    check("brace-balanced after set-owner", balanced(txt), txt);

    // 2) Change a FIELD (manpower) via set-state → other directives still intact.
    const r2 = await post("/api/map/set-state", { modPath: mod, stateId: 1, fields: { manpower: 99999 } });
    check("set-state returned ok", r2.status === 200, r2.status + " " + r2.body);
    txt = fs.readFileSync(stPath, "utf8");
    check("manpower updated to 99999", /manpower\s*=\s*99999/.test(txt) && !/manpower\s*=\s*120000/.test(txt));
    check("owner CCC + cores + buildings still intact after field edit", /owner\s*=\s*CCC/.test(txt) && /add_core_of\s*=\s*BBB/.test(txt) && /naval_base\s*=\s*3/.test(txt));
    check("brace-balanced after set-state", balanced(txt), txt);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nMAP-STATE-ROUNDTRIP TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
