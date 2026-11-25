// Country Setup percentage fields clamp to 0–100 as you type. HTML min/max only validate on form submit, so
// without this "150" would silently save as 150% stability. Covers stability, war support, and the ideology
// popularity boxes (caught by delegation, incl. dynamically built ones). Run: npm run test:country-clamp
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clamp-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Clamp"\n');
  return mod;
}

(async () => {
  console.log("=== Country Setup percentage clamp E2E ===");
  const mod = buildMod();
  const PORT = 3669, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Type a value into an input and return what it becomes after the input handler runs.
  const typeVal = (sel, v) => page.evaluate(({ s, val }) => { const el = document.querySelector(s); if (!el) return "missing"; el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); return el.value; }, { s: sel, val: v });

  try {
    await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.getElementById("csStability"), null, { timeout: 30000 });

    ok("stability 150 → clamped to 100", (await typeVal("#csStability", "150")) === "100");
    ok("stability -5 → clamped to 0", (await typeVal("#csStability", "-5")) === "0");
    ok("stability 60 (valid) → unchanged", (await typeVal("#csStability", "60")) === "60");
    ok("stability empty allowed while typing", (await typeVal("#csStability", "")) === "");
    ok("war support 999 → clamped to 100", (await typeVal("#csWarSupport", "999")) === "100");
    ok("war support 35 (valid) → unchanged", (await typeVal("#csWarSupport", "35")) === "35");
    // An ideology popularity box (delegation on #popularityGrid catches it).
    ok("popularity 500 → clamped to 100", (await typeVal('[data-ideology-input="1"]', "500")) === "100");
    ok("popularity 25 (valid) → unchanged", (await typeVal('[data-ideology-input="1"]', "25")) === "25");

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-CLAMP E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
