// DEEP Event maker round-trip through the REAL UI + save endpoint: build a news_event from scratch (type,
// title, description, is_triggered_only, two options with effects), click Save, verify the .txt AND the
// generated localisation on disk, RELOAD the page (the saved event auto-reopens), verify it round-trips
// (incl. the news newspaper skin), then EDIT it (change a title, edit one option's script, add a third
// option), Save again, and verify the edit landed while the untouched option survived. The unit tests cover
// the save HELPERS; this covers the whole browser→endpoint→disk→reload loop. Run: npm run test:event-save-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const NS = "deep_news";
const evtFile = (mod) => path.join(mod, "events", NS + ".txt");
const readEvt = (mod) => fs.existsSync(evtFile(mod)) ? fs.readFileSync(evtFile(mod), "utf8") : "";
// Loc is written under localisation/english/*.yml — walk the whole tree so we find it wherever it lands.
const allLoc = (mod) => {
  let out = "";
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) out += fs.readFileSync(p, "utf8") + "\n"; } };
  for (const base of ["localisation", "localization"]) walk(path.join(mod, base));
  return out;
};

(async () => {
  console.log("=== EVENT SAVE DEEP (create news_event → save → disk+loc → reload → edit → save → verify) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtsave-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Event Save Deep E2E"\n');
  const PORT = 3714, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  // events.js initModSelector falls back to the first real mod (and overwrites localStorage) if our temp
  // mod isn't in /api/mods/list — which would aim Save at the vanilla dir. Surface only the temp mod.
  await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Event Save Deep E2E" }] }) }));

  const setVal = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  // fill the inputs of the Nth (0-based) .event-option row (ai / trig optional)
  const fillOption = (idx, name, title, script, ai, trig) => page.evaluate(([i, n, t, s, a, tr]) => {
    const row = document.querySelectorAll(".event-option")[i];
    const setI = (sel, v) => { const el = row.querySelector(sel); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
    setI(".opt-name", n); setI(".opt-title", t); setI(".opt-script", s);
    if (a != null) setI(".opt-ai-chance", a);
    if (tr != null) setI(".opt-trigger", tr);
  }, [idx, name, title, script, ai == null ? null : String(ai), trig == null ? null : trig]);
  const saveAndWait = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/events\/save/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }),
      page.click("#saveEventBtn"),
    ]);
    return { status: resp.status(), body: await resp.json().catch(() => ({})) };
  };

  try {
    await page.goto(`${BASE}/events.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveEventBtn", { timeout: 15000 });

    // ── Build a news_event from scratch ──
    await setVal("eventNamespace", NS);
    await setVal("eventId", "1");
    await setVal("eventType", "news_event");
    await setVal("eventTitle", "Government Collapses Amid Crisis");
    await setVal("eventDescription", "The ruling coalition has dissolved overnight.");
    if (await page.$("#eventTriggeredOnly")) await setVal("eventTriggeredOnly", "yes");
    await page.click("#addOptionBtn");
    await page.click("#addOptionBtn");
    await fillOption(0, `${NS}.1.a`, "Restore order", "add_stability = 0.05", 15, "has_war = no");
    await fillOption(1, `${NS}.1.b`, "Seize the moment", "add_political_power = 120");
    ok("two option rows present", (await page.$$(".event-option")).length === 2);
    // The newspaper is drawn by the shared gui stage now, not a bespoke CSS class, so it reads the active
    // mod's own eventwindow.gui like every other event type. #newspaper-preview-ignores-the-mods-own-layout
    ok("preview is wearing the newspaper window", await page.evaluate(() => {
      const b = document.getElementById("previewEventBox");
      return b.classList.contains("ev-gui") && !!b.querySelector(".ev-stage");
    }));

    const save1 = await saveAndWait();
    ok("save #1 returned ok", save1.status === 200 && !save1.body.error, save1);

    // ── Verify on disk: the .txt ──
    const txt = readEvt(mod);
    ok("disk: events/deep_news.txt was written", txt.length > 0);
    ok("disk: add_namespace = deep_news", /add_namespace\s*=\s*deep_news/.test(txt));
    ok("disk: a news_event block with id deep_news.1", /news_event\s*=\s*\{[\s\S]*id\s*=\s*deep_news\.1/.test(txt), txt.slice(0, 120));
    ok("disk: is_triggered_only = yes", /is_triggered_only\s*=\s*yes/.test(txt));
    ok("disk: option a present with its effect", /name\s*=\s*deep_news\.1\.a/.test(txt) && /add_stability\s*=\s*0\.05/.test(txt));
    ok("disk: option b present with its effect", /name\s*=\s*deep_news\.1\.b/.test(txt) && /add_political_power\s*=\s*120/.test(txt));
    ok("disk: option a ai_chance base written", /ai_chance\s*=\s*\{\s*base\s*=\s*15/.test(txt), txt);
    ok("disk: option a trigger written", /trigger\s*=\s*\{[\s\S]*?has_war\s*=\s*no/.test(txt));
    ok("disk: option trigger did NOT leak to the event level (exactly one trigger block)", (txt.match(/\btrigger\s*=\s*\{/g) || []).length === 1, (txt.match(/\btrigger\s*=\s*\{/g) || []).length);
    ok("disk: file is brace-balanced", (() => { let d = 0; for (const c of txt) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; })());

    // ── Verify the generated English localisation ──
    const loc = allLoc(mod);
    ok("loc: title text generated", /Government Collapses Amid Crisis/.test(loc), loc.slice(0, 200));
    ok("loc: description text generated", /The ruling coalition has dissolved overnight\./.test(loc));
    ok("loc: option a text generated", /Restore order/.test(loc));

    // ── RELOAD from scratch, then reopen the saved event from the list (search expands its folder) ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#saveEventBtn", { timeout: 15000 });
    await page.waitForSelector("#eventsListSearch", { timeout: 15000 });
    await page.evaluate(() => { const s = document.getElementById("eventsListSearch"); s.value = "deep_news"; s.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForSelector(".event-item-card", { timeout: 15000 });
    await page.click(".event-item-card");
    await page.waitForFunction(() => document.getElementById("eventTitle") && document.getElementById("eventTitle").value.indexOf("Government Collapses") >= 0, null, { timeout: 15000 });
    ok("reload: saved event reopened from the list (title restored)", true);
    ok("reload: type is still news_event", await page.evaluate(() => document.getElementById("eventType").value) === "news_event");
    ok("reload: both options restored", (await page.$$(".event-option")).length === 2, (await page.$$(".event-option")).length);
    ok("reload: option a ai_chance + trigger restored to their own fields, effects box not duplicated", await page.evaluate(() => {
      const row = document.querySelectorAll(".event-option")[0];
      const ai = row.querySelector(".opt-ai-chance"), tr = row.querySelector(".opt-trigger"), sc = row.querySelector(".opt-script");
      return ai && ai.value === "15" && tr && /has_war\s*=\s*no/.test(tr.value) && sc && !/ai_chance|trigger/.test(sc.value);
    }));
    ok("reload: preview re-applied the newspaper window on load", await page.evaluate(() => {
      const b = document.getElementById("previewEventBox");
      return b.classList.contains("ev-gui") && !!b.querySelector(".ev-stage");
    }));

    // ── EDIT: change the title, edit option b's script, add a third option ──
    await setVal("eventTitle", "Coalition Falls — Capital in Turmoil");
    await fillOption(1, `${NS}.1.b`, "Seize the moment", "add_political_power = 200");
    await page.click("#addOptionBtn");
    await fillOption(2, `${NS}.1.c`, "Call elections", "add_stability = -0.10");
    const save2 = await saveAndWait();
    ok("save #2 (edit) returned ok", save2.status === 200 && !save2.body.error, save2);

    const txt2 = readEvt(mod);
    ok("disk: edited option b effect landed (PP now 200)", /add_political_power\s*=\s*200/.test(txt2) && !/add_political_power\s*=\s*120/.test(txt2));
    ok("disk: untouched option a survived the edit", /name\s*=\s*deep_news\.1\.a/.test(txt2) && /add_stability\s*=\s*0\.05/.test(txt2));
    ok("disk: new third option c added", /name\s*=\s*deep_news\.1\.c/.test(txt2) && /add_stability\s*=\s*-0\.10/.test(txt2));
    ok("disk: exactly one news_event block (edit replaced, not duplicated)", (txt2.match(/news_event\s*=\s*\{/g) || []).length === 1, (txt2.match(/news_event\s*=\s*\{/g) || []).length);
    ok("disk: still brace-balanced after edit", (() => { let d = 0; for (const c of txt2) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; })());
    ok("loc: edited title text generated", /Coalition Falls — Capital in Turmoil/.test(allLoc(mod)));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nEVENT-SAVE-DEEP: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
