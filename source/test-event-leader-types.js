// #event-types-incomplete — every event type Nova OFFERS must be editable and deletable.
//
// HOI4 has five event types. parseEventsFromFile (the reader) listed all five, and public/events.html offers
// all five in its type dropdown — but three writer-side regexes listed only country/news/state. So Nova wrote
// a unit_leader_event, listed it back, and then could neither edit nor delete it, because the writer did not
// recognise the block it had itself just written:
//
//   - editing appended a SECOND top-level definition of the same id (the handler falls through to append when
//     modifyEventInFile reports found:false), so one id was claimed twice and the list showed it twice;
//   - deleting refused with "isn't defined in <file> — nothing was changed", which was simply false;
//   - and since delete could not remove either copy, there was no way back.
//
// Millennium Dawn ships both leader types, so this is real content, not a corner.
//
// Both directions: the three types that always worked must keep working, or a fix here would be trading one
// broken set for another.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtypes-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "evmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvMod"\nsupported_version="1.18.*"\n', "utf8");

const EV_FILE = path.join(MOD, "events", "nova_ev.txt");
const ALL_TYPES = ["country_event", "news_event", "state_event", "unit_leader_event", "operative_leader_event"];

const PORT = 42175;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const defCount = (id) => {
    const t = fs.existsSync(EV_FILE) ? fs.readFileSync(EV_FILE, "utf8") : "";
    return (t.match(new RegExp(`id\\s*=\\s*${id.replace(".", "\\.")}\\b`, "g")) || []).length;
  };
  const save = (type, id, title, extra = {}) => post("/api/events/save", {
    modPath: MOD, namespace: "nova_ev", id, type, title, description: "d",
    options: [{ name: "OK", script: "" }], ...extra,
  });

  try {
    // Each type gets its own id, so one type's failure cannot mask another's.
    for (let i = 0; i < ALL_TYPES.length; i++) {
      const type = ALL_TYPES[i];
      const num = String(10 + i);
      const full = `nova_ev.${num}`;
      console.log(`\n[${type}]`);

      const created = await save(type, num, `Original ${type}`);
      rec("created", created.status === 200 && created.body && created.body.success !== false,
        created.body || created.status);
      rec("…exactly one definition on disk", defCount(full) === 1, defCount(full));

      // EDIT — the failure mode was a second definition appended alongside the first.
      const edited = await save(type, num, `Edited ${type}`, { previousEventId: full });
      rec("edited", edited.status === 200 && edited.body && edited.body.success !== false,
        edited.body || edited.status);
      rec("…still exactly one definition (no duplicate appended)", defCount(full) === 1, defCount(full));
      rec("…and the edit landed", fs.readFileSync(EV_FILE, "utf8").includes(`Edited ${type}`) ||
        /nova_ev\.\d+\.t/.test(fs.readFileSync(EV_FILE, "utf8")), "title not updated");

      // RENAME — the failure mode was subtler than the edit one and had its own report: the cleanup branch
      // never ran, so the ORIGINAL event stayed put and the mod ended up with two events where the user asked
      // for one. `renamedFrom` came back null while the response still said success, and public/events.js
      // treats a 200 as a successful rename. Because the branch was skipped, the localisation cleanup and the
      // reference walks were skipped too, so anything pointing at the old id kept firing the abandoned copy.
      const renamedNum = String(80 + i);
      const renamedFull = `nova_ev.${renamedNum}`;
      const ren = await save(type, renamedNum, `Renamed ${type}`, { previousEventId: full });
      rec("renamed", ren.status === 200 && ren.body && ren.body.success !== false, ren.body || ren.status);
      rec("…and the response reports what it renamed from",
        ren.body && ren.body.renamedFrom === full, ren.body && ren.body.renamedFrom);
      rec("…the old id is gone", defCount(full) === 0, defCount(full));
      rec("…and the new id is there exactly once", defCount(renamedFull) === 1, defCount(renamedFull));

      // DELETE — the failure mode was a 400 claiming the event "isn't defined".
      const del = await post("/api/events/delete-definition", { modPath: MOD, eventId: renamedFull });
      rec("deleted", del.status === 200 && del.body && del.body.ok !== false, del.body || del.status);
      rec("…and it is gone from the file", defCount(renamedFull) === 0, defCount(renamedFull));
    }

    console.log(`\n=== event leader types: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
