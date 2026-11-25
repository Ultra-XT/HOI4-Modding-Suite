// A decision's name must be written WHERE THE KEY ALREADY LIVES, and a save must never blank a tooltip.
//
// Three defects (#loc-update-in-place):
//
//   1. Every save appended `<id>` and an EMPTY `<id>_desc` into one hardcoded file,
//      localisation/english/custom_decisions_l_english.yml, no matter what the mod already said. In
//      Millennium Dawn 4520 of 4651 decision ids are already localised elsewhere and 2272 already have a
//      non-empty `<id>_desc`, so a save duplicated the key AND could blank the decision's tooltip in game.
//      The wiki is blunt on duplicates: overlap "must be avoided" and the winning value "does not seem to
//      have a consistent pattern".
//   2. A save that changed no name still rewrote (or created) the fallback file.
//   3. A decision declaring `name = SOME_KEY` takes its displayed name from that key, so renaming one by
//      writing `<id>` did nothing the game could see — 42 MD and 64 vanilla decisions are shaped that way.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const MOD = path.join(os.tmpdir(), "nova-decision-loc-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(MOD, { recursive: true, force: true });
const decDir = path.join(MOD, "common", "decisions");
const locDir = path.join(MOD, "localisation", "english");
fs.mkdirSync(decDir, { recursive: true });
fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DecLoc"\nsupported_version="1.19.*"\n');

