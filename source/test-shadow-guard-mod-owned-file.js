// #redirect-duplicates-a-mod-owned-file — the anti-shadowing guard consulted the game root and the mod's
// dependencies, but never the ACTIVE MOD. So editing something that lives in a file the mod ALREADY owns got
// redirected to a second file.
//
// Total conversions name files after country tags exactly as vanilla does: Millennium Dawn ships
// common/characters/BUL.txt and so does the base game. Editing a Bulgarian advisor there wrote nova_BUL.txt,
// left BUL.txt untouched holding the old value, and left the token DEFINED TWICE in one mod — answered
// ok:true, with the character then listed twice in Nova's own sidebar carrying different values and the
// user's edit apparently ignored. In game that is a duplicate character definition.
//
// Redirecting cannot un-shadow a file the mod already has: the shadow exists either way and is the modder's
// own choice. All it achieves is defining the same content twice.
//
// BOTH DIRECTIONS ARE TESTED. Dropping the guard entirely would be the opposite bug — creating a fresh
// BUL.txt in a mod that does not have one really does override vanilla's wholesale, which is the case the
// guard was written for and must keep doing.
//
// SCOPE, verified caller by caller rather than assumed from the shared helper (the first write-up of this
// inferred the blast radius from "six callers share it" and was wrong):
//   common/characters  — BROKEN. 130 Millennium Dawn files affected. Covered below.
//   common/ideas       — BROKEN. A spirit targeted at a mod-owned file was redirected to custom_ideas.txt,
//                        so it was written somewhere the user did not choose. 5 MD files. Covered below.
//   events             — never affected: that caller resolves the event's HOME file first and only reaches
//                        the guard for a genuinely new file, where redirecting is correct.
//   common/decisions   — never affected, same reason (#decision-home-file).
//   decisions/categories — never affected: only writes a category that is not defined yet.
//   common/technologies — already had its own local modAlreadyOwns check, with this same reasoning. That is
//                        worth noting: the lesson existed in one maker and was never lifted into the shared
//                        helper, which is exactly why characters still had it.
//
// Needs a HOI4 install to know which names shadow; skips cleanly without one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shadow-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
let skipped = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const vanillaCharDir = path.join(GAME, "common", "characters");

const MOD = path.join(ROOT, "shadowmod");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ShadowMod"\nsupported_version="1.18.*"\n', "utf8");

const charDir = path.join(MOD, "common", "characters");
const listFiles = () => fs.readdirSync(charDir).sort();
const countBlocks = (token) => {
  let n = 0;
  for (const f of listFiles()) {
    const t = fs.readFileSync(path.join(charDir, f), "utf8");
    n += (t.match(new RegExp(`(^|\\n)\\s*${token}\\s*=\\s*\\{`, "g")) || []).length;
  }
  return n;
};

