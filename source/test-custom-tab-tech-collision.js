// #techs-collapse-onto-one-cell — TWO TECHS IN A NEW TAB DREW ON TOP OF EACH OTHER.
//
// relayoutCustomFolderTechFiles places a tech at (rank of its distinct lane value, rank of its distinct
// start_year). Both axes are RANKS, so two techs that share a lane value AND a year land on the SAME folder
// cell — and Nova emits one gridboxtype per tech positioned from that cell, so both boxes get identical
// pixels and identical slotsizes. The techs draw exactly on top of each other, in game and in Nova's own
// canvas once the save reloads.
//
// ⚠️ IT NEEDS NO DRAGGING. "+ Add Tech Node" spawns every new tech at the same coordinate, so two techs
// added to a fresh tab and left alone already collide. Measured before the fix: both written to cell (0,0),
// both gridboxes at pixel (130,140).
//
// A shared folder cell is not per se wrong in HOI4 — vanilla does it in a few places — it is wrong HERE
// because Nova derives a per-tech gridbox from that cell, so identical cells mean identical boxes.
//
// THE SHIFT GOES ON THE LANE AXIS. The lane is the branch, which carries no meaning the relayout has to
// preserve; the other axis is TIME, and moving a tech along it would change the era it sits in and when it
// can be researched. The vertical case below is what proves the right axis moves, because the two axes swap.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coll-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + ++seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="C' + seq + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="C' + seq + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
// Each tech's folder cell, read back out of the file the game reads.
// ⚠️ Walk the braces. A lazy `<id> = { … position = { x … }` scan binds to the OUTER `technologies = {`
// wrapper and reports the whole file as one tech called "technologies" — which is what my first version did.
const cellsOf = (mod) => {
  const out = {};
  let t = "";
  try { t = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8"); }
  catch (_) { return out; }
  t = t.replace(/#.*$/gm, "");
  let depth = 0, m;
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{|\{|\}/g;
  while ((m = re.exec(t)) !== null) {
    if (m[0] === "}") { depth--; continue; }
    if (m[0] === "{") { depth++; continue; }
    if (depth === 1) { // inside `technologies = { … }`, so this is a tech id
      const open = t.indexOf("{", m.index + m[0].length - 1);
      let d = 0, close = -1;
      for (let i = open; i < t.length; i++) {
        if (t[i] === "{") d++;
        else if (t[i] === "}") { d--; if (!d) { close = i; break; } }
      }
      if (close !== -1) {
        const body = t.slice(open, close + 1);
        const ps = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)/.exec(body);
        if (ps) out[m[1]] = { x: Number(ps[1]), y: Number(ps[2]) };
      }
    }
    depth++;
  }
  return out;
};
// …and the pixel each gridbox is drawn at, which is what actually overlaps on screen.
const boxesOf = (mod) => {
  const out = {};
  let gui = "";
  try { gui = fs.readFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), "utf8"); } catch (_) { return out; }
  const re = /gridboxtype\s*=\s*\{/g;
  let m;
  while ((m = re.exec(gui)) !== null) {
    const o = gui.indexOf("{", m.index);
    let d = 0, c = -1;
    for (let i = o; i < gui.length; i++) {
      if (gui[i] === "{") d++;
      else if (gui[i] === "}") { d--; if (!d) { c = i; break; } }
    }
    if (c === -1) break;
    re.lastIndex = c;
    const b = gui.slice(o + 1, c);
    const nm = /name\s*=\s*"([^"]+)"/.exec(b);
    const ps = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)/.exec(b);
    if (nm && ps) out[nm[1]] = ps[1] + "," + ps[2];
  }
  return out;
};

let PORT = 50970;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const tech = (id, folder, x, y, yr) => ({
  id, folder, x, y, startYear: yr, researchCost: 1.5, forceSmallLayout: true, isMod: true,
  fileName: "custom_technologies.txt", prerequisites: [], dependencies: [], enableEquipments: [],
  modifiers: "", extraScript: "", name: "T " + id, description: "d", iconKey: "GFX_infantry_weapons_medium",
});
const save = (mod, folder, layout, techs) => ({
  modPath: mod, countryTag: "ZZA", countryTechIds: null, deletions: [], equipments: {},
  newTechIds: techs.map((t) => t.id),
  customTabs: [{ name: "Tab", key: "k", folder, layout, ledger: "army" }],
  technologies: techs,
});

