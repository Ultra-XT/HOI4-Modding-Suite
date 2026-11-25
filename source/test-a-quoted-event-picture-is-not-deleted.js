// ⛔ #event-quoted-picture-deleted — A SAVE THAT CHANGED NOTHING DELETED THE EVENT'S PICTURE LINE.
//
// The event reader had four patterns for `picture`: a bare token, a `{ texture = … }` block, and a bare
// scripted `[GetX]`. None of them matches a QUOTED value, so it came back "" — and because the event exists
// on disk the writer suppresses its default for exactly the "the author left it out" case, so nothing was
// written at all. The event rendered with no image.
//
// ⚠️ THE CENSUS THAT CLOSED THIS BEFORE WAS WRONG, and its wrongness is the interesting part. The comment
// beside the scripted-picture fix says the bare form "is the whole population of what the two patterns above
// miss". Re-counted over every event's own `picture` statement across the install and all installed mods:
//
//     bare token           14,282   (6,664 vanilla)
//     bare scripted [X]        30   (   30 vanilla)
//     QUOTED scripted "[X]"    19   (   19 vanilla)   <- missed by all four patterns
//     quoted token "X"          2   (    0 vanilla)
//
// Every quoted one is in shipping content and every one was lost. Vanilla's MUN_Czechoslovakia.txt writes
// `picture = "[CZE_divide_nation_image_dynamic]"`. The two quoted tokens are a file PATH containing a space,
// which is precisely why their author quoted it — so stripping the quotes would break them too. The quotes
// are kept in the value and the author's own form is written back.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53550;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qpic-"));
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
const show = (t) => String(t).slice(0, 240).replace(/\n/g, "|");

const fixture = (pic) => `add_namespace = qpic

country_event = {
\tid = qpic.1
\ttitle = qpic.1.t
\tdesc = qpic.1.d
\tpicture = ${pic}
\tis_triggered_only = yes

\toption = {
\t\tname = qpic.1.a
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // `blankPicture` stands in for the picture PICKER handing back an empty string, which is what it does
    // for a value it cannot draw — a script call or a path. The server-side rescue has to hold then too;
    // a guard the client cannot carry is not a guard.
    const roundTrip = async (text, blankPicture) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qpic-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Q Pic"\nsupported_version="1.16.*"\n');
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
            picture: blankPicture ? "" : (evt.picture || "").trim(),
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
      return { after: fs.readFileSync(dest, "utf8"), events: list.events || [], errors };
    };

    const FORMS = [
      ["a quoted SCRIPTED picture", '"[GetCapitulationImage]"'],
      ["a quoted PATH with a space in it", '"gfx/event_pictures/europe/sweden - SWE/SWE_riot.dds"'],
      ["a quoted plain token", '"GFX_report_event_generic_read_write"'],
      ["the bare scripted form (already covered — this is the sibling control)", "[GetHitlerHandshakeEventPicture]"],
      ["an ordinary bare token", "GFX_report_event_generic_read_write"],
    ];

    console.log("1. The reader SEES it — an editor that cannot see a value cannot preserve it");
    for (const [label, pic] of FORMS) {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qpic-read-"));
      made.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Q Pic"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.join(mod, "events"), { recursive: true });
      fs.writeFileSync(path.join(mod, "events", "probe.txt"), fixture(pic), "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const got = ((list.events || [])[0] || {}).picture;
      rec(`READ: ${label}`, got === pic, `got ${JSON.stringify(got)} want ${JSON.stringify(pic)}`);
    }

    console.log("\n2. …and a save that changes nothing writes the author's own form back");
    for (const [label, pic] of FORMS) {
      const { after, errors } = await roundTrip(fixture(pic));
      rec(`SAVE: ${label}`, errors.length === 0 && after.includes(`picture = ${pic}`), errors[0] || show(after));
    }

    console.log("\n3. …even when the picker hands back nothing  (the guard the client cannot carry)");
    for (const [label, pic] of FORMS.filter(([, p]) => /^["[]/.test(p))) {
      const { after, errors } = await roundTrip(fixture(pic), true);
      rec(`BLANK PICKER: ${label} survives`, errors.length === 0 && after.includes(`picture = ${pic}`),
        errors[0] || show(after));
    }

    console.log("\n4. …and an ordinary token the modder actually CLEARED is still cleared  (over-correction control)");
    {
      // ⭐ The rescue must not become "a picture can never be removed". A bare sprite token IS something the
      // picker can represent, so an empty box there is a real choice, not a failure to render.
      const { after, errors } = await roundTrip(fixture("GFX_report_event_generic_read_write"), true);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ clearing an ordinary picture still removes the line", !/(^|\n)\s*picture\s*=/.test(after), show(after));
    }

    console.log("\n5. …and a picture NESTED in an effect never outranks the event's own");
    {
      // ⛔ #event-nested-picture-wins — the control this test was missing, and the reason it was missing is
      // the point: adding the quoted branch AHEAD of the bare one made a nested
      // `create_corps_commander = { … picture = "generals/Peter_Walls.dds" }` beat the event's real
      // `picture = GFX_report_event_iraq_war7`, and a no-edit save SWAPPED the event's picture for a
      // general's portrait. Every pattern here used to be a regex over the whole block; it only ever worked
      // because the event's own picture usually comes first. The reader resolves the DEPTH-1 statement now.
      const NESTED = `add_namespace = qpic

