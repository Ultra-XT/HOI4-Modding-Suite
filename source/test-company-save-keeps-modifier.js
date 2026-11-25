// #company-save-deletes-the-modifier-block — SAVING A COMPANY, UNCHANGED, DELETED PART OF IT.
//
// The Ideas maker's Company/Designer mode HIDES the modifier textarea (public/ideas.js:163,
// `showEl("grpModifiers", !designers)`) because a company's bonuses normally live in research_bonus /
// equipment_bonus / traits. The save knows that too — ideas.js:1783 refuses to send a `modifier` section
// when kind === "designer".
//
// But `formSections` — the list telling the server WHICH BOXES THIS FORM ACTUALLY DREW — named "modifier"
// unconditionally. The server clears any section the form owns and did not send (server.js:3597-3600), on the
// reasoning that the user emptied a visible box. For a company that box was never visible and was never sent,
// so every Save deleted the whole `modifier = { … }` block from common/ideas/*.txt. The editor looked
// identical before and after and the response was {ok:true}.
//
// 🈯 Measured over the shipped corpora, counting top-level `modifier = { }` on ideas in the five designer
// categories (tank/naval/aircraft/materiel_manufacturer, industrial_concern):
//     vanilla 510 of 1,025 · The Road to 56 782 of 1,603 · Rise of Nations 357 of 983 · Novum Vexillum 57/171
// Vanilla's own AFG_da_afghanistan_bank_idea and ARG_fabricaciones_militares… are among them.
//
// The comment sitting directly above that array describes THIS EXACT BUG for three other boxes, and gates
// each of them by kind (#spirit-save-deletes-hidden-blocks). "modifier" is the one entry that never got the
// same gate — the fix is next door to the defect, in the same expression.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-compmod-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
const DESIGNER_CATS = ["tank_manufacturer", "naval_manufacturer", "aircraft_manufacturer", "materiel_manufacturer", "industrial_concern"];

