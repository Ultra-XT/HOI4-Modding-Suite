// ⛔ #remove-ideas-was-never-validated — THE SAME TYPO WAS AN ERROR IN add_ideas AND INVISIBLE IN
// remove_ideas.
//
// broken_reference skipped every remove_ideas reference outright, with the reason "removing a
// vanilla/other idea is fine". That reason does not hold: anyType() already resolves ids from vanilla and
// from dependencies, so a genuinely inherited idea was never going to be reported. What the skip actually
// hid was the typo.
//
// In game the consequence is silent and permanent. A modder writes `remove_ideas = tor_industrial_bases`
// for tor_industrial_base; the focus completes, the player is told the spirit is gone, and it is still
// there for the rest of the campaign — a malus that never lifts, with nothing in any log. Nova called the
// mod clean on that line while reporting the identical typo one line up in add_ideas as an error.
//
// Found by a known-answer fault-injection test: of 90 deliberately injected faults, this was one of the
// seven Mod Health did not report.
//
// #idea-list-block-has-two-forms is the other half, and it is why this was not simply a one-line deletion.
// Both of these are legal:
//     add_ideas = { X Y }        bare ids
//     add_ideas = { idea = X }   an `idea =` key — the form VANILLA itself writes
// Both list readers split the block body on whitespace, so the second form produced a reference to an idea
// literally called "idea". It stayed hidden while remove_ideas was skipped wholesale; the moment the skip
// came off, the SHIPPING BASE GAME produced two findings (African_Union_decisions.txt, and WUW_Germany.txt
// twice). A rule that fires on vanilla is a bug in the rule, so both readers now take the keyed form first.
//
// Measured over the base game and all 10 installed workshop mods: +98 broken_reference findings, 20 of 20
// sampled across six mods verified TRUE, and VANILLA UNCHANGED at 9.
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rmidea-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, /\.yml$/i.test(rel) ? "﻿" + body : body, "utf8");
  }
  return root;
};
const IDEAS = (ids) => `ideas = {
	country = {
${ids.map((i) => `		${i} = {
			picture = generic_industrial_bonus
			modifier = { political_power_gain = 0.1 }
		}`).join("\n")}
	}
}
`;
const LOC = (ids) => "l_english:\n" + ids.map((i) => ` ${i}: "${i}"\n ${i}_desc: "d"\n`).join("");
const brokenIdeaRefs = (root, vanillaRoot) =>
  (buildModIndex(root, { vanillaRoot }).problems || [])
    .filter((p) => p.rule === "broken_reference" && p.refType === "idea");

// A stand-in base game, so "removing an idea the mod does not own" can be tested hermetically.
const GAME = mk({
  "common/ideas/vanilla_ideas.txt": IDEAS(["base_game_spirit"]),
  "localisation/english/v_l_english.yml": LOC(["base_game_spirit"]),
});

