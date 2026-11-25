// #event-rename-orphans-schedule — renaming an event left the old id scheduled in the country's history, so
// the country fired a dead event at game start alongside the new one.
//
// The rename block removed the old event's definition and its localisation and stopped there — even though the
// DELETE path already unwires history via unwireStartupItemEverywhere. Worse, the Events page then syncs
// owners for the NEW id only: it POSTs an `active:true` for the new id and never an `active:false` for the old
// one, so the history GAINED a second scheduled event and KEPT the dangling one.
//
// Both shapes count, the same two the liveness check reads:
//   country_event = <id>
//   country_event = { id = <id> days = N }
// across country_event / news_event / state_event. Whole-word, so renaming `ns.1` leaves `ns.10` alone — and
// never inside a comment.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-evsched-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["events", "history/countries", "localisation/english"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="E"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "events", "ZZ_ev.txt"),
  "add_namespace = probe_ns\n\ncountry_event = {\n\tid = probe_ns.1\n\ttitle = probe_ns.1.t\n\tdesc = probe_ns.1.d\n" +
  "\tis_triggered_only = yes\n\toption = { name = probe_ns.1.a }\n}\n", "utf8");
const HIST = path.join(MOD, "history", "countries", "ABC - Testland.txt");
fs.writeFileSync(HIST,
  "capital = 1\n\ncountry_event = probe_ns.1\ncountry_event = { id = probe_ns.1 days = 5 }\n" +
  "news_event = probe_ns.1\ncountry_event = probe_ns.10\ncountry_event = other_ns.1\n#country_event = probe_ns.1\n", "utf8");

const PORT = 40025, app = createApp();
const server = app.listen(PORT, async () => {
  const hist = () => fs.readFileSync(HIST, "utf8");
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: "probe_ns", id: "7", previousEventId: "probe_ns.1", type: "country_event",
        title: "T", description: "D", triggeredOnly: "yes", options: [{ name: "probe_ns.7.a", title: "B", script: "" }],
      }),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    // Assert the operation succeeded before asserting anything about its effects.
    ok("the rename save succeeds", r.status === 200 && r.body && r.body.ok, r);
    ok("…and reports what it renamed from", r.body.renamedFrom === "probe_ns.1", r.body.renamedFrom);

    const h = hist();
    // ── the bug ──────────────────────────────────────────────────────────────────────────────────
    ok("THE BARE SCHEDULE FOLLOWS THE RENAME", /^country_event = probe_ns\.7$/m.test(h), h);
    ok("…so does the DELAYED block form", /country_event = \{ id = probe_ns\.7 days = 5 \}/.test(h), h);
    ok("…with its days preserved", /days = 5/.test(h), h);
    ok("…and a news_event schedule too", /^news_event = probe_ns\.7$/m.test(h), h);
    ok("no live schedule still names the old id", !/^[^\n#]*=\s*probe_ns\.1\s*$/m.test(h) && !/\{ id = probe_ns\.1 /.test(h), h);

    // ── what must NOT change ─────────────────────────────────────────────────────────────────────
    ok("a LOOKALIKE id is untouched", /^country_event = probe_ns\.10$/m.test(h), h);
    ok("…an unrelated namespace too", /^country_event = other_ns\.1$/m.test(h), h);
    ok("…and a COMMENTED schedule is left exactly as written", /^#country_event = probe_ns\.1$/m.test(h), h);
    ok("the rest of the file survived", /capital = 1/.test(h), h);

    // ── a plain edit must not touch history ─────────────────────────────────────────────────────
    const before = hist();
    const r2 = await fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, namespace: "probe_ns", id: "7", type: "country_event",
        title: "T2", description: "D", triggeredOnly: "yes", options: [{ name: "probe_ns.7.a", title: "B", script: "" }],
      }),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    ok("a plain edit with no previousEventId succeeds", r2.status === 200 && r2.body && r2.body.ok, r2);
    ok("…and the history is byte-identical", hist() === before, hist());

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a schedule-rename walk", /function renameEventRefsInCountryHistory\(modRoot, oldId, newId\)/.test(src), "missing");
    ok("…handling the delayed block form", src.includes("\\bid\\s*=\\s*"), "block form not handled");
    ok("…called from the rename cleanup", /renameEventRefsInCountryHistory\(activeRoot, prevEventId, eventFullId\)/.test(src), "not wired in");
    ok("…and it explains why", /#event-rename-orphans-schedule/.test(src), "no marker comment");

    console.log("\ntest-event-rename-schedule: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 16 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
