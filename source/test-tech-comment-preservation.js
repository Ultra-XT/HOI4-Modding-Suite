// #keep-tech-comments — saving a technology deleted the modder's notes out of its ai_will_do and modifier
// blocks.
//
// collectAllTechnologiesUncached parses each file from a COMMENT-STRIPPED copy. Three fields were already
// retrofitted to re-read the un-stripped text (extraScript #keep-tech-comments, categoriesRaw
// #keep-categories-raw, enableEquipmentsRaw #keep-enable-equip-raw) — so preserving the modder's comments is
// a stated requirement of this file. ai_will_do and modifier were simply missed: both were read off the
// stripped text and then rebuilt from it, so every comment inside them was gone.
//
// It reaches techs the modder never opened: the client adds the prerequisite-PARENTS of each edited tech to
// the save set, so editing a child re-serializes its untouched parent.
//
// Measured by re-serializing every tech in a corpus and diffing the comment multiset (the true worst case):
//   Millennium Dawn   25 comments lost -> 20
//   vanilla-as-mod    99 comments lost -> 33
// The ai_will_do body is the most heavily annotated block in both corpora, which is why it dominates.
//
// STILL LOST, each needing its own preservation mechanism (deliberately not fixed here):
//   * a comment on `research_cost` / `start_year` — the whole line is stripped and the value re-emitted bare
//     (vanilla: 13x "#Carrier Variant")
//   * a comment inside the hidden form `allow = { always = no #… }`, which is regenerated from the isHidden
//     flag (vanilla: 11x "#UPDATE <x>_tt if changing")
//   * a comment inside the primary `folder` block (Millennium Dawn: 11x "#civilian_folder")
//   * a commented-out `# leads_to_tech = …` inside a path block that also has a live edge
//
// NOT a defect, though it was reported as one: a trailing comment on the `<id> = {` line survives. It is
// captured by rawBlockFor, carried in extraScript and re-emitted inside the block, one indent deeper. That
// is relocation, not loss.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-techcomments-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TC"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "common", "technologies", "custom_technologies.txt");
const ORIGINAL = `technologies = {
	probe_parent = {
		research_cost = 2
		start_year = 1936
		folder = { name = infantry_folder position = { x = 0 y = 0 } }
		categories = { infantry_tech }
		ai_will_do = {
			factor = 10 # We want the AI to at least buy these.
			modifier = { ##Simulate focus on other techs
				factor = 0.5
				date < 1939.1.1
			}
		}
		modifier = {
			army_org_factor = 0.05 # only the org, NOT the speed - balance pass 3
		}
		path = {
			leads_to_tech = probe_child
			research_cost_coeff = 1
		}
	}
	probe_child = {
		research_cost = 1
		start_year = 1937
		folder = { name = infantry_folder position = { x = 0 y = 2 } }
		categories = { infantry_tech }
		prerequisite = { probe_parent }
		ai_will_do = {
			factor = 1 # the child's own note
		}
	}
}
`;
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const KEPT = [
  "# We want the AI to at least buy these.",
  "##Simulate focus on other techs",
  "# only the org, NOT the speed - balance pass 3",
  "# the child's own note",
];

const PORT = 39925, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const techs = (cat.technologies || cat.techs || []).filter((t) => t && t.isMod);
    ok("precondition: both techs are read as the mod's own", techs.length === 2, techs.map((t) => t.id));

    // The parse itself must carry the comments — if it does not, nothing downstream can put them back.
    const parent = techs.find((t) => t.id === "probe_parent") || {};
    ok("the parsed ai_will_do still contains its comments",
      /We want the AI/.test(parent.aiWillDo || "") && /Simulate focus/.test(parent.aiWillDo || ""), parent.aiWillDo);
    ok("the parsed modifier still contains its comment",
      /balance pass 3/.test(parent.modifiers || ""), parent.modifiers);

    // Save the catalog back UNCHANGED — the "edited a child, its parent got re-serialized" case.
    const saved = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: techs }),
    }).then((r) => r.json());
    ok("the unedited save succeeds", saved && saved.ok !== false, saved);

    const after = fs.readFileSync(FILE, "utf8");
    KEPT.forEach((c) => ok(`comment survives: ${c}`, after.includes(c), after));

    // The blocks themselves must still be intact and usable, not merely comment-bearing.
    ok("the ai_will_do factor is still there", /factor\s*=\s*10/.test(after), after);
    ok("…and its nested modifier kept its own nesting", /date\s*<\s*1939\.1\.1/.test(after), after);
    ok("the tech's modifier value survived", /army_org_factor\s*=\s*0\.05/.test(after), after);
    ok("the file is still brace-balanced",
      (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), after);
    ok("both techs are still defined", /probe_parent\s*=\s*\{/.test(after) && /probe_child\s*=\s*\{/.test(after), after);

    // Saving twice must not duplicate or re-nest anything.
    const cat2 = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: (cat2.technologies || cat2.techs || []).filter((t) => t && t.isMod) }),
    }).then((r) => r.json());
    const after2 = fs.readFileSync(FILE, "utf8");
    ok("a second save keeps every comment exactly once",
      KEPT.every((c) => (after2.split(c).length - 1) === 1), KEPT.map((c) => [c, after2.split(c).length - 1]));
    ok("…and is byte-identical to the first save (the round-trip has settled)", after2 === after,
      { same: after2 === after });

    console.log("\ntest-tech-comment-preservation: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
