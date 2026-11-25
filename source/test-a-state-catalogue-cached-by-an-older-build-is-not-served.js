// A state catalogue an older build of Nova cached to disk is not served by a newer one. #a-state-catalogue-cached-by-an-older-build
//
// THE DEFECT. GET /api/buildings/state-catalog (the focus building panel and the Army air-base picker) caches its answer to disk,
// statecatalog_<sha1(mod)>.json under Nova's app-data cache, keyed on a fingerprint of the state files, the building rules and a
// hand-kept schema stamp — but not on the code that computes each entry. Batch 8 engine (c989163) changed that code: a state whose
// state_category is spelled in other capital letters (Old World Blues' 1182-State.txt, ENCLAVE) now gets its category's slots,
// where before it got 0. The stamp was not bumped, and no input the fingerprint covers changed, so a catalogue an installed user's
// earlier build wrote went on serving 0 base slots for such a state until one of those files happened to change (batch 8 engine
// report, risk 3). A hand-kept stamp is exactly what a fix forgets.
//
// THE FIX. The cache entry carries a stamp of the code that computes it — derived from the source, so no one has to remember to
// bump it — and an entry without that stamp, or with another build's, is recomputed. The hand-kept schema stamp stays for shape
// changes (test-state-catalog-sees-building-rules.js).
//
// HOW IT IS SHOWN. Written by this build, then doctored into exactly what the build before the case fix left on disk — the same
// fingerprint, the old answer (0 base slots), and no code stamp — and read back by a FRESH PROCESS, as a user restarting Nova is
// (the in-memory cache is per process; test-state-catalog-loc-name.js learned that). The request is army.js's:
// GET /api/buildings/state-catalog?modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-catalog-code");
// This test's own app-data directory, so the cache files it doctors are its own.
const APPDATA = path.join(world.ROOT, "appdata");
fs.mkdirSync(APPDATA, { recursive: true });
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;
const { createApp } = require("./server.js");
const { ICON_CACHE_DIR } = require("./safe-write.js");

// State 2 on "RURAL" — the game's table defines `rural` (local_building_slots = 2).
const MOD = world.mod("catalog code stamp", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "RURAL" }) });
const cacheFile = path.join(ICON_CACHE_DIR, "statecatalog_" + crypto.createHash("sha1").update(String(MOD)).digest("hex") + ".json");

/** Read state 2's slots in a fresh Nova process, as a restarted app does. */
function slotsInAFreshProcess() {
  const child = path.join(world.ROOT, "readback.js");
  fs.writeFileSync(child, [
    '"use strict";',
    `const { createApp } = require(${JSON.stringify(path.join(__dirname, "server.js"))});`,
    "const srv = createApp().listen(0, '127.0.0.1', async () => {",
    "  const p = srv.address().port;",
    `  const d = await fetch('http://127.0.0.1:' + p + '/api/buildings/state-catalog?modPath=' + encodeURIComponent(${JSON.stringify(MOD)})).then((r) => r.json()).catch(() => ({}));`,
    "  const s = ((d && d.items) || []).find((x) => String(x.stateId) === '2') || null;",
    "  process.stdout.write('RESULT:' + JSON.stringify(s ? s.slots : null) + '\\n');",
    "  try { srv.closeAllConnections(); } catch (_) {}",
    "  srv.close(); process.exit(0);",
    "});",
  ].join("\n"), "utf8");
  const r = spawnSync(process.execPath, [child], { encoding: "utf8", timeout: 180000, env: Object.assign({}, process.env) });
  const m = /RESULT:(.*)/.exec((r.stdout || "") + (r.stderr || ""));
  try { return m ? JSON.parse(m[1]) : { unreadable: ((r.stdout || "") + (r.stderr || "")).slice(-300) }; } catch (_) { return { unreadable: m[1] }; }
}
/** The cache file with state 2's answer replaced by what the build before the case fix computed. */
const withOldAnswer = (j) => (j.catalog || []).map((e) => String(e.stateId) === "2"
  ? Object.assign({}, e, { slots: Object.assign({}, e.slots, { base: 0, cap: 0 + (+((e.slots || {}).sharedAdded) || 0) }) }) : e);

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    console.log("1. This build answers and caches");
    const d = await fetch(`${srv.base}/api/buildings/state-catalog?${new URLSearchParams({ modPath: MOD })}`).then((r) => r.json());
    const s2 = ((d && d.items) || []).find((x) => String(x.stateId) === "2") || {};
    rec("CONTROL: a RURAL state gets rural's 2 base slots", (s2.slots || {}).base === 2, s2);
    const written = (() => { try { return JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (_) { return null; } })();
    rec("…and the catalogue is on disk where this test looks", !!written && Array.isArray(written.catalog) && typeof written.fingerprint === "string", cacheFile);
    srv.close(); srv = null;
    if (!written) throw new Error("no cache file to doctor");

    console.log("\n2. ⭐⭐⭐ The file the build before the case fix left: the same fingerprint, 0 base slots, no code stamp");
    fs.writeFileSync(cacheFile, JSON.stringify({ fingerprint: written.fingerprint, catalog: withOldAnswer(written) }), "utf8");
    {
      const slots = slotsInAFreshProcess();
      console.log(`     a fresh process reads state 2 as ${JSON.stringify(slots)}`);
      rec("⭐⭐⭐ a restarted Nova does not serve it: state 2 has its 2 base slots", slots && slots.base === 2, slots);
    }

    console.log("\n3. ⭐⭐ A file stamped by another build");
    fs.writeFileSync(cacheFile, JSON.stringify(Object.assign({}, written, { code: "a build that computed entries differently", catalog: withOldAnswer(written) })), "utf8");
    {
      const slots = slotsInAFreshProcess();
      rec("⭐⭐ is not served either", slots && slots.base === 2, slots);
    }

    console.log("\n4. CONTROL: the disk cache is still used for a file this build wrote");
    fs.writeFileSync(cacheFile, JSON.stringify(Object.assign({}, written, { catalog: withOldAnswer(written) })), "utf8");
    {
      const slots = slotsInAFreshProcess();
      rec("⭐ a fresh process serves this build's own file as it is (the doctored 0 proves it was read, not recomputed)", slots && slots.base === 0, slots);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a state catalogue cached by an older build is not served: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
