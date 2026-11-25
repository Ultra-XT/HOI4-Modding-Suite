// #state-catalog-names-the-file-not-the-state — 464 OF 1,081 STATES WERE LABELLED WRONG.
//
// /api/buildings/state-catalog names each state from its FILENAME: history/states/1-France.txt becomes
// "France". But that file is Corsica — vanilla groups its state files by country and the filename is a
// grouping, not a name. The state's real name is the loc key it declares, `name = "STATE_1"`, which English
// resolves to "Corsica".
//
// 🈯 Measured over vanilla: 1,081 states carry a localised name and 464 of them (42.9%) disagree with their
// filename. State 1 is "France" vs Corsica, state 10 is "Poland" vs Warsaw, 103 is "Croatia" vs Dalmatia.
//
// Two pickers read this catalogue — the Military page's Air-base state browser and, now, the land deploy
// browser — plus the focus editor's building panel. All three were showing the wrong name for two states in
// five, which is worse than showing none: "France" for Corsica reads as correct.
//
// The right resolution already exists in this file: /api/map/model does `nm[s.name] || fileNice(s.file)`,
// loc key first and the filename only as a fallback — and its comment even calls the fallback "the same
// trick the state catalog uses". The catalog had only ever adopted the fallback half.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statename-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");

// A mod that (a) renames one of vanilla's states through loc, and (b) adds a state of its own with no loc
// at all, so the filename fallback still has something to do.
const MOD = path.join(ROOT, "snmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SnMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "snmod.mod"), 'name="SnMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "localisation", "english", "zz_states_l_english.yml"),
  "\uFEFFl_english:\n STATE_1: \"Ferrovia Prime\"\n", "utf8");
fs.writeFileSync(path.join(MOD, "history", "states", "9001-Testland.txt"), [
  "state={",
  "\tid=9001",
  '\tname="STATE_9001"',
  "\tmanpower = 1000",
  "\tstate_category = town",
  "\thistory={",
  "\t\towner = GER",
  "\t\tbuildings = { infrastructure = 1 }",
  "\t}",
  "\tprovinces={ 999999 }",
  "}",
  "",
].join("\n"), "utf8");

