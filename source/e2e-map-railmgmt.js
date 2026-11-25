// MAP "🛤 Rails & supply" management panel (#10/#13): lists every railway + supply hub with Remove and
// level down/up (downsize/upgrade; a supply hub has one level, so its ▴/▾ say so and change nothing), and shows
// per-state rail/hub counts in the Inspect panel. Builds a temp mod with one level-3 railway (provinces 1,2) and
// one supply hub (province 3), then via the UI: checks the per-state counts, opens the panel, checks the hub's
// level cap, downsizes the railway, removes the hub, Saves, and verifies the disk.
// Run: npm run test:map-railmgmt
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-railmgmt-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova RailMgmt E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  // One level-3 railway across provinces 1,2 + one supply hub on province 3 (real formats: LF + trailing space).
  mk(path.join(mod, "map", "railways.txt"), "3 2 1 2 \n");
  mk(path.join(mod, "map", "supply_nodes.txt"), "1 3 \n");
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const railText = (mod) => fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8");
const supplyText = (mod) => fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8");

(async () => {
  console.log("=== MAP rails & supply MANAGEMENT panel E2E ===");
  const mod = buildMod();
  const PORT = 3596, BASE = `http://127.0.0.1:${PORT}`;
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
  const clickAt = (pt) => page.evaluate((p) => {
    const wrap = document.getElementById("mapWrap");
    wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true }));
  }, pt);
  const probe = () => page.evaluate(() => {
    const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
    const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2), xs = {};
    for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 1) {
      wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
      const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m) (xs[m[1]] = xs[m[1]] || []).push(cx);
    }
    const mid = {}; for (const k in xs) mid[k] = { cx: xs[k][Math.floor(xs[k].length / 2)], cy };
    return mid;
  });
  const summary = () => page.evaluate(() => (document.getElementById("mapRailPanelSummary") || {}).textContent || "");
  const railInfo = () => page.evaluate(() => (document.getElementById("miRailInfo") || {}).textContent || "");
  const saveCount = () => page.evaluate(() => parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    const mids = await probe();
    ok("located provinces 1 and 3", mids["1"] && mids["3"], mids);

    // --- Per-state rail/hub counts in the Inspect panel ---
    await clickAt(mids["1"]); // state 1 owns provinces 1,2 → the railway runs through it
    ok("state 1 shows 1 railway, 0 hubs", /🛤\s*1\b/.test(await railInfo()) && /🏭\s*0\b/.test(await railInfo()), await railInfo());
    await clickAt(mids["3"]); // state 2 owns province 3 → the hub sits in it
    ok("state 2 shows 0 railways, 1 hub", /🛤\s*0\b/.test(await railInfo()) && /🏭\s*1\b/.test(await railInfo()), await railInfo());

    // --- The panel auto-opens in Railway mode and auto-closes when leaving it (so it can't cover the
    //     state info panel in Inspect). A panel opened via the toolbar button persists across modes. ---
    await page.click("#mapModeRailway");
    ok("Railway mode auto-opens the rail panel", await page.evaluate(() => (document.getElementById("mapRailPanel") || {}).style.display === "block"));
    await page.click("#mapModeInspect");
    ok("leaving Railway mode auto-closes the auto-opened panel", await page.evaluate(() => (document.getElementById("mapRailPanel") || {}).style.display === "none"));

    // --- Open the management panel. The last selection above was province 3 (state 2), so the panel scopes
    //     to state 2: it shows that state's hub, NOT the railway (which runs through state 1). ---
    await page.click("#mapRailPanelBtn");
    await page.waitForSelector("#mapRailPanel", { state: "visible", timeout: 8000 });
    const rowCounts = () => page.evaluate(() => ({ rails: document.querySelectorAll('#mapRailPanelBody [data-rail-idx]').length, hubs: document.querySelectorAll('#mapRailPanelBody [data-hub-prov]').length }));
    ok("panel summary reports the totals (1 railway, 1 supply hub)", /1 railway\b/.test(await summary()) && /1 supply hub\b/.test(await summary()), await summary());
    let rc = await rowCounts();
    ok("scoped to state 2: shows its hub, not the railway", rc.hubs === 1 && rc.rails === 0, rc);

    // --- A supply hub has ONE level (f287067b: HOI4 caps hubs at 1, and all 727 of the base game's are level 1; only
    //     railways go up to 5). So ▴ and ▾ both say why, change nothing and stage nothing (exercises changeSupplyLevel's
    //     cap) before the hub is removed below. ---
    const hubRow = () => page.evaluate(() => (document.querySelector('#mapRailPanelBody [data-hub-prov="3"]') || {}).textContent || "");
    const stagedBefore = await saveCount();
    await page.click('#mapRailPanelBody [data-hub-act="up"]');
    await page.waitForFunction(() => /only has one level/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    const upStatus = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("supply hub ▴ is refused: a hub only has one level (HOI4 caps them at 1)", /only has one level/.test(upStatus) && /caps them at 1/.test(upStatus), upStatus);
    await page.click('#mapRailPanelBody [data-hub-act="down"]');
    await page.waitForFunction(() => /Supply hub is already at the minimum level \(1\)/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("supply hub ▾ is refused: already at the minimum level (1)", true);
    ok("the hub row still reads level 1", /level 1\b/.test(await hubRow()) && !/level [2-9]/.test(await hubRow()), await hubRow());
    ok("neither hub click staged a write (Save count unchanged)", (await saveCount()) === stagedBefore, { before: stagedBefore, after: await saveCount() });

    // --- Remove the hub (staged) → total hubs drops to 0 ---
    await page.click('#mapRailPanelBody [data-hub-act="remove"]');
    await page.waitForFunction(() => /0 supply hub/.test((document.getElementById("mapRailPanelSummary") || {}).textContent || ""), null, { timeout: 8000 });
    ok("hub removal updates totals to 0 supply hubs", /0 supply hub/.test(await summary()), await summary());
    ok("hub removal stages a write (Save count grew)", (await saveCount()) > 0, await saveCount());

    // --- Select state 1 → the panel re-scopes to it (the railway runs through it) → downsize that railway ---
    await clickAt(mids["1"]);
    await page.waitForFunction(() => document.querySelectorAll('#mapRailPanelBody [data-rail-idx]').length > 0, null, { timeout: 8000 });
    rc = await rowCounts();
    ok("scoped to state 1: shows its railway", rc.rails === 1, rc);
    // "Go" centers on the railway's first province (1) — selects it (info panel shows province 1).
    await page.click('#mapRailPanelBody [data-rail-act="go"]');
    await page.waitForFunction(() => (document.getElementById("miProvince") || {}).textContent === "1", null, { timeout: 8000 }).catch(() => {});
    ok("railway 'Go' selects its first province", "1" === (await page.evaluate(() => (document.getElementById("miProvince") || {}).textContent || "")).trim());
    await page.click('#mapRailPanelBody [data-rail-act="down"]');
    await page.waitForFunction(() => /level 2/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("downsize stages writes (Save count grew further)", (await saveCount()) > 0, await saveCount());
    // Upgrade (▴) 2→3 then downsize back to 2 — exercises changeRailwayLevel up; final stays 2 for the disk check.
    await page.click('#mapRailPanelBody [data-rail-act="up"]');
    await page.waitForFunction(() => /level 3/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("railway upgrade → level 3 (staged)", /level 3/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));
    await page.click('#mapRailPanelBody [data-rail-act="down"]');
    await page.waitForFunction(() => /level 2/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("railway downsize back → level 2 (final)", /level 2/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // --- Save → verify the disk ---
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: railway is now level 2 across provinces 1,2", /(^|\n)\s*2\s+2\s+1\s+2\b/.test(railText(mod)), railText(mod));
    ok("disk: the level-3 railway line is gone", !/(^|\n)\s*3\s+2\s+1\s+2\b/.test(railText(mod)), railText(mod));
    ok("disk: the supply hub on province 3 was removed", !/(^|\n)\s*\d+\s+3\b/.test(supplyText(mod)), supplyText(mod));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-RAILMGMT E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
