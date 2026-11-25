// ⛔ #focus-text-key-ignored + #autofix-writes-the-entity-id — TWO HALVES OF ONE DEFECT.
//
// HOI4 lets a block name the localisation key it displays under: ideas and characters write `name =`,
// a national focus writes `text =`. Paradox uses it in their own files and says why:
//
//     text = CHI_the_soviet_volunteer_group_focus   #avoid hash collision with different loc
//     text = ETH_peoples_army_focus                 #otherwise conflicts with Mass Assault doctrine
//
// HALF ONE — the focus scanner recorded id/refs/hasIcon and nothing else, so missing_localization tested
// the focus ID and called correctly-localised content unlocalised:
//
//     The Road to 56   1905 -> 1316 firings   (589 were false, 31% of the rule)
//     Old World Blues   565 ->  504           (61)
//     Rise of Nations  2290 -> 2261           (29)
//     Novum Vexillum    518 ->  490           (28)
//     vanilla          2662 -> 2656           (6)
//
// HALF TWO — and this is the one that matters, because Mod Health's DETERMINISTIC tier is the tier that
// "cannot invent". /api/modhealth/fix wrote `problem.entityId`, so for any entity whose display key is not
// its id it added a line HOI4 never reads, reported success, and left the game showing the same raw key.
// 240 rows across the installed corpus resolve to a key that is not the id — 131 Rise of Nations, 51
// Millennium Dawn, 28 Road to 56, 16 Old World Blues, 9 vanilla, 5 Novum Vexillum.
//
// ⭐ The rule had ALREADY been taught to report the right key (#missing-loc-ignores-own-name). The writer
// one file over never adopted it — the dominant bug shape on this project, again.
//
// ⚠️ NOT a bug, checked and left alone: `hidden_ideas`. They do not show in the spirit container, so
// exempting them from missing_localization looked obvious — but the wiki is explicit that "if a hidden idea
// cancels automatically, the pop-up will show up", so the key is legitimately wanted. Looked it up instead
// of assuming, and the assumption was wrong.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");
const { createApp } = require("./server.js");

const PORT = 53695;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locfix-"));
const write = (rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const focus = (id, extra) => `focus = {\n\tid = ${id}\n${extra}\ticon = GFX_a\n\tx = 1\n\ty = 1\n\tcost = 1\n}\n`;

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="loc key test"\n', "utf8");

    write(path.join("common", "national_focus", "t.txt"),
      // (1) declares text = a key that IS localised -> must NOT fire
      focus("declared_and_localised", "\ttext = shared_display_key\n") +
      // (2) declares text = a key that is NOT localised -> must fire, naming THAT key
      focus("declared_not_localised", "\ttext = key_nobody_wrote\n") +
      // (3) declares nothing -> the id is the key, old behaviour, must still fire
      focus("undeclared_focus", "") +
      // (4) a nested `text =` inside a reward must not be mistaken for the focus's own
      focus("nested_text_only", "\tcompletion_reward = {\n\t\tcustom_effect_tooltip = { text = inner_thing }\n\t}\n"));

    // an idea declaring name = <key>, to prove the same path covers the pre-existing case
    write(path.join("common", "ideas", "i.txt"),
      "ideas = {\n\tcountry = {\n\t\tidea_with_own_name = {\n\t\t\tname = the_real_idea_key\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n");

    write(path.join("localisation", "english", "base_l_english.yml"),
      "﻿l_english:\n shared_display_key:0 \"A Properly Named Focus\"\n");

    console.log("\n-- half one: a focus names its own key with text = --");
    let idx = buildModIndex(root, {});
    const miss = idx.problems.filter((p) => p.rule === "missing_localization");
    const got = (id) => miss.find((p) => p.entityId === id);

    rec("a focus whose text= key IS localised does not fire", !got("declared_and_localised"), miss.map((p) => p.entityId));
    rec("a focus whose text= key is missing DOES fire", !!got("declared_not_localised"));
    rec("a focus declaring nothing still fires on its id", !!got("undeclared_focus"));
    rec("a text= nested inside a reward is not taken as the focus's own",
      !!got("nested_text_only") && got("nested_text_only").locKey === "nested_text_only",
      got("nested_text_only") && got("nested_text_only").locKey);

    console.log("\n-- the row carries the key the game reads, and names the right field --");
    rec("locKey is the declared key, not the id", got("declared_not_localised").locKey === "key_nobody_wrote", got("declared_not_localised").locKey);
    rec("locKey falls back to the id when nothing is declared", got("undeclared_focus").locKey === "undeclared_focus");
    rec("the message says text = for a focus", /declares text = key_nobody_wrote/.test(got("declared_not_localised").message), got("declared_not_localised").message);
    rec("the message says name = for an idea", /declares name = the_real_idea_key/.test(got("idea_with_own_name").message), got("idea_with_own_name").message);

    console.log("\n-- half two: the auto-fix writes locKey, not entityId --");
    const locFile = path.join(root, "localisation", "english", "base_l_english.yml");
    const fix = async (problem) => {
      const r = await fetch(BASE + "/api/modhealth/fix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: root, problem }),
      });
      return r.json();
    };

    let res = await fix(got("declared_not_localised"));
    rec("the fix reports ok", !!(res && res.ok), res);
    let txt = fs.readFileSync(locFile, "utf8");
    rec("it wrote the DECLARED key", /^\s*key_nobody_wrote:/m.test(txt), txt.split(/\r?\n/).filter(Boolean).slice(-2));
    rec("it did NOT write the entity id", !/^\s*declared_not_localised:/m.test(txt));

    res = await fix(got("idea_with_own_name"));
    txt = fs.readFileSync(locFile, "utf8");
    rec("the idea case writes its declared key too", /^\s*the_real_idea_key:/m.test(txt));
    rec("...and not the idea id", !/^\s*idea_with_own_name:/m.test(txt));

    res = await fix(got("undeclared_focus"));
    txt = fs.readFileSync(locFile, "utf8");
    rec("an entity declaring nothing still gets its id written", /^\s*undeclared_focus:/m.test(txt));

    console.log("\n-- the written key actually clears the problem (a fix that fixes) --");
    idx = buildModIndex(root, {});
    const still = idx.problems.filter((p) => p.rule === "missing_localization").map((p) => p.entityId);
    rec("the focus with a declared key is now clean", !still.includes("declared_not_localised"), still);
    rec("the idea with a declared name is now clean", !still.includes("idea_with_own_name"), still);
    rec("the plain focus is now clean", !still.includes("undeclared_focus"), still);

    console.log("\n-- a hyphenated key is a legal key, not a reason to refuse --");
    write(path.join("common", "national_focus", "h.txt"), focus("hyphen_holder", "\ttext = pro-american-key\n"));
    idx = buildModIndex(root, {});
    const hy = idx.problems.find((p) => p.rule === "missing_localization" && p.entityId === "hyphen_holder");
    rec("a hyphenated declared key is reported", !!hy && hy.locKey === "pro-american-key", hy && hy.locKey);
    res = await fix(hy);
    rec("...and the fix accepts it rather than refusing", !!(res && res.ok), res);
    rec("...and writes it", /^\s*pro-american-key:/m.test(fs.readFileSync(locFile, "utf8")));
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    server.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
  process.exitCode = fails.length ? 1 : 0;
})();
