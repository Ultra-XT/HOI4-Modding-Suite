// ⛔ #authored-falsy-event-key — AN EVENT KEY WRITTEN OUT AS `= no` WAS DELETED BY A SAVE THAT CHANGED
// NOTHING.
//
// The writer emits the modelled flags only when TRUTHY (`if (major === "yes")`), because in HOI4 absent
// already means no. And the preserve path skips them, because they ARE modelled — so an author who spelled
// the default out in full fell between the two and lost the line. Measured across the install and every
// installed mod: `fire_only_once = no` 530, `major = no` 108, `hidden = no` 99, `timeout_days = 0` 24 —
// 334 of them in VANILLA. (`is_triggered_only` was in that census too and is NOT affected: the writer emits
// it unconditionally as yes-or-no.)
//
// ⚠️ THE VALUE, NOT THE PRESENCE, IS WHAT MUST BE RECORDED — which is the whole reason this needs a test
// rather than a one-line change. Re-emitting a falsy value because the key *existed* would break the switch
// off: an author's `timeout_days = 30` that the user clears has to go back to ABSENT, meaning "never times
// out", not to `timeout_days = 0`, which HOI4 reads as a timeout of zero. Same for the flags — turning
// `major` off must remove the line, not rewrite it. So cases 2 and 3 below are the load-bearing ones: they
// pin the over-correction this fix could so easily have been.
//
// The corpus case uses vanilla's own TAOG_NewsEvents.txt, which carries `major = yes` and `major = no` in
// two events side by side — a control pair Paradox wrote, in 532 bytes.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53546;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evfalsy-"));
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

