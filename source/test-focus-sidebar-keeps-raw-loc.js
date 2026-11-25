// #focus-sidebar-strips-loc-on-load — MOVING A FOCUS ERASED THE COLOUR AND SCOPE TOKENS FROM ITS NAME.
//
// The rule already exists in this codebase, written down in e2e-loc-token-name-roundtrip.js:
//
//   "DISPLAY must be readable … the EDIT BOX and the SAVED .yml must keep the RAW value, or an untouched
//    Save would write the stripped name over the author's token. That is the silent data loss this guards
//    against."
//
// That test covers three makers. The Focus Tree sidebar was not one of them and stripped on LOAD:
//
//   sbFocusNameEl.value = sanitizeLocalization(focus.name || locName || focus.id);
//   sbFocusDescEl.value = sanitizeLocalization(focus.desc || locDesc || "");
//
// The same boxes are read back on save, so nudging a focus's cost, icon or x/y rewrote its two localisation
// keys with the stripped text. Nothing warned; error.log stays quiet for this; the modder finds out in play
// when a title has lost its colour and "[ROOT.GetNameDefCap] declares war" reads " declares war".
//
// Measured over the installed corpora: 27,990 of vanilla's 129,087 English values (21.7%) and 24,634 of
// Millennium Dawn's 178,471 (13.8%) carry something that sanitiser removes.
//
// ⚠️ WHY e2e-loc-token-name-roundtrip.js DID NOT CATCH IT: it is an e2e-*.js, and run-tests.js runs
// test-*.js only. A rule policed by a suite that does not run on every change is a rule that decays — the
// same reason the CSP inline-handler rule decayed. This test lives in the suite that runs.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rawloc-"));
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

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const APP_CODE = stripJsComments(APP);

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "rawmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RawMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "rawmod.mod"), 'name="RawMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
const YML = path.join(MOD, "localisation", "english", "focus_l_english.yml");
// ⚠️ /api/localization/upsert refuses a file that does not exist ("Use create/import first"), so the
// fixture has to seed it — with the UTF-8 BOM and the l_english header a real file carries.
fs.writeFileSync(YML, "﻿l_english:\n NOVA_seed:0 \"Seed entry\"\n", "utf8");

const PORT = 53291;
(async () => {
  let srv = null;
  try {
    console.log("\n[⭐ THE INVARIANT] no editable box may be filled with a stripped value");
    {
      // Derived, not a line-number pin: any assignment of sanitizeLocalization(...) into an element's
      // .value is by definition an edit box being filled with display text, and that value flows back to
      // disk. A fourth box added tomorrow fails this the day it is written.
      const bad = [];
      const lines = APP_CODE.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (/\.value\s*=\s*sanitizeLocalization\s*\(/.test(lines[i])) bad.push(`app.js:${i + 1}  ${lines[i].trim().slice(0, 100)}`);
      }
      for (const b of bad) console.log(`     ${b}`);
      rec("no .value is assigned from sanitizeLocalization", bad.length === 0, bad);

      // …and the two boxes this fix is about hold the raw value.
      rec("the name box holds the raw value",
        /sbFocusNameEl\.value = focus\.name \|\| locName \|\| focus\.id;/.test(APP_CODE), "still sanitised");
      rec("the description box holds the raw value",
        /sbFocusDescEl\.value = focus\.desc \|\| locDesc \|\| "";/.test(APP_CODE), "still sanitised");
    }

    console.log("\n[CONTROL] display must still be readable — the fix must not leak codes onto the canvas");
    {
      // ⚠️ Without this, "stop stripping" could be satisfied by deleting the display path too, which is the
      // opposite mistake: raw §Y and [ROOT.GetX] on every node label.
      const n = (APP_CODE.match(/stripLocDisplayCodes\(/g) || []).length;
      console.log(`     stripLocDisplayCodes call sites: ${n}`);
      rec("display still runs through the display-only stripper", n >= 5, n);
      rec("…and the canvas node title uses it",
        /const title = stripLocDisplayCodes\(/.test(APP_CODE), "node titles no longer stripped for display");
    }

    console.log("\n[the round trip] a raw value must survive the endpoint the save posts to");
    {
      srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      // public/app.js:12670 posts { path, modPath, entries: { <id>: { name } } }
      const upsert = (id, name) => fetch(`http://127.0.0.1:${PORT}/api/localization/upsert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "localisation/english/focus_l_english.yml", modPath: MOD, entries: { [id]: { name } } }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

      const CASES = [
        ["NOVA_colour", "§YOperation Barbarossa§!"],
        ["NOVA_scope", "[ROOT.GetNameDefCap] declares war"],
        ["NOVA_digit", "§7Grey text§!"],
        ["NOVA_plain", "A plain name"],
      ];
      for (const [id, val] of CASES) {
        const r = await upsert(id, val);
        if (r.status >= 400) { rec(`${id} upsert succeeds`, false, r.body); continue; }
      }
      const written = fs.readFileSync(YML, "utf8");
      console.log("     file now contains:");
      written.split(/\r?\n/).filter((l) => l.includes("NOVA_")).forEach((l) => console.log("        " + l.trim().slice(0, 90)));
      // ⚠️ If nothing was written the checks below pass vacuously.
      rec("the upsert wrote the entries", /NOVA_colour/.test(written) && /NOVA_plain/.test(written), written.slice(0, 200));
      for (const [id, val] of CASES) {
        rec(`${id} kept its value byte for byte`, written.includes(val), { id, val, written: (written.split(/\r?\n/).find((l) => l.includes(id)) || "").trim() });
      }
    }

    console.log("\n[the sibling contract] the rule this sidebar failed to adopt is written down");
    {
      const P = path.join(__dirname, "e2e-loc-token-name-roundtrip.js");
      if (!fs.existsSync(P)) {
        rec("the sibling contract test still exists", false, "e2e-loc-token-name-roundtrip.js is gone");
      } else {
        const t = fs.readFileSync(P, "utf8");
        rec("the sibling contract test still exists", true, "");
        rec("…and states that the edit box keeps the RAW value", /EDIT BOX[\s\S]{0,200}RAW/i.test(t), "the contract wording changed");
      }
    }

    console.log("\n[the corpus] this is not an exotic shape");
    {
      const sanitize = (s) => s.replace(/§[A-Za-z!]/g, "").replace(/\[[A-Za-z0-9_.]+(\s+[A-Za-z0-9_.]+)*\]/g, "").trim();
      const dir = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/localisation/english";
      if (!fs.existsSync(dir)) {
        console.log("     SKIPPED — the game is not installed");
        rec("the corpus check is skipped only because the game is absent", true, "skipped");
      } else {
        const ENTRY = /^\s*([\p{L}\p{N}_.:-]+):\d*\s*"(.*)"\s*(?:#.*)?$/u;
        let total = 0, changed = 0;
        for (const f of fs.readdirSync(dir).filter((x) => /_l_english\.yml$/i.test(x))) {
          let t = "";
          try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
          for (const line of t.split(/\r?\n/)) {
            const m = ENTRY.exec(line);
            if (!m) continue;
            total++;
            if (sanitize(m[2]) !== m[2]) changed++;
          }
        }
        console.log(`     ${changed} of ${total} vanilla English values would be rewritten (${(100 * changed / Math.max(1, total)).toFixed(1)}%)`);
        rec("a large share of real localisation carries codes or tokens", changed > total * 0.1, { changed, total });
      }
    }

    if (srv) { srv.closeAllConnections(); srv.close(); srv = null; }
    console.log(`\n=== focus sidebar keeps raw loc: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
