// MAP keyboard shortcuts modal + remappable tool keys (#5): the grey hover box is now a "⌨ Keys" button
// that opens a modal listing every shortcut, where the 6 tool keys can be rebound to the user's own layout
// (persisted). This builds a temp mod, opens the modal, rebinds Paint from B→P, confirms the new key drives
// the tool (and the old one no longer does), checks persistence across a reload, and Reset. Run: npm run test:map-keys
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

// ⛔ DERIVED, NOT TYPED. The Keys modal lists one row per DEFAULT_KEYBINDS entry (renderKeysModal), and this test typed 14: fca48781
// gave 🪖 Army a key (B4-14), the modal rightly listed 15, and the test failed on final-int (2026-11-21). Read out of the page's own
// source (comments masked), so the next tool moves the check with it.
const KEYBIND_ACTIONS = (() => {
  const m = /\bconst DEFAULT_KEYBINDS = \{([^}]*)\}/.exec(maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8")));
  return m ? [...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((x) => x[1]) : [];
})();

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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keys-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Keys E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}

(async () => {
  console.log("=== MAP keyboard modal + remap E2E ===");
  const mod = buildMod();
  const PORT = 3597, BASE = `http://127.0.0.1:${PORT}`;
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
  const keycap = () => page.evaluate(() => (document.querySelector('#mapKeysToolList [data-rebind="paint"]') || {}).textContent || "");
  const active = (id) => page.evaluate((i) => !!(document.getElementById(i) && document.getElementById(i).classList.contains("active")), id);
  const overlayShown = () => page.evaluate(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "flex");

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitReady();
    ok("map reaches Ready", await mapSawReady(page));

    // Each default tool key activates its mode (modal closed). Blur first — Paint focuses the country
    // <select> (typing guard), which would otherwise swallow the next key.
    const KEYMAP = { i: "mapModeInspect", b: "mapModePaint", m: "mapModeMove", r: "mapModePaintShape", u: "mapModeMeasure" };
    for (const k of Object.keys(KEYMAP)) {
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await page.keyboard.press(k);
      ok(`default key '${k}' activates ${KEYMAP[k]}`, await active(KEYMAP[k]));
    }
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await page.keyboard.press("Escape"); // back to Inspect

    // The hover box is gone; a real button opens the modal.
    ok("the ⌨ Keys button exists", await page.evaluate(() => !!document.getElementById("mapKeysBtn")));
    await page.click("#mapKeysBtn");
    await page.waitForFunction(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "flex", null, { timeout: 8000 });
    ok("clicking ⌨ Keys opens the modal", await overlayShown());
    const listed = await page.evaluate(() => [...document.querySelectorAll("#mapKeysToolList [data-rebind]")].map((b) => b.dataset.rebind));
    ok(`modal lists every dock tool's key (${KEYBIND_ACTIONS.length}, read out of public/map.js's DEFAULT_KEYBINDS), in that order`,
      KEYBIND_ACTIONS.length >= 14 && JSON.stringify(listed) === JSON.stringify(KEYBIND_ACTIONS), { listed, want: KEYBIND_ACTIONS });
    ok("the newer tools are listed too (capital/terrain/erase/newcountry)", await page.evaluate(() => ["capital", "terrain", "erase", "newcountry"].every((a) => !!document.querySelector(`#mapKeysToolList [data-rebind="${a}"]`))));
    ok("Paint defaults to key B", (await keycap()).trim() === "B", await keycap());
    // While the modal is open, a tool key must NOT leak through and switch the tool underneath.
    await page.keyboard.press("m");
    ok("tool keys don't switch tools while the modal is open", !(await active("mapModeMove")));

    // Rebind Paint from B → P.
    await page.click('#mapKeysToolList [data-rebind="paint"]');
    ok("clicking the keycap enters capture mode", /press a key/i.test(await keycap()), await keycap());
    await page.keyboard.press("p");
    ok("Paint is now bound to P", (await keycap()).trim() === "P", await keycap());
    ok("the binding is persisted to localStorage", await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("nova_map_keybinds") || "{}").paint) === "p"; } catch (_) { return false; } }));
    ok("the dock tooltip reflects the new key (P)", /key:\s*P/i.test(await page.evaluate(() => document.getElementById("mapModePaint").title || "")));

    // Rebinding to a RESERVED key (0 = fit-to-view) is rejected; the binding stays unchanged and the
    // capture remains pending. Escape then cancels the capture cleanly.
    await page.click('#mapKeysToolList [data-rebind="move"]');
    await page.keyboard.press("0");
    ok("reserved key '0' is rejected (Move stays bound to 'm')", await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("nova_map_keybinds") || "{}").move) === "m"; } catch (_) { return false; } }));
    await page.keyboard.press("Escape");
    ok("Escape cancels a pending rebind (Move keycap back to M)", "M" === (await page.evaluate(() => (document.querySelector('#mapKeysToolList [data-rebind="move"]') || {}).textContent || "")).trim());

    // Close the modal; the new key must drive the tool and the old key must not.
    await page.click("#mapKeysClose");
    await page.waitForFunction(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "none", null, { timeout: 8000 });
    await page.keyboard.press("Escape"); // back to Inspect
    ok("Escape returns to Inspect", await active("mapModeInspect"));
    await page.keyboard.press("b");
    ok("the old key B no longer switches to Paint", !(await active("mapModePaint")) && (await active("mapModeInspect")));
    await page.keyboard.press("p");
    ok("the new key P switches to Paint", await active("mapModePaint"));

    // The newer tools got default shortcuts too (c/t/k) — verify a couple drive the tool. Blur first: the
    // previous Paint press focuses the country <select>, whose typing-guard would otherwise swallow the key.
    const blur = () => page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await blur(); await page.keyboard.press("c");
    ok("key C switches to Set-capital", await active("mapModeCapital"));
    await blur(); await page.keyboard.press("t");
    ok("key T switches to Terrain", await active("mapModeTerrain"));
    await blur(); await page.keyboard.press("k");
    ok("key K switches to New-country", await active("mapModeNewcountry"));
    await blur(); await page.keyboard.press("Escape"); // back to Inspect for the reload checks below

    // Persistence across a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady();
    await page.click("#mapKeysBtn");
    await page.waitForFunction(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "flex", null, { timeout: 8000 });
    ok("the P binding survives a reload", (await keycap()).trim() === "P", await keycap());

    // Reset puts it back to B.
    await page.click("#mapKeysReset");
    ok("Reset restores Paint to B", (await keycap()).trim() === "B", await keycap());
    ok("Reset is persisted", await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("nova_map_keybinds") || "{}").paint) === "b"; } catch (_) { return false; } }));
    ok("the dock tooltip reverts to B after reset", /key:\s*B/i.test(await page.evaluate(() => document.getElementById("mapModePaint").title || "")));

    // Esc closes the modal (it's still open after Reset).
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "none", null, { timeout: 8000 });
    ok("Escape closes the keyboard modal", await page.evaluate(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "none"));

    // The modal overlay must NOT be click-through: a mousedown on the dim backdrop closes the modal but must
    // NOT reach the map underneath (no province pick / paint). The overlay is in the map's mousedown guard.
    await page.click("#mapKeysBtn");
    await page.waitForFunction(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "flex", null, { timeout: 8000 });
    const pickedThrough = await page.evaluate(() => {
      const ov = document.getElementById("mapKeysOverlay"), r = ov.getBoundingClientRect();
      ov.dispatchEvent(new MouseEvent("mousedown", { clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return (document.getElementById("mapInfo") || {}).style.display === "block"; // true = a province got picked through
    });
    ok("clicking the keyboard overlay does NOT click through to the map", !pickedThrough);
    ok("clicking the backdrop also closes the modal", await page.evaluate(() => (document.getElementById("mapKeysOverlay") || {}).style.display === "none"));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-KEYS E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
