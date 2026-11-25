// Verifies the Decision Maker's "Duplicate" button logic: with a decision in the form, clicking
// Duplicate turns it into an editable copy — a fresh "<id>_copy" id and a "(copy)" name — without
// otherwise changing the form, so Save then creates a NEW decision (the original is untouched).
// The save→disk path itself reuses the maker's normal save (covered by e2e-full-mod). Run: node e2e-decision-clone.js
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3543;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

(async () => {
  console.log("=== DECISION CLONE E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  // A throwaway mod, SELECTED. Without activeModPath the maker falls back to the vanilla install, which is
  // read-only, and the write-lock disables Duplicate — a live button that silently swallows the click, so
  // every assertion below fails while "button is present" passes. #vanilla-ro
  const cloneModRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clone-"));
  fs.writeFileSync(path.join(cloneModRoot, "descriptor.mod"), 'name="CloneFixture"\nsupported_version="1.18.*"\n', "utf8");
  await ctx.addInitScript((mp) => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.setItem("activeModPath", mp); } catch (_) {} }, cloneModRoot);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#duplicateDecisionBtn", { timeout: 10000 });
    ok(true, "Duplicate button is present");

    // Empty form: Duplicate should warn (not silently create a broken copy).
    const warnedOnEmpty = await page.evaluate(() => {
      window.__nbAlertMsg = null;
      window.nbAlert = (m) => { window.__nbAlertMsg = m; };
      document.getElementById("decisionId").value = "";
      document.getElementById("duplicateDecisionBtn").click();
      return /load or select a decision first/i.test(window.__nbAlertMsg || "");
    });
    ok(warnedOnEmpty, "Duplicate on an empty form warns instead of acting");

    // Populate the form as if a decision were loaded, then Duplicate.
    const res = await page.evaluate(() => {
      window.__nbAlertMsg = null;
      window.nbAlert = (m) => { window.__nbAlertMsg = m; };
      document.getElementById("decisionId").value = "my_dec";
      const nameEl = document.getElementById("decisionName");
      if (nameEl) nameEl.value = "My Decision";
      const effEl = document.getElementById("decisionEffect");
      if (effEl) effEl.value = "add_political_power = 100";
      document.getElementById("duplicateDecisionBtn").click();
      return {
        id: document.getElementById("decisionId").value,
        name: nameEl ? nameEl.value : "",
        effect: effEl ? effEl.value : "",
        msg: window.__nbAlertMsg || "",
      };
    });
    ok(res.id === "my_dec_copy", "Duplicate assigns a fresh id (my_dec_copy)", res.id);
    ok(/\(copy\)/i.test(res.name), "Duplicate marks the name with (copy)", res.name);
    ok(res.effect === "add_political_power = 100", "Duplicate leaves the rest of the form intact (effect kept)", res.effect);
    ok(/untouched/i.test(res.msg), "Duplicate confirms the original is untouched", res.msg);

    // Duplicate again from the copy → no double "_copy_copy", stays a clean copyN.
    const res2 = await page.evaluate(() => {
      document.getElementById("duplicateDecisionBtn").click();
      return document.getElementById("decisionId").value;
    });
    ok(/^my_dec_copy\d*$/.test(res2) && res2 !== "my_dec_copy_copy", "re-duplicating doesn't stack _copy_copy", res2);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e.message || e));
  } finally {
    await browser.close();

    try { fs.rmSync(cloneModRoot, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  if (failed) { console.error(`\ne2e-decision-clone: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-decision-clone: all checks passed");
})();
