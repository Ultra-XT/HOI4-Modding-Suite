// Regression: a focus can legitimately cost 0 (it completes instantly). Vanilla ships 15 such focuses,
// MD 12, RoN 19. Nova used `focus.cost || 10` in THREE places (load-to-field, field-to-model, and the
// block serializer), and 0 is falsy — so opening a cost-0 focus showed "70 days" and merely hitting Save
// silently rewrote the user's mod from `cost = 0` to `cost = 10`. Math.max(1, …) also made an instant
// focus impossible to author. This test pins the load leg (the one that triggers the corruption) and the
// no-regression leg on a normal-cost focus.
//
// Run: node e2e-focus-cost-zero.js
const fs = require("fs");
const path = require("path");
const os = require("os");

// The server only accepts mod paths under its mods root, so point that at our temp dir BEFORE
// requiring server.js (it reads the env at load time) — otherwise /api/load 400s on the fixture.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focus0-"));
process.env.HOI4_MODS_ROOT = TMP;

const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3559;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

// Self-contained fixture: a tiny focus tree with one cost=0 focus and one cost=10 focus. Written to a
// temp dir so we never touch a real mod (and so the test does not depend on a HOI4 install).
const TREE = `focus_tree = {
\tid = zz_cost_zero_test
\tcountry = {
\t\tfactor = 0
\t}
\tdefault = no

\tfocus = {
\t\tid = ZZ_instant_focus
\t\ticon = GFX_goal_generic_political_pressure
\t\tx = 2
\t\ty = 0
\t\tcost = 0
\t\tavailable_if_capitulated = yes
\t}
\tfocus = {
\t\tid = ZZ_normal_focus
\t\ticon = GFX_goal_generic_political_pressure
\t\tx = 5
\t\ty = 0
\t\tcost = 10
\t\tavailable_if_capitulated = yes
\t}
}
`;

(async () => {
  console.log("=== FOCUS cost=0 ROUND-TRIP E2E ===");
  const tmp = TMP;
  const modDir = path.join(tmp, "zz_cost_zero_mod");
  const nfDir = path.join(modDir, "common", "national_focus");
  fs.mkdirSync(nfDir, { recursive: true });
  fs.writeFileSync(path.join(modDir, "descriptor.mod"), 'name="ZZ Cost Zero Test"\nsupported_version="1.14.*"\n', "utf8");
  const treePath = path.join(nfDir, "zz_cost_zero.txt");
  fs.writeFileSync(treePath, TREE, "utf8");

  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(([mod, f]) => {
    try {
      localStorage.setItem("activeModPath", mod);
      localStorage.setItem("lastLoadedFocusFilePath", f);
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
    } catch (_) {}
  }, [modDir, treePath]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll("[data-focus-id]").length >= 2, { timeout: 25000 });
    await page.waitForTimeout(800);

    const daysFor = async (focusId) => {
      const loc = page.locator(`.node[data-focus-id="${focusId}"]`).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      await loc.click({ timeout: 8000, force: true });
      await page.waitForTimeout(500);
      return page.evaluate(() => (document.getElementById("sb-focus-cost") || {}).value);
    };

    // The bug: `(focus.cost || 10) * 7` turned a real 0 into 70.
    const zeroDays = await daysFor("ZZ_instant_focus");
    ok(String(zeroDays) === "0", "cost=0 focus loads as 0 days (not the 70-day default)", zeroDays);

    // Guard against over-correcting: a normal focus must still show cost*7 days.
    const normalDays = await daysFor("ZZ_normal_focus");
    ok(String(normalDays) === "70", "cost=10 focus still loads as 70 days", normalDays);

    ok(errs.length === 0, "no uncaught page errors", errs.slice(0, 2));
  } catch (e) {
    ok(false, "e2e threw: " + (e && e.message));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(failed === 0 ? "RESULT: PASS" : `RESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
