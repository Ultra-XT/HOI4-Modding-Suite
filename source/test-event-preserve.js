// Regression for event round-trip data-loss: the Event Maker rebuilds an event from a fixed model, so
// any field it doesn't model — conditional `desc = { trigger=… text=… }` blocks, a `mean_time_to_happen`
// with a modifier, character portraits, modded keys — was SILENTLY DROPPED the moment a modder opened an
// existing event (e.g. Millennium Dawn) and re-saved it. extractPreservedEventBody must re-read the
// on-disk block and carry every un-modeled field forward verbatim. (MD survey: 592 conditional desc
// blocks, 16 files with mtth modifiers — all would have been lost.) NOTE: timeout_days + after are now
// MODELED (managed serializer, round-tripped by the client — see test-event-save-integration.js), so this
// test asserts they are NOT in the preserved set and instead ride the model in the simulated save.
"use strict";
const { splitTopLevelPdxStatements, reindentPdxStatement, extractPreservedEventBody } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const braces = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return -1; } } return d; };

// ── A realistic MD-style event using everything the maker does NOT model ──────────────────────────
const file = `add_namespace = test_md

country_event = {
	id = test_md.7
	title = test_md.7.t

	desc = {
		text = test_md.7.d_war
		trigger = { has_war = yes }
	}
	desc = {
		text = test_md.7.d_peace
		trigger = { has_war = no }
	}

	picture = GFX_report_event_generic_sit_table

	is_triggered_only = no
	fire_only_once = yes

	timeout_days = 30
	left_portrait = GER_some_leader
	right_portrait = SOV_some_leader

	mean_time_to_happen = {
		days = 50
		modifier = {
			factor = 0.5
			has_war = yes
		}
	}

	trigger = {
		tag = GER
	}

	immediate = {
		set_country_flag = test_md_7_fired
	}

	option = {
		name = test_md.7.a
		add_political_power = 100
		ai_chance = { factor = 1 }
	}
}
`;

// 1. Tokenizer splits the event body into depth-0 statements, blocks captured whole.
const body = file.slice(file.indexOf("{") , file.lastIndexOf("}")); // rough — use the real extractor below
const inner = file.substring(file.indexOf("country_event = {") + "country_event = {".length, file.lastIndexOf("}"));
const stmts = splitTopLevelPdxStatements(inner);
const keys = stmts.map(s => s.key);
check("tokenizer finds all top-level keys", ["id","title","desc","picture","is_triggered_only","fire_only_once","timeout_days","left_portrait","right_portrait","mean_time_to_happen","trigger","immediate","option"].every(k => keys.includes(k)), keys.join(","));
check("tokenizer captures TWO desc statements", keys.filter(k => k === "desc").length === 2, keys.filter(k=>k==="desc").length);
check("tokenizer captures mtth block whole (balanced)", braces(stmts.find(s => s.key === "mean_time_to_happen").text) === 0);
check("tokenizer does not over-capture (no key called 'modifier' at top level)", !keys.includes("modifier"));

// 2. extractPreservedEventBody carries forward the un-modeled fields.
const p = extractPreservedEventBody(file, "test_md.7");
check("found the event", p.found === true);
const pLineText = p.lines.join("\n");
check("timeout_days is MANAGED, not preserved (round-tripped by the client)", !/timeout_days/.test(pLineText), pLineText);
check("preserves left_portrait", /left_portrait\s*=\s*GER_some_leader/.test(pLineText));
check("preserves right_portrait", /right_portrait\s*=\s*SOV_some_leader/.test(pLineText));
check("flags rich mtth (has modifier)", p.hasRichMtth === true);
check("preserves the rich mtth verbatim (modifier kept)", /mean_time_to_happen/.test(pLineText) && /modifier/.test(pLineText) && /factor\s*=\s*0\.5/.test(pLineText));
check("preserved lines are brace-balanced", braces(pLineText) === 0, pLineText);

// 3. Conditional descs are preserved (both of them), NOT flattened to a single key.
check("captures both conditional descs", p.descStatements.length === 2, p.descStatements.length);
check("desc_war preserved with its trigger", p.descStatements.some(d => /test_md\.7\.d_war/.test(d) && /has_war\s*=\s*yes/.test(d)));
check("desc_peace preserved with its trigger", p.descStatements.some(d => /test_md\.7\.d_peace/.test(d) && /has_war\s*=\s*no/.test(d)));

