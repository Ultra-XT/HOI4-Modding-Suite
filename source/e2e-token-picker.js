// e2e-token-picker.js — verifies the CWTools-derived command PICKER end-to-end in a real browser:
//   - the /api/reference/hoi4-spec endpoint serves tokens
//   - ai-field-assist injects "📋 Pick" buttons next to script fields
//   - clicking one opens the picker, tabs/search work, and clicking a row inserts "<name> = "
//     into the field (the real insertTokenAtCursor path)
// Captures a screenshot of the open picker into a folder of the run's own in temp, and prints where. Run: node e2e-token-picker.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3537;
const BASE = `http://127.0.0.1:${PORT}`;

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pick-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Pick Test"\nsupported_version="*"\n');
  mk("common/decisions/custom.txt", "tst_category = {\n\ttst_decision = { cost = 0 }\n}\n");
  mk("localisation/english/custom_l_english.yml", "﻿l_english:\n TST:0 \"Testland\"\n");
  return mod;
}

let failed = 0;
function ok(cond, msg) { if (cond) console.log("  ok  " + msg); else { console.error("  FAIL " + msg); failed++; } }

(async () => {
  console.log("=== TOKEN PICKER E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((modPath) => {
    try {
      localStorage.setItem("activeModPath", modPath);
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
    } catch (_) {}
  }, mod);

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" });

    // endpoint serves tokens
    const api = await page.evaluate(async () => {
      const r = await fetch("/api/reference/hoi4-spec?type=effects&q=stab");
      const j = await r.json();
      return (j.effects || []).map((e) => e.name);
    });
    ok(api.includes("add_stability"), "endpoint returns add_stability for q=stab");

    // cost-trim predicate: pure-text fields skip the heavy script guidance, script fields keep it
    const ns = await page.evaluate(() => ({
      name: window.novaFieldNeedsScript("name"),
      description: window.novaFieldNeedsScript("description"),
      traits: window.novaFieldNeedsScript("traits"),
      effects: window.novaFieldNeedsScript("effects"),
      modifiers: window.novaFieldNeedsScript("modifiers"),
    }));
    ok(ns.name === false && ns.description === false && ns.traits === false, "text fields → needsScript:false (cost trimmed)");
    ok(ns.effects === true && ns.modifiers === true, "script fields → needsScript:true (guidance kept)");

    // pick buttons were injected next to script fields
    await page.waitForFunction(() => document.querySelectorAll(".ai-field-pick-btn").length > 0, { timeout: 8000 });
    const pickCount = await page.evaluate(() => document.querySelectorAll(".ai-field-pick-btn").length);
    ok(pickCount > 0, `📋 Pick buttons injected (${pickCount})`);

    // open the picker via a real injected button
    await page.evaluate(() => document.querySelector(".ai-field-pick-btn").click());
    await page.waitForSelector("#novaTokenPickerOverlay", { timeout: 15000 });
    ok(true, "picker modal opened");

    const rowCount = await page.evaluate(() => document.querySelectorAll("#novaTokenPickerOverlay [data-name]").length);
    ok(rowCount > 0, `picker lists token rows (${rowCount})`);

    // switch to the Effects tab (deterministic regardless of which field opened it), search, screenshot
    await page.evaluate(() => {
      const t = document.querySelector('#novaTokenPickerOverlay [data-tab="effects"]');
      if (t) t.click();
      const s = document.querySelector("#novaTokenPickerOverlay [data-search]");
      s.value = "add_stability";
      s.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(
      () => {
        const rows = [...document.querySelectorAll('#novaTokenPickerOverlay [data-name]')];
        return rows.some((r) => r.getAttribute("data-name") === "add_stability");
      },
      { timeout: 4000 }
    );
    ok(true, "search filters to add_stability");

    // ⛔ #a-test-names-no-folder-of-the-users — the screenshots go into a folder of this run's own in temp, kept for you to look
    // at. They went into <checkout>\scratch on every run: the owner's checkout, which no runner sandboxes (round 2's review).
    const shots = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-token-picker-shot-"));
    const shot = path.join(shots, "token-picker.png");
    await page.screenshot({ path: shot });
    console.log("  (screenshot -> " + shot + ")");

    // click the row → inserts "add_stability = " into the owning field
    await page.evaluate(() => document.querySelector('#novaTokenPickerOverlay [data-name="add_stability"]').click());
    await page.waitForFunction(() => !document.querySelector("#novaTokenPickerOverlay"), { timeout: 3000 });
    ok(true, "picker closes after choosing");

    const inserted = await page.evaluate(() => {
      const fields = [...document.querySelectorAll("textarea, input")];
      return fields.some((f) => typeof f.value === "string" && f.value.includes("add_stability = "));
    });
    ok(inserted, 'chosen token inserted as "add_stability = " into a field');

    // A BLOCK effect (country_event) should scaffold braces, not just "name = ".
    await page.evaluate(() => document.querySelector(".ai-field-pick-btn").click());
    await page.waitForSelector("#novaTokenPickerOverlay", { timeout: 15000 });
    // recently-used: the just-picked add_stability shows under a "Recently used" group (empty search)
    const recentOk = await page.evaluate(() => {
      const t = document.querySelector('#novaTokenPickerOverlay [data-tab="effects"]');
      if (t) t.click();
      const list = document.querySelector("#novaTokenPickerOverlay [data-list]");
      return /Recently used/i.test(list ? list.textContent : "") &&
        !!document.querySelector('#novaTokenPickerOverlay [data-name="add_stability"]');
    });
    ok(recentOk, "recently-used surfaces the just-picked add_stability");
    await page.evaluate(() => {
      const t = document.querySelector('#novaTokenPickerOverlay [data-tab="effects"]');
      if (t) t.click();
      const s = document.querySelector("#novaTokenPickerOverlay [data-search]");
      s.value = "country_event";
      s.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(
      () => [...document.querySelectorAll('#novaTokenPickerOverlay [data-name]')].some((r) => r.getAttribute("data-name") === "country_event"),
      { timeout: 4000 }
    );
    const ceIsBlock = await page.evaluate(() => document.querySelector('#novaTokenPickerOverlay [data-name="country_event"]').getAttribute("data-block"));
    ok(ceIsBlock === "1", "country_event is marked as a block in the picker");
    await page.evaluate(() => document.querySelector('#novaTokenPickerOverlay [data-name="country_event"]').click());
    const blockInserted = await page.evaluate(() =>
      [...document.querySelectorAll("textarea, input")].some((f) => typeof f.value === "string" && /country_event\s*=\s*\{/.test(f.value))
    );
    ok(blockInserted, 'block effect inserts a "country_event = { … }" scaffold');

    // keyboard navigation: search + Enter inserts the highlighted (first) row, no click needed
    await page.evaluate(() => document.querySelector(".ai-field-pick-btn").click());
    await page.waitForSelector("#novaTokenPickerOverlay", { timeout: 15000 });
    await page.evaluate(() => {
      const t = document.querySelector('#novaTokenPickerOverlay [data-tab="effects"]'); if (t) t.click();
      const s = document.querySelector("#novaTokenPickerOverlay [data-search]");
      s.focus(); s.value = "add_manpower"; s.dispatchEvent(new Event("input", { bubbles: true }));
      s.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await page.waitForFunction(() => !document.querySelector("#novaTokenPickerOverlay"), { timeout: 4000 });
    const kbInserted = await page.evaluate(() => [...document.querySelectorAll("textarea, input")].some((f) => typeof f.value === "string" && /add_manpower/.test(f.value)));
    ok(kbInserted, "keyboard: Enter inserts the highlighted row");

    ok(pageErrors.length === 0, "no uncaught page errors" + (pageErrors.length ? " (" + pageErrors.join("; ") + ")" : ""));

    // ---- Focus editor: the completion_reward effect picker gets a "Browse all commands" entry ----
    const fpage = await ctx.newPage();
    const fErrors = [];
    fpage.on("pageerror", (e) => fErrors.push(String(e.message || e)));
    await fpage.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await fpage.waitForFunction(
      () => typeof window.renderSidebarEffectPickerList === "function" && document.getElementById("sb-effect-picker-list"),
      { timeout: 8000 }
    );
    // render the preset picker and confirm the new browse entry is present
    const hasBrowse = await fpage.evaluate(() => {
      window.renderSidebarEffectPickerList();
      return [...document.querySelectorAll("#sb-effect-picker-list .sb-effect-picker-item")].some((d) =>
        /Browse all HOI4 commands/i.test(d.textContent || "")
      );
    });
    ok(hasBrowse, 'focus picker shows "📋 Browse all HOI4 commands…"');

    // spy on the (global) addEffectToSelectedFocus, then click browse → pick → assert routing
    await fpage.evaluate(() => {
      window.__picked = null;
      window.__pickedBlock = null;
      window.addEffectToSelectedFocus = (name, block) => { window.__picked = name; window.__pickedBlock = block; };
      [...document.querySelectorAll("#sb-effect-picker-list .sb-effect-picker-item")]
        .find((d) => /Browse all HOI4 commands/i.test(d.textContent || ""))
        .click();
    });
    await fpage.waitForSelector("#novaTokenPickerOverlay", { timeout: 15000 });
    const tabCount = await fpage.evaluate(() => document.querySelectorAll("#novaTokenPickerOverlay [data-tab]").length);
    ok(tabCount === 1, `focus picker is effects-only (1 tab, got ${tabCount})`);
    await fpage.screenshot({ path: path.join(shots, "token-picker-focus.png") });
    console.log("  (screenshot -> " + path.join(shots, "token-picker-focus.png") + ")");
    // Pick a BLOCK effect (country_event) so we confirm the block flag flows into the focus reward path
    // (where it scaffolds `country_event = { }` instead of an invalid `country_event = yes`).
    await fpage.evaluate(() => {
      const s = document.querySelector("#novaTokenPickerOverlay [data-search]");
      s.value = "country_event";
      s.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await fpage.waitForFunction(
      () => [...document.querySelectorAll('#novaTokenPickerOverlay [data-name]')].some((r) => r.getAttribute("data-name") === "country_event"),
      { timeout: 4000 }
    );
    await fpage.evaluate(() => document.querySelector('#novaTokenPickerOverlay [data-name="country_event"]').click());
    const routed = await fpage.evaluate(() => window.__picked);
    const routedBlock = await fpage.evaluate(() => window.__pickedBlock);
    ok(routed === "country_event", `pick routes to addEffectToSelectedFocus (got "${routed}")`);
    ok(routedBlock === true, "block flag flows to the focus reward path (so it scaffolds braces, not `= yes`)");
    ok(fErrors.length === 0, "focus page: no uncaught errors" + (fErrors.length ? " (" + fErrors.join("; ") + ")" : ""));
  } catch (e) {
    console.error("  FAIL exception:", e.message || e);
    failed++;
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  if (failed) { console.error(`\ne2e-token-picker: ${failed} check(s) FAILED`); process.exit(1); }
  console.log("\ne2e-token-picker: all checks passed");
})();
