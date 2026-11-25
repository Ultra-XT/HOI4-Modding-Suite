// #catalog-name-ignores-the-redirect — LOOK THE NAME UP WHERE THE GAME READS IT.
//
// The READ sibling of #spirit-loc-ignores-the-name-redirect. /api/ideas/catalog?withNames=1 decorated each
// item with `names[it.ideaId]`. An idea carrying `name = <key>` is localised under THAT key, so the lookup
// missed and localizedName fell back to "" — Country Setup's spirit rows and its autocomplete then showed a
// raw id instead of a name.
//
// 🈯 Counted with the SHIPPED parser: of the 5,998 ideas it sees in vanilla, 1,099 declare a name=
// redirect (Millennium Dawn: 2,698 of 10,518). An earlier draft of this header said 1,302/1,297 — that
// came from grepping `name =` lines, which is not the same question and no measurement reproduced it.
//
// ⚠️ THE CATCH THAT NEARLY WENT IN WRONG. My first version matched `name =` anywhere in the block, the way
// `picture` is matched. Measuring both shipping corpora BEFORE trusting it showed nested `name =` lines are
// real — 5 ideas in vanilla and 50 in Millennium Dawn carry one inside a sub-block (75 nested lines across
// those 50; an earlier draft of this header called the line count an idea count). Taking one of those as
// the loc key would localise the idea through the wrong key: this very bug, inverted, and invisible unless
// you happen to open one of those ideas. The extraction is depth-aware, and the corpus count is asserted
// below so the hazard cannot quietly disappear from the record.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catname-"));
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
const MOD = path.join(ROOT, "mymod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CN"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "mymod.mod"),
  'name="CN"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

// Four shapes in one file: a redirect, a plain idea, a COMMENTED-OUT redirect, and a NESTED name= that must
// be ignored. The last two are the ways a naive parser goes wrong.
fs.writeFileSync(path.join(MOD, "common", "ideas", "cn.txt"), [
  "ideas = {",
  "\tcountry = {",
  "\t\tcn_redirect_idea = {",
  "\t\t\tname = CN_REAL_KEY",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.1 }",
  "\t\t}",
  "\t\tcn_plain_idea = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.2 }",
  "\t\t}",
  "\t\tcn_commented_idea = {",
  "\t\t\t# name = CN_OLD_KEY",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.3 }",
  "\t\t}",
  "\t\tcn_placeholder_idea = {",
  "\t\t\tname = CN_PLACEHOLDER_KEY",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { political_power_gain = 0.5 }",
  "\t\t}",
  "\t\tcn_nested_idea = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\ton_add = {",
  "\t\t\t\tcustom_effect_tooltip = something",
  "\t\t\t\tname = CN_NESTED_KEY",
  "\t\t\t}",
  "\t\t\tmodifier = { political_power_gain = 0.4 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"));
fs.writeFileSync(path.join(MOD, "localisation", "english", "cn_l_english.yml"),
  '\uFEFFl_english:\n'
  + ' CN_REAL_KEY:0 "The Redirected Name"\n'
  + ' CN_REAL_KEY_desc:0 "Its description."\n'
  + ' cn_plain_idea:0 "The Plain Name"\n'
  + ' cn_commented_idea:0 "The Commented Name"\n'
  + ' CN_OLD_KEY:0 "WRONG — a commented-out key"\n'
  + ' CN_PLACEHOLDER_KEY:0 "CN_PLACEHOLDER_KEY"\n'
  + ' cn_nested_idea:0 "The Nested Name"\n'
  + ' CN_NESTED_KEY:0 "WRONG — a nested key"\n');

