// ⛔ #character-name-form-rewritten — A SAVE THAT CHANGED NOTHING BROKE THE CHARACTER'S NAME IN EVERY
// LANGUAGE BUT ENGLISH.
//
// serializeCharacter wrote `name = <token>` unconditionally and the localisation was written against the
// token, so the author's own form was replaced. Counted over the 29,651 character blocks in the install and
// every installed mod:
//
//     name = "A LITERAL"          7,209   (545 vanilla)
//     name = <the author's key>   2,416   ( 33 vanilla)
//
// Both forms exist precisely because they do something `name = <token>` does not. A LITERAL displays in every
// language — that is the whole reason to write one, and it is what vanilla does for names with accents. The
// AUTHOR'S KEY may already be translated. Nova writes English only, so replacing either with a token key
// leaves every other language showing the raw token.
//
// ⭐ Measured, not reasoned: a character written as `name = PRB_MY_OWN_KEY` with a French translation came
// back as `name = PRB_own_key_guy` with an English entry and NOTHING in French. This is the WRITE half of
// #character-name-falls-back-to-the-token, whose READ half was fixed earlier for exactly this reason —
// "vanilla's ARG_manuel_maria_de_iriondo loses its accents … and in French -> 'Manuel de Iriondo'".
//
// ⭐ The mechanism to write against a key that is not the token ALREADY EXISTED two lines away, for a DLC
// variant (`instanceLocKey`). The top-level case never asked the same question.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53556;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cnform-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 300).replace(/\n/g, "|");

