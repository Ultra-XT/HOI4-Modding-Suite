// #country-name-stale-forever — A RENAMED COUNTRY KEPT ITS OLD NAME, AND THE OLD NAME WAS WRITTEN TO DISK.
//
// collectCountryCatalogByRoots fingerprints every common/country_tags file and every english .yml, so a
// rename DOES bust its cache and force a rebuild — that half was right. But the rebuild took its names from
// getCountryLocNames(), whose own cache is a bare one-hour TTL with no fingerprint and no
// localizationWriteEpoch check. So the rebuild faithfully reproduced the PRE-RENAME names and wrote them into
// countrycatalog_<sha1>.json next to a fingerprint that matches the RENAMED files.
//
// That is the nasty part: the poisoned entry is a valid cache hit for ever after. Not stale for an hour —
// stale until some unrelated tag or loc file happens to change, across restarts included. Every country
// picker in Nova (Country Setup, Research, Events, Mod Health, the focus tree) shows the old name.
//
// getCountryLocNames has exactly ONE caller: the catalogue rebuild itself, which only runs when the
// fingerprint over those very files has already changed. So caching the names there buys nothing and costs
// this. The rebuild now reads them fresh, and the catalogue's schema stamp is bumped so a cache already
// poisoned on someone's machine rebuilds instead of serving the old name for ever.
//
// Siblings that already do this correctly: the ideas catalogue keeps names OUT of the cached payload and
// decorates at response time ("the cache itself stays loc-independent"), and the state catalogue does the
// same, its comment naming the reason — "the loc map has its own TTL and write-epoch cache, so reading it
// per request is what keeps a rename visible".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cname-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "cnmod");
fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CnMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "cnmod.mod"), 'name="CnMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz_probia.txt"), 'PRB = "countries/Probia.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Probia.txt"), "graphical_culture = western_european_gfx\n");

const LOC = path.join(MOD, "localisation", "english", "zz_probia_l_english.yml");
const writeName = (n) => fs.writeFileSync(LOC, "﻿l_english:\n PRB: \"" + n + "\"\n PRB_DEF: \"" + n + "\"\n", "utf8");

const nameOf = (list) => {
  const rows = Array.isArray(list) ? list : ((list && (list.countries || list.items)) || []);
  const r = rows.find((c) => String(c.tag || "").toUpperCase() === "PRB");
  return r ? (r.displayName || r.name || "") : "";
};

