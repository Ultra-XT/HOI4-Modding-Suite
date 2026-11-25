// Country-lock round-trip: the decision maker's "Restrict to country" picker bakes a marked
// `tag = X #nova_country_lock` line into the decision's `allowed = { … }` block so the decision only
// exists for that country — without the modder hand-writing the scope, and without clobbering their own
// allowed conditions. This test covers BOTH halves:
//   A) the real client helpers (extract/inject) pulled straight out of public/decisions.js, and
//   B) the live /api/decisions/save → on-disk → /api/decisions/list parse-back, proving the
//      #nova_country_lock marker survives the write+parse so the lock reloads into the dropdown.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ── Part A: eval the REAL helper source from public/decisions.js (not a copy) ────────────────────────
const src = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");
const a = src.indexOf("const NOVA_COUNTRY_LOCK_RE");
const b = src.indexOf("function setCountryLockValue", a); // pure helpers live before the DOM ones
check("located the country-lock helpers in decisions.js", a !== -1 && b !== -1 && b > a, `a=${a} b=${b}`);
let extractCountryLock, injectCountryLock;
if (a !== -1 && b !== -1) {
  const made = new Function(src.slice(a, b) + "\nreturn { extractCountryLock, injectCountryLock };")();
  extractCountryLock = made.extractCountryLock;
  injectCountryLock = made.injectCountryLock;
}

if (injectCountryLock && extractCountryLock) {
  check("inject(empty, NSX) makes one marked tag line", injectCountryLock("", "NSX") === "tag = NSX #nova_country_lock", injectCountryLock("", "NSX"));
  const ex0 = extractCountryLock("tag = NSX #nova_country_lock");
  check("extract reads the tag back", ex0.tag === "NSX", ex0.tag);
  check("extract leaves empty allowed when the tag was the only line", ex0.allowed === "", JSON.stringify(ex0.allowed));

  const inj1 = injectCountryLock("has_war = no", "NSX");
  check("inject keeps the tag line first, user conditions after", inj1 === "tag = NSX #nova_country_lock\nhas_war = no", inj1);
  const ex1 = extractCountryLock(inj1);
  check("extract pulls the tag and returns the user's conditions cleanly", ex1.tag === "NSX" && ex1.allowed === "has_war = no", JSON.stringify(ex1));

  const reinj = injectCountryLock(inj1, "GER");
  check("re-inject leaves exactly one managed tag line", (reinj.match(/#nova_country_lock/g) || []).length === 1, reinj);
  check("re-inject uses the NEW tag", /tag = GER #nova_country_lock/.test(reinj) && !/NSX/.test(reinj), reinj);

  check("blank tag = no restriction (drops the lock, keeps conditions)", injectCountryLock("has_war = no", "") === "has_war = no", injectCountryLock("has_war = no", ""));
  check("blank tag on empty allowed stays empty", injectCountryLock("", "") === "", JSON.stringify(injectCountryLock("", "")));

  // A hand-written `allowed = { tag = GRE }` is the ordinary way to restrict a decision, and ignoring it —
  // as this used to — meant the dropdown read "Any country" for every real decision written that way.
  // Choosing a country then ADDED a second tag line, and `tag == FRA AND tag == GRE` can never both be true,
  // so the decision became unavailable to every country in the game. A bare tag line is now recognised as
  // the lock, and re-injecting replaces it rather than stacking on top of it.
  const exU = extractCountryLock("tag = GRE\nhas_war = no");
  check("extract recognises an UNMARKED tag condition as the lock", exU.tag === "GRE" && exU.allowed === "has_war = no", JSON.stringify(exU));
  const reinjU = injectCountryLock("tag = GRE\nhas_war = no", "FRA");
  check("re-injecting over an unmarked tag does not stack two tags",
    (reinjU.match(/(?:^|\n)[ \t]*tag[ \t]*=/g) || []).length === 1 && /tag = FRA/.test(reinjU) && !/GRE/.test(reinjU), JSON.stringify(reinjU));
  // …but a tag nested inside an OR/AND block is a different condition and must be left strictly alone.
  const exNested = extractCountryLock("OR = {\n\ttag = GRE\n\ttag = TUR\n}");
  check("a nested tag is NOT treated as the lock", exNested.tag === "" && /tag = GRE/.test(exNested.allowed) && /tag = TUR/.test(exNested.allowed), JSON.stringify(exNested));
}

// ── Part B: live server save + parse-back ────────────────────────────────────────────────────────────
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-declock-"));
fs.mkdirSync(path.join(mod, "common", "decisions"), { recursive: true });

const app = createApp();
const server = http.createServer(app);

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = body ? { "Content-Type": "application/json", "Content-Length": data.length } : {};
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method, headers }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const resp = await req("POST", "/api/decisions/save", {
      modPath: mod, categoryId: "zztest_cat", id: "zztest_dec", name: "Test", cost: 50, icon: "",
      days: 0, fireOnce: "yes", available: "has_war = no", modifier: "", effect: "add_political_power = 10",
      decisionType: "normal", scope: "country", cooldown: 0, targetTrigger: "", removeEffect: "",
      activation: "", cancelTrigger: "", isGood: "no", visible: "",
      allowed: "tag = NSX #nova_country_lock", aiWillDo: "",
    });
    check("save returned 200", resp.status === 200, resp.status + " " + resp.body);

    const decFile = fs.readFileSync(path.join(mod, "common", "decisions", "zztest_cat.txt"), "utf8");
    check("on-disk: allowed block scopes to tag = NSX", /allowed\s*=\s*\{[^}]*tag\s*=\s*NSX/.test(decFile), decFile);
    check("on-disk: the #nova_country_lock marker survived the write", /#\s*nova_country_lock/.test(decFile), decFile);
    check("on-disk: user's has_war condition preserved in available", /available\s*=\s*\{[^}]*has_war\s*=\s*no/.test(decFile), decFile);
    check("on-disk: brace-balanced", (() => { let d = 0; for (const c of decFile) { if (c === "{") d++; else if (c === "}") { if (--d < 0) return false; } } return d === 0; })());

    // Parse-back: the marker MUST come back in dec.allowed so the client can re-fill the dropdown.
    const list = JSON.parse((await req("GET", `/api/decisions/list?modPath=${encodeURIComponent(mod)}`)).body);
    const flat = [];
    (list.categories || list.decisions || []).forEach(c => (c.decisions || [c]).forEach(d => flat.push(d)));
    const dec = flat.find(d => d.id === "zztest_dec");
    check("parse-back: decision found", !!dec, JSON.stringify(Object.keys(list)));
    check("parse-back: allowed still carries the #nova_country_lock marker", !!dec && /#\s*nova_country_lock/.test(dec.allowed || ""), dec && dec.allowed);

    if (extractCountryLock && dec) {
      const ex = extractCountryLock(dec.allowed || "");
      check("end-to-end: extract on the parsed allowed recovers tag NSX", ex.tag === "NSX", JSON.stringify(ex));
    }
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.stack || e);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    await new Promise(r => server.close(r));
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nDECISION-COUNTRY-LOCK: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
});
