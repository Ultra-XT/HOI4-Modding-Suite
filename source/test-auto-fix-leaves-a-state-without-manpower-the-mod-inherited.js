// An add-on is not told about a state without manpower that it only inherited, and one Auto-fix click never copies that
// state's file in. #auto-fix-leaves-a-state-without-manpower-the-mod-inherited
//
// THE DEFECT. state_no_manpower reported every land state with no manpower in the merged map, whoever ships it, and
// fixStateNoManpower — which autoFixMap runs on every click — gave people to every one of them, copying the state's file
// into the mod to do it. The rule had no ownership gate, so the fixer had none to share; batch 5 found it and had no time.
//
// MEASURED on the base commit 21808ba, through the endpoints the Map Errors popup calls (GET /api/map/validate, then POST
// /api/map/auto-fix { modPath }), on a mkdtemp add-on declaring the installed Novum Vexillum and carrying one problem of its
// own (NV's 1-France.txt with its state_category line removed): the validator reported state_no_category for state 1 AND
// state_no_manpower for state 1371, which NV itself ships with manpower = 0, and ONE click wrote NV's
// history/states/1371-Momase.txt (619 B, manpower = 16000) into the add-on. That copy then replaces NV's own file
// wholesale, so every later NV update to Momase is lost to the add-on, and nothing in Nova undoes it. The same sweep over
// vanilla, Rise of Nations and Old World Blues wrote only the add-on's own state file.
//
// THE FIX. One helper, stateWithoutManpowerIsTheModsOwn, answers for the rule and the fixer. The layer below already
// having that state with no people over land makes it inherited — including a verbatim copy in the mod, since a file Nova
// materialised is not an authorship claim. A state the mod invented, took the manpower from, or made land (its own
// definition.csv turning a lake into land) is the mod's, reported and repaired as before (sections 1 and 3).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhmp-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhmp-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const tree = (d) => {
  const out = {};
  const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out[path.relative(d, p).replace(/\\/g, "/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } };
  walk(d);
  return out;
};
const st = (id, provs, manpower) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
const manpowerIn = (d, rel) => { const p = path.join(d, ...rel.split("/")); if (!fs.existsSync(p)) return null; const m = /manpower\s*=\s*(\d+)/.exec(fs.readFileSync(p, "utf8")); return m ? +m[1] : null; };

const DEF = (lake7 = "lake") => ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;false;plains;1", "2;20;0;0;land;false;plains;1",
  "3;30;0;0;land;false;plains;1", "4;40;0;0;land;false;plains;1", "5;50;0;0;land;false;plains;1", "6;60;0;0;land;false;plains;1",
  `7;70;0;0;${lake7};false;${lake7 === "lake" ? "lakes" : "plains"};${lake7 === "lake" ? 0 : 1}`].join("\n") + "\n";
// The base game: three peopled land states, and state 4 — one lake province, no manpower — which no rule reports (no land).
const GAME = dir("game", {
  "map/definition.csv": DEF(),
  "history/states/1-A.txt": st(1, "1 2", 1000),
  "history/states/2-B.txt": st(2, "3 4", 1000),
  "history/states/3-C.txt": st(3, "5 6", 1000),
  "history/states/4-D.txt": st(4, "7", 0),
});
// The dependency ships state 2 with no people (the Novum Vexillum 1371 shape). Same file name: it replaces the game's.
const DEP_STATE_2 = st(2, "3 4", 0);
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "history/states/2-B.txt": DEP_STATE_2 });
const noPeople = (opts) => md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: false }))
  .filter((p) => p.rule === "state_no_manpower").flatMap((p) => p.states || []);

