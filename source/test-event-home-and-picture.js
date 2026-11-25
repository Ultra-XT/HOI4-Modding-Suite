// Three findings recorded on 2026-08-02, still real on re-verification, fixed together because they share
// the event save/delete path.
//
// #event-home-nested-id — findEventHomeFile matched ANY own-line `id = <fullId>`, and an event's id sits on
// such a line every time another event FIRES it (`news_event = { id = bba_news.1 hours = 1 }`). So the home
// file resolved to the CALLER. A no-edit save then appended a full copy of the event into the caller's file
// while leaving the original in place — the mod defines it twice and load order decides. Measured: 40 of
// 6,941 vanilla ids and 12 of 9,340 MD ids resolved to a file that does not define them. The same cause made
// delete answer "isn't defined in <file>" for an event the list was showing.
//
// #event-loc-shared-key — deleting an event blind-deleted every `<id>.<suffix>` localisation key, and events
// share keys constantly: 1,568 references across 440 owner events in vanilla, 469 across 230 in MD. Deleting
// one event blanked the title, description or button of others that still existed. Now keys still referenced
// anywhere in the mod are KEPT, and the response says which and why. Fails SAFE — an orphaned key is inert
// clutter, a missing one is a blank button in game.
//
// #event-scripted-picture — `picture = [GetHitlerHandshakeEventPicture]` is a script call, not a sprite. The
// reader matched only a bare token or a texture block, so it read back "" and the writer stamped its default
// over it: a no-edit save replaced the script with GFX_report_event_001 and the picture stopped changing
// with the situation. 30 vanilla events use this form and 0 use the block form.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evhome-"));
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

