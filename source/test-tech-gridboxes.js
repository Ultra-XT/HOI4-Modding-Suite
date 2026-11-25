// Tests the per-tech gridbox sync that makes a custom research folder's techs actually render.
// MD's tech tree needs a `gridboxtype = { name = "<tech>_tree" ... }` per tech inside the folder
// container, else the game logs "Found no grid box for tech X" and the tab shows up empty.
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");
const {
  buildTechFolderGridboxes,
  scanTechsInFolder,
  injectGridboxesIntoFolderContainer,
  ensureFolderItemTemplates,
  parseManagedGridboxPositions,
  relayoutCustomFolderTechFiles,
  syncCustomFolderGridboxes,
  getModDefinedTechFolders,
  syncAllCustomFolderGridboxes,
} = server;

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (t) => { let d = 0; for (const c of String(t).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

// --- pure helper: buildTechFolderGridboxes ---
{
  // buildTechFolderGridboxes mirrors the (year-encoded) folder positions at 70px/coord. OX=130,OY=140,U=70.
  // alpha(x=0,y=0)->(130,140); beta(x=2,y=3)-> horizontal screen-x=fy=3 -> 130+210=340, screen-y=fx=2 -> 140+140=280.
  const blk = buildTechFolderGridboxes([{ name: "alpha", x: 0, y: 0 }, { name: "beta", x: 2, y: 3 }], { columns: [{ coord: 0, year: 1990 }, { coord: 3, year: 2000 }] });
  check("emits a gridboxtype per tech named <tech>_tree", /name = "alpha_tree"/.test(blk) && /name = "beta_tree"/.test(blk), "");
  check("gridbox pixel mirrors folder.position at 70px/coord", /name = "alpha_tree"[\s\S]*?position = \{ x = 130 y = 140 \}/.test(blk) && /name = "beta_tree"[\s\S]*?position = \{ x = 340 y = 280 \}/.test(blk), blk.slice(0, 520));
  check("emits a year label per supplied column, aligned to its coord", /text = "1990"[\s\S]*?/.test(blk) && /position = \{ x = 340 y = 14 \}[\s\S]*?text = "2000"/.test(blk), blk.slice(0, 900));
  check("wraps in NOVA markers for idempotent replace", /NOVA_GRIDBOXES/.test(blk), "");

  // relayoutCustomFolderTechFiles: rewrites folder.position so the TIME axis spreads by start_year.
  {
    const t2 = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-relayout-"));
    try {
      fs.mkdirSync(path.join(t2, "common", "technologies"), { recursive: true });
      fs.writeFileSync(path.join(t2, "common", "technologies", "t.txt"),
        "technologies = {\n\tt_early = { start_year = 1990 folder = { name = f position = { x = 2 y = 0 } } }\n\tt_late = { start_year = 2008 folder = { name = f position = { x = 2 y = 1 } } }\n}\n", "utf8");
      const r = relayoutCustomFolderTechFiles(t2, "f");
      const out = fs.readFileSync(path.join(t2, "common", "technologies", "t.txt"), "utf8");
      // years 1990,2008 -> column ranks 0,1 -> folder.y = 0, 3 (COL_STEP=3); lane rank for x=2 is 0 -> folder.x=0.
      check("relayout spreads techs along the time axis (folder.y = year column × 3)",
        /t_early =[\s\S]*?position = \{ x = 0 y = 0 \}/.test(out) && /t_late =[\s\S]*?position = \{ x = 0 y = 3 \}/.test(out), out);
      check("relayout reports the year columns for labels", r.columns.some((c) => c.year === 1990 && c.coord === 0) && r.columns.some((c) => c.year === 2008 && c.coord === 3), JSON.stringify(r.columns));
    } finally { try { fs.rmSync(t2, { recursive: true, force: true }); } catch (_) {} }
  }

  // relayoutCustomFolderTechFiles: a tech in skipTechNames (it already has a base gridbox) keeps its
  // hand-tuned folder position byte-for-byte — that's the 1:1 round-trip guarantee; only the techs WE
  // manage get repositioned, and the skipped one is excluded from the column/lane ranking too.
  {
    const t3 = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-relayout-skip-"));
    try {
      fs.mkdirSync(path.join(t3, "common", "technologies"), { recursive: true });
      fs.writeFileSync(path.join(t3, "common", "technologies", "t.txt"),
        "technologies = {\n" +
        "\tt_a = { start_year = 1990 folder = { name = f position = { x = 2 y = 0 } } }\n" +
        "\tt_b = { start_year = 2008 folder = { name = f position = { x = 2 y = 1 } } }\n" +
        "\tt_keep = { start_year = 2000 folder = { name = f position = { x = 99 y = 99 } } }\n}\n", "utf8");
      const r = relayoutCustomFolderTechFiles(t3, "f", { skipTechNames: new Set(["t_keep"]) });
      const out = fs.readFileSync(path.join(t3, "common", "technologies", "t.txt"), "utf8");
      check("skip: the skipped tech keeps its hand-tuned position (x=99 y=99)", /t_keep =[\s\S]*?position = \{ x = 99 y = 99 \}/.test(out), out);
      check("skip: managed techs are still relaid out (ranked WITHOUT the skipped one)",
        /t_a =[\s\S]*?position = \{ x = 0 y = 0 \}/.test(out) && /t_b =[\s\S]*?position = \{ x = 0 y = 3 \}/.test(out), out);
      check("skip: only the 2 managed techs are reported changed", r.changed === 2, "changed=" + r.changed);
    } finally { try { fs.rmSync(t3, { recursive: true, force: true }); } catch (_) {} }
  }
}

// --- synthetic mod for the rest ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-gridbox-"));
try {
  const gui = `guiTypes = {
\tcontainerWindowType = {
\t\tname = "countrytechtreeview"
\t\tcontainerWindowType = {
\t\t\tname = "myfolder"
\t\t\tposition = { x=0 y=47 }
\t\t\tcontainerWindowType = {
\t\t\t\tname = "techtree_stripes"
\t\t\t\tposition = { x=0 y=0 }
\t\t\t}
\t\t}
\t\tcontainerWindowType = {
\t\t\tname = "folder_tabs"
\t\t\tbuttonType = { name = "myfolder_tab" position = { x = 944 y = 0 } }
\t\t}
\t}
\tcontainerWindowType = {
\t\tname = "techtree_infantry_folder_item"
\t\tsize = { width = 183 height = 84 }
\t\ticonType = { name = "Icon" spriteType = "GFX_technology_medium" }
\t}
\tcontainerWindowType = {
\t\tname = "techtree_infantry_folder_small_item"
\t\tsize = { width = 96 height = 84 }
\t\ticonType = { name = "Icon" spriteType = "GFX_technology_small" }
\t}
\tcontainerWindowType = {
\t\tname = "techtree_armour_folder_item"
\t\tsize = { width = 183 height = 84 }
\t\ticonType = { name = "Icon" spriteType = "GFX_technology_medium" }
\t\tcontainerWindowType = { name = "sub_technology_slot_0" position = { x=141 y=1 } size = { width=35 height=26 } }
\t}
}
`;
  fs.mkdirSync(path.join(tmp, "interface"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), gui, "utf8");

  fs.mkdirSync(path.join(tmp, "common", "technology_tags"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "technology_tags", "zz_nova_custom_folders.txt"),
    "technology_folders = {\n\tmyfolder = {\n\t\tledger = army\n\t}\n}\n", "utf8");

  fs.mkdirSync(path.join(tmp, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "technologies", "t.txt"),
    `technologies = {
\ttech_a = {
\t\tresearch_cost = 1
\t\tstart_year = 1990
\t\tfolder = { name = myfolder position = { x = 2 y = 0 } }
\t}
\ttech_b = {
\t\tstart_year = 2000
\t\tsub_technologies = { tech_b_elite }
\t\tfolder = { name = myfolder position = { x = 2 y = 1 } }
\t}
\ttech_b_elite = {
\t\tfolder = { name = myfolder position = { x = 2 y = 1 } }
\t}
\tother = {
\t\tfolder = { name = infantry position = { x = 0 y = 0 } }
\t}
}
`, "utf8");

  // scanTechsInFolder
  const found = scanTechsInFolder(tmp, "myfolder").map((t) => t.name).sort();
  check("scanTechsInFolder finds exactly the folder's techs (incl. sub-tech, excl. other folders)",
    JSON.stringify(found) === JSON.stringify(["tech_a", "tech_b", "tech_b_elite"]), found.join(","));

  // getModDefinedTechFolders
  check("getModDefinedTechFolders returns the mod's folder key", getModDefinedTechFolders(tmp).includes("myfolder"), "");

  // syncCustomFolderGridboxes
  const r1 = syncCustomFolderGridboxes(tmp, "myfolder");
  check("sync reports it changed the gui + 3 techs", r1.changed === true && r1.techCount === 3, JSON.stringify(r1));
  const gui1 = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  check("gui now has a gridbox for every tech", /name = "tech_a_tree"/.test(gui1) && /name = "tech_b_tree"/.test(gui1) && /name = "tech_b_elite_tree"/.test(gui1), "");
  check("gridboxes landed INSIDE the myfolder container (before its close)", /name = "myfolder"[\s\S]*?tech_a_tree[\s\S]*?folder_tabs/.test(gui1), "");
  check("clones the node-renderer item template techtree_<folder>_item", /name = "techtree_myfolder_item"/.test(gui1), "");
  check("clones the small item template too", /name = "techtree_myfolder_small_item"/.test(gui1), "");
  // The clone must come from a COMPLETE source (the armour template, which has the sub-tech slot) —
  // not the infantry one that lacks it — so techs with sub_technologies render their slot in-game.
  {
    const b = gui1.indexOf('name = "techtree_myfolder_item"');
    const end = gui1.indexOf('name = "techtree_myfolder_small_item"');
    const itemBlock = gui1.slice(b, end > b ? end : b + 600);
    check("cloned item template includes sub_technology_slot_0 (prefers a complete source)", /sub_technology_slot_0/.test(itemBlock), "");
  }
  // self-heal: an already-cloned INCOMPLETE template (missing the slot) gets upgraded in place.
  {
    const lastBrace = gui.lastIndexOf("}");
    const withIncomplete = gui.slice(0, lastBrace) +
      '\tcontainerWindowType = {\n\t\tname = "techtree_myfolder_item"\n\t\tsize = { width = 183 height = 84 }\n\t}\n' +
      gui.slice(lastBrace);
    const healed = ensureFolderItemTemplates(withIncomplete, "myfolder");
    const bIdx = healed.indexOf('name = "techtree_myfolder_item"');
    const itemBlk = healed.slice(bIdx, bIdx + 600);
    check("self-heal upgrades an incomplete existing template to include the slot", /sub_technology_slot_0/.test(itemBlk) && balanced(healed), "");
    check("self-heal does not duplicate the item template", (healed.match(/name = "techtree_myfolder_item"/g) || []).length === 1, "");
  }
  check("gui stays brace-balanced after sync", balanced(gui1), "");

  // idempotency: second sync must not duplicate
  syncCustomFolderGridboxes(tmp, "myfolder");
  const gui2 = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  const count = (gui2.match(/name = "tech_a_tree"/g) || []).length;
  check("idempotent: re-sync does not duplicate gridboxes", count === 1, "count=" + count);
  check("idempotent: still exactly one NOVA_GRIDBOXES block", (gui2.match(/>>> NOVA_GRIDBOXES/g) || []).length === 1, "");
  check("idempotent: item template not duplicated", (gui2.match(/name = "techtree_myfolder_item"/g) || []).length === 1, "");

  // sync emits year labels (from the techs' start_year) so the in-game tab shows years.
  syncCustomFolderGridboxes(tmp, "myfolder");
  const g3 = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  check("sync emits year-label text boxes from start_year", /name = "nova_year_0"/.test(g3) && /text = "1990"/.test(g3) && /instantTextBoxType/.test(g3), "");
  check("year labels live inside the managed NOVA region", /# >>> NOVA_GRIDBOXES[\s\S]*nova_year_0[\s\S]*# <<< NOVA_GRIDBOXES/.test(g3), "");
  // editor-supplied orientation is honored (vertical) and positions still write.
  syncCustomFolderGridboxes(tmp, "myfolder", { orientation: "vertical" });
  const g3v = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  check("orientation from the editor is honored", /text = "1990"/.test(g3v) && Object.keys(parseManagedGridboxPositions(g3v)).length >= 3, "");

  // syncAllCustomFolderGridboxes wrapper
  const all = syncAllCustomFolderGridboxes(tmp);
  check("syncAll covers the mod-defined folder", all.folders.some((f) => f.folder === "myfolder"), JSON.stringify(all).slice(0, 150));
  // Robustness: a mod with NO custom tech folders → empty result, no throw (the common case for add-ons
  // that haven't created a custom research tab yet).
  {
    const noFolders = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-nofolders-"));
    try {
      const none = syncAllCustomFolderGridboxes(noFolders);
      check("syncAll on a mod with no custom folders → {folders:[],changedCount:0}, no throw",
        Array.isArray(none.folders) && none.folders.length === 0 && none.changedCount === 0, JSON.stringify(none));
    } finally { try { fs.rmSync(noFolders, { recursive: true, force: true }); } catch (_) {} }
  }

  // injectGridboxesIntoFolderContainer with empty block strips the NOVA region
  const cleared = injectGridboxesIntoFolderContainer(gui2, "myfolder", "");
  check("empty block clears prior NOVA gridboxes", !/NOVA_GRIDBOXES/.test(cleared) && balanced(cleared), "");
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

// ── 1:1 SAFETY: a folder that already has a base (MD/vanilla) gridbox must NOT be duplicated/moved ──
// This is the Gaza-of-research bug: with MD as the active mod, sync re-emitted MD's own gridboxes →
// "Found duplicate gridBoxType" + a wrecked layout. Now base gridboxes are left strictly alone.
{
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-dupe-"));
  try {
    const gui =
`guiTypes = {
\tcontainerWindowType = {
\t\tname = "elec_folder"
\t\tposition = { x=0 y=47 }
\t\tgridboxType = {
\t\t\tname = "existing_tech_tree"
\t\t\tposition = { x = 999 y = 777 }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "LEFT"
\t\t}
\t\tcontainerWindowType = { name = "techtree_stripes" position = { x=0 y=0 } }
\t}
\tcontainerWindowType = { name = "techtree_infantry_folder_item" size = { width = 183 height = 84 } containerWindowType = { name = "sub_technology_slot_0" } }
\tcontainerWindowType = { name = "techtree_infantry_folder_small_item" size = { width = 96 height = 84 } }
}
`;
    fs.mkdirSync(path.join(t, "interface"), { recursive: true });
    fs.writeFileSync(path.join(t, "interface", "countrytechtreeview.gui"), gui, "utf8");
    fs.mkdirSync(path.join(t, "common", "technology_tags"), { recursive: true });
    // elec_folder must be a NOVA-created folder for the sync to touch it at all (base-mod folders are
    // left 1:1 — see the syncCustomFolderGridboxes guard). This section tests the WITHIN-Nova-folder
    // skip logic: an already-gridboxed tech isn't relaid out, a new one gets a gridbox.
    fs.writeFileSync(path.join(t, "common", "technology_tags", "zz_nova_custom_folders.txt"), "technology_folders = {\n\telec_folder = { ledger = army }\n}\n", "utf8");
    fs.mkdirSync(path.join(t, "common", "technologies"), { recursive: true });
    fs.writeFileSync(path.join(t, "common", "technologies", "t.txt"),
      "technologies = {\n\texisting_tech = { folder = { name = elec_folder position = { x = 0 y = 0 } } }\n\tnew_tech = { folder = { name = elec_folder position = { x = 0 y = 1 } } }\n}\n", "utf8");

    const r = syncCustomFolderGridboxes(t, "elec_folder");
    const out = fs.readFileSync(path.join(t, "interface", "countrytechtreeview.gui"), "utf8");
    check("does NOT duplicate an existing base gridbox", (out.match(/name = "existing_tech_tree"/g) || []).length === 1, "count=" + (out.match(/name = "existing_tech_tree"/g) || []).length);
    check("leaves the base gridbox position untouched (1:1)", /existing_tech_tree"[\s\S]*?position = \{ x = 999 y = 777 \}/.test(out), "");
    check("base gridbox stays OUTSIDE the NOVA-managed block", !/NOVA_GRIDBOXES[\s\S]*existing_tech_tree[\s\S]*NOVA_GRIDBOXES/.test(out), "");
    check("DOES add a gridbox for the new tech that had none", /name = "new_tech_tree"/.test(out), "");
    check("reports only OUR tech as managed (base tech skipped)", r.managed === 1, JSON.stringify(r));
    check("does NOT rewrite the base tech's folder position", /existing_tech = \{ folder = \{ name = elec_folder position = \{ x = 0 y = 0 \}/.test(fs.readFileSync(path.join(t, "common", "technologies", "t.txt"), "utf8")), "");
    check("gui stays brace-balanced after dedup sync", balanced(out), "");
  } catch (e) { fail++; console.log("  FAIL dupe-harness →", e.message); }
  finally { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }
}

// buildTechFolderGridboxes honors skipNames (the unit behind the dedup above).
{
  const blk = buildTechFolderGridboxes([{ name: "keep", x: 0, y: 0 }, { name: "skip", x: 0, y: 1 }], { skipNames: new Set(["skip_tree"]) });
  check("buildTechFolderGridboxes skips a name in skipNames", /name = "keep_tree"/.test(blk) && !/name = "skip_tree"/.test(blk), "");
}

console.log(`\nTECH-GRIDBOXES TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
