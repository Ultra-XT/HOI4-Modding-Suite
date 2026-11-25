// 🌍 Roadmap item 3 — Nova's own interface language.
//
// ⭐⭐⭐ THE RULE THE WHOLE DESIGN RESTS ON: the fallback is the ENGLISH ALREADY ON THE PAGE, never the key.
// `<a data-i18n="nav.home">Home</a>` shows "Home" until ru.json defines nav.home. That is what makes a
// dictionary covering a tenth of the app safe to ship: the other nine tenths stay in working English instead
// of showing "nav.home" to someone mid-edit, and the dictionary can grow one line at a time — by anyone, in a
// JSON file, with no code change.
//
// Two things this test therefore has to prove, and they are the ones that would rot silently:
//   1. Every key referenced in the HTML either exists in the dictionary OR falls back to real English text.
//      A `data-i18n` on an EMPTY element has no fallback, so it would show the key — that is a defect.
//   2. Switching back is lossless. The runtime memoises each element's English before overwriting it; without
//      that, going ru → en → ru leaves the page stuck in whatever was applied first.
//
// And what is deliberately NOT translated: HOI4's own vocabulary. Script tokens, ids, file paths and effect
// names stay English because that is what the game's files, the wiki and every guide use — a Russian modder
// searching for why their `set_oob` did nothing needs the string they will find in the wiki.
"use strict";

const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const DIR = path.join(__dirname, "public");
const RUNTIME = fs.readFileSync(path.join(DIR, "nova-i18n.js"), "utf8");

// Every page carrying the suite nav — derived from disk, so a new maker page cannot quietly be left out.
const pages = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".html")) continue;
  if (/class="suite-nav-link/.test(fs.readFileSync(path.join(DIR, f), "utf8"))) pages.push(f);
}

console.log("\n[the runtime is on every page that has a nav to translate]");
rec(`${pages.length} pages carry the suite nav`, pages.length >= 10, pages);
for (const f of pages) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  rec(`${f}: loads nova-i18n.js`, /nova-i18n\.js/.test(src), "its nav would stay English while the rest of the app switched");
  // First, so the dictionary request is in flight while the other scripts parse.
  const i18nAt = src.indexOf("nova-i18n.js");
  const firstOther = (() => {
    const re = /<script[^>]*src="\.?\/?([a-z0-9-]+\.js)/gi;
    let m;
    while ((m = re.exec(src))) if (m[1] !== "nova-i18n.js") return m.index;
    return Infinity;
  })();
  rec(`${f}: …first, before the page's own scripts`, i18nAt < firstOther, { i18nAt, firstOther });
}

console.log("\n[⭐ every key has something to fall back to]");
{
  const dict = JSON.parse(fs.readFileSync(path.join(DIR, "lang", "ru.json"), "utf8"));
  const used = new Map(); // key -> [{page, english}]
  for (const f of pages) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    // Element text keys only — the attribute variants have their own fallback in the attribute.
    for (const m of src.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)/g)) {
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push({ page: f, english: m[2].trim() });
    }
  }
  rec(`${used.size} keys are referenced across the pages`, used.size >= 12, [...used.keys()]);
  for (const [key, sites] of used) {
    const empty = sites.filter((s) => !s.english);
    rec(`${key}: carries its English in the markup`, empty.length === 0,
      `${empty.map((s) => s.page).join(", ")} would show the raw key to anyone whose dictionary lacks it`);
  }
  // The same key must mean the same thing everywhere, or one page's translation is wrong on another.
  for (const [key, sites] of used) {
    const distinct = [...new Set(sites.map((s) => s.english))];
    rec(`${key}: means the same on every page`, distinct.length === 1, distinct);
  }
  console.log(`     dictionary covers ${Object.keys(dict).filter((k) => !k.startsWith("_")).length} keys; ` +
    `${[...used.keys()].filter((k) => !(k in dict)).length} referenced keys are still untranslated (that is allowed)`);
}

