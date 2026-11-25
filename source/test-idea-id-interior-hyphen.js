// #token-interior-hyphen — THE IDEA PICKER OFFERED IDS THAT DO NOT EXIST.
//
// A Clausewitz bareword may contain an interior hyphen — only the FIRST character is restricted (no digit,
// no hyphen). Nova's idea/spirit id extractor read the word before `=` with /([A-Za-z0-9_]+)\s*$/, which
// stops dead at a hyphen. That did not merely MISS those ideas, which would be bad enough; it produced a
// DIFFERENT, WRONG id — so the picker listed something that exists nowhere, and the real idea was never
// offered at all. Picking one writes `add_ideas = { wright_organization_idea }` into a focus reward, which
// HOI4 silently ignores.
//
// Measured across vanilla and every installed workshop mod, 23 idea/spirit ids carry one:
//
//   AST_curtiss-wright_organization_idea   was read as  "wright_organization_idea"
//   AST_vickers-ruwolt_organization_idea                "ruwolt_organization_idea"
//   advisor_DEN_jan_falck-schmidt                       "schmidt"
//   NKO_Marxism-Leninism                                "Leninism"
//
// and worse, Novum Vexillum's AFT_Neo-Fascist_Doctrine and GEF_Neo-Fascist_Doctrine BOTH collapsed to
// "Fascist_Doctrine", so one silently shadowed the other in the list.
//
// Nova already knew the rule elsewhere: the decision-save guard explains that an id may contain '-'
// (Millennium Dawn ships Communist-State_invite) and refuses to block one that is already on disk.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hyphen-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "hyphmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HyphMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "hyphmod.mod"), 'name="HyphMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "zz_nova_hyphen.txt"),
  "ideas = {\n" +
  "\tcountry = {\n" +
  "\t\tnova_plain_spirit_idea = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n" +
  "\t\tnova_curtiss-wright_organization_idea = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n" +
  "\t\tNOVA_Neo-Fascist_Doctrine = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n" +
  "\t\tNOVA_Other-Fascist_Doctrine = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n" +
  "\t}\n}\n");

