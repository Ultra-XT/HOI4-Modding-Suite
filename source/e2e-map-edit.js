// END-TO-END map editor: render a REAL provinces.bmp + definition.csv in the browser, then drive the
// actual UI (canvas clicks) to MOVE a province between states and SAVE — verifying the bytes written to
// disk. e2e-all-pages.js only loads map.html against an EMPTY map (no bitmap), so the whole render+edit
// pipeline (bmp decode → colorToProvince → pidGrid → click hit-test → move → save replay → backend) was
// untested. This is that test. Run: node e2e-map-edit.js (npm run test:map-edit)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// ── A minimal valid 24-bit (uncompressed, bottom-up) BMP. pixelFn(x,y) -> [r,g,b], y from the TOP. ──
function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3;
  const imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);   // positive height => bottom-up rows
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize; // bottom-up
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      buf[off++] = b; buf[off++] = g; buf[off++] = r;
    }
  }
  return buf;
}

// 4 vertical stripes of 16px in a 64x16 image: prov 1..4. Colours match definition.csv exactly.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1; // 0..15->1, 16..31->2, 32..47->3, 48..63->4

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapedit-"));
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  // Total-conversion: replace every base-game folder that would otherwise leak into the model. HOI4's
  // replace_path is EXACT-FOLDER (non-recursive), so each subfolder needs its own entry — replace_path
  // "map" alone does NOT cut map/strategicregions or map/supplyareas. Without history/countries, the base
  // game's country `capital = N` directives dangle at our (replaced) state set. This mirrors how a real
  // total-conversion (e.g. Millennium Dawn) declares its replace_paths.
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="Nova MapEdit E2E"\n' +
    'replace_path="history/states"\n' +
    'replace_path="history/countries"\n' +
    'replace_path="map"\n' +
    'replace_path="map/strategicregions"\n' +
    'replace_path="map/supplyareas"\n' +
    'replace_path="common/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  // definition.csv — CRLF is required by HOI4 ("no continent" bug otherwise); ids sequential from 0.
  // continent must be a NUMBER (land needs a non-zero continent or HOI4 errors "no continent"; sea = 0).
  const defRows = [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;false;plains;3;",
    "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;sea;false;ocean;0;",
  ];
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defRows.join("\r\n") + "\r\n", "utf8");
  // Each state needs a state_category (HOI4 crashes without one); "rural" is a stock vanilla category.
  fs.writeFileSync(path.join(mod, "history", "states", "1-Alpha.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t}\n}\n', "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "2-Beta.txt"),
    'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t\tadd_core_of = BBB\n\t}\n}\n', "utf8");
  return mod;
}

const provincesOf = (file) => {
  const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(file, "utf8"));
  return m ? (m[1].match(/\d+/g) || []).map(Number) : [];
};

