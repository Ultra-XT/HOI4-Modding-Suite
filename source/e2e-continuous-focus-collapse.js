// Continuous-focus panel: defaults OPEN, renders BEHIND the tree, and persists the collapse choice.
// MD often positions the 770×380 continuous_focus_window OVER the tree (faithful to the game). The game
// draws focus icons ON TOP of that window; Nova used to draw the panel on top (z 30), hiding the focuses.
// Now the panel sits behind the nodes (z 5 < node z 20), so an OPEN panel no longer covers the tree —
// hence it's open by default again. The collapse toggle still works and the choice persists. Editor-only;
// never touches the saved continuous_focus_position. Run: npm run test:continuous-focus-collapse
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3745, BASE = `http://127.0.0.1:${PORT}`;
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
	}
}
`;
const PALETTE = `continuous_focus_palette = {
	id = test_pal
	country = { factor = 1 }
	default = yes
	position = { x = 60 y = 80 }
	focus = { id = cf_alpha icon = GFX_goal_continuous_suppression available = { } modifier = { resistance_target = -0.05 } daily_cost = 1 }
	focus = { id = cf_beta icon = GFX_goal_continuous_repairments available = { } modifier = { industry_repair_factor = 0.5 } daily_cost = 1 }
}
`;

(async () => {
  console.log("=== CONTINUOUS FOCUS PANEL default-open + behind-tree + persist E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfcollapse-"));
  const nfDir = path.join(mod, "common", "national_focus");
  const cfDir = path.join(mod, "common", "continuous_focus");
  fs.mkdirSync(nfDir, { recursive: true });
  fs.mkdirSync(cfDir, { recursive: true });
  const treePath = path.join(nfDir, "test_focus_tree.txt");
  fs.writeFileSync(treePath, FOCUS_TREE, "utf8");
  fs.writeFileSync(path.join(cfDir, "generic.txt"), PALETTE, "utf8");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Deliberately do NOT preset nova_cf_panel_collapsed — we're testing the DEFAULT (open).
  await ctx.addInitScript((m) => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.setItem("activeModPath", m); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const load = () => page.evaluate(async (p) => { document.getElementById("filePath").value = p; await window.loadContinuousFocusPanel(); }, treePath);
  const panelState = () => page.evaluate(() => {
    const p = document.getElementById("cfPanel");
    if (!p) return null;
    const probe = document.createElement("div"); probe.className = "node"; document.getElementById("canvas").appendChild(probe);
    const nodeZ = parseInt(getComputedStyle(probe).zIndex, 10); probe.remove();
    return { height: p.style.height, tiles: p.querySelectorAll("[data-cf-focus]").length, ls: localStorage.getItem("nova_cf_panel_collapsed"), z: parseInt(getComputedStyle(p).zIndex, 10), nodeZ };
  });

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await load();
    await page.waitForSelector("#cfPanel", { timeout: 15000 });

    // Default: OPEN (full 380px box, tiles shown) — #3.
    let s = await panelState();
    ok(s && s.height === "380px", "panel defaults to OPEN (full 380px box, no localStorage set)", s);
    ok(s && s.tiles === 2, "open → shows a tile per continuous focus (2)", s);
    // #1: the panel sits BEHIND the focus nodes so it can't cover them.
    ok(s && s.z < s.nodeZ, "panel z-index is BELOW the focus nodes (renders behind the tree)", s);

    // #2: the continuous panel is drawn on the minimap (a translucent purple rect) — it used to be missing.
    // (loadContinuousFocusPanel only sets cfState; the minimap also needs the main tree parsed, so build it
    // in-page like e2e-focus-perf does.)
    const mmPurple = await page.evaluate((treeTxt) => new Promise((resolve) => {
      try { parsed = resolveLayout(parseFocuses(treeTxt)); renderFocuses(); isMinimapVisible = true; } catch (e) { return resolve(-2); }
      setTimeout(() => { // let the minimap canvas/context settle, then redraw it
        try { if (typeof drawMinimap === "function") drawMinimap(); } catch (e) { return resolve(-3); }
        const mm = document.getElementById("minimap-canvas"); if (!mm) return resolve(-1);
        const d = mm.getContext("2d").getImageData(0, 0, mm.width, mm.height).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (b > g + 25 && r > g && b > 50) n++; }
        resolve(n);
      }, 300);
    }), FOCUS_TREE);
    ok(mmPurple > 0, "the continuous panel is drawn on the minimap (purple rect)", { mmPurple });

    // Collapse via the toggle → header only, no tiles, choice persisted.
    await page.click("#cfPanel [data-cf-collapse]");
    s = await panelState();
    ok(s && s.height === "80px" && s.tiles === 0, "collapse shrinks to the 80px header", s);
    ok(s && s.ls === "1", "the collapsed choice is persisted to localStorage", s);

    // Reload → the panel REMEMBERS it was collapsed.
    await page.reload({ waitUntil: "domcontentloaded" });
    await load();
    await page.waitForSelector("#cfPanel", { timeout: 15000 });
    s = await panelState();
    ok(s && s.height === "80px" && s.tiles === 0, "after reload the panel stays COLLAPSED (persisted choice)", s);

    // Clear the pref → back to the open default.
    await page.evaluate(() => localStorage.removeItem("nova_cf_panel_collapsed"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await load();
    await page.waitForSelector("#cfPanel", { timeout: 15000 });
    s = await panelState();
    ok(s && s.height === "380px" && s.tiles === 2, "with no stored pref it loads OPEN again", s);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCONTINUOUS-FOCUS-COLLAPSE: ${failed ? failed + " FAILED" : "all checks passed"}`);
  process.exit(failed ? 1 : 0);
})();
