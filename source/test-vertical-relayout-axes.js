// #vertical-relayout-reads-the-axes-swapped — A VERTICAL TAB'S BRANCHES AND ERAS WERE READ THE WRONG WAY ROUND.
//
// A folder position means the same thing in both orientations: x is the BRANCH, y is the ERA. That is what
// the editor stores — research.js's screenXCoordOf/screenYCoordOf map (x,y) onto the screen per orientation
// rather than changing what x and y mean — and it is what buildTechFolderGridboxes expects, because it does
// the orientation mapping itself:
//     px = OX + (horizontal ? fy : fx) * U        py = OY + (horizontal ? fx : fy) * U
//
// relayoutCustomFolderTechFiles swapped them for a vertical folder: it read the lane from y and the time
// from x, and wrote {x: col, y: lane}. Two measured consequences:
//   • BRANCHES WERE READ AS ERAS. Two techs in the SAME branch at different eras were split onto separate
//     lanes; two techs in DIFFERENT branches sharing an era were treated as one branch and collapsed onto a
//     single cell. Measured on the hunt's repro — v_a(branch 0, 1936), v_b(branch 0, 1938), v_c(branch 1,
//     1938) — v_a and v_b, which are the same branch, landed on lanes 0 and 2.
//   • THE YEAR LABELS NEVER LINED UP. For a vertical folder the label block places the era on screen-y
//     (px = 14, py = coord × U) while the tech block placed the LANE there, so no label sat beside the techs
//     it names.
//
// The horizontal branch of the same function was self-consistent throughout, which is why this survived.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vax-"));
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
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="A' + seq + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="A' + seq + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
// Walk the braces — a lazy scan binds to the outer `technologies = {` wrapper.
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
    if (depth === 1) {
      const open = t.indexOf("{", m.index + m[0].length - 1);
      let d = 0, close = -1;
      for (let i = open; i < t.length; i++) {
        if (t[i] === "{") d++;
        else if (t[i] === "}") { d--; if (!d) { close = i; break; } }
      }
      if (close !== -1) {
        const ps = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)/.exec(t.slice(open, close + 1));
        if (ps) out[m[1]] = { x: Number(ps[1]), y: Number(ps[2]) };
      }
    }
    depth++;
  }
  return out;
};
// Where each gridbox and each year label is actually drawn.
const guiPlacement = (mod) => {
  const boxes = {}, years = {};
  let gui = "";
  try { gui = fs.readFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), "utf8"); } catch (_) { return { boxes, years }; }
  const re = /(gridboxtype|instantTextBoxType)\s*=\s*\{/g;
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
    if (!nm || !ps) continue;
    const pos = { x: Number(ps[1]), y: Number(ps[2]) };
    if (m[1] === "gridboxtype") boxes[nm[1]] = pos;
    else if (/^nova_year_/.test(nm[1])) {
      const txt = /text\s*=\s*"([^"]*)"/.exec(b);
      years[nm[1]] = { ...pos, year: txt ? txt[1] : "" };
    }
  }
  return { boxes, years };
};

let PORT = 50990;
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

(async () => {
  let api = null;
  try {
    api = await serve(createApp());
    // The hunt's shape: two techs in one branch at different eras, and a third beside them in a second
    // branch sharing the later era.
    const build = async (layout) => {
      const mod = mkMod(), fk = "ax_folder";
      await api.post("/api/research/create-custom-folder",
        { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "Ax" });
      await api.post("/api/technologies/save-batch", {
        modPath: mod, countryTag: "ZZA", countryTechIds: null, deletions: [], equipments: {},
        newTechIds: ["ax_a", "ax_b", "ax_c"],
        customTabs: [{ name: "Ax", key: "k", folder: fk, layout, ledger: "army" }],
        technologies: [tech("ax_a", fk, 0, 2, 1936), tech("ax_b", fk, 0, 4, 1938), tech("ax_c", fk, 1, 4, 1938)],
      });
      return { mod, fk };
    };

    for (const layout of ["horizontal", "vertical"]) {
      console.log(`\n[${layout}] branches group by x, eras by y — the same in both orientations`);
      const { mod, fk } = await build(layout);
      const cells = cellsOf(mod);
      console.log("     cells: " + JSON.stringify(cells));
      rec("all three techs were written", !!(cells.ax_a && cells.ax_b && cells.ax_c), cells);
      // ax_a and ax_b are the SAME branch. Under the swapped read they were split onto lanes 0 and 2.
      rec("…two techs in the same branch share a lane", cells.ax_a.x === cells.ax_b.x, cells);
      // …and they are different eras, so they must be different columns.
      rec("…and sit in different era rows", cells.ax_a.y !== cells.ax_b.y, cells);
      // ax_c is a SECOND branch at ax_b's era.
      rec("…a tech in another branch gets its own lane", cells.ax_c.x !== cells.ax_b.x, cells);
      rec("…while sharing that era row", cells.ax_c.y === cells.ax_b.y, cells);

      console.log(`     …and the year labels line up with the techs they name`);
      const { boxes, years } = guiPlacement(mod);
      const yearEntries = Object.values(years).filter((y) => /^\d{4}$/.test(y.year));
      rec("year labels were written", yearEntries.length >= 2, years);
      // For horizontal the era runs across screen-x, for vertical down screen-y. Whichever it is, each
      // label must share that coordinate with the techs of its era — that is the alignment that was broken.
      const axis = layout === "horizontal" ? "x" : "y";
      const bTech = boxes.ax_b_tree, cTech = boxes.ax_c_tree;
      const label1938 = yearEntries.find((y) => y.year === "1938");
      console.log(`     ax_b box ${JSON.stringify(bTech)}  ax_c box ${JSON.stringify(cTech)}  1938 label ${JSON.stringify(label1938)}`);
      rec("…the 1938 label exists", !!label1938, years);
      rec(`…and sits on the same ${axis} as the 1938 techs`,
        !!label1938 && !!bTech && !!cTech && label1938[axis] === bTech[axis] && bTech[axis] === cTech[axis],
        { label: label1938, ax_b: bTech, ax_c: cTech, axis });
    }

    console.log("\n[CONTROL — idempotent] a second Fix Tab Layout must not move anything");
    {
      const { mod, fk } = await build("vertical");
      const before = cellsOf(mod);
      const r = await api.post("/api/research/fix-tree-layout",
        { modPath: mod, folderKey: fk, orientation: "vertical", years: { 2: 1936, 4: 1938 } });
      const after = cellsOf(mod);
      console.log("     before: " + JSON.stringify(before) + "   after: " + JSON.stringify(after));
      rec("the endpoint answers", r.ok === true, r);
      rec("…and reports nothing changed", r.changedCount === 0, r);
      rec("…and the cells really are unchanged", JSON.stringify(before) === JSON.stringify(after), { before, after });
    }

    api.stop(); api = null;
    console.log(`\n=== vertical relayout axes: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
