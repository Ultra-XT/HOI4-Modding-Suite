// #delete-leaves-dangling-references — DELETING SOMETHING LEFT EVERY REFERENCE TO IT POINTING AT NOTHING.
//
// A delete unwires the entity's own start-up wiring — history/countries and the all-countries on_actions
// file. It does NOT rewrite other content: a focus whose completion_reward activates a decision, an event
// option that fires another event, a decision effect naming a spirit. That restraint is correct. Silently
// editing a focus the user never asked to touch would be a worse defect than the one it fixed.
//
// Saying NOTHING is a different matter. A dead reference is invisible in game: the focus completes, the
// effect simply has no result, and error.log carries no complaint to search for. The author has no way to
// learn that the thing they deleted is still named in four other files.
//
// So the delete now scans this mod's own script directories and names the files that still mention the id.
// No rewriting, no refusal — the delete succeeds either way. It rides refWarning, which the shared
// write-note surface drains into a dialog.
//
// ⭐ Wired into unwireStartupItemEverywhere rather than into one handler, because its six callers ARE the
// six delete paths (event, decision, character, spirit, and technology twice). Fixing one and not its
// siblings is this codebase's oldest and most repeated defect.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dangle-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "danglemod");
for (const d of [["common", "decisions"], ["common", "national_focus"], ["events"], ["history", "countries"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DangleMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "danglemod.mod"), 'name="DangleMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

// The decision that will be deleted…
fs.writeFileSync(path.join(MOD, "common", "decisions", "zz_nova.txt"),
  "nova_dangle_category = {\n\tnova_doomed_decision = {\n\t\tcost = 10\n\t}\n\tnova_surviving_decision = {\n\t\tcost = 5\n\t}\n}\n");
// …a focus that activates it, which is the reference nobody was told about…
fs.writeFileSync(path.join(MOD, "common", "national_focus", "zz_nova.txt"),
  "focus_tree = {\n\tid = nova_dangle_tree\n\tcountry = { factor = 0 modifier = { add = 10 tag = GER } }\n" +
  "\tfocus = {\n\t\tid = nova_dangle_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n" +
  "\t\tcompletion_reward = { activate_decision = nova_doomed_decision }\n\t}\n}\n");
// …and a file that mentions a SIMILAR id, to prove the match is on a bareword boundary.
fs.writeFileSync(path.join(MOD, "events", "zz_nova.txt"),
  "add_namespace = novadangle\ncountry_event = {\n\tid = novadangle.1\n\ttitle = novadangle.1.t\n\tdesc = novadangle.1.d\n" +
  "\toption = { name = novadangle.1.a activate_decision = nova_doomed_decision_extended }\n}\n");

const PORT = 53161;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[CONTROL] the fixture really contains the reference being measured");
    {
      const focus = fs.readFileSync(path.join(MOD, "common", "national_focus", "zz_nova.txt"), "utf8");
      rec("a focus activates the doomed decision", /activate_decision = nova_doomed_decision\b/.test(focus), focus.slice(0, 200));
      const ev = fs.readFileSync(path.join(MOD, "events", "zz_nova.txt"), "utf8");
      rec("…and another file names a LONGER id that must not match", /nova_doomed_decision_extended/.test(ev), ev.slice(0, 200));
    }

    console.log("\n[the delete] succeeds, and says what still points at it");
    {
      const r = await post("/api/decisions/delete-definition", {
        modPath: MOD, categoryId: "nova_dangle_category", decisionId: "nova_doomed_decision", fileName: "zz_nova.txt",
      });
      const w = String((r.body && r.body.refWarning) || "");
      console.log(`     status=${r.status}  refWarning=${JSON.stringify(w.slice(0, 200))}`);
      rec("the delete still succeeds", r.status < 400 && r.body && !r.body.error, r.body);
      // THE BUG: ok:true and total silence, while a focus went on activating a decision that no longer exists.
      rec("…and warns that something still mentions it", /still mention/i.test(w), w || "(silent)");
      rec("…naming the focus file", /national_focus/.test(w), w);
      rec("…and explaining that the game will not complain",
        /does nothing in game|not reported in error\.log/i.test(w), w);
      rec("…and saying Nova did not touch those files", /has not changed those files/i.test(w), w);
    }

    console.log("\n[⭐ the boundary] a LONGER id that merely starts the same must not count");
    {
      // nova_doomed_decision_extended contains the deleted id as a prefix. A naive substring search would
      // report the events file too, and a warning that cries wolf is one people learn to ignore.
      const r = await post("/api/decisions/delete-definition", {
        modPath: MOD, categoryId: "nova_dangle_category", decisionId: "nova_surviving_decision", fileName: "zz_nova.txt",
      });
      const w = String((r.body && r.body.refWarning) || "");
      console.log(`     deleting an unreferenced decision: refWarning=${JSON.stringify(w.slice(0, 120))}`);
      rec("deleting something nothing references says nothing", !/still mention/i.test(w), w);
    }

    console.log("\n[⭐ the count stops] and the note must say so rather than quote its cap as the total");
    {
      // #dangling-count-stops-at-twelve — the scan stopped AT twelve hits, so "12 files still mention it"
      // was what the modder read whether there were twelve or fifty. The same shape as the icon index's
      // truncated walk: a scan that halts at its limit cannot tell the caller which it was, unless it looks
      // one past.
      const MANY = 20;
      const id = "nova_widely_used_decision";
      fs.writeFileSync(path.join(MOD, "common", "decisions", "zz_many.txt"),
        `nova_dangle_category = {\n\t${id} = {\n\t\tcost = 10\n\t}\n}\n`);
      for (let i = 0; i < MANY; i++) {
        fs.writeFileSync(path.join(MOD, "common", "national_focus", `zz_ref_${i}.txt`),
          `focus_tree = {\n\tid = ref_tree_${i}\n\tcountry = { factor = 1 }\n\tfocus = {\n\t\tid = ref_focus_${i}\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t\tcompletion_reward = { activate_decision = ${id} }\n\t}\n}\n`);
      }
      const r = await post("/api/decisions/delete-definition", {
        modPath: MOD, categoryId: "nova_dangle_category", decisionId: id, fileName: "zz_many.txt",
      });
      const w = String((r.body && r.body.refWarning) || "");
      console.log(`     ${MANY} referring files -> ${JSON.stringify(w.slice(0, 150))}`);
      // ⚠️ If nothing is reported at all the checks below pass vacuously.
      rec("a widely-referenced delete is reported", /still mention/i.test(w), w || "(silent)");
      // Before the fix: "20 files" would have read "12 files", stating the cap as the count.
      rec("…and says the count is a floor, not the total", /at least \d+ files/.test(w), w);
      rec("…and does not claim to have found all 20", !new RegExp(`\\b${MANY} files`).test(w), w);
    }

    console.log("\n[the file] the delete really did remove the decision");
    {
      const t = fs.readFileSync(path.join(MOD, "common", "decisions", "zz_nova.txt"), "utf8");
      rec("the doomed decision is gone", !/nova_doomed_decision\s*=\s*\{/.test(t), t.slice(0, 240));
      // …and the warning did NOT cause Nova to edit the focus, which was the whole point of warning.
      const focus = fs.readFileSync(path.join(MOD, "common", "national_focus", "zz_nova.txt"), "utf8");
      rec("the focus was left exactly as the author wrote it",
        /activate_decision = nova_doomed_decision\b/.test(focus), focus.slice(0, 240));
    }

    console.log("\n[⭐ every delete path] the scan is wired into the shared unwire, not one handler");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf("function unwireStartupItemEverywhere(");
      // ⚠️ THE WHOLE FUNCTION, not its first 900 characters. The call moved to the END of the unwire
      // (#dangling-note-fires-before-the-cleanup) and a fixed-size window reported it as missing — a
      // failure about where the test was looking, not about what the code does.
      const fnEnd = at === -1 ? -1 : sv.indexOf("\n  function ", at + 10);
      const near = at === -1 ? "" : sv.slice(at, fnEnd === -1 ? at + 6000 : fnEnd);
      rec("the shared unwire is findable", at !== -1, "not found");
      rec("…and it runs the reference scan", /noteDanglingReferencesAfterDelete\(modRoot, itemId, itemType\)/.test(near), near.slice(0, 300));
      // ⭐ AND IT RUNS LAST. Placed first, it scanned common/on_actions before the unwire cleaned Nova's own
      // zz_nova_all_countries.txt out of it — so deleting anything that had been granted at game start
      // warned that a file "still mentions it" and signed off "Nova has not changed those files", a moment
      // before Nova changed it. What survives the cleanup is what genuinely dangles.
      const scanAt = near.indexOf("noteDanglingReferencesAfterDelete(modRoot");
      const cleanupAt = near.indexOf("NOVA_ALL_COUNTRIES_REL");
      rec("…after the cleanup it would otherwise talk over", cleanupAt !== -1 && scanAt > cleanupAt,
        { scanAt, cleanupAt });
      // Derived: the callers of that function ARE the delete paths, so count them rather than list routes.
      const callers = (sv.match(/unwireStartupItemEverywhere\(/g) || []).length - 1; // minus the definition
      console.log(`     delete paths sharing it: ${callers}`);
      rec("…which every delete path goes through", callers >= 5, callers);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== delete reports dangling refs: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
