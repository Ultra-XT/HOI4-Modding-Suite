// DEEP Character maker round-trip through the REAL UI + save endpoint: build a country-leader character
// from scratch (token, name, ideology, expire, traits), Save, verify the on-disk
// common/characters/<file>.txt (characters → <token> → country_leader with ideology/traits) AND the
// generated localisation, RELOAD, reopen it from the list (search → click), verify the round-trip, then
// EDIT it (ideology + traits), Save again, and verify the edit landed in exactly one character block.
// Completes the maker round-trip sweep (events/decisions/ideas/characters). Run: npm run test:character-save-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
// /api/characters/list (and several text endpoints) resolve user paths through the allowed-roots check, so
// point HOI4_MODS_ROOT at a temp workspace BEFORE requiring server.js (MODS_ROOT resolves at load) and put
// the temp mod under it — exactly how a real mod lives under the mod workspace. See [[e2e-mod-fixture-gotchas]].
const MODS_PARENT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modroot-"));
process.env.HOI4_MODS_ROOT = MODS_PARENT;
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const FILE = "custom_characters.txt";
const charFile = (mod) => path.join(mod, "common", "characters", FILE);
const readChars = (mod) => fs.existsSync(charFile(mod)) ? fs.readFileSync(charFile(mod), "utf8") : "";
const allLoc = (mod) => {
  let out = "";
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) out += fs.readFileSync(p, "utf8") + "\n"; } };
  for (const base of ["localisation", "localization"]) walk(path.join(mod, base));
  return out;
};
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; };

(async () => {
  console.log("=== CHARACTER SAVE DEEP (country leader: create → save → disk+loc → reload → reopen → edit → save) ===");
  const mod = fs.mkdtempSync(path.join(MODS_PARENT, "charmod-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Character Save Deep E2E"\n');
  const PORT = 3718, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Character Save Deep E2E" }] }) }));

  const setVal = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); if (!el) return; el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  const checkRole = (id) => page.evaluate((i) => { const cb = document.getElementById(i); cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }, id);
  const saveAndWait = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/characters\/save/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }),
      page.click("#saveCharBtn"),
    ]);
    return { status: resp.status(), body: await resp.json().catch(() => ({})) };
  };

  try {
    await page.goto(`${BASE}/characters.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveCharBtn", { timeout: 15000 });
    // The page's async init resets the form when it completes. Filling fields before that lands means they
    // are silently blanked, Save then reports "Token required", and no request is ever made — which surfaces
    // only as a waitForResponse timeout. Wait for init to finish before touching the form.
    await page.waitForFunction(() => {
      const t = document.getElementById("chToken");
      if (!t) return false;
      t.value = "__probe__";
      return true;
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const t = document.getElementById("chToken"); if (t) t.value = ""; });

    // ── Build a country-leader character from scratch ──
    await setVal("chToken", "test_leader");
    await setVal("chName", "Otto von Example");
    await setVal("chFile", FILE);
    await checkRole("roleLeader");
    await setVal("leaderIdeology", "despotism");
    await setVal("leaderExpire", "1965.1.1");
    await setVal("leaderTraits", "warmonger");
    await setVal("charGender", "female");

    const save1 = await saveAndWait();
    ok("save #1 returned ok", save1.status === 200 && !save1.body.error, save1);

    // ── Verify on disk ──
    const txt = readChars(mod);
    ok("disk: common/characters/custom_characters.txt written", txt.length > 0);
    ok("disk: characters wrapper present", /characters\s*=\s*\{/.test(txt));
    ok("disk: the character block test_leader = {", /test_leader\s*=\s*\{/.test(txt));
    ok("disk: country_leader role block present", /country_leader\s*=\s*\{/.test(txt));
    ok("disk: ideology = despotism", /ideology\s*=\s*despotism/.test(txt));
    ok("disk: traits { warmonger }", /traits\s*=\s*\{[^}]*warmonger/.test(txt), txt.slice(0, 300));
    ok("disk: gender = female written", /gender\s*=\s*female/.test(txt), txt.slice(0, 300));
    ok("disk: brace-balanced", balanced(txt));
    ok("loc: character name text generated", /Otto von Example/.test(allLoc(mod)), allLoc(mod).slice(0, 160));

    // ── RELOAD then reopen the character from the list (search → click) ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveCharBtn", { timeout: 15000 });
    await page.waitForSelector("#charsListSearch", { timeout: 15000 });
    // The character list loads async; re-apply the filter in-page until the card renders (avoids a race).
    let appeared = true;
    try {
      await page.waitForFunction(() => {
        const s = document.getElementById("charsListSearch");
        if (s && s.value !== "test_leader") { s.value = "test_leader"; s.dispatchEvent(new Event("input", { bubbles: true })); }
        return !!document.querySelector(".ch-card");
      }, null, { timeout: 20000 });
    } catch (_) { appeared = false; }
    ok("reload: the saved character shows in the list after a fresh load", appeared);
    await page.click(".ch-card");
    await page.waitForFunction(() => document.getElementById("chToken") && document.getElementById("chToken").value === "test_leader", null, { timeout: 15000 });
    ok("reload: character reopened from the list (token restored)", true);
    ok("reload: ideology round-trips (despotism)", await page.evaluate(() => document.getElementById("leaderIdeology").value) === "despotism", await page.evaluate(() => document.getElementById("leaderIdeology").value));
    ok("reload: traits round-trip (warmonger)", /warmonger/.test(await page.evaluate(() => document.getElementById("leaderTraits").value)));
    ok("reload: gender round-trips (female)", await page.evaluate(() => document.getElementById("charGender").value) === "female");

    // ── EDIT: change the ideology and traits, flip gender back to male, Save again ──
    // A SUB-ideology, not the group: vanilla's `fascism` is a group whose types are fascism_ideology,
    // emperor_fascism, falangism… and country_leader takes a type. Nova refuses the group on purpose.
    await setVal("leaderIdeology", "fascism_ideology");
    await setVal("leaderTraits", "nervous_leader");
    await setVal("charGender", ""); // male — should DROP the gender line (vanilla omits gender = male)
    const save2 = await saveAndWait();
    ok("save #2 (edit) returned ok", save2.status === 200 && !save2.body.error, save2);

    const txt2 = readChars(mod);
    ok("disk: gender line removed when set back to male", !/gender\s*=/.test(txt2), txt2.slice(0, 300));
    ok("disk: ideology updated to fascism_ideology", /ideology\s*=\s*fascism_ideology/.test(txt2) && !/ideology\s*=\s*despotism/.test(txt2));
    ok("disk: traits updated (nervous_leader)", /traits\s*=\s*\{[^}]*nervous_leader/.test(txt2));
    ok("disk: still exactly one test_leader block (edit, not duplicate)", (txt2.match(/test_leader\s*=\s*\{/g) || []).length === 1, (txt2.match(/test_leader\s*=\s*\{/g) || []).length);
    ok("disk: still exactly one characters wrapper", (txt2.match(/characters\s*=\s*\{/g) || []).length === 1);
    ok("disk: brace-balanced after edit", balanced(txt2));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(MODS_PARENT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCHARACTER-SAVE-DEEP: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
