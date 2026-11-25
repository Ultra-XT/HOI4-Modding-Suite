// Maker image-upload e2e: drives the REAL "Upload Custom Icon" flow (a hidden <input type=file> →
// /api/upload-gfx) with a deliberately OVERSIZED image, for the Event / Decision / National-Spirit makers.
// Asserts (a) the server resizes the upload to each sprite's correct HOI4 dimensions and writes the .dds,
// and (b) the LIVE preview refreshes to the uploaded icon (the bug: the handlers set the id field but never
// re-ran updateIconPreview, so the in-game preview kept the old/placeholder icon). Run: npm run test:maker-upload
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Jimp } = require("jimp");
// upload writes under the mod, and the live preview loads the new .dds via /api/buildings/icon-file — put the
// mod under a temp workspace (HOI4_MODS_ROOT) so any allowed-root path checks accept it. Set before require.
const MODS_PARENT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modroot-"));
process.env.HOI4_MODS_ROOT = MODS_PARENT;
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// DDS header: dwHeight @ offset 12, dwWidth @ offset 16 (little-endian).
const ddsDims = (p) => { const b = fs.readFileSync(p); return { h: b.readUInt32LE(12), w: b.readUInt32LE(16) }; };

const MAKERS = [
  { page: "events.html",    input: "#eventPictureUpload",    live: "#previewEventImage", nameField: "eventTitle",  id: "upl_event",    type: "event",    dims: [210, 176], dds: ["gfx", "events", "upl_event.dds"] },
  { page: "decisions.html", input: "#decisionPictureUpload", live: "#previewDecIcon",    nameField: "decisionId", id: "upl_decision", type: "decision", dims: [32, 32],   dds: ["gfx", "interface", "decisions", "upl_decision.dds"] },
  { page: "ideas.html",     input: "#ideaPictureUpload",     live: "#previewIdeaIcon",   nameField: "ideaId",     id: "upl_spirit",   type: "idea",     dims: [76, 76],   dds: ["gfx", "interface", "ideas", "upl_spirit.dds"] },
];

(async () => {
  console.log("=== MAKER IMAGE UPLOAD (oversized → resize → .dds written → live preview refreshes) ===");
  const mod = fs.mkdtempSync(path.join(MODS_PARENT, "uplmod-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Maker Upload E2E"\n');
  // a big "photo" the upload must downscale to each sprite's native size
  const bigPng = path.join(MODS_PARENT, "big.png");
  await new Jimp({ width: 1800, height: 1200, color: 0x3399ddff }).write(bigPng);
  const bigPng2 = path.join(MODS_PARENT, "big2.png"); // a DIFFERENT image for the colliding re-upload
  await new Jimp({ width: 1600, height: 1000, color: 0xcc4422ff }).write(bigPng2);

  const PORT = 3719, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);

  try {
    for (const mk of MAKERS) {
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      // surface only the temp mod so initModSelector doesn't aim the upload at vanilla
      await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Maker Upload E2E" }] }) }));
      try {
        await page.goto(`${BASE}/${mk.page}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(mk.input, { state: "attached", timeout: 15000 }); // the file input is hidden
        // set a deterministic name so the .dds filename is predictable
        await page.evaluate(([f, v]) => { const el = document.getElementById(f); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } }, [mk.nameField, mk.id]);

        // drive the REAL hidden file input (what the Upload button clicks)
        await page.setInputFiles(mk.input, bigPng);

        // the fix: the live preview must refresh to the uploaded icon (icon-file url), not stay on a fallback
        await page.waitForFunction((sel) => {
          const el = document.querySelector(sel);
          return el && el.getAttribute("src") && el.getAttribute("src").indexOf("icon-file") >= 0;
        }, mk.live, { timeout: 20000 }).catch(() => {});
        const liveSrc = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.getAttribute("src") : null; }, mk.live);
        ok(`${mk.page}: live preview refreshed to the uploaded icon`, !!liveSrc && /icon-file/.test(liveSrc) && !/vanilla-ui/.test(liveSrc), liveSrc);

        // the .dds was written at the correct per-type HOI4 dimensions (server-side resize of the big image)
        const ddsPath = path.join(mod, ...mk.dds);
        ok(`${mk.page}: .dds written to the mod`, fs.existsSync(ddsPath), ddsPath);
        if (fs.existsSync(ddsPath)) {
          const d = ddsDims(ddsPath);
          ok(`${mk.page}: oversized image resized to ${mk.dims[0]}x${mk.dims[1]}`, d.w === mk.dims[0] && d.h === mk.dims[1], d);
        }

        // #1A-followup: a SECOND upload to the SAME name collides with the file just written → the status must
        // warn the modder it replaced an existing icon (original backed up server-side).
        await page.evaluate(() => { const s = document.getElementById("uploadStatus"); if (s) s.textContent = ""; });
        await page.setInputFiles(mk.input, bigPng2); // a different image (same name → same path) so change re-fires
        await page.waitForFunction(() => /Replaced an existing/i.test((document.getElementById("uploadStatus") || {}).textContent || ""), null, { timeout: 20000 }).catch(() => {});
        const status2 = await page.evaluate(() => (document.getElementById("uploadStatus") || {}).textContent || "");
        ok(`${mk.page}: re-uploading the same name warns it replaced an existing icon (backed up)`, /Replaced an existing icon/i.test(status2) && /backed up/i.test(status2), status2);

        ok(`${mk.page}: no uncaught page errors` + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
      } finally { await page.close(); }
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(MODS_PARENT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAKER-UPLOAD: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
