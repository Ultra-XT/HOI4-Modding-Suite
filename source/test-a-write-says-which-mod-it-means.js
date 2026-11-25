// ⛔ #the-page-knows-its-mod-and-did-not-say-so — A SPIRIT ICON LANDED IN A DIFFERENT MOD.
//
// The server keeps a process-global active root and every write endpoint falls back to it when the request
// does not name a mod. That global is NOT what the page is editing:
//
//   · The Home page's mod switch writes localStorage and NOTHING ELSE — it never tells the server. Measured:
//     `activeModPath` is set in four places in public/home.js and there is no /api/load, no set-active call.
//   · The server global moves only when a focus tree is loaded (/api/load).
//   · Before anything is loaded it is ROOT, which resolves to the drive root.
//
// So a write that omits the mod goes to whatever was last LOADED — or fails with "Must select an active mod
// folder first" immediately after the user picked a mod on Home, which reads as Nova being broken.
//
// resolveLocalizationPath's own comment states the rule: "that global no longer tracks the page's mod, so an
// idea/spirit's name loc would land in the wrong mod (or get cross-contaminated between concurrent tabs).
// Callers that know their mod now pass it through." Three calls to /api/ideas/import-spirit-dds never did.
//
// ⭐ The rest of the client already obeys it, which is why this is a guard and not a campaign: every
// FormData upload appends modPath, and every JSON write names one. The check is DERIVED so the next call
// site cannot quietly be the fourth.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const { maskJsComments, stripJsComments } = require("./testlib-strip-comments.js");
const PUB = path.join(__dirname, "public");
const SRV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

// /api/mod/create writes the mod it is creating; there is no mod to name yet. That is the only exemption,
// and it carries its reason here rather than in a list somebody later forgets the point of.
const EXEMPT = new Set(["/api/mod/create"]);

console.log("\n[which endpoints can be told, and fall back when they are not]");
const eligible = new Map();
{
  const re = /app\.(post|put|delete|patch)\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(SRV)) !== null) {
    const at = m.index;
    let i = SRV.indexOf("{", at), d = 0, end = at;
    for (; i < SRV.length; i++) { if (SRV[i] === "{") d++; else if (SRV[i] === "}") { d--; if (!d) { end = i; break; } } }
    const body = SRV.slice(at, end + 1);
    if (!/safeModWrite|fs\.writeFileSync|fs\.mkdirSync|fs\.renameSync|fs\.copyFileSync|fs\.appendFileSync|fs\.unlinkSync|fs\.rmSync/.test(body)) continue;
    if (!/\bmodPath\b|\bmodRoot\b/.test(body)) continue;      // cannot be told which mod
    if (!/getActiveRoot\(\)/.test(body)) continue;            // does not fall back, so silence is safe
    eligible.set(m[2], true);
  }
  rec(`${eligible.size} write endpoints accept a mod AND fall back to the global`, eligible.size >= 15, eligible.size);
  rec("…including the one this was found on", eligible.has("/api/ideas/import-spirit-dds"), [...eligible.keys()].slice(0, 8));
}