country_event = {
\tid = qpic.1
\ttitle = qpic.1.t
\tpicture = GFX_report_event_iraq_war7
\tis_triggered_only = yes

\toption = {
\t\tname = qpic.1.a
\t\tcreate_corps_commander = {
\t\t\tname = "Peter Walls"
\t\t\tpicture = "generals/Peter_Walls.dds"
\t\t\tskill = 4
\t\t}
\t}
}
`;
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qpic-nest-"));
      made.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Q Pic"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.join(mod, "events"), { recursive: true });
      fs.writeFileSync(path.join(mod, "events", "probe.txt"), NESTED, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      rec("⭐ READ: the event's OWN picture is the one reported",
        ((list.events || [])[0] || {}).picture === "GFX_report_event_iraq_war7",
        JSON.stringify(((list.events || [])[0] || {}).picture));
      const { after, errors } = await roundTrip(NESTED);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ SAVE: the event keeps its own picture", /(^|\n)\s*picture\s*=\s*GFX_report_event_iraq_war7/.test(after), show(after));
      rec("⭐ …and the general's portrait stays inside the commander block",
        /create_corps_commander[\s\S]*picture = "generals\/Peter_Walls\.dds"/.test(after), show(after));
      rec("…and the event did not gain a second picture line",
        (after.match(/^[ \t]*picture[ \t]*=/gm) || []).length === 2, show(after));
    }

    console.log("\n6. …and a commented-out picture is still not mistaken for the real one");
    {
      const text = fixture('"[GetCapitulationImage]"').replace("\tis_triggered_only", "\t#picture = GFX_wrong_one\n\tis_triggered_only");
      rec("CONTROL: the fixture really carries both", /#picture = GFX_wrong_one/.test(text) && /picture = "\[GetCapitulationImage\]"/.test(text));
      const { after, errors } = await roundTrip(text);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the LIVE quoted picture wins", after.includes('picture = "[GetCapitulationImage]"'), show(after));
      rec("…and the commented one is still commented", /#picture = GFX_wrong_one/.test(after), show(after));
      rec("…and did not become live", !/(^|\n)\s*picture\s*=\s*GFX_wrong_one/.test(after), show(after));
    }

    console.log("\n7. Measured on the vanilla file that ships one");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/MUN_Czechoslovakia.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's MUN_Czechoslovakia.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      const quoted = (t) => (t.match(/^[ \t]*picture[ \t]*=[ \t]*"/gm) || []).length;
      const anyPic = (t) => (t.match(/^[ \t]*picture[ \t]*=/gm) || []).length;
      rec("the fixture HAS the property: it writes a quoted picture", quoted(original) > 0, `${quoted(original)} quoted`);
      const { after, errors } = await roundTrip(original);
      rec("every event in it saved without error", errors.length === 0, errors[0]);
      rec("⭐ every quoted picture survives", quoted(after) === quoted(original), `${quoted(original)} -> ${quoted(after)}`);
      rec("⭐ …and no picture line at all was lost", anyPic(after) >= anyPic(original), `${anyPic(original)} -> ${anyPic(after)}`);
    }

    console.log(`\n=== a quoted event picture is not deleted: ${checks} checks, ${fails.length} failed ===`);
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
