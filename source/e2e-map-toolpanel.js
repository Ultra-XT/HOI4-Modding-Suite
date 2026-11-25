// MAP tool dock (Adobe-style left panel): the 9 mode buttons now live in a vertical #mapToolPanel pinned
// to the left of the map. It starts COLLAPSED (icons only); the » / « toggle expands it to show names and
// the choice is persisted in localStorage. This builds a temp mod, loads map.html, and asserts: the panel
// exists with all 9 tools, defaults collapsed (names hidden), the toggle expands it (names shown) and
// persists across a reload, the buttons still drive setMode (active highlight moves), and clicking a tool
// button does NOT leak a phantom province pick to the map. Run: npm run test:map-toolpanel
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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-toolpanel-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova ToolPanel E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
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

const TOOL_IDS = ["mapModeInspect", "mapModePaint", "mapModeMove", "mapNewState", "mapModePaintShape",
  "mapModeMeasure", "mapModeAdjacency", "mapModeSupplyHub", "mapModeRailway"];

(async () => {
  console.log("=== MAP tool dock (Adobe left panel) E2E ===");
  const mod = buildMod();
  const PORT = 3593, BASE = `http://127.0.0.1:${PORT}`;
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
  // visible = takes up layout space (offsetParent set). A display:none .tool-name has offsetParent null.
  const nameVisible = () => page.evaluate(() => {
    const b = document.getElementById("mapModeInspect"); const n = b && b.querySelector(".tool-name");
    return !!(n && n.offsetParent !== null && n.offsetWidth > 0);
  });

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitReady();
    ok("map reaches Ready", await mapSawReady(page));

    // 1. The dock exists, is visible, and holds all 9 tool buttons (and they're INSIDE the dock, not the toolbar).
    ok("#mapToolPanel exists and is visible", await page.evaluate(() => {
      const p = document.getElementById("mapToolPanel");
      return !!p && p.offsetParent !== null && p.getBoundingClientRect().width > 0;
    }));
    for (const id of TOOL_IDS) {
      ok(`tool '${id}' is inside #mapToolPanel`, await page.evaluate((i) => {
        const b = document.getElementById(i); return !!(b && b.closest("#mapToolPanel"));
      }, id), id);
    }
    ok("no mode button is left in the top .map-toolbar", await page.evaluate(() =>
      !document.querySelector(".map-toolbar #mapModeInspect, .map-toolbar #mapModePaint, .map-toolbar #mapNewState")));

    // 2. Default state is collapsed: panel has .collapsed and the tool NAMES are hidden, toggle shows ».
    ok("dock defaults to collapsed", await page.evaluate(() => document.getElementById("mapToolPanel").classList.contains("collapsed")));
    ok("tool names are hidden when collapsed", !(await nameVisible()));
    ok("toggle reads » when collapsed", "»" === (await page.evaluate(() => document.getElementById("mapToolToggle").textContent.trim())));
    const toolHeightCollapsed = await page.evaluate(() => document.getElementById("mapModeInspect").offsetHeight);

    // 3. Click the toggle → expands: .collapsed removed, names shown, toggle reads «.
    // Expanding must only widen the dock, NOT change the row HEIGHT (the user's complaint).
    await page.click("#mapToolToggle");
    const toolHeightExpanded = await page.evaluate(() => document.getElementById("mapModeInspect").offsetHeight);
    ok("expanding the dock keeps the tool-button height the same (only widens)", toolHeightCollapsed === toolHeightExpanded, { collapsed: toolHeightCollapsed, expanded: toolHeightExpanded });
    ok("dock expands after toggle", !(await page.evaluate(() => document.getElementById("mapToolPanel").classList.contains("collapsed"))));
    ok("tool names are shown when expanded", await nameVisible());
    ok("toggle reads « when expanded", "«" === (await page.evaluate(() => document.getElementById("mapToolToggle").textContent.trim())));

    // 4. The expanded choice persists across a reload (localStorage).
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady();
    ok("expanded state persists across reload", !(await page.evaluate(() => document.getElementById("mapToolPanel").classList.contains("collapsed"))));
    ok("names still shown after reload", await nameVisible());

    // 5. The buttons still drive setMode: clicking Paint highlights it (.active) and un-highlights Inspect.
    await page.click("#mapModePaint");
    ok("Paint tool becomes active on click", await page.evaluate(() => document.getElementById("mapModePaint").classList.contains("active")));
    ok("Inspect tool loses active when Paint is chosen", !(await page.evaluate(() => document.getElementById("mapModeInspect").classList.contains("active"))));

    // 6. Clicking a tool button must NOT leak a phantom province pick to the map (panel-guard). We click
    //    Adjacency (which would otherwise register a province under the button) and confirm we entered
    //    Adjacency mode WITHOUT the adjacency panel popping (no province was picked from the button click).
    await page.click("#mapModeAdjacency");
    ok("Adjacency tool becomes active", await page.evaluate(() => document.getElementById("mapModeAdjacency").classList.contains("active")));
    ok("clicking the tool button did not pick a province (adjacency panel stays closed)",
      await page.evaluate(() => document.getElementById("mapAdjPanel").style.display !== "block"));

    // 6b. EVERY mode button activates exactly its own mode (one .active at a time). mapNewState is excluded
    //     (it's a one-shot action that creates a state + drops into Move, not a toggle).
    const MODE_BTNS = ["mapModeInspect", "mapModePaint", "mapModeMove", "mapModePaintShape", "mapModeMeasure", "mapModeAdjacency", "mapModeSupplyHub", "mapModeRailway"];
    for (const id of MODE_BTNS) {
      await page.click("#" + id);
      const state = await page.evaluate(({ cur, all }) => ({
        curActive: document.getElementById(cur).classList.contains("active"),
        others: all.filter((x) => x !== cur).filter((x) => document.getElementById(x).classList.contains("active")),
      }), { cur: id, all: MODE_BTNS });
      ok(`${id} activates its mode (and only it)`, state.curActive && state.others.length === 0, state);
    }
    await page.click("#mapModeInspect"); // leave a clean state (closes the auto-opened rail panel)

    // Collapse again and confirm it sticks (toggle round-trips).
    await page.click("#mapToolToggle");
    ok("toggle collapses again", await page.evaluate(() => document.getElementById("mapToolPanel").classList.contains("collapsed")));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-TOOLPANEL E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
