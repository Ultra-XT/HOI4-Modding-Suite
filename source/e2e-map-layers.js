// MAP "Layers" dropdown (#user-feedback) + the manpower→population display rename. The dropdown toggles each
// overlay (borders, labels, VPs, railways, supply hubs, adjacency links, rivers) on/off. Builds a temp mod
// with railways + a supply hub + an adjacency link, then opens the dropdown, toggles every layer, and checks
// nothing errors + the menu closes on an outside click. Run: npm run test:map-layers
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
const ADJ_HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-layers-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Layers E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "railways.txt"), "1 2 1 2 \n");
  mk(path.join(mod, "map", "supply_nodes.txt"), "1 3 \n");
  mk(path.join(mod, "map", "adjacencies.csv"), ADJ_HEADER + "\r\n1;3;impassable;-1;-1;-1;-1;-1;;\r\n-1;-1;-1;-1;-1;-1;-1;-1;-1;\r\n");
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const LAYER_BOXES = ["mapBorders", "mapShowLabels", "mapShowVps", "mapShowRailways", "mapShowHubs", "mapShowAdjacency", "mapRivers"];

(async () => {
  console.log("=== MAP Layers dropdown + population rename E2E ===");
  const mod = buildMod();
  const PORT = 3605, BASE = `http://127.0.0.1:${PORT}`;
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
  const menuShown = () => page.evaluate(() => (document.getElementById("mapLayersMenu") || {}).style.display === "block");

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    ok("map reaches Ready", await mapSawReady(page));

    // The old separate checkboxes are gone; a Layers button opens a dropdown with all the toggles.
    ok("a Layers dropdown button exists", await page.evaluate(() => !!document.getElementById("mapLayersBtn")));
    ok("the Layers menu is closed initially", !(await menuShown()));
    await page.click("#mapLayersBtn");
    ok("clicking Layers opens the menu", await menuShown());
    for (const id of LAYER_BOXES) ok(`layer toggle '${id}' is in the menu`, await page.evaluate((i) => !!(document.getElementById(i) && document.getElementById(i).closest("#mapLayersMenu")), id), id);
    // All layers default ON now (rivers included). Rivers' runtime .checked can self-disable if the mod has
    // no valid rivers.bmp, so assert its HTML default (defaultChecked) — the others have no such fallback.
    ok("all layers default ON (rivers included)", await page.evaluate(() =>
      document.getElementById("mapShowRailways").checked && document.getElementById("mapShowHubs").checked &&
      document.getElementById("mapShowAdjacency").checked && document.getElementById("mapShowVps").checked &&
      document.getElementById("mapBorders").checked && document.getElementById("mapShowLabels").checked &&
      document.getElementById("mapRivers").defaultChecked === true));

    // Toggle every layer OFF then back ON — must redraw cleanly each time (no crash in the overlay gating).
    for (const id of LAYER_BOXES) { if (id === "mapRivers") continue; await page.click("#" + id); }
    for (const id of LAYER_BOXES) { if (id === "mapRivers") continue; await page.click("#" + id); }
    ok("toggling every layer off+on does not error", errs.length === 0, errs);
    ok("railways toggle reflects state after round-trip (back ON)", await page.evaluate(() => document.getElementById("mapShowRailways").checked));

    // Clicking outside closes the menu.
    await page.click("#mapStatus");
    ok("clicking outside closes the Layers menu", !(await menuShown()));

    // manpower → population display rename (the file field stays `manpower`, only labels change).
    ok("the heatmap option reads 'Population' (not Manpower)", await page.evaluate(() => {
      const o = [...document.querySelectorAll("#mapColorBy option")].find((x) => x.value === "heat_manpower");
      return !!o && /Population/.test(o.textContent) && !/Manpower/i.test(o.textContent);
    }));
    ok("the bulk-edit button reads 'Set pop.' (not Set MP)", await page.evaluate(() => /pop/i.test(document.getElementById("mapMultiSetManpower").textContent) && !/\bMP\b/.test(document.getElementById("mapMultiSetManpower").textContent)));
    ok("the population input placeholder is 'population'", "population" === (await page.evaluate(() => document.getElementById("mapMultiManpower").getAttribute("placeholder"))));
    // The Population field's ⓘ help frames it as POPULATION (the people), explicitly distinct from manpower
    // (population FEEDS manpower; it isn't manpower), says it's the SAME in vanilla + mods, and no longer
    // wrongly claims vanilla treats the field as recruitable manpower.
    ok("the Population ⓘ help frames it as population, not the same as manpower", await page.evaluate(() => {
      const help = [...document.querySelectorAll(".mi-help")].map((e) => e.getAttribute("data-help") || "").find((t) => /^POPULATION/.test(t));
      return !!help && /not the same as manpower/i.test(help) && /FEEDS your recruitable manpower/i.test(help) && /SAME idea in vanilla/i.test(help) && !/recruitable-manpower pool directly/i.test(help) && !/the one number the state file stores/i.test(help);
    }));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-LAYERS E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
