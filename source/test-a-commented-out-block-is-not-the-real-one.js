// ⛔ #commented-out-blocks — A `#` IS HOW A MODDER TURNS SOMETHING OFF, AND THE MAP CODE KEPT READING IT
// AS THOUGH IT WERE ON.
//
// Found when Auto-fix took a shipping workshop mod from 0 unbalanced state files to 1 — it wrote a file
// HOI4 cannot read. In The Road to 56's 385-Oregon.txt a province's building block is left in the file
// commented out:
//
//     #11945 = {
//     #	naval_base = 1
//     #}
//     }            <- the real closing brace of the buildings block
//
// removeProvinceBuildingBlock ran its regex over raw text, matched from the digits through the COMMENTED
// closing brace, and ate the newline after it — pulling the genuine `}` up onto the surviving `#`. One
// state file, balanced before, one `{` short after; and an unbalanced file is the shape that makes
// Clausewitz swallow every state defined after it.
//
// It was never one bug. The same blindness sat in four WRITERS, and in three of them the comment-aware
// helper was already in use a few lines away:
//
//   removeProvinceBuildingBlock     ate a real `}` (above)
//   removeVictoryPointForProvince   identical corruption, through an ordinary moveProvince
//   renumberStateId                 rewrote a comment that said "# was id = 7" and left the state at 7,
//                                   while still renaming the file to 3-….txt — name and contents disagreeing
//   setStateFieldsInBlock (owner)   inserted the owner under a commented-out `#history = {`, i.e. outside
//                                   the real block, where HOI4 does not read it — the state silently unowned
//
// ⚠️ The READER was fine, and a probe of mine said otherwise. A scratch measurement claimed 134 victory
// points and 88 buildings across the corpus were commented out yet read as live — but it reimplemented the
// parse instead of calling Nova's, and parseStatesText has always started with stripComments(). The change
// I made off the back of that was inert and is reverted; the reader section below is kept as a REGRESSION
// GUARD on behaviour that was already correct, and it bites if that stripComments() call is removed
// (verified). Measure Nova, not a copy of Nova.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x) : "")); }
};
const roots = [];
const mk = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cmtblk-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  }
  return root;
};
// Brace balance outside comments and strings — the question the game's parser effectively asks.
const balance = (t) => {
  let d = 0, inC = false, inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inC) { if (c === "\n") inC = false; continue; }
    if (inQ) { if (c === '"') inQ = false; continue; }
    if (c === "#") { inC = true; continue; }
    if (c === '"') { inQ = true; continue; }
    if (c === "{") d++; else if (c === "}") d--;
  }
  return d;
};
const NOGAME = path.join(os.tmpdir(), "nova-not-a-game-root");

