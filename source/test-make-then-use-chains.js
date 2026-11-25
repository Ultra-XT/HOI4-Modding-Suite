// "IF WE MAKE A NEW TECH CAN WE ASSIGN IT?" — the make → use chains, walked end to end.
//
// This is not a crash test. It asks the question a modder asks: I made a thing; can I now do the thing the
// thing is FOR? A maker that creates content you cannot then reach from the place you would use it is a hole
// even when every endpoint returns 200.
//
// Five chains, each ending at the file the game actually reads:
//
//     new technology        -> appears in the catalogue -> assigned to a country -> reads back as assigned
//     new equipment family  -> appears in the list      -> a country stockpiles it -> reads back
//     new character         -> appears in the list      -> findable by country     -> marked as a general
//     new national spirit   -> appears in the catalogue -> granted at game start   -> lands in history
//     new division template -> the OOB reads back       -> a division uses it      -> with its commander
//
// ⚠️ EVERY PAYLOAD HERE IS COPIED FROM THE CLIENT THAT SENDS IT. The first run of this probe reported 13
// holes across 5 chains. All 13 were this file's own payloads, not Nova's:
//
//     equipment  type: "infantry_equipment"        -> the type is an engine enum: "infantry", + domain
//     characters { character: { … } }              -> the body is FLAT, not nested
//     ideas      { id, block, category, file }     -> { ideaId, targetRelativeFile, mode, … }
//     templates  regiments: { infantry: {"0":3} }  -> regiments: [{unit,x,y}, …]
//     stockpile  { rows: [{ equipment, … }] }      -> { entries: [{ type, amount }] }
//
// Corrected against public/army.js, public/characters.js and public/ideas.js, all five chains complete. If
// you extend this file, open the fetch() that drives the feature and copy the body it builds — a guessed
// payload reports Nova as broken when it is the probe that is.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chain-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53422;

