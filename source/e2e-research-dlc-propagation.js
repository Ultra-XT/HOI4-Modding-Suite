// Research DLC HIDING must propagate down the prereq chain through OR nodes. MD ships a base artillery
// line gated NOT{has_dlc=No Step Back} on its ROOT (artillery_0) and an NSB line gated has_dlc on its
// root. With NSB owned the game hides the WHOLE base line; Nova must too, or you get TWO "ART 2005"
// boxes (base artillery_2 next to nsb_artillery_2). The base chain reaches an OR[artillery_1, SP_arty_1]
// node, and the old code filtered OR prereqs on `p.tech` (undefined — OR uses an array `p.techs`), so OR
// groups were ignored and the chain leaked through. This exercises the pure rule
// (window.__novaComputeDlcHidden) over a synthetic copy of that exact graph. Run: npm run test:research-dlc-propagation
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// MD's base/NSB artillery graph, reduced to the shape that matters.
const TECHS = [
  { id: "artillery_0", forbidDlc: ["No Step Back"], prerequisites: [] },             // base root: hidden when NSB owned
  { id: "Arty_upgrade_1", prerequisites: [{ type: "AND", tech: "artillery_0" }] },
  { id: "artillery_1", prerequisites: [{ type: "AND", tech: "Arty_upgrade_1" }] },
  { id: "SP_arty_1", prerequisites: [{ type: "AND", tech: "Arty_upgrade_1" }] },
  { id: "Arty_upgrade_2", prerequisites: [{ type: "OR", techs: ["artillery_1", "SP_arty_1"] }] }, // the OR node
  { id: "artillery_2", prerequisites: [{ type: "AND", tech: "Arty_upgrade_2" }] },   // the duplicate "ART 2005"
  { id: "nsb_artillery_2", requireDlc: ["No Step Back"], prerequisites: [] },         // NSB line: hidden when NSB NOT owned
  { id: "ungated_root", prerequisites: [] },
  { id: "or_child_mixed", prerequisites: [{ type: "OR", techs: ["artillery_1", "ungated_root"] }] }, // one alt survives
];

(async () => {
  console.log("=== RESEARCH DLC hiding propagation (OR nodes) ===");
  const PORT = 3735, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  // Run the pure rule with an owned-DLC set; the gate predicate is rebuilt in-page from each tech's gate.
  const hiddenWith = (owned) => page.evaluate(([techs, own]) => {
    const set = new Set(own);
    const passes = (t) => {
      for (const d of (t.forbidDlc || [])) if (set.has(d)) return false;
      for (const d of (t.requireDlc || [])) if (!set.has(d)) return false;
      return true;
    };
    return [...window.__novaComputeDlcHidden(techs, passes)];
  }, [TECHS, owned]);

  try {
    await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaComputeDlcHidden === "function", null, { timeout: 20000 });
    ok("DLC-propagation rule is exposed for testing", true);

    // NSB OWNED → the whole base line hides (incl. through the OR node), the NSB line stays.
    const onNSB = new Set(await hiddenWith(["No Step Back"]));
    ok("NSB owned: base root artillery_0 hidden", onNSB.has("artillery_0"));
    ok("NSB owned: OR node Arty_upgrade_2 hidden (both alternatives gone)  [the bug]", onNSB.has("Arty_upgrade_2"));
    ok("NSB owned: the duplicate base artillery_2 is hidden  [the fix]", onNSB.has("artillery_2"));
    ok("NSB owned: artillery_1 + SP_arty_1 + Arty_upgrade_1 hidden", onNSB.has("artillery_1") && onNSB.has("SP_arty_1") && onNSB.has("Arty_upgrade_1"));
    ok("NSB owned: the NSB line nsb_artillery_2 stays visible", !onNSB.has("nsb_artillery_2"));
    // OR with one surviving alternative must NOT hide the child.
    ok("NSB owned: an OR child keeps showing if ANY alternative survives", !onNSB.has("or_child_mixed"));

    // NSB NOT owned → base line shows, the NSB line hides. (No duplicate either way.)
    const offNSB = new Set(await hiddenWith([]));
    ok("NSB not owned: base artillery_2 is visible", !offNSB.has("artillery_2"));
    ok("NSB not owned: base root + OR node visible", !offNSB.has("artillery_0") && !offNSB.has("Arty_upgrade_2"));
    ok("NSB not owned: the NSB line nsb_artillery_2 is hidden", offNSB.has("nsb_artillery_2"));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRESEARCH-DLC-PROPAGATION: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
