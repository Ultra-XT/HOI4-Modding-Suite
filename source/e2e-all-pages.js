// Repeatable UI smoke test: loads EVERY page in headless Chromium (against the in-process Express
// server) and, on each, (a) asserts the page loads with no uncaught JS error, (b) clicks every safe
// top-level button and asserts no click throws an uncaught error. Catches broken handlers, missing
// functions, and dead wiring across the whole UI. Run: `node e2e-all-pages.js` (or `npm run test:ui`).
//
// SAFE: uses createApp() (never loads the user's persisted mod) + points the UI at a throwaway temp
// mod via localStorage.activeModPath, so every UI fetch carries modPath=<tempMod>. It also SKIPS
// destructive / external / file-dialog buttons (delete, save, generate-AI, import, upload, browse, …)
// so it can't corrupt anything or hang on an OS dialog. The deep write/flow paths are covered by the
// dedicated e2e-research-test.js + the test-*.js unit suite.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3531;
const BASE = `http://127.0.0.1:${PORT}`;

const PAGES = [
  "home.html", "index.html", "research.html", "events.html", "decisions.html",
  "ideas.html", "characters.html", "country-setup.html", "map.html", "army.html", "modhealth.html",
];

// Buttons we must NOT click in a blind sweep: destructive, external (AI/Gemini), file/OS dialogs, or
// heavy writes. (Their real flows are covered by e2e-research-test.js + the unit suite.)
const SKIP_BTN = /(delete|remove|\bmerge\b|\bsave\b|generate|\bai\b|\bimport\b|upload|browse|restore|leave|paint|^fix\b|set\s*owner|create\s*(mod|country|template)|apply|verify\s*key|grant|revoke)/i;

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ui-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="UI Test"\nsupported_version="*"\n');
  mk("common/country_tags/00_tags.txt", 'TST = "countries/TST.txt"\n');
  mk("history/countries/TST - Test.txt", "capital = 1\nset_technology = {\n}\n");
  mk("common/technologies/custom.txt", "technologies = {\n\ttst_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n");
  mk("common/ideas/custom.txt", "ideas = {\n\tcountry = {\n\t\ttst_spirit = { picture = GFX_idea_unknown\n\t\t\tmodifier = { stability_factor = 0.1 } }\n\t}\n}\n");
  mk("common/national_focus/custom.txt", 'focus_tree = {\n\tid = tst_tree\n\tcountry = { factor = 0 }\n\tfocus = { id = tst_focus icon = GFX_goal_unknown x = 1 y = 0 cost = 10 completion_reward = {} }\n}\n');
  mk("events/custom.txt", 'add_namespace = tst\ncountry_event = { id = tst.1 title = tst.1.t desc = tst.1.d picture = GFX_report_event_generic option = { name = tst.1.a } }\n');
  mk("common/decisions/custom.txt", "tst_category = {\n\ttst_decision = { cost = 0 }\n}\n");
  mk("common/characters/custom.txt", "characters = {\n\ttst_char = { name = tst_char country_leader = { ideology = conservatism } }\n}\n");
  mk("localisation/english/custom_l_english.yml", "﻿l_english:\n TST:0 \"Testland\"\n");
  return mod;
}

(async () => {
  console.log("=== ALL-PAGES UI SMOKE TEST ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Point every page at the temp mod before its scripts run, and silence the first-run wizard.
  await ctx.addInitScript((modPath) => {
    try {
      localStorage.setItem("activeModPath", modPath);
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
    } catch (_) {}
  }, mod);

  let totalErrors = 0, totalClicked = 0;
  const report = [];

  for (const pg of PAGES) {
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    page.on("console", (m) => { if (m.type() === "error") { /* console.errors are warnings only */ } });
    let loaded = false, clicked = 0, clickErrors = [];
    try {
      await page.goto(`${BASE}/${pg}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000); // let init fetches + render settle
      loaded = true;

      // Close any first-run/startup dialog that blocks the page (best-effort).
      await page.evaluate(() => {
        document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} });
        ["helpDialogCloseBtn", "startupChoiceDialog"].forEach((id) => { const el = document.getElementById(id); if (el && el.close) try { el.close(); } catch (_) {} });
      }).catch(() => {});

      const clickedIds = new Set();
      const closeOverlays = () => page.evaluate(() => {
        ["novaInfoModalOverlay", "novaConfirmModalOverlay", "nodeContextMenu", "techIngamePreviewOverlay"].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
        document.querySelectorAll(".nova-prompt-overlay, [style*='2147483300'], [style*='2147483000']").forEach((el) => el.remove());
        document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} });
      }).catch(() => {});
      // Click every currently-visible, safe, not-yet-clicked button. Returns # clicked this pass.
      const clickPass = async () => {
        const handles = await page.$$("button");
        for (const h of handles) {
          let label = "";
          try {
            const info = await h.evaluate((el) => ({ text: (el.textContent || "").trim().slice(0, 40), id: el.id || "", vis: !!(el.offsetParent || el.getClientRects().length), dis: el.disabled }));
            label = info.id || info.text || "(button)";
            const key = info.id + "|" + info.text;
            if (!info.vis || info.dis || clickedIds.has(key)) continue;
            if (SKIP_BTN.test(info.id + " " + info.text)) continue;
            clickedIds.add(key);
            const before = pageErrors.length;
            await h.click({ timeout: 2000, force: true }).catch(() => {});
            clicked++;
            await page.waitForTimeout(110);
            await page.keyboard.press("Escape").catch(() => {});
            await closeOverlays();
            if (pageErrors.length > before) clickErrors.push(`${label}: ${pageErrors[pageErrors.length - 1]}`);
          } catch (e) { /* transient element — ignore */ }
        }
      };

      // Pass 1: buttons visible on load.
      await clickPass();
      // Reveal contextual controls (selecting an item populates the editor panel + its buttons), then
      // run a 2nd pass to reach those buttons too.
      await page.evaluate(() => {
        const item = document.querySelector(".list-item, .item-row, [data-id], .tech-node, .country-item, .event-item, .idea-item, .character-item, tbody tr");
        if (item) try { item.click(); } catch (_) {}
        document.querySelectorAll("select").forEach((s) => { if (s.options && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); } });
      }).catch(() => {});
      await page.waitForTimeout(900);
      await closeOverlays();
      await clickPass();
    } catch (e) {
      pageErrors.push("NAVIGATION/LOAD: " + e.message);
    }
    await page.close();

    totalClicked += clicked;
    totalErrors += pageErrors.length;
    const status = pageErrors.length === 0 ? "✓" : "✗";
    report.push({ pg, loaded, clicked, errors: pageErrors.length, detail: pageErrors });
    console.log(`  ${status} ${pg.padEnd(20)} loaded=${loaded} clicked=${clicked} buttons, errors=${pageErrors.length}`);
    if (pageErrors.length) pageErrors.slice(0, 6).forEach((e) => console.log(`        ⚠ ${e}`));
    if (clickErrors.length) clickErrors.slice(0, 6).forEach((e) => console.log(`        ↳ click ${e}`));
  }

  await browser.close();
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  server.close();

  console.log(`\nALL-PAGES UI: ${PAGES.length} pages, ${totalClicked} buttons clicked, ${totalErrors} uncaught errors.`);
  if (totalErrors) { console.log("RESULT: FAIL — uncaught JS errors above."); process.exit(1); }
  console.log("RESULT: PASS — every page loaded and every safe button clicked with no uncaught errors.");
  process.exit(0);
})();
