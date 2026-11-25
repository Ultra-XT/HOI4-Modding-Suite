// #event-rename — editing an event's id used to CLONE it instead of renaming.
//
// The events maker writes the event under whatever namespace.id is in the boxes and left the old block sitting
// in the file. Renaming custom_events.1 to custom_events.7 produced TWO events — the original still firing on
// its own trigger, plus a copy under the new id — and two sets of .t/.d/.a localisation keys, one of them now
// describing an event nobody meant to keep.
//
// That is worse here than on characters: a duplicated event still FIRES. An event chain that fires
// news_event = custom_events.1 keeps hitting the abandoned copy, and a `fire_only_once` event that exists twice
// under two ids can fire twice.
//
// The maker has its own ⧉ Duplicate button, so editing the id was never how you copy an event. The save now
// strips the previous block when the client names one, using the same block finder as the DELETE path and the
// same localisation strip, so a rename cleans up exactly as thoroughly as a delete does.
//
// Duplicate is guarded from both sides here, because that is the mistake this campaign already made once on
// characters: the server promises that a save with no previousEventId removes nothing, and the client half —
// forgetting the loaded id so a copy does not read as a rename — is asserted against the source.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-event-rename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "event_rename_probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EventRenameProbe"\nsupported_version="1.19.*"\n');

