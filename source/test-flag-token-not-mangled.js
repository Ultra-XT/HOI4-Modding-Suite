// #flag-token-mangled — LEAVE A TOKEN THE GAME ITSELF WRITES ALONE.
//
// `sanitizeLegacyManagedEffectLines` exists to turn a flag name the GFX-flag wizard imported from a FILENAME
// into a legal token — hence the image-extension strip on its first line. But it ran on every flag line, and
// its `[^A-Za-z0-9_] -> _` rule is far narrower than what HOI4 accepts. Saving a focus rewrote
// `set_country_flag = embargo@PREV` to `embargo_PREV`, which is a DIFFERENT flag — so the matching
// `has_country_flag` never fires again and whatever the flag gated silently stops happening.
//
// `@` is dynamic-scope syntax and the corpora lean on it. Measured over every common/, events/ and history/
// .txt file:
//   vanilla  100 of 8,393 scalar flag assignments contain '@'  (also '.' ×11)
//   MD       258 of 14,122                                      (also '[' ']' ×50 each, '-' ×14, '.' ×40)
// `warlord_supports_@ROOT`, `NOR_already_asked_a_fascist@PREV`, `FC_with_@FROM`, `integrated_@ROOT`.
//
// This was invisible until #focus-effect-adopted-twice was fixed: the duplicate the old code left in the
// body still carried the un-mangled form, so the game saw a correct copy. Removing the duplicate exposed it —
// a fix uncovering a pre-existing bug that had been masked, which is the honest reason it is being fixed now
// rather than earlier.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

// public/app.js is browser code — load it in a DOM-stubbed VM, the same way the other focus tests do.
const noop = () => {};
function loadApp(src) {
  const el = new Proxy({}, { get: (t, k) => {
    if (k === "style") return new Proxy({}, { get: () => "", set: () => true });
    if (k === "classList") return { add: noop, remove: noop, toggle: noop, contains: () => false };
    if (k === "dataset") return {};
    if (k === "children" || k === "options") return [];
    if (k === "querySelectorAll") return () => [];
    if (k === "getBoundingClientRect") return () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 });
    if (typeof k === "string" && /^(addEventListener|removeEventListener|appendChild|remove|focus|blur|click|setAttribute|dispatchEvent|insertBefore|replaceChildren|scrollTo)$/.test(k)) return noop;
    if (k === "querySelector" || k === "closest") return () => null;
    return "";
  }, set: () => true });
  const documentStub = new Proxy({}, { get: (t, k) => {
    if (k === "getElementById" || k === "querySelector") return () => null;
    if (k === "querySelectorAll") return () => [];
    if (k === "createElement") return () => el;
    if (k === "addEventListener") return noop;
    if (k === "body" || k === "documentElement" || k === "head") return el;
    if (k === "readyState") return "loading";
    return undefined;
  }, set: () => true });
  const sb = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    requestAnimationFrame: noop, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: documentStub, navigator: { userAgent: "node", clipboard: {} },
    location: { href: "http://localhost/", search: "" },
    alert: noop, prompt: () => null, confirm: () => false, performance: { now: () => 0 },
    addEventListener: noop, removeEventListener: noop,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  let err = "";
  try { vm.runInContext(src, sb, { filename: "app.js" }); } catch (e) { err = String(e && e.message); }
  return { sb, err };
}

const APP_PATH = path.join(__dirname, "public", "app.js");
const { sb, err } = loadApp(fs.readFileSync(APP_PATH, "utf8"));

const CORPORA = {
  vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
  MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
};
function walkTxt(dir, out = []) {
  let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const f of e) { const p = path.join(dir, f.name); if (f.isDirectory()) walkTxt(p, out); else if (f.name.toLowerCase().endsWith(".txt")) out.push(p); }
  return out;
}
const FLAG_RE = /\b(?:set_country_flag|clr_country_flag|set_global_flag|clr_global_flag)\s*=\s*([^\s{}=]+)/g;

