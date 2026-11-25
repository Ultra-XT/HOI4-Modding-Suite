// Maker "New X" buttons should focus (and, where it's a placeholder name, select) the name field, so you can
// type the real name immediately instead of clicking into it first. Covers Decision / Event / National Spirit
// (and Characters already focuses its token field). Run: npm run test:decision-newfocus
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// [page, "New X" button id, name field id, expected placeholder name, expectSelect]
const MAKERS = [
  ["decisions.html", "newDecisionBtn", "decisionName", "New Decision", true],
  ["events.html", "newEventBtn", "eventTitle", "New Event Title", true],
  ["ideas.html", "newIdeaBtn", "ideaName", "New National Spirit", true],
  ["characters.html", "newCharBtn", "chToken", "", false], // focuses the token field (no placeholder to select)
];

(async () => {
  console.log("=== Maker 'New X' focuses the name field ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newfocus-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  const PORT = 3673, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  try {
    for (const [pageName, btnId, nameId, placeholder, expectSelect] of MAKERS) {
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      try {
        await page.goto(`${BASE}/${pageName}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(({ b, n }) => !!document.getElementById(b) && !!document.getElementById(n), { b: btnId, n: nameId }, { timeout: 30000 });
        await page.click("#" + btnId);
        await page.waitForTimeout(150);
        const r = await page.evaluate((nid) => { const el = document.getElementById(nid); return { focused: document.activeElement === el, value: el.value, selStart: el.selectionStart, selEnd: el.selectionEnd }; }, nameId);
        ok(`${pageName}: "${btnId}" focuses #${nameId}`, r.focused === true, r);
        if (placeholder) ok(`${pageName}: placeholder name is "${placeholder}"`, r.value === placeholder, r.value);
        if (expectSelect) ok(`${pageName}: the name text is selected (type to replace)`, r.selStart === 0 && r.selEnd === r.value.length, r);
        ok(`${pageName}: no uncaught page errors` + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
      } finally { await page.close(); }
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAKER-NEWFOCUS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
