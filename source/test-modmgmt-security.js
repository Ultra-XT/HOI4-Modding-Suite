// Mod-management hardening (bug-hunt #3):
//  #1 /api/mod/create-template must REJECT a countryName that escapes the mod dir (path traversal) — it
//     becomes part of on-disk filenames.
//  #2 A mod display name with a " or \ must be SANITISED into the descriptor (Clausewitz can't escape them),
//     so the launcher + our read-back regex parse the full name.
// Run: node test-modmgmt-security.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const MODS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mods-"));
process.env.HOI4_MODS_ROOT = MODS_ROOT; // must be set BEFORE requiring server.js
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  // #localhost-fetch-fails-under-a-parallel-suite — RETRY THE TRANSPORT, NEVER THE VERDICT.
  //
  // This file failed twice in one session with `TypeError: fetch failed` on the third request, and passed
  // every time it was run alone. That is a TRANSPORT failure — the connection to its own in-process server
  // never completed — not a wrong answer from the endpoint. run-tests.js drives ~30 node processes at once
  // and Windows will refuse or reset a loopback connection under that load; the same transience is why
  // safeModWrite carries a rename retry ladder.
  //
  // ⚠️ Only the connection is retried. An HTTP response of ANY status is returned immediately, so a genuine
  // 200-where-a-400-was-expected can never be retried into a pass — which is the whole risk of adding a
  // retry to a security test.
  const post = async (r, b) => {
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const x = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
        return { status: x.status, json: await x.json().catch(() => null) };
      } catch (e) {
        last = e;                                   // transport only — fetch rejects, no response exists
        await new Promise((res) => setTimeout(res, 40 * (attempt + 1)));
      }
    }
    throw last;
  };

  try {
    // ── #2 descriptor name sanitisation ──
    const r2 = await post("/api/mod/create", { modName: "QuoteTest", displayName: 'Bad"Name\\Slash' });
    ok("#2 create ok", r2.json && r2.json.success !== false && r2.status === 200, r2.json);
    const descPath = path.join(MODS_ROOT, "quotetest", "descriptor.mod");
    ok("#2 descriptor written", fs.existsSync(descPath), descPath);
    const desc = fs.existsSync(descPath) ? fs.readFileSync(descPath, "utf8") : "";
    const nameLine = (/^name\s*=\s*"(.*?)"/m.exec(desc) || [])[1];
    ok("#2 no literal quote in descriptor", !/name\s*=\s*"[^"\n]*"[^"\n]/.test(desc) && desc.indexOf('Bad"') === -1, desc.match(/name\s*=.*/));
    ok("#2 no backslash in name", nameLine != null && !nameLine.includes("\\"), nameLine);
    ok("#2 read-back regex captures the FULL sanitised name (not truncated)", nameLine === "BadName/Slash", nameLine);

    // ── #1 path traversal in create-template ──
    const evil = "../../pwned_" + Date.now();
    const r1 = await post("/api/mod/create-template", {
      modName: "TravTest", displayName: "Trav", countryTag: "TRV",
      countryName: evil, capitalStateId: 1, color: "120 10 50",
    });
    ok("#1 malicious countryName REJECTED (not 200-ok)", !(r1.json && r1.json.success) && (r1.status >= 400 || (r1.json && r1.json.error)), r1);
    // No file with the payload marker should exist anywhere under the mods root (or its parent)
    const marker = "pwned_";
    const walk = (dir, hits) => { let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; } for (const d of e) { const p = path.join(dir, d.name); if (d.name.includes(marker)) hits.push(p); if (d.isDirectory()) walk(p, hits); } };
    const hits = []; walk(MODS_ROOT, hits); walk(path.dirname(MODS_ROOT), hits.length ? hits : (hits.push.bind(hits), []) && hits); // parent too
    ok("#1 no traversal file written anywhere", hits.length === 0, hits);

    // control: a VALID countryName is accepted
    const r1b = await post("/api/mod/create-template", { modName: "GoodTrav", displayName: "Good", countryTag: "GDT", countryName: "St. John's Republic", capitalStateId: 1, color: "10 20 30" });
    ok("#1 valid country name accepted", r1b.status === 200 && r1b.json && r1b.json.success !== false, r1b.json);
    const goodHist = path.join(MODS_ROOT, "goodtrav", "history", "countries");
    ok("#1 valid country file created", fs.existsSync(goodHist) && fs.readdirSync(goodHist).some((f) => /St\. John/.test(f)), (() => { try { return fs.readdirSync(goodHist); } catch (_) { return "no dir"; } })());
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(MODS_ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    console.log(`\nMODMGMT-SECURITY: ${pass} passed, ${fail} failed`);
  }
})();
