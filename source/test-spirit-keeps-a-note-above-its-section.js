// #spirit-caption-bunched — A CAPTION GOES WITH THE THING IT CAPTIONS.
//
// The same shape as the technology writer's #tech-lead-comment-detached, found by the same question: the
// ideas merge strips each form-owned section and its braces and leaves the comment ABOVE it behind, then
// re-inserts the rebuilt sections at the END of the block. The orphaned captions therefore bunch together
// above whichever section lands first, so a save that changed NOTHING did this:
//
//     #shown only to the player       #shown only to the player
//     allowed = { … }                 #the balance lever
//     #the balance lever          ->  #un-modelled on purpose
//     modifier = { … }                allowed = { … }
//     #un-modelled on purpose         modifier = { … }
//     on_add = { … }                  on_add = { … }
//
// 293 bytes before, 293 bytes after, every comment still present. THAT is why this needs its own test:
// the multiset "no comments lost" comparison used everywhere else in this repo passes on the broken
// writer, and my own ideas round-trip earlier in this session reported the file clean.
//
// 444 such captions across the six shipped corpora's common/ideas — 102 above removal_cost, 86 above
// modifier, 84 above allowed.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritcap-"));
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

const PORT = 53689;
const BASE = "http://127.0.0.1:" + PORT;
const REL = path.join("common", "ideas", "cap.txt");
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

const FIXTURE = `ideas = {
	country = {
		#why this spirit exists
		cap_spirit = {
			#shown only to the player
			allowed = {
				always = yes
			}
			#the balance lever
			modifier = {
				stability_factor = 0.05
			}
			#un-modelled on purpose
			on_add = {
				custom_effect_tooltip = cap_tt
			}
		}
	}
}
`;

const SECTIONS = ["allowed = {\nalways = yes\n}", "modifier = {\nstability_factor = 0.05\n}",
  "on_add = {\ncustom_effect_tooltip = cap_tt\n}"];
const FORM_SECTIONS = ["allowed", "equipment_bonus", "visible", "on_add", "modifier", "allowed_civil_war"];

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
function captionSitsAbove(text, comment, key) {
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!new RegExp("^[ \\t]*" + key + "[ \\t]*=").test(lines[i])) continue;
    if (lines[i - 1].trim() === comment) return true;
  }
  return false;
}

