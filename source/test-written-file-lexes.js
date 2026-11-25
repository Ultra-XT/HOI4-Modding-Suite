// #written-file-must-lex — NOVA WROTE FILES HOI4 CANNOT READ, FROM VALUES A USER CAN TYPE.
//
// Found by expanding a mod through the real makers and then reading what landed on disk. Three of the 260
// script files Nova produced were unloadable, and each came from an unvalidated value going straight into a
// template:
//
//   common/countries/Braceonia.txt   color = { 1 2 3 } evil = yes }
//     The colour escaped its own block. More closes than opens: the file does not load.
//
//   common/countries/Hexonia.txt     color = { #961414 }
//     `#` STARTS A COMMENT in HOI4, so everything after it vanishes and the brace never closes. And a hex
//     colour is exactly what most people type — the wizard's field is a free TEXT box labelled
//     "Country Color (RGB, e.g. 120 10 50)" (index.html:1210), not a colour picker.
//
//   common/decisions/categories/00_missile_decisions_category.txt   00_missile_decisions = { … }
//     A bareword key beginning with digits. Clausewitz refuses it, so the category and every decision in it
//     disappear.
//
// In each case the guard already existed somewhere else: /api/countries/create validates the colour under
// #country-create-unvalidated, and the leading-digit rule is enforced for country tags, focus-tree ids,
// event namespaces and research folder keys. These were the callers that never adopted them.
//
// The country case is the nastier shape: the tag stays registered in common/country_tags while its
// definition file will not load, so the country exists and has nothing behind it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lex-"));
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

// Balance braces the way the game's lexer would: comments and quoted strings do not contain structure.
function braceDepth(src) {
  let out = 0, min = 0, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; } i++; continue; }
    if (c === "{") out++;
    else if (c === "}") { out--; if (out < min) min = out; }
    i++;
  }
  return { end: out, min };
}
const balanced = (src) => { const d = braceDepth(src); return d.end === 0 && d.min >= 0; };