(async () => {
  console.log("=== MAP EDIT (render + click-move + save) E2E ===");
  const mod = buildMod();
  const PORT = 3577, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((modPath) => {
    try {
      localStorage.setItem("activeModPath", modPath);
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
    } catch (_) {}
  }, mod);
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
    // Wait for the bitmap to decode + render.
    await waitForMapReady(page, { orError: true });
    const status0 = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("map reaches Ready (bitmap + model rendered)", await mapSawReady(page), status0);

    // The fixture's own errors, BEFORE the first click: Phase 3 judges only what the edit adds to them. Asked the way
    // Phase 3 asks (the request the page itself sends), so the two answers are about the same mod in the same server.
    const validateNow = () => page.evaluate(() => fetch("/api/map/validate?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()));
    const before = await validateNow();
    ok("the map validates before any edit (the baseline Phase 3 compares with)", !!(before && before.ok && Array.isArray(before.problems)), before && before.error);

    // HUD-probe: scan the canvas; dispatch a mousemove at each grid point and read what province the UI
    // reports under the cursor. This proves bmp-decode → colorToProvince end-to-end AND gives us real
    // screen coords to click. (updateHud runs synchronously on the wrap mousemove listener.)
    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap");
      const canvas = document.getElementById("mapCanvas");
      const hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect();
      const found = {}; // pid -> {cx, cy}
      const stepX = Math.max(2, Math.floor(r.width / 60));
      const cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) {
        wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
        const m = /prov\D*(\d+)/.exec(hud.textContent || "");
        if (m && !found[m[1]]) found[m[1]] = { cx, cy };
      }
      return found;
    });
    ok("UI hit-tests province 1 on the map", !!probe["1"], probe);
    ok("UI hit-tests province 2 on the map", !!probe["2"], probe);
    ok("UI hit-tests province 3 on the map", !!probe["3"], probe);

    // A clean click = mousedown on wrap + mouseup on window with no movement between (moved stays false).
    const clickAt = (pt) => page.evaluate((p) => {
      const wrap = document.getElementById("mapWrap");
      wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true }));
    }, pt);

    // Switch to Move mode, then two-click: source = province 1 (state 1), dest = province 3 (state 2).
    await page.click("#mapModeMove");
    await clickAt(probe["1"]);
    await clickAt(probe["3"]);
    const statusMove = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("two-click move reports province 1 → state 2", /Province\s*1\s*→\s*state\s*2/i.test(statusMove), statusMove);
    const saveCount = await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent);
    ok("a pending edit is staged (Save count > 0)", parseInt(saveCount, 10) > 0, saveCount);

    // Save → backend writes history/states. Wait for the saved confirmation.
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused|crash/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    const statusSave = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    // "Saved" only (not "✓ Saved, no ⛔"): this fixture's bitmap is knowingly sub-256, so the
    // validate-after-save honestly reports bmp_bad_dimensions with a ⛔ prefix — the save itself still
    // persisted (the disk assertions below verify the actual bytes). "stopped/refused" never says Saved.
    ok("save persisted", /Saved/.test(statusSave), statusSave);

    // Verify on disk: province 1 left state 1, joined state 2; province 2 untouched in state 1.
    const s1 = provincesOf(path.join(mod, "history", "states", "1-Alpha.txt"));
    const s2 = provincesOf(path.join(mod, "history", "states", "2-Beta.txt"));
    ok("disk: state 1 no longer owns province 1", !s1.includes(1), s1);
    ok("disk: state 1 still owns province 2", s1.includes(2), s1);
    ok("disk: state 2 now owns province 1", s2.includes(1), s2);
    ok("disk: state 2 still owns province 3", s2.includes(3), s2);

    // ── Phase 2: empty a state via the UI → Auto-fix must MERGE it into the state that took its last province (an empty state
    // crashes HOI4). Since 2a11a820 that is a merge, which carries the state's people, resources and buildings; it used to be a
    // delete, which lost them. So the click must say "merged" and not "deleted", and the Save must send that merge (read off the
    // wire), as e2e-map-autofix.js asks: /Auto-fixed|deleted the now-empty/ passed the old delete as readily as the merge. ──
    // State 1 now owns only province 2. Move it out → state 1 empties → Auto-fix merges it into state 2.
    await page.click("#mapModeMove");
    await clickAt(probe["2"]);           // source = province 2 (state 1)
    await clickAt(probe["3"]);           // dest = a province in state 2
    const statusEmpty = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("emptying a state merges it into the state that took its last province (status says so)",
      /Auto-fixed: merged the now-empty state .+ into .+, which took its last province/i.test(statusEmpty) && !/deleted the now-empty/i.test(statusEmpty), statusEmpty);

    const merges = [], deletes = [];
    const onSaveRequest = (req) => {
      if (req.method() !== "POST") return;
      let body = null; try { body = JSON.parse(req.postData() || "{}"); } catch (_) { body = {}; }
      if (req.url().includes("/api/map/merge-state")) merges.push(body);
      if (req.url().includes("/api/map/delete-state")) deletes.push(body);
    };
    page.on("request", onSaveRequest);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused|crash/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    page.off("request", onSaveRequest);
    const statusSave2 = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    // "Saved" only — same sub-256 fixture reality as the first save (bmp_bad_dimensions ⛔ is expected).
    ok("second save persisted", /Saved/.test(statusSave2), statusSave2);
    ok("the second Save merges state 1 into state 2: one merge-state 1 → 2, and no delete-state for state 1",
      merges.length === 1 && Number(merges[0].sourceStateId) === 1 && Number(merges[0].targetStateId) === 2 && !deletes.some((b) => Number(b.stateId) === 1),
      { merges: merges.map((b) => ({ sourceStateId: b.sourceStateId, targetStateId: b.targetStateId })), deletes: deletes.map((b) => b.stateId) });

    const s1gone = !fs.existsSync(path.join(mod, "history", "states", "1-Alpha.txt")) ||
      !/\bid\s*=\s*1\b/.test(fs.readFileSync(path.join(mod, "history", "states", "1-Alpha.txt"), "utf8"));
    ok("disk: emptied state 1 is gone, merged into state 2 (no crashing empty state left behind)", s1gone);
    const s2b = provincesOf(path.join(mod, "history", "states", "2-Beta.txt"));
    ok("disk: state 2 absorbed provinces 1, 2 and 3", [1, 2, 3].every((p) => s2b.includes(p)), s2b);
    // ⛔ THE STATE THE MERGE KEPT KEEPS ITS OWN ID. Phase 3 below judges by rule NAME, and a renumber that kills a live id hides
    // inside rules the baseline already has: the review of 34ad04b3 renumbered every state above the merged-away id one UP after
    // the merge (file names kept), so 2-Beta.txt declared id = 3, state 2 was gone, state_id_gap named [1, 2],
    // script_state_read_unguarded went 1084 → 1094 and ai_strategy_state_list_missing 308 → 310, and the whole test passed.
    // The ids are the check: every `id = N` the kept file declares, which must be exactly [2].
    const keptIds = (fs.readFileSync(path.join(mod, "history", "states", "2-Beta.txt"), "utf8").match(/^[ \t]*id[ \t]*=[ \t]*\d+/gm) || []).map((l) => Number(l.replace(/\D+/g, "")));
    ok("disk: the kept state keeps its own id (2-Beta.txt declares id = 2, and no other)", JSON.stringify(keptIds) === "[2]", keptIds);

    // ── Phase 3: the edits must add EXACTLY the error rules they cause. What the fixture already has is DERIVED, from the
    // validator before the first click (the baseline above), never typed: since this test's list was typed in July the
    // validator has gained rules on purpose (a8f9859a, e21e84db, f957156e, c2182624, 450947e8, a995a254, fe5ba599, 3a6276a2),
    // and this fixture (a 2-state world that still loads the base game's scripts and AI strategies) trips nine of them before
    // anything is clicked, bmp_bad_dimensions among them (its 64×16 bitmap). The one rule the edits add on purpose is
    // state_id_gap: Phase 2 empties state 1, the merge leaves ids {2}, and closing a gap is Auto-fix's job, which this test
    // does not run. Judged by RULE, not by count: merging state 1 away rightly adds references to it inside rules the fixture
    // already had.
    // ⛔ EQUAL, NOT A SUBSET. A check that only refused rules beyond state_id_gap passed when the gap silently closed: the review of
    // 72f1594b made merge-state close the id gap at Save without renumberStateId's file rename, so 2-Beta.txt declared id = 1,
    // state_id_gap was gone, FATAL references to the dead state 2 grew (ai_strategy_state_list_missing 308 → 310,
    // script_state_read_unguarded 1084 → 1094), and the whole test passed. After minus before must BE {state_id_gap}: the gap
    // not showing up is as wrong as a rule nobody expected. Both differences are printed in full. ──
    const v = await validateNow();
    // …and the gap the merge leaves is exactly the merged-away id. Under the review's renumber the rule name stayed and its
    // `missing` grew to [1, 2]: the name-level equality below cannot see that, so the row is read.
    const gapRow = ((v && v.problems) || []).find((p) => p.rule === "state_id_gap");
    ok("state_id_gap names exactly the merged-away id: missing = [1]", !!gapRow && JSON.stringify(gapRow.missing) === "[1]", gapRow && { missing: gapRow.missing, maxId: gapRow.maxId });
    const errorRules = (res) => new Set(((res && res.problems) || []).filter((p) => p.severity === "error").map((p) => p.rule));
    const had = errorRules(before);
    const added = [...errorRules(v)].filter((r) => !had.has(r)).sort();
    const expected = ["state_id_gap"];
    ok("the edits add exactly the error rules they cause: after minus before = {state_id_gap}", !!(v && v.ok) && JSON.stringify(added) === JSON.stringify(expected),
      { expected, added, missing: expected.filter((r) => !added.includes(r)),
        extra: ((v && v.problems) || []).filter((p) => p.severity === "error" && !had.has(p.rule) && !expected.includes(p.rule)).map((p) => ({ rule: p.rule, message: String(p.message || p.text || "").slice(0, 240) })) });

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-EDIT E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