function countCorpusCaptions() {
  // DERIVED, not typed in: a comment line directly above one of the section keys an idea block holds.
  const KEYS = new Set(["allowed", "allowed_civil_war", "available", "visible", "on_add", "on_remove",
    "modifier", "equipment_bonus", "research_bonus", "targeted_modifier", "rule", "traits", "cost",
    "removal_cost", "level", "ledger", "picture", "name", "cancel_if_invalid", "allowed_to_remove"]);
  let total = 0, corpora = 0;
  for (const [, root] of CORPORA) {
    const dir = path.join(root, "common", "ideas");
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)); } catch (_) { continue; }
    corpora++;
    for (const n of names) {
      let lines = [];
      try { lines = fs.readFileSync(path.join(dir, n), "utf8").split(/\r?\n/); } catch (_) { continue; }
      for (let i = 1; i < lines.length; i++) {
        const m = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/.exec(lines[i]);
        if (!m || !KEYS.has(m[1])) continue;
        if (/^[ \t]*#/.test(lines[i - 1] || "")) total++;
      }
    }
  }
  return { total, corpora };
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mkMod = (name, body) => {
    const mod = path.join(ROOT, name);
    const fp = path.join(mod, REL);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), `name="spirit captions ${name}"\n`);
    fs.writeFileSync(fp, body);
    return { mod, fp };
  };
  const save = (mod, effects) => fetch(`${BASE}/api/ideas/upsert-definition`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modPath: mod, ideaId: "cap_spirit", targetRelativeFile: "common/ideas/cap.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "Cap Spirit", desc: "d", picture: "", category: "country", mode: "edit",
      selectedEffects: effects, formSections: FORM_SECTIONS,
      cost: "", removalCost: "", ledger: "", traits: "",
    }),
  }).then((r) => r.json());

  try {
    const { mod, fp } = mkMod("annotated", FIXTURE);
    const before = fs.readFileSync(fp, "utf8");

    console.log("-- a no-edit save --");
    const r1 = await save(mod, SECTIONS);
    rec("CONTROL: the save reported success", !!(r1 && r1.ok && !r1.error), r1);
    const after = fs.readFileSync(fp, "utf8");

    rec("the caption stays above allowed",
      captionSitsAbove(after, "#shown only to the player", "allowed"), after);
    rec("⭐ the caption stays above modifier",
      captionSitsAbove(after, "#the balance lever", "modifier"), after);
    rec("the caption stays above on_add",
      captionSitsAbove(after, "#un-modelled on purpose", "on_add"), after);
    rec("the spirit's own caption is untouched",
      captionSitsAbove(after, "#why this spirit exists", "cap_spirit"), after);
    rec("⭐ a no-edit save leaves the block byte-identical", after === before,
      { before: before.length, after: after.length });

    console.log("\n-- why position, not presence --");
    rec("CONTROL: ⭐ no comment was LOST, and the file is the same LENGTH — the multiset check this repo "
      + "uses elsewhere passes either way, which is exactly how the bunching hid",
      sameMultiset(commentTexts(before), commentTexts(after)) && before.length === after.length,
      { before: before.length, after: after.length });

    console.log("\n-- saving again --");
    await save(mod, SECTIONS);
    const after2 = fs.readFileSync(fp, "utf8");
    rec("CONTROL: ⭐ a second save writes the same bytes — a caption put back beside its section AND left "
      + "in the block would print twice, growing the file on every save",
      after2 === after, { first: after.length, second: after2.length });

    console.log("\n-- editing one section --");
    {
      const edited = ["allowed = {\nalways = yes\n}", "modifier = {\nstability_factor = 0.11\n}",
        "on_add = {\ncustom_effect_tooltip = cap_tt\n}"];
      await save(mod, edited);
      const after3 = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the edit really landed", /stability_factor\s*=\s*0\.11/.test(after3), after3);
      rec("the caption is still above the section that was edited",
        captionSitsAbove(after3, "#the balance lever", "modifier"), after3);
      rec("and the other captions did not move",
        captionSitsAbove(after3, "#shown only to the player", "allowed")
        && captionSitsAbove(after3, "#un-modelled on purpose", "on_add"), after3);
    }

    console.log("\n-- clearing the section a caption belongs to --");
    {
      // The leftover path: the caption is taken out of the block at strip time and its section is never
      // re-emitted, so without the guard it is silently deleted. Trading a comment that MOVES for a comment
      // that is GONE would be the worse bug — this is the check that keeps that honest.
      const { mod: m2, fp: fp2 } = mkMod("cleared", FIXTURE);
      const beforeC = fs.readFileSync(fp2, "utf8");
      rec("CONTROL: the fixture really carries the caption",
        commentTexts(beforeC).includes("#the balance lever"), commentTexts(beforeC));
      await save(m2, ["allowed = {\nalways = yes\n}", "on_add = {\ncustom_effect_tooltip = cap_tt\n}"]);
      const afterC = fs.readFileSync(fp2, "utf8");
      rec("CONTROL: the modifier section really was cleared", !/stability_factor/.test(afterC), afterC);
      rec("⭐ the caption for the cleared section is not DELETED — a save may move a comment, never lose one",
        commentTexts(afterC).includes("#the balance lever"), afterC);
    }

    console.log("\n-- the unannotated control --");
    {
      const { mod: m3, fp: fp3 } = mkMod("plain", `ideas = {
	country = {
		cap_spirit = {
			allowed = {
				always = yes
			}
			modifier = {
				stability_factor = 0.05
			}
		}
	}
}
`);
      const beforeP = fs.readFileSync(fp3, "utf8");
      rec("CONTROL: the plain fixture really has no comments", commentTexts(beforeP).length === 0, commentTexts(beforeP));
      await save(m3, ["allowed = {\nalways = yes\n}", "modifier = {\nstability_factor = 0.05\n}"]);
      const afterP = fs.readFileSync(fp3, "utf8");
      rec("CONTROL: it gained no comment", commentTexts(afterP).length === 0, commentTexts(afterP));
      rec("CONTROL: and it round-trips byte-identically", afterP === beforeP,
        { before: beforeP.length, after: afterP.length });
    }

    console.log("\n-- the corpora --");
    {
      const { total, corpora } = countCorpusCaptions();
      console.log("     " + total + " captions above an idea section key across " + corpora + " corpora");
      rec("CONTROL: the corpora really do caption these sections", corpora === 0 || total >= 100, { total, corpora });
    }

    rec("the fixture was measured", checks >= 16, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== spirit keeps a note above its section: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