(async () => {
  let api = null;
  try {
    api = await serve(createApp());
    const newFolder = async (mod, fk) => api.post("/api/research/create-custom-folder",
      { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "Tab" });

    console.log("\n[two techs added to a fresh tab] the exact thing '+ Add Tech Node' twice produces");
    {
      const mod = mkMod(), fk = "zed_folder";
      await newFolder(mod, fk);
      // Same lane, same year — no dragging involved.
      const r = await api.post("/api/technologies/save-batch",
        save(mod, fk, "horizontal", [tech("zed_one", fk, 1, 1, 1936), tech("zed_two", fk, 1, 1, 1936)]));
      rec("the save succeeds", r.ok === true, r.error || r);
      const cells = cellsOf(mod), boxes = boxesOf(mod);
      console.log("     cells: " + JSON.stringify(cells));
      const mine = Object.fromEntries(Object.entries(boxes).filter(([k]) => /^zed_/.test(k)));
      console.log("     boxes: " + JSON.stringify(mine));
      rec("both techs were written", !!cells.zed_one && !!cells.zed_two, cells);
      rec("…to DIFFERENT folder cells", JSON.stringify(cells.zed_one) !== JSON.stringify(cells.zed_two), cells);
      rec("…and their gridboxes are at different pixels", boxes.zed_one_tree !== boxes.zed_two_tree, boxes);
      // The shift must be on the branch axis; both keep the era they were given.
      rec("…while both keep the same TIME column, so neither moved era",
        cells.zed_one.y === cells.zed_two.y, cells);
    }

    console.log("\n[⚠️ VERTICAL] the axes swap, so the shift must follow the lane, not the era");
    {
      const mod = mkMod(), fk = "vert_folder";
      await newFolder(mod, fk);
      const r = await api.post("/api/technologies/save-batch",
        save(mod, fk, "vertical", [tech("vv_one", fk, 1, 1, 1936), tech("vv_two", fk, 1, 1, 1936)]));
      rec("the save succeeds", r.ok === true, r.error || r);
      const cells = cellsOf(mod);
      console.log("     cells: " + JSON.stringify(cells));
      rec("the two techs are on different cells", JSON.stringify(cells.vv_one) !== JSON.stringify(cells.vv_two), cells);
      // A folder position means the same thing in BOTH orientations — x is the branch, y is the era — which
      // is what the editor stores and what buildTechFolderGridboxes expects, since it does the orientation
      // mapping itself. So this reads exactly like the horizontal case above, and that sameness IS the point:
      // the relayout used to swap them for vertical. #vertical-relayout-reads-the-axes-swapped
      rec("…sharing the era row (y), so neither changed era", cells.vv_one.y === cells.vv_two.y, cells);
      rec("…and separated on the branch axis (x)", cells.vv_one.x !== cells.vv_two.x, cells);
    }

    console.log("\n[CONTROL — techs that already differ] must not be moved about");
    {
      // Distinct years mean distinct columns, so nothing collides and the layout must be exactly the plain
      // rank formula: lanes ×2, columns ×3.
      const mod = mkMod(), fk = "ok_folder";
      await newFolder(mod, fk);
      await api.post("/api/technologies/save-batch",
        save(mod, fk, "horizontal", [tech("ok_a", fk, 1, 0, 1936), tech("ok_b", fk, 1, 2, 1938), tech("ok_c", fk, 3, 4, 1940)]));
      const cells = cellsOf(mod);
      console.log("     cells: " + JSON.stringify(cells));
      rec("the first lane stays lane 0", cells.ok_a.x === 0 && cells.ok_b.x === 0, cells);
      rec("…the second lane is one lane step over", cells.ok_c.x === 2, cells);
      rec("…and the three eras are three columns apart", cells.ok_a.y === 0 && cells.ok_b.y === 3 && cells.ok_c.y === 6, cells);
    }

    console.log("\n[CONTROL — idempotent] saving the same thing twice must not walk the techs sideways");
    {
      const mod = mkMod(), fk = "idem_folder";
      await newFolder(mod, fk);
      const body = save(mod, fk, "horizontal", [tech("id_one", fk, 1, 1, 1936), tech("id_two", fk, 1, 1, 1936)]);
      await api.post("/api/technologies/save-batch", body);
      const first = cellsOf(mod);
      await api.post("/api/technologies/save-batch", body);
      const second = cellsOf(mod);
      console.log("     first: " + JSON.stringify(first) + "   second: " + JSON.stringify(second));
      rec("the cells are identical on the second save", JSON.stringify(first) === JSON.stringify(second),
        { first, second });
    }

    console.log("\n[CONTROL — three on one cell] each gets its own lane, none left stacked");
    {
      const mod = mkMod(), fk = "three_folder";
      await newFolder(mod, fk);
      await api.post("/api/technologies/save-batch",
        save(mod, fk, "horizontal", [tech("tr_a", fk, 1, 1, 1936), tech("tr_b", fk, 1, 1, 1936), tech("tr_c", fk, 1, 1, 1936)]));
      const cells = cellsOf(mod);
      const keys = ["tr_a", "tr_b", "tr_c"].map((k) => cells[k] && `${cells[k].x},${cells[k].y}`);
      console.log("     cells: " + JSON.stringify(keys));
      rec("all three land somewhere", keys.every(Boolean), keys);
      rec("…and all three are distinct", new Set(keys).size === 3, keys);
    }

    api.stop(); api = null;
    console.log(`\n=== custom tab tech collision: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
