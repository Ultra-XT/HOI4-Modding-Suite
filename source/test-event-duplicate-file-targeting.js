// #event-wrong-file-targeted — DELETE AND SAVE ACTED ON A DIFFERENT FILE FROM THE CARD THE USER CLICKED.
//
// The reported symptom was "deleting an event defined in two files removes only the first and reports
// success". The verifier sharpened it into something worse, and that sharper version is what this pins:
//
// The sidebar groups events BY FILE (renderEventsList), so a duplicated id shows as two cards under two
// folders — but Delete and Save sent only {modPath, eventId}, with no file identity, and the server resolved
// a single home file with findEventHomeFile, which returns the FIRST match in readdir order. Click the card
// under zzz_second.txt and Nova rewrote or deleted aaa_first.txt. Then the toast said "Deleted <id>."
// although a definition survived and the event still loaded in game.
//
// Deleting EVERY definition would be the wrong fix — the author may want the other copy — so the fix is
// honest targeting plus honest wording: act on the file that was named, and say which files still define it.
//
// A duplicate id is a broken-mod state to begin with, which is why this is low severity. It is still a case
// where Nova silently edits a file the user did not choose.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdup-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const MOD = path.join(ROOT, "evdupmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvDup"\nsupported_version="1.19.*"\n', "utf8");
const A = path.join(MOD, "events", "aaa_first.txt");
const B = path.join(MOD, "events", "zzz_second.txt");
const blockFor = (marker) => `add_namespace = nova_dx

country_event = {
\tid = nova_dx.1
\ttitle = nova_dx.1.t
\tdesc = nova_dx.1.d
\tis_triggered_only = yes
\t# marker ${marker}

\toption = {
\t\tname = nova_dx.1.a
\t\tadd_political_power = ${marker === "A" ? 1 : 2}
\t}
}
`;
fs.writeFileSync(A, blockFor("A"), "utf8");
fs.writeFileSync(B, blockFor("B"), "utf8");

const defines = (p) => /(^|\n)\s*id\s*=\s*nova_dx\.1\b/.test(fs.readFileSync(p, "utf8"));

const PORT = 43079;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const del = (body) => fetch(`http://127.0.0.1:${PORT}/api/events/delete-definition`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[control] the fixture really has the id in two files");
    rec("aaa_first.txt defines it", defines(A), "no");
    rec("zzz_second.txt defines it too", defines(B), "no");

    console.log("\n[the bug] deleting the card under zzz_second.txt must not touch aaa_first.txt");
    const r = await del({ eventId: "nova_dx.1", fileName: "zzz_second.txt" });
    rec("the delete succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it acted on the file that was named", r.b.deletedFromFile === "zzz_second.txt", r.b.deletedFromFile);
    rec("zzz_second.txt no longer defines it", !fs.existsSync(B) || !defines(B), "still there");
    // The heart of it: the file the user did NOT pick must be untouched.
    rec("aaa_first.txt is untouched", defines(A), "the wrong file was edited");
    rec("…and still carries its own marker", /# marker A/.test(fs.readFileSync(A, "utf8")), fs.readFileSync(A, "utf8").slice(0, 200));

    console.log("\n[honesty] the response must say the event still loads in game");
    rec("it names the surviving file", Array.isArray(r.b.remainingDefinitionFiles) &&
      r.b.remainingDefinitionFiles.includes("aaa_first.txt"), r.b.remainingDefinitionFiles);
    rec("…and warns in words, not just data",
      /still/i.test(String(r.b.refWarning || "")) && /aaa_first\.txt/.test(String(r.b.refWarning || "")),
      r.b.refWarning);

    console.log("\n[the ordinary case still reads plainly] no duplicate, no scary warning");
    const r2 = await del({ eventId: "nova_dx.1", fileName: "aaa_first.txt" });
    rec("the second delete succeeded", r2.s === 200 && !r2.b.error, r2.b || r2.s);
    rec("…and reports no survivors", Array.isArray(r2.b.remainingDefinitionFiles) &&
      r2.b.remainingDefinitionFiles.length === 0, r2.b.remainingDefinitionFiles);
    rec("…so the warning does not claim the event still loads",
      !/still be defined|STILL defined/i.test(String(r2.b.refWarning || "")), r2.b.refWarning);
    rec("the event is gone from the mod",
      (!fs.existsSync(A) || !defines(A)) && (!fs.existsSync(B) || !defines(B)), "still defined somewhere");

    console.log("\n[the client] the card's file must actually be sent");
    const ej = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
    rec("the editor remembers which file the card came from", /loadedEventFileName = evt\.fileName/.test(ej), "not tracked");
    rec("…and sends it with the delete", /fileName: loadedEventFileName/.test(ej), "not sent");
    rec("…and the toast names the file it acted on", /data\.deletedFromFile/.test(ej), "toast not updated");

    console.log(`\n=== event duplicate file targeting: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
