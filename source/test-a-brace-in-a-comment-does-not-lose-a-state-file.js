// A brace inside a COMMENT does not make Nova lose a state file that HOI4 reads fine.
// #a-brace-in-a-comment-loses-a-state-file
//
// findStateFileConflicts asks two questions of every history/states file, and they disagreed about comments.
// It counts braces on a comment-STRIPPED copy — so state_file_unbalanced_braces rightly ignores them — and
// then asked allStateBlocksIn, on the RAW text, whether any state could be read at all. That reader walked
// braces byte by byte, so a `{` or `}` inside a comment opened or closed a block. Clausewitz drops comments
// before it parses anything, so every one of those braces is invisible to the game.
//
// Measured through GET /api/map/validate — the request public/map.js and public/modhealth-crashcheck.js
// send — on one mod holding one state file, three contents differing ONLY inside a comment:
//     vanilla's history/states/47-Greece.txt, untouched                     → no rule
//     the same file with ONE commented-out block's body and close deleted   → state_file_unreadable
//     the same file plus "# this state used to have victory_points = {"     → state_file_unreadable
// The message read "HOI4 will skip it, leaving its provinces unassigned" — false, and the kind of
// cry-wolf error CLAUDE.md exists to stop: any modder who writes a comment holding an unmatched brace got a
// red error on a file the game loads perfectly. Vanilla survives only because its own commented-out blocks
// are balanced, a commented opening AND a commented closing — and Nova's water cleanup broke one of those
// pairs itself (#a-caption-ate-a-commented-out-block, the other half of this pair).
//
// The masking must make commented text INVISIBLE, never parseable: a commented-out `state = { id = 9 }` is
// NOT a state, and closeStateIdGaps, fixDuplicateStateFiles and the id scanners all read through the same
// function. Sections 3 and 4 pin both directions, and section 5 re-reads every state file of every shipping
// map installed on this machine to prove the blocks — bytes and ids — did not move.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cmtbrace-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the fixture: vanilla 47-Greece.txt's own shape, five commented-out victory_points blocks and all ──────
// Kept verbatim from D:/SteamLibrary/.../history/states/47-Greece.txt so the file under test is one the game
// ships and loads. Section 5 reads the installed copy when there is one.
const GREECE = [
	"",
	"state={",
	"\tid=47",
	"\tname=\"STATE_47\" # Thessaly",
	"\tmanpower=2312500",
	"\tresources={",
	"\t\tsteel=3 # was: 4",
	"\t}",
	"",
	"\tstate_category = city",
	"",
	"\thistory={",
	"\t\towner = GRE",
	"\t\tvictory_points = {",
	"\t\t\t4109 20 ",
	"\t\t}",
	"\t\t#victory_points = {",
	"\t\t#\t863 1",
	"\t\t#}",
	"\t\t#victory_points = {",
	"\t\t#\t3864 3",
	"\t\t#}",
	"\t\t#victory_points = {",
	"\t\t#\t976 1",
	"\t\t#}",
	"\t\tbuildings = {",
	"\t\t\tinfrastructure = 2",
	"\t\t}",
	"\t\tadd_core_of = GRE",
	"\t}",
	"",
	"\tprovinces={",
	"\t\t863 976 1109 3864 3973 3988 4109 6930 7127 ",
	"\t}",
	"",
	"\tlocal_supplies=0.0 ",
	"}",
	"",
].join("\n");