const PORT = 42285;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    if (!fs.existsSync(vanillaCharDir)) {
      skipped++;
      console.log("  skip  (no HOI4 install on this machine)");
    } else {
      // A file name vanilla really uses — taken from the install rather than hardcoded, so this keeps
      // working if Paradox renames things.
      const SHADOWING = fs.readdirSync(vanillaCharDir).find((f) => /^[A-Z]{3}\.txt$/.test(f));
      if (!SHADOWING) {
        skipped++;
        console.log("  skip  (vanilla ships no tag-named character file to collide with)");
      } else {
        console.log(`\n[the mod already owns ${SHADOWING}] the edit must land there, not in a second file`);
        const TOKEN = "NUA_shadow_advisor";
        fs.writeFileSync(path.join(charDir, SHADOWING), [
          "characters = {",
          `\t${TOKEN} = {`,
          '\t\tname = "Shadow Advisor"',
          "\t\tadvisor = {",
          "\t\t\tslot = political_advisor",
          `\t\t\tidea_token = ${TOKEN}`,
          "\t\t\tcost = 100",
          "\t\t}",
          "\t}",
          "}",
          "",
        ].join("\n"), "utf8");

        const r = await save({
          modPath: MOD, token: TOKEN, name: "Shadow Advisor", file: SHADOWING,
          roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: TOKEN,
          advisorCost: "175", advisorTraits: "", advisorLedger: "",
          roleLeader: false, roleGeneral: false,
        });
        rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
        rec("…and it reports the file the user was editing",
          !/nova_/i.test(String((r.body && (r.body.file || r.body.path)) || "")), r.body && (r.body.file || r.body.path));
        rec("no second file was created", listFiles().length === 1, listFiles());
        rec("the token is defined exactly ONCE in the mod", countBlocks(TOKEN) === 1, countBlocks(TOKEN));
        const txt = fs.readFileSync(path.join(charDir, SHADOWING), "utf8");
        rec("…and the edit actually landed in it", /cost = 175/.test(txt), txt.slice(0, 300));
        rec("…and the old value is gone", !/cost = 100/.test(txt), txt.slice(0, 300));

        // Nova's own view must agree — the duplicate showed up here first.
        const lr = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(MOD)}`);
        const lb = await lr.json().catch(() => null);
        const listed = ((lb && lb.files) || []).flatMap((f) => (f.characters || []).filter((c) => c.token === TOKEN));
        rec("Nova lists the character exactly once", listed.length === 1, listed.map((c) => c.advisorCost));

        console.log(`\n[the mod does NOT own ${SHADOWING}] the guard must still redirect`);
        // The other direction. Without this, deleting the guard outright would pass everything above.
        const MOD2 = path.join(ROOT, "shadowmod2");
        fs.mkdirSync(path.join(MOD2, "common", "characters"), { recursive: true });
        fs.mkdirSync(path.join(MOD2, "localisation", "english"), { recursive: true });
        fs.writeFileSync(path.join(MOD2, "descriptor.mod"), 'name="ShadowMod2"\nsupported_version="1.18.*"\n', "utf8");

        const r2 = await save({
          modPath: MOD2, token: "NUA_fresh_advisor", name: "Fresh Advisor", file: SHADOWING,
          roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: "NUA_fresh_advisor",
          advisorCost: "50", advisorTraits: "", advisorLedger: "",
          roleLeader: false, roleGeneral: false,
        });
        rec("the save succeeded", r2.status === 200 && r2.body && r2.body.ok !== false, r2.body || r2.status);
        const files2 = fs.readdirSync(path.join(MOD2, "common", "characters")).sort();
        rec(`it was redirected away from the shadowing name`, !files2.includes(SHADOWING), files2);
        rec(`…to a nova_ prefixed file`, files2.some((f) => /^nova_/i.test(f)), files2);
      }

      // The second affected caller. Here the guard is used as a PREDICATE — "would this shadow?" — and a
      // yes sent the spirit to custom_ideas.txt instead of the file the user picked in the target box.
      const vanillaIdeasDir = path.join(GAME, "common", "ideas");
      const IDEA_NAME = fs.existsSync(vanillaIdeasDir)
        ? fs.readdirSync(vanillaIdeasDir).find((f) => /^[a-z_]+\.txt$/i.test(f) && f.toLowerCase() !== "custom_ideas.txt")
        : null;
      if (!IDEA_NAME) {
        skipped++;
        console.log("  skip  (vanilla ships no common/ideas file to collide with)");
      } else {
        console.log(`\n[the mod already owns common/ideas/${IDEA_NAME}] the spirit must go where the user chose`);
        const MOD3 = path.join(ROOT, "shadowmod3");
        fs.mkdirSync(path.join(MOD3, "common", "ideas"), { recursive: true });
        fs.mkdirSync(path.join(MOD3, "localisation", "english"), { recursive: true });
        fs.writeFileSync(path.join(MOD3, "descriptor.mod"), 'name="ShadowMod3"\nsupported_version="1.18.*"\n', "utf8");
        fs.writeFileSync(path.join(MOD3, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");
        fs.writeFileSync(path.join(MOD3, "common", "ideas", IDEA_NAME), "ideas = {\n\tcountry = {\n\t}\n}\n", "utf8");

        const ir = await fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            modPath: MOD3, ideaId: "nua_shadow_spirit", targetRelativeFile: IDEA_NAME,
            targetLocalizationPath: "localisation/english/nova_l_english.yml",
            name: "Shadow Spirit", desc: "d", picture: "GFX_idea_generic_morale_bonus",
            selectedEffects: ["political_power_gain = 0.1"], mode: "create", category: "country",
            traits: [], cost: "", removalCost: "", ledger: "",
          }),
        });
        const ib = await ir.json().catch(() => null);
        rec("the spirit saved", ir.status === 200 && ib && ib.ok !== false, ib || ir.status);
        const ideaFiles = fs.readdirSync(path.join(MOD3, "common", "ideas")).sort();
        rec("no custom_ideas.txt was invented", !ideaFiles.includes("custom_ideas.txt"), ideaFiles);
        const chosen = fs.readFileSync(path.join(MOD3, "common", "ideas", IDEA_NAME), "utf8");
        rec("…and it landed in the file the user chose", /nua_shadow_spirit/.test(chosen), ideaFiles);
      }
    }

    console.log(`\n=== shadow guard on a mod-owned file: ${checks} checks, ${fails.length} failed, ${skipped} skipped ===`);
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
