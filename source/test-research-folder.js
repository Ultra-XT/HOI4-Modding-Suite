/*
 * Verify /api/research/create-custom-folder scaffolds a WORKING custom research tab into a mod,
 * tested against the REAL vanilla countrytechtreeview.gui. Asserts:
 *  - technology_folders def written with the chosen ledger
 *  - a mod copy of countrytechtreeview.gui is created, stays brace-balanced, and KEEPS vanilla folders
 *  - the new folder's viewport container + clickable tab button are injected
 *  - idempotent: a second call adds nothing and never duplicates
 *  - an uploaded icon registers GFX_<key>_tab; no icon falls back to a vanilla sprite
 *  - the vanilla-write guard still blocks writing into the game install
 *
 * Run: node test-research-folder.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3578;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const post = async (r, b) => {
  const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: res.status, body: await res.json() };
};

const bal = (t) => { const s = t.replace(/#.*$/gm, ""); let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-resfolder-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="ResFolder"\n', "utf8");
  // discover game root for the assertion about vanilla folders surviving
  const root = await fetch(BASE + "/api/root").then((x) => x.json());
  const gameRoot = root.hoi4GameRoot;
  try {
    console.log("\nCustom research folder scaffolding:");

    // 1. Create a folder with a navy ledger, no icon.
    let r = await post("/api/research/create-custom-folder", { folderKey: "my_special_folder", ledger: "navy", modPath: mod });
    ok(r.body.ok, "create-custom-folder ok", r.body);
    ok(r.body.spriteKey === "GFX_infantry_folder_tab", "no-icon falls back to vanilla tab sprite", r.body);

    // 1b. Folder DISPLAY-NAME loc: HOI4 reads the tab name from a loc key matching the folder key; without
    //     it the tab rendered the raw key with underscores (a user-reported bug — "space_tech_folder").
    //     No name supplied here -> derive a title-cased name from the key (strip a trailing _folder).
    const locFile = path.join(mod, "localisation", "english", "nova_custom_folders_l_english.yml");
    ok(fs.existsSync(locFile), "folder-name loc file written");
    const loc1 = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    ok(/^﻿/.test(loc1), "loc file leads with a UTF-8 BOM");
    ok(/my_special_folder:0\s+"My Special"/.test(loc1), "no-name folder -> title-cased loc derived from key", loc1);
    // 1c. A folder WITH an explicit display name uses it verbatim (no underscores shown in-game).
    await post("/api/research/create-custom-folder", { folderKey: "space_tech_folder", ledger: "army", modPath: mod, name: "Space Tech" });
    const loc2 = fs.readFileSync(locFile, "utf8");
    ok(/space_tech_folder:0\s+"Space Tech"/.test(loc2), "explicit name -> exact loc value", loc2);

    // 2. technology_folders definition.
    const defFile = path.join(mod, "common", "technology_tags", "zz_nova_custom_folders.txt");
    ok(fs.existsSync(defFile), "folder def file written");
    const def = fs.existsSync(defFile) ? fs.readFileSync(defFile, "utf8") : "";
    ok(/my_special_folder\s*=\s*\{[\s\S]*ledger\s*=\s*navy/.test(def), "def has folder + navy ledger", def);
    ok(bal(def), "def file brace-balanced");

    // 3. GUI: mod copy made, brace-balanced, vanilla folders preserved, new container + tab present.
    const guiFile = path.join(mod, "interface", "countrytechtreeview.gui");
    ok(fs.existsSync(guiFile), "mod copy of countrytechtreeview.gui created");
    const gui = fs.existsSync(guiFile) ? fs.readFileSync(guiFile, "utf8") : "";
    ok(bal(gui), "mod GUI brace-balanced");
    ok(/name\s*=\s*"infantry_folder"/.test(gui), "vanilla infantry_folder preserved");
    ok(/name\s*=\s*"folder_tabs"/.test(gui), "vanilla folder_tabs preserved");
    ok(/name\s*=\s*"my_special_folder"/.test(gui), "new folder container injected");
    ok(/name\s*=\s*"my_special_folder_tab"/.test(gui), "new tab button injected");
    ok(/quadTextureSprite\s*=\s*"GFX_infantry_folder_tab"/.test(gui.slice(gui.indexOf("my_special_folder_tab"))), "tab button references the sprite");

    // Completeness vs vanilla: a correct insertion adds the folder container (10 '{') + tab button
    // (2) PLUS the cloned node-renderer item templates (techtree_<folder>_item and _small_item) that
    // the game needs to draw nodes — so the brace delta is well above 12. The real safety property is
    // that the result stays brace-balanced (a truncated/partial block would not) AND the item
    // template was actually cloned (without it MD/vanilla log "Undefined GUI_TYPE … will crash").
    if (gameRoot) {
      const vanilla = fs.readFileSync(path.join(gameRoot, "interface", "countrytechtreeview.gui"), "utf8");
      const cnt = (s) => (s.replace(/#.*$/gm, "").match(/\{/g) || []).length;
      const delta = cnt(gui) - cnt(vanilla);
      ok(delta >= 12, "added complete container + tab button + node-renderer item template blocks", { delta });
      ok(/name\s*=\s*"techtree_my_special_folder_item"/.test(gui), "cloned the node-renderer item template (techtree_<folder>_item)");
      let d = 0, bal = true; for (const c of gui.replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) bal = false; } }
      ok(bal && d === 0, "generated GUI stays brace-balanced");
    }

    // 4. Idempotency — second identical call changes nothing.
    r = await post("/api/research/create-custom-folder", { folderKey: "my_special_folder", ledger: "navy", modPath: mod });
    ok(r.body.ok && r.body.wroteDef === false && r.body.wroteGui === false, "second call is a no-op", r.body);
    const gui2 = fs.readFileSync(guiFile, "utf8");
    ok((gui2.match(/name\s*=\s*"my_special_folder"/g) || []).length === 1, "folder container not duplicated");
    ok((gui2.match(/name\s*=\s*"my_special_folder_tab"/g) || []).length === 1, "tab button not duplicated");

    // 5. A second DIFFERENT folder co-exists and stays balanced.
    r = await post("/api/research/create-custom-folder", { folderKey: "another_folder", ledger: "air", modPath: mod });
    const gui3 = fs.readFileSync(guiFile, "utf8");
    ok(r.body.ok && /name\s*=\s*"another_folder_tab"/.test(gui3) && /name\s*=\s*"my_special_folder_tab"/.test(gui3), "two custom tabs co-exist");
    ok(bal(gui3), "GUI still balanced with two custom folders");

    // 6. With an uploaded icon path -> GFX_<key>_tab registered.
    r = await post("/api/research/create-custom-folder", { folderKey: "iconned_folder", ledger: "army", tabDdsPath: "gfx/interface/techtree/my_tab.dds", modPath: mod });
    ok(r.body.spriteKey === "GFX_iconned_folder_tab", "uploaded icon -> custom sprite key", r.body);
    const gfxFile = path.join(mod, "interface", "nova_custom_research.gfx");
    ok(fs.existsSync(gfxFile) && /name\s*=\s*"GFX_iconned_folder_tab"/.test(fs.readFileSync(gfxFile, "utf8")), "custom tab sprite registered");

    // 7. Validation: bad folder key rejected.
    r = await post("/api/research/create-custom-folder", { folderKey: "Bad Key!", ledger: "army", modPath: mod });
    ok(r.status === 400, "invalid folder key rejected", r);

    // 7b. A folder id starting with a DIGIT is rejected — HOI4 forbids it (lexer.cpp:194), and "21_folder"
    // silently dropped a whole research tab in-game (the bug a user hit on Millennium Dawn).
    r = await post("/api/research/create-custom-folder", { folderKey: "21_folder", ledger: "army", modPath: mod });
    ok(r.status === 400, "folder key starting with a digit rejected", r);

    // 8. Vanilla-write guard: writing into the game root is refused.
    if (gameRoot) {
      r = await post("/api/research/create-custom-folder", { folderKey: "evil_folder", ledger: "army", modPath: gameRoot });
      ok(r.status === 400, "writing into the game install is blocked", r);
    }

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) {
    console.error(e); fail++;
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    process.exit(fail ? 1 : 0);
  }
})();
