// ⛔ #focus-icon-names-a-sprite-nothing-declares — THE NODE LOOKS RIGHT IN NOVA AND IS A "?" IN GAME.
//
// A focus icon must name a declared sprite. If nothing declares it, HOI4 draws its default "?" placeholder
// — the same thing a focus with no `icon` at all gets, which is what the neighbouring focus_no_icon rule
// has always said. And Nova's focus editor cannot show you the problem, because it substitutes its own
// placeholder image whenever a sprite is missing: the node looks fine in Nova.
//
// ⭐ MEASURED IN THE GAME, 2026-09-05, because the wiki does not say and vanilla never reveals it — all
// 7,401 sprite references Paradox writes are exact-case, so the base game is silent on the question.
// Three focuses were put side by side in Road to 56's Andorra tree (8 focuses, one screen):
//   A  icon = GFX_goal_generic_neutrality_focus            -> drew the icon
//   B  icon = GFX_goal_generic_Neutrality_focus            -> drew "?"      <- one capital letter
//   C  icon = GFX_goal_generic_neutrality_focus_NOVATEST   -> drew "?"      <- names nothing, the control
// So sprite lookup is CASE-SENSITIVE, and a missing sprite is a "?" rather than an empty node. C is what
// makes B conclusive: without it, "B is blank" could have been how this tree renders. Exact-case matching
// below is therefore correct and deliberate — do not "fix" it by lowercasing both sides.
//
// server.js has warned about this on the focus SAVE path for a long time (unresolvedFocusIconWarning), with
// the calibration recorded next to it. Mod Health never ran it, so a modder only learned about a broken icon
// if they happened to re-save that particular tree. This lifts the same check into the health scan.
//
// Measured over the base game and all 10 installed workshop mods:
//   vanilla            0 of 11,016 focus icons   <- the cry-wolf control
//   most mods          0 to 5
//   Rise of Nations  379, from 207 distinct sprite names, all genuine
//
// ⚠️ TWO measurement traps, both hit while establishing that vanilla zero:
//   · sprites are declared in .gfx files ANYWHERE under a root, INCLUDING dlc/<name>/interface/.
//     GFX_DEN_basic_small_fighter_2 looks like a vanilla bug until you walk dlc038_arms_against_tyranny.
//   · the icon must be the FOCUS'S OWN. A national_focus file is full of `icon =` lines belonging to
//     create_equipment_variant blocks inside completion_reward; counting those reports ten non-existent
//     bugs against the shipping base game.
//
// A third trap, found spot-checking a real finding: `Agriculture5` appears in Rise of Nations' own .gfx —
// but only as a texturefile PATH, never as a sprite name. A grep says it exists; the game still draws
// nothing. Sprite names are what count.
//
// Scoped to focuses deliberately. Under the same treatment idea pictures sit at 1.6% and decision icons at
// 5.6%, too loose to warn on — the judgement server.js already recorded and this rule keeps.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 240) : "")); }
};
const roots = [];
const mk = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-icon-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, /\.yml$/i.test(rel) ? "\uFEFF" + body : body, "utf8");
  }
  return root;
};
// The rule needs a usable inventory (>= 1000 sprites) before it will say anything, so a bare fixture with
// no interface/ can never be flooded with false positives. Build a realistic one.
const bulkGfx = (extra) => "spriteTypes = {\n"
  + Array.from({ length: 1200 }, (_, i) => `\tspriteType = { name = "GFX_filler_${i}" texturefile = "gfx/f_${i}.dds" }`).join("\n")
  + "\n" + (extra || "") + "\n}\n";
const TREE = (focuses) => `focus_tree = {
	id = t_tree
	country = { factor = 1 }
${focuses}
}
`;
const FOCUS = (id, iconLine, extra) => `	focus = {
		id = ${id}
${iconLine}
		x = 0 y = 0 cost = 10
${extra || ""}	}`;
const iconsOf = (root, vanillaRoot, dependencyRoots) =>
  (buildModIndex(root, { vanillaRoot, dependencyRoots }).problems || [])
    .filter((p) => p.rule === "focus_icon_unresolved");

// A stand-in base game carrying the bulk inventory plus one real sprite.
const GAME = mk({
  "interface/base.gfx": bulkGfx('\tspriteType = { name = "GFX_goal_generic_production" texturefile = "gfx/p.dds" }'),
  "localisation/english/v_l_english.yml": "l_english:\n VKEY: \"v\"\n",
});

