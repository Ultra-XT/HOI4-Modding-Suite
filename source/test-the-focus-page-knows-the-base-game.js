// ⛔ #the-focus-page-judged-the-base-game-a-mod — PICK THE BASE GAME ON HOME, OPEN FOCUS TREES: "Loaded 0 focuses." AND
// "This mod does not have a custom focus tree".
//
// public/app.js decided "is the active mod the base game?" with
//     activeModPath.toLowerCase().includes("steamapps/common/hearts of iron iv")
// in two places (the startup and checkEmptyFocusTreeOverlay). The path it is handed is the server's own spelling — /api/mods/list's
// vanilla entry and /api/root's hoi4GameRoot are path.join()ed, so on Windows they carry backslashes, and Home's "Vanilla Game
// Files" option writes exactly that into activeModPath. The test never matched there. So the page judged the game a MOD: it asked
// /api/focuses/target-files for the game folder, opened its first .txt (00_titlebar_styles.txt, which holds no focus), said
// "Loaded 0 focuses." and covered the canvas with the empty-mod card, whose Copy Generic Tree button posts the game folder as the
// mod to write into. Measured on the installed game through Home and the page (e2e round 2's L6; fix notes for the page run).
//
// The fix next door was already in the tree: Home and modhealth-crashcheck.js compare with the folder the server found the game in,
// separators and case taken out, and fall back to Steam's own shape only when the server found no game. A Steam library is not the
// test either — the game can be installed anywhere.
//
// Making the test right exposed two things the old one had hidden on Windows, both pinned below:
//   - the startup restored ANY remembered tree for "vanilla" — another mod's included — and loadFile then makes that tree's mod the
//     active mod, over the modder's pick of the base game. Any remembered tree is now restored only when no mod is chosen.
//   - with nothing of the game's own to restore, the page fell through to openStartupChoiceDialog(), which sends it to Home: the
//     answer for "no mod chosen", not for a modder who chose the base game. It now opens the tree the game gives every country with
//     none of its own (`default = yes`), as the focus page's own mod switch now does too.
//
// #a-style-file-opened-as-the-mods-tree — and the same card over a MOD: a mod's first .txt can be a title-bar style file too
// (Novum Vexillum and Old World Blues ship 00_titlebar_styles.txt, Hearts of Minecraft 00_HoM_titlebar_styles.txt), and with
// nothing remembered the startup and the mod switch opened it: "Loaded 0 focuses." under "This mod does not have a custom focus
// tree defined yet". /api/focuses/target-files now names the first file that defines a focus, and both open that one.
//
// #a-sibling-mod-is-not-under-its-prefix — and a remembered tree is "under" the chosen folder only at a folder boundary:
// isPathUnderDir was a bare prefix test, so with mod/my_mod chosen the startup reopened mod/my_mod_dev's tree and loadFile made
// my_mod_dev the active mod (driven on the page); the base game's restore goes through it too since the base game became a choice.
//
// Everything run here is lifted out of the shipped file, comments masked (testlib-strip-comments.js).
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");

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

const PUB = path.join(__dirname, "public");
const APP = maskJsComments(fs.readFileSync(path.join(PUB, "app.js"), "utf8"));
const LINES = APP.split(/\r?\n/);
// A top-level function of app.js, from its first line to the first `}` at column 0 after it.
function lift(name) {
  const at = LINES.findIndex((l) => l.startsWith(`async function ${name}(`) || l.startsWith(`function ${name}(`));
  if (at === -1) return null;
  const end = LINES.findIndex((l, i) => i > at && l === "}");
  return end === -1 ? null : LINES.slice(at, end + 1).join("\n");
}

