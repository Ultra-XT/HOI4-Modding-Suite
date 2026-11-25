// #focus-rename-breaks-other-files — RENAMING OR DELETING A FOCUS SILENTLY BROKE EVERY OTHER FILE.
//
// A focus rename fixes up the tree file the focus lives in. Everything else that names that id keeps
// pointing at something which no longer exists — and a reference to an undefined focus does nothing in game
// and is NOT reported in error.log, so a decision that used to fire simply stops, with no diagnostic.
//
// Measured against vanilla, whose trees define 10,608 focuses: 3,109 references sit in common/national_focus
// itself (the only ones an in-file rewrite can reach) and 9,183 sit OUTSIDE it — common/decisions 4,982,
// events 1,975, common/ideas 895, on_actions 475, scripted effects and triggers 615, ai_strategy 241.
//
// Nova does not rewrite those: it does not own them, and a wrong guess is worse than a note. It says so
// instead, through the same scan every startup-item delete already ran and the note channel that already
// reaches the user (installWriteNoteDrain staples it onto the reply; loading-overlay.js shows it).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanished-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const MOD = path.join(ROOT, "mymod");
const NF = path.join(MOD, "common", "national_focus");
const DEC = path.join(MOD, "common", "decisions");
const EV = path.join(MOD, "events");
for (const d of [NF, DEC, EV]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MyMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "mymod.mod"), `name="MyMod"\npath="${MOD.split(path.sep).join("/")}"\nsupported_version="1.19.*"\n`);

const TREE = path.join(NF, "tree.txt");
const focus = (id) => `\tfocus = {\n\t\tid = ${id}\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n`;
const tree = (...ids) => `focus_tree = {\n\tid = my_tree\n${ids.map(focus).join("")}}\n`;

const BOTH = tree("alpha", "beta");
// Two other files name `alpha` the way real content does.
fs.writeFileSync(path.join(DEC, "dec.txt"),
  'my_decisions = {\n\tsome_decision = {\n\t\tavailable = {\n\t\t\thas_completed_focus = alpha\n\t\t}\n\t}\n}\n');
fs.writeFileSync(path.join(EV, "ev.txt"),
  'country_event = {\n\tid = test.1\n\ttrigger = {\n\t\thas_completed_focus = alpha\n\t}\n}\n');
// …and one that names only `beta`, so a control can remove `beta` and expect silence about alpha's files.
const PORT = 53331;

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  let agent = 0;
  // Exactly what saveFileWithOptions sends (public/app.js), minus baseFingerprint, which is only enforced
  // when supplied. A fresh User-Agent per call keeps FILE_IO_MIN_INTERVAL_MS from making this flaky.
  const save = (content, extra) => fetch(`http://127.0.0.1:${PORT}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": `nova-test-${agent++}` },
    body: JSON.stringify(Object.assign({ path: TREE, content, backupReason: "manual-save" }, extra || {})),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: { error: String(e) } }));
  const warn = (r) => String((r.body && r.body.refWarning) || "");

  try {
    fs.writeFileSync(TREE, BOTH);

    console.log("\n[CONTROL] a save that removes nothing says nothing");
    {
      // ⚠️ Load-bearing. A warning on every save would be noise, and would make every assertion below pass
      // for the wrong reason.
      const r = await save(BOTH);
      rec("the save succeeds", r.status === 200 && r.body && r.body.ok, r);
      rec("…and carries no reference warning", warn(r) === "", warn(r));
    }

    console.log("\n[THE BUG] deleting a focus other files depend on");
    {
      const r = await save(tree("beta"));
      rec("the save still succeeds — this is a note, not a refusal", r.status === 200 && r.body && r.body.ok, r);
      const w = warn(r);
      rec("…and names the focus that vanished", w.includes("alpha"), w);
      rec("…and the decision file that still needs it", w.includes("common/decisions/dec.txt"), w);
      rec("…and the event file", w.includes("events/ev.txt"), w);
      rec("…and says error.log will not mention it", /error\.log/.test(w), w);
      rec("…and that Nova changed nothing else", /has not changed those files/i.test(w), w);
    }

    console.log("\n[THE SAME SHAPE] renaming is a removal too, from the file's point of view");
    {
      fs.writeFileSync(TREE, BOTH);
      const r = await save(tree("alpha_renamed", "beta"));
      const w = warn(r);
      rec("a rename warns about the old id", w.includes("alpha") && w.includes("dec.txt"), w);
      // It must not claim the focus was DELETED — we cannot tell a rename from a delete here.
      rec("…without asserting it was deleted", !/was deleted/i.test(w), w);
      rec("…and it does not warn about the new id", !w.includes("alpha_renamed is no longer"), w);
    }

    console.log("\n[CONTROL] removing a focus nothing references stays silent");
    {
      fs.writeFileSync(TREE, BOTH);
      const r = await save(tree("alpha"));   // beta goes; nothing names beta
      rec("no warning for an unreferenced focus", warn(r) === "", warn(r));
    }

    console.log("\n[CONTROL] a focus MOVED to another file in the mod has not gone anywhere");
    {
      // Splitting a tree across files relocates focuses rather than removing them. A warning here would be
      // confidently wrong about content that is perfectly fine — worse than saying nothing.
      fs.writeFileSync(TREE, BOTH);
      const OTHER = path.join(NF, "split.txt");
      fs.writeFileSync(OTHER, tree("alpha"));
      const r = await save(tree("beta"));
      rec("no warning when the id still exists elsewhere in the mod", warn(r) === "", warn(r));
      fs.rmSync(OTHER);
      // …and with it gone again, the warning comes back — so the control above is not passing because the
      // check is simply dead.
      fs.writeFileSync(TREE, BOTH);
      const r2 = await save(tree("beta"));
      rec("…and it returns once the id really is gone", warn(r2).includes("alpha"), warn(r2));
    }

    console.log("\n[CONTROL] an autosave snapshot does not touch the .txt, so it must not warn");
    {
      fs.writeFileSync(TREE, BOTH);
      const r = await save(tree("beta"), { snapshot: true, createBackup: false });
      rec("the snapshot succeeds", r.status === 200 && r.body && r.body.ok, r);
      rec("…and says nothing", warn(r) === "", warn(r));
      rec("…and really left the tree alone", fs.readFileSync(TREE, "utf8") === BOTH, "the .txt was rewritten");
    }

    console.log("\n[the scan is capped, and says so]");
    {
      // Four focuses vanish at once; the cap is 3, and a silent cap reads as "nothing else is wrong".
      const many = tree("a1", "a2", "a3", "a4", "keep");
      fs.writeFileSync(TREE, many);
      fs.writeFileSync(path.join(DEC, "many.txt"),
        'my_decisions = {\n' + ["a1", "a2", "a3", "a4"].map((id) =>
          `\td_${id} = {\n\t\tavailable = { has_completed_focus = ${id} }\n\t}\n`).join("") + '}\n');
      const r = await save(tree("keep"));
      const w = warn(r);
      rec("it reports the total that vanished", /4 focus ids are no longer defined/.test(w), w);
      rec("…and admits the rest were not checked", /were not checked|and the rest were not/.test(w), w);
    }
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== focus vanished-id warning: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
