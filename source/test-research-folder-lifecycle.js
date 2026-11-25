// Creating and deleting a custom research tab. Four confirmed defects, all reachable from the Research tab:
//
//  * delete-custom-folder had NO ownership check, while the gridbox sync has carried one since "saving ruined
//    the electronics tree" (getNovaCreatedTechFolders, commented there as a CRITICAL DATA-SAFETY GUARD). The
//    client derives folderKey from the tab's NAME, so a custom tab a modder calls "Infantry" becomes
//    infantry_folder — and its red ✕ then stripped the BASE GAME's infantry container, tab button and item
//    templates out of the mod's countrytechtreeview.gui. Every base tech in that tab lost its grid box.
//  * The delete's confirm dialog promises "Technologies in this tab will be moved to the Infantry tab". The
//    folder field was rewritten, but nothing gave those techs a grid box in their new home, so they existed
//    in script and never rendered — the "Found no grid box" failure.
//  * It left GFX_<folderKey>_tab behind, art for a tab that no longer exists.
//  * upsertTechnologyFolderDef returned early when the folder existed, so it only ever INSERTED. Changing a
//    tab's Research Ledger reported ok and updated the display name while the mod file kept the old ledger.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-resfold-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "resmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ResMod"\nsupported_version="1.18.*"\n', "utf8");

