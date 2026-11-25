// #gridbox-warning-before-the-fix — TOLD TO FIX SOMETHING THE SAME SAVE ALREADY FIXED.
//
// Surfaced by the completeness pass of the maker defect hunt, as a lead rather than a finding: one
// save-batch response carried BOTH
//   gridboxesAdded: [{"folder":"infantry_folder","added":1}]
// and a refWarning telling the author the tech "has no grid box, so HOI4 will not draw it in the research
// tree". Both were true when they were written and only one was true by the time the response was sent.
//
// The warning is composed inside persistTechnologySave, which runs per tech; the gridboxes for newly created
// techs are added AFTER that loop, from `newTechIds`. So a tech that Nova was about to place was judged a
// moment before it was placed.
//
// The warning site already carried this exact reasoning for the sibling case — a tech in a Nova-created
// FOLDER is skipped because syncAllCustomFolderGridboxes lays those out after the loop, and its comment says
// judging one there "would flag it a moment before its box is written". The newTechIds path is the same shape
// and was not covered.
//
// The warning itself is worth keeping — it is what #new-tech-gridbox is for — so the fix is narrow: skip a
// tech THIS save is about to give a gridbox, and warn about every other one exactly as before. A validator
// that cries wolf on the ordinary path is the failure mode this codebase has paid for more than once.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gbwarn-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-gbwarn-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "technologies", "zz_t.txt"), "technologies = {\n}\n", "utf8");
  return dir;
}
const techFor = (id) => ({
  id, isMod: true, folder: "infantry_folder", folderPosition: { x: 4, y: 7 },
  research_cost: 1, start_year: 1936, file: "zz_t.txt",
  enableEquipments: [], categories: ["infantry_tech"], path: [],
});

let PORT = 47500;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (dir, tech, newIds) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ modPath: dir, technologies: [tech], file: "zz_t.txt" },
          newIds ? { newTechIds: newIds } : {})),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const addedAny = (b) => (b.gridboxesAdded || []).some((g) => Number(g.added) > 0);
const warnsNoGridbox = (b) => /no grid box/.test(b.refWarning || "");

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[a newly created tech] gets its grid box, and is not told it has none");
    const dir = mkMod();
    const r = await api.save(dir, techFor("nua_new_tech"), ["nua_new_tech"]);
    rec("the save succeeds", r.b.ok === true, r.b);
    rec("…a grid box is added for it", addedAny(r.b), r.b.gridboxesAdded);
    rec("…and the response does NOT also say it has none", !warnsNoGridbox(r.b), r.b.refWarning);
    rec("…so the two halves of the response agree",
      !(addedAny(r.b) && warnsNoGridbox(r.b)), { gridboxesAdded: r.b.gridboxesAdded, refWarning: r.b.refWarning });

    console.log("\n[the warning still works] a tech nothing is about to place is still reported");
    const dir2 = mkMod();
    const r2 = await api.save(dir2, techFor("nua_unplaced_tech")); // no newTechIds -> no gridbox pass
    rec("the save succeeds", r2.b.ok === true, r2.b);
    rec("…no grid box is added", !addedAny(r2.b), r2.b.gridboxesAdded);
    rec("…and the author IS told the tech will not be drawn", warnsNoGridbox(r2.b), r2.b.refWarning);
    rec("…naming the tech", /nua_unplaced_tech/.test(r2.b.refWarning || ""), r2.b.refWarning);

    console.log("\n[only the tech being placed is exempt] a second, unplaced tech in the same save still warns");
    const dir3 = mkMod();
    await api.save(dir3, techFor("nua_placed"), ["nua_placed"]);
    const r3 = await api.save(dir3, techFor("nua_not_placed"), ["nua_placed"]); // newIds names a DIFFERENT tech
    rec("the unrelated tech is still reported", warnsNoGridbox(r3.b), r3.b.refWarning);
    rec("…and it is the right one", /nua_not_placed/.test(r3.b.refWarning || ""), r3.b.refWarning);
    api.stop(); api = null;

    console.log("\n[back-out] judge the tech before its box is written again");
    {
      const built = controlApp("nogbguard", [[
        " && !laidOutByNova && !gridboxComing && techHasNoGridbox(activeRoot, tech, allTechs)) {",
        " && !laidOutByNova && techHasNoGridbox(activeRoot, tech, allTechs)) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await capi.save(cdir, techFor("nua_new_tech"), ["nua_new_tech"]);
          rec("…the control still adds the grid box", addedAny(c.b), c.b.gridboxesAdded);
          rec("…and contradicts itself in the same response", warnsNoGridbox(c.b), c.b.refWarning);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== gridbox warning before the fix: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
