// #spirit-loc-ignores-the-name-redirect — WRITE WHERE THE GAME READS.
//
// An idea block may carry `name = <key>`, and when it does HOI4 localises it through THAT key, not the idea
// id. server.js already models this for READING (#idea-name-loc-redirect-ignored — scanLocalizationForIdea
// takes a nameKeyOverride). The write side did not: it always wrote the id.
//
// So overriding a redirecting spirit and typing a new display name put the text somewhere the game never
// looks, and the old name stayed on screen. Measured on a base mod whose spirit declares
// `name = NK_REDIRECT_KEY`: the block Nova wrote KEPT the redirect, the loc went to `nk_spirit_idea`.
//
// 🈯 Not an edge case — the corpus check below measures it rather than asserting it: vanilla has ~1300 ideas
// declaring `name = <key>`, nearly all localised through that key and only a few dozen under their own id.
//
// The DECISIONS maker already solved this exact problem: upsertDecisionLocalization takes a nameKey and uses
// `titleKey = /^[A-Za-z0-9_]+$/.test(nameKey) ? nameKey : id`. This adopts the sibling's rule rather than
// inventing a second one — the same "one caller short" shape as most of this campaign.
//
// ⚠️ A redirect key can be SHARED (vanilla points AFG_expanded_the_madrasas_2_idea at
// AFG_expanded_the_madrasas_idea), so renaming through it renames every idea pointing there. That is what
// the file says; writing anywhere else would mean the rename does nothing at all, which is the bug. An
// author who wants an independent name gives the spirit its own `name =` key. Recorded, not blocked.
//
// ⚠️ THREE ATTEMPTS. My first two probes died on my own payload shape before reaching any behaviour. This
// one sends what public/ideas.js sends: plain script strings in selectedEffects, formSections naming the
// boxes the country form draws, and no extraScript (the page clears it on load).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-namekey-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "NK" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const spiritText = (id, nameKey) => [
  "ideas = {", "\tcountry = {", "\t\t" + id + " = {",
  ...(nameKey ? ["\t\t\tname = " + nameKey] : []),
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.5 }",
  "\t\t}", "\t}", "}", "",
].join("\n");
const locLines = (dir) => {
  const d = path.join(dir, "localisation", "english");
  const out = [];
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d))
    for (const l of fs.readFileSync(path.join(d, f), "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"(.*)"\s*$/.exec(l);
      if (m) out.push({ key: m[1], value: m[2] });
    }
  return out;
};
const FORM_SECTIONS = ["allowed", "modifier", "equipment_bonus", "visible", "on_add", "allowed_civil_war"];

