// #portrait-role-field — EACH ROLE READS EXACTLY ONE PORTRAIT FIELD, AND HOI4 NEVER CROSSES CATEGORIES.
//
// Found by the user in game: "the leader of the nova country shared a portrait with a general in nova /
// in game the general or advisor actually changed portrait and did not have the same."
//
// Nova's preview cards resolved a portrait with a four-field fallback chain —
//     Leader  : civLarge || armyLarge || civSmall || armySmall
//     Advisor : civLarge || armyLarge || civSmall || armySmall
//     General : armyLarge || civLarge || armySmall || civSmall
// so a character who is both a field marshal and an army_chief advisor showed ONE picture on both cards,
// while the game drew army.large for the general and army.small for the advisor. Of the mod's 46 role
// cards, 24 disagreed with the game and 13 showed art the game never draws.
//
// The game's rule, measured across the whole base game (4,459 advisor blocks: 4,433 carry a small
// portrait, ZERO rely on a large one):
//     country_leader                    -> civilian.large
//     advisor idea icon                 -> army.small, else civilian.small   (never a large)
//     field_marshal / corps_commander   -> army.large
//     navy_leader                       -> navy.large
//
// Run: node e2e-character-portrait-role-field.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portrait-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); }
};

const MOD = path.join(ROOT, "portrait_probe");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'version="1"\nname="Portrait Probe"\nsupported_version="1.19.*"\npath="mod/portrait_probe"\n', "utf8");

