// MAP auto-backup / crash recovery: staged (unsaved) map edits are persisted to localStorage so a crash or
// accidental close can't lose them. On the next load of the same mod, a banner offers Restore / Discard.
// This stages a paint-owner edit, confirms the backup, reloads (simulating a crash — in-memory edits lost),
// then exercises Discard (backup cleared) and Restore→Save (edit recovered + written to disk + backup
// cleared). Run: npm run test:map-autobackup
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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-autobak-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova AutoBackup E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  const st = (id, p, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2", "AAA"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3", "BBB")); // makes BBB selectable as a paint country
  // ⛔ …and DECLARED, as every country the game loads is. Since 611fe820 the Paint picker offers only tags a common/country_tags file
  // of the mod or a layer below declares (a state's owner no other file names is no country HOI4 loads), so BBB was no option and
  // selecting it timed out after 30 s (measured on final-int, 2026-11-21).
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\n');
  return mod;
}
const ownerOf = (mod, id) => { const m = fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8").match(/owner\s*=\s*([A-Za-z0-9_]+)/); return m ? m[1] : null; };

(async () => {
  console.log("=== MAP auto-backup / crash recovery E2E ===");
  const mod = buildMod();
  const PORT = 3601, BASE = `http://127.0.0.1:${PORT}`;
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
  const waitReady = () => waitForMapReady(page);
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
  const saveCount = () => page.evaluate(() => parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0);
  const backupLen = () => page.evaluate(() => { try { const b = JSON.parse(localStorage.getItem("nova_map_unsaved_backup") || "null"); return b && b.writes ? b.writes.length : 0; } catch (_) { return -1; } });
  const barShown = () => page.evaluate(() => { const b = document.getElementById("mapRestoreBar"); return !!b && b.style.display !== "none"; });
  const paintState1ToBBB = async () => { const mids = await probe(); await page.click("#mapModePaint"); await page.selectOption("#mapCountrySelect", "BBB"); await clickAt(mids["1"]); };

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitReady();
    ok("map reaches Ready", await mapSawReady(page));
    ok("no restore banner on a fresh mod (nothing staged before)", !(await barShown()));

    // Stage a paint-owner edit → it should be persisted to localStorage.
    await paintState1ToBBB();
    await page.waitForFunction(() => (parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0) > 0, null, { timeout: 8000 });
    ok("paint staged an edit (Save count = 1)", (await saveCount()) === 1, await saveCount());
    ok("the staged edit was persisted to localStorage", (await backupLen()) === 1, await backupLen());

    // --- Reload (simulate a crash): in-memory edits are lost, the banner offers recovery ---
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady();
    ok("after reload the in-memory edits are gone (Save count = 0)", (await saveCount()) === 0, await saveCount());
    ok("the recovery banner is shown", await barShown());

    // --- Discard: backup cleared, no banner on the next reload ---
    await page.click("#mapRestoreDiscard");
    ok("Discard hides the banner", !(await barShown()));
    ok("Discard cleared the localStorage backup", (await backupLen()) === 0, await backupLen());

    // --- Re-stage, reload, then Restore → Save → verify the recovered edit lands on disk ---
    await paintState1ToBBB();
    await page.waitForFunction(() => (parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0) > 0, null, { timeout: 8000 });
    ok("re-staged a fresh edit (backup len = 1)", (await backupLen()) === 1, await backupLen());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady();
    ok("recovery banner shown again after reload", await barShown());
    await page.click("#mapRestoreBtn");
    ok("Restore repopulates the staged edits (Save count = 1)", (await saveCount()) === 1, await saveCount());
    ok("Restore hides the banner", !(await barShown()));

    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: the recovered edit was written (state 1 → BBB)", ownerOf(mod, 1) === "BBB", ownerOf(mod, 1));
    ok("a successful Save clears the backup", (await backupLen()) === 0, await backupLen());

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-AUTOBACKUP E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
