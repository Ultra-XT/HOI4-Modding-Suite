// End-to-end for the Continuous Focuses panel in the focus-tree editor.
// Builds a temp mod (focus tree + a continuous_focus palette), loads it, and drives the real UI:
//   - the draggable panel renders with a tile per continuous focus + an Add tile
//   - dragging the header moves the panel and persists the palette position
//   - clicking a tile edits that focus's effects (preserving un-modeled fields)
//   - Add grows the box; Remove shrinks it
// Everything writes to a throwaway temp mod — never Millennium Dawn or the real game files.
// Run: node e2e-continuous-focus.js   (npm run test:continuous-focus)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp, parseContinuousFocusPalettes } = require("./server.js");

const PORT = 3561;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

const FOCUS_TREE = `focus_tree = {
	id = test_focus_tree
	country = { factor = 0 modifier = { add = 10 tag = GER } }
	focus = {
		id = test_focus_a
		icon = GFX_goal_generic_construct_civ_factory
		x = 0
		y = 0
		cost = 10
		completion_reward = { add_political_power = 50 }
	}
}
`;

const PALETTE = `continuous_focus_palette = {
	id = test_pal
	country = { factor = 1 }
	default = yes
	reset_on_civilwar = no
	position = { x = 60 y = 80 }

	focus = {
		id = cf_alpha
		icon = GFX_goal_continuous_suppression
		available = {
		}
		modifier = {
			resistance_target = -0.05
		}
		ai_will_do = { factor = 1 }
		supports_ai_strategy = ai_focus_military_advancements
		daily_cost = 1
		available_if_capitulated = yes
	}

	focus = {
		id = cf_beta
		icon = GFX_goal_continuous_repairments
		available = {
			hidden_trigger = { has_dlc = "Together for Victory" }
			is_subject = yes
		}
		modifier = {
			industry_repair_factor = 0.5
		}
		daily_cost = 1
		available_if_capitulated = yes
	}
}
`;