let PORT = 51560;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const cat = (mod, tag) => fetch(`http://127.0.0.1:${PORT}/api/buildings/state-catalog?modPath=${encodeURIComponent(mod)}${tag ? `&countryTag=${tag}` : ""}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const byId = (items, id) => (items || []).find((s) => String(s.stateId) === String(id)) || {};

    console.log("\n[ground truth] the filename is a grouping, not a name");
    let expectations = [];
    {
      const loc = {};
      let files = [];
      try { files = fs.readdirSync(path.join(GAME, "localisation", "english")).filter((f) => f.endsWith(".yml")); } catch (_) { files = []; }
      for (const f of files) {
        let t = ""; try { t = fs.readFileSync(path.join(GAME, "localisation", "english", f), "latin1"); } catch (_) { continue; }
        for (const m of t.matchAll(/^\s*(STATE_\d+):\s*\d*\s*"([^"]*)"/gm)) loc[m[1]] = m[2];
      }
      let dirFiles = [];
      try { dirFiles = fs.readdirSync(path.join(GAME, "history", "states")).filter((f) => f.endsWith(".txt")); } catch (_) { dirFiles = []; }
      if (!dirFiles.length) console.log("     (no HOI4 install — skipped)");
      else {
        let total = 0, diff = 0;
        for (const f of dirFiles) {
          let t = ""; try { t = fs.readFileSync(path.join(GAME, "history", "states", f), "latin1"); } catch (_) { continue; }
          const id = (/\bid\s*=\s*(\d+)/.exec(t) || [])[1];
          const real = id ? loc["STATE_" + id] : "";
          if (!real) continue;
          total++;
          const fileName = path.basename(f, ".txt").replace(/^\d+[_ -]*/, "").trim();
          if (fileName !== real) {
            diff++;
            if (expectations.length < 3) expectations.push({ id, file: fileName, real });
          }
        }
        console.log(`     ${total} states carry a localised name · ${diff} disagree with their filename (${(diff / total * 100).toFixed(1)}%)`);
        expectations.forEach((e) => console.log(`     e.g. state ${e.id}: file says "${e.file}", the game says "${e.real}"`));
        rec("the two really do disagree, and not rarely", diff > 200, { total, diff });
      }
    }

    console.log("\n[the catalogue] names each state the way the game does");
    if (expectations.length) {
      const d = await cat(GAME, "");
      rec("the endpoint answers", Array.isArray(d.items) && d.items.length > 500, { items: (d.items || []).length });
      for (const e of expectations) {
        const s = byId(d.items, e.id);
        console.log(`     state ${e.id}: catalogue says "${s.displayName}"`);
        rec(`state ${e.id} is "${e.real}", not "${e.file}"`, s.displayName === e.real, { got: s.displayName, want: e.real });
      }
    } else console.log("     (no HOI4 install — skipped)");

    console.log("\n[a mod that renames a state] the catalogue follows the mod, not the game");
    {
      const d = await cat(MOD, "");
      const s1 = byId(d.items, 1);
      console.log(`     state 1 under the mod: "${s1.displayName}"`);
      rec("the mod's own loc wins", s1.displayName === "Ferrovia Prime", s1);
    }

    console.log("\n[the cache] a rename shows through it");
    {
      // ⚠️ THIS IS WHY THE NAME IS RESOLVED AT THE ENDPOINT AND NOT INSIDE THE COLLECTOR. The catalogue is
      // cached to DISK, fingerprinted over the state files only — renaming a state touches localisation, not
      // history/states, so the fingerprint does not move. Resolving inside the collector would have baked the
      // old name into that cache and a rename would not have appeared until something else invalidated it.
      //
      // Renamed through Nova's OWN endpoint, not by writing the .yml behind its back: the loc map has a 30s
      // TTL and only Nova's write paths bump the epoch that clears it, so a file written around them is
      // legitimately not seen yet. Driving the real path is both honest and what the user actually does.
      const r = await fetch(`http://127.0.0.1:${PORT}/api/map/set-state`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: MOD, stateId: 1, nameKey: "STATE_1", fields: { displayName: "Ferrovia Secunda" } }),
      }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));
      rec("the rename itself succeeded", r.s < 400 && r.b && r.b.ok !== false, r);
      const d = await cat(MOD, "");
      const s1 = byId(d.items, 1);
      console.log(`     state 1 after the rename: "${s1.displayName}"`);
      rec("the rename is visible on the very next request", s1.displayName === "Ferrovia Secunda", s1);
    }

    console.log("\n[CONTROL — a state with no loc at all] still falls back to the filename");
    {
      // Without this, resolving through loc would blank the name of every state a mod adds without
      // localising it — which is most of them while the mod is being built.
      const d = await cat(MOD, "");
      const s = byId(d.items, 9001);
      console.log(`     state 9001: "${s.displayName}"`);
      rec("the filename fallback is intact", s.displayName === "Testland", s);
      rec("…and it is not the raw loc key", !/^STATE_/i.test(String(s.displayName || "")), s);
    }

    console.log("\n[the DISK cache] a catalogue written before nameKey existed must not be reused");
    {
      // This catalogue is cached to disk under APPDATA, fingerprinted over the state files. Adding a field to
      // each entry does not move that fingerprint, so without a schema stamp every cache already on a user's
      // machine would keep serving filename names forever — the state files having not changed. There were 4
      // such files in the real install when this was written.
      //
      // The hazard is shown directly: strip nameKey out of the cache the server just wrote, leaving the
      // fingerprint alone so it still HITS, and the names fall back to the filename. That is precisely what an
      // un-stamped stale cache would do.
      const cacheDir = path.join(process.env.APPDATA, "NovaModdingSuite", "cache");
      let files = []; try { files = fs.readdirSync(cacheDir).filter((f) => /^statecatalog_.*\.json$/.test(f)); } catch (_) { files = []; }
      rec("the catalogue really is cached to disk", files.length > 0, cacheDir);
      // ⚠️ TARGET THE GAME ROOT'S CACHE, not "the first file that happens to have a nameKey". There is one
      // cache file per root (statecatalog_<sha1(root)>.json), so doctoring the MOD's and then reading back
      // the GAME's touched two different files and the check reported the fixed answer for the wrong reason.
      const wantFile = "statecatalog_" + require("crypto").createHash("sha1").update(String(GAME)).digest("hex") + ".json";
      console.log(`     doctoring ${wantFile} (the game root's own cache)`);
      let sawHazard = null;
      {
        const p = path.join(cacheDir, wantFile);
        let j = null; try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { j = null; }
        rec("the game root's cache exists", !!j, files);
        const hasKey = !!(j && Array.isArray(j.catalog) && j.catalog.some((c) => c.nameKey));
        rec("…and the cached entries carry the key", hasKey, j && j.catalog && j.catalog[0]);
        if (hasKey) {
          const stripped = { ...j, catalog: j.catalog.map(({ nameKey, ...rest }) => rest) };
          fs.writeFileSync(p, JSON.stringify(stripped), "utf8");
          sawHazard = p;
        }
      }
      if (sawHazard) {
        // ⚠️ A SEPARATE PROCESS, not another createApp() in this one. stateCatalogCache is module-level, so a
        // second server in the same process shares the warm in-memory entry and never reads the doctored disk
        // cache at all — the check then reported the right answer for the wrong reason and failed as soon as
        // an earlier section happened to warm that entry. A user restarting the app is a new process, which
        // is what this simulates.
        const child = path.join(ROOT, "readback.js");
        fs.writeFileSync(child, [
          '"use strict";',
          `process.env.HOI4_MODS_ROOT = ${JSON.stringify(ROOT.replace(/\\/g, "/"))};`,
          `process.env.APPDATA = ${JSON.stringify(process.env.APPDATA.replace(/\\/g, "/"))};`,
          `const { createApp } = require(${JSON.stringify(path.join(__dirname, "server.js").replace(/\\/g, "/"))});`,
          "const srv = createApp().listen(0, '127.0.0.1', async () => {",
          "  const p = srv.address().port;",
          `  const d = await fetch('http://127.0.0.1:' + p + '/api/buildings/state-catalog?modPath=' + encodeURIComponent(${JSON.stringify(GAME)})).then(r => r.json()).catch(() => ({}));`,
          "  const s1 = ((d.items) || []).find(s => String(s.stateId) === '1') || {};",
          "  process.stdout.write('RESULT:' + JSON.stringify(s1.displayName || '') + '\\n');",
          "  srv.close(); process.exit(0);",
          "});",
        ].join("\n"), "utf8");
        const r = require("child_process").spawnSync(process.execPath, [child], { encoding: "utf8", timeout: 120000, killSignal: "SIGKILL" });
        const m = /RESULT:("(?:[^"\\]|\\.)*")/.exec((r.stdout || "") + (r.stderr || ""));
        const got = m ? JSON.parse(m[1]) : null;
        console.log(`     with nameKey stripped from the cache, a FRESH PROCESS reads state 1 as: ${JSON.stringify(got)}`);
        rec("the read-back process ran", got !== null, ((r.stdout || "") + (r.stderr || "")).slice(-300));
        rec("an entry with no key falls back to the filename — which is the hazard the stamp prevents",
          got === "France", got);
      } else console.log("     (no cached entry to strip — skipped)");

      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("…so the fingerprint carries a schema stamp", /fingerprintParts\.unshift\("schema:v\d/.test(sv), "no stamp — old caches would never rebuild");
    }

    console.log("\n[CONTROL — ordering] the owner's own states still come first");
    {
      // displayName is the secondary sort key, so changing it must not disturb the owner-first rule the
      // pickers depend on.
      const d = await cat(GAME, "GER");
      const items = d.items || [];
      const firstNonGer = items.findIndex((s) => s.ownerTag !== "GER");
      const gerAfter = items.slice(firstNonGer === -1 ? items.length : firstNonGer).filter((s) => s.ownerTag === "GER").length;
      console.log(`     ${items.filter((s) => s.ownerTag === "GER").length} German states, first non-German at index ${firstNonGer}`);
      rec("every German state precedes every other", gerAfter === 0, { firstNonGer, gerAfter });
      // ⚠️ localeCompare, not `<`. The endpoint sorts with localeCompare, and now that the names come from
      // localisation rather than from ASCII filenames they carry accents — "Île-de-France", "Minami Kyūshū" —
      // where the two orderings genuinely differ. Comparing with `<` here reported the endpoint as broken
      // when it was this check that was wrong.
      rec("…and the rest are still sorted by the name shown", (() => {
        const tail = items.slice(firstNonGer === -1 ? 0 : firstNonGer).map((s) => String(s.displayName || "").trim().toLowerCase());
        for (let i = 1; i < tail.length; i++) if (tail[i].localeCompare(tail[i - 1]) < 0) return false;
        return true;
      })(), "out of order");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== state catalogue loc names: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