try {
  console.log("\n-- a typo in remove_ideas is reported, exactly as it is in add_ideas --");
  {
    const mod = mk({
      "common/ideas/m_ideas.txt": IDEAS(["tor_industrial_base"]),
      "localisation/english/m_l_english.yml": LOC(["tor_industrial_base", "TOR_a", "TOR_b"]),
      "common/national_focus/m_focus.txt": `focus_tree = {
	id = m_tree
	country = { factor = 1 }
	focus = {
		id = TOR_a
		icon = GFX_goal_generic_production
		x = 0 y = 0 cost = 10
		completion_reward = { remove_ideas = tor_industrial_bases }
	}
	focus = {
		id = TOR_b
		icon = GFX_goal_generic_production
		x = 2 y = 0 cost = 10
		completion_reward = { add_ideas = tor_industrial_basez }
	}
}
`,
    });
    const refs = brokenIdeaRefs(mod, GAME);
    const ids = refs.map((r) => r.refId);
    ok(ids.includes("tor_industrial_bases"), "the remove_ideas typo is reported", ids);
    ok(ids.includes("tor_industrial_basez"), "CONTROL: the add_ideas typo still is too", ids);
    const rm = refs.find((r) => r.refId === "tor_industrial_bases");
    ok(rm && rm.refContext === "remove_ideas", "…and it is attributed to remove_ideas", rm && rm.refContext);
  }

  console.log("\n-- but a CORRECT remove_ideas is silent, wherever the idea lives --");
  {
    const mod = mk({
      "common/ideas/m_ideas.txt": IDEAS(["tor_industrial_base"]),
      "localisation/english/m_l_english.yml": LOC(["tor_industrial_base", "TOR_a"]),
      "common/national_focus/m_focus.txt": `focus_tree = {
	id = m_tree
	country = { factor = 1 }
	focus = {
		id = TOR_a
		icon = GFX_goal_generic_production
		x = 0 y = 0 cost = 10
		completion_reward = {
			remove_ideas = tor_industrial_base
			remove_ideas = base_game_spirit
		}
	}
}
`,
    });
    const ids = brokenIdeaRefs(mod, GAME).map((r) => r.refId);
    ok(!ids.includes("tor_industrial_base"), "removing the mod's own idea is fine", ids);
    ok(!ids.includes("base_game_spirit"), "…and removing a BASE GAME idea is fine — the original reason, still honoured", ids);
  }

  console.log("\n-- the `idea = X` block form, which is what vanilla writes --");
  {
    const mod = mk({
      "common/ideas/m_ideas.txt": IDEAS(["tor_industrial_base"]),
      "localisation/english/m_l_english.yml": LOC(["tor_industrial_base", "TOR_a"]),
      "common/decisions/m_decisions.txt": `m_category = {
	m_decision = {
		cost = 10
		complete_effect = {
			remove_ideas = {
				idea = tor_industrial_base
			}
			add_ideas = {
				idea = base_game_spirit
			}
		}
	}
}
`,
    });
    const ids = brokenIdeaRefs(mod, GAME).map((r) => r.refId);
    ok(!ids.includes("idea"), "the word \"idea\" is not treated as an idea id", ids);
    ok(!ids.includes("tor_industrial_base"), "…the keyed value resolves in remove_ideas", ids);
    ok(!ids.includes("base_game_spirit"), "…and in add_ideas", ids);
    ok(ids.length === 0, "…so a correct keyed block reports nothing at all", ids);
  }

  console.log("\n-- …and a typo inside the keyed form is still caught --");
  {
    const mod = mk({
      "common/ideas/m_ideas.txt": IDEAS(["tor_industrial_base"]),
      "localisation/english/m_l_english.yml": LOC(["tor_industrial_base", "TOR_a"]),
      "common/decisions/m_decisions.txt": `m_category = {
	m_decision = {
		cost = 10
		complete_effect = {
			remove_ideas = { idea = tor_industrial_bases }
			add_ideas = { idea = tor_nonexistent }
		}
	}
}
`,
    });
    const ids = brokenIdeaRefs(mod, GAME).map((r) => r.refId);
    ok(ids.includes("tor_industrial_bases"), "the keyed remove_ideas typo is reported", ids);
    ok(ids.includes("tor_nonexistent"), "the keyed add_ideas typo is reported", ids);
    ok(!ids.includes("idea"), "…and still no phantom \"idea\" reference", ids);
  }

  console.log("\n-- the bare-id list form keeps working --");
  {
    const mod = mk({
      "common/ideas/m_ideas.txt": IDEAS(["a_one", "a_two"]),
      "localisation/english/m_l_english.yml": LOC(["a_one", "a_two"]),
      "history/countries/TOR - Torvia.txt": "capital = 1\n\nadd_ideas = {\n\ta_one\n\ta_two\n\ta_three\n}\n",
      "common/country_tags/00_countries.txt": 'TOR = "countries/Torvia.txt"\n',
    });
    const ids = brokenIdeaRefs(mod, GAME).map((r) => r.refId);
    ok(ids.includes("a_three"), "a bare id that does not exist is still reported", ids);
    ok(!ids.includes("a_one") && !ids.includes("a_two"), "…and the ones that do exist are not", ids);
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
