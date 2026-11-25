// #a-bare-test-run-writes-into-the-real-app-data — first, so a bare run hands the app it launches, and the mods folder
// below, a sandbox. Electron's own profile ignores APPDATA: that is the --user-data-dir of its own, further down.
require("./safe-write.js");
const { _electron: electron } = require('playwright');
const { watchApp } = require('./testlib-app-exit.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// How long to wait for a selector. Five seconds is fine against a warm app, but the FIRST launch against
// a fresh mods folder builds the icon atlas and this mod's caches, which the splash itself says "can take
// a minute or two". That is what a new contributor and a CI machine both get, so it must be waitable.
// run-e2e.js raises this; the default is unchanged for anyone running the file directly.
const E2E_TIMEOUT = Number(process.env.NOVA_E2E_CLICK_TIMEOUT_MS || 5000);

// ⛔ #a-sandboxed-launch-keeps-its-port — THE APP'S OWN SERVER ON A PORT OF THIS TEST'S OWN. main.js gave that server Nova's own
// port, passed explicitly, until it learnt NOVA_PORT: so this test took the owner's port whenever it was free, and a Nova the
// owner opened during a run had to take another. main.js keeps a port it is asked for, or refuses (stderr, exit code 1) rather
// than move, so the window below must be served from this one. A PORT constant, which run-e2e.js reads as this file's claim.
const APP_PORT = 55160;

// #e2e-leaves-the-active-mod-on-a-test-mod — PUT THE USER'S ACTIVE MOD BACK.
//
// This test creates a throwaway mod through the app's own create-mod flow, and that flow makes the SERVER
// persist it in AppData\NovaModdingSuite\active-mod.json. Nothing restored the previous value, so after a
// run the app opened pointing at `e2e_test_mod` — a mod with no dependencies. That is not cosmetic: the
// localisation map is resolved for the active mod, so a real mod's focus names stopped resolving and the
// focus tree showed every focus as its raw id. Reported from the field.
//
// Snapshot at start, restore at every exit. The file below is a sandbox's now, not the owner's: run-e2e.js hands
// this test an AppData and a mods root in temp, and run bare the guard at the top of safe-write.js (the first
// line of this file) does the same. The restore stays for an APPDATA somebody names on purpose.
// ⛔ #a-test-names-no-folder-of-the-users — only the APPDATA (XDG_CONFIG_HOME elsewhere) this process was handed, which is a
// sandbox's. It fell back to the home folder's own AppData\Roaming (~/.config) when that was unset: the owner's real one.
// Unset, nothing of this run's is there to put back.
const __ACTIVE_MOD_STATE_FILE = (() => {
  const base = process.platform === 'win32' ? process.env.APPDATA : process.env.XDG_CONFIG_HOME;
  return base ? path.join(base, 'NovaModdingSuite', 'active-mod.json') : null;
})();
const __activeModBefore = (() => {
  try { return __ACTIVE_MOD_STATE_FILE && fs.existsSync(__ACTIVE_MOD_STATE_FILE) ? fs.readFileSync(__ACTIVE_MOD_STATE_FILE, 'utf8') : null; }
  catch (_) { return null; }
})();
function restoreActiveMod() {
  if (!__ACTIVE_MOD_STATE_FILE) return;
  try {
    if (__activeModBefore === null) { try { fs.unlinkSync(__ACTIVE_MOD_STATE_FILE); } catch (_) {} return; }
    fs.writeFileSync(__ACTIVE_MOD_STATE_FILE, __activeModBefore, 'utf8');
    console.log('[cleanup] restored the previous active mod');
  } catch (e) { console.warn('[cleanup] could not restore the active mod: ' + e.message); }
}
process.on('exit', restoreActiveMod);

// ⛔ #a-step-no-user-could-take-is-not-a-pass — EVERY STEP THE TWO HELPERS BELOW COULD ONLY DO BY SCRIPT. Each falls back to
// el.value = … / el.click() when Playwright cannot act as a user would (the target hidden, covered, or not the only match), and
// the run went on as if nothing had happened: measured 2026-11-19, a save report left lying over the whole page and a focus
// page that never opened its chooser each cost a 45 s wait and were then clicked through by script. The run still goes on to
// the end, so every file below is checked, and then FAILS, naming each step a user could not have taken.
const fallbacks = [];

// Helper to fill input fields with Playwright standard or programmatic fallback
async function fillField(page, selector, value) {
  try {
    console.log(`[Fill] Waiting for selector: ${selector}`);
    await page.waitForSelector(selector, { state: 'visible', timeout: E2E_TIMEOUT });
    const loc = page.locator(selector);
    await loc.fill(value, { timeout: E2E_TIMEOUT });
    console.log(`[Fill] Successfully filled: ${selector} with "${value}"`);
  } catch (err) {
    console.warn(`[Fill Warning] Playwright standard fill failed for ${selector}, falling back to programmatic set. Error: ${err.message}`);
    fallbacks.push(`fill ${selector}: ${String(err.message).split("\n")[0]}`);
    await page.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error(`Element not found for fill: ${sel}`);
      }
    }, { sel: selector, val: value });
  }
}