// What the client is handed: the server builds the game folder with path.join (detectGameFolderOnThisMachine →
// P.join(lib.dir, "steamapps", "common", …)), so on Windows it is spelled with backslashes.
const GAME = path.win32.join("D:\\SteamLibrary", "steamapps", "common", "Hearts of Iron IV");
const MOD = path.win32.join("C:\\Users\\modder\\Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "my_mod");
const OTHER_TREE = path.win32.join("C:\\Users\\modder\\Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "other_mod",
  "common", "national_focus", "other.txt");
const GAME_TREE = path.win32.join(GAME, "common", "national_focus", "germany.txt");
const DEFAULT_TREE = path.win32.join(GAME, "common", "national_focus", "generic.txt");
// #a-style-file-opened-as-the-mods-tree — a mod's national_focus as target-files lists it, its title-bar style file first
const STYLE_REL = "common/national_focus/00_titlebar_styles.txt";
const TREE_REL = "common/national_focus/zz_my_tree.txt";

(async () => {
try {
  // ── 1. the question, run for real ───────────────────────────────────────────────────────────────────────────────────────
  console.log("\n1. isTheBaseGameFolder — the folder the server found, however the path is spelled");
  const helperSrc = lift("isTheBaseGameFolder");
  rec("isTheBaseGameFolder is in app.js", !!helperSrc, "not found");
  // eslint-disable-next-line no-new-func
  const judge = (gameRoot) => new Function("hoi4GameRootPath", `${helperSrc}\nreturn isTheBaseGameFolder;`)(gameRoot);
  if (helperSrc) {
  {
    const q = judge(GAME);
    rec("⭐ the game folder as the server spells it (backslashes) IS the base game", q(GAME) === true, GAME);
    rec("…with forward slashes, another case and a trailing slash too",
      q(GAME.replace(/\\/g, "/").toUpperCase() + "/") === true);
    rec("a mod stored inside the game folder is not the game", q(path.win32.join(GAME, "mod", "insider")) === false);
    rec("a folder whose name merely starts with the game's is not", q(GAME + " backup") === false);
    rec("a mod in Documents is not", q(MOD) === false);
    rec("nothing is not", q("") === false);
  }
  {
    const elsewhere = "E:\\Games\\Hearts of Iron IV (GOG)";
    const q = judge(elsewhere);
    rec("a game installed outside any Steam library is found by where the server found it", q(elsewhere) === true);
    rec("…and a Steam-shaped folder that is not the copy in use is not the base game", q(GAME) === false);
  }
  {
    const q = judge("");
    rec("no game found: Steam's own shape still answers, in either spelling", q(GAME) === true && q(GAME.replace(/\\/g, "/")) === true);
    rec("…for the folder itself only, not a mod under it", q(path.win32.join(GAME, "mod", "x")) === false);
  }
  }

  // ── 2. every page script that tests the substring normalises the separators first ────────────────────────────────────────
  console.log("\n2. every `.includes(\"steamapps/common/hearts of iron iv\")` in public/*.js is applied to a normalised path");
  const NORMALISES = '.replace(/\\\\/g, "/")';   // the text `.replace(/\\/g, "/")`
  // Every substring test in `code`: its line, the function its receiver comes out of, and whether that function turns `\` into `/`.
  function substringTests(code) {
    const out = [];
    const re = /\.includes\(\s*(["'])steamapps\/common\/hearts of iron iv\1\s*\)/gi;
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split("\n").length;
      // the receiver: NAME(...) right before `.includes`, NAME a function of the same file
      let j = m.index - 1, callee = "";
      if (code[j] === ")") {
        let d = 0;
        for (; j >= 0; j--) { if (code[j] === ")") d++; else if (code[j] === "(" && --d === 0) break; }
        const nm = /([A-Za-z_$][\w$.]*)\s*$/.exec(code.slice(Math.max(0, j - 80), j));
        callee = nm ? nm[1] : "";
      }
      let normalised = false;
      if (callee && !callee.includes(".")) {
        const def = new RegExp(`(?:function\\s+${callee}\\s*\\(|(?:const|let|var)\\s+${callee}\\s*=)`).exec(code);
        normalised = !!def && code.slice(def.index, def.index + 300).includes(NORMALISES);
      }
      out.push({ line, callee, normalised, text: code.split("\n")[line - 1].trim() });
    }
    return out;
  }
  // The scan must bite on the shape it exists for — the line app.js shipped — and pass the shape the maker pages use.
  {
    const old = substringTests('const isVanilla = !activeModPath || activeModPath.toLowerCase().includes("steamapps/common/hearts of iron iv");');
    rec("the scan flags the old app.js line (a raw path, lower-cased only)", old.length === 1 && !old[0].normalised, old);
    const good = substringTests(`function normalizePath(p) { return String(p || "")${NORMALISES}.toLowerCase(); }\n`
      + 'const v = normalizePath(mod.path).includes("steamapps/common/hearts of iron iv");');
    rec("…and passes a path put through a function that turns \\ into /", good.length === 1 && good[0].normalised, good);
  }
  const files = fs.readdirSync(PUB).filter((f) => f.endsWith(".js")).sort();
  let sites = 0;
  for (const f of files) {
    for (const t of substringTests(maskJsComments(fs.readFileSync(path.join(PUB, f), "utf8")))) {
      sites++;
      rec(`${f}:${t.line} tests a normalised path (${t.callee || "no call"}(…).includes)`, t.normalised, t.text);
    }
  }
  console.log(`     ${sites} substring test(s) across ${files.length} page scripts`);

  // ── 3. app.js asks the one question everywhere it decides "vanilla" for the active mod ────────────────────────────────────
  console.log("\n3. app.js: every vanilla decision about the active mod goes through isTheBaseGameFolder");
  const decisions = [...APP.matchAll(/\b(?:const|let)\s+(isVanilla|isBaseGame)\s*=\s*([^;\r\n]+);/g)]
    .filter((m) => /activeModPath|isBaseGame/.test(m[2]));
  rec("the decisions were found", decisions.length > 0, decisions.length);
  console.log(`     ${decisions.length} decision(s)`);
  for (const d of decisions) {
    const line = APP.slice(0, d.index).split("\n").length;
    rec(`app.js:${line} ${d[1]} = ${d[2].trim()}`,
      /isTheBaseGameFolder\(|\bisBaseGame\b/.test(d[2]) && !/\.includes\(/.test(d[2]), d[2]);
  }

  // ── 4. the startup, run for real ─────────────────────────────────────────────────────────────────────────────────────────
  console.log("\n4. the focus page's startup with the base game chosen");
  const thenAt = LINES.findIndex((l, i) => l === "  .then(async () => {" && LINES.slice(Math.max(0, i - 12), i).some((x) => x.includes("fetchRoot(),")));
  const thenEnd = thenAt === -1 ? -1 : LINES.findIndex((l, i) => i > thenAt && l === "  })");
  rec("the startup handler was found", thenAt !== -1 && thenEnd !== -1, { thenAt, thenEnd });
  const startupBody = LINES.slice(thenAt + 1, thenEnd).join("\n");
  const HELPERS = ["isPathUnderDir", "isTheBaseGameFolder", "baseGameDefaultTreePath"].map((n) => {
    const s = lift(n);
    rec(`${n} is in app.js`, !!s, "not found");
    return s || "";
  }).join("\n");

  // A stand-in for the server: the game's national_focus as /api/focuses/target-files lists it (its first .txt is the title bar
  // styles file), and its trees as /api/focus/country-trees lists them — the default one deliberately NOT first.
  function server(calls, { modFiles = [], trees = null, firstFocusFile } = {}) {
    return async (url) => {
      calls.push(String(url));
      let body = {};
      if (/\/api\/focuses\/target-files/.test(url)) {
        const q = decodeURIComponent(String(url).split("modPath=")[1] || "");
        body = { files: q.toLowerCase() === GAME.toLowerCase()
          ? ["common/national_focus/00_titlebar_styles.txt", "common/national_focus/generic.txt"] : modFiles };
        if (firstFocusFile !== undefined) body.firstFocusFile = firstFocusFile; // #a-style-file-opened-as-the-mods-tree
      } else if (/\/api\/focus\/country-trees/.test(url)) {
        body = { trees: trees || [
          { tag: "GER", file: GAME_TREE, generic: false, isDefault: false, inMod: true },
          { tag: "", file: DEFAULT_TREE, generic: true, isDefault: true, inMod: true },
        ] };
      }
      return { ok: true, json: async () => body };
    };
  }
  async function startup({ active, gameRoot = GAME, last = null, session = null, search = "", modFiles, trees, firstFocusFile }) {
    const calls = [], loads = [], status = [];
    let wentHome = 0, overlay = 0, chooser = 0;
    const store = { activeModPath: active, lastLoadedFocusFilePath: last };
    const filePathEl = { value: "" };
    const stubs = {
      hoi4GameRootPath: gameRoot,
      initSidebar: () => {},
      window: { location: { search, href: "http://127.0.0.1/index.html" + search } },
      sessionStorage: { getItem: (k) => (k === "sessionLoadedFocusFilePath" ? session : null) },
      localStorage: { getItem: (k) => (store[k] === undefined ? null : store[k]), setItem: (k, v) => { store[k] = v; } },
      fetch: server(calls, { modFiles, trees, firstFocusFile }),
      console: { error: () => {}, log: () => {} },
      setTimeout: (fn) => fn(),
      closeStartupChoiceDialog: () => {},
      openCreateTemplateDialog: () => {},
      filePathEl,
      loadFile: async () => { loads.push(filePathEl.value); },
      URL, URLSearchParams,
      history: { state: null, replaceState: () => {} },
      checkEmptyFocusTreeOverlay: () => { overlay++; },
      helpDialogEl: null,
      startupChoiceDialogEl: { open: false, showModal: () => { chooser++; } },
      showHelpOnStartup: () => {},
      openStartupChoiceDialog: () => { wentHome++; },
      setStatus: (m) => { status.push(String(m)); },
    };
    const names = Object.keys(stubs);
    // eslint-disable-next-line no-new-func
    let error = null;
    try {
      const run = new Function(...names, `${HELPERS}\nreturn (async () => {\n${startupBody}\n})();`);
      await run(...names.map((n) => stubs[n]));
    } catch (e) { error = String(e && e.message || e); }
    return { calls, loads, status, wentHome, overlay, chooser, activeAfter: store.activeModPath, error };
  }
  const askedTargetFiles = (r) => r.calls.some((u) => /target-files/.test(u));

  {
    const r = await startup({ active: GAME });
    rec("⭐ the base game, nothing remembered: the game's folder is not listed as a mod's own files", !askedTargetFiles(r), r.calls);
    rec("⭐ …it opens the tree the game gives every country (default = yes), not the folder's first .txt",
      r.loads.length === 1 && r.loads[0] === DEFAULT_TREE, r.loads);
    rec("…and stays on the page (no trip to Home), with no empty-mod card", r.wentHome === 0 && r.overlay === 0, r);
  }
  {
    const r = await startup({ active: GAME, last: OTHER_TREE });
    rec("⭐ the base game chosen, another mod's tree remembered: that tree is not opened over the choice",
      !r.loads.includes(OTHER_TREE) && r.loads[0] === DEFAULT_TREE, r.loads);
  }
  {
    const r = await startup({ active: GAME, session: OTHER_TREE });
    rec("…nor when it was this session's last tree", !r.loads.includes(OTHER_TREE), r.loads);
  }
  {
    const r = await startup({ active: GAME, last: GAME_TREE });
    rec("the base game's own remembered tree is reopened", r.loads.length === 1 && r.loads[0] === GAME_TREE, r.loads);
  }
  {
    const r = await startup({ active: GAME, trees: [{ tag: "GER", file: GAME_TREE }] });
    rec("a base game with no default tree: nothing opened, a line saying what to do, still no trip to Home",
      r.loads.length === 0 && r.wentHome === 0 && r.status.length === 1, r);
  }
  {
    const r = await startup({ active: GAME, search: "?e2e=1" });
    rec("the e2e start (?e2e=1) still shows the start choices for the base game", r.chooser === 1 && r.loads.length === 0, r);
  }
  // controls — what did not change
  {
    const r = await startup({ active: MOD, modFiles: ["common/national_focus/mine.txt"] });
    rec("control: a mod with trees of its own opens its first", askedTargetFiles(r)
      && r.loads.length === 1 && r.loads[0] === MOD + "/common/national_focus/mine.txt", r.loads);
  }
  {
    const r = await startup({ active: MOD, modFiles: [] });
    rec("control: a mod with none gets the empty-mod card", r.overlay === 1 && r.loads.length === 0, r);
  }
  {
    // #a-sibling-mod-is-not-under-its-prefix — a folder whose name merely starts with the chosen one's is another folder
    const sib = path.win32.join(MOD + "_dev", "common", "national_focus", "other.txt");
    const r = await startup({ active: MOD, last: sib, modFiles: ["common/national_focus/mine.txt"] });
    rec("⭐ a mod chosen, a tree remembered from a sibling whose folder name starts with its: not opened",
      !r.loads.includes(sib) && r.loads[0] === MOD + "/common/national_focus/mine.txt", r.loads);
  }
  {
    const backup = path.win32.join(GAME + " backup", "common", "national_focus", "germany.txt");
    const r = await startup({ active: GAME, session: backup });
    rec("…nor, with the base game chosen, one from a \"Hearts of Iron IV backup\" folder beside it", !r.loads.includes(backup) && r.loads[0] === DEFAULT_TREE, r.loads);
  }
  {
    const own = path.win32.join(MOD, "common", "national_focus", "mine.txt");
    const a = await startup({ active: MOD, last: own, modFiles: ["common/national_focus/mine.txt"] });
    const b = await startup({ active: MOD + "\\", session: own, modFiles: [] });
    rec("control: the chosen mod's own remembered tree is reopened, also when the chosen path ends in a slash",
      a.loads.length === 1 && a.loads[0] === own && b.loads.length === 1 && b.loads[0] === own, { a: a.loads, b: b.loads });
  }
  {
    // #a-style-file-opened-as-the-mods-tree — a mod whose first .txt is a title-bar style file (Novum Vexillum, Old World Blues)
    const r = await startup({ active: MOD, modFiles: [STYLE_REL, TREE_REL], firstFocusFile: TREE_REL });
    rec("⭐ a mod whose first .txt holds no focus: the first file that defines one opens, not the style file",
      r.loads.length === 1 && r.loads[0] === MOD + "/" + TREE_REL && r.overlay === 0, r.loads);
  }
  {
    const r = await startup({ active: MOD, last: OTHER_TREE, modFiles: [] });
    rec("control: a mod chosen, another mod's tree remembered: not opened", !r.loads.includes(OTHER_TREE), r.loads);
  }
  {
    const r = await startup({ active: "", last: OTHER_TREE });
    rec("control: no mod chosen, a remembered tree is reopened wherever it is", r.loads[0] === OTHER_TREE, r.loads);
  }
  {
    const r = await startup({ active: "" });
    rec("control: no mod chosen and nothing remembered still goes to Home", r.wentHome === 1 && r.loads.length === 0, r);
  }

  // ── 5. the focus page's own mod switch ───────────────────────────────────────────────────────────────────────────────────
  console.log("\n5. loadFirstTreeOfActiveMod — switching the focus page to the base game");
  const switchSrc = lift("loadFirstTreeOfActiveMod");
  rec("loadFirstTreeOfActiveMod is in app.js", !!switchSrc, "not found");
  async function switchTo(modPath, modFiles, firstFocusFile) {
    const calls = [], loads = [];
    let overlay = 0;
    const filePathEl = { value: "" };
    const stubs = {
      hoi4GameRootPath: GAME,
      localStorage: { getItem: (k) => (k === "activeModPath" ? modPath : null) },
      focusEditorHasUnsavedWork: () => false,
      confirm: () => true,
      fetch: server(calls, { modFiles, firstFocusFile }),
      loadInFlight: false,
      setTimeout: (fn) => fn(),
      filePathEl,
      loadFile: async () => { loads.push(filePathEl.value); },
      checkEmptyFocusTreeOverlay: () => { overlay++; },
      setStatus: () => {},
    };
    const names = Object.keys(stubs);
    // eslint-disable-next-line no-new-func
    let error = null;
    try {
      const run = new Function(...names, `let focusModSwitchGen = 0;\n${HELPERS}\n${switchSrc}\nreturn loadFirstTreeOfActiveMod();`);
      await run(...names.map((n) => stubs[n]));
    } catch (e) { error = String(e && e.message || e); }
    return { calls, loads, overlay, error };
  }
  {
    const r = await switchTo(GAME);
    rec("⭐ to the base game: its default tree opens, not 00_titlebar_styles.txt",
      !askedTargetFiles(r) && r.loads.length === 1 && r.loads[0] === DEFAULT_TREE, r);
  }
  {
    const r = await switchTo(MOD, ["common/national_focus/mine.txt"]);
    rec("control: to a mod: its first tree opens", askedTargetFiles(r) && r.loads[0] === MOD + "/common/national_focus/mine.txt", r);
  }
  {
    const r = await switchTo(MOD, []);
    rec("control: to a mod with none: the empty-mod card", r.overlay === 1 && r.loads.length === 0, r);
  }
  {
    const r = await switchTo(MOD, [STYLE_REL, TREE_REL], TREE_REL);
    rec("⭐ to a mod whose first .txt holds no focus: the first file that defines one opens", r.loads.length === 1 && r.loads[0] === MOD + "/" + TREE_REL, r);
  }

  // ── 6. the empty-mod card ────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\n6. checkEmptyFocusTreeOverlay — no empty-mod card over the base game");
  const overlaySrc = lift("checkEmptyFocusTreeOverlay");
  rec("checkEmptyFocusTreeOverlay is in app.js", !!overlaySrc, "not found");
  function card(active) {
    const appended = [];
    const container = { style: {}, appendChild: (n) => appended.push(n) };
    const el = { addEventListener: () => {} };
    const stubs = {
      hoi4GameRootPath: GAME,
      hoi4GameFound: true,
      loadedPath: "",
      parsed: null,
      localStorage: { getItem: (k) => (k === "activeModPath" ? active : null) },
      document: {
        querySelector: (s) => (s === ".canvas-scroll" ? container : null),
        getElementById: (id) => (id === "emptyTreeOverlay" || id === "emptyFocusCancelBtn" ? null : el),
        createElement: () => ({}),
      },
    };
    const names = Object.keys(stubs);
    // eslint-disable-next-line no-new-func
    try {
      new Function(...names, `${HELPERS}\n${overlaySrc}\ncheckEmptyFocusTreeOverlay();`)(...names.map((n) => stubs[n]));
    } catch (e) { return "harness: " + String(e && e.message || e); }
    return appended.length;
  }
  rec("⭐ the base game (as the server spells it) with no tree open: no \"This mod does not have a custom focus tree\"", card(GAME) === 0);
  rec("control: a mod with no tree open: the card", card(MOD) === 1);

  // ── 7. #a-style-file-opened-as-the-mods-tree — the server names the first file that defines a focus ──────────────────────
  console.log("\n7. /api/focuses/target-files names the first of a mod's files that defines a focus");
  {
    const SRV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const SL = SRV.split(/\r?\n/);
    const at = SL.findIndex((l) => l.startsWith("function firstFileThatDefinesAFocus("));
    const end = at === -1 ? -1 : SL.findIndex((l, i) => i > at && l === "}");
    rec("firstFileThatDefinesAFocus is in server.js", at !== -1 && end !== -1);
    const handlerAt = SRV.indexOf('app.get("/api/focuses/target-files"');
    const handler = handlerAt === -1 ? "" : SRV.slice(handlerAt, handlerAt + 900);
    rec("…and target-files answers with it beside every file",
      /res\.json\(\{\s*files,\s*firstFocusFile:\s*firstFileThatDefinesAFocus\(activeRoot,\s*files\)\s*\}\)/.test(handler), handler.slice(0, 300));
    if (at !== -1 && end !== -1) {
      // eslint-disable-next-line no-new-func
      const pick = new Function("fs", "path", SL.slice(at, end + 1).join("\n") + "\nreturn firstFileThatDefinesAFocus;")(fs, path);
      const os = require("os");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focus-first-file-"));
      try {
        // The style file is the base game's own when it is installed (byte for byte), else one of the same shape.
        const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
        const gameStyle = path.join(G, "common", "national_focus", "00_titlebar_styles.txt");
        const style = fs.existsSync(gameStyle) ? fs.readFileSync(gameStyle) : Buffer.from("style = {\n\tname = default_style\n\tdefault = yes\n}\n");
        const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
        put(STYLE_REL, style);
        put("common/national_focus/01_commented.txt", "# focus_tree = {\n# shared_focus = { id = x }\nstyle = { name = other_style }\n");
        put("common/national_focus/02_shared.txt", "shared_focus = {\n\tid = PRB_shared_one\n\tx = 0\n\ty = 0\n\tcost = 1\n}\n");
        put(TREE_REL, "focus_tree = {\n\tid = prb_tree\n\tfocus = {\n\t\tid = PRB_one\n\t\tx = 0\n\t\ty = 0\n\t}\n}\n");
        rec("a title-bar style file, then a tree: the tree", pick(dir, [STYLE_REL, TREE_REL]) === TREE_REL);
        rec("…a style file whose focus lines are commented out is no focus file either",
          pick(dir, [STYLE_REL, "common/national_focus/01_commented.txt", TREE_REL]) === TREE_REL);
        rec("control: a shared_focus file first opens as before (it defines focuses)",
          pick(dir, [STYLE_REL, "common/national_focus/02_shared.txt", TREE_REL]) === "common/national_focus/02_shared.txt");
        rec("a mod whose files define no focus: \"\", so the page opens the first as before and says it has no tree", pick(dir, [STYLE_REL]) === "");
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
      }
    }
  }
} catch (e) {
  rec("HARNESS", false, e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : String(e));
}

console.log(`\n=== the focus page knows the base game: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
