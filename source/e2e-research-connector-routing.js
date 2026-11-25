// Research prerequisite CONNECTOR ROUTING — game-accurate (wiki "Technology modding", Folder, verbatim):
// with "LEFT" a path "goes right for one unit, then goes vertically for as much as necessary, and finally
// continues right for as much as needed"; with "UP" it "goes down by one unit, goes horizontally for as much
// as needed, and then continues down". So: lines run CELL-CENTER to CELL-CENTER on the slot grid (the SVG
// layer draws UNDER the boxes, hiding the under-box segments exactly like the game), and the elbow turns ONE
// SLOT from the parent — not at the midpoint. The wiki's caveat ("does not always apply, such as when the
// technology is fairly close") is why a stacked same-column pair stays a plain straight drop (the originally
// user-reported in-game behaviour on MD's Armour tab) and why near-neighbour pairs route by the dominant
// axis. Exercises the pure router (window.__novaConnectorPathD) over crafted anchors, deterministic (no mod
// loaded → slot fallback 70×70). Run: npm run test:research-connector-routing
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Anchor points for a node centered at (cx,cy), matching getNodeAnchor's geometry (default 183×84 card).
function anchors(cx, cy, w = 183, h = 84) {
  return {
    center: { x: cx, y: cy },
    top: { x: cx, y: cy - h / 2 }, bottom: { x: cx, y: cy + h / 2 },
    left: { x: cx - w / 2, y: cy }, right: { x: cx + w / 2, y: cy },
  };
}
// Pull every numeric coordinate out of an SVG path `d` (alternating x,y after each M/L command).
function coords(d) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

(async () => {
  console.log("=== RESEARCH CONNECTOR ROUTING (game rule: one-slot elbow, cell-center lines) ===");
  const PORT = 3731, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const pathD = (pa, ca) => page.evaluate(([p, c]) => window.__novaConnectorPathD(p, c), [pa, ca]);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaConnectorPathD === "function", null, { timeout: 20000 });
    ok("connector router is exposed for testing", true);

    // Stacked same-x pair (the original in-game report): a plain straight drop, center to center,
    // and NEVER bulging out the side (the game never routes a stacked pair out and back).
    {
      const d = await pathD(anchors(100, 100), anchors(100, 250));
      const p = coords(d);
      ok("stacked same-x pair → straight vertical (2 points)", p.length === 2, d);
      ok("stacked same-x pair → both points share x (truly straight down)", p.length === 2 && p[0].x === p[1].x, d);
      ok("stacked pair → NO side bulge", Math.max(...p.map((q) => q.x)) <= 101, d);
      ok("stacked pair → runs cell-center to cell-center (y 100 → 250)",
        p.length === 2 && p[0].y === 100 && p[1].y === 250, d);
    }

    // Vertical-dominant with an x offset → UP-rule: down ONE SLOT (70), across, then down. The elbow is a
    // slot below the parent's cell — not the midpoint (that was the old, non-game elbow at y=189).
    {
      const d = await pathD(anchors(100, 100), anchors(140, 260));
      const p = coords(d);
      ok("vertical offset → 4-point orthogonal path", p.length === 4, d);
      ok("vertical offset → elbow exactly ONE SLOT below the parent (y=170, not midpoint 180)",
        p.length === 4 && p[1].y === 170 && p[2].y === 170, d);
      ok("vertical offset → first segment vertical off the parent's cell (x unchanged)",
        p.length === 4 && p[0].x === p[1].x && p[0].y === 100, d);
      ok("vertical offset → lands on the child's cell center (140,260)",
        p.length === 4 && p[3].x === 140 && p[3].y === 260, d);
    }

    // Child ABOVE the parent (dy<0) still routes straight when same-column — a plain vertical line.
    {
      const d = await pathD(anchors(100, 300), anchors(100, 150));
      const p = coords(d);
      ok("child-above pair → straight vertical (2 points)", p.length === 2, d);
      ok("child-above pair → spans the two cell centers (150 ↔ 300)",
        p.length === 2 && Math.min(p[0].y, p[1].y) === 150 && Math.max(p[0].y, p[1].y) === 300, d);
    }

    // Same-y row → straight horizontal, cell center to cell center (the under-box ends are hidden by the
    // boxes themselves, exactly like the game's line grid).
    {
      const d = await pathD(anchors(100, 100), anchors(340, 100));
      const p = coords(d);
      ok("same-y row → straight horizontal (2 points)", p.length === 2, d);
      ok("same-y row → cell center to cell center (x 100 → 340)",
        p.length === 2 && p[0].x === 100 && p[1].x === 340, d);
      ok("same-y row → both points share y (truly horizontal)", p.length === 2 && p[0].y === p[1].y, d);
    }

    // Horizontal-dominant with a y offset → LEFT-rule (wiki verbatim): "goes right for one unit, then goes
    // vertically for as much as necessary, and finally continues right". Elbow ONE SLOT right of the parent.
    {
      const d = await pathD(anchors(100, 100), anchors(340, 150));
      const p = coords(d);
      ok("horizontal offset → 4-point orthogonal path", p.length === 4, d);
      ok("horizontal offset → elbow exactly ONE SLOT right of the parent (x=170, not midpoint 220)",
        p.length === 4 && p[1].x === 170 && p[2].x === 170, d);
      ok("horizontal offset → starts at the parent's cell center and lands on the child's (100,100 → 340,150)",
        p.length === 4 && p[0].x === 100 && p[0].y === 100 && p[3].x === 340 && p[3].y === 150, d);
    }

    // Short horizontal span (child one slot away, offset lane): the one-slot elbow would overshoot, so the
    // turn falls back to halfway — the game's close-case look, never past the child.
    {
      const d = await pathD(anchors(100, 100), anchors(170, 150));
      const p = coords(d);
      ok("short-span pair → orthogonal with a NO-OVERSHOOT elbow (between the two cells)",
        p.length === 4 && p[1].x > 100 && p[1].x < 170, d);
    }

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-CONNECTOR-ROUTING: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
