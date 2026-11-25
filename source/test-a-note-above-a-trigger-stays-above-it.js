// #option-trailing-comment-dropped, the fourth placement: the notes above an option's `trigger` and
// `ai_chance`.
//
// Those two keys have their own fields in the maker, so the option reader SKIPS them and keeps their notes
// by re-emitting them into the effects box. The writer then emits `trigger` BEFORE the script and
// `ai_chance` AFTER it, at fixed positions — so a note whose key is not adjacent to that position comes
// back beside an effect instead of beside the key it describes.
//
// 545 options across the install and every installed mod write one (406 above `ai_chance`, 139 above
// `trigger`), 64 of them in vanilla: AAT_Sweden.txt captions its options `# okidoke`, `#no` and `#sod off`
// exactly there. They are restored above the emitted key from the same name-keyed queue as the option's own
// label, the note trailing its name and the note above its name — the fourth of four placements, under the
// same bareword-name condition, so the reader and the writer keep asking the same question.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53569;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keylead-"));
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

// .a  a note above `trigger`, written where vanilla writes it — first.
// .b  a note above `trigger` written AFTER the effects, which is where the placement actually bites: the
//     writer emits trigger BEFORE the script, so the note had to travel across the whole option.
// .c  a detached note (blank line under it) above `ai_chance`, plus one that is NOT keyable — .c has a
//     quoted name, so nothing can key on it and its notes must stay in the box rather than vanish.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1
\ttitle = probe.1.t
\tdesc = probe.1.d
\tis_triggered_only = yes

\toption = {
\t\tname = probe.1.a
\t\t# only if we are at war
\t\ttrigger = { has_war = yes }
\t\tadd_political_power = 25
\t}

\toption = {
\t\tname = probe.1.b
\t\tadd_stability = 0.05
\t\tarmy_experience = 3
\t\t# and only for the desperate
\t\ttrigger = { has_war = yes }
\t}

\toption = {
\t\tname = "Cry Havoc!"
\t\tadd_war_support = 0.1

\t\t# the AI really should not
\t\tai_chance = {
\t\t\tbase = 0
\t\t}
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keylead-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Key Lead"\nsupported_version="1.16.*"\n');
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

    console.log("1. The note comes back above the key it describes");
    const first = await saveOnce();
    rec("the event is listed and saved", first.evt && first.r && first.r.error === undefined,
      JSON.stringify(first.r || first).slice(0, 140));
    const after = fs.readFileSync(dest, "utf8");
    for (const n of ["# only if we are at war", "# and only for the desperate", "# the AI really should not"]) {
      rec(`CONTROL: "${n}" survives at all`, after.includes(n), after);
    }
    rec("⭐ the first option's note is directly above its trigger",
      /# only if we are at war[ \t]*\r?\n[ \t]*trigger[ \t]*=/.test(after), after);
    // ⭐ THE ONE THAT BITES. On disk this note sits after two effects; the writer emits trigger BEFORE the
    // script, so without the queue it lands in the middle of the effects and captions one of them.
    rec("⭐ …and so is the one written AFTER the effects",
      /# and only for the desperate[ \t]*\r?\n[ \t]*trigger[ \t]*=/.test(after), after);
    rec("CONTROL: that option's effects are all still there",
      /add_stability = 0\.05/.test(after) && /army_experience = 3/.test(after), after);

    console.log("\n2. CONTROL: an option nothing can key on keeps its note in the box");
    {
      // `name = "Cry Havoc!"` is a quoted literal — there is no bareword for a queue to key on, so the
      // reader must NOT lift the note out. Lifting it would drop it into a queue the writer never reads.
      rec("⭐ the un-keyable option's note survives", after.includes("# the AI really should not"), after);
      const opts = (first.evt.options || []);
      const scriptC = String((opts[2] || {}).script || "");
      rec("⭐ …by staying in its effects box", scriptC.includes("# the AI really should not"), scriptC);
      rec("CONTROL: …while a keyable option's note is NOT in the box",
        !String((opts[0] || {}).script || "").includes("# only if we are at war"), (opts[0] || {}).script);
    }

    console.log("\n3. …and repeating the save neither loses nor multiplies them");
    let prev = after;
    for (let pass = 2; pass <= 4; pass++) {
      const r = await saveOnce();
      rec(`save ${pass} accepted`, r.r && r.r.error === undefined, JSON.stringify(r.r || r).slice(0, 100));
      const t = fs.readFileSync(dest, "utf8");
      const bad = ["# only if we are at war", "# and only for the desperate", "# the AI really should not"]
        .map((n) => [n, t.split(n).length - 1]).filter(([, c]) => c !== 1);
      rec(`⭐ after save ${pass}: every note still exactly once`, bad.length === 0,
        bad.map(([n, c]) => `${n} x${c}`).join(" · "));
      if (pass === 4) rec("⭐ …and the file stopped changing", t === prev, "the file is still moving");
      prev = t;
    }

    console.log(`\n=== a note above a trigger stays above it: ${checks} checks, ${fails.length} failed ===`);
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
