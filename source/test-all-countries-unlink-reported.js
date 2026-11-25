// #all-countries-unlink-swallowed — A FAILED DELETE REPORTED AS A SUCCESSFUL REVOKE.
//
// An item granted to every country lives in Nova's own common/on_actions/zz_nova_all_countries.txt. Turning
// the LAST such grant off deletes that file. The delete was wrapped in `catch (_) {}`, so if it failed —
// HOI4 holding the file open, a read-only attribute, an antivirus lock — the handler still answered ok:true.
// The toggle flipped to "not granted" while the file went on handing the item to every country in the game:
// the exact opposite of what was asked for, invisible until the mod is played.
//
// The same swallowed unlink sat in the delete path, where it is worse still — the DELETED item keeps being
// granted to everyone, and the delete reports success.
//
// ⚠️ The WRITE branch was always fine: it is unguarded, so a failure there becomes a 400. Only the delete
// was silent, which is why the fix is narrow.
//
// noteRefWriteFailure feeds drainRefWriteWarning, the channel the shared write-note surface already drains
// from every JSON reply — so this needs no client change, and reaches the user even though events.js calls
// the endpoint inside its own catch and ignores the body.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-allc-"));
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
const MOD = path.join(ROOT, "allcmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "on_actions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AllCMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "allcmod.mod"), 'name="AllCMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "zz_nova.txt"),
  "ideas = {\n\tcountry = {\n\t\tnova_allc_spirit = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n\t}\n}\n");

const ALLC = path.join(MOD, "common", "on_actions", "zz_nova_all_countries.txt");
const PORT = 53191;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (body) => fetch(`http://127.0.0.1:${PORT}/api/history/set-startup-all`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[CONTROL] granting to every country writes Nova's file");
    {
      const r = await post({ itemId: "nova_allc_spirit", itemType: "spirit", active: true, modPath: MOD });
      rec("the grant succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);
      rec("…and the file exists", fs.existsSync(ALLC), ALLC);
      rec("…naming the spirit", /nova_allc_spirit/.test(fs.readFileSync(ALLC, "utf8")), fs.readFileSync(ALLC, "utf8").slice(0, 200));
      rec("…and nothing is warned about on the happy path",
        !String((r.body && r.body.refWarning) || "").trim(), r.body && r.body.refWarning);
    }

    console.log("\n[⭐ the defect] a delete that CANNOT happen must not report a revoke");
    {
      // ⚠️ THIS PLATFORM WILL NOT LET THE FAILURE BE STAGED. Making the unlink fail needs the file to be
      // undeletable: chmod 0o444 does not stop Node deleting it here (checked — the probe below), a
      // directory at that path makes the earlier readFileSync throw EISDIR and never reaches the unlink,
      // and there is no portable way to hold a mandatory lock from inside the test. So the swallowed-delete
      // itself is not exercised end to end.
      //
      // What IS checked behaviourally is the thing that made it invisible: the response never carried a
      // warning channel at all. `res.json({ ok: true })` had no refWarning key, so even when
      // noteRefWriteFailure recorded something there was nowhere for it to come out. That key's presence is
      // a real, observable difference, and the structural checks below pin both unlinks to the reporter.
      const probe = path.join(ROOT, "probe_ro.txt");
      let readOnlyHeld = false;
      try {
        fs.writeFileSync(probe, "x");
        fs.chmodSync(probe, 0o444);
        try { fs.unlinkSync(probe); readOnlyHeld = false; } catch (_) { readOnlyHeld = true; }
        try { fs.chmodSync(probe, 0o666); fs.unlinkSync(probe); } catch (_) {}
      } catch (_) {}
      console.log(`     read-only blocks unlink on this platform: ${readOnlyHeld} (informational)`);

      const r = await post({ itemId: "nova_allc_spirit", itemType: "spirit", active: true, modPath: MOD });
      console.log(`     response keys: ${Object.keys((r.body) || {}).join(", ")}`);
      // THE BUG'S ROOT: with no refWarning key, a recorded failure had no way out of the handler.
      rec("the response carries a warning channel at all",
        r.body && Object.prototype.hasOwnProperty.call(r.body, "refWarning"), Object.keys(r.body || {}));
    }

    console.log("\n[CONTROL] with the file writable, the revoke really does remove it");
    {
      const r = await post({ itemId: "nova_allc_spirit", itemType: "spirit", active: false, modPath: MOD });
      const w = String((r.body && r.body.refWarning) || "");
      console.log(`     revoke -> ok=${r.body && r.body.ok}  file exists=${fs.existsSync(ALLC)}  warning=${JSON.stringify(w.slice(0, 80))}`);
      rec("the revoke succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);
      rec("…the file is gone", !fs.existsSync(ALLC), ALLC);
      rec("…and nothing is warned about", !w.trim(), w);
    }

    console.log("\n[the sibling] the delete path's unlink is reported too");
    {
      // The same swallowed unlink existed in unwireStartupItemEverywhere, where a failure means the DELETED
      // item goes on being granted to every country.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const strays = (sv.match(/fs\.unlinkSync\(fp\); changed\+\+; \} catch \(_\) \{\}/g) || []).length;
      rec("the delete path no longer swallows it", strays === 0, strays + " swallowed unlinks remain");
      rec("…and reports through the shared channel",
        /fs\.unlinkSync\(fp\); changed\+\+; \} catch \(e\) \{ noteRefWriteFailure\(fp, e\); \}/.test(sv),
        "not routed to noteRefWriteFailure");
    }

    console.log("\n[the channel] refWarning is drained by the shared surface");
    {
      const lo = fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8");
      rec("the write-note surface still drains refWarning", /typeof body\.refWarning === "string"/.test(lo),
        "refWarning is no longer drained — this warning goes nowhere");
      // …which matters because events.js calls this endpoint inside its own catch and ignores the body.
      const ev = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
      rec("…and the caller does ignore the body, so the drain is what carries it",
        /set-startup-all/.test(ev), "caller not found");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== all countries unlink reported: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.chmodSync(ALLC, 0o666); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
