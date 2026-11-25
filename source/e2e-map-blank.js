// MAP 🗑 Delete map → blank canvas (end-to-end). Builds a real mod (land provinces, states, a supply area, a
// country with a capital, a strategic region), drives the UI: click Delete map → the 2-step confirm (type
// DELETE) → the model goes all-sea/0-states (staged), Save, then verifies ON DISK that every land province is
// retyped to sea, all state + supply-area files are gone, the country's capital line is stripped, and the
// strategic region + province ids are untouched. Also checks Undo reverts the staged blank. Run: npm run test:map-blank
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankmap-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Blank E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;false;plains;3;",
    "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2", "AAA"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3", "BBB"));
  mk(path.join(mod, "map", "supplyareas", "a.txt"), 'supply_area={\n\tid=1\n\tname="SUPPLYAREA_1"\n\tvalue=5\n\tstates={ 1 2 }\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
const txtFiles = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { return []; } };

(async () => {
  console.log("=== MAP 🗑 Delete map → blank canvas E2E ===");
  const mod = buildMod();
  const PORT = 3621, BASE = `http://127.0.0.1:${PORT}`;
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
    ok("map reaches Ready", await mapSawReady(page));

    // Step 1 of the confirm: click Delete map → the modal appears, action disabled until "DELETE" is typed.
    await page.click("#mapDeleteMap");
    ok("confirm modal opens", await page.evaluate(() => getComputedStyle(document.getElementById("mapBlankConfirm")).display !== "none"));
    ok("the Delete action is disabled before typing DELETE", await page.evaluate(() => document.getElementById("mapBlankConfirmBtn").disabled === true));
    // A wrong word keeps it disabled.
    await page.fill("#mapBlankInput", "delete pls");
    ok("a wrong confirmation keeps it disabled", await page.evaluate(() => document.getElementById("mapBlankConfirmBtn").disabled === true));
    // Step 2: type DELETE → enabled → confirm.
    await page.fill("#mapBlankInput", "DELETE");
    ok("typing DELETE enables the action", await page.evaluate(() => document.getElementById("mapBlankConfirmBtn").disabled === false));
    await page.click("#mapBlankConfirmBtn");
    const blankStatus = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    // b367da3 (#delete-map-cannot-blank-an-overlay): the line says what Delete map can remove, the states the MOD owns, and
    // adds a ⚠ count of the states the base game or a dependency still loads (they come back on reload). It used to promise
    // "all states removed", which was untrue for every mod that does not replace history/states. This fixture replaces it, so
    // every state is the mod's own and no ⚠ survivors line may appear.
    ok("blanking reports land → ocean + the mod's own states removed, none left underneath (staged)",
      /blanked to a sea canvas/i.test(blankStatus) && /\b3 land provinces turned to ocean\b/i.test(blankStatus)
      && /every state your mod owns removed/i.test(blankStatus) && !/come from the base game or a dependency/i.test(blankStatus), blankStatus);
    ok("modal closed after confirm", await page.evaluate(() => getComputedStyle(document.getElementById("mapBlankConfirm")).display === "none"));
    ok("a single save is staged", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent || "0"), 10) >= 1);

    // Undo reverts the staged blank (nothing saved yet) — then redo it for the disk check.
    await page.click("#mapUndo");
    ok("Undo reverts the blank (nothing written yet)", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent || "0"), 10) === 0);
    await page.click("#mapRedo");

    // Save → replay the one blank-to-sea write.
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    // "Saved" only: the fixture bitmap is knowingly sub-256, so validate-after-save honestly reports
    // bmp_bad_dimensions with a ⛔ prefix — the save still persisted (disk assertions verify the bytes).
    ok("save persisted", /Saved/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // Disk: every land province retyped to sea; the existing sea + province ids intact.
    ok("disk: province 1 land → sea", defRow(mod, 1)[4] === "sea", defRow(mod, 1));
    ok("disk: province 2 land → sea (terrain ocean)", (() => { const c = defRow(mod, 2); return c[4] === "sea" && c[6] === "ocean"; })());
    ok("disk: province 3 land → sea", defRow(mod, 3)[4] === "sea");
    ok("disk: province 4 (already sea) untouched", defRow(mod, 4)[4] === "sea");
    ok("disk: province 2 keeps id + colour (no renumber)", (() => { const c = defRow(mod, 2); return c[0] === "2" && c[1] === "0" && c[2] === "200" && c[3] === "0"; })());

    // Disk: states + supply areas gone; capital stripped; region kept.
    ok("disk: all state files deleted", txtFiles(path.join(mod, "history", "states")).length === 0, txtFiles(path.join(mod, "history", "states")));
    ok("disk: all supply-area files deleted", txtFiles(path.join(mod, "map", "supplyareas")).length === 0, txtFiles(path.join(mod, "map", "supplyareas")));
    ok("disk: country capital line stripped (no dangling capital)", !/capital\s*=\s*\d+/.test(fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8")));
    ok("disk: the rest of the country file is kept (oob)", /oob\s*=/.test(fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8")));
    ok("disk: strategic region untouched", /provinces=\{ 1 2 3 4 \}/.test(fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8")));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-BLANK E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
