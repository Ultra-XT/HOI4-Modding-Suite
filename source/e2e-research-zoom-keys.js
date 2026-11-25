// Research canvas Z/X zoom must not silently die. The Z (out) / X (in) shortcuts are ignored while the
// user is typing in a field — but the old guard counted a focused <select> as "a field", and the
// mod/country/folder dropdowns KEEP focus after a pick, so after using a dropdown Z/X stopped zooming
// until you clicked away or restarted the app (the reported bug). The fix narrows the guard to genuine
// text entry (text-like <input>, <textarea>, contentEditable) — a <select>/<button>/checkbox no longer
// blocks zoom. This exercises that rule (window.__novaIsTextEntryTarget). Run: npm run test:research-zoom-keys
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== RESEARCH Z/X zoom guard (don't let a focused dropdown kill zoom) ===");
  const PORT = 3737, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const isField = (tag, type, ce) => page.evaluate(([t, ty, c]) =>
    window.__novaIsTextEntryTarget({ tagName: t, getAttribute: (k) => (k === "type" ? ty : null), isContentEditable: !!c }), [tag, type, ce]);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaIsTextEntryTarget === "function", null, { timeout: 20000 });
    ok("zoom-guard rule is exposed for testing", true);

    // A focused dropdown must NOT block zoom (the bug).
    ok("a <select> is NOT a text-entry field (zoom works after using a dropdown)", (await isField("SELECT", null, false)) === false);
    // Buttons / checkboxes / radios don't block either.
    ok("a <button> is not a text-entry field", (await isField("BUTTON", null, false)) === false);
    ok("a checkbox <input> is not a text-entry field", (await isField("INPUT", "checkbox", false)) === false);
    ok("a range <input> is not a text-entry field", (await isField("INPUT", "range", false)) === false);
    // Genuine typing surfaces DO block, so Z/X never hijack text you're entering.
    ok("a text <input> IS a text-entry field", (await isField("INPUT", "text", false)) === true);
    ok("an <input> with no type (defaults to text) IS a text-entry field", (await isField("INPUT", null, false)) === true);
    ok("a <textarea> IS a text-entry field", (await isField("TEXTAREA", null, false)) === true);
    ok("a contentEditable element IS a text-entry field", (await isField("DIV", null, true)) === true);

    // Live end-to-end: a Z/X keydown TARGETED at a <select> still changes the zoom %.
    const before = await page.evaluate(() => (document.getElementById("researchZoomLabel") || {}).textContent);
    await page.evaluate(() => { const s = document.querySelector("select"); if (s) s.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true })); });
    const after = await page.evaluate(() => (document.getElementById("researchZoomLabel") || {}).textContent);
    ok("a Z/X keydown on a <select> still zooms the canvas", before !== after, { before, after });

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-ZOOM-KEYS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
