// #overlay-uniqueness — RENAMING ONTO AN ID THIS MOD ALREADY USES DESTROYS THE OTHER ENTITY.
//
// A rename works by writing the new id and then removing the old block. So renaming A onto an existing B
// left ONE entity where there had been TWO — silently, with HTTP 200. The ideas, decisions and events
// makers already refused this ("already exists in this mod"); CHARACTERS and TECHNOLOGIES had no collision
// check in either direction. Two independent agents reproduced it: two blocks in, one out.
//
// The other half of this file is the part that keeps the guard honest. A HOI4 mod is an OVERLAY, so a new
// id CAN legitimately collide with a base-game one — overriding a vanilla character is a normal modding
// technique. So:
//     same mod   -> objective data loss  -> REFUSE
//     base game  -> a deliberate override -> WARN and proceed
// That is the existence-vs-suitability split. A guard that refused the vanilla case too would break real
// work, and this project has shipped exactly that mistake before.
//
// The narrow condition matters as well: BOTH ends are required. test-character-rename covers a save
// carrying a previousToken that never existed on disk — nothing is being moved off, so that is an ordinary
// save and refusing it broke a legitimate edit the first time this guard was written.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-renameid-"));
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

const MOD = path.join(ROOT, "renamemod");
["common/characters", "common/technologies", "localisation/english"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RenameMod"\nsupported_version="1.19.*"\n', "utf8");

const CHAR_FILE = path.join(MOD, "common", "characters", "custom_characters.txt");
const countCharBlocks = () => {
  let t = "";
  try { t = fs.readFileSync(CHAR_FILE, "utf8"); } catch (_) { return 0; }
  return (t.match(/^\t[A-Za-z0-9_]+\s*=\s*\{/gm) || []).length;
};
const charTokens = () => {
  let t = "";
  try { t = fs.readFileSync(CHAR_FILE, "utf8"); } catch (_) { return []; }
  return (t.match(/^\t([A-Za-z0-9_]+)\s*=\s*\{/gm) || []).map((s) => s.trim().split(/\s*=/)[0]);
};

const PORT = 42489;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  const saveChar = (over) => post("/api/characters/save", Object.assign({
    modPath: MOD, file: "custom_characters.txt",
    portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
    roleAdvisor: true, advisorSlot: "political_advisor",
  }, over || {}));

  const saveTech = (over) => post("/api/technologies/save-batch", Object.assign({
    modPath: MOD, equipments: {},
    technologies: [Object.assign({
      folder: "infantry_folder", x: 0, y: 1, researchCost: 1, startYear: 1936,
      prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
      enableEquipments: [], categories: ["infantry_tech"],
      fileName: "nova_ren.txt", isMod: true, leadsTo: [], pathMeta: {},
    }, over || {})],
  }, {}));

  const techFile = () => {
    const p = path.join(MOD, "common", "technologies", "nova_ren.txt");
    try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; }
  };
  const techIds = () => (techFile().match(/^\t([A-Za-z0-9_]+)\s*=\s*\{/gm) || []).map((s) => s.trim().split(/\s*=/)[0]);

  try {
    console.log("\n[characters] two exist; renaming one onto the other must not silently eat it");
    let r = await saveChar({ token: "ren_char_a", name: "Char A" });
    rec("character A saved", r.s === 200 && r.b.ok !== false, r.b || r.s);
    r = await saveChar({ token: "ren_char_b", name: "Char B" });
    rec("character B saved", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("the file holds two characters", countCharBlocks() === 2, charTokens());

    r = await saveChar({ token: "ren_char_b", name: "Char A", previousToken: "ren_char_a", previousFile: "custom_characters.txt" });
    rec("the destructive rename is REFUSED", r.s >= 400 || (r.b && (r.b.ok === false || r.b.error)), { s: r.s, b: r.b });
    rec("…and the message names the id that is taken", /ren_char_b/.test(String((r.b && r.b.error) || "")), r.b);
    // The whole point: before the guard this left one block where there were two.
    rec("BOTH characters are still on disk", countCharBlocks() === 2, charTokens());
    rec("…including the one that would have been overwritten", charTokens().includes("ren_char_b"), charTokens());
    rec("…and the one being renamed", charTokens().includes("ren_char_a"), charTokens());

    console.log("\n[control] a rename onto a FREE id still works — the guard must not block real renames");
    // FIRST-class control: if this fails the guard is over-strict and the refusal above proves nothing.
    r = await saveChar({ token: "ren_char_c", name: "Char A", previousToken: "ren_char_a", previousFile: "custom_characters.txt" });
    rec("the legitimate rename succeeded", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("…the old token is gone", !charTokens().includes("ren_char_a"), charTokens());
    rec("…the new token is present", charTokens().includes("ren_char_c"), charTokens());
    rec("…and the count is unchanged", countCharBlocks() === 2, charTokens());

    console.log("\n[control] a previousToken that never existed is an ordinary save, not a rename");
    // This is the exact fixture that caught the first version of the guard being too strict.
    r = await saveChar({ token: "ren_char_b", name: "Char B again", previousToken: "ren_never_existed", previousFile: "custom_characters.txt" });
    rec("it is accepted", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("…and nothing was lost", countCharBlocks() === 2, charTokens());

    console.log("\n[overlay] colliding with a BASE GAME id warns, it does not refuse");
    // Overriding a vanilla character is a legitimate technique, so this must go through — with a warning.
    r = await saveChar({ token: "GER_adolf_hitler", name: "Someone Else" });
    rec("the override is ALLOWED", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("…and Nova warns that it replaces the base-game character",
      /base game/i.test(String((r.b && r.b.refWarning) || "")), r.b && r.b.refWarning);
    rec("…while a mod-only id gets NO such warning",
      !/base game/i.test(String(((await saveChar({ token: "ren_char_d", name: "D" })).b || {}).refWarning || "")), "spurious overlay warning");

    console.log("\n[technologies] the same shape, the same fix");
    r = await saveTech({ id: "ren_tech_a", name: "Tech A" });
    rec("tech A saved", r.s === 200 && r.b.ok !== false, r.b || r.s);
    r = await saveTech({ id: "ren_tech_b", name: "Tech B" });
    rec("tech B saved", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("the file holds two technologies", techIds().length === 2, techIds());

    r = await saveTech({ id: "ren_tech_b", name: "Tech A", previousId: "ren_tech_a" });
    rec("the destructive tech rename is REFUSED", r.s >= 400 || (r.b && (r.b.ok === false || r.b.error)), { s: r.s, b: r.b });
    rec("BOTH technologies are still on disk", techIds().length === 2, techIds());

    console.log("\n[control] a tech rename onto a FREE id still works");
    r = await saveTech({ id: "ren_tech_c", name: "Tech A", previousId: "ren_tech_a" });
    rec("the legitimate tech rename succeeded", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("…the old id is gone", !techIds().includes("ren_tech_a"), techIds());
    rec("…the new id is present", techIds().includes("ren_tech_c"), techIds());
    rec("…and the count is unchanged", techIds().length === 2, techIds());

    console.log(`\n=== rename onto existing id: ${checks} checks, ${fails.length} failed ===`);
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
