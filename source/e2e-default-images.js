// Default preview images on the maker pages must point at vanilla assets that EXIST. characters.html and
// ideas.html used to hardcode a default portrait (gfx/leaders/GER/portrait_ger_adolf_hitler.dds) and advisor
// icon (idea_generic_political_advisor.dds) that 400 on the current game version — a broken placeholder on
// every load, with a CSP-dead onerror pointing at the SAME broken path. They now use idea_unknown.dds. This
// asserts neither page makes a 4xx /api/vanilla-ui request on load, and the bad paths are gone from the HTML.
// Run: npm run test:default-images
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== Maker default preview images (no broken vanilla-ui requests) ===");

  // Static half: the broken default paths must be gone from the HTML.
  const charHtml = fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8");
  const ideaHtml = fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8");
  ok("characters.html no longer defaults to the missing leader portrait", !/portrait_ger_adolf_hitler/.test(charHtml));
  ok("characters.html no longer defaults to the missing advisor icon", !/idea_generic_political_advisor/.test(charHtml));
  ok("ideas.html no longer defaults to the missing advisor icon", !/idea_generic_political_advisor/.test(ideaHtml));
  ok("the broken inline onerror image handlers are gone (characters)", !/onerror=/.test(charHtml));
  ok("the broken inline onerror image handlers are gone (ideas preview img)", !/previewIdeaIcon[^>]*onerror=/.test(ideaHtml));

  // Live half: load each page with an empty mod and assert no 4xx vanilla-ui request fires.
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-defimg-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  const PORT = 3671;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  try {
    for (const p of ["characters.html", "ideas.html"]) {
      const page = await ctx.newPage();
      const bad = [];
      page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/vanilla-ui")) bad.push(r.status() + " " + r.url().slice(r.url().indexOf("rel="))); });
      await page.goto(`http://127.0.0.1:${PORT}/${p}`, { waitUntil: "load", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1200);
      ok(`${p}: no 4xx /api/vanilla-ui request on load`, bad.length === 0, bad.slice(0, 3));
      await page.close();
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDEFAULT-IMAGES: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
