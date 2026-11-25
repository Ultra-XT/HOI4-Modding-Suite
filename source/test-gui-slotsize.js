// The research GUI parser must read each folder's gridbox slotsize from countrytechtreeview.gui, and
// derive orientation from the year-label positions. The year ruler uses slotsize (height for vertical,
// width for horizontal) instead of a hardcoded 70, so folders whose gui uses width=50 (some MD air/naval
// variants) space their year stamps correctly. Vertical folders are height=70 → unchanged.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-guiSlot-"));
fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), `guiTypes = {
\tcontainerWindowType = {
\t\tname = "infantry_folder"
\t\tgridBoxType = {
\t\t\tname = "infantry_tree"
\t\t\tposition = { x = 140 y = 325 }
\t\t\tslotsize = { width = 50 height = 70 }
\t\t\tformat = "LEFT"
\t\t}
\t\tgridBoxType = {
\t\t\tname = "support_tree"
\t\t\tposition = { x = 600 y = 90 }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "LEFT"
\t\t}
\t\tgridBoxType = {
\t\t\tname = "pct_tree"
\t\t\tposition = { x = -11% y = 172 }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "UP"
\t\t}
\t\tgridBoxType = {
\t\t\tname = "up_sized_tree"
\t\t\tposition = { x = 340 y = 32 }
\t\t\tsize = { width = 400 height = 1000 }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "UP"
\t\t}
\t\tgridBoxType = {
\t\t\tname = "left_sized_tree"
\t\t\tposition = { x = 150 y = 200 }
\t\t\tsize = { width = 100 height = 140 }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "LEFT"
\t\t}
\t\tgridBoxType = {
\t\t\tname = "pct_sized_tree"
\t\t\tposition = { x = -11% y = 172 }
\t\t\tsize = { width = 80% height = 80% }
\t\t\tslotsize = { width = 70 height = 70 }
\t\t\tformat = "UP"
\t\t}
\t\tinstantTextBoxType = {
\t\t\tname = "y1"
\t\t\ttext = "1936"
\t\t\tposition = { x = 0 y = 0 }
\t\t}
\t\tinstantTextBoxType = {
\t\t\tname = "y2"
\t\t\ttext = "1940"
\t\t\tposition = { x = 200 y = 0 }
\t\t}
\t\tcontainerWindowType = {
\t\t\tname = "stripes"
\t\t\tposition = { x = -210 y = 0 }
\t\t\tsize = {
\t\t\t\twidth = 2739 height = 1390
\t\t\t\tmin = { width = 100%% height = 100%% }
\t\t\t}
\t\t\tinstantTextBoxType = {
\t\t\t\tname = "rail_year"
\t\t\t\ttext = "1965"
\t\t\t\tposition = { x = 60 y = 140 }
\t\t\t}
\t\t\tcontainerWindowType = {
\t\t\t\tname = "year_right_rail"
\t\t\t\tposition = { x = -100 y = 0 }
\t\t\t\tsize = { width = 130 height = 100% }
\t\t\t\torientation = upper_right
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "rail_year"
\t\t\t\t\ttext = "1965"
\t\t\t\t\tposition = { x = 0 y = 140 }
\t\t\t\t}
\t\t\t}
\t\t\tcontainerWindowType = {
\t\t\t\tname = "subtitles"
\t\t\t\tposition = { x = 0 y = 50 }
\t\t\t\tsize = { width = 600 height = 80% }
\t\t\t\torientation = center_up
\t\t\t\torigo = center_up
\t\t\t\tinstantTextBoxType = {
\t\t\t\t\tname = "sub_anti_tank"
\t\t\t\t\ttext = "TEST_SUBTITLE"
\t\t\t\t\tposition = { x = 207 y = 35 }
\t\t\t\t\tmaxWidth = 260
\t\t\t\t}
\t\t\t}
\t\t}
\t}
\tcontainerWindowType = {
\t\tname = "civilian_folder"
\t\tgridBoxType = {
\t\t\tname = "civ_tree"
\t\t\tslotsize = { width = 70 height = 70 }
\t\t}
\t\tinstantTextBoxType = {
\t\t\ttext = "1936"
\t\t\tposition = { x = 0 y = 0 }
\t\t}
\t\tinstantTextBoxType = {
\t\t\ttext = "1960"
\t\t\tposition = { x = 0 y = 240 }
\t\t}
\t}
\tcontainerWindowType = { name = "techtree_infantry_folder_item" position = { x = -56 y = -7 } size = { width = 183 height = 84 } }
\tcontainerWindowType = { name = "techtree_infantry_folder_small_item" position = { x = 0 y = 0 } size = { width = 72 height = 72 } }
\tcontainerWindowType = { name = "techtree_mtgnavalfolder_small_item" position = { x = 0 y = 0 } size = { width = 72 height = 72 } }
\tcontainerWindowType = { name = "techtree_civilian_folder_small_item" position = { x = 0 y = 5 } size = { width = 204 height = 72 } }
}
`, "utf8");