let PORT = 52050;
(async () => {
  let srv = null;
  try {
    writeName("Old Probia Name");
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    // ⚠️ PIN THE PORT. `cat()` used to interpolate the mutable PORT, so the moment the second-process check
    // below did `++PORT` every later call went to that server — which it then closed. The catalogue came back
    // EMPTY and read like the country had vanished, when the request was simply going nowhere.
    const MAIN_PORT = PORT;
    const cat = () => fetch(`http://127.0.0.1:${MAIN_PORT}/api/countries/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[cold] the name is read from the mod's own localisation");
    {
      const n = nameOf(await cat());
      console.log(`     PRB = ${JSON.stringify(n)}`);
      rec("the country is found under its localised name", n === "Old Probia Name", n);
    }

    console.log("\n[rename] editing the localisation must change what every picker shows");
    {
      // The finding's own scenario: renamed by something other than the two create endpoints that happen to
      // clear this cache — by hand, or by any other tool. The catalogue's fingerprint covers this file, so
      // the catalogue itself knows something changed; only its NAME SOURCE did not.
      writeName("Renamed Probia");
      const n = nameOf(await cat());
      console.log(`     PRB = ${JSON.stringify(n)}`);
      rec("the new name is visible", n === "Renamed Probia", n);
    }

    console.log("\n[the disk cache] must not have the old name baked into it");
    {
      const dir = path.join(process.env.APPDATA, "NovaModdingSuite", "cache");
      let files = []; try { files = fs.readdirSync(dir).filter((f) => /^countrycatalog_.*\.json$/.test(f)); } catch (_) {}
      rec("the catalogue really is cached to disk", files.length > 0, dir);
      let sawOld = false, sawNew = false;
      for (const f of files) {
        let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        if (t.includes("Old Probia Name")) sawOld = true;
        if (t.includes("Renamed Probia")) sawNew = true;
      }
      console.log(`     on disk: old name present=${sawOld}  new name present=${sawNew}`);
      rec("the OLD name is not persisted", !sawOld, "the poisoned entry is on disk");
      rec("…and the new one is", sawNew, "the rebuild did not persist the new name");
    }

    console.log("\n[a fresh process] must not resurrect it — this is what made it permanent");
    {
      // The poisoned entry sits beside a fingerprint that MATCHES the renamed files, so it is a valid cache
      // hit for ever, restarts included. A second server in the same process cannot show this; the disk
      // check above is the one that does, plus a rebuild forced by an unrelated read.
      const srv2 = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
      const n = nameOf(await fetch(`http://127.0.0.1:${PORT}/api/countries/catalog?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json()).catch(() => null));
      console.log(`     PRB = ${JSON.stringify(n)}`);
      rec("a second server reads the new name", n === "Renamed Probia", n);
      srv2.closeAllConnections(); srv2.close();
    }

    console.log("\n[CONTROL] an unrelated read does not rebuild, and the name is still right");
    {
      const raw = await cat();
      const rows = Array.isArray(raw) ? raw : ((raw && (raw.countries || raw.items)) || []);
      const row = rows.find((c) => String(c.tag || "").toUpperCase() === "PRB");
      console.log(`     ${rows.length} countries in the catalogue; PRB row = ${JSON.stringify(row)}`);
      const n = nameOf(raw);
      rec("repeat reads are stable", n === "Renamed Probia", { n, row, total: rows.length });
      // …and renaming a SECOND time still shows through, so the fix is not a one-shot.
      writeName("Probia Thrice");
      const n2 = nameOf(await cat());
      console.log(`     PRB = ${JSON.stringify(n2)}`);
      rec("a second rename also shows", n2 === "Probia Thrice", n2);
    }

    console.log("\n[the cost] a rename must not freeze the app");
    {
      // ⚠️ CORRECTNESS AND COST TOGETHER. The first version of this fix re-parsed EVERY root's localisation
      // on every rebuild, which took a rename on an add-on over a big base mod from 82ms to 590ms of
      // SYNCHRONOUS main-process work — the whole app stops for that long, and a user renaming several
      // countries feels each one. A rename only ever touches the MOD's own localisation, so the per-root
      // fingerprint means the unchanged roots come from cache.
      const times = [];
      for (let i = 0; i < 3; i++) {
        writeName("Probia Timing " + i);
        const t0 = process.hrtime.bigint();
        const n = nameOf(await cat());
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        if (n !== "Probia Timing " + i) { rec("the rename is visible on each pass", false, { got: n, want: "Probia Timing " + i }); break; }
      }
      const worst = Math.max(...times);
      console.log(`     rebuild after a rename: ${times.map((t) => t.toFixed(0) + "ms").join(", ")}`);
      rec("the rename is visible on every pass", nameOf(await cat()) === "Probia Timing 2", "a later rename was not picked up");
      // ⚠️ HONEST LIMIT OF THIS TIMING CHECK: the fixture is a small mod over vanilla, where even a wholesale
      // re-parse costs ~46ms, so this bar catches only a catastrophic regression — NOT the 82ms→590ms one
      // that prompted the fix, which needed a big base mod underneath to show. Backing the fingerprint out
      // leaves this green. The structural check below is what actually pins the mechanism.
      rec("…and a rebuild does not cost hundreds of ms", worst < 400, `${worst.toFixed(0)}ms`);
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("…because an unchanged root is served from cache rather than re-parsed",
        /cached && stamp && cached\.fingerprint === stamp/.test(sv),
        "the per-root fingerprint short-circuit is gone — every rebuild re-parses every root");
    }

    console.log("\n[the source] the stamp is bumped so an already-poisoned cache rebuilds");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      // Name-agnostic on purpose: what matters is that a stamp exists and has moved past v6, not what the
      // suffix is called. Pinning "-idlnames" made this check fail the moment the stamp was renamed.
      // ⚠️ SCOPE TO THE COUNTRY CATALOGUE. server.js carries several schema stamps; an unscoped search found
      // the STATE catalogue's `schema:v2-namekey` and reported the country one as unbumped. Take the stamp
      // that precedes this catalogue's own disk-cache filename.
      // …and anchor on the CODE, not on prose: the fix's own comment mentions countrycatalog_ by name, and an
      // indexOf found that sentence instead of the cache path, slicing the stamp off entirely.
      const at = sv.indexOf("ICON_CACHE_DIR, `countrycatalog_");
      const before = at === -1 ? "" : sv.slice(0, at);
      const stamps = [...before.matchAll(/fingerprintParts\.unshift\("schema:v(\d+)-[\w-]+"\)/g)];
      const m = stamps.length ? stamps[stamps.length - 1] : null;
      rec("the country catalogue carries a schema stamp", !!m, "no stamp");
      rec("…bumped past v6, which is what poisoned caches were written under", m && Number(m[1]) >= 7, m && m[1]);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== country name rename visible: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
