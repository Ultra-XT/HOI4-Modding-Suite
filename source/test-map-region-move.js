// Moving a province between strategic regions must be SURGICAL and OVERLAP-PROOF. A province must live in
// EXACTLY ONE strategic region or HOI4 crashes on launch (state_split / province in two regions). The caller's
// fromRegionId can be stale, so the mover ignores it and scans EVERY region, removing the province from all of
// them except the target — the real fix for the "105 provinces in two regions / 33 state-splits" add-on bug.
// Edits map/strategicregions/*.txt in place, preserving each region's id/name and its OTHER provinces.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { moveProvinceToRegion } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

function makeMod(regions) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-region-"));
  const dir = path.join(mod, "map", "strategicregions");
  fs.mkdirSync(dir, { recursive: true });
  for (const r of regions) {
    fs.writeFileSync(path.join(dir, `${r.id}-${r.name}.txt`),
      `strategic_region={\n\tid=${r.id}\n\tname="REGION_${r.name.toUpperCase()}"\n\tprovinces={ ${r.provinces.join(" ")} }\n}\n`, "utf8");
  }
  return mod;
}
const provsOf = (mod, id, name) => {
  const txt = fs.readFileSync(path.join(mod, "map", "strategicregions", `${id}-${name}.txt`), "utf8");
  const m = /provinces\s*=\s*\{([^}]*)\}/.exec(txt);
  return (m ? (m[1].match(/\d+/g) || []) : []).map(Number).sort((a, b) => a - b);
};
const nameOk = (mod, id, name) => {
  const txt = fs.readFileSync(path.join(mod, "map", "strategicregions", `${id}-${name}.txt`), "utf8");
  return new RegExp(`id=${id}\\b`).test(txt) && /name="REGION_/.test(txt);
};
const cleanup = (m) => { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} };

// 1. Clean move: province 502 (only in Alpha) → Beta.
{
  const mod = makeMod([{ id: 1, name: "Alpha", provinces: [501, 502] }, { id: 2, name: "Beta", provinces: [600] }]);
  const r = moveProvinceToRegion({ modRoot: mod, gameRoot: "", dependencyRoots: [], provinceId: 502, fromRegionId: 1, toRegionId: 2 });
  check("clean move reported changed", r.changed === true, JSON.stringify(r));
  check("Alpha lost province 502, kept 501", JSON.stringify(provsOf(mod, 1, "Alpha")) === "[501]", provsOf(mod, 1, "Alpha"));
  check("Beta gained province 502, kept 600", JSON.stringify(provsOf(mod, 2, "Beta")) === "[502,600]", provsOf(mod, 2, "Beta"));
  check("both regions kept id/name", nameOk(mod, 1, "Alpha") && nameOk(mod, 2, "Beta"));
  cleanup(mod);
}

// 2. Overlap heal: province 500 wrongly in BOTH → move to Beta → exactly one region.
{
  const mod = makeMod([{ id: 1, name: "Alpha", provinces: [500, 501] }, { id: 2, name: "Beta", provinces: [500, 600] }]);
  const r = moveProvinceToRegion({ modRoot: mod, gameRoot: "", dependencyRoots: [], provinceId: 500, fromRegionId: 1, toRegionId: 2 });
  check("overlap move reported changed", r.changed === true);
  check("province 500 removed from Alpha (non-target)", !provsOf(mod, 1, "Alpha").includes(500), provsOf(mod, 1, "Alpha"));
  check("province 500 still in Beta (target) — exactly one region now", provsOf(mod, 2, "Beta").includes(500), provsOf(mod, 2, "Beta"));
  check("Alpha kept its other province 501", provsOf(mod, 1, "Alpha").includes(501));
  cleanup(mod);
}

// 3. Multi-source overlap: province 700 in THREE regions → move to region 3 → removed from 1 AND 2.
{
  const mod = makeMod([
    { id: 1, name: "Alpha", provinces: [700, 11] },
    { id: 2, name: "Beta", provinces: [700, 22] },
    { id: 3, name: "Gamma", provinces: [700, 33] },
  ]);
  const r = moveProvinceToRegion({ modRoot: mod, gameRoot: "", dependencyRoots: [], provinceId: 700, fromRegionId: 1, toRegionId: 3 });
  check("multi-source move removedFrom 1 & 2", r.changed && r.removedFrom.includes(1) && r.removedFrom.includes(2), JSON.stringify(r.removedFrom));
  check("province 700 gone from Alpha AND Beta", !provsOf(mod, 1, "Alpha").includes(700) && !provsOf(mod, 2, "Beta").includes(700));
  check("province 700 kept in target Gamma", provsOf(mod, 3, "Gamma").includes(700));
  check("Gamma kept its other province 33", provsOf(mod, 3, "Gamma").includes(33));
  cleanup(mod);
}

// 4. Add where absent: province 999 in no region → move to Beta → Beta gains it; Alpha untouched.
{
  const mod = makeMod([{ id: 1, name: "Alpha", provinces: [11] }, { id: 2, name: "Beta", provinces: [600] }]);
  const r = moveProvinceToRegion({ modRoot: mod, gameRoot: "", dependencyRoots: [], provinceId: 999, fromRegionId: 1, toRegionId: 2 });
  check("adding a not-yet-present province changes the target", r.changed === true && provsOf(mod, 2, "Beta").includes(999), provsOf(mod, 2, "Beta"));
  check("Alpha untouched when province wasn't in it", JSON.stringify(provsOf(mod, 1, "Alpha")) === "[11]");
  cleanup(mod);
}

// 5. Bad inputs.
{
  const mod = makeMod([{ id: 1, name: "Alpha", provinces: [11] }]);
  check("non-numeric province id → error", moveProvinceToRegion({ modRoot: mod, gameRoot: "", provinceId: "x", toRegionId: 1 }).changed === false);
  check("missing target region → error", moveProvinceToRegion({ modRoot: mod, gameRoot: "", provinceId: 11, toRegionId: "" }).error != null);
  cleanup(mod);
}

console.log(`\nMAP-REGION-MOVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
