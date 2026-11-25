// #tech-edit-stamps-equipment-stats — editing ANY field of a research tech rewrote the build cost and
// reliability of the equipment it unlocks with Nova's own invented defaults.
//
// Two `|| default` sites treated "the file doesn't declare this stat" as "the stat is 0.5 / 0.9". On load,
// `equipCost.value = eq.buildCostIc || 0.5` and `equipReliability.value = eq.reliability || 0.9` filled the
// boxes with fabricated numbers. On save, updateTechFromForm rebuilt the equipment record with
// `parseFloat(box) || 0.5` and `|| 0.9`, so those fabricated numbers were written into the file as real
// overrides — replacing values the equipment had been inheriting from its archetype.
//
// The five neighbouring stat boxes deliberately do NOT do this: they go through showStat, whose own comment
// says an undeclared stat must show blank "otherwise merely opening the weapon and saving turns every
// inherited value into a zero override". The two broken lines sat directly on either side of that comment.
//
// Every field of the tech funnels into syncForm, so renaming a tech — or touching its description, year,
// cost or position — was enough to trigger it. Millennium Dawn's convoy_1 inherits build_cost_ic = 1500 from
// `convoy`; one rename and it cost 0.5 IC. 28 MD and 44 vanilla tiers inherit build_cost_ic; 111 MD and 80
// vanilla inherit reliability. Nothing in the UI said a number had changed, and the fabricated value was
// already showing in the box, so it looked like the value the equipment always had.
//
// Note the catalog reports buildCostIc = 0.5 even when that is only the parser's default, so authoredStats
// is the only thing that distinguishes "the file says 0.5" from "the file says nothing".
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-eqstats-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/units/equipment", "common/technologies"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EQ"\nsupported_version="1.18.*"\n');

// archetype declares real values; the tier inherits them and declares only soft_attack
const EQFILE = path.join(MOD, "common", "units", "equipment", "nova_probe_eq.txt");
fs.writeFileSync(EQFILE,
  "equipments = {\n" +
  "\tnova_probe_gun = {\n\t\tis_archetype = yes\n\t\tyear = 1936\n\t\tbuild_cost_ic = 7\n\t\treliability = 0.55\n\t\tsoft_attack = 3\n\t}\n" +
  "\tnova_probe_gun_1 = {\n\t\tyear = 1936\n\t\tarchetype = nova_probe_gun\n\t\tsoft_attack = 5\n\t}\n" +
  "}\n", "utf8");
fs.writeFileSync(path.join(MOD, "common", "technologies", "nova_probe_tech.txt"),
  "technologies = {\n\tnova_probe_tech = {\n\t\tenable_equipments = { nova_probe_gun_1 }\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n" +
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tcategories = { infantry_weapons }\n\t}\n}\n", "utf8");

