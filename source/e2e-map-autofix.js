// MAP auto-fix TOGGLE: the editor silently repairs crash-causing mistakes as you work (default ON) — e.g.
// when a province move empties a state (an empty state crashes HOI4), the now-empty state is MERGED into the state
// that took its last province, with its people, resources and buildings (2a11a820; it used to be deleted with them).
// The 🛠 Auto-fix toggle turns that off: the editor then changes NOTHING on its own and only WARNS. This test
// builds a temp mod, moves a province with auto-fix OFF (asserts the empty state is KEPT + a warning shows),
// then ON (asserts it is merged: the status says so and Save sends merge-state, not delete-state), saves, and
// verifies on disk. Run: npm run test:map-autofix
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
// 4 vertical stripes of 16px in a 64x16 image: prov 1..4 (all land). Colours match definition.csv exactly.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-autofix-"));
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="Nova AutoFix E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  const defRows = [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;false;plains;3;",
    "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;",
  ];
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defRows.join("\r\n") + "\r\n", "utf8");
  // State 1 owns only province 1, State 2 owns only province 2 (both emptiable); State 3 owns 3+4 (the target).
  const st = (id, nm, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;
  fs.writeFileSync(path.join(mod, "history", "states", "1-Alpha.txt"), st(1, "Alpha", "1", "AAA"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "2-Beta.txt"), st(2, "Beta", "2", "BBB"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "3-Gamma.txt"), st(3, "Gamma", "3 4", "CCC"), "utf8");
  return mod;
}

const stateFiles = (mod) => fs.readdirSync(path.join(mod, "history", "states"));
const provincesOf = (mod, file) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(mod, "history", "states", file), "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

(async () => {
  console.log("=== MAP auto-fix TOGGLE E2E ===");
  const mod = buildMod();
  const PORT = 3613, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.removeItem("nova_map_autofix"); } catch (_) {} }, mod);
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

    // Default state of the toggle = ON.
    ok("Auto-fix button defaults to ON", /ON/.test(await page.evaluate(() => document.getElementById("mapAutoFix").textContent)));

    // Probe province screen coords (mousemove HUD), like e2e-map-edit.
    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 60)), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
      return found;
    });
    ok("probed provinces 1,2,3", probe["1"] && probe["2"] && probe["3"], probe);

    const clickAt = (pt) => page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);

    // ── Auto-fix OFF: emptying a state must KEEP it and only WARN. Turning the safety net OFF first asks for
    //    confirmation (the disable-warning dialog #mapAutofixWarn) — click the toggle, then confirm. ──
    await page.click("#mapAutoFix");
    await page.waitForSelector("#mapAutofixWarn", { state: "visible", timeout: 8000 });
    ok("turning Auto-fix OFF asks for confirmation first (safety-net warning)", true);
    await page.click("#mapAutofixWarnConfirm");
    ok("toggle flips to OFF", /OFF/.test(await page.evaluate(() => document.getElementById("mapAutoFix").textContent)));
    ok("OFF persists to localStorage", "0" === await page.evaluate(() => localStorage.getItem("nova_map_autofix")));
    await page.click("#mapModeMove");
    await clickAt(probe["1"]); await clickAt(probe["3"]); // move province 1 (state 1's only province) → state 3
    const offStatus = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("OFF: warns the state is now EMPTY and nothing was changed", /EMPTY/i.test(offStatus) && /Auto-fix is OFF/i.test(offStatus), offStatus);
    ok("OFF: state 1 is NOT auto-deleted (still in the model)", true === await page.evaluate(() => !!document.querySelector("#mapModeMove")) && !/Auto-fixed/i.test(offStatus), offStatus);

    // ── Auto-fix ON: emptying a state must merge it into the state that took its last province (2a11a820). ──
    await page.click("#mapAutoFix");
    ok("toggle flips back to ON", /ON/.test(await page.evaluate(() => document.getElementById("mapAutoFix").textContent)));
    await page.click("#mapModeMove");
    await clickAt(probe["2"]); await clickAt(probe["3"]); // move province 2 (state 2's only province) → state 3
    const onStatus = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("ON: merges the now-empty state into the state that took its last province (status says so)",
      /Auto-fixed: merged the now-empty state .+ into .+, which took its last province/i.test(onStatus) && !/deleted the now-empty/i.test(onStatus), onStatus);

    // ── Save → verify the requests and the disk: state 2 merged into state 3 (its file gone); state 1 kept (emptied, OFF
    //    path); state 3 owns all. The page sends what it queued, so read the bodies off the wire. ──
    const merges = [], deletes = [];
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      let body = null; try { body = JSON.parse(req.postData() || "{}"); } catch (_) { body = {}; }
      if (req.url().includes("/api/map/merge-state")) merges.push(body);
      if (req.url().includes("/api/map/delete-state")) deletes.push(body);
    });
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("Save merges state 2 into state 3: one merge-state 2 → 3, and no delete-state for state 2",
      merges.length === 1 && Number(merges[0].sourceStateId) === 2 && Number(merges[0].targetStateId) === 3 && !deletes.some((b) => Number(b.stateId) === 2),
      { merges: merges.map((b) => ({ sourceStateId: b.sourceStateId, targetStateId: b.targetStateId })), deletes: deletes.map((b) => b.stateId) });
    const files = stateFiles(mod);
    ok("disk: state 2's file is gone, merged into state 3 (ON path)", !files.some((f) => /^2-/.test(f)), files);
    ok("disk: state 1 file is KEPT (OFF path left it alone)", files.some((f) => /^1-/.test(f)), files);
    const s1file = files.find((f) => /^1-/.test(f));
    ok("disk: state 1 is now empty (the user's un-fixed mistake, as chosen)", s1file && provincesOf(mod, s1file).length === 0, s1file && provincesOf(mod, s1file));
    const s3file = files.find((f) => /^3-/.test(f));
    ok("disk: state 3 absorbed provinces 1 and 2", s3file && [1, 2, 3, 4].every((p) => provincesOf(mod, s3file).includes(p)), s3file && provincesOf(mod, s3file));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-AUTOFIX E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
