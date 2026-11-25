// #combo-scroll-self-dismiss — THE DROPDOWN PANEL WAS KILLING ITSELF ON ITS OWN SCROLLBAR.
//
// Reported by the user: "i cant click on anything and if i do click on anything it disappears, i cant
// scroll down or it will be gone as well". Every `<input list=…>` on the military page is upgraded to
// Nova's own combo panel (novaCombo), and the dismiss handler was an unconditional closeCombo bound to
// window scroll in the CAPTURE phase — so it saw scroll events from ANY element, including the panel's own
// `overflow-y: auto` box. One wheel-tick over the list destroyed it.
//
// The ↑↓ handler self-destructed the same way: its scrollIntoView fired the same event, killing the panel
// at the tenth row so the following Enter picked nothing.
//
// And once dismissed the box read as DEAD: the panel opened only on the input's `focus` event, and the
// input still held focus, so clicking it again fired nothing. That is the "can't click on anything" half —
// not the click failing, but there being nothing left to click into.
//
// 16 inputs on that page are affected. The long ones can only be used by scrolling.
//
// Other pages are NOT affected: characters, country-setup, index and research keep the NATIVE datalist
// popup. novaCombo exists only in army.js.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-combo-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const MOD = path.join(ROOT, "combo_probe");
fs.mkdirSync(path.join(MOD, "common"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="Combo Probe"\nsupported_version="1.19.*"\npath="mod/combo_probe"\n', "utf8");

(async () => {
  console.log("=== ARMY: the combo panel survives its own scrollbar ===");
  const PORT = 3760, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem("nova_seen_welcome", "1");
      localStorage.setItem("hoi4_help_dismissed", "1");
      localStorage.setItem("activeModPath", m);
    } catch (_) {}
  }, MOD);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const state = () => page.evaluate(() => {
    const p = document.querySelector(".nova-combo");
    return { open: !!p, rows: p ? p.querySelectorAll(".nc-opt").length : 0, scrollTop: p ? p.scrollTop : -1 };
  });

  try {
    await page.goto(`${BASE}/army.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof document.querySelector === "function", null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // Build a standalone combo so the test does not depend on the Divisions tab's own setup flow. It goes
    // through the SAME upgrade path (the MutationObserver picks up any `<input list=…>`), which is the code
    // under test.
    await page.evaluate(() => {
      const dl = document.createElement("datalist");
      dl.id = "probeComboList";
      dl.innerHTML = Array.from({ length: 60 }, (_, i) => `<option value="${i}">symbol ${i}</option>`).join("");
      const inp = document.createElement("input");
      inp.id = "probeCombo";
      inp.setAttribute("list", "probeComboList");
      inp.style.cssText = "position:fixed; left:40px; top:120px; width:220px; z-index:5;";
      document.body.appendChild(dl);
      document.body.appendChild(inp);
    });
    await page.waitForTimeout(400); // let the observer upgrade it

    console.log("\n[control] the panel opens and a visible row still picks");
    // FIRST: if this fails the rest measures nothing.
    await page.click("#probeCombo");
    await page.waitForTimeout(250);
    let s = await state();
    ok("the panel opened", s.open && s.rows > 10, s);
    ok("…and the native popup was replaced", await page.evaluate(() => !document.getElementById("probeCombo").getAttribute("list")));
    await page.evaluate(() => document.querySelectorAll(".nova-combo .nc-opt")[4].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await page.waitForTimeout(250);
    ok("clicking a visible row sets the value", await page.evaluate(() => document.getElementById("probeCombo").value) === "4",
      await page.evaluate(() => document.getElementById("probeCombo").value));

    console.log("\n[the bug] scrolling the panel must NOT destroy it");
    await page.evaluate(() => { const i = document.getElementById("probeCombo"); i.value = ""; i.blur(); });
    await page.click("#probeCombo");
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const p = document.querySelector(".nova-combo");
      p.scrollTop = 200;
      p.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    await page.waitForTimeout(250);
    s = await state();
    ok("the panel survived its own scroll", s.open, s);
    ok("…and actually scrolled", s.scrollTop > 0, s);
    // WHICH CHANGE IS LOAD-BEARING, stated honestly because I checked twice and was wrong the first time.
    // An adversarial review noted the two checks above still pass with the panel's own-scrollbar exemption
    // deleted. That is true, and so is a second thing I only found by trying it: NOTHING observable changes
    // when it is deleted. Without the exemption the handler falls through to the reposition branch, and
    // place() recomputes from the input's rect — which has not moved — so it puts the panel back in exactly
    // the same spot. The exemption is therefore a pure PERFORMANCE guard (it stops place() running on every
    // wheel-tick over a 29,500-row list), with no behavioural signature that any test can detect.
    // The fix that actually made this bug go away is the unconditional closeCombo() becoming conditional,
    // and that IS covered — by the two checks above, whose control fails 7 of 12.
    // The assertion below locks a real property (the panel stays glued to its input while you scroll it);
    // it does not, and cannot, cover the exemption.
    const beforeScrollTop = await page.evaluate(() => document.querySelector(".nova-combo").getBoundingClientRect().top);
    await page.evaluate(() => {
      const p = document.querySelector(".nova-combo");
      p.scrollTop = 260;
      p.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    await page.waitForTimeout(200);
    const afterScrollTop = await page.evaluate(() => {
      const p = document.querySelector(".nova-combo");
      return p ? p.getBoundingClientRect().top : -99999;
    });
    ok("…and scrolling inside it does not re-place the panel", Math.abs(afterScrollTop - beforeScrollTop) < 0.5,
      { before: beforeScrollTop, after: afterScrollTop });

    console.log("\n[the bug] a row only reachable by scrolling must pick");
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".nova-combo .nc-opt")].find((x) => x.dataset.v === "30");
      if (b) b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    ok("a scrolled-to row sets the value", await page.evaluate(() => document.getElementById("probeCombo").value) === "30",
      await page.evaluate(() => document.getElementById("probeCombo").value));

    console.log("\n[the bug] the box must not be dead after a dismissal");
    // The input still holds focus after a dismiss, so a focus-only open path never fires again.
    await page.evaluate(() => { document.querySelector(".nova-combo") && document.querySelector(".nova-combo").remove(); });
    await page.click("#probeCombo");
    await page.waitForTimeout(300);
    s = await state();
    ok("clicking the still-focused input reopens the panel", s.open, s);

    console.log("\n[the bug] keyboard navigation must survive its own scrollIntoView");
    await page.evaluate(() => { const i = document.getElementById("probeCombo"); i.value = ""; i.blur(); });
    await page.click("#probeCombo");
    await page.waitForTimeout(250);
    for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    s = await state();
    ok("the panel survived 14 ArrowDowns", s.open, s);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    ok("…and Enter picked the highlighted row",
      await page.evaluate(() => document.getElementById("probeCombo").value) === "13",
      await page.evaluate(() => document.getElementById("probeCombo").value));

    console.log("\n[control] an OUTER scroll still keeps the panel on its input");
    await page.evaluate(() => { const i = document.getElementById("probeCombo"); i.value = ""; i.blur(); });
    await page.click("#probeCombo");
    await page.waitForTimeout(250);
    const topBefore = await page.evaluate(() => document.querySelector(".nova-combo").getBoundingClientRect().top);
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await page.waitForTimeout(200);
    s = await state();
    ok("an unrelated scroll does not destroy the panel", s.open, s);
    const topAfter = await page.evaluate(() => { const p = document.querySelector(".nova-combo"); return p ? p.getBoundingClientRect().top : -1; });
    // The input is position:fixed here, so the panel should stay put rather than drift.
    ok("…and it stays glued to its input", Math.abs(topAfter - topBefore) < 3, { topBefore, topAfter });

    console.log("\n[control] clicking OUTSIDE still dismisses it — this is a fix, not a removal");
    await page.mouse.click(900, 700);
    await page.waitForTimeout(250);
    ok("an outside click still closes the panel", !(await state()).open, await state());

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nARMY-COMBO-SCROLL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
