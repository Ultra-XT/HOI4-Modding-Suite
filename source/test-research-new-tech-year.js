// A tech created in a mod whose tree runs 1965→2035 must be born with a year off THAT ruler
// (#era-aware-start-year).
//
// createNewNode computed `startYear = 1936 + y * 2` — vanilla's era and vanilla's spacing, hardcoded.
// Every other path that turns a row into a year already used getYearFromCoord, which reads the folder's
// real year columns and extrapolates from their actual slope. So a tech created in Millennium Dawn's
// infantry tree (rows @1965 = 0, @1970 = 2, … @2035 = 28) was born with start_year = 1938: researchable
// from the first day of a 1965 scenario, carrying none of the ahead-of-time research cost the row it
// sits on implies.
//
// getYearFromCoord is client-side and not exported, so it is lifted out of research.js and exercised
// directly against both rulers — that tests the behaviour, not just the presence of a call.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");

// ── the create path must not hardcode vanilla's era ─────────────────────────────────────────────────
ok("createNewNode no longer hardcodes 1936 + y*2", !/1936 \+ Math\.max\(0, y\) \* 2/.test(client),
  (/const startYear = [^\n]+/.exec(client) || [])[0]);
ok("createNewNode reads the year off the folder's ruler",
  /const startYear = getYearFromCoord\(Math\.max\(0, y\)\);/.test(client));

// ── lift getYearFromCoord out and run it against real rulers ────────────────────────────────────────
const start = client.indexOf("function getYearFromCoord(y) {");
ok("getYearFromCoord was found in the client", start !== -1);
let depth = 0, end = -1;
for (let i = client.indexOf("{", start); i < client.length; i++) {
  if (client[i] === "{") depth++;
  else if (client[i] === "}") { depth--; if (!depth) { end = i; break; } }
}
const fnText = client.slice(start, end + 1);

const run = (cols, y) => {
  // `scenarioStartYear` (was the constant SCENARIO_START_YEAR): #ahead-of-time-assumes-1936 made the campaign
  // start a per-mod value read from the mod's default bookmark, because three of five installed mods do not
  // start in 1936. It is only the empty-ruler fallback here, so 1936 remains the right value to inject —
  // this sandbox is testing the ruler, not the era lookup.
  const ctx = { getYearCols: () => cols, scenarioStartYear: 1936, out: null };
  vm.createContext(ctx);
  vm.runInContext(`${fnText}\nout = getYearFromCoord(${y});`, ctx);
  return ctx.out;
};

// Millennium Dawn's infantry folder, as authored in infantry.txt
const MD_COLS = [
  { y: 0, year: 1965 }, { y: 2, year: 1970 }, { y: 4, year: 1975 }, { y: 6, year: 1980 },
  { y: 8, year: 1985 }, { y: 10, year: 1990 }, { y: 12, year: 1995 }, { y: 14, year: 2000 },
];
ok("MD row 0 → 1965", run(MD_COLS, 0) === 1965, run(MD_COLS, 0));
ok("MD row 2 → 1970", run(MD_COLS, 2) === 1970, run(MD_COLS, 2));
ok("MD row 1 (between rows) → 1965, the nearer column", run(MD_COLS, 1) === 1965, run(MD_COLS, 1));
ok("MD row 10 → 1990", run(MD_COLS, 10) === 1990, run(MD_COLS, 10));
// Past the last column it extrapolates on the last pair's real slope: 1995→2000 over two rows is
// 2.5 years per row, so row 20 is 2000 + 6*2.5.
ok("MD row 20 (past the ruler) extrapolates on the real slope → 2015", run(MD_COLS, 20) === 2015, run(MD_COLS, 20));
ok("the old hardcode would have been wrong for every one of those",
  [0, 2, 1, 10, 20].every((y) => 1936 + y * 2 !== run(MD_COLS, y)),
  [0, 2, 1, 10, 20].map((y) => `y=${y}: hardcode ${1936 + y * 2} vs ruler ${run(MD_COLS, y)}`));

// The BASE GAME's own infantry rail, read out of its countrytechtreeview.gui: 1918, 1936, 1938, 1939,
// 1940, … one column per 140px. It is not uniform — there is an 18-year gap, then 2, then 1 per column
// — so `1936 + y*2` was wrong for vanilla as well, not only for late-era mods.
const VANILLA_COLS = [
  { y: 0, year: 1918 }, { y: 1, year: 1936 }, { y: 2, year: 1938 }, { y: 3, year: 1939 },
  { y: 4, year: 1940 }, { y: 5, year: 1941 }, { y: 6, year: 1942 }, { y: 7, year: 1943 },
];
ok("vanilla column 0 → 1918", run(VANILLA_COLS, 0) === 1918, run(VANILLA_COLS, 0));
ok("vanilla column 1 → 1936", run(VANILLA_COLS, 1) === 1936, run(VANILLA_COLS, 1));
ok("vanilla column 4 → 1940", run(VANILLA_COLS, 4) === 1940, run(VANILLA_COLS, 4));
ok("vanilla column 7 → 1943", run(VANILLA_COLS, 7) === 1943, run(VANILLA_COLS, 7));
ok("the hardcode disagreed with the BASE GAME's rail too",
  [0, 2, 4, 7].some((y) => run(VANILLA_COLS, y) !== 1936 + y * 2),
  [0, 2, 4, 7].map((y) => `col ${y}: hardcode ${1936 + y * 2} vs rail ${run(VANILLA_COLS, y)}`));

// A folder with no ruler at all must not throw or invent a year
ok("no columns → the scenario start year", run([], 3) === 1936, run([], 3));

console.log(`\ntest-research-new-tech-year: ${pass}/${total} checks passed`);
process.exitCode = pass === total && total >= 15 ? 0 : 1;