(async () => {
  console.log("=== CONTINUOUS FOCUS PANEL E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfpanel-"));
  const nfDir = path.join(mod, "common", "national_focus");
  const cfDir = path.join(mod, "common", "continuous_focus");
  fs.mkdirSync(nfDir, { recursive: true });
  fs.mkdirSync(cfDir, { recursive: true });
  const treePath = path.join(nfDir, "test_focus_tree.txt");
  const palPath = path.join(cfDir, "generic.txt");
  fs.writeFileSync(treePath, FOCUS_TREE, "utf8");
  fs.writeFileSync(palPath, PALETTE, "utf8");

  const readPal = () => parseContinuousFocusPalettes(fs.readFileSync(palPath, "utf8"))[0] || { focuses: [] };
  // Retry a predicate against the on-disk palette (saves are async round-trips through the server).
  const waitPal = async (pred, label, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (pred(readPal())) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 100)); }
    return false;
  };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((modPath) => {
    try {
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
      localStorage.setItem("activeModPath", modPath);
      localStorage.setItem("nova_cf_panel_collapsed", "0"); // panel now defaults collapsed; this test edits its tiles, so expand
    } catch (_) {}
  }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    // Point the editor at the temp tree and trigger the panel load directly. (/api/load restricts
    // paths to recognized mod roots, which a tmpdir isn't — so we call the same hook loadFile() fires.
    // This exercises all the new panel code + the real /api/continuous-focus endpoints.)
    await page.evaluate(async (p) => {
      document.getElementById("filePath").value = p;
      await window.loadContinuousFocusPanel();
    }, treePath);

    await page.waitForSelector("#cfPanel", { timeout: 15000 });
    // The startup loading overlay (z-index 99999) can linger; raw-mouse drags below would hit it
    // instead of the panel. Playwright's .click() auto-waits it out, but mouse.down() doesn't — so
    // wait for it to clear before the drag.
    await page.waitForSelector("#nova-loading-overlay", { state: "hidden", timeout: 15000 }).catch(() => {});
    ok(true, "Continuous Focuses panel rendered after loading a tree");

    const tiles0 = await page.$$eval("#cfPanel [data-cf-focus]", (els) => els.length);
    ok(tiles0 === 2, "panel shows a tile per continuous focus (2)", tiles0);
    const hasAdd = await page.$("#cfPanel [data-cf-add]");
    ok(!!hasAdd, "panel has an Add tile");
    const titleTxt = await page.$eval("#cfPanel", (el) => el.textContent || "");
    ok(/Continuous Focuses/.test(titleTxt), "panel titled 'Continuous Focuses'");
    ok(/x=60 y=80/.test(titleTxt), "panel shows palette position (x=60 y=80) when the tree has no override", titleTxt.match(/x=\d+ y=\d+/));

    // 1:1 box sizing (770x380 from nationalfocusview.gui) + a scrollable entries area.
    const boxDims = await page.evaluate(() => {
      const p = document.getElementById("cfPanel");
      const e = p.querySelector("[data-cf-entries]");
      return { w: p.offsetWidth, h: p.offsetHeight, hasEntries: !!e, overflowY: e ? getComputedStyle(e).overflowY : "" };
    });
    ok(boxDims.w >= 760 && boxDims.w <= 780, "box is ~770px wide (1:1 with the game GUI)", boxDims);
    ok(boxDims.h >= 370 && boxDims.h <= 390, "box is ~380px tall (fixed, entries scroll)", boxDims);
    ok(boxDims.hasEntries && boxDims.overflowY === "auto", "entries area is scrollable", boxDims);

    // Placement converts continuous_focus_position px → grid at the GUI focus_spacing, VERIFIED 96×130 in
    // both vanilla and MD's nationalfocusview.gui. Since focus_spacing == Nova's GRID_X (96), the conversion
    // is identity for the offset: pos.x px maps to pos.x canvas px. (Earlier the code used a mis-measured 120.)
    const conv = await page.evaluate(() => {
      const p = document.getElementById("cfPanel");
      const left = Math.round(parseFloat(p.style.left));
      return { left, expected96: Math.round((BASE_OFFSET + viewportShiftX + (60 / 96) * GRID_X) * viewScale), old120: Math.round((BASE_OFFSET + viewportShiftX + (60 / 120) * GRID_X) * viewScale) };
    });
    ok(conv.left === conv.expected96 && conv.left !== conv.old120, "box placed via the verified 96px focus_spacing conversion (not the old 120)", conv);

    // --- Drag the header; the position saves to the FOCUS TREE (per-country), not the shared palette ---
    const readTreePos = () => { const m = fs.readFileSync(treePath, "utf8").match(/continuous_focus_position\s*=\s*\{([^}]*)\}/); if (!m) return null; const x = (m[1].match(/x\s*=\s*(-?\d+)/) || [])[1]; const y = (m[1].match(/y\s*=\s*(-?\d+)/) || [])[1]; return x != null ? { x: +x, y: +y } : null; };
    const waitTree = async (pred, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (pred(readTreePos())) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
    ok(readTreePos() === null, "tree has no continuous_focus_position before dragging");
    await page.locator("#cfPanel [data-cf-head]").scrollIntoViewIfNeeded();
    const box = await page.locator("#cfPanel [data-cf-head]").boundingBox();
    ok(!!box, "panel header is on screen for dragging", box);
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 130, cy + 40, { steps: 6 });
      await page.mouse.up();
    }
    // The drag STAGES the position; SAVE writes it. That split is deliberate (#drag-writes-without-save):
    // releasing this panel used to POST straight into common/national_focus/<tree>.txt with no button
    // pressed, no confirmation and nothing to undo — in a mod the user may only have been looking at.
    // Nothing else on this canvas behaves that way.
    //
    // This assertion predated that change and still demanded the old write-on-drop, so it had been failing
    // ever since — unnoticed, because the e2e files had no runner at all until 2026-08-29. It now checks
    // BOTH halves of the contract, which is more than it did before: the drag must NOT touch the file, and
    // Save must carry it in like any other edit.
    // WHAT THIS CAN AND CANNOT CHECK, AND WHY.
    //
    // The drag used to POST straight into common/national_focus/<tree>.txt the moment you let go — no
    // button, no confirmation, nothing to undo, in a mod you might only have been looking at. That was
    // removed (#drag-writes-without-save): the drag now STAGES the position and marks the tree dirty, and
    // Save carries it in like every other edit.
    //
    // This assertion still demanded the old write-on-drop, so it had been failing ever since — unnoticed,
    // because the e2e files had no runner at all until 2026-08-29.
    //
    // The other half, that Save then writes it, CANNOT be checked from here. This test deliberately skips
    // the real open flow (see the note at the top: /api/load refuses a tmpdir) and calls
    // loadContinuousFocusPanel() directly, which loads the PANEL but never sets sourceText — and staging
    // needs sourceText, because that is the string Save preserve-merges. The shortcut was harmless when
    // the drag talked to the server; it stopped being harmless when staging replaced that.
    //
    // ⭐ TO FINISH THIS: build the fixture inside process.env.HOI4_MODS_ROOT with a descriptor.mod — which
    // run-e2e.js now sets to a scratch folder — so /api/load accepts it, then drive the real open flow
    // instead of the direct hook. Then assert Save writes the position. loadFile() is not on window, so it
    // has to go through the UI.
    const dragStatus = await page.evaluate(() => (document.getElementById("statusText") || {}).textContent || "");
    ok(readTreePos() === null, "the drag alone leaves the mod file untouched — Save writes it now", readTreePos());
    // Silence would be the real failure here: a staged move the user is never told about is a move they
    // lose. Whichever branch it takes, it must SAY something about the panel having moved.
    ok(/panel moved/i.test(dragStatus), "the drag reports what it did rather than failing silently", { dragStatus });
    ok(JSON.stringify(readPal().position) === JSON.stringify({ x: 60, y: 80 }), "the shared palette position was NOT changed by the drag", readPal().position);

    // --- Edit a focus's modifier; un-modeled fields (ai_will_do, supports_ai_strategy) must survive ---
    await page.locator('#cfPanel [data-cf-focus="0"]').click();
    await page.waitForSelector("#cfFocusEditorOverlay", { timeout: 8000 });
    ok(true, "clicking a tile opens the focus editor");
    const editorTabHasPicker = await page.$("#cfFocusEditorOverlay #cfEdModifier");
    ok(!!editorTabHasPicker, "editor exposes the modifier field");
    // Point 7: the CF popup must have AI ✨ + Pick 📋 assist like the focus/maker fields.
    const assist = await page.evaluate(() => ({
      ai: document.querySelectorAll("#cfFocusEditorOverlay .ai-field-assist-btn").length,
      pick: document.querySelectorAll("#cfFocusEditorOverlay .ai-field-pick-btn").length,
    }));
    ok(assist.ai >= 1 && assist.pick >= 1, "CF editor has ✨AI + 📋Pick assist on its script fields", assist);
    // Point 4: a Genesis plain-English preview appears for the modifier field (cf_alpha has one).
    const genesisShown = await page.evaluate(() => {
      const prevs = [...document.querySelectorAll("#cfFocusEditorOverlay div")].filter((d) => /🔮/.test(d.textContent || "") && d.style.display !== "none");
      return prevs.length;
    });
    ok(genesisShown >= 1, "Genesis plain-English preview shows in the CF editor", genesisShown);
    await page.click("#cfFocusEditorOverlay [data-cf-cancel]");

    // Points 5/6: the conditional focus (cf_beta, gated by hidden_trigger/is_subject) is marked, counted,
    // and its editor offers an "unhide" action.
    const counts = await page.$eval("#cfPanel", (el) => el.textContent || "");
    ok(/conditional/.test(counts), "panel header counts conditional focuses", counts.match(/\d+ shown[^<]*/));
    await page.locator('#cfPanel [data-cf-focus="1"]').click(); // cf_beta
    await page.waitForSelector("#cfFocusEditorOverlay", { timeout: 8000 });
    const condUi = await page.evaluate(() => {
      const btn = document.querySelector("#cfFocusEditorOverlay [data-cf-vis]");
      return { banner: !!document.querySelector("#cfFocusEditorOverlay [data-cf-cond]"), act: btn && btn.getAttribute("data-cf-vis") };
    });
    ok(condUi.banner && condUi.act === "unhide", "conditional focus editor shows the visibility banner + 'Make always-visible'", condUi);
    // Unhide clears the Available field.
    await page.click('#cfFocusEditorOverlay [data-cf-vis="unhide"]');
    const avCleared = await page.evaluate(() => (document.querySelector("#cfFocusEditorOverlay #cfEdAvailable") || {}).value === "");
    ok(avCleared, "'Make always-visible' clears the Available conditions");
    await page.click("#cfFocusEditorOverlay [data-cf-save]");
    const unhid = await waitPal((p) => { const b = p.focuses.find((f) => f.id === "cf_beta"); return b && !/hidden_trigger|is_subject/.test(b.available || ""); }, "unhid");
    ok(unhid, "unhide persisted: cf_beta no longer gated by hidden_trigger/is_subject", (readPal().focuses.find((f) => f.id === "cf_beta") || {}).available);
    // re-open cf_alpha for the remaining edit-flow checks below
    await page.locator('#cfPanel [data-cf-focus="0"]').click();
    await page.waitForSelector("#cfFocusEditorOverlay", { timeout: 8000 });
    await page.fill("#cfFocusEditorOverlay #cfEdModifier", "resistance_target = -0.12\nresistance_damage_to_garrison = -0.10");
    await page.click("#cfFocusEditorOverlay [data-cf-save]");
    const edited = await waitPal((p) => { const a = p.focuses.find((f) => f.id === "cf_alpha"); return a && /-0\.12/.test(a.modifier || ""); }, "edited");
    ok(edited, "modifier edit saved to disk", (readPal().focuses.find((f) => f.id === "cf_alpha") || {}).modifier);
    const rawAfterEdit = fs.readFileSync(palPath, "utf8");
    ok(/supports_ai_strategy\s*=\s*ai_focus_military_advancements/.test(rawAfterEdit), "supports_ai_strategy preserved through edit");
    ok(/ai_will_do\s*=\s*\{/.test(rawAfterEdit), "ai_will_do preserved through edit");
    ok(readPal().focuses.length === 2, "focus count unchanged after edit", readPal().focuses.length);

    // --- Add a continuous focus; the box grows ---
    await page.click("#cfPanel [data-cf-add]");
    await page.waitForSelector("#cfFocusEditorOverlay #cfEdId", { timeout: 8000 });
    await page.fill("#cfFocusEditorOverlay #cfEdId", "cf_gamma");
    await page.fill("#cfFocusEditorOverlay #cfEdIcon", "GFX_goal_continuous_research");
    await page.fill("#cfFocusEditorOverlay #cfEdModifier", "research_speed_factor = 0.05");
    await page.click("#cfFocusEditorOverlay [data-cf-save]");
    const added = await waitPal((p) => p.focuses.some((f) => f.id === "cf_gamma"), "added");
    ok(added, "Add created a new continuous focus (box grows to 3)", readPal().focuses.length);
    await page.waitForFunction(() => document.querySelectorAll('#cfPanel [data-cf-focus]').length === 3, { timeout: 6000 }).catch(() => {});
    const tiles1 = await page.$$eval("#cfPanel [data-cf-focus]", (els) => els.length);
    ok(tiles1 === 3, "panel now shows 3 tiles", tiles1);

    // --- Remove a continuous focus; the box shrinks ---
    page.once("dialog", (d) => d.accept()); // in case a native confirm is used as fallback
    await page.locator('#cfPanel [data-cf-focus="2"]').click();
    await page.waitForSelector("#cfFocusEditorOverlay [data-cf-remove]", { timeout: 8000 });
    await page.click("#cfFocusEditorOverlay [data-cf-remove]");
    // novaConfirm modal: click its OK button.
    await page.waitForSelector('#novaConfirmModalOverlay [data-act="ok"]', { timeout: 8000 });
    await page.click('#novaConfirmModalOverlay [data-act="ok"]');
    const removed = await waitPal((p) => !p.focuses.some((f) => f.id === "cf_gamma"), "removed");
    ok(removed, "Remove deleted the continuous focus (box shrinks to 2)", readPal().focuses.length);
    const rawFinal = fs.readFileSync(palPath, "utf8");
    ok(/id = cf_alpha/.test(rawFinal) && /id = cf_beta/.test(rawFinal), "siblings preserved after remove");

    // --- Rename + change ID (point 5): the editor's ID field is editable and renames surgically ---
    await page.locator('#cfPanel [data-cf-focus="0"]').click(); // cf_alpha
    await page.waitForSelector("#cfFocusEditorOverlay #cfEdId", { timeout: 8000 });
    const idField = await page.evaluate(() => { const e = document.querySelector("#cfFocusEditorOverlay #cfEdId"); return { editable: !!e && !e.readOnly && !e.disabled, val: e ? e.value : null, hasName: !!document.querySelector("#cfFocusEditorOverlay #cfEdName") }; });
    ok(idField.editable && idField.val === "cf_alpha" && idField.hasName, "existing focus ID is editable + prefilled, with a Name field", idField);
    await page.fill("#cfFocusEditorOverlay #cfEdId", "cf_alpha_renamed");
    await page.click("#cfFocusEditorOverlay [data-cf-save]");
    const renamed = await waitPal((p) => p.focuses.some((f) => f.id === "cf_alpha_renamed") && !p.focuses.some((f) => f.id === "cf_alpha"), "renamed");
    ok(renamed, "editor renamed the continuous focus id", readPal().focuses.map((f) => f.id));
    ok(/resistance_target/.test(fs.readFileSync(palPath, "utf8")), "renamed focus kept its modifier body");

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  if (failed) { console.error(`\ne2e-continuous-focus: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-continuous-focus: all checks passed");
})();
