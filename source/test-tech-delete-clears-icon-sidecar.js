// #tech-delete-leaves-icon-sidecar — A DELETED TECHNOLOGY KEPT REGENERATING THREE DEAD SPRITES.
//
// A technology's chosen icon lives in editor_tech_icons.json, because the script itself has no icon field —
// the sidecar IS the storage. nova_tech_icons.gfx is then rebuilt WHOLESALE from that map on every save,
// emitting GFX_<id>_medium, _small and _large for each entry.
//
// The RENAME case was fixed: a renamed tech's old id is deleted from the map, under a comment spelling out
// the consequence of not doing it — "three orphaned sprite definitions pointing at a texture no tech
// references any more… rename a tech ten times and the mod carries thirty dead sprites and ten dead sidecar
// entries". Everything in that sentence is equally true of a DELETE, and only the rename half was written.
//
// So deleting a technology through the editor left its sidecar entry behind for ever, and every subsequent
// save re-emitted three sprites naming a technology that no longer exists.
//
// ⭐ THE TELL: /api/technologies/delete — the standalone route — DOES clear the entry. The save-batch
// deferred-deletion path does not, and that is the one the editor actually uses, because a delete in the
// research editor is deferred until Save. One path cleans up, its sibling does not, and the sibling is the
// one users hit.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sidecar-"));
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
const MOD = path.join(ROOT, "sidecarmod");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SidecarMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "sidecarmod.mod"), 'name="SidecarMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "technology_tags", "00_technology.txt"),
  "technology_categories = {\n\tnova_sc_cat\n}\ntechnology_folders = {\n\tnova_sc_folder = {\n\t\tledger = army\n\t}\n}\n");

const SIDECAR = path.join(MOD, "editor_tech_icons.json");
const GFX = path.join(MOD, "interface", "nova_tech_icons.gfx");
const PORT = 53171;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const saveBatch = (body) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
    const tech = (id) => ({
      id, folder: "nova_sc_folder", isMod: true, researchCost: 2,
      categories: ["nova_sc_cat"], x: 0, y: 0, startYear: 1936, iconKey: "GFX_infantry_folder_tab",
    });
    const sidecar = () => { try { return JSON.parse(fs.readFileSync(SIDECAR, "utf8")); } catch (_) { return null; } };
    const gfx = () => { try { return fs.readFileSync(GFX, "utf8"); } catch (_) { return ""; } };

    console.log("\n[CONTROL] a saved tech gets a sidecar entry and three sprites");
    {
      const r = await saveBatch({ modPath: MOD, technologies: [tech("nova_doomed_tech"), tech("nova_kept_tech")], newTechIds: ["nova_doomed_tech", "nova_kept_tech"] });
      rec("the save succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);
      const m = sidecar();
      console.log(`     sidecar: ${JSON.stringify(m)}`);
      // ⚠️ If the icon never lands there is nothing to leave behind and every check below is vacuous.
      rec("the sidecar records both icons", m && m.nova_doomed_tech && m.nova_kept_tech, m);
      const g = gfx();
      rec("…and the gfx names three sprites for the doomed tech",
        ["_medium", "_small", "_large"].every((s) => g.includes(`GFX_nova_doomed_tech${s}`)), g.slice(0, 300));
    }

    console.log("\n[the defect] deleting through save-batch must take the icon entry with it");
    {
      const r = await saveBatch({
        modPath: MOD,
        technologies: [tech("nova_kept_tech")],
        newTechIds: [],
        // ⚠️ custom_technologies.txt is where save-batch ACTUALLY writes a new tech. This said
        // "zz_nova_technologies.txt", a file Nova never creates, so removeNamedBlockFromFile refused every
        // time and the technology block was never deleted at all. The test still passed, because the code
        // then ran the sidecar cleanup regardless — so it was asserting the cleanup half of a bug rather
        // than a working delete. Verified by driving save-batch and listing the directory.
        deletions: [{ techId: "nova_doomed_tech", techFile: "custom_technologies.txt" }],
      });
      rec("the delete-save succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);
      const m = sidecar();
      console.log(`     sidecar after delete: ${JSON.stringify(m)}`);
      // THE BUG: nova_doomed_tech stayed in the map for ever.
      rec("the deleted tech's entry is gone", m && !Object.prototype.hasOwnProperty.call(m, "nova_doomed_tech"), m);
      // CONTROL: the surviving tech must keep its icon — this is a delete, not a purge.
      rec("…while the surviving tech keeps its icon", m && m.nova_kept_tech, m);

      const g = gfx();
      console.log(`     gfx mentions the dead tech? ${/nova_doomed_tech/.test(g)}`);
      rec("no dead sprite is regenerated for it", !/nova_doomed_tech/.test(g), g.slice(0, 400));
      rec("…and the surviving tech still has its three",
        ["_medium", "_small", "_large"].every((s) => g.includes(`GFX_nova_kept_tech${s}`)), g.slice(0, 400));
    }

    console.log("\n[⭐ CONTROL] a tech deleted and re-added in the SAME save keeps its icon");
    {
      // deletedLocIds is already filtered by recreatedTechIds, and it must stay that way: the editor can
      // legitimately remove and re-add a node before saving, and that must not lose the icon.
      const r = await saveBatch({
        modPath: MOD,
        technologies: [tech("nova_kept_tech"), tech("nova_redone_tech")],
        newTechIds: ["nova_redone_tech"],
        deletions: [{ techId: "nova_redone_tech", techFile: "custom_technologies.txt" }],
      });
      rec("the save succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);
      const m = sidecar();
      console.log(`     sidecar: ${JSON.stringify(m)}`);
      rec("a tech deleted and recreated in one save keeps its icon", m && m.nova_redone_tech, m);
    }

    console.log("\n[the sibling] the standalone delete route already did this");
    {
      // If that ever stops being true, both paths should be looked at together.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const at = sv.indexOf('app.post("/api/technologies/delete"');
      const near = at === -1 ? "" : sv.slice(at, at + 6000);
      rec("the standalone delete route is findable", at !== -1, "not found");
      rec("…and it clears the sidecar entry", /delete iconMap\[techId\]/.test(near), near.slice(0, 200));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== tech delete clears icon sidecar: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