try {
  console.log("\n-- an icon nothing declares --");
  {
    const root = mk({
      "common/national_focus/t.txt": TREE(FOCUS("T_broken", '\t\ticon = GFX_focus_does_not_exist')),
      "localisation/english/t_l_english.yml": "l_english:\n T_broken: \"B\"\n T_broken_desc: \"d\"\n",
    });
    const p = iconsOf(root, GAME, []);
    ok(p.length === 1, "the focus is reported", p.map((x) => x.refId));
    ok(p[0] && p[0].refId === "GFX_focus_does_not_exist", "…naming the sprite it asked for", p[0] && p[0].refId);
    // The message is what the user acts on, and it said "HOI4 draws nothing … blank in game" until the
    // in-game measurement above showed a "?" placeholder. Assert the corrected claim AND that the refuted
    // one is gone, in all four places that carried it.
    ok(p[0] && /"\?" placeholder/.test(p[0].message), "…and saying the game draws a \"?\" placeholder",
      p[0] && p[0].message.slice(0, 160));
    ok(p[0] && !/draws nothing|blank in game/i.test(p[0].message),
      "…not the refuted claim that the node is blank", p[0] && p[0].message.slice(0, 160));
    ok(p[0] && /case-sensitive/i.test(p[0].message),
      "…and telling the author capitals count, which is how this is most often hit");
  }

  console.log("\n-- every copy of that claim moved together --");
  {
    // The same sentence lived in four files. Fixing the finding and leaving the save-path warning and the
    // panel help saying the opposite is the #deterministic-tier-typed-in-four-places shape again.
    for (const rel of ["mod-index.js", "server.js", "public/modhealth.js", "public/app.js"]) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
      // Scoped to lines that are ABOUT a focus icon: server.js has an unrelated "Nova draws nothing here"
      // about a date block, and a pattern loose enough to catch that is a pattern that will cry wolf later.
      const focusBits = src.split(/\n/).filter((l) =>
        /draws nothing|blank in game|is blank in HOI4/i.test(l) && /icon|sprite|focus/i.test(l));
      ok(focusBits.length === 0, rel + " no longer claims a missing focus icon draws nothing",
        focusBits.slice(0, 2));
    }
  }

  console.log("\n-- an icon that DOES resolve, including via the GFX_ prefixes --");
  {
    const root = mk({
      "common/national_focus/t.txt": TREE(
        FOCUS("T_full", '\t\ticon = GFX_goal_generic_production') + "\n" +
        FOCUS("T_short", '\t\ticon = generic_production') + "\n" +
        FOCUS("T_quoted", '\t\ticon = "GFX_filler_7"')),
      "localisation/english/t_l_english.yml": "l_english:\n T_full: \"a\"\n T_full_desc: \"d\"\n T_short: \"b\"\n T_short_desc: \"d\"\n T_quoted: \"c\"\n T_quoted_desc: \"d\"\n",
    });
    const p = iconsOf(root, GAME, []);
    ok(p.length === 0, "a declared sprite, a GFX_goal_ shorthand and a quoted name all resolve", p.map((x) => x.refId));
  }

  console.log("\n-- a sprite declared by the MOD itself, and by a DEPENDENCY --");
  {
    const dep = mk({ "interface/dep.gfx": 'spriteTypes = {\n\tspriteType = { name = "GFX_from_dependency" texturefile = "gfx/d.dds" }\n}\n' });
    const root = mk({
      "interface/mine.gfx": 'spriteTypes = {\n\tspriteType = { name = "GFX_from_the_mod" texturefile = "gfx/m.dds" }\n}\n',
      "common/national_focus/t.txt": TREE(
        FOCUS("T_own", '\t\ticon = GFX_from_the_mod') + "\n" +
        FOCUS("T_dep", '\t\ticon = GFX_from_dependency')),
      "localisation/english/t_l_english.yml": "l_english:\n T_own: \"a\"\n T_own_desc: \"d\"\n T_dep: \"b\"\n T_dep_desc: \"d\"\n",
    });
    ok(iconsOf(root, GAME, [dep]).length === 0, "the mod's own sprite and a dependency's both resolve",
      iconsOf(root, GAME, [dep]).map((x) => x.refId));
  }

  console.log("\n-- a sprite declared in a NESTED folder (the dlc/ shape) --");
  {
    const game2 = mk({
      "dlc/dlc038_arms/interface/aat.gfx": bulkGfx('\tspriteType = { name = "GFX_DEN_basic_small_fighter_2" texturefile = "gfx/a.dds" }'),
      "localisation/english/v_l_english.yml": "l_english:\n VKEY: \"v\"\n",
    });
    const root = mk({
      "common/national_focus/t.txt": TREE(FOCUS("T_dlc", '\t\ticon = GFX_DEN_basic_small_fighter_2')),
      "localisation/english/t_l_english.yml": "l_english:\n T_dlc: \"a\"\n T_dlc_desc: \"d\"\n",
    });
    ok(iconsOf(root, game2, []).length === 0, "a sprite under dlc/<name>/interface/ resolves",
      iconsOf(root, game2, []).map((x) => x.refId));
  }

  console.log("\n-- an icon inside a nested create_equipment_variant is not the focus's icon --");
  {
    // This is what made vanilla look like it shipped ten broken icons.
    const root = mk({
      "common/national_focus/t.txt": TREE(FOCUS("T_variant", '\t\ticon = GFX_goal_generic_production',
        `		completion_reward = {
			create_equipment_variant = {
				name = "Marinejager"
				icon = "GFX_DEN_basic_small_fighter_2"
			}
		}
`)),
      "localisation/english/t_l_english.yml": "l_english:\n T_variant: \"a\"\n T_variant_desc: \"d\"\n",
    });
    const p = iconsOf(root, GAME, []);
    ok(p.length === 0, "the equipment variant's icon is not attributed to the focus", p.map((x) => x.refId));

    // …and the ORDER must not decide it. The reader takes the first line-anchored `icon =` in the block, and
    // a nested one is still line-anchored — just indented — so a variant declared BEFORE the focus's own
    // icon line is the case that would actually break. The first version of this test only covered the
    // easy order.
    const root2 = mk({
      "common/national_focus/t.txt": TREE(`	focus = {
		id = T_order
		x = 0 y = 0 cost = 10
		completion_reward = {
			create_equipment_variant = {
				name = "Marinejager"
				icon = "GFX_DEN_basic_small_fighter_2"
			}
		}
		icon = GFX_goal_generic_production
	}`),
      "localisation/english/t_l_english.yml": "l_english:\n T_order: \"a\"\n T_order_desc: \"d\"\n",
    });
    const p2 = iconsOf(root2, GAME, []);
    ok(p2.length === 0, "…even when the variant's icon comes FIRST in the block", p2.map((x) => x.refId));
  }

  console.log("\n-- no usable sprite inventory means silence, not a flood --");
  {
    const bareGame = mk({ "localisation/english/v_l_english.yml": "l_english:\n VKEY: \"v\"\n" });
    const root = mk({
      "common/national_focus/t.txt": TREE(FOCUS("T_x", '\t\ticon = GFX_anything_at_all')),
      "localisation/english/t_l_english.yml": "l_english:\n T_x: \"a\"\n T_x_desc: \"d\"\n",
    });
    ok(iconsOf(root, bareGame, []).length === 0, "with no sprites resolvable the rule says nothing at all");
  }

  console.log("\n-- an icon added AFTER the first scan is seen on the next one --");
  {
    // #sprite-name-cache-never-refreshes, which this codebase has already paid for once: a module-level
    // sprite cache with no invalidation made the focus save insist the icon the user had just uploaded did
    // not exist, until the app was restarted. A validator that fires on the user's own successful action
    // teaches people to ignore it. Mod Health must not reproduce it — upload an icon, rescan, gone.
    const root = mk({
      "common/national_focus/t.txt": TREE(FOCUS("T_later", '\t\ticon = GFX_added_later')),
      "localisation/english/t_l_english.yml": "l_english:\n T_later: \"a\"\n T_later_desc: \"d\"\n",
    });
    ok(iconsOf(root, GAME, []).length === 1, "before the icon exists it is reported");
    // …the user uploads an icon, which writes a .gfx declaring it.
    fs.mkdirSync(path.join(root, "interface"), { recursive: true });
    fs.writeFileSync(path.join(root, "interface", "custom_focus_1.gfx"),
      'spriteTypes = {\n\tspriteType = { name = "GFX_added_later" texturefile = "gfx/x.dds" }\n}\n', "utf8");
    ok(iconsOf(root, GAME, []).length === 0,
      "…and the very next scan sees it, with no restart", iconsOf(root, GAME, []).map((x) => x.refId));
  }

  console.log("\n-- the base game is the cry-wolf control --");
  {
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(path.join(V, "hoi4.exe"))) {
      console.log("  ..   skipped: the game is not installed at the expected path");
    } else {
      const n = (buildModIndex(V, { vanillaRoot: null }).problems || [])
        .filter((p) => p.rule === "focus_icon_unresolved").length;
      ok(n === 0, "vanilla reports no unresolved focus icons across its 11,016", n);
    }
  }

  console.log("\n-- and it is not offered as an automatic fix --");
  {
    const src = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
    const blk = src.slice(src.indexOf("const DETERMINISTIC_FIXES = {"));
    const tier = blk.slice(blk.indexOf("{"), blk.indexOf("\n  };") + 4);
    ok(!/focus_icon_unresolved/.test(tier), "choosing an icon is not something a program can derive");
    ok(/focus_icon_unresolved/.test(src), "…but the UI has a label and help text for it");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
