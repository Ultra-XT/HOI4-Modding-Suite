// ⛔ #detached-comment-above-an-option-dropped — A BLANK LINE BETWEEN A NOTE AND THE OPTION IT SAT ABOVE
// DELETED THE NOTE.
//
// extractPreservedEventBody captures a comment above each of an event's keys two ways: the ATTACHED note
// (leadComment) and the DETACHED block above it, kept apart so the writer can put the blank line back
// (#free-floating-comment-dropped). Both the capture and the re-injection excluded `option`, because options
// are matched by NAME rather than position — but the attached note above an option IS carried that way, via
// optionComments. Only the detached one fell between the two and was deleted on every save.
//
// Isolated by holding everything else still: the same comment, one blank line away from the same key.
//
//     attached to option (no gap)   KEPT
//     DETACHED by a blank line      LOST
//     prose, attached               KEPT
//     prose, DETACHED               LOST
//
// So it is not about what the comment SAYS. Prose and a commented-out setting go alike — and the setting
// matters more: vanilla's own LAR_TestEvents.txt parks `#major = yes` exactly this way, and losing it loses
// the modder's ability to switch it back on. 2,783 commented-out settings sit inside event blocks across the
// install and the installed mods, 258 of them in vanilla.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53544;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdetach-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// gapAfter = a blank line BETWEEN the comment and the key below it — the shape vanilla writes.
const fixture = (comment, gapAfter) => `add_namespace = lar_test

operative_leader_event = {
\tid = lar_test.1
\ttitle = lar_test.1.t
\tdesc = lar_test.1.d

\tis_triggered_only = yes

\t${comment}
${gapAfter ? "\n" : ""}\toption = {
\t\tname = lar_test.1.a
\t\tharm_operative_leader = 12
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const roundTrip = async (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdetach-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Detach"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = (list.events || [])[0];
      if (!evt) return { after: text, evt: null };
      // Exactly what public/events.js sends — no more, no less.
      const body = {
        modPath: mod, namespace: "lar_test", id: "1", type: evt.type || "country_event",
        title: (evt.title || "").trim(), description: (evt.description || "").trim(),
        picture: (evt.picture || "").trim(),
        triggeredOnly: evt.triggeredOnly === "yes" ? "yes" : "no",
        hidden: evt.hidden === "yes" ? "yes" : "no",
        fireOnce: evt.fireOnce === "yes" ? "yes" : "no",
        major: evt.major === "yes" ? "yes" : "no",
        mtthDays: parseInt(evt.mtthDays, 10) || 0,
        trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
        timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
        options: (evt.options || []).map((o) => ({
          name: String(o.name || "").trim(), title: String(o.title || "").trim(),
          script: String(o.script || "").trim(), aiChance: null, trigger: "",
        })),
      };
      const res = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => r.json());
      return { after: fs.readFileSync(dest, "utf8"), evt, error: res && res.error };
    };

    console.log("1. The four cases, one variable apart");
    for (const [label, comment, gap] of [
      ["a note ATTACHED above the option", "#major = yes", false],
      ["…and DETACHED by a blank line", "#major = yes", true],
      ["prose ATTACHED", "#just a note", false],
      ["…and prose DETACHED", "#just a note", true],
    ]) {
      const { after, error } = await roundTrip(fixture(comment, gap));
      rec(label, after.includes(comment), error ? `save error: ${String(error).slice(0, 60)}` : after.slice(0, 140));
    }

    console.log("\n2. …and it goes back DETACHED, not turned into a caption");
    {
      const { after } = await roundTrip(fixture("#major = yes", true));
      // The blank line is what distinguishes "a note about the event" from "a caption for this option".
      rec("the blank line between the note and the option is restored",
        /#major = yes\s*\n\s*\n\s*option\s*=/.test(after), after.slice(0, 200));
      rec("…and the note appears exactly once", (after.match(/#major = yes/g) || []).length === 1,
        (after.match(/#major = yes/g) || []).length + " occurrences");
    }

    console.log("\n3. The attached note is still attached (no blank line invented)");
    {
      const { after } = await roundTrip(fixture("#major = yes", false));
      rec("an attached note stays attached", /#major = yes\s*\n\s*option\s*=/.test(after), after.slice(0, 200));
      rec("…and is not duplicated", (after.match(/#major = yes/g) || []).length === 1,
        (after.match(/#major = yes/g) || []).length + " occurrences");
    }

    console.log("\n4. Measured on the real file that exposed it");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/LAR_TestEvents.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's LAR_TestEvents.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      rec("it parks a setting behind a detached comment", /#major = yes/.test(original) && /#major = yes\s*\n\s*\n\s*option/.test(original));
      const { after } = await roundTrip(original);
      rec("⭐ a no-edit save keeps it", after.includes("#major = yes"), after.slice(0, 220));
      // The whole file should come back unchanged — this one is small enough to demand that outright.
      const norm = (t) => t.replace(/^\uFEFF/, "").replace(/\r/g, "").replace(/\s+$/, "");
      rec("⭐ …and the file round-trips byte-identically", norm(after) === norm(original),
        norm(after) === norm(original) ? "identical" : after.slice(0, 200));
    }

    console.log(`\n=== a detached note above an option survives: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
