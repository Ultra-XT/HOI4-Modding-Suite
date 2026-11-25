// MAP "🔧 Fix all" (first WRITE auto-fix). The Problems panel can one-click-fix the safe problem classes:
// strategic-region splits + states with no state_category. This builds a temp mod with BOTH problems,
// opens the panel (2 errors), clicks Fix all, and asserts the panel drops to 0 errors AND the fix is
// correct on disk (province re-homed to one region; category written). Run: npm run test:map-fixall
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fixall-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova FixAll E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(80, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  // province 5 has continent 0 (a land province with no continent) → a third auto-fixable error.
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;0;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "common", "state_category", "00.txt"), "state_categories = {\n\trural = { local_building_slots = 2 }\n\ttown = { local_building_slots = 6 }\n}\n");
  // ONE VALID ROW (not empty): keeps the validator reading OUR file instead of vanilla's noise rows,
  // without tripping buildings_empty (an empty buildings.txt is a wiki-documented crash, now FATAL-gated).
  // Position (8, 8) lands inside province 1 (stripe 0..15), owned by state 1 → placement checker quiet.
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;8.00;9.60;8.00;0.00;0\n");
  const st = (id, p, cat) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n${cat ? "\tstate_category = " + cat + "\n" : ""}\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2", "rural"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3 4", "rural")); // provinces span two regions → split
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "5", null));      // no state_category
  mk(path.join(mod, "map", "strategicregions", "r.txt"),
    'strategic_region = { id = 1 name = "R1" provinces = { 1 2 3 } }\nstrategic_region = { id = 2 name = "R2" provinces = { 4 5 } }\n');
  return mod;
}

// A province's continent (column 7) from definition.csv on disk.
function provinceContinent(mod, pid) {
  const txt = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8");
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(pid + ";"));
  return line ? parseInt(line.split(";")[7], 10) : null;
}
// province → region id, parsed from the strategicregions files on disk.
function provinceRegion(mod, pid) {
  const dir = path.join(mod, "map", "strategicregions");
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    const re = /strategic_region\s*=\s*\{([\s\S]*?)\}\s*(?=strategic_region|\s*$)/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      const id = (/id\s*=\s*(\d+)/.exec(m[1]) || [])[1];
      const pv = (/provinces\s*=\s*\{([^}]*)\}/.exec(m[1]) || [])[1] || "";
      if ((pv.match(/\d+/g) || []).map(Number).includes(pid)) return parseInt(id, 10);
    }
  }
  return null;
}

(async () => {
  console.log("=== MAP 'Fix all' (auto-repair) E2E ===");
  const mod = buildMod();
  const PORT = 3582, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  await armMapReady(page);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const modalText = () => page.evaluate(() => (document.getElementById("mapErrOverlay") || {}).textContent || "");

  try {
    // Sanity: the starting map really has the two problems (region split + no category).
    ok("disk: province 4 starts in region 2 (state 2 is split)", provinceRegion(mod, 4) === 2, provinceRegion(mod, 4));
    ok("disk: state 3 starts with NO category", !/state_category/.test(fs.readFileSync(path.join(mod, "history", "states", "3.txt"), "utf8")));
    ok("disk: province 5 starts with continent 0", provinceContinent(mod, 5) === 0, provinceContinent(mod, 5));

    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    // Open the Map Errors modal → it lists the 3 starting errors.
    await page.click("#mapValidateBtn");
    await page.waitForSelector("#mapErrOverlay", { timeout: 10000 });
    // Rule-based, not count-based (counts drift as the validator gains rules — bmp_bad_dimensions is
    // intrinsic to the sub-256 fixture and NOT auto-fixable): the 3 seeded auto-fixable problems must
    // all be listed.
    const seeded = ["no continent", "strategic region", "state_category"];
    const mt0 = String(await modalText());
    ok("Map Errors modal lists the 3 seeded auto-fixable problems", seeded.every((s) => new RegExp(s, "i").test(mt0)), mt0.slice(0, 300));

    // "Auto-fix all" → fixes + reloads + re-opens the modal. The 3 SEEDED problems must be gone; the
    // fixture-intrinsic bmp_bad_dimensions (sub-256 bitmap — not auto-fixable, would need a resize)
    // legitimately remains, so wait for the seeded rules to vanish rather than for "No problems".
    await page.click("#mapErrFix");
    // Wait for the fix round-trip to settle, then judge by the AUTHORITATIVE validate API (the modal's
    // prose contains rule LABELS + fix HINTS that can echo the seeded words, e.g. the continent hint —
    // string-matching the modal text is unreliable).
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => fetch("/api/map/validate?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()).then((v) => {
      const rules = new Set(((v && v.problems) || []).filter((p) => p.severity === "error").map((p) => p.rule));
      return !rules.has("province_no_continent") && !rules.has("state_no_category") && !rules.has("state_split_across_regions") && !rules.has("state_regions_split");
    }).catch(() => false), null, { timeout: 25000 });
    const vAfter = await page.evaluate(() => fetch("/api/map/validate?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()));
    const seededLeft = ((vAfter && vAfter.problems) || []).filter((p) => /continent|category|region/i.test(p.rule) && p.severity === "error");
    ok("after Auto-fix all the 3 seeded problems are gone (per the validate API)", seededLeft.length === 0, seededLeft.slice(0, 3));

    // Verify the fixes actually landed on disk.
    ok("disk: province 4 was re-homed into region 1 (split resolved)", provinceRegion(mod, 4) === 1, provinceRegion(mod, 4));
    ok("disk: state 3 now has a state_category", /state_category\s*=\s*\w+/.test(fs.readFileSync(path.join(mod, "history", "states", "3.txt"), "utf8")), fs.readFileSync(path.join(mod, "history", "states", "3.txt"), "utf8"));
    ok("disk: province 5 now has a nonzero continent", provinceContinent(mod, 5) > 0, provinceContinent(mod, 5));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-FIXALL E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
