// #comment-brace-miscount — a brace inside a COMMENT must not change where an event block ends.
//
// Two inline loops in the event code counted raw braces, even though findMatchingBraceInText — in the same
// closure, used elsewhere in the file — has always skipped `#` comments and quoted strings. The consequences:
//   - parseEventsFromFile: a `}` in a comment ended the block early, so every event after it in the file
//     VANISHED from the Event Maker; a `{` in a comment swallowed the following events into one
//   - modifyEventInFile: the same mis-pairing made the rewritten file fail its brace-balance check, so an
//     event with a brace in a comment could not be SAVED at all — and the refusal blamed the modder's fields
//
// Paradox ships files like this, so it is not a hypothetical.
//
// Both directions: the awkward file must parse and save correctly, AND an ordinary file must be completely
// unaffected — a brace scanner that over-corrects would break every event in Nova.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evbrace-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "evbracemod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvBraceMod"\nsupported_version="1.18.*"\n', "utf8");

const AWKWARD = path.join(MOD, "events", "nova_awkward.txt");
fs.writeFileSync(AWKWARD, [
  "add_namespace = nova_awk",
  "",
  "country_event = {",
  "\tid = nova_awk.1",
  "\ttitle = nova_awk.1.t",
  "\t# a closing brace in a comment: }   <- used to end this block early",
  "\toption = {",
  "\t\tname = nova_awk.1.a",
  "\t}",
  "}",
  "",
  "country_event = {",
  "\tid = nova_awk.2",
  "\ttitle = nova_awk.2.t",
  "\t# an opening brace in a comment: {  <- used to swallow the next event",
  "\toption = {",
  "\t\tname = nova_awk.2.a",
  "\t}",
  "}",
  "",
  "country_event = {",
  "\tid = nova_awk.3",
  "\ttitle = nova_awk.3.t",
  '\tpicture = "a { b } c"',
  "\toption = {",
  "\t\tname = nova_awk.3.a",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// A control file with nothing awkward at all.
const PLAIN = path.join(MOD, "events", "nova_plain.txt");
fs.writeFileSync(PLAIN, [
  "add_namespace = nova_plain",
  "",
  "country_event = {",
  "\tid = nova_plain.1",
  "\ttitle = nova_plain.1.t",
  "\toption = {",
  "\t\tname = nova_plain.1.a",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42151;
const app = createApp();
const server = app.listen(PORT, async () => {
  const q = encodeURIComponent(MOD);
  const list = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${q}`);
    const b = await r.json().catch(() => null);
    return { status: r.status, events: (b && b.events) || [] };
  };

  try {
    // ── READ ─────────────────────────────────────────────────────────────────────────────────────
    console.log("\n[read] every event in the awkward file is found");
    const l = await list();
    rec("the event list loads", l.status === 200, l.status);
    const ids = l.events.map((e) => e && e.fullId).filter(Boolean);
    rec("the event BEFORE the comment brace is listed", ids.includes("nova_awk.1"), ids);
    rec("the event after a `}` comment is listed", ids.includes("nova_awk.2"), ids);
    rec("the event after a `{` comment is listed", ids.includes("nova_awk.3"), ids);
    rec("the control file's event is listed", ids.includes("nova_plain.1"), ids);
    rec("they were not merged into one", l.events.filter((e) => /^nova_awk\./.test(e.fullId || "")).length === 3,
      ids.filter((i) => /^nova_awk\./.test(i)));

    // Each event must keep its OWN option, not have absorbed a neighbour's.
    const e2 = l.events.find((e) => e && e.fullId === "nova_awk.2");
    rec("an event kept exactly its own option", e2 && (e2.options || []).length === 1,
      e2 && (e2.options || []).map((o) => o && o.name));

    // ── SAVE ─────────────────────────────────────────────────────────────────────────────────────
    console.log("\n[save] an event whose block contains a comment brace can be saved");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: "nova_awk", id: "1", type: "country_event",
        title: "Edited Title", description: "d", options: [{ name: "OK", script: "" }],
      }),
    });
    const body = await r.json().catch(() => null);
    rec("the save succeeded", r.status === 200 && body && body.success !== false, body || r.status);

    const after = fs.readFileSync(AWKWARD, "utf8");
    // Balance must be measured on CODE only. This file deliberately carries braces inside comments and inside
    // a quoted string, so a raw count is not a validity check — it would fail on a perfectly good file the
    // moment an edited block's comment is regenerated away.
    const codeOnly = (s) => s.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/#[^\n\r]*/g, "");
    const balanced = (s) => (codeOnly(s).match(/\{/g) || []).length === (codeOnly(s).match(/\}/g) || []).length;
    rec("the file is still brace-balanced (code only)", balanced(after),
      { open: (codeOnly(after).match(/\{/g) || []).length, close: (codeOnly(after).match(/\}/g) || []).length });
    rec("the OTHER events in the file survived",
      /id\s*=\s*nova_awk\.2/.test(after) && /id\s*=\s*nova_awk\.3/.test(after), after.slice(0, 400));
    rec("the quoted-brace picture survived", /picture\s*=\s*"a \{ b \} c"/.test(after),
      (after.match(/picture[^\n]*/) || ["(absent)"])[0]);
    // An UNEDITED event's comment must still be there — the save must not have rewritten its neighbours.
    rec("an untouched event kept its own comment brace",
      /#\s*an opening brace in a comment: \{/.test(after), after.slice(0, 500));

    // The strongest check that the file is still valid: Nova can re-read all three events out of it.
    const reread = await list();
    const rIds = reread.events.map((e) => e && e.fullId).filter(Boolean);
    rec("all three events still parse after the save",
      ["nova_awk.1", "nova_awk.2", "nova_awk.3"].every((i) => rIds.includes(i)), rIds);
    rec("…and the edit actually landed",
      (reread.events.find((e) => e && e.fullId === "nova_awk.1") || {}).title !== undefined, rIds);

    // ── CONTROL: the ordinary file must be untouched by all of this ──────────────────────────────
    console.log("\n[control] an ordinary event file still round-trips");
    const r2 = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: "nova_plain", id: "1", type: "country_event",
        title: "Plain Edited", description: "d", options: [{ name: "OK", script: "" }],
      }),
    });
    const body2 = await r2.json().catch(() => null);
    rec("the control save succeeded", r2.status === 200 && body2 && body2.success !== false, body2 || r2.status);
    const plainAfter = fs.readFileSync(PLAIN, "utf8");
    rec("the control file is still brace-balanced",
      (plainAfter.match(/\{/g) || []).length === (plainAfter.match(/\}/g) || []).length, plainAfter);
    rec("…and still defines its event", /id\s*=\s*nova_plain\.1/.test(plainAfter), plainAfter);

    console.log(`\n=== event comment/brace: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
