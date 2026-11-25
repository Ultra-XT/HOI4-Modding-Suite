// Research GAME-FOLDER orientation must mirror the game's own GUI. MD's nsb_armour_folder lays out
// VERTICALLY (era runs DOWN, year rail down the left). An earlier build let the orientation toggle
// persist a choice that FOUGHT the GUI, so the Armour tab could get stuck "Horizontal" (era sideways)
// across sessions — the "by default it's sideways, but in game it's downward" bug. The fix derives a
// game folder's default from the GUI and runs a one-time per-mod migration that drops any saved override
// CONTRADICTING the GUI orientation. This exercises that pure rule (window.__novaStaleOrientKeys).
// Run: npm run test:research-orientation
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== RESEARCH game-folder orientation migration (match the game) ===");
  const PORT = 3733, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const stale = (tabs, ov) => page.evaluate(([t, o]) => window.__novaStaleOrientKeys(t, o), [tabs, ov]);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaStaleOrientKeys === "function", null, { timeout: 20000 });
    ok("orientation-migration rule is exposed for testing", true);

    // GUI says nsb_armour is vertical; a saved 'horizontal' override contradicts it → must be cleared.
    const armourTabs = [{ key: "ftab_nsb_armour_folder", layout: "vertical" }, { key: "ftab_infantry_folder", layout: "vertical" }];
    ok("an override that fights the GUI orientation is flagged stale",
      JSON.stringify(await stale(armourTabs, { ftab_nsb_armour_folder: "horizontal" })) === JSON.stringify(["ftab_nsb_armour_folder"]));

    // An override that AGREES with the GUI is not stale (no-op).
    ok("an override matching the GUI orientation is kept",
      (await stale(armourTabs, { ftab_nsb_armour_folder: "vertical" })).length === 0);

    // No override → nothing to clear.
    ok("a game folder with no override is left alone", (await stale(armourTabs, {})).length === 0);

    // Only the contradicting folder is cleared; an agreeing sibling override is preserved.
    ok("only the contradicting folder is flagged (sibling kept)",
      JSON.stringify(await stale(armourTabs, { ftab_nsb_armour_folder: "horizontal", ftab_infantry_folder: "vertical" })) === JSON.stringify(["ftab_nsb_armour_folder"]));

    // Defensive: a tab with no known GUI layout is never cleared (we can't say the override is wrong).
    ok("a tab with unknown GUI layout is never flagged",
      (await stale([{ key: "ftab_custom", layout: null }], { ftab_custom: "horizontal" })).length === 0);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-ORIENTATION: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
