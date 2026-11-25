// #comments-above-title-desc-mtth-dropped — the days-only `mean_time_to_happen` block.
//
// A `mean_time_to_happen` carrying anything more than `days` (a modifier) is preserved VERBATIM, because
// the maker cannot model it. A days-only one is the opposite: the maker HAS a field for it, so the block is
// thrown away and rebuilt from the number — and everything the author wrote inside went with it.
//
// 2,610 days-only blocks across the install and every installed mod; 46 of them carry a comment, 7 in
// vanilla. They are not decoration:
//
//     vanilla/AAT_Sweden.txt        #For testing / #days = 3   above the real value
//     vanilla/MTG_Netherlands.txt   days = 1460  # Died in 1941
//     vanilla/Spain.txt             days = 151   # Historical outbreak time after elections
//
// `#days = 3` is a commented-out alternative the author is holding on to, and the other two are the reason
// the number is what it is. Rebuilding the block from the field is right; dropping the notes is not.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53567;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mtthc-"));
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

// Every placement a note can take inside the block: above the value, trailing it, and written last.
// probe.2 is the control — a RICH mtth, which takes the other path entirely and must keep working.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1
\ttitle = probe.1.t
\tdesc = probe.1.d

\tmean_time_to_happen = {
\t\t#For testing
\t\t#days = 3
\t\tdays = 1460\t# Died in 1941
\t\t# and nothing below me
\t}

\toption = {
\t\tname = probe.1.a
\t}
}

country_event = {
\tid = probe.2
\ttitle = probe.2.t
\tdesc = probe.2.d

\tmean_time_to_happen = {
\t\tdays = 30\t# the rich one
\t\tmodifier = {
\t\t\tfactor = 0.5
\t\t\thas_war = yes
\t\t}
\t}

\toption = {
\t\tname = probe.2.a
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mtthc-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Mtth Notes"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    const saveAll = async () => {
      const j = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const out = [];
      for (const evt of (j.events || [])) {
        const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
        if (!idSplit) continue;
        const body = {
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
        };
        out.push(await fetch(`${BASE}/api/events/save`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then((x) => x.json()));
      }
      return { results: out, after: fs.readFileSync(dest, "utf8") };
    };

    console.log("1. A no-edit save keeps every note in the block");
    const { results, after } = await saveAll();
    rec("both events saved", results.every((r) => r && r.error === undefined), JSON.stringify(results).slice(0, 160));
    // ⚠️ CONTROL: the reader really did model the value — otherwise the block is being preserved verbatim
    // and this test proves nothing about the rebuild path it exists to cover.
    rec("CONTROL: the days-only block was REBUILT, not preserved verbatim",
      /days = 1460/.test(after) && !/days = 1460\s*\n\s*#For testing/.test(after), after.slice(0, 400));
    for (const note of ["#For testing", "#days = 3", "# Died in 1941", "# and nothing below me"]) {
      rec(`⭐ "${note}" survives`, after.includes(note), after.slice(0, 500));
    }
    rec("⭐ …and the value itself is unchanged", /days = 1460/.test(after), after.slice(0, 400));
    // Placement, not just presence — a note re-attached to the wrong line still says something false.
    rec("⭐ the note the author put ON the days line is back on it",
      /days = 1460[ \t]+# Died in 1941/.test(after), after.slice(0, 500));
    rec("⭐ …and the two above it are still above it",
      /#For testing[\s\S]{0,40}#days = 3[\s\S]{0,40}days = 1460/.test(after), after.slice(0, 500));

    console.log("\n2. CONTROL: the rich block still takes the other path");
    rec("the modifier survives", /factor = 0\.5/.test(after) && /has_war = yes/.test(after), after);
    rec("…and its own note", after.includes("# the rich one"), after);
    rec("…and there is exactly one mtth per event",
      (after.match(/mean_time_to_happen/g) || []).length === 2, (after.match(/mean_time_to_happen/g) || []).length);

    console.log("\n3. …and repeating the save neither loses nor multiplies them");
    let prev = after;
    for (let pass = 2; pass <= 4; pass++) {
      const r = await saveAll();
      rec(`save ${pass} accepted`, r.results.every((x) => x && x.error === undefined), "");
      const counts = ["#For testing", "#days = 3", "# Died in 1941", "# and nothing below me", "# the rich one"]
        .map((n) => [n, r.after.split(n).length - 1]).filter(([, c]) => c !== 1);
      rec(`⭐ after save ${pass}: every note is still exactly once`, counts.length === 0,
        counts.map(([n, c]) => `${n} x${c}`).join(" · "));
      if (pass === 4) rec("⭐ …and the file stopped changing", r.after === prev, "the file is still moving");
      prev = r.after;
    }

    console.log("\n4. CONTROL: the block really is REBUILT — change the number and the notes come with it");
    {
      // ⚠️ Section 1's control was weak: a block preserved verbatim would have passed it too, and then this
      // whole file would be testing the wrong path. Editing the value is decisive — only the rebuild path
      // can produce a different number, and the notes have to survive that, not just a no-op save.
      const j = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = (j.events || []).find((e) => String(e.fullId || "").endsWith("probe.1"));
      rec("probe.1 is listed", !!evt, (j.events || []).map((e) => e.fullId).join(" "));
      rec("CONTROL: the maker models its MTTH days", parseInt(evt.mtthDays, 10) === 1460, evt.mtthDays);
      const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId));
      const r = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, namespace: idSplit[1], id: idSplit[2], type: evt.type || "country_event",
          title: evt.title || "", description: evt.description || "", picture: evt.picture || "",
          triggeredOnly: "no", hidden: "no", fireOnce: "no", major: "no",
          mtthDays: 900,
          trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
          timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
          options: (evt.options || []).map((o) => ({
            name: o.name || "", title: o.title || "", script: o.script || "",
            aiChance: (o.aiChance == null || o.aiChance === "") ? null : Number(o.aiChance),
            trigger: o.trigger || "",
          })),
        }),
      }).then((x) => x.json());
      rec("the edit is accepted", !!r && r.error === undefined, JSON.stringify(r).slice(0, 120));
      const t = fs.readFileSync(dest, "utf8");
      rec("⭐ the new number is written", /days = 900/.test(t), t.slice(0, 500));
      rec("CONTROL: …and the old one is gone, so this really was a rebuild", !/days = 1460/.test(t), t.slice(0, 500));
      for (const note of ["#For testing", "#days = 3", "# Died in 1941", "# and nothing below me"]) {
        rec(`⭐ "${note}" survives the edit too`, t.includes(note), t.slice(0, 500));
      }
      rec("⭐ …and the trailing note followed the value onto its new line",
        /days = 900[ \t]+# Died in 1941/.test(t), t.slice(0, 500));
    }

    console.log(`\n=== a note inside a simple mtth survives: ${checks} checks, ${fails.length} failed ===`);
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
