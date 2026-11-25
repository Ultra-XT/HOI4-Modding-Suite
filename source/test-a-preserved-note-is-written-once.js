// #preserved-comment-injected-twice — A COMMENT MUST RIDE IN EXACTLY ONE CHANNEL.
//
// The decisions and events extractors capture `st.leadComment` into `res.keyComments` for EVERY top-level
// statement — including the ones that then fall through to the preserve tail and push that same comment
// verbatim into `res.lines`. The writer's by-key injection pass adds it again, so a save that changed
// nothing wrote the note twice. And because the doubled note is read back as a lead comment on the next
// open, it doubles again: 1, 2, 4, 8, 16…
//
// MEASURED ON REAL SHIPPING CONTENT, not a fixture. A straight copy of vanilla's common/decisions/SOV.txt,
// four no-edit saves of SOV_align_states_siberia_csw through /api/decisions/save with the body
// public/decisions.js builds — every response {"ok":true}:
//
//     initial  note x1   block 3740B   file 410566B
//     pass 1   note x2   block 3850B   file 410676B
//     pass 2   note x3   block 3938B   file 410764B
//     pass 3   note x5   block 4114B   file 410940B
//     pass 4   note x9   block 4466B   file 411292B
//
// 21 comment lines across 18 decision blocks grow on the FIRST save, across the six installed corpora
// (vanilla 5, Road to 56 9, Old World Blues 4). The events half is latent — 0 of 53,410 shipping event
// blocks annotate an un-managed top-level key today — but fires the moment someone writes a note above
// show_sound / fire_for_sender / minor_flavor / show_major, of which 202 already ship.
//
// It is silent: the output is still valid script, so HOI4 never complains and error.log stays quiet. The
// author's own annotation just multiplies inside their file forever.
//
// WHY THE EXISTING TEST PASSES. test-event-decision-preserve-comments.js has exactly the right assertion —
// `countOf(txt, c) === 1` after two repeat saves — but all three of its event comments sit above keys the
// maker RE-SYNTHESISES (immediate, two option names), which take the `continue` and never reach the
// res.lines push. Its decisions half has no repeat save and no count check at all. No fixture in it
// contains a single un-modelled annotated key, which is the only shape that trips this.
// A FIXTURE ONLY MEASURES WHAT IT HAPPENS TO INCLUDE.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onceonly-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const PORT = 53691;
const BASE = "http://127.0.0.1:" + PORT;
const countOf = (t, s) => String(t).split(s).length - 1;

// UN-MANAGED key (war_with_GER) and MANAGED key (icon) each carry a note. The managed twin is the control
// that keeps the fix honest: a "fix" that simply stopped injecting by key would silence the growth AND
// delete the managed note, and would pass without it.
const DEC_NOTE_UNMANAGED = "# only while at war with Germany";
const DEC_NOTE_MANAGED = "# the button art, deliberately the generic one";
const DEC_TRAIL = "# balance: was 25";
const DECISIONS = `once_cat = {

	once_dec = {
		${DEC_NOTE_MANAGED}
		icon = GFX_decision_generic_decision
		cost = 50 ${DEC_TRAIL}
		${DEC_NOTE_UNMANAGED}
		war_with_GER = yes
		fire_only_once = yes
		available = {
			always = yes
		}
		complete_effect = {
			add_political_power = 25
		}
	}
}
`;
const DEC_CAT = `once_cat = {
	icon = GFX_decision_category_generic_political_actions
}
`;

const EV_NOTE_UNMANAGED = "# klaxon, not the bell";
const EV_NOTE_MANAGED = "# the picture the newspaper uses";
const EVENTS = `add_namespace = onceev

country_event = {
	id = onceev.1
	title = onceev.1.t
	desc = onceev.1.d
	${EV_NOTE_MANAGED}
	picture = GFX_report_event_001
	${EV_NOTE_UNMANAGED}
	show_sound = event_sound_alarm
	is_triggered_only = yes
	option = {
		name = onceev.1.a
		add_political_power = 10
	}
}
`;

