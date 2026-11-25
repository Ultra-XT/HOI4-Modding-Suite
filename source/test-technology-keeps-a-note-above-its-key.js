// #tech-lead-comment-detached — A CAPTION GOES WITH THE THING IT CAPTIONS.
//
// #keep-tech-comments made in-block comments survive a technology save, by reading extraScript from the
// UN-stripped block. They survived — but DETACHED. buildExtraScriptFromTechBlock removes the key and its
// braces for every field serializeTechnology rebuilds, and left the comment above it sitting there; the
// leftover then fell into extraScript, which the writer emits at the BOTTOM of the block. So a save that
// changed NOTHING lifted every caption off its statement and parked it at the end:
//
//     #what it unlocks                  #the note that explained enable_equipments
//     enable_equipments = { ... }   ->  enable_equipments = { ... }
//     #balance pass 3: was 0.5          ai_will_do = { ... }
//     ai_will_do = { ... }              #what it unlocks          <- both, now captioning nothing
//                                       #balance pass 3: was 0.5
//
// Measured across the six shipped corpora's common/technologies: 1,265 captions above a key the writer
// re-creates — 1,062 on `modifier`, 144 on `allow`, and Rise of Nations alone accounts for 1,091.
//
// WHY THIS TEST CHECKS POSITION AND NOT PRESENCE. Every comment survived the old code, so a multiset
// "no comments lost" check — the one this repo uses everywhere else — passes on the broken writer. That is
// how this got missed: the bug is not loss, it is RELOCATION. Each check below asserts the caption is on
// the line IMMEDIATELY ABOVE its key, and one control asserts the multiset check would have passed anyway.
//
// The blank-line insertion between blocks is pre-existing and deliberately not asserted either way.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-technote-"));
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

const PORT = 53687;
const BASE = "http://127.0.0.1:" + PORT;
const REL = path.join("common", "technologies", "nova_notes.txt");
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

// A tech file shaped like the shipped ones: captions above keys the writer rebuilds (modifier, ai_will_do,
// enable_equipments, categories, research_cost, folder, the HIDDEN allow form) and above one it does not
// (on_research_complete, which round-trips verbatim through extraScript).
const FIXTURE = `technologies = {

	#the backbone of the early army
	nova_note_first = {
		#what it unlocks
		enable_equipments = {
			infantry_equipment_1
		}
		#balance: doubled for the 1936 start
		research_cost = 2
		start_year = 1936
		#which tree it belongs in
		folder = {
			name = infantry_folder
			position = { x = 0 y = 0 }
		}
		#weapons only, not doctrine
		categories = {
			infantry_weapons
		}
		#the AI overvalued this before 1.11
		ai_will_do = {
			factor = 1
		}
		#the whole point of the tech
		modifier = {
			army_defence_factor = 0.05
		}
		#deliberately un-modelled by the form
		on_research_complete = {
			custom_effect_tooltip = nova_note_tooltip
		}
	}

	nova_note_hidden = {
		research_cost = 1
		start_year = 1936
		folder = {
			name = infantry_folder
			position = { x = 2 y = 0 }
		}
		#hidden: unlocked by the focus, never researched
		allow = {
			always = no
		}
	}

	nova_note_plain = {
		research_cost = 1
		start_year = 1936
		folder = {
			name = infantry_folder
			position = { x = 4 y = 0 }
		}
	}
}
`;

const commentTexts = (t) => (t.match(/#[^\r\n]*/g) || []).map((s) => s.trim()).filter(Boolean);
const asMultiset = (list) => {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
};
const sameMultiset = (a, b) => {
  const ma = asMultiset(a), mb = asMultiset(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) if (mb.get(k) !== v) return false;
  return true;
};
// The whole point: is `comment` on the line IMMEDIATELY above the line that opens `key`?
function captionSitsAbove(text, comment, key) {
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!new RegExp("^[ \\t]*" + key + "[ \\t]*=").test(lines[i])) continue;
    if (lines[i - 1].trim() === comment) return true;
  }
  return false;
}
const balanced = (t) => {
  let d = 0, inC = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inC) { if (c === "\n") inC = false; continue; }
    if (c === "#") { inC = true; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
};

