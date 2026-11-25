// Research tech BOX SIZE rule (#1B, revised by 0a21681): HOI4 shows a tech with the WIDE/regular item iff it
// unlocks EQUIPMENT — and "unlocks equipment" = enable_equipments ONLY. The earlier reading of the wiki
// (subunits/modules also wide, dfa627a) was DISPROVEN in-game: vanilla `paratroopers` is enable_subunits-only
// and renders as a SMALL square. This loads research.html and exercises the real rule
// (window.__novaIsLargeTech) over each case. Run: npm run test:research-boxsize
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== RESEARCH BOX SIZE (wide/small rule vs the wiki) ===");
  const PORT = 3725, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const isLarge = (tech) => page.evaluate((t) => window.__novaIsLargeTech(t), tech);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaIsLargeTech === "function", null, { timeout: 20000 });
    ok("box-size rule is exposed for testing", true);

    // WIDE: any of the three "unlocks equipment" signals.
    ok("enable_equipments → WIDE", (await isLarge({ enableEquipments: ["inf_eq"] })) === true);
    // In-game verified (0a21681): subunit/module-only unlocks are SMALL — vanilla `paratroopers`
    // (enable_subunits-only) renders as the small square; only enable_equipments widens the box.
    ok("enable_subunits (in extraScript) → SMALL  [paratroopers, in-game verified]", (await isLarge({ extraScript: "enable_subunits = {\n  infantry\n}" })) === false);
    ok("enable_equipment_modules (in extraScript) → SMALL", (await isLarge({ extraScript: "enable_equipment_modules = {\n  module = x\n}" })) === false);

    // SMALL: nothing unlocked.
    ok("no unlocks (doctrine/bonus tech) → SMALL", (await isLarge({ extraScript: "research_bonus = { }" })) === false);
    ok("empty tech → SMALL", (await isLarge({})) === false);

    // Overrides: force-small + sub-tech are always SMALL even when they unlock equipment.
    ok("force_use_small_tech_layout → SMALL even with equipment", (await isLarge({ enableEquipments: ["x"], forceSmallLayout: true })) === false);
    ok("sub-technology → SMALL even with a subunit unlock", (await isLarge({ isSubTech: true, extraScript: "enable_subunits = { infantry }" })) === false);

    // show_equipment_icon must NOT make it wide (wiki: it only affects the tooltip).
    ok("show_equipment_icon alone → SMALL (does not affect size)", (await isLarge({ extraScript: "show_equipment_icon = yes" })) === false);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-BOXSIZE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
