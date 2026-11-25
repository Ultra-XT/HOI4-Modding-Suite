// MAP Adjacency editor (frontend slice): "🔗 Adjacency" mode — click province A then B → a panel to add
// an impassable border or a sea strait (with a through province), or remove an existing link. Writes
// map/adjacencies.csv immediately. Builds a temp mod, adds an impassable link via the UI, asserts it on
// disk, then removes it via the UI and asserts it's gone. Run: npm run test:map-adjacency
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
// 4th stripe = a SEA province: a strait's `through` must be a real sea province (writeAdjacency now
// validates this against definition.csv), so the fixture needs one to exercise the sea+through path.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const ADJ_HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjui-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova AdjUI E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;sea;false;ocean;0;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "adjacencies.csv"), ADJ_HEADER + "\r\n-1;-1;-1;-1;-1;-1;-1;-1;-1;\r\n"); // header + terminator, no links yet
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const adjText = (mod) => fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");
const hasLink = (mod, a, b) => new RegExp(`(^|\\n)${a};${b};|(^|\\n)${b};${a};`).test(adjText(mod));

(async () => {
  console.log("=== MAP ADJACENCY editor (frontend) E2E ===");
  const mod = buildMod();
  const PORT = 3585, BASE = `http://127.0.0.1:${PORT}`;
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
  const panelShown = () => page.evaluate(() => document.getElementById("mapAdjPanel").style.display === "block");

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    let mids = await probe();
    ok("located provinces 1 and 3", mids["1"] && mids["3"], mids);

    // Enter Adjacency mode, click two provinces → the panel should open.
    await page.click("#mapModeAdjacency");
    await clickAt(mids["1"]);
    await clickAt(mids["3"]);
    ok("adjacency panel opens after two clicks", await panelShown());

    // The link kind is chosen via explained CARDS now (not a dropdown). The sea card reveals the
    // "through province" row; the impassable card hides it.
    await page.click('#mapAdjPanel .adj-card[data-adj-type="sea"]');
    ok("sea card reveals the through-province row", await page.evaluate(() => document.getElementById("mapAdjThroughRow").style.display !== "none"));
    await page.click('#mapAdjPanel .adj-card[data-adj-type="impassable"]');
    ok("impassable card hides the through-province row and is selected", await page.evaluate(() =>
      document.getElementById("mapAdjThroughRow").style.display === "none" &&
      document.querySelector('#mapAdjPanel .adj-card[data-adj-type="impassable"]').classList.contains("selected") &&
      document.getElementById("mapAdjType").value === "impassable"));
    // Add an impassable border (now selected) — STAGED, then Save.
    await page.click("#mapAdjAdd");
    await page.waitForFunction(() => /Linked/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("adjacency add is staged (Save count > 0)", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent), 10) > 0);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: an impassable link 1↔3 was written", hasLink(mod, 1, 3) && /1;3;impassable|3;1;impassable/.test(adjText(mod)), adjText(mod));
    ok("adjacency file still has its terminator row last", adjText(mod).split("\r\n").filter((l) => l.trim()).pop().split(";")[0] === "-1");

    // Re-pick the same pair → the panel detects the existing (locally-tracked) link and offers Remove.
    mids = await probe();
    await clickAt(mids["1"]);
    await clickAt(mids["3"]);
    ok("panel shows the existing-link note", await page.evaluate(() => document.getElementById("mapAdjExisting").style.display !== "none"));
    ok("Remove button is shown for an existing link", await page.evaluate(() => document.getElementById("mapAdjRemove").style.display !== "none"));
    await page.click("#mapAdjRemove");
    await page.waitForFunction(() => /Removed/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: the link 1↔3 was removed", !hasLink(mod, 1, 3), adjText(mod));

    // Sea strait / canal WITH a through province — exercises the sea + through write path on disk.
    mids = await probe();
    await clickAt(mids["1"]);
    await clickAt(mids["3"]);
    await page.click('#mapAdjPanel .adj-card[data-adj-type="sea"]');
    ok("through-province row is shown for a sea link", await page.evaluate(() => document.getElementById("mapAdjThroughRow").style.display !== "none"));
    // Through = province 4, the fixture's SEA province — a strait through LAND is spec-invalid and the
    // writer now rejects it (the old test data used land province 2 and only passed because nothing
    // validated the through type).
    await page.fill("#mapAdjThrough", "4");
    await page.click("#mapAdjAdd");
    await page.waitForFunction(() => /Linked/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: a sea strait 1↔3 through sea province 4 was written", /(^|\n)(1;3|3;1);sea;4;/.test(adjText(mod)), adjText(mod));

    // Switching tools must close a lingering adjacency panel (it used to stay open over the map).
    mids = await probe();
    await clickAt(mids["1"]);
    await clickAt(mids["3"]);
    ok("panel reopens for a fresh pick", await panelShown());
    await page.click("#mapModeInspect");
    ok("switching tools closes the adjacency panel", !(await panelShown()));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-ADJACENCY-UI E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