const FIXTURE = `characters = {
\tPRB_literal_guy = {
\t\tname = "Kirill Bechvaya"
\t\tportraits = {
\t\t\tcivilian = {
\t\t\t\tlarge = GFX_portrait_Boris_Berman
\t\t\t}
\t\t}
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t\texpire = "1965.1.1.1"
\t\t\ttraits = {}
\t\t}
\t}
\tPRB_own_key_guy = {
\t\tname = PRB_MY_OWN_KEY
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t\texpire = "1965.1.1.1"
\t\t\ttraits = {}
\t\t}
\t}
\tPRB_token_guy = {
\t\tname = PRB_token_guy
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t\texpire = "1965.1.1.1"
\t\t\ttraits = {}
\t\t}
\t}
\tPRB_quoted_key_guy = {
\t\tname = "PRB_quoted_key_guy"
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t\texpire = "1965.1.1.1"
\t\t\ttraits = {}
\t\t}
\t}
\tPRB_one_word_guy = {
\t\tname = "Rugalinskij"
\t\tcountry_leader = {
\t\t\tideology = despotism
\t\t\texpire = "1965.1.1.1"
\t\t\ttraits = {}
\t\t}
\t}
}
`;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Sends exactly what public/characters.js sends: its loadChar() transforms, then its collect().
    // `rename` stands in for the modder typing a new display name.
    const roundTrip = async (rename) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cnform-mod-"));
      made.push(mod);
      const dest = path.join(mod, "common", "characters", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CN Form"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, FIXTURE, "utf8");
      // ⚠️ The loc comes too, in TWO languages. Without it every lookup misses, the name box blanks and the
      // client's own Save gate refuses — and the French half is the entire point of the bug.
      for (const [lang, body] of [
        ["english", ' PRB_MY_OWN_KEY:0 "Leonardo Mora"\n PRB_token_guy:0 "Token Guy"\n PRB_quoted_key_guy:0 "Quoted Key Guy"\n'],
        ["french", ' PRB_MY_OWN_KEY:0 "Léonard Mora"\n'],
      ]) {
        const d = path.join(mod, "localisation", lang);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, `probe_l_${lang}.yml`), `\uFEFFl_${lang}:\n${body}`, "utf8");
      }

      const list = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const file = (list.files || []).find((x) => x && x.file === "probe.txt");
      const chars = (file && file.characters) || [];
      const errors = [];
      for (const c of chars) {
        const name = rename ? `${rename} ${c.token}` : (c.name && c.name !== c.token ? c.name : "").trim();
        if (!name) { errors.push(`CLIENT GATE: ${c.token} name blank`); continue; }
        const res = await fetch(`${BASE}/api/characters/save`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod, token: c.token, name, gender: "", file: "probe.txt",
            portraitCivLarge: String(c.portraitCivLarge || "").trim(),
            portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
            portraitNavyLarge: "", portraitNavySmall: "",
            roleLeader: !!c.roleLeader, leaderIdeology: String(c.leaderIdeology || "").trim(),
            leaderExpire: String(c.leaderExpire || "").trim(), leaderTraits: String(c.leaderTraits || "").trim(),
            roleAdvisor: !!c.roleAdvisor, advisorSlot: c.advisorSlot || "", advisorCost: c.advisorCost || "",
            advisorLedger: c.advisorLedger || "", advisorIdeaToken: "", advisorTraits: "",
            roleGeneral: !!c.roleGeneral, generalType: c.generalType || "",
            loadedRoles: { leader: !!c.roleLeader, advisor: !!c.roleAdvisor, generalType: c.roleGeneral ? (c.generalType || "corps_commander") : null },
            genSkill: "", genAttack: "", genDefense: "", genPlanning: "", genLogistics: "", generalTraits: "",
          }),
        }).then((r) => r.json());
        if (res && res.error) errors.push(`${c.token}: ${String(res.error).slice(0, 70)}`);
      }
      const locOf = (lang) => {
        const d = path.join(mod, "localisation", lang);
        if (!fs.existsSync(d)) return "";
        return fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), "utf8")).join("\n");
      };
      return { after: fs.readFileSync(dest, "utf8"), errors, listed: chars, en: locOf("english"), fr: locOf("french") };
    };

    console.log("1. A save that changes nothing leaves every name form as the author wrote it");
    {
      const { after, errors, listed, en, fr } = await roundTrip(null);
      rec("every character saved without error", errors.length === 0, errors[0]);
      rec("CONTROL: the reader resolved every display name",
        listed.length === 5 && listed.every((c) => c.name && c.name !== ""),
        listed.map((c) => `${c.token}=${c.name}`).join(" · "));
      rec("⭐ the LITERAL is still a literal", /name = "Kirill Bechvaya"/.test(after), show(after));
      rec("⭐ …and was not turned into a token key", !/name = PRB_literal_guy/.test(after), show(after));
      rec("⭐ the author's own KEY is still the author's key", /name = PRB_MY_OWN_KEY/.test(after), show(after));
      rec("⭐ …and was not turned into a token key", !/name = PRB_own_key_guy/.test(after), show(after));
      rec("…and a character that really does use its token keeps that", /name = PRB_token_guy/.test(after), show(after));
      // ⚠️ A QUOTED VALUE IS NOT AUTOMATICALLY A DISPLAY NAME, and getting that wrong is the same bug in the
      // other direction: the first version of this fix read `name = "PRB_quoted_key_guy"` as a literal and
      // wrote the resolved ENGLISH text into the script, destroying the key. It cost 5 characters in the
      // corpus sweep. "No whitespace" is not the test either — vanilla's TAN.txt writes the one-word
      // surnames "Rugalinskij", "Grinchik", "Tulberdiev", which are names.
      rec("⭐ a QUOTED key stays that quoted key", /name = "PRB_quoted_key_guy"/.test(after), show(after));
      rec("⭐ …and is not replaced by the text it resolves to", !/name = "Quoted Key Guy"/.test(after), show(after));
      rec("⭐ …while a one-word LITERAL is still a literal", /name = "Rugalinskij"/.test(after), show(after));
      rec("⭐ …and did not become a token key", !/name = PRB_one_word_guy/.test(after), show(after));
      // ⭐ The half that makes this a bug rather than churn.
      rec("⭐ the FRENCH translation is untouched", /PRB_MY_OWN_KEY:0 "Léonard Mora"/.test(fr), fr);
      rec("⭐ …and no token-keyed entry was invented for the literal",
        !/PRB_literal_guy:0/.test(en), en);
      rec("⭐ …nor for the character with its own key", !/PRB_own_key_guy:0/.test(en), en);
      rec("…and the whole file round-trips byte-identically",
        after.replace(/\r/g, "").replace(/\s+$/, "") === FIXTURE.replace(/\r/g, "").replace(/\s+$/, ""),
        JSON.stringify(after.slice(0, 200)));
    }

    console.log("\n2. …and typing a NEW name updates the author's form, not a new one  (the other direction)");
    {
      const { after, errors, en, fr } = await roundTrip("Renamed");
      rec("every character saved without error", errors.length === 0, errors[0]);
      rec("⭐ the literal now carries the new name", /name = "Renamed PRB_literal_guy"/.test(after), show(after));
      rec("…and is still a literal, not a key", !/name = PRB_literal_guy\b/.test(after), show(after));
      rec("⭐ the author's key is kept and ITS entry is updated",
        /name = PRB_MY_OWN_KEY/.test(after) && /PRB_MY_OWN_KEY:0 "Renamed PRB_own_key_guy"/.test(en), en);
      rec("…and the French entry is left for the author to translate",
        /PRB_MY_OWN_KEY:0 "Léonard Mora"/.test(fr), fr);
      rec("…and the token-keyed character writes against its token, as before",
        /PRB_token_guy:0 "Renamed PRB_token_guy"/.test(en), en);
    }

    console.log("\n3. Measured on the real files that write names both ways");
    // ⚠️ THE AUTHOR'S-KEY CASE IS A MOD FILE ON PURPOSE. Vanilla's own examples — BEL_maurice_keyaerts →
    // BEL_mcl_keyaerts — put that key INSIDE an `instance = { }`, which the DLC-variant path already
    // handled, so BEL.txt passed this check with the fix backed out. A fixture that passes either way
    // measures nothing. RID.txt writes the key at the character's own top level, which is the shape here.
    const CASES = [
      ["a literal", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/characters/ABK.txt", /^\t\tname\s*=\s*"/m],
      ["the author's own key", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196/common/characters/RID.txt", /^\t\tname\s*=\s*[A-Za-z_]/m],
    ];
    for (const [label, REAL, probe] of CASES) {
      if (!fs.existsSync(REAL)) { rec(`vanilla's ${path.basename(REAL)} is installed`, false, "cannot verify"); continue; }
      const original = fs.readFileSync(REAL, "utf8");
      rec(`CONTROL: ${path.basename(REAL)} really writes ${label}`, probe.test(original), "");
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cnform-real-"));
      made.push(mod);
      const dest = path.join(mod, "common", "characters", path.basename(REAL));
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CN Form"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, original, "utf8");
      try {
        const locSrc = path.join(REAL, "..", "..", "..", "localisation", "english");
        if (fs.existsSync(locSrc)) fs.cpSync(locSrc, path.join(mod, "localisation", "english"), { recursive: true });
      } catch (_) {}
      const list = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const file = (list.files || []).find((x) => x && x.file === path.basename(REAL));
      const chars = (file && file.characters) || [];
      let saved = 0;
      const errs = [];
      for (const raw of chars) {
        // ⚠️ A DLC-GATED CHARACTER IS EDITED ONE VARIANT AT A TIME, and the maker rightly REFUSES to flatten
        // one it is not told which variant to touch (#character-instance-guard). The client sends
        // `instanceIndex` for exactly those; omitting it made this section report Nova's correct refusal as
        // a failure of mine. 424 base-game characters are built that way.
        const hadInstances = Array.isArray(raw.instances) && raw.instances.length > 0;
        const c = hadInstances ? Object.assign({ token: raw.token }, raw.instances[0]) : raw;
        const name = (c.name && c.name !== c.token ? c.name : "").trim();
        if (!name) continue;
        const res = await fetch(`${BASE}/api/characters/save`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod, ...(hadInstances ? { instanceIndex: 0 } : {}),
            token: c.token, name, gender: c.gender === "female" ? "female" : "", file: path.basename(REAL),
            portraitCivLarge: String(c.portraitCivLarge || "").trim(), portraitCivSmall: String(c.portraitCivSmall || "").trim(),
            portraitArmyLarge: String(c.portraitArmyLarge || "").trim(), portraitArmySmall: String(c.portraitArmySmall || "").trim(),
            portraitNavyLarge: c.portraitNavyLarge || "", portraitNavySmall: c.portraitNavySmall || "",
            roleLeader: !!c.roleLeader, leaderIdeology: String(c.leaderIdeology || "").trim(),
            leaderExpire: String(c.leaderExpire || "").trim(), leaderTraits: String(c.leaderTraits || "").trim(),
            roleAdvisor: !!c.roleAdvisor, advisorSlot: c.advisorSlot || "", advisorCost: c.advisorCost || "",
            advisorLedger: c.advisorLedger || "", advisorIdeaToken: String(c.advisorIdeaToken || "").trim(),
            advisorTraits: String(c.advisorTraits || "").trim(),
            roleGeneral: !!c.roleGeneral, generalType: c.generalType || "",
            loadedRoles: { leader: !!c.roleLeader, advisor: !!c.roleAdvisor, generalType: c.roleGeneral ? (c.generalType || "corps_commander") : null },
            genSkill: c.genSkill || "", genAttack: c.genAttack || "", genDefense: c.genDefense || "",
            genPlanning: c.genPlanning || "", genLogistics: c.genLogistics || "",
            generalTraits: String(c.generalTraits || "").trim(),
          }),
        }).then((r) => r.json());
        if (res && res.error) errs.push(String(res.error).slice(0, 60)); else saved++;
      }
      const after = fs.readFileSync(dest, "utf8");
      const nameLines = (t) => (t.match(/^[ \t]*name[ \t]*=[ \t]*\S+/gm) || []).map((s) => s.trim());
      const before = nameLines(original), now = nameLines(after);
      rec(`${label}: characters saved`, saved > 0 && errs.length === 0, errs[0] || `${saved} saved`);
      rec(`⭐ ${label}: every name line is written exactly as the author wrote it`,
        JSON.stringify(before) === JSON.stringify(now),
        before.filter((x, i) => now[i] !== x).slice(0, 3).join(" · ") + "  ->  " + now.filter((x, i) => before[i] !== x).slice(0, 3).join(" · "));
    }

    console.log(`\n=== a character keeps the name form its author wrote: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
