// The last two findings from the audit-mod sweep — both cases of Nova telling the user something untrue
// about a file that was actually fine.
//
// #oob-wired-false-on-resave — EVERY SAVE AFTER THE FIRST SAID IT HAD NOT WIRED THE OOB.
// Save 1 returns oobWired:true. Save 2 hit the "the country already loads a land OOB, leave it alone" branch
// and returned oobWired:false with a note advising the user to "point the country at X by hand" — where X was
// the file the country was ALREADY pointed at. Skipping the injection is correct (overwriting someone's
// existing OOB reference would be worse), but "already loads THIS file" and "already loads a DIFFERENT file"
// are not the same situation, and only the second one is worth a warning.
//
// #division-priority-out-of-range — A PRIORITY ABOVE 2 DISPLAYED AS "default".
// The dropdown only carries "", 0, 1 and 2, so assigning `.value = "10"` left it on the empty option and a
// template the file sets to priority 10 was shown as "default". The value round-trips — the model keeps it
// and re-emits it — so this misreported the file rather than losing anything.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobw-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "oobw");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "units"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OobW"\nsupported_version="1.19.*"\n', "utf8");
const HIST = path.join(MOD, "history", "countries", "MZA - Mozambique.txt");
fs.writeFileSync(HIST, "capital = 1\n", "utf8");

const PORT = 43251;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = () => fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, tag: "MZA", fileName: "MZA_nova.txt",
      templates: [{ name: "Nova Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], priority: 10 }],
      divisions: [{ name: "1st Nova Division", location: 1, template: "Nova Infantry" }],
    }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[the first save wires the country up]");
    let r = await save();
    rec("save 1 succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and reports the OOB as wired", r.b.oobWired === true, r.b);
    rec("…and the history file points at it", /oob\s*=\s*"MZA_nova"/.test(fs.readFileSync(HIST, "utf8")),
      fs.readFileSync(HIST, "utf8"));

    console.log("\n[the bug] a re-save must not claim it failed to wire what is already wired");
    r = await save();
    rec("save 2 succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and STILL reports the OOB as wired", r.b.oobWired === true, r.b);
    rec("…with no note telling the user to do what is already done",
      !/Point the country at/.test(String(r.b.note || r.b.oobNote || "")), r.b.note || r.b.oobNote);
    rec("…and the history file still points at it exactly once",
      (fs.readFileSync(HIST, "utf8").match(/oob\s*=\s*"MZA_nova"/g) || []).length === 1,
      fs.readFileSync(HIST, "utf8"));

    console.log("\n[control] a country pointed at a DIFFERENT OOB is still left alone, and still says so");
    fs.writeFileSync(HIST, 'capital = 1\noob = "MZA_something_else"\n', "utf8");
    r = await save();
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and reports it was NOT wired", r.b.oobWired === false, r.b);
    rec("…and says which file the country actually loads",
      /MZA_something_else/.test(String(r.b.note || r.b.oobNote || "")), r.b.note || r.b.oobNote);
    rec("…and the existing reference was not overwritten",
      /oob\s*=\s*"MZA_something_else"/.test(fs.readFileSync(HIST, "utf8")), fs.readFileSync(HIST, "utf8"));

    console.log("\n[the priority dropdown] a value the select has no option for must not read as default");
    // Client-side, so this asserts the wiring: the option is ADDED when the file's value is not one of the
    // built-in ones, rather than silently falling back to the empty "default" entry.
    const aj = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
    rec("the priority select adds a missing value as an option",
      /\(from file\)/.test(aj) && /tplPriority/.test(aj), "not wired");
    rec("…and only when the built-in options do not already cover it",
      /!Array\.prototype\.some\.call\(sel\.options/.test(aj), "no existing-option check");
    // …and the value itself still round-trips through the writer, which is what stopped this being data loss.
    const U = require("./unit-data.js");
    const t = U.genDivisionTemplate({ name: "Nova Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], priority: 10 });
    rec("a priority of 10 is still written to the file", /priority\s*=\s*10/.test(t), t);

    console.log(`\n=== oob wired + priority: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
