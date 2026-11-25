// #icon-fuzzy-index-cap — NOVA COULD NOT FIND THREE QUARTERS OF THE GAME'S ART.
//
// When an icon key has no declared sprite, /api/ideas/sprite-url falls back to searching the gfx trees by
// filename. That index was built with collectFilesRecursively(dir, 8000) — 8,000 files per root, against a
// vanilla gfx/ that holds 30,421 and a Millennium Dawn gfx/ that holds 61,106.
//
// The walk is depth-first off a LIFO stack and simply STOPS mid-tree at the limit, so the 22,421 files it
// never reached were not a sample spread across the corpus — they were whole directories. Measured against
// this install: 0 of 882 event pictures, 0 of 6,617 flags, 0 of 882 achievement icons, and 3 of 3,041
// focus-goal icons, while 2,010 3D model textures and 786 font files were indexed in full. scoreIconCandidate
// awards +20 to a path containing "goals" — the tie-breaker rewarded a directory the index had thrown away.
//
// ⭐ THE TARGET IS DERIVED, NOT TYPED IN. The test walks gfx/ twice — once whole, once the way the old cap
// walked it — and picks its probe from the difference. A hardcoded filename would rot with the next game
// patch and, worse, would not prove the file was ever unreachable.
//
// ⭐ THE KEY IS A PREFIX OF THE FILENAME, NOT THE FILENAME. A key that matches a file exactly may be a
// DECLARED sprite, and then it resolves through the sprite map without ever consulting the index — which is
// exactly what happened when this was first probed: vanilla's news_event_001..005 answered correctly even
// with the cap at 8,000, and proved nothing. A truncated prefix cannot be a sprite key, so only the fuzzy
// index can answer it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iconidx-"));
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
const MOD = path.join(ROOT, "iconmod");
fs.mkdirSync(path.join(MOD, "common"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="IconMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "iconmod.mod"), 'name="IconMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const GAME_GFX = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/gfx";
const OLD_CAP = 8000;

// The old walk, reproduced exactly: LIFO stack, stop at the limit.
function walkAsOldCapDid(dir, limit) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length && results.length < limit) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else { results.push(full); if (results.length >= limit) break; }
    }
  }
  return results;
}

// Nova's scorer, so the test can predict which file the endpoint must return.
function scoreWith(lowerPath, name, key) {
  let s = 0;
  if (name === key) s += 100;
  if (name.startsWith(key)) s += 55;
  if (name.includes(key)) s += 30;
  if (lowerPath.includes(`/${key}.`) || lowerPath.includes(`\\${key}.`)) s += 35;
  if (lowerPath.includes("interface") || lowerPath.includes("goals")) s += 20;
  return s;
}
function score(lowerPath, key) {
  return scoreWith(lowerPath, path.basename(lowerPath, path.extname(lowerPath)), key);
}

