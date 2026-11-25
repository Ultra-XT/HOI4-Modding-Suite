// #tech-category-union-offers-dead-categories — THE TECH-BONUS PICKER OFFERED 132 CATEGORIES THE GAME
// DOES NOT HAVE, AND NONE OF THE 158 IT DOES.
//
// collectTechCategories unioned `technology_categories` across every root. HOI4 replaces a common/ file
// WHOLESALE at the same relative path, and vanilla ships exactly one file here — 00_technology.txt, 133
// categories — so a mod shipping its own 00_technology.txt takes the whole list over. Measured over the
// installed corpus:
//
//   Millennium Dawn   own 00_technology.txt, 158 categories, sharing   1 with vanilla
//   Old World Blues   own 00_technology.txt, 132 categories, sharing   9
//   Novum Vexillum    own 00_technology.txt, 128 categories, sharing 114
//   Rise of Nations   own 00_technology.txt, 164 categories, sharing 133
//   The Road to 56    r56e_technology.txt, does NOT shadow          ← a union is CORRECT here
//
// So the picker offered 132 dead categories on MD, 124 on OWB. Picking one writes
// `add_tech_bonus = { category = … }` into a focus's completion_reward — a research bonus matching no
// technology, which fails silently and appears nowhere in error.log.
//
// 🈯 AND THE BLOCK NAME IS CASE-INSENSITIVE: Millennium Dawn writes `technology_Categories` with a capital
// C. The case-sensitive match found ZERO of MD's 158, so on MD the picker showed vanilla's 133 — every one
// of them dead — and nothing real at all.
//
// ⭐ Nova already knew both rules. parseTechCategoriesFromText matches with /i and says why ("MD writes
// technology_Categories"); getActiveModTechCategories already does `mod.has00 ? mod.cats : vanilla.cats
// .concat(mod.cats)`. The AI-grounding path adopted them, the picker path never did — the house bug shape.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tcsp-r-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { stripJsComments } = require("./testlib-strip-comments.js");
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

const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => fs.mkdirSync(p, { recursive: true });
// ⚠️ A FLAT TOKEN LIST, which is what the shipped files actually contain — vanilla and Millennium Dawn both
// write `technology_categories = { light_air\n medium_air\n … }` with no nested blocks. An earlier version of
// this fixture invented `light_air = { name = "…" }`, and since the reader takes every bareword inside the
// block it dutifully reported `name` as a category. That was the FIXTURE being wrong about the format, not
// the reader — but it is exactly how a test invents a defect, so the shape is pinned here deliberately.
const catsFile = (blockName, tokens) => `# a flat list, as vanilla and MD both write it\n${blockName} = {\n${tokens.map((t) => `\t${t}`).join("\n")}\n}\n`;

// A base mod that SHADOWS vanilla's 00_technology.txt — and writes the block with a capital C, as MD does.
const SHADOW = path.join(ROOT, "shadowbase");
mk(path.join(SHADOW, "common", "technology_tags"));
fs.writeFileSync(path.join(SHADOW, "descriptor.mod"), 'name="ShadowBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "shadowbase.mod"), 'name="ShadowBase"\npath="' + toPosix(SHADOW) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(SHADOW, "common", "technology_tags", "00_technology.txt"),
  catsFile("technology_Categories", ["nova_shadow_cat_one", "nova_shadow_cat_two"]));
// …plus a SECOND file that does not shadow anything, which must still contribute.
fs.writeFileSync(path.join(SHADOW, "common", "technology_tags", "zz_extra_technology.txt"),
  catsFile("technology_categories", ["nova_shadow_extra"]));

