// #option-trailing-comment-dropped — the note an author CLOSES an option with.
//
// The writer emits an option as: name, trigger, effects, ai_chance, `}`. A comment run written at the very
// end of the option arrives in the effects box, so it went out with the effects — which puts `ai_chance`
// BELOW it, and the note that closed the option now captions the ai_chance block instead.
//
// 668 options across the install and every installed mod end in a comment; 344 of them have an `ai_chance`
// or `trigger` above that comment on disk, so the writer's fixed ordering moves it. 51 are vanilla —
// AAT_Sweden.txt closes AAT_Sweden_flashpoints.11.a with
//
//     add_war_support = -0.05
//     # TODO_ASD: Reduce factories by 1 for 1 year
//     # Could use IM bank system instead
//
// on an option whose ai_chance is declared FIRST. The run is split off the script and emitted last, which is
// where the author put it.
//
// ⚠️ ONLY when there is code above it in the box. An option whose whole script is commented-out effects —
// Old World Blues' AcePilots.txt keeps `#add_war_support = 0.02` that way — has no "end" to distinguish
// from its beginning, and moving the lot below ai_chance would be a guess. Section 3 is that control.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53570;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-opttail-"));
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

// .a  vanilla's shape: ai_chance declared FIRST, effects, then the closing note.
// .b  the same note with NO ai_chance — nothing to move it past, so it must not move.
// .c  a script that is ONLY comments — no code to be "after", so its layout is left alone.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1
\ttitle = probe.1.t
\tdesc = probe.1.d
\tis_triggered_only = yes

\toption = {
\t\tname = probe.1.a
\t\tai_chance = {
\t\t\tbase = 1
\t\t}
\t\tadd_war_support = -0.05
\t\t# TODO: reduce factories by 1 for a year
\t\t# could use the bank system instead
\t}

\toption = {
\t\tname = probe.1.b
\t\tadd_stability = 0.05
\t\t# nothing to move me past
\t}

\toption = {
\t\tname = probe.1.c
\t\tai_chance = {
\t\t\tbase = 2
\t\t}
\t\t#add_war_support = 0.02
\t\t#add_political_power = 5
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-opttail-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Opt Tail"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

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
    const blockOf = (t, id) => {
      const m = new RegExp(`option = \\{[^]*?name = ${id.replace(/\./g, "\\.")}[^]*?\\n\\t\\}`).exec(t);
      return m ? m[0] : "";
    };

    console.log("1. The closing note is still the last thing in the option");
    const first = await saveOnce();
    rec("the event is listed and saved", first.evt && first.r && first.r.error === undefined,
      JSON.stringify(first.r || first).slice(0, 140));
    const after = fs.readFileSync(dest, "utf8");
    const bA = blockOf(after, "probe.1.a");
    rec("CONTROL: the option was found in the output", bA.length > 0, after.slice(0, 300));
    rec("CONTROL: both closing notes survive",
      bA.includes("# TODO: reduce factories by 1 for a year") && bA.includes("# could use the bank system instead"), bA);
    rec("CONTROL: …and so do the ai_chance and the effect it sat between",
      /base = 1/.test(bA) && /add_war_support = -0\.05/.test(bA), bA);
    // ⭐ The whole point: ai_chance is emitted after the effects, so without the split it would sit BELOW
    // the note that closed the option and the note would caption it.
    const iAi = bA.indexOf("ai_chance");
    const iNote = bA.indexOf("# TODO: reduce factories");
    rec("⭐ the note comes AFTER the ai_chance, as it did on disk", iNote > iAi, `ai_chance@${iAi} note@${iNote}`);
    rec("⭐ …and nothing but the closing brace follows it",
      /# could use the bank system instead[ \t]*\r?\n[ \t]*\}\s*$/.test(bA), bA);

    console.log("\n2. CONTROL: with nothing to move it past, it does not move");
    {
      const bB = blockOf(after, "probe.1.b");
      rec("the note survives", bB.includes("# nothing to move me past"), bB);
      rec("⭐ …still directly below the effect it was written under",
        /add_stability = 0\.05[ \t]*\r?\n[ \t]*# nothing to move me past/.test(bB), bB);
    }

    console.log("\n3. An option that is NOTHING BUT disabled effects keeps them where they were");
    {
      // Old World Blues' AcePilots.txt shape — a whole option of commented-out effects the author is
      // holding on to, written below the ai_chance. ⚠️ This is not a guess either: a run only reaches the
      // end of the effects box by having been at the end of the option BODY. A note written ABOVE
      // `ai_chance` is that statement's lead and goes back above it through optionAiLead instead, so it
      // never arrives here — which is what makes "the run at the end of the script belongs at the end of
      // the option" true rather than convenient.
      const bC = blockOf(after, "probe.1.c");
      rec("both disabled effects survive",
        bC.includes("#add_war_support = 0.02") && bC.includes("#add_political_power = 5"), bC);
      rec("⭐ …below the ai_chance, where the author wrote them",
        bC.indexOf("#add_war_support = 0.02") > bC.indexOf("ai_chance"), bC);
      rec("⭐ …and in the order they were written",
        bC.indexOf("#add_war_support = 0.02") < bC.indexOf("#add_political_power = 5"), bC);
    }

    console.log("\n4. …and repeating the save is stable");
    let prev = after;
    for (let pass = 2; pass <= 4; pass++) {
      const r = await saveOnce();
      rec(`save ${pass} accepted`, r.r && r.r.error === undefined, JSON.stringify(r.r || r).slice(0, 100));
      const t = fs.readFileSync(dest, "utf8");
      const bad = ["# TODO: reduce factories by 1 for a year", "# could use the bank system instead",
        "# nothing to move me past", "#add_war_support = 0.02"]
        .map((n) => [n, t.split(n).length - 1]).filter(([, c]) => c !== 1);
      rec(`⭐ after save ${pass}: every note still exactly once`, bad.length === 0,
        bad.map(([n, c]) => `${n} x${c}`).join(" · "));
      if (pass === 4) rec("⭐ …and the file stopped changing", t === prev, "the file is still moving");
      prev = t;
    }

    console.log(`\n=== an option's closing note stays at the end: ${checks} checks, ${fails.length} failed ===`);
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
