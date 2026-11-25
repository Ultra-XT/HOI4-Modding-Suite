// MAP History panel (Photoshop-style, in-memory): a clickable step list to jump back/forward through
// edits + named checkpoints. Nothing here writes to disk (undo/redo + checkpoints are pure in-memory).
// This drives real edits via canvas clicks, then asserts the history list + jump + checkpoint restore by
// watching the staged-edit count (#mapSaveCount reflects pendingWrites). Run: npm run test:map-history
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// 6 land stripes (16px each) in a 96x16 image → 3 states of 2 provinces, so no move ever empties a state.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200], [0, 200, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hist-"));
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="Nova Hist E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(96, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  const defRows = ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;3;", "6;0;200;200;land;false;plains;3;"];
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defRows.join("\r\n") + "\r\n", "utf8");
  const st = (id, tag, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${tag}\n\t}\n}\n`;
  fs.writeFileSync(path.join(mod, "history", "states", "1.txt"), st(1, "AAA", "1 2"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "2.txt"), st(2, "BBB", "3 4"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "3.txt"), st(3, "CCC", "5 6"), "utf8");
  return mod;
}

(async () => {
  console.log("=== MAP HISTORY PANEL (jump + checkpoints) E2E ===");
  const mod = buildMod();
  const PORT = 3579, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  await armMapReady(page);
  // Auto-dismiss the validate-after-save error overlay: these fixtures use tiny (sub-256) bitmaps,
  // so bmp_bad_dimensions correctly fires after every save and the modal would block all later clicks.
  // Tests assert on DISK BYTES + API responses, not the overlay (e2e-map-fixall.js, which tests the
  // overlay itself, is excluded from this injection).
  await page.addInitScript(() => { const attach = () => { if (!document.documentElement) return setTimeout(attach, 0); new MutationObserver(() => { const o = document.getElementById('mapErrOverlay'); if (o) o.remove(); }).observe(document.documentElement, { childList: true, subtree: true }); }; attach(); });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const saveCount = () => page.evaluate(() => parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0);
  const histRows = () => page.evaluate(() => [...document.querySelectorAll("#mapHistoryList .map-hist-row")].map((r) => ({ text: r.textContent.trim(), current: r.textContent.indexOf("●") === 0 })));
  const clickAt = (pt) => page.evaluate((p) => {
    const wrap = document.getElementById("mapWrap");
    wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true }));
  }, pt);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    // Open the History panel; it should show exactly the initial step.
    await page.click("#mapHistoryBtn");
    ok("history panel opens", await page.evaluate(() => document.getElementById("mapHistoryPanel").style.display !== "none"));
    let rows = await histRows();
    ok("history starts with 1 step (Loaded map), marked current", rows.length === 1 && /Loaded map/.test(rows[0].text) && rows[0].current, rows);

    // Locate interior screen points for provinces 1, 3, 5 (midpoint of each stripe along the centre row).
    const mids = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2), xs = {};
      for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 1) {
        wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
        const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m) (xs[m[1]] = xs[m[1]] || []).push(cx);
      }
      const mid = {}; for (const k in xs) mid[k] = { cx: xs[k][Math.floor(xs[k].length / 2)], cy };
      return mid;
    });
    ok("located provinces 1/3/5", mids["1"] && mids["3"] && mids["5"], mids);

    // Two clean province moves (state1→state2, state2→state3) — neither empties a state.
    await page.click("#mapModeMove");
    await clickAt(mids["1"]); await clickAt(mids["3"]);  // move prov 1 into state 2
    await clickAt(mids["3"]); await clickAt(mids["5"]);  // move prov 3 into state 3
    ok("two edits staged (save count = 2)", (await saveCount()) === 2, await saveCount());
    rows = await histRows();
    ok("history now lists 3 steps", rows.length === 3, rows);
    ok("the 3rd step is current", rows[2] && rows[2].current, rows);
    ok("steps are labelled 'Move province'", /Move province/.test(rows[1].text) && /Move province/.test(rows[2].text), rows);

    // Jump to the very first step → all staged edits undone.
    await page.click('#mapHistoryList .map-hist-row[data-i="0"]');
    ok("jump to step 0 reverts staged edits (count = 0)", (await saveCount()) === 0, await saveCount());
    ok("step 0 is current after jump", (await histRows())[0].current);

    // Jump forward to the last step (redo) → edits come back.
    await page.click('#mapHistoryList .map-hist-row[data-i="2"]');
    ok("jump forward to step 2 restores edits (count = 2)", (await saveCount()) === 2, await saveCount());

    // Checkpoint: name + mark the current (2-edit) state.
    await page.fill("#mapCheckpointName", "after moves");
    await page.click("#mapCheckpointAdd");
    ok("checkpoint 'after moves' appears", await page.evaluate(() => /after moves/.test(document.getElementById("mapCheckpointList").textContent)));

    // Go back to the start, then RESTORE the checkpoint → the 2-edit state returns.
    await page.click('#mapHistoryList .map-hist-row[data-i="0"]');
    ok("back at start before restore (count = 0)", (await saveCount()) === 0, await saveCount());
    await page.click("#mapCheckpointList .map-cp-restore");
    ok("restoring the checkpoint brings back the 2-edit state (count = 2)", (await saveCount()) === 2, await saveCount());
    ok("restore is itself an undoable history step", (await histRows()).some((r) => /Restore:/.test(r.text)), await histRows());

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-HISTORY E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
