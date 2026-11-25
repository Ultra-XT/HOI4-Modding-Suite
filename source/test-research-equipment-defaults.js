// Saving must not turn a stat an equipment INHERITS into an explicit override (#no-invented-equipment-stats).
//
// `year` and `build_cost_ic` are the only two equipment stats the parser invents a value for when the
// block doesn't declare them (1936 and 0.5) — every other stat resolves to undefined and the writer
// skips it. Those invented values were then written back as if the modder had authored them. Millennium
// Dawn's one-line `GNSS1 = { archetype = Missile }` came back as a three-key block carrying
// `year = 1936` and `build_cost_ic = 0.5`, so a missile that took its production cost from its
// archetype silently acquired a different one — from an edit to a neighbouring tech.
//
// Both keys are genuinely optional in the real files: 13% of vanilla equipment blocks and 23% of
// Millennium Dawn's declare no year; roughly a quarter of each declare no build_cost_ic.
//
// Equipment is only written alongside the TECH that enables it, so every case here saves the tech too.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqdef-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EqDefaults"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
const edir = path.join(mod, "common", "units", "equipment");
fs.mkdirSync(tdir, { recursive: true });
fs.mkdirSync(edir, { recursive: true });

const techBlock = (id, eq, x) => [
  `\t${id} = {`,
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  `\t\tenable_equipments = { ${eq} }`,
  `\t\tfolder = { name = infantry_folder position = { x = ${x} y = 0 } }`,
  "\t}",
].join("\n");
fs.writeFileSync(path.join(tdir, "probe.txt"),
  `technologies = {\n${techBlock("tech_bare", "bare_missile", 0)}\n${techBlock("tech_full", "full_rifle", 2)}\n${techBlock("tech_var", "var_gun", 4)}\n}\n`);

const EQ = [
  // @variables are declared at FILE level, above the block — exactly where Millennium Dawn puts them
  // (MD_mtg_ships.txt declares @frigate_armor and friends before `equipments = {`).
  "@probe_armor = 12",
  "@probe_speed = 8.5",
  "",
  "equipments = {",
  "\tbare_missile = { archetype = Missile }",       // declares NOTHING but archetype
  "\tfull_rifle = {",
  "\t\tyear = 1965",
  "\t\tarchetype = infantry_equipment",
  "\t\tbuild_cost_ic = 3.75",
  "\t\tdefense = 21",
  "\t}",
  "\tvar_gun = {",
  "\t\tyear = 1970",
  "\t\tarchetype = infantry_equipment",
  "\t\t#Defensive Abilities",
  "\t\tarmor_value = @probe_armor",
  "\t\tnaval_speed = @probe_speed",
  "\t}",
  "}",
  "",
].join("\n");
const EFILE = path.join(edir, "probe_equipment.txt");
fs.writeFileSync(EFILE, EQ, "utf8");

// RETARGETED (#equipment-existing-file-no-redirect). This read ONE filename while testing CONTENT — the
// stats a save writes. `probe_equipment.txt` sorts before vanilla's infantry.txt, and HOI4 merges
// common/units/equipment across the base game and every mod and reads the result ALPHABETICALLY, so a NEW
// block there with `archetype = infantry_equipment` is a forward reference the game drops with "Malformed
// token". Nova now moves such a block to zz_nova_equipment.txt (an existing file used to be exempt, which is
// what this test was pinning). Read the whole directory — where the block lands is the writer's business;
// what it contains is what this test is about. Same retarget as commit f6f5881 made for three sibling tests.
const rd = () => fs.readdirSync(edir).filter((f) => /\.txt$/i.test(f)).sort()
  .map((f) => fs.readFileSync(path.join(edir, f), "utf8")).join("\n");
const blockOf = (text, id) => {
  const m = new RegExp(`(?:^|\\n)[ \\t]*${id}[ \\t]*=[ \\t]*\\{`).exec(text);
  if (!m) return null;
  let d = 0, i = text.indexOf("{", m.index), s = i;
  for (; i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) break; } }
  return text.slice(s + 1, i);
};