// A base mod that does NOT shadow: a differently-named file, the way The Road to 56 ships r56e_technology.txt.
const ADDITIVE = path.join(ROOT, "additivebase");
mk(path.join(ADDITIVE, "common", "technology_tags"));
fs.writeFileSync(path.join(ADDITIVE, "descriptor.mod"), 'name="AdditiveBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "additivebase.mod"), 'name="AdditiveBase"\npath="' + toPosix(ADDITIVE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDITIVE, "common", "technology_tags", "zz_additive_technology.txt"),
  catsFile("technology_categories", ["nova_additive_cat"]));

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 53005;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const cats = async (root) => {
      const j = await fetch(`http://127.0.0.1:${PORT}/api/vanilla/tech-categories?modPath=${encodeURIComponent(root)}`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const rows = j.categories || j.items || (Array.isArray(j) ? j : []);
      return new Set(rows.map((c) => (typeof c === "string" ? c : (c.id || c.name || c.category))).filter(Boolean));
    };

    console.log("\n[CONTROL] vanilla's own categories are readable, or nothing below means anything");
    const vanilla = await cats(GAME);
    console.log(`     vanilla offers ${vanilla.size}`);
    rec("vanilla declares a substantial list", vanilla.size > 100, vanilla.size);
    rec("…including a well-known one", vanilla.has("land_doctrine"), [...vanilla].slice(0, 6));

    console.log("\n[🈯 SAME PATH = REPLACEMENT] a mod's own 00_technology.txt takes the list over");
    {
      const c = await cats(SHADOW);
      console.log(`     shadowing mod offers ${c.size}: ${[...c].join(", ")}`);
      rec("the mod's own categories are offered", c.has("nova_shadow_cat_one") && c.has("nova_shadow_cat_two"), [...c]);
      // THE BUG: vanilla's 133 were unioned in, and the game loads none of them.
      rec("…and vanilla's are NOT, because its file no longer loads", !c.has("land_doctrine"), [...c].slice(0, 8));
      rec("…while a differently-named file in the same mod still contributes", c.has("nova_shadow_extra"), [...c]);
      rec("…so the list is exactly the mod's three", c.size === 3, c.size);
    }

    console.log("\n[🈯 capital C] Millennium Dawn writes `technology_Categories`");
    {
      // The shadowing fixture declares its 00_technology.txt block with a capital C on purpose. If the match
      // were case-sensitive the two categories above would be missing entirely — which is what happened on
      // MD, where the picker found 0 of 158.
      const raw = fs.readFileSync(path.join(SHADOW, "common", "technology_tags", "00_technology.txt"), "utf8");
      rec("the fixture really does use a capital C", /technology_Categories\s*=/.test(raw), raw.slice(0, 60));
      const c = await cats(SHADOW);
      rec("…and its categories are still found", c.has("nova_shadow_cat_one"), [...c]);
    }

    console.log("\n[⭐ CONTROL — the other direction] a mod that does NOT shadow must still ADD to vanilla");
    {
      // The discriminating case. A fix that simply always replaced would pass every check above and be
      // wrong here: The Road to 56 ships r56e_technology.txt, so the game loads vanilla's 133 AND its 40.
      const c = await cats(ADDITIVE);
      console.log(`     additive mod offers ${c.size}`);
      rec("the mod's own category is offered", c.has("nova_additive_cat"), [...c].slice(0, 6));
      rec("…AND vanilla's are kept, because nothing shadowed them", c.has("land_doctrine"), [...c].slice(0, 6));
      rec("…so the list is a union, not a replacement", c.size === vanilla.size + 1, { got: c.size, want: vanilla.size + 1 });
    }

    console.log("\n[⭐ ONE READER] the picker and the AI grounding must not walk these files separately");
    {
      // The two readers each held HALF the rules and disagreed. collectTechCategories (the picker) matched
      // the block name case-sensitively while unioning roots that replace each other; getActiveModTechCategories
      // (which builds the AI's "the ONLY valid values for add_tech_bonus category=" list) knew about both
      // 00-shadowing and MD's capital C, but had no notion of a DEPENDENCY — so an add-on over a total
      // conversion was grounded on vanilla's 133, 132 of them dead in that game.
      //
      // ⚠️ The AI half cannot be reached over HTTP: it is consumed inside a keyed endpoint, and
      // getActiveModTechCategories lives inside createApp so it cannot be exported either. What CAN be
      // pinned is that neither reader walks the directory itself any more — a structural check, and an
      // honest one, because the failure it guards against is precisely the two drifting apart again.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const helper = "collectTechCategoryTokensAcrossRoots";
      const defAt = sv.indexOf(`function ${helper}(`);
      rec("the shared walk exists", defAt !== -1, "no shared helper");
      const callers = [...sv.matchAll(new RegExp(`${helper}\\(`, "g"))].length - 1; // minus the definition
      console.log(`     ${helper} has ${callers} callers`);
      rec("…and BOTH readers use it", callers >= 2, callers);

      // …and neither still has its own readdir of common/technology_tags.
      // ⚠️ Take the function's REAL body by matching braces. A fixed-size window overran the end of
      // collectTechCategories into neighbouring code and reported a readdirSync that belongs to something
      // else entirely — the check failed for a reason that had nothing to do with what it was testing.
      const bodyOf = (name) => {
        const at = sv.indexOf(`function ${name}(`);
        if (at === -1) return "";
        const open = sv.indexOf("{", at);
        let d = 0;
        for (let i = open; i < sv.length; i++) {
          if (sv[i] === "{") d++;
          else if (sv[i] === "}") { d--; if (!d) return sv.slice(at, i + 1); }
        }
        return sv.slice(at, at + 1800);
      };
      for (const fn of ["collectTechCategories", "getActiveModTechCategories"]) {
        const body = stripJsComments(bodyOf(fn));
        rec(`${fn} no longer walks technology_tags itself`,
          !/readdirSync|walkTxtFilesUnder/.test(body), body.slice(0, 200));
      }
    }

    console.log("\n[the corpus] every installed base mod, offered vs what the game would load");
    {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const matchBrace = (s, o) => { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
      const declaredIn = (root) => {
        const dir = path.join(root, "common", "technology_tags");
        const out = new Set(); let files = [];
        try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { return { out, files }; }
        for (const f of files) {
          let t = ""; try { t = fs.readFileSync(path.join(dir, f), "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
          const m = /technology_categories\s*=\s*\{/i.exec(t);
          if (!m) continue;
          const o = t.indexOf("{", m.index), cl = matchBrace(t, o);
          if (cl === -1) continue;
          for (const tok of t.slice(o + 1, cl).split(/\s+/)) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) out.add(tok);
        }
        return { out, files };
      };
      const vanFiles = declaredIn(GAME).files.map((f) => f.toLowerCase());
      let mods = [];
      try {
        for (const d of fs.readdirSync(WS)) {
          let nm = ""; try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
          const dec = declaredIn(path.join(WS, d));
          if (nm && dec.files.length) mods.push([nm.slice(0, 30), path.join(WS, d), dec]);
        }
      } catch (_) { mods = []; }
      if (!mods.length) {
        console.log("     (no workshop mods with technology_tags installed — corpus check skipped)");
        rec("the corpus check is skipped only because nothing is installed", true, "skipped");
      } else {
        rec("the corpus really has base mods to check", mods.length >= 2, mods.length);
        let anyDead = 0, anyMissing = 0;
        for (const [label, root, dec] of mods) {
          const offered = await cats(root);
          const shadows = dec.files.some((f) => vanFiles.includes(f.toLowerCase()));
          const real = new Set(dec.out);
          if (!shadows) for (const c of vanilla) real.add(c);
          const dead = [...offered].filter((c) => !real.has(c));
          const missing = [...real].filter((c) => !offered.has(c));
          anyDead += dead.length; anyMissing += missing.length;
          console.log(`     ${label.padEnd(30)} offers ${String(offered.size).padStart(4)} · game has ${String(real.size).padStart(4)} · dead ${dead.length} · missing ${missing.length}`);
        }
        rec("no base mod is offered a category the game will not load", anyDead === 0, anyDead + " dead across the corpus");
        rec("…and none of its real ones are hidden", anyMissing === 0, anyMissing + " missing across the corpus");
      }
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== tech category same-path replace: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
