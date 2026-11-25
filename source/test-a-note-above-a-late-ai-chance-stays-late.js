// #event-option-comment-with-nothing-to-lead, the position half.
//
// parseEventOptionParts SKIPS `name`, `ai_chance` and `trigger` — they have their own fields in the maker —
// and any comment attached to one of them would be lost with the statement it led. They are kept and
// re-emitted into the effects box, which is right. They were re-emitted at the TOP of it, which is right
// only while the skipped key comes FIRST.
//
// `name` almost always does, which is why this read as correct for a long time. `ai_chance` and `trigger`
// are conventionally written LAST, and a note above one of those jumped over every effect in the option and
// came back captioning the first one. Position is the whole content of a caption — the same lesson that
// turned "0 comments lost" into 479 moved captions when the event probe started comparing a caption map
// instead of a multiset.
//
// ⚠️ MEASURED, and small: a no-edit round trip over 585 events in the four files that carry the shape moves
// captions-lost-or-moved from 69 to 67. A static census said 40 across the install and was over-counting —
// most of its hits were notes trailing a `name`, which the writer already puts back on the name line from
// its own queue rather than through the effects box. Two real notes, and the code is simpler for it: one
// ordered list instead of one list prepended to another.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53565;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-optpos-"));
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

const FIXTURE = `add_namespace = probe_pos

country_event = {
\tid = probe_pos.1
\ttitle = probe_pos.1.t
\tdesc = probe_pos.1.d
\tis_triggered_only = yes

\toption = {
\t\tname = probe_pos.1.a
\t\tadd_political_power = 25
\t\tarmy_experience = 3
\t\t# the AI should almost never pick this
\t\tai_chance = {
\t\t\tbase = 1
\t\t}
\t}
\toption = {
\t\t# a note above the very first thing
\t\tname = probe_pos.1.b
\t\tadd_stability = 0.05
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-optpos-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Opt Pos"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    console.log("1. The note comes back where it was written");
    const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const evt = (list.events || []).find((e) => String(e.fullId || e.id).endsWith("probe_pos.1"));
    rec("the event is listed", !!evt, (list.events || []).map((e) => e.fullId || e.id).join(" "));
    const opts = (evt && evt.options) || [];
    rec("both options are read", opts.length === 2, opts.length);
    const scriptA = String((opts[0] || {}).script || "");
    // ⚠️ A note above `ai_chance` no longer travels through the effects box at all — it is restored above
    // the emitted `ai_chance` from a name-keyed queue, the fourth placement. So what has to be true HERE is
    // that it is not in the box (or it would be written twice); section 2 checks where it lands.
    rec("CONTROL: the note is not dumped into the effects box",
      !scriptA.includes("# the AI should almost never pick this"), scriptA);
    rec("CONTROL: …while the effects it was written below still are",
      scriptA.includes("add_political_power = 25") && scriptA.includes("army_experience = 3"), scriptA);
    // ⚠️ CONTROL, the other direction: a fix that simply moved every skipped-key note to the END would pass
    // the star above and be just as wrong. The second option's note sits above its `name`, which the writer
    // restores above the name line from its own queue rather than through the effects box — so what has to
    // be true here is that it is NOT in the box, and section 2 checks it lands above `name` in the file.
    const scriptB = String((opts[1] || {}).script || "");
    rec("CONTROL: a note above the name is not dumped into the effects box",
      !scriptB.includes("# a note above the very first thing"), scriptB);

    console.log("\n2. …and a save puts it back there  (the note must round-trip, not just read)");
    {
      // ⚠️ The body public/events.js builds from a list entry, field for field. My first attempt invented a
      // shape (`desc`, `mode`, `fileName`, a full-id `id`) and every save was REFUSED with "event ids must
      // be a number after the namespace" — the client splits namespace from id. A refused save leaves the
      // file untouched, and the idempotence controls below then pass on a file nothing wrote to.
      const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
      rec("CONTROL: the id splits the way the client splits it", !!idSplit, String(evt.fullId));
      const body = {
        modPath: mod, namespace: idSplit[1], id: idSplit[2],
        type: evt.type || "country_event",
        title: evt.title || "", description: evt.description || "", picture: evt.picture || "",
        triggeredOnly: evt.triggeredOnly === "yes" ? "yes" : "no",
        hidden: evt.hidden === "yes" ? "yes" : "no",
        fireOnce: evt.fireOnce === "yes" ? "yes" : "no",
        major: evt.major === "yes" ? "yes" : "no",
        mtthDays: parseInt(evt.mtthDays, 10) || 0,
        trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
        timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
        options: opts.map((o) => ({
          name: o.name || "", title: o.title || "", script: o.script || "",
          aiChance: (o.aiChance == null || o.aiChance === "") ? null : Number(o.aiChance),
          trigger: o.trigger || "",
        })),
      };
      const r = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((x) => x.json());
      rec("the save is accepted", !!r && r.error === undefined, JSON.stringify(r).slice(0, 140));
      const after = fs.readFileSync(dest, "utf8");
      rec("the note survives the save", after.includes("# the AI should almost never pick this"), after.slice(0, 400));
      const aNote = after.indexOf("# the AI should almost never pick this");
      const aEffect = after.indexOf("army_experience = 3");
      const aAi = after.indexOf("ai_chance");
      rec("⭐ …still below the effect it was written below", aNote > aEffect, `note@${aNote} effect@${aEffect}`);
      rec("CONTROL: …and the ai_chance it captions is still there", aAi > 0, `ai_chance@${aAi}`);
      rec("CONTROL: the other option's leading note is still leading",
        /# a note above the very first thing[ \t]*\r?\n[ \t]*name[ \t]*=[ \t]*probe_pos\.1\.b/.test(after),
        after.slice(0, 600));
      // ⚠️ IDEMPOTENCE: a second save must not multiply or migrate it. This class has produced both.
      const r2 = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((x) => x.json());
      rec("a second save is accepted", !!r2 && r2.error === undefined, JSON.stringify(r2).slice(0, 140));
      const after2 = fs.readFileSync(dest, "utf8");
      const count = (t) => (t.match(/# the AI should almost never pick this/g) || []).length;
      rec("⭐ CONTROL: the note appears exactly once, not twice", count(after2) === 1, `${count(after)} -> ${count(after2)}`);
      rec("⭐ CONTROL: …and the file is stable across the second save", after2 === after, "the second save moved something");
    }

    console.log(`\n=== a note above a late ai_chance stays late: ${checks} checks, ${fails.length} failed ===`);
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
