// #idea-duplicate-loc-key-unreported + #starter-tree-notes-dropped — TWO ENDPOINTS WHOSE NOTES ONE CALLER
// SHOWS AND ITS SIBLING THROWS AWAY.
//
// (1) /api/ideas/upsert-definition returns localizationNameKeyDuplicates: every English .yml that defines
// this id's name key. More than one means HOI4 takes whichever loads last, so the name the author just
// typed may never appear in game and nothing explains why. app.js's national-spirit maker has appended that
// to its status line for a long time. public/ideas.js — the dedicated Ideas page, the one people actually
// use for spirits — printed "Successfully saved" and dropped it.
//
// (2) /api/mod/copy-generic-focus-tree returns two notes:
//   idNote     — the copied tree's ids were REWRITTEN because they clashed with something already in the
//                mod. HOI4 keys focuses globally; without the rewrite it would drop every focus in one of
//                the two trees. The author's ids are not what the source file said.
//   shadowNote — the copied file's NAME shadows a base-game or base-mod file at the same relative path, so
//                the game loads this copy INSTEAD of the original and the upstream tree silently freezes.
// The toolbar's copy button alerts both. The "Create a starter tree" button on an empty Focus Tree page —
// the front door a new user is most likely to arrive through — read neither.
//
// ⚠️ WHY THESE ARE READ PER-PAGE AND NOT DRAINED GLOBALLY. The shared write-note surface claims a field name
// across the whole API, and app.js ALREADY shows both of these. Draining them would print the same warning
// twice on that page — exactly the collision the generic `note` field caused (#army-save-notes-invisible).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-notes2-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "notesmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NotesMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "notesmod.mod"), 'name="NotesMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// The SAME name key in two English files — the condition the warning exists for.
for (const n of ["aa_one", "zz_two"]) {
  fs.writeFileSync(path.join(MOD, "localisation", "english", `${n}_l_english.yml`),
    `﻿l_english:\n nova_dupe_spirit:0 "From ${n}"\n`, "utf8");
}

const PORT = 53205;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("\n[the server] really does report the duplicate");
    {
      const j = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: MOD, ideaId: "nova_dupe_spirit", targetRelativeFile: "common/ideas/zz_nova.txt",
          targetLocalizationPath: "localisation/english/aa_one_l_english.yml",
          name: "Dupe", desc: "", picture: "generic_morale_bonus",
          modifiers: [{ key: "political_power_gain", value: 0.1 }],
        }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const dupes = (j && j.localizationNameKeyDuplicates) || [];
      console.log(`     localizationNameKeyDuplicates: ${JSON.stringify(dupes)}`);
      // ⚠️ If the server stops reporting it, the client checks below are guarding nothing.
      rec("the save succeeds", j && !j.error, j);
      rec("…and names both files defining the key", dupes.length === 2, dupes);
    }

    console.log("\n[the ideas page] must show what its sibling shows");
    {
      const IJ = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8"));
      // THE BUG: the save path printed "Successfully saved" and read nothing else.
      rec("ideas.js reads the duplicate list", /localizationNameKeyDuplicates/.test(IJ), "still dropped");
      rec("…and puts it in front of the user", /HOI4 takes whichever loads last|Remove the duplicates/.test(IJ), IJ.slice(0, 0) || "not surfaced");
      // …and only when there IS a duplicate. One file defining a key is the normal case and must be silent.
      rec("…only when more than one file defines it", /dupes\.length > 1/.test(IJ), "fires on the ordinary single-file case");
      // the sibling that already did it
      const AJ = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
      rec("the sibling in app.js still shows it too", /localizationNameKeyDuplicates/.test(AJ), "the pattern was removed there");
    }

    console.log("\n[the starter-tree button] must show what the toolbar button shows");
    {
      const AJ = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
      // Both callers of the endpoint, found by reading rather than by line number.
      // ⚠️ A FIXED WINDOW, NOT A LAZY MATCH TO `} catch`. A first version used
      // /copy-generic-focus-tree[\s\S]{0,1800}?\}\s*catch/, whose non-greedy tail stops at the FIRST
      // `} catch` — which in both callers sits before the notes are read — so it reported shadowNote as
      // missing from code that plainly has it. Take a plain slice after each call site instead.
      const callers = [];
      {
        let from = 0;
        for (;;) {
          const at = AJ.indexOf("copy-generic-focus-tree", from);
          if (at === -1) break;
          callers.push(AJ.slice(at, at + 2500));
          from = at + 20;
        }
      }
      console.log(`     copy-generic-focus-tree call sites: ${callers.length}`);
      rec("both call sites are findable", callers.length >= 2, callers.length);
      const withIdNote = callers.filter((c) => /data\.idNote/.test(c)).length;
      const withShadow = callers.filter((c) => /data\.shadowNote/.test(c)).length;
      console.log(`     showing idNote: ${withIdNote}   showing shadowNote: ${withShadow}`);
      // THE BUG: one of the two showed neither.
      rec("every caller surfaces idNote", withIdNote === callers.length, { withIdNote, callers: callers.length });
      rec("…and shadowNote", withShadow === callers.length, { withShadow, callers: callers.length });
    }

    console.log("\n[⭐ NOT DRAINED] these must stay page-owned, or app.js shows them twice");
    {
      // The write-note surface drains a fixed set of field names from EVERY json reply. Adding either of
      // these to it would double up on the page that already reads them — the `note` collision, again.
      const LO = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8"));
      const drained = [...LO.matchAll(/typeof body\.([A-Za-z_$][\w$]*) === "string"/g)].map((m) => m[1]);
      console.log(`     the surface drains: ${drained.join(", ")}`);
      rec("idNote is not globally drained", !drained.includes("idNote"), drained);
      rec("…nor shadowNote", !drained.includes("shadowNote"), drained);
      rec("…nor the duplicate list", !drained.includes("localizationNameKeyDuplicates"), drained);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== notes reach both callers: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
