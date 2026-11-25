// ⛔ #nova-does-not-find-the-game — THE GAME FOLDER SETTING: WHAT A MODDER DOES WHEN NOVA CANNOT FIND THE GAME, OR FOUND THE
// WRONG COPY.
//
// Before it there was no way at all: the only override was a .env file read from __dirname, which in the packaged exe is
// inside app.asar. Now Home shows which game folder Nova uses and where it found it, says plainly when it found none and what
// that costs, and takes a pasted folder address. The server refuses a folder without hoi4.exe and says why; a good one is kept
// in Nova's app data, survives a restart and takes effect WITHOUT one — the game folder, its Workshop folder, and every cache
// that read the old game (a cache still holding the old game's content is the bug: cachedVanillaTechs had no key at all).
//
// public/home.js runs here as it runs on the page — its own initGameFolder, its own fetch — over a stand-in document, against
// this file's own server on 54781; the restart is two real `node server.js` processes on 54782 and 54783, with app data in a
// temp folder. Every game here is a fixture under the temp folder. Nothing reads or writes the real game, a mod or the registry
// beyond what server.js reads at startup to find the game (read-only).
"use strict";
// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — FIRST, before any of Nova's modules: this file's own server is told about the
// Game folder, and a choice saved in the run's one app-data folder stood in front of every other test's HOI4_ROOT. Its app data is
// its own (testlib-own-app-data.js; test-a-test-that-chooses-a-game-keeps-it-to-itself.js holds every such file to this).
require("./testlib-own-app-data.js");
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, server.js's app data (where the choice is saved) is a sandbox.
const SW = require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawn } = require("child_process");

const PORT = 54781, RESTART_PORT_1 = 54782, RESTART_PORT_2 = 54783;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

delete process.env.HOI4_ROOT;   // the choice is what this is about; HOI4_ROOT would only be asked after it anyway
const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-game-folder-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
/** A base game of the test's own: hoi4.exe, one technology, one equipment, one name — each tagged with the game's letter. */
const makeGame = (dir, tag, name, version) => {
  write(path.join(dir, "hoi4.exe"), "MZ");
  write(path.join(dir, "launcher-settings.json"), JSON.stringify({ gameId: "hoi4", rawVersion: version, version }));
  write(path.join(dir, "common", "technologies", `${tag}_tech.txt`),
    `technologies = {\n\ttech_from_game_${tag} = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n`);
  write(path.join(dir, "common", "units", "equipment", `${tag}_equipment.txt`),
    `equipments = {\n\tequip_from_game_${tag} = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = infantry\n\t}\n}\n`);
  write(path.join(dir, "localisation", "english", `${tag}_l_english.yml`), `\uFEFFl_english:\n tech_from_game_${tag}:0 "${name}"\n`);
  return dir;
};
const GAME_A = makeGame(path.join(T, "Games", "HOI4 copy A"), "a", "Alpha Tech", "v1.19.4.1-A");
const LIB_B = path.join(T, "SteamLibrary B");
const GAME_B = makeGame(path.join(LIB_B, "steamapps", "common", "Hearts of Iron IV"), "b", "Bravo Tech", "v1.19.4.1-B");
const WORKSHOP_B = path.join(LIB_B, "steamapps", "workshop", "content", "394360");
fs.mkdirSync(WORKSHOP_B, { recursive: true });
const NOT_A_GAME = path.join(T, "Not a game");
write(path.join(NOT_A_GAME, "readme.txt"), "no hoi4.exe here");
const MOD = path.join(T, "mods", "blank");
write(path.join(MOD, "descriptor.mod"), 'version="1.0"\nname="Blank"\nsupported_version="1.19.*"\n');

const S = require("./server.js");
/** The saved choice as text ("" when there is none), and parsed ({} when not): a writer that never saved it FAILS checks here,
 *  it does not stop the run at the first read (the back-out that took the save out threw ENOENT and said nothing else). */
