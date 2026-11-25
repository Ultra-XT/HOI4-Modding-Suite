// #event-duplicate-option-name-collides — TWO OPTIONS MAY LEGALLY SHARE ONE `name`, AND THAT IS A CHOICE.
//
// The name is a localisation key. Writing the same one on two options is how an author makes both buttons
// read the same text AND stay in sync when that text is edited. 239 events across the install and every
// installed mod do it, 37 of them in vanilla — AAT_Denmark.txt's denmark_events.100 ("Welcome him" /
// "Send him away", both `denmark_events.100.a`) and AAT_Sweden.txt's AAT_Sweden_strike.1.
//
// The writer used to rename the second to `<id>.a`/`.b` so every key was unique. The buttons still read
// correctly, because the loc entry is copied — but the author's next edit to the shared key then reaches
// only one of them, and a no-edit save rewrites a shipping file.
//
// ⛔ THE RENAME WAS LOAD-BEARING, WHICH IS THE INTERESTING PART. Five separate injection loops put an
// option's comments back by running a regex for `name = <X>` over the built text and taking the FIRST hit.
// While every name was unique that was exact; the moment two options share one, both resolve to option 1 —
// it takes both notes and option 2 gets none. Removing the rename on its own traded 239 preserved names for
// 16 DELETED comments on AAT_Denmark alone (measured, then reverted).
//
// So the anchors became occurrence-aware first: each loop walks the options in emission order behind a
// cursor that only ever moves forward, past every option including the ones with nothing to inject. Then
// the rename could go. This test pins both halves — the name survives AND each option keeps its own note.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53571;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupname-"));
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

// probe.1 — vanilla's shape: two options, one shared name, a DIFFERENT note above each and a different
//           label on each `option = {` line, so a note landing on the wrong block is visible.
// probe.2 — the case the rename exists for: three options with NO name at all. The UI defaults them all to
//           `<id>.a`, nothing on disk carries that name, and they must still be given distinct keys.
const FIXTURE = `add_namespace = probe

country_event = {
\tid = probe.1
\ttitle = probe.1.t
\tdesc = probe.1.d
\tis_triggered_only = yes

\t# note above the first
\toption = { #label one
\t\tname = probe.1.a
\t\tadd_political_power = 10
\t}
\t# note above the second
\toption = { #label two
\t\tname = probe.1.a
\t\tadd_stability = 0.05
\t}
}

country_event = {
\tid = probe.2
\ttitle = probe.2.t
\tdesc = probe.2.d
\tis_triggered_only = yes

\toption = {
\t\tadd_war_support = 0.01
\t}
\toption = {
\t\tadd_war_support = 0.02
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupname-mod-"));
    made.push(mod);
    const dest = path.join(mod, "events", "probe.txt");
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Dup Name"\nsupported_version="1.16.*"\n');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, FIXTURE, "utf8");

    const saveAll = async () => {
      const j = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const out = [];
      for (const evt of (j.events || [])) {
        const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
        if (!idSplit) continue;
        out.push(await fetch(`${BASE}/api/events/save`, {
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
        }).then((x) => x.json()));
      }
      return { results: out, after: fs.readFileSync(dest, "utf8") };
    };

    console.log("1. The author's shared key survives");
    const { results, after } = await saveAll();
    rec("both events saved", results.every((r) => r && r.error === undefined), JSON.stringify(results).slice(0, 160));
    // ⚠️ CONTROL: the fixture really does share a key. Count it in the SOURCE, or the star below could pass
    // on a file that never had a duplicate.
    rec("CONTROL: the fixture declares the same name twice",
      (FIXTURE.match(/name = probe\.1\.a/g) || []).length === 2, (FIXTURE.match(/name = probe\.1\.a/g) || []).length);
    rec("⭐ both options still carry it after the save",
      (after.match(/name = probe\.1\.a/g) || []).length === 2, (after.match(/name = probe\.1\.a/g) || []).length);
    rec("⭐ …and no `.b` was invented", !/name = probe\.1\.b/.test(after), after.slice(0, 600));
    rec("CONTROL: both options' effects survive",
      /add_political_power = 10/.test(after) && /add_stability = 0\.05/.test(after), after);

    console.log("\n2. …and each option keeps its OWN note  (the anchors, not the rename)");
    {
      // The whole reason the rename existed. With one shared name, a whole-string search for `name = X`
      // resolves both options to the first block: it takes both notes and the second gets none.
      //
      // ⚠️ Assert by POSITION, not by slicing between markers. Slicing from the first `option = {` cut the
      // lead note off the front of option 1 — it sits ABOVE the opening line — and swept option 2's header
      // in at the back, so three assertions failed on output that was already correct.
      const at = (s) => after.indexOf(s);
      rec("CONTROL: every marker is present exactly once", [
        "# note above the first", "#label one", "add_political_power = 10",
        "# note above the second", "#label two", "add_stability = 0.05",
      ].every((s) => (after.split(s).length - 1) === 1), "a marker is missing or duplicated");
      rec("⭐ the first option's note leads the first option, not the second",
        at("# note above the first") < at("#label one") && at("#label one") < at("add_political_power = 10"),
        `note@${at("# note above the first")} label@${at("#label one")} effect@${at("add_political_power = 10")}`);
      rec("⭐ …and the second's leads the SECOND",
        at("add_political_power = 10") < at("# note above the second")
        && at("# note above the second") < at("#label two")
        && at("#label two") < at("add_stability = 0.05"),
        `effect1@${at("add_political_power = 10")} note2@${at("# note above the second")} label2@${at("#label two")}`);
      rec("⭐ each label is on its own option's opening line",
        /option = \{[ \t]*#label one[\s\S]*?option = \{[ \t]*#label two/.test(after), after.slice(0, 700));
      for (const n of ["# note above the first", "# note above the second", "#label one", "#label two"]) {
        rec(`⭐ "${n}" appears exactly once`, (after.split(n).length - 1) === 1, `x${after.split(n).length - 1}`);
      }
    }

    console.log("\n3. CONTROL: nameless options are still given distinct keys");
    {
      // This is what the letters were written for — the UI defaults every nameless option to `<id>.a`, and
      // those duplicates have no on-disk counterpart, so they must still be separated.
      const b2 = after.slice(after.indexOf("id = probe.2"));
      rec("the second event still has two options", (b2.match(/option = \{/g) || []).length === 2,
        (b2.match(/option = \{/g) || []).length);
      rec("⭐ they were given DIFFERENT names", /name = probe\.2\.a/.test(b2) && /name = probe\.2\.b/.test(b2), b2);
      rec("CONTROL: both effects survive",
        /add_war_support = 0\.01/.test(b2) && /add_war_support = 0\.02/.test(b2), b2);
    }

    console.log("\n4. …and a second save changes nothing");
    {
      const again = await saveAll();
      rec("the second save is accepted", again.results.every((r) => r && r.error === undefined), "");
      rec("⭐ the file is byte-identical", again.after === after, "the second save moved something");
      rec("⭐ …and the shared name is still shared",
        (again.after.match(/name = probe\.1\.a/g) || []).length === 2,
        (again.after.match(/name = probe\.1\.a/g) || []).length);
    }

    console.log(`\n=== two options may share one name: ${checks} checks, ${fails.length} failed ===`);
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