// The VISIBLE box in-game is the item's background SPRITE at NATIVE size (the container is just the frame):
// the fixture's civilian small container is 204×72, but its convention sprite points at a 72×72 texture —
// gui-layout must report the PLATE (72×72), not the frame. Minimal DDS headers are enough (only height@12 /
// width@16 are read). #plate-native-size
const dds = (w, h) => { const b = Buffer.alloc(128); b.write("DDS ", 0, "latin1"); b.writeUInt32LE(124, 4); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); return b; };
fs.mkdirSync(path.join(mod, "gfx", "interface", "techtree"), { recursive: true });
fs.writeFileSync(path.join(mod, "gfx", "interface", "techtree", "square_item.dds"), dds(72, 72));
fs.writeFileSync(path.join(mod, "gfx", "interface", "techtree", "wide_item.dds"), dds(183, 84));
fs.writeFileSync(path.join(mod, "interface", "countrytechtreeview.gfx"), `spriteTypes = {
\tspriteType = {
\t\tname = "GFX_technology_civilian_folder_small_available_item_bg"
\t\ttextureFile = "gfx//interface//techtree//square_item.dds"
\t}
\tspriteType = {
\t\tname = "GFX_technology_available_item_bg"
\t\ttextureFile = "gfx/interface/techtree/wide_item.dds"
\t}
}
`, "utf8");

// technology_tags: a doctrine folder must be flagged so the editor doesn't resurrect it as a research tab
// (the game shows doctrine folders in the Officer Corps screen, never on the research tree). #doctrine-folder-hidden
fs.mkdirSync(path.join(mod, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(mod, "common", "technology_tags", "00_technology.txt"), `technology_folders = {
\tinfantry_folder = {
\t\tledger = army
\t}
\tmy_doctrine_folder = {
\t\tledger = hidden
\t\tdoctrine = yes
\t}
}
`, "utf8");
// technologies: a special-project tech (is_special_project_tech + allow on project completion) is INVISIBLE
// on the in-game tree at game start — the catalog must flag it so the editor hides it too. #sp-tech-hidden
fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(mod, "common", "technologies", "test.txt"), `technologies = {
\tplain_tech = {
\t\tresearch_cost = 1
\t\tstart_year = 1936
\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }
\t}
\tsp_gated_tech = {
\t\tis_special_project_tech = yes
\t\tallow = { is_special_project_completed = sp:sp_test }
\t\tresearch_cost = 1
\t\tstart_year = 1942
\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }
\t}
}
`, "utf8");