(async () => {
  try {
    rec("public/app.js loads in the VM", !err, err);
    rec("…and exposes the sanitiser", typeof sb.sanitizeLegacyManagedEffectLines === "function",
      typeof sb.sanitizeLegacyManagedEffectLines);
    if (typeof sb.sanitizeLegacyManagedEffectLines !== "function") throw new Error("cannot reach the function under test");
    const san = (line) => sb.sanitizeLegacyManagedEffectLines([line], "focus_x")[0];

    console.log("\n[dynamic scope] the '@' forms the game itself writes must survive verbatim");
    for (const tok of ["embargo@PREV", "warlord_supports_@ROOT", "NOR_already_asked_a_fascist@PREV",
                       "FC_with_@FROM", "integrated_@ROOT", "negotiating_dreadnought_purchase_flag@ROOT"]) {
      rec(`set_country_flag = ${tok}`, san(`set_country_flag = ${tok}`) === `set_country_flag = ${tok}`,
        san(`set_country_flag = ${tok}`));
    }
    rec("clr_country_flag too", san("clr_country_flag = embargo@PREV") === "clr_country_flag = embargo@PREV",
      san("clr_country_flag = embargo@PREV"));
    rec("and the global variants", san("set_global_flag = x@ROOT") === "set_global_flag = x@ROOT",
      san("set_global_flag = x@ROOT"));

    console.log("\n[the other characters the corpora use]");
    for (const tok of ["some.flag", "some-flag", "var_[ROOT.GetName]", "plain_flag"]) {
      rec(`${tok} is left alone`, san(`set_country_flag = ${tok}`) === `set_country_flag = ${tok}`,
        san(`set_country_flag = ${tok}`));
    }

    console.log("\n[what the sanitiser is FOR] a filename still becomes a legal token");
    rec("an image extension is stripped",
      san("set_country_flag = my_flag.tga") === "set_country_flag = my_flag", san("set_country_flag = my_flag.tga"));
    // NB: the token is written inline here rather than built with .replace(" ", "_") — String.replace with a
    // string needle replaces only the FIRST match, which in "set_country_flag = …" is the space after the
    // command name, quietly producing a line the sanitiser does not even recognise as a flag assignment.
    rec("…and a genuinely illegal character is still replaced",
      san("set_country_flag = my_flag(2).dds") === "set_country_flag = my_flag_2", san("set_country_flag = my_flag(2).dds"));
    rec("…without emptying the token entirely", /=\s*\S/.test(san("set_country_flag = %%%.tga")), san("set_country_flag = %%%.tga"));

    console.log("\n[ground truth] measured over both corpora, not assumed");
    for (const [name, root] of Object.entries(CORPORA)) {
      if (!fs.existsSync(root)) { console.log(`  --   ${name} not installed; skipping`); continue; }
      let total = 0, withAt = 0;
      for (const sub of ["common", "events", "history"]) {
        for (const f of walkTxt(path.join(root, sub))) {
          let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
          if (!/_country_flag|_global_flag/.test(t)) continue;
          for (const m of t.replace(/#.*$/gm, "").matchAll(FLAG_RE)) { total++; if (m[1].includes("@")) withAt++; }
        }
      }
      rec(`${name} uses '@' in flag tokens, so mangling it is not a theoretical harm`, withAt > 0, { withAt, total });
      console.log(`  --   ${name}: ${withAt} of ${total} scalar flag assignments contain '@'`);
    }

    console.log("\n[the whole save path] a real focus tree keeps its dynamic flags");
    {
      const V = path.join(CORPORA.MD, "common", "national_focus");
      const at = (t) => (t.match(/\b(?:set_country_flag|clr_country_flag|set_global_flag|clr_global_flag)\s*=\s*[^\s{}=]*@[^\s{}=]*/g) || []).length;
      if (fs.existsSync(V) && typeof sb.parseFocuses === "function" && typeof sb.rewriteCoordinates === "function") {
        let before = 0, after = 0, files = 0;
        for (const f of fs.readdirSync(V)) {
          if (!f.toLowerCase().endsWith(".txt")) continue;
          const text = fs.readFileSync(path.join(V, f), "utf8");
          const b = at(text); if (!b) continue;
          let out = null;
          try { const p = sb.parseFocuses(text); if (p && p.focuses.length) { p.focuses[0].moved = true; out = sb.rewriteCoordinates(text, p); } } catch (_) { out = null; }
          if (out === null) continue;
          files++; before += b; after += at(out);
        }
        rec("every dynamic flag in the corpus survives a save", after === before, { files, before, after });
        console.log(`  --   ${files} focus files carry '@' flag tokens: ${before} before, ${after} after`);
      } else {
        console.log("  --   MD focus trees not reachable; skipping the whole-path check");
      }
    }

    console.log(`\n=== flag token not mangled: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