// Helper to click buttons with Playwright standard or programmatic fallback
async function clickButton(page, selector) {
  try {
    console.log(`[Click] Waiting for selector: ${selector}`);
    await page.waitForSelector(selector, { state: 'visible', timeout: E2E_TIMEOUT });
    const loc = page.locator(selector);
    await loc.click({ timeout: E2E_TIMEOUT });
    console.log(`[Click] Successfully clicked: ${selector}`);
  } catch (err) {
    console.warn(`[Click Warning] Playwright standard click failed for ${selector}, falling back to programmatic click. Error: ${err.message}`);
    fallbacks.push(`click ${selector}: ${String(err.message).split("\n")[0]}`);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.click();
      } else {
        throw new Error(`Element not found for click: ${sel}`);
      }
    }, selector);
  }
}

// Special helper to select focus nodes programmatically
async function selectFocusNode(page, focusId) {
  const selector = `.node[data-focus-id="${focusId}"]`;
  console.log(`[SelectNode] Waiting for focus node selector: ${selector}`);
  await page.waitForSelector(selector, { state: 'visible', timeout: E2E_TIMEOUT });
  console.log(`[SelectNode] Selecting focus node programmatically: ${focusId}`);
  await page.evaluate((id) => {
    const el = document.querySelector(`.node[data-focus-id="${id}"]`);
    if (el) {
      if (typeof selectedIds !== 'undefined') {
        selectedIds.clear();
        selectedIds.add(id);
      }
      if (typeof applySelectionClass === 'function') {
        applySelectionClass();
      }
      if (typeof openSidebarForSelection === 'function') {
        openSidebarForSelection();
      }
    } else {
      throw new Error(`Node not found: ${id}`);
    }
  }, focusId);
  console.log(`[SelectNode] Successfully selected focus node: ${focusId}`);
}

