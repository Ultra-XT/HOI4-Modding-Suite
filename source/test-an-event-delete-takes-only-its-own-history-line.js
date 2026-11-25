// #event-remove-trimmed-the-history — the Events maker's Delete took an event's country_event line out of every
// history file that fires it, and rewrote both ends of each file as it went.
//
// setCountryEventInHistory removed the line and then ran the rest through .trim() and `+ "\n"`. The Delete reaches it
// through unwireStartupItemEverywhere with the whole file, so a history's trailing blank lines collapsed into one line
// break, its leading blank lines went, and its BOM went too (U+FEFF is whitespace to .trim()). And because the remover
// anchors on `^[ \t]*`, which cannot step over U+FEFF, a country_event on the first line after a BOM was not found at
// all (#unwire-missed-a-bom-first-line): the Delete answered ok and left it.
//
// Every request here is the one public/events.js sends (checked against its source at the end). A removal must give
// back the file with exactly that line taken out: the BOM, every other line, the blank lines at either end, the
// neighbour event whose id starts with the deleted one, and how the file ended.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evline-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok   " + n); } else console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x).slice(0, 600) : "")); };

const MOD = path.join(ROOT, "evline");
for (const d of ["events", "history/countries"]) fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Event line"\nsupported_version="1.16.*"\n', "utf8");
const EVENTS = path.join(MOD, "events", "tst_events.txt");
const EVENTS_TEXT = "add_namespace = tst\r\n\r\n" + ["tst.1", "tst.10"].map((id) =>
  `country_event = {\r\n\tid = ${id}\r\n\ttitle = ${id}.t\r\n\tdesc = ${id}.d\r\n\toption = {\r\n\t\tname = ${id}.a\r\n\t}\r\n}\r\n`).join("\r\n");
const HIST = path.join(MOD, "history", "countries", "TST - Testland.txt");
const BOM = "\uFEFF";
const loneCRs = (s) => (s.match(/\r(?!\n)/g) || []).length;
const read = (p) => fs.readFileSync(p, "utf8");

// [name, history before, the line that must go]. Each expects exactly `before` with that line taken out.
const CASES = [
  ["BOM, blank lines above and below, trailing blank lines (the shipped shape)",
    BOM + "capital = 1\r\n\r\ncountry_event = tst.1\r\nset_research_slots = 3\r\n\r\n\r\n", "country_event = tst.1\r\n"],
  ["the neighbour tst.10 stays; leading blank lines stay; the block form goes",
    "\r\n\r\ncapital = 1\r\ncountry_event = { id = tst.1 days = 3 }\r\ncountry_event = tst.10\r\n", "country_event = { id = tst.1 days = 3 }\r\n"],
  ["the country_event is the first line, right after the BOM",
    BOM + "country_event = tst.1\r\ncapital = 1\r\n", "country_event = tst.1\r\n"],
  ["the last line, with no newline after it",
    BOM + "capital = 1\r\nset_research_slots = 3\r\ncountry_event = tst.1", "\r\ncountry_event = tst.1"],
  ["an LF file with a trailing comment on the line and blank lines after",
    "capital = 1\n# fired on day one\ncountry_event = tst.1 # the opening\n\n\n", "country_event = tst.1 # the opening\n"],
];

const PORT = Number(process.env.NOVA_TEST_PORT) || 0;
const app = createApp();
const server = app.listen(PORT, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (u, b) => fetch(base + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  // public/events.js, the Delete button: { modPath, eventId: fullId, fileName: loadedEventFileName || undefined }
  const del = (eventId) => post("/api/events/delete-definition", { modPath: MOD, eventId, fileName: "tst_events.txt" });
  // public/events.js, an owner chip taken off on Save: the same set-startup body with active false
  const unchip = (tag, id) => post("/api/history/set-startup", { tag, itemId: id, itemType: "event", active: false, eventDays: 0, eventHours: 0, modPath: MOD });

  try {
    for (const [name, before, line] of CASES) {
      console.log(`\n[delete] ${name}`);
      fs.writeFileSync(EVENTS, EVENTS_TEXT, "utf8");
      fs.writeFileSync(HIST, before, "utf8");
      const r = await del("tst.1");
      ok("the delete succeeds", r.status === 200 && r.body && r.body.ok === true, r);
      const after = read(HIST);
      const expected = before.replace(line, "");
      ok("the history is the original with exactly that line taken out, byte for byte", after === expected, { expected, after });
      ok("its BOM is as it was", (after.charCodeAt(0) === 0xfeff) === (before.charCodeAt(0) === 0xfeff), after.slice(0, 12));
      ok("no lone CR anywhere", loneCRs(after) === 0, after);
    }

    console.log("\n[toggle] the owner chip's Remove is the same remover, through set-startup");
    {
      const before = BOM + "\r\ncapital = 1\r\ncountry_event = tst.1\r\nset_research_slots = 3\r\n\r\n";
      fs.writeFileSync(EVENTS, EVENTS_TEXT, "utf8");
      fs.writeFileSync(HIST, before, "utf8");
      const r = await unchip("TST", "tst.1");
      ok("the remove succeeds", r.status === 200 && r.body && r.body.ok === true && !r.body.unchanged, r);
      const expected = before.replace("country_event = tst.1\r\n", "");
      ok("the history is the original with exactly that line taken out, byte for byte", read(HIST) === expected, { expected, after: read(HIST) });
    }

    console.log("\n[client] the requests above are the ones the page sends");
    {
      const cli = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8")).replace(/\s+/g, " ");
      ok("delete body", cli.includes('fetch("/api/events/delete-definition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: getModPath(), eventId: fullId, fileName: loadedEventFileName || undefined }) })'),
        "events.js changed its delete body: update this test");
      ok("set-startup body", cli.includes('post("/api/history/set-startup", { tag: w.tag, itemId: fullId, itemType: "event", active: w.active, eventDays, eventHours, modPath: getModPath() })'),
        "events.js changed its set-startup body: update this test");
    }

    console.log(`\ntest-an-event-delete-takes-only-its-own-history-line: ${pass}/${total} checks passed`);
  } catch (e) {
    console.log("  FAIL harness threw: " + (e && e.stack || e));
    total++;
  } finally {
    process.exitCode = pass === total && total >= 24 ? 0 : 1;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error: " + e.message); process.exitCode = 1; });