const PORT = 53223;
(async () => {
  let srv = null;
  try {
    // ── source-level checks first: these bite whether or not the game is installed ───────────────────────
    const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("\n[the cap] a runaway guard has to sit ABOVE the real corpus, not inside it");
    {
      const m = SV.match(/const ICON_SEARCH_FILE_CAP = (\d+);/);
      rec("the cap is named, not a literal buried in the call", !!m, "ICON_SEARCH_FILE_CAP is gone");
      const cap = m ? Number(m[1]) : 0;
      console.log(`     ICON_SEARCH_FILE_CAP = ${cap}`);
      rec("no root is still walked with the old 8,000 limit", !/collectFilesRecursively\(dir, 8000\)/.test(SV), "the old call survived");
      // 61,106 is Millennium Dawn's gfx/, the largest single root measured on this machine. The cap is
      // applied PER ROOT, so it has to clear the biggest one on its own.
      //
      // ⚠️ getAssetRoots is [modRoot, gameRoot, ...extra content] — declared DEPENDENCIES are deliberately
      // excluded from the asset walks for speed, and its own comment says so. So editing MD directly
      // indexes 61,106 + vanilla's 30,421; an add-on built ON MD does not index MD's art at all. That is a
      // separate gap, not something this cap governs — do not read this number as "the whole chain".
      rec("…and it clears the largest corpus measured (61,106)", cap > 61106, cap);
    }

    console.log("\n[the schema stamp] a cache validated against SOURCE files cannot notice its own shape changed");
    {
      // ⚠️ This used to assert the stamp was folded into a fingerprint hash. The fingerprint is gone —
      // #icon-index-fingerprint-too-shallow replaced it with a recorded directory signature, because a
      // top-two-levels mtime check could not see a file added deeper in the tree. Assert the PROPERTY that
      // still has to hold (a mismatched schema must not be read back), not the phrasing that carried it.
      rec("the persisted payload carries a schema", /ICON_SEARCH_CACHE_SCHEMA = "/.test(SV), "no schema constant");
      rec("…the write stamps it", /schema: ICON_SEARCH_CACHE_SCHEMA,/.test(SV), "the payload is written unstamped");
      rec("…so a v1 payload cannot be served to v2 code", /cachedData\.schema === ICON_SEARCH_CACHE_SCHEMA/.test(SV), "no schema check on read");
    }

    console.log("\n[truncation is recorded] the walk stops AT the limit, so length alone cannot tell you");
    {
      // The walker is the only place that still knows which it was, so it has to say.
      rec("the walker reports whether it stopped at the limit",
        /return \{ files, dirs, truncated: files\.length >= limit \};/.test(SV), "the walker discards the fact");
      rec("…and the caller carries it up", /if \(found\.truncated\) truncated = true;/.test(SV), "silent truncation");
      rec("…and says so out loud", /\[Icon Search\] hit the/.test(SV), "no warning");
    }

    console.log("\n[the two scorers must agree] the fast path precomputes what the slow path derives");
    {
      const samples = [
        ["d:/x/gfx/interface/goals/goal_generic_army.dds", "goal_generic_army"],
        ["d:/x/gfx/event_pictures/event_test.dds", "event_te"],
        ["d:/x/gfx/models/a.b.c.dds", "a.b"],
        ["d:/x/gfx/.hidden", "hidden"],
        ["d:/x/gfx/interface/noext", "noext"],
      ];
      // scoreIconCandidate is module-private, so mirror both forms here and compare them to each other the
      // same way server.js does: the fast form must receive exactly path.basename(p, path.extname(p)).
      let agree = true;
      const disagreements = [];
      for (const [p, k] of samples) {
        const slow = score(p, k);
        const lp = p.toLowerCase();
        const slash = Math.max(lp.lastIndexOf("/"), lp.lastIndexOf("\\"));
        const nm = slash === -1 ? lp : lp.slice(slash + 1);
        const dot = nm.lastIndexOf(".");
        const base = dot <= 0 ? nm : nm.slice(0, dot);
        if (base !== path.basename(lp, path.extname(lp))) { agree = false; disagreements.push([p, base, path.basename(lp, path.extname(lp))]); }
        void slow;
      }
      rec("the precomputed basename matches path.basename/path.extname", agree, disagreements);
      rec("the original scorer is still present for path-only callers", /function scoreIconCandidate\(lowerPath, key\)/.test(SV), "removed");
    }

    // ── behavioural checks: these need the game's art on disk ────────────────────────────────────────────
    if (!fs.existsSync(GAME_GFX)) {
      console.log("\n[behaviour] SKIPPED — Hearts of Iron IV is not installed at the expected path");
      rec("the corpus probe is skipped only because the game is absent", true, "skipped");
    } else {
      const all = [];
      (function w(d) {
        let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) w(f); else all.push(f); }
      })(GAME_GFX);
      const reached = new Set(walkAsOldCapDid(GAME_GFX, OLD_CAP));
      const dropped = all.filter((f) => !reached.has(f));

      console.log("\n[the measurement] what the old cap could see of this install");
      console.log(`     gfx/ holds ${all.length} files; the 8,000 cap reached ${reached.size} (${(100 * reached.size / all.length).toFixed(1)}%)`);
      rec("the corpus really is bigger than the old cap", all.length > OLD_CAP * 2, all.length);
      rec("…so the old walk really did leave files unreachable", dropped.length > 10000, dropped.length);

      // ⭐ Pick the probe: an unreachable image file whose basename, minus its last character, makes a key
      // that (a) cannot be a declared sprite and (b) picks out THIS file and no other as the unique best
      // match across the whole corpus.
      const IMG = /\.(dds|tga|png)$/i;
      // Precomputed once — the same trick the fix applies to the index. Scoring the corpus per candidate
      // with path.basename/path.extname would make this derivation minutes long.
      const lowerAll = all.map((f) => f.toLowerCase());
      const basesAll = lowerAll.map((lp) => path.basename(lp, path.extname(lp)));

      // A key is usable only if it picks out ONE file across the whole corpus as the strict best match.
      function uniqueBestFor(f) {
        const base = path.basename(f, path.extname(f)).toLowerCase();
        if (base.length < 8 || !/^[a-z0-9_]+$/.test(base)) return null;
        const key = base.slice(0, -1);
        let best = -1, bestIdx = -1, ties = 0;
        for (let i = 0; i < lowerAll.length; i++) {
          const s = scoreWith(lowerAll[i], basesAll[i], key);
          if (s > best) { best = s; bestIdx = i; ties = 1; }
          else if (s === best) ties++;
        }
        if (ties !== 1 || best < 30) return null;
        if (path.resolve(all[bestIdx]).toLowerCase() !== path.resolve(f).toLowerCase()) return null;
        return key;
      }
      // ⚠️ Bounded. Each attempt scans the whole corpus, so an unbounded search over 22,421 dropped files
      // would be 682 million comparisons.
      const MAX_ATTEMPTS = 60;
      function pick(pool) {
        let tried = 0;
        for (const f of pool) {
          if (!IMG.test(f)) continue;
          if (++tried > MAX_ATTEMPTS) break;
          const key = uniqueBestFor(f);
          if (key) return { file: f, key };
        }
        return { file: "", key: "" };
      }

      // ⭐ The probe: an unreachable image whose truncated basename cannot be a declared sprite key, and
      // which no other file in the corpus outscores.
      const probe = pick(dropped);
      // ⚠️ If no probe can be derived, every check below would pass for the wrong reason.
      rec("a probe could be derived from the unreachable files", !!probe.file, "no unambiguous unreachable file found");
      console.log(`     probe: key "${probe.key}" must resolve to ${probe.file ? path.relative(GAME_GFX, probe.file) : "(none)"}`);

      // A CONTROL from the half the old walk DID reach — it must answer in both directions, which is what
      // separates "the index grew" from "the endpoint started working".
      const ctrl = pick(reached);
      rec("a control could be derived from the reachable files", !!ctrl.file, "no unambiguous reachable file found");
      console.log(`     control: key "${ctrl.key}" -> ${ctrl.file ? path.relative(GAME_GFX, ctrl.file) : "(none)"}`);
      const probeFile = probe.file, probeKey = probe.key, ctrlFile = ctrl.file, ctrlKey = ctrl.key;

      srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const ask = (key) => fetch(`http://127.0.0.1:${PORT}/api/ideas/sprite-url?key=${encodeURIComponent(key)}&modPath=${encodeURIComponent(MOD)}`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const resolved = async (key) => {
        const r = await ask(key);
        const url = String((r && r.url) || "");
        if (!url) return "";
        return decodeURIComponent(String(url.split("path=")[1] || ""));
      };
      const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

      console.log("\n[CONTROL] a file the old walk DID reach — must answer either way");
      {
        const got = await resolved(ctrlKey);
        console.log(`     -> ${got ? path.relative(GAME_GFX, got) : "(empty)"}`);
        rec("the reachable icon still resolves", same(got, ctrlFile), got || "(empty)");
      }

      console.log("\n[THE BUG] a file the old walk never reached");
      {
        const got = await resolved(probeKey);
        console.log(`     -> ${got ? path.relative(GAME_GFX, got) : "(empty)"}`);
        // Before the fix this returned url:"" — the art was on disk, in the game the mod loads, and Nova
        // reported it did not exist.
        rec("the unreachable icon now resolves", same(got, probeFile), got || "(empty)");
      }

      console.log("\n[cost] the index is queried per lookup, so covering more must not cost more");
      {
        const t0 = process.hrtime.bigint();
        await resolved(probeKey);
        const warm = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`     warm lookup over ${all.length}+ indexed files: ${warm.toFixed(1)}ms`);
        // Loose: this shares a machine with the rest of the suite. The point is that a corpus ~4x larger
        // does not make the lookup slower — precomputing the basename took scoring from 24.6ms to 1.5ms.
        rec("a warm lookup stays well under a second", warm < 900, warm);
        rec("…because the basename is precomputed once, not per candidate",
          /iconIndex\.bases\[i\]/.test(SV), "the caller derives the basename per file again");
      }

      console.log("\n[memory] the index must not keep a lowercased copy of every path");
      {
        // That array was 40MB of the 72MB this index holds with Millennium Dawn as the mod being edited,
        // and it existed for two `includes` checks that a candidate failing the basename test can never
        // need — the path terms alone top out at 20, below the 30 the search requires.
        rec("no lowercased-path array is stored", !/iconIndex\.lower\[/.test(SV), "the path array is back");
        rec("…and the skip is a filter over the same scorer, not a second scoring rule",
          /iconBasenameScore\(iconIndex\.bases\[i\], cleanKey\) === 0 && !iconIndex\.dottedDir\[i\]/.test(SV)
          && /scoreIconCandidateFast\(iconIndex\.files\[i\]\.toLowerCase\(\)/.test(SV),
          "the search no longer routes survivors through scoreIconCandidateFast");
      }

      console.log("\n[⭐ THE ONE EXCEPTION] a DIRECTORY named '<key>.something' scores 35 with no name match");
      {
        // This is the case that makes the lazy path exact rather than merely close. Vanilla has no dotted
        // directory in gfx/ at all (22 files of 210,493 across every installed mod, all inside a stray
        // ".mayaSwatches" folder), so the fixture has to build one — otherwise the flag would never be
        // exercised and dropping it would look safe.
        const dotDir = path.join(MOD, "gfx", "interface", "novadotkey.icons");
        fs.mkdirSync(dotDir, { recursive: true });
        const plain = path.join(dotDir, "unrelatedfilename.dds");
        fs.writeFileSync(plain, "x");
        const KEY = "novadotkey";
        // Brute force what the full scorer says, over the mod's own files plus the whole game corpus.
        const corpus = all.concat([plain]);
        let best = -1, bestIdx = -1;
        for (let i = 0; i < corpus.length; i++) {
          const s = score(corpus[i].toLowerCase(), KEY);
          if (s > best) { best = s; bestIdx = i; }
        }
        console.log(`     brute force says: ${best} -> ${bestIdx >= 0 ? path.basename(corpus[bestIdx]) : "(none)"}`);
        // 35 for the dotted directory + 20 for "interface" = 55, with a basename that matches nothing.
        rec("the fixture really does exercise the exception", best === 55 && corpus[bestIdx] === plain,
          { best, winner: bestIdx >= 0 ? corpus[bestIdx] : null });

        // ⚠️ A FRESH PROCESS, not a fresh createApp(). globalIconFileCacheMap is module-level, so a second
        // app in the same process shares the index built before this file existed — which is exactly what
        // happened on the first run of this check, and it read as a defect in the code under test.
        srv.closeAllConnections(); srv.close(); srv = null;
        const out = execFileSync(process.execPath,
          [path.join(__dirname, "testlib-icon-worker.js"), ROOT, MOD, KEY],
          { encoding: "utf8", timeout: 180000 });
        const line = out.split(/\r?\n/).find((l) => l.startsWith("RESULT:"));
        const got = line ? line.slice(7).trim() : "";
        console.log(`     the endpoint says: ${got || "(empty)"}`);
        rec("the lazy filter still finds it — the skip is exact, not approximate", same(got, plain), got || "(empty)");
        // …and that only means anything if the persisted index noticed the mod grew a gfx/ tree at all.
        rec("…which required the cache to notice a gfx root appearing where there was none",
          /sameRootSet\(cachedData\.dirs\)/.test(SV), "the root set is not checked");
      }
    }

    if (srv) { srv.closeAllConnections(); srv.close(); srv = null; }
    console.log(`\n=== icon search covers gfx: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
