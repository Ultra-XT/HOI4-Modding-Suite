// ⛔ #option-trailing-comment-dropped — A LABEL WRITTEN ON A BLOCK'S OWN OPENING LINE WAS MOVED SOMEWHERE
// ELSE BY A SAVE THAT CHANGED NOTHING.
//
//     country_event = { #Motion of No Confidence     ->  the note moved onto its own line above `id`
//     option = { #Sure, if we are at war             ->  the note moved INTO the effects box, below the
//                                                        trigger, where it captions the first effect
//
// Both are how vanilla labels its blocks. Counted over the install and every installed mod:
//
//     `<type>_event = { #label`   7,149   (1,109 vanilla)
//     `option = { #label`        14,548   (3,489 vanilla)
//
// From inside the braces that comment is the first line of the BODY, so leadingCommentLinesAbove reads it
// as the lead of whatever statement comes next — `id` for an event, the first effect for an option — and
// every re-injection then faithfully puts it above the wrong thing.
//
// ⭐⭐ NOTHING WAS LOST, WHICH IS WHY NOTHING SAW IT. The corpus round trip compared a MULTISET of comment
// texts and reported 0 losses on the very files where this was happening to hundreds of notes. CLAUDE.md
// says to compare a CAPTION MAP — comment text paired with the code it annotates — and says it because this
// exact blindness hid two real bugs through an entire campaign. Teaching the probe that measure turned "0
// lost" into 479 moved captions across 11 files. This test uses the same measure.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53549;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evhead-"));
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
const show = (t) => String(t).slice(0, 300).replace(/\n/g, "|");

