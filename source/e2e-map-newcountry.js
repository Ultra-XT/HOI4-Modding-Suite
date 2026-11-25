// MAP ✨ New country (paint-first, end-to-end): enter the tool, claim LAND states by clicking, "Name &
// create…", fill tag/name/colour, create — then verify on disk the country files exist, colors.txt has the
// colour, and every claimed state's owner is the new tag with a valid (claimed) capital. Run: npm run test:map-newcountry
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newctry-e2e-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova New Country E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  // State 1 (prov 1,2) and state 2 (prov 3), both owned by OLD — to be claimed for a brand-new country.
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = OLD\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = OLD\n\t}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  mk(path.join(mod, "common", "countries", "colors.txt"), "OLD = {\n\tcolor = rgb { 90 90 90 }\n}\n");
  return mod;
}
const ownerOfState = (mod, id) => { const m = /owner\s*=\s*([A-Z0-9_]+)/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")); return m ? m[1] : null; };

(async () => {
  console.log("=== MAP ✨ New country E2E ===");
  const mod = buildMod();
  const PORT = 3661, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);

    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 60)), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
      return found;
    });
    ok("probed province 1 (state 1) and province 3 (state 2)", !!probe["1"] && !!probe["3"], probe);
    const clickAt = (pt) => page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);

    await page.click("#mapModeNewcountry");
    ok("New country tool becomes active", await page.evaluate(() => document.getElementById("mapModeNewcountry").classList.contains("active")));
    ok("the claim bar is shown", await page.evaluate(() => getComputedStyle(document.getElementById("mapNewCountryBar")).display !== "none"));
    ok("Create button starts disabled (nothing claimed)", await page.evaluate(() => document.getElementById("mapNewCountryCreateBtn").disabled === true));

    await clickAt(probe["1"]); // claim state 1
    await clickAt(probe["3"]); // claim state 2
    ok("two states claimed (bar count = 2)", "2" === await page.evaluate(() => document.getElementById("mapNewCountryCount").textContent), await page.evaluate(() => document.getElementById("mapNewCountryCount").textContent));
    ok("Create button enabled after claiming", await page.evaluate(() => document.getElementById("mapNewCountryCreateBtn").disabled === false));

    await page.click("#mapNewCountryCreateBtn");
    ok("the name+create modal opens", await page.evaluate(() => getComputedStyle(document.getElementById("mapNewCountryModal")).display !== "none"));
    ok("a capital was auto-picked from the claim", /state\s*\d+/i.test(await page.evaluate(() => document.getElementById("mapNewCountryCapital").textContent)), await page.evaluate(() => document.getElementById("mapNewCountryCapital").textContent));

    // Fill the form. Set a known colour (#14b478 = 20,180,120) and submit.
    await page.evaluate(() => { document.getElementById("mapNewCountryTag").value = "ZZZ"; document.getElementById("mapNewCountryName").value = "Atlantis"; document.getElementById("mapNewCountryColor").value = "#14b478"; });
    await page.click("#mapNewCountrySubmit");
    await page.waitForFunction(() => /Created\s+ZZZ/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 20000 });
    ok("status confirms the country was created", /✨ Created ZZZ/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // Disk verification.
    ok("disk: state 1 now owned by ZZZ", ownerOfState(mod, 1) === "ZZZ", ownerOfState(mod, 1));
    ok("disk: state 2 now owned by ZZZ", ownerOfState(mod, 2) === "ZZZ", ownerOfState(mod, 2));
    ok("disk: history/countries file created with a capital", (() => { const f = path.join(mod, "history", "countries", "ZZZ - Atlantis.txt"); return fs.existsSync(f) && /capital\s*=\s*[12]/.test(fs.readFileSync(f, "utf8")); })());
    // #a-country-after-dynamic-tags-is-not-a-country - the filename decides whether the country exists.
    ok("disk: tag registered in country_tags", /ZZZ\s*=/.test(fs.readFileSync(path.join(mod, "common", "country_tags", "00_nova_countries.txt"), "utf8")));
    const parsed = mapData.parseCountryColors(fs.readFileSync(path.join(mod, "common", "countries", "colors.txt"), "utf8"));
    ok("disk: colors.txt has ZZZ = 20,180,120", JSON.stringify(parsed.ZZZ) === JSON.stringify([20, 180, 120]), parsed.ZZZ);
    ok("disk: OLD's colour preserved in colors.txt", JSON.stringify(parsed.OLD) === JSON.stringify([90, 90, 90]), parsed.OLD);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-NEWCOUNTRY E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
