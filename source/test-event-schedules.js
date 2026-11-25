// test-event-schedules.js
// Verifies GET /api/history/event-schedules — the bulk scan that powers the "🕓 when it fires"
// badge on every events-list card. It reads every history/countries file once and returns a map of
// eventId -> { days, hours, tags } covering BOTH scheduling forms:
//   block : country_event = { id = ns.1 days = N hours = M }
//   bare  : country_event = ns.1            (fires at game start, days/hours = 0)
// It must: capture days+hours, gather every owning country tag, dedupe ids across files, and leave
// events that are never scheduled in history (triggered_only / on_action-fired) OUT of the map.
//
// Run: node test-event-schedules.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3607;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  PASS " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); }
};
const get = async (r) => (await fetch(BASE + r)).json();

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evsched-"));
  const dir = path.join(mod, "history", "countries");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EvSched"\n', "utf8");

  // ARM: a delayed block (days+hours) and a bare game-start event in the same file.
  fs.writeFileSync(path.join(dir, "ARM - Armenia.txt"),
    "capital = 1\n" +
    "country_event = { id = arme.2 days = 80 hours = 5 }\n" +
    "country_event = saga.1\n", "utf8");
  // ISR + PAL both schedule the SAME event (two owners) — and a comment line that must be ignored.
  fs.writeFileSync(path.join(dir, "ISR - Israel.txt"),
    "country_event = { id = israel.23 days = 193 }\n" +
    "# country_event = { id = commented.9 days = 1 }\n", "utf8");
  fs.writeFileSync(path.join(dir, "PAL - Palestine.txt"),
    "country_event = { id = israel.23 days = 193 }\n", "utf8");
  // A file whose only event is triggered elsewhere (no country_event in history) — must NOT appear.
  fs.writeFileSync(path.join(dir, "USA - America.txt"), "capital = 361\nset_politics = { ruling_party = neutrality }\n", "utf8");

  const enc = encodeURIComponent(mod);
  try {
    console.log("\nEvent fire-time bulk scan (/api/history/event-schedules):");
    const r = await get(`/api/history/event-schedules?modPath=${enc}`);
    ok(r.ok === true, "endpoint ok", r);
    const s = r.schedules || {};

    // Delayed block: days + hours + tag
    ok(s["arme.2"] && s["arme.2"].days === 80 && s["arme.2"].hours === 5, "arme.2: days=80 hours=5", s["arme.2"]);
    ok(s["arme.2"] && s["arme.2"].tags.join(",") === "ARM", "arme.2: owner tag ARM", s["arme.2"]);

    // Bare form: present, days/hours 0
    ok(s["saga.1"] && s["saga.1"].days === 0 && s["saga.1"].hours === 0, "saga.1 (bare): days=0 hours=0", s["saga.1"]);
    ok(s["saga.1"] && s["saga.1"].tags.join(",") === "ARM", "saga.1: owner tag ARM", s["saga.1"]);

    // Two owners merged onto one id, deduped and sorted
    ok(s["israel.23"] && s["israel.23"].days === 193, "israel.23: days=193", s["israel.23"]);
    ok(s["israel.23"] && s["israel.23"].tags.join(",") === "ISR,PAL", "israel.23: owners ISR,PAL merged + sorted", s["israel.23"]);

    // Commented-out scheduling is ignored
    ok(!s["commented.9"], "commented country_event is NOT scheduled", s["commented.9"]);

    // Events never scheduled in history don't appear
    ok(Object.keys(s).length === 3, "exactly 3 scheduled events (no phantom entries)", Object.keys(s));

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) {
    console.error(e); fail++;
  } finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
