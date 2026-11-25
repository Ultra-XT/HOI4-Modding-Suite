// ⛔ #nova-does-not-find-the-game — A MODDER WHOSE GAME NOVA CANNOT FIND, DRIVEN THROUGH THE REAL PAGES IN A REAL BROWSER.
//
// A Nova user on Discord (gemmov, 2026-11-02): Nova does not find their Hearts of Iron IV folder. The branch that answers it was
// reviewed by driving the pages in that state, and what a modder saw was not what its tests had pinned, because those tests ran
// home.js over a flat stand-in document and copied one block out of map.js (review P-P5):
//   P-P2  Home's "✓ Nova now reads the base game from …" — and "It could not remember this for next time" when the save failed —
//         were written into a line INSIDE the folder box, and the save closed the box: neither was ever on screen.
//   P-P3  the map's new "Nova could not find Hearts of Iron IV…" was replaced a moment later by the rivers overlay's 404:
//         "No rivers.bmp found for this mod — rivers overlay unavailable."
//   P-P4  the focus page offered "Copy Generic Tree", which failed with "Set your HOI4 game path, then retry."
// And there was no way to put a real server in that state: no setting turned detection off, and the hook the tests used ran in
// their own process and was undone by Home's look-again 30 s later. NOVA_TEST_GAME_DETECTION=off is that way: here a real
// `node server.js` on 54786 runs with it, app data in a temp folder, a blank mod in that folder's mods folder, and headless
// chromium opens map.html, index.html and home.html as a modder would — Home only after the 30 s look-again has had its chance.
// Every game here is a fixture under the temp folder; nothing reads this machine's registry or its real game.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST, before any child is started (the children get this process's env).
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-a-modder-with-no-game-found-sees-why-on-every-page: SKIPPED (playwright unavailable)"); process.exit(0); }

const PORT = 54786;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-no-game-pages-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const appdata = path.join(T, "appdata");
const userDir = path.join(appdata, "hoi4-user");
// The blank mod, where the launcher lists it: its folder and its .mod file in the user folder's mod\.
const MOD = path.join(userDir, "mod", "blank");
write(path.join(MOD, "descriptor.mod"), 'version="1.0"\nname="Blank"\nsupported_version="1.19.*"\n');
write(path.join(userDir, "mod", "blank.mod"), `version="1.0"\nname="Blank"\nsupported_version="1.19.*"\npath="${MOD.replace(/\\/g, "/")}"\n`);
const makeGame = (dir) => {
  write(path.join(dir, "hoi4.exe"), "MZ");
  write(path.join(dir, "launcher-settings.json"), JSON.stringify({ gameId: "hoi4", rawVersion: "v1.19.4.1", version: "v1.19.4.1" }));
  return dir;
};
const GAME = makeGame(path.join(T, "Games", "HOI4 copy"));
const GAME_TWO = makeGame(path.join(T, "Games", "HOI4 second copy"));
fs.mkdirSync(path.join(T, "root"), { recursive: true });
const CHOICE_FILE = path.join(appdata, "NovaModdingSuite", "game-folder.json");

const env = Object.assign({}, process.env, {
  PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, XDG_CONFIG_HOME: appdata, NOVA_HOME_DIR: appdata,
  HOI4_USER_DIR: userDir, NOVA_DOCUMENTS_DIR: path.join(appdata, "Documents"), HOI4_MOD_ROOT: path.join(T, "root"),
  // ⛔ the state under test: detection kept off this machine — nothing but the modder's choice (and HOI4_ROOT, unset below)
  NOVA_TEST_GAME_DETECTION: "off",
});
delete env.HOI4_ROOT;

/** Resolves once nothing the page asked for has been out for `quietMs` — its last answer is in, and whatever it did with it. */
function quiet(page, quietMs = 1500, maxMs = 45000) {
  return new Promise((resolve) => {
    const out = new Set();
    let last = Date.now();
    const on = (r) => { out.add(r); last = Date.now(); };
    const off = (r) => { out.delete(r); last = Date.now(); };
    page.on("request", on); page.on("requestfinished", off); page.on("requestfailed", off);
    const t0 = Date.now();
    const tick = setInterval(() => {
      if ((out.size === 0 && Date.now() - last >= quietMs) || Date.now() - t0 > maxMs) {
        clearInterval(tick);
        page.off("request", on); page.off("requestfinished", off); page.off("requestfailed", off);
        resolve(out.size === 0);
      }
    }, 100);
  });
}

