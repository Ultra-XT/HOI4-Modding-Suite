// Three ways an ordinary OOB edit destroyed content the user never touched.
//
// #oob-clean-division-drops-lead-comments — EDITING ONE DIVISION DELETED THE SECTION HEADERS ABOVE ALL
// THE OTHERS. The clean-division branch re-emitted `origEntry.raw`, which is the division statement alone,
// and dropped meta.leadComment — the whole-line comments above it. Those are how a modder groups an order of
// battle. Measured on real content: SOV_1939.txt went from 115 whole-line comments to 15, losing
// `####### Zapadnye TVD (Western Theatre Military District) (CO: Voroshilov) #######` and every Armiya/Korps
// header; GER_1939 48 -> 6; ITA_1939 86 -> 43. The response said ok and the brace and division counts were
// unchanged, so nothing signalled the loss.
//
// #oob-template-rename-loses-comments — RENAMING A TEMPLATE LOST THE COMMENTS ON EVERY DIVISION USING IT.
// `_divKey` includes d.template, so after a rename the key matched nothing in divRaw, origEntry came back
// null, and genDivision ran with no comment metadata — on divisions that took the dirty branch precisely so
// those comments could be restored.
//
// #oob-units-block-drops-unknown-statements — ANYTHING IN `units` THAT IS NOT A DIVISION, FLEET, NAVY OR
// AIR_WINGS WAS DELETED. The carry-forward listed the two shapes it knew about; a bare `ship = { … }` inside
// `units` and an `instant_effect` block both went to zero when an unrelated division was edited.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const U = require("./unit-data.js");

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

const ORIGINAL = `##########################
# Nova Union Order of Battle
##########################

division_template = {
\tname = "Infantry Division"
\tregiments = {
\t\tinfantry = { x = 0 y = 0 }
\t}
}

division_template = {
\tname = "Armoured Division"
\tregiments = {
\t\tlight_armor = { x = 0 y = 0 }
\t}
}

units = {
\t####### I Corps (CO: Vellan) #######
\tdivision = {
\t\tname = "1st Infantry Division"
\t\tlocation = 11073 # Reykjavik
\t\tdivision_template = "Infantry Division"
\t\tstart_experience_factor = 0.3
\t}

\t####### II Corps (CO: Harbour Command) #######
\tdivision = {
\t\tname = "2nd Infantry Division"
\t\tlocation = 12674 # Northern Ports
\t\tdivision_template = "Infantry Division"
\t\tstart_experience_factor = 0.1
\t}

\t# a bare ship written straight inside units
\tship = { name = "NUS Vellan" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = NUA } } }

\tair_wings = {
\t\t11073 = { fighter_equipment_0 = { owner = "NUA" amount = 24 } }
\t}
}

instant_effect = {
\tadd_equipment_to_stockpile = { type = infantry_equipment_1 amount = 1000 producer = NUA }
}
`;

