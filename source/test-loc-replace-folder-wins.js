// #loc-replace-folder-loses-to-alphabet — `localisation/<lang>/replace/` LOST TO THE ALPHABET.
//
// HOI4 applies a root's replace/ folder AFTER its ordinary .yml files, so those keys win — that is the
// folder's entire purpose. Both of Nova's collectors ended with a plain `out.sort()` over absolute paths,
// and getLocalizationMap Object.assigns in file order, so "replace/" simply landed where the alphabet put
// it and EVERY plain file whose name sorts after the letters "replace" overwrote it.
//
// Measured over the installed corpus, English files only (the ones Nova reads):
//
//   Rise of Nations   852 keys stolen — research_l_english.yml and ron_ideas_l_english.yml beat replace/
//   Millennium Dawn    21, including support_folder / armour_folder / naval_folder, which are the research
//                      folder names Nova's own Research maker puts on screen
//   The Road to 56     10
//   Old World Blues     0 — nothing in it sorts after "replace", which is why this stayed invisible
//
// ⚠️ A first pass at this measurement counted 852 for RoN and 21 for MD from files in OTHER LANGUAGES
// (_l_russian losing to _l_spanish), which Nova never loads. Restricting to English gave the same headline
// numbers for a different and correct reason. A probe that reads more than the code reads invents evidence
// just as readily as one that reads less.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locrepl-"));
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
const MOD = path.join(ROOT, "locmod");
const ENG = path.join(MOD, "localisation", "english");
fs.mkdirSync(path.join(ENG, "replace"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "locmod.mod"), 'name="LocMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

// The contested keys are COUNTRY names, so the assertion runs through the country catalogue — what a
// picker really puts on screen — rather than through a source grep.
fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz_nova.txt"),
  'NVA = "countries/Nva.txt"\nNVB = "countries/Nvb.txt"\nNVC = "countries/Nvc.txt"\n');
for (const t of ["Nva", "Nvb", "Nvc"]) fs.writeFileSync(path.join(MOD, "common", "countries", t + ".txt"), "graphical_culture = western_european_gfx\n");

// …and a DECISION whose display name is the contested key, because decision names resolve through
// the sorted collector this fix changed (the country path below has its own walk).
fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "common", "decisions", "zz_nova.txt"),
  "nova_repl_category = {\n\tnova_repl_decision = {\n\t\tcost = 10\n\t}\n}\n");

// The discriminating fixture: a plain file whose name sorts AFTER "replace" (z…) defining the same key as
// a replace/ file. Under a plain path sort the z file wins, which is backwards.
fs.writeFileSync(path.join(ENG, "zz_plain_l_english.yml"),
  "﻿l_english:\n NVA:0 \"FROM THE PLAIN FILE\"\n NVC:0 \"plain only\"\n nova_repl_decision:0 \"FROM THE PLAIN FILE\"\n", "utf8");
// …and one sorting BEFORE "replace" (a…), so the test also proves replace/ beats what it already beat.
fs.writeFileSync(path.join(ENG, "aa_plain_l_english.yml"),
  "﻿l_english:\n NVB:0 \"FROM THE EARLY FILE\"\n", "utf8");
fs.writeFileSync(path.join(ENG, "replace", "nova_replace_l_english.yml"),
  "﻿l_english:\n NVA:0 \"FROM REPLACE\"\n NVB:0 \"FROM REPLACE\"\n nova_repl_decision:0 \"FROM REPLACE\"\n", "utf8");