try {
  console.log("\n-- a commented-out province building block (the Road to 56 shape) --");
  {
    const oregon = `state = {
	id = 10
	name = "Oregon"
	provinces = { 700 11945 }
	history = {
		owner = USA
		buildings = {
			infrastructure = 5
			#11945 = {
			#	naval_base = 1
			#}
		}
	}
}
`;
    const mod = mk({
      "history/states/10-Oregon.txt": oregon,
      "history/states/20-Other.txt": 'state = { id = 20 name = "O" provinces = { 800 } history = { owner = USA } }\n',
    });
    md.moveProvince({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 11945, fromStateId: 10, toStateId: 20 });
    const after = fs.readFileSync(path.join(mod, "history", "states", "10-Oregon.txt"), "utf8");
    ok(balance(after) === 0, "the file is still brace-balanced", { balance: balance(after) });
    ok(/#11945 = \{/.test(after) && /#\tnaval_base = 1/.test(after), "…the commented-out block is left exactly as the author wrote it");
    ok(/infrastructure = 5/.test(after), "…the live state building survives");
    ok(!/#\s*\}\s*\n\s*\}/.test(after.replace(/\r/g, "")) || balance(after) === 0, "…and no real closing brace was commented out");
  }

  console.log("\n-- a commented-out victory point --");
  {
    const body = `state = {
	id = 10
	name = "A"
	provinces = { 700 701 }
	history = {
		owner = GER
		#victory_points = { 700 15 }
	}
}
`;
    const mod = mk({
      "history/states/10-A.txt": body,
      "history/states/20-B.txt": 'state = { id = 20 name = "B" provinces = { 800 } history = { owner = GER } }\n',
    });
    md.moveProvince({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 700, fromStateId: 10, toStateId: 20 });
    const after = fs.readFileSync(path.join(mod, "history", "states", "10-A.txt"), "utf8");
    ok(balance(after) === 0, "the file is still brace-balanced", { balance: balance(after) });
    ok(/#victory_points = \{ 700 15 \}/.test(after), "…and the disabled VP is untouched, not silently deleted");
  }

  console.log("\n-- a NUMBER INSIDE A COMMENT is not victory-point data --");
  {
    // The worst of the family, found on a workshop mod. Modders annotate victory points constantly, and
    // those notes contain province-shaped numbers:
    //
    //     victory_points = { # Münster was 11388
    //         13377 5
    //     }
    //
    // fixSeaProvinceLeftovers read [11388, 13377, 5], decided the state referenced sea province 5, and
    // rewrote the block as `victory_points = { 11388 13377 }` — the comment's id became the province, the
    // real province became the VALUE, the value was dropped and the note deleted. One Auto-fix click moved
    // a victory point onto land a different state owns.
    const block = `state = {
	id = 57
	name = "Westfalen"
	provinces = { 495 13377 }
	history = {
		owner = GER
		victory_points = { # Dortmund
			495 8 #was 5
		}
		victory_points = { # Münster was 11388
			13377 5
		}
	}
}`;
    // Removing a VP for a province NOT mentioned outside a comment must change nothing at all.
    const untouched = md.setStateFieldsInBlock(block, {});
    ok(untouched === block || /# Münster was 11388/.test(untouched), "an unrelated edit leaves the annotated block alone");

    // The mod needs a real SEA province for fixSeaProvinceLeftovers to get past its early return — that is
    // what makes the scan below load-bearing. Province 5 is sea, and is named ONLY in a comment ("#was 5").
    const DEF = [
      "495;10;20;30;land;false;plains;europe",
      "13377;40;50;60;land;false;plains;europe",
      "5;70;80;90;sea;false;ocean;",
    ].join("\n") + "\n";
    const mod = mk({ "history/states/57-W.txt": block + "\n", "map/definition.csv": DEF });
    const model = md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    const st = (model.states || []).find((s) => s.id === 57);
    ok(st && st.victoryPoints.length === 2, "the model reads exactly two victory points", st && st.victoryPoints);
    ok(st && st.victoryPoints.some((v) => v.province === 13377 && v.value === 5),
      "…including the one whose comment mentions another province id", st && st.victoryPoints);
    ok(st && !st.victoryPoints.some((v) => v.province === 11388),
      "…and NOT the number that only appears in a comment", st && st.victoryPoints);

    // The sea-leftover fixer must not touch this state at all: nothing here references a sea province.
    md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    const after = fs.readFileSync(path.join(mod, "history", "states", "57-W.txt"), "utf8");
    ok(/# Münster was 11388/.test(after) && /# Dortmund/.test(after), "the modder's notes survive the sea-leftover sweep", after);
    ok(!/victory_points = \{ 11388/.test(after), "…and no victory point was re-pointed at the commented id");
    const st2 = (md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).states || []).find((s) => s.id === 57);
    ok(st2 && st2.victoryPoints.some((v) => v.province === 13377 && v.value === 5), "…the real VP is unchanged", st2 && st2.victoryPoints);
  }

  console.log("\n-- removing one victory point must not rewrite the block NEXT to it --");
  {
    // The remove path in its own right. Take away the VP for province 495 — an ordinary province move —
    // and the annotated block below it must come back byte-for-byte. Reading its numbers raw gave
    // [11388, 13377, 5]; the pair count then disagreed with the token count, which the old code read as
    // "this block changed", so it rewrote an untouched block as `{ 11388 13377 }` and deleted the note.
    const body = `state = {
	id = 57
	name = "W"
	provinces = { 495 13377 }
	history = {
		owner = GER
		victory_points = { 495 8 }
		victory_points = { # Münster was 11388
			13377 5
		}
	}
}
`;
    const mod = mk({
      "history/states/57-W.txt": body,
      "history/states/58-X.txt": 'state = { id = 58 name = "X" provinces = { 900 } history = { owner = GER } }\n',
    });
    md.moveProvince({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 495, fromStateId: 57, toStateId: 58 });
    const after = fs.readFileSync(path.join(mod, "history", "states", "57-W.txt"), "utf8");
    ok(!/victory_points = \{ 495/.test(after) && !/\b495 8\b/.test(after), "the VP that moved with its province is gone", after);
    ok(/# Münster was 11388/.test(after), "…the annotated block's comment survives", after);
    ok(/13377 5/.test(after), "…and its pair is untouched, not re-read around the comment's number", after);
    ok(!/\{ 11388 13377 \}/.test(after), "…the comment's id did NOT become a province");
    const st = (md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).states || []).find((s) => s.id === 57);
    ok(st && st.victoryPoints.length === 1 && st.victoryPoints[0].province === 13377 && st.victoryPoints[0].value === 5,
      "…and the state is left with exactly the one real VP", st && st.victoryPoints);
  }

  console.log("\n-- …and the sharper case: the comment names the very province being removed --");
  {
    // "# was 495" sits above a VP for a different province. Move province 495 away and, reading raw, the
    // pairs come out as (495, 13377) — the comment's id paired with the real one — which MATCHES the id
    // being removed, so the whole live block is deleted and a real victory point vanishes from the mod.
    const body = `state = {
	id = 59
	name = "Y"
	provinces = { 495 13377 }
	history = {
		owner = GER
		victory_points = { # was 495
			13377 5
		}
	}
}
`;
    const mod = mk({
      "history/states/59-Y.txt": body,
      "history/states/58-X.txt": 'state = { id = 58 name = "X" provinces = { 900 } history = { owner = GER } }\n',
    });
    md.moveProvince({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], provinceId: 495, fromStateId: 59, toStateId: 58 });
    const after = fs.readFileSync(path.join(mod, "history", "states", "59-Y.txt"), "utf8");
    ok(/13377 5/.test(after), "the live victory point is NOT deleted because a comment named the moved province", after);
    ok(/# was 495/.test(after), "…and the comment is still there");
    const st = (md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).states || []).find((s) => s.id === 59);
    ok(st && st.victoryPoints.length === 1 && st.victoryPoints[0].province === 13377,
      "…the state keeps its one real VP", st && st.victoryPoints);
  }

  console.log("\n-- a float victory-point value is one number, not two --");
  {
    // Vanilla writes `victory_points = { 3878 30.0 }`. Read with /-?\d+/g that is [3878, 30, 0], which
    // shifts every pair after it — the same misalignment by a different route.
    const block = `state = {
	id = 60
	name = "F"
	provinces = { 3878 3879 }
	history = {
		owner = GER
		victory_points = { 3878 30.0 }
		victory_points = { 3879 4 }
	}
}`;
    const mod = mk({ "history/states/60-F.txt": block + "\n" });
    const st = (md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).states || []).find((s) => s.id === 60);
    ok(st && st.victoryPoints.length === 2, "both victory points are read", st && st.victoryPoints);
    ok(st && st.victoryPoints.some((v) => v.province === 3879 && v.value === 4),
      "…and the pair after the float is still aligned", st && st.victoryPoints);
  }

  console.log("\n-- the model must not report disabled content as live --");
  {
    const body = `state = {
	id = 10
	name = "A"
	provinces = { 700 #7099
	}
	history = {
		owner = GER
		#victory_points = { 900 5 }
		victory_points = { 700 12 }
		buildings = {
			infrastructure = 4
			#arms_factory = 9
		}
	}
}
`;
    const mod = mk({ "history/states/10-A.txt": body });
    const model = md.buildMapModel({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] });
    const st = (model.states || []).find((s) => s.id === 10);
    ok(!!st, "the state parses");
    ok(st && st.victoryPoints.length === 1 && st.victoryPoints[0].province === 700,
      "only the live victory point is reported", st && st.victoryPoints);
    ok(st && st.buildings.infrastructure === 4 && st.buildings.arms_factory === undefined,
      "only the live building is reported", st && st.buildings);
    ok(st && st.provinces.length === 1 && st.provinces[0] === 700,
      "a commented-out province id is not one of the state's provinces", st && st.provinces);

    // CONTROL: uncomment them and every one must appear — otherwise this is asserting that the parser
    // simply stopped reading things.
    const live = body.replace(/#victory_points/, "victory_points").replace(/#arms_factory/, "arms_factory").replace(/#7099/, "7099");
    const mod2 = mk({ "history/states/10-A.txt": live });
    const st2 = (md.buildMapModel({ modRoot: mod2, gameRoot: NOGAME, dependencyRoots: [] }).states || []).find((s) => s.id === 10);
    ok(st2 && st2.victoryPoints.length === 2, "CONTROL: uncommented, both VPs are read", st2 && st2.victoryPoints);
    ok(st2 && st2.buildings.arms_factory === 9, "CONTROL: uncommented, the building is read", st2 && st2.buildings);
    ok(st2 && st2.provinces.length === 2, "CONTROL: uncommented, both provinces are read", st2 && st2.provinces);
  }

  console.log("\n-- renumbering must not rewrite a comment instead of the state --");
  {
    const body = `# was id = 7 before the merge
state = {
	id = 7
	name = "A"
	provinces = { 900 }
	history = {}
}
`;
    const mod = mk({ "history/states/7-A.txt": body });
    md.renumberStateId(mod, 7, 3, {});
    const files = fs.readdirSync(path.join(mod, "history", "states"));
    const after = fs.readFileSync(path.join(mod, "history", "states", files[0]), "utf8");
    const realId = (after.match(/(^|\n)\s*id\s*=\s*(\d+)/) || [])[2];
    ok(realId === "3", "the STATE's id is renumbered", { realId, file: files[0] });
    ok(/# was id = 7 before the merge/.test(after), "…and the comment is left alone");
    ok(files[0] === "3-A.txt", "…the file is renamed to match the id it now declares", files);
  }

  console.log("\n-- an owner goes into the real history block, not the commented-out one --");
  {
    const block = `state = {
	id = 10
	name = "A"
	provinces = { 700 }
	#history = {
	#	owner = FRA
	#}
	history = {
	}
}`;
    const out = md.setStateFieldsInBlock(block, { owner: "GER" });
    const lines = out.split("\n");
    const ownerLine = lines.findIndex((l) => /^\s*owner\s*=\s*GER/.test(l));
    const realHist = lines.findIndex((l) => /^\s*history\s*=\s*\{/.test(l) && !l.includes("#"));
    ok(ownerLine > realHist && realHist !== -1, "the owner is inserted inside the REAL history block", { ownerLine, realHist });
    ok(/#\s*owner = FRA/.test(out), "…the commented-out owner is untouched");
    ok(balance(out) === 0, "…and the block is still balanced", { balance: balance(out) });

    // And when the ONLY history block is commented out, there is no block to insert into: braceBody must
    // report none so the caller creates a real one. Reading raw text it answered "yes, there's a history
    // block", the insert then found nothing to insert after, and the owner was silently dropped.
    const onlyCommented = `state = {
	id = 11
	name = "B"
	provinces = { 700 }
	#history = {
	#	owner = FRA
	#}
}`;
    const out2 = md.setStateFieldsInBlock(onlyCommented, { owner: "GER" });
    ok(/(^|\n)\s*owner\s*=\s*GER/.test(out2), "an owner is still set when the only history block is commented out", out2);
    ok(balance(out2) === 0, "…and that block is balanced too", { balance: balance(out2) });
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
