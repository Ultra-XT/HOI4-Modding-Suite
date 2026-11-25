// Auto-fix leaves a capital the mod only inherited alone: one click never copies a base layer's country files into a mod
// to re-point capitals the validator does not report. #auto-fix-leaves-a-capital-the-mod-inherited
//
// THE DEFECT. capital_state_owned_by_other reports a country whose capital is another country's state only when the
// mod could have caused it (it ships the capital state, or sets that capital itself) AND the layer below does not
// already have the same mismatch (capitalMismatchIsTheModsOwn). fixForeignCapitals, which autoFixMap runs on every
// click, asked neither question. The dominant shape: the gate already existed next door and the fixer never adopted it.
//
// MEASURED on the base commit 113d5b5, found by the same probe as #auto-fix-leaves-a-coastal-flag-the-mod-inherited
// (GET /api/map/validate, then POST /api/map/auto-fix { modPath }, on a mkdtemp add-on declaring the installed Novum
// Vexillum with one problem of its own): the validator reported no capital problem, and ONE click wrote five of NV's
// history/countries files into the add-on — AFG (267 → 824), ELN (306 → 1219), FAR (306 → 910), SPF (1198 → 1197) and
// UNI (540 → 843), 7.8-10.8 KB each. Each copy then overrides NV's own country file: every later NV update to those
// five countries' history is silently lost to the add-on.
//
// THE FIX. The rule's gate is one helper, capitalOwnedByOtherIsTheModsOwn, and fixForeignCapitals asks it before it
// re-points a capital whose state exists and holds land. A capital pointing at a deleted or empty state is re-pointed as
// before: those rules (capital_state_missing, empty_capital_state) report whoever ships the files.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhcap-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhcap-" + tag + "-")); tmps.push(d);
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
const st = (id, owner, provs, manpower = 1000) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;

// The layer below: AAA owns state 1 but its capital is state 2, which BBB owns — a mismatch the base ships. BBB owns
// states 2 and 3 and its own capital.
const GAME = dir("game", {
  "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1",
    "3;0;0;200;land;false;plains;1", "4;200;200;0;land;false;plains;1", "5;0;200;200;land;false;plains;1", "6;200;0;200;land;false;plains;1"].join("\n") + "\n",
  "history/states/1-A.txt": st(1, "AAA", "1 2"),
  "history/states/2-B.txt": st(2, "BBB", "3 4"),
  "history/states/3-C.txt": st(3, "BBB", "5 6"),
  "history/countries/AAA.txt": 'capital = 2\noob = "AAA_1936"\n',
  "history/countries/BBB.txt": 'capital = 2\noob = "BBB_1936"\n',
});
const capitalProblems = (opts) => md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: false }))
  .filter((p) => p.rule === "capital_state_owned_by_other").flatMap((p) => (p.items || []).map((i) => `${i.tag}:${i.capital}`));

try {
  console.log("\n=== THE CONTROL: the layer below reports its own mismatch for itself ===");
  rec("the base game, validated on its own, reports AAA's capital", capitalProblems({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).join() === "AAA:2",
    capitalProblems({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }));

  console.log("\n=== 1. an add-on with one problem of its own: one click copies no country file in ===");
  {
    const a = dir("addon", { "descriptor.mod": 'name="Addon"\n', "history/states/3-C.txt": st(3, "BBB", "5 6", 0) });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("the validator tells the add-on nothing about AAA's capital", capitalProblems(opts).length === 0, capitalProblems(opts));
    const direct = md.fixForeignCapitals(opts);
    rec("⭐⭐⭐ fixForeignCapitals re-points nothing of the base's", !!direct && direct.fixed === 0, direct);
    rec("⭐⭐⭐ …and writes no country file into the add-on", !fs.existsSync(path.join(a, "history", "countries")),
      fs.existsSync(path.join(a, "history", "countries")) ? fs.readdirSync(path.join(a, "history", "countries")) : "");
    // The click, on a fresh copy of the same add-on, so what the direct call wrote cannot hide what the click writes.
    const c = dir("addon-click", { "descriptor.mod": 'name="AddonClick"\n', "history/states/3-C.txt": st(3, "BBB", "5 6", 0) });
    const copts = { modRoot: c, gameRoot: GAME, dependencyRoots: [] };
    const r1 = md.autoFixMap(copts);
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click writes no country file into the add-on", !fs.existsSync(path.join(c, "history", "countries")) && ((r1.fixes || {}).capitals || {}).fixed === 0,
      (r1.fixes || {}).capitals);
    const after1 = tree(c);
    md.autoFixMap(copts);
    rec("⭐ a second click writes nothing", JSON.stringify(after1) === JSON.stringify(tree(c)), Object.keys(tree(c)));
  }

  console.log("\n=== 2. …but a capital the add-on's own edit took away IS re-pointed ===");
  {
    // The add-on hands state 2 to AAA. AAA now owns its capital; BBB's capital is now AAA's state — the add-on's doing.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\n', "history/states/2-B.txt": st(2, "AAA", "3 4") });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("THE CONTROL: the validator reports BBB's capital, and only it", capitalProblems(opts).join() === "BBB:2", capitalProblems(opts));
    const r = md.fixForeignCapitals(opts);
    rec("⭐⭐⭐ fixForeignCapitals re-points BBB's capital", !!r && r.fixed === 1 && (r.details || []).some((d) => d.tag === "BBB" && d.to === 3), r);
    const bbb = path.join(a, "history", "countries", "BBB.txt");
    rec("⭐⭐ …onto BBB's own state, in the add-on's copy of BBB's file", fs.existsSync(bbb) && /capital\s*=\s*3\b/.test(fs.readFileSync(bbb, "utf8")),
      fs.existsSync(bbb) ? fs.readFileSync(bbb, "utf8") : "(not written)");
    rec("⭐ …and AAA's file, which the add-on's edit made right, is not copied in", !fs.existsSync(path.join(a, "history", "countries", "AAA.txt")));
    rec("…and the validator has nothing left to report", capitalProblems(opts).length === 0, capitalProblems(opts));
  }

  console.log("\n=== 3. the real Novum Vexillum (read-only; only a temp add-on is written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const NV = "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767";
    if (!fs.existsSync(path.join(NV, "history", "countries")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
      skip("Novum Vexillum or the base game is not installed — the corpus half did NOT run");
    } else {
      const t0 = Date.now();
      const own = capitalProblems({ modRoot: NV, gameRoot: VAN, dependencyRoots: [] });
      rec("THE CONTROL: Novum Vexillum reports capitals owned by another country for itself", own.length > 0, own);
      const a = dir("addon-nv", { "descriptor.mod": 'name="NV addon"\ndependencies={ "Novum Vexillum" }\n' });
      const r = md.fixForeignCapitals({ modRoot: a, gameRoot: VAN, dependencyRoots: [NV] });
      rec(`⭐⭐⭐ an add-on over NV has none of NV's ${own.length} re-pointed (${Date.now() - t0} ms)`, !!r && r.fixed === 0, r);
      rec("⭐⭐⭐ …and no NV country file is copied into it", !fs.existsSync(path.join(a, "history", "countries")),
        fs.existsSync(path.join(a, "history", "countries")) ? fs.readdirSync(path.join(a, "history", "countries")) : "");
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a capital the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
