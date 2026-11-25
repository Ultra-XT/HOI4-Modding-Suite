// An add-on made in Nova on top of a base mod made in Nova must never lose its own strategic regions or supply areas
// to the base's file of the same name. #an-add-on-never-loses-its-own-file-to-the-base-mods
//
// Found by the 2026-09-10 tiebreak on a contested audit finding (2 REAL, 1 REAL-but-trivial), with a control arm:
//
//   ⛔ 1. editBlockInDir, step 2 — editing a block the mod does not define yet — copies the base layer's file into
//      the mod UNDER THE SAME NAME, and never checked whether the mod already ships a file of that name. Nova names
//      every region it creates into zz_nova_regions.txt and every supply area into zz_nova_areas.txt, so a Nova
//      add-on on a Nova base has exactly that collision: moving one state into one of the base's supply areas
//      replaced the add-on's own zz_nova_areas.txt with the base's copy, and the add-on's own area was gone, with
//      changed:true. The same move on regions left a province in no strategic region at all. Renaming only the
//      add-on's file (the control) kept everything — the shared name was the whole cause.
//      HOI4 replaces a file wholesale by path, so the add-on's same-named file is ALREADY the one the game loads: the
//      edit belongs INSIDE it, appended, never over it.
//
//   ⛔ 2. The collision is created in the first place by createStrategicRegion / createSupplyArea writing that fixed
//      name even when a layer below already ships it. For regions that is an in-game problem by itself: the add-on's
//      zz_nova_regions.txt replaces the base's, so the base's own Nova regions stop loading. A new file now takes a
//      name no lower layer ships, and keeps zz_nova_*.txt whenever that name is free.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

// Sandbox the app data BEFORE anything resolves it: backups of these fixtures must never reach the real folder.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-addonfile-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const tmps = [SANDBOX];

const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t}\n\t}\n";
function makeGame() {
  const G = fs.mkdtempSync(path.join(os.tmpdir(), "nova-addonfile-game-")); tmps.push(G);
  w(path.join(G, "map", "supplyareas", "1-SupplyArea.txt"), 'supply_area={\n\tid=1\n\tname="SUPPLYAREA_1"\n\tvalue=12\n\tstates={ 1 2 }\n}\n');
  w(path.join(G, "history", "states", "1-A.txt"), 'state={\n\tid=1\n\tname="STATE_1"\n\tmanpower=1\n\tstate_category=town\n\tprovinces={ 10 }\n\thistory={ owner=AAA }\n}\n');
  w(path.join(G, "history", "states", "2-B.txt"), 'state={\n\tid=2\n\tname="STATE_2"\n\tmanpower=1\n\tstate_category=town\n\tprovinces={ 20 }\n\thistory={ owner=AAA }\n}\n');
  w(path.join(G, "map", "strategicregions", "1-R.txt"), `strategic_region={\n\tid=1\n\tname="STRATEGICREGION_1"\n\tprovinces={ 10 20 }\n${weather}}\n`);
  w(path.join(G, "map", "weatherpositions.txt"), "1;1.00;9.90;1.00;big\n1;1.00;9.90;1.00;big\n");
  return G;
}
function makeMod(label, deps) {
  const M = fs.mkdtempSync(path.join(os.tmpdir(), `nova-addonfile-${label}-`)); tmps.push(M);
  w(path.join(M, "descriptor.mod"), `name="${label}"\n` + (deps ? `dependencies={ ${deps.map((d) => `"${d}"`).join(" ")} }\n` : ""));
  return M;
}
const idsIn = (file, kw) => {
  if (!fs.existsSync(file)) return null;
  const t = fs.readFileSync(file, "utf8");
  const out = [];
  const re = new RegExp(kw + "\\s*=\\s*\\{", "g");
  let m;
  while ((m = re.exec(t)) !== null) { const id = /\bid\s*=\s*(\d+)/.exec(t.slice(m.index, m.index + 200)); if (id) out.push(+id[1]); }
  return out;
};

