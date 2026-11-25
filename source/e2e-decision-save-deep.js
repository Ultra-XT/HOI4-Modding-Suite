// DEEP Decision maker round-trip through the REAL UI + save endpoint: build a decision from scratch
// (category, id, name, cost, available, complete_effect, days, fire_only_once), Save, verify the on-disk
// common/decisions/<category>.txt AND the generated localisation, RELOAD, reopen it from the list
// (search → click), verify the round-trip, then EDIT it (cost + effect), Save again, and verify the edit
// landed in exactly one category block. Mirrors e2e-event-save-deep for the Decisions tab.
// Run: npm run test:decision-save-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const CAT = "custom_decisions";
const decFile = (mod) => path.join(mod, "common", "decisions", CAT + ".txt");
const readDec = (mod) => fs.existsSync(decFile(mod)) ? fs.readFileSync(decFile(mod), "utf8") : "";
const allLoc = (mod) => {
  let out = "";
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) out += fs.readFileSync(p, "utf8") + "\n"; } };
  for (const base of ["localisation", "localization"]) walk(path.join(mod, base));
  return out;
};
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; };

(async () => {
  console.log("=== DECISION SAVE DEEP (create → save → disk+loc → reload → reopen → edit → save → verify) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decsave-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Decision Save Deep E2E"\n');
  const PORT = 3716, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  // decisions.js initModSelector falls back to the first real mod (and overwrites localStorage) if our temp
  // mod isn't in /api/mods/list — aiming Save at vanilla. Surface only the temp mod.
  await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Decision Save Deep E2E" }] }) }));

  const setVal = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); if (!el) return; el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  const saveAndWait = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/decisions\/save/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }),
      page.click("#saveDecisionBtn"),
    ]);
    return { status: resp.status(), body: await resp.json().catch(() => ({})) };
  };

  try {
    await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveDecisionBtn", { timeout: 15000 });

    // ── Build a decision from scratch ──
    await setVal("decisionCategory", CAT);
    await setVal("decisionId", "test_decision");
    await setVal("decisionName", "Rally the Nation");
    await setVal("decisionType", "normal");
    await setVal("decisionCost", "50");
    await setVal("decisionDays", "30");
    await setVal("decisionFireOnce", "yes");
    await setVal("decisionAvailable", "has_war = no");
    await setVal("decisionEffect", "add_political_power = 100");

    const save1 = await saveAndWait();
    ok("save #1 returned ok", save1.status === 200 && !save1.body.error, save1);

    // ── Verify on disk ──
    const txt = readDec(mod);
    ok("disk: common/decisions/custom_decisions.txt written", txt.length > 0);
    ok("disk: category wrapper custom_decisions = {", /custom_decisions\s*=\s*\{/.test(txt));
    ok("disk: decision block test_decision = {", /test_decision\s*=\s*\{/.test(txt));
    ok("disk: cost = 50", /cost\s*=\s*50/.test(txt));
    ok("disk: fire_only_once = yes", /fire_only_once\s*=\s*yes/.test(txt));
    ok("disk: days_remove = 30", /days_remove\s*=\s*30/.test(txt));
    ok("disk: available { has_war = no }", /available\s*=\s*\{[\s\S]*has_war\s*=\s*no/.test(txt));
    ok("disk: complete_effect { add_political_power = 100 }", /complete_effect\s*=\s*\{[\s\S]*add_political_power\s*=\s*100/.test(txt));
    ok("disk: brace-balanced", balanced(txt), txt.slice(0, 80));
    ok("loc: decision name text generated", /Rally the Nation/.test(allLoc(mod)), allLoc(mod).slice(0, 160));

    // ── RELOAD then reopen the decision from the list (search expands its category) ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveDecisionBtn", { timeout: 15000 });
    await page.waitForSelector("#decisionsListSearch", { timeout: 15000 });
    await page.evaluate(() => { const s = document.getElementById("decisionsListSearch"); s.value = "test_decision"; s.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForSelector(".decision-item", { timeout: 15000 });
    await page.click(".decision-item");
    await page.waitForFunction(() => document.getElementById("decisionId") && document.getElementById("decisionId").value === "test_decision", null, { timeout: 15000 });
    ok("reload: decision reopened from the list (id restored)", true);
    ok("reload: cost round-trips (50)", await page.evaluate(() => document.getElementById("decisionCost").value) === "50", await page.evaluate(() => document.getElementById("decisionCost").value));
    ok("reload: complete_effect round-trips", /add_political_power\s*=\s*100/.test(await page.evaluate(() => document.getElementById("decisionEffect").value)));

    // ── EDIT: change the cost and the effect, Save again ──
    await setVal("decisionCost", "75");
    await setVal("decisionEffect", "add_stability = 0.10");
    const save2 = await saveAndWait();
    ok("save #2 (edit) returned ok", save2.status === 200 && !save2.body.error, save2);

    const txt2 = readDec(mod);
    ok("disk: cost updated to 75", /cost\s*=\s*75/.test(txt2) && !/cost\s*=\s*50/.test(txt2));
    ok("disk: edited effect landed (add_stability = 0.10)", /complete_effect\s*=\s*\{[\s\S]*add_stability\s*=\s*0\.10/.test(txt2));
    ok("disk: old effect replaced (no add_political_power left)", !/add_political_power\s*=\s*100/.test(txt2));
    ok("disk: still exactly one category block (edit, not duplicate)", (txt2.match(/custom_decisions\s*=\s*\{/g) || []).length === 1, (txt2.match(/custom_decisions\s*=\s*\{/g) || []).length);
    ok("disk: still exactly one test_decision block", (txt2.match(/test_decision\s*=\s*\{/g) || []).length === 1);
    ok("disk: brace-balanced after edit", balanced(txt2));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDECISION-SAVE-DEEP: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