const countComments = (t) => (String(t).match(/(^|\n)[ \t]*#/g) || []).length;
const has = (t, re) => re.test(String(t));

console.log("\n[control] the parser sees the file the way the test assumes");
const parsed = U.parseUnitsFile(ORIGINAL);
rec("the file round-trips byte-identically as loaded",
  U.serializeUnitsFile(parsed) === ORIGINAL, "round trip differs");
rec("…with two divisions", parsed.units && parsed.units.divisions.length === 2, parsed.units && parsed.units.divisions.length);
rec("…and the original whole-line comment count is what we will compare against", countComments(ORIGINAL) === 6, countComments(ORIGINAL));

console.log("\n[the bug] editing ONE division must not touch the others' headers");
{
  // Mark only the FIRST division dirty — the second is clean and must be re-emitted with its header.
  const edited = {
    templates: parsed.templates,
    divisions: parsed.units.divisions.map((d, i) =>
      Object.assign({}, d, i === 0 ? { _dirty: true, startExperienceFactor: 0.5 } : {})),
  };
  const out = U.mergeOob(ORIGINAL, edited);
  rec("the merge produced a file", typeof out === "string" && out.length > 0, typeof out);
  rec("the untouched division kept its section header", has(out, /####### II Corps \(CO: Harbour Command\) #######/), out);
  rec("…and the edited one kept its own too", has(out, /####### I Corps \(CO: Vellan\) #######/), out);
  rec("…and the file banner survived", has(out, /# Nova Union Order of Battle/), out);
  rec("…and the province place-names survived", has(out, /# Reykjavik/) && has(out, /# Northern Ports/), out);
  rec("no comments were lost at all", countComments(out) >= countComments(ORIGINAL),
    { before: countComments(ORIGINAL), after: countComments(out) });
  rec("…and both divisions are still there",
    (out.match(/division\s*=\s*\{/g) || []).length === 2, out);

  console.log("\n[the bug] a statement inside `units` that Nova does not model must survive");
  rec("the bare ship survived", has(out, /name = "NUS Vellan"/), out);
  rec("…and it is still inside the units block",
    /units\s*=\s*\{[\s\S]*NUS Vellan[\s\S]*?\n\}/.test(out), out);
  rec("the air_wings block survived", has(out, /air_wings\s*=\s*\{/), out);
  rec("…and no statement was duplicated",
    (out.match(/air_wings\s*=\s*\{/g) || []).length === 1 &&
    (out.match(/name = "NUS Vellan"/g) || []).length === 1, out);
  rec("the top-level instant_effect survived", has(out, /instant_effect\s*=\s*\{/), out);

  let d = 0, ok = true;
  for (const ch of out) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
  rec("the file is brace-balanced", ok && d === 0, d);
}

console.log("\n[the bug] renaming a template must not lose the comments on its divisions");
{
  // ⚠️ THE CLIENT DOES NOT SEND THE COMMENTS. That is the whole reason mergeOob recovers them from the
  // original file, and a fixture that passes the parsed divisions straight through — comment fields and all
  // — cannot reproduce this: genDivision just reads them off the object and the fix looks unnecessary.
  // My first version did exactly that and its control refused to fire. Strip them, as the editor does.
  const asClientSends = (d) => {
    const c = Object.assign({}, d);
    delete c.leadComment; delete c.locationComment; delete c.locationCommentFor; delete c._raw;
    return c;
  };
  const edited = {
    templates: parsed.templates.map((t, i) =>
      i === 0 ? Object.assign({}, t, { name: "Line Infantry Division", _dirty: true }) : t),
    // every division using it follows the rename, and is therefore dirty
    divisions: parsed.units.divisions.map((d) =>
      d.template === "Infantry Division"
        ? Object.assign(asClientSends(d), { template: "Line Infantry Division", _dirty: true })
        : asClientSends(d)),
  };
  const out = U.mergeOob(ORIGINAL, edited);
  rec("the rename produced a file", typeof out === "string" && out.length > 0, typeof out);
  rec("the template was renamed", has(out, /name = "Line Infantry Division"/), out);
  rec("…the divisions point at the new name",
    (out.match(/division_template = "Line Infantry Division"/g) || []).length === 2, out);
  rec("…and their section headers survived the rename",
    has(out, /####### I Corps \(CO: Vellan\) #######/) &&
    has(out, /####### II Corps \(CO: Harbour Command\) #######/), out);
  rec("…and so did the province place-names",
    has(out, /# Reykjavik/) && has(out, /# Northern Ports/), out);
}

console.log("\n[#oob-location-zero] a division with no usable province must not be written at province 0");
{
  // clampInt(null, 0, …) is Math.floor(Number(null)) = 0 — finite, so the old guard passed and the division
  // was written as `location = 0`. Province 0 does not exist, so it never spawns: a silent nothing, and a
  // claim about the file that is false.
  const withNoLoc = U.genDivision({ name: "1st Ghost Division", template: "Infantry Division" });
  rec("no location line is emitted at all", !/location\s*=/.test(withNoLoc), withNoLoc);
  rec("…and certainly not province 0", !/location\s*=\s*0\b/.test(withNoLoc), withNoLoc);
  const withLoc = U.genDivision({ name: "2nd Real Division", template: "Infantry Division", location: 11073 });
  rec("a real province is still written", /location\s*=\s*11073/.test(withLoc), withLoc);
  // A source file can legitimately produce a location-less division: real Millennium Dawn data has
  // `name_order = 1 #Change in 2016 }` where the `}` is inside a comment, so division_name swallows the
  // location line — HOI4 reads it the same way. That file must still be saveable, which is why this omits
  // rather than refuses.
  const MDSHAPE = 'units = {\n\tdivision = {\n\t\tdivision_name = { is_name_ordered = yes\n\t\t\tname_order = 1 #Change in 2016 }\n\t\tlocation = 3 division_template = "X"\n\t}\n}\n';
  const parsedMd = U.parseUnitsFile(MDSHAPE);
  rec("the MD comment shape really does lose its location", parsedMd.units.divisions[0].location == null,
    parsedMd.units.divisions[0].location);
  const merged = U.mergeOob(MDSHAPE, {
    templates: [],
    divisions: [Object.assign({}, parsedMd.units.divisions[0], { _dirty: true, experience: 0.4 })],
  });
  rec("…and it still saves rather than being refused", typeof merged === "string" && merged.length > 0, typeof merged);
  rec("…without inventing province 0", !/location\s*=\s*0\b/.test(merged), merged);
}

console.log(`\n=== oob comment preservation: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
