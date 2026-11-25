// Verifies the National Spirit (Ideas) Maker's "Duplicate" button: with a spirit in the form,
// Duplicate makes an editable copy — fresh "<id>_copy" + "(copy)" name — leaving the rest of the form
// intact, so Save creates a NEW spirit (original untouched). Run: node e2e-idea-clone.js
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3548;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

(async () => {
  console.log("=== IDEA (SPIRIT) CLONE E2E ===");
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
    await page.goto(`${BASE}/ideas.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#duplicateIdeaBtn", { timeout: 10000 });
    ok(true, "Duplicate button is present");

    const warned = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("ideaId").value = "";
      document.getElementById("duplicateIdeaBtn").click();
      return /load or select a national spirit first/i.test(window.__msg || "");
    });
    ok(warned, "Duplicate on an empty form warns instead of acting");

    const res = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("ideaId").value = "my_spirit";
      const n = document.getElementById("ideaName"); if (n) n.value = "My Spirit";
      const mod = document.getElementById("ideaModifiers"); if (mod) mod.value = "stability_factor = 0.1";
      document.getElementById("duplicateIdeaBtn").click();
      return {
        id: document.getElementById("ideaId").value,
        name: document.getElementById("ideaName") ? document.getElementById("ideaName").value : "",
        mod: document.getElementById("ideaModifiers") ? document.getElementById("ideaModifiers").value : "",
        msg: window.__msg || "",
      };
    });
    ok(res.id === "my_spirit_copy", "Duplicate assigns a fresh id (my_spirit_copy)", res.id);
    ok(/\(copy\)/i.test(res.name), "Duplicate marks the name with (copy)", res.name);
    ok(res.mod === "stability_factor = 0.1", "Duplicate leaves the rest of the form intact (modifier kept)", res.mod);
    ok(/untouched/i.test(res.msg), "Duplicate confirms the original is untouched", res.msg);

    const res2 = await page.evaluate(() => { document.getElementById("duplicateIdeaBtn").click(); return document.getElementById("ideaId").value; });
    ok(/^my_spirit_copy\d*$/.test(res2) && res2 !== "my_spirit_copy_copy", "re-duplicating doesn't stack _copy_copy", res2);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e.message || e));
  } finally {
    await browser.close();

    try { fs.rmSync(cloneModRoot, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  if (failed) { console.error(`\ne2e-idea-clone: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-idea-clone: all checks passed");
})();
