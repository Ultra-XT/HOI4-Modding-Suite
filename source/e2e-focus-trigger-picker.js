// Verifies the focus editor's advanced trigger fields (available / allow_branch / bypass) get a
// 📋 Pick button that opens the command picker on the Triggers tab and inserts the chosen trigger.
// Run: node e2e-focus-trigger-picker.js
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3550;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

(async () => {
  console.log("=== FOCUS TRIGGER PICKER E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    // The pick button is injected next to each ai-trigger-gen-btn (available/allow_branch/bypass).
    await page.waitForFunction(
      () => {
        const ai = document.querySelector('.ai-trigger-gen-btn[data-target="sb-focus-available"]');
        return ai && ai.nextElementSibling && ai.nextElementSibling.classList.contains("ai-field-pick-btn");
      },
      { timeout: 10000 }
    );
    ok(true, "📋 Pick injected next to the focus 'available' trigger field");

    // ai_will_do is weighting, not a trigger list → must NOT get a pick button.
    const aiWillDoHasPick = await page.evaluate(() => {
      const ai = document.querySelector('.ai-trigger-gen-btn[data-target="sb-focus-aiwilldo"]');
      return !!(ai && ai.nextElementSibling && ai.nextElementSibling.classList.contains("ai-field-pick-btn"));
    });
    ok(!aiWillDoHasPick, "ai_will_do field is correctly skipped (no pick button)");

    // Open the picker from the 'available' field → defaults to the Triggers tab.
    await page.evaluate(() => document.querySelector('.ai-trigger-gen-btn[data-target="sb-focus-available"]').nextElementSibling.click());
    await page.waitForSelector("#novaTokenPickerOverlay", { timeout: 15000 });
    const tab = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll("#novaTokenPickerOverlay [data-tab]")];
      // defaultTab=triggers → the triggers tab should be highlighted (gradient bg)
      const trg = tabs.find((t) => t.dataset.tab === "triggers");
      return { has: !!trg, rows: document.querySelectorAll("#novaTokenPickerOverlay [data-name]").length };
    });
    ok(tab.has && tab.rows > 0, "picker opened with a Triggers tab and rows", tab);

    // Search a real trigger and insert it.
    await page.evaluate(() => {
      const s = document.querySelector("#novaTokenPickerOverlay [data-search]");
      s.value = "has_war"; s.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(
      () => [...document.querySelectorAll('#novaTokenPickerOverlay [data-name]')].some((r) => r.getAttribute("data-name") === "has_war"),
      { timeout: 4000 }
    );
    await page.evaluate(() => document.querySelector('#novaTokenPickerOverlay [data-name="has_war"]').click());
    const inserted = await page.evaluate(() => document.getElementById("sb-focus-available").value);
    ok(/has_war/.test(inserted), "chosen trigger inserted into the 'available' field", inserted);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e.message || e));
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) { console.error(`\ne2e-focus-trigger-picker: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-focus-trigger-picker: all checks passed");
})();
