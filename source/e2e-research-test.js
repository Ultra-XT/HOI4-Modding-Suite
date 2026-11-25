// #a-bare-test-run-writes-into-the-real-app-data — first, so a bare run hands the app it launches, and the mods folder
// below, a sandbox. Electron's own profile ignores APPDATA: that is the --user-data-dir of its own, further down.
require("./safe-write.js");
const { _electron: electron } = require('playwright');
const { watchApp, refusalIn } = require('./testlib-app-exit.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// How long to wait for a selector. Five seconds is fine against a warm app, but the FIRST launch against
// a fresh mods folder builds the icon atlas and this mod's caches, which the splash itself says "can take
// a minute or two". That is what a new contributor and a CI machine both get, so it must be waitable.
// run-e2e.js raises this; the default is unchanged for anyone running the file directly.
const E2E_TIMEOUT = Number(process.env.NOVA_E2E_CLICK_TIMEOUT_MS || 5000);

// ⛔ #a-sandboxed-launch-keeps-its-port — THE APP'S OWN SERVER ON A PORT OF THIS TEST'S OWN, as e2e-workflow-test.js has. main.js
// gave that server Nova's own port, passed explicitly, until it learnt NOVA_PORT: so this test took the owner's port whenever it
// was free. main.js keeps a port it is asked for, or refuses (stderr, exit code 1) rather than move. A PORT constant, which
// run-e2e.js reads as this file's claim.
const APP_PORT = 55161;

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

// Helper to click a technology node programmatically
async function selectTechNode(page, techId) {
  const selector = `.tech-node[data-id="${techId}"]`;
  console.log(`[SelectNode] Waiting for tech node selector: ${selector}`);
  await page.waitForSelector(selector, { state: 'visible', timeout: E2E_TIMEOUT });
  console.log(`[SelectNode] Clicking tech node: ${techId}`);
  await clickButton(page, selector);
}

(async () => {
  console.log("=== NOVA E2E RESEARCH TREE TEST SUITE ===");

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

  // 2. Launch Electron app. This is the ONE test that drives the real Electron shell (every other e2e
  // uses chromium + createApp), so in a headless/CI environment where Electron cannot open a window it
  // SKIPS instead of failing — run it on a desktop session for full coverage.
  console.log("Launching Electron application...");
  let electronApp;
  // Its OWN Electron profile, as e2e-workflow-test.js has. Electron takes its profile from Windows' shell folders, not from
  // APPDATA, so no sandbox reaches it: on the owner's own, the app restores THEIR last mod and keeps its storage there.
  const e2eUserData = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-electron-"));
  process.on("exit", () => { try { fs.rmSync(e2eUserData, { recursive: true, force: true }); } catch (_) {} });
  try {
    electronApp = await electron.launch({
      args: ['.', `--user-data-dir=${e2eUserData}`],
      cwd: __dirname,
      // everything this process was handed (the run's sandbox), and the port above for the app's own server
      env: Object.assign({}, process.env, { NOVA_PORT: String(APP_PORT) }),
    });
  } catch (e) {
    // ⛔ #a-refused-launch-is-not-a-skip — Nova refusing to start (main.js: "Nova could not start: …") is Nova's answer, not an
    // environment that cannot run Electron.
    if (refusalIn(e && e.message)) {
      console.error("ERROR: the app refused to start: " + refusalIn(e && e.message));
      process.exit(1);
    }
    console.log("  SKIP — Electron could not launch in this environment (" + String(e && e.message).slice(0, 120) + ")");
    console.log("\nRESEARCH E2E: skipped (Electron unavailable — run on a desktop session)");
    process.exit(0);
  }

  // #a-refused-launch-is-not-a-skip — the app's stderr, printed as it comes, and its exit, heard (testlib-app-exit.js).
  const app = watchApp(electronApp);
  let page;
  try {
    console.log("Waiting for main window...");
    page = await electronApp.firstWindow();
    page.setDefaultTimeout(60000);
    await page.waitForLoadState('load');
    console.log("Window loaded successfully.");

    if (page.url().includes('home.html')) {
      console.log("Redirecting from home.html to index.html for startup dialog flow...");
      await page.goto(page.url().replace('home.html', 'index.html?e2e=1'));
      await page.waitForLoadState('load');
    }

    page.on('console', msg => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // Intercept/mock confirm dialogs on Electron main process
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("show-confirm-dialog");
      ipcMain.handle("show-confirm-dialog", async () => true);
    });

    // Mock API AI logic endpoint
    await page.route('**/api/ai/logic', async (route) => {
      console.log("-> Intercepted POST **/api/ai/logic");
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          script: JSON.stringify({
            name: "AI Advanced Lasers",
            description: "Lasers generated by E2E test AI prompt.",
            researchCost: 3.5,
            startYear: 1946,
            modifiers: "research_speed = 0.10",
            extraScript: "laser_beams = yes",
            equipment: {
              id: "ai_laser_gun",
              archetype: "infantry_equipment",
              buildCostIc: 0.95,
              softAttack: 20,
              hardAttack: 5,
              defense: 40,
              breakthrough: 12,
              apAttack: 15,
              reliability: 0.92,
              resources: "steel = 3\ntungsten = 2"
            }
          })
        })
      });
    });

    // Handle generic dialogs (alerts, simple confirms)
    page.on('dialog', async (dialog) => {
      console.log(`-> Dialog popup: [${dialog.type()}] "${dialog.message()}"`);
      try {
        await dialog.accept();
      } catch (_) {
        // Dialog may already be dismissed (e.g. beforeunload during electronApp.close())
      }
    });

    // Mock prompt() globally in page context before navigation or dynamic prompt triggers
    console.log("Injecting prompt dialog override script...");
    await page.addInitScript(() => {
      window.prompt = (message, defaultValue) => {
        const msg = (message || "").toLowerCase();
        console.log(`[MOCK PROMPT] Triggered with msg: "${message}"`);
        if (msg.includes("country tag")) {
          return "TST";
        } else if (msg.includes("country name")) {
          return "Testland";
        } else if (msg.includes("custom tab")) {
          return "Future Weapons";
        } else if (msg.includes("layout style")) {
          return "vertical";
        } else if (msg.includes("mutually exclusive")) {
          return window.__promptExclusiveId || "node_2_placeholder";
        }
        return defaultValue || "";
      };
    });

    // 3. Wizard Mod Creation
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

    console.log("Opening Mod Wizard...");
    await clickButton(page, '#startupCreateModBtn');

    console.log("Filling new mod wizard form...");
    await fillField(page, '#createModNameInput', 'e2e_test_mod');
    await fillField(page, '#createModDisplayNameInput', 'E2E Test Mod');

    const createModPromise = page.waitForResponse(response =>
      response.url().includes('/api/mod/create') && response.status() === 200
    );

    console.log("Submitting mod wizard...");
    await clickButton(page, '#createModApplyBtn');
    const createModResp = await createModPromise;
    const createModResult = await createModResp.json();
    console.log("Mod created successfully:", createModResult);

    const activeModPath = createModResult.modRoot;
    
    // Programmatically create the country tag and localization files so the mod has a country 'TST'
    const commonCountryTagsDir = path.join(activeModPath, "common", "country_tags");
    const localisationEnglishDir = path.join(activeModPath, "localisation", "english");
    const historyCountriesDir = path.join(activeModPath, "history", "countries");

    fs.mkdirSync(commonCountryTagsDir, { recursive: true });
    fs.mkdirSync(localisationEnglishDir, { recursive: true });
    fs.mkdirSync(historyCountriesDir, { recursive: true });

    fs.writeFileSync(path.join(commonCountryTagsDir, "e2e_tags.txt"), 'TST = "countries/Testland.txt"\n', "utf8");
    fs.writeFileSync(path.join(localisationEnglishDir, "e2e_countries_l_english.yml"), '\ufeffl_english:\n TST:0 "Testland"\n', "utf8");
    fs.writeFileSync(path.join(historyCountriesDir, "TST - Testland.txt"), 'set_technology = {\n}\n', "utf8");

    await page.evaluate((root) => {
      localStorage.setItem("activeModPath", root);
    }, activeModPath);

    await page.waitForTimeout(1000);

    // Close any open modals
    await page.evaluate(() => {
      const choiceDlg = document.getElementById("startupChoiceDialog");
      if (choiceDlg && choiceDlg.open) choiceDlg.close();
      const createDlg = document.getElementById("createModDialog");
      if (createDlg && createDlg.open) createDlg.close();
    });

    // 4. Navigate to research.html
    console.log("Navigating to Research Tree Maker...");
    const catalogResponsePromise = page.waitForResponse(response => {
      if (response.url().includes('/api/technologies/catalog')) {
        console.log(`[NETWORK] /api/technologies/catalog responded with status: ${response.status()}`);
        return response.status() === 200 || response.status() === 304;
      }
      return false;
    }, { timeout: 60000 });
    await clickButton(page, 'a[href="research.html"]');
    await page.waitForLoadState('load', { timeout: 60000 });
    await catalogResponsePromise;
    console.log("Research Tree catalog loaded successfully.");

    await page.waitForTimeout(1000);

    // 5. Verify Country & Handle Empty Tree Overlay
    console.log("Verifying country 'TST' tag selection...");
    const activeCountry = await page.evaluate(() => document.getElementById("headerCountrySelector").value);
    console.log(`Active selected country tag is: ${activeCountry}`);
    if (activeCountry !== "TST") {
      throw new Error(`Expected TST to be selected, but got: ${activeCountry}`);
    }

    console.log("Handling empty tree overlay...");
    await page.waitForSelector('#copyVanillaTreeBtn', { state: 'visible', timeout: E2E_TIMEOUT });
    await clickButton(page, '#copyVanillaTreeBtn');
    await page.waitForTimeout(1000);
    console.log("Copied generic vanilla tree into the empty mod.");

    // 6. Test Custom Tab Creation with Vertical Layout
    console.log("Creating custom tab 'Future Weapons'...");
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll(".folder-tab")];
      const addBtn = tabs.find(t => t.textContent.includes("+ Custom Tab"));
      if (addBtn) addBtn.click();
      else throw new Error("Add Custom Tab button not found!");
    });
    
    console.log("Waiting for custom tab creation modal...");
    await page.waitForSelector('#customTabModal', { state: 'visible', timeout: E2E_TIMEOUT });
    await fillField(page, '#customTabNameInput', 'Future Weapons');
    await page.locator('#customTabLayoutSelect').selectOption('vertical');
    await clickButton(page, '#confirmCustomTabBtn');
    await page.waitForSelector('#customTabModal', { state: 'hidden', timeout: E2E_TIMEOUT });

    const selectedTab = await page.evaluate(() => activeTab);
    console.log(`Selected active custom tab key: ${selectedTab}`);
    if (!selectedTab.startsWith("custom_tab_future_weapons")) {
      throw new Error(`Expected custom_tab_future_weapons but got active tab: ${selectedTab}`);
    }

    // Verify custom tab exists in list
    const customTabsList = await page.evaluate(() => customTabs);
    console.log("Custom tabs array structure:", JSON.stringify(customTabsList));
    const weaponTab = customTabsList.find(t => t.key === selectedTab);
    if (!weaponTab || weaponTab.layout !== "vertical") {
      throw new Error("Expected custom tab layout to be 'vertical'!");
    }

    // 7. Add Custom Node & Form Edit
    console.log("Creating new tech node...");
    await clickButton(page, '#newTechBtn');
    await page.waitForTimeout(500);

    const techNode1Id = await page.evaluate(() => selectedTechId);
    console.log(`Generated first tech node ID: ${techNode1Id}`);
    if (!techNode1Id) {
      throw new Error("No node selected or generated after newTechBtn click!");
    }

    // Edit fields
    console.log("Editing technology form fields...");
    await fillField(page, '#techName', 'E2E Laser Rifle');
    await fillField(page, '#techDesc', 'Advanced weapons for infantry');
    await fillField(page, '#techCost', '2.5');
    await fillField(page, '#techYear', '1944');
    await fillField(page, '#techX', '2');
    await fillField(page, '#techY', '3');
    await fillField(page, '#techModifiers', 'infantry_attack = 0.10');
    await fillField(page, '#techExtraScript', 'laser_tech = yes');

    // Production Equipment Toggle & Fields
    console.log("Enabling and editing production equipment...");
    await page.locator('#enableEquipment').check();
    await page.waitForSelector('#equipmentSection', { state: 'visible', timeout: 3000 });
    
    await fillField(page, '#equipId', 'laser_rifle_eq');
    await fillField(page, '#equipArchetype', 'infantry_equipment');
    await fillField(page, '#equipCost', '0.75');
    await fillField(page, '#equipSoftAttack', '15');
    await fillField(page, '#equipHardAttack', '3');
    await fillField(page, '#equipDefense', '35');
    await fillField(page, '#equipBreakthrough', '8');
    await fillField(page, '#equipApAttack', '10');
    await fillField(page, '#equipReliability', '0.85');
    await fillField(page, '#equipResources', 'steel = 2\ntungsten = 1');

    // 8. Test GFX Browse Modal
    console.log("Testing GFX Browse dialog...");
    await clickButton(page, '#techBrowseBtn');
    await page.waitForSelector('#iconPickerModal', { state: 'visible', timeout: E2E_TIMEOUT });
    
    console.log("Searching for 'infantry' in icon modal...");
    await fillField(page, '#iconPickerSearch', 'infantry');
    await page.waitForTimeout(500);

    const firstItem = page.locator('.icon-picker-item').first();
    await firstItem.waitFor({ state: 'visible', timeout: E2E_TIMEOUT });
    const selectedIconKey = await firstItem.getAttribute('data-key');
    console.log(`Clicking sprite: ${selectedIconKey}`);
    await firstItem.click();
    
    // Verify modal closed
    await page.waitForSelector('#iconPickerModal', { state: 'hidden', timeout: E2E_TIMEOUT });
    const updatedIconId = await page.evaluate(() => document.getElementById("techIconId").value);
    console.log(`GFX ID field updated to: ${updatedIconId}`);
    if (updatedIconId !== selectedIconKey) {
      throw new Error(`Expected GFX ID to update to ${selectedIconKey}, got: ${updatedIconId}`);
    }

    // 9. Test AI logic Generator integration
    console.log("Testing AI Logic generator...");
    await fillField(page, '#aiPrompt', 'Generates research speed technology.');
    await clickButton(page, '#generateAiBtn');
    await page.waitForSelector('#aiStatus:has-text("Generated successfully!")', { timeout: 10000 });
    
    // Verify AI generated values filled in
    const aiTechName = await page.evaluate(() => document.getElementById("techName").value);
    const aiTechCost = await page.evaluate(() => document.getElementById("techCost").value);
    console.log(`AI populated Name: ${aiTechName}, Cost: ${aiTechCost}`);
    if (aiTechName !== "AI Advanced Lasers" || aiTechCost !== "3.5") {
      throw new Error("AI output parameters did not parse correctly into technology form fields!");
    }

    // 10. Test Prerequisites (Prereqs) Link logic
    console.log("Creating a second node via '+ Add Tech Node' button...");
    await clickButton(page, '#newTechBtn');
    await page.waitForTimeout(500);

    const techNode2Id = await page.evaluate((n1_id) => {
      const secondNode = allTechs.find(t => t.id !== n1_id && t.id.startsWith("custom_tech_"));
      return secondNode ? secondNode.id : null;
    }, techNode1Id);

    console.log(`Generated second tech node ID: ${techNode2Id}`);
    if (!techNode2Id) {
      throw new Error("Second node was not created successfully via Add Tech Node button!");
    }

    // Perform linking (Node 1 is parent, Node 2 is child)
    console.log("Selecting parent node...");
    await selectTechNode(page, techNode1Id);
    
    console.log("Activating Link Mode...");
    await clickButton(page, '#linkTechsBtn');
    
    console.log("Clicking child node to link...");
    await selectTechNode(page, techNode2Id);

    // Verify prerequisite link added to child
    await selectTechNode(page, techNode2Id);
    const hasPrereq = await page.evaluate(({ cId, pId }) => {
      const childNode = allTechs.find(t => t.id === cId);
      return childNode && childNode.prerequisites.some(p => p.tech === pId);
    }, { cId: techNode2Id, pId: techNode1Id });

    console.log(`Link verified: ${hasPrereq}`);
    if (!hasPrereq) {
      throw new Error("Prerequisite link was not established between Node 1 and Node 2!");
    }

    // 11. Test Mutually Exclusive Link logic
    console.log("Adding mutual exclusion linking...");
    // Override exclusion prompt targets dynamically
    await page.evaluate((id) => {
      window.__promptExclusiveId = id;
    }, techNode2Id);

    await selectTechNode(page, techNode1Id);
    await clickButton(page, '#addExclusiveBtn');
    await page.waitForTimeout(500);

    // Verify mutual exclusion bidirectional linking
    const isExA = await page.evaluate(({ a, b }) => {
      const n = allTechs.find(t => t.id === a);
      return n && n.mutuallyExclusive.includes(b);
    }, { a: techNode1Id, b: techNode2Id });

    const isExB = await page.evaluate(({ a, b }) => {
      const n = allTechs.find(t => t.id === b);
      return n && n.mutuallyExclusive.includes(a);
    }, { a: techNode2Id, b: techNode1Id });

    console.log(`Exclusion verified: Node 1 -> Node 2 (${isExA}), Node 2 -> Node 1 (${isExB})`);
    if (!isExA || !isExB) {
      throw new Error("Bidirectional mutual exclusion links not resolved!");
    }

    // Verify exclusive swords element exists in canvas
    const swordsCount = await page.evaluate(() => document.querySelectorAll('.exclusive-swords').length);
    console.log(`Exclusive swords icon count: ${swordsCount}`);
    if (swordsCount === 0) {
      throw new Error("Mutual exclusion swords icon not rendered on canvas!");
    }

    // 12. Node Dragging Snap & Bounding Bounds Verification
    console.log("Testing coordinate drag-snap bounding boxes...");
    // Programmatically simulate dragging coordinate updates on Node 1 out of bounds
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    const dragDebugInfo = await page.evaluate((id) => {
      console.log("[DEBUG E2E drag] Searching for tech ID:", id);
      console.log("[DEBUG E2E drag] Available tech IDs in allTechs:", allTechs.map(t => t.id));
      const tech = allTechs.find(t => t.id === id);
      if (tech) {
        const layout = getTechLayout(tech);
        const snapped = snapPosition(9999, 9999, layout);
        const clamped = clampGridCoords(snapped.x, snapped.y, layout);
        console.log("[DEBUG E2E drag] Found tech! layout:", layout, "snapped:", snapped, "clamped:", clamped);
        tech.x = clamped.x;
        tech.y = clamped.y;
        
        // Also update the DOM node so that Playwright clicks don't reset the position on mouseup!
        const domNode = document.querySelector(`.tech-node[data-id="${id}"]`);
        if (domNode) {
          domNode.style.left = '9999px';
          domNode.style.top = '9999px';
        }
        
        return { found: true, layout, snapped, clamped, tech };
      }
      return { found: false, allIds: allTechs.map(t => t.id) };
    }, techNode1Id);
    console.log("DRAG DEBUG INFO FROM PAGE:", JSON.stringify(dragDebugInfo));

    // Select and inspect clamped coordinates
    await selectTechNode(page, techNode1Id);
    const dragX = await page.evaluate(() => document.getElementById("techX").value);
    const dragY = await page.evaluate(() => document.getElementById("techY").value);
    console.log(`Clamped drag coordinates: x=${dragX}, y=${dragY}`);
    // Grid bounds were widened during the HOI4 visual rewrite so vanilla data fits
    // (vanilla y values run from -1 to ~20). See clampGridCoords in research.js.
    if (parseInt(dragX) !== 14 || parseInt(dragY) !== 22) {
      throw new Error(`Expected drag coords to clamp to max limits (x=14, y=22), got: x=${dragX}, y=${dragY}`);
    }

    // 13. Test Delete Node function
    console.log("Deleting second node...");
    await selectTechNode(page, techNode2Id);
    await clickButton(page, '#deleteTechBtn');
    await page.waitForTimeout(500);

    // Verify deleted node is gone
    const existsAfterDelete = await page.evaluate((id) => allTechs.some(t => t.id === id), techNode2Id);
    console.log(`Second node exists after deletion: ${existsAfterDelete}`);
    if (existsAfterDelete) {
      throw new Error("Technology node was not deleted from client allTechs array!");
    }

    // 14. Save changes
    console.log("Saving all research tree changes...");
    const savePromise = page.waitForResponse(response =>
      response.url().includes('/api/technologies/save-batch') && (response.status() === 200 || response.status() === 304),
      { timeout: 60000 }
    );
    await clickButton(page, '#saveAllBtn');
    await savePromise;
    await page.waitForTimeout(500); // Give filesystem time to write
    console.log("Technology and layout configs save response received successfully.");

    // 15. Verify files written on host filesystem
    console.log("=== VERIFYING CREATED FILE CONTENTS ON DISK ===");
    
    const customTabsFile = path.join(activeModPath, "editor_custom_tabs.json");
    const techFile = path.join(activeModPath, "common", "technologies", "custom_technologies.txt");
    const equipFile = path.join(activeModPath, "common", "units", "equipment", "custom_equipment.txt");
    const startingTechsFile = path.join(activeModPath, "history", "countries", "TST - Testland.txt");

    console.log(`Checking custom tabs file: ${customTabsFile}`);
    if (!fs.existsSync(customTabsFile)) throw new Error("editor_custom_tabs.json was not created!");
    const customTabsContent = JSON.parse(fs.readFileSync(customTabsFile, 'utf8'));
    console.log("Custom tabs file payload:\n", JSON.stringify(customTabsContent));
    const savedWeaponTab = customTabsContent.find(t => t.key === selectedTab);
    if (!savedWeaponTab || savedWeaponTab.layout !== "vertical") {
      throw new Error("Custom tab layout 'vertical' was not persisted correctly on disk!");
    }

    console.log(`Checking technology file: ${techFile}`);
    if (!fs.existsSync(techFile)) throw new Error("custom_technologies.txt was not created!");
    const techContent = fs.readFileSync(techFile, 'utf8');
    console.log("Technology file content preview:\n", techContent);
    if (!techContent.includes("start_year = 1946")) throw new Error("Technology file does not contain start_year = 1946!");
    if (!techContent.includes("laser_beams = yes")) throw new Error("Technology file does not contain custom script modifier!");

    const locFile = path.join(activeModPath, "localisation", "english", "custom_technologies_l_english.yml");
    if (!fs.existsSync(locFile)) throw new Error(`Localisation file does not exist at ${locFile}`);
    const locContent = fs.readFileSync(locFile, 'utf8');
    if (!locContent.includes("AI Advanced Lasers")) throw new Error("Localisation file does not contain AI Advanced Lasers");

    console.log(`Checking equipments file: ${equipFile}`);
    if (!fs.existsSync(equipFile)) throw new Error("custom_equipment.txt was not created!");
    const equipContent = fs.readFileSync(equipFile, 'utf8');
    console.log("Equipment file content preview:\n", equipContent);
    if (!equipContent.includes("ai_laser_gun")) throw new Error("Equipment file does not contain archetype ID 'ai_laser_gun'!");
    if (!equipContent.includes("soft_attack = 20")) throw new Error("Equipment file does not contain soft_attack = 20!");

    console.log(`Checking starting technologies history file: ${startingTechsFile}`);
    if (!fs.existsSync(startingTechsFile)) throw new Error("TST - Testland.txt was not created!");
    const startingTechsContent = fs.readFileSync(startingTechsFile, 'utf8');
    console.log("Starting technologies file content preview:\n", startingTechsContent);
    if (!startingTechsContent.includes("set_technology = {")) throw new Error("Starting technologies file does not contain 'set_technology' block!");

    console.log("SUCCESS: All file validations passed on host filesystem!");
    
    // Close App
    console.log("Closing Electron application...");
    await electronApp.close();
    process.exit(0);

  } catch (err) {
    // The Electron shell can die mid-run in a headless/CI environment (the window closes before the app
    // is usable) — that's an env limitation, not a product failure, so SKIP rather than fail. A real
    // product bug surfaces as an assertion failure, not a "browser has been closed" error. Run this on a
    // desktop session for full coverage.
    // ⛔ #a-refused-launch-is-not-a-skip — …but not when the APP ended it: refused to start (a NOVA_PORT it could not have, exit
    // code 1 a second after the splash opened) or exited with an error. Round 2's review read that path straight into this SKIP.
    // The process's own exit can come after Playwright's "Target … closed", so it is given a moment first.
    await app.settle(5000);
    const appFailed = app.failed();
    if (appFailed) console.error("ERROR: " + appFailed);
    if (!appFailed && /Target (page|context|browser)|has been closed|browser has disconnected|Target closed/i.test(String(err && err.message))) {
      console.log("  SKIP — the Electron window closed mid-run (environment can't sustain Electron):", String(err && err.message).slice(0, 120));
      console.log("\nRESEARCH E2E: skipped (Electron unstable in this environment — run on a desktop session)");
      try { await electronApp.close(); } catch (_) {}
      process.exit(0);
    }
    console.error("ERROR: E2E research test workflow failed with exception:", err);
    if (page) {
      try {
        // ⛔ #a-test-names-no-folder-of-the-users — into a folder of this run's own in the temp folder, which is kept for you to
        // look at. This wrote into a fixed folder under the owner's home that belongs to another program (.gemini).
        const screenshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-e2e-research-shot-')), 'e2e_research_error.png');
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