const MOD = path.join(ROOT, "chainmod");
for (const d of ["common/technologies", "common/country_tags", "common/countries", "common/characters",
                 "common/ideas", "common/units", "history/countries", "history/units", "localisation/english", "events"]) {
  fs.mkdirSync(path.join(MOD, d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ChainMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "chainmod.mod"), `name="ChainMod"\npath="${toPosix(MOD)}"\nsupported_version="1.19.*"\n`);
fs.writeFileSync(path.join(MOD, "common", "country_tags", "01_countries.txt"), 'NVA = "countries/Nova.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Nova.txt"), "graphical_culture = western_european_gfx\n");
fs.writeFileSync(path.join(MOD, "history", "countries", "NVA - Nova.txt"), 'capital = 1\noob = "NVA_1936"\n');
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), '﻿l_english:\n NVA: "Nova"\n');

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  const B = `http://127.0.0.1:${PORT}`;
  const post = (u, b) => fetch(B + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
  const get = (u) => fetch(B + u).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  const mp = encodeURIComponent(MOD);
  const okOf = (r) => r.status === 200 && !r.body.error;

  console.log("\n[new technology → assign it to a country]");
  {
    const save = await post("/api/technologies/save", { modPath: MOD,
      tech: { id: "nva_test_tech", name: "Nova Test Tech", folder: "infantry_folder", researchCost: 2, startYear: 1936, x: 0, y: 0 } });
    rec("the technology is created", okOf(save), save.body.error);
    const cat = await get(`/api/technologies/catalog?modPath=${mp}`);
    const list = (cat && (cat.technologies || cat.techs || cat.items)) || [];
    rec("…and appears in the catalogue the pickers read", list.some((t) => (t.id || t) === "nva_test_tech"), `${list.length} techs`);
    const assign = await post("/api/technologies/set-country-tech", { modPath: MOD, tag: "NVA", techId: "nva_test_tech", active: true });
    rec("…and can be given to a country", okOf(assign), assign.body.error);
    const owned = await get(`/api/technologies/country-techs?modPath=${mp}&tag=NVA`);
    rec("…and reads back as that country's", JSON.stringify(owned).includes("nva_test_tech"), JSON.stringify(owned).slice(0, 140));
  }

  console.log("\n[new equipment → a country starts with some]");
  {
    const fam = await post("/api/equipment/family", { modPath: MOD, id: "nva_rifle", name: "Nova Rifle",
      type: "infantry", domain: "land", tierCount: 1, year: "1936", build_cost_ic: "1", soft_attack: "5", defense: "5" });
    rec("the equipment family is created", okOf(fam), fam.body.error);
    const eq = await get(`/api/equipment/list?modPath=${mp}`);
    rec("…and appears in the equipment list", JSON.stringify(eq).includes("nva_rifle"), "not listed");
    const stock = await post("/api/army/stockpile", { modPath: MOD, tag: "NVA", entries: [{ type: "nva_rifle", amount: 100 }] });
    rec("…and a country can be given a stockpile of it", okOf(stock), stock.body.error);
    const back = await get(`/api/army/stockpile?modPath=${mp}&tag=NVA`);
    rec("…which reads back from the mod", JSON.stringify(back).includes("nva_rifle"), JSON.stringify(back).slice(0, 140));
  }

  console.log("\n[new character → usable as a commander]");
  {
    const ch = await post("/api/characters/save", { modPath: MOD, file: "NVA.txt", token: "NVA_test_general",
      name: "Test General", roleGeneral: true, generalType: "corps_commander", genSkill: "4", genPlanning: "2",
      generalTraits: "", loadedRoles: [] });
    rec("the character is created", okOf(ch), ch.body.error);
    const cl = await get(`/api/characters/list?modPath=${mp}`);
    const flat = [];
    for (const f of ((cl && cl.files) || [])) for (const c of (f.characters || [])) flat.push(c);
    rec("…and appears in the character list", flat.some((c) => c.token === "NVA_test_general"), `${flat.length} characters`);
    // The commander picker finds a character by file OR token prefix — mods use both.
    const byTag = flat.filter((c) => String(c.token || "").toUpperCase().startsWith("NVA_") || String(c.file || "").toUpperCase() === "NVA.TXT");
    rec("…and is findable by their country", byTag.length > 0, `${byTag.length} for NVA`);
    rec("…and is marked as a general, so the picker offers them", byTag.some((c) => c.roleGeneral), JSON.stringify(byTag[0] || {}).slice(0, 140));
  }

  console.log("\n[new national spirit → granted at game start]");
  {
    const up = await post("/api/ideas/upsert-definition", { modPath: MOD, ideaId: "nva_test_spirit",
      targetRelativeFile: "common/ideas/nova_spirits.txt", name: "Nova Test Spirit", desc: "A test spirit",
      picture: "", mode: "create", targetLocalizationPath: "", selectedEffects: [] });
    rec("the spirit is created", okOf(up), up.body.error);
    const cat = await get(`/api/ideas/catalog?modPath=${mp}`);
    rec("…and appears in the spirit catalogue", JSON.stringify(cat).includes("nva_test_spirit"), "not in the catalogue");
    const grant = await post("/api/history/set-startup", { modPath: MOD, tag: "NVA", itemId: "nva_test_spirit", itemType: "spirit", active: true });
    rec("…and can be granted to a country", okOf(grant), grant.body.error);
    const hist = (() => { try { return fs.readFileSync(path.join(MOD, "history", "countries", "NVA - Nova.txt"), "utf8"); } catch (_) { return ""; } })();
    rec("…and lands in the file the game reads", /nva_test_spirit/.test(hist), hist.slice(-160));
  }

  console.log("\n[new division template → deployed, with a commander]");
  {
    const tpl = { name: "Nova Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }, { unit: "infantry", x: 0, y: 1 }, { unit: "infantry", x: 0, y: 2 }], support: [] };
    const save = await post("/api/army/save", { modPath: MOD, tag: "NVA", templates: [tpl], divisions: [] });
    rec("the template is created", okOf(save), save.body.error);
    const oob = await get(`/api/army/oob-equipment?modPath=${mp}&tag=NVA`);
    rec("…and the order of battle reads back", !oob.error, oob.error);
    const deploy = await post("/api/army/save", { modPath: MOD, tag: "NVA", templates: [tpl],
      divisions: [{ name: "1st Nova", template: "Nova Infantry", location: 1, officer: "Test General" }] });
    rec("…and a division can be placed using it", okOf(deploy), deploy.body.error);
    const oobFile = (() => {
      try { const dir = path.join(MOD, "history", "units"); const f = fs.readdirSync(dir)[0];
            return f ? fs.readFileSync(path.join(dir, f), "utf8") : ""; } catch (_) { return ""; }
    })();
    rec("…and the template is in the OOB file", /Nova Infantry/.test(oobFile), oobFile.slice(0, 160));
    // officer = { name = "…" } is the game's native per-division commander — the field the new picker fills.
    rec("…carrying the commander the picker sets", /Test General/.test(oobFile), oobFile.includes("officer") ? "officer block present but no name" : "no officer block");
  }

  srv.closeAllConnections(); srv.close();
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n=== make-then-use chains: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
