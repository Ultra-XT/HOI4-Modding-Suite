// ⛔ #oob-merge-unpins-the-bom — ADDING A DIVISION TEMPLATE MOVED THE FILE'S UTF-8 BOM INTO THE MIDDLE OF IT,
// OR DELETED IT, ON 491 OF THE 2,528 BOM'D ORDER-OF-BATTLE FILES THE SIX INSTALLED MAPS SHIP.
//
// unit-data.js says of itself that "EVERY byte — inter-statement whitespace, comments, the leading BOM — is
// preserved: serializeUnitsFile(parseUnitsFile(x)) === x, by construction", and for a no-edit save that is
// true (verified below over every corpus file). The break is in the branch that ADDS a template:
//
//   • a NEW template is placed immediately before the top-level `units` block (#oob-template-after-units).
//     When `units` is the FIRST statement — the shape of every naval/air OOB file — that offset is 0, so the
//     generated block was spliced in AHEAD of the BOM.
//   • a file with no top-level statement at all (comment-only) is entirely `_trailing`, and `_trailing` is
//     appended AFTER the generated block, which lands the BOM in the body the same way.
//   • and `head.replace(/\s*$/, "")` DELETES a lone BOM, because JS `\s` matches U+FEFF. That is the same
//     property that makes `^\s*capital` immune to a BOM where `^[ \t]*capital` is not — it cuts both ways.
//
// ⚠️ PRESERVED IS NOT THE SAME AS UNCHANGED — CHECK POSITION, NOT JUST PRESENCE. A byte-count or multiset
// comparison passes every one of these 463 files: the BOM is still there, it is just no longer the first
// thing in the file, and there is now an invisible U+FEFF sitting between two top-level statements.
//
// ⭐ THE FIX ALREADY EXISTED NEXT DOOR, IN THE OTHER HALF OF THE SAME SAVE. The naval/air OOB endpoint hoists
// the BOM off before it calls into this module and puts it back on the write:
//     const bom = existing.charCodeAt(0) === 0xFEFF ? "\uFEFF" : "";
//     if (bom) existing = existing.slice(1);
//     … safeModWrite(filePath, bom + out, "naval/air OOB save");
// The LAND OOB endpoint, in the same server.js, calls mergeOob with the BOM still attached. One caller
// adopted it; the other never did — the dominant bug shape on this project, again.
//
// Fixed inside mergeOob rather than at that one caller, because the invariant is the module's own.
//
// 📊 Measured 2026-09-17, calling the real mergeOob over every history/units file of the six installed maps
// and adding one template — the ordinary "second save" path:
//
//     map              files   with a BOM   BOM no longer first   stray U+FEFF in the body
//     vanilla            609          605                   148                        146
//     Millennium Dawn    844            0                     0                          0
//     Road to 56         464          413                    91                         79
//     Old World Blues    846          841                    75                         69
//     Novum Vexillum     502          502                   133                        131
//     Rise of Nations   3064          167                    44                         38
//                                    ────                  ───                        ───
//                                    2528                  491                        463
//
// Millennium Dawn ships no BOM anywhere, which is the same reason the capital strip survived every test
// (#a-bom-keeps-a-capital-pointing-at-a-deleted-state): the mod most of this was developed against is the one
// map where a BOM bug cannot show.
"use strict";
const fs = require("fs");
const path = require("path");
const ud = require("./unit-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const BOM = "\uFEFF";
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
};

// The edit under test: ONE new template, the smallest thing the Army maker can add. Not typed into an
// expectation anywhere — only used as the payload.
const NEW_TPL = { name: "Nova Guard Template", regiments: [{ unit: "infantry", x: 0, y: 0 }] };

/** Add one template to a file's parsed model and merge, the way the land OOB save does. */
function saveWithOneNewTemplate(text) {
  const parsed = ud.parseUnitsFile(text);
  return ud.mergeOob(text, {
    templates: [...(parsed.templates || []), NEW_TPL],
    units: parsed.units,
    stockpiles: parsed.stockpiles,
  });
}

/** How many U+FEFFs a string opens with. Road to 56 ships three OOB files that open with TWO — an editor
 *  re-saved a file that already had one — so "the BOM" is a RUN, and a check that assumes exactly one both
 *  mis-reports those files and lets a writer quietly drop the second. Derived from the text, not assumed. */
function leadingBoms(s) {
  let i = 0;
  while (s.charCodeAt(i) === 0xfeff) i++;
  return i;
}

