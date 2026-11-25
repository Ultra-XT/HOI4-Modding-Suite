// A strategic region Nova creates when there is no region anywhere to copy weather from still gets a weather period
// that covers the whole year, in the game's own day.month notation. #a-fallback-weather-period-covers-the-year
//
// THE DEFECT. createStrategicRegion clones a weather block from an existing region; with none to clone (a total
// conversion that replaces map/strategicregions and has not made a region yet) it falls back to MINIMAL_WEATHER_BODY,
// whose single period read `between={ 0.0 364.0 }`. A period's bounds are day.month with both counted from 0, so
// 364.0 is "day 364 of January", not the end of the year.
//
// THE EVIDENCE:
//   * HOI4 wiki, Strategic region modding: between uses 0-based day.month.
//   * Every one of the 18,144 weather periods on the six shipping maps is written that way: every region on every map
//     starts its first period at 0.0 and ends its last at 30.11 (vanilla: 0.0-30.0, 0.1-27.1, … 0.11-30.11). None
//     ends on 364.x.
//   * hoi4.exe (strategicregiontemplate.cpp) logs "%s Region temperature doesn't cover the whole year, ending on %s
//     instead of %s", and the weather manager "Has missing periods".
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weatheryear-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weatheryear-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// day.month, both 0-based → a day of the year from 0. The months' lengths are the calendar HOI4 runs (no leap day),
// and the year's last day is day 30 of month 11.
const MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dayOfYear = (dm) => { const [d, m] = String(dm).split(".").map(Number); if (!(m >= 0 && m < 12) || !(d >= 0 && d < MONTH[m])) return NaN; return MONTH.slice(0, m).reduce((a, b) => a + b, 0) + d; };

try {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weatheryear-game-")); tmps.push(game);
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-weatheryear-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="No regions yet"\nreplace_path="map/strategicregions"\n');
  fs.mkdirSync(path.join(mod, "map", "strategicregions"), { recursive: true });

  const r = md.createStrategicRegion({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: [] });
  rec("the region was created", !!r && r.ok === true && !!r.file, r);
  const text = fs.readFileSync(path.join(mod, ...String(r.file).split("/")), "utf8");
  const periods = [...text.matchAll(/between\s*=\s*\{\s*([\d.]+)\s+([\d.]+)\s*\}/g)].map((m) => [m[1], m[2]]);
  rec("the fallback weather block has at least one period", periods.length >= 1, text.slice(0, 300));
  rec("⭐⭐ every bound is a real day.month", periods.every(([a, b]) => Number.isFinite(dayOfYear(a)) && Number.isFinite(dayOfYear(b))), periods);
  rec("⭐⭐⭐ the first period starts on the year's first day (0.0)", periods.length > 0 && dayOfYear(periods[0][0]) === 0, periods[0]);
  rec("⭐⭐⭐ the last period ends on the year's last day (30.11)", periods.length > 0 && dayOfYear(periods[periods.length - 1][1]) === 364, periods[periods.length - 1]);

  console.log(`\n=== a new region without a weather template covers the whole year: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
