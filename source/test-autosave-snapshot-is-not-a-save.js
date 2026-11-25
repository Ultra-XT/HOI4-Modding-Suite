// #autosave-marks-clean-without-writing — AUTOSAVE SAID "AUTOSAVED", WROTE NOTHING, AND POISONED EVERY
// LATER SAVE.
//
// runAutosaveTick calls saveFileWithOptions({ fromAuto: true, snapshot: true }). On the server, `snapshot`
// redirects the write to <base>.focus_editor_temp and deliberately leaves the .txt alone — it is a
// crash-recovery copy, not a save.
//
// The client's success tail ran anyway. It set sourceText, moved loadedFingerprint ("this is the file on
// disk now", says its own comment), cleared dirty and wiped the undo history. So thirty seconds after
// switching Autosave on, the editor reported the work saved while the tree on disk was untouched, and the
// close-tab guard (`dirty && !saveInFlight`) stopped asking on quit.
//
// The second half is worse. server.js refuses a save whose baseFingerprint disagrees with the file on disk
// — the guard against another editor clobbering your work. Autosave had just moved loadedFingerprint to
// content that was never written, so the untouched .txt no longer matched and every later Save was refused:
//   "<file> changed on disk after you opened it — something else edited it. … Reload the tree to pick it up"
// Nothing else had touched the file, and following that advice discards the session.
//
// ⭐ THIS TEST DRIVES THE REAL ENDPOINT. The bug is a disagreement between what the server writes and what
// the client then believes, so the server half is exercised over HTTP with the exact payload
// public/app.js:14110-14118 sends, and the client half is asserted against app.js's source.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-autosnap-"));
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
const MOD = path.join(ROOT, "snapmod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SnapMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "snapmod.mod"), 'name="SnapMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const TREE = path.join(MOD, "common", "national_focus", "snap_tree.txt");
const ORIGINAL = "focus_tree = {\n\tid = snap_tree\n\tcountry = { factor = 1 }\n\tfocus = {\n\t\tid = snap_a\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n";
const EDITED = ORIGINAL.replace("x = 0", "x = 4");
fs.writeFileSync(TREE, ORIGINAL);
const TEMP = path.join(MOD, "common", "national_focus", "snap_tree.focus_editor_temp");

const PORT = 53271;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // The payload shape from public/app.js:14110-14118.
    const save = async (content, opts) => {
      await sleep(200); // /api/save rate-limits to one call per 120ms and answers 429 otherwise
      return post("/api/save", Object.assign({
        path: TREE, content,
        createBackup: !opts.snapshot,
        backupReason: opts.fromAuto ? "autosave" : "manual-save",
        snapshot: !!opts.snapshot,
      }, opts.baseFingerprint ? { baseFingerprint: opts.baseFingerprint } : {}));
    };

    const onDisk = () => { try { return fs.readFileSync(TREE, "utf8"); } catch (_) { return ""; } };

    console.log("\n[the mechanism] a snapshot writes the temp file and leaves the tree alone");
    {
      const r = await save(EDITED, { fromAuto: true, snapshot: true });
      console.log(`     snapshot save -> ${r.status}`);
      rec("the snapshot save succeeds", r.status < 400, r.body);
      // ⚠️ If the temp file is not written, the fixture is wrong and everything below is vacuous.
      rec("…the .focus_editor_temp file was written", fs.existsSync(TEMP), TEMP);
      rec("…and it holds the edited text", fs.existsSync(TEMP) && fs.readFileSync(TEMP, "utf8").includes("x = 4"), "temp does not hold the edit");
      // THE POINT: the tree itself is untouched. That is correct server behaviour, and exactly why the
      // client must not treat it as saved.
      rec("…while the tree on disk is UNCHANGED", onDisk() === ORIGINAL, onDisk().slice(0, 120));
    }

    console.log("\n[the poisoning] a later real save must not be refused by a conflict that never happened");
    {
      // This is what the buggy client did: after the snapshot it set loadedFingerprint from the text it had
      // just serialized, then sent that as baseFingerprint on the next real save.
      const { createApp: _c } = require("./server.js");
      void _c;
      const srvMod = require("./server.js");
      const fp = typeof srvMod.novaFileFingerprint === "function"
        ? srvMod.novaFileFingerprint
        : null;
      if (!fp) {
        console.log("     (novaFileFingerprint is not exported — asserting the server rule instead)");
        rec("the conflict check is scoped to non-snapshot saves",
          /if \(baseFp && !req\.body\.snapshot && fs\.existsSync\(targetPath\)\)/.test(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")),
          "the conflict guard changed shape");
      }
      // Drive it directly: a baseFingerprint describing content that was never written.
      const poisoned = await save(EDITED, { fromAuto: false, snapshot: false, baseFingerprint: "fingerprint-of-text-never-written" });
      console.log(`     real save with a stale baseFingerprint -> ${poisoned.status} ${(poisoned.body && poisoned.body.error || "").slice(0, 90)}`);
      // The server is RIGHT to refuse this — the guard works. The defect was the client feeding it a
      // fingerprint for content it had never written.
      rec("the server refuses a save whose baseFingerprint does not match disk", poisoned.status === 409, poisoned.body);
      rec("…and says nothing was written", onDisk() === ORIGINAL, onDisk().slice(0, 120));
    }

    console.log("\n[⭐ the fix] the client must not adopt a snapshot as the file on disk");
    {
      const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      // The guard must sit BEFORE the adopt-as-saved block, not after it.
      const guardAt = APP.indexOf("if (options.snapshot) {");
      const adoptAt = APP.indexOf("sourceText = rewritten;");
      const fpAt = APP.indexOf("loadedFingerprint = novaFileFingerprint(rewritten)");
      console.log(`     snapshot guard at ${guardAt}, adopt-as-saved at ${adoptAt}`);
      rec("a snapshot guard exists in the save tail", guardAt !== -1, "no guard");
      rec("…and it runs BEFORE the adopt-as-saved block", guardAt !== -1 && adoptAt !== -1 && guardAt < adoptAt, { guardAt, adoptAt });
      rec("…and before loadedFingerprint is moved", guardAt !== -1 && fpAt !== -1 && guardAt < fpAt, { guardAt, fpAt });
      rec("…and it returns rather than falling through", /if \(options\.snapshot\) \{[\s\S]{0,300}?return;/.test(APP), "no early return");
      rec("…and tells the modder the tree is still unsaved",
        /Recovery snapshot written[^"]*still unsaved/.test(APP), "the status line does not say so");
    }

    console.log("\n[CONTROL] a real save must still do everything it used to");
    {
      const r = await save(EDITED, { fromAuto: false, snapshot: false });
      console.log(`     real save -> ${r.status}`);
      rec("an ordinary save succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      rec("…and the tree on disk really changed", onDisk().includes("x = 4"), onDisk().slice(0, 140));
      // …and the autosave path itself must still work, or the fix broke the feature it was protecting.
      const again = await save(ORIGINAL, { fromAuto: true, snapshot: true });
      rec("a snapshot still writes its temp file after the fix", again.status < 400 && fs.existsSync(TEMP), again.body);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== autosave snapshot is not a save: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