/** The two questions. A BOM is an encoding marker: it belongs at the front and nowhere else. */
function bomVerdict(input, output) {
  const had = leadingBoms(input);
  const kept = leadingBoms(output);
  return {
    had,
    stillFirst: had === 0 || kept === had,    // every one that was there, still at the front
    strayAt: output.indexOf(BOM, kept),       // -1 when clean
  };
}

// ══ 1. THE AT-RISK SHAPES ARE DERIVED FROM THE CORPUS, NOT TYPED ════════════════════════════════════════
// A file is at risk when it carries a BOM and its first top-level statement is `units` (so the insertion
// point is offset 0), or it has no top-level statement at all (so the whole file is the trailing gap).
// Both classifications come out of the module's OWN splitter, so they cannot drift from what it does.
console.log("\n=== 🈯 what the shipping maps actually ship ===");
const shapes = { unitsFirst: [], noStatement: [], templateFirst: [], noBom: [] };
let mapsSeen = 0;
let doubleBoms = 0;
{
  for (const [name, root] of Object.entries(CORPUS)) {
    const dir = path.join(root, "history", "units");
    if (!fs.existsSync(dir)) { console.log(`  ..   (${name} is not installed)`); continue; }
    mapsSeen++;
    let files = 0, bom = 0, uf = 0, ns = 0, dbl = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      if (!t) continue;
      files++;
      const hasBom = t.charCodeAt(0) === 0xfeff;
      if (hasBom) bom++;
      if (leadingBoms(t) > 1) { dbl++; doubleBoms++; }
      const firstKey = ((ud.splitTop(t) || []).find((s) => s && s.key) || {}).key || "";
      const bucket = !hasBom ? "noBom" : firstKey === "units" ? "unitsFirst" : firstKey === "" ? "noStatement" : "templateFirst";
      if (hasBom && bucket === "unitsFirst") uf++;
      if (hasBom && bucket === "noStatement") ns++;
      if (shapes[bucket].length < 400) shapes[bucket].push({ name, f, t });
    }
    console.log(`  ..   ${name}: ${files} OOB files · ${bom} start with a BOM · ${uf} put \`units\` FIRST behind it · ${ns} are comment-only behind it · ${dbl} carry TWO BOMs`);
  }
  if (!mapsSeen) console.log("  ..   (no map is installed — the fixtures below still carry the guard)");
  else ok(shapes.unitsFirst.length + shapes.noStatement.length > 0,
    "⭐⭐ the at-risk shape is not invented: shipping OOB files DO carry a BOM in front of these shapes",
    { unitsFirst: shapes.unitsFirst.length, noStatement: shapes.noStatement.length });
}

// ══ 2. THE GUARD — runs with or without the corpus ══════════════════════════════════════════════════════
// Fixtures are the real shapes, reduced. They are here so a back-out BITES even on a machine with no maps
// installed: a control that can only make a test SKIP is not a control.
console.log("\n=== ⛔ a save that adds a template must leave the BOM where it found it ===");
{
  const FIXTURES = {
    "units first (the naval/air OOB shape)": BOM + "\nunits= {\n\n\tfleet = {\n\t\tname = \"Armada\"\n\t}\n}",
    "comment-only (no top-level statement)": BOM + "### Empty ###\n# kept for a factory calculation\n",
    "template first (the ordinary land shape)": BOM + "division_template = {\n\tname = \"Line\"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n\nunits = {\n\tdivision = { name = \"1st\" location = 1 division_template = \"Line\" }\n}\n",
    "a lone BOM and nothing else": BOM,
    // Road to 56's NIR/WLL/WLS_motor_cavalry.txt, reduced: TWO BOMs, then `units` first. Both belong to the
    // front, and a writer that re-attaches "a BOM" rather than the ones it lifted loses the second.
    "a DOUBLE BOM (Road to 56 ships three)": BOM + BOM + "### OOB ###\nunits = {\n\tdivision= { name = \"1st\" location = 1 division_template = \"T\" }\n}",
  };
  for (const [label, text] of Object.entries(FIXTURES)) {
    const out = saveWithOneNewTemplate(text);
    const v = bomVerdict(text, out);
    ok(v.stillFirst === true, `⭐ ${label}: every BOM it had (${v.had}) is still at the front`, JSON.stringify(out.slice(0, 70)));
    ok(v.strayAt === -1, `…${label}: and no U+FEFF is left loose in the body`, v.strayAt === -1 ? -1 : JSON.stringify(out.slice(Math.max(0, v.strayAt - 30), v.strayAt + 30)));
    ok(out.includes("Nova Guard Template"), `…${label}: and the template the save asked for is actually there`, JSON.stringify(out.slice(0, 90)));
  }

  // A file with NO BOM must not acquire one.
  const plain = "units = {\n\tfleet = { name = \"A\" }\n}";
  const plainOut = saveWithOneNewTemplate(plain);
  ok(plainOut.indexOf(BOM) === -1, "a file that had no BOM is not given one", JSON.stringify(plainOut.slice(0, 40)));
}

