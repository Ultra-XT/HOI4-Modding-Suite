// FULL-TREE SNAPSHOT + FIDELITY REPORT (read-only; never writes to any mod).
// Renders research.html in headless Chromium at a huge viewport, zooms to the MINIMUM zoom, unwraps the
// scroll container so the ENTIRE tree is laid out at once, then saves one PNG per folder tab + a JSON
// diagnostic (techs hidden as engine-unplaced, label/box + label/label + year/box collisions).
// Usage: node tree-snap.js <port> <outDir> [tabRegex]
"use strict";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

const PORT = process.argv[2] || "59554";
const OUT = process.argv[3] || ".";
const ONLY = process.argv[4] ? new RegExp(process.argv[4], "i") : null;
// Which mod to snapshot: set NOVA_SNAP_MOD to verify any other mod with the same harness.
const MOD = process.env.NOVA_SNAP_MOD || "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  await page.goto(`http://localhost:${PORT}/research.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate((m) => localStorage.setItem("activeModPath", m), MOD);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.allTechs && window.allTechs.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // Zoom all the way out (the − button floors at its minimum).
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = document.getElementById("researchZoomOut");
    for (let i = 0; i < 30; i++) { btn.click(); await sleep(60); }
  });
  await page.waitForTimeout(600);

  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll(".folder-tab")].map((t) => (t.textContent || "").trim()).filter((t) => !/^\+/.test(t)));

  const report = {};
  for (const name of tabs) {
    if (ONLY && !ONLY.test(name)) continue;
    // switch tab
    await page.evaluate((n) => {
      const t = [...document.querySelectorAll(".folder-tab")].find((x) => (x.textContent || "").trim() === n);
      if (t) t.click();
    }, name);
    await page.waitForTimeout(2200);
    // wait for every label/year glyph image to decode (their size drives collision math)
    await page.waitForFunction(() => {
      const im = [...document.querySelectorAll(".research-gui-label img, .research-gui-year img")];
      return im.length === 0 || im.every((x) => x.complete && x.naturalWidth > 0);
    }, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);

    // UNWRAP: let the scroll container render its full content, so one screenshot holds the whole tree.
    const box = await page.evaluate(() => {
      const c = document.querySelector(".canvas-container");
      const inner = c.firstElementChild;
      c.dataset._oldOverflow = c.style.overflow; c.dataset._oldH = c.style.height; c.dataset._oldW = c.style.width;
      c.style.overflow = "visible";
      c.style.height = c.scrollHeight + "px";
      c.style.width = c.scrollWidth + "px";
      const r = inner.getBoundingClientRect();
      return { w: Math.ceil(c.scrollWidth), h: Math.ceil(c.scrollHeight) };
    });
    // grow the viewport to fit the whole unwrapped tree (cap so we don't blow memory)
    const vw = Math.min(6000, Math.max(1200, box.w + 60));
    const vh = Math.min(6000, Math.max(800, box.h + 60));
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(700);

    const file = path.join(OUT, `tab-${name.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    const el = await page.$(".canvas-container");
    await el.screenshot({ path: file }).catch(async () => { await page.screenshot({ path: file, fullPage: true }); });

    // ---- fidelity diagnostics, computed on the SAME layout that was photographed ----
    const diag = await page.evaluate(async () => {
      const cR = (el) => ({ x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, w: el.offsetWidth, h: el.offsetHeight });
      const over = (a, b) => {
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return ox > 0 && oy > 0 ? { ox: Math.round(ox), oy: Math.round(oy) } : null;
      };
      // INK RECT, not element rect. A label's element is the game's FULL authored textbox — often a wide,
      // mostly-transparent box (naval's battleships header is 600px wide for ~200px of letters), so element
      // overlap massively over-reports: a box sitting in a label's empty right half is NOT a visible clash.
      // Rasterize each glyph PNG and take the alpha bounding box, then translate into canvas coords. Only
      // this measures what a human actually sees, which is what makes the report trustworthy on its own.
      const inkCache = new Map();
      const inkOf = async (img) => {
        if (!img || !img.complete || !img.naturalWidth) return null;
        const key = img.src;
        if (inkCache.has(key)) return inkCache.get(key);
        let res = null;
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              if (d[(y * c.width + x) * 4 + 3] > 16) { // alpha threshold: ignore anti-alias haze
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
              }
            }
          }
          res = x1 < 0 ? null : { ix: x0, iy: y0, iw: x1 - x0 + 1, ih: y1 - y0 + 1 };
        } catch (_) { res = null; } // tainted canvas → fall back to the element rect
        inkCache.set(key, res);
        return res;
      };
      const inkRect = async (el) => {
        const r = cR(el);
        const ink = await inkOf(el.querySelector("img"));
        return ink ? { x: r.x + ink.ix, y: r.y + ink.iy, w: ink.iw, h: ink.ih, boxW: r.w, boxH: r.h } : r;
      };

      const boxes = [...document.querySelectorAll("#nodesLayer .tech-node")].map((e) => ({ id: e.getAttribute("data-id") || "", ...cR(e) }));
      const labelEls = [...document.querySelectorAll(".research-gui-label")];
      const yearEls = [...document.querySelectorAll(".research-gui-year")];
      const labels = [];
      for (const e of labelEls) { const i = e.querySelector("img"); labels.push({ txt: i ? i.getAttribute("alt") : (e.textContent || "").trim(), ...(await inkRect(e)) }); }
      const years = [];
      for (const e of yearEls) { const i = e.querySelector("img"); years.push({ txt: i ? i.getAttribute("alt") : "", ...(await inkRect(e)) }); }
      const folder = (window.currentVisibleFolders || [])[0] || null;

      // NOT-DRAWN AUDIT — the check that catches a "missing tech". Every tech the catalog puts in this
      // folder that has no node on screen, with the flags that might explain it. An entry whose flags are
      // all false is UNEXPLAINED and therefore a bug (this is exactly how MD's HELICOPTER OPERATORS branch
      // was found: 7 techs absent with nothing marking them hidden). window internals aren't exposed, so
      // classify from the catalog data alone rather than reading the client's private sets.
      const drawn = new Set(boxes.map((b) => b.id));
      const notDrawn = (window.allTechs || [])
        .filter((t) => t.folder === folder && !t.isSubTech && !drawn.has(t.id))
        .map((t) => ({ id: t.id, hidden: !!t.isHidden, sp: !!t.specialProjectTech, dlc: !!(t.dlcExpr || (t.requireDlc || []).length || (t.forbidDlc || []).length) }));
      const unexplained = notDrawn.filter((t) => !t.hidden && !t.sp && !t.dlc).map((t) => t.id);

      // GRAZE vs REAL. A ≤2px sliver is not a layout fault: it is a glyph descender dipping past the ink
      // box (the Q in "EQUIPMENT"), anti-alias haze, or two elements the game itself draws flush against
      // each other. Splitting them keeps the headline number ACTIONABLE — a non-zero "real" count is a
      // bug to chase, a non-zero "graze" count is not.
      const GRAZE = 2;
      const tag = (o) => ({ ...o, graze: o.ox <= GRAZE || o.oy <= GRAZE });
      const labelBox = [], labelLabel = [], yearBox = [], yearLabel = [];
      labels.forEach((l) => { boxes.forEach((b) => { const o = over(l, b); if (o) labelBox.push(tag({ label: l.txt, box: b.id, ...o })); }); });
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const o = over(labels[i], labels[j]); if (o) labelLabel.push(tag({ a: labels[i].txt, b: labels[j].txt, ...o })); }
      years.forEach((y) => { boxes.forEach((b) => { const o = over(y, b); if (o) yearBox.push(tag({ year: y.txt, box: b.id, ...o })); }); });
      years.forEach((y) => { labels.forEach((l) => { const o = over(y, l); if (o) yearLabel.push(tag({ year: y.txt, label: l.txt, ...o })); }); });
      const all = [...labelBox, ...labelLabel, ...yearBox, ...yearLabel];

      return { folder, boxes: boxes.length, labels: labels.length, years: years.length,
        notDrawn: notDrawn.length, unexplained,
        real: all.filter((o) => !o.graze).length, graze: all.filter((o) => o.graze).length,
        labelBox, labelLabel, yearBox, yearLabel };
    });
    report[name] = diag;
    const worst = [...diag.labelBox, ...diag.labelLabel, ...diag.yearBox, ...diag.yearLabel]
      .filter((o) => !o.graze).sort((a, b) => b.ox * b.oy - a.ox * a.oy).slice(0, 3)
      .map((o) => `${o.label || o.year || o.a}/${o.box || o.b || o.label}(${o.ox}x${o.oy})`).join(" ");
    console.log(`${name.padEnd(18)} boxes=${String(diag.boxes).padStart(4)} labels=${String(diag.labels).padStart(3)} | INK: REAL=${String(diag.real).padStart(2)} graze=${String(diag.graze).padStart(2)} | notDrawn=${diag.notDrawn} unexplained=${diag.unexplained.length}${diag.unexplained.length ? "(" + diag.unexplained.slice(0, 4).join(",") + ")" : ""}${worst ? "  << " + worst : ""}`);

    // restore for the next tab
    await page.setViewportSize({ width: 2400, height: 1500 });
    await page.evaluate(() => {
      const c = document.querySelector(".canvas-container");
      c.style.overflow = c.dataset._oldOverflow || ""; c.style.height = c.dataset._oldH || ""; c.style.width = c.dataset._oldW || "";
    });
    await page.waitForTimeout(300);
  }

  fs.writeFileSync(path.join(OUT, "fidelity-report.json"), JSON.stringify(report, null, 1), "utf8");
  await browser.close();
  console.log("\nPNGs + fidelity-report.json ->", OUT);
})();