const PORT = 53041;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    // ⭐ SEND WHAT THE CLIENT SENDS — public/app.js:8847 loadIdeaCatalogForPicker posts sourcePath (this
    // endpoint's real parameter) plus modPath and the two include flags.
    const j = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}&includeVanilla=1&includeActiveMod=1`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const ids = ((j && j.items) || []).map((x) => x.ideaId || x.id).filter(Boolean);
    console.log(`\n     catalogue returned ${ids.length} ideas`);

    console.log("\n[CONTROL] the fixture is being read at all");
    {
      rec("the catalogue is not empty", ids.length > 100, ids.length);
      rec("…and the mod's own hyphen-free spirit is there", ids.includes("nova_plain_spirit_idea"), ids.filter((x) => /^nova_/.test(x)));
    }

    console.log("\n[the defect] an interior hyphen must survive");
    {
      rec("the full hyphenated id is offered", ids.includes("nova_curtiss-wright_organization_idea"),
        ids.filter((x) => /curtiss|wright/i.test(x)));
      // THE BUG: the truncation was not a near-miss, it was a DIFFERENT id — one HOI4 does not have.
      rec("…and the truncated phantom is NOT", !ids.includes("wright_organization_idea"),
        ids.filter((x) => /wright/i.test(x)));
    }

    console.log("\n[the collision] two ids must not collapse into one");
    {
      rec("both Neo-/Other- ids are present",
        ids.includes("NOVA_Neo-Fascist_Doctrine") && ids.includes("NOVA_Other-Fascist_Doctrine"),
        ids.filter((x) => /Fascist/i.test(x)));
      rec("…and neither shadowed the other into a single 'Fascist_Doctrine'",
        !ids.includes("Fascist_Doctrine"), ids.filter((x) => /Fascist/i.test(x)));
    }

    console.log("\n[⭐ EVERY GATE, not just the one] a listed spirit must be openable and deletable");
    {
      // ⚠️ THE INCOMPLETE-FIX TRAP. Widening the id EXTRACTOR made these ids appear in the catalogue for the
      // first time, and the entry-preview gate was widened with it — but edit-payload, entry-block and
      // delete kept `/^[A-Za-z0-9_]+$/`, so clicking one of the newly-listed spirits answered HTTP 400
      // "Invalid spirit ID". Listable and unopenable is WORSE than absent: before the extractor fix the
      // list held a truncated phantom, which at least nobody could click by mistake.
      //
      // Derived, not a list of three routes: every gate that guards an "Invalid spirit ID" throw must use
      // the same widened shape, so a fifth route added later is swept the day it is added.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const lines = sv.split("\n");
      const gates = [];
      lines.forEach((l, i) => {
        if (!/test\(ideaId\)/.test(l)) return;
        if (!/Invalid spirit ID/.test(lines.slice(i + 1, i + 4).join("\n"))) return;
        gates.push({ line: i + 1, src: l.trim() });
      });
      console.log(`     gates guarding "Invalid spirit ID": ${gates.length}`);
      rec("the sweep found the gates at all", gates.length >= 3, gates.length);
      const narrow = gates.filter((g) => !/A-Za-z0-9_-/.test(g.src));
      rec("…and every one of them admits an interior hyphen", narrow.length === 0,
        narrow.map((g) => `line ${g.line}: ${g.src.slice(0, 70)}`));
    }

    console.log("\n[🈯 the rule] a hyphen is legal INSIDE a bareword, never at the START");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const m = /const match = beforeEq\.match\((\/[^\n]*?\/)\);/.exec(sv);
      rec("the extractor's pattern is findable", !!m, "not found");
      if (m) {
        // eslint-disable-next-line no-new-func
        const re = Function(`return ${m[1]};`)();
        console.log(`     pattern: ${m[1]}`);
        const took = (s) => { const r = re.exec(s); return r ? r[1] : null; };
        rec("it keeps an interior hyphen", took("\tAST_curtiss-wright_organization_idea ") === "AST_curtiss-wright_organization_idea", took("\tAST_curtiss-wright_organization_idea "));
        rec("…and a plain id is unchanged", took("\tplain_idea ") === "plain_idea", took("\tplain_idea "));
        // A leading hyphen is NOT part of the token — `-` cannot start a bareword, and a preceding
        // `= -5` on the same line must not be swallowed into the next key.
        rec("…and it does not start a token with a hyphen", took(" -leading ") === "leading", took(" -leading "));
        rec("…and it stops at a newline rather than spanning lines", took("first_key = 3\n\tsecond_key ") === "second_key", took("first_key = 3\n\tsecond_key "));
      }
    }

    console.log("\n[the corpus] the real ids this was mangling");
    {
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", GAME]];
      try {
        for (const d of fs.readdirSync(WS)) {
          let nm = ""; try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
          if (nm) roots.push([nm.slice(0, 28), path.join(WS, d)]);
        }
      } catch (_) {}
      let total = 0; const seen = [];
      for (const [, root] of roots) {
        let files = []; try { files = fs.readdirSync(path.join(root, "common", "ideas")).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
        for (const f of files) {
          let t = ""; try { t = fs.readFileSync(path.join(root, "common", "ideas", f), "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
          for (const mm of t.matchAll(/(^|\n)[ \t]*([A-Za-z_][A-Za-z0-9_]*-[A-Za-z0-9_-]*)[ \t]*=[ \t]*\{/g)) {
            total++; if (seen.length < 3) seen.push(mm[2]);
          }
        }
      }
      console.log(`     hyphenated idea ids across the installed corpus: ${total}${seen.length ? "  e.g. " + seen.join(", ") : ""}`);
      rec("the corpus really contains hyphenated ids", total > 0, total);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== idea id interior hyphen: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