(async () => {
  console.log("=== CHARACTERS: one role, one portrait field (#portrait-role-field) ===");
  const PORT = 3744, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
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

  // Set the four portrait fields + the three role ticks, then read back what each card painted.
  const setUp = async (fields, roles) => {
    await page.evaluate(({ f, r }) => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
      const tick = (id, v) => { const el = document.getElementById(id); if (el && el.checked !== v) { el.checked = v; el.dispatchEvent(new Event("change", { bubbles: true })); } };
      set("pCivLarge", f.civLarge || "");
      set("pCivSmall", f.civSmall || "");
      set("pArmyLarge", f.armyLarge || "");
      set("pArmySmall", f.armySmall || "");
      tick("roleLeader", !!r.leader);
      tick("roleAdvisor", !!r.advisor);
      tick("roleGeneral", !!r.general);
    }, { f: fields, r: roles });
    // updateLivePreview is async (each portrait is resolved over the network) and fires once per input
    // event, so several runs overlap and the LAST one to finish wins. Read only once the cards have
    // stopped changing, otherwise the assertions race a stale src from the previous case.
    const read = () => page.evaluate(() => {
      const src = (id) => { const el = document.getElementById(id); return el ? (el.getAttribute("src") || "") : null; };
      const hint = document.getElementById("portraitRoleHint");
      return {
        leader: src("previewLeaderPortrait"),
        advisor: src("previewAdvisorPortrait"),
        general: src("previewGeneralPortrait"),
        hint: hint && hint.style.display !== "none" ? hint.textContent : "",
      };
    });
    // Settle first (an in-flight run from the PREVIOUS case can still land here), then require three
    // consecutive identical reads. Two was not enough: when the new run had not started yet, the first
    // two reads agreed on the OLD card and the loop exited on stale data.
    await page.waitForTimeout(1200);
    let same = 0, prev = JSON.stringify(await read()), cur = prev;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(300);
      cur = JSON.stringify(await read());
      same = cur === prev ? same + 1 : 0;
      prev = cur;
      if (same >= 2) break;
    }
    return JSON.parse(cur);
  };
  // The resolver turns a sprite key into a URL; comparing URLs is what actually proves two cards drew
  // the same or different PICTURES, which is what the user saw.
  // resolvePortraitUrl returns whatever route can serve the sprite (an icon-image key URL, or a direct
  // file path once it has resolved the .dds), so identify the picture by the last path/key segment.
  const keyOf = (url) => {
    if (!url) return "";
    if (/idea_unknown/.test(url)) return "PLACEHOLDER";
    const k = /[?&]key=([^&]+)/.exec(url);
    if (k) return decodeURIComponent(k[1]).replace(/^GFX_/, "").replace(/_(medium|small|large)$/, "");
    const p = /[?&]path=([^&]+)/.exec(url);
    const raw = p ? decodeURIComponent(p[1]) : url;
    return String(raw).split(/[\\/]/).pop().replace(/\.(dds|png|tga)$/i, "").replace(/^portrait_/i, "");
  };
  // The sprite key and the file it resolves to differ in prefix/suffix, so compare on a normalised stem.
  const stem = (s) => String(s || "").replace(/^GFX_/, "").replace(/^portrait_/i, "").toLowerCase();

  try {
    await page.goto(`${BASE}/characters.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.getElementById("newCharBtn") && !!document.getElementById("pCivLarge"), null, { timeout: 30000 });
    await page.click("#newCharBtn"); // opens the editor — the portrait fields are hidden until then
    // The Portraits group is a collapsed rolebox; expand it so the inputs are real, visible fields.
    await page.evaluate(() => {
      const head = document.querySelector('.ch-rolehead[data-box="boxPortraits"]');
      if (head) head.click();
    });
    await page.waitForSelector("#pCivLarge", { timeout: 30000 });

    console.log("\n[1] THE USER'S CASE — one character who is both a general and an advisor");
    // Exactly the shape of NUA_halvard_krun: army.large + army.small, no civilian portrait at all.
    let r = await setUp(
      { armyLarge: "GFX_portrait_generic_sami_army_general_1", armySmall: "GFX_portrait_generic_sami_army_general_1_small" },
      { general: true, advisor: true });
    const genKey = keyOf(r.general), advKey = keyOf(r.advisor);
    ok("the General card draws Army LARGE", stem(genKey) === stem("generic_sami_army_general_1"), genKey);
    ok("the Advisor card draws Army SMALL", stem(advKey) === stem("generic_sami_army_general_1_small"), advKey);
    // This is the assertion that reproduces the bug report.
    ok("the two cards do NOT share one picture", genKey !== advKey, { genKey, advKey });

    console.log("\n[2] a country leader and an advisor in one character");
    // NUA_helena_vexler's shape: a civilian large for the leader, a different small for the advisor.
    r = await setUp(
      { civLarge: "GFX_portrait_Abdulaziz_Ibn_Saud", civSmall: "GFX_portrait_AFA_mohamed_yayyo_small",
        armyLarge: "GFX_portrait_Adam_Stankievic", armySmall: "GFX_portrait_AFA_mohamed_yayyo_small" },
      { leader: true, advisor: true });
    ok("the Leader card draws Civilian LARGE", /abdulazi/i.test(keyOf(r.leader)), keyOf(r.leader));
    ok("the Advisor card draws Army SMALL (the small wins, not the large)",
      stem(keyOf(r.advisor)).includes("mohamed_yayyo_small"), keyOf(r.advisor));
    ok("leader and advisor do not share a picture", keyOf(r.leader) !== keyOf(r.advisor), r);

    console.log("\n[3] AN EMPTY FIELD MUST READ AS EMPTY, not borrow another one");
    // The mod's 5 commanders with army.small but no army.large: Nova used to blow the small idea icon up
    // into the general card so the character looked finished, while the game drew no portrait at all.
    r = await setUp({ armySmall: "GFX_idea_generic_army_europe_4" }, { general: true });
    ok("a General with no Army LARGE shows the placeholder, not the small icon",
      keyOf(r.general) === "PLACEHOLDER", keyOf(r.general));
    ok("…and Nova says so in the hint", /no <b>Army LARGE<\/b>|no Army LARGE/i.test(r.hint), r.hint);

    // An advisor with ONLY large portraits gets nothing in game — the case that hit 8 of the mod's advisors.
    r = await setUp({ civLarge: "GFX_portrait_Abdulaziz_Ibn_Saud", armyLarge: "GFX_portrait_Adam_Stankievic" }, { advisor: true });
    ok("an Advisor with only LARGE portraits shows the placeholder", keyOf(r.advisor) === "PLACEHOLDER", keyOf(r.advisor));
    ok("…and the hint names the small portrait as the field that matters", /small/i.test(r.hint), r.hint);

    r = await setUp({ armyLarge: "GFX_portrait_Adam_Stankievic" }, { leader: true });
    ok("a Leader with only an Army portrait shows the placeholder", keyOf(r.leader) === "PLACEHOLDER", keyOf(r.leader));

    console.log("\n[4] the OLD hint must stop calling correct authoring a mistake");
    // 948 vanilla political advisors keep their icon in army.small with no General role. Nova used to warn
    // "You set an Army portrait, but it only displays for a Military Leader" — telling them they were wrong.
    r = await setUp({ armySmall: "GFX_portrait_AFA_mohamed_yayyo_small" }, { advisor: true });
    ok("an advisor whose icon is Army small draws it", stem(keyOf(r.advisor)).includes("mohamed_yayyo_small"), keyOf(r.advisor));
    ok("…and is NOT warned that the portrait needs a General role",
      !/only displays for a <b>Military Leader/i.test(r.hint) && !/tick that role/i.test(r.hint), r.hint);

    console.log("\n[5] the civilian-small fallback for an advisor is real");
    r = await setUp({ civSmall: "GFX_portrait_generic_sami_army_general_1_small" }, { advisor: true });
    ok("with no Army small, an Advisor falls back to Civilian small",
      stem(keyOf(r.advisor)).includes("sami_army_general_1_small"), keyOf(r.advisor));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.slice(0, 3).join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCHARACTER-PORTRAIT-ROLE-FIELD: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
