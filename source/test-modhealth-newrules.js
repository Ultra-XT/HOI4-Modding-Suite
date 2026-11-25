// Mod Health new validators:
//  • event_no_options    — a VISIBLE event with zero options (soft-lock); hidden events exempt.
//  • focus_self_reference — a focus that is its own prerequisite/mutex or relative_position_id.
const fs = require("fs"), os = require("os"), path = require("path");
const { buildModIndex } = require("./mod-index.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhrules-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MH Rules Test"\n', "utf8");

const evDir = path.join(mod, "events"); fs.mkdirSync(evDir, { recursive: true });
fs.writeFileSync(path.join(evDir, "test_events.txt"), `add_namespace = test
country_event = {
	id = test.1
	title = test.1.t
	desc = test.1.d
	is_triggered_only = yes
}
country_event = {
	id = test.2
	title = test.2.t
	desc = test.2.d
	is_triggered_only = yes
	option = { name = test.2.a }
}
country_event = {
	id = test.3
	title = test.3.t
	desc = test.3.d
	hidden = yes
	is_triggered_only = yes
}
country_event = {
	id = test.4
	desc = test.4.d
	is_triggered_only = yes
	option = { name = test.4.a }
}
country_event = {
	id = test.5
	Hidden = yes
	is_triggered_only = yes
}
country_event = {
	id = forgot_ns.1
	title = forgot_ns.1.t
	desc = forgot_ns.1.d
	is_triggered_only = yes
	option = { name = forgot_ns.1.a }
}
`, "utf8");

const nfDir = path.join(mod, "common", "national_focus"); fs.mkdirSync(nfDir, { recursive: true });
fs.writeFileSync(path.join(nfDir, "test_tree.txt"), `focus_tree = {
	id = test_tree
	country = { factor = 0 }
	focus = {
		id = focus_self_prereq
		icon = GFX_focus_generic
		x = 0 y = 0
		cost = 10
		prerequisite = { focus = focus_self_prereq }
	}
	focus = {
		id = focus_self_pos
		Icon = GFX_focus_generic
		relative_position_id = focus_self_pos
		x = 1 y = 1
		cost = 10
	}
	focus = {
		id = focus_ok
		icon = GFX_focus_generic
		x = 2 y = 0
		cost = 10
		prerequisite = { focus = focus_self_prereq }
	}
	focus = {
		id = focus_missing_icon
		x = 3 y = 0
		cost = 10
	}
}
`, "utf8");

// localisation: one file WITHOUT a BOM (broken in-game), one WITH a BOM (correct).
const locDir = path.join(mod, "localisation", "english"); fs.mkdirSync(locDir, { recursive: true });
fs.writeFileSync(path.join(locDir, "test_nobom_l_english.yml"), `l_english:\n my_key:0 "My Name"\n`, "utf8");
fs.writeFileSync(path.join(locDir, "test_withbom_l_english.yml"), `﻿l_english:\n my_key2:0 "My Other Name"\n`, "utf8");
// a BOM'd file with the SAME key twice (dup) plus a commented duplicate (must be ignored)
fs.writeFileSync(path.join(locDir, "test_dup_l_english.yml"), `﻿l_english:\n dup_key:0 "First"\n other_key:0 "Other"\n dup_key:1 "Second wins"\n #dup_key:0 "commented out, ignored"\n`, "utf8");

try {
  const idx = buildModIndex(mod, {});
  const probs = idx.problems || [];

  // loc_missing_bom
  const bom = probs.filter((p) => p.rule === "loc_missing_bom");
  ok(bom.some((p) => /test_nobom/.test(p.file)), "loc file without BOM flagged", bom.map((p) => p.file));
  ok(!bom.some((p) => /test_withbom/.test(p.file)), "loc file WITH BOM not flagged");

  // loc_duplicate_key
  const dupKey = probs.filter((p) => p.rule === "loc_duplicate_key");
  ok(dupKey.some((p) => p.entityId === "dup_key" && /test_dup/.test(p.file)), "same-file duplicate loc key flagged (dup_key)", dupKey.map((p) => p.entityId));
  ok(!dupKey.some((p) => p.entityId === "other_key"), "a key that appears once is NOT flagged (other_key)");
  ok(!dupKey.some((p) => p.entityId === "my_key2"), "a unique key in another file is NOT flagged");

  // event_no_options
  const noOpt = probs.filter((p) => p.rule === "event_no_options");
  ok(noOpt.some((p) => p.entityId === "test.1"), "visible event with zero options flagged (test.1)", noOpt.map((p) => p.entityId));
  ok(!noOpt.some((p) => p.entityId === "test.2"), "event WITH an option not flagged (test.2)");
  ok(!noOpt.some((p) => p.entityId === "test.3"), "hidden event with zero options not flagged (test.3)");
  ok(!noOpt.some((p) => p.entityId === "test.5"), "`Hidden = yes` (capital) event not flagged for no-options (case-insensitive)", noOpt.map((p) => p.entityId));

  // event_no_title + case-insensitive Hidden
  const noTitle = probs.filter((p) => p.rule === "event_no_title");
  ok(noTitle.some((p) => p.entityId === "test.4"), "visible event with no title flagged (test.4)", noTitle.map((p) => p.entityId));
  ok(!noTitle.some((p) => p.entityId === "test.2"), "event WITH a title not flagged (test.2)");
  ok(!noTitle.some((p) => p.entityId === "test.5"), "`Hidden = yes` (capital) event not flagged for no-title (case-insensitive fix)", noTitle.map((p) => p.entityId));

  // event_namespace_undeclared — an event whose namespace was never `add_namespace`-d
  const badNs = probs.filter((p) => p.rule === "event_namespace_undeclared");
  ok(badNs.some((p) => p.entityId === "forgot_ns.1"), "event in an undeclared namespace flagged (forgot_ns.1)", badNs.map((p) => p.entityId));
  ok(!badNs.some((p) => String(p.entityId).startsWith("test.")), "events in the declared `test` namespace NOT flagged", badNs.map((p) => p.entityId));

  // focus_self_reference
  const selfRef = probs.filter((p) => p.rule === "focus_self_reference");
  ok(selfRef.some((p) => p.entityId === "focus_self_prereq"), "self-prerequisite focus flagged", selfRef.map((p) => p.entityId));
  ok(selfRef.some((p) => p.entityId === "focus_self_pos"), "self relative_position_id focus flagged", selfRef.map((p) => p.entityId));
  ok(!selfRef.some((p) => p.entityId === "focus_ok"), "normal focus not flagged as self-reference");

  // focus_no_icon
  const noIcon = probs.filter((p) => p.rule === "focus_no_icon");
  ok(noIcon.some((p) => p.entityId === "focus_missing_icon"), "focus without an icon flagged", noIcon.map((p) => p.entityId));
  ok(!noIcon.some((p) => p.entityId === "focus_ok"), "focus WITH an icon not flagged");
  ok(!noIcon.some((p) => p.entityId === "focus_self_pos"), "focus with capital `Icon =` not flagged (case-insensitive)", noIcon.map((p) => p.entityId));

  console.log(`\n  ${pass} passed, ${fail} failed`);
} catch (e) { console.error(e); fail++; }
finally {
  process.exitCode = fail ? 1 : 0;
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
}