const PORT = 53031;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const nameOf = async (key) => {
      const j = await fetch(`http://127.0.0.1:${PORT}/api/localization/status?modPath=${encodeURIComponent(MOD)}`)
        .then((r) => r.json()).catch(() => null);
      return j;
    };

    console.log("\n[the fixture] must actually contain the conflict being measured");
    {
      const plain = fs.readFileSync(path.join(ENG, "zz_plain_l_english.yml"), "utf8");
      const repl = fs.readFileSync(path.join(ENG, "replace", "nova_replace_l_english.yml"), "utf8");
      rec("both files define the contested key", /NVA:/.test(plain) && /NVA:/.test(repl), "fixture broken");
      // …and the plain one really does sort after "replace", or this measures nothing.
      const sorted = [path.join(ENG, "zz_plain_l_english.yml"), path.join(ENG, "replace", "nova_replace_l_english.yml")].sort();
      rec("…and the plain file sorts AFTER replace/, which is the whole problem",
        sorted[1].includes("zz_plain"), sorted.map((s) => path.basename(s)));
    }

    console.log("\n[⭐ THE PATH THAT WAS ACTUALLY BROKEN] decision names go through the sorted collector");
    {
      // ⚠️ AIM THE CHECK AT THE CODE THAT CHANGED. The country-catalogue check below passes either way:
      // getCountryLocNames has its OWN walk (collectFilesRecursively, a stack-based DFS) in which a
      // subdirectory's files happen to come after its parent's, so replace/ won there by accident of
      // traversal order and backing the fix out did not move it. Decision names resolve through
      // loadDecisionLocalizations -> collectEnglishLocalizationYmlFilesUnderMod, which is the sorted
      // collector this fix is about — so THIS is the check that bites.
      const j = await fetch(`http://127.0.0.1:${PORT}/api/decisions/list?modPath=${encodeURIComponent(MOD)}`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const decs = ((j && j.categories) || []).flatMap((c) => c.decisions || []);
      const mine = decs.find((d) => d && d.id === "nova_repl_decision");
      console.log(`     ${decs.length} decisions · nova_repl_decision name = ${JSON.stringify(mine && mine.name)}`);
      rec("the fixture decision is read back at all", !!mine, decs.map((d) => d.id).slice(0, 5));
      rec("its name comes from replace/, not from the later-sorting plain file",
        mine && String(mine.name) === "FROM REPLACE", mine && mine.name);
    }

    console.log("\n[a second path] the country catalogue resolves names its own way, and must also agree");
    {
      // Through a real user-visible path rather than a source grep: the contested keys ARE country names,
      // so this is exactly what the country picker puts on screen. A structural check would have passed on
      // a fix that reordered the list and never reached the resolver.
      const j = await fetch(`http://127.0.0.1:${PORT}/api/countries/catalog?modPath=${encodeURIComponent(MOD)}&withNames=1`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const rows = Array.isArray(j) ? j : ((j && (j.countries || j.items)) || []);
      const nameOf = (tag) => {
        const r = rows.find((c) => String(c.tag || "").toUpperCase() === tag);
        return r ? String(r.displayName || r.localizedName || r.name || "") : "";
      };
      console.log(`     ${rows.length} countries · NVA=${JSON.stringify(nameOf("NVA"))} · NVB=${JSON.stringify(nameOf("NVB"))} · NVC=${JSON.stringify(nameOf("NVC"))}`);
      rec("the fixture's countries are in the catalogue at all", rows.length >= 3, rows.length);
      // THE BUG: zz_plain_l_english.yml sorts after replace/, so it won and the name read "FROM THE PLAIN FILE".
      rec("a key defined in BOTH takes the replace/ value", nameOf("NVA") === "FROM REPLACE", nameOf("NVA"));
      rec("…including one whose plain file sorts BEFORE replace/", nameOf("NVB") === "FROM REPLACE", nameOf("NVB"));
      rec("…while a key only the plain file defines still resolves", nameOf("NVC") === "plain only", nameOf("NVC"));
    }

    console.log("\n[the mechanism] both collectors, and a path SEGMENT rather than a prefix");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const n = (sv.match(/return sortLocFilesReplaceLast\(out\);/g) || []).length;
      // A sibling pair: the sync collector and its async twin. Fixing one and not the other is this
      // codebase's most common defect, so count them.
      rec("BOTH collectors order replace/ last", n === 2, `${n} call sites`);
    }

    console.log("\n[the corpus] how many English keys the alphabet was stealing");
    {
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const walk = (dir, out) => {
        let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
        for (const x of e) {
          const f = path.join(dir, x.name);
          if (x.isDirectory()) walk(f, out);
          else if (/_l_english\.yml$/i.test(x.name)) out.push(f);
        }
        return out;
      };
      const keysOf = (f) => {
        const o = new Set();
        let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch (_) { return o; }
        for (const l of t.split(/\r?\n/)) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_.@-]*)\s*:\s*\d*\s*"/.exec(l);
          if (m) o.add(m[1]);
        }
        return o;
      };
      const isRepl = (f) => /[\\/]replace[\\/]/i.test(f);
      let roots = [["vanilla", GAME]];
      try {
        for (const d of fs.readdirSync(WS)) {
          let nm = ""; try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
          if (nm) roots.push([nm.slice(0, 28), path.join(WS, d)]);
        }
      } catch (_) {}
      let worst = 0, worstName = "", anyReplace = 0;
      for (const [label, root] of roots) {
        const files = walk(path.join(root, "localisation"), []);
        const repl = files.filter(isRepl);
        if (!repl.length) continue;
        anyReplace++;
        const sorted = [...files].sort();
        const last = Math.max(...repl.map((f) => sorted.indexOf(f)));
        const after = files.filter((f) => !isRepl(f) && sorted.indexOf(f) > last);
        const rk = new Set();
        for (const f of repl) for (const k of keysOf(f)) rk.add(k);
        let stolen = 0;
        for (const f of after) for (const k of keysOf(f)) if (rk.has(k)) stolen++;
        if (stolen > worst) { worst = stolen; worstName = label; }
        console.log(`     ${label.padEnd(30)} replace/ ${String(repl.length).padStart(3)} files · ${stolen} keys the alphabet would steal`);
      }
      if (!anyReplace) {
        console.log("     (no installed root uses a replace/ folder — corpus check skipped)");
        rec("the corpus check is skipped only for want of content", true, "skipped");
      } else {
        rec("the corpus really does use replace/ folders", anyReplace >= 2, anyReplace);
        rec("…and the problem was worth fixing", worst > 100, `worst was ${worstName} at ${worst}`);
      }
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== loc replace folder wins: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
