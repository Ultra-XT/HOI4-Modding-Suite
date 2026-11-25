// Two ways a technology's references outlived the technology.
//
// #rename-reverts-has-tech-in-preserved-script — RENAMING A TECH LEFT ANOTHER TECH'S GATE ON THE DEAD ID.
// persistTechnologySave runs the reference walkers, but PER TECHNOLOGY, inside the batch loop. The client
// marks a REFERRER dirty too (so its dependencies/xor/path lines get rewritten), and that referrer is
// persisted from the payload the browser sent BEFORE the rename. Its un-modelled `allow = { has_tech = <old>
// }` is carried through verbatim by the extraScript preservation, so the write lands on top of the walker's
// correction and puts the dead id back. Observed: after rsx_radar_prime -> rsx_radar_ultra the referrer's
// `xor` and `dependencies` pointed at the new id while its `allow` still named the old one. A `has_tech` on
// an id nothing defines is not an error — it is permanently FALSE, so the technology it guards can never be
// researched and nothing appears in error.log.
//
// #delete-orphans-focus-set-technology-and-has-tech — DELETING A TECH LEFT ITS FOCUS REWARDS AND GATES.
// The delete unwired history/countries only. The RENAME path on the same content updates focus rewards and
// gates correctly, so this was a sibling gap rather than a missing capability.
//
// The two halves of the delete are NOT treated alike, because removing them is not equally safe:
//   * a `set_technology` ENTRY is a dead effect — dropping it changes nothing the author still has;
//   * a `has_tech` TRIGGER is a condition, and deleting a condition makes the gate it guards PASS. That is a
//     behaviour change nobody asked for, so it is reported instead of edited.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techref-"));
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