// A minimal but structurally real research GUI: a base-game folder container, its item templates, and the
// folder_tabs container the injector anchors on. Hermetic — no vanilla install needed.
const GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
fs.writeFileSync(GUI, [
  "guiTypes = {",
  '\tcontainerWindowType = {',
  '\t\tname = "countrytechtreeview"',
  '\t\tcontainerWindowType = {',
  '\t\t\tname = "infantry_folder"',
  '\t\t\tposition = { x = 0 y = 0 }',
  '\t\t\tgridBoxType = {',
  '\t\t\t\tname = "infantry_tech_tree"',
  '\t\t\t\tposition = { x = 10 y = 10 }',
  '\t\t\t\tformat = "LEFT"',
  '\t\t\t}',
  '\t\t}',
  '\t\tcontainerWindowType = {',
  '\t\t\tname = "techtree_infantry_folder_item"',
  '\t\t\tposition = { x = 0 y = 0 }',
  '\t\t}',
  '\t\tcontainerWindowType = {',
  '\t\t\tname = "folder_tabs"',
  '\t\t\tposition = { x = 0 y = 0 }',
  '\t\t\tbuttonType = {',
  '\t\t\t\tname = "infantry_folder_tab"',
  '\t\t\t\tposition = { x = 0 y = 0 }',
  '\t\t\t\tquadTextureSprite = "GFX_infantry_folder_tab"',
  '\t\t\t}',
  '\t\t}',
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42427;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const gui = () => fs.readFileSync(GUI, "utf8");
  const DEFS = path.join(MOD, "common", "technology_tags", "zz_nova_custom_folders.txt");
  const defs = () => (fs.existsSync(DEFS) ? fs.readFileSync(DEFS, "utf8") : "");
  const GFX = path.join(MOD, "interface", "nova_custom_research.gfx");
  const gfx = () => (fs.existsSync(GFX) ? fs.readFileSync(GFX, "utf8") : "");
  const ledgerOf = (key) => {
    const m = new RegExp(`${key}\\s*=\\s*\\{[\\s\\S]*?ledger\\s*=\\s*([a-z]+)`).exec(defs());
    return m ? m[1] : null;
  };

  try {
    console.log("\n[create] a custom tab");
    fs.writeFileSync(path.join(MOD, "gfx_stub.dds"), Buffer.alloc(8));
    let r = await post("/api/research/create-custom-folder", {
      modPath: MOD, folderKey: "nova_ops_folder", ledger: "navy", name: "Ops", tabDdsPath: "gfx_stub.dds",
    });
    rec("create succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the folder def was written", /nova_ops_folder\s*=\s*\{/.test(defs()), defs());
    rec("with the requested ledger", ledgerOf("nova_ops_folder") === "navy", ledgerOf("nova_ops_folder"));
    rec("the tab sprite was registered", /GFX_nova_ops_folder_tab/.test(gfx()), gfx());

    console.log("\n[edit ledger] re-posting with a different ledger must actually change it");
    r = await post("/api/research/create-custom-folder", {
      modPath: MOD, folderKey: "nova_ops_folder", ledger: "air", name: "Ops",
    });
    rec("the edit succeeded", r.status === 200, r.body || r.status);
    rec("the ledger on disk is now air", ledgerOf("nova_ops_folder") === "air", ledgerOf("nova_ops_folder"));
    rec("…and there is still exactly one definition",
      (defs().match(/nova_ops_folder\s*=\s*\{/g) || []).length === 1,
      (defs().match(/nova_ops_folder\s*=\s*\{/g) || []).length);

    console.log("\n[control] omitting the ledger must NOT reset it to army");
    r = await post("/api/research/create-custom-folder", { modPath: MOD, folderKey: "nova_ops_folder", name: "Ops" });
    rec("the ledger was left alone", ledgerOf("nova_ops_folder") === "air", ledgerOf("nova_ops_folder"));

    console.log("\n[guard] deleting a BASE-GAME folder must be refused");
    const guiBefore = gui();
    r = await post("/api/research/delete-custom-folder", { modPath: MOD, folderKey: "infantry_folder" });
    rec("the delete was REFUSED", r.status === 400, r.body || r.status);
    rec("…with a message explaining why", !!(r.body && /Nova created|zz_nova_custom_folders/.test(String(r.body.error))),
      r.body && r.body.error);
    rec("the base folder's container is untouched", /name = "infantry_folder"/.test(gui()), gui().slice(0, 300));
    rec("its grid box is untouched", /infantry_tech_tree/.test(gui()), gui().slice(0, 400));
    rec("its item template is untouched", /techtree_infantry_folder_item/.test(gui()), gui().slice(0, 400));
    rec("its tab button is untouched", /infantry_folder_tab/.test(gui()), gui().slice(0, 400));
    rec("the GUI file is byte-identical", gui() === guiBefore, { before: guiBefore.length, after: gui().length });

    console.log("\n[delete] deleting OUR tab re-homes its techs WITH grid boxes and cleans the sprite up");
    fs.writeFileSync(path.join(MOD, "common", "technologies", "nova_ops_techs.txt"), [
      "technologies = {",
      "\tnova_ops_alpha = {",
      "\t\tresearch_cost = 1",
      "\t\tfolder = { name = nova_ops_folder position = { x = 0 y = 0 } }",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");

    r = await post("/api/research/delete-custom-folder", { modPath: MOD, folderKey: "nova_ops_folder" });
    rec("the delete succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const techText = fs.readFileSync(path.join(MOD, "common", "technologies", "nova_ops_techs.txt"), "utf8");
    rec("the tech was re-homed to infantry_folder", /name\s*=\s*infantry_folder/.test(techText), techText);
    rec("…and reported as re-homed", r.body && r.body.rehomedGridboxes >= 1, r.body);
    rec("the re-homed tech now HAS a grid box in its new tab",
      new RegExp('name\\s*=\\s*"nova_ops_alpha_tree"').test(gui()), gui());
    rec("the orphan tab sprite was removed", !/GFX_nova_ops_folder_tab/.test(gfx()), gfx());
    rec("…and reported", r.body && r.body.spriteRemoved === true, r.body);
    rec("the custom folder def is gone", !/nova_ops_folder\s*=\s*\{/.test(defs()), defs());
    rec("the BASE folder survived our delete", /name = "infantry_folder"/.test(gui()), gui().slice(0, 300));

    console.log(`\n=== research folder lifecycle: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
