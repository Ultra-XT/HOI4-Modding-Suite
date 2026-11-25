// #all-countries-rewrite-swallowed — A DELETED SPIRIT WENT ON BEING GRANTED TO EVERY COUNTRY.
//
// "Grant to all countries" writes common/on_actions/zz_nova_all_countries.txt, a Nova-owned file that hands
// the item to every country at game start. Deleting the item has to take it back out, and there are two
// outcomes: nothing is granted to everyone any more (unlink the file), or something still is (rewrite it).
//
// The UNLINK branch reports a failure through noteRefWriteFailure — that was #all-countries-unlink-swallowed.
// The REWRITE branch, four lines below it in the same function, sat inside the same outer `catch (_) {}` and
// reported nothing. So when the rewrite failed the delete still answered "Deleted <id>", the file still
// granted the deleted idea to every country, and HOI4 logs an unknown idea for all of them.
//
// ⭐ THE OUTCOME IS FORCED, NOT MOCKED. On Windows fs.unlinkSync opens with FILE_SHARE_DELETE, so neither
// the read-only attribute nor an open handle stops a delete — but safeModWrite is atomic (tmp file, then
// rename over the target), and a rename ONTO a read-only file fails with EPERM while leaving the file
// perfectly readable. That is exactly the state this branch needs: readable enough to parse, unwritable.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-allctry-"));
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
const MOD = path.join(ROOT, "allmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AllMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "allmod.mod"), 'name="AllMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const IDEA_REL = "nova_spirits.txt";
const IDEA_ABS = path.join(MOD, "common", "ideas", IDEA_REL);
const A = "nova_alpha_spirit";
const B = "nova_bravo_spirit";
function writeIdeas() {
  fs.writeFileSync(IDEA_ABS,
    "ideas = {\n\tcountry = {\n" +
    `\t\t${A} = {\n\t\t\tpicture = GFX_idea_generic\n\t\t\tallowed = { always = yes }\n\t\t\tmodifier = { political_power_gain = 0.05 }\n\t\t}\n` +
    `\t\t${B} = {\n\t\t\tpicture = GFX_idea_generic\n\t\t\tallowed = { always = yes }\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n` +
    "\t}\n}\n");
}
writeIdeas();
fs.writeFileSync(path.join(MOD, "localisation", "english", "allmod_l_english.yml"),
  "﻿l_english:\n " + A + ':0 "Alpha Spirit"\n ' + B + ':0 "Bravo Spirit"\n');

const ALL = path.join(MOD, "common", "on_actions", "zz_nova_all_countries.txt");

const PORT = 53247;
(async () => {
  let srv = null;
  try {
    const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("\n[the rule, in source] both outcomes of the unwire must report a failure");
    {
      rec("the unlink branch reports (the fix that came first)",
        /#all-countries-unlink-swallowed/.test(SV), "the earlier fix is gone");
      rec("the rewrite branch reports too", /#all-countries-rewrite-swallowed/.test(SV), "still swallowed");
      rec("…and the outer catch no longer discards its error",
        !/\}\s*\n\s*\} catch \(_\) \{\}\s*\n\s*\}\s*\n\s*return changed;/.test(SV), "the outer catch is still empty");
    }

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    // public/owner-bridge.js:96 posts { itemId, itemType, active, modPath }.
    const grant = (id) => post("/api/history/set-startup-all", { itemId: id, itemType: "spirit", active: true, modPath: MOD });
    // public/ideas.js:1908 posts { modPath, ideaId, targetRelativeFile }.
    const del = (id) => post("/api/ideas/delete-definition", { modPath: MOD, ideaId: id, targetRelativeFile: IDEA_REL });
    const allText = () => { try { return fs.readFileSync(ALL, "utf8"); } catch (_) { return ""; } };

    console.log("\n[fixture] grant both spirits to every country");
    {
      const ra = await grant(A);
      const rb = await grant(B);
      console.log(`     grants -> ${ra.status}, ${rb.status}`);
      const t = allText();
      // ⚠️ Without BOTH granted the delete takes the unlink branch instead, and the branch under test never
      // runs — the test would pass while measuring the fix that was already in place.
      rec("the all-countries file exists", !!t, ALL);
      rec("…and grants both spirits", t.includes(A) && t.includes(B), t.slice(0, 300));
    }

    console.log("\n[CONTROL] with the file writable, the rewrite works and reports nothing");
    {
      const r = await del(B);
      const warn = String((r.body && r.body.refWarning) || "");
      console.log(`     delete -> ${r.status}  refWarning: ${JSON.stringify(warn.slice(0, 120)) || '""'}`);
      rec("the delete succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      // ⭐ THE FILE MUST NOT BE MENTIONED AT ALL. This first failed against a DIFFERENT warning than the one
      // under test: the dangling-reference note fired before the unwire ran, so a delete that cleaned the
      // file perfectly still announced that the file "still mentions it" — and signed off with "Nova has not
      // changed those files" a moment before Nova changed it. #dangling-note-fires-before-the-cleanup
      rec("…with nothing reported about the file it just cleaned", !/zz_nova_all_countries/.test(warn), warn);
      const t = allText();
      rec("…and the deleted spirit is out of the file", !t.includes(B), t.slice(0, 300));
      rec("…while the other one is still granted", t.includes(A), t.slice(0, 300));
    }

    console.log("\n[THE BUG] the same rewrite, when it cannot be written");
    {
      writeIdeas();                       // put B back
      const rb = await grant(B);
      rec("both are granted again", allText().includes(B) && allText().includes(A), { status: rb.status });

      // Atomic write = tmp file then rename over the target. A rename ONTO a read-only file is EPERM, and
      // the file stays readable — so the branch parses the file, decides to rewrite, and fails.
      fs.chmodSync(ALL, 0o444);
      const before = allText();

      const r = await del(B);
      const warn = String((r.body && r.body.refWarning) || "");
      console.log(`     delete -> ${r.status}  refWarning: ${JSON.stringify(warn.slice(0, 160)) || '""'}`);
      const after = allText();
      // The measurement that makes this meaningful: the file really did not change.
      rec("the write really did fail — the file is unchanged", after === before && after.includes(B),
        { changed: after !== before, stillGrantsB: after.includes(B) });
      // Before the fix: refWarning was empty and the user was told the spirit was deleted.
      rec("the failure is reported to the user", /zz_nova_all_countries/.test(warn), warn || "(silent)");
      // ⭐ AND IT MUST BE THE WRITE-FAILURE MESSAGE, NOT THE DANGLING-REFERENCE ONE. Backing the fix out
      // left this section passing on the strength of the note that now runs at the end of the unwire — but
      // that note calls the leftover harmless ("does nothing in game … Nova has not changed those files"),
      // while this was a WRITE THAT FAILED and the remedy is to close the game and try again. Only
      // noteRefWriteFailure says "could not be updated".
      rec("…as a write failure, not merely a leftover reference", /could not be updated/.test(warn), warn);
      // #ref-write-warning-says-rename-on-a-delete — this channel began on the rename path and its message
      // said so. With 11 call sites, the delete paths included, it told a modder who deleted a spirit that
      // "the rename itself was saved … save again to finish the rename", about a rename they never did.
      rec("…and does not describe it as a rename the user never performed",
        !/rename/i.test(warn), warn);

      fs.chmodSync(ALL, 0o666);
    }

    console.log("\n[after the obstruction clears] the stale grant can be cleaned up");
    {
      // ⚠️ NOT a bare retry. The failed delete had already removed the DEFINITION, so deleting the same id
      // again answers 400 "not found" and never reaches the unwire at all — which is precisely why the
      // warning above has to name the file: without it the modder has no way to learn that every country in
      // their game is still being handed an idea that no longer exists.
      const bare = await del(B);
      console.log(`     deleting an already-deleted id -> ${bare.status}`);
      rec("a plain retry cannot help — the definition is already gone", bare.status >= 400, bare.body);
      rec("…so the stale grant is still there", allText().includes(B), allText().slice(0, 200));

      // The recovery the warning points at: the definition exists again, so the unwire can run.
      writeIdeas();
      const r = await del(B);
      const t = allText();
      console.log(`     delete after restoring the definition -> ${r.status}; file still grants B: ${t.includes(B)}`);
      rec("the grant is removed once the unwire can run", !t.includes(B), t.slice(0, 300));
      rec("…and the other spirit is left alone", t.includes(A), t.slice(0, 300));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== all-countries rewrite reported: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.chmodSync(ALL, 0o666); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
