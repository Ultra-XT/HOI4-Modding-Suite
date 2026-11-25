// Country Setup × Map migration: capital is now owned EXCLUSIVELY by the Map tab's 🏛 Set-capital tool.
// Country Setup's "Save Details" therefore OMITS the `capital` key, and the backend
// (updateCountryDetailsInText) must leave the existing `capital = N` line untouched when the key is absent —
// so saving research/stability/etc. can never clobber a capital the Map set. This test proves both halves:
//   (a) details WITHOUT capital → capital line unchanged, other fields updated;
//   (b) details WITH capital → capital line IS rewritten (proving the omission is what protects it).
// Wiki-confirmed mechanic: `capital = <state id>` in history/countries/<TAG>.txt (hoi4.paradoxwikis.com/Country_modding).
// Run: node test-country-capital-preserve.js   (auto-picked up by run-tests.js)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function post(port, route, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port, path: route, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let buf = ""; res.on("data", (d) => (buf += d)); res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(buf || "{}") }); } catch (e) { resolve({ status: res.statusCode, json: {} }); } });
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capres-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Nova Capital Preserve"\n');
  // A country file with a capital + a couple of the fields Country Setup edits.
  mk(path.join(mod, "history", "countries", "AAA - Test.txt"),
    "capital = 5\nset_research_slots = 2\nset_stability = 0.5\noob = \"AAA_1936\"\n");
  return mod;
}
const readAAA = (mod) => fs.readFileSync(path.join(mod, "history", "countries", "AAA - Test.txt"), "utf8");
const capOf = (txt) => { const m = /(?:^|\n)\s*capital\s*=\s*(\d+)/.exec(txt); return m ? parseInt(m[1], 10) : null; };
const slotsOf = (txt) => { const m = /set_research_slots\s*=\s*(\d+)/.exec(txt); return m ? parseInt(m[1], 10) : null; };

(async () => {
  console.log("=== Country Setup: capital preserved when Save omits it (Map is sole writer) ===");
  const mod = buildMod();
  const PORT = 3655;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  try {
    ok("seed: capital starts at 5", capOf(readAAA(mod)) === 5, capOf(readAAA(mod)));

    // (a) The NEW Country-Setup payload: research/stability change, capital key ABSENT.
    let r = await post(PORT, "/api/history/save-country-details", { tag: "AAA", modPath: mod, details: { researchSlots: 4, stability: 0.6 } });
    ok("save (no capital key) returns ok", r.status === 200 && r.json && r.json.ok === true, r);
    const after = readAAA(mod);
    ok("capital UNCHANGED when Save omits it (still 5)", capOf(after) === 5, capOf(after));
    ok("other field still updated (research slots → 4)", slotsOf(after) === 4, slotsOf(after));

    // (b) Contrast: if capital IS sent, it IS rewritten — proving (a) is the omission, not a dead endpoint.
    r = await post(PORT, "/api/history/save-country-details", { tag: "AAA", modPath: mod, details: { capital: 99 } });
    ok("save WITH capital returns ok", r.status === 200 && r.json && r.json.ok === true, r);
    ok("capital IS rewritten to 99 when the key is present", capOf(readAAA(mod)) === 99, capOf(readAAA(mod)));

    // The earlier non-capital fields survive the capital-only save (no whole-file clobber).
    ok("research slots still 4 after the capital-only save", slotsOf(readAAA(mod)) === 4, slotsOf(readAAA(mod)));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-CAPITAL-PRESERVE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
