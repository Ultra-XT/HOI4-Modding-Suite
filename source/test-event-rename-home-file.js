// #event-rename-duplicates — renaming an event created a SECOND event instead of renaming the first.
//
// /api/events/save resolves the file to write with `findEventHomeFile(activeRoot, "<namespace>.<id>")` so it
// edits an event where it already lives (#event-home-file). On a RENAME the new id is not on disk yet, so
// that lookup always returned "" and fell through to `<namespace>.txt`. The renamed event was written into a
// brand-new file while the original stayed put in the author's own events file, fully localised.
//
// The rename cleanup at the end of the handler then re-read `eventPath` — that same NEW file — and called
// modifyEventInFile(txt, prevEventId, ""). The old id was never in that file, so `stripped.found` was false,
// neither the old block nor removeEventLocalizationLines(prevEventId) ran, and the response reported
// `renamedFrom: null` under `ok: true`. The user got two events, both live, and since anything referencing
// the old id still fired the abandoned copy the rename looked like it had done nothing.
//
// An events file is named for a country or a theme, not for its namespace — only 17.5% of Millennium Dawn's
// events live in a file named after their namespace — so this was the common case.
//
// Fix: when the new id is not on disk and the client named a previous id, resolve the home file from the
// PREVIOUS id. The renamed event then lands in the file it already lived in, and the cleanup finds it there.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-evrename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const EVDIR = path.join(MOD, "events"), LOCDIR = path.join(MOD, "localisation", "english");
fs.mkdirSync(EVDIR, { recursive: true }); fs.mkdirSync(LOCDIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="E"\nsupported_version="1.18.*"\n');

const evBlock = (ns, id) =>
  `country_event = {\n\tid = ${ns}.${id}\n\ttitle = ${ns}.${id}.t\n\tdesc = ${ns}.${id}.d\n` +
  `\tis_triggered_only = yes\n\toption = {\n\t\tname = ${ns}.${id}.a\n\t\tadd_political_power = 10\n\t}\n}\n`;

// The event lives in a file named for a COUNTRY, not for its namespace — the normal case in real content.
fs.writeFileSync(path.join(EVDIR, "ZZ_ev.txt"), `add_namespace = probe_ns\n\n${evBlock("probe_ns", 1)}\n${evBlock("probe_ns", 2)}`, "utf8");
fs.writeFileSync(path.join(LOCDIR, "probe_l_english.yml"),
  '﻿l_english:\n probe_ns.1.t:0 "Old Title"\n probe_ns.1.d:0 "Old Desc"\n probe_ns.1.a:0 "Old Button"\n' +
  ' probe_ns.2.t:0 "Neighbour"\n probe_ns.2.d:0 "Neighbour Desc"\n probe_ns.2.a:0 "Neighbour Button"\n', "utf8");

const PORT = 39983, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (b) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ modPath: MOD }, b)) }).then((r) => r.json());
  try {
    const r = await save({
      namespace: "probe_ns", id: "7", previousEventId: "probe_ns.1", type: "country_event",
      title: "New Title", description: "New Desc", triggeredOnly: "yes",
      options: [{ name: "probe_ns.7.a", title: "New Button", script: "add_political_power = 10" }],
    });
    ok("the rename save succeeds", r && r.ok, r);
    ok("…and reports what it renamed FROM (was null)", r.renamedFrom === "probe_ns.1", r.renamedFrom);
    ok("…writing into the file the event already lived in", /ZZ_ev\.txt$/.test(String(r.eventPath || "")), r.eventPath);

    // ── no phantom file ──────────────────────────────────────────────────────────────────────────
    const files = fs.readdirSync(EVDIR).sort();
    ok("NO second events file was created", files.length === 1 && files[0] === "ZZ_ev.txt", files);

    const zz = fs.readFileSync(path.join(EVDIR, "ZZ_ev.txt"), "utf8");
    ok("the renamed event is in that file", /(?:^|\n)\s*id\s*=\s*probe_ns\.7\b/.test(zz), zz.slice(0, 300));
    ok("THE OLD EVENT IS GONE (this is the duplication)", !/(?:^|\n)\s*id\s*=\s*probe_ns\.1\b/.test(zz), zz);
    ok("…and only ONE event carries the new id", (zz.match(/id\s*=\s*probe_ns\.7\b/g) || []).length === 1, (zz.match(/id\s*=\s*probe_ns\.7\b/g) || []).length);
    ok("the untouched neighbour event survived", /(?:^|\n)\s*id\s*=\s*probe_ns\.2\b/.test(zz), zz);
    let d = 0; for (const c of zz) { if (c === "{") d++; else if (c === "}") d--; }
    ok("…and the file is brace-balanced", d === 0, d);
    ok("the namespace declaration is still there exactly once", (zz.match(/add_namespace\s*=\s*probe_ns/g) || []).length === 1, (zz.match(/add_namespace\s*=\s*probe_ns/g) || []).length);

    // ── localisation ─────────────────────────────────────────────────────────────────────────────
    const loc = fs.readdirSync(LOCDIR).map((f) => fs.readFileSync(path.join(LOCDIR, f), "utf8")).join("\n");
    ok("the old event's loc keys were removed", !/probe_ns\.1\.[tda]\s*:/.test(loc), loc.slice(0, 400));
    ok("the new event's keys are defined", /probe_ns\.7\.t\s*:/.test(loc), loc.slice(0, 400));
    ok("…including its option key", /probe_ns\.7\.a\s*:/.test(loc), loc.slice(0, 400));
    ok("the neighbour's loc keys are untouched", /probe_ns\.2\.t:0 "Neighbour"/.test(loc), loc.slice(0, 400));

    // ── an event that DOES live in <namespace>.txt must still rename correctly ───────────────────
    fs.writeFileSync(path.join(EVDIR, "other_ns.txt"), `add_namespace = other_ns\n\n${evBlock("other_ns", 3)}`, "utf8");
    const r2 = await save({
      namespace: "other_ns", id: "9", previousEventId: "other_ns.3", type: "country_event",
      title: "T", description: "D", triggeredOnly: "yes", options: [{ name: "other_ns.9.a", title: "B", script: "" }],
    });
    ok("the namespace-named-file case still renames", r2 && r2.ok && r2.renamedFrom === "other_ns.3", r2);
    const on = fs.readFileSync(path.join(EVDIR, "other_ns.txt"), "utf8");
    ok("…the old id is gone there too", !/id\s*=\s*other_ns\.3\b/.test(on), on);
    ok("…and the new one is present", /id\s*=\s*other_ns\.9\b/.test(on), on);

    // ── a plain edit (no rename) must not be affected ────────────────────────────────────────────
    const before = fs.readdirSync(EVDIR).sort().join(",");
    const r3 = await save({
      namespace: "probe_ns", id: "2", type: "country_event", title: "Neighbour", description: "Neighbour Desc",
      triggeredOnly: "yes", options: [{ name: "probe_ns.2.a", title: "Neighbour Button", script: "add_political_power = 10" }],
    });
    ok("a plain edit with no previousEventId still saves", r3 && r3.ok, r3);
    ok("…reports no rename", r3.renamedFrom == null, r3.renamedFrom);
    ok("…creates no new file", fs.readdirSync(EVDIR).sort().join(",") === before, fs.readdirSync(EVDIR));
    ok("…and edits it in place", /id\s*=\s*probe_ns\.2\b/.test(fs.readFileSync(path.join(EVDIR, "ZZ_ev.txt"), "utf8")), "neighbour lost");

    // ── the source ───────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("the home-file lookup falls back to the previous id",
      /if \(!eventFilename && isRename\) eventFilename = findEventHomeFile\(activeRoot, prevEventId\);/.test(src), "fallback missing");
    ok("…resolved BEFORE the filename is chosen",
      src.indexOf("const prevEventId = String((req.body && req.body.previousEventId)") < src.indexOf("let eventFilename = findEventHomeFile"), "still declared after the lookup");
    ok("…and it explains why", /#event-rename-duplicates/.test(src), "no marker comment");

    console.log("\ntest-event-rename-home-file: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 23 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
