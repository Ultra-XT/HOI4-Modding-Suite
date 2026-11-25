// #decision-country-lock-keyword — OPENING A DECISION AND PRESSING SAVE FLIPPED `original_tag` TO `tag`.
//
// Found by driving the user's own nova_ui_audit mod: a plain open-and-Save with no edits changed 15 of its
// 31 decisions, each by exactly one line — `original_tag = NUA` becoming `tag = NUA #nova_country_lock`.
//
// Why it matters: `tag` matches a country's CURRENT tag, `original_tag` the tag it started the game as.
// After the flip the decision disappears for any country that has changed tag — a civil-war winner, a
// released puppet, a formable nation, a government-in-exile — and can appear for whoever holds that tag
// instead. Nothing in the UI says anything changed. It is the dominant idiom in real content (1,548 vanilla
// decisions and 989 Millennium Dawn ones use a bare `original_tag`), and Nova's own Allowed placeholder
// recommends `original_tag = GRE`, so users following Nova's guidance were the ones hit.
//
// ⚠️ THIS HAS TO BE A BROWSER TEST. The defect is entirely client-side: the LOAD path strips the lock line
// out of the Allowed textarea and keeps only the tag in a dropdown, so by save time there is nothing left to
// re-derive the keyword from. Posting a pre-built `allowed` string straight to /api/decisions/save exercises
// the server, which was always innocent, and passes with the fix reverted — I wrote that test first and its
// control refused to fire. Only load-then-save through the real page proves anything.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lockui-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const MOD = path.join(ROOT, "lockmod");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="LockMod"\nsupported_version="1.19.*"\npath="mod/lockmod"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "zz_cat.txt"),
  "nova_lock_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");
const DEC = path.join(MOD, "common", "decisions", "nova_lock.txt");
const ORIGINAL = `nova_lock_cat = {
\tnova_locked_dec = {
\t\ticon = GFX_decision_generic_decision
\t\tallowed = {
\t\t\toriginal_tag = NUA
\t\t}
\t\tcost = 10
\t\tdays_remove = 5
\t\tfire_only_once = no
\t\tavailable = {
\t\t\talways = yes
\t\t}
\t\tcomplete_effect = {
\t\t\tadd_political_power = 1
\t\t}
\t}
}
`;
fs.writeFileSync(DEC, ORIGINAL, "utf8");

(async () => {
  console.log("=== DECISIONS: open and Save must not change who the decision belongs to ===");
  const PORT = 3781, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    console.log("\n[control] the decision is there and its lock is surfaced in the UI");
    // Expand the category, then open the decision — the same clicks a user makes.
    const opened = await page.evaluate(() => {
      const titles = [...document.querySelectorAll(".category-title")];
      const t = titles.find((e) => /nova_lock_cat/.test(e.textContent));
      if (t) t.click();
      return !!t;
    });
    ok("the category is listed", opened);
    await page.waitForTimeout(900);
    const clicked = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".decision-item, .category-items *")];
      const it = items.find((e) => (e.textContent || "").includes("nova_locked_dec") && e.click);
      if (it) { it.click(); return true; }
      return false;
    });
    ok("the decision opens", clicked);
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => ({
      lock: (document.getElementById("decisionCountryLock") || {}).value || "",
      keyword: ((document.getElementById("decisionCountryLock") || {}).dataset || {}).lockKeyword || "",
      allowed: (document.getElementById("decisionAllowed") || {}).value || "",
      id: (document.getElementById("decisionId") || {}).value || "",
    }));
    ok("…with the decision loaded", state.id === "nova_locked_dec", state);
    ok("…the country lock surfaced in the dropdown", state.lock === "NUA", state);
    // The two halves of the mechanism: the keyword is remembered, and the textarea no longer holds it.
    ok("…the KEYWORD was remembered", state.keyword === "original_tag", state);
    ok("…and the lock line is no longer in the Allowed box (which is why it must be remembered)",
      !/original_tag/.test(state.allowed), state.allowed);

    console.log("\n[the bug] press Save, change nothing");
    await page.evaluate(() => {
      const b = document.getElementById("saveDecisionBtn") ||
        [...document.querySelectorAll("button")].find((x) => /save/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await page.waitForTimeout(2500);

    const after = fs.readFileSync(DEC, "utf8");
    ok("the file still restricts by original_tag", /(^|\n)\s*original_tag\s*=\s*NUA/.test(after),
      after.slice(0, 400));
    ok("…and did NOT become a plain `tag`", !/(^|\n)\s*tag\s*=\s*NUA/.test(after), after.slice(0, 400));
    ok("…the country is unchanged", /NUA/.test(after), after.slice(0, 200));
    // Everything else the decision carried has to survive an unedited save too.
    ok("…cost survived", /cost\s*=\s*10\b/.test(after), after.slice(0, 400));
    ok("…days_remove survived", /days_remove\s*=\s*5\b/.test(after), after.slice(0, 400));
    ok("…the effect survived", /add_political_power\s*=\s*1/.test(after), after.slice(0, 400));
    let d = 0, balanced = true;
    for (const ch of after) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) balanced = false; } }
    ok("…and the file is still brace-balanced", balanced && d === 0, d);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDECISION-COUNTRY-LOCK: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
