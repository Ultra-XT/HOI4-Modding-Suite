// Continuous-focus LOCK vs CONDITIONAL display (#4): a continuous focus that merely has requirements (e.g.
// Naval Production, available after 10 focuses) BECOMES available in-game — it must NOT look locked. Only a
// FORCE-HIDDEN focus (available = { always = no }) is truly off. This builds a palette with three focuses —
// always-on, conditional-but-satisfiable, force-hidden — and asserts: the conditional one is full-opacity
// with an "IF" marker (no padlock), the hidden one is dimmed with a 🔒, the always-on one has neither.
// Run: npm run test:continuous-focus-lock
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3565, BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

const FOCUS_TREE = `focus_tree = {
	id = test_focus_tree
	country = { factor = 0 modifier = { add = 10 tag = GER } }
	focus = { id = test_focus_a icon = GFX_goal_generic_construct_civ_factory x = 0 y = 0 cost = 10 completion_reward = { add_political_power = 50 } }
}
`;
// cf_always: no requirements → always shown. cf_cond: a satisfiable requirement → conditional (NOT locked).
// cf_hidden: available = { always = no } → force-hidden (locked).
const PALETTE = `continuous_focus_palette = {
	id = test_pal
	country = { factor = 1 }
	default = yes
	position = { x = 60 y = 80 }
	focus = { id = cf_always icon = GFX_goal_continuous_suppression available = { } modifier = { resistance_target = -0.05 } daily_cost = 1 }
	focus = { id = cf_cond icon = GFX_goal_continuous_repairments available = { num_of_factories > 10 } modifier = { industry_repair_factor = 0.5 } daily_cost = 1 }
	focus = { id = cf_hidden icon = GFX_goal_continuous_suppression available = { always = no } modifier = { resistance_target = -0.02 } daily_cost = 1 }
}
`;

(async () => {
  console.log("=== CONTINUOUS FOCUS LOCK-vs-CONDITIONAL (#4) ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cflock-"));
  fs.mkdirSync(path.join(mod, "common", "national_focus"), { recursive: true });
  fs.mkdirSync(path.join(mod, "common", "continuous_focus"), { recursive: true });
  const treePath = path.join(mod, "common", "national_focus", "test_focus_tree.txt");
  fs.writeFileSync(treePath, FOCUS_TREE, "utf8");
  fs.writeFileSync(path.join(mod, "common", "continuous_focus", "generic.txt"), PALETTE, "utf8");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.setItem("activeModPath", m); localStorage.setItem("nova_cf_panel_collapsed", "0"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Read a tile's rendered state: opacity + which badge it carries.
  const tile = (i) => page.evaluate((idx) => {
    const el = document.querySelector(`#cfPanel [data-cf-focus="${idx}"]`);
    if (!el) return null;
    const ifBadge = Array.from(el.querySelectorAll("span")).some((s) => s.textContent.trim() === "IF");
    return { opacity: parseFloat(getComputedStyle(el).opacity), hasLock: el.textContent.indexOf("🔒") >= 0, hasIf: ifBadge };
  }, i);

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async (p) => { document.getElementById("filePath").value = p; await window.loadContinuousFocusPanel(); }, treePath);
    await page.waitForSelector("#cfPanel [data-cf-focus]", { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#cfPanel [data-cf-focus]').length >= 3, { timeout: 8000 }).catch(() => {});

    const always = await tile(0), cond = await tile(1), hidden = await tile(2);
    ok(!!(always && cond && hidden), "all three continuous-focus tiles render", { always, cond, hidden });

    // cf_always — neither badge, full opacity.
    ok(always.hasLock === false && always.hasIf === false, "always-on focus: no padlock, no IF badge", always);
    ok(always.opacity >= 0.95, "always-on focus: full opacity", always.opacity);

    // cf_cond — the key fix: a satisfiable requirement is NOT locked.
    ok(cond.hasLock === false, "conditional focus is NOT shown as locked (no 🔒)", cond);
    ok(cond.hasIf === true, "conditional focus shows the subtle IF marker instead", cond);
    ok(cond.opacity >= 0.95, "conditional focus stays FULL opacity (not dimmed like a disabled one)", cond.opacity);

    // cf_hidden — a force-hidden focus IS locked + dimmed.
    ok(hidden.hasLock === true, "force-hidden focus (always = no) shows the 🔒", hidden);
    ok(hidden.hasIf === false, "force-hidden focus does not get the IF marker", hidden);
    ok(hidden.opacity <= 0.6, "force-hidden focus is dimmed", hidden.opacity);

    // Header counts distinguish conditional from hidden.
    const header = await page.$eval("#cfPanel", (el) => el.textContent || "");
    ok(/1 conditional/.test(header) && /1 hidden/.test(header), "header counts: 1 conditional · 1 hidden", header.slice(0, 200));

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  if (failed) { console.error(`\ncontinuous-focus-lock: ${failed} FAILED`); process.exit(1); }
  console.log("\ncontinuous-focus-lock: all checks passed");
})();
