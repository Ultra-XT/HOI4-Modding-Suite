// Country Setup writer sanitisation (bug-hunt 2026-07-05): set_politics/set_popularities are built by
// interpolating client input into the country history file. A stray quote/brace in last_election, or a
// NaN/bad-key popularity, must NOT corrupt the file — the writer now sanitises every field. Run:
// node test-country-details-sanitize.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const post = (r, b) => fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (x) => ({ status: x.status, json: await x.json().catch(() => null) }));
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-csanit-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CSanit"\n', "utf8");
  const dir = path.join(mod, "history", "countries");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "GER - Germany.txt");
  fs.writeFileSync(file, `capital = 64\nset_politics = {\n\truling_party = fascism\n\tlast_election = "1933.3.5"\n\telection_frequency = 48\n\telections_allowed = no\n}\n`, "utf8");

  try {
    // ── MALICIOUS input: quote-injection in last_election, bad frequency, NaN + bad-key popularities ──
    let r = await post("/api/history/save-country-details", {
      modPath: mod, tag: "GER",
      details: {
        politics: { rulingParty: 'communism"\n}\nkill_everything = yes', lastElection: '1936.1.1"\n}\nset_stability = 9', electionFrequency: "abc", electionsAllowed: "maybe" },
        popularities: { communism: 40, fascism: "not a number", "bad key!": 10, democratic: Infinity, neutrality: 60 },
      },
    });
    ok("malicious save returned ok", r.json && r.json.ok, r.json);
    let after = fs.readFileSync(file, "utf8");
    ok("file still brace-balanced (no injected brace escaped the block)", balanced(after), after);
    ok("exactly one set_politics", count(after, /set_politics\s*=\s*\{/g) === 1);
    ok("exactly one set_popularities", count(after, /set_popularities\s*=\s*\{/g) === 1);
    ok("bad last_election rejected → safe default", /last_election\s*=\s*"1936\.1\.1"/.test(after), after.match(/last_election.*/));
    ok("no injected set_stability = 9 / kill_everything", !/set_stability\s*=\s*9/.test(after) && !/kill_everything/.test(after), after);
    ok("bad ruling_party → neutrality", /ruling_party\s*=\s*neutrality/.test(after), after.match(/ruling_party.*/));
    ok("bad election_frequency 'abc' → 48", /election_frequency\s*=\s*48/.test(after));
    ok("bad elections_allowed 'maybe' → no", /elections_allowed\s*=\s*no/.test(after));
    ok("valid popularity kept (communism=40, neutrality=60)", /communism\s*=\s*40/.test(after) && /neutrality\s*=\s*60/.test(after));
    ok("NaN popularity dropped (no fascism = ...)", !/fascism\s*=/.test(after.slice(after.indexOf("set_popularities"))), after.match(/fascism\s*=.*/g));
    ok("Infinity popularity dropped (no democratic = Infinity)", !/democratic\s*=\s*Infinity/.test(after) && !/=\s*Infinity/.test(after));
    ok("bad ideology key dropped (no 'bad key')", !/bad/.test(after));

    // ── VALID input passes through unchanged ──
    r = await post("/api/history/save-country-details", {
      modPath: mod, tag: "GER",
      details: { politics: { rulingParty: "democratic", lastElection: "1936.4.9", electionFrequency: 36, electionsAllowed: "yes" }, popularities: { democratic: 55, neutrality: 45 } },
    });
    after = fs.readFileSync(file, "utf8");
    ok("valid last_election passes through", /last_election\s*=\s*"1936\.4\.9"/.test(after));
    ok("valid ruling_party passes through", /ruling_party\s*=\s*democratic/.test(after));
    ok("valid frequency 36 passes through", /election_frequency\s*=\s*36/.test(after));
    ok("valid popularities pass through", /democratic\s*=\s*55/.test(after) && /neutrality\s*=\s*45/.test(after));
    ok("still brace-balanced", balanced(after));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    // Clean teardown (no forced process.exit — that races open handles → UV_HANDLE_CLOSING on Windows).
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    console.log(`\nCOUNTRY-DETAILS-SANITIZE: ${pass} passed, ${fail} failed`);
  }
})();