let PORT = 50450;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      upsert: (b) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/upsert-definition", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
// Exactly what public/ideas.js builds for a COUNTRY spirit.
const clientBody = (over) => Object.assign({
  category: "country", mode: "create",
  targetRelativeFile: "common/ideas/custom_ideas.txt",
  desc: "", picture: "generic_morale_bonus", cost: "", removalCost: "-1", ledger: "", traits: "",
  selectedEffects: ["modifier = {\npolitical_power_gain = 0.5\n}"],
  formSections: FORM_SECTIONS,
}, over);

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] how vanilla localises a redirecting idea");
    if (fs.existsSync(path.join(GAME, "common", "ideas"))) {
      const keys = new Set();
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { walk(p); continue; }
          if (!/_l_english\.yml$/i.test(e.name)) continue;
          for (const l of fs.readFileSync(p, "utf8").split("\n")) {
            const m = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"/.exec(l);
            if (m) keys.add(m[1]);
          }
        }
      };
      walk(path.join(GAME, "localisation", "english"));
      let redirects = 0, underId = 0, underKey = 0;
      const ideasDir = path.join(GAME, "common", "ideas");
      for (const f of fs.readdirSync(ideasDir).filter((x) => x.endsWith(".txt"))) {
        const t = fs.readFileSync(path.join(ideasDir, f), "latin1").replace(/#.*$/gm, "");
        for (const m of t.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{[^{}]*?\bname\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gs)) {
          redirects++;
          if (keys.has(m[1])) underId++;
          if (keys.has(m[2])) underKey++;
        }
      }
      console.log(`  ${redirects} vanilla ideas redirect; ${underKey} localised through the key, ${underId} under their own id`);
      rec("the redirect is the norm, not an edge case", redirects > 500 && underKey > underId * 5,
        { redirects, underKey, underId });
    } else console.log("  (no HOI4 install — corpus skipped)");

    api = await serve(createApp());

    console.log("\n[a redirecting spirit] the name lands where the game reads it");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "ideas", "nk_base.txt"),
        spiritText("nk_spirit_idea", "NK_REDIRECT_KEY"));
      fs.mkdirSync(path.join(base.dir, "localisation", "english"), { recursive: true });
      fs.writeFileSync(path.join(base.dir, "localisation", "english", "nk_l_english.yml"),
        '\uFEFFl_english:\n NK_REDIRECT_KEY:0 "The Base Mod Name"\n');
      const addon = mkMod(base.name);

      const r = await api.upsert(clientBody({
        modPath: addon.dir, sourceRoot: base.dir, ideaId: "nk_spirit_idea",
        previousRelativeFile: "common/ideas/nk_base.txt", name: "My New Display Name",
      }));
      rec("the save succeeds", r.ok === true, r);

      const wrote = locLines(addon.dir);
      rec("…the block keeps its redirect",
        /name\s*=\s*NK_REDIRECT_KEY/.test(fs.readFileSync(path.join(addon.dir, "common", "ideas", "custom_ideas.txt"), "utf8")),
        "redirect dropped");
      rec("…the name is written under the REDIRECT key",
        wrote.some((x) => x.key === "NK_REDIRECT_KEY" && x.value === "My New Display Name"), wrote);
      rec("…and NOT under the idea id, where the game never looks",
        !wrote.some((x) => x.key === "nk_spirit_idea"), wrote);
      rec("…and the base mod is untouched",
        /The Base Mod Name/.test(fs.readFileSync(path.join(base.dir, "localisation", "english", "nk_l_english.yml"), "utf8")),
        "base mod changed");
    }

    console.log("\n[a spirit with NO redirect] still localised under its id");
    {
      const mod = mkMod(null);
      const r = await api.upsert(clientBody({
        modPath: mod.dir, ideaId: "nk_plain_idea",
        targetRelativeFile: "common/ideas/custom_ideas.txt", name: "Plain Spirit",
      }));
      rec("the save succeeds", r.ok === true, r);
      const wrote = locLines(mod.dir);
      rec("…the name is under the idea id", wrote.some((x) => x.key === "nk_plain_idea" && x.value === "Plain Spirit"), wrote);
      rec("…and no phantom key was invented", wrote.every((x) => x.key.startsWith("nk_plain_idea")), wrote);
    }

    console.log("\n[the description follows the same key]");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "ideas", "nk_base2.txt"),
        spiritText("nk_desc_idea", "NK_DESC_KEY"));
      const addon = mkMod(base.name);
      const r = await api.upsert(clientBody({
        modPath: addon.dir, sourceRoot: base.dir, ideaId: "nk_desc_idea",
        previousRelativeFile: "common/ideas/nk_base2.txt",
        name: "Named", desc: "A description of my own.",
      }));
      rec("the save succeeds", r.ok === true, r);
      const wrote = locLines(addon.dir);
      rec("…the desc is under <redirect>_desc",
        wrote.some((x) => x.key === "NK_DESC_KEY_desc" && x.value === "A description of my own."), wrote);
      rec("…not under <id>_desc", !wrote.some((x) => x.key === "nk_desc_idea_desc"), wrote);
    }

    console.log("\n[the rule matches the decisions sibling]");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the ideas writer resolves a loc key from the block", /const locKey = \(\(\) => \{/.test(SRV), "no key resolution");
      rec("…reading it off the block it just wrote",
        /const blk = extractIdeaBlockTextFromFile\(written, ideaId\);/.test(SRV), "reads a stale source instead");
      rec("…and uses it for both name and desc",
        /writeLocKeyInPlace\(nameHome, locKey, nameVal\)/.test(SRV) && /writeLocKeyInPlace\(descHome, `\$\{locKey\}_desc`, descVal\)/.test(SRV),
        "one of the two still uses the id");
      // ⭐ COMPARE THE RULES, NOT THE CHARACTERS THAT SPELL THEM. This used to pin the decisions writer's
      // line verbatim, so widening either side for hyphenated loc keys failed it for a reason that had
      // nothing to do with the two drifting apart. What has to hold is that both accept the same keys.
      const ideaRule = (SRV.match(/name\\s\*=\\s\*\(\[A-Za-z_\]\[([^\])]*)\]\*\)/) || [])[1];
      const decRule = (SRV.match(/const titleKey = \/\^\[A-Za-z_\]\[([^\])]*)\]\*\$\/\.test\(String\(nameKey/) || [])[1];
      console.log(`     ideas rule tail: ${JSON.stringify(ideaRule)}   decisions rule tail: ${JSON.stringify(decRule)}`);
      // ⚠️ If either is unreadable the comparison below is vacuous.
      rec("both loc-key rules are readable", !!ideaRule && !!decRule, { ideaRule, decRule });
      rec("…and the two writers agree on what a loc key may contain", ideaRule === decRule,
        { ideaRule, decRule });
      // …and both must admit the hyphenated keys vanilla actually ships.
      const sample = "AST_vickers-ruwolt_organization";
      const accepts = (tail) => { try { return new RegExp(`^[A-Za-z_][${tail}]*$`).test(sample); } catch (_) { return false; } };
      rec(`…including ${sample}`, accepts(ideaRule) && accepts(decRule), { ideaRule, decRule });
    }

    api.stop(); api = null;
    console.log(`\n=== spirit loc name redirect: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