// 4. Managed fields are NOT in preserved (the maker re-synthesises them): id/picture/is_triggered_only/
//    hidden/major/fire_only_once/trigger/immediate/option, and the simple days-only mtth case.
check("does not preserve managed id/picture/trigger/immediate/option", !/\bid\s*=/.test(pLineText) && !/\bpicture\s*=/.test(pLineText) && !/\btrigger\s*=/.test(pLineText) && !/\bimmediate\s*=/.test(pLineText) && !/\boption\s*=/.test(pLineText), pLineText);
check("does not preserve fire_only_once (modeled as a flag)", !/fire_only_once/.test(pLineText));

// 5. Simple days-only mtth is NOT treated as rich (so the maker's editable days value still drives it).
const simpleFile = `country_event = { id = s.1\n title = s.1.t\n desc = s.1.d\n is_triggered_only = no\n mean_time_to_happen = { days = 10 }\n option = { name = s.1.a } }`;
const ps = extractPreservedEventBody(simpleFile, "s.1");
check("simple days-only mtth NOT flagged rich", ps.hasRichMtth === false);
check("simple desc (key form) NOT preserved as block", ps.descStatements.length === 0);
check("simple event has nothing to preserve", ps.lines.length === 0, ps.lines.join("|"));

// 6. New event (id not on disk) → nothing found, no crash.
const pn = extractPreservedEventBody(file, "test_md.999");
check("absent event id → found=false, empty", pn.found === false && pn.lines.length === 0);

// 7. reindent keeps a block brace-balanced and re-tabs the first line.
const ri = reindentPdxStatement("mean_time_to_happen = {\n\t\t\tdays = 50\n\t\t\tmodifier = { factor = 0.5 }\n\t\t}", 1);
check("reindent stays brace-balanced", braces(ri) === 0, ri);
check("reindent first line at one tab", ri.startsWith("\tmean_time_to_happen = {"), JSON.stringify(ri.split("\n")[0]));

// 8. END-TO-END: simulate the save assembling the new block with preserved fields, assert no loss.
//    Mirrors the /api/events/save block builder.
function simulateSave(model, p) {
  const indent = (t) => String(t).split("\n").map(l => `\t\t${l}`).join("\n");
  let flags = "";
  if (model.fireOnce) flags += `\tfire_only_once = yes\n`;
  let trig = model.trigger ? `\ttrigger = {\n${indent(model.trigger)}\n\t}\n` : "";
  let mtth = (!p.hasRichMtth && model.mtthDays) ? `\tmean_time_to_happen = {\n\t\tdays = ${model.mtthDays}\n\t}\n` : "";
  let timeout = model.timeoutDays ? `\ttimeout_days = ${model.timeoutDays}\n` : "";
  let imm = model.immediate ? `\timmediate = {\n${indent(model.immediate)}\n\t}\n` : "";
  let pres = p.lines.length ? p.lines.map(l => reindentPdxStatement(l, 1)).join("\n") + "\n" : "";
  const titleLine = p.titleStatements.length ? p.titleStatements.map(l => reindentPdxStatement(l, 1)).join("\n") : `\ttitle = ${model.id}.t`;
  const descLine = p.descStatements.length ? p.descStatements.map(l => reindentPdxStatement(l, 1)).join("\n") : `\tdesc = ${model.id}.d`;
  let opts = `\toption = {\n\t\tname = ${model.id}.a\n\t\tadd_political_power = 100\n\t\tai_chance = { factor = 1 }\n\t}\n`;
  return `country_event = {\n\tid = ${model.id}\n${titleLine}\n${descLine}\n\tpicture = GFX_report_event_generic_sit_table\n\n\tis_triggered_only = no\n${flags}${trig}${mtth}${timeout}${imm}${pres}\n${opts}}`;
}
const rebuilt = simulateSave({ id: "test_md.7", fireOnce: true, mtthDays: 50, timeoutDays: 30, trigger: "tag = GER", immediate: "set_country_flag = test_md_7_fired" }, p);
check("rebuilt block is brace-balanced", braces(rebuilt) === 0, JSON.stringify(rebuilt));
check("rebuilt keeps timeout_days", /timeout_days\s*=\s*30/.test(rebuilt));
check("rebuilt keeps both conditional descs", /d_war/.test(rebuilt) && /d_peace/.test(rebuilt));
check("rebuilt keeps portraits", /left_portrait/.test(rebuilt) && /right_portrait/.test(rebuilt));
check("rebuilt keeps mtth modifier (exactly one mtth block)", /modifier/.test(rebuilt) && (rebuilt.match(/mean_time_to_happen/g) || []).length === 1);
check("rebuilt keeps modeled fire_only_once + trigger + immediate + option", /fire_only_once\s*=\s*yes/.test(rebuilt) && /tag\s*=\s*GER/.test(rebuilt) && /test_md_7_fired/.test(rebuilt) && /ai_chance/.test(rebuilt));

console.log(`\nEVENT-PRESERVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
