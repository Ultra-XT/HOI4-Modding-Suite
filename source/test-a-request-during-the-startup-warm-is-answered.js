// ⛔ #the-warm-published-half-a-cache — A NAME LOOKUP THAT ARRIVES WHILE THE STARTUP WARM IS RUNNING IS ANSWERED.
//
// A server started on its own (`node server.js` — the suite's live-app server, the one a bare live-app test starts, the
// preview) begins warming its caches 1.5 s after it listens. The warm's first step lists vanilla's localisation files and
// then fingerprints each one, awaiting the disk for both. It published the LIST as soon as it had it and the fingerprints only
// after the second wait — and getLocalizationMap, which is synchronous and takes the list as one half of a finished pair,
// spread the null beside it: "cachedVanillaFingerprintParts is not iterable". Every route that resolves a name answered
// 400 for as long as that wait lasted.
//
// Found 2026-09-30 by running the live-app tests against a fresh server: the research page asks for its catalogue about two
// seconds after the server is up, the route answered 400 on 3 cold boots in 8, and the page drew an empty tree (the test
// then waited three minutes for nodes that were never coming). The warm now publishes the pair together, once both are made.
//
// This parks the warm exactly there — inside its stat of vanilla's one localisation file — and asks for a name.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-warm-half-cache-"));
const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods"), MOD = path.join(MODS, "m");
const BOM = String.fromCharCode(0xfeff);   // a localisation file starts with one
const VANILLA_YML = path.join(GAME, "localisation", "english", "base_l_english.yml");
fs.mkdirSync(path.dirname(VANILLA_YML), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "not really an exe");
fs.writeFileSync(VANILLA_YML, BOM + "l_english:\n BASE_KEY:0 \"Base\"\n");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Warm Half Cache"\nsupported_version="1.*"\n');
fs.writeFileSync(path.join(MOD, "localisation", "english", "mine_l_english.yml"), BOM + "l_english:\n MY_KEY:0 \"Mine\"\n");
// Before server.js loads: it works out its folders as it loads (and a bare run's sandbox fills in whatever is left).
Object.assign(process.env, {
  HOI4_ROOT: GAME, HOI4_MODS_ROOT: MODS, NOVA_HOME_DIR: path.join(ROOT, "home"),
  APPDATA: path.join(ROOT, "appdata"), NOVA_APP_DATA_DIR: path.join(ROOT, "appdata"), XDG_CONFIG_HOME: path.join(ROOT, "appdata"),
});
const server = require("./server.js");

const sameFile = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
const realStat = fs.promises.stat;
(async () => {
  try {
    server.setActiveRoot(MOD);
    const app = server.createApp();
    // The warm's own stat of vanilla's localisation file is held until `open()`: whatever it has published by then is
    // what a request arriving in that wait finds. (Nothing else stats that file through fs.promises: the listing reads
    // folders, and the reader is synchronous.)
    let parked = 0, open = () => {};
    const gate = new Promise((res) => { open = res; });
    fs.promises.stat = function (p, ...rest) {
      if (!sameFile(p, VANILLA_YML)) return realStat.call(this, p, ...rest);
      parked++;
      return gate.then(() => realStat.call(this, p, ...rest));
    };
    let warmDone = false, warmErr = "";
    const warm = Promise.resolve(app.locals.warmCaches({})).then(() => { warmDone = true; }, (e) => { warmDone = true; warmErr = String(e && e.message); });
    const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 5)); return cond(); };
    await until(() => parked > 0 || warmDone, 60000);
    rec("THE CONTROL: the warm is parked in its fingerprint of vanilla's localisation file, its list of them already made",
      parked === 1 && !warmDone, { parked, warmDone, warmErr });

    // ── the request that arrives in that wait ──
    let names = null, err = "";
    try { names = (server.getLocalizationMap(MOD) || {}).names || {}; } catch (e) { err = String(e && e.message); }
    rec("⭐⭐⭐ a name lookup made while the warm waits on the disk is answered, not thrown", !err, err);
    rec("⭐⭐ …with vanilla's names and the mod's", !!names && names.BASE_KEY === "Base" && names.MY_KEY === "Mine",
      names && { BASE_KEY: names.BASE_KEY, MY_KEY: names.MY_KEY });

    // ── …and the warm, let go, ends as it always did, leaving a pair the next lookup can use ──
    open();
    await until(() => warmDone, 120000);
    rec("the warm then runs to its end", warmDone && !warmErr, { warmDone, warmErr });
    let after = null, afterErr = "";
    // another root, so this lookup is not served from the short-lived per-mod answer and reads the pair again
    try { after = (server.getLocalizationMap(GAME) || {}).names || {}; } catch (e) { afterErr = String(e && e.message); }
    rec("⭐ …and a lookup for another root afterwards is answered too", !afterErr && !!after && after.BASE_KEY === "Base", afterErr || (after && after.BASE_KEY));
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    fs.promises.stat = realStat;
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) console.log("FAILED: " + fails.join(" | "));
  process.exit(fails.length ? 1 : 0);
})();
