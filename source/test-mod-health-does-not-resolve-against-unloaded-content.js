// ⛔ #replace-path — A REFERENCE RESOLVED AGAINST CONTENT THE GAME WILL NOT LOAD READ AS HEALTHY.
//
// Mod Health handed buildModIndex a vanillaRoot and every dependencyRoot unconditionally, and
// knownExactOrCase consulted those id sets directly. Nothing anywhere in mod-index.js mentioned replace_path.
// So a mod declaring replace_path = "common/ideas" and granting a VANILLA idea was reported clean — while in
// game the idea does not load and the focus silently does nothing.
//
// ⚠️ THIS IS THE DANGEROUS DIRECTION. Every other replace_path bug in this codebase has been a reader
// OFFERING content the game will not load: visible, annoying, survivable. A validator ACCEPTING a reference
// to unloaded content is the exact failure the screen exists to prevent — the modder ships, the effect never
// fires, and Mod Health said the mod was fine.
//
// ⭐ VERIFIED ON THE SHIPPING CORPUS, which is what made it safe to change a validator. Indexing every
// installed mod both ways: The Road to 56 +0, Millennium Dawn +2, Old World Blues +3, Novum Vexillum +5,
// Rise of Nations +117 (against 516 broken_references it already had). Three new findings were checked by
// hand and all three are real defects in mods that ship:
//   • MD fires news_event = { id = news.289 } four times from events/Generic.txt. MD replaces "events" and
//     ships its own events/NewsEvents.txt, which does NOT define news.289 — only vanilla's does, and that
//     file never loads.
//   • RoN grants add_ideas = HUN_naval_warfare while replacing common/ideas and never defining the idea.
//   • OWB enables equipment ship_hull_mega_carrier while replacing common/units/equipment without it.
//
// The fixtures below are hermetic: the "vanilla" root is a directory this test builds, so the checks do not
// move when the game updates.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhrp-"));

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};

