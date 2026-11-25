// ⛔ #a-test-names-no-folder-of-the-users — NO E2E FILE OR TEST HELPER NAMES A FOLDER OF THE USER'S.
//
// Both runners sandbox what a test can reach — APPDATA, XDG_CONFIG_HOME, NOVA_APP_DATA_DIR, NOVA_HOME_DIR, HOI4_USER_DIR,
// NOVA_DOCUMENTS_DIR and (run-e2e.js) HOI4_MODS_ROOT all point into temp — and safe-write.js gives a bare run the same. A path a
// test SPELLS OUT goes around all of that. Measured on the e2e campaign's round 1 (2026-11-04): e2e-workflow-test.js and
// e2e-research-test.js saved their failure screenshot into a hard-coded C:\Users\<owner>\.gemini\antigravity\brain\… folder —
// another program's data, under the owner's home, outside every sandbox. And four e2e files built their mods root from the home
// folder (<home>\Documents\Paradox Interactive\Hearts of Iron IV\mod, the user's REAL mods) whenever HOI4_MODS_ROOT was unset,
// then deleted a folder inside it; two built their app-data folder the same way (<home>\AppData\Roaming). The sandbox made
// those branches dead, but a dead branch that deletes inside the user's mods is one changed default away from running.
//
//   1. what every e2e-*.js and testlib-*.js says in its CODE (comments masked) names no folder of the user's: no drive-letter
//      user path, no home path, no user folder by name (Documents, AppData, OneDrive, .config, .nova, .gemini) as a path
//      segment of a literal, and no read of where the home folder is — in any spelling: os.homedir(), os.userInfo(), and every
//      variable that names it or a folder under it (USERPROFILE, HOME, …, LOCALAPPDATA), by dot, by bracket or destructured — and
//      no write into the checkout itself. Each rule has a control that it fires, and one that it does not fire on the near-miss
//      beside it;
//   2. ⛔ #a-failed-launch-leaves-nothing — EVERY launch of Electron (Playwright's handle under either of its names) gives it a
//      profile of its own IN THAT CALL's arguments, registers that profile's removal before the launch, and awaits the launch
//      inside a try: e2e-workflow-test.js made its profile and launched before its try, so a launch that threw left the profile
//      in temp (round 1 found one there).
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