// ── the client's load rule, taken from the real source ───────────────────────────────────────────
const cli = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
ok("the load path no longer invents a build cost", !/equipCost"\)\.value = eq\.buildCostIc \|\| 0\.5/.test(cli), "still fabricating build cost");
ok("…nor a reliability", !/equipReliability"\)\.value = eq\.reliability \|\| 0\.9/.test(cli), "still fabricating reliability");
ok("build cost goes through showStat, keyed on authoredStats",
  /showStat\("equipCost", authoredStats\.build_cost_ic === false \? undefined : eq\.buildCostIc\)/.test(cli), "load rule missing");
ok("reliability goes through showStat", /showStat\("equipReliability", eq\.reliability\)/.test(cli), "load rule missing");
ok("the save path no longer defaults the build cost", !/buildCostIc: parseFloat\(document\.getElementById\("equipCost"\)\.value\) \|\| 0\.5/.test(cli), "save still defaults");
ok("…nor the reliability", !/reliability: parseFloat\(document\.getElementById\("equipReliability"\)\.value\) \|\| 0\.9/.test(cli), "save still defaults");
ok("both use statOrInherit like every other stat",
  /buildCostIc: statOrInherit\("equipCost"\)/.test(cli) && /reliability: statOrInherit\("equipReliability"\)/.test(cli), "not using statOrInherit");
ok("…and it explains why", /#tech-edit-stamps-equipment-stats/.test(cli), "no marker comment");

const PORT = 39993, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then((r) => r.json());
  const saveBatch = (technologies, equipments) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, technologies, equipments }),
  }).then((r) => r.json());
  try {
    const cat = await get(`/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`);
    // `equipments` is an OBJECT keyed by id — the same shape as the client's allEquips, not an array.
    const eqs = cat.equipments || {};
    const tier = eqs["nova_probe_gun_1"];
    ok("the catalog returned the tier", !!tier, Object.keys(eqs).slice(0, 8));
    // ⚠️ This asserted `buildCostIc === 0.5` — the parser's invented default — as if that were correct. It
    // was the same defect this file's own header describes ("convoy_1 inherits build_cost_ic = 1500; one
    // rename and it cost 0.5 IC"), just seen from the reader's side instead of the writer's: the tier
    // inherits 7 from nova_probe_gun and 0.5 was never a number anything in the game would use.
    // #equipment-inherited-stat-shown-as-default resolves the chain, so the catalogue reports 7.
    // ⭐ The load-bearing half is the NEXT line and is unchanged: authoredStats still says the block declares
    // nothing, which is what keeps research.js blanking the box and the writer from stamping a value.
    ok("…reporting the cost it INHERITS from its archetype", tier && tier.buildCostIc === 7, tier && tier.buildCostIc);
    ok("…flagged as not authored", tier && tier.authoredStats && tier.authoredStats.build_cost_ic === false, tier && tier.authoredStats);
    ok("…and no reliability at all", tier && (tier.reliability === undefined || tier.reliability === null), tier && tier.reliability);

    // what the boxes now show, using the real load rule
    const authored = (tier && tier.authoredStats) || {};
    const boxCost = authored.build_cost_ic === false ? "" : tier.buildCostIc;
    const boxRel = (tier.reliability === undefined || tier.reliability === null) ? "" : tier.reliability;
    ok("the build-cost box is now BLANK, not 0.5", boxCost === "", boxCost);
    ok("the reliability box is now BLANK, not 0.9", boxRel === "", boxRel);

    // statOrInherit: blank -> undefined
    const statOrInherit = (raw) => { const s = String(raw == null ? "" : raw).trim(); if (!s) return undefined; const n = parseFloat(s); return Number.isFinite(n) ? n : undefined; };

    const techs = (cat.technologies || []).filter((t) => t.id === "nova_probe_tech");
    ok("the catalog returned the tech", techs.length === 1, (cat.technologies || []).map((t) => t.id));
    const renamed = Object.assign({}, techs[0], { name: "Renamed Probe Tech" }); // the trigger: any field edit

    const r = await saveBatch([renamed], {
      nova_probe_gun_1: {
        id: "nova_probe_gun_1", year: 1936, archetype: "nova_probe_gun",
        buildCostIc: statOrInherit(boxCost), softAttack: statOrInherit(5),
        reliability: statOrInherit(boxRel), resources: {},
        name: "Probe Gun", fileName: "nova_probe_eq.txt",
      },
    });
    ok("the save succeeds", r && (r.ok || r.success), r);

    const after = fs.readFileSync(EQFILE, "utf8");
    const tierBlock = (t) => { const m = /nova_probe_gun_1\s*=\s*\{([\s\S]*?)\n\t\}/.exec(t); return m ? m[1] : ""; };
    const tb = tierBlock(after);
    ok("the tier block is still there", tb.length > 0, after.slice(0, 400));
    ok("NO build_cost_ic WAS STAMPED ONTO THE TIER", !/build_cost_ic/.test(tb), tb);
    ok("NO reliability WAS STAMPED ONTO THE TIER", !/reliability/.test(tb), tb);
    ok("…the stat it really declares survived", /soft_attack\s*=\s*5/.test(tb), tb);
    ok("…and its archetype link survived", /archetype\s*=\s*nova_probe_gun/.test(tb), tb);

    const archBlock = /nova_probe_gun\s*=\s*\{([\s\S]*?)\n\t\}/.exec(after);
    ok("the ARCHETYPE's real values are untouched", archBlock && /build_cost_ic\s*=\s*7/.test(archBlock[1]) && /reliability\s*=\s*0\.55/.test(archBlock[1]), archBlock && archBlock[1]);
    let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; }
    ok("the file is brace-balanced", d === 0, d);
    // Deliberately NOT asserting "the file changed" here: a correct save may leave the equipment block
    // byte-identical, so that check would either be vacuous or wrong. What proves the pipeline was live is
    // the second save below — it writes build_cost_ic through the same path, so the absence above is a real
    // absence and not a save that quietly did nothing.
    ok("the archetype block is intact after the save", !!archBlock, after.slice(0, 300));

    // ── a value the user really types must still be written, even if it equals the parser default ──
    const r2 = await saveBatch([renamed], {
      nova_probe_gun_1: {
        id: "nova_probe_gun_1", year: 1936, archetype: "nova_probe_gun",
        buildCostIc: statOrInherit("0.5"), softAttack: statOrInherit(5),
        reliability: statOrInherit("0.9"), resources: {},
        name: "Probe Gun", fileName: "nova_probe_eq.txt",
      },
    });
    ok("a second save with typed values succeeds", r2 && (r2.ok || r2.success), r2);
    const tb2 = tierBlock(fs.readFileSync(EQFILE, "utf8"));
    ok("a TYPED build cost is written even when it equals the parser default", /build_cost_ic\s*=\s*0\.5/.test(tb2), tb2);
    ok("…and a typed reliability too", /reliability\s*=\s*0\.9/.test(tb2), tb2);

    console.log("\ntest-tech-edit-equipment-stats: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 24 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
