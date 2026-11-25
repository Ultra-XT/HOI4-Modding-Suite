// DEEP map editor stress test: chain MANY different edits (paint owner, move province, terrain, set capital,
// set colour, adjacency) in one session, SAVE, RELOAD the page, and verify EVERY edit persisted on disk. The
// per-feature map e2e tests each do one thing; this exercises the staged-flush seam with mixed write types +
// the immediate colour write + a full reload, which is where chained-edit bugs hide. Run: npm run test:map-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady } = require("./testlib-map-ready.js");
const mapData = require("./map-data.js");

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
// 6 stripes of 16px in a 96x16 image → prov 1..6 (5 land + 1 sea).
const COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [0, 200, 200], [120, 120, 120]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deep-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Deep Chain E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(96, 16, (x) => COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;0;200;200;land;false;plains;3;", "6;120;120;120;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "3.txt"), 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tstate_category = rural\n\tprovinces = { 4 5 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 2\noob = "AAA_1936"\n');
  mk(path.join(mod, "history", "countries", "BBB.txt"), 'capital = 3\noob = "BBB_1936"\n');
  // ⛔ The fixture's countries are DECLARED, as every country the game loads is. Since 611fe820 the Paint picker offers only tags a
  // common/country_tags file of the mod or a layer below declares, so AAA was no option: setting the select to it left it empty,
  // and "paint owner staged" failed (final-int, 2026-11-21).
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\n');
  // Empty buildings.txt: with replace_path="map" HOI4 ignores vanilla's, so the anchor checker must too —
  // an empty mod file keeps it from reading vanilla rows and emitting phantom anchor warnings.
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 5 6 }\n\tweather={}\n}\n');
  mk(path.join(mod, "common", "countries", "colors.txt"), "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\nBBB = {\n\tcolor = rgb { 40 50 60 }\n}\n");
  return mod;
}

const read = (mod, ...p) => fs.readFileSync(path.join(mod, ...p), "utf8");
const ownerOfState = (mod, id) => { const m = /owner\s*=\s*([A-Z0-9_]+)/.exec(read(mod, "history", "states", id + ".txt")); return m ? m[1] : null; };
const provincesOfState = (mod, id) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(read(mod, "history", "states", id + ".txt")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };
const capitalOf = (mod, tag) => { const m = /capital\s*=\s*(\d+)/.exec(read(mod, "history", "countries", tag + ".txt")); return m ? parseInt(m[1], 10) : null; };
const defTerrain = (mod, id) => { const m = new RegExp("(?:^|\\n)" + id + ";[^\\r\\n]*").exec(read(mod, "map", "definition.csv")); return m ? m[0].split(";")[6] : null; };

