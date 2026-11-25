// A NAME IS OFTEN NOT PLAIN TEXT, and it must survive an unchanged Save in all three makers.
//
// 8.5% of vanilla's 122,583 english localisation values START with something the game resolves at runtime
// — a [ROOT.GetNameDefCap] scope token, a $POLITICAL_POWER$ reference, a §Y colour code. The user saw those
// raw in the name box and reported it as "the name is (root.something) not just a name".
//
// Two things have to hold at once, and they pull in opposite directions:
//   1. DISPLAY must be readable — the sidebar, the preview and the new hint show the stripped text;
//   2. the EDIT BOX and the SAVED .yml must keep the RAW value, or an untouched Save would write the
//      stripped name over the author's token. That is the silent data loss this guards against.
//
// Driven through the real pages in a browser, so what gets tested is the CLIENT's actual payload rather
// than an idealised one. Throwaway mod; no real mod is touched.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");
const { chromium } = require("playwright");

const TOKEN_TITLE = "§Y[ROOT.GetNameDefCap]§!: Reform the $POLITICAL_POWER$ Ministry";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tok3-"));
fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="tok3"\nsupported_version="1.19.*"\n');

// decisions
fs.mkdirSync(path.join(root, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(root, "common", "decisions", "ZZ_d.txt"),
  "tok_cat = {\n\ttok_dec = {\n\t\ticon = GFX_decision_generic_decision\n\t\tcost = 10\n\t\tavailable = { always = yes }\n\t}\n}\n", "utf8");
// events
fs.mkdirSync(path.join(root, "events"), { recursive: true });
fs.writeFileSync(path.join(root, "events", "ZZ_e.txt"),
  "add_namespace = tokev\n\ncountry_event = {\n\tid = tokev.1\n\ttitle = tokev.1.t\n\tdesc = tokev.1.d\n\tpicture = GFX_report_event_generic_factory\n\tis_triggered_only = yes\n\n\toption = {\n\t\tname = tokev.1.a\n\t}\n}\n", "utf8");
// national spirits (ideas)
fs.mkdirSync(path.join(root, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(root, "common", "ideas", "ZZ_i.txt"),
  "ideas = {\n\tcountry = {\n\t\ttok_spirit = {\n\t\t\tpicture = generic_communism_drift_bonus\n\t\t\tallowed = { always = no }\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n\t}\n}\n", "utf8");

const locDir = path.join(root, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const LOC = "\ufeffl_english:\n" + [
  ` tok_dec:0 "${TOKEN_TITLE}"`,
  ' tok_dec_desc:0 "A decision tooltip."',
  ` tokev.1.t:0 "${TOKEN_TITLE}"`,
  ' tokev.1.d:0 "An event body."',
  ' tokev.1.a:0 "So be it."',
  ` tok_spirit:0 "${TOKEN_TITLE}"`,
  ' tok_spirit_desc:0 "A spirit tooltip."',
  "",
].join("\n");
fs.writeFileSync(path.join(locDir, "AAA_tok_l_english.yml"), LOC, "utf8");
const locNow = () => fs.readFileSync(path.join(locDir, "AAA_tok_l_english.yml"), "utf8");
const valueOf = (key) => {
  const all = fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
  const m = new RegExp("^[ \\t]*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ':\\d*[ \\t]*"(.*)"', "m").exec(all);
  return m ? m[1] : null;
};

const PORT = 39591, app = createApp();
const server = app.listen(PORT, async () => {
  let pass = 0, total = 0;
  const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.log("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };
  const browser = await chromium.launch();
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", (e) => errs.push("UNCAUGHT: " + e.message));
    const openPage = async (file) => {
      await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "domcontentloaded" });
      await page.evaluate((m) => localStorage.setItem("activeModPath", m), root);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2600);
    };
    const clickContaining = async (sel, text) => {
      for (const h of await page.$$(sel)) {
        const t = (await h.textContent()) || "";
        if (t.includes(text)) { await h.click({ force: true }); await page.waitForTimeout(900); return true; }
      }
      return false;
    };
    const dismiss = async () => {
      for (let i = 0; i < 4; i++) {
        const b = await page.$('#novaConfirmModalOverlay [data-act="ok"]');
        if (b) { await b.click(); await page.waitForTimeout(400); continue; }
        const got = await page.$('button:has-text("Got it")');
        if (got) { await got.click(); await page.waitForTimeout(400); continue; }
        break;
      }
    };

    // ── DECISIONS ─────────────────────────────────────────────────────────────────────────────────
    await openPage("decisions.html");
    for (const t of await page.$$(".category-title")) { await t.click(); await page.waitForTimeout(150); }
    ok("decision listed", await clickContaining(".decision-item", "tok_dec"));
    const dBox = await page.$eval("#decisionName", (e) => e.value).catch(() => null);
    ok("decisions: name box holds the RAW token string", dBox === TOKEN_TITLE, dBox);
    const dHint = await page.$eval("#decisionNameRendered", (e) => ({ shown: e.style.display !== "none", text: e.textContent })).catch(() => null);
    ok("decisions: the rendered hint is shown", dHint && dHint.shown && /In game this reads: Reform the Ministry/.test(dHint.text), dHint);
    await page.click("#saveDecisionBtn"); await page.waitForTimeout(1800); await dismiss();
    ok("decisions: the token name is byte-identical on disk", valueOf("tok_dec") === TOKEN_TITLE, valueOf("tok_dec"));
    ok("decisions: its tooltip survived", valueOf("tok_dec_desc") === "A decision tooltip.", valueOf("tok_dec_desc"));

    // ── EVENTS ────────────────────────────────────────────────────────────────────────────────────
    await openPage("events.html");
    for (const t of await page.$$(".category-title")) { await t.click(); await page.waitForTimeout(150); }
    const eFound = await clickContaining(".event-item-card", "tokev.1");
    const eBox = await page.$eval("#eventTitle", (e) => e.value).catch(() => null);
    ok("events: an event was opened", eFound || !!eBox, { eFound, eBox });
    ok("events: title box holds the RAW token string", eBox === TOKEN_TITLE, eBox);
    const eHint = await page.$eval("#eventTitleRendered", (e) => ({ shown: e.style.display !== "none", text: e.textContent })).catch(() => null);
    ok("events: the rendered hint is shown", eHint && eHint.shown && /In game this reads: Reform the Ministry/.test(eHint.text), eHint);
    const eSave = await page.$("#saveEventBtn");
    if (eSave) { await eSave.click(); await page.waitForTimeout(2000); await dismiss(); }
    ok("events: the token title is byte-identical on disk", valueOf("tokev.1.t") === TOKEN_TITLE, valueOf("tokev.1.t"));
    ok("events: the body survived", valueOf("tokev.1.d") === "An event body.", valueOf("tokev.1.d"));

    // ── NATIONAL SPIRITS ──────────────────────────────────────────────────────────────────────────
    await openPage("ideas.html");
    for (const t of await page.$$(".category-title")) { await t.click(); await page.waitForTimeout(150); }
    const sFound = await clickContaining(".decision-item", "tok_spirit");
    const sBox = await page.$eval("#ideaName", (e) => e.value).catch(() => null);
    ok("spirits: a spirit was opened", sFound || !!sBox, { sFound, sBox });
    ok("spirits: name box holds the RAW token string", sBox === TOKEN_TITLE, sBox);
    const sHint = await page.$eval("#ideaNameRendered", (e) => ({ shown: e.style.display !== "none", text: e.textContent })).catch(() => null);
    ok("spirits: the rendered hint is shown", sHint && sHint.shown && /In game this reads: Reform the Ministry/.test(sHint.text), sHint);
    const sSave = await page.$("#saveIdeaBtn");
    if (sSave) { await sSave.click(); await page.waitForTimeout(2200); await dismiss(); }
    ok("spirits: the token name is byte-identical on disk", valueOf("tok_spirit") === TOKEN_TITLE, valueOf("tok_spirit"));
    ok("spirits: its tooltip survived", valueOf("tok_spirit_desc") === "A spirit tooltip.", valueOf("tok_spirit_desc"));

    ok("no uncaught page errors", errs.length === 0, errs.slice(0, 4));
    console.log("\n" + pass + "/" + total + " checks passed");
    console.log("\nfinal loc file:\n" + locNow());
  } catch (e) { console.error("ERROR", e); }
  finally {
    await browser.close().catch(() => {});
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {} server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
