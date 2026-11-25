// Three character-maker findings from the audit-mod sweep.
//
// #recruit-bridge-rejects-vanilla-ids — "ADD TO COUNTRY" REFUSED IDS VANILLA ITSELF SHIPS.
// assertStartupItemId used the plain Clausewitz identifier charset for every item type, so a character token
// with a hyphen or an accent was refused — and the message claimed the game could not load script the game
// ships: vanilla's own history files carry `recruit_character = AUS_arthur_seyss-inquart`,
// `CSA_paul-henri_spaak`, `IRQ_abdullah_al-tell`, `CHL_jorge_gonzález_von_marées`, `IRE_Éamon_de_valera`.
// The Character maker's own save guard allows exactly those, and renameCharacterRecruits matches with the
// same pattern — so Nova would create a character it then refused to add to a country.
//
// #loc-key-must-be-ascii (the other half) — THE ILLEGAL KEY WAS LEFT ON DISK.
// A non-ASCII token cannot be a localisation key: HOI4's yml parser rejects the line, and because every
// character shares one file, ONE bad key takes every character's name down with it. The save correctly
// declined to WRITE a new one and migrated the display name into a script literal — but left an existing bad
// line in place, so the mod stayed broken while the editor showed everything as fine.
//
// #character-type-switch-overwrites-other-role — SWITCHING TYPE DESTROYED THE OTHER COMMANDER ROLE.
// A character can hold two commander roles at once (vanilla's JAN_grand_admiral_johan_mayen is both a
// corps_commander and a navy_leader) while the form shows one. Switching Type to the other one dropped the
// loaded role correctly, then overwrote the EXISTING block of the target type with a converted copy of the
// one being switched away from.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-c3-"));
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

const MOD = path.join(ROOT, "c3mod");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="C3"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "NUA - Nova Union.txt"), "capital = 1\n", "utf8");

