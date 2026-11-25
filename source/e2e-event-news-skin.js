// The Event maker's live preview is event-TYPE aware: a `news_event` renders as HOI4's real "World News"
// newspaper (event_news_bg backdrop, centred TYPEWRITER headline, justified column, dark bronze option bars
// — EventWindow_News), while a `country_event` renders as the parchment REPORT window pinned by a binder
// clip (event_report_top_win/_tileable_midsection/_bottom_win_2 as a 3-slice — EventWindow). This asserts
// the skin toggles both ways (is-news ⇄ is-report), loads each art mod-aware, and positions the newspaper
// photo into the masthead frame. Run: npm run test:event-news-skin
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== EVENT NEWS SKIN (country_event parchment ⇄ news_event newspaper) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newsskin-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  const PORT = 3713, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const setType = (v) => page.evaluate((val) => { const t = document.getElementById("eventType"); t.value = val; t.dispatchEvent(new Event("change", { bubbles: true })); }, v);
  // async: the art check below decodes each resolved url rather than trusting that a string was assigned.
  const boxInfo = () => page.evaluate(async () => {
    const b = document.getElementById("previewEventBox");
    const cs = getComputedStyle(b);
    const h = document.getElementById("previewEventTitle"); const hcs = getComputedStyle(h);
    const fr = document.querySelector("#previewEventBox .hoi4-event-img-frame"); const frcs = getComputedStyle(fr);
    const photo = document.getElementById("previewEventImage");
    const bb = b.getBoundingClientRect(), fb = fr.getBoundingClientRect();
    // The report renders EITHER as the gui-driven stage (.ev-gui, when the mod's eventwindow.gui geometry
    // is available) OR the legacy .is-report skin (fallback). Either counts as "the report window".
    const isGui = b.classList.contains("ev-gui");
    const stage = b.querySelector(".ev-stage");
    // ⚠️ "A url( STRING WAS ASSIGNED" IS NOT "THE ART LOADED".
    //
    // This backed the assertion "real event_news_bg art is loaded as the backdrop" while only checking that
    // some element's inline style contained `url(`. That is true whether or not the image ever arrived, so
    // the check would pass with every sprite 404ing — exactly the blind-coverage shape this project has hit
    // before, where a coverage test stayed green with all 22 icons broken because it never fetched the url.
    //
    // Resolve the url and confirm it actually decodes. Also fails if the stage fell back to its art-failed
    // state, which is the visible half of the same problem.
    const artFailed = !!(stage && stage.dataset.artFailed === "1");
    const urls = isGui
      ? Array.from(b.querySelectorAll(".ev-deco"))
          .map((d) => (/url\("?([^")]+)"?\)/.exec(d.style.backgroundImage || "") || [])[1])
          .filter(Boolean)
      : [(/url\("?([^")]+)"?\)/.exec(cs.backgroundImage) || [])[1]].filter(Boolean);
    const decoded = await Promise.all(urls.map((u) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im.naturalWidth > 0);
      im.onerror = () => res(false);
      im.src = u;
    })));
    const reportArt = urls.length > 0 && decoded.some(Boolean) && !artFailed;
    return {
      photoVisible: getComputedStyle(photo).visibility !== "hidden" && !!photo.getAttribute("src"),
      isNews: b.classList.contains("is-news"),
      isReport: b.classList.contains("is-report"),
      isGui, hasStage: !!stage, reportMode: b.classList.contains("is-report") || (isGui && !!stage), reportArt,
      bg: cs.backgroundImage,
      ratio: bb.width / bb.height,
      titleAlign: hcs.textAlign,
      titleFont: hcs.fontFamily,
      framePos: frcs.position,
      frameLeftPct: (fb.left - bb.left) / bb.width,
      frameTopPct: (fb.top - bb.top) / bb.height,
      frameWidthPct: fb.width / bb.width,
    };
  });

  try {
    await page.goto(`${BASE}/events.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#previewEventBox", { timeout: 15000 });
    // ⚠️ WAIT FOR THE PAGE TO GO QUIET BEFORE DRIVING IT.
    //
    // The gui stage only renders once the window layouts have been fetched and the backdrop sprites
    // converted. On a WARM icon cache that is near-instant, so switching type immediately worked and this
    // test passed for years. On a COLD cache — a fresh install, a new contributor, CI, or any run under the
    // suite's app-data sandbox — the first .dds conversions take long enough that the 15s waitForFunction
    // below expires before the stage exists, and the failure reads as "news does not render through the gui
    // stage" when the truth is "the test did not wait".
    //
    // Verified as pre-existing rather than assumed: reverting public/events.js to HEAD and running with a
    // cold app-data directory fails identically. Same shape as the fixed 1.8s sleep in e2e-ai.js — a
    // duration tuned on one machine standing in for a condition.
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});

    // Force the in-box photo visible so the masthead-frame geometry is measurable (no picture → frame hidden).
    const showPhoto = () => page.evaluate(() => {
      const pid = document.getElementById("eventPictureId"); pid.value = "GFX_test_pic";
      const img = document.getElementById("previewEventImage");
      img.src = location.origin + "/api/vanilla-ui?rel=gfx/interface/event_news_bg.dds"; img.style.visibility = "visible";
      const fr = img.closest(".hoi4-event-img-frame"); if (fr) fr.style.display = "";
    });

    // ── Default is a country_event → REPORT window (gui-driven stage, or the legacy parchment skin) ──
    let info = await boxInfo();
    ok("default country_event: box renders the report window (not the newspaper)", info.reportMode === true && info.isNews === false, { reportMode: info.reportMode, gui: info.isGui, report: info.isReport, news: info.isNews });

    // ── Switch to news_event → newspaper skin loads ──
    await setType("news_event");
    // #newspaper-preview-ignores-the-mods-own-layout — this block used to assert the hand-built CSS skin:
    // the is-news class, and the photo frame at 11.2% / 15.3% / 75.6% of the box. Those percentages were
    // copied from vanilla, and the newspaper was the ONE event type that did not read the active mod's
    // eventwindow.gui — it bailed out whenever the backdrop sprite was GFX_event_news_bg, on the reasoning
    // that a standard backdrop meant a standard window.
    //
    // It does not. A mod can keep that sprite and still move everything inside it, and two of the four
    // installed corpora that keep it do: Millennium Dawn puts its headline at x=35 maxWidth=444 against
    // vanilla's x=12 maxWidth=490, and its body at x=52 maxWidth=405 format=left against vanilla's x=39
    // maxWidth=460. So an MD author previewed their newspaper at vanilla's proportions.
    //
    // News now goes through the same gui-driven renderer as every other event type. These assertions
    // therefore compare the rendered pixels against what the .gui ACTUALLY SAYS, fetched from the same
    // endpoint the page uses — derived, so it stays true whichever mod is loaded rather than pinning one
    // mod's numbers into a test.
    await page.waitForFunction(() => {
      const b = document.getElementById("previewEventBox");
      return b.classList.contains("ev-gui") && !!b.querySelector(".ev-stage");
    }, null, { timeout: 15000 });
    info = await boxInfo();
    ok("news_event: renders through the gui stage, like every other event type", info.isGui === true && info.hasStage === true,
      { isGui: info.isGui, hasStage: info.hasStage });
    ok("news_event: real event_news_bg art is loaded as the backdrop", info.reportArt === true);
    ok("news_event: box keeps the 528:595 newspaper aspect (~0.887)", Math.abs(info.ratio - (528 / 595)) < 0.03, info.ratio);

    // The whole point: the drawn geometry must equal the geometry the .gui declares for THIS mod.
    const guiVsDrawn = await page.evaluate(async () => {
      const mp = localStorage.getItem("activeModPath") || "";
      const r = await fetch("/api/events/window-layouts?modPath=" + encodeURIComponent(mp)).then((x) => x.json());
      const nl = (r && (r.layouts || r)) ? ((r.layouts || r).EventWindow_News || null) : null;
      const el = (id) => document.getElementById(id);
      const px = (n, p) => (n ? Math.round(parseFloat(getComputedStyle(n)[p])) : null);
      const t = el("previewEventTitle"), d = el("previewEventDesc");
      return {
        gui: nl && nl.elements ? nl.elements : nl,
        drawnTitle: { left: px(t, "left"), top: px(t, "top"), width: px(t, "width") },
        drawnDesc: { left: px(d, "left"), top: px(d, "top"), width: px(d, "width") },
      };
    });
    const pick = (g, name) => {
      const list = Array.isArray(guiVsDrawn.gui) ? guiVsDrawn.gui : (guiVsDrawn.gui ? Object.values(guiVsDrawn.gui) : []);
      return list.find((e) => e && String(e.name || "").toLowerCase() === name) || null;
    };
    const gTitle = pick(guiVsDrawn.gui, "title"), gDesc = pick(guiVsDrawn.gui, "description");
    // A control: if the layout cannot be read, the comparisons below would pass vacuously against null.
    ok("news_event: the mod's own newspaper layout was readable", !!gTitle && !!gDesc,
      { gotTitle: !!gTitle, gotDesc: !!gDesc });
    if (gTitle && gDesc) {
      ok("news_event: the headline sits where this mod's eventwindow.gui puts it",
        guiVsDrawn.drawnTitle.left === gTitle.x && guiVsDrawn.drawnTitle.top === gTitle.y &&
        guiVsDrawn.drawnTitle.width === gTitle.maxWidth,
        { drawn: guiVsDrawn.drawnTitle, gui: { x: gTitle.x, y: gTitle.y, maxWidth: gTitle.maxWidth } });
      ok("news_event: the body column is this mod's width, not vanilla's",
        guiVsDrawn.drawnDesc.left === gDesc.x && guiVsDrawn.drawnDesc.width === gDesc.maxWidth,
        { drawn: guiVsDrawn.drawnDesc, gui: { x: gDesc.x, maxWidth: gDesc.maxWidth } });
    }

    // With no picture chosen, the photo slot stays EMPTY (no event_news_bg-in-the-newspaper placeholder).
    ok("news_event: empty photo slot when no picture is set (no newspaper-in-newspaper)", info.photoVisible === false, info.photoVisible);
    await showPhoto();
    info = await boxInfo();
    ok("news_event: the photo is placed absolutely inside the stage", info.framePos === "absolute", info.framePos);

    // ── Switch back to country_event → newspaper removed, report window restored ──
    await setType("country_event");
    await page.waitForFunction(() => {
      const b = document.getElementById("previewEventBox");
      const reportMode = b.classList.contains("is-report") || (b.classList.contains("ev-gui") && b.querySelector(".ev-stage"));
      return reportMode && !b.classList.contains("is-news");
    }, null, { timeout: 10000 });
    info = await boxInfo();
    ok("back to country_event: newspaper removed, report window restored", info.isNews === false && info.reportMode === true);
    ok("back to country_event: the report art is the backdrop (not the newspaper)", info.reportArt === true && !/news_bg/i.test(info.bg), { reportArt: info.reportArt, bg: info.bg.slice(0, 60) });

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nEVENT-NEWS-SKIN: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
