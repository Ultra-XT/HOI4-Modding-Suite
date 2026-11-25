// MAP 🧹 Erase brush (end-to-end): drag/click over land to flip whole provinces to SEA — the crash-safe
// land→sea geometry primitive. Builds a real provinces.bmp + definition.csv + states + a strategic region,
// drives actual canvas clicks in Erase mode to flip provinces, saves, and verifies ON DISK: the province is
// retyped land→sea in definition.csv (id + colour KEPT — no delete/renumber), removed from its state, an
// emptied state auto-deleted (Auto-fix ON), and the strategic region untouched. Run: npm run test:map-erase
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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-erase-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Erase E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;true;plains;3;",
    "3;0;0;200;land;true;plains;3;",
    "4;200;200;0;land;false;plains;3;",
  ].join("\r\n") + "\r\n");
  // One valid row, NOT empty: an empty buildings.txt is a wiki-documented HOI4 crash and now FATAL-gated,
  // and the row keeps the anchor checker reading OUR file instead of vanilla's. Position (8, 8) lands
  // inside province 1 (stripe 0..15), which state 1 owns — so the placement checker stays quiet too.
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;8.00;9.60;8.00;0.00;0\n");
  const st = (id, nm, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1-Alpha.txt"), st(1, "Alpha", "1 2", "AAA"));
  mk(path.join(mod, "history", "states", "2-Beta.txt"), st(2, "Beta", "3", "BBB"));
  mk(path.join(mod, "history", "states", "3-Gamma.txt"), st(3, "Gamma", "4", "CCC"));
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
const stateFiles = (mod) => fs.readdirSync(path.join(mod, "history", "states"));
const provincesOf = (mod, file) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(mod, "history", "states", file), "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

(async () => {
  console.log("=== MAP 🧹 Erase brush (flip land→sea) E2E ===");
  const mod = buildMod();
  const PORT = 3617, BASE = `http://127.0.0.1:${PORT}`;
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

    // The fixture's own errors, BEFORE the first click: the check after the Save judges only what the erase adds to them.
    // Asked the way that check asks (the request the page itself sends), so both answers are about the same mod.
    const validateNow = () => page.evaluate(() => fetch("/api/map/validate?modPath=" + encodeURIComponent(localStorage.getItem("activeModPath"))).then((r) => r.json()));
    const before = await validateNow();
    ok("the map validates before any erase (the baseline the post-Save check compares with)", !!(before && before.ok && Array.isArray(before.problems)), before && before.error);

    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 60)), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
      return found;
    });
    ok("probed provinces 2 and 3", probe["2"] && probe["3"], probe);

    const clickAt = (pt) => page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);

    // Enter Erase, brush = 1 px so a click flips exactly the province under the cursor.
    await page.click("#mapModeErase");
    ok("Erase tool becomes active", await page.evaluate(() => document.getElementById("mapModeErase").classList.contains("active")));
    await page.evaluate(() => { const el = document.getElementById("mapBrushSize"); el.value = "1"; el.dispatchEvent(new Event("change", { bubbles: true })); });

    // ISOLATED-WATER GUARD: erasing an INLAND province (4, coastal=false) is SKIPPED — only coastal land can
    // become water (an isolated inland sea/lake crashes HOI4). Nothing is staged; the province stays land.
    if (probe["4"]) {
      await clickAt(probe["4"]);
      const sInland = await page.evaluate(() => document.getElementById("mapStatus").textContent);
      ok("erasing an INLAND province is refused, not flipped to water", /INLAND|coastal/i.test(sInland) && !/Erased\s+1/i.test(sInland), sInland);
      ok("inland skip stages NOTHING (Save count stays 0)", (await page.evaluate(() => document.getElementById("mapSaveCount").textContent)) === "0");
    }

    // Erase province 2 (state 1 owns {1,2} → stays non-empty).
    await clickAt(probe["2"]);
    const s1 = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("erasing province 2 reports 1 coastal province → sea, no empty state", /Erased\s*1\s*coastal\s*province/i.test(s1) && !/EMPTY|Auto-fixed/i.test(s1), s1);

    // Erase province 3 (state 2's ONLY province → emptied → auto-deleted with Auto-fix ON).
    await clickAt(probe["3"]);
    const s2 = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("erasing a state's last province auto-deletes it (Auto-fix ON)", /Auto-fixed/i.test(s2) && /deleted the now-empty/i.test(s2), s2);

    const regionBefore = fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8");

    // Save → replay the staged flips + the auto-delete. Erasing the COASTAL provinces 2 & 3 leaves their
    // neighbours 1 & 4 newly coastal-WITHOUT-a-port (their bitmap edge now borders sea) — Nova writes every
    // staged change to disk, but the validator correctly flags those 2 and warns. (It does NOT silently auto-add
    // a port: an added naval_base_spawn whose state/position drift is rejected in the in-game nudger anyway.)
    // Wait for validation to SETTLE on its final result, not the transient "✓ Saved" that precedes it.
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Save stops for|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    const saveStatus = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("save wrote the staged flips to disk and the validator flagged the result", /Saved/.test(saveStatus), saveStatus);
    // Rule-based (not count-based — counts drift as the validator gains rules): the erase must have made
    // provinces 1 & 4 coastal-without-a-port, and the only OTHER error it adds is the id gap the auto-deleted
    // state 2 deliberately leaves (Auto-fix's job). What the fixture already had is DERIVED from the validator before
    // the first click (the baseline above), never typed: since the July list the validator gained rules on purpose
    // (a8f9859a, e21e84db, f957156e, c2182624, 450947e8, fe5ba599), and this fixture (a 3-state world that still loads the
    // base game's scripts and AI strategies) trips seven of them before anything is clicked (triage-5).
    // ⛔ EQUAL, NOT A SUBSET. A check that only refused rules beyond those two passed when the gap silently closed: the review of
    // 3aca1bf4 made delete-state close the id gap at Save without renumberStateId's file rename, so 3-Gamma.txt declared id = 2,
    // state_id_gap was gone, the dead-state references moved onto state 3, and the whole test passed. After minus before must BE
    // {coastal_no_port, state_id_gap}: an expected rule not showing up is as wrong as a rule nobody expected. Both differences are
    // printed in full.
    {
      const v = await validateNow();
      const cnp = ((v && v.problems) || []).find((p) => p.rule === "coastal_no_port");
      ok("validator flags the 2 new coastal-no-port neighbours (1, 4)", !!cnp && [1, 4].every((p) => (cnp.provinces || []).includes(p)), cnp);
      // ⛔ …and the gap the delete leaves is exactly the deleted id. The name-level equality below absorbs growth INSIDE a rule the
      // result already has: the review of 43879069 renumbered every state above the deleted id one UP after delete-state (file
      // names kept), so 3-Gamma.txt declared id = 4, state 3 was gone, state_id_gap named [2, 3], and the whole test passed.
      const gapRow = ((v && v.problems) || []).find((p) => p.rule === "state_id_gap");
      ok("state_id_gap names exactly the deleted id: missing = [2]", !!gapRow && JSON.stringify(gapRow.missing) === "[2]", gapRow && { missing: gapRow.missing, maxId: gapRow.maxId });
      const errorRules = (res) => new Set(((res && res.problems) || []).filter((p) => p.severity === "error").map((p) => p.rule));
      const had = errorRules(before);
      const added = [...errorRules(v)].filter((r) => !had.has(r)).sort();
      const expected = ["coastal_no_port", "state_id_gap"];
      ok("the erase adds exactly its known effects: after minus before = {coastal_no_port, state_id_gap}", !!(v && v.ok) && JSON.stringify(added) === JSON.stringify(expected),
        { expected, added, missing: expected.filter((r) => !added.includes(r)),
          extra: ((v && v.problems) || []).filter((p) => p.severity === "error" && !had.has(p.rule) && !expected.includes(p.rule)).map((p) => ({ rule: p.rule, message: String(p.message || "").slice(0, 240) })) });
    }

    // Disk: definition.csv retyped land→sea (both provinces are COASTAL here), ids/colours kept (no delete/
    // renumber). Only coastal land may become water — INLAND land is refused/skipped (the isolated-water crash
    // guard), which is covered by test-map-flip-sea.js.
    const row2 = defRow(mod, 2), row3 = defRow(mod, 3);
    ok("disk: coastal province 2 → sea (terrain ocean)", row2 && row2[4] === "sea" && row2[6] === "ocean", row2);
    ok("disk: coastal province 3 → sea (terrain ocean)", row3 && row3[4] === "sea" && row3[6] === "ocean", row3);
    ok("disk: province 2 keeps its id + colour (no renumber)", row2 && row2[0] === "2" && row2[1] === "0" && row2[2] === "200" && row2[3] === "0", row2);
    ok("disk: province 4 row still present + still land (untouched, ids contiguous)", (() => { const r = defRow(mod, 4); return r && r[4] === "land"; })());

    // Disk: state membership + the auto-deleted empty state.
    const files = stateFiles(mod);
    const f1 = files.find((f) => /^1-/.test(f));
    ok("disk: state 1 no longer owns province 2", f1 && !provincesOf(mod, f1).includes(2), f1 && provincesOf(mod, f1));
    ok("disk: state 1 still owns province 1", f1 && provincesOf(mod, f1).includes(1), f1 && provincesOf(mod, f1));
    ok("disk: state 2 (emptied) was auto-deleted", !files.some((f) => /^2-/.test(f)), files);
    ok("disk: state 3 untouched (still owns province 4)", (() => { const f = files.find((x) => /^3-/.test(x)); return f && provincesOf(mod, f).includes(4); })());
    // The states that stay keep their own ids: every `id = N` each file declares. "State 3 untouched" above reads only the
    // provinces of the 3- file, and under the review's renumber that file still owned province 4 while it declared id = 4.
    const idsOf = (f) => (fs.readFileSync(path.join(mod, "history", "states", f), "utf8").match(/^[ \t]*id[ \t]*=[ \t]*\d+/gm) || []).map((l) => Number(l.replace(/\D+/g, "")));
    const kept = [1, 3].map((id) => { const f = files.find((x) => x.startsWith(id + "-")); return { id, file: f || null, declares: f ? idsOf(f) : null }; });
    ok("disk: the states that stay keep their own ids (1-… declares id = 1, 3-… declares id = 3, and no other)", kept.every((k) => !!k.file && JSON.stringify(k.declares) === JSON.stringify([k.id])), kept);
    ok("disk: strategic region file untouched (provinces stay in their region)", fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8") === regionBefore);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-ERASE E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