const PORT = 43181;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] vanilla really does ship these ids");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/countries";
    let hyphen = 0, accent = 0;
    try {
      for (const f of fs.readdirSync(V)) {
        const t = fs.readFileSync(path.join(V, f), "utf8");
        for (const m of t.matchAll(/recruit_character\s*=\s*(\S+)/g)) {
          if (/-/.test(m[1])) hyphen += 1;
          if (/[^\x00-\x7F]/.test(m[1])) accent += 1;
        }
      }
    } catch (_) {}
    rec("vanilla recruits hyphenated character ids", hyphen > 0, hyphen);
    rec("…and accented ones", accent > 0, accent);

    console.log("\n[the bug] Add-to-country must accept the ids the maker itself writes");
    for (const id of ["AUS_arthur_seyss-inquart", "CHL_jorge_gonzález_von_marées", "IRE_Éamon_de_valera"]) {
      const r = await post("/api/history/set-startup", {
        tag: "NUA", itemType: "character", itemId: id, active: true,
      });
      rec(`accepted ${id}`, r.s === 200 && !r.b.error, { s: r.s, e: r.b && r.b.error });
    }
    const hist = fs.readFileSync(path.join(MOD, "history", "countries", "NUA - Nova Union.txt"), "utf8");
    rec("…and they reached the history file",
      /recruit_character\s*=\s*AUS_arthur_seyss-inquart/.test(hist) &&
      /recruit_character\s*=\s*IRE_Éamon_de_valera/.test(hist), hist.slice(0, 400));
    // …while a genuinely impossible id is still refused, so this is not "accept anything".
    for (const bad of ["9leading_digit", "has space", "has{brace"]) {
      const r = await post("/api/history/set-startup", { tag: "NUA", itemType: "character", itemId: bad, active: true });
      rec(`still refuses ${JSON.stringify(bad)}`, r.s === 400 && !!(r.b && r.b.error), { s: r.s });
    }

    console.log("\n[the bug] a save must clean up an illegal localisation key, not just decline to add one");
    const LOC = path.join(MOD, "localisation", "english", "custom_characters_l_english.yml");
    fs.writeFileSync(LOC, "\ufeffl_english:\n NUA_ok_guy:0 \"Fine Person\"\n Jindřich_bad:0 \"Broken Key\"\n", "utf8");
    const CH = path.join(MOD, "common", "characters", "c3.txt");
    fs.writeFileSync(CH, `characters = {
\tJindřich_bad = {
\t\tname = Jindřich_bad
\t\tportraits = {
\t\t\tcivilian = {
\t\t\t\tlarge = "GFX_x"
\t\t\t}
\t\t}
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t}
\t}
}
`, "utf8");
    const rs = await post("/api/characters/save", {
      token: "Jindřich_bad", name: "Jindřich Joch", file: "c3.txt",
      roleLeader: true, leaderIdeology: "despotism",
      portraitLarge: "GFX_x",
    });
    rec("the save succeeded", rs.s === 200 && !rs.b.error, rs.b || rs.s);
    const loc = fs.readFileSync(LOC, "utf8");
    rec("the illegal non-ASCII key is gone", !/Jindřich_bad:/.test(loc), loc);
    rec("…and the legal key beside it is untouched", /NUA_ok_guy:0 "Fine Person"/.test(loc), loc);
    rec("…and the file still parses as localisation",
      loc.charCodeAt(0) === 0xFEFF && /^\ufeff?l_english:/.test(loc) &&
      !/^[ \t]*[^\s:]*[^\x00-\x7F][^\s:]*:/m.test(loc.replace(/^\ufeff/, "")), loc);
    rec("…and the display name survived, in the script block",
      /name\s*=\s*"Jindřich Joch"/.test(fs.readFileSync(CH, "utf8")), fs.readFileSync(CH, "utf8").slice(0, 300));

    console.log("\n[the bug] switching commander Type onto a role the character already has must refuse");
    const CH2 = path.join(MOD, "common", "characters", "c3b.txt");
    fs.writeFileSync(CH2, `characters = {
\tNUA_both = {
\t\tname = NUA_both
\t\tportraits = {
\t\t\tarmy = {
\t\t\t\tlarge = "GFX_a"
\t\t\t}
\t\t}
\t\tcorps_commander = {
\t\t\tskill = 3
\t\t\tattack_skill = 2
\t\t\tdefense_skill = 2
\t\t\tplanning_skill = 2
\t\t\tlogistics_skill = 2
\t\t\ttraits = { trait_engineer }
\t\t}
\t\tnavy_leader = {
\t\t\tskill = 5
\t\t\tattack_skill = 4
\t\t\tdefense_skill = 3
\t\t\tmaneuvering_skill = 4
\t\t\tcoordination_skill = 3
\t\t\tlegacy_id = -2
\t\t\ttraits = { blue_water_expert gunnery_expert }
\t\t}
\t}
}
`, "utf8");
    const before2 = fs.readFileSync(CH2, "utf8");
    const rSwitch = await post("/api/characters/save", {
      token: "NUA_both", name: "NUA_both", file: "c3b.txt",
      roleGeneral: true, generalType: "navy_leader",
      skill: 3, attackSkill: 2, defenseSkill: 2, planningSkill: 2, logisticsSkill: 2,
      traits: ["trait_engineer"],
      loadedRoles: { generalType: "corps_commander" },
      portraitLarge: "GFX_a",
    });
    rec("the destructive Type switch is REFUSED", rSwitch.s === 400 && !!(rSwitch.b && rSwitch.b.error), { s: rSwitch.s, b: rSwitch.b });
    rec("…with a message naming both roles",
      /navy leader/.test(String(rSwitch.b.error || "")) && /corps commander/.test(String(rSwitch.b.error || "")),
      rSwitch.b.error);
    rec("…and the file is byte-identical — nothing was changed",
      fs.readFileSync(CH2, "utf8") === before2, "file changed on a refused save");
    rec("…so the admiral kept his own skill and traits",
      /skill = 5/.test(fs.readFileSync(CH2, "utf8")) && /blue_water_expert/.test(fs.readFileSync(CH2, "utf8")),
      fs.readFileSync(CH2, "utf8").slice(0, 400));

    console.log("\n[control] switching Type when the character has only ONE commander role still works");
    const CH3 = path.join(MOD, "common", "characters", "c3c.txt");
    fs.writeFileSync(CH3, `characters = {
\tNUA_one = {
\t\tname = NUA_one
\t\tportraits = {
\t\t\tarmy = {
\t\t\t\tlarge = "GFX_a"
\t\t\t}
\t\t}
\t\tcorps_commander = {
\t\t\tskill = 3
\t\t\tattack_skill = 2
\t\t\tdefense_skill = 2
\t\t\tplanning_skill = 2
\t\t\tlogistics_skill = 2
\t\t}
\t}
}
`, "utf8");
    const rOk = await post("/api/characters/save", {
      token: "NUA_one", name: "NUA_one", file: "c3c.txt",
      roleGeneral: true, generalType: "field_marshal",
      skill: 3, attackSkill: 2, defenseSkill: 2, planningSkill: 2, logisticsSkill: 2,
      loadedRoles: { generalType: "corps_commander" },
      portraitLarge: "GFX_a",
    });
    rec("an ordinary Type switch still succeeds", rOk.s === 200 && !rOk.b.error, rOk.b || rOk.s);
    const c3c = fs.readFileSync(CH3, "utf8");
    rec("…and the role really changed", /field_marshal\s*=\s*\{/.test(c3c) && !/corps_commander\s*=\s*\{/.test(c3c), c3c);

    console.log(`\n=== character three guards: ${checks} checks, ${fails.length} failed ===`);
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