// One event, one extra line — so the only variable is the line under test.
const fixture = (line) => `add_namespace = falsy_probe

country_event = {
\tid = falsy_probe.1
\ttitle = falsy_probe.1.t
\tdesc = falsy_probe.1.d
\tis_triggered_only = yes
${line ? "\t" + line + "\n" : ""}
\toption = {
\t\tname = falsy_probe.1.a
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Saves every event in the file, sending exactly what public/events.js sends. `override` stands in for
    // the user changing a field in the form — nothing else about the request differs.
    const roundTrip = async (text, override) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evfalsy-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Falsy"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const errors = [];
      for (const evt of list.events || []) {
        // 🈯 The list returns `fullId`, and the namespace splits on the LAST dot — a namespace may itself
        // contain dots (`israel.coalition.5`). Sending `evt.id` instead got every save REFUSED, and the
        // assertions all passed anyway, because an unwritten file still holds the line being looked for.
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
        if (res && res.error) errors.push(String(res.error).slice(0, 70));
      }
      return { after: fs.readFileSync(dest, "utf8"), events: list.events || [], errors };
    };

    console.log("1. A default the author spelled out survives a save that changes nothing");
    // ⚠️ A REFUSED SAVE PASSES EVERY ASSERTION HERE — the file still says what it said. So the error check
    // is not politeness, it is what makes the case mean anything. (It caught the first draft of this test,
    // which sent the wrong namespace and reported four cheerful oks against four rejected requests.)
    for (const line of ["major = no", "hidden = no", "fire_only_once = no", "timeout_days = 0"]) {
      const { after, errors } = await roundTrip(fixture(line));
      const n = (after.match(new RegExp(line.replace(/ /g, "\\s*"), "g")) || []).length;
      rec(`the save of the \`${line}\` event was accepted`, errors.length === 0, errors[0]);
      rec(`…and \`${line}\` is still there`, n === 1, `${n} occurrences: ` + after.slice(0, 130).replace(/\n/g, "|"));
    }

    console.log("\n2. …and one the author never wrote is NOT invented  (over-correction control)");
    {
      const { after, errors } = await roundTrip(fixture(""));
      rec("no save error", errors.length === 0, errors[0]);
      for (const k of ["major", "hidden", "fire_only_once", "timeout_days"]) {
        rec(`no \`${k}\` line appears`, !new RegExp(`(^|\\n)\\s*${k}\\s*=`).test(after), after.slice(0, 200).replace(/\n/g, "|"));
      }
    }

    console.log("\n3. …and switching one OFF removes the line, it does not rewrite it as `= no`");
    // ⭐ The load-bearing case. `timeout_days = 0` is a timeout of ZERO, not "no timeout" — restoring a
    // falsy line on the strength of the key having existed would silently change what the event does.
    {
      const { after, errors } = await roundTrip(fixture("major = yes"), { major: "no" });
      rec("no save error", errors.length === 0, errors[0]);
      rec("⭐ `major = yes` turned off leaves NO major line", !/(^|\n)\s*major\s*=/.test(after),
        after.slice(0, 200).replace(/\n/g, "|"));
    }
    {
      const { after, errors } = await roundTrip(fixture("timeout_days = 30"), { timeoutDays: 0 });
      rec("no save error", errors.length === 0, errors[0]);
      rec("⭐ a cleared `timeout_days = 30` leaves NO timeout line", !/(^|\n)\s*timeout_days\s*=/.test(after),
        after.slice(0, 200).replace(/\n/g, "|"));
      rec("…and specifically does not become `timeout_days = 0`", !/timeout_days\s*=\s*0/.test(after));
    }

    console.log("\n4. Measured on the vanilla file that carries both sides of it");
    const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events/TAOG_NewsEvents.txt";
    if (!fs.existsSync(REAL)) {
      rec("vanilla's TAOG_NewsEvents.txt is installed", false, "cannot verify against the corpus");
    } else {
      const original = fs.readFileSync(REAL, "utf8");
      // Assert the fixture has the property before trusting what it measures.
      rec("it writes `major = yes` in one event and `major = no` in the other",
        /\n\s*major\s*=\s*yes/.test(original) && /\n\s*major\s*=\s*no/.test(original));
      const { after, errors, events } = await roundTrip(original);
      rec("both events were saved without error", errors.length === 0 && events.length === 2,
        errors.length ? errors[0] : events.length + " events");
      rec("⭐ the `major = no` survives", /\n\s*major\s*=\s*no/.test(after), after.slice(0, 160).replace(/\n/g, "|"));
      rec("…and the `major = yes` beside it is untouched", (after.match(/major\s*=\s*yes/g) || []).length === 1);
      const norm = (t) => t.replace(/^\uFEFF/, "").replace(/\r/g, "").replace(/\s+$/, "");
      void norm;
      // No line lost and none invented, counted. ⚠️ A MULTISET IS BLIND TO POSITION, so it is the wrong
      // measure for comments — their position is pinned by test-a-detached-note-above-an-option-survives.js
      // instead. Here it is the right one, because what this fix owns is exactly presence and count.
      //
      // Byte-identity is deliberately NOT asserted: two cosmetic differences survive a no-edit save of this
      // file and neither of them is this bug. Vanilla puts a TAB on its blank separator lines and the writer
      // emits them empty; and the writer re-synthesises the flag block as a unit, so `is_triggered_only`
      // comes out above `major` where the author had it below. Both are whitespace and key ORDER within a
      // block, neither of which HOI4 reads — asserting them here would fail this test for a reason it is
      // not about.
      const bag = (t) => {
        const m = new Map();
        for (const ln of t.replace(/\r/g, "").split("\n")) {
          const k = ln.trim();
          if (k) m.set(k, (m.get(k) || 0) + 1);
        }
        return m;
      };
      const A = bag(original), B = bag(after);
      const lost = [...A].filter(([k, n]) => (B.get(k) || 0) < n).map(([k, n]) => `${k} (${n}->${B.get(k) || 0})`);
      const gained = [...B].filter(([k, n]) => (A.get(k) || 0) < n).map(([k, n]) => `${k} (${A.get(k) || 0}->${n})`);
      rec("⭐ …and not one line of the file is lost", lost.length === 0, lost.slice(0, 4).join(" · "));
      rec("⭐ …nor one invented", gained.length === 0, gained.slice(0, 4).join(" · "));
    }

    console.log(`\n=== an authored default on an event survives: ${checks} checks, ${fails.length} failed ===`);
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