try {
  console.log("1. ⛔ Moving a state into the BASE mod's supply area keeps the add-on's own same-named file");
  {
    const G = makeGame();
    const B = makeMod("Base");
    const base = md.createSupplyArea({ modRoot: B, gameRoot: G, dependencyRoots: [], states: [] });
    rec("setup: the base mod has its own area in zz_nova_areas.txt", base.ok && idsIn(path.join(B, "map", "supplyareas", "zz_nova_areas.txt"), "supply_area").includes(base.id), base);
    const A = makeMod("Addon", ["Base"]);
    // The shape an older Nova wrote, and the one the tiebreak reproduced: the add-on's own area under the same name.
    const addonFile = path.join(A, "map", "supplyareas", "zz_nova_areas.txt");
    w(addonFile, `supply_area={\n\tid=${base.id + 1}\n\tname="nova_supplyarea_${base.id + 1}"\n\tvalue=1\n\tstates={ }\n}\n`);
    const baseBefore = fs.readFileSync(path.join(B, "map", "supplyareas", "zz_nova_areas.txt"));

    const mv = md.moveStateToSupplyArea({ modRoot: A, gameRoot: G, dependencyRoots: [B], stateId: 1, fromAreaId: 1, toAreaId: base.id });
    rec("the move ran", !mv.error, mv);
    const own = idsIn(addonFile, "supply_area") || [];
    rec("⭐⭐⭐ the add-on's own area is still in its file", own.includes(base.id + 1), own);
    rec("⭐⭐ …and the edited base area now lives there too", own.includes(base.id), own);
    const model = md.buildMapModel({ modRoot: A, gameRoot: G, dependencyRoots: [B] });
    const area = (model.supplyAreas || []).find((a) => a.id === base.id);
    rec("⭐⭐ the model keeps the add-on's area", (model.supplyAreas || []).some((a) => a.id === base.id + 1), (model.supplyAreas || []).map((a) => a.id));
    rec("⭐ …and state 1 is in the base area it was moved to", !!area && (area.states || []).includes(1), area);
    rec("⭐ the base mod's own file was not touched", Buffer.compare(baseBefore, fs.readFileSync(path.join(B, "map", "supplyareas", "zz_nova_areas.txt"))) === 0);
  }

  console.log("\n2. ⛔ Moving a province into the BASE mod's region keeps the add-on's own region — and its province's region");
  {
    const G = makeGame();
    const B = makeMod("Base");
    const base = md.createStrategicRegion({ modRoot: B, gameRoot: G, dependencyRoots: [], provinces: [] });
    rec("setup: the base mod has its own region in zz_nova_regions.txt", base.ok && (idsIn(path.join(B, "map", "strategicregions", "zz_nova_regions.txt"), "strategic_region") || []).includes(base.id), base);
    const A = makeMod("Addon", ["Base"]);
    const addonFile = path.join(A, "map", "strategicregions", "zz_nova_regions.txt");
    const ownId = base.id + 1;
    w(addonFile, `strategic_region={\n\tid=${ownId}\n\tname="nova_strategicregion_${ownId}"\n\tprovinces={ 20 }\n${weather}}\n`);
    // Keep the fixture consistent: province 20 belongs to the add-on's own region, not also to the game's region 1.
    w(path.join(A, "map", "strategicregions", "1-R.txt"), `strategic_region={\n\tid=1\n\tname="STRATEGICREGION_1"\n\tprovinces={ 10 }\n${weather}}\n`);

    const mv = md.moveProvinceToRegion({ modRoot: A, gameRoot: G, dependencyRoots: [B], provinceId: 10, fromRegionId: 1, toRegionId: base.id });
    rec("the move ran", !mv.error, mv);
    const own = idsIn(addonFile, "strategic_region") || [];
    rec("⭐⭐⭐ the add-on's own region is still in its file", own.includes(ownId), own);
    const model = md.buildMapModel({ modRoot: A, gameRoot: G, dependencyRoots: [B] });
    rec("⭐⭐⭐ province 20 is still in the add-on's region, not in none", (model.provinceToRegion || {})[20] === ownId, (model.provinceToRegion || {})[20]);
    rec("⭐ …and province 10 moved into the base's region", (model.provinceToRegion || {})[10] === base.id, (model.provinceToRegion || {})[10]);
  }

  console.log("\n3. ⛔ A new region or supply area in an add-on never takes a file name its base mod already ships");
  {
    const G = makeGame();
    const B = makeMod("Base");
    const bR = md.createStrategicRegion({ modRoot: B, gameRoot: G, dependencyRoots: [], provinces: [] });
    const bA = md.createSupplyArea({ modRoot: B, gameRoot: G, dependencyRoots: [], states: [] });
    const A = makeMod("Addon", ["Base"]);
    const r = md.createStrategicRegion({ modRoot: A, gameRoot: G, dependencyRoots: [B], provinces: [] });
    const a = md.createSupplyArea({ modRoot: A, gameRoot: G, dependencyRoots: [B], states: [] });
    const baseShips = (sub, rel) => fs.existsSync(path.join(B, sub, path.basename(rel)));
    rec("⭐⭐⭐ the add-on's region file is not a name the base ships", r.ok && !baseShips("map/strategicregions", r.file), r.file);
    rec("⭐⭐⭐ the add-on's supply-area file is not a name the base ships", a.ok && !baseShips("map/supplyareas", a.file), a.file);
    rec("⭐ …and each file it reports is the file it wrote", fs.existsSync(path.join(A, r.file)) && fs.existsSync(path.join(A, a.file)), { region: r.file, area: a.file });
    const model = md.buildMapModel({ modRoot: A, gameRoot: G, dependencyRoots: [B] });
    rec("the base's region and the add-on's are both in the model",
      (model.strategicRegions || []).some((x) => x.id === bR.id) && (model.strategicRegions || []).some((x) => x.id === r.id), (model.strategicRegions || []).map((x) => x.id));
    rec("…and so are both supply areas",
      (model.supplyAreas || []).some((x) => x.id === bA.id) && (model.supplyAreas || []).some((x) => x.id === a.id), (model.supplyAreas || []).map((x) => x.id));
    const r2 = md.createStrategicRegion({ modRoot: A, gameRoot: G, dependencyRoots: [B], provinces: [] });
    rec("⭐ a second region in the add-on joins the same file, not a third one", r2.ok && r2.file === r.file, { first: r.file, second: r2.file });
  }

  console.log("\n4. Control: a mod on the bare game keeps the familiar names");
  {
    const G = makeGame();
    const M = makeMod("Plain");
    const r = md.createStrategicRegion({ modRoot: M, gameRoot: G, dependencyRoots: [], provinces: [] });
    const a = md.createSupplyArea({ modRoot: M, gameRoot: G, dependencyRoots: [], states: [] });
    rec("regions go to zz_nova_regions.txt", r.file === "map/strategicregions/zz_nova_regions.txt", r.file);
    rec("supply areas go to zz_nova_areas.txt", a.file === "map/supplyareas/zz_nova_areas.txt", a.file);
  }

  console.log(`\n=== an add-on never loses its own file to the base mod's: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
