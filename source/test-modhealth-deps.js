// Regression test: Mod Health validation must treat references INTO a declared dependency
// (e.g. Millennium Dawn for an add-on) as valid, not as broken references. Without dependency
// resolution, an add-on event doing set_technology = { <MD tech> = 1 } would be wrongly flagged.
const fs = require("fs");
const os = require("os");
const path = require("path");
const modIndex = require("./mod-index.js");
const { constants } = require("./server.js");

const MD = "d:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";
const VANILLA = constants.resolveHoi4GameRoot();

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

(function main() {
  // 1. Dependency id set is rich and bucketed correctly.
  // ⚠️ SHAPE CHANGED 2026-09-07: getDependencyIdSet now returns { ids, unloaded }. `ids` is what a reference
  // may resolve against; `unloaded` is what this mod's replace_path took away, kept only so the message can
  // say which situation the modder is in. Resolution must never consult `unloaded` — see
  // test-mod-health-does-not-resolve-against-unloaded-content.js.
  const depIds = modIndex.getDependencyIdSet([MD]).ids;
  check("dep id set has techs", depIds.tech && depIds.tech.size > 100, depIds.tech && depIds.tech.size);
  check("dep id set has ideas", depIds.idea && depIds.idea.size > 100, depIds.idea && depIds.idea.size);

  // 2. Find a technology that exists in MD but NOT in vanilla (so the ref is unambiguously cross-mod).
  const vanIds = modIndex.getDependencyIdSet([VANILLA]).ids; // same scanners → vanilla id buckets
  const mdOnlyTech = [...(depIds.tech || [])].find((t) => !(vanIds.tech && vanIds.tech.has(t)));
  check("found an MD-only technology to reference", !!mdOnlyTech, mdOnlyTech);
  if (!mdOnlyTech) { console.log(`\nMODHEALTH-DEPS TEST: ${pass} passed, ${fail} failed`); process.exit(1); }

  // 3. Build a tiny synthetic add-on whose event references that MD tech.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-deps-"));
  try {
    const evDir = path.join(tmp, "events");
    fs.mkdirSync(evDir, { recursive: true });
    fs.writeFileSync(
      path.join(evDir, "test_events.txt"),
      `country_event = {\n\tid = testdep.1\n\tis_triggered_only = yes\n\timmediate = {\n\t\tset_technology = { ${mdOnlyTech} = 1 }\n\t}\n\toption = { name = testdep.1.a }\n}\n`,
      "utf8"
    );

    const refIsTo = (p) => p.rule === "broken_reference" && p.refId === mdOnlyTech;

    // WITHOUT dependency roots → the MD tech is unknown → broken_reference expected.
    const noDeps = modIndex.buildModIndex(tmp, { vanillaRoot: VANILLA });
    check("WITHOUT deps: MD tech reference is flagged broken (test is meaningful)",
      noDeps.problems.some(refIsTo),
      "problems=" + noDeps.problems.filter((p) => p.rule === "broken_reference").map((p) => p.refId).join(","));

    // WITH dependency roots → the MD tech is known → NO broken_reference.
    const withDeps = modIndex.buildModIndex(tmp, { vanillaRoot: VANILLA, dependencyRoots: [MD] });
    check("WITH deps: MD tech reference is NOT flagged broken",
      !withDeps.problems.some(refIsTo),
      "problems=" + withDeps.problems.filter((p) => p.rule === "broken_reference").map((p) => p.refId).join(","));

    // Sanity: a genuinely bogus reference is STILL flagged even with deps (no over-suppression).
    fs.writeFileSync(
      path.join(evDir, "test_events.txt"),
      `country_event = {\n\tid = testdep.2\n\tis_triggered_only = yes\n\timmediate = {\n\t\tset_technology = { totally_made_up_tech_xyz = 1 }\n\t}\n\toption = { name = testdep.2.a }\n}\n`,
      "utf8"
    );
    modIndex.clearVanillaCache(); // force a clean rescan of the changed file
    const bogus = modIndex.buildModIndex(tmp, { vanillaRoot: VANILLA, dependencyRoots: [MD] });
    check("WITH deps: a bogus reference is still flagged (no over-suppression)",
      bogus.problems.some((p) => p.rule === "broken_reference" && p.refId === "totally_made_up_tech_xyz"),
      "");
  } finally {
    rmrf(tmp);
  }

  console.log(`\nMODHEALTH-DEPS TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
