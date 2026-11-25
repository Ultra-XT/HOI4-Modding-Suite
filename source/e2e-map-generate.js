// MAP 🌍 Generate land (end-to-end): load a synthetic ALL-SEA mod (a blank ocean canvas with two strategic
// regions), drive the UI — click Generate land → set the amount → choose who owns it → Generate — which writes
// immediately and reloads, then verify ON DISK that a procedural subset of ocean became land wrapped in VALID states:
// every land province is in a state, states have a category + manpower + contiguous ids, NO state spans two
// strategic regions, and definition province ids are unchanged. The fixture draws a map of its own and owns no
// state, so the default owner choice ("The countries below it") has nothing to inherit and keeps Go off
// (c2182624): the test pins that, then chooses "Nobody". Run: npm run test:map-generate
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
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// 12 vertical stripes (provinces 1..12) in a 96x16 image — each its own colour. All SEA in definition.
const colFor = (i) => [(i * 17) % 256, (i * 53) % 256, (i * 91) % 256];
const provAtX = (x) => Math.floor(x / 8) + 1;

function buildAllSeaMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genui-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Gen E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(96, 16, (x) => colFor(provAtX(x))));
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= 12; i++) { const [r, g, b] = colFor(i); rows.push(`${i};${r};${g};${b};sea;false;ocean;0;`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "strategicregions", "r1.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 5 6 }\n\tweather={}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r2.txt"), 'strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ 7 8 9 10 11 12 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
function readStates(mod) {
  const dir = path.join(mod, "history", "states");
  return (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".txt")) : []).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    return {
      id: parseInt((/id\s*=\s*(\d+)/.exec(t) || [])[1], 10),
      cat: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1],
      mp: parseInt((/manpower\s*=\s*(\d+)/.exec(t) || [])[1], 10),
      provs: (((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").match(/\d+/g) || []).map(Number),
    };
  });
}

(async () => {
  console.log("=== MAP 🌍 Generate land E2E ===");
  const mod = buildAllSeaMod();
  const PORT = 3625, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    ok("map reaches Ready (all-sea canvas)", await mapSawReady(page));

    // Open the generate modal, choose a big amount + a seed, confirm.
    await page.click("#mapGenerateLand");
    ok("generate confirm modal opens", await page.evaluate(() => getComputedStyle(document.getElementById("mapGenConfirm")).display !== "none"));
    await page.evaluate(() => { const p = document.getElementById("mapGenPct"); p.value = "75"; p.dispatchEvent(new Event("input", { bubbles: true })); const s = document.getElementById("mapGenSeed"); s.value = "7"; });
    // Who owns the new land. c2182624 (#a-province-below-is-the-same-province): "The countries below it" on a map of the
    // mod's own with no owned state can read nothing, so Go stays off and the note says why (the server refuses the same
    // click, refusedCannotInherit). This fixture is that mod. The test checks no owner, so it asks "Nobody", as c2182624
    // moved this test's unit twin (test-generated-land-names-its-states-like-every-shipping-map.js) to do.
    const genDialog = () => page.evaluate(() => ({ mode: (document.getElementById("mapGenOwnerMode") || {}).value || "",
      note: ((document.getElementById("mapGenOwnerNote") || {}).textContent || "").trim(), goDisabled: !!(document.getElementById("mapGenConfirmBtn") || {}).disabled }));
    const atDefault = await genDialog();
    ok("default owner choice keeps Go OFF: nothing can be inherited on a map of its own", atDefault.mode === "inherit" && atDefault.goDisabled && /^⚠ Nothing can be inherited here/.test(atDefault.note), atDefault);
    await page.selectOption("#mapGenOwnerMode", "none");
    const asNobody = await genDialog();
    ok("with Nobody chosen Go is on", asNobody.mode === "none" && !asNobody.goDisabled, asNobody);
    // It writes immediately then reloads (the success status is transient — load() overwrites it), so wait on
    // the POST response itself, then on the reload settling. A Go that cannot be clicked, or a POST that never goes out,
    // is a FAIL of this test (its catch, then its finally), not an unhandled rejection that skips the cleanup.
    const genResp = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/map/generate-land"), { timeout: 15000 }).catch(() => null);
    await page.click("#mapGenConfirmBtn", { timeout: 10000 });
    const resp = await genResp;
    if (!resp) throw new Error("Generate sent no POST /api/map/generate-land within 15 s");
    const body = await resp.json().catch(() => ({}));
    ok("generate-land POST succeeded with provinces + states", resp.status() === 200 && body.ok === true && body.flippedProvinces > 0 && body.createdStates > 0, { status: resp.status(), body });
    // The result count survives the reload as the FINAL status (regression guard: load() doneMsg, not "Ready").
    await page.waitForFunction(() => /Generated\s+\d+\s+land province/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("the generated-count status persists past the reload", /Generated\s+\d+\s+land/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // Disk: a procedural subset of sea became land (75% of 12 ≈ 9).
    let land = []; for (let i = 1; i <= 12; i++) if (defRow(mod, i)[4] === "land") land.push(i);
    ok("a procedural subset of ocean became land", land.length >= 7 && land.length <= 12, land);
    // 55394191 (#a-generated-world-is-one-terrain): generated land takes the corpus's terrain mix, named from the mod's OWN
    // effective common/terrain, where it used to stamp "plains" on every row. So ask for a land terrain the loaded table
    // declares, read off the model the page reads, by the page's own rule (landTerrains: not water, not "unknown").
    const landCats = await page.evaluate(async (m) => { const r = await fetch(`/api/map/model?modPath=${encodeURIComponent(m)}`).then((x) => x.json()); return (r.terrainCategories || []).filter((c) => c && c.name && !c.water && c.name !== "unknown").map((c) => c.name); }, mod);
    ok("generated land has a non-zero continent + a land terrain its common/terrain declares", landCats.length > 0 && land.every((p) => { const c = defRow(mod, p); return parseInt(c[7], 10) >= 1 && landCats.includes(c[6]); }), { landCats, terrains: land.map((p) => defRow(mod, p)[6]) });
    ok("definition province ids unchanged (12 + dummy)", (() => { for (let i = 0; i <= 12; i++) if (!defRow(mod, i)) return false; return true; })());

    const states = readStates(mod);
    const allProvs = states.flatMap((s) => s.provs);
    ok("every land province is in exactly one state", land.every((p) => allProvs.filter((q) => q === p).length === 1), { land, allProvs });
    ok("no sea province is in a state", allProvs.every((p) => defRow(mod, p)[4] === "land"));
    // A map of its own reads nothing below (c2182624), so a new state's category falls back to rural and its manpower to the default.
    ok("every state has category rural + manpower > 0 (nothing below is read on a map of its own)", states.length > 0 && states.every((s) => s.cat === "rural" && s.mp > 0));
    const ids = states.map((s) => s.id).sort((a, b) => a - b);
    ok("state ids are contiguous from 1", ids.length > 0 && ids[0] === 1 && ids.every((v, i) => v === i + 1), ids);
    ok("CRASH-SAFE: no state spans two strategic regions", states.every((s) => new Set(s.provs.map((p) => (p <= 6 ? 1 : 2))).size <= 1), states.map((s) => s.provs));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-GENERATE E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
