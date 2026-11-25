// #relayout-not-idempotent — "Fix layout" on a VERTICAL research tab produced the right grid on the first
// click and scrambled it on the second, with the same payload and no edits in between.
//
// Which coordinate holds the BRANCH and which holds the TIME axis depends on orientation, and the write knew
// that — horizontal puts the lane in x and the column in y, vertical does the opposite. The reads did not:
// the lane grouping came from x and the year-less column grouping from y, unconditionally. So on a vertical
// folder the second run read back the column as the lane, and techs from different branches that share an
// era landed on one folder cell and drew on top of each other in game. The scrambled state is a fixed point,
// so clicking "Fix layout" again never recovered it.
//
// Horizontal was always correct, and stays correct — that is the positive control here, because reading both
// axes from the same place would "fix" vertical by breaking horizontal.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relayout-"));
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

const MOD = path.join(ROOT, "relmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RelMod"\nsupported_version="1.18.*"\n', "utf8");

fs.writeFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"), [
  "guiTypes = {",
  '\tcontainerWindowType = {',
  '\t\tname = "countrytechtreeview"',
  '\t\tcontainerWindowType = { name = "folder_tabs" position = { x = 0 y = 0 } }',
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const TECHFILE = path.join(MOD, "common", "technologies", "rel_techs.txt");
// Two branches x two eras. Deliberately NO start year, so the column grouping falls back to a coordinate —
// that fallback is the half of the bug the year path hides.
const TECHS = [
  { name: "rel_a", x: 0, y: 0 },
  { name: "rel_b", x: 0, y: 10 },
  { name: "rel_c", x: 20, y: 0 },
  { name: "rel_d", x: 20, y: 10 },
];
const seed = (folderKey) => {
  fs.writeFileSync(TECHFILE, [
    "technologies = {",
    ...TECHS.flatMap((t) => [
      `\t${t.name} = {`,
      "\t\tresearch_cost = 1",
      `\t\tfolder = { name = ${folderKey} position = { x = ${t.x} y = ${t.y} } }`,
      "\t}",
    ]),
    "}",
    "",
  ].join("\n"), "utf8");
};

const positions = (folderKey) => {
  const text = fs.readFileSync(TECHFILE, "utf8");
  const out = {};
  for (const t of TECHS) {
    const re = new RegExp(`${t.name}\\s*=\\s*\\{[\\s\\S]*?folder\\s*=\\s*\\{[\\s\\S]*?name\\s*=\\s*${folderKey}[\\s\\S]*?position\\s*=\\s*\\{\\s*x\\s*=\\s*(-?\\d+)\\s+y\\s*=\\s*(-?\\d+)`);
    const m = re.exec(text);
    out[t.name] = m ? `${m[1]},${m[2]}` : null;
  }
  return out;
};

const PORT = 42429;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const runOrientation = async (orientation, folderKey) => {
    console.log(`\n[${orientation}] two clicks of "Fix layout" must agree`);
    await post("/api/research/create-custom-folder", { modPath: MOD, folderKey, ledger: "army", name: folderKey });
    seed(folderKey);

    let r = await post("/api/research/fix-tree-layout", { modPath: MOD, folderKey, orientation });
    rec(`${orientation}: the first fix-layout succeeded`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const first = positions(folderKey);
    rec(`${orientation}: every tech got a position`, Object.values(first).every(Boolean), first);
    rec(`${orientation}: the four techs occupy FOUR distinct cells`,
      new Set(Object.values(first)).size === 4, first);

    r = await post("/api/research/fix-tree-layout", { modPath: MOD, folderKey, orientation });
    rec(`${orientation}: the second fix-layout succeeded`, r.status === 200, r.body || r.status);
    const second = positions(folderKey);
    rec(`${orientation}: NOTHING MOVED on the second click`,
      JSON.stringify(first) === JSON.stringify(second), { first, second });
    rec(`${orientation}: still four distinct cells — no two techs collapsed onto one`,
      new Set(Object.values(second)).size === 4, second);

    // A third, for a fixed point rather than a two-cycle.
    await post("/api/research/fix-tree-layout", { modPath: MOD, folderKey, orientation });
    const third = positions(folderKey);
    rec(`${orientation}: stable on a third click too`, JSON.stringify(second) === JSON.stringify(third),
      { second, third });
    return first;
  };

  try {
    const vert = await runOrientation("vertical", "rel_vert_folder");
    const horiz = await runOrientation("horizontal", "rel_horiz_folder");

    console.log("\n[start_year] a folder that DOES declare years still groups by year");
    // Positive control for the hasYear fix: testing the raw value instead of Number(value) must not stop the
    // year path working, only stop `null` from counting as year zero.
    const YF = "rel_year_folder";
    await post("/api/research/create-custom-folder", { modPath: MOD, folderKey: YF, ledger: "army", name: YF });
    fs.writeFileSync(TECHFILE, [
      "technologies = {",
      // Same lane (x), different years — so the year, not the coordinate, is what must separate them.
      ...[["rel_a", 1936], ["rel_b", 1939], ["rel_c", 1942], ["rel_d", 1945]].flatMap(([n, yr]) => [
        `\t${n} = {`,
        "\t\tresearch_cost = 1",
        `\t\tstart_year = ${yr}`,
        `\t\tfolder = { name = ${YF} position = { x = 0 y = 0 } }`,
        "\t}",
      ]),
      "}",
      "",
    ].join("\n"), "utf8");
    let r = await post("/api/research/fix-tree-layout", { modPath: MOD, folderKey: YF, orientation: "horizontal" });
    rec("the year-based layout succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const yearPos = positions(YF);
    rec("four techs sharing a lane are spread across FOUR year columns",
      new Set(Object.values(yearPos)).size === 4, yearPos);
    await post("/api/research/fix-tree-layout", { modPath: MOD, folderKey: YF, orientation: "horizontal" });
    rec("…and that is idempotent too", JSON.stringify(yearPos) === JSON.stringify(positions(YF)),
      { first: yearPos, second: positions(YF) });

    console.log("\n[shape] the two orientations must not produce the same grid");
    // If they did, the axis handling would be collapsing rather than transposing.
    //
    // ⚠️ MEASURED AT THE GRIDBOX, NOT AT THE FOLDER COORDS. This used to compare folder positions and expect
    // them to differ, which quietly required the relayout to mean something different by x and y depending on
    // orientation. It does not any more: a folder position is x = BRANCH, y = ERA in both orientations —
    // matching what the editor stores (research.js maps (x,y) onto the screen per orientation rather than
    // changing what they mean) — and the transpose happens in buildTechFolderGridboxes:
    //     px = OX + (horizontal ? fy : fx) * U      py = OY + (horizontal ? fx : fy) * U
    // Swapping the meaning of the axes instead is #vertical-relayout-reads-the-axes-swapped: it grouped
    // same-branch techs as different branches and left the year labels on an axis of their own.
    //
    // So the property this check protects is intact and is asserted where it now lives. The folder coords
    // being IDENTICAL across orientations is the point, not a regression — the same grid, transposed on
    // screen.
    rec("the two orientations agree about what x and y mean",
      JSON.stringify(vert) === JSON.stringify(horiz), { vert, horiz });
    const boxes = (folderKey) => {
      const full = fs.readFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"), "utf8");
      // ⚠️ SCOPE TO THE FOLDER'S OWN CONTAINER. Both folders hold gridboxes named after the SAME techs
      // (rel_a_tree …), so an unscoped scan returns the first container's boxes for both folder keys and the
      // comparison below is guaranteed to say "identical" whatever the code does.
      const at = full.indexOf(`name = "${folderKey}"`);
      if (at === -1) return {};
      let open = full.lastIndexOf("{", at), d = 0, end = -1;
      for (let i = open; i < full.length; i++) {
        if (full[i] === "{") d++;
        else if (full[i] === "}") { d--; if (!d) { end = i; break; } }
      }
      const gui = end === -1 ? "" : full.slice(open, end + 1);
      const out = {};
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
        if (nm && ps && TECHS.some((t) => `${t.name}_tree` === nm[1])) out[nm[1]] = `${ps[1]},${ps[2]}`;
      }
      return out;
    };
    const vb = boxes("rel_vert_folder"), hb = boxes("rel_horiz_folder");
    console.log("     vertical boxes: " + JSON.stringify(vb));
    console.log("     horizontal boxes: " + JSON.stringify(hb));
    rec("…and the gridboxes they emit are transposed, so the tabs really do differ on screen",
      Object.keys(vb).length > 0 && JSON.stringify(vb) !== JSON.stringify(hb), { vert: vb, horiz: hb });

    console.log(`\n=== relayout idempotence: ${checks} checks, ${fails.length} failed ===`);
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