const MOD = path.join(ROOT, "techref");
for (const p of [["common", "technologies"], ["common", "national_focus"], ["history", "countries"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...p), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TechRef"\nsupported_version="1.19.*"\n', "utf8");

const TECHF = path.join(MOD, "common", "technologies", "rsx.txt");
const FOCUSF = path.join(MOD, "common", "national_focus", "rsx_focus.txt");
const seed = () => {
  fs.writeFileSync(TECHF, [
    "technologies = {",
    "\trsx_radar_prime = {",
    "\t\tresearch_cost = 1",
    "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
    "\t}",
    "\trsx_ref_holder = {",
    "\t\tresearch_cost = 1",
    "\t\trsx_radar_prime = 1",
    "\t\tallow = {",
    "\t\t\thas_tech = rsx_radar_prime",
    "\t\t}",
    "\t\tfolder = { name = infantry_folder position = { x = 0 y = 2 } }",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(FOCUSF, [
    "focus_tree = {",
    "\tid = rsx_tree",
    "\tfocus = {",
    "\t\tid = rsx_focus_a",
    "\t\tavailable = {",
    "\t\t\thas_tech = rsx_radar_prime",
    "\t\t}",
    "\t\tcompletion_reward = {",
    "\t\t\tset_technology = {",
    "\t\t\t\trsx_radar_prime = 1",
    "\t\t\t\trsx_other_tech = 1",
    "\t\t\t}",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
};
seed();

const readT = () => fs.readFileSync(TECHF, "utf8");
const readF = () => fs.readFileSync(FOCUSF, "utf8");

const PORT = 43521;
const srv = createApp().listen(PORT, async () => {
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[the bug] a rename must not be undone by a referrer saved in the same batch");
    // Exactly what the client sends: the renamed tech AND the referrer it marked dirty, the referrer still
    // carrying the OLD id in its un-modelled `allow` block.
    const r = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: [
        {
          id: "rsx_radar_ultra", previousId: "rsx_radar_prime", isMod: true, fileName: "rsx.txt",
          researchCost: 1, folder: [{ name: "infantry_folder", position: { x: 0, y: 0 } }],
        },
        {
          id: "rsx_ref_holder", isMod: true, fileName: "rsx.txt",
          researchCost: 1, folder: [{ name: "infantry_folder", position: { x: 0, y: 2 } }],
          prerequisites: [{ tech: "rsx_radar_ultra" }],
          extraScript: "allow = {\n\thas_tech = rsx_radar_prime\n}",
        },
      ],
    });
    rec("the batch saved", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the renamed technology exists under its new id", /rsx_radar_ultra\s*=\s*\{/.test(readT()), readT());
    rec("NOTHING still names the dead id in the technologies file", !/rsx_radar_prime/.test(readT()), readT());
    rec("…including the referrer's own allow gate",
      !/allow\s*=\s*\{[\s\S]*?has_tech\s*=\s*rsx_radar_prime/.test(readT()), readT());
    rec("…and the focus tree followed too", !/rsx_radar_prime/.test(readF()), readF());
    rec("…while the focus's OTHER granted tech is untouched", /rsx_other_tech\s*=\s*1/.test(readF()), readF());

    console.log("\n[the bug] deleting a tech must clear its focus GRANT and report its focus GATE");
    seed();
    const d = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, technologies: [],
      deletions: [{ techId: "rsx_radar_prime", techFile: "rsx.txt" }],
    });
    rec("the delete succeeded", d.s === 200 && !d.b.error, d.b || d.s);
    rec("the technology block is gone", !/rsx_radar_prime\s*=\s*\{/.test(readT()), readT());
    rec("the focus's set_technology ENTRY is gone", !/set_technology\s*=\s*\{[\s\S]*?rsx_radar_prime/.test(readF()), readF());
    rec("…but the block itself survived, with its other entry",
      /set_technology\s*=\s*\{[\s\S]*?rsx_other_tech\s*=\s*1/.test(readF()), readF());
    rec("the has_tech GATE is deliberately LEFT ALONE", /has_tech\s*=\s*rsx_radar_prime/.test(readF()), readF());
    rec("…and the response says so, naming the file",
      /has_tech = rsx_radar_prime/.test(String(d.b.refWarning || "")) && /rsx_focus/.test(String(d.b.refWarning || "")),
      d.b.refWarning);
    rec("…and explains why Nova did not just delete the condition",
      /removing a requirement changes what the gate means/i.test(String(d.b.refWarning || "")), d.b.refWarning);
    rec("the focus file is still brace-balanced",
      (readF().match(/\{/g) || []).length === (readF().match(/\}/g) || []).length, readF());

    console.log("\n[control] a set_technology block that empties out is removed, not left as `{ }`");
    fs.writeFileSync(FOCUSF, [
      "focus_tree = {",
      "\tid = rsx_tree2",
      "\tfocus = {",
      "\t\tid = rsx_focus_b",
      "\t\tcompletion_reward = {",
      "\t\t\tset_technology = {",
      "\t\t\t\trsx_lonely = 1",
      "\t\t\t}",
      "\t\t\tadd_political_power = 10",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(TECHF, "technologies = {\n\trsx_lonely = {\n\t\tresearch_cost = 1\n\t}\n}\n", "utf8");
    const d2 = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, technologies: [],
      deletions: [{ techId: "rsx_lonely", techFile: "rsx.txt" }],
    });
    rec("the delete succeeded", d2.s === 200 && !d2.b.error, d2.b || d2.s);
    rec("no empty set_technology block is left behind", !/set_technology\s*=\s*\{\s*\}/.test(readF()), readF());
    rec("…and the reward's other effect survived", /add_political_power = 10/.test(readF()), readF());
    rec("…and the file is brace-balanced",
      (readF().match(/\{/g) || []).length === (readF().match(/\}/g) || []).length, readF());

    console.log("\n[control] a COMMENTED-OUT grant is not touched");
    fs.writeFileSync(FOCUSF, [
      "focus_tree = {",
      "\tid = rsx_tree3",
      "\tfocus = {",
      "\t\tid = rsx_focus_c",
      "\t\tcompletion_reward = {",
      "\t\t\t# set_technology = { rsx_commented = 1 }",
      "\t\t\tadd_political_power = 5",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const beforeC = readF();
    fs.writeFileSync(TECHF, "technologies = {\n\trsx_commented = {\n\t\tresearch_cost = 1\n\t}\n}\n", "utf8");
    const d3 = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, technologies: [],
      deletions: [{ techId: "rsx_commented", techFile: "rsx.txt" }],
    });
    rec("the delete succeeded", d3.s === 200 && !d3.b.error, d3.b || d3.s);
    rec("the commented-out grant is byte-identical", readF() === beforeC, readF());

    console.log(`\n=== tech refs on rename and delete: ${checks} checks, ${fails.length} failed ===`);
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
