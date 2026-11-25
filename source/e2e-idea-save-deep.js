// DEEP National Spirit (idea) maker round-trip through the REAL UI + upsert endpoint: build a country
// national spirit from scratch (id, name, description, a modifier), Save, verify the on-disk
// common/ideas/<file>.txt (ideas → country → <id> with the modifier) AND the generated localisation,
// RELOAD, reopen it from the list (search → click), verify the round-trip, then EDIT the modifier, Save
// again, and verify the edit landed in exactly one idea block. Mirrors e2e-event/decision-save-deep.
// Run: npm run test:idea-save-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
// /api/ideas/catalog resolves its `sourcePath` (the active mod) through resolveAllowedModDirectory, which
// only allows dirs under the mod workspace / workshop / game install — a bare os.tmpdir() mod is rejected
// and the catalog 400s (empty list). The real app's mods live under MODS_ROOT, so point HOI4_MODS_ROOT at a
// temp workspace BEFORE requiring server.js (MODS_ROOT is resolved at load) and put the temp mod under it.
const MODS_PARENT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modroot-"));
process.env.HOI4_MODS_ROOT = MODS_PARENT;
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const FILE = "custom_ideas.txt";
const ideasFile = (mod) => path.join(mod, "common", "ideas", FILE);
const readIdeas = (mod) => fs.existsSync(ideasFile(mod)) ? fs.readFileSync(ideasFile(mod), "utf8") : "";
const allLoc = (mod) => {
  let out = "";
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) out += fs.readFileSync(p, "utf8") + "\n"; } };
  for (const base of ["localisation", "localization"]) walk(path.join(mod, base));
  return out;
};
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; };

(async () => {
  console.log("=== IDEA SAVE DEEP (country national spirit: create → save → disk+loc → reload → reopen → edit → save) ===");
  const mod = fs.mkdtempSync(path.join(MODS_PARENT, "ideamod-")); // under the temp mod workspace (allowed)
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Idea Save Deep E2E"\n');
  const PORT = 3717, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Idea Save Deep E2E" }] }) }));

  const setVal = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); if (!el) return; el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  const saveAndWait = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/ideas\/upsert-definition/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }),
      page.click("#saveIdeaBtn"),
    ]);
    return { status: resp.status(), body: await resp.json().catch(() => ({})) };
  };

  try {
    await page.goto(`${BASE}/ideas.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveIdeaBtn", { timeout: 15000 });

    // ── Build a country national spirit from scratch ──
    await setVal("ideaTargetFile", FILE);
    await setVal("ideaCategory", "country");
    await setVal("ideaId", "test_spirit");
    await setVal("ideaName", "Spirit of Reform");
    await setVal("ideaDescription", "The nation embraces sweeping change.");
    await setVal("ideaModifiers", "stability_factor = 0.10");

    const save1 = await saveAndWait();
    ok("save #1 returned ok", save1.status === 200 && !save1.body.error, save1);

    // ── Verify on disk ──
    const txt = readIdeas(mod);
    ok("disk: common/ideas/custom_ideas.txt written", txt.length > 0);
    ok("disk: ideas wrapper present", /ideas\s*=\s*\{/.test(txt));
    ok("disk: country category present", /country\s*=\s*\{/.test(txt));
    ok("disk: the spirit block test_spirit = {", /test_spirit\s*=\s*\{/.test(txt));
    ok("disk: modifier { stability_factor = 0.10 }", /modifier\s*=\s*\{[\s\S]*stability_factor\s*=\s*0\.10/.test(txt), txt.slice(0, 200));
    ok("disk: brace-balanced", balanced(txt));
    ok("loc: spirit name text generated", /Spirit of Reform/.test(allLoc(mod)), allLoc(mod).slice(0, 160));

    // ── RELOAD then reopen the spirit from the list (search expands its category) ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveIdeaBtn", { timeout: 15000 });
    await page.waitForSelector("#ideasListSearch", { timeout: 15000 });
    // The spirits catalog loads async after reload; re-apply the filter until the item renders.
    let appeared = false;
    for (let i = 0; i < 40 && !appeared; i++) {
      await page.evaluate(() => { const s = document.getElementById("ideasListSearch"); s.value = "test_spirit"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      appeared = (await page.$(".decision-item")) !== null;
      if (!appeared) await new Promise((r) => setTimeout(r, 250));
    }
    ok("reload: the saved spirit shows in the list after a fresh catalog load", appeared);
    await page.click(".decision-item");
    await page.waitForFunction(() => {
      const id = document.getElementById("ideaId"); const m = document.getElementById("ideaModifiers");
      return id && id.value === "test_spirit" && m && /stability_factor/.test(m.value);
    }, null, { timeout: 15000 });
    ok("reload: spirit reopened from the list (id restored)", true);
    ok("reload: modifier round-trips", /stability_factor\s*=\s*0\.10/.test(await page.evaluate(() => document.getElementById("ideaModifiers").value)));

    // ── EDIT: change the modifier, Save again ──
    await setVal("ideaModifiers", "political_power_gain = 0.25");
    const save2 = await saveAndWait();
    ok("save #2 (edit) returned ok", save2.status === 200 && !save2.body.error, save2);

    const txt2 = readIdeas(mod);
    ok("disk: edited modifier landed (political_power_gain = 0.25)", /political_power_gain\s*=\s*0\.25/.test(txt2));
    ok("disk: old modifier replaced (stability_factor gone)", !/stability_factor\s*=\s*0\.10/.test(txt2));
    ok("disk: still exactly one test_spirit block (edit, not duplicate)", (txt2.match(/test_spirit\s*=\s*\{/g) || []).length === 1, (txt2.match(/test_spirit\s*=\s*\{/g) || []).length);
    ok("disk: brace-balanced after edit", balanced(txt2));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(MODS_PARENT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nIDEA-SAVE-DEEP: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