console.log("\n[⭐ the dictionary is well-formed and does not translate HOI4]");
{
  const raw = fs.readFileSync(path.join(DIR, "lang", "ru.json"), "utf8");
  let dict = null;
  try { dict = JSON.parse(raw); } catch (e) { rec("ru.json parses", false, e.message); }
  if (dict) {
    rec("ru.json parses", true);
    rec("…and explains itself to whoever edits it next", typeof dict._readme === "string" && dict._readme.length > 80);
    const values = Object.entries(dict).filter(([k]) => !k.startsWith("_"));
    rec("…every value is a non-empty string", values.every(([, v]) => typeof v === "string" && v.trim()), values.filter(([, v]) => !v));
    // ⭐ The line the design draws: Nova's chrome is translated, HOI4's vocabulary is not. A dictionary value
    // that has translated a script token would produce a UI naming something the game has never heard of.
    const HOI4_TOKENS = ["set_oob", "add_equipment_to_stockpile", "national_focus", "create_equipment_variant",
      "enable_equipments", "descriptor.mod", "common/units", "history/countries"];
    const leaked = values.filter(([, v]) => HOI4_TOKENS.some((t) => v.includes(t.replace(/_/g, " "))));
    rec("…and no HOI4 script token was translated into prose", leaked.length === 0, leaked);
    rec("…while the hint says so to the user", /HOI4/.test(dict["settings.languageHint"] || ""), dict["settings.languageHint"]);
  }
}

console.log("\n[⭐ the runtime's own guarantees]");
{
  rec("the fallback is the argument, never the key",
    /return \(typeof v === "string" && v !== ""\) \? v : \(fallback === undefined \? key : fallback\);/.test(RUNTIME),
    "a missing key would render as `nav.home`");
  rec("…and the English is memoised before it is overwritten",
    /if \(el\.dataset\[memo\] === undefined\) el\.dataset\[memo\] = /.test(RUNTIME),
    "switching back to English would have nothing to restore");
  rec("a missing or broken dictionary leaves the app in English",
    /\.catch\(function \(\) \{ dict = \{\}; return dict; \}\)/.test(RUNTIME), "a 404 would blank the UI");
  rec("localStorage is read inside try/catch",
    /try \{[\s\S]{0,200}?localStorage\.getItem\(STORE_KEY\)/.test(RUNTIME), "a private window throws on the accessor itself");
  rec("…and written inside one too", /try \{ window\.localStorage\.setItem/.test(RUNTIME));
  rec("no inline handler, which the CSP kills silently", !/\son[a-z]+\s*=\s*["']/.test(RUNTIME));
  rec("the dictionary is fetched same-origin, which connect-src 'self' allows",
    /fetch\("lang\/"/.test(RUNTIME), "an absolute or remote URL would be blocked");
  rec("it parses", (() => { try { new Function(RUNTIME); return true; } catch (e) { return String(e.message); } })() === true,
    (() => { try { new Function(RUNTIME); return "ok"; } catch (e) { return String(e.message); } })());

  // ⭐ novaT(key) with NO fallback returns the key — the one way a caller can still put `nav.home` on screen.
  // Derived from the call sites rather than trusted to review: every use must pass the English second.
  const oneArg = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".js") || f === "nova-i18n.js") continue;
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    for (const m of src.matchAll(/novaT\(\s*("[^"]*"|'[^']*')\s*\)/g)) oneArg.push(`${f}: ${m[0]}`);
  }
  rec("no caller uses novaT without an English fallback", oneArg.length === 0, oneArg);
}

console.log("\n[⭐ CONTROL: the picker is built from the runtime's list, not from typed-in options]");
{
  const HOME = fs.readFileSync(path.join(DIR, "home.js"), "utf8");
  const HTML = fs.readFileSync(path.join(DIR, "home.html"), "utf8");
  rec("home.js builds the options from novaI18n.languages",
    /for \(const l of window\.novaI18n\.languages\)/.test(HOME),
    "adding a language would mean editing the HTML too, and it would be forgotten");
  rec("…and the <select> ships empty, so there is one source of truth",
    /<select id="novaLangSelect"[^>]*><\/select>/.test(HTML), "a typed-in option can disagree with the runtime");
  rec("…switching applies without a reload", /window\.novaI18n\.set\(sel\.value\)/.test(HOME));
  rec("…and the partial-translation note is hidden for English",
    /note\.hidden = window\.novaI18n\.get\(\) === "en"/.test(HOME), "an English user is told the translation is partial");
  // Every language the runtime offers must actually have a dictionary to load (except English, which is the
  // page's own text).
  const codes = [...RUNTIME.matchAll(/\{ code: "([a-z-]+)"/g)].map((m) => m[1]);
  rec(`the runtime offers ${codes.length} languages`, codes.length >= 2, codes);
  for (const c of codes) {
    if (c === "en") { rec("en needs no file — it is the text in the HTML", true); continue; }
    rec(`${c}: has a dictionary on disk`, fs.existsSync(path.join(DIR, "lang", c + ".json")),
      "the picker would offer a language that silently does nothing");
  }
}

console.log(`\n=== a partial translation is never a broken screen: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