try {
  console.log("\n=== THE CONTROL: the dependency reports its own state for itself ===");
  rec("the dependency, validated on its own over the game, reports state 2", noPeople({ modRoot: DEP, gameRoot: GAME, dependencyRoots: [] }).join() === "2",
    noPeople({ modRoot: DEP, gameRoot: GAME, dependencyRoots: [] }));
  rec("…and the game on its own reports nothing (its no-people state holds no land)", noPeople({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).length === 0,
    noPeople({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }));

  console.log("\n=== 1. an add-on with one problem of its own: the dependency's state is neither reported nor copied in ===");
  {
    const own = { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/1-A.txt": st(1, "1 2", 0) };
    const a = dir("addon", own);
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const told = noPeople(opts);
    rec("THE CONTROL: the validator reports the add-on's own state 1", told.includes(1), told);
    rec("⭐⭐⭐ …and does not report the dependency's state 2", !told.includes(2), told);
    const direct = md.fixStateNoManpower(opts);
    rec("⭐⭐⭐ fixStateNoManpower gives people to the add-on's state only", !!direct && direct.fixed === 1 && (direct.details || []).every((x) => x.state === 1), direct);
    rec("⭐⭐⭐ …and writes no copy of the dependency's 2-B.txt into the add-on", !fs.existsSync(path.join(a, "history", "states", "2-B.txt")), fs.readdirSync(path.join(a, "history", "states")));
    rec("…and the add-on's own state now has people", manpowerIn(a, "history/states/1-A.txt") > 0, manpowerIn(a, "history/states/1-A.txt"));
    // The click, on a fresh copy of the same add-on, so what the direct call wrote cannot hide what the click writes.
    const c = dir("addon-click", { ...own, "descriptor.mod": 'name="AddonClick"\ndependencies={ "Dep" }\n' });
    const copts = { modRoot: c, gameRoot: GAME, dependencyRoots: [DEP] };
    const r1 = md.autoFixMap(copts);
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("⭐⭐ …repaired the add-on's own problem, and only it", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click writes no copy of the dependency's state into the add-on", !fs.existsSync(path.join(c, "history", "states", "2-B.txt")),
      fs.readdirSync(path.join(c, "history", "states")));
    const after1 = tree(c);
    md.autoFixMap(copts);
    rec("⭐ a second click writes nothing", JSON.stringify(after1) === JSON.stringify(tree(c)), Object.keys(tree(c)));
  }

  console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim ===");
  {
    // What a province move in and back out, or any edit Nova materialises, leaves: the dependency's file, byte for byte.
    const a = dir("addon-copy", { "descriptor.mod": 'name="AddonCopy"\ndependencies={ "Dep" }\n', "history/states/2-B.txt": DEP_STATE_2 });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const before = tree(a);
    rec("⭐⭐⭐ the validator does not hand the add-on the dependency's no-people state", noPeople(opts).length === 0, noPeople(opts));
    const r = md.fixStateNoManpower(opts);
    rec("⭐⭐⭐ fixStateNoManpower leaves the copy exactly as the dependency wrote it", !!r && r.fixed === 0 && JSON.stringify(before) === JSON.stringify(tree(a)), { r, manpower: manpowerIn(a, "history/states/2-B.txt") });
  }

  console.log("\n=== 3. …but a state the add-on's own edit left without people IS reported and repaired ===");
  {
    // (a) a new state of the add-on's with no manpower line value
    const a = dir("addon-new", { "descriptor.mod": 'name="AddonNew"\ndependencies={ "Dep" }\n',
      "history/states/3-C.txt": st(3, "5", 1000), "history/states/5-New.txt": st(5, "6", 0) });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("⭐⭐ a state the add-on invented with no manpower is reported (and the dependency's is not)", noPeople(opts).join() === "5", noPeople(opts));
    const r = md.fixStateNoManpower(opts);
    rec("⭐⭐ …and given people", !!r && r.fixed === 1 && manpowerIn(a, "history/states/5-New.txt") > 0, { r, manpower: manpowerIn(a, "history/states/5-New.txt") });

    // (b) the add-on's own definition.csv turns the game's lake 7 into land: state 4 had no people and no land below.
    const b = dir("addon-land", { "descriptor.mod": 'name="AddonLand"\ndependencies={ "Dep" }\n', "map/definition.csv": DEF("land") });
    const bopts = { modRoot: b, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("⭐⭐⭐ a no-people state the add-on made land is the add-on's to answer for", noPeople(bopts).join() === "4", noPeople(bopts));
    const rb = md.fixStateNoManpower(bopts);
    rec("⭐⭐ …and Auto-fix gives it people in the add-on's copy of its file", !!rb && rb.fixed === 1 && manpowerIn(b, "history/states/4-D.txt") > 0,
      { rb, manpower: manpowerIn(b, "history/states/4-D.txt") });
    rec("⭐⭐⭐ …still without copying the dependency's state 2 in", !fs.existsSync(path.join(b, "history", "states", "2-B.txt")), fs.readdirSync(path.join(b, "history", "states")));
  }

  console.log("\n=== 4. the real Novum Vexillum (read-only; only a temp add-on is written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const NV = "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767";
    if (!fs.existsSync(path.join(NV, "history", "states")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
      skip("Novum Vexillum or the base game is not installed — the corpus half did NOT run");
    } else {
      const t0 = Date.now();
      const own = noPeople({ modRoot: NV, gameRoot: VAN, dependencyRoots: [] });
      rec("THE CONTROL: Novum Vexillum reports its own states with no manpower for itself", own.length > 0, own);
      const a = dir("addon-nv", { "descriptor.mod": 'name="NV addon"\ndependencies={ "Novum Vexillum" }\n' });
      const opts = { modRoot: a, gameRoot: VAN, dependencyRoots: [NV] };
      rec(`⭐⭐⭐ an add-on over NV is told none of NV's ${own.length} (${own.join(", ")})`, noPeople(opts).length === 0, noPeople(opts));
      const r = md.fixStateNoManpower(opts);
      rec(`⭐⭐⭐ …Auto-fix's manpower pass gives none of them people (${Date.now() - t0} ms)`, !!r && r.fixed === 0, r);
      rec("⭐⭐⭐ …and copies no NV state file into it", !fs.existsSync(path.join(a, "history", "states")),
        fs.existsSync(path.join(a, "history", "states")) ? fs.readdirSync(path.join(a, "history", "states")) : "");
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a state without manpower the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