// ══ 3. THE NO-EDIT ROUND TRIP IS STILL BYTE-PERFECT ════════════════════════════════════════════════════
// The module's stated contract, and the thing a BOM fix could plausibly break. Pinned so the fix cannot be
// "achieved" by normalising files that were fine.
console.log("\n=== 🈯 a no-edit save still changes nothing ===");
{
  const sample = [...shapes.unitsFirst, ...shapes.noStatement, ...shapes.templateFirst, ...shapes.noBom];
  let checked = 0, bad = [];
  for (const s of sample) {
    let back;
    try { back = ud.serializeUnitsFile(ud.parseUnitsFile(s.t)); } catch (e) { back = "THREW " + e.message; }
    checked++;
    if (back !== s.t) bad.push(`${s.name}/${s.f}`);
  }
  if (checked) ok(bad.length === 0, `⭐ every sampled shipping OOB file round-trips byte-for-byte (${checked} files)`, bad.slice(0, 5));
  const fixture = BOM + "division_template = {\n\tname = \"Line\"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n";
  ok(ud.serializeUnitsFile(ud.parseUnitsFile(fixture)) === fixture, "…and so does the fixture, with no corpus installed");

  // …and the same for a NO-EDIT MERGE, which is the stronger statement: serialize(parse(x)) never reaches the
  // splice branches, so it cannot see a BOM the merge moved. This is the assertion that caught the first cut
  // of this fix dropping one of Road to 56's two BOMs.
  const noEditBad = [];
  for (const s of sample) {
    let p; try { p = ud.parseUnitsFile(s.t); } catch (_) { continue; }
    let out;
    try { out = ud.mergeOob(s.t, { templates: p.templates || [], divisions: (p.units && p.units.divisions) || [] }); } catch (e) { noEditBad.push(`${s.name}/${s.f} THREW`); continue; }
    if (leadingBoms(out) !== leadingBoms(s.t)) noEditBad.push(`${s.name}/${s.f} ${leadingBoms(s.t)}->${leadingBoms(out)}`);
  }
  if (sample.length) ok(noEditBad.length === 0, "⭐⭐ a no-edit MERGE keeps exactly the BOMs the file had — including the doubled ones", noEditBad.slice(0, 5));
  const dbl = BOM + BOM + "units = {\n\tdivision= { name = \"1st\" location = 1 division_template = \"T\" }\n}";
  const dblOut = ud.mergeOob(dbl, { templates: [], divisions: [{ name: "1st", location: 1, template: "T" }] });
  ok(leadingBoms(dblOut) === 2, "…and the doubled-BOM fixture keeps BOTH, with no corpus installed", leadingBoms(dblOut));
}

// ══ 4. THE WHOLE CORPUS, THROUGH THE REAL MERGE ════════════════════════════════════════════════════════
// Derived: every installed OOB file, no list. A shipping map is ground truth — none of them may come back
// with its BOM moved.
console.log("\n=== ⛔ the corpus, driven through the real save ===");
if (!mapsSeen) console.log("  ..   (no map installed — sections 2 and 3 carry the guard)");
else {
  let n = 0, bom = 0, lost = [], stray = [];
  for (const [name, root] of Object.entries(CORPUS)) {
    const dir = path.join(root, "history", "units");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      if (!t) continue;
      n++;
      if (t.charCodeAt(0) !== 0xfeff) continue;
      bom++;
      let out; try { out = saveWithOneNewTemplate(t); } catch (e) { lost.push(`${name}/${f} THREW ${e.message}`); continue; }
      const v = bomVerdict(t, out);
      if (!v.stillFirst) lost.push(`${name}/${f}`);
      if (v.strayAt !== -1) stray.push(`${name}/${f}@${v.strayAt}`);
    }
  }
  console.log(`  ..   ${n} OOB files driven through the save, ${bom} of them with a BOM`);
  ok(lost.length === 0, `⭐⭐⭐ not one of the ${bom} BOM'd shipping OOB files loses the BOM from the front`, { count: lost.length, first: lost.slice(0, 6) });
  ok(stray.length === 0, `⭐⭐⭐ …and not one ends up with a U+FEFF loose in its body`, { count: stray.length, first: stray.slice(0, 6) });
}