console.log("\n[⭐ every client write to one of them names its mod]");
{
  const offenders = [];
  let calls = 0;
  for (const f of fs.readdirSync(PUB)) {
    if (!f.endsWith(".js")) continue;
    const src = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
    const re = /fetch\(\s*[`"']([^`"'$]*\/api\/[^`"'$?]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const url = m[1].replace(/^\.?\/?/, "/").replace(/\/+$/, "");
      if (!eligible.has(url) || EXEMPT.has(url)) continue;
      const win = src.slice(m.index, m.index + 900);
      if (!/method:\s*["'](POST|PUT|DELETE|PATCH)["']/i.test(win)) continue;
      calls += 1;

      const bm = /body:\s*([^,\n]+)/.exec(win);
      let expr = bm ? bm[1].trim() : "";
      // ⚠️ Trim to the EXPRESSION. Capturing to end-of-line gives "fd });", and then every FormData upload
      // looks like it names no mod — eight false positives from one greedy capture, while writing this.
      const ident = /^([A-Za-z_$][\w$]*)[\s,)};]/.exec(expr + " ");
      if (ident && !/^JSON\b/.test(expr)) expr = ident[1];

      let names = false;
      if (/^JSON\.stringify\(\s*\{/.test(expr) || /JSON\.stringify\(\s*\{/.test(win.slice(0, 400))) {
        const at = win.indexOf("JSON.stringify({");
        names = at !== -1 && /\bmod(Path|Root)\b/.test(win.slice(at, at + 400));
      }
      if (!names) {
        // JSON.stringify(payload) — a named object built above the call. Find where it was last assigned or
        // extended and read from there; `body.modPath = x` counts as much as `{ modPath: x }`.
        const jm = /^JSON\.stringify\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(expr);
        if (jm) {
          const v = jm[1];
          const before = src.slice(Math.max(0, m.index - 6000), m.index);
          const decl = new RegExp("(?:const|let|var)\\s+" + v + "\\s*=|\\b" + v + "\\s*=\\s*\\{", "g");
          let last = -1, dm;
          while ((dm = decl.exec(before)) !== null) last = dm.index;
          const scope = last === -1 ? before.slice(-2000) : before.slice(last);
          names = /\bmod(Path|Root)\b/.test(scope);
        }
      }
      if (!names && /^[A-Za-z_$][\w$]*$/.test(expr)) {
        // A FormData or a named object built above the call.
        const before = src.slice(Math.max(0, m.index - 4000), m.index);
        names = new RegExp(expr + "\\.append\\(\\s*[\"'`]mod(Path|Root)").test(before)
          || new RegExp(expr + "\\.mod(Path|Root)\\b").test(before)
          || /\bmod(Path|Root)\b/.test(before.slice(-1400));
      }
      if (!names) offenders.push(`${f} → ${url}  (body: ${expr})`);
    }
  }
  console.log(`     ${calls} client writes to those endpoints were checked`);
  rec("there are enough of them for this to mean anything", calls >= 6, calls);
  rec("⭐ every one names the mod the page is editing", offenders.length === 0,
    offenders.concat(["a write that omits it lands in whatever mod was LAST LOADED, or fails right after the user picked one"]));
}

console.log("\n[the three that were fixed]");
{
  const APP = stripJsComments(fs.readFileSync(path.join(PUB, "app.js"), "utf8"));
  const n = (APP.match(/\/api\/ideas\/import-spirit-dds/g) || []).length;
  rec(`app.js calls import-spirit-dds ${n} times`, n === 3, n);
  const withMod = (APP.match(/pictureToken:[^}]*modPath: getActiveModPath\(\)/g) || []).length;
  rec("…and all three pass the page's own mod", withMod === 3, withMod);
  rec("…using the helper that reads localStorage, which IS what the page is editing",
    /function getActiveModPath\(\)\s*\{\s*return localStorage\.getItem\("activeModPath"\)/.test(APP));
}

console.log("\n[⭐ CONTROL: the premise — Home really does not tell the server]");
{
  // If this ever changes, the whole reason the rule exists changes with it, and this test should be
  // re-thought rather than left asserting a stale motive.
  const HOME = stripJsComments(fs.readFileSync(path.join(PUB, "home.js"), "utf8"));
  rec("home.js sets activeModPath in localStorage", /localStorage\.setItem\("activeModPath"/.test(HOME));
  rec("…and tells the server nothing when the mod changes",
    !/fetch\(\s*["'`][^"'`]*\/api\/(load|set-active)/.test(HOME),
    "if Home now tells the server, the fallback may be safe and this rule needs re-deriving");
  rec("…so the server's global is only moved by /api/load", /app\.post\("\/api\/load"/.test(SRV));
}

console.log(`\n=== a write says which mod it means: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