let child = null, browser = null;
(async () => {
  try {
    child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let serverErr = "";
    child.stdout.on("data", () => {}); child.stderr.on("data", (d) => { if (serverErr.length < 20000) serverErr += d; });
    const base = `http://127.0.0.1:${PORT}`;
    let first = null;
    for (let i = 0; i < 240 && !first && child.exitCode === null; i++) {
      try { const r = await fetch(base + "/api/settings/game-folder"); if (r.ok) first = await r.json(); } catch (_) {}
      if (!first) await sleep(250);
    }
    const upAt = Date.now();
    ok(!!first, "a real `node server.js` came up", serverErr.slice(-400));
    if (!first) throw new Error("no server");

    console.log("\n1. ⭐⭐⭐ the state itself: a real server with nothing found (NOVA_TEST_GAME_DETECTION=off)");
    ok(first.found === false && first.path === "", "Home's request answers: not found, no folder", { found: first.found, path: first.path, source: first.source });

    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    // The mod the modder picked on Home, and Home's once-a-launch backup notice already read (it covers the page).
    await ctx.addInitScript((mod) => { try { localStorage.setItem("activeModPath", mod); sessionStorage.setItem("novaBackupWarnShown", "1"); } catch (_) {} }, MOD);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e && e.message || e).slice(0, 200)));
    page.on("dialog", (d) => { errors.push("dialog: " + d.message().slice(0, 200)); d.dismiss().catch(() => {}); });
    const asked = [];
    page.on("request", (r) => asked.push(r.method() + " " + r.url().replace(base, "")));

    console.log("\n2. ⭐⭐⭐ P-P3: the map page says why there is no map, and it stays said");
    let settled = quiet(page);
    await page.goto(base + "/map.html", { waitUntil: "load" });
    await page.waitForFunction(() => /could not find Hearts of Iron IV/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 30000 }).catch(() => {});
    ok(await settled, "(the page's requests are all answered)", asked.slice(-6));
    await quiet(page);
    const mapStatus = await page.evaluate(() => (document.getElementById("mapStatus") || {}).textContent || "");
    ok(/Nova could not find Hearts of Iron IV on this PC/.test(mapStatus) && /Home page \(Game folder\)/.test(mapStatus),
      "⭐⭐⭐ once everything is in, the status line still says Nova could not find the game, and where to set it", mapStatus);
    ok(!/rivers/i.test(mapStatus), "…not the rivers overlay's \"No rivers.bmp found for this mod\"", mapStatus);

    console.log("\n3. ⭐⭐⭐ P-P4: the focus page offers no copy of a base game it cannot see, and says why");
    settled = quiet(page);
    await page.goto(base + "/index.html", { waitUntil: "load" });
    await page.waitForSelector("#emptyTreeOverlay", { timeout: 45000 }).catch(() => {});
    await settled;
    const overlay = await page.evaluate(() => {
      const o = document.getElementById("emptyTreeOverlay");
      return o ? o.innerText.replace(/\s+/g, " ").trim() : "";
    });
    ok(/Empty Focus Tree/.test(overlay), "the blank mod opens on the empty focus tree card", overlay.slice(0, 200));
    const copyBtn = page.locator("#emptyFocusCreateStarterBtn");
    ok((await copyBtn.count()) === 0 || !(await copyBtn.isVisible()), "⭐⭐⭐ no \"Copy Generic Tree\" button: there is no base game's tree to copy", await copyBtn.count());
    ok(/Nova could not find Hearts of Iron IV on this PC/.test(overlay) && /Home page \(Game folder\)/.test(overlay),
      "⭐⭐ …the card says Nova could not find the game, and where to set it", overlay);
    ok(await page.locator("#emptyFocusLaunchWizardBtn").isVisible() && await page.locator("#emptyFocusLoadFileBtn").isVisible(),
      "…and the other ways to start are still offered", null);
    // The request that button made (app.js: { modPath: activeModPath }): its error names the setting, not an unknown "game path"
    const copied = await fetch(base + "/api/mod/copy-generic-focus-tree", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: MOD }) })
      .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }));
    ok(copied.status >= 400 && /could not find Hearts of Iron IV/.test(copied.d.error || "") && /Home page \(Game folder\)/.test(copied.d.error || "") && !/HOI4 game path/.test(copied.d.error || ""),
      "⭐⭐ …and the copy itself, asked anyway, says Nova could not find the game and to set it on Home", copied);

    console.log("\n4. ⭐⭐⭐ P-P5: Home, opened after its 30 s look-again could have run, still says not found — the state holds");
    const wait = 31000 - (Date.now() - upAt);
    if (wait > 0) await sleep(wait);
    settled = quiet(page);
    await page.goto(base + "/home.html", { waitUntil: "load" });
    await page.waitForFunction(() => !/looking/.test((document.getElementById("gameFolderText") || {}).textContent || "looking"), null, { timeout: 30000 }).catch(() => {});
    await settled;
    ok(Date.now() - upAt > 30000, "(more than 30 s since the server started: Home's request looked again)", Date.now() - upAt);
    const homeText = await page.locator("#gameFolderText").textContent();
    ok(/not found/.test(homeText), "⭐⭐⭐ the Game folder line says not found", homeText);
    const missing = page.locator("#gameFolderMissing");
    ok(await missing.isVisible() && /could not find Hearts of Iron IV/.test(await missing.innerText()), "⭐⭐ …and the warning is ON SCREEN (visible, not just in the document)", await missing.innerText().catch(() => ""));

    console.log("\n5. ⭐⭐⭐ P-P2: what the setting says after a save is on screen — and so is a save that could not be kept");
    await page.locator("#gameFolderSetBtn").click();
    ok(await page.locator("#gameFolderEdit").isVisible(), "the warning's button opens the folder box", null);
    await page.locator("#gameFolderInput").fill(GAME);
    await page.locator("#gameFolderSaveBtn").click();
    await page.waitForFunction(() => /^[✓✗]/.test((document.getElementById("gameFolderStatus") || {}).textContent || ""), null, { timeout: 20000 }).catch(() => {});
    const status = page.locator("#gameFolderStatus");
    const said = await status.textContent();
    ok(/^✓ Nova now reads the base game from /.test(said) && said.includes(GAME), "the folder is taken", said);
    ok(await status.isVisible(), "⭐⭐⭐ …and that line is ON SCREEN after the box closes", { visible: await status.isVisible(), boxOpen: await page.locator("#gameFolderEdit").isVisible() });
    ok((await page.locator("#gameFolderText").textContent()).includes(GAME) && !(await missing.isVisible()), "…the Game folder line names it, and the warning is gone", await page.locator("#gameFolderText").textContent());
    const saved = (() => { try { return JSON.parse(fs.readFileSync(CHOICE_FILE, "utf8")); } catch (_) { return {}; } })();
    ok(saved.path && path.resolve(saved.path).toLowerCase() === path.resolve(GAME).toLowerCase(), "…and saved in the server's app data", saved);
    // Now the save fails for good: game-folder.json is a folder (this test's own app data), so the rename over it cannot work.
    fs.rmSync(CHOICE_FILE, { force: true });
    fs.mkdirSync(path.join(CHOICE_FILE, "in the way"), { recursive: true });
    await page.locator("#gameFolderChangeBtn").click();
    await page.locator("#gameFolderInput").fill(GAME_TWO);
    await page.locator("#gameFolderSaveBtn").click();
    await page.waitForFunction(() => /could not remember|^✗/.test((document.getElementById("gameFolderStatus") || {}).textContent || ""), null, { timeout: 20000 }).catch(() => {});
    const failed = await status.textContent();
    ok(/^✓ Nova now reads the base game from /.test(failed) && failed.includes(GAME_TWO) && /could not remember this for next time/.test(failed),
      "the second folder is in use, and the line says Nova could not remember it for next time", failed);
    ok(await status.isVisible(), "⭐⭐⭐ …and THAT is on screen: a choice lost at the next start is not lost in silence", { visible: await status.isVisible() });

    console.log("\n6. nothing went wrong on the pages themselves");
    ok(errors.length === 0, "no page error and no dialog on map.html, index.html or home.html", errors);
  } catch (e) {
    fail++;
    console.log("  FAIL threw: " + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (child) child.kill(); } catch (_) {}
    for (let i = 0; i < 40 && child && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
    try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