// ══ 5. THE CLASS, NOT THE INSTANCE — derived from the module's own exports ═════════════════════════════
//
// The set of writers to check is taken from unit-data.js itself: every exported function whose FIRST
// parameter is named like whole-file text (read off Function.prototype.toString, so it cannot be typed in or
// go stale) and which returns a string. Add a text→text writer to this module and it joins this test without
// anyone remembering to add it.
//
// ⚠️ The tempting version of this guard — derive every ^-anchored regex in the source and assert each
// survives a BOM — was tried and thrown away. Tightly scoped to regexes applied to a variable assigned
// straight from readFileSync(…, "utf8"), it still flags 489 sites across server.js and map-data.js, almost
// all of them correct (the subject is a BLOCK sliced out of the file, or a token off a split, so its index 0
// is not the file's). A rule that fires hundreds of times on correct code is a bug in the rule. What is worth
// asserting is the BEHAVIOUR, so this runs the writers.
//
// The discriminator that decides which anchors are actually at risk, measured rather than assumed:
//   /^\s*x/  matches through a BOM (JS \s includes U+FEFF) — and through TWO
//   /\bx/    matches through a BOM (U+FEFF is not a word character)
//   /^[ \t]*x/ does NOT — this is the shape that hid the capital strip
// which is also why `.replace(/\s*$/, "")` DELETES a lone BOM: the same rule, running the other way.
console.log("\n=== 🈯 every text→text writer this module exports, derived from its exports ===");
{
  const firstParamOf = (fn) => {
    const m = /^[^(]*\(([^)]*)\)/.exec(Function.prototype.toString.call(fn));
    return m ? (m[1].split(",")[0] || "").trim().replace(/=.*$/, "").trim() : "";
  };
  const TEXTISH = /^(originalText|text|content|src|raw|rawText|body)$/i;
  const derived = Object.entries(ud)
    .filter(([, v]) => typeof v === "function")
    .map(([name, v]) => ({ name, p: firstParamOf(v) }))
    .filter((c) => TEXTISH.test(c.p));
  ok(derived.length > 0, "the module exports text-first functions to check", derived.map((d) => d.name));

  // The second argument each writer needs. Derived set, hand-shaped arguments: a writer with no entry here
  // is REPORTED, not skipped, so adding one to the module surfaces instead of silently passing.
  const ARGS = {
    mergeOob: (txt) => { const p = ud.parseUnitsFile(txt); return { templates: [...(p.templates || []), { name: "Probe", regiments: [{ unit: "infantry", x: 0, y: 0 }] }], divisions: (p.units && p.units.divisions) || [] }; },
    addNavalAirOob: () => ({ fleets: [{ name: "Probe Fleet", taskForces: [{ name: "TF", ships: [{ name: "S", definition: "destroyer", equipment: "destroyer_1", owner: "ARG" }] }] }], airWings: [] }),
  };
  // A writer is text→text when it hands back a string for a string. Anything else (a parser, an index) is
  // not in scope, and is counted so the split stays visible.
  const inScope = [], notText = [], unknown = [];
  for (const d of derived) {
    if (!ARGS[d.name]) {
      let r; try { r = ud[d.name]("units = {\n}\n"); } catch (_) { r = null; }
      (typeof r === "string" ? unknown : notText).push(d.name);
      continue;
    }
    inScope.push(d.name);
  }
  console.log(`  ..   text→text writers checked: ${inScope.join(", ") || "(none)"}`);
  console.log(`  ..   not text→text (parsers / indices), out of scope: ${notText.join(", ") || "(none)"}`);
  ok(unknown.length === 0,
    "every text-first export that RETURNS text is covered here — a new one must be given arguments, not ignored",
    unknown);

  const CASES = [
    ["a lone BOM", BOM],
    ["a BOM and a newline", BOM + "\n"],
    ["a double BOM", BOM + BOM],
    ["a BOM then `units` first", BOM + "units = {\n\tdivision= { name = \"1st\" location = 1 division_template = \"T\" }\n}"],
    ["no BOM at all", "units = {\n}"],
  ];
  for (const name of inScope) {
    for (const [label, txt] of CASES) {
      let out;
      try { out = ud[name](txt, ARGS[name](txt)); } catch (e) { out = null; }
      if (typeof out !== "string") { ok(false, `${name} / ${label}: returned text`, String(out)); continue; }
      ok(leadingBoms(out) === leadingBoms(txt), `⭐ ${name} / ${label}: the leading BOM run is unchanged (${leadingBoms(txt)})`, leadingBoms(out));
      ok(out.indexOf(BOM, leadingBoms(out)) === -1, `…${name} / ${label}: and none is left loose in the body`, JSON.stringify(out.slice(0, 60)));
    }
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
