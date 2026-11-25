// #gridbox-skip-reported-to-nobody — A TECHNOLOGY THE GAME WILL NEVER DRAW, SAVED IN SILENCE.
//
// A technology renders only inside a gridBoxType named "<tech>_tree", so a research tab whose gui container
// has no gridbox to anchor on cannot draw anything put into it — HOI4 logs "Found no grid box for tech <id>"
// and the tech is invisible. addGridboxesForNewTechs already detects that and returns
// `{ skipped: "folder has no gridbox to anchor on" }`; save-batch already collects it into
// `gridboxesAdded`, and the collecting code's own comment says a skip "is something the caller needs to
// hear". Nothing in public/ has ever read gridboxesAdded.
//
// ⚠️ AND THE OTHER WARNING IS SUPPRESSED ON PURPOSE. The per-tech "has no grid box" warning is deliberately
// held back for any tech this same save is about to give a gridbox — otherwise one response carried both
// `gridboxesAdded:[{added:1}]` and "has no grid box", telling the author to fix what the response had just
// fixed (#gridbox-warning-before-the-fix). That suppression is right when the add succeeds. When the add is
// SKIPPED, the suppression still stands and the report still goes unread, so the two correct-looking halves
// combine into total silence about a technology that cannot appear in game.
//
// The skip now rides refWarning, which the shared write-note surface drains into a dialog.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gridbox-"));
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
const MOD = path.join(ROOT, "gbmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="GbMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "gbmod.mod"), 'name="GbMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "technology_tags", "00_technology.txt"),
  "technology_categories = {\n\tnova_gb_cat\n}\ntechnology_folders = {\n\tnova_gb_folder = {\n\t\tledger = army\n\t}\n}\n");

// The mod owns a gui that DECLARES the folder's container but gives it NO gridBoxType — so there is nothing
// to anchor a new tech's gridbox on, which is exactly the condition addGridboxesForNewTechs reports.
fs.writeFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"),
  "guiTypes = {\n" +
  "\tcontainerWindowType = {\n\t\tname = \"nova_gb_folder\"\n\t\tposition = { x = 0 y = 0 }\n\t\tsize = { width = 100 height = 100 }\n\t}\n" +
  "}\n");