const MOD = path.join(ROOT, "evhomemod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvHomeMod"\nsupported_version="1.19.*"\n', "utf8");

// CALLER file: fires probe.1 from inside its own event. The id appears on an own line here, but this file
// does not DEFINE probe.1 — which is exactly what the old regex could not tell apart.
fs.writeFileSync(path.join(MOD, "events", "aa_caller.txt"), [
  "add_namespace = caller",
  "",
  "country_event = {",
  "\tid = caller.1",
  "\ttitle = caller.1.t",
  "\tdesc = caller.1.d",
  "\tpicture = GFX_report_event_001",
  "\tis_triggered_only = yes",
  "\toption = {",
  "\t\tname = caller.1.a",
  // MULTI-LINE, because that is how vanilla writes a fire effect (BBA_Ethiopia.txt:6490) and it is what
  // makes the old bug reproduce: the id lands on its own line, which is exactly what the old line-regex
  // home lookup matched. Written inline the bug does not appear at all — a control caught this test
  // passing for the wrong reason.
  "\t\tnews_event = {",
  "\t\t\tid = probe.1",
  "\t\t\thours = 1",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// HOME file: actually defines probe.1, and probe.2 which shares probe.1's option key.
fs.writeFileSync(path.join(MOD, "events", "zz_home.txt"), [
  "add_namespace = probe",
  "",
  "news_event = {",
  "\tid = probe.1",
  "\ttitle = probe.1.t",
  "\tdesc = probe.1.d",
  "\tpicture = [GetHitlerHandshakeEventPicture]",
  "\tis_triggered_only = yes",
  "\toption = {",
  "\t\tname = probe.1.a",
  "\t}",
  "}",
  "",
  "country_event = {",
  "\tid = probe.2",
  "\ttitle = probe.1.t",
  "\tdesc = probe.2.d",
  "\tis_triggered_only = yes",
  "\toption = {",
  "\t\tname = probe.1.a",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(MOD, "localisation", "english", "custom_events_l_english.yml"),
  "﻿l_english:\n probe.1.t:0 \"Shared Title\"\n probe.1.d:0 \"Probe One\"\n probe.1.a:0 \"Shared Button\"\n probe.2.d:0 \"Probe Two\"\n caller.1.t:0 \"Caller\"\n", "utf8");

const ev = (f) => { try { return fs.readFileSync(path.join(MOD, "events", f), "utf8"); } catch (_) { return ""; } };
const locKeys = () => {
  let t = "";
  try { t = fs.readFileSync(path.join(MOD, "localisation", "english", "custom_events_l_english.yml"), "utf8"); } catch (_) {}
  // Skip the `l_english:` header — it matches the same shape as a key and would inflate every count.
  return (t.match(/^\s*([A-Za-z0-9_.]+):/gm) || [])
    .map((s) => s.trim().replace(/:$/, ""))
    .filter((k) => !/^l_[a-z_]+$/.test(k));
};
const count = (text, needle) => (text.split(needle).length - 1);

const PORT = 42501;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const list = async () => (await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`)).json();

  try {
    console.log("\n[1] the list finds the event in the file that DEFINES it");
    // Read the RAW shape first — this project has had three vacuous passes from asking the API for a key
    // it does not return. /api/events/list answers { events: [...] }, flat.
    const l = await list();
    const all = Array.isArray(l.events) ? l.events : [];
    const p1 = all.find((e) => e.fullId === "probe.1");
    rec("probe.1 is listed", !!p1, all.map((e) => e.fullId));
    rec("…and its scripted picture round-trips out of the reader",
      !!p1 && String(p1.picture || "") === "[GetHitlerHandshakeEventPicture]", p1 && p1.picture);

    console.log("\n[2] a no-edit save goes back to the DEFINING file, not the caller");
    const callerBefore = ev("aa_caller.txt");
    const r = await post("/api/events/save", {
      modPath: MOD, namespace: "probe", id: "1", type: "news_event",
      title: "", description: "", picture: "", triggeredOnly: true,
      options: [{ name: "probe.1.a", title: "", script: "" }],
      hidden: false, fireOnce: false, major: false, trigger: "", immediate: "", after: "",
    });
    rec("the save succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and landed in the defining file", /zz_home\.txt$/.test(String(r.b.eventPath || "")), r.b.eventPath);
    // THE DAMAGE: before the fix the caller's file grew a second full definition.
    rec("the caller's file was NOT appended to", ev("aa_caller.txt") === callerBefore,
      { before: callerBefore.length, after: ev("aa_caller.txt").length });
    rec("…and still fires probe.1 exactly once", count(ev("aa_caller.txt"), "id = probe.1") === 1, ev("aa_caller.txt"));
    rec("probe.1 is defined exactly once across the mod",
      count(ev("zz_home.txt"), "id = probe.1") === 1, ev("zz_home.txt"));

    console.log("\n[3] the scripted picture survives a save that carries no picture");
    // The picker cannot draw a [Get…] token, so the client legitimately sends "" — the server must not
    // stamp its default over the author's script.
    rec("the script call is still on disk",
      /picture\s*=\s*\[GetHitlerHandshakeEventPicture\]/.test(ev("zz_home.txt")), ev("zz_home.txt").slice(0, 400));
    rec("…and was NOT replaced by the default",
      !/picture\s*=\s*GFX_report_event_001/.test(ev("zz_home.txt").split("id = probe.2")[0]), ev("zz_home.txt").slice(0, 400));

    console.log("\n[4] deleting an event keeps localisation keys others still use");
    const before = locKeys();
    rec("all five keys start present", before.length === 5, before);
    const d = await post("/api/events/delete-definition", { modPath: MOD, eventId: "probe.1", fileName: "zz_home.txt" });
    rec("the delete succeeded", d.s === 200 && d.b && d.b.ok !== false, d.b || d.s);
    const after = locKeys();
    // probe.2 still exists and still points at probe.1.t and probe.1.a.
    rec("probe.1.t is KEPT — probe.2 still uses it", after.includes("probe.1.t"), after);
    rec("probe.1.a is KEPT — probe.2 still uses it", after.includes("probe.1.a"), after);
    rec("…and Nova says why", /still references/i.test(String(d.b.refWarning || "")), d.b.refWarning);
    // The control: a key nothing else uses IS removed, so this is not "keep everything".
    rec("probe.1.d is REMOVED — nothing else uses it", !after.includes("probe.1.d"), after);
    rec("unrelated keys are untouched", after.includes("probe.2.d") && after.includes("caller.1.t"), after);

    console.log(`\n=== event home and picture: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