const savedText = () => { try { return fs.readFileSync(S.GAME_FOLDER_CHOICE_FILE, "utf8"); } catch (_) { return ""; } };
const savedJson = () => { try { return JSON.parse(savedText()); } catch (_) { return {}; } };
const HOME_JS =fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");
const HOME_HTML = fs.readFileSync(path.join(__dirname, "public", "home.html"), "utf8");

/** public/home.js over a stand-in document: the page's own elements (every gameFolder* id home.html declares, `hidden` as it
 *  declares it), its own DOMContentLoaded, and its own fetch, sent to `base`. Any other element is absent, so the page's other
 *  panels stand down as they do when a page lacks them. */
function runHome(base) {
  const els = {};
  const mk = (id, hidden, text) => ({
    id, hidden, disabled: false, value: "", textContent: text || "", style: {}, _html: "", _l: {},
    classList: { toggle() {}, add() {}, remove() {} },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); if (/id="gameFolderSetBtn"/.test(this._html)) els.gameFolderSetBtn = mk("gameFolderSetBtn", false); },
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    click() { for (const fn of this._l.click || []) fn({ preventDefault() {} }); },
    focus() {}, select() {},
  });
  for (const m of HOME_HTML.matchAll(/<(\w+)\s[^>]*\bid="(gameFolder\w+)"[^>]*>([^<]*)/g)) {
    els[m[2]] = mk(m[2], /\shidden(\s|>|\/)/.test(m[0]), m[3].trim());
  }
  const docL = {};
  const sent = [];
  const store = {};
  const ctx = {
    console, setTimeout, clearTimeout, JSON, Promise, encodeURIComponent, Date,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { getElementById: (id) => els[id] || null, addEventListener: (t, fn) => { (docL[t] = docL[t] || []).push(fn); }, execCommand() {} },
    navigator: {},
    fetch: (url, opts) => { sent.push({ url, opts: opts || {} }); return fetch(base + url, opts); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(HOME_JS, ctx, { filename: "public/home.js" });
  for (const fn of docL.DOMContentLoaded || []) fn();
  return { els, sent, store };
}
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(40); } return false; };

