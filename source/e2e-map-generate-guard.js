// MAP 🌍 Generate-land SAFETY GUARD: generate-land assumes a blank ocean canvas, but on a populated map
// (an existing mod like Millennium Dawn) it adds land into the seas + spins up many new states. So when the
// map already has real land, the Generate button must be GATED behind a typed "GENERATE" confirm (with a red
// warning). This drives two fixtures: a populated map (gate ON) and a blank ocean map (gate OFF). The earlier
// guard only checked for unsaved edits, never for existing land.
// Both fixtures draw a map of their own and own no state, so at the default owner choice ("The countries below it")
// there is nothing to inherit and Generate stays OFF whatever is typed (c2182624). The test pins that, then chooses
// "Nobody" (as c2182624 moved this test's unit twin to do) so the typed gate is the only thing left to judge.
// Run: npm run test:map-generate-guard
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady } = require("./testlib-map-ready.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

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
const colFor = (i) => [(i * 37) % 256, (i * 91) % 256, (i * 53 + 7) % 256];

// Build a mod whose definition.csv has `nLand` land provinces (+ 1 sea). 2px stripes → a compact bitmap.
function buildMod(nLand) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genguard-"));
  const total = nLand + 1; // last id is the sea
  const W = total * 2;
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova GenGuard E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, 8, (x) => colFor(Math.floor(x / 2) + 1)));
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= total; i++) { const [r, g, b] = colFor(i); const isSea = i === total; rows.push(`${i};${r};${g};${b};${isSea ? "sea" : "land"};false;${isSea ? "ocean" : "plains"};${isSea ? 0 : 3};`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  const allProv = Array.from({ length: total }, (_, i) => i + 1).join(" ");
  mk(path.join(mod, "map", "strategicregions", "r.txt"), `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${allProv} }\n\tweather={}\n}\n`);
  return mod;
}

async function gateState(page) {
  return page.evaluate(() => {
    const btn = document.getElementById("mapGenConfirmBtn");
    const warn = document.getElementById("mapGenWarn");
    return {
      open: getComputedStyle(document.getElementById("mapGenConfirm")).display !== "none",
      btnDisabled: !!btn.disabled,
      warnShown: warn && getComputedStyle(warn).display !== "none",
      ownerMode: (document.getElementById("mapGenOwnerMode") || {}).value || "",
      ownerNote: ((document.getElementById("mapGenOwnerNote") || {}).textContent || "").trim(),
    };
  });
}

(async () => {
  console.log("=== MAP GENERATE-LAND GUARD (typed GENERATE confirm when the map already has land) ===");
  const PORT = 3720, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();

  const drive = async (mod, label, expectGate) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
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
    try {
      await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
      await waitForMapReady(page);
      await page.click("#mapGenerateLand");
      await page.waitForFunction(() => getComputedStyle(document.getElementById("mapGenConfirm")).display !== "none", null, { timeout: 8000 });
      const s0 = await gateState(page);
      ok(`${label}: generate modal opens`, s0.open);
      // c2182624 (#a-province-below-is-the-same-province): "The countries below it" on a map of the mod's own with no owned
      // state has nothing to read, so Go stays OFF and the note says why; the server refuses that click too (refusedCannotInherit).
      ok(`${label}: at the default owner choice Generate stays OFF, "Nothing can be inherited here"`,
        s0.ownerMode === "inherit" && s0.btnDisabled === true && /^⚠ Nothing can be inherited here/.test(s0.ownerNote), s0);
      await page.selectOption("#mapGenOwnerMode", "none");
      const s = await gateState(page);
      ok(`${label}: "Nobody" chosen (the note says no state gets an owner)`, s.ownerMode === "none" && /^⚠ No state gets an owner/.test(s.ownerNote), s);
      if (expectGate) {
        ok(`${label}: red "already has land" warning is shown`, s.warnShown === true);
        ok(`${label}: Generate button is DISABLED until you type GENERATE`, s.btnDisabled === true);
        // typing the wrong thing keeps it disabled
        await page.fill("#mapGenConfirmInput", "generate please");
        ok(`${label}: still disabled with the wrong text`, (await gateState(page)).btnDisabled === true);
        // typing GENERATE enables it
        await page.fill("#mapGenConfirmInput", "GENERATE");
        ok(`${label}: typing GENERATE enables the button`, (await gateState(page)).btnDisabled === false);
      } else {
        ok(`${label}: no land warning on a blank ocean canvas`, s.warnShown === false);
        ok(`${label}: Generate button is enabled immediately (no gate)`, s.btnDisabled === false);
      }
      ok(`${label}: no uncaught page errors` + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
    } finally { await page.close(); await ctx.close(); }
  };

  const populated = buildMod(60); // 60 land provinces → gate ON
  const blank = buildMod(0);      // 0 land (all sea) → gate OFF
  try {
    await drive(populated, "populated map (60 land)", true);
    await drive(blank, "blank ocean map (0 land)", false);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    for (const m of [populated, blank]) { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\nMAP-GENERATE-GUARD: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