// ── 1. the rules ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Each derived from what was found (the round-1 survey and this change's rg over every e2e-*.js and testlib-*.js), and widened
// only to the same thing spelt another way. `inLiteral`: the match must lie wholly inside a string, template or regex literal
// (a path is written in one); otherwise wholly in code (a call is).
const RULES = [
  // C:\Users\<name>\… — any drive, either slash, doubled as a JS string writes it. Where every user's own files are.
  { id: "a drive-letter user path", inLiteral: true, re: /\b[A-Za-z]:(?:\\+|\/+)(?:Users|Documents and Settings)(?=\\|\/)/gi },
  // ~/…, /home/<name>/…, /Users/<name>/… at the start of a literal: the same on the systems that are not Windows.
  { id: "a home path", inLiteral: true, re: /(?<=["'`])(?:~(?=[\\/])|\/home\/[^\/"'`\s]+|\/Users\/[^\/"'`\s]+)/g },
  // A folder of the user's, or another program's, by name, as a whole path segment of a literal: what was joined onto the home
  // folder (Documents, OneDrive, AppData, .config), the store map-data.js keeps under it (.nova), and the program the
  // screenshots went into (.gemini).
  { id: "a user folder by name", inLiteral: true, re: /(?<=["'`\\\/])(?:Documents|AppData|OneDrive|\.config|\.nova|\.gemini)(?=["'`\\\/])/g },
  // …and where the home folder is, which is how every one of those was reached. ⛔ IN ANY SPELLING: round 2's review moved the two
  // screenshot folders this guard was made for to os.userInfo().homedir and process.env.LOCALAPPDATA (the owner's real
  // AppData\Local, which no runner sandboxes), and this rule, which knew only os.homedir() and the dotted names, passed both.
  // A call of homedir() or userInfo() by any name; each variable by dot, by bracket (the name inside a literal, so that rule
  // asks only that the read itself is code) or destructured. Windows reads these names in any case, so the rules do too.
  { id: "the user's home folder", inLiteral: false, re: /\bhomedir\s*\(\s*\)|\buserInfo\s*\(|\bprocess\.env\.(?:USERPROFILE|HOME|HOMEPATH|HOMEDRIVE|OneDrive|OneDriveConsumer|OneDriveCommercial|LOCALAPPDATA)\b/gi },
  { id: "the user's home folder", startsInCode: true, re: /\bprocess\.env\[\s*(["'`])(?:USERPROFILE|HOME|HOMEPATH|HOMEDRIVE|OneDrive|OneDriveConsumer|OneDriveCommercial|LOCALAPPDATA)\1\s*\]/gi },
  { id: "the user's home folder", inLiteral: false, re: /\{[^{}]*\b(?:USERPROFILE|HOME|HOMEPATH|HOMEDRIVE|OneDrive|OneDriveConsumer|OneDriveCommercial|LOCALAPPDATA)\b[^{}]*\}\s*=\s*process\.env\b/gi },
  // The checkout is the owner's folder too, and no runner sandboxes it: e2e-token-picker.js made <checkout>\scratch and wrote its
  // screenshots there on every run (round 2's review). A folder made, a file written or a screenshot saved under __dirname.
  { id: "a write into the checkout", inLiteral: false, re: /\b(?:mkdirSync|mkdir|writeFileSync|writeFile|appendFileSync|appendFile|copyFileSync|copyFile|cpSync|renameSync|createWriteStream)\(\s*path\.(?:join|resolve)\(\s*__dirname\b|\bscreenshot\(\s*\{\s*path\s*:\s*path\.(?:join|resolve)\(\s*__dirname\b/g },
];

function hitsIn(src) {
  const code = maskJsComments(src);   // comments blanked in place: offsets and lines survive
  const bare = maskJsLiterals(src);   // …and every literal's contents too: a character blanked here was inside a literal
  const out = [];
  for (const r of RULES) {
    for (const m of code.matchAll(r.re)) {
      const a = m.index, b = a + m[0].length;
      let lit = true, plain = true;
      for (let k = a; k < b; k++) { if (code[k] === " ") continue; if (bare[k] === " ") plain = false; else lit = false; }
      if (r.startsInCode ? bare[a] === " " : r.inLiteral ? !lit : !plain) continue;
      out.push({ rule: r.id, line: code.slice(0, a).split("\n").length, text: m[0] });
    }
  }
  return out;
}

// ⛔ NO ENTRIES, AND ANY THAT IS ADDED CANNOT OUTLIVE WHAT IT EXCUSES. The one there was excused e2e-full-mod.js's dead fallback
// to the home folder's Documents, which another agent's branch owned when this guard was made; the merged tree removed it
// (unset HOI4_MODS_ROOT stops that run, as it stops the other three). An entry holds its file to EXACTLY its hits — one more, or
// one of a rule it does not list, fails — and it FAILS as soon as the file has fewer, so an entry goes when its lines go.
// Shape: { "<file>": { "<rule id>": ["<matched text>", …] } }.
const ALLOWED = {};

console.log("\n-- 1. no e2e file or test helper names a folder of the user's --");
{
  // Each rule fires on what was found, and not on the near-miss beside it.
  const CASES = [
    ["a drive-letter user path", "const p = path.join('C:\\\\Users\\\\someone\\\\.gemini\\\\antigravity\\\\brain\\\\x', 'shot.png');", true],
    ["a drive-letter user path", 'const p = "C:/Users/someone/Desktop/x.png";', true],
    ["a drive-letter user path", 'const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";', false],
    ["a drive-letter user path", "// path.join('C:\\\\Users\\\\someone', 'x') in a comment", false],
    ["a home path", 'const p = "~/.nova/x";', true],
    ["a home path", 'const p = "/home/someone/mods";', true],
    ["a home path", 'const p = "/tmp/nova-x";', false],
    ["a user folder by name", 'const m = path.join(USERPROFILE, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod");', true],
    ["a user folder by name", "const b = path.join(os.homedir(), 'AppData', 'Roaming');", true],
    ["a user folder by name", "const c = path.join(os.homedir(), '.config');", true],
    ["a user folder by name", 'const g = `${home}/.gemini/brain`;', true],
    ["a user folder by name", 'console.log("the real Documents folder is unchanged");', false],
    ["a user folder by name", 'document.querySelector(".nova-combo"); const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-own-appdata-"));', false],
    ["the user's home folder", "const U = process.env.USERPROFILE || os.homedir() || '';", true],
    ["the user's home folder", "const OD = process.env.OneDrive;", true],
    ["the user's home folder", "const a = process.env.APPDATA; const t = os.tmpdir(); const s = 'os.homedir()';", false],
    // round 2's review: the two screenshot folders moved to these spellings, and the rule passed both
    ["the user's home folder", "const shot = path.join(fs.mkdtempSync(path.join(os.userInfo().homedir, 'nova-e2e-workflow-shot-')), 'x.png');", true],
    ["the user's home folder", "const shot = path.join(fs.mkdtempSync(path.join(process.env.LOCALAPPDATA, 'nova-e2e-research-shot-')), 'x.png');", true],
    ["the user's home folder", "const { homedir } = require('os'); const h = homedir();", true],
    ["the user's home folder", 'const u = process.env["USERPROFILE"];', true],
    ["the user's home folder", "const l = process.env['LocalAppData'];", true],
    ["the user's home folder", "const { USERPROFILE, APPDATA } = process.env;", true],
    ["the user's home folder", "const t = process.env.TEMP; const n = process.env.NOVA_HOME_DIR; const s = 'process.env[\"HOME\"]'; const u = 'os.userInfo()';", false],
    ["a write into the checkout", 'fs.mkdirSync(path.join(__dirname, "scratch"), { recursive: true });', true],
    ["a write into the checkout", 'await fpage.screenshot({ path: path.join(__dirname, "scratch", "token-picker-focus.png") });', true],
    ["a write into the checkout", 'const html = fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8"); fs.writeFileSync(path.join(dir, "x.txt"), html);', false],
  ];
  const wrong = CASES.filter(([rule, src, fires]) => hitsIn(src).some((h) => h.rule === rule) !== fires).map(([rule, src, fires]) => `${rule} ${fires ? "missed" : "fired on"}: ${src}`);
  rec("THE CONTROLS: each rule fires on what was found, and not on the near-miss beside it (" + CASES.length + " cases)", !wrong.length, wrong);

  const files = fs.readdirSync(__dirname).filter((f) => /^(e2e|testlib)-.*\.js$/.test(f)).sort();
  rec("the scan has the files to judge (" + files.length + " e2e/testlib files)", files.filter((f) => f.startsWith("e2e-")).length >= 50 && files.some((f) => f.startsWith("testlib-")), files.length);
  const named = [];
  const stale = [];
  for (const f of files) {
    const hits = hitsIn(fs.readFileSync(path.join(__dirname, f), "utf8"));
    const allow = ALLOWED[f];
    if (!allow) { for (const h of hits) named.push(`${f}:${h.line} [${h.rule}] ${h.text}`); continue; }
    const byRule = {};
    for (const h of hits) (byRule[h.rule] = byRule[h.rule] || []).push(h);
    for (const rule of new Set([...Object.keys(byRule), ...Object.keys(allow)])) {
      const have = (byRule[rule] || []).map((h) => h.text).sort();
      const want = (allow[rule] || []).slice().sort();
      if (JSON.stringify(have) === JSON.stringify(want)) continue;
      const extra = have.slice(); for (const w of want) { const i = extra.indexOf(w); if (i !== -1) extra.splice(i, 1); }
      if (extra.length) for (const h of (byRule[rule] || []).filter((x) => extra.includes(x.text))) named.push(`${f}:${h.line} [${h.rule}] ${h.text} (beyond its allow-list entry)`);
      else stale.push(`${f} [${rule}]: the entry excuses ${JSON.stringify(want)}, the file now has ${JSON.stringify(have)} — shrink or remove the entry`);
    }
  }
  rec("⭐⭐⭐ no e2e file or test helper names a folder of the user's", !named.length, named);
  rec("⭐ no allow-list entry outlives what its file names (an entry goes when its lines go)", !stale.length, stale);
}

console.log("\n-- 2. a file that launches Electron leaves nothing when the launch fails --");
// The matching close of the bracket at `open` in `bare` (a maskJsLiterals result, where every bracket left is code's own).
function closeOf(bare, open) {
  const o = bare[open], c = o === "{" ? "}" : o === "(" ? ")" : "]";
  let d = 0;
  for (let i = open; i < bare.length; i++) { if (bare[i] === o) d++; else if (bare[i] === c && --d === 0) return i; }
  return -1;
}
// Every launch in `src`, each judged on its own, or null when the file launches nothing. ⛔ EVERY LAUNCH, UNDER EITHER NAME, AND
// ITS OWN ARGUMENTS: this asked only for the FIRST `electron.launch(` and for a --user-data-dir anywhere in the file, so round 2's
// review wrote a launch as `_electron.launch(` — Playwright's own name for the handle, which the hijack guard already matches —
// with no profile at all (the owner's own Electron profile and single-instance lock), and it passed. Read where the launch is
// CODE (a launch named inside a string is none), as the hijack guard's launchesOf reads it.
function launchShape(src) {
  const code = maskJsComments(src), bare = maskJsLiterals(src);
  const launches = [...bare.matchAll(/\b_?electron\.launch\(/g)];
  if (!launches.length) return null;
  return launches.map((m) => {
    const L = m.index;
    const open = m.index + m[0].length - 1, close = closeOf(bare, open);
    const call = close === -1 ? "" : code.slice(open, close + 1);
    const prof = /--user-data-dir=\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(call);
    const v = prof ? prof[1] : null;
    const made = v ? code.search(new RegExp("\\b" + v.replace(/\$/g, "\\$") + "\\s*=\\s*fs\\.mkdtempSync\\(")) : -1;
    let hook = -1;
    for (const h of code.matchAll(/\bprocess\.(?:on|once)\(\s*["']exit["']\s*,/g)) {
      if (h.index > L) break;
      const hopen = code.indexOf("(", h.index);
      const hclose = closeOf(bare, hopen);
      const body = hclose === -1 ? "" : code.slice(hopen, hclose);
      if (v && new RegExp("rmSync\\(\\s*" + v.replace(/\$/g, "\\$") + "\\b").test(body)) hook = h.index;
    }
    let inTry = false;
    for (const t of bare.matchAll(/\btry\s*\{/g)) {
      const topen = bare.indexOf("{", t.index);
      const tclose = closeOf(bare, topen);
      if (topen < L && L < tclose) { inTry = true; break; }
    }
    return { profileVar: v, made, hook, launch: L, inTry, ok: !!v && made !== -1 && hook !== -1 && made < hook && hook < L && inTry };
  });
}
{
  const OLD = [
    "(async () => {",
    "  const e2eUserData = fs.mkdtempSync(path.join(os.tmpdir(), \"nova-e2e-electron-\"));",
    "  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${e2eUserData}`], cwd: __dirname });",
    "  let page;",
    "  try { page = await electronApp.firstWindow(); } catch (err) { process.exit(1); }",
    "})();",
  ].join("\n");
  const NEW = [
    "(async () => {",
    "  let electronApp = null;",
    "  try {",
    "    const e2eUserData = fs.mkdtempSync(path.join(os.tmpdir(), \"nova-e2e-electron-\"));",
    "    process.on('exit', () => { try { fs.rmSync(e2eUserData, { recursive: true, force: true }); } catch (_) {} });",
    "    electronApp = await electron.launch({ args: ['.', `--user-data-dir=${e2eUserData}`], cwd: __dirname });",
    "  } catch (err) { process.exit(1); }",
    "})();",
  ].join("\n");
  const o = (launchShape(OLD) || [])[0], n = (launchShape(NEW) || [])[0];
  rec("THE CONTROL: the shape e2e-workflow-test.js had (profile and launch before the try, no removal) is refused", !!o && !o.ok && !o.inTry && o.hook === -1, o);
  rec("THE CONTROL: …and the shape it has now is accepted", !!n && n.ok, n);
  // Round 2's review: Playwright's handle by its own name, launched with no profile. Built, not written: a file whose code names
  // that handle is one test-a-bare-test-run-stays-out-of-the-real-folders.js holds to loading safe-write.js first.
  const HANDLE = ["_", "electron"].join("");
  const BARE_PROFILE = NEW.replace("electron.launch(", HANDLE + ".launch(").replace(", `--user-data-dir=${e2eUserData}`", "");
  const u = launchShape(BARE_PROFILE) || [];
  rec("THE CONTROL: a launch spelt " + HANDLE + ".launch( with no profile of its own is found, and refused", u.length === 1 && !u[0].ok && u[0].profileVar === null, u);
  // …and each launch answers for itself: a second launch with no profile beside a first that has one, and a profile named only
  // outside the call, are both refused.
  const SECOND = NEW.replace("  } catch (err)", "    const again = await electron.launch({ args: ['.'], cwd: __dirname });\n  } catch (err)");
  const s2 = launchShape(SECOND) || [];
  rec("THE CONTROL: a second launch with no profile, beside one that has it, is refused", s2.length === 2 && s2[0].ok && !s2[1].ok, s2);
  const OUTSIDE = NEW.replace(", `--user-data-dir=${e2eUserData}`", "").replace("  let electronApp = null;", "  let electronApp = null;\n  const flag = `--user-data-dir=${e2eUserData}`;");
  const s3 = launchShape(OUTSIDE) || [];
  rec("THE CONTROL: a profile flag written outside the launch call does not count for it", s3.length === 1 && !s3[0].ok, s3);
  rec("THE CONTROL: …and a launch named only inside a string is no launch", launchShape("const s = 'electron.launch({ args: [\".\"] })';") === null);

  const files = fs.readdirSync(__dirname).filter((f) => /^(e2e|testlib)-.*\.js$/.test(f)).sort();
  const launching = files.map((f) => ({ f, s: launchShape(fs.readFileSync(path.join(__dirname, f), "utf8")) })).filter((x) => x.s);
  // e2e-research-test.js and e2e-workflow-test.js drive the real Electron shell; if the scan finds fewer, it has gone blind.
  rec("the scan found the files that launch Electron (" + launching.map((x) => x.f).join(", ") + ")", launching.length >= 2, launching.length);
  const bad = launching.flatMap((x) => x.s.filter((s) => !s.ok).map((s) => x.f + " " + JSON.stringify(s)));
  rec("⭐⭐ every launch gives Electron a profile of its own in its own arguments, registers its removal before the launch, and awaits the launch in a try", !bad.length, bad);
}

console.log("\n=== an e2e file names no folder of the user's: " + checks + " checks, " + fails.length + " failed ===");
if (fails.length) console.log("FAILED: " + fails.join(" | "));
process.exitCode = fails.length ? 1 : 0;