(async () => {
  console.log("=== MAP DEEP CHAIN (paint+move+terrain+capital+colour+adjacency → save → reload → verify) ===");
  const mod = buildMod();
  const PORT = 3681, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
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

  const waitReady = () => waitForMapReady(page);
  const probeAll = () => page.evaluate(() => {
    const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
    const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 90)), cy = Math.round(r.top + r.height / 2);
    for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
    return found;
  });
  const clickAt = (pt) => page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitReady();
    ok("map reaches Ready", true);
    const probe = await probeAll();
    ok("probed land provinces 1..5", [1, 2, 3, 4, 5].every((p) => probe[p]), Object.keys(probe));

    // 1) PAINT OWNER: select AAA, paint state 3 (prov 4) → BBB becomes AAA.
    await page.evaluate(() => { const s = document.getElementById("mapCountrySelect"); s.value = "AAA"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.click("#mapModePaint");
    await clickAt(probe["4"]);
    ok("paint owner staged", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent || "0"), 10) >= 1);

    // 2) MOVE PROVINCE: prov 5 (state 3) → state 1 (prov 1).
    await page.click("#mapModeMove");
    await clickAt(probe["5"]);
    await clickAt(probe["1"]);
    ok("move province reported", /Province\s*5\s*→\s*state\s*1/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)), await page.evaluate(() => document.getElementById("mapStatus").textContent));

    // 3) TERRAIN: paint mountain on prov 1.
    await page.click("#mapModeTerrain");
    await page.waitForSelector('#mapTerrainSwatches [data-terrain="mountain"]', { timeout: 8000 });
    await page.click('#mapTerrainSwatches [data-terrain="mountain"]');
    await page.evaluate(() => { const el = document.getElementById("mapBrushSize"); if (el) { el.value = "1"; el.dispatchEvent(new Event("change", { bubbles: true })); } });
    await clickAt(probe["1"]);

    // 4) SET CAPITAL: click state 1 (AAA) → AAA capital = 1.
    await page.click("#mapModeCapital");
    await clickAt(probe["1"]);
    ok("capital set reported for AAA", /AAA's capital set/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // 5) SET COLOUR: AAA → 170,50,90 (STAGED now — obeys discard; flushes to colors.txt on the final Save).
    await page.evaluate(() => { const i = document.getElementById("mapCountryColor"); i.value = "#aa325a"; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForFunction(() => /colour set/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 10000 });
    ok("colour staged (colors.txt unchanged until Save)", JSON.stringify(mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).AAA) === JSON.stringify([10, 20, 30]), mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).AAA);

    // 6) ADJACENCY: impassable between prov 1 and prov 4.
    await page.click("#mapModeAdjacency");
    await clickAt(probe["1"]);
    await clickAt(probe["4"]);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("mapAdjPanel")).display !== "none", null, { timeout: 8000 });
    await page.click('#mapAdjPanel .adj-card[data-adj-type="impassable"]');
    await page.click("#mapAdjAdd");
    ok("adjacency staged (impassable 1↔4)", /Linked\s*1\s*↔\s*4/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)), await page.evaluate(() => document.getElementById("mapStatus").textContent));

    // ── SAVE everything staged (owner + move + terrain + capital + adjacency) ──
    const stagedBefore = parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent || "0"), 10);
    ok("multiple edits staged before save (>=4)", stagedBefore >= 4, stagedBefore);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 20000 });
    const vresp = await page.evaluate(() => fetch("/api/map/validate?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()).catch((e) => ({ err: String(e) })));
    if ((vresp.problems || []).length) console.log("    [validate]", JSON.stringify(vresp.problems.map((p) => p.severity + ": " + p.message), null, 0).slice(0, 800));
    // "Saved" only: sub-256 fixture → bmp_bad_dimensions ⛔ is expected; disk assertions verify the bytes.
    ok("save persisted", /Saved/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)), await page.evaluate(() => document.getElementById("mapStatus").textContent));

    // ── RELOAD the page from scratch ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady();
    ok("map reloads cleanly after the heavy chain", true);

    // ── VERIFY EVERYTHING ON DISK ──
    ok("disk: state 3 owner is now AAA (paint)", ownerOfState(mod, 3) === "AAA", ownerOfState(mod, 3));
    ok("disk: province 5 moved into state 1", provincesOfState(mod, 1).includes(5), provincesOfState(mod, 1));
    ok("disk: province 5 left state 3", !provincesOfState(mod, 3).includes(5), provincesOfState(mod, 3));
    ok("disk: province 1 terrain is mountain", defTerrain(mod, 1) === "mountain", defTerrain(mod, 1));
    ok("disk: AAA capital is now state 1", capitalOf(mod, "AAA") === 1, capitalOf(mod, "AAA"));
    ok("disk: AAA colour is 170,50,90", JSON.stringify(mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).AAA) === JSON.stringify([170, 50, 90]));
    ok("disk: BBB colour preserved (40,50,60)", JSON.stringify(mapData.parseCountryColors(read(mod, "common", "countries", "colors.txt")).BBB) === JSON.stringify([40, 50, 60]));
    const adj = fs.existsSync(path.join(mod, "map", "adjacencies.csv")) ? read(mod, "map", "adjacencies.csv") : "";
    ok("disk: adjacency 1↔4 impassable written", /(^|\n)\s*1;4;impassable|(^|\n)\s*4;1;impassable/.test(adj), adj.split("\n").filter((l) => /impassable/.test(l)));

    // ── VERIFY the reloaded MODEL reflects it (round-trip through the UI, not just disk) ──
    const model = await page.evaluate(() => fetch("/api/map/model?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()));
    ok("reloaded model: state 3 owned by AAA", (model.states.find((s) => s.id === 3) || {}).owner === "AAA");
    ok("reloaded model: AAA capital = 1", model.capitals && model.capitals.AAA === 1, model.capitals && model.capitals.AAA);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-DEEP-CHAIN: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
