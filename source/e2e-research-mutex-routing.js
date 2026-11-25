// Research mutually-exclusive (⚔) link routing. MD's lte ⇄ wimax pair sits in one row separated by
// Modem/Modern Deep. The old router (a) bowed the dashed line past EVERY blocker whose x-band overlapped
// the pair — the whole column below them — so the line plunged to the BOTTOM of the tree and back (a
// giant box), and (b) pinned the swords at the raw midpoint of the two centres, landing them on the
// unrelated Modem tech between the pair (the "red X on Modem"). The fix bows only past the blockers the
// STRAIGHT line actually crosses (a same-row pair dips just under that row) and rides the swords on the
// routed line. This exercises the pure router (window.__novaMutexRoute). Run: npm run test:research-mutex-routing
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Anchors for a node centred at (cx,cy) (default 72×72 square tech).
function anc(cx, cy, w = 72, h = 72) {
  return { center: { x: cx, y: cy }, top: { x: cx, y: cy - h / 2 }, bottom: { x: cx, y: cy + h / 2 }, left: { x: cx - w / 2, y: cy }, right: { x: cx + w / 2, y: cy } };
}
const blocker = (id, cx, cy, w = 72, h = 72) => ({ id, r: { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 } });
const coords = (d) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push({ x: n[i], y: n[i + 1] }); return p; };

(async () => {
  console.log("=== RESEARCH mutex (⚔) link routing + swords-on-line ===");
  const PORT = 3739, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const route = (a, b, blk) => page.evaluate(([A, B, K]) => window.__novaMutexRoute(A, B, K), [a, b, blk]);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaMutexRoute === "function", null, { timeout: 20000 });
    ok("mutex router is exposed for testing", true);

    // Clear shot (no blocker): straight line, swords at the centre midpoint.
    {
      const r = await route(anc(100, 100), anc(500, 100), []);
      ok("clear pair → straight line", coords(r.d).length === 2, r.d);
      ok("clear pair → swords at centre midpoint", r.sword.x === 300 && r.sword.y === 100, r.sword);
    }

    // Same-row pair with a tech ON the straight line (like lte–Modem–wimax): dip JUST past that tech,
    // and the swords ride the dip — never on the blocker.
    {
      const r = await route(anc(100, 100), anc(500, 100), [blocker("modem", 300, 100)]); // blocker bottom = 136
      const p = coords(r.d);
      ok("blocked same-row pair → 4-point orthogonal dip", p.length === 4, r.d);
      ok("dip clears the blocker by a small margin (y=158, not the tree bottom)", p[1].y === 158 && p[2].y === 158, r.d);
      ok("swords ride the routed line (on the dip), NOT on the blocker", r.sword.x === 300 && r.sword.y === 158, r.sword);
      ok("swords are clear of the blocker's box (below its bottom=136)", r.sword.y > 136, r.sword);
    }

    // THE BUG: a blocker far BELOW the pair (not on the straight line) must NOT drag the line down.
    {
      const r = await route(anc(100, 100), anc(500, 100), [blocker("faraway", 300, 1000)]);
      ok("a blocker far off the line is ignored → straight line (no plunge to the bottom)", coords(r.d).length === 2, r.d);
      ok("…and the swords stay at the centre, not dragged down", r.sword.y === 100, r.sword);
    }

    // Stacked (vertical) pair with a blocker between → bow sideways, swords on the bow.
    {
      const r = await route(anc(100, 100), anc(100, 500), [blocker("mid", 100, 300)]); // blocker right = 136
      const p = coords(r.d);
      ok("blocked stacked pair → bow sideways (4 points)", p.length === 4, r.d);
      ok("bow clears the blocker's right edge (x=158)", p[1].x === 158 && p[2].x === 158, r.d);
      ok("swords ride the sideways bow", r.sword.x === 158 && r.sword.y === 300, r.sword);
    }

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-MUTEX-ROUTING: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