function mkMod(name, files) {
  const mod = path.join(ROOT, name);
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), `name="once only ${name}"\n`);
  for (const [rel, body] of files) {
    const abs = path.join(mod, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return mod;
}
const post = (p, body) => fetch(BASE + p, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json());

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  try {
    // ── decisions ─────────────────────────────────────────────────────────────
    console.log("[decisions] three no-edit saves");
    {
      const mod = mkMod("dec", [
        [path.join("common", "decisions", "once.txt"), DECISIONS],
        [path.join("common", "decisions", "categories", "once.txt"), DEC_CAT],
      ]);
      const fp = path.join(mod, "common", "decisions", "once.txt");
      const before = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the fixture really carries one of each note",
        countOf(before, DEC_NOTE_UNMANAGED) === 1 && countOf(before, DEC_NOTE_MANAGED) === 1
        && countOf(before, DEC_TRAIL) === 1,
        { un: countOf(before, DEC_NOTE_UNMANAGED), man: countOf(before, DEC_NOTE_MANAGED), tr: countOf(before, DEC_TRAIL) });

      const body = {
        modPath: mod, categoryId: "once_cat", id: "once_dec", fileName: "once.txt",
        categoryIcon: "", previousId: "once_dec", previousCategoryId: "once_cat",
        name: "Once Decision", cost: "50", icon: "GFX_decision_generic_decision", days: "",
        fireOnce: "yes", available: "always = yes", modifier: "",
        effect: "add_political_power = 25", decisionType: "normal", scope: "country",
        cooldown: "", targetTrigger: "", removeEffect: "", activation: "", cancelTrigger: "",
        selectableMission: "", isGood: "", cancelEffect: "", targetRootTrigger: "", targetArray: "",
        aiHintPpCost: "", fixedRandomSeed: "", targetNonExisting: "", targetsDynamic: "",
        visible: "", allowed: "", aiWillDo: "", priority: "", cancelIfNotVisible: "no",
        customCostText: "", customCostTrigger: "", targetedModifier: "", removeTrigger: "",
        onMapMode: "", highlightStates: "",
      };
      let lastLen = 0;
      for (let pass = 1; pass <= 3; pass++) {
        const r = await post("/api/decisions/save", body);
        rec("CONTROL: save " + pass + " reported success", !!(r && !r.error), r);
        const txt = fs.readFileSync(fp, "utf8");
        rec("pass " + pass + ": ⭐ the note above the UN-MANAGED key is written exactly once",
          countOf(txt, DEC_NOTE_UNMANAGED) === 1, countOf(txt, DEC_NOTE_UNMANAGED) + " copies");
        rec("pass " + pass + ": CONTROL — the note above the MANAGED key is still there, exactly once "
          + "(a fix that just stopped injecting would delete this one)",
          countOf(txt, DEC_NOTE_MANAGED) === 1, countOf(txt, DEC_NOTE_MANAGED) + " copies");
        rec("pass " + pass + ": CONTROL — the trailing note on a value is untouched, exactly once",
          countOf(txt, DEC_TRAIL) === 1, countOf(txt, DEC_TRAIL) + " copies");
        if (pass > 1) rec("pass " + pass + ": ⭐ the file stopped growing", txt.length === lastLen,
          { previous: lastLen, now: txt.length });
        lastLen = txt.length;
      }
      const end = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the un-managed statement itself survived", /war_with_GER\s*=\s*yes/.test(end), end.slice(0, 300));
    }

    // ── events ────────────────────────────────────────────────────────────────
    console.log("\n[events] three no-edit saves");
    {
      const mod = mkMod("ev", [[path.join("events", "once.txt"), EVENTS]]);
      const fp = path.join(mod, "events", "once.txt");
      const before = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the fixture really carries one of each note",
        countOf(before, EV_NOTE_UNMANAGED) === 1 && countOf(before, EV_NOTE_MANAGED) === 1,
        { un: countOf(before, EV_NOTE_UNMANAGED), man: countOf(before, EV_NOTE_MANAGED) });

      const body = {
        modPath: mod, namespace: "onceev", id: "1", type: "country_event",
        title: "Once Event", description: "d", picture: "GFX_report_event_001",
        triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no",
        mtthDays: 0, trigger: "", immediate: "", after: "", timeoutDays: 0,
        options: [{ name: "onceev.1.a", title: "Fine", script: "add_political_power = 10", aiChance: null, trigger: "" }],
      };
      let lastLen = 0;
      for (let pass = 1; pass <= 3; pass++) {
        const r = await post("/api/events/save", body);
        rec("CONTROL: save " + pass + " reported success", !!(r && !r.error), r);
        const txt = fs.readFileSync(fp, "utf8");
        rec("pass " + pass + ": ⭐ the note above the UN-MANAGED key is written exactly once",
          countOf(txt, EV_NOTE_UNMANAGED) === 1, countOf(txt, EV_NOTE_UNMANAGED) + " copies");
        rec("pass " + pass + ": CONTROL — the note above the MANAGED key is still there, exactly once",
          countOf(txt, EV_NOTE_MANAGED) === 1, countOf(txt, EV_NOTE_MANAGED) + " copies");
        if (pass > 1) rec("pass " + pass + ": ⭐ the file stopped growing", txt.length === lastLen,
          { previous: lastLen, now: txt.length });
        lastLen = txt.length;
      }
      const end = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the un-managed statement itself survived",
        /show_sound\s*=\s*event_sound_alarm/.test(end), end.slice(0, 300));
    }

    rec("the fixture was measured", checks >= 24, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== a preserved note is written once: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
