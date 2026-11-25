// #tech-rename-clobbers-equipment — RENAMING A TECHNOLOGY BROKE THE WEAPON IT UNLOCKS.
//
// renameTechnologyReferencesInMod did a whole-file token substitution — `text.replace(/\boldId\b/g, newId)`
// over every file in common/technologies — with no idea which key a token sat under. So it rewrote
// `enable_equipments`, which names an EQUIPMENT, not a technology.
//
// A tech and its equipment sharing a name is the ordinary case here, not a contrived collision: the Research
// maker's own "create equipment for this tech" flow produces exactly that pairing.
//
// Measured symptom: renaming nua_twin_gun -> nua_twin_gun_tech left `enable_equipments = { nua_twin_gun_tech }`
// on the renamed tech AND on nua_twin_user — a technology that was not part of the save and that the user
// never touched. The equipment on disk is still nua_twin_gun, so both technologies now unlock an equipment id
// that does not exist, HOI4 logs an unknown-equipment error, and the weapon is unreachable in game.
//
// The substitution now skips the blocks that name non-technology things.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trn-"));
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

const MOD = path.join(ROOT, "trnmod");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Trn"\nsupported_version="1.19.*"\n', "utf8");

const TECH = path.join(MOD, "common", "technologies", "nua_twin.txt");
fs.writeFileSync(TECH, `technologies = {
\tnua_twin_gun = {
\t\tenable_equipments = {
\t\t\tnua_twin_gun
\t\t}
\t\tresearch_cost = 1
\t\tstart_year = 1936
\t\tfolder = {
\t\t\tname = infantry_folder
\t\t\tposition = { x = 0 y = 0 }
\t\t}
\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}
\tnua_twin_user = {
\t\tenable_equipments = {
\t\t\tnua_twin_gun
\t\t}
\t\tdependencies = {
\t\t\tnua_twin_gun = 1
\t\t}
\t\tresearch_cost = 1
\t\tstart_year = 1936
\t\tfolder = {
\t\t\tname = infantry_folder
\t\t\tposition = { x = 0 y = 2 }
\t\t}
\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}
}
`, "utf8");
// The EQUIPMENT keeps its own name — that is the whole point.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "zz_nua_twin_equipment.txt"),
  `equipments = {\n\tnua_twin_gun = {\n\t\tarchetype = infantry_equipment\n\t\tyear = 1936\n\t}\n}\n`, "utf8");

const techText = () => fs.readFileSync(TECH, "utf8");
const blockOf = (id) => {
  const t = techText();
  // Indentation-tolerant: the writer may re-indent the block it rebuilt.
  const m = new RegExp(`(^|\\n)[ \\t]*${id}[ \\t]*=[ \\t]*\\{`).exec(t);
  if (!m) return "";
  const i = m.index;
  const o = t.indexOf("{", i);
  let d = 0;
  for (let j = o; j < t.length; j++) {
    if (t[j] === "{") d++;
    else if (t[j] === "}") { d--; if (!d) return t.slice(o + 1, j); }
  }
  return "";
};

// Brace-MATCHED extraction, not a lazy regex. An unbounded `enable_equipments = \{[\s\S]*?token` happily
// spills past the closing brace into the NEXT block — which is how the first version of this test reported a
// failure on output that was correct, matching `nua_twin_gun_tech` inside the following `dependencies`.
const subBlock = (block, key) => {
  const m = new RegExp(`(^|\\n)[ \\t]*${key}[ \\t]*=[ \\t]*\\{`).exec(block);
  if (!m) return "";
  const o = block.indexOf("{", m.index);
  let d = 0;
  for (let j = o; j < block.length; j++) {
    if (block[j] === "{") d += 1;
    else if (block[j] === "}") { d -= 1; if (d === 0) return block.slice(o + 1, j); }
  }
  return "";
};

const PORT = 43151;
const app = createApp();
const srv = app.listen(PORT, async () => {
  try {
    console.log("\n[control] the fixture is the ordinary shape: a tech and its equipment share a name");
    rec("the tech exists", /nua_twin_gun\s*=\s*\{/.test(techText()), techText().slice(0, 200));
    rec("…and so does an equipment of the same name",
      /nua_twin_gun\s*=\s*\{/.test(fs.readFileSync(path.join(MOD, "common", "units", "equipment", "zz_nua_twin_equipment.txt"), "utf8")), "no");

    console.log("\n[the rename] the tech is renamed; the equipment is not");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{
          id: "nua_twin_gun_tech", previousId: "nua_twin_gun",
          folder: "infantry_folder", x: 0, y: 0, researchCost: 1, startYear: 1936,
          prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
          enableEquipments: ["nua_twin_gun"], categories: ["infantry_tech"],
          fileName: "nua_twin.txt", isMod: true, leadsTo: [], pathMeta: {},
        }],
      }),
    }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
    rec("the rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the tech has the new id", /nua_twin_gun_tech\s*=\s*\{/.test(techText()), techText().slice(0, 300));

    console.log("\n[the bug] enable_equipments names an EQUIPMENT and must not be renamed");
    const renamed = blockOf("nua_twin_gun_tech");
    const renamedEq = subBlock(renamed, "enable_equipments");
    rec("the renamed tech still unlocks the real equipment",
      /\bnua_twin_gun\b/.test(renamedEq) && !/nua_twin_gun_tech/.test(renamedEq), renamedEq);

    console.log("\n[the wider blast radius] a tech that was NOT part of the save must be untouched");
    const other = blockOf("nua_twin_user");
    const otherEq = subBlock(other, "enable_equipments");
    rec("the untouched tech still unlocks the real equipment",
      /\bnua_twin_gun\b/.test(otherEq) && !/nua_twin_gun_tech/.test(otherEq), otherEq);
    // …but its DEPENDENCY on the renamed tech is a technology reference, so that one SHOULD follow. This is
    // the check that stops the fix becoming "never rename anything".
    rec("…while its dependency on the renamed tech DID follow",
      /nua_twin_gun_tech/.test(subBlock(other, "dependencies")), subBlock(other, "dependencies"));

    console.log("\n[the equipment file is untouched]");
    const eq = fs.readFileSync(path.join(MOD, "common", "units", "equipment", "zz_nua_twin_equipment.txt"), "utf8");
    rec("the equipment kept its own id", /\bnua_twin_gun\s*=\s*\{/.test(eq) && !/nua_twin_gun_tech/.test(eq), eq);

    console.log("\n[safety]");
    let d = 0, ok = true;
    for (const ch of techText()) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the technologies file is brace-balanced", ok && d === 0, d);
    rec("…and still defines both technologies",
      /nua_twin_gun_tech\s*=\s*\{/.test(techText()) && /nua_twin_user\s*=\s*\{/.test(techText()), techText().slice(0, 300));
    rec("…and the old id is gone as a technology key",
      !/(^|\n)\t nua_twin_gun\s*=\s*\{/.test(techText()), techText().slice(0, 300));

    console.log(`\n=== tech rename equipment: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
