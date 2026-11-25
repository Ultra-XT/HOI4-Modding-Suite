// Rename a section label and retype a year IN THE UI, then assert: no write leaves the page, the change
// is visible, and Ctrl+Z reverts it. READ-ONLY against the real mod.
// PREREQUISITES: a Nova server (the runner's, or one it starts itself) and a real mod on disk — so this
// SKIPS (exit 0) when either is missing, keeping the aggregate runner green on a machine with no game.
const fsx = require("fs");
const net = require("net");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-staging-live: SKIPPED (playwright unavailable)"); process.exit(0); }
// #a-bare-test-run-writes-into-the-real-app-data — the runner names its sandboxed server here. Run bare there is none,
// and this fell back to the app's own port: the owner's open Nova. Now it starts a server of its own, in its sandbox.
const { ownLiveServer, openResearchPage } = require("./testlib-live-server.js");
let PORT = +(process.env.NOVA_PORT || 0);
const serverUp = () => new Promise((res) => {
  const s = net.connect({ port: PORT, host: "127.0.0.1" }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
  s.setTimeout(1500, () => { s.destroy(); res(false); });
});
const MOD = process.env.NOVA_SNAP_MOD || ["D:", "SteamLibrary", "steamapps", "workshop", "content", "394360", "2777392649"].join(require("path").sep);
let fails = 0;
const ok = (c, m, x) => { console.log((c ? "  PASS " : "  FAIL ") + m + (c ? "" : "   << " + JSON.stringify(x))); if (!c) fails++; };
(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-staging-live");
  if (!(await serverUp())) { console.log(`test-research-staging-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-staging-live: SKIPPED (mod not installed)"); process.exit(0); }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const writes = [];
  p.on("request", (r) => { if (r.method() !== "GET") writes.push(r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });
  // #live-test-ignores-nova-port — NAVIGATE TO THE PORT WE JUST PROBED. This read NOVA_PORT for the
  // reachability check above and then went to a hardcoded 47821, so the override the runner advertises could
  // not work: with a server on another port this passed the probe and then navigated nowhere, and with two
  // instances up it silently tested the one nobody asked for.
  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://127.0.0.1:${PORT}`, MOD);

  // ---- YEAR: double-click a stamp, retype the value ----
  const y0 = await p.evaluate(() => {
    const e = document.querySelector(".research-gui-year");
    if (!e) return null;
    e.scrollIntoView({ block: "center", inline: "center" });
    const r = e.getBoundingClientRect();
    return { val: e.dataset.year, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  });
  ok(!!y0, "found a year stamp", y0);
  if (y0) {
    const wBefore = writes.length;
    await p.mouse.dblclick(y0.cx, y0.cy);
    await p.waitForTimeout(400);
    const hasInput = await p.evaluate(() => !!document.querySelector(".research-gui-year input"));
    ok(hasInput, "double-click opens an inline editor on the year");
    if (hasInput) {
      await p.keyboard.press("Control+a");
      await p.keyboard.type("1999");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(700);
      const shown = await p.evaluate(() => [...document.querySelectorAll(".research-gui-year")].map((e) => e.dataset.year));
      ok(shown.includes("1999"), "the retyped year is shown on the canvas", shown.slice(0, 6));
      ok(writes.length === wBefore, "retyping a year issued NO write", writes.slice(wBefore));
      const d = await p.evaluate(() => window.researchHistoryDepth());
      ok(d.undo >= 1, "retyping a year created an undo step", d);
      await p.keyboard.press("Control+z");
      await p.waitForTimeout(600);
      const back = await p.evaluate(() => [...document.querySelectorAll(".research-gui-year")].map((e) => e.dataset.year));
      ok(!back.includes("1999"), "Ctrl+Z reverted the year", back.slice(0, 6));
    }
  }

  // ---- LABEL: rename in place ----
  const l0 = await p.evaluate(() => {
    const e = document.querySelector(".research-gui-label");
    if (!e) return null;
    e.scrollIntoView({ block: "center", inline: "center" });
    const r = e.getBoundingClientRect();
    return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  });
  ok(!!l0, "found a section label", l0);
  if (l0) {
    const wBefore = writes.length;
    await p.mouse.click(l0.cx, l0.cy);
    await p.waitForTimeout(600);
    const editing = await p.evaluate(() => !!document.querySelector(".research-gui-label.editing"));
    ok(editing, "a click opens the label for editing");
    if (editing) {
      await p.keyboard.press("Control+a");
      await p.keyboard.type("NOVA TEST LABEL");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(900);
      ok(writes.length === wBefore, "renaming a label issued NO write (staged, not saved)", writes.slice(wBefore));
      const staged = await p.evaluate(() => window.researchHistoryDepth());
      ok(staged.undo >= 1, "the rename created an undo step", staged);
    }
  }

  ok(writes.length === 0, "ZERO writes across the whole editing session", writes);
  console.log(`  (non-GET requests: ${writes.length}${writes.length ? " -> " + writes.join(", ") : ""})`);
  await b.close();
  console.log(fails ? `\nSTAGE LIVE TEST: ${fails} FAILED` : "\nSTAGE LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
