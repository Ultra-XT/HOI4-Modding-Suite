// ⛔ #comments-above-title-desc-mtth-dropped, the half that DOUBLED — a no-edit save copied a note, and the
// next save copied both.
//
// A conditional `desc` (several `desc = { trigger = { … } text = … }` branches) is preserved VERBATIM,
// because the maker models one description and rebuilding from that would delete the other branches. The
// notes above and after each branch travel inside that preserved text, which is why the reader deletes
// `keyComments.desc` and `keyTrailComments.desc` before the by-key injection runs.
//
// It did not delete `keyHead.desc` — the note on the branch's OWN OPENING LINE, `desc = { #ALLY OR SUBJECT`.
// That note is inside the preserved text too, so the injection added a second copy. And because the next
// read then takes the whole doubled run as the head comment and doubles THAT, it compounds:
//
//     save 1: #ALLY OR SUBJECT
//     save 2: #ALLY OR SUBJECT #ALLY OR SUBJECT
//     save 3: x4      save 4: x8      save 5: x16
//
// Ten saves put 1,024 copies of one note on one line. 175 conditional desc/title blocks across the install
// and every installed mod are written with a note there, 41 of them in vanilla — and they are exactly the
// labels that tell near-identical branches apart: BBA_NewsEvents.txt distinguishes three otherwise
// identical descriptions with `#SOME are purged`, `#MANY are purged` and `#NONE is purged`.
//
// ⚠️ The counting matters. A multiset comparison of comments reports a DUPLICATE as "nothing lost", and a
// caption map reports it as the same caption on the same key. Only counting occurrences finds it, which is
// why every star below is a count and not a presence check.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53566;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-descdup-"));
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

// Two conditional desc branches and a conditional title, each labelled on its own line, plus a note above a
// branch and one trailing it — so a fix that simply stopped injecting head notes would show up as a loss.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1

\ttitle = { #WHEN AT WAR
\t\ttext = probe.1.t_war
\t\ttrigger = { has_war = yes }
\t}
\ttitle = { #OTHERWISE
\t\ttext = probe.1.t
\t}

\t# a note ABOVE the first branch
\tdesc = { #ALLY OR SUBJECT
\t\ttext = probe.1.desc_ally
\t\ttrigger = { has_war = yes }
\t}   #a note AFTER the first branch
\tdesc = { #DEFAULT DESC
\t\ttext = probe.1.d
\t}

\tis_triggered_only = yes

\toption = {
\t\tname = probe.1.a
\t\tadd_political_power = 10
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-descdup-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Desc Dup"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    const NOTES = ["#WHEN AT WAR", "#OTHERWISE", "# a note ABOVE the first branch", "#ALLY OR SUBJECT",
      "#a note AFTER the first branch", "#DEFAULT DESC"];
    const count = (t, n) => (t.split(n).length - 1);
    // ⚠️ CONTROL: the fixture really has one of each. If a note were duplicated in the fixture itself the
    // "exactly one" assertions below would be measuring the wrong thing.
    for (const n of NOTES) {
      rec(`CONTROL: the fixture has "${n}" exactly once`, count(FIXTURE, n) === 1, count(FIXTURE, n));
    }

    const saveOnce = async () => {
      const j = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const evt = (j.events || []).find((e) => String(e.fullId || "").endsWith("probe.1"));
      if (!evt) return { error: "not listed" };
      const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId));
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
      return fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((x) => x.json());
    };

    console.log("\n1. One no-edit save keeps every note exactly once");
    const r1 = await saveOnce();
    rec("the save is accepted", !!r1 && r1.error === undefined, JSON.stringify(r1).slice(0, 140));
    const after1 = fs.readFileSync(dest, "utf8");
    for (const n of NOTES) {
      rec(`⭐ "${n}" appears exactly once`, count(after1, n) === 1, `${count(FIXTURE, n)} -> ${count(after1, n)}`);
    }
    // …and the branches themselves are all still there. Preserving the note is worthless if a branch went.
    rec("CONTROL: both desc branches survive",
      /text = probe\.1\.desc_ally/.test(after1) && /text = probe\.1\.d\b/.test(after1), after1);
    rec("CONTROL: both title branches survive",
      /text = probe\.1\.t_war/.test(after1) && /text = probe\.1\.t\b/.test(after1), after1);
    rec("CONTROL: the branch triggers survive", (after1.match(/has_war = yes/g) || []).length === 2,
      (after1.match(/has_war = yes/g) || []).length);
    // ⭐ …and the head note is still ON the branch's own line, not floated somewhere else.
    rec("⭐ the note is still on the desc branch's own line",
      /desc\s*=\s*\{[ \t]*#ALLY OR SUBJECT/.test(after1), after1);
    rec("⭐ …and on the title branch's", /title\s*=\s*\{[ \t]*#WHEN AT WAR/.test(after1), after1);

    console.log("\n2. …and four more saves do not compound it  (this doubled every time)");
    let prev = after1;
    for (let pass = 2; pass <= 5; pass++) {
      const r = await saveOnce();
      rec(`save ${pass} is accepted`, !!r && r.error === undefined, JSON.stringify(r).slice(0, 100));
      const t = fs.readFileSync(dest, "utf8");
      const worst = NOTES.map((n) => [n, count(t, n)]).filter(([, c]) => c !== 1);
      rec(`⭐ after save ${pass}: every note is still exactly once`, worst.length === 0,
        worst.map(([n, c]) => `${n} x${c}`).join(" · "));
      // ⛔ THE SECOND BUG, and a different one: the branch's BODY gained a tab on every save.
      //
      // `reindentPdxStatement` measures the body's indent relative to line 0 — and this caller glues the
      // statement's own lead comments on top before calling it, so line 0 became `# a note ABOVE …`,
      // `desc = {` became just another line at indent 0, and the minimum dropped to 0. Every body line then
      // kept its own tab AND gained the pad. The writer re-reads the file it wrote, so it compounded:
      // \t\t -> \t\t\t -> \t\t\t\t, unbounded. Same shape as the head-comment case the option reader hit
      // ("the author's note moved AND every line of their script gained a tab"), one function over.
      const bodyIndent = (txt) => {
        const m = /\n([\t ]*)text = probe\.1\.desc_ally/.exec(txt);
        return m ? m[1].length : -1;
      };
      rec(`⭐ after save ${pass}: the branch body is still two tabs in`, bodyIndent(t) === 2, `indent ${bodyIndent(t)}`);
      if (pass === 5) rec("⭐ …and the file stopped changing after the first save", t === prev, "the file is still moving");
      prev = t;
    }

    console.log(`\n=== a conditional desc note does not multiply: ${checks} checks, ${fails.length} failed ===`);
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