/** the file with ONE commented-out block's body and close deleted — exactly what an Auto-fix click wrote */
const withDanglingComment = (text) => {
	const lines = text.split("\n");
	const at = lines.findIndex((l) => /^[ \t]*#[ \t]*victory_points/.test(l));
	if (at < 0) return null;
	lines.splice(at + 1, 2);
	return lines.join("\n");
};
/** the file plus one ordinary comment line that happens to carry an unmatched brace */
const withProseBrace = (text) => {
	const lines = text.split("\n");
	const at = lines.findIndex((l) => /^[ \t]*#[ \t]*victory_points/.test(l));
	if (at < 0) return null;
	lines.splice(at, 0, "\t\t# this state used to have victory_points = {");
	return lines.join("\n");
};

const mk = (MOD, rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let n = 0;
const buildMod = (files) => {
	const MOD = path.join(ROOT, "mod" + (++n));
	mk(MOD, "descriptor.mod", "name=\"mod" + n + "\"\nsupported_version=\"1.19.*\"\nreplace_path=\"history/states\"\n");
	for (const [f, t] of Object.entries(files)) mk(MOD, "history/states/" + f, t);
	return MOD;
};
const stateFileRules = (problems) => (problems || []).filter((p) => /^state_file/.test(p.rule || "")).map((p) => p.rule);

const server = createApp().listen(0, async () => {
	const PORT = server.address().port;
	// public/map.js:811 and public/modhealth-crashcheck.js:63 both send exactly this GET.
	const validate = (MOD) => fetch("http://127.0.0.1:" + PORT + "/api/map/validate?modPath=" + encodeURIComponent(MOD))
		.then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

	try {
		console.log("[control] the fixture is the shape the defect needs");
		{
			const lines = GREECE.split("\n");
			rec("it carries commented-out victory_points blocks", lines.filter((l) => /^[ \t]*#[ \t]*victory_points/.test(l)).length >= 3, lines.filter((l) => /^[ \t]*#/.test(l)).length);
			rec("…each balanced: as many commented `#}` as commented openings", lines.filter((l) => /^[ \t]*#[ \t]*\}[ \t]*$/.test(l)).length === lines.filter((l) => /^[ \t]*#[ \t]*victory_points/.test(l)).length, GREECE);
			rec("the three contents differ ONLY inside comments", (() => {
				const code = (t) => t.split("\n").map((l) => l.replace(/#.*$/, "")).filter((l) => l.trim()).join("\n");
				return code(GREECE) === code(withDanglingComment(GREECE)) && code(GREECE) === code(withProseBrace(GREECE));
			})(), null);
		}

		console.log("\n1. GET /api/map/validate — the same file, three contents differing only inside a comment");
		{
			const a = await validate(buildMod({ "47-Greece.txt": GREECE }));
			const b = await validate(buildMod({ "47-Greece.txt": withDanglingComment(GREECE) }));
			const c = await validate(buildMod({ "47-Greece.txt": withProseBrace(GREECE) }));
			rec("the endpoint answered all three", a.s === 200 && b.s === 200 && c.s === 200, [a.s, b.s, c.s]);
			rec("the untouched file raises no state_file rule", stateFileRules(a.b.problems).length === 0, stateFileRules(a.b.problems));
			rec("⭐⭐⭐ a commented-out block left dangling raises none either — HOI4 ignores comments", stateFileRules(b.b.problems).length === 0, (b.b.problems || []).filter((p) => /^state_file/.test(p.rule || "")));
			rec("⭐⭐⭐ nor does an ordinary comment carrying an unmatched `{`", stateFileRules(c.b.problems).length === 0, (c.b.problems || []).filter((p) => /^state_file/.test(p.rule || "")));
			rec("⭐⭐ all three agree, because the code in them is identical", JSON.stringify(stateFileRules(a.b.problems)) === JSON.stringify(stateFileRules(b.b.problems)) && JSON.stringify(stateFileRules(a.b.problems)) === JSON.stringify(stateFileRules(c.b.problems)), [stateFileRules(a.b.problems), stateFileRules(b.b.problems), stateFileRules(c.b.problems)]);
		}

		console.log("\n2. the rule's own search says the same (findStateFileConflicts)");
		{
			for (const [label, text] of [["untouched", GREECE], ["a commented block left dangling", withDanglingComment(GREECE)], ["an ordinary comment holding `{`", withProseBrace(GREECE)]]) {
				const got = M.findStateFileConflicts(buildMod({ "47-Greece.txt": text })).map((p) => p.rule);
				rec("…" + label + ": no problem", got.length === 0, got);
			}
		}

		console.log("\n3. the rule still fires on braces that are NOT commented out (it must not go quiet)");
		{
			const broken = GREECE.replace("\tprovinces={", "\tprovinces={ {");
			const got = M.findStateFileConflicts(buildMod({ "47-Greece.txt": broken })).map((p) => p.rule);
			rec("⭐⭐ a real extra `{` is still state_file_unbalanced_braces", got.includes("state_file_unbalanced_braces"), got);
			const early = "}\n" + GREECE;
			const got2 = M.findStateFileConflicts(buildMod({ "47-Greece.txt": early })).map((p) => p.rule);
			rec("⭐⭐ a real stray `}` is still reported", got2.includes("state_file_unbalanced_braces"), got2);
			const two = GREECE + GREECE;
			const got3 = M.findStateFileConflicts(buildMod({ "47-Greece.txt": two, "48-Also.txt": GREECE })).map((p) => p.rule);
			rec("⭐⭐ two files declaring id 47 are still duplicate_state_id — the reader still reads states", got3.includes("duplicate_state_id"), got3);
		}

		console.log("\n4. commented text is INVISIBLE, not parseable — a commented-out state is not a state");
		{
			// The whole state, commented out line by line, plus one real state with a different id.
			const disabled = GREECE.split("\n").map((l) => (l.trim() ? "#" + l : l)).join("\n");
			const real = GREECE.replace("\tid=47", "\tid=48").replace("STATE_47", "STATE_48");
			const MOD = buildMod({ "48-Real.txt": disabled + "\n" + real });
			const got = M.findStateFileConflicts(MOD).map((p) => p.rule);
			rec("⭐⭐⭐ a commented-out state alongside a real one raises nothing", got.length === 0, got);
			// closeStateIdGaps reads the same function: id 47 is commented out, so it is NOT taken as declared.
			const ids = [];
			for (const p of M.findStateFileConflicts(MOD)) if (p.stateId != null) ids.push(p.stateId);
			rec("…and no rule claims the commented id 47 exists", !ids.includes(47), ids);
			const solo = buildMod({ "47-Off.txt": disabled });
			const gotSolo = M.findStateFileConflicts(solo).map((p) => p.rule);
			rec("⭐⭐ a file whose only state is commented out is not called unreadable either", gotSolo.length === 0, gotSolo);
		}

		console.log("\n5. every state file of every shipping map installed here reads the same as before");
		{
			const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
			const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
			const MAPS = [["vanilla", VAN], ["Millennium Dawn", WS + "/2777392649"], ["Road to 56", WS + "/820260968"], ["Old World Blues", WS + "/2265420196"], ["Novum Vexillum", WS + "/1827273767"], ["Rise of Nations", WS + "/2026448968"]];
			let ran = 0, files = 0, states = 0, flagged = [];
			for (const [label, root] of MAPS) {
				const dir = path.join(root, "history", "states");
				if (!fs.existsSync(dir)) { skip(label + " is not installed"); continue; }
				ran++;
				let names = [];
				try { names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
				files += names.length;
				for (const p of M.findStateFileConflicts(root)) flagged.push(label + " " + p.rule + " " + (p.file || ""));
				// Every file the game ships must still yield its state, comments and all.
				for (const f of names) {
					let txt = "";
					try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
					if (/(^|[^A-Za-z0-9_])state\s*=\s*\{/.test(txt.replace(/#[^\n\r]*/g, ""))) states++;
				}
			}
			if (!ran) skip("no shipping map is installed — section 5 did NOT run");
			else {
				rec("read " + files + " state files across " + ran + " shipping maps", files > 1000, files);
				rec("⭐⭐⭐ not one of them is flagged state_file_unreadable", !flagged.some((x) => /state_file_unreadable/.test(x)), flagged.filter((x) => /state_file_unreadable/.test(x)).slice(0, 10));
				rec("…and " + states + " of them declare a state outside comments, which the reader must keep finding", states > 1000, states);
			}
		}

		console.log("\n6. the source says what it does");
		{
			const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
			const fn = /function allStateBlocksIn\(text\)[\s\S]*?\n\}/.exec(src);
			rec("allStateBlocksIn exists", !!fn, null);
			if (fn) {
				rec("⭐⭐ it walks a comment MASK, not the raw bytes", /maskComments\(/.test(fn[0]) && !/text\[i\]|text\.indexOf/.test(fn[0]), fn[0].slice(0, 400));
				rec("…and still slices the block out of the RAW text, so its comments survive", /\bs\.slice\(m\.index, end \+ 1\)/.test(fn[0]), fn[0].slice(-300));
			}
		}
	} catch (e) {
		rec("the test ran to the end", false, String((e && e.stack) || e));
	} finally {
		server.close();
		try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
		console.log("\n=== a brace in a comment does not lose a state file: " + checks + " checks, " + fails.length + " failed, " + skips + " skipped ===");
		if (fails.length) { for (const f of fails) console.log("  ✗ " + f); process.exitCode = 1; }
	}
});
