// MAP Layers menu (#user-request): (1) Rivers is ON by default (other layers already were), and (2) each
// layer row carries a colour SWATCH matching how it looks on the map — a non-intrusive legend so the user
// can tell what each line/marker is (brown = railways, teal = supply hubs, red/cyan = adjacency, blue =
// rivers, gold = VPs). This loads the map with a VALID 8-bit rivers.bmp and asserts rivers stays checked +
// every swatch is present with the right colour. Run: npm run test:map-layers-legend
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

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h, b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// Minimal VALID 8-bit indexed BMP (what rivers.bmp really is): 256-colour palette, 1 byte/pixel. Index 0 =
// land grey (122,122,122); all pixels land (a valid file the rivers overlay can load, just no river marks).
function bmp8(w, h) {
  const rs = (w + 3) & ~3, dataOff = 14 + 40 + 256 * 4, is = rs * h, b = Buffer.alloc(dataOff + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(dataOff + is, 2); b.writeUInt32LE(dataOff, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(is, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  // palette: index 0 = land grey; 1 = white (sea); rest black. (BGRA)
  let po = 54; const put = (r, g, bl) => { b[po++] = bl; b[po++] = g; b[po++] = r; b[po++] = 0; };
  put(122, 122, 122); put(255, 255, 255); for (let i = 2; i < 256; i++) put(0, 0, 0);
  // pixels: all index 0 (land) — already zero-filled.
  return b;
}

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-laykey-"));
  mk(path.join(mod, "descriptor.mod"), 'name="x"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => [[200, 0, 0], [0, 200, 0], [120, 120, 120]][Math.floor(x / 16)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;120;120;120;sea;false;ocean;0;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "rivers.bmp"), bmp8(48, 16)); // a VALID 8-bit rivers.bmp so the overlay loads
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname="S1"\n\tprovinces={ 1 2 }\n\thistory={ owner=AAA }\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="R"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n');
  mk(path.join(mod, "common", "countries", "colors.txt"), "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\n");
  return mod;
}

(async () => {
  console.log("=== MAP LAYERS LEGEND + rivers-on-by-default ===");
  const mod = buildMod();
  const PORT = 3728, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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

    // Rivers default ON (the HTML checked attribute) regardless of runtime.
    ok("Rivers checkbox defaults to CHECKED (on by default)", await page.evaluate(() => document.getElementById("mapRivers").defaultChecked === true));
    // With a valid rivers.bmp it STAYS checked after load (the graceful auto-disable only fires when missing/invalid).
    await page.waitForTimeout(800);
    ok("Rivers stays checked after load with a valid rivers.bmp", await page.evaluate(() => document.getElementById("mapRivers").checked === true), await page.evaluate(() => document.getElementById("mapRivers").checked));

    // Open the Layers menu and verify the legend swatches.
    await page.click("#mapLayersBtn");
    await page.waitForSelector("#mapLayersMenu", { state: "visible", timeout: 8000 });
    const keys = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#mapLayersMenu .layer-row")];
      return rows.map((r) => {
        const cb = r.querySelector("input[type=checkbox]");
        const key = r.querySelector(".layer-key");
        const cs = key ? getComputedStyle(key) : null;
        return { id: cb ? cb.id : "", hasKey: !!key, bg: cs ? cs.backgroundImage + "|" + cs.backgroundColor : "" };
      });
    });
    const byId = (id) => keys.find((k) => k.id === id) || {};
    ok("every layer row has a colour swatch", keys.length >= 7 && keys.every((k) => k.hasKey), keys.map((k) => k.id + ":" + k.hasKey));
    ok("Railways swatch is brown (180,120,60)", /180,\s*120,\s*60/.test(byId("mapShowRailways").bg), byId("mapShowRailways").bg);
    ok("Supply hubs swatch is teal (#1fb39e = 31,179,158)", /31,\s*179,\s*158/.test(byId("mapShowHubs").bg), byId("mapShowHubs").bg);
    ok("Adjacency swatch is a red→cyan gradient", /gradient/.test(byId("mapShowAdjacency").bg) && /248,\s*81,\s*73/.test(byId("mapShowAdjacency").bg) && /57,\s*208,\s*255/.test(byId("mapShowAdjacency").bg), byId("mapShowAdjacency").bg);
    ok("Rivers swatch is water-blue (#4a9ce2 = 74,156,226)", /74,\s*156,\s*226/.test(byId("mapRivers").bg), byId("mapRivers").bg);
    ok("Victory-points swatch is gold (#f0c020 = 240,192,32)", /240,\s*192,\s*32/.test(byId("mapShowVps").bg), byId("mapShowVps").bg);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-LAYERS-LEGEND: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