// ── the measure ──────────────────────────────────────────────────────────────────────────────────
// Each comment paired with the code it annotates: the code on its OWN line for a trailing note, otherwise
// the key on the next code line below it. A note that survives but MOVES shows up as a lost pair.
const captionMap = (t) => {
  const lines = String(t).replace(/\r/g, "").split("\n");
  const cut = (l) => {
    const h = l.indexOf("#");
    if (h < 0) return null;
    if ((l.slice(0, h).match(/"/g) || []).length % 2 === 1) return null; // 🈯 a `#` inside a string is script
    return { code: l.slice(0, h).trim(), note: l.slice(h).trim().replace(/\s+/g, " ") };
  };
  const keyOf = (code) => {
    const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*[=<>]/.exec(code);
    return m ? m[1] : (String(code).split(/\s+/)[0] || "");
  };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const c = cut(lines[i]);
    if (!c) continue;
    if (c.code) { out.push(`${c.note} @ ${keyOf(c.code)}`); continue; }
    let target = "<end>";
    for (let j = i + 1; j < lines.length; j++) {
      const d = cut(lines[j]);
      const code = String(d ? d.code : lines[j]).trim();
      if (code) { target = keyOf(code); break; }
    }
    out.push(`${c.note} @ ${target}`);
  }
  return out;
};
const lossOf = (was, now) => {
  const left = now.slice(), lost = [];
  for (const x of was) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else lost.push(x); }
  return lost;
};

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const roundTrip = async (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evhead-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Head"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const errors = [];
      for (const evt of list.events || []) {
        const dot = String(evt.fullId || "").lastIndexOf(".");
        const res = await fetch(`${BASE}/api/events/save`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod,
            namespace: dot > 0 ? evt.fullId.slice(0, dot) : evt.fullId,
            id: dot > 0 ? evt.fullId.slice(dot + 1) : "",
            type: evt.type || "country_event",
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
              script: String(o.script || "").trim(), aiChance: null, trigger: String(o.trigger || "").trim(),
            })),
          }),
        }).then((r) => r.json());
        if (res && res.error) errors.push(String(res.error).slice(0, 80));
      }
      return { after: fs.readFileSync(dest, "utf8"), errors, events: list.events || [] };
    };

    const FIX = `add_namespace = headns

country_event = { #Motion of No Confidence
\tid = headns.1
\ttitle = headns.1.t
\tdesc = headns.1.d
\tis_triggered_only = yes

\toption = { #Sure, if we are at war
\t\tname = headns.1.a
\t\ttrigger = { has_war = yes }
\t\tadd_political_power = 5
\t}

\toption = { #Sure, otherwise
\t\tname = headns.1.b
\t\tadd_political_power = 10
\t}
}
`;

    console.log("1. The label stays on the line the author wrote it on");
    {
      const { after, errors } = await roundTrip(FIX);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the event's own label is still on its opening line",
        /country_event[ \t]*=[ \t]*\{[ \t]*#Motion of No Confidence/.test(after), show(after));
      rec("⭐ the first option's label is still on its opening line",
        /option[ \t]*=[ \t]*\{[ \t]*#Sure, if we are at war/.test(after), show(after));
      rec("⭐ …and the second option's, which is the one that would inherit the first's",
        /option[ \t]*=[ \t]*\{[ \t]*#Sure, otherwise/.test(after), show(after));
      rec("…and none of the three is duplicated",
        (after.match(/#Motion of No Confidence/g) || []).length === 1
        && (after.match(/#Sure, if we are at war/g) || []).length === 1
        && (after.match(/#Sure, otherwise/g) || []).length === 1, show(after));
      // ⭐ The measure that would have caught this in the first place.
      const lost = lossOf(captionMap(FIX), captionMap(after));
      rec("⭐ no caption moved", lost.length === 0, lost.slice(0, 4).join(" · "));
      // Not just position — a second save must not grow the file either.
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable", lossOf(captionMap(after), captionMap(twice)).length === 0
        && (twice.match(/#Sure, if we are at war/g) || []).length === 1, show(twice));
    }

    console.log("\n2. An option with NO name keeps its label where it always was  (regression control)");
    {
      // ⚠️ The writer restores this note from a NAME-KEYED queue, so an option with no name has no key to
      // restore it under. Lifting it out of the effects box for such an option would DELETE it — which is
      // what the first version of this fix did, costing vanilla's MTG_naval_treaty_events.txt its `#great`.
      // Nameless options are rare but real: vanilla writes 9 of them.
      const NONAME = `add_namespace = headns

country_event = {
\tid = headns.2
\ttitle = headns.2.t
\tis_triggered_only = yes

\toption = { #great
\t\teffect_tooltip = { add_political_power = 5 }
\t}
}
`;
      const { after, errors } = await roundTrip(NONAME);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the label is still SOMEWHERE — not deleted", /#great/.test(after), show(after));
      rec("…and appears exactly once", (after.match(/#great/g) || []).length === 1, show(after));
    }

    console.log("\n3. …and on a BLOCK key, where the note also cost the script a tab");
    {
      // ⭐ The third site, and the one that damaged more than a caption. The Trigger/Immediate/After boxes
      // dedent a block by its smallest indent; the note sits at indent ZERO inside the braces, so the dedent
      // found nothing to remove and the writer indented the whole block a second time. 175 blocks across the
      // corpora are written this way. Three saves, because a defect that ADDS on every save is a different
      // and worse thing than one that adds once — this one turned out to be the second, and the check says
      // which.
      const BLK = `add_namespace = headns

country_event = {
\tid = headns.3
\ttitle = headns.3.t
\tis_triggered_only = yes

\timmediate = { #save the popularities
\t\tset_variable = { a = 1 }
\t\tclamp_variable = {
\t\t\tvar = a
\t\t\tmin = 0
\t\t}
\t}

\toption = {
\t\tname = headns.3.a
\t}
}
`;
      let text = BLK;
      const sizes = [];
      for (let i = 0; i < 3; i++) { const r = await roundTrip(text); text = r.after; sizes.push(text.length); }
      rec("⭐ the note is back on the `immediate = {` line", /immediate[ \t]*=[ \t]*\{[ \t]*#save the popularities/.test(text), show(text));
      rec("⭐ …and the block keeps the author's indentation", /\n\t\tset_variable = \{ a = 1 \}/.test(text), JSON.stringify(text.slice(text.indexOf("immediate"), text.indexOf("immediate") + 90)));
      rec("…and the nesting below it too", /\n\t\t\tvar = a/.test(text), JSON.stringify((/immediate[\s\S]{0,140}/.exec(text) || [""])[0]));
      rec("…and three saves are byte-stable", sizes[0] === sizes[1] && sizes[1] === sizes[2], sizes.join(" -> "));
      rec("…and the note is not duplicated", (text.match(/#save the popularities/g) || []).length === 1, show(text));
    }

    console.log("\n4. …and a note on the option's `name` line stays on the name line");
    {
      // The fourth site. `name = denmark_political_events.4.a #Intentional` is a note about the NAME —
      // 5,093 across the corpora, 875 vanilla — and the orphan-lead path moved it to the top of the effects
      // box, where it captioned the first effect instead.
      const NM = `add_namespace = headns

country_event = {
\tid = headns.4
\ttitle = headns.4.t
\tis_triggered_only = yes

\toption = {
\t\tname = headns.4.a #Intentional
\t\tadd_political_power = 5
\t}
}
`;
      const { after, errors } = await roundTrip(NM);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the note is still on the name line", /name[ \t]*=[ \t]*headns\.4\.a[ \t]+#Intentional/.test(after), show(after));
      rec("…and appears exactly once", (after.match(/#Intentional/g) || []).length === 1, show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable", (twice.match(/#Intentional/g) || []).length === 1
        && /name[ \t]*=[ \t]*headns\.4\.a[ \t]+#Intentional/.test(twice), show(twice));
    }

    console.log("\n5. …but a QUOTED literal name keeps the old behaviour  (regression control)");
    {
      // ⚠️ Same rule as the nameless option: the queue is keyed on a BAREWORD name, so `name = "Cry Havoc!"`
      // — which vanilla's TestEvents.txt really ships — has no key to restore under. Lifting the note there
      // would delete it, so the reader does not lift it. Reader and writer ask the same question.
      const QN = `add_namespace = headns

country_event = {
\tid = headns.5
\ttitle = headns.5.t
\tis_triggered_only = yes

\toption = {
\t\tname = "Cry Havoc!" #the literal form
\t\tadd_political_power = 5
\t}
}
`;
      const { after, errors } = await roundTrip(QN);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the note is still SOMEWHERE — not deleted", /#the literal form/.test(after), show(after));
      rec("…and appears exactly once", (after.match(/#the literal form/g) || []).length === 1, show(after));
      rec("…and the quoted literal name is intact", /name[ \t]*=[ \t]*"Cry Havoc!"/.test(after), show(after));
    }

    console.log("\n6. Measured on the vanilla file that writes 193 events this way");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/AAT_Denmark.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's AAT_Denmark.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      const headLabels = (t) => (t.match(/^[ \t]*[A-Za-z_][A-Za-z0-9_]*_event\s*=\s*\{[ \t]*#/gm) || []).length;
      const optLabels = (t) => (t.match(/^[ \t]*option\s*=\s*\{[ \t]*#/gm) || []).length;
      // Assert the fixture has the property before trusting what it measures.
      rec("the fixture HAS the property: it labels events and options on their own lines",
        headLabels(original) > 50 && optLabels(original) > 50,
        `${headLabels(original)} event labels, ${optLabels(original)} option labels`);
      const { after, errors } = await roundTrip(original);
      rec("every event in it saved without error", errors.length === 0, errors[0]);
      rec("⭐ every event label is still on an event's own line", headLabels(after) === headLabels(original),
        `${headLabels(original)} -> ${headLabels(after)}`);
      rec("⭐ …and every option label on an option's own line", optLabels(after) === optLabels(original),
        `${optLabels(original)} -> ${optLabels(after)}`);
      // ⭐ And nothing else in the file moved either — 193 events, 288 options, every note measured by the
      // caption map rather than by presence. This one file went from 479 moved captions to 0.
      const lost = lossOf(captionMap(original), captionMap(after));
      rec("⭐ …and no caption anywhere in the file moved", lost.length === 0,
        `${lost.length}: ` + lost.slice(0, 4).join(" · "));
    }

    console.log(`\n=== a note stays on the line it was written on: ${checks} checks, ${fails.length} failed ===`);
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