let PORT = 52510;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));

    // The literal payload public/app.js:18110-18120 builds. `color` comes from a free TEXT input.
    const wizard = (modName, color) => post("/api/mod/create-template", {
      modName, countryName: modName.replace(/\s+/g, ""), countryTag: "W" + String(PORT).slice(-2),
      capitalStateId: 1, color, dependencies: [],
    });

    console.log("\n[the country colour] a value that would break the file is refused, not written");
    {
      // 1. brace injection — this produced `color = { 1 2 3 } evil = yes }`
      const r1 = await wizard("Braceonia Two", "1 2 3 } evil = yes");
      rec("a colour containing a brace is refused", !!(r1.b && r1.b.error), r1);
      rec("…and nothing was written for it", !fs.existsSync(path.join(ROOT, "braceonia_two")), "the mod directory exists anyway");

      // 2. a bare hex colour — `#` is a COMMENT, so this used to leave the brace open
      const r2 = await wizard("Hexonia Two", "#961414");
      rec("a hex colour is accepted", r2.s < 400 && r2.b && !r2.b.error, r2);
      const root2 = String((r2.b || {}).modRoot || "");
      const cdir = path.join(root2, "common", "countries");
      const f2 = fs.existsSync(cdir) ? fs.readdirSync(cdir).map((f) => path.join(cdir, f))[0] : "";
      const t2 = f2 ? fs.readFileSync(f2, "utf8") : "";
      console.log(`     wrote: ${JSON.stringify(t2.split("\n").find((l) => l.includes("color")) || "")}`);
      rec("…converted to numbers, not left as hex", /color\s*=\s*\{\s*150\s+20\s+20\s*\}/.test(t2), t2.slice(0, 200));
      rec("…and the file's braces balance", !!t2 && balanced(t2), { end: braceDepth(t2).end, min: braceDepth(t2).min });

      // 3. CONTROL — the ordinary value the field's own placeholder suggests must still work untouched.
      const r3 = await wizard("Plainonia", "120 10 50");
      rec("CONTROL: a plain RGB colour still works", r3.s < 400 && r3.b && !r3.b.error, r3);
      const root3 = String((r3.b || {}).modRoot || "");
      const cdir3 = path.join(root3, "common", "countries");
      const t3 = fs.existsSync(cdir3) ? fs.readFileSync(path.join(cdir3, fs.readdirSync(cdir3)[0]), "utf8") : "";
      rec("CONTROL: …written verbatim", /color\s*=\s*\{\s*120\s+10\s+50\s*\}/.test(t3), t3.slice(0, 200));
      rec("CONTROL: …and it lexes", !!t3 && balanced(t3), t3.slice(0, 200));

      // 4. out of range must not slip through the numeric shape
      const r4 = await wizard("Loudonia", "999 10 50");
      rec("a channel above 255 is refused", !!(r4.b && r4.b.error), r4);
    }

    console.log("\n[the decision category] a digit-first id is refused");
    {
      const base = await wizard("Catonia", "10 20 30");
      const mod = String((base.b || {}).modRoot || "");
      rec("the host mod exists", !!mod && fs.existsSync(mod), base);
      const cat = (categoryId) => post("/api/decisions/define-category", { modPath: mod, categoryId, icon: "GFX_decision_category_generic_political_actions" });

      const bad = await cat("00_missile_decisions");
      rec("a category id starting with digits is refused", !!(bad.b && bad.b.error), bad);
      rec("…with a message naming the rule", /letter or underscore/i.test(String((bad.b || {}).error || "")), bad.b);
      const catDir = path.join(mod, "common", "decisions", "categories");
      const wrote = fs.existsSync(catDir) ? fs.readdirSync(catDir).filter((f) => /^00_/.test(f)) : [];
      rec("…and no file was written for it", wrote.length === 0, wrote);

      // CONTROL: an ordinary category still defines, and what it writes lexes.
      const ok = await cat("missile_decisions");
      rec("CONTROL: a normal category id is accepted", ok.s < 400 && ok.b && !ok.b.error, ok);
      const files = fs.existsSync(catDir) ? fs.readdirSync(catDir) : [];
      console.log(`     category files: ${JSON.stringify(files)}`);
      rec("CONTROL: …and it wrote one", files.length >= 1, files);
      for (const f of files) {
        const t = fs.readFileSync(path.join(catDir, f), "utf8");
        rec(`CONTROL: ${f} lexes`, balanced(t), t.slice(0, 200));
        rec(`CONTROL: ${f}'s key starts with a letter`, /(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/.test(t), t.slice(0, 120));
      }
    }

    console.log("\n[everything the wizard writes] must lex");
    {
      // The front door produces a whole mod; check every script file it emits, not only the one under test.
      const r = await wizard("Wholesome Mod", "60 90 120");
      const mod = String((r.b || {}).modRoot || "");
      const files = [];
      const walk = (d) => { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else if (/\.(txt|gui)$/i.test(x.name)) files.push(p); } };
      walk(mod);
      console.log(`     ${files.length} script files written by the wizard`);
      rec("the wizard writes a real mod", files.length >= 5, files.length);
      const broken = files.filter((f) => !balanced(fs.readFileSync(f, "utf8")));
      rec("…and every one of them lexes", broken.length === 0, broken.map((f) => path.basename(f)));
      // …and no bareword key anywhere starts with a digit or dash.
      const badKeys = [];
      for (const f of files) {
        const t = fs.readFileSync(f, "utf8").replace(/#[^\n]*/g, "");
        for (const m of t.matchAll(/(?:^|\n)[ \t]*([^\s=#{}]+)[ \t]*=[ \t]*[^\s]/g)) {
          if (/^[0-9-]/.test(m[1]) && !/^\d+$/.test(m[1]) && !/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(m[1])) badKeys.push(`${path.basename(f)}: ${m[1]}`);
        }
      }
      rec("…and no bareword key starts with a digit or dash", badKeys.length === 0, badKeys.slice(0, 5));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== written file lexes: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
