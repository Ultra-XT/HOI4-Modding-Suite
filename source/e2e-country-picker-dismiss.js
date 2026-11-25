// Country Setup picker modals (spirit / tech) must dismiss the way everyone tries: Escape OR a click on the
// dim backdrop — not only the ✕ — while a click INSIDE the dialog keeps it open. Run: npm run test:country-picker-dismiss
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pickerdismiss-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Picker Dismiss"\n');
  return mod;
}

(async () => {
  console.log("=== Country Setup picker dismissal (Esc + backdrop) E2E ===");
  const mod = buildMod();
  const PORT = 3667, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const disp = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).display, id);
  const open = (id) => page.evaluate((i) => { document.getElementById(i).style.display = "block"; }, id);
  const esc = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const backdrop = (id) => page.evaluate((i) => { const m = document.getElementById(i); m.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }, id);
  const inside = (id) => page.evaluate((i) => { const c = document.querySelector("#" + i + " .modal-content"); (c || document.getElementById(i)).dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }, id);

  try {
    await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
    // The pickers are wired in init(); wait for the dismiss wiring to land.
    await page.waitForFunction(() => { const m = document.getElementById("spiritPickerModal"); return m && m.dataset.dismissWired === "1"; }, null, { timeout: 30000 });
    ok("spirit + tech picker dismissal is wired on load", await page.evaluate(() => document.getElementById("spiritPickerModal").dataset.dismissWired === "1" && document.getElementById("techPickerModal").dataset.dismissWired === "1"));

    for (const id of ["spiritPickerModal", "techPickerModal"]) {
      const label = id === "spiritPickerModal" ? "spirit" : "tech";
      await open(id);
      ok(`${label} picker: opens`, (await disp(id)) === "block");
      await inside(id);
      ok(`${label} picker: clicking inside keeps it open`, (await disp(id)) === "block");
      await esc();
      ok(`${label} picker: Escape closes it`, (await disp(id)) === "none");
      await open(id);
      await backdrop(id);
      ok(`${label} picker: backdrop click closes it`, (await disp(id)) === "none");
    }

    // Focus-on-open: opening the spirit picker via Browse should focus its search box so you can type at once.
    const picked = await page.evaluate(() => { const it = document.querySelector("#csCountryList .cs-country-item"); if (it) { it.click(); return true; } return false; });
    if (picked) {
      await page.waitForFunction(() => getComputedStyle(document.getElementById("csPanel")).display !== "none", null, { timeout: 15000 }).catch(() => {});
      await page.click("#csBrowseSpiritBtn").catch(() => {});
      await page.waitForTimeout(150);
      ok("opening the spirit picker focuses its search box", await page.evaluate(() => document.activeElement && document.activeElement.id === "spiritPickerSearch"));
    } else {
      // ⛔ #a-skip-the-e2e-runner-cannot-hear-reads-as-a-pass — said as a SKIP line of its own, which run-e2e.js hears. This was
      // ok("(skipped …)", true), printed "  ok  (skipped …)": counted as a passed check, and the file read "✓ … All green" while
      // the check never ran (round 2's review ran it: this fixture's mod owns no country, so the list never offers one).
      console.log("  SKIP focus-on-open — the list offers no country to pick (this fixture's mod owns none)");
    }

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-PICKER-DISMISS E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