// A stand-in base game: one idea in common/ideas, and one ADVISOR in common/characters. The advisor matters
// — scanCharacters indexes character keys and idea_tokens as type "idea" even though they live in a
// different folder, which is why the filter is per FOLDER and never per type.
const BASE = path.join(ROOT, "fake_vanilla");
fs.mkdirSync(path.join(BASE, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(BASE, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(BASE, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(BASE, "common", "ideas", "probe_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_base_idea = {\n\t\t\tallowed = { always = yes }\n\t\t}\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(BASE, "common", "characters", "probe_chars.txt"),
  "characters = {\n\tprobe_base_character = {\n\t\tname = \"Probe Advisor\"\n\t\tadvisor = {\n" +
  "\t\t\tslot = political_advisor\n\t\t\tidea_token = probe_advisor_token\n\t\t\tallowed = { always = yes }\n" +
  "\t\t}\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(BASE, "common", "units", "equipment", "probe_equip.txt"),
  "equipments = {\n\tprobe_base_equipment = {\n\t\tyear = 1936\n\t}\n}\n", "utf8");

let seq = 0;
const mkMod = (replacePaths, idea) => {
  const dir = path.join(ROOT, "mod_" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  let d = "version=\"1\"\nname=\"mhrp_mod\"\nsupported_version=\"1.19.*\"\n";
  for (const p of replacePaths) d += `replace_path="${p}"\n`;
  fs.writeFileSync(path.join(dir, "descriptor.mod"), d, "utf8");
  fs.writeFileSync(path.join(dir, "common", "national_focus", "probe_tree.txt"),
    "focus_tree = {\n\tid = probe_tree\n\tcountry = {\n\t\tfactor = 0\n\t}\n" +
    "\tfocus = {\n\t\tid = probe_focus\n\t\ticon = GFX_goal_generic_construction\n" +
    "\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n" +
    `\t\tcompletion_reward = {\n\t\t\tadd_ideas = ${idea}\n\t\t}\n\t}\n}\n`, "utf8");
  return dir;
};

// Mirrors what server.js's computeModIndexPayload passes. mod-index deliberately does not parse descriptors.
const brokenRefs = (dir, replacePaths) => {
  const idx = buildModIndex(dir, {
    vanillaRoot: BASE, dependencyRoots: [],
    vanillaReplacedFolders: replacePaths, dependencyReplacedFolders: replacePaths,
  });
  return (idx.problems || []).filter((p) => p.rule === "broken_reference");
};

try {
  console.log("\n-- POSITIVE CONTROL: the rule fires at all --");
  {
    const b = brokenRefs(mkMod([], "zzz_no_such_idea_anywhere"), []);
    ok(b.length === 1, "an idea that exists nowhere is a broken reference", b.map((p) => p.message).slice(0, 1));
  }

  console.log("\n-- CONTROL: the base game's idea DOES load when nothing replaces it --");
  {
    const b = brokenRefs(mkMod([], "probe_base_idea"), []);
    ok(b.length === 0, "granting it is not reported", b.map((p) => p.message).slice(0, 2));
  }

  console.log("\n-- ⭐ THE FIX: a mod that unloaded common/ideas cannot grant one --");
  {
    const rp = ["common/ideas"];
    const b = brokenRefs(mkMod(rp, "probe_base_idea"), rp);
    ok(b.length === 1, "granting an unloaded idea IS reported", b.map((p) => p.message).slice(0, 2));
    // ⭐ AND THE MESSAGE HAS TO BE ACTIONABLE. "does not exist in the mod or vanilla" is flatly wrong here —
    // it DOES exist; this mod unloaded it. A modder told that greps the base game, finds it, and concludes
    // Nova is broken. Naming replace_path is the difference between a finding and a puzzle.
    const msg = String((b[0] && b[0].message) || "");
    ok(/replace_path/.test(msg), "…and the message names replace_path as the cause", msg.slice(0, 240));
    ok(!/does not exist in the mod or vanilla/.test(msg), "…rather than claiming it does not exist", msg.slice(0, 240));
  }

  console.log("\n-- ⛔ and this one must NOT offer a one-click fix --");
  {
    // An ordinary broken_reference is a mistyped id, and offering a model the near-match is reasonable.
    // This variant's only repairs are "author the missing content" — asking a model to invent a vanilla
    // event into somebody's mod — and "drop a replace_path", a descriptor change covering a whole folder.
    // Marked at the scanner so the card never has to re-read its own sentence to work it out.
    const rp = ["common/ideas"];
    const unloaded = brokenRefs(mkMod(rp, "probe_base_idea"), rp);
    ok(unloaded[0] && unloaded[0].autoFix === false,
      "the unloaded-folder variant is flagged autoFix:false", unloaded.map((p) => p.autoFix));

    const typo = brokenRefs(mkMod([], "zzz_no_such_idea_anywhere"), []);
    ok(typo[0] && typo[0].autoFix !== false,
      "…while an ordinary typo keeps its fix button", typo.map((p) => p.autoFix));

    // The card is what actually decides, so the gate has to be there too — otherwise the flag is inert.
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const mh = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8"));
    ok(/p\.autoFix\s*!==\s*false/.test(mh), "…and public/modhealth.js honours the flag before drawing a button");
  }

  console.log("\n-- …while a genuine typo still gets the plain message --");
  {
    // The two situations must not collapse into one sentence: this one really does not exist anywhere.
    const b = brokenRefs(mkMod(["common/ideas"], "zzz_no_such_idea_anywhere"), ["common/ideas"]);
    const msg = String((b[0] && b[0].message) || "");
    ok(b.length === 1 && /does not exist in the mod or vanilla/.test(msg),
      "an id nobody ever defined is still reported as not existing", msg.slice(0, 240));
    ok(!/replace_path/.test(msg), "…and is not blamed on replace_path", msg.slice(0, 240));
  }

  console.log("\n-- ⭐⭐ and it is filtered by FOLDER, not by entity type --");
  {
    // An advisor is indexed as type "idea" but lives in common/characters. Suppressing the TYPE would drop
    // it too, inventing a broken reference in a folder the mod never replaced. This is the check that
    // stops someone "simplifying" the filter into a type list.
    const rp = ["common/ideas"];
    const b = brokenRefs(mkMod(rp, "probe_advisor_token"), rp);
    ok(b.length === 0, "an advisor idea from common/characters still resolves", b.map((p) => p.message).slice(0, 2));
  }

  console.log("\n-- and replace_path is still NOT recursive --");
  {
    // #replace-path-not-recursive: replacing the parent does not hide the child folder.
    const rp = ["common"];
    const b = brokenRefs(mkMod(rp, "probe_base_idea"), rp);
    ok(b.length === 0, "replace_path=\"common\" does not hide common/ideas", b.map((p) => p.message).slice(0, 2));
  }

  console.log("\n-- a folder the mod replaces that has nothing to do with ideas --");
  {
    const rp = ["common/units/equipment"];
    const b = brokenRefs(mkMod(rp, "probe_base_idea"), rp);
    ok(b.length === 0, "replacing equipment does not break an idea reference", b.map((p) => p.message).slice(0, 2));
  }

  console.log("\n-- the same rule for add_namespace, which lives in events/ --");
  {
    // An event whose namespace was only ever declared in a folder the mod unloaded cannot register in game.
    // Found on Rise of Nations, which looks like a half-finished rename: it declares
    // `add_namespace = BBA_generic_purchase_ships_events` in one file while six events in another still use
    // the old unprefixed `generic_purchase_ships_events` — declared only by vanilla's events/BBA_Ethiopia.txt,
    // which RoN's replace_path = "events" unloads.
    fs.mkdirSync(path.join(BASE, "events"), { recursive: true });
    fs.writeFileSync(path.join(BASE, "events", "base_events.txt"),
      "add_namespace = probe_ns\n\ncountry_event = {\n\tid = probe_ns.9\n\tis_triggered_only = yes\n" +
      "\ttitle = probe_ns.9.t\n\tdesc = probe_ns.9.d\n\toption = { name = probe_ns.9.a }\n}\n", "utf8");

    const mkEventMod = (replacePaths) => {
      const dir = path.join(ROOT, "evmod_" + (++seq));
      fs.mkdirSync(path.join(dir, "events"), { recursive: true });
      let d = "version=\"1\"\nname=\"mhrp_ev\"\nsupported_version=\"1.19.*\"\n";
      for (const p of replacePaths) d += `replace_path="${p}"\n`;
      fs.writeFileSync(path.join(dir, "descriptor.mod"), d, "utf8");
      // Uses probe_ns without declaring it, while declaring a DIFFERENT namespace of its own — exactly
      // RoN's shape (it declares BBA_generic_purchase_ships_events and uses generic_purchase_ships_events).
      // ⚠️ The other declaration is load-bearing, not decoration: the rule is guarded by
      // `knownNamespaces.size` so that a mod Nova cannot read namespaces for is never flagged wholesale. A
      // fixture declaring nothing at all empties the set and skips the rule, which reads as "no finding".
      fs.writeFileSync(path.join(dir, "events", "mod_events.txt"),
        "add_namespace = probe_other_ns\n\ncountry_event = {\n\tid = probe_ns.1\n\tis_triggered_only = yes\n" +
        "\ttitle = probe_ns.1.t\n\tdesc = probe_ns.1.d\n\toption = { name = probe_ns.1.a }\n}\n", "utf8");
      return dir;
    };
    const nsProblems = (dir, rp) => (buildModIndex(dir, {
      vanillaRoot: BASE, dependencyRoots: [],
      vanillaReplacedFolders: rp, dependencyReplacedFolders: rp,
    }).problems || []).filter((p) => p.rule === "event_namespace_undeclared");

    const before = nsProblems(mkEventMod([]), []);
    ok(before.length === 0, "control: a namespace the base game declares is accepted", before.map((p) => p.message).slice(0, 1));

    const after = nsProblems(mkEventMod(["events"]), ["events"]);
    ok(after.length === 1, "…and rejected once the mod replaces the folder it was declared in", after.map((p) => p.message).slice(0, 1));
    // Same actionability rule as broken_reference: "not declared in the mod, its dependencies, or vanilla"
    // is false here — vanilla declares it, and this mod unloaded it. The repair is the same line either
    // way, but the reason the modder is typing it is not, and the wrong sentence sends them to grep vanilla.
    const nsMsg = String((after[0] && after[0].message) || "");
    ok(/replace_path/.test(nsMsg), "…and the message says the declaration was unloaded, not missing", nsMsg.slice(0, 260));
    ok(!/no "add_namespace/.test(nsMsg), "…rather than claiming nothing declares it", nsMsg.slice(0, 260));
  }

  console.log("\n-- the caller really does pass these, or the fix is inert in the app --");
  {
    // The whole change is only live if computeModIndexPayload supplies the two lists. Without this, every
    // check above could pass while the running app behaved exactly as before.
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const src = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    ok(/vanillaReplacedFolders\s*:/.test(src), "server.js passes vanillaReplacedFolders to buildModIndex");
    ok(/dependencyReplacedFolders\s*:/.test(src), "…and dependencyReplacedFolders");
    ok(/getModReplacePaths\(modRoot\)/.test(src), "…derived from the descriptors, not a hand-kept folder list");
  }

  console.log(`\n=== mod health does not resolve against unloaded content: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
} catch (e) {
  console.log("THREW " + (e && e.stack ? e.stack : e));
  fails.push("threw");
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  process.exit(fails.length ? 1 : 0);
}