function countCorpusCaptions() {
  // DERIVE the reachability number by scanning, rather than typing it in. Counts a comment line directly
  // above a key serializeTechnology rebuilds.
  const MODELLED = new Set(["prerequisite", "path", "xor", "enable_equipments", "modifier",
    "mutually_exclusive", "sub_technologies", "dependencies", "categories", "ai_will_do", "folder",
    "allow", "research_cost", "start_year", "show_equipment_icon", "doctrine", "force_use_small_tech_layout"]);
  let total = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "common", "technologies");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let lines = [];
      try { lines = fs.readFileSync(path.join(dir, n), "utf8").split(/\r?\n/); } catch (_) { continue; }
      for (let i = 1; i < lines.length; i++) {
        const m = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/.exec(lines[i]);
        if (!m || !MODELLED.has(m[1])) continue;
        if (/^[ \t]*#/.test(lines[i - 1] || "")) total++;
      }
    }
  }
  return { total, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = path.join(ROOT, "note_mod");
  const fp = path.join(mod, REL);
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova tech captions"\n');
    fs.writeFileSync(fp, FIXTURE);
    const before = fs.readFileSync(fp, "utf8");
    const q = encodeURIComponent(mod);

    const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${q}`).then((r) => r.json());
    const all = (cat && cat.technologies) || [];
    const mine = all.filter((t) => t && /^nova_note_/.test(t.id || ""));
    rec("CONTROL: the fixture's three techs are in the catalogue", mine.length === 3, mine.map((t) => t.id));

    const send = (techs) => fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technologies: techs, equipments: (cat && cat.equipments) || [], customTabs: (cat && cat.customTabs) || [],
        modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
      }),
    }).then((r) => r.json());

    // ── a save that changes nothing must not move a caption ────────────────────
    console.log("\n-- a no-edit save --");
    const r1 = await send(mine);
    rec("CONTROL: the save reported success", !!(r1 && r1.ok && !r1.error), r1);
    const after = fs.readFileSync(fp, "utf8");
    rec("CONTROL: the file is still brace-balanced", balanced(after), after.slice(0, 200));

    rec("the caption stays above enable_equipments",
      captionSitsAbove(after, "#what it unlocks", "enable_equipments"), after);
    rec("the caption stays above research_cost",
      captionSitsAbove(after, "#balance: doubled for the 1936 start", "research_cost"), after);
    rec("the caption stays above folder",
      captionSitsAbove(after, "#which tree it belongs in", "folder"), after);
    rec("the caption stays above categories",
      captionSitsAbove(after, "#weapons only, not doctrine", "categories"), after);
    rec("the caption stays above ai_will_do",
      captionSitsAbove(after, "#the AI overvalued this before 1.11", "ai_will_do"), after);
    rec("⭐ the caption stays above modifier (1,062 of the 1,265 in the corpora)",
      captionSitsAbove(after, "#the whole point of the tech", "modifier"), after);
    rec("the caption stays above the HIDDEN allow form",
      captionSitsAbove(after, "#hidden: unlocked by the focus, never researched", "allow"), after);
    rec("the caption above an UN-modelled key stays with it too",
      captionSitsAbove(after, "#deliberately un-modelled by the form", "on_research_complete"), after);
    rec("the tech's own caption is untouched",
      captionSitsAbove(after, "#the backbone of the early army", "nova_note_first"), after);

    // ── the control that shows WHY this test measures position ─────────────────
    console.log("\n-- why position, not presence --");
    rec("CONTROL: ⭐ no comment was LOST — the multiset check this repo uses elsewhere passes either way, "
      + "which is exactly how the relocation hid",
      sameMultiset(commentTexts(before), commentTexts(after)),
      { before: commentTexts(before).length, after: commentTexts(after).length });

    // ── idempotence: the duplication half of the same bug ──────────────────────
    console.log("\n-- saving again --");
    const cat2 = await fetch(`${BASE}/api/technologies/catalog?modPath=${q}`).then((r) => r.json());
    const mine2 = ((cat2 && cat2.technologies) || []).filter((t) => t && /^nova_note_/.test(t.id || ""));
    await send(mine2);
    const after2 = fs.readFileSync(fp, "utf8");
    rec("CONTROL: ⭐ a second save writes the same bytes — a caption re-emitted beside its key AND left in "
      + "extraScript would print twice, and the file would grow on every save",
      after2 === after, { first: after.length, second: after2.length });
    rec("CONTROL: and the comment multiset is still identical",
      sameMultiset(commentTexts(before), commentTexts(after2)), commentTexts(after2).length);

    // ── a real allow gate must NOT be treated as the hidden form ───────────────
    console.log("\n-- a real allow gate --");
    {
      const m2 = path.join(ROOT, "gate_mod");
      const fp2 = path.join(m2, REL);
      fs.mkdirSync(path.dirname(fp2), { recursive: true });
      fs.writeFileSync(path.join(m2, "descriptor.mod"), 'name="Nova tech gate"\n');
      fs.writeFileSync(fp2, `technologies = {
	nova_gate_tech = {
		research_cost = 1
		start_year = 1936
		folder = {
			name = infantry_folder
			position = { x = 0 y = 0 }
		}
		#only with the DLC installed
		allow = {
			has_dlc = "No Step Back"
		}
	}
}
`);
      const beforeG = fs.readFileSync(fp2, "utf8");
      const q2 = encodeURIComponent(m2);
      const catG = await fetch(`${BASE}/api/technologies/catalog?modPath=${q2}`).then((r) => r.json());
      const mineG = ((catG && catG.technologies) || []).filter((t) => t && t.id === "nova_gate_tech");
      rec("CONTROL: the gated tech is in the catalogue", mineG.length === 1, mineG.map((t) => t.id));
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technologies: mineG, equipments: (catG && catG.equipments) || [],
          customTabs: (catG && catG.customTabs) || [], modPath: m2,
          countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
        }),
      }).then((r) => r.json());
      const afterG = fs.readFileSync(fp2, "utf8");
      rec("a REAL allow gate keeps its caption (the writer does not rebuild it, so claiming the caption "
        + "would move it away from the block instead of toward it)",
        captionSitsAbove(afterG, "#only with the DLC installed", "allow"), afterG);
      rec("CONTROL: and the gate itself survived",
        /has_dlc\s*=\s*"No Step Back"/.test(afterG), afterG);
      rec("CONTROL: no comment lost in the gated file",
        sameMultiset(commentTexts(beforeG), commentTexts(afterG)), commentTexts(afterG));
    }

    // ── a tech with no comments must not acquire one ───────────────────────────
    console.log("\n-- the unannotated control --");
    {
      const m3 = path.join(ROOT, "plain_mod");
      const fp3 = path.join(m3, REL);
      fs.mkdirSync(path.dirname(fp3), { recursive: true });
      fs.writeFileSync(path.join(m3, "descriptor.mod"), 'name="Nova tech plain"\n');
      fs.writeFileSync(fp3, `technologies = {
	nova_plain_tech = {
		research_cost = 1
		start_year = 1936
		folder = {
			name = infantry_folder
			position = { x = 0 y = 0 }
		}
		modifier = {
			army_defence_factor = 0.05
		}
	}
}
`);
      const beforeP = fs.readFileSync(fp3, "utf8");
      rec("CONTROL: the plain fixture really has no comments", commentTexts(beforeP).length === 0, commentTexts(beforeP));
      const q3 = encodeURIComponent(m3);
      const catP = await fetch(`${BASE}/api/technologies/catalog?modPath=${q3}`).then((r) => r.json());
      const mineP = ((catP && catP.technologies) || []).filter((t) => t && t.id === "nova_plain_tech");
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technologies: mineP, equipments: (catP && catP.equipments) || [],
          customTabs: (catP && catP.customTabs) || [], modPath: m3,
          countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
        }),
      }).then((r) => r.json());
      const afterP = fs.readFileSync(fp3, "utf8");
      rec("CONTROL: it gained no comment", commentTexts(afterP).length === 0, commentTexts(afterP));
    }

    // ── the caption for a key the user CLEARS ─────────────────────────────────
    // The one case that reaches the leftover net: the caption is taken out of extraScript at parse time,
    // and then the writer never emits its key because the model no longer has one. Without the net it is
    // silently deleted — which would trade a comment that MOVES for a comment that is GONE, a worse bug
    // than the one being fixed. (Found because the leftover back-out did not bite: a guard nothing
    // exercises is indistinguishable from dead code.)
    console.log("\n-- clearing the key a caption belongs to --");
    {
      const m4 = path.join(ROOT, "cleared_mod");
      const fp4 = path.join(m4, REL);
      fs.mkdirSync(path.dirname(fp4), { recursive: true });
      fs.writeFileSync(path.join(m4, "descriptor.mod"), 'name="Nova tech cleared"\n');
      fs.writeFileSync(fp4, `technologies = {
	nova_cleared_tech = {
		research_cost = 1
		start_year = 1936
		folder = {
			name = infantry_folder
			position = { x = 0 y = 0 }
		}
		#the reasoning behind these numbers
		modifier = {
			army_defence_factor = 0.05
		}
	}
}
`);
      const q4 = encodeURIComponent(m4);
      const catC = await fetch(`${BASE}/api/technologies/catalog?modPath=${q4}`).then((r) => r.json());
      const mineC = ((catC && catC.technologies) || []).filter((t) => t && t.id === "nova_cleared_tech");
      rec("CONTROL: the tech is in the catalogue and HAS a modifier to clear",
        mineC.length === 1 && !!(mineC[0].modifiers || "").trim(), mineC.map((t) => t.modifiers));
      const cleared = JSON.parse(JSON.stringify(mineC));
      cleared[0].modifiers = ""; // the user emptied the box
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technologies: cleared, equipments: (catC && catC.equipments) || [],
          customTabs: (catC && catC.customTabs) || [], modPath: m4,
          countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
        }),
      }).then((r) => r.json());
      const afterC = fs.readFileSync(fp4, "utf8");
      rec("CONTROL: the modifier really was cleared", !/army_defence_factor/.test(afterC), afterC);
      rec("⭐ the caption for the cleared key is not DELETED — a save may move a comment, never lose one",
        commentTexts(afterC).includes("#the reasoning behind these numbers"), afterC);
    }

    // ── reachability, derived ──────────────────────────────────────────────────
    console.log("\n-- the corpora --");
    {
      const { total, corpora } = countCorpusCaptions();
      console.log("     " + total + " captions above a rebuilt key across " + corpora + " corpora");
      rec("CONTROL: the corpora really do caption these keys", corpora === 0 || total >= 200, { total, corpora });
    }

    rec("the fixture was measured", checks >= 24, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== technology keeps a note above its key: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