const MOD = path.join(ROOT, "compmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CompMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "compmod.mod"), 'name="CompMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const IDEAS_REL = "custom_ideas.txt";
const IDEAS_ABS = path.join(MOD, "common", "ideas", IDEAS_REL);
// A company shaped exactly like vanilla's: research_bonus + equipment_bonus + traits AND a top-level
// modifier, which is the block the form never draws.
const seedCompany = () => fs.writeFileSync(IDEAS_ABS, [
  "ideas = {",
  "\ttank_manufacturer = {",
  "\t\tdesigner = yes",
  "\t\tprobe_tank_co = {",
  "\t\t\tpicture = generic_tank_manufacturer_1",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tresearch_bonus = { armor = 0.10 }",
  "\t\t\tequipment_bonus = { armor = { reliability = 0.05 } }",
  "\t\t\tmodifier = {",
  "\t\t\t\tproduction_speed_arms_factory_factor = 0.10",
  "\t\t\t\tarmy_armor_attack_factor = 0.05",
  "\t\t\t}",
  "\t\t\ttraits = { tank_manufacturer_trait }",
  "\t\t\ton_remove = { custom_effect_tooltip = probe_gone }",
  "\t\t}",
  "\t}",
  "\tcountry = {",
  "\t\tprobe_country_spirit = {",
  "\t\t\tpicture = GFX_idea_unknown",
  "\t\t\tallowed = { always = yes }",
  "\t\t\tmodifier = { stability_factor = 0.10 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// ⭐⭐ THE PAYLOAD IS READ OUT OF THE SHIPPED CLIENT, NOT COPIED FROM IT.
//
// The first version of this test hardcoded the `formSections` array as public/ideas.js had it. Fixing the
// client then left the test still sending the OLD array, so it went on reporting the bug after the bug was
// gone — a test measuring a snapshot of the client rather than the client. Extract the literal expression
// from the shipped file and evaluate it for each kind: now the test cannot drift, and if someone deletes the
// gate the payload changes here too and the behavioural check below fires.
function clientFormSections(kind) {
  const src = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
  const at = src.indexOf("formSections: [");
  if (at === -1) throw new Error("formSections literal not found in public/ideas.js");
  const open = src.indexOf("[", at);
  let d = 0, close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") d++;
    else if (src[i] === "]") { d--; if (!d) { close = i; break; } }
  }
  if (close === -1) throw new Error("formSections literal is unbalanced");
  // eslint-disable-next-line no-new-func
  return Function("kind", `return ${src.slice(open, close + 1)};`)(kind);
}

let PORT = 51880;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));

    // ⭐ SEND WHAT THE CLIENT SENDS. This is the literal body public/ideas.js:1797-1834 builds, with the
    // formSections array reproduced exactly — including the fact that a designer never sends a `modifier`
    // section (ideas.js:1783). Anything else here would be testing my payload, not Nova.
    const savePayload = (kind, extra) => ({
      modPath: MOD,
      ideaId: kind === "designer" ? "probe_tank_co" : "probe_country_spirit",
      targetRelativeFile: IDEAS_REL,
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: kind === "designer" ? "Probe Tank Co" : "Probe Spirit",
      desc: "",
      picture: kind === "designer" ? "generic_tank_manufacturer_1" : "GFX_idea_unknown",
      selectedEffects: kind === "designer"
        ? ["allowed = {\nalways = yes\n}", "research_bonus = {\narmor = 0.10\n}", "equipment_bonus = {\narmor = { reliability = 0.05 }\n}"]
        : ["allowed = {\nalways = yes\n}"],
      formSections: clientFormSections(kind),
      mode: kind === "designer" ? "designers" : "spirits",
      category: kind === "designer" ? "tank_manufacturer" : "country",
      traits: kind === "designer" ? ["tank_manufacturer_trait"] : [],
      cost: "", removalCost: "", ledger: "",
      ...(extra || {}),
    });

    console.log("\n[ground truth] real companies DO carry a top-level modifier");
    {
      const matchBrace = (s, o) => { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
      const files = [];
      const walk = (dir) => { let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; } for (const x of e) { const p = path.join(dir, x.name); if (x.isDirectory()) walk(p); else if (x.name.toLowerCase().endsWith(".txt")) files.push(p); } };
      walk(path.join(GAME, "common", "ideas"));
      let total = 0, withMod = 0; const ex = [];
      for (const f of files) {
        let t = ""; try { t = fs.readFileSync(f, "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
        for (const cat of DESIGNER_CATS) {
          const re = new RegExp(`(?:^|\\n)\\s*${cat}\\s*=\\s*\\{`, "g");
          let m;
          while ((m = re.exec(t)) !== null) {
            const o = t.indexOf("{", m.index), c = matchBrace(t, o);
            if (o === -1 || c === -1) break;
            const body = t.slice(o + 1, c); re.lastIndex = c + 1;
            const ideaRe = /(?:^|\n)[ \t]*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*\{/g;
            let im;
            while ((im = ideaRe.exec(body)) !== null) {
              const io = body.indexOf("{", im.index), ic = matchBrace(body, io);
              if (io === -1 || ic === -1) break;
              ideaRe.lastIndex = ic + 1;
              total++;
              let depth = 0, has = false;
              for (const line of body.slice(io + 1, ic).split("\n")) {
                if (depth === 0 && /^\s*modifier\s*=\s*\{/.test(line)) has = true;
                for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth--; }
              }
              if (has) { withMod++; if (ex.length < 2) ex.push(im[1]); }
            }
          }
        }
      }
      if (!files.length) console.log("     (no HOI4 install — skipped)");
      else {
        console.log(`     vanilla: ${withMod} of ${total} designer/company ideas carry a top-level modifier · e.g. ${ex.join(", ")}`);
        rec("this is not a rare shape", withMod > 200, { withMod, total });
      }
    }

    console.log("\n[the defect] saving a company, unchanged, must not delete its modifier");
    {
      seedCompany();
      const before = fs.readFileSync(IDEAS_ABS, "utf8");
      rec("the fixture really has the block", /modifier\s*=\s*\{[\s\S]*?production_speed_arms_factory_factor/.test(before), before.slice(0, 200));
      const r = await post("/api/ideas/upsert-definition", savePayload("designer"));
      rec("the save succeeded", r.s < 400 && r.b && !r.b.error, r);
      const after = fs.readFileSync(IDEAS_ABS, "utf8");
      // ⚠️ Scoped to the COMPANY's own block. An unscoped /modifier\s*=\s*\{/ over the whole file matches the
      // country spirit sitting below it, so it passed even with the company's block deleted.
      const coBlock = (after.match(/probe_tank_co\s*=\s*\{[\s\S]*?\n\t\t\}/) || [""])[0];
      rec("the modifier block SURVIVED", /production_speed_arms_factory_factor/.test(coBlock) && /army_armor_attack_factor/.test(coBlock), coBlock.slice(0, 500));
      rec("…and it is still a modifier block, not loose keys", /modifier\s*=\s*\{/.test(coBlock), coBlock.slice(0, 500));
      rec("…the company itself is intact", /probe_tank_co/.test(after), after.slice(0, 300));
      rec("…research_bonus, which the form DOES draw, is intact", /research_bonus/.test(after), after.slice(0, 700));
      rec("…and the un-modelled on_remove still round-trips", /on_remove/.test(after), after.slice(0, 700));
    }

    console.log("\n[CONTROL] a COUNTRY spirit's modifier box IS drawn, so clearing it must still clear");
    {
      // Without this, "never clear modifier" would be indistinguishable from the fix — and would make an
      // emptied modifier box impossible to save, which is a real thing users do.
      seedCompany();
      const r = await post("/api/ideas/upsert-definition", savePayload("country"));
      rec("the save succeeded", r.s < 400 && r.b && !r.b.error, r);
      const after = fs.readFileSync(IDEAS_ABS, "utf8");
      const spiritBlock = (after.match(/probe_country_spirit\s*=\s*\{[\s\S]*?\n\t\t\}/) || [""])[0];
      console.log("     country spirit after clearing its modifier box: " + JSON.stringify(spiritBlock.replace(/\s+/g, " ").slice(0, 120)));
      rec("the emptied modifier really was cleared", !/stability_factor/.test(spiritBlock), spiritBlock);
      rec("…and the company next to it was not touched", /production_speed_arms_factory_factor/.test(after), after.slice(0, 700));
    }

    console.log("\n[the source] the gate lives with its siblings");
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
      rec("`modifier` is gated by kind like every other hidden box",
        /\.\.\.\(kind === "designer" \? \[\] : \["modifier"\]\)/.test(src), "still unconditional in formSections");
      rec("…and the save still refuses to SEND one for a designer",
        /if \(modifiers && kind !== "designer"\)/.test(src), "the send-side guard went missing");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== company save keeps modifier: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
