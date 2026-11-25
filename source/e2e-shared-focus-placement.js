// Shared-focus PLACEMENT (#3a): a focus with relative_position_id = OTHER and x/y is positioned at OTHER's
// position PLUS its own x/y, and this chains recursively (resolve OTHER's relative_position_id first). The
// wiki (National_focus_modding) gives the canonical example: A at (1,2); B rel A at (3,4) → (4,6); C rel B at
// (-1,1) → (3,7). Shared focuses use the identical rule. This drives Nova's real resolver
// (window.__novaResolveSharedPositions) over that example + a tree-focus base + a cycle guard.
// Run: npm run test:shared-focus-placement
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== SHARED FOCUS PLACEMENT (relative_position_id chains vs the wiki) ===");
  const PORT = 3727, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const resolve = (shared, tree) => page.evaluate(([s, t]) => window.__novaResolveSharedPositions(s, t), [shared, tree]);
  const find = (arr, id) => arr.find((f) => f.id === id);

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaResolveSharedPositions === "function", null, { timeout: 20000 });
    ok("shared-focus resolver is exposed for testing", true);

    // The wiki's canonical chain: A(1,2) is a TREE focus; B rel A (3,4); C rel B (-1,1).
    const tree = [{ id: "A", displayX: 1, displayY: 2 }];
    const shared = [
      { id: "B", relativePositionId: "A", x: 3, y: 4 },
      { id: "C", relativePositionId: "B", x: -1, y: 1 },
    ];
    const r = await resolve(shared, tree);
    const B = find(r, "B"), C = find(r, "C");
    ok("B (rel A 1,2 + 3,4) → (4,6)", B && B.absX === 4 && B.absY === 6, B);
    ok("C (rel B 4,6 + -1,1) → (3,7) [chained recursively]", C && C.absX === 3 && C.absY === 7, C);

    // A shared focus relative to ANOTHER shared focus (no tree focus involved).
    const r2 = await resolve([
      { id: "S1", x: 10, y: 5 },               // root shared focus (no relative)
      { id: "S2", relativePositionId: "S1", x: 2, y: -3 },
    ], []);
    const S1 = find(r2, "S1"), S2 = find(r2, "S2");
    ok("root shared focus keeps its own coords (10,5)", S1 && S1.absX === 10 && S1.absY === 5, S1);
    ok("S2 (rel S1 10,5 + 2,-3) → (12,2)", S2 && S2.absX === 12 && S2.absY === 2, S2);

    // A dangling relative_position_id (target missing) falls back to the focus's own coords (no crash).
    const r3 = await resolve([{ id: "D", relativePositionId: "NOPE", x: 7, y: 8 }], []);
    ok("dangling relative_position_id → own coords, no crash", find(r3, "D").absX === 7 && find(r3, "D").absY === 8, r3);

    // A relative cycle (X→Y→X) must not infinite-loop.
    const r4 = await resolve([
      { id: "X", relativePositionId: "Y", x: 1, y: 1 },
      { id: "Y", relativePositionId: "X", x: 2, y: 2 },
    ], []);
    ok("relative cycle is broken (both resolve to finite coords)", Number.isFinite(find(r4, "X").absX) && Number.isFinite(find(r4, "Y").absY), r4);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nSHARED-FOCUS-PLACEMENT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
