// ⛔ #no-invented-event-header-keys — AN EVENT WITH NO TITLE WAS GIVEN ONE BY A SAVE THAT CHANGED NOTHING.
//
// The writer emitted `title`, `desc` and `is_triggered_only` unconditionally. Counted over the 52,057 event
// blocks in the install and every installed mod:
//
//     no `title =` at all        900   (893 of them HIDDEN — a hidden event has no title BY DESIGN)
//     no `desc  =` at all        918
//     no `is_triggered_only`   5,048
//
// 137 and 399 of those are VANILLA. And the title is not inert: the save generates English localisation for
// the key it invents, so the mod also gains loc entries for a title no player can ever see.
//
// The guard for this already existed three lines above, for `picture` — `existedOnDisk`, added because
// "opening any of them and pressing Save gave the player a picture the author had deliberately left out".
// Three more emitters in the same template never adopted it. That is the dominant bug shape on this project.
//
// ⚠️ TWO LOCATORS. `existedOnDisk` comes from parseEventsFromFile; the key evidence comes from
// extractPreservedEventBody. If the first finds the event and the second does not, "no title on disk" is a
// fact about the failed READ, not about the event — and omitting the line would delete a real title. So the
// omission requires `preserved.found` too. Section 4 builds that disagreement on purpose.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53547;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evinvent-"));
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
const show = (t) => String(t).slice(0, 260).replace(/\n/g, "|");

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Saves every event in the file, sending exactly what public/events.js sends.
    const roundTrip = async (text, override) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evinvent-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Invent"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const errors = [];
      for (const evt of list.events || []) {
        const dot = String(evt.fullId || "").lastIndexOf(".");
        const body = {
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
            script: String(o.script || "").trim(), aiChance: null, trigger: "",
          })),
          ...(override || {}),
        };
        const res = await fetch(`${BASE}/api/events/save`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then((r) => r.json());
        if (res && res.error) errors.push(String(res.error).slice(0, 80));
      }
      return { mod, after: fs.readFileSync(dest, "utf8"), events: list.events || [], errors };
    };

    // A hidden event as modders actually write them: no title, no desc, no is_triggered_only.
    const HIDDEN = `add_namespace = invent_probe

country_event = {
\tid = invent_probe.1
\thidden = yes

\tmean_time_to_happen = {
\t\tdays = 5
\t}

\toption = {
\t\tname = invent_probe.1.a
\t\tadd_political_power = 5
\t}
}
`;

    console.log("1. A hidden event with no title keeps not having one");
    {
      const { after, errors, mod } = await roundTrip(HIDDEN);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ no `title` line is invented", !/(^|\n)\s*title\s*=/.test(after), show(after));
      rec("⭐ no `desc` line is invented", !/(^|\n)\s*desc\s*=/.test(after), show(after));
      rec("⭐ no `is_triggered_only` line is invented", !/(^|\n)\s*is_triggered_only\s*=/.test(after), show(after));
      rec("…and the hidden flag it DID write is still there", /(^|\n)\s*hidden\s*=\s*yes/.test(after), show(after));
      rec("…and its mtth survives", /days\s*=\s*5/.test(after), show(after));
      // No blank line where the omitted keys used to be — an omission must not leave a hole.
      rec("…and the block has no double blank line", !/\n[ \t]*\n[ \t]*\n/.test(after), JSON.stringify(after.slice(0, 120)));
      // The invented title also invented a LOC key. Nothing should have been written for a title nobody set.
      const loc = path.join(mod, "localisation", "english", "custom_events_l_english.yml");
      const locText = fs.existsSync(loc) ? fs.readFileSync(loc, "utf8") : "";
      rec("⭐ …and no localisation was generated for the title it did not write",
        !/invent_probe\.1\.[td]\s*:/.test(locText), locText.slice(0, 200).replace(/\n/g, "|"));
    }

    console.log("\n2. …but a key the author DID write is kept, in every form  (preservation control)");
    for (const [label, line, probe] of [
      ["a plain title", "title = invent_probe.1.t", /(^|\n)\s*title\s*=\s*invent_probe\.1\.t/],
      ["a title pointing at the author's own key", "title = SOME_OTHER_KEY", /(^|\n)\s*title\s*=\s*SOME_OTHER_KEY/],
      ["a desc", "desc = invent_probe.1.d", /(^|\n)\s*desc\s*=\s*invent_probe\.1\.d/],
      ["an explicit is_triggered_only = no", "is_triggered_only = no", /(^|\n)\s*is_triggered_only\s*=\s*no/],
      ["an is_triggered_only = yes", "is_triggered_only = yes", /(^|\n)\s*is_triggered_only\s*=\s*yes/],
    ]) {
      const { after, errors } = await roundTrip(HIDDEN.replace("\thidden = yes\n", `\thidden = yes\n\t${line}\n`));
      rec(`${label} was saved without error`, errors.length === 0, errors[0]);
      rec(`…and \`${line}\` survives`, probe.test(after), show(after));
    }

    console.log("\n3. …and typing a title into the box still gives the event one  (the other direction)");
    {
      // The one way an existing titleless event SHOULD gain a title: the modder set one.
      const { after, errors, mod } = await roundTrip(HIDDEN, { title: "A Secret Meeting" });
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the event gains a title line", /(^|\n)\s*title\s*=\s*invent_probe\.1\.t/.test(after), show(after));
      const loc = path.join(mod, "localisation", "english", "custom_events_l_english.yml");
      const locText = fs.existsSync(loc) ? fs.readFileSync(loc, "utf8") : "";
      rec("…and the localisation for it is written", /invent_probe\.1\.t\s*:.*A Secret Meeting/.test(locText),
        locText.slice(0, 200).replace(/\n/g, "|"));
    }

    console.log("\n4. A NEW event still gets the maker's own template");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evinvent-new-"));
      made.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Invent"\nsupported_version="1.16.*"\n');
      const res = await fetch(`${BASE}/api/events/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, namespace: "brand_new", id: "1", type: "country_event",
          title: "", description: "", picture: "", triggeredOnly: "no", hidden: "no",
          fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "", after: "",
          timeoutDays: 0, options: [{ name: "", title: "", script: "", aiChance: null, trigger: "" }],
        }),
      }).then((r) => r.json());
      rec("the new event saved", !res.error, res.error);
      const f = path.join(mod, "events", "brand_new.txt");
      const t = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
      // Nothing was on disk to preserve, so the template is not an invention — it is the maker's default,
      // and stripping it would leave a modder with an event the editor cannot round-trip.
      rec("⭐ it still gets title/desc/is_triggered_only", /title\s*=/.test(t) && /desc\s*=/.test(t) && /is_triggered_only\s*=/.test(t), show(t));
      rec("…and a picture", /picture\s*=/.test(t), show(t));
    }

    console.log("\n5. When the two readers disagree, the line is WRITTEN, not dropped  (safety control)");
    {
      // ⭐ The failure mode the `preserved.found` half of the gate exists for, built on purpose: a server
      // whose preserve reader always comes back empty, over an event that IS on disk and DOES have a title.
      // Without that half, "no title in `preserved`" reads as "the event has no title" and the authored line
      // is deleted. This is the state a real unparseable file puts the writer in — the two readers are
      // separate code, so they can disagree — and the point of the control is that the gate errs towards
      // writing the line rather than removing one that is really there.
      const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const wasCrlf = raw.includes("\r\n");
      let src = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
      const ANCHOR = "  const empty = { found: false, lines: [], hasRichMtth: false,";
      if (src.split(ANCHOR).length !== 2) {
        rec("the control's anchor is present and unique", false, `${src.split(ANCHOR).length - 1} matches`);
      } else {
        // Make extractPreservedEventBody return its own empty result for every event, always.
        const line = src.slice(src.indexOf(ANCHOR), src.indexOf("\n", src.indexOf(ANCHOR)));
        src = src.replace(line, () => line + "\n  if (process.env.NOVA_CTL_BLIND_PRESERVE) return empty;");
        const ctl = path.join(__dirname, `.ctl-evinvent-${process.pid}.js`);
        fs.writeFileSync(ctl, wasCrlf ? src.replace(/\n/g, "\r\n") : src, "utf8");
        made.push(ctl);
        process.env.NOVA_CTL_BLIND_PRESERVE = "1";
        let ctlServer;
        try {
          const ctlApp = require(ctl).createApp();
          // ⚠️ SPELLED OUT AS A LITERAL. The runner schedules by what a file CLAIMS, and it reads those
          // claims out of the source — `PORT + 1` is a port this file binds that no scan can see, so it
          // would be free to run beside whoever else owns 53548.
          const CPORT = 53548;
          ctlServer = await new Promise((r) => { const s = ctlApp.listen(CPORT, () => r(s)); });
          const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evinvent-ctl-"));
          made.push(mod);
          const dest = path.join(mod, "events", "probe.txt");
          fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Invent"\nsupported_version="1.16.*"\n');
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, `add_namespace = blindns

country_event = {
\tid = blindns.1
\ttitle = blindns.1.t
\tdesc = blindns.1.d
\tis_triggered_only = yes
\tsome_unmodelled_key = 7

\toption = {
\t\tname = blindns.1.a
\t}
}
`, "utf8");
          const res = await fetch(`http://127.0.0.1:${CPORT}/api/events/save`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modPath: mod, namespace: "blindns", id: "1", type: "country_event",
              title: "", description: "", picture: "", triggeredOnly: "yes", hidden: "no",
              fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "", after: "",
              timeoutDays: 0, options: [{ name: "blindns.1.a", title: "", script: "", aiChance: null, trigger: "" }],
            }),
          }).then((r) => r.json());
          rec("the control server saved the event", !res.error, res.error);
          const t = fs.readFileSync(dest, "utf8");
          // ⚠️ ASSERT THE CONTROL HAS THE PROPERTY IT CLAIMS. `preserved.lines` is what carries unmodelled
          // keys forward, so a genuinely blinded reader DROPS `some_unmodelled_key`. If this does not bite,
          // the patch never took and the three checks below are measuring the ordinary server.
          rec("the control really did blind the preserve reader", !/some_unmodelled_key/.test(t), show(t));
          rec("⭐ the authored title is written anyway, not dropped", /(^|\n)\s*title\s*=/.test(t), show(t));
          rec("⭐ …and so is the desc", /(^|\n)\s*desc\s*=/.test(t), show(t));
          rec("⭐ …and the is_triggered_only", /(^|\n)\s*is_triggered_only\s*=/.test(t), show(t));
        } catch (e) {
          rec("the control server started", false, String(e && e.message).slice(0, 120));
        } finally {
          delete process.env.NOVA_CTL_BLIND_PRESERVE;
          if (ctlServer) { try { ctlServer.closeAllConnections && ctlServer.closeAllConnections(); } catch (_) {} await new Promise((r) => ctlServer.close(r)); }
        }
      }
    }

    console.log("\n6. Measured on a vanilla file that really has a titleless event");
    // The smallest vanilla file carrying BOTH shapes: 9 events, one with no `title` and one with no
    // `is_triggered_only`. ⚠️ The first file I reached for here had a title on all six of its events, so it
    // could only ever have measured the preservation half — hence the fixture-has-the-property check below.
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/MTG_naval_treaty_events.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's MTG_naval_treaty_events.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      const count = (t, re) => (t.match(re) || []).length;
      const before = { title: count(original, /(^|\n)\s*title\s*=/g), trig: count(original, /(^|\n)\s*is_triggered_only\s*=/g) };
      // ⚠️ Counted as TOP-LEVEL blocks, over the file with comments masked. A plain regex count is wrong
      // twice over: a commented-out `country_event = {` is not an event, and neither is `country_event = {
      // id = x days = 5 }` written INSIDE an option — that is the effect that fires one. Both inflate the
      // count, and this check is looking for a gap, so an inflated count would make it pass on any file.
      const evtCount = (() => {
        const t = original.replace(/#[^\n]*/g, "");
        const re = /(^|\n)\s*[A-Za-z_][A-Za-z0-9_]*_event\s*=\s*\{/g;
        let n = 0, m;
        while ((m = re.exec(t))) {
          let i = t.indexOf("{", m.index), d = 0, j = i;
          for (; j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) break; } }
          n++;
          re.lastIndex = j; // skip the whole block, so nested event-firing effects are not counted
        }
        return n;
      })();
      rec("the fixture HAS the property: fewer title lines than events", before.title < evtCount,
        `${before.title} titles, ${evtCount} events`);
      rec("…and fewer is_triggered_only lines than events", before.trig < evtCount,
        `${before.trig} is_triggered_only, ${evtCount} events`);
      const { after, errors } = await roundTrip(original);
      rec("every event in it saved without error", errors.length === 0, errors[0]);
      rec("⭐ the file gains no title line it did not have", count(after, /(^|\n)\s*title\s*=/g) === before.title,
        `${before.title} -> ${count(after, /(^|\n)\s*title\s*=/g)}`);
      rec("⭐ …nor an is_triggered_only", count(after, /(^|\n)\s*is_triggered_only\s*=/g) === before.trig,
        `${before.trig} -> ${count(after, /(^|\n)\s*is_triggered_only\s*=/g)}`);
      // …and nothing was lost to buy that. Counted, not sampled: `major` alone would be vacuous here —
      // this file has none — so the check is over every distinct line the file contains.
      //
      // ⚠️ COMMENTS ARE STRIPPED FROM THIS ONE COUNT, and that is a concession, not a design choice: a
      // trailing comment on the `option = {` line itself is dropped by the writer today, eight times in this
      // very file (`option = { #accept`, `#refuse`, `#great`…). That is a real bug and a different one —
      // the injection puts a trailing note back on an event's own top-level keys, and `option` is excluded
      // there because options are matched by name. Left in, this check would fail for that reason instead of
      // measuring what it is here to measure. #option-trailing-comment-dropped
      //
      // ⚠️ And the unit is the LEAF ASSIGNMENT, not the line. A whole-line multiset also fails here, on
      // `mean_time_to_happen = { days = 2 }` — which the writer re-emits across three lines. That is a
      // reformat, not a loss, and a line-shaped measure cannot tell the two apart.
      const bag = (t) => {
        const m = new Map();
        const src = t.replace(/#[^\n]*/g, "");
        const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("[^"]*"|[^\s{}]+)/g;
        let x;
        while ((x = re.exec(src))) { const k = `${x[1]} = ${x[2]}`; m.set(k, (m.get(k) || 0) + 1); }
        return m;
      };
      const A = bag(original), B = bag(after);
      const lost = [...A].filter(([k, n]) => (B.get(k) || 0) < n).map(([k, n]) => `${k} (${n}->${B.get(k) || 0})`);
      rec("…and not one leaf assignment is lost to buy it", lost.length === 0, lost.slice(0, 4).join(" · "));
    }

    console.log(`\n=== an event does not gain a key it never had: ${checks} checks, ${fails.length} failed ===`);
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
