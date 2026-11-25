// ⛔ #a-region-click-injected-the-base-games-weather — "+ New strategic region" MATERIALISED VANILLA'S
// map/weatherpositions.txt INTO A MOD THAT HIDES THE BASE map/.
//
// ensureWeatherPositionsForRegion starts from "the mod's own file, else the base game's" and appends two rows
// for the new region. That fallback is right for an ordinary mod — the file is replaced wholesale, so the base
// rows have to be carried forward or they are lost. It is WRONG for a mod that declares replace_path="map":
// HOI4 hides the base map/ entirely, so copying vanilla's rows in writes weather for hundreds of strategic
// regions that mod has deliberately hidden.
//
// _writeMapLineFile (supply_nodes.txt / railways.txt) and the adjacencies writer both guard exactly this, and
// _writeMapLineFile's comment records the case that taught it — "the erase path copied vanilla's 909 railways
// into a total conversion whose definition has 5 provinces". This caller never adopted the guard.
//
// 📊 MEASURED 2026-09-23 against a running server on a copy of The Road to 56 with its own weatherpositions.txt
// removed, driving POST /api/map/create-region exactly as public/map.js's createRegion() does. Two runs of one
// click, differing ONLY in the descriptor line:
//
//   without replace_path="map" : 590 data rows, 287 vanilla region ids carried in   <- correct
//   with    replace_path="map" : 590 data rows, 287 vanilla region ids carried in   <- the bug
//
// POSITIVE CONTROL, same mod and same descriptor: adding a supply node (through the GUARDED _writeMapLineFile)
// wrote 1 row and suppressed vanilla's 727. So the descriptor line was being read; only this caller ignored it.
//
// The test below is the same shadow probe as a unit test: one base game, two mods differing only in that line.
// Case A is the control — it must still carry the base rows, or the guard has been made too wide.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const { makeWorld, write } = require("./testlib-two-layer-map.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const w = makeWorld("weather-replacepath");
try {
  // A base game with weather rows for several regions. DERIVED below — never typed into an assertion.
  const BASE_IDS = [1, 2, 3, 4, 5, 6];
  const baseText = BASE_IDS.flatMap((id) => [`${id};0.00;9.90;0.00;big`, `${id};0.00;9.90;0.00;big`]).join("\n") + "\n";
  write(w.GAME, { "map/weatherpositions.txt": baseText });
  const baseIdSet = new Set(BASE_IDS.map(String));
  const NEW_ID = 99;

  /** the region ids named by a weatherpositions.txt, as strings */
  const idsIn = (file) => {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8").split(/\r?\n/)
      .filter((l) => l.split(";").length >= 5)
      .map((l) => l.split(";")[0].trim());
  };

  const runOn = (modRoot) => {
    const f = path.join(modRoot, "map", "weatherpositions.txt");
    try { fs.unlinkSync(f); } catch (_) {}   // the "mod has none of its own" case
    const res = md.ensureWeatherPositionsForRegion({ modRoot, gameRoot: w.GAME, dependencyRoots: [] }, NEW_ID);
    return { res, ids: idsIn(f), file: f };
  };

  // ── A. CONTROL: an ordinary mod. The base rows MUST be carried forward. ────────────────────────────
  console.log("\n=== A (control): no replace_path — the base rows must be carried forward ===");
  const modA = w.mod("Plain map mod", {});
  const a = runOn(modA);
  ok(Array.isArray(a.ids), "a weatherpositions.txt was written", a.res);
  const aBase = (a.ids || []).filter((i) => baseIdSet.has(i));
  ok(aBase.length === BASE_IDS.length * 2,
    `…carrying every base row forward (${BASE_IDS.length * 2} expected)`, { got: aBase.length, ids: a.ids });
  ok((a.ids || []).filter((i) => i === String(NEW_ID)).length === 2,
    "…plus two rows for the new region", a.ids);

  // ── B. THE BUG: a mod that hides the base map/. ───────────────────────────────────────────────────
  console.log("\n=== B: replace_path=\"map\" — the base rows must NOT be injected ===");
  for (const [label, line] of [["no spaces", 'replace_path="map"'], ["spaced", 'replace_path = "map"']]) {
    const modB = w.mod("Total conversion (" + label + ")", {
      "descriptor.mod": `name="TC ${label}"\nsupported_version="1.*"\n${line}\n`,
    });
    const b = runOn(modB);
    const bBase = (b.ids || []).filter((i) => baseIdSet.has(i));
    ok(bBase.length === 0,
      `[${label}] no base-game region id is injected`, { injected: bBase, all: b.ids });
    ok((b.ids || []).length === 2 && (b.ids || []).every((i) => i === String(NEW_ID)),
      `[${label}] the file holds exactly the new region's two rows`, b.ids);
  }

  // ── C. a mod with its OWN weatherpositions.txt is still read, replace_path or not ─────────────────
  console.log("\n=== C: the mod's own file always wins ===");
  const modC = w.mod("TC with its own file", {
    "descriptor.mod": `name="TC own"\nsupported_version="1.*"\nreplace_path="map"\n`,
    "map/weatherpositions.txt": "7;1.00;9.90;1.00;small\n7;1.00;9.90;1.00;small\n",
  });
  const cRes = md.ensureWeatherPositionsForRegion({ modRoot: modC, gameRoot: w.GAME, dependencyRoots: [] }, NEW_ID);
  const cIds = idsIn(path.join(modC, "map", "weatherpositions.txt"));
  ok((cIds || []).filter((i) => i === "7").length === 2, "the mod's own rows are kept", cIds);
  ok((cIds || []).filter((i) => i === String(NEW_ID)).length === 2, "…and the new region is appended", cIds);
  ok((cRes && cRes.added || []).every((t) => t === "small"),
    "…using the token the mod's OWN file uses, not the base game's", cRes);
} finally {
  w.cleanup();
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
