// #new-tech-gridbox-origin — A NEW CHAIN MUST NOT BE ANCHORED ON AN EXISTING ONE.
//
// The user found this by playing a Nova-built mod: "since its full of vanilla tech it overlaps in secret
// unfortunately so some of ur tech were overlapping with vanilla cuz u did not think there was anything
// else." Measured on their mod: 7 of 54 mod techs sat on the exact (folder, x, y) of a vanilla tech, with
// 6 confirmed pixel-box overlaps on screen.
//
// The mechanism is here. addGridboxesForNewTechs took its geometry from firstGridboxGeometryInFolder and
// wrote `position = { x = geo.x y = geo.y }` VERBATIM for every new tech — so every chain Nova created in
// infantry_folder was anchored on vanilla's support_weapons chain, every one in electronics_folder on
// electronic_mechanical_engineering, and two Nova-created chains stacked on each other as well.
//
// It also omitted `size`. HOI4 centres a gridbox's contents inside its declared size, so a sibling
// without one resolves to a different pixel origin than one with it (a 340px difference in vanilla's
// electronics folder) — which is why "step to a free origin" is only meaningful once the size matches.
//
// Hermetic: a fake mod whose .gui declares two occupied origins to dodge.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gborigin-"));
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

const MOD = path.join(ROOT, "originmod");
["common/technologies", "interface"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OriginMod"\nsupported_version="1.19.*"\n', "utf8");

// TWO existing chains, the way a real folder has them: same x, separated in y. The first one carries a
// `size`, as vanilla's do. Both origins must be avoided.
const GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
fs.writeFileSync(GUI, [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  '\t\tname = "electronics_folder"',
  "\t\tposition = { x = 0 y = 0 }",
  "\t\tgridboxtype = {",
  '\t\t\tname = "base_anchor_tree"',
  "\t\t\tposition = { x = 10 y = 20 }",
  "\t\t\tsize = { width = 680 height = 800 }",
  "\t\t\tslotsize = { width = 90 height = 90 }",
  '\t\t\tformat = "LEFT"',
  "\t\t}",
  "\t\tgridboxtype = {",
  '\t\t\tname = "second_chain_tree"',
  "\t\t\tposition = { x = 10 y = 290 }",
  "\t\t\tsize = { width = 680 height = 800 }",
  "\t\t\tslotsize = { width = 90 height = 90 }",
  '\t\t\tformat = "LEFT"',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42483;
const app = createApp();
const server = app.listen(PORT, async () => {
  const addTech = async (id) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{
          id, folder: "electronics_folder", x: 0, y: 2, researchCost: 2, startYear: 1940,
          prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
          enableEquipments: [], categories: ["electronics"], name: id,
          fileName: "nova_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
        }],
        equipments: {},
        newTechIds: [id],
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const gui = () => fs.readFileSync(GUI, "utf8");
  // Every gridbox in the file as { name, x, y, size }.
  const boxes = () => {
    const out = [];
    const re = /gridboxtype\s*=\s*\{([\s\S]*?)\n\s*\}/g;
    let m;
    while ((m = re.exec(gui())) !== null) {
      const b = m[1];
      const nm = /name\s*=\s*"([^"]+)"/.exec(b);
      const pos = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)/.exec(b);
      // NOT a bare /size\s*=/ — that also matches the tail of `slotsize`, which every gridbox has, so a
      // box with no size of its own would report its slot dimensions as one. (The same slip was in the
      // server; this assertion only means anything with the guard here too.)
      const size = /(?:^|[^A-Za-z_])size\s*=\s*\{\s*width\s*=\s*(-?\d+)\s+height\s*=\s*(-?\d+)/.exec(b);
      if (nm && pos) out.push({ name: nm[1], x: +pos[1], y: +pos[2], size: size ? `${size[1]}x${size[2]}` : null });
    }
    return out;
  };
  const box = (name) => boxes().find((b) => b.name === name);

  try {
    console.log("\n[control] the existing chains are where the fixture put them");
    // If this ever fails the rest of the file is measuring the wrong thing.
    rec("base_anchor_tree is at 10,20", JSON.stringify(box("base_anchor_tree")).includes('"x":10,"y":20'), box("base_anchor_tree"));
    rec("second_chain_tree is at 10,290", JSON.stringify(box("second_chain_tree")).includes('"x":10,"y":290'), box("second_chain_tree"));

    console.log("\n[the bug] a new tech must not be anchored on an occupied origin");
    let r = await addTech("nua_origin_a");
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const a = box("nua_origin_a_tree");
    rec("it got a gridbox", !!a, boxes());
    rec("…NOT on base_anchor_tree's origin", !!a && !(a.x === 10 && a.y === 20), a);
    rec("…NOT on second_chain_tree's origin either", !!a && !(a.x === 10 && a.y === 290), a);
    // The convention this follows: chains in a folder share an x and are separated vertically.
    rec("…it keeps the folder's x", !!a && a.x === 10, a);
    rec("…and sits below everything already there", !!a && a.y > 290, a);
    rec("…and copies the anchor's size, so 'same position' means 'same place'",
      !!a && a.size === "680x800", a);

    console.log("\n[and two new chains must not stack on each other]");
    r = await addTech("nua_origin_b");
    rec("the second save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const b = box("nua_origin_b_tree");
    rec("the second tech got a gridbox", !!b, boxes());
    rec("…at a different origin from the first", !!a && !!b && !(a.x === b.x && a.y === b.y), { a, b });
    rec("…and still clear of both existing chains",
      !!b && !(b.x === 10 && b.y === 20) && !(b.x === 10 && b.y === 290), b);
    rec("the FIRST tech's gridbox was not moved by the second save",
      !!box("nua_origin_a_tree") && box("nua_origin_a_tree").y === a.y, { before: a, after: box("nua_origin_a_tree") });

    console.log("\n[nothing else changed]");
    rec("both original gridboxes are untouched",
      JSON.stringify(box("base_anchor_tree")) === JSON.stringify({ name: "base_anchor_tree", x: 10, y: 20, size: "680x800" }) &&
      JSON.stringify(box("second_chain_tree")) === JSON.stringify({ name: "second_chain_tree", x: 10, y: 290, size: "680x800" }),
      { a: box("base_anchor_tree"), b: box("second_chain_tree") });
    rec("the file is still brace-balanced",
      (gui().match(/\{/g) || []).length === (gui().match(/\}/g) || []).length,
      { open: (gui().match(/\{/g) || []).length, close: (gui().match(/\}/g) || []).length });
    rec("exactly one Nova marker block exists",
      (gui().match(/# >>> NOVA_NEW_TECH_GRIDBOXES/g) || []).length === 1, gui().slice(-600));

    console.log("\n[a folder whose anchor declares NO size must not gain one]");
    // Copying a size that is not there would be inventing layout the mod never asked for.
    const MOD2 = path.join(ROOT, "nosizemod");
    ["common/technologies", "interface"].forEach((d) => fs.mkdirSync(path.join(MOD2, ...d.split("/")), { recursive: true }));
    fs.writeFileSync(path.join(MOD2, "descriptor.mod"), 'name="NoSizeMod"\nsupported_version="1.19.*"\n', "utf8");
    const GUI2 = path.join(MOD2, "interface", "countrytechtreeview.gui");
    fs.writeFileSync(GUI2, [
      "guiTypes = {", "\tcontainerWindowType = {", '\t\tname = "electronics_folder"',
      "\t\tposition = { x = 0 y = 0 }", "\t\tgridboxtype = {", '\t\t\tname = "plain_anchor_tree"',
      "\t\t\tposition = { x = 5 y = 5 }", "\t\t\tslotsize = { width = 60 height = 60 }",
      '\t\t\tformat = "UP"', "\t\t}", "\t}", "}", "",
    ].join("\n"), "utf8");
    await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD2,
        technologies: [{
          id: "nua_nosize", folder: "electronics_folder", x: 0, y: 1, researchCost: 2, startYear: 1940,
          prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
          enableEquipments: [], categories: ["electronics"], name: "nua_nosize",
          fileName: "nova_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
        }],
        equipments: {}, newTechIds: ["nua_nosize"],
      }),
    });
    const g2 = fs.readFileSync(GUI2, "utf8");
    const blk = /gridboxtype\s*=\s*\{[^}]*nua_nosize_tree[\s\S]*?\n\s*\}/.exec(g2) ||
                /name = "nua_nosize_tree"[\s\S]{0,300}/.exec(g2);
    rec("the new gridbox exists", /nua_nosize_tree/.test(g2), g2.slice(-500));
    rec("…and carries no invented size", blk ? !/(?:^|[^A-Za-z_])size\s*=\s*\{\s*width/.test(blk[0]) : false, blk && blk[0]);
    rec("…and still avoided the anchor's origin", !/name = "nua_nosize_tree"\s*\n\s*position = \{ x = 5 y = 5 \}/.test(g2),
      g2.slice(-500));

    console.log(`\n=== new-tech gridbox origin: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
