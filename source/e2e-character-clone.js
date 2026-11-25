// Verifies the Character Maker's "Duplicate" button: with a character in the form, Duplicate makes an
// editable copy — fresh "<token>_copy" + "(copy)" name — leaving the rest of the form intact, so Save
// creates a NEW character (original untouched). Run: node e2e-character-clone.js
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3549;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

(async () => {
  console.log("=== CHARACTER CLONE E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/characters.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#duplicateCharBtn", { timeout: 10000 });
    ok(true, "Duplicate button is present");

    const warned = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("chToken").value = "";
      document.getElementById("duplicateCharBtn").click();
      return /load or select a character first/i.test(window.__msg || "");
    });
    ok(warned, "Duplicate on an empty form warns instead of acting");

    const res = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("chToken").value = "my_general";
      const n = document.getElementById("chName"); if (n) n.value = "My General";
      const tr = document.getElementById("generalTraits"); if (tr) tr.value = "inspirational_leader";
      document.getElementById("duplicateCharBtn").click();
      return {
        token: document.getElementById("chToken").value,
        name: document.getElementById("chName") ? document.getElementById("chName").value : "",
        traits: document.getElementById("generalTraits") ? document.getElementById("generalTraits").value : "",
        msg: window.__msg || "",
      };
    });
    ok(res.token === "my_general_copy", "Duplicate assigns a fresh token (my_general_copy)", res.token);
    ok(/\(copy\)/i.test(res.name), "Duplicate marks the name with (copy)", res.name);
    ok(res.traits === "inspirational_leader", "Duplicate leaves the rest of the form intact (traits kept)", res.traits);
    ok(/untouched/i.test(res.msg), "Duplicate confirms the original is untouched", res.msg);

    const res2 = await page.evaluate(() => { document.getElementById("duplicateCharBtn").click(); return document.getElementById("chToken").value; });
    ok(/^my_general_copy\d*$/.test(res2) && res2 !== "my_general_copy_copy", "re-duplicating doesn't stack _copy_copy", res2);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e.message || e));
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) { console.error(`\ne2e-character-clone: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-character-clone: all checks passed");
})();
