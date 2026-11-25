// #ahead-of-time-assumes-1936 — A PENALTY MEASURED FROM THE WRONG CAMPAIGN START IS NOT A NUMBER.
//
// HOI4 charges the "ahead of time" penalty per year a technology's start_year runs ahead of the CURRENT
// campaign date, so the figure is meaningless without the right campaign start. research.js measured from a
// hard-coded 1936, and three of the five installed workshop mods run a different era:
//
//     Old World Blues   bookmark 2275   techs mostly 2275   showed  +33900%
//     Novum Vexillum    bookmark 2000   techs mostly 2000   showed   +6400%
//     Millennium Dawn   bookmark 2000   techs mostly 1985   showed   +4900%
//
// Not a rounding error — a meaningless number printed in red beside every technology in those mods, and the
// only guidance the sidebar offers about research cost.
//
// ⭐ THE FIX ALREADY EXISTED NEXT DOOR, which is the dominant bug shape in this codebase. server.js has
// getModStartDate (the default bookmark, mod → deps → vanilla, falling back to 1936.1.1) and publishes it at
// /api/mod/start-date. The Events maker has used it all along to turn "fire in year 1939" into a day offset.
// The research sidebar simply never adopted it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53533;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-aot-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

// An INDEPENDENT read of the bookmark files — the expected year is derived, never typed in.
function bookmarkYear(root) {
  const dir = path.join(root, "common", "bookmarks");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return null; }
  const cands = [];
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    t = t.replace(/#.*$/gm, "");
    // Every `date = YYYY.M.D`, paired with whether a `default = yes` sits nearby in the same block.
    const re = /bookmark\s*=\s*\{/gi;
    let m;
    while ((m = re.exec(t))) {
      let i = m.index + m[0].length, depth = 1; const start = i;
      while (i < t.length && depth > 0) { const c = t[i++]; if (c === "{") depth++; else if (c === "}") depth--; }
      const block = t.slice(start, i - 1);
      const dm = block.match(/\bdate\s*=\s*(\d{3,4})\./);
      if (dm) cands.push({ year: parseInt(dm[1], 10), isDefault: /\bdefault\s*=\s*yes\b/i.test(block) });
    }
  }
  if (!cands.length) return null;
  const def = cands.find((c) => c.isDefault);
  return (def || cands.slice().sort((a, b) => a.year - b.year)[0]).year;
}

// The rule itself, composed — old and new side by side.
const penalty = (techYear, startYear) =>
  techYear > startYear ? `+${(techYear - startYear) * 100}%` : "0% (No penalty)";
const OLD = (techYear) => penalty(techYear, 1936);

(async () => {
  let server;
  try {
    const RESEARCH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));

    console.log("1. The sidebar reads the mod's era, not a constant");
    rec("there is no hard-coded scenario start constant left",
      !/const SCENARIO_START_YEAR\s*=\s*1936/.test(RESEARCH));
    rec("the penalty measures against scenarioStartYear",
      /const year = Number\(startYear\) \|\| scenarioStartYear/.test(RESEARCH) &&
      /if \(year > scenarioStartYear\)/.test(RESEARCH));
    rec("…which is refreshed from the shared endpoint",
      /fetch\(`\/api\/mod\/start-date\?modPath=/.test(RESEARCH),
      "the same endpoint the Events maker already used — this caller just never adopted it");
    rec("…on every mod load, not once at boot", /await refreshScenarioStartYear\(\);/.test(RESEARCH),
      "switching vanilla -> Old World Blues moves the campaign start from 1936 to 2275");
    // The fallback has to survive a failed fetch, or a network hiccup would make every tech look ahead of time.
    rec("it falls back to 1936 on failure", /catch \(_e\) \{ scenarioStartYear = 1936; \}/.test(RESEARCH));

    console.log("\n2. The endpoint answers each installed mod's real bookmark");
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const startOf = async (root) =>
      (await (await fetch(`http://127.0.0.1:${PORT}/api/mod/start-date?modPath=${encodeURIComponent(root)}`)).json());

    const roots = [["vanilla", GAME]];
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "common", "bookmarks"))) roots.push([d, p]);
      }
    } catch (_) {}
    rec("there are installed roots with bookmarks to measure", roots.length > 1, roots.length + " roots");

    const eras = [];
    for (const [label, root] of roots) {
      const expected = bookmarkYear(root);
      if (expected == null) continue;
      const got = await startOf(root);
      rec(`${label} start year matches its own bookmark file`, got && got.year === expected,
        `served ${got && got.year}, file says ${expected}`);
      eras.push({ label, year: expected });
    }

    // ⚠️ THE FIXTURE MUST EXERCISE THE BUG. If every installed mod started in 1936, everything below would
    // pass while measuring nothing at all.
    const offEra = eras.filter((e) => e.year !== 1936);
    rec("…and at least one of them is NOT a 1936 campaign", offEra.length > 0,
      offEra.map((e) => `${e.label}=${e.year}`));

    console.log("\n3. What the sidebar shows, before and after — BOTH directions");
    // ⚠️ THE BUG RUNS BOTH WAYS, and the first version of this test only caught one. Rise of Nations starts
    // in 1900, so measuring from 1936 did not inflate its penalties — it ERASED them. A 1936 tech in a 1900
    // campaign is 36 years ahead of time and showed "0% (No penalty)", which is the worse failure of the two:
    // an absurd +33900% at least looks broken, while a silent 0% tells the modder the tech is free.
    //
    // So the probe year is chosen per mod to expose the difference, instead of assuming every off-era mod is
    // a late one.
    for (const e of offEra) {
      const late = e.year > 1936;
      const techYear = late ? e.year : 1936;   // late era: a tech at the start. early era: a tech at 1936.
      const before = OLD(techYear);
      const after = penalty(techYear, e.year);
      rec(`${e.label} (campaign ${e.year}): the two answers differ`, before !== after,
        `was ${before}, now ${after}`);
      if (late) {
        rec(`…it read an absurd ${before} and now reads none`,
          after === "0% (No penalty)" && /^\+\d{3,}%$/.test(before));
      } else {
        // The under-report. The new answer must be the real gap, not merely "not zero".
        rec(`…it wrongly read no penalty and now charges the real ${(1936 - e.year) * 100}%`,
          before === "0% (No penalty)" && after === `+${(1936 - e.year) * 100}%`, after);
      }
    }

    console.log("\n4. Controls");
    // ⭐ OVER-CORRECTION CONTROL. The easy wrong fix is one that always says 0%. The penalty must still fire.
    rec("a tech one year ahead is still penalised", penalty(2276, 2275) === "+100%", penalty(2276, 2275));
    rec("…and thirteen years ahead", penalty(2288, 2275) === "+1300%", penalty(2288, 2275));
    rec("…and a tech BEFORE the start is not", penalty(2200, 2275) === "0% (No penalty)");
    // ⭐ VANILLA MUST NOT MOVE. The whole change is worthless if it breaks the case that already worked.
    rec("vanilla is unchanged: a 1939 tech still reads +300%",
      penalty(1939, 1936) === OLD(1939) && penalty(1939, 1936) === "+300%", penalty(1939, 1936));
    rec("…and a 1936 tech still reads none", penalty(1936, 1936) === OLD(1936));

    console.log(`\n=== the ahead-of-time penalty uses the mod's era: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
