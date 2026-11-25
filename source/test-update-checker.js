// The GitHub update-checker must (a) compare versions correctly, (b) only flag updates when GitHub's
// release is genuinely newer, and (c) FAIL SILENTLY (offline / rate-limited / no releases / junk) — never
// throw and never falsely claim an update. fetch is mocked so this never touches the network.
const uc = require("./update-checker.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// ── cmpSemver ──
ok(uc.cmpSemver("1.0.3", "1.0.2") > 0, "1.0.3 > 1.0.2");
ok(uc.cmpSemver("1.0.2", "1.0.3") < 0, "1.0.2 < 1.0.3");
ok(uc.cmpSemver("1.0.2", "1.0.2") === 0, "1.0.2 == 1.0.2");
ok(uc.cmpSemver("1.2.0", "1.10.0") < 0, "numeric, not lexical: 1.2.0 < 1.10.0");
ok(uc.cmpSemver("v2.0.0", "1.9.9") > 0, "leading v stripped: v2.0.0 > 1.9.9");
ok(uc.cmpSemver("1.0.0-beta", "1.0.0") === 0, "prerelease suffix ignored");
ok(uc.cmpSemver("1.1", "1.1.0") === 0, "short form == padded");

// ── checkForUpdate with a mocked fetch (ttl:0 + reset so the cache never hides a case) ──
const fresh = () => uc._resetCache();
const res = (ok, body) => async () => ({ ok, json: async () => body });
const opts = (fetchImpl) => ({ fetchImpl, now: () => Date.now(), ttl: 0 });

(async () => {
  fresh();
  let d = await uc.checkForUpdate("1.0.2", opts(res(true, { tag_name: "v1.0.3", html_url: "https://x/releases/v1.0.3" })));
  ok(d.updateAvailable === true && d.latest === "1.0.3" && /v1\.0\.3/.test(d.url), "newer release → updateAvailable + latest + url", d);

  fresh();
  d = await uc.checkForUpdate("1.0.3", opts(res(true, { tag_name: "v1.0.3" })));
  ok(d.updateAvailable === false, "same version → no update", d);

  fresh();
  d = await uc.checkForUpdate("2.0.0", opts(res(true, { tag_name: "v1.5.0" })));
  ok(d.updateAvailable === false, "local newer than GitHub → no update (no downgrade nag)", d);

  fresh();
  d = await uc.checkForUpdate("1.0.2", opts(res(false, {}))); // 404 = no releases yet
  ok(d.ok === true && d.updateAvailable === false && d.latest === null, "no releases (404) → ok, no update", d);

  fresh();
  d = await uc.checkForUpdate("1.0.2", opts(async () => { throw new Error("offline"); }));
  ok(d.ok === true && d.updateAvailable === false, "fetch throws (offline) → ok, no update, no throw", d);

  fresh();
  d = await uc.checkForUpdate("1.0.2", opts(res(true, { tag_name: "" })));
  ok(d.updateAvailable === false, "empty tag → no update", d);

  // Cache: a second call within TTL must NOT re-fetch (different mock would otherwise change the answer).
  fresh();
  await uc.checkForUpdate("1.0.2", { fetchImpl: res(true, { tag_name: "v9.9.9" }), now: () => 1000, ttl: 1e9 });
  d = await uc.checkForUpdate("1.0.2", { fetchImpl: async () => { throw new Error("should not be called"); }, now: () => 1001, ttl: 1e9 });
  ok(d.latest === "9.9.9", "result is cached within TTL (no second fetch)", d);

  console.log("\n  " + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
})();
