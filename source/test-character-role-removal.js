// #role-checkbox-cannot-turn-off — the Characters page's role checkboxes could not turn a role off, and the
// commander Type dropdown added a second commander instead of switching.
//
// mergePreservedCharacterBlock carries an old role block forward when the rebuild does not emit it. That rule
// exists for a good reason — 298 vanilla characters hold more than one `advisor` block and 84 more than one
// `country_leader`, one per sub-ideology, and the writer only ever re-synthesises one — but "the rebuild
// didn't emit this role" has TWO possible meanings and the rule always guessed the safe-looking one:
//
//   * un-tick Country Leader / Advisor / Military Leader -> the client honestly sends roleLeader:false, the
//     serializer correctly omits the block, and the merge puts it straight back. Save reports "✓ Saved", the
//     file is byte-identical, the sidebar card still lists the role, and re-selecting the character re-ticks
//     the box — so it looks as though the app reverted the edit.
//   * change the commander Type -> the new key IS emitted and the old one is carried back, so the character
//     becomes recruitable as BOTH a field marshal and a corps commander. The reader takes the first, so the
//     UI shows only one and hides the leftover; every further type change adds another.
//
// The form knows which it meant, so it now says: the client records the roles the character was LOADED with
// and the server drops only those the form actually removed.
//
// Comparing against the LOADED state rather than "which roles are set now" is the part that matters.
// Vanilla's JAN_grand_admiral_johan_mayen is both a corps_commander and a navy_leader; the reader surfaces
// only the first, so the second is never in the loaded record and can never be dropped by an unchanged save.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-roles-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RR"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "common", "characters", "probe_chars.txt");
const ORIGINAL = `characters = {
	probe_guy = {
		name = probe_guy
		portraits = { civilian = { large = "gfx/leaders/probe.dds" } }
		country_leader = {
			ideology = despotism
			traits = { }
		}
		advisor = {
			slot = political_advisor
			idea_token = probe_guy_advisor
			cost = 150
			traits = { }
		}
		field_marshal = {
			traits = { organisational_leader }
			skill = 4
			attack_skill = 3
			defense_skill = 3
			planning_skill = 2
			logistics_skill = 2
		}
	}
	probe_twin = {
		name = probe_twin
		corps_commander = {
			traits = { }
			skill = 3
			attack_skill = 2
			defense_skill = 2
			planning_skill = 1
			logistics_skill = 1
		}
		navy_leader = {
			traits = { }
			skill = 3
			attack_skill = 2
			defense_skill = 2
			maneuvering_skill = 1
			coordination_skill = 1
		}
	}
}
`;
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const read = () => fs.readFileSync(FILE, "utf8");
const has = (token, key) => {
  const t = read();
  const i = t.indexOf(token + " = {");
  if (i === -1) return false;
  let d = 0, end = -1;
  for (let j = t.indexOf("{", i); j < t.length; j++) {
    if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (d === 0) { end = j; break; } }
  }
  return new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*\\{`).test(t.slice(i, end));
};

const PORT = 39961, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modPath: MOD, ...body }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  const base = {
    token: "probe_guy", name: "Probe Guy", file: "probe_chars.txt",
    portraitCivLarge: "gfx/leaders/probe.dds", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
  };

  try {
    ok("precondition: the character has all three roles",
      has("probe_guy", "country_leader") && has("probe_guy", "advisor") && has("probe_guy", "field_marshal"));

    // ── un-tick Country Leader ────────────────────────────────────────────────────────────────────
    let r = await save({
      ...base, roleLeader: false, roleAdvisor: true, roleGeneral: true, generalType: "field_marshal",
      advisorSlot: "political_advisor", advisorIdeaToken: "probe_guy_advisor", advisorCost: "150",
      genSkill: "4", genAttack: "3", genDefense: "3", genPlanning: "2", genLogistics: "2",
      loadedRoles: { leader: true, advisor: true, generalType: "field_marshal" },
    });
    ok("saving with Country Leader un-ticked succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b);
    ok("…the country_leader block is GONE", !has("probe_guy", "country_leader"), read());
    ok("…the advisor role is untouched", has("probe_guy", "advisor"), read());
    ok("…and the commander role is untouched", has("probe_guy", "field_marshal"), read());

    // ── switch the commander Type ─────────────────────────────────────────────────────────────────
    r = await save({
      ...base, roleLeader: false, roleAdvisor: true, roleGeneral: true, generalType: "corps_commander",
      advisorSlot: "political_advisor", advisorIdeaToken: "probe_guy_advisor", advisorCost: "150",
      genSkill: "4", genAttack: "3", genDefense: "3", genPlanning: "2", genLogistics: "2",
      loadedRoles: { leader: false, advisor: true, generalType: "field_marshal" },
    });
    ok("switching the commander Type succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b);
    ok("…the new commander role is there", has("probe_guy", "corps_commander"), read());
    ok("…and the OLD one is gone, not kept alongside it", !has("probe_guy", "field_marshal"), read());

    // ── un-tick the remaining roles ───────────────────────────────────────────────────────────────
    r = await save({
      ...base, roleLeader: false, roleAdvisor: false, roleGeneral: false,
      loadedRoles: { leader: false, advisor: true, generalType: "corps_commander" },
    });
    ok("saving with every role off succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b);
    ok("…the advisor role is gone", !has("probe_guy", "advisor"), read());
    ok("…and the commander role is gone", !has("probe_guy", "corps_commander"), read());
    ok("the character itself still exists", /probe_guy = \{/.test(read()), read());
    ok("…and kept its portraits", /portraits/.test(read().slice(read().indexOf("probe_guy = {"))), read());

    // ── a character with TWO commander roles must not lose the hidden one ─────────────────────────
    ok("precondition: the twin has two commander roles",
      has("probe_twin", "corps_commander") && has("probe_twin", "navy_leader"));
    r = await save({
      token: "probe_twin", name: "Probe Twin", file: "probe_chars.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: false, roleAdvisor: false, roleGeneral: true, generalType: "corps_commander",
      genSkill: "3", genAttack: "2", genDefense: "2", genPlanning: "1", genLogistics: "1",
      loadedRoles: { leader: false, advisor: false, generalType: "corps_commander" },
    });
    ok("an unchanged save of the two-commander character succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b);
    ok("…keeps the role the form showed", has("probe_twin", "corps_commander"), read());
    ok("…and keeps the SECOND one the form never showed", has("probe_twin", "navy_leader"), read());

    // ── an older client that sends no record must not lose anything ───────────────────────────────
    fs.writeFileSync(FILE, ORIGINAL, "utf8");
    r = await save({
      ...base, roleLeader: false, roleAdvisor: false, roleGeneral: false, // no loadedRoles at all
    });
    ok("a save with no loaded-role record succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b);
    ok("…and preserves the roles rather than guessing (old behaviour)",
      has("probe_guy", "country_leader") && has("probe_guy", "advisor"), read());

    console.log("\ntest-character-role-removal: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