let server = null;
const children = [];
(async () => {
  try {
    const app = S.createApp();
    server = await new Promise((res, rej) => { const s = app.listen(PORT, "127.0.0.1", () => res(s)); s.once("error", rej); });
    const base = `http://127.0.0.1:${PORT}`;
    const getReport = () => fetch(base + "/api/settings/game-folder").then((r) => r.json());
    const post = (body) => fetch(base + "/api/settings/game-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, d: await r.json() }));
    const catalog = async () => {
      const d = await fetch(`${base}/api/technologies/catalog?lite=1&modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
      const techs = (d.technologies || []).map((t) => t.id);
      const names = Object.fromEntries((d.technologies || []).map((t) => [t.id, t.name]));
      return { techs, names, equips: Object.keys(d.equipments || {}) };
    };

    console.log("\n1. ⭐⭐⭐ the setting, through public/home.js's own code: what it sends, and what the server does with it");
    const page = runHome(base);
    await until(() => !/looking/.test(page.els.gameFolderText.textContent) && page.sent.length > 0);
    ok(/^Game folder: /.test(page.els.gameFolderText.textContent), "Home says which game folder Nova uses", page.els.gameFolderText.textContent);
    page.els.gameFolderChangeBtn.click();
    ok(page.els.gameFolderEdit.hidden === false, "…Change opens the folder box", page.els.gameFolderEdit.hidden);
    page.els.gameFolderInput.value = GAME_A;
    page.els.gameFolderSaveBtn.click();
    await until(() => /^[✓✗]/.test(page.els.gameFolderStatus.textContent));
    const sentPost = page.sent.find((s) => s.opts.method === "POST");
    ok(sentPost && sentPost.url === "/api/settings/game-folder" && sentPost.opts.body === JSON.stringify({ path: GAME_A }),
      "⭐ home.js sends { path } to POST /api/settings/game-folder — the body every check below sends", sentPost && sentPost.opts);
    ok(/^✓/.test(page.els.gameFolderStatus.textContent) && page.els.gameFolderStatus.textContent.includes(GAME_A),
      "⭐⭐⭐ a folder with hoi4.exe in it is taken, and Home says Nova reads the base game from it now", page.els.gameFolderStatus.textContent);
    ok(page.els.gameFolderText.textContent.includes(GAME_A) && /You chose this folder/.test(page.els.gameFolderFrom.textContent),
      "…the line names it and says where it came from: your choice", [page.els.gameFolderText.textContent, page.els.gameFolderFrom.textContent]);
    let rep = await getReport();
    ok(rep.found && same(rep.path, GAME_A) && rep.source === "choice" && rep.version === "v1.19.4.1-A", "…and the server says the same: found, the folder, \"choice\", its version", rep);
    ok(same(S.constants.resolveHoi4GameRoot(), GAME_A) && same(S.constants.GAME_ROOT, GAME_A), "⭐⭐ in effect at once: resolveHoi4GameRoot and GAME_ROOT are the chosen folder, no restart", [S.constants.resolveHoi4GameRoot(), S.constants.GAME_ROOT]);
    const saved = savedJson();
    ok(same(saved.path, GAME_A), "⭐ the choice is saved", saved);
    const inside = (p, dir) => path.resolve(p).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
    ok(same(path.dirname(S.GAME_FOLDER_CHOICE_FILE), SW.NOVA_APP_DATA_DIR) && !inside(S.GAME_FOLDER_CHOICE_FILE, __dirname),
      "…in Nova's app data (resolveNovaAppDataDir), never beside __dirname", { file: S.GAME_FOLDER_CHOICE_FILE, appData: SW.NOVA_APP_DATA_DIR });

    console.log("\n2. ⭐⭐⭐ a folder that is not the game is refused, says why, and changes nothing");
    const savedBefore = savedText();
    const bad = await post({ path: NOT_A_GAME });
    ok(bad.status === 400 && bad.d.ok === false && /hoi4\.exe/.test(bad.d.error || "") && (bad.d.error || "").includes(NOT_A_GAME),
      "⭐⭐⭐ no hoi4.exe in it: 400, and the reason names hoi4.exe and the folder", bad);
    ok(bad.d.found && same(bad.d.path, GAME_A), "…the answer still says which folder Nova uses: the one before", bad.d.path);
    ok(savedText() === savedBefore && same(S.constants.resolveHoi4GameRoot(), GAME_A), "…and neither the saved choice nor the folder in use moved", S.constants.resolveHoi4GameRoot());
    const none = await post({ path: path.join(T, "no such folder") });
    ok(none.status === 400 && /no folder/i.test(none.d.error || ""), "⭐ a folder that is not there is refused with that reason", none);
    const rel = await post({ path: "steamapps\\common\\Hearts of Iron IV" });
    ok(rel.status === 400 && /not a full folder address/.test(rel.d.error || ""), "⭐ a relative address is refused: it would be read against wherever Nova was started", rel);
    const noKey = await fetch(base + "/api/settings/game-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: GAME_B }) });
    ok(noKey.status === 400 && same(S.constants.resolveHoi4GameRoot(), GAME_A), "…and a body without `path` changes nothing", noKey.status);
    page.els.gameFolderInput.value = NOT_A_GAME;
    page.els.gameFolderStatus.textContent = "";
    page.els.gameFolderSaveBtn.click();
    await until(() => /^[✓✗]/.test(page.els.gameFolderStatus.textContent));
    ok(/^✗/.test(page.els.gameFolderStatus.textContent) && /hoi4\.exe/.test(page.els.gameFolderStatus.textContent), "⭐ Home shows the server's reason in the box", page.els.gameFolderStatus.textContent);

    console.log("\n3. ⭐⭐ what a modder pastes: quotes, or hoi4.exe's own address");
    let q = await post({ path: `"${GAME_A}"` });
    ok(q.status === 200 && same(q.d.path, GAME_A), "⭐ Explorer's \"Copy as path\" adds quotes: they are taken off", q);
    q = await post({ path: path.join(GAME_A, "hoi4.exe") });
    ok(q.status === 200 && same(q.d.path, GAME_A), "⭐ hoi4.exe's own address is taken as the folder it is in", q);
    // #nova-does-not-find-the-game (review D-F1) — Steam installs the LINUX build on Linux: run_hoi4 and hoi4, no hoi4.exe. Nova
    // under Wine/Proton meets exactly that folder, and the setting refused it ("There is no hoi4.exe"), leaving no way in.
    const LINUX_GAME = path.join(T, "Games", "HOI4 native Linux");
    write(path.join(LINUX_GAME, "hoi4"), "\u007fELF");
    write(path.join(LINUX_GAME, "run_hoi4"), "#!/bin/sh\n\"$GAME_DIR/hoi4\" \"$@\"\n");
    q = await post({ path: LINUX_GAME });
    ok(q.status === 200 && q.d.found === true && same(q.d.path, LINUX_GAME), "⭐⭐⭐ a native Linux install (hoi4 + run_hoi4, no hoi4.exe) is taken", q);
    const rootL = await fetch(base + "/api/root").then((r) => r.json());
    ok(rootL.hoi4GameExeFound === true && same(rootL.hoi4GameRoot, LINUX_GAME), "…and /api/root says the game is found there", { hoi4GameRoot: rootL.hoi4GameRoot, found: rootL.hoi4GameExeFound });
    q = await post({ path: path.join(LINUX_GAME, "run_hoi4") });
    ok(q.status === 200 && same(q.d.path, LINUX_GAME), "…and run_hoi4's own address is taken as the folder it is in", q);
    write(path.join(T, "Games", "Only run_hoi4", "run_hoi4"), "#!/bin/sh\n");
    q = await post({ path: path.join(T, "Games", "Only run_hoi4") });
    ok(q.status === 400 && same(S.constants.resolveHoi4GameRoot(), LINUX_GAME), "control: run_hoi4 alone (a Windows install has it too) is refused, and nothing moves", q);
    q = await post({ path: GAME_A });   // back to A for what follows
    ok(q.status === 200 && same(q.d.path, GAME_A), "(back to game A)", q.d.path);

    console.log("\n4. ⭐⭐⭐ a change reaches every cache: the base game's technologies, equipment and names are the new game's");
    const a1 = await catalog();
    ok(a1.techs.includes("tech_from_game_a") && a1.equips.includes("equip_from_game_a") && a1.names.tech_from_game_a === "Alpha Tech",
      "with game A in use the research catalogue reads A (techs, equipment, names)", { techs: a1.techs.filter((t) => /game/.test(t)), equips: a1.equips.filter((e) => /game/.test(e)), name: a1.names.tech_from_game_a });
    const a2 = await catalog();   // a second read: everything below is now warm
    ok(a2.techs.join() === a1.techs.join(), "…and reads it the same way again (warm caches)", a2.techs.length);
    const toB = await post({ path: GAME_B });
    ok(toB.status === 200 && toB.d.changed === true && same(toB.d.path, GAME_B), "⭐ choosing game B: changed", toB.d);
    const b1 = await catalog();
    ok(b1.techs.includes("tech_from_game_b") && !b1.techs.includes("tech_from_game_a"), "⭐⭐⭐ the technologies are B's, and none of A's is left (cachedVanillaTechs is dropped, and keyed by the folder it read)", b1.techs.filter((t) => /game/.test(t)));
    ok(b1.equips.includes("equip_from_game_b") && !b1.equips.includes("equip_from_game_a"), "⭐⭐ the equipment is B's (cachedVanillaEquips too)", b1.equips.filter((e) => /game/.test(e)));
    ok(b1.names.tech_from_game_b === "Bravo Tech", "⭐ the names are read from B's localisation", b1.names.tech_from_game_b);
    ok(same(S.constants.WORKSHOP_ROOT, WORKSHOP_B), "⭐⭐ WORKSHOP_ROOT follows the library that holds the game (read live from constants, as main.js reads it)", S.constants.WORKSHOP_ROOT);
    rep = await getReport();
    ok(same(rep.workshop, WORKSHOP_B), "…and Home is told it", rep.workshop);

    console.log("\n5. ⭐⭐ clearing the choice goes back to detection");
    const cleared = await post({ path: "" });
    rep = await getReport();
    ok(cleared.status === 200 && rep.choice === "" && rep.source !== "choice", "⭐⭐ { path: \"\" } clears it: the folder in use is what Nova finds by itself", rep);
    ok(savedText() !== "" && savedJson().path === "", "…and the saved choice is cleared too (the file says so, it is not just gone)", savedText());
    ok(!same(S.constants.resolveHoi4GameRoot(), GAME_B), "…and B is no longer the folder in use", S.constants.resolveHoi4GameRoot());

    console.log("\n6. ⭐⭐⭐ NO GAME FOUND: Home says so — what is missing, what it means, how to fix it");
    S.applyGameFolderDetection({ found: null, candidates: [
      { path: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV", source: "usual", where: "a usual install folder", how: "", valid: false, reason: "there is no such folder" },
    ] });
    ok(S.hoi4GameFolderFound() === false && S.constants.resolveHoi4GameRoot() === S.NO_GAME_FOLDER, "(nothing found: the readers get NO_GAME_FOLDER, which does not exist)", S.constants.resolveHoi4GameRoot());
    const gone = runHome(base);
    await until(() => !/looking/.test(gone.els.gameFolderText.textContent) && gone.sent.length > 0);
    await until(() => gone.els.gameFolderMissing.hidden === false, 3000);
    const msg = gone.els.gameFolderMissing.innerHTML;
    ok(gone.els.gameFolderMissing.hidden === false && /could not find Hearts of Iron IV/.test(msg), "⭐⭐⭐ the not-found message is shown", msg.slice(0, 200));
    ok(/missing from every maker/.test(msg) && /cannot check your mod against it/.test(msg), "⭐⭐ …it says what that means: the base game is missing from every maker, and a mod cannot be checked against it", msg);
    ok(/id="gameFolderSetBtn"/.test(msg) && /tell Nova where the game is/i.test(msg), "⭐⭐ …and how to fix it: the setting, one click away", msg);
    ok(/Where Nova looked/.test(msg) && msg.includes("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV"), "⭐ …with the folders it looked in", msg);
    ok(/not found/.test(gone.els.gameFolderText.textContent), "…and the line itself says not found, never a folder", gone.els.gameFolderText.textContent);
    const root = await fetch(base + "/api/root").then((r) => r.json());
    ok(root.hoi4GameRoot === "" && root.hoi4GameExeFound === false, "⭐ /api/root says no game (\"\"), not NO_GAME_FOLDER", { hoi4GameRoot: root.hoi4GameRoot, found: root.hoi4GameExeFound });
    const about = await fetch(base + "/api/about").then((r) => r.json());
    ok(about.game && about.game.found === false && about.game.path === "", "⭐ /api/about (what a bug report carries) says found: false", about.game);
    const rep0 = await getReport();
    ok(rep0.found === false && rep0.path === "" && rep0.source === null, "…and the setting's own answer: found false, no path", rep0);
    gone.els.gameFolderSetBtn.click();
    ok(gone.els.gameFolderEdit.hidden === false, "⭐ the message's button opens the folder box", gone.els.gameFolderEdit.hidden);
    gone.els.gameFolderInput.value = GAME_B;
    gone.els.gameFolderSaveBtn.click();
    await until(() => /^[✓✗]/.test(gone.els.gameFolderStatus.textContent));
    ok(gone.els.gameFolderMissing.hidden === true && gone.els.gameFolderText.textContent.includes(GAME_B), "⭐⭐⭐ with a game set, the not-found message is gone and the line names the folder", [gone.els.gameFolderMissing.hidden, gone.els.gameFolderText.textContent]);
    const withGame = runHome(base);
    await until(() => !/looking/.test(withGame.els.gameFolderText.textContent) && withGame.sent.length > 0);
    await sleep(100);
    ok(withGame.els.gameFolderMissing.hidden === true && !/could not find/.test(withGame.els.gameFolderMissing.innerHTML), "⭐⭐ …and a fresh Home with a game shows no such message", withGame.els.gameFolderMissing.innerHTML);
    await post({ path: "" });

    console.log("\n6b. ⭐⭐ a save that meets a moment's lock — an antivirus scan holding game-folder.json — is waited out (review P-P2)");
    // #write-lock-gives-up-instantly: every other save in Nova waits a transient EPERM out (safe-write.js renameOverWithRetry). This
    // one was a bare renameSync, so a scan lasting a few milliseconds answered saved:false and the choice was gone at the next start.
    const realRename = fs.renameSync;
    let refused = 0;
    fs.renameSync = function (from, to) {
      if (refused < 2 && same(to, S.GAME_FOLDER_CHOICE_FILE)) { refused++; const e = new Error("EPERM: operation not permitted, rename (held by a scan)"); e.code = "EPERM"; throw e; }
      return realRename.apply(this, arguments);
    };
    let held = null;
    try { held = await post({ path: GAME_A }); } finally { fs.renameSync = realRename; }
    ok(refused === 2 && held && held.status === 200 && held.d.saved === true && same(savedJson().path, GAME_A),
      "⭐⭐ refused twice, then let through: saved, and the file names the folder", { refused, saved: held && held.d.saved, saveError: held && held.d.saveError, file: savedJson() });
    ok(!fs.readdirSync(path.dirname(S.GAME_FOLDER_CHOICE_FILE)).some((f) => /^game-folder\.json\..*\.tmp$/.test(f)), "…and no temporary file is left beside it", fs.readdirSync(path.dirname(S.GAME_FOLDER_CHOICE_FILE)));
    await post({ path: "" });

    console.log("\n7. ⭐⭐⭐ the choice survives a restart (two real `node server.js`, app data in a temp folder)");
    const appdata = path.join(T, "appdata");
    fs.mkdirSync(path.join(appdata, "hoi4-user"), { recursive: true });
    const childEnv = (port) => {
      const e = Object.assign({}, process.env, {
        PORT: String(port), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, XDG_CONFIG_HOME: appdata, NOVA_HOME_DIR: appdata,
        HOI4_USER_DIR: path.join(appdata, "hoi4-user"), NOVA_DOCUMENTS_DIR: path.join(appdata, "Documents"), HOI4_MOD_ROOT: path.join(T, "mods"),
      });
      delete e.HOI4_ROOT;
      return e;
    };
    const startChild = async (port) => {
      const c = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: __dirname, env: childEnv(port), stdio: ["ignore", "pipe", "pipe"] });
      children.push(c);
      c.stdout.on("data", () => {}); c.stderr.on("data", () => {});
      for (let i = 0; i < 160; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/api/settings/game-folder`); if (r.ok) return { c, first: await r.json() }; } catch (_) {}
        await sleep(250);
      }
      return { c, first: null };
    };
    const stop = async (c) => { try { c.kill(); } catch (_) {} for (let i = 0; i < 40 && c.exitCode === null; i++) await sleep(100); };
    const one = await startChild(RESTART_PORT_1);
    ok(!!one.first, "the first server came up", one.first);
    const set = await fetch(`http://127.0.0.1:${RESTART_PORT_1}/api/settings/game-folder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: GAME_A }) })
      .then(async (r) => ({ status: r.status, d: await r.json() }));
    ok(set.status === 200 && same(set.d.path, GAME_A) && set.d.saved === true, "…took the choice and saved it", set);
    await stop(one.c);
    const two = await startChild(RESTART_PORT_2);
    ok(two.first && two.first.found && same(two.first.path, GAME_A) && two.first.source === "choice",
      "⭐⭐⭐ a new server reads it back: the same folder, from \"choice\"", two.first);
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "game-folder.json") files.push(p); } };
    walk(appdata);
    ok(files.length === 1, "…from the one game-folder.json, in the app data it was given", files);
    await stop(two.c);
  } catch (e) {
    fail++;
    console.log("  FAIL threw: " + (e && e.stack || e));
  } finally {
    for (const c of children) { try { c.kill(); } catch (_) {} }
    try { if (server) server.close(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