const PORT = 53091;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const save = (id) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{
          id, folder: "nova_gb_folder", isMod: true, researchCost: 2, categories: ["nova_gb_cat"],
          x: 0, y: 0, startYear: 1936, isNew: true,
        }],
        newTechIds: [id],
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[the save] must succeed — a gui problem never undoes a written technology");
    const r = await save("nova_invisible_tech");
    console.log(`     status=${r.status} gridboxesAdded=${JSON.stringify((r.body || {}).gridboxesAdded)}`);
    rec("the technology is saved", r.status < 400 && r.body && r.body.ok === true, r.body);

    console.log("\n[🈯 the count] savedTechCount must be what LANDED, not what arrived");
    {
      // #saved-count-counts-the-wrong-thing — found while building this fixture. The first version of the
      // payload omitted `isMod: true`, which the persist loop requires, so nothing was written at all — and
      // the response still said savedTechCount: 1, because that was techList.length, the size of the
      // REQUEST. common/technologies was empty. The loop already keeps a `persisted` array for its
      // partial-failure message; that is the honest number.
      const b = r.body || {};
      console.log(`     savedTechCount=${b.savedTechCount} submittedTechCount=${b.submittedTechCount}`);
      rec("one technology was submitted", b.submittedTechCount === 1, b);
      rec("…and one was actually written", b.savedTechCount === 1, b);
      const dir = path.join(MOD, "common", "technologies");
      let files = []; try { files = fs.readdirSync(dir); } catch (_) {}
      rec("…and it really is on disk", files.length > 0, files);

      // The discriminating case: a technology the persist loop skips must not be counted as saved.
      const skippedSave = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: MOD,
          technologies: [{ id: "nova_not_a_mod_tech", folder: "nova_gb_folder", researchCost: 2, x: 0, y: 0 }],
          newTechIds: [],
        }),
      }).then(async (x) => await x.json()).catch(() => null);
      console.log(`     a non-mod technology: savedTechCount=${skippedSave && skippedSave.savedTechCount} submitted=${skippedSave && skippedSave.submittedTechCount}`);
      rec("a technology the loop skips is NOT counted as saved", skippedSave && skippedSave.savedTechCount === 0, skippedSave);
      rec("…while the submitted count still reports it arrived", skippedSave && skippedSave.submittedTechCount === 1, skippedSave);
    }

    console.log("\n[CONTROL] the skip really did happen, or there is nothing to report");
    {
      const g = ((r.body || {}).gridboxesAdded) || [];
      const skipped = g.filter((x) => x && (x.skipped || x.error));
      console.log(`     gridboxesAdded entries: ${g.length}, of which skipped/error: ${skipped.length}`);
      // ⚠️ If this fails the fixture never reached the skip path and every check below is vacuous.
      rec("a gridbox add was skipped or errored", skipped.length > 0, g);
      rec("…and it names the folder", skipped.some((x) => x.folder === "nova_gb_folder"), skipped);
    }

    console.log("\n[the defect] the skip must reach the user, not just the JSON");
    {
      const w = String((r.body || {}).refWarning || "");
      console.log(`     refWarning = ${JSON.stringify(w.slice(0, 190))}`);
      // THE BUG: gridboxesAdded carried the skip and nothing in public/ read it, while the per-tech warning
      // for the same condition was suppressed because a gridbox was "coming".
      rec("the response warns about it", /grid box/i.test(w), w || "(silent)");
      rec("…naming the research tab", /nova_gb_folder/.test(w), w);
      rec("…and saying the technologies were still saved", /still saved|were saved/i.test(w), w);
      rec("…and quoting what HOI4 will log, so the author can search for it",
        /Found no grid box for tech/.test(w), w);
    }

    console.log("\n[CONTROL] a folder that CAN take a gridbox says nothing");
    {
      // The suppression this leans on is correct when the add succeeds: warning about something the same
      // response reports fixing is noise. So the note must not fire on the ordinary path.
      fs.writeFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"),
        "guiTypes = {\n" +
        "\tcontainerWindowType = {\n\t\tname = \"nova_gb_folder\"\n\t\tposition = { x = 0 y = 0 }\n\t\tsize = { width = 100 height = 100 }\n" +
        "\t\tgridBoxType = {\n\t\t\tname = \"nova_anchor_tree\"\n\t\t\tposition = { x = 10 y = 20 }\n\t\t\tsize = { width = 100 height = 100 }\n\t\t\tslotsize = { width = 10 height = 10 }\n\t\t\tformat = \"UP\"\n\t\t}\n" +
        "\t}\n}\n");
      const ok = await save("nova_visible_tech");
      const w = String((ok.body || {}).refWarning || "");
      const g = ((ok.body || {}).gridboxesAdded) || [];
      console.log(`     gridboxesAdded=${JSON.stringify(g)}  refWarning=${JSON.stringify(w.slice(0, 90))}`);
      rec("the second save also succeeds", ok.status < 400 && ok.body && ok.body.ok === true, ok.body);
      rec("…a gridbox was actually added this time", g.some((x) => x && x.added > 0), g);
      rec("…and NO grid-box warning is raised", !/grid box/i.test(w), w);
    }

    console.log("\n[the channel] refWarning is what the shared surface drains");
    {
      // A note on a field no page reads would repeat the very defect being fixed.
      const lo = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8"));
      rec("the write-note surface drains refWarning", /typeof body\.refWarning === "string"/.test(lo),
        "refWarning is no longer drained — this note goes nowhere");
      // …and gridboxesAdded is still returned for anything that wants the structured form.
      rec("the structured field is still there too", Object.prototype.hasOwnProperty.call(r.body || {}, "gridboxesAdded"), Object.keys(r.body || {}));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== gridbox skip is reported: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