const app = createApp();
const server = http.createServer(app);
function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: pathname }, (res) => {
      let out = ""; res.on("data", (c) => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    }).on("error", reject);
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const r = await get(`/api/research/gui-layout?modPath=${encodeURIComponent(mod)}`);
    check("gui-layout returned ok", r.status === 200, r.status + " " + r.body.slice(0, 120));
    const j = JSON.parse(r.body);
    const inf = (j.folders || {}).infantry_folder;
    const civ = (j.folders || {}).civilian_folder;
    check("infantry_folder parsed", !!inf, JSON.stringify(j.folders && Object.keys(j.folders)));
    check("infantry orientation = horizontal (years vary in x)", inf && inf.orientation === "horizontal", inf && inf.orientation);
    check("infantry slotsize width=50 read from gridbox", inf && inf.slotsize && inf.slotsize.width === 50, JSON.stringify(inf && inf.slotsize));
    check("infantry slotsize height=70", inf && inf.slotsize && inf.slotsize.height === 70);
    check("civilian_folder parsed", !!civ);
    check("civilian orientation = vertical (years vary in y)", civ && civ.orientation === "vertical", civ && civ.orientation);
    check("civilian slotsize 70x70 (vertical era axis = height 70, unchanged)", civ && civ.slotsize && civ.slotsize.height === 70 && civ.slotsize.width === 70, JSON.stringify(civ && civ.slotsize));
    check("both folders kept their year labels (infantry: 2 direct + the nested 1965 pair)", inf && inf.years.length === 4 && civ && civ.years.length === 2, `inf=${inf && inf.years.length} civ=${civ && civ.years.length}`);
    // per-chain gridboxes: the engine's real frame is pixel = gridbox.position + slot × slotsize PER gridbox —
    // the origins are how the game separates chains, so the editor must get all of them, not just the first.
    check("infantry: ALL gridboxes returned (per-chain origins, incl. the % one)", inf && Array.isArray(inf.gridboxes) && inf.gridboxes.length === 6, JSON.stringify(inf && (inf.gridboxes || []).map((g) => g.name)));
    const g0 = inf && inf.gridboxes && inf.gridboxes.find((g) => g.name === "infantry_tree");
    const g1 = inf && inf.gridboxes && inf.gridboxes.find((g) => g.name === "support_tree");
    check("infantry_tree gridbox: origin {140,325} slot 50×70 LEFT", g0 && g0.x === 140 && g0.y === 325 && g0.slotW === 50 && g0.slotH === 70 && g0.format === "LEFT", JSON.stringify(g0));
    check("support_tree gridbox: its OWN origin {600,90} + 70×70", g1 && g1.x === 600 && g1.y === 90 && g1.slotW === 70 && g1.slotH === 70, JSON.stringify(g1));
    // PERCENTAGE origin (MD artillery authors gridboxes at x = -11%): must resolve against the 1920 base to
    // -11% × 1920 = -211 px, NOT be truncated to -11 (which slid whole chains onto their neighbours). #gridbox-pct
    const gp = inf && inf.gridboxes && inf.gridboxes.find((g) => g.name === "pct_tree");
    check("pct_tree gridbox: x=-11% resolves to -211 px (percent of 1920 base), y=172 absolute", gp && gp.x === -211 && gp.y === 172, JSON.stringify(gp));
    // ANCHOR-CENTERING (#anchor-centering / #gridbox-anchor): format names the gridbox's anchor edge and the
    // slot grid is offset by  offset x (size - slotsize)  per axis:
    //   LEFT (0,0.5)  UP (0.5,0)  RIGHT (1,0.5)  DOWN (0.5,1)  CENTER (0.5,0.5)  UPPER_LEFT/absent (0,0)
    // A MISSING size counts as ZERO, not as "no offset" — that is the load-bearing part of the rule. Half the
    // corpus (299 of 595 tech gridboxes across vanilla + 5 mods) omits size, and omitting it shifts the grid
    // by -offset*slotsize: -35px for the ubiquitous LEFT/70x70 case, i.e. rows sit HALF A SLOT higher.
    // Confirmed three ways: herbix/hoi4modutilities computes `offset*gridSize - offset*slot` with a missing
    // size resolving to 0; an empirical sweep of MD infantry demanded 34-43px (35 is dead centre); and the
    // split is diagnostic — every game-exact folder DECLARES a size, every wrong one omitted it.
    const gUp = inf.gridboxes.find((g) => g.name === "up_sized_tree");
    const gLf = inf.gridboxes.find((g) => g.name === "left_sized_tree");
    const gPs = inf.gridboxes.find((g) => g.name === "pct_sized_tree");
    check("UP + size 400: shiftX=(400-70)/2=165, shiftY=0 (era axis never centers)", gUp && gUp.shiftX === 165 && gUp.shiftY === 0, JSON.stringify(gUp));
    check("LEFT + size h140: shiftY=(140-70)/2=35, shiftX=0", gLf && gLf.shiftX === 0 && gLf.shiftY === 35, JSON.stringify(gLf));
    check("UP + size 80%: shiftX=(1536-70)/2=733 (percent resolves against 1920)", gPs && gPs.shiftX === 733 && gPs.shiftY === 0, JSON.stringify(gPs));
    // THE FIX: no size == size 0, so LEFT shifts the rows UP by half a slot. This is what made MD + vanilla
    // infantry (and MD armour/nsb_armour) render half a slot low while every size-declaring folder was exact.
    check("NO size + LEFT -> shiftY = (0-70)/2 = -35 (rows half a slot HIGHER)", g0 && g0.shiftX === 0 && g0.shiftY === -35, JSON.stringify(g0));
    const gp2 = inf.gridboxes.find((g) => g.name === "pct_tree"); // UP, no size, slot 70
    check("NO size + UP -> shiftX = (0-70)/2 = -35 on the horizontal axis", gp2 && gp2.shiftX === -35 && gp2.shiftY === 0, JSON.stringify(gp2));
    // per-folder item-box offsets — the {-56,-7} that keeps a wide box centered on its cell in-game.
    // Sizes are the PLATE (the resolved sprite's native texture), not the container frame.
    check("infantry wideBox offset {-56,-7} plate 183×84 (via the generic sprite's texture)", inf && inf.wideBox && inf.wideBox.offX === -56 && inf.wideBox.offY === -7 && inf.wideBox.w === 183 && inf.wideBox.h === 84, JSON.stringify(inf && inf.wideBox));
    check("infantry smallBox offset {0,0} plate 72×72 (stock small default)", inf && inf.smallBox && inf.smallBox.offX === 0 && inf.smallBox.offY === 0 && inf.smallBox.w === 72, JSON.stringify(inf && inf.smallBox));
    check("civilian smallBox: PLATE 72×72 beats the 204×72 container frame (native sprite size)", civ && civ.smallBox && civ.smallBox.w === 72 && civ.smallBox.h === 72 && civ.smallBox.offX === 0 && civ.smallBox.offY === 5, JSON.stringify(civ && civ.smallBox));
    // NESTING-AWARE absolute coordinates (#gui-nesting): the artillery-style fixture nests a 2nd year rail in
    // an upper_right-anchored child of a 2739px strip at {-210,0}, and a subtitle in a center_up + origo
    // center_up child. The engine's math: strip abs = -210 (no orientation, min<explicit); primary rail year
    // = -210+60 = -150; right rail = -210+2739-100+0 = 2429; the SAME year exists TWICE (multiplicity kept,
    // deduped only on identical year+x+y). instantTextBoxType years also live at exact absolute pixels.
    const yrs = (inf && inf.years) || [];
    const railStamps = yrs.filter((y) => y.year === 1965);
    check("nested rails: the SAME year appears TWICE (left + right)", railStamps.length === 2, JSON.stringify(yrs));
    check("primary rail year at abs (-150,140) (strip offset applied)", railStamps.some((y) => y.x === -150 && y.y === 140), JSON.stringify(railStamps));
    check("upper_right rail year at abs (2429,140) (parentW + pos - strip offset)", railStamps.some((y) => y.x === 2429 && y.y === 140), JSON.stringify(railStamps));
    check("plain direct years keep their exact coords (1936@0,0)", yrs.some((y) => y.year === 1936 && y.x === 0 && y.y === 0), JSON.stringify(yrs));
    // Subtitle through center_up + origo center_up: abs x = -210 + 2739/2 + 0 - 600/2 + 207 = 1066.5 → 1067.
    const lr = await get(`/api/research/folder-texts?modPath=${encodeURIComponent(mod)}&folder=infantry_folder`);
    const lj = JSON.parse(lr.body);
    const sub = ((lj && lj.labels) || []).find((l) => l.key === "TEST_SUBTITLE");
    check("center_up+origo subtitle at abs (1067,85)", sub && sub.x === 1067 && sub.y === 85, JSON.stringify(sub));

    // Doctrine folders are flagged so the editor never surfaces them as research tabs (the game renders
    // doctrines in the Officer Corps screen; their flow-layout techs would pile onto the same cells).
    const fa = j.folderAvailability || {};
    check("doctrine folder flagged (my_doctrine_folder → doctrine:true)", fa.my_doctrine_folder && fa.my_doctrine_folder.doctrine === true, JSON.stringify(fa.my_doctrine_folder));
    check("normal folder NOT doctrine-flagged", fa.infantry_folder && fa.infantry_folder.doctrine === false, JSON.stringify(fa.infantry_folder));
    // Special-project techs (hidden on the in-game tree at start) carry specialProjectTech in the catalog.
    const cat = JSON.parse((await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).body);
    const techsArr = cat.technologies || [];
    const spT = techsArr.find((t) => t.id === "sp_gated_tech"), plT = techsArr.find((t) => t.id === "plain_tech");
    check("is_special_project_tech → specialProjectTech:true in the catalog", spT && spT.specialProjectTech === true, JSON.stringify(spT && { id: spT.id, sp: spT.specialProjectTech }));
    check("plain tech NOT special-project-flagged", plT && !plT.specialProjectTech, JSON.stringify(plT && { id: plT.id, sp: plT.specialProjectTech }));

    // RUN-ON folder names (vanilla mtgnavalfolder — no underscore before "folder") must still register their
    // small item, else every MtG naval tech renders wide against the wiki rule. #smallitem-runon
    const fws = j.foldersWithSmallItem || [];
    check("run-on mtgnavalfolder registers its small item", fws.includes("mtgnavalfolder"), JSON.stringify(fws));
    check("normal infantry_folder still registers its small item", fws.includes("infantry_folder"), JSON.stringify(fws));
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nGUI-SLOTSIZE TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
