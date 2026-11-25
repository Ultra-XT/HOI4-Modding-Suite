// ⛔ #trailing-comment-runs — ONLY CODE ENDS A TAIL BLOCK. A BLANK LINE DOES NOT.
//
// `pdxTrailingCommentBlock` collects the notes written at the END of a block, which have no statement below
// them to lead. It stopped at the first blank line once it had picked anything — so a tail written as
// several runs came back as only the LAST one, and everything above the gap was deleted.
//
// Nobody separates a note from a note with anything but a blank line, and a modder parking disabled script
// at the end of a block writes it exactly that way. Road to 56's WUW_Germany.txt keeps a 60-line
// commented-out `effect_tooltip` at the end of an option, split into runs by blank lines: a no-edit round
// trip over that file dropped 31 of its lines. Millennium Dawn's BEL_organization.txt parks two
// `# add_trait = { … }` blocks the same way and was losing 32.
//
// ⚠️ …and the gaps have to come back too. A tail that returns as one solid run is a different thing from
// two, so the blank lines travel as "" entries and every caller emits them bare rather than as a line
// holding a tab.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53568;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tailrun-"));
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

// Three runs at the end of an option, and three at the end of the event itself — the two callers that keep
// a tail. The event's own tail is the one `#free-floating-comment-dropped` covers.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1
\ttitle = probe.1.t
\tdesc = probe.1.d
\tis_triggered_only = yes

\toption = {
\t\tname = probe.1.a
\t\tadd_political_power = 25

\t\t# run one, first line
\t\t# run one, second line

\t\t# run two, alone

\t\t# run three, first line
\t\t# run three, second line
\t}

\t# event tail run one

\t# event tail run two
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tailrun-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Tail Runs"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    const NOTES = ["# run one, first line", "# run one, second line", "# run two, alone",
      "# run three, first line", "# run three, second line", "# event tail run one", "# event tail run two"];

    const saveOnce = async () => {
      const j = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = (j.events || []).find((e) => String(e.fullId || "").endsWith("probe.1"));
      if (!evt) return { error: "not listed", evt: null };
      const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId));
      const r = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, namespace: idSplit[1], id: idSplit[2], type: evt.type || "country_event",
          title: evt.title || "", description: evt.description || "", picture: evt.picture || "",
          triggeredOnly: evt.triggeredOnly === "yes" ? "yes" : "no",
          hidden: evt.hidden === "yes" ? "yes" : "no",
          fireOnce: evt.fireOnce === "yes" ? "yes" : "no",
          major: evt.major === "yes" ? "yes" : "no",
          mtthDays: parseInt(evt.mtthDays, 10) || 0,
          trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
          timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
          options: (evt.options || []).map((o) => ({
            name: o.name || "", title: o.title || "", script: o.script || "",
            aiChance: (o.aiChance == null || o.aiChance === "") ? null : Number(o.aiChance),
            trigger: o.trigger || "",
          })),
        }),
      }).then((x) => x.json());
      return { r, evt };
    };

    console.log("1. The reader hands back every run, not just the last");
    const first = await saveOnce();
    rec("the event is listed and saved", first.evt && first.r && first.r.error === undefined,
      JSON.stringify(first.r || first).slice(0, 140));
    const script = String(((first.evt.options || [])[0] || {}).script || "");
    // ⚠️ CONTROL: the LAST run always survived — that is what made this look fine. The earlier runs are
    // the finding, so assert them separately from the one that never broke.
    rec("CONTROL: the last run was never the problem", script.includes("# run three, first line"), script);
    rec("⭐ the first run reaches the effects box", script.includes("# run one, first line"), script);
    rec("⭐ …both of its lines", script.includes("# run one, second line"), script);
    rec("⭐ …and the run between them", script.includes("# run two, alone"), script);

    console.log("\n2. …and the save writes them all back, once each");
    const after = fs.readFileSync(dest, "utf8");
    for (const n of NOTES) {
      const c = after.split(n).length - 1;
      rec(`⭐ "${n}" appears exactly once`, c === 1, `x${c}`);
    }
    rec("CONTROL: the effect above the tail is intact", /add_political_power = 25/.test(after), after);

    console.log("\n3. …keeping the gaps the author wrote  (three runs, not one block)");
    {
      // A tail that comes back as one solid run is a different thing from three. Count blank lines between
      // the first and last note of the option's tail.
      const seg = after.slice(after.indexOf("# run one, first line"), after.indexOf("# run three, second line"));
      const blanks = (seg.match(/\n[ \t]*\n/g) || []).length;
      rec("⭐ the two gaps between the three runs are still there", blanks === 2, `${blanks} blank lines`);
      rec("⭐ …and none of them is a line holding only a tab", !/\n[ \t]+\n/.test(seg),
        JSON.stringify(seg.slice(0, 200)));
    }

    console.log("\n4. …and repeating the save is stable");
    let prev = after;
    for (let pass = 2; pass <= 4; pass++) {
      const r = await saveOnce();
      rec(`save ${pass} accepted`, r.r && r.r.error === undefined, JSON.stringify(r.r || r).slice(0, 100));
      const t = fs.readFileSync(dest, "utf8");
      const bad = NOTES.map((n) => [n, t.split(n).length - 1]).filter(([, c]) => c !== 1);
      rec(`⭐ after save ${pass}: every note still exactly once`, bad.length === 0,
        bad.map(([n, c]) => `${n} x${c}`).join(" · "));
      if (pass === 4) rec("⭐ …and the file stopped changing", t === prev, "the file is still moving");
      prev = t;
    }

    console.log(`\n=== a tail of two comment runs survives: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