// ⛔ #a-response-wait-outlives-its-click — A RESPONSE WAIT, HANDLED THE MOMENT IT IS MADE. Each is started before the click
// that causes the request, and Playwright gave it 30 s while that click may wait E2E_TIMEOUT (45 s under run-e2e.js) for its
// target. Measured 2026-11-19: the events-list wait ran out first, its rejection had no handler yet, and Node ended the process
// OUTSIDE the try below — no screenshot, the app left running, and its profile left behind in temp. Handled here, a rejection
// waits for the await, which throws into the try like any other failure. Matched on the path itself (/api/mod/create is not
// /api/mod/create-template), and a reply that is not 200 is named with its body: the old predicate (200 or nothing) waited out
// the clock on a 500 and said only "Timeout".
function responseTo(page, apiPath) {
  const p = page.waitForResponse((r) => new URL(r.url()).pathname === apiPath, { timeout: Math.max(60000, 2 * E2E_TIMEOUT) })
    .then(async (r) => {
      if (r.status() !== 200) throw new Error(`${apiPath} answered ${r.status()}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      return r;
    });
  p.catch(() => {});
  return p;
}

// ⛔ #a-save-report-the-test-never-closed — EACH MAKER REPORTS A SAVE IN NOVA'S OWN MODAL ("Heads up … Got it",
// nova-info-modal.js), and this test never closed one. It is not a native dialog, so page.on('dialog') below never sees it, and
// until it is closed it lies over the whole page and takes every click: measured 2026-11-19, the nav click after the spirit save
// waited out its 45 s ("<div id="novaInfoModalOverlay"> intercepts pointer events"). So read the report — a save that failed or
// fell short says so there — and close it as a user does, with any note queued behind it (loading-overlay.js shows a "Saved —
// with a note" once the screen is clear).
async function closeSaveReport(page, what, mustSay) {
  const overlay = page.locator('#novaInfoModalOverlay');
  await overlay.waitFor({ state: 'visible', timeout: E2E_TIMEOUT });
  for (let n = 1; ; n++) {
    const said = (await overlay.innerText()).replace(/\s+/g, ' ').trim();
    console.log(`[${what}] Nova's report: ${said}`);
    if (n === 1 && !mustSay.test(said)) throw new Error(`${what}: Nova's report does not say the save succeeded: ${said}`);
    await clickButton(page, '#novaInfoModalClose');
    await overlay.waitFor({ state: 'detached', timeout: E2E_TIMEOUT });
    if (n >= 4 || !(await overlay.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false))) break;
  }
}

(async () => {
  console.log("=== NOVA E2E INTEGRATION TEST WORKFLOW ===");

  // 1. Setup and Clean up potential paths
  // #e2e-writes-into-the-live-mod-folder — the run's own mods root, and no other. run-e2e.js hands this file a scratch one in
  // HOI4_MODS_ROOT, and run bare, the guard at the top of safe-write.js (this file's first line) does the same. This fell back
  // to the user's REAL Documents\Paradox Interactive\Hearts of Iron IV\mod when the variable was unset, and the loop below
  // deletes inside whatever it names. ⛔ #a-test-names-no-folder-of-the-users: unset now stops the run instead.
  const MODS_ROOT = process.env.HOI4_MODS_ROOT;
  if (!MODS_ROOT) {
    console.error("ERROR: HOI4_MODS_ROOT is not set. This test deletes and creates a mod in the mods root, and it will not reach for the real one: run it through run-e2e.js, or bare (safe-write.js's guard sets it).");
    process.exit(1);
  }
  const potentialModsDirs = [MODS_ROOT];

  console.log("Locating existing mod paths for cleanup...");
  for (const base of potentialModsDirs) {
    const modDir = path.join(base, "e2e_test_mod");
    const modDescFile = path.join(base, "e2e_test_mod.mod");
    if (fs.existsSync(modDir)) {
      console.log(`Cleaning up existing mod directory: ${modDir}`);
      fs.rmSync(modDir, { recursive: true, force: true });
    }
    if (fs.existsSync(modDescFile)) {
      console.log(`Cleaning up existing mod descriptor: ${modDescFile}`);
      fs.rmSync(modDescFile, { force: true });
    }
  }

  // 2. Launch Electron app
  console.log("Launching Electron application...");
  let electronApp = null;
  let app = null;   // watchApp(electronApp): the app's stderr, printed, and whether it is gone
  let page;
  try {
    // Its OWN Electron profile. Launched against the real one, the app restores whatever mod the user last
    // had open, auto-loads that mod's first focus tree, and never opens the startup chooser this test drives —
    // so the run passed or failed depending on the machine it was on. A throwaway user-data dir starts with no
    // persisted mod and leaves the user's own selection untouched.
    // ⛔ #a-failed-launch-leaves-nothing — made INSIDE the try, and its removal registered before the launch. Both used to come
    // before the try, so a launch that threw went out as an unhandled rejection and left this profile behind in temp.
    const e2eUserData = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-electron-"));
    process.on('exit', () => { try { fs.rmSync(e2eUserData, { recursive: true, force: true }); } catch (_) {} });
    electronApp = await electron.launch({
      args: ['.', `--user-data-dir=${e2eUserData}`],
      cwd: __dirname,
      // everything this process was handed (the run's sandbox), and the port above for the app's own server
      env: Object.assign({}, process.env, { NOVA_PORT: String(APP_PORT) }),
    });
    // ⛔ #a-refused-launch-is-not-a-skip — heard from the moment the launch resolves. main.js refuses a NOVA_PORT it cannot have
    // (stderr "Nova could not start: …", exit code 1) a second after the splash opened, and Playwright passes on neither: round
    // 2's review held this test's port, and it polled the dead splash for 240 s, printed the SKIP below with a false reason, and
    // run-e2e.js counted a skip, exit 0. Now the app's stderr is printed as it comes and its exit ends the run as a failure.
    app = watchApp(electronApp);

    console.log("Waiting for main window...");
    page = await electronApp.firstWindow();
    await page.waitForLoadState('load');
    console.log("Window loaded successfully.");

    // The first window is splash.html while the icon atlas and mod caches build — minutes on a cold
    // profile. Everything below assumes the real UI, so wait for the hand-over first. This test predates the
    // splash, which is why it was looking for a startup button on the splash screen.
    {
      const splashDeadline = Date.now() + 240000;
      while (page.url().includes('splash.html') && Date.now() < splashDeadline) {
        if (app.gone()) throw new Error(app.gone() + " — while its splash was up, before any window of its own opened");
        // Poll the APP's window list, not the splash page — the splash closes when the real window
        // opens, and waiting on it then throws "Target page has been closed".
        await new Promise((r) => setTimeout(r, 1000));
        const real = electronApp.windows().find((w) => !w.url().includes('splash.html'));
        if (real) { page = real; break; }
      }
      if (page.url().includes('splash.html')) {
        // A splash that outlived its app is not a slow cache build.
        if (app.gone()) throw new Error(app.gone() + " — while its splash was up, before any window of its own opened");
        console.log('SKIP: the app was still on splash.html after 240s — cache build did not finish.');
        await electronApp.close().catch(() => {});
        try { fs.rmSync(e2eUserData, { recursive: true, force: true }); } catch (_) {}
        return;
      }
      await page.waitForLoadState('load');
      console.log('Real window ready: ' + page.url());
      // …and served from the port this test gave the app: not the owner's, nor wherever a fallback would have put it
      if (!page.url().startsWith(`http://127.0.0.1:${APP_PORT}/`)) {
        throw new Error(`the app's window is not on the port this test gave it (${APP_PORT}): ${page.url()}`);
      }
      console.log(`The app's own server is on the port this test gave it: ${APP_PORT}`);
    }

    if (page.url().includes('home.html')) {
      console.log("Redirecting from home.html to index.html for startup dialog flow...");
      // Point the app at VANILLA before loading index.html. The startup chooser this test drives is only
      // reached when no real mod is loaded, and with nothing selected the app auto-picks the first installed
      // mod — so on any machine that has mods the chooser never opened and the test died waiting for it.
      // isVanilla accepts the vanilla install path, which is exactly the state a vanilla-only user is in.
      // ⛔ #vanilla-with-backslashes-is-a-mod-to-the-focus-page — with forward slashes. The focus page's vanilla test looks for
      // "steamapps/common/hearts of iron iv" without normalising first (every other maker does), and the game root on Windows
      // has backslashes: handed that, the page judged vanilla a MOD, loaded its first tree ("Loaded 0 focuses." under an "Empty
      // Focus Tree" card) and never opened the chooser (measured 2026-11-19). Step B below now says so if it happens again.
      try {
        const gameRoot = (require("./server.js").constants || {}).GAME_ROOT || "";
        if (gameRoot) {
          await page.evaluate((g) => { try { localStorage.setItem("activeModPath", g); } catch (_) {} }, gameRoot.replace(/\\/g, "/"));
        }
      } catch (_) {}
      await page.goto(page.url().replace('home.html', 'index.html?e2e=1'));
      await page.waitForLoadState('load');
    }

    page.on('console', msg => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // 3. Register IPC dialog handlers and HTTP route mocks
    console.log("Overriding show-confirm-dialog handler on ipcMain...");
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("show-confirm-dialog");
      ipcMain.handle("show-confirm-dialog", async () => true);
    });

    console.log("Setting up mock routing for AI logic endpoint...");
    await page.route('**/api/ai/logic', async (route) => {
      console.log("-> Intercepted POST **/api/ai/logic");
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ script: "army_experience = 50" })
      });
    });

    // Handle alert/confirm dialogs in renderer context
    page.on('dialog', async (dialog) => {
      console.log(`-> Dialog popup: [${dialog.type()}] "${dialog.message()}"`);
      // A beforeunload dialog is often already gone by the time this handler runs — Playwright then throws
      // 'No dialog is showing' out of an async listener, which surfaces as an unhandled rejection and kills
      // the run. Accepting is best-effort.
      try { await dialog.accept(); } catch (_) {}
    });

    // 4. Wizard actions
    // Step A: Close startup help modal if open
    console.log("Waiting for startup UI...");
    const helpBtn = page.locator('#helpDialogCloseBtn');
    const startupCreateBtn = page.locator('#startupCreateModBtn');
    
    await Promise.race([
      helpBtn.waitFor({ state: 'visible', timeout: E2E_TIMEOUT }).catch(() => {}),
      startupCreateBtn.waitFor({ state: 'visible', timeout: E2E_TIMEOUT }).catch(() => {})
    ]);

    if (await helpBtn.isVisible()) {
      console.log("Closing startup help dialog...");
      await clickButton(page, '#helpDialogCloseBtn');
      // Wait for any asynchronous 'close' event and setTimeout(250) on helpDialogEl to fire
      await page.waitForTimeout(600);
    }

    // Step B: Open Mod Wizard
    // The chooser must really be open: clickButton would click its hidden button by script, which is how this file went on past
    // a focus page that never opened it (#vanilla-with-backslashes-is-a-mod-to-the-focus-page, above).
    await startupCreateBtn.waitFor({ state: 'visible', timeout: E2E_TIMEOUT }).catch(() => {
      throw new Error("the startup chooser never opened: the focus page did not take its e2e branch (is the active mod vanilla?)");
    });
    console.log("Clicking 'Create Focus Tree (New Mod)' button...");
    await clickButton(page, '#startupCreateModBtn');

    // Step C: Fill in Mod creation details
    console.log("Filling new mod wizard form...");
    await fillField(page, '#createModNameInput', 'e2e_test_mod');
    await fillField(page, '#createModDisplayNameInput', 'E2E Test Mod');

    // Wait for the creation network call
    const createModPromise = responseTo(page, '/api/mod/create');

    console.log("Submitting mod wizard...");
    await clickButton(page, '#createModApplyBtn');
    const createModResp = await createModPromise;
    const createModResult = await createModResp.json();
    console.log("Mod created successfully. Payload:", createModResult);

    const activeModPath = createModResult.modRoot;
    if (!activeModPath) {
      throw new Error("API mod creation response did not include a valid modRoot.");
    }
    console.log(`Active Mod Path determined: ${activeModPath}`);

    // Set activeModPath in localStorage immediately so all pages/tabs will share it.
    await page.evaluate((root) => {
      localStorage.setItem("activeModPath", root);
    }, activeModPath);

    // Wait for initial focus tree file to load
    await page.waitForTimeout(2000);

    // Guarantee that startup dialogs are closed to prevent race conditions from 250ms timeouts
    await page.evaluate(() => {
      const choiceDlg = document.getElementById("startupChoiceDialog");
      if (choiceDlg && choiceDlg.open) choiceDlg.close();
      const createDlg = document.getElementById("createModDialog");
      if (createDlg && createDlg.open) createDlg.close();
    });

    // Step D: Navigate to ideas.html (National Spirit Maker)
    console.log("Navigating to National Spirit Maker...");
    const catalogResponsePromise = responseTo(page, '/api/ideas/catalog');
    await clickButton(page, '.suite-nav a[href="ideas.html"]');
    await page.waitForLoadState('load');
    console.log("Waiting for ideas catalog fetch response...");
    await catalogResponsePromise;
    console.log("Ideas catalog loaded successfully.");

    await page.waitForTimeout(1000);

    console.log("Clicking '+ Create New Spirit' button...");
    await clickButton(page, '#newIdeaBtn');

    // Wait a brief moment to ensure lists have updated draft item
    await page.waitForTimeout(500);

    console.log("Filling national spirit details...");
    await fillField(page, '#ideaId', 'e2e_test_spirit');
    await fillField(page, '#ideaName', 'E2E Test Spirit');
    await fillField(page, '#ideaModifiers', 'political_power_gain = 0.05');
    await fillField(page, '#ideaTargetFile', 'custom_ideas.txt');

    // Save national spirit
    const spiritSavePromise = responseTo(page, '/api/ideas/upsert-definition');
    console.log("Clicking 'Save National Spirit' button...");
    await clickButton(page, '#saveIdeaBtn');
    await spiritSavePromise;
    console.log("National spirit saved.");
    await closeSaveReport(page, "spirit save", /Successfully saved e2e_test_spirit into custom_ideas\.txt/);

    // Step E: Navigate to events.html (Event Maker)
    console.log("Navigating to Event Maker...");
    const eventsListResponsePromise = responseTo(page, '/api/events/list');
    await clickButton(page, '.suite-nav a[href="events.html"]');
    await page.waitForLoadState('load');
    console.log("Waiting for events list fetch response...");
    await eventsListResponsePromise;
    console.log("Events list loaded successfully.");

    await page.waitForTimeout(1000);

    console.log("Clicking '+ Create New Event' button...");
    await clickButton(page, '#newEventBtn');

    // Wait for draft list to update and autoSelect click event to execute
    await page.waitForTimeout(500);

    console.log("Filling event details...");
    await fillField(page, '#eventNamespace', 'e2e_events');
    await fillField(page, '#eventId', '1');
    await fillField(page, '#eventTitle', 'E2E Event');

    console.log("Adding event option...");
    await clickButton(page, '#addOptionBtn');

    console.log("Filling event option details...");
    await fillField(page, '.opt-name', 'e2e_events.1.a');
    await fillField(page, '.opt-title', 'Excellent');

    // Save event
    const eventSavePromise = responseTo(page, '/api/events/save');
    console.log("Clicking 'Save Event' button...");
    await clickButton(page, '#saveEventBtn');
    await eventSavePromise;
    console.log("Event saved.");
    await closeSaveReport(page, "event save", /Successfully saved to .*e2e_events\.txt/);

    // Step F: Navigate to decisions.html (Decision Maker)
    console.log("Navigating to Decision Maker...");
    const decisionsListResponsePromise = responseTo(page, '/api/decisions/list');
    await clickButton(page, '.suite-nav a[href="decisions.html"]');
    await page.waitForLoadState('load');
    console.log("Waiting for decisions list fetch response...");
    await decisionsListResponsePromise;
    console.log("Decisions list loaded successfully.");

    await page.waitForTimeout(1000);

    console.log("Clicking '+ Create New Decision' button...");
    await clickButton(page, '#newDecisionBtn');

    // Wait for draft list to update and autoSelect click event to execute
    await page.waitForTimeout(500);

    console.log("Creating new decision category...");
    await page.locator('#decisionCategory').selectOption('__create_new__');
    
    // Interact with the custom prompt HTML dialog
    console.log("Waiting for custom category prompt dialog...");
    // Matched by the overlay's ID, not by its inline z-index. It used to be
    // div[style*="z-index: 20000"], and that broke the moment the prompt was deliberately raised above the
    // CF editor and the token picker so it could not be trapped behind the dialog that opened it. The
    // z-index is now 2147483600 and may well move again; #novaCustomPromptOverlay is what it IS.
    const promptTextarea = page.locator('#novaCustomPromptOverlay textarea');
    await promptTextarea.waitFor({ state: 'visible', timeout: E2E_TIMEOUT });
    await promptTextarea.fill('e2e_decisions');
    
    const confirmPromptBtn = page.locator('#novaCustomPromptOverlay button:has-text("Confirm")');
    await confirmPromptBtn.click();
    await page.waitForTimeout(1000);

    console.log("Filling decision details...");
    await fillField(page, '#decisionId', 'e2e_decision_1');
    await fillField(page, '#decisionCost', '50');
    await fillField(page, '#decisionEffect', 'add_stability = 0.05');

    // Save decision
    const decisionSavePromise = responseTo(page, '/api/decisions/save');
    console.log("Clicking 'Save Decision' button...");
    await clickButton(page, '#saveDecisionBtn');
    await decisionSavePromise;
    console.log("Decision saved.");
    await closeSaveReport(page, "decision save", /Successfully saved to .*e2e_decisions\.txt/);

    // Step G: Navigate back to index.html (Focus Editor)
    console.log("Navigating back to Focus Editor...");
    const loadPromise = responseTo(page, '/api/load');
    // The nav bar's own link (as each nav click here): decisions.html also carries an empty-state "create a mod" link to
    // index.html, so a bare a[href="index.html"] matched two, and clickButton's fallback hid that by clicking the first by script.
    await clickButton(page, '.suite-nav a[href="index.html"]');
    await page.waitForLoadState('load');
    console.log("Waiting for focus tree load response...");
    await loadPromise;
    console.log("Focus tree loaded successfully.");

    await page.waitForTimeout(1000);

    // Step H: Add a focus node
    console.log("Clicking 'Add Focus' button...");
    await clickButton(page, '#addFocusBtn');

    console.log("Filling focus details...");
    await fillField(page, '#createFocusIdInput', 'E2E_FOCUS');
    await fillField(page, '#createFocusNameInput', 'E2E Focus');
    await fillField(page, '#createFocusXInput', '10');
    await fillField(page, '#createFocusYInput', '10');

    console.log("Clicking 'Create' focus button...");
    await clickButton(page, '#createFocusApplyBtn');
    await page.waitForTimeout(1000);

    // Step I: Select the created focus node
    console.log("Clicking the E2E_FOCUS node to open the sidebar...");
    await selectFocusNode(page, 'E2E_FOCUS');

    // Wait a brief moment and verify selection class and sidebar
    await page.waitForTimeout(500);
    const selNodes = await page.evaluate(() => [...document.querySelectorAll(".node--selected")].map(el => el.getAttribute("data-focus-id")));
    const isSidebarOpen = await page.evaluate(() => document.body.classList.contains("sidebar-open"));
    console.log(`[Diagnostic] Selected nodes: ${JSON.stringify(selNodes)}, sidebar-open: ${isSidebarOpen}`);

    // Step J: Add stability modifier manually
    console.log("Clicking '+ Add Manual Effect' button in sidebar...");
    await clickButton(page, '#sb-add-effect-btn');

    console.log("Selecting 'add_stability' in effect picker...");
    await clickButton(page, '.sb-effect-picker-item[title="add_stability"]');

    console.log("Filling modifier value '0.05'...");
    await fillField(page, '#effectAmountInput', '0.05');

    console.log("Applying manual stability effect...");
    await clickButton(page, '#effectAmountApplyBtn');
    await page.waitForTimeout(1000);

    // Step K: Generate effect via AI logic prompt
    console.log("Filling AI logic input field...");
    await fillField(page, '#ai-logic-input', 'Gives 50 army experience');

    console.log("Clicking AI logic generate button...");
    await clickButton(page, '#ai-logic-generate-btn');

    console.log("Verifying AI logic preview box contains 'army_experience = 50'...");
    await page.waitForSelector('#ai-logic-preview:has-text("army_experience = 50")', { timeout: 10000 });
    console.log("AI logic applied successfully.");

    // Step L: Link the created national spirit
    console.log("Clicking '+ Add Manual Effect' button for national spirit...");
    await clickButton(page, '#sb-add-effect-btn');

    console.log("Selecting 'add_ideas' in effect picker...");
    await clickButton(page, '.sb-effect-picker-item[title="add_ideas"]');

    console.log("Typing 'e2e_test_spirit' in national spirit picker search...");
    await fillField(page, '#ideaPickerSearch', 'e2e_test_spirit');
    await page.waitForTimeout(500); // Wait for filtered list to render

    console.log("Selecting 'e2e_test_spirit' in national spirit picker...");
    await clickButton(page, 'button.picker-list-item[data-idea-id="e2e_test_spirit"]');

    console.log("Unchecking the import toggle (since the spirit is local)...");
    const toggle = page.locator('#ideaPickerImportToggle');
    if (await toggle.isChecked()) {
      await toggle.uncheck();
    }

    console.log("Applying national spirit link...");
    await clickButton(page, '#ideaPickerApplyBtn');
    await page.waitForTimeout(1000);

    // Step M: Save the focus tree
    const savePromise = responseTo(page, '/api/save');
    console.log("Clicking 'Save' button...");
    await clickButton(page, '#saveBtn');
    await savePromise;
    console.log("Focus tree saved successfully.");

    // 5. Verification of files written to disk
    console.log("=== VERIFYING CREATED FILE CONTENTS ===");

    const focusTreeFile = path.join(activeModPath, "common", "national_focus", "e2e_test_mod_focus_tree.txt");
    const ideasFile = path.join(activeModPath, "common", "ideas", "custom_ideas.txt");
    const eventsFile = path.join(activeModPath, "events", "e2e_events.txt");
    const decisionsFile = path.join(activeModPath, "common", "decisions", "e2e_decisions.txt");

    // Assertion checks
    console.log(`Checking focus tree file: ${focusTreeFile}`);
    if (!fs.existsSync(focusTreeFile)) throw new Error("Focus tree file was not created!");
    const focusTreeContent = fs.readFileSync(focusTreeFile, 'utf8');
    console.log("Focus tree file content preview:\n", focusTreeContent);

    if (!focusTreeContent.includes("id = E2E_FOCUS")) throw new Error("Focus tree does not contain 'E2E_FOCUS' ID!");
    if (!focusTreeContent.includes("add_stability = 0.05")) throw new Error("Focus tree does not contain 'add_stability = 0.05'!");
    if (!focusTreeContent.includes("army_experience = 50")) throw new Error("Focus tree does not contain 'army_experience = 50'!");
    if (!focusTreeContent.includes("add_ideas = e2e_test_spirit")) throw new Error("Focus tree does not contain 'add_ideas = e2e_test_spirit'!");

    console.log(`Checking custom ideas file: ${ideasFile}`);
    if (!fs.existsSync(ideasFile)) throw new Error("Custom ideas file was not created!");
    const ideasContent = fs.readFileSync(ideasFile, 'utf8');
    console.log("Ideas file content preview:\n", ideasContent);
    if (!ideasContent.includes("e2e_test_spirit")) throw new Error("Ideas file does not contain 'e2e_test_spirit'!");
    if (!ideasContent.includes("political_power_gain = 0.05")) throw new Error("Ideas file does not contain 'political_power_gain = 0.05'!");

    console.log(`Checking events file: ${eventsFile}`);
    if (!fs.existsSync(eventsFile)) throw new Error("Events file was not created!");
    const eventsContent = fs.readFileSync(eventsFile, 'utf8');
    console.log("Events file content preview:\n", eventsContent);
    if (!eventsContent.includes("add_namespace = e2e_events")) throw new Error("Events file does not contain namespace!");
    if (!eventsContent.includes("id = e2e_events.1")) throw new Error("Events file does not contain event block ID!");

    console.log(`Checking decisions file: ${decisionsFile}`);
    if (!fs.existsSync(decisionsFile)) throw new Error("Decisions file was not created!");
    const decisionsContent = fs.readFileSync(decisionsFile, 'utf8');
    console.log("Decisions file content preview:\n", decisionsContent);
    if (!decisionsContent.includes("e2e_decision_1")) throw new Error("Decisions file does not contain 'e2e_decision_1'!");
    if (!decisionsContent.includes("add_stability = 0.05")) throw new Error("Decisions file does not contain decision stability effect!");

    // #a-step-no-user-could-take-is-not-a-pass — every file is right; the run still fails if getting there took a step by script
    if (fallbacks.length) {
      throw new Error(`${fallbacks.length} step(s) could only be done by script, not as a user would:\n  ${fallbacks.join("\n  ")}`);
    }
    console.log("SUCCESS: All file validations passed on host filesystem!");
    
    // Close App
    console.log("Closing Electron application...");
    await electronApp.close();
    process.exit(0);

  } catch (err) {
    console.error("ERROR: E2E test workflow failed with exception:", err);
    // …and when the app itself went, say how: a Playwright "Target … closed" can arrive before the process's own exit.
    if (app) { await app.settle(3000); if (app.gone()) console.error("ERROR: " + app.gone()); }
    if (page) {
      try {
        // ⛔ #a-test-names-no-folder-of-the-users — into a folder of this run's own in the temp folder, which is kept for you to
        // look at. This wrote into a fixed folder under the owner's home that belongs to another program (.gemini).
        const screenshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-e2e-workflow-shot-')), 'e2e_error_screenshot.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`Saved error screenshot to: ${screenshotPath}`);
      } catch (screenshotErr) {
        console.error("Failed to save error screenshot:", screenshotErr);
      }
    }
    try {
      await electronApp.close();
    } catch (_) {}
    process.exit(1);
  }
})();
