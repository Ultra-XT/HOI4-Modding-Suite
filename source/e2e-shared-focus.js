// The read-only shared-focus display layer: a tree that references `shared_focus = <id>` should show
// the inherited shared branches as ghost nodes (.node--shared), with a toggle, WITHOUT merging them into
// the editable/saved focus model. Run: node e2e-shared-focus.js   (npm run test:shared-focus)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3566;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

const TREE = `focus_tree = {
	id = test_tree
	country = { factor = 0 modifier = { add = 10 tag = TST } }
	shared_focus = SH1
	focus = { id = own_focus x = 0 y = 0 cost = 10 }
}
`;
const SHARED = `shared_focus = {
	id = SH1
	icon = GFX_goal_generic_construct_civ_factory
	x = 4
	y = 2
	offset = { x = 1 y = 1 trigger = { tag = TST } }
}
shared_focus = {
	id = SH2
	icon = GFX_goal_generic_construct_mil_factory
	x = 0
	y = 1
	relative_position_id = SH1
	prerequisite = { focus = SH1 }
}
`;

(async () => {
  console.log("=== SHARED FOCUS DISPLAY E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shared-"));
  const nfDir = path.join(mod, "common", "national_focus");
  fs.mkdirSync(nfDir, { recursive: true });
  const treePath = path.join(nfDir, "test_tree.txt");
  fs.writeFileSync(treePath, TREE, "utf8");
  fs.writeFileSync(path.join(nfDir, "zz_shared.txt"), SHARED, "utf8");
  // A second, NOT-linked shared group so the manager's "available to link" list has something.
  fs.writeFileSync(path.join(nfDir, "zz_gulf.txt"), `shared_focus = {\n\tid = GULF1\n\ticon = GFX_goal_generic_construct_civ_factory\n\tx = 2\n\ty = 2\n}\n`, "utf8");
  const treeRefs = () => { const m = fs.readFileSync(treePath, "utf8").match(/shared_focus[ \t]*=[ \t]*([A-Za-z0-9_]+)/g) || []; return m.map((s) => s.split("=")[1].trim()); };
  const waitTreeRefs = async (pred, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (pred(treeRefs())) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 100)); } return false; };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.setItem("activeModPath", m); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async (p) => { document.getElementById("filePath").value = p; await window.loadSharedFocuses(); }, treePath);
    await page.waitForFunction(() => document.querySelectorAll(".node--shared").length > 0, { timeout: 15000 }).catch(() => {});

    const n = await page.$$eval(".node--shared", (els) => els.length);
    ok(n === 2, "both shared focuses render as read-only ghost nodes (SH1 + SH2)", n);

    // SH1 has an SH2 — positions resolved (SH2 is relative to SH1). Check they have distinct positions.
    const pos = await page.$$eval(".node--shared", (els) => els.map((e) => e.style.left + "," + e.style.top));
    ok(new Set(pos).size === 2, "shared focuses are positioned (relative chain resolved)", pos);

    // #1: inherited focuses are marked by a CYAN NAME PLATE — NOT a "shared" label stamped on top of the tile.
    const mark = await page.evaluate(() => {
      const node = document.querySelector(".node--shared");
      if (!node) return { ok: false };
      const after = getComputedStyle(node, "::after").content; // the removed label would show here
      const tc = node.querySelector(".node-title-container");
      return { ok: true, after, border: tc ? getComputedStyle(tc).borderTopColor : "" };
    });
    ok(mark.ok && (mark.after === "none" || !/shared/i.test(mark.after)), "#1 no 'shared' label is stamped on the tile", mark);
    ok(mark.border === "rgb(58, 143, 189)", "#1 the focus name plate is tinted cyan-blue", mark);

    // They must NOT be merged into the editable model (parsed stays null — no tree loaded via loadFile).
    const leaked = await page.evaluate(() => {
      const parsedHas = (typeof parsed !== "undefined" && parsed && Array.isArray(parsed.focuses)) ? parsed.focuses.some((f) => f.id === "SH1" || f.id === "SH2") : false;
      return parsedHas;
    });
    ok(!leaked, "shared focuses are NOT in parsed.focuses (kept out of the save model)");

    // Toggle chip present + hides/shows the layer.
    await page.waitForSelector("#sharedFocusBar [data-sf-eye]", { timeout: 5000 });
    ok(true, "shared-focus toggle chip appears");
    // The controls must live in the TOOLBAR above the tree, not floating over the canvas (the old bug).
    ok(await page.evaluate(() => { const b = document.getElementById("sharedFocusBar"); return !!(b && b.closest("#sharedFocusToolbarGroup")); }), "shared-focus controls live in the toolbar (not floating over the tree)");
    await page.click("#sharedFocusBar [data-sf-eye]");
    const afterHide = await page.$$eval(".node--shared", (els) => els.length);
    ok(afterHide === 0, "toggle hides the shared-focus layer", afterHide);
    await page.click("#sharedFocusBar [data-sf-eye]");
    const afterShow = await page.$$eval(".node--shared", (els) => els.length);
    ok(afterShow === 2, "toggle shows it again", afterShow);

    // --- Manage connections (#8): disable the linked group, then link a new one ---
    ok(treeRefs().includes("SH1"), "tree initially links SH1", treeRefs());
    await page.click("#sharedFocusBar [data-sf-manage]");
    await page.waitForSelector("#sfManagerOverlay", { timeout: 8000 });
    const mgr = await page.evaluate(() => ({
      disable: !!document.querySelector('#sfManagerOverlay [data-sf-disable="SH1"]'),
      canAdd: !!document.querySelector("#sfManagerOverlay #sfAddSelect"),
      addHasGulf: [...document.querySelectorAll("#sfManagerOverlay #sfAddSelect option")].some((o) => o.value === "GULF1"),
    }));
    ok(mgr.disable && mgr.canAdd && mgr.addHasGulf, "manager lists the linked group (disable) + an available group (GULF1)", mgr);
    await page.click('#sfManagerOverlay [data-sf-disable="SH1"]');
    ok(await waitTreeRefs((r) => !r.includes("SH1")), "Disable removed shared_focus = SH1 from the tree", treeRefs());

    await page.click("#sharedFocusBar [data-sf-manage]");
    await page.waitForSelector("#sfManagerOverlay #sfAddSelect", { timeout: 8000 });
    await page.selectOption("#sfManagerOverlay #sfAddSelect", "GULF1").catch(() => {});
    await page.click("#sfManagerOverlay [data-sf-add]");
    ok(await waitTreeRefs((r) => r.includes("GULF1")), "Link added shared_focus = GULF1 to the tree", treeRefs());

    // ===== #2 canvas grows to include shared focuses + #3 they appear on the minimap =====
    // The link-add above kicks a fire-and-forget loadSharedFocuses(); wait for it to SETTLE first, or it
    // would asynchronously overwrite the in-page sharedFocuses we set below (a test race, not a bug).
    await page.waitForFunction(() => Array.isArray(sharedFocuses) && sharedFocuses.some((f) => f.id === "GULF1"), { timeout: 8000 }).catch(() => {});
    // Drive an in-page tree (like e2e-focus-perf) with a shared ghost placed FAR BELOW the own focuses,
    // so the canvas (sized from the own focuses) would otherwise cut it off.
    const parsedN = await page.evaluate(() => {
      const txt = "focus_tree = {\n\tid = ct\n\tcountry = { factor = 0 }\n" +
        "\tfocus = {\n\t\tid = a\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n" +
        "\tfocus = {\n\t\tid = b\n\t\tx = 1\n\t\ty = 1\n\t\tcost = 1\n\t}\n}\n";
      parsed = resolveLayout(parseFocuses(txt));
      parsed.focuses.forEach((f) => { f.iconUrl = ""; });
      sourceText = txt; cfState = null; viewScale = 1; isMinimapVisible = true;
      // SHX sits 30 rows BELOW the tree; SHL sits 5 columns to the LEFT of it (negative grid coord).
      sharedFocuses = [{ id: "SHX", x: 0, y: 30, absX: 0, absY: 30, iconUrl: "" }, { id: "SHL", x: -5, y: 0, absX: -5, absY: 0, iconUrl: "" }];
      sharedFocusesVisible = true;
      renderFocuses();
      return parsed.focuses.length;
    });
    ok(parsedN === 2, "in-page tree parsed (2 own focuses)", parsedN);
    await page.waitForFunction(() => !!document.querySelector('.node--shared[data-shared-id="SHX"]'), { timeout: 8000 }).catch(() => {});
    const grow = await page.evaluate(() => {
      const ghost = document.querySelector('.node--shared[data-shared-id="SHX"]');
      const left = document.querySelector('.node--shared[data-shared-id="SHL"]');
      return { ghost: !!ghost, canvasH: canvasEl.offsetHeight, expectedBottom: toCanvasY(30) + NODE_HEIGHT * viewScale, leftLeft: left ? parseFloat(left.style.left) : null };
    });
    ok(grow.ghost, "shared ghost renders alongside the own tree", grow);
    ok(grow.canvasH >= grow.expectedBottom, "#2 canvas grew to include the shared ghost below the tree", grow);
    ok(grow.leftLeft !== null && grow.leftLeft >= 0, "#2 a left-positioned shared ghost stays reachable (left >= 0, not off-canvas)", grow.leftLeft);

    const mm = await page.evaluate(() => {
      isMinimapVisible = true; drawMinimap();
      const sf = sharedFocuses[0];
      const x = Math.round((sf.absX * GRID_X) * minimapScale + minimapOffsetX);
      const y = Math.round((sf.absY * GRID_Y) * minimapScale + minimapOffsetY);
      const w = minimapCanvasEl.width, h = minimapCanvasEl.height;
      if (x < 0 || y < 0 || x >= w || y >= h) return { inBounds: false, x, y, w, h };
      const nw = Math.max(2, 60 * minimapScale), nh = Math.max(2, 40 * minimapScale);
      const sxp = Math.max(0, Math.round(x - nw)), syp = Math.max(0, Math.round(y - nh));
      const sw = Math.min(w - sxp, Math.ceil(nw * 2)), sh = Math.min(h - syp, Math.ceil(nh * 2));
      const data = minimapCtx.getImageData(sxp, syp, sw, sh).data;
      let bluish = 0;
      for (let i = 0; i < data.length; i += 4) { const r = data[i], b = data[i + 2], a = data[i + 3]; if (a > 0 && b > 120 && b > r + 30) bluish++; }
      return { inBounds: true, bluish, x, y, w, h };
    });
    ok(mm.inBounds, "#3 the shared ghost maps inside the minimap", mm);
    ok(mm.bluish > 0, "#3 minimap draws the shared ghost as a cyan dot", mm);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  if (failed) { console.error(`\ne2e-shared-focus: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-shared-focus: all checks passed");
})();
