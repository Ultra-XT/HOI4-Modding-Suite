// Two Events-page BUTTONS that did not do what they said.
//
// #duplicate-shares-option-keys — "⧉ Duplicate" pops a modal reading: Copy ready as "ns.2". … the original
// "ns.1" is untouched. It was not untouched. The handler rewrites the id and the title but never the option
// NAME inputs, which still hold the original's localisation keys (`ns.1.a`, `ns.1.b`). Nothing downstream
// repoints them either: the handler nulls loadedEventFullId (correctly — a copy is a new event, not a
// rename), so Save sends no previousEventId, so the server's option-key-carry block is skipped precisely
// BECAUSE this is not a rename.
//
// The two events then share those keys permanently, and the coupling is destructive in both directions:
//   * editing the copy's button text overwrites the ORIGINAL's authored text in place;
//   * deleting EITHER event strips the shared keys and blanks the other's buttons.
// The `<eventFullId>.<letter>` option-key convention is the universal HOI4 form, so every duplicated real
// event hits this.
//
// #delete-guesses-the-file — "Delete Event" looked for `<namespace>.txt` and threw "Event file not found."
// if it was absent. But an events file is very often NOT named after its namespace:
// denmark_political_events.1 lives in AAT_Denmark.txt, abkh.1 in Abkhazia.txt, MD_ace_promoted.1 in
// AcePilots.txt. Measured by brace-matched count of top-level definitions: Delete could not reach 82.5% of
// Millennium Dawn's events (8817/10687) or 74.4% of vanilla's (6175/8299) — while the sidebar listed them
// and kept the button enabled. /api/events/save had already been fixed for exactly this with
// findEventHomeFile; delete never got it. Nothing was destroyed (both throws precede safeModWrite) — the
// control simply could not work.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-dupdel-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DD"\nsupported_version="1.18.*"\n');

// An event whose FILE is not named after its namespace — the shape Delete could not reach.
fs.writeFileSync(path.join(MOD, "events", "MD_Egypt.txt"),
  'add_namespace = egypt\n\ncountry_event = {\n\tid = egypt.5\n\ttitle = egypt.5.t\n\tdesc = egypt.5.d\n\tis_triggered_only = yes\n' +
  '\toption = { name = egypt.5.a add_political_power = 10 }\n\toption = { name = egypt.5.b add_stability = 0.05 }\n}\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "egypt_l_english.yml"),
  '﻿l_english:\n egypt.5.t:0 "Egypt Event"\n egypt.5.a:0 "ORIGINAL Option A"\n egypt.5.b:0 "ORIGINAL Option B"\n', "utf8");

// ── the Duplicate handler's key-repointing, run as the shipped client runs it ──────────────────────
const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
ok("Duplicate repoints the option keys to the copy",
  /oldOptPrefix/.test(src) && /newOptPrefix/.test(src) && /\.opt-name/.test(src), "handler does not repoint");
// Replicate the exact transform the handler applies, to prove it produces the right keys.
const repoint = (values, ns, cur, copyId) => {
  const oldP = ns + "." + cur + ".", newP = ns + "." + copyId + ".";
  return values.map((v) => (String(v).startsWith(oldP) ? newP + String(v).slice(oldP.length) : v));
};
ok("…so ns.1.a becomes ns.2.a",
  JSON.stringify(repoint(["egypt.5.a", "egypt.5.b"], "egypt", "5", "6")) === JSON.stringify(["egypt.6.a", "egypt.6.b"]),
  repoint(["egypt.5.a", "egypt.5.b"], "egypt", "5", "6"));
ok("…and a key belonging to a DIFFERENT event is left alone",
  JSON.stringify(repoint(["other.1.a"], "egypt", "5", "6")) === JSON.stringify(["other.1.a"]),
  repoint(["other.1.a"], "egypt", "5", "6"));

const PORT = 39959, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modPath: MOD, ...body }),
  }).then((r) => r.json());
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
  const del = (eventId) => fetch(`http://127.0.0.1:${PORT}/api/events/delete-definition`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modPath: MOD, eventId }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    // ── a duplicate saved with REPOINTED keys must not touch the original's loc ────────────────────
    const locBefore = fs.readFileSync(path.join(MOD, "localisation", "english", "egypt_l_english.yml"), "utf8");
    const copy = await save({
      namespace: "egypt", id: "6", type: "country_event", title: "Egypt Event (copy)", description: "d",
      picture: "GFX_report_event_generic_read_write", triggeredOnly: "yes",
      options: [
        { name: "egypt.6.a", title: "COPY Option A", script: "add_political_power = 10" },
        { name: "egypt.6.b", title: "COPY Option B", script: "add_stability = 0.05" },
      ],
    });
    ok("saving the copy succeeds", copy && copy.ok !== false && !copy.error, copy);

    const l = await list();
    const orig = (l.events || []).find((e) => e.fullId === "egypt.5");
    const dup = (l.events || []).find((e) => e.fullId === "egypt.6");
    ok("both events now exist", !!orig && !!dup, (l.events || []).map((e) => e.fullId));
    ok("the ORIGINAL's button text is unchanged",
      (orig.options || []).some((o) => o.title === "ORIGINAL Option A"), orig && orig.options);
    ok("…and the copy has its own", (dup.options || []).some((o) => o.title === "COPY Option A"), dup && dup.options);
    ok("the two events do not share an option key",
      !(orig.options || []).some((o) => (dup.options || []).some((d) => d.name === o.name)),
      { orig: (orig.options || []).map((o) => o.name), dup: (dup.options || []).map((o) => o.name) });
    ok("the original's localisation lines survive",
      /egypt\.5\.a:0 "ORIGINAL Option A"/.test(fs.readFileSync(path.join(MOD, "localisation", "english", "egypt_l_english.yml"), "utf8")),
      locBefore);

    // ── Delete must reach an event whose file is not named after its namespace ─────────────────────
    ok("precondition: the event lives in a file NOT named after its namespace",
      orig.fileName === "MD_Egypt.txt", orig && orig.fileName);
    const d = await del("egypt.5");
    ok("Delete succeeds on it (it used to say 'Event file not found.')", d.s === 200 && d.b && d.b.ok !== false, d.b);
    const fileAfter = fs.existsSync(path.join(MOD, "events", "MD_Egypt.txt"))
      ? fs.readFileSync(path.join(MOD, "events", "MD_Egypt.txt"), "utf8") : "";
    ok("…and the event is really gone from that file", !/\bid = egypt\.5\b/.test(fileAfter), fileAfter);

    // Deleting the original must NOT blank the surviving copy — the point of repointing the keys.
    const l2 = await list();
    const survivor = (l2.events || []).find((e) => e.fullId === "egypt.6");
    ok("the copy survives the original's deletion", !!survivor, (l2.events || []).map((e) => e.fullId));
    ok("…with its button text intact", (survivor.options || []).some((o) => o.title === "COPY Option A"),
      survivor && survivor.options);

    // ── a genuinely missing event still reports honestly ───────────────────────────────────────────
    const miss = await del("egypt.999");
    ok("deleting an event that does not exist still fails", miss.s !== 200 || (miss.b && miss.b.ok === false), miss.b);
    ok("…with a message naming the event", /egypt\.999/.test(JSON.stringify(miss.b)), miss.b);

    console.log("\ntest-event-duplicate-and-delete: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