const NS = "zz_rename_ns";
const evFile = path.join(MOD, "events", NS + ".txt");
const read = () => { try { return fs.readFileSync(evFile, "utf8"); } catch (_) { return ""; } };
const idsIn = (t) => [...t.matchAll(/\n\s*id\s*=\s*([\w.]+)/g)].map((m) => m[1]);
const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
const locAll = () => { try { return fs.readdirSync(path.join(MOD, "localisation", "english"))
  .map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n"); } catch (_) { return ""; } };

const PORT = 39543, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 170));
  const save = (id, title, extra) => post("/api/events/save", Object.assign({
    modPath: MOD, namespace: NS, id, type: "country_event",
    picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
    fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
    title, description: "Body text.",
    // Two options, named after the event the way the maker names them.
    options: (extra && extra.options) || [
      { name: `${NS}.${id}.a`, title: "Understood.", script: "", aiChance: "", trigger: "" },
      { name: `${NS}.${id}.b`, title: "Refuse.", script: "", aiChance: "", trigger: "" },
    ],
  }, extra || {}));

  try {
    // three events, so the renamed one has neighbours on both sides to leave alone
    for (const [id, t] of [["1", "First Event"], ["2", "Second Event"], ["3", "Third Event"]]) {
      await save(id, t);
      await breathe();
    }
    ok("three events were created", idsIn(read()).length === 3, idsIn(read()));

    // ── rename the FIRST one, so the cleanup has to cut from the top of the file ───────────────────
    await breathe();
    // The client sends the options back exactly as it loaded them — still named after the OLD id.
    const r = await save("7", "First Event", {
      previousEventId: NS + ".1",
      options: [
        { name: NS + ".1.a", title: "Understood.", script: "", aiChance: "", trigger: "" },
        { name: NS + ".1.b", title: "Refuse.", script: "", aiChance: "", trigger: "" },
      ],
    });
    await breathe();
    ok("renaming → 200", r.s === 200, r.b);
    const after = read();
    const ids = idsIn(after);
    ok("…there are still exactly THREE events", ids.length === 3, ids);
    ok("…the old id is gone", !ids.includes(NS + ".1"), ids);
    ok("…the new id is there", ids.includes(NS + ".7"), ids);
    ok("…both neighbours survived", ids.includes(NS + ".2") && ids.includes(NS + ".3"), ids);
    ok("…the file is still valid", balanced(after), after.slice(0, 200));
    ok("…and the response says what it renamed", r.b && r.b.renamedFrom === NS + ".1", r.b && r.b.renamedFrom);

    const loc = locAll();
    ok("the old title key is gone", !new RegExp("(^|\\n)\\s*" + NS + "\\.1\\.t:").test(loc), loc.slice(0, 400));
    ok("…so is the old description key", !new RegExp("(^|\\n)\\s*" + NS + "\\.1\\.d:").test(loc), loc.slice(0, 400));
    ok("…and the old option key", !new RegExp("(^|\\n)\\s*" + NS + "\\.1\\.a:").test(loc), loc.slice(0, 400));
    ok("…the new key carries the title", new RegExp(NS + "\\.7\\.t:\\d*\\s*\"First Event\"").test(loc), loc.slice(0, 400));
    ok("…and the neighbours' keys are untouched",
      new RegExp(NS + "\\.2\\.t:").test(loc) && new RegExp(NS + "\\.3\\.t:").test(loc), loc.slice(0, 400));

    // ── the OPTIONS have to come with it ──────────────────────────────────────────────────────────
    // The client returns the options named after the event it loaded, so a rename used to leave every button
    // pointing at `<old id>.a` — keys the cleanup above had just deleted. The buttons would render as raw
    // localisation keys in game. Both halves are checked: the block references the new keys, and the keys
    // exist with the button text on them.
    const renamed = after.slice(after.indexOf("id = " + NS + ".7"));
    const optNames = [...renamed.matchAll(/name\s*=\s*([\w.]+)/g)].map((m) => m[1]);
    ok("the renamed event still has both options", optNames.length === 2, optNames);
    ok("…and neither still points at the old id", !optNames.some((n) => n.startsWith(NS + ".1.")), optNames);
    ok("…they are named after the NEW id", optNames.every((n) => n.startsWith(NS + ".7.")), optNames);
    ok("…the first button kept its text", new RegExp(NS + "\\.7\\.a:\\d*\\s*\"Understood\\.\"").test(loc), optNames);
    ok("…and so did the second", new RegExp(NS + "\\.7\\.b:\\d*\\s*\"Refuse\\.\"").test(loc), optNames);

    // ── an ordinary re-save must NOT remove anything ───────────────────────────────────────────────
    // previousEventId is only sent when the id actually changed; sending the SAME id must be a no-op.
    await breathe();
    const same = await save("7", "First Event Revised", { previousEventId: NS + ".7" });
    await breathe();
    ok("re-saving under the same id → 200", same.s === 200, same.b);
    ok("…still three events", idsIn(read()).length === 3, idsIn(read()));
    ok("…the event still exists", idsIn(read()).includes(NS + ".7"), idsIn(read()));
    ok("…and it kept its localisation", new RegExp(NS + "\\.7\\.t:").test(locAll()), locAll().slice(0, 300));

    // ── a previousEventId that is not on disk must not disturb the file ────────────────────────────
    await breathe();
    const ghost = await save("7", "First Event Revised", { previousEventId: NS + ".999" });
    await breathe();
    ok("a previousEventId that never existed → 200", ghost.s === 200, ghost.b);
    ok("…and changed nothing", idsIn(read()).length === 3 && balanced(read()), idsIn(read()));

    // ── ⧉ DUPLICATE must COPY, never move ─────────────────────────────────────────────────────────
    // Server side: a save with NO previousEventId removes nothing, so a copy is always additive.
    await breathe();
    const dup = await save("8", "First Event Revised (copy)");   // note: no previousEventId
    await breathe();
    const dupIds = idsIn(read());
    ok("saving a duplicate → 200", dup.s === 200, dup.b);
    ok("…the ORIGINAL is still there", dupIds.includes(NS + ".7"), dupIds);
    ok("…and the copy exists beside it", dupIds.includes(NS + ".8"), dupIds);
    ok("…so there are now four events", dupIds.length === 4, dupIds);
    {
      // Client side: the two buttons that put a DIFFERENT id in the box without it being a rename.
      const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
      const cut = (marker) => {
        const start = src.indexOf(marker);
        return start === -1 ? "" : src.slice(start, start + 1800);
      };
      const dupBody = cut('duplicateEventBtn.addEventListener("click"');
      ok("the Duplicate handler forgets the loaded id", /loadedEventFullId\s*=\s*null/.test(dupBody),
        dupBody ? dupBody.slice(0, 160) : "duplicate handler not found");
      const newBody = cut('newEventBtn.addEventListener("click"');
      ok("…and so does New Event", /loadedEventFullId\s*=\s*null/.test(newBody),
        newBody ? newBody.slice(0, 160) : "new-event handler not found");
      ok("…while loading an event remembers it", /loadedEventFullId = evt\.fullId/.test(src));
      ok("…and the save only sends it when the id changed",
        /previousEventId: loadedEventFullId/.test(src) && /loadedEventFullId !== `\$\{namespace\}\.\$\{id\}`/.test(src));
    }

    console.log("\ntest-event-rename: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
