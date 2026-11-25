// #110 — base-mod (dependency) technologies feed the prerequisite picker and the save merge, so a
// custom tech can REQUIRE a base-mod (e.g. Millennium Dawn) tech. getBaseModTechnologies reads the
// given dependency root paths with the mod-index scanner and flags every tech read-only (isMod:false,
// isBaseMod:true) so the serializer treats it like vanilla — a `dependencies = { <base_tech> = 1 }`
// (AND) entry on the child, NOT a `path` block we can't write into the base mod's files. (HOI4 tech
// blocks have no `prerequisite` key — that's a focus keyword — so the requirement uses `dependencies`.)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getBaseModTechnologies } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

function makeModRoot(name, techsTxt) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `novamod-${name}-`));
  fs.writeFileSync(path.join(root, "descriptor.mod"), `name="${name}"\n`, "utf8");
  fs.mkdirSync(path.join(root, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(root, "common", "technologies", "base.txt"), techsTxt, "utf8");
  return root;
}

const roots = [];
try {
  // A stand-in "base mod" (think Millennium Dawn) with a couple of techs in an infantry folder.
  const baseRoot = makeModRoot("BaseMod", `technologies = {
  md_infantry_2000 = {
    research_cost = 1
    start_year = 2000
    folder = { name = infantry_folder position = { x = 0 y = 0 } }
  }
  md_marines_2000 = {
    research_cost = 1
    start_year = 2000
    folder = { name = infantry_folder position = { x = 2 y = 0 } }
  }
}
`);
  roots.push(baseRoot);

  // Empty / no roots → empty (and never throws).
  check("no dependency roots → empty array", Array.isArray(getBaseModTechnologies([])) && getBaseModTechnologies([]).length === 0);
  check("undefined arg → empty array (no throw)", getBaseModTechnologies(undefined).length === 0);

  const techs = getBaseModTechnologies([baseRoot]);
  const ids = techs.map((t) => t.id);
  check("reads base-mod tech ids", ids.includes("md_infantry_2000") && ids.includes("md_marines_2000"), JSON.stringify(ids));
  check("flags every base-mod tech read-only (isMod:false, isBaseMod:true)", techs.length === 2 && techs.every((t) => t.isMod === false && t.isBaseMod === true), JSON.stringify(techs));
  check("carries the folder name (for picker grouping)", techs.every((t) => t.folder === "infantry_folder"), JSON.stringify(techs.map((t) => t.folder)));

  // Two dependency roots, with one overriding tech id → first-seen wins, no duplicate.
  const baseRoot2 = makeModRoot("BaseMod2", `technologies = {
  md_infantry_2000 = { research_cost = 9 start_year = 2010 folder = { name = other_folder position = { x = 0 y = 0 } } }
  md_drones_2000 = { research_cost = 1 start_year = 2000 folder = { name = infantry_folder position = { x = 4 y = 0 } } }
}
`);
  roots.push(baseRoot2);
  const merged = getBaseModTechnologies([baseRoot, baseRoot2]);
  const mergedIds = merged.map((t) => t.id);
  check("merges multiple dependency roots, de-duped by id", mergedIds.includes("md_drones_2000") && mergedIds.filter((x) => x === "md_infantry_2000").length === 1, JSON.stringify(mergedIds));

  // A non-existent root is skipped silently.
  check("non-existent root is skipped without throwing", getBaseModTechnologies([path.join(os.tmpdir(), "does-not-exist-xyz")]).length === 0);
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\nBASE-MOD-TECHS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