const FILE = "AAA_theme_decisions.txt";
fs.writeFileSync(path.join(decDir, FILE), [
  "loc_cat = {",
  "\thas_own_loc = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 5",
  "\t\tavailable = { always = yes }",
  "\t}",
  "\tnamed_elsewhere = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 5",
  "\t\tname = MY_OWN_TITLE_KEY",
  "\t\tavailable = { always = yes }",
  "\t}",
  "\tbrand_new_dec = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 5",
  "\t\tavailable = { always = yes }",
  "\t}",
  "\tbehind_a_banner = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 5",
  "\t\tavailable = { always = yes }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// The mod already localises two of them, in a file whose name sorts BEFORE custom_* — exactly the case
// where a duplicate in the fallback file would be the copy the game reads.
const MOD_LOC = path.join(locDir, "AAA_my_mod_l_english.yml");
const MOD_LOC_TEXT = "﻿l_english:\n" + [
  ' has_own_loc:0 "Original Title"',
  ' has_own_loc_desc:0 "A carefully written tooltip that must survive."',
  ' MY_OWN_TITLE_KEY:0 "Named Elsewhere"',
  ' MY_OWN_TITLE_KEY_desc:0 "Its real tooltip."',
  "",
].join("\n");
fs.writeFileSync(MOD_LOC, MOD_LOC_TEXT, "utf8");

// A file whose `l_english:` header sits BELOW a long comment banner. That is legal and Millennium Dawn
// ships one (MD_focus_SIN_l_english.yml, header on line 11, 896 keys). The reader used to look for the
// header only within the first ten RAW lines, so the whole file parsed as empty: every decision defined in
// it showed no name in the editor, and saving one then overwrote the real name with a guess made from its id.
const BANNER_LOC = path.join(locDir, "AAB_banner_l_english.yml");
const BANNER_LOC_TEXT = "﻿" + [
  "# Author(s): Somebody",
  "# Reviewed: yes",
  "# Line 3", "# Line 4", "# Line 5", "# Line 6", "# Line 7", "# Line 8", "# Line 9", "# Line 10",
  "l_english:",
  ' behind_a_banner:0 "Behind A Banner"',
  ' behind_a_banner_desc:0 "Its tooltip, which must not be lost."',
  "",
].join("\n");
fs.writeFileSync(BANNER_LOC, BANNER_LOC_TEXT, "utf8");

const FALLBACK = path.join(locDir, "custom_decisions_l_english.yml");
const modLoc = () => fs.readFileSync(MOD_LOC, "utf8");
const fallback = () => (fs.existsSync(FALLBACK) ? fs.readFileSync(FALLBACK, "utf8") : "");
const allLoc = () => fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
const countKey = (key) => (allLoc().match(new RegExp("^[ \\t]*" + key + ":\\d*", "gm")) || []).length;
const valueOf = (key) => { const m = new RegExp("^[ \\t]*" + key + ':\\d*\\s*"(.*)"\\s*$', "m").exec(allLoc()); return m ? m[1] : null; };

const PORT = 39588, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  const save = (over) => post("/api/decisions/save", Object.assign({
    modPath: MOD, categoryId: "loc_cat", fileName: FILE,
    cost: 5, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
    available: "always = yes", modifier: "", effect: "", decisionType: "decision", scope: "national",
    cooldown: "", targetTrigger: "", removeEffect: "",
  }, over || {}));

  try {
    // ── an unchanged name writes nothing at all ────────────────────────────────────────────────────
    const r0 = await save({ id: "has_own_loc", name: "Original Title", previousId: "has_own_loc", previousCategoryId: "loc_cat" });
    ok("save → 200", r0.s === 200, r0.b);
    ok("the mod's own loc file is byte-identical", modLoc() === MOD_LOC_TEXT, modLoc());
    // The fallback file may exist — the CATEGORY `loc_cat` is defined nowhere, so it legitimately gets a
    // name written there. What must not appear is a second definition of the DECISION's key.
    ok("nothing about the decision was routed to the fallback file",
      !/has_own_loc\b/.test(fallback()), fallback());
    ok("the tooltip survived", valueOf("has_own_loc_desc") === "A carefully written tooltip that must survive.", valueOf("has_own_loc_desc"));
    ok("the name is defined exactly once", countKey("has_own_loc") === 1, countKey("has_own_loc"));

    // ── a CHANGED name is rewritten in place, not duplicated ──────────────────────────────────────
    await breathe();
    const r1 = await save({ id: "has_own_loc", name: "Renamed In Place", previousId: "has_own_loc", previousCategoryId: "loc_cat" });
    ok("save → 200", r1.s === 200, r1.b);
    ok("the new name landed", valueOf("has_own_loc") === "Renamed In Place", valueOf("has_own_loc"));
    ok("…in the mod's own file", /has_own_loc:0 "Renamed In Place"/.test(modLoc()), modLoc());
    ok("still defined exactly once across the mod", countKey("has_own_loc") === 1, countKey("has_own_loc"));
    ok("the tooltip STILL survived", valueOf("has_own_loc_desc") === "A carefully written tooltip that must survive.", valueOf("has_own_loc_desc"));
    ok("_desc is defined exactly once", countKey("has_own_loc_desc") === 1, countKey("has_own_loc_desc"));
    ok("no empty _desc was added anywhere", !/has_own_loc_desc:0 ""/.test(allLoc()), allLoc());

    // ── an explicit `name = SOME_KEY` is the key the game reads ────────────────────────────────────
    await breathe();
    const r2 = await save({ id: "named_elsewhere", name: "New Visible Title", previousId: "named_elsewhere", previousCategoryId: "loc_cat" });
    ok("save → 200", r2.s === 200, r2.b);
    ok("the rename went to the declared key", valueOf("MY_OWN_TITLE_KEY") === "New Visible Title", valueOf("MY_OWN_TITLE_KEY"));
    ok("…and not to the decision id", countKey("named_elsewhere") === 0, { count: countKey("named_elsewhere"), loc: allLoc() });
    ok("the declared key's tooltip survived", valueOf("MY_OWN_TITLE_KEY_desc") === "Its real tooltip.", valueOf("MY_OWN_TITLE_KEY_desc"));
    ok("the explicit name line is still in the decision", /name\s*=\s*MY_OWN_TITLE_KEY/.test(fs.readFileSync(path.join(decDir, FILE), "utf8")));

    // ── a genuinely new key goes to the fallback file ──────────────────────────────────────────────
    await breathe();
    const r3 = await save({ id: "brand_new_dec", name: "Brand New", previousId: "brand_new_dec", previousCategoryId: "loc_cat" });
    ok("save → 200", r3.s === 200, r3.b);
    ok("the new name is written", valueOf("brand_new_dec") === "Brand New", valueOf("brand_new_dec"));
    ok("it went to the fallback file", /brand_new_dec:0 "Brand New"/.test(fallback()), fallback());
    ok("defined exactly once", countKey("brand_new_dec") === 1, countKey("brand_new_dec"));
    // It already existed on disk, so it is an EDIT — no placeholder tooltip should be invented for it.
    // MD ships thousands of decisions with no `_desc`, and adding one per edited decision is pure churn.
    ok("editing an existing decision invents no empty _desc", !/brand_new_dec_desc/.test(allLoc()), fallback());

    // …but a decision Nova is genuinely CREATING gets the placeholder, so the game shows no red key.
    await breathe();
    const rNew = await save({ id: "truly_new_dec", name: "Truly New", previousId: "", previousCategoryId: "" });
    ok("creating a new decision → 200", rNew.s === 200, rNew.b);
    ok("its name was written", valueOf("truly_new_dec") === "Truly New", valueOf("truly_new_dec"));
    ok("an empty _desc WAS created for it", /truly_new_dec_desc:0 ""/.test(fallback()), fallback());
    ok("the other mod file was not touched by any of this", /Renamed In Place/.test(modLoc()) && /Its real tooltip\./.test(modLoc()));

    // ── a name behind a long comment banner is FOUND, not overwritten with a guess ─────────────────
    await breathe();
    const l = await fetch("http://127.0.0.1:" + PORT + "/api/decisions/list?modPath=" + encodeURIComponent(MOD)).then((r) => r.json());
    const banner = (l.categories || []).flatMap((c) => c.decisions || []).find((d) => d.id === "behind_a_banner");
    ok("the list reports the name from behind the banner", banner && banner.name === "Behind A Banner", banner && banner.name);
    const r5 = await save({ id: "behind_a_banner", name: banner ? banner.name : "", previousId: "behind_a_banner", previousCategoryId: "loc_cat" });
    ok("save → 200", r5.s === 200, r5.b);
    ok("the real name survived the save", valueOf("behind_a_banner") === "Behind A Banner", valueOf("behind_a_banner"));
    ok("its tooltip survived", valueOf("behind_a_banner_desc") === "Its tooltip, which must not be lost.", valueOf("behind_a_banner_desc"));
    ok("the banner file is byte-identical", fs.readFileSync(BANNER_LOC, "utf8") === BANNER_LOC_TEXT);
    ok("nothing was duplicated into the fallback", !/behind_a_banner/.test(fallback()), fallback());

    // ── a declared `name = KEY` must be RESOLVED, not reinvented (#decision-declared-name-key) ─────
    // 42 MD decisions declare their own title key. The list used to resolve the name from the decision's ID
    // only, so those reported no name at all — the form then filled the box with a title generated from the
    // id, and the next Save wrote that invention to the declared key. Because MD reuses one key across
    // several decisions, that renamed all of them at once; and when the key lives in the base game rather
    // than the mod, it silently overrode the game's own text.
    await breathe();
    const l2 = await fetch("http://127.0.0.1:" + PORT + "/api/decisions/list?modPath=" + encodeURIComponent(MOD)).then((r) => r.json());
    const named = (l2.categories || []).flatMap((c) => c.decisions || []).find((d) => d.id === "named_elsewhere");
    ok("the list exposes the declared name key", named && named.nameKey === "MY_OWN_TITLE_KEY", named && named.nameKey);
    ok("…and resolves the name FROM that key, not from the id",
      named && named.name === "New Visible Title", named && named.name);
    // …and a save that changes nothing writes nothing, even though the id itself has no localisation at all
    const before2 = allLoc();
    const rIdem = await save({ id: "named_elsewhere", name: named ? named.name : "", previousId: "named_elsewhere", previousCategoryId: "loc_cat" });
    ok("an unchanged declared-key save → 200", rIdem.s === 200, rIdem.b);
    ok("…and changed no localisation at all", allLoc() === before2, { now: allLoc().length, was: before2.length });
    ok("the decision id was NOT localised as a side effect", countKey("named_elsewhere") === 0, countKey("named_elsewhere"));

    // ── repeat saves must not accumulate ──────────────────────────────────────────────────────────
    await breathe();
    const snapshot = allLoc();
    await save({ id: "brand_new_dec", name: "Brand New", previousId: "brand_new_dec", previousCategoryId: "loc_cat" });
    await breathe();
    await save({ id: "has_own_loc", name: "Renamed In Place", previousId: "has_own_loc", previousCategoryId: "loc_cat" });
    ok("two more no-op saves change no localisation at all", allLoc() === snapshot, { now: allLoc().length, was: snapshot.length });

    // ── a $-bearing name still can't corrupt the file it lands in ─────────────────────────────────
    await breathe();
    const r4 = await save({ id: "has_own_loc", name: "Worth $'000 and $& more", previousId: "has_own_loc", previousCategoryId: "loc_cat" });
    ok("save → 200", r4.s === 200, r4.b);
    ok("the $-name is stored literally", valueOf("has_own_loc") === "Worth $'000 and $& more", valueOf("has_own_loc"));
    ok("no key was duplicated by it", countKey("has_own_loc") === 1 && countKey("has_own_loc_desc") === 1, { a: countKey("has_own_loc"), b: countKey("has_own_loc_desc") });
    ok("every value is still terminated", (modLoc().match(/"/g) || []).length % 2 === 0, modLoc());
    ok("the neighbouring keys are intact", /MY_OWN_TITLE_KEY:0 "New Visible Title"/.test(modLoc()), modLoc());

    console.log("\ntest-decision-localisation: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 25 ? 0 : 1;
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
