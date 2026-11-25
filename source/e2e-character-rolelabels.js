// Character maker role toggles: the role NAMES ("Country Leader" / "Advisor" / "Military Leader") must be
// real <label for="...">s tied to their checkbox, so clicking the name toggles the role (and screen readers
// associate them) — they used to be bare <span>s, so only the tiny checkbox worked. Run: npm run test:char-rolelabels
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== Character maker: role labels toggle their checkbox ===");

  // Static: each role label is a <label for> tied to its checkbox (a11y association).
  const html = fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8");
  for (const role of ["roleLeader", "roleAdvisor", "roleGeneral"]) {
    ok(`${role} has an associated <label for="${role}">`, new RegExp(`<label for="${role}"`).test(html));
  }

  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rolelbl-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  const PORT = 3675, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  try {
    await page.goto(`${BASE}/characters.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.getElementById("newCharBtn") && !!document.querySelector('label[for="roleAdvisor"]'), null, { timeout: 30000 });
    await page.click("#newCharBtn"); // Leader on, Advisor/General off by default

    // Click the ADVISOR label text (not the checkbox) → role toggles on + its body shows.
    const res = await page.evaluate(() => {
      const r = {};
      const advCb = document.getElementById("roleAdvisor");
      r.advisorBefore = advCb.checked;
      document.querySelector('label[for="roleAdvisor"]').click();
      r.advisorAfter = advCb.checked;
      r.advisorBoxOn = document.getElementById("boxAdvisor").classList.contains("on");
      r.advisorBodyShown = getComputedStyle(document.querySelector("#boxAdvisor .ch-rolebody")).display === "block";
      // and toggling it off again via the label
      document.querySelector('label[for="roleAdvisor"]').click();
      r.advisorAfterOff = advCb.checked;
      return r;
    });
    ok("Advisor starts off", res.advisorBefore === false, res);
    ok("clicking the Advisor label turns the role on", res.advisorAfter === true, res);
    ok("the box gets the 'on' class + body shows", res.advisorBoxOn === true && res.advisorBodyShown === true, res);
    ok("clicking the label again toggles it back off", res.advisorAfterOff === false, res);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCHAR-ROLELABELS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
