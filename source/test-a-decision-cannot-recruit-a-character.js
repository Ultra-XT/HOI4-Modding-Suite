// ⛔ #recruit-character-rule-narrower-than-its-own-help-text — NOVA PROMISED TO CATCH THIS AND DID NOT.
//
// HOI4 executes recruit_character only from a country's game-start history file. Anywhere else it silently
// does nothing, and the modder ends up with a character who never appears. Nova has a rule for exactly that
// — its comment cites "the exact bug found by an in-game test of an add-on" — but the gate read
//
//     if (e.type !== "focus" && e.type !== "event") continue;
//
// while the panel's own explanation of the same rule says "Inside a focus, event, or DECISION it does
// nothing." A decision is the most natural third place to reach for the effect, and it was the one case the
// UI promised and the engine skipped.
//
// Found by a known-answer fault-injection test: recruit_character written into a decision — including
// inside an `available = { }` TRIGGER block, where an effect cannot run at all — went unreported.
//
// The gate is now the legal home rather than a list of illegal ones. Measured across the base game and all
// 10 installed workshop mods, the count does not move (2 before, 2 after), so this catches the case it was
// written for without adding a single finding to a shipping mod.
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-recruit-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, /\.yml$/i.test(rel) ? "﻿" + body : body, "utf8");
  }
  return root;
};

const CHARS = `characters = {
	TOR_mira_kolt = {
		name = TOR_mira_kolt
		corps_commander = { traits = {} skill = 3 attack_skill = 2 defense_skill = 3 planning_skill = 2 logistics_skill = 1 }
	}
}
`;
const LOC = "l_english:\n TOR_mira_kolt: \"Mira Kolt\"\n TOR_a: \"A\"\n TOR_a_desc: \"d\"\n tor_cat: \"Cat\"\n tor_dec: \"Dec\"\n tor_dec_desc: \"d\"\n";
const GAME = mk({ "common/ideas/v.txt": "ideas = { country = { } }\n" });
const misplaced = (root) => (buildModIndex(root, { vanillaRoot: GAME }).problems || [])
  .filter((p) => p.rule === "recruit_character_misplaced");

try {
  console.log("\n-- a decision that recruits a character --");
  {
    const root = mk({
      "common/characters/c.txt": CHARS,
      "localisation/english/l_english.yml": LOC,
      "common/decisions/categories/cat.txt": "tor_cat = { icon = generic_political_actions }\n",
      "common/decisions/d.txt": `tor_cat = {
	tor_dec = {
		cost = 25
		complete_effect = {
			recruit_character = TOR_mira_kolt
		}
	}
}
`,
    });
    const p = misplaced(root);
    ok(p.length === 1, "the decision is reported", p.map((x) => x.entityType + ":" + x.entityId));
    ok(p[0] && p[0].entityType === "decision", "…named as a decision", p[0] && p[0].entityType);
    ok(p[0] && p[0].refId === "TOR_mira_kolt", "…naming the character it tried to recruit", p[0] && p[0].refId);
  }

  console.log("\n-- a focus and an event still are too (the cases that already worked) --");
  {
    const root = mk({
      "common/characters/c.txt": CHARS,
      "localisation/english/l_english.yml": LOC + " tor_ev.1.t: \"t\"\n tor_ev.1.d: \"d\"\n tor_ev.1.a: \"a\"\n",
      "common/national_focus/f.txt": `focus_tree = {
	id = t
	country = { factor = 1 }
	focus = {
		id = TOR_a
		icon = GFX_goal_generic_production
		x = 0 y = 0 cost = 10
		completion_reward = { recruit_character = TOR_mira_kolt }
	}
}
`,
      "events/e.txt": `add_namespace = tor_ev

country_event = {
	id = tor_ev.1
	title = tor_ev.1.t
	desc = tor_ev.1.d
	is_triggered_only = yes
	option = {
		name = tor_ev.1.a
		recruit_character = TOR_mira_kolt
	}
}
`,
    });
    const types = misplaced(root).map((x) => x.entityType).sort();
    ok(types.includes("focus"), "the focus case still fires", types);
    ok(types.includes("event"), "the event case still fires", types);
  }

  console.log("\n-- CONTROL: country history is the one legal home and must stay silent --");
  {
    const root = mk({
      "common/characters/c.txt": CHARS,
      "localisation/english/l_english.yml": LOC,
      "common/country_tags/00_countries.txt": 'TOR = "countries/Torvia.txt"\n',
      "history/countries/TOR - Torvia.txt": "capital = 1\n\nrecruit_character = TOR_mira_kolt\n",
    });
    const p = misplaced(root);
    ok(p.length === 0, "recruiting from country history is not reported", p.map((x) => x.entityType + ":" + x.entityId));
  }

  console.log("\n-- …and a mod that never recruits anywhere reports nothing --");
  {
    const root = mk({
      "common/characters/c.txt": CHARS,
      "localisation/english/l_english.yml": LOC,
      "common/country_tags/00_countries.txt": 'TOR = "countries/Torvia.txt"\n',
      "history/countries/TOR - Torvia.txt": "capital = 1\n",
    });
    ok(misplaced(root).length === 0, "no recruit, no finding");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