const PORT = 39575, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const save = (techs, equips) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: techs, equipments: equips, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const load = async () => {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const bag = cat.equipments || cat.equipment || {};
    const eq = Array.isArray(bag) ? Object.fromEntries(bag.map((e) => [e.id, e])) : bag;
    const t = Object.fromEntries((cat.technologies || []).map((x) => [x.id, x]));
    return { eq, t };
  };
  try {
    const { eq, t } = await load();
    ok("both equipments are in the catalog", !!eq.bare_missile && !!eq.full_rifle, Object.keys(eq).slice(0, 6));
    ok("the undeclared stats still get display defaults", eq.bare_missile.year === 1936 && eq.bare_missile.buildCostIc === 0.5, { y: eq.bare_missile.year, c: eq.bare_missile.buildCostIc });
    ok("the parser records which stats were authored", eq.bare_missile.authoredStats && eq.bare_missile.authoredStats.year === false && eq.bare_missile.authoredStats.build_cost_ic === false, eq.bare_missile.authoredStats);
    ok("a block that DOES declare them is marked authored", eq.full_rifle.authoredStats && eq.full_rifle.authoredStats.year === true && eq.full_rifle.authoredStats.build_cost_ic === true, eq.full_rifle.authoredStats);

    // ── the one-liner must not gain stats it never had ────────────────────────────────────────────
    const before1 = rd();
    const r1 = await save([t.tech_bare], { bare_missile: eq.bare_missile });
    ok("save → 200", r1.s === 200, r1.b);
    const b1 = blockOf(rd(), "bare_missile");
    ok("no year was invented", !/\byear\s*=/.test(b1), b1);
    ok("no build_cost_ic was invented", !/\bbuild_cost_ic\s*=/.test(b1), b1);
    ok("the one thing it DID declare survives", /archetype\s*=\s*Missile/.test(b1), b1);
    // Nothing changed, so nothing should have been written at all — not even a reformat of the
    // one-liner. #no-equipment-write-without-edit
    ok("an unchanged equipment is not rewritten at all", rd() === before1, rd());

    // ── a block that declared them keeps them, at their own values ────────────────────────────────
    const r2 = await save([t.tech_full], { full_rifle: eq.full_rifle });
    ok("save → 200", r2.s === 200, r2.b);
    const b2 = blockOf(rd(), "full_rifle");
    ok("an authored year is kept, unchanged", /\byear\s*=\s*1965\b/.test(b2), b2);
    ok("an authored build_cost_ic is kept, unchanged", /\bbuild_cost_ic\s*=\s*3\.75\b/.test(b2), b2);
    ok("its other stats survive", /\bdefense\s*=\s*21\b/.test(b2), b2);

    // ── @variable stats go back as variables, and the comment above them survives ─────────────────
    const bVar = blockOf(rd(), "var_gun");
    ok("an @variable stat is written back as the variable", /\barmor_value\s*=\s*@probe_armor\b/.test(bVar), bVar);
    ok("the modder's comment above it survives", /#Defensive Abilities/.test(bVar), bVar);
    const { eq: eqV, t: tV } = await load();
    ok("the parser resolves the @variable for display", eqV.var_gun.statsAll && eqV.var_gun.statsAll.armor_value === 12, eqV.var_gun.statsAll);
    ok("the parser carries the @variable token", eqV.var_gun.statVars && eqV.var_gun.statVars.armor_value && eqV.var_gun.statVars.armor_value.token === "@probe_armor", eqV.var_gun.statVars);
    const bumped = Object.assign({}, eqV.var_gun, { statsAll: Object.assign({}, eqV.var_gun.statsAll, { armor_value: 30 }) });
    await save([tV.tech_var], { var_gun: bumped });
    const bVar2 = blockOf(rd(), "var_gun");
    ok("changing the value writes a literal instead", /\barmor_value\s*=\s*30\b/.test(bVar2), bVar2);
    ok("the other @variable stat is still a variable", /\bnaval_speed\s*=\s*@probe_speed\b/.test(bVar2), bVar2);

    // ── a user who actually SETS the stat gets it written ─────────────────────────────────────────
    const { eq: eq3, t: t3 } = await load();
    const edited = Object.assign({}, eq3.bare_missile, { year: 1975, buildCostIc: 9 });
    const r3 = await save([t3.tech_bare], { bare_missile: edited });
    ok("save → 200", r3.s === 200, r3.b);
    const b3 = blockOf(rd(), "bare_missile");
    ok("a year the user changed IS written", /\byear\s*=\s*1975\b/.test(b3), b3);
    ok("a build_cost_ic the user changed IS written", /\bbuild_cost_ic\s*=\s*9\b/.test(b3), b3);

    // ── a brand-new equipment (no authoredStats at all) still gets both ───────────────────────────
    const fresh = { id: "fresh_gun", year: 1940, archetype: "infantry_equipment", buildCostIc: 0.5, fileName: "probe_equipment.txt", isMod: true };
    const { t: t4 } = await load();
    const r4 = await save([Object.assign({}, t4.tech_bare, { enableEquipments: ["bare_missile", "fresh_gun"] })], { fresh_gun: fresh });
    ok("save → 200", r4.s === 200, r4.b);
    const b4 = blockOf(rd(), "fresh_gun");
    ok("a brand-new equipment is written in full", b4 && /\byear\s*=\s*1940\b/.test(b4) && /\bbuild_cost_ic\s*=\s*0\.5\b/.test(b4), b4);
    // fresh_gun is the SECOND entry in that tech's enable_equipments. Only the first used to be written,
    // so an edit to any of the others reported success and saved nothing — and vanilla's airframe techs
    // enable eight apiece. #write-every-enabled-equipment
    const { eq: eq5, t: t5 } = await load();
    ok("the second enabled equipment is in the catalog", !!eq5.fresh_gun, Object.keys(eq5).filter((k) => /fresh|bare/.test(k)));
    const editedSecond = Object.assign({}, eq5.fresh_gun, { statsAll: Object.assign({}, eq5.fresh_gun.statsAll, { defense: 42 }) });
    const r5 = await save([t5.tech_bare], { bare_missile: eq5.bare_missile, fresh_gun: editedSecond });
    ok("save → 200", r5.s === 200, r5.b);
    ok("an edit to the SECOND enabled equipment lands", /\bdefense\s*=\s*42\b/.test(blockOf(rd(), "fresh_gun") || ""), blockOf(rd(), "fresh_gun"));

    console.log(`\ntest-research-equipment-defaults: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 27 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