let PORT = 50490;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      catalog: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/catalog?withNames=1&modPath="
        + encodeURIComponent(mod)).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the corpus] nested name= lines are real, which is why depth matters");
    {
      const countNested = (dir) => {
        if (!fs.existsSync(dir)) return null;
        let top = 0, nested = 0;
        const files = [];
        const walk = (d) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (e.name.endsWith(".txt")) files.push(p);
          }
        };
        walk(dir);
        for (const f of files) {
          const src = fs.readFileSync(f, "latin1").replace(/#.*$/gm, "");
          let depth = 0, m;
          const re = /([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*\{|\{|\}/g;
          while ((m = re.exec(src)) !== null) {
            if (m[0] === "}") { depth--; continue; }
            if (m[0] === "{") { depth++; continue; }
            if (depth === 2) {
              const open = src.indexOf("{", m.index + m[0].length - 1);
              let d2 = 0, close = -1;
              for (let i = open; i < src.length; i++) {
                const c = src[i];
                if (c === "{") d2++; else if (c === "}") { d2--; if (!d2) { close = i; break; } }
              }
              if (close !== -1) {
                const inner = src.slice(open + 1, close);
                let dd = 0, mm;
                const kr = /([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*\{|\{|\}|(^|\n)[ \t]*name[ \t]*=/g;
                while ((mm = kr.exec(inner)) !== null) {
                  if (mm[0] === "}") { dd--; continue; }
                  if (mm[0] === "{") { dd++; continue; }
                  if (/name[ \t]*=$/.test(mm[0])) { if (dd === 0) top++; else nested++; continue; }
                  dd++;
                }
              }
            }
            depth++;
          }
        }
        return { top, nested };
      };
      const v = countNested(path.join(GAME, "common", "ideas"));
      const md = countNested("D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/ideas");
      if (v) console.log(`  vanilla: ${v.top} top-level name=, ${v.nested} NESTED`);
      if (md) console.log(`  Millennium Dawn: ${md.top} top-level name=, ${md.nested} NESTED`);
      if (v) rec("vanilla really does nest some name= lines", v.nested > 0, v);
      if (md) rec("…and a real base mod nests many more", md.nested > v.nested, { vanilla: v.nested, md: md.nested });
    }

    api = await serve(createApp());
    const r = await api.catalog(MOD);
    const by = (id) => (r.items || []).find((i) => i.ideaId === id);

    console.log("\n[a redirecting idea] resolved through its name= key");
    {
      const it = by("cn_redirect_idea");
      rec("the idea is in the catalogue", !!it, (r.items || []).map((i) => i.ideaId));
      rec("…its redirect is reported", it && it.nameKey === "CN_REAL_KEY", it);
      rec("…and the name comes from that key", it && it.localizedName === "The Redirected Name", it);
      rec("…as does the description", it && it.localizedDesc === "Its description.", it);
    }

    console.log("\n[a plain idea] still resolved by its id");
    {
      const it = by("cn_plain_idea");
      rec("…no redirect is invented", it && !it.nameKey, it);
      rec("…and the name is the id's", it && it.localizedName === "The Plain Name", it);
    }

    console.log("\n[a commented-out redirect] must not be picked up");
    {
      const it = by("cn_commented_idea");
      rec("…no redirect is read from a comment", it && !it.nameKey, it);
      rec("…so the id's own name is shown", it && it.localizedName === "The Commented Name", it);
    }

    console.log("\n[an UNTRANSLATED redirect] must not put a raw loc key in front of the user");
    {
      // HOI4's own placeholder shape: the entry exists but its value IS the key. The decorator has always
      // dropped that — the check was just written against the ID, which stopped being the key the moment
      // the lookup started following `name =`.
      const it = by("cn_placeholder_idea");
      rec("…the redirect is still read", it && it.nameKey === "CN_PLACEHOLDER_KEY", it);
      rec("…but the key is not shown as if it were a name", it && it.localizedName === "", it);
    }

    console.log("\n[a NESTED name=] belongs to the sub-block, not the idea");
    {
      const it = by("cn_nested_idea");
      rec("…the nested key is NOT taken as the redirect", it && !it.nameKey, it);
      rec("…so the idea keeps its own name", it && it.localizedName === "The Nested Name", it);
      rec("…and the wrong key's text never appears",
        it && it.localizedName !== "WRONG — a nested key", it);
    }

    api.stop(); api = null;
    console.log(`\n=== catalog name redirect: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
