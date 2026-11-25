// CSP-safe image fallback: inline onerror="this.src=…" is blocked by the page CSP (script-src 'self'), so a
// missing thumbnail/preview image used to show the browser's broken-image glyph. The maker pages now mark
// images with data-fallback="…" and a single capture-phase "error" listener swaps to it. Asserts the
// conversion (no inline onerror left) + a runtime fallback on each converted page. Run: npm run test:img-fallback
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// [js file, html page, an id present once the page is ready, a fallback filename it uses]
const PAGES = [
  ["events.js", "events.html", "eventPicturePreview", "event_news_bg.dds"],
  ["decisions.js", "decisions.html", "decisionPicturePreview", "decision_generic_decision.dds"],
  ["ideas.js", "ideas.html", "ideaPicturePreview", "idea_unknown.dds"],
  ["research.js", "research.html", "newTechBtn", "idea_unknown.dds"],
  ["characters.js", "characters.html", "newCharBtn", "idea_unknown.dds"],
  ["app.js", "index.html", "addFocusBtn", "idea_unknown.dds"], // focus-tree page
];

(async () => {
  console.log("=== CSP-safe image fallback (maker pages) ===");

  // Static: each converted file dropped inline onerror= and uses data-fallback + the capture-phase listener.
  for (const [jsFile] of PAGES) {
    const src = fs.readFileSync(path.join(__dirname, "public", jsFile), "utf8");
    ok(`${jsFile}: no inline onerror= remains`, !/onerror=/.test(src));
    ok(`${jsFile}: marks images with data-fallback=`, /data-fallback=/.test(src));
    ok(`${jsFile}: installs a capture-phase "error" listener`, /addEventListener\("error"/.test(src) && /\}, true\)/.test(src));
  }
  // country-setup.js uses the data-fallback-html variant (a broken tech icon becomes a 🔬 emoji).
  {
    const cs = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
    ok("country-setup.js: no inline onerror= remains", !/onerror=/.test(cs));
    ok("country-setup.js: uses data-fallback-html for the icon→emoji fallback", /data-fallback-html=/.test(cs));
    ok('country-setup.js: installs a capture-phase "error" listener', /addEventListener\("error"/.test(cs) && /\}, true\)/.test(cs));
  }

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-imgfb-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  const PORT = 3677, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  try {
    for (const [, htmlPage, readyId, fallbackFile] of PAGES) {
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      try {
        await page.goto(`${BASE}/${htmlPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((rid) => !!document.getElementById(rid), readyId, { timeout: 30000 });
        const swapped = await page.evaluate((fb) => new Promise((resolve) => {
          const good = location.origin + "/api/vanilla-ui?rel=gfx/interface/" + fb;
          const img = document.createElement("img");
          img.dataset.fallback = good;
          img.src = location.origin + "/api/vanilla-ui?rel=gfx/DOES_NOT_EXIST_zzz.dds"; // 4xx → error event
          document.body.appendChild(img);
          let n = 0;
          const iv = setInterval(() => { n++; if (img.src.indexOf(fb) >= 0) { clearInterval(iv); img.remove(); resolve(true); } else if (n > 25) { clearInterval(iv); img.remove(); resolve(false); } }, 200);
        }), fallbackFile);
        ok(`${htmlPage}: a broken image with data-fallback swaps to the fallback at runtime`, swapped === true);
        ok(`${htmlPage}: no uncaught page errors` + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
      } finally { await page.close(); }
    }

    // country-setup.js: a broken image with data-fallback-html is REPLACED by that markup (the 🔬 emoji).
    {
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      try {
        await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!document.getElementById("csCreateCountryBtn"), null, { timeout: 30000 });
        const replaced = await page.evaluate(() => new Promise((resolve) => {
          const host = document.createElement("div");
          host.innerHTML = `<img src="${location.origin}/api/vanilla-ui?rel=gfx/DOES_NOT_EXIST_zzz.dds" data-fallback-html="🔬" />`;
          document.body.appendChild(host);
          let n = 0;
          const iv = setInterval(() => { n++; if (!host.querySelector("img") && host.textContent.indexOf("🔬") >= 0) { clearInterval(iv); host.remove(); resolve(true); } else if (n > 25) { clearInterval(iv); host.remove(); resolve(false); } }, 200);
        }));
        ok("country-setup.html: a broken image with data-fallback-html is replaced by the 🔬 emoji at runtime", replaced === true);
        ok("country-setup.html: no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
      } finally { await page.close(); }
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nIMG-FALLBACK: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
