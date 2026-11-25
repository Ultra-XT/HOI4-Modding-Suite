// Army Maker OOB edit layer: unit-data.mergeOob (create / preserve-merge / edit / remove) + the
// /api/army + /api/army/save endpoints (writes history/units, wires oob= into country history,
// preserves naval/stockpile blocks it doesn't manage). Run: node test-army-oob.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const unit = require("./unit-data.js");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.match(/{/g) || []).length === (s.match(/}/g) || []).length;

(async () => {
  console.log("=== unit-data.mergeOob ===");

  // 1. Create from scratch (new country, empty original)
  const created = unit.mergeOob("", {
    templates: [{ name: "Inf Division", regiments: [{ unit: "infantry", x: 0, y: 0 }, { unit: "infantry", x: 0, y: 1 }], support: [{ unit: "engineer", x: 0, y: 0 }], priority: 2, _dirty: true }],
    divisions: [{ name: "1. Infantry Division", location: 100, template: "Inf Division", _dirty: true }],
  });
  ok("created OOB is brace-balanced", balanced(created), created);
  const cm = unit.parseUnitsFile(created);
  ok("created has 1 template named 'Inf Division'", cm.templates.length === 1 && cm.templates[0].name === "Inf Division", cm.templates);
  ok("created template kept 2 regiments + 1 support + priority", cm.templates[0].regiments.length === 2 && cm.templates[0].support.length === 1 && cm.templates[0].priority === 2, cm.templates[0]);
  ok("created has 1 division at loc 100 of that template", cm.units.divisions.length === 1 && cm.units.divisions[0].location === 100 && cm.units.divisions[0].template === "Inf Division", cm.units.divisions);

  // 2. Preserve-merge: an original with a template, a division, a fleet, and stockpile — edit NOTHING.
  const original = [
    'division_template = {',
    '\tname = "Guards"',
    '\tregiments = { infantry = { x = 0 y = 0 } }',
    '\ttemplate_counter = 44',            // an UN-MODELED field — must survive
    '}',
    'units = {',
    '\tdivision = {',
    '\t\tname = "1. Guards"',
    '\t\tlocation = 5',
    '\t\tdivision_template = "Guards"',
    '\t\tstart_experience_factor = 0.3',  // UN-MODELED on the division — must survive',
    '\t}',
    '\tfleet = {',
    '\t\tname = "Home Fleet"',
    '\t\tnaval_base = 3',
    '\t}',
    '}',
    'instant_effect = {',
    '\tadd_equipment_to_stockpile = { type = infantry_equipment_0 amount = 500 }',
    '}',
    '',
  ].join("\n");
  const om = unit.parseUnitsFile(original);
  const merged = unit.mergeOob(original, {
    templates: om.templates.map((t) => ({ ...t, _dirty: false })),
    divisions: om.units.divisions.map((d) => ({ ...d, _dirty: false })),
  });
  ok("preserve merge is brace-balanced", balanced(merged), merged);
  ok("preserved template's un-modeled template_counter survived", /template_counter\s*=\s*44/.test(merged), merged);
  ok("preserved division's un-modeled start_experience_factor survived", /start_experience_factor\s*=\s*0\.3/.test(merged), merged);
  ok("preserved naval fleet survived", /fleet\s*=\s*{[\s\S]*Home Fleet/.test(merged), merged);
  ok("preserved instant_effect stockpile survived", /add_equipment_to_stockpile\s*=\s*{[\s\S]*infantry_equipment_0/.test(merged), merged);
  const mm = unit.parseUnitsFile(merged);
  ok("re-parse: same 1 template, 1 division, 1 navy, 1 stockpile", mm.templates.length === 1 && mm.units.divisions.length === 1 && mm.units.navy.length === 1 && mm.stockpiles.length === 1, unit.summarizeUnitsFile(merged));

  // 2b. start_experience_factor is now a MODELED field (deploy card "Experience %"): parsed into .experience
  // and re-emitted when a division is created/dirty — not merely preserved as raw text.
  ok("parse: division's start_experience_factor read into .experience", om.units.divisions[0].experience === 0.3, om.units.divisions[0]);
  const withXp = unit.mergeOob("", {
    templates: [{ name: "V", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }],
    divisions: [{ name: "1. V", location: 7, template: "V", experience: 0.45, equipmentFactor: 0.5, _dirty: true }],
  });
  ok("create: dirty division with experience 0.45 emits start_experience_factor = 0.45", /start_experience_factor\s*=\s*0\.45/.test(withXp), withXp);
  ok("create: emits start_equipment_factor = 0.5 alongside it", /start_equipment_factor\s*=\s*0\.5/.test(withXp), withXp);
  ok("round-trip: re-parsed division has experience 0.45", unit.parseUnitsFile(withXp).units.divisions[0].experience === 0.45, unit.parseUnitsFile(withXp).units.divisions[0]);
  ok("no-experience division omits start_experience_factor entirely", !/start_experience_factor/.test(created), created);

  // 3. Edit a template (dirty, change priority) → regenerated with the new value. template_counter is a MODELED
  // field: a client that still CARRIES it keeps it (via emission); a client that CLEARED it must NOT resurrect it.
  // #template-metadata
  const edited = unit.mergeOob(original, {
    templates: [{ name: "Guards", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], priority: 9, template_counter: 44, _dirty: true }],
    divisions: om.units.divisions.map((d) => ({ ...d, _dirty: false })),
  });
  ok("edited template regenerated with new priority = 9", /priority\s*=\s*9/.test(edited), edited);
  ok("edited template keeps template_counter = 44 the client still carries (single, no data-loss)", /template_counter\s*=\s*44/.test(edited) && (edited.match(/template_counter/g) || []).length === 1, edited);
  ok("edited template stays brace-balanced", balanced(edited), edited);
  // round-2 regression: CLEARING a modeled scalar (client omits template_counter) must DROP it, not resurrect it.
  const clearedTpl = unit.mergeOob(original, {
    templates: [{ name: "Guards", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], priority: 9, _dirty: true }],
    divisions: om.units.divisions.map((d) => ({ ...d, _dirty: false })),
  });
  ok("cleared template_counter is DROPPED (not re-added from the old block)", !/template_counter/.test(clearedTpl) && balanced(clearedTpl), clearedTpl);

  // 3b. The modeled metadata (template_counter / is_locked / override_model / division_names_group) round-trips.
  const metaOrig = 'division_template = {\n\tname = "Meta"\n\tregiments = { infantry = { x = 0 y = 0 } }\n\ttemplate_counter = 12\n\tis_locked = yes\n\toverride_model = SOV_tank\n\tsome_exotic_key = 7\n}\n';
  const mo = unit.parseUnitsFile(metaOrig);
  ok("parse: template_counter/is_locked/override_model modeled", mo.templates[0].template_counter === 12 && mo.templates[0].is_locked === "yes" && mo.templates[0].override_model === "SOV_tank", mo.templates[0]);
  const metaEdited = unit.mergeOob(metaOrig, { templates: [{ ...mo.templates[0], template_counter: 33, _dirty: true }], divisions: [] });
  ok("edit: template_counter updated to 33 (modeled edit wins)", /template_counter\s*=\s*33/.test(metaEdited) && !/template_counter\s*=\s*12/.test(metaEdited), metaEdited);
  ok("edit: is_locked = yes re-emitted", /is_locked\s*=\s*yes/.test(metaEdited), metaEdited);
  ok("edit: override_model = SOV_tank re-emitted", /override_model\s*=\s*SOV_tank/.test(metaEdited), metaEdited);
  ok("edit: un-modeled some_exotic_key = 7 preserved", /some_exotic_key\s*=\s*7/.test(metaEdited), metaEdited);
  ok("edit: no key duplicated (single template_counter/is_locked)", (metaEdited.match(/template_counter/g) || []).length === 1 && (metaEdited.match(/is_locked/g) || []).length === 1, metaEdited);

  // 4. Remove the division → gone, but naval + stockpile still preserved
  const removed = unit.mergeOob(original, { templates: om.templates.map((t) => ({ ...t, _dirty: false })), divisions: [] });
  const rm = unit.parseUnitsFile(removed);
  ok("removed division: 0 divisions, navy + stockpile intact", rm.units.divisions.length === 0 && rm.units.navy.length === 1 && rm.stockpiles.length === 1, unit.summarizeUnitsFile(removed));

  // 5. Fully-empty land model on a stockpile-only file → valid, stockpile kept, NO phantom empty units block.
  const stockOnly = 'instant_effect = {\n\tadd_equipment_to_stockpile = { type = infantry_equipment_0 amount = 100 }\n}\n';
  const emptied = unit.mergeOob(stockOnly, { templates: [], divisions: [] });
  ok("empty model keeps stockpile + emits no phantom units block", balanced(emptied) && /add_equipment_to_stockpile/.test(emptied) && !/units\s*=\s*{/.test(emptied), emptied);

  // 6. Top-level comments + layout survive an edit (the preserve-verbatim contract).
  const commented = [
    "# 1936 starting OOB for GER", "",
    'division_template = {', '\tname = "Infantry"', "\tregiments = { infantry = { x = 0 y = 0 } }", "}", "",
    "# --- deployed divisions ---",
    "units = {", '\tdivision = { name = "1. Inf" location = 5 division_template = "Infantry" }', "}", "",
  ].join("\n");
  const cmModel = unit.parseUnitsFile(commented);
  const cmMerged = unit.mergeOob(commented, {
    templates: [{ name: "Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], priority: 3, _dirty: true }],
    divisions: cmModel.units.divisions.map((d) => ({ ...d, _dirty: false })),
  });
  ok("top-level header comment survives an edit", /# 1936 starting OOB for GER/.test(cmMerged), cmMerged);
  ok("inter-block separator comment survives an edit", /# --- deployed divisions ---/.test(cmMerged), cmMerged);
  ok("the edited template got its new priority", /priority = 3/.test(cmMerged), cmMerged);
  ok("untouched division preserved + still parses", unit.parseUnitsFile(cmMerged).units.divisions.length === 1, cmMerged);

  // 7. An unchanged model reproduces the file (byte-identical up to a possible trailing newline).
  const roundtrip = unit.mergeOob(commented, {
    templates: cmModel.templates.map((t) => ({ ...t, _dirty: false })),
    divisions: cmModel.units.divisions.map((d) => ({ ...d, _dirty: false })),
  });
  ok("unchanged model round-trips byte-for-byte (mod trailing newline)", roundtrip.replace(/\n+$/, "") === commented.replace(/\n+$/, ""), { got: roundtrip, want: commented });

  // 8. officer (native per-division commander) + start_equipment_factor round-trip through gen+parse.
  const withCmd = unit.mergeOob("", {
    templates: [{ name: "Guards", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }],
    divisions: [{ name: "1. Guards", location: 42, template: "Guards", officer: "Erwin Rommel", equipmentFactor: 0.5, _dirty: true }],
  });
  ok("division emits officer = { name = \"…\" }", /officer\s*=\s*{\s*name\s*=\s*"Erwin Rommel"\s*}/.test(withCmd), withCmd);
  ok("division emits start_equipment_factor", /start_equipment_factor\s*=\s*0\.5/.test(withCmd), withCmd);
  ok("officer OOB is brace-balanced", balanced(withCmd), withCmd);
  const wcm = unit.parseUnitsFile(withCmd);
  ok("parse reads the officer name back", wcm.units.divisions[0].officer === "Erwin Rommel", wcm.units.divisions[0]);
  ok("parse reads start_equipment_factor back (0.5)", wcm.units.divisions[0].equipmentFactor === 0.5, wcm.units.divisions[0]);
  // equipmentFactor is clamped to 0–1 (a stray 250% can't poison the OOB).
  const clamp = unit.mergeOob("", { templates: [], divisions: [{ name: "x", location: 1, template: "T", equipmentFactor: 2.5, _dirty: true }] });
  ok("start_equipment_factor clamped to ≤ 1", /start_equipment_factor\s*=\s*1\b/.test(clamp) && !/2\.5/.test(clamp), clamp);
  // A preserved (non-dirty) division with a hand-added officer keeps it verbatim.
  const handOfficer = [
    'units = {', '\tdivision = {', '\t\tname = "9. Pz"', '\t\tlocation = 5', '\t\tdivision_template = "Panzer"',
    '\t\tofficer = { name = "Heinz Guderian" }', '\t\tforce_equipment_variants = { panzer_iv = { owner = "GER" } }', '\t}', '}', '',
  ].join("\n");
  const hm = unit.parseUnitsFile(handOfficer);
  const keptOfficer = unit.mergeOob(handOfficer, { templates: [], divisions: hm.units.divisions.map((d) => ({ ...d, _dirty: false })) });
  ok("preserved division keeps its officer + force_equipment_variants verbatim", /Heinz Guderian/.test(keptOfficer) && /force_equipment_variants/.test(keptOfficer), keptOfficer);

  // ── parseSubUnitsFile — the division-designer battalion/company palette ──
  console.log("\n=== unit-data.parseSubUnitsFile ===");
  const suText = [
    "sub_units = {",
    "\tinfantry = {", "\t\tgroup = infantry", "\t\ttype = { infantry }", "\t\tcombat_width = 2", "\t\tmax_strength = 25", "\t\tneed = { infantry_equipment = 100 }", "\t}",
    "\tengineer = {", "\t\tgroup = support", "\t\ttype = { infantry support }", "\t\tcombat_width = 0", "\t\tneed = { infantry_equipment = 50 support_equipment = 10 }", "\t}",
    "}", "",
  ].join("\n");
  const suList = unit.parseSubUnitsFile(suText);
  ok("parses 2 sub-units", suList.length === 2, suList.map((s) => s.key));
  const suInf = suList.find((s) => s.key === "infantry"), suEng = suList.find((s) => s.key === "engineer");
  ok("infantry: line unit, combat_width 2, needs infantry_equipment 100", !!suInf && !suInf.isSupport && suInf.combat_width === 2 && suInf.need.infantry_equipment === 100, suInf);
  ok("engineer: support unit (group support) with two equipment needs", !!suEng && suEng.isSupport && suEng.group === "support" && suEng.need.support_equipment === 10, suEng);
  ok("a file with no sub_units block → empty list", unit.parseSubUnitsFile('division_template = { name = "X" }').length === 0);

  // ── Endpoints ──────────────────────────────────────────────────────────────────────────────────
  console.log("\n=== /api/army + /api/army/save ===");
  const PORT = 3931, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-army-"));
  // replace_path="history/states": the /api/state-province section below gives this mod states 77 and 88 in 77-Nova.txt and
  // 88-Nova.txt. Without it the installed game's 77-Dobrogea.txt and 88-Kielce.txt load beside them and, sorting first, are the states
  // HOI4 keeps and the lookup answers with (#the-state-the-game-keeps). That section is about resolving a state to a province, and
  // /api/army/save reads no state, so nothing else here depends on the base game's states.
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Army Test"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  // A country history WITHOUT an oob line — save must auto-wire one.
  fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "capital = 1\n\n1936.1.1 = {\n}\n");

  try {
    const save = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, tag: "TST",
        templates: [{ name: "Line Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], priority: 1, _dirty: true }],
        divisions: [{ name: "1. Line", location: 42, template: "Line Infantry", _dirty: true }, { name: "2. Line", location: 43, template: "Line Infantry", _dirty: true }],
      }),
    }).then((r) => r.json());
    ok("save ok", save && save.ok === true, save);
    ok("save wrote history/units/TST_nova.txt", fs.existsSync(path.join(mod, "history", "units", "TST_nova.txt")));
    ok("save auto-wired oob into country history", /oob\s*=\s*"TST_nova"/.test(fs.readFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "utf8")));
    ok("save reports oobWired + 2 divisions", save.oobWired === true && save.divisions === 2, save);

    const got = await fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
    ok("GET reads back the saved file", got && got.ok === true && got.file === "TST_nova.txt", got);
    ok("GET returns 1 template + 2 divisions", got.templates.length === 1 && got.divisions.length === 2, { t: got.templates, d: got.divisions });
    ok("GET division locations round-tripped (42,43)", got.divisions.map((d) => d.location).sort().join(",") === "42,43", got.divisions);

    // Deploy a division WITH a commander + equipment readiness through the save endpoint.
    const cmdSave = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "TST", file: "TST_nova.txt",
        templates: got.templates.map((t) => ({ ...t, _dirty: false })),
        divisions: [{ name: "1. Line", location: 42, template: "Line Infantry", officer: "Erwin Rommel", equipmentFactor: 0.3, _dirty: true }] }),
    }).then((r) => r.json());
    ok("save with officer ok", cmdSave && cmdSave.ok === true, cmdSave);
    const cmdText = fs.readFileSync(path.join(mod, "history", "units", "TST_nova.txt"), "utf8");
    ok("saved OOB carries officer + start_equipment_factor", /officer\s*=\s*{\s*name\s*=\s*"Erwin Rommel"\s*}/.test(cmdText) && /start_equipment_factor\s*=\s*0\.3/.test(cmdText), cmdText);
    const gotCmd = await fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
    ok("GET reads the officer back", gotCmd.divisions[0] && gotCmd.divisions[0].officer === "Erwin Rommel", gotCmd.divisions[0]);

    // Save again editing land only — a manually-added fleet in the file must survive.
    const p = path.join(mod, "history", "units", "TST_nova.txt");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/units = {/, 'units = {\n\tfleet = { name = "Test Fleet" naval_base = 7 }'));
    const save2 = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "TST", file: "TST_nova.txt",
        templates: got.templates.map((t) => ({ ...t, _dirty: false })),
        divisions: [{ name: "1. Line", location: 42, template: "Line Infantry", _dirty: true }] }),
    }).then((r) => r.json());
    ok("second save ok", save2 && save2.ok === true, save2);
    ok("manually-added fleet survived a land-only save", /Test Fleet/.test(fs.readFileSync(p, "utf8")));
    ok("no duplicate oob line after re-save", (fs.readFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "utf8").match(/\boob\s*=/g) || []).length === 1);

    // Reject a traversal filename.
    const bad = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "TST", file: "../evil", templates: [], divisions: [] }),
    });
    ok("rejects a path-traversal OOB filename (400)", bad.status === 400);
    ok("no evil file escaped the units dir", !fs.existsSync(path.join(mod, "history", "evil.txt")) && !fs.existsSync(path.join(mod, "history", "units", "..", "evil.txt")));

    // A numeric-first (invalid HOI4) tag is rejected before anything is written — no orphaned OOB file.
    const numTag = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "123", templates: [], divisions: [] }),
    });
    ok("rejects a numeric-first tag (400)", numTag.status === 400);
    ok("no orphaned 123_nova.txt written", !fs.existsSync(path.join(mod, "history", "units", "123_nova.txt")));

    // /api/subunits — the designer palette scans the mod's common/units/*.txt sub_units.
    fs.mkdirSync(path.join(mod, "common", "units"), { recursive: true });
    fs.writeFileSync(path.join(mod, "common", "units", "custom.txt"),
      'sub_units = {\n\tNova_Test_Bat = { group = infantry type = { infantry } combat_width = 3 need = { infantry_equipment = 120 } }\n\tNova_Test_Support = { group = support type = { infantry support } combat_width = 0 need = { support_equipment = 8 } }\n}\n');
    const suResp = await fetch(`${BASE}/api/subunits?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("/api/subunits ok + finds the mod's custom sub-units", suResp && suResp.ok === true && suResp.subunits.some((s) => s.key === "Nova_Test_Bat"), suResp && suResp.count);
    const nb = (suResp.subunits || []).find((s) => s.key === "Nova_Test_Bat");
    const nsup = (suResp.subunits || []).find((s) => s.key === "Nova_Test_Support");
    ok("custom line battalion parsed (cw 3, not support)", nb && nb.combat_width === 3 && nb.isSupport === false, nb);
    ok("custom support company classified as support", nsup && nsup.isSupport === true, nsup);

    // /api/state-province — deploy-by-State-ID resolver: state → a real land province (VP-preferred).
    console.log("\n=== /api/state-province ===");
    fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
    fs.writeFileSync(path.join(mod, "history", "states", "77-Nova.txt"),
      'state = {\n\tid = 77\n\tname = "STATE_77"\n\tprovinces = { 1111 2222 3333 }\n\thistory = {\n\t\towner = TST\n\t\tvictory_points = { 2222 15 }\n\t}\n}\n');
    const spVp = await fetch(`${BASE}/api/state-province?modPath=${encodeURIComponent(mod)}&state=77`).then((r) => r.json());
    ok("state 77 resolves to its VP province (2222)", spVp && spVp.ok === true && spVp.province === 2222 && spVp.viaVictoryPoint === true, spVp);
    ok("state 77 reports owner TST + provinceCount 3", spVp.owner === "TST" && spVp.provinceCount === 3, spVp);
    // A state with no VP → falls back to the first province.
    fs.writeFileSync(path.join(mod, "history", "states", "88-Nova.txt"),
      'state = {\n\tid = 88\n\tname = "STATE_88"\n\tprovinces = { 4444 5555 }\n\thistory = { owner = TST }\n}\n');
    const spNoVp = await fetch(`${BASE}/api/state-province?modPath=${encodeURIComponent(mod)}&state=88`).then((r) => r.json());
    ok("state 88 (no VP) falls back to first province (4444)", spNoVp && spNoVp.ok === true && spNoVp.province === 4444 && spNoVp.viaVictoryPoint === false, spNoVp);
    const spMissing = await fetch(`${BASE}/api/state-province?modPath=${encodeURIComponent(mod)}&state=999999`).then((r) => r.json());
    ok("a nonexistent state ID → ok:false (guards against a bad deploy)", spMissing && spMissing.ok === false, spMissing);
    const spBad = await fetch(`${BASE}/api/state-province?modPath=${encodeURIComponent(mod)}&state=abc`).then((r) => r.json());
    ok("a non-numeric state ID → ok:false", spBad && spBad.ok === false, spBad);

    // Data-safety: a template/division/officer name with control chars / quote / brace / # must not
    // corrupt the OOB file or get the save refused by the brace guard (qstr strips them). #name-sanitize
    console.log("\n=== division_name + owner survive an EDIT (round-6 preserve) ===");
    // A vanilla-style division with an ordered-name block and NO top-level name, plus a gifted owner. Editing it
    // (here: mark _dirty, as a template rename does to every division using it) must NOT drop division_name/owner.
    const OOBSRC =
      'units = {\n' +
      '\tdivision = {\n' +
      '\t\tdivision_name = { is_name_ordered = yes name_order = 7 }\n' +
      '\t\towner = ITA\n' +
      '\t\tlocation = 9914\n' +
      '\t\tdivision_template = "Fanteria"\n' +
      '\t\tstart_experience_factor = 0.2\n' +
      '\t}\n' +
      '}\n';
    const pm = unit.parseUnitsFile(OOBSRC);
    const pdiv = pm.units.divisions[0];
    ok("parse captures division_name (inner) + owner as first-class fields", pdiv.divisionName === "is_name_ordered = yes name_order = 7" && pdiv.owner === "ITA" && pdiv.name == null, { dn: pdiv.divisionName, owner: pdiv.owner, name: pdiv.name });
    // untouched merge re-emits verbatim
    const untouched = unit.mergeOob(OOBSRC, { templates: [], divisions: pm.units.divisions });
    ok("untouched merge keeps division_name + owner + balanced", /division_name = \{ is_name_ordered = yes name_order = 7 \}/.test(untouched) && /owner = ITA/.test(untouched) && balanced(untouched), untouched);
    // DIRTY edit forces genDivision regeneration — the fields must survive
    const dirtyDiv = Object.assign({}, pdiv, { _dirty: true, template: "Fanteria Rinforzata" });
    const edited = unit.mergeOob(OOBSRC, { templates: [], divisions: [dirtyDiv] });
    ok("edited (regenerated) division STILL has division_name + owner", /division_name = \{ is_name_ordered = yes name_order = 7 \}/.test(edited) && /owner = ITA/.test(edited), edited);
    ok("edit applied (new template) + balanced + still no phantom top-level name", /division_template = "Fanteria Rinforzata"/.test(edited) && balanced(edited) && !/\n\s*name = /.test(edited), edited);
    ok("division_name/owner round-trip byte-stable", unit.serializeUnitsFile(unit.parseUnitsFile(OOBSRC)) === OOBSRC, "drift");
    // a fresh (new) division carries neither → emits neither
    const freshDiv = unit.genDivision({ name: "1. Test", location: 5, template: "T" });
    ok("a new division emits NO division_name / owner", !/division_name/.test(freshDiv) && !/owner/.test(freshDiv), freshDiv);
    // an INLINE-COMMENT division_name (real MD/FRA data) must NOT let the trailing comment swallow the closing brace
    const COMMENTED =
      'units = {\n\tdivision = {\n\t\tdivision_name = { is_name_ordered = yes\n\t\t\tname_order = 1 #Change in 2016 }\n\t\tlocation = 3 division_template = "X"\n\t}\n}\n';
    const pmc = unit.parseUnitsFile(COMMENTED);
    const editedC = unit.mergeOob(COMMENTED, { templates: [], divisions: [Object.assign({}, pmc.units.divisions[0], { _dirty: true, experience: 0.4 })] });
    ok("inline-comment division_name regenerates brace-balanced (closing brace on its own line)", balanced(editedC) && /division_name = \{/.test(editedC) && /name_order = 1/.test(editedC), editedC);

    console.log("\n=== _divKey collision (round-11): ordered-name siblings must NOT clobber each other ===");
    // MD comments out the real `name` on ordered-name divisions, so d.name is null and a name|location|template key
    // degenerates to `|location|template` — siblings sharing a garrison province + template collide. With a
    // last-write-wins Map, ONE sibling's raw bytes got re-emitted in place of all of them: measured on real MD as
    // 10 divisions DESTROYED + 5 DUPLICATED in a single save, brace-balanced and count-preserving so nothing
    // downstream noticed. Any dirty division (e.g. deploying one) triggers the raw re-emit path. #div-key-collision
    const COLL =
      'units = {\n' +
      '\tdivision = {\n\t\tdivision_name = { is_name_ordered = yes name_order = 86 }\n\t\tlocation = 10498\n\t\tdivision_template = "Inf"\n\t}\n' +
      '\tdivision = {\n\t\tdivision_name = { is_name_ordered = yes name_order = 89 }\n\t\tlocation = 10498\n\t\tdivision_template = "Inf"\n\t}\n' +
      '\tdivision = {\n\t\tdivision_name = { is_name_ordered = yes name_order = 91 }\n\t\tlocation = 10498\n\t\tdivision_template = "Inf"\n\t}\n' +
      '}\n';
    const cm = unit.parseUnitsFile(COLL);
    ok("precondition: 3 colliding siblings parse with NO top-level name (only division_name)", cm.units.divisions.length === 3 && cm.units.divisions.every((d) => d.name == null && d.divisionName), cm.units.divisions.map((d) => d.divisionName));
    // simulate the real client round-trip (only the fields the API sends) + ONE deployed division → dirty path
    const sentC = cm.units.divisions.map((d) => ({ name: d.name, location: d.location, template: d.template, officer: d.officer || null, equipmentFactor: d.equipmentFactor, experience: d.experience, forceVariants: d.forceVariants || [], owner: d.owner || null, divisionName: d.divisionName || null }));
    const withNew = sentC.concat([{ name: "Nova New Div", location: 10498, template: "Inf", _dirty: true }]);
    const outC = unit.mergeOob(COLL, { templates: [], divisions: withNew });
    const orderCount = (s, n) => (s.match(new RegExp("name_order = " + n + "\\b", "g")) || []).length;
    ok("each ordered-name sibling survives EXACTLY once (86/89/91 — none destroyed, none duplicated)", [86, 89, 91].every((n) => orderCount(outC, n) === 1), { 86: orderCount(outC, 86), 89: orderCount(outC, 89), 91: orderCount(outC, 91) });
    ok("the newly deployed division is added + file brace-balanced", /Nova New Div/.test(outC) && balanced(outC), outC);
    // genuinely IDENTICAL divisions (same everything) must still map 1:1, not collapse — the consuming queue
    const TWIN = 'units = {\n\tdivision = {\n\t\tname = "Twin"\n\t\tlocation = 5\n\t\tdivision_template = "T"\n\t}\n\tdivision = {\n\t\tname = "Twin"\n\t\tlocation = 5\n\t\tdivision_template = "T"\n\t}\n}\n';
    const tm = unit.parseUnitsFile(TWIN);
    const outT = unit.mergeOob(TWIN, { templates: [], divisions: tm.units.divisions.map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] })) });
    ok("two genuinely identical divisions still round-trip as TWO (queue, not collapse)", (outT.match(/name = "Twin"/g) || []).length === 2, outT);

    console.log("\n=== OOB name sanitization ===");
    const nastyName = "Evil\nLine\tTwo\r \"q\" {b} #h";
    const nastySave = await fetch(`${BASE}/api/army/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, tag: "TST", file: "TST_2000.txt",
        templates: [{ name: nastyName, regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }],
        divisions: [{ name: nastyName + " 1", location: 100, template: nastyName, officer: nastyName + " Cmdr", _dirty: true }],
      }),
    }).then((r) => r.json());
    const nastyFile = fs.existsSync(path.join(mod, "history", "units", "TST_2000.txt")) ? fs.readFileSync(path.join(mod, "history", "units", "TST_2000.txt"), "utf8") : "";
    // A quote is now ESCAPED rather than deleted (#oob-name-backslash): the model carries names in their
    // already-escaped form, so stripping the quote out of a `\"` pair left a lone `\` that escaped the
    // line's own closing quote. Millennium Dawn writes escaped quotes in division names itself. Newlines and
    // the structural { } are still stripped.
    //
    // #name-sanitize-deletes-a-legal-hash — `#` and TAB are NOT, any more. Both are legal inside a quoted
    // string and vanilla ships one (`version_name = "FT mod. #31"` in AFG_1936_nsb.txt); deleting the hash
    // renumbered Road to 56's "Nacistas Militia #1…#7" and deleting the tab ran "Armored\tDivision" together.
    // This save also proves the write guard accepts it: bracesAreBalanced used to read the hash as a comment,
    // eat the rest of the line and refuse with "the generated OOB is not brace-balanced".
    // #brace-guard-reads-a-quoted-hash-as-a-comment
    const nastyBack = unit.parseUnitsFile(nastyFile);
    const wantName = 'name = "EvilLine' + "\t" + 'Two \\"q\\" b #h"';
    ok("nasty template/division name saves cleanly — escaped, no raw newline in name=, brace-balanced, re-readable",
      nastySave && !nastySave.error && nastyFile.includes(wantName)
      && !/name\s*=\s*"[^"]*\n[^"]*"/.test(nastyFile)
      && (nastyFile.match(/{/g) || []).length === (nastyFile.match(/}/g) || []).length
      && ((nastyBack.units && nastyBack.units.divisions) || []).length === 1
      && (nastyBack.templates || []).length === 1,
      { err: nastySave && nastySave.error, want: wantName, snippet: nastyFile.slice(0, 90),
        divisions: ((nastyBack.units && nastyBack.units.divisions) || []).length });
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nARMY-OOB: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
