// Applying Nova's year row must REPLACE what the folder draws, not add a second row on top of it
// (#hide-original-years).
//
// The year writer wrapped its labels in a `# >>> NOVA_YEARS … # <<< NOVA_YEARS` sentinel so re-applying
// only ever touched Nova's own — and deliberately left the mod's original year labels alone. On
// Millennium Dawn's infantry folder that produced eight originals PLUS eight Nova copies at identical
// positions with identical text: sixteen overlapping labels in-game. Worse, moving a year wrote Nova's
// copy at the new spot while the original stayed at the old one, so the year appeared twice and the
// move looked like it had not worked — which is exactly the complaint the year editor was built to fix.
//
// The originals are now commented out inside their own sentinel rather than deleted, so removing Nova's
// years restores the file byte for byte. A commented line is invisible to the game and to
// bracesAreBalanced (which strips comments before counting), so the structure is untouched.
//
// The hidden sentinel is NOT called NOVA_YEARS_HIDDEN: "NOVA_YEARS" is a prefix of that, so the
// existing matchers grabbed the hidden region first and the editor read back a garbage marker.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ylhide-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="YearHide"\nsupported_version="1.19.*"\n');
const GUI = path.join(mod, "interface", "countrytechtreeview.gui");
fs.mkdirSync(path.dirname(GUI), { recursive: true });

// A folder carrying its own year row, shaped like Millennium Dawn's, plus a non-year textbox and a
// 4-digit number that is NOT a year — neither may be touched.
const yearBox = (name, year, x) => [
  "\t\t\tinstantTextBoxType = {",
  `\t\t\t\tname = "${name}"`,
  `\t\t\t\tposition = { x = ${x} y = 50 }`,
  '\t\t\t\tfont = "hoi_36header"',
  "\t\t\t\tborderSize = { x = 0 y = 0}",
  `\t\t\t\ttext = "${year}"`,
  "\t\t\t\tmaxWidth = 170",
  "\t\t\t\tmaxHeight = 32",
  "\t\t\t\tformat = left",
  "\t\t\t}",
].join("\n");
const ORIGINAL = [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  '\t\tname = "countrytechtreeview"',
  "\t\tcontainerWindowType = {",
  '\t\t\tname = "infantry_folder"',
  yearBox("infantry_year2", 1965, 140),
  yearBox("infantry_year3", 1975, 420),
  yearBox("infantry_year4", 1985, 700),
  // not a year label: no 4-digit text
  "\t\t\tinstantTextBoxType = {",
  '\t\t\t\tname = "infantry_title"',
  "\t\t\t\tposition = { x = 10 y = 10 }",
  '\t\t\t\ttext = "INFANTRY_TITLE"',
  "\t\t\t}",
  // a 4-digit number that is NOT a plausible year
  "\t\t\tinstantTextBoxType = {",
  '\t\t\t\tname = "infantry_cost"',
  "\t\t\t\tposition = { x = 20 y = 20 }",
  '\t\t\t\ttext = "5000"',
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(GUI, ORIGINAL, "utf8");

const gui = () => fs.readFileSync(GUI, "utf8");
// what the GAME sees: comment lines do not exist
const live = () => gui().split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const liveNames = () => [...live().matchAll(/name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
const balanced = (t) => { const s = t.replace(/#.*$/gm, ""); return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length; };

const PORT = 39579, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (markers) => fetch(`http://127.0.0.1:${PORT}/api/research/folder-year-labels`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: mod, folder: "infantry_folder", markers }),
  }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
  const get = () => fetch(`http://127.0.0.1:${PORT}/api/research/folder-year-labels?modPath=${encodeURIComponent(mod)}&folder=infantry_folder`).then((r) => r.json());
  try {
    ok("the fixture starts with three live year labels",
      liveNames().filter((n) => /^infantry_year/.test(n)).length === 3, liveNames());

    // apply a row, moved 5px right of the originals
    const markers = [
      { id: "yr_1", year: 1965, x: 145, y: 50, fontSize: 20, w: 170, h: 32, format: "left" },
      { id: "yr_2", year: 1975, x: 425, y: 50, fontSize: 20, w: 170, h: 32, format: "left" },
      { id: "yr_3", year: 1985, x: 705, y: 50, fontSize: 20, w: 170, h: 32, format: "left" },
    ];
    const r = await post(markers);
    ok("apply → 200", r.s === 200, r.b);
    ok("Nova's three labels are live", liveNames().filter((n) => /^nova_year_/.test(n)).length === 3, liveNames());
    ok("NONE of the mod's own year labels still draw (the fix)",
      liveNames().filter((n) => /^infantry_year/.test(n)).length === 0, liveNames());
    ok("the originals are commented out, not deleted", /#\s*name = "infantry_year2"/.test(gui()));
    ok("a non-year textbox is untouched", liveNames().includes("infantry_title"));
    ok("a 4-digit number that isn't a year is untouched", liveNames().includes("infantry_cost"));
    ok("the gui is still brace-balanced", balanced(gui()));

    // the editor must be able to read its own row back
    const rb = await get();
    const names = (rb.years || rb.markers || []).map((y) => y.name || y.id);
    ok("the server reads back exactly Nova's three labels", names.length === 3 && names.every((n) => /nova_year_/.test(String(n))), names);

    // re-applying must be idempotent, not stack hidden regions
    const r2 = await post(markers);
    ok("re-apply → 200", r2.s === 200, r2.b);
    ok("re-applying does not duplicate Nova's labels", liveNames().filter((n) => /^nova_year_/.test(n)).length === 3, liveNames());
    ok("re-applying does not stack hidden regions",
      (gui().match(/NOVA_ORIGINAL_YEARS \(/g) || []).length === 3, (gui().match(/NOVA_ORIGINAL_YEARS \(/g) || []).length);
    ok("still brace-balanced after a re-apply", balanced(gui()));

    // ── an authored year Nova does NOT draw must keep drawing ─────────────────────────────────────
    // The applied set comes from a ruler the editor auto-detects from the tab's TECHS, not from the
    // folder's authored labels, so it can be SMALLER than what the folder draws. Hiding those too
    // would trade a duplicate for a disappearance — the worse failure. #hide-original-years
    const r4 = await post([markers[0]]);   // covers only 1965; 1975 and 1985 are Nova-less
    ok("partial apply → 200", r4.s === 200, r4.b);
    ok("the covered year's original is hidden", !liveNames().includes("infantry_year2"), liveNames());
    ok("an UNCOVERED authored year still draws", liveNames().includes("infantry_year3"), liveNames());
    ok("the other uncovered one still draws too", liveNames().includes("infantry_year4"), liveNames());
    ok("only Nova's single label is live", liveNames().filter((n) => /^nova_year_/.test(n)).length === 1, liveNames());
    ok("still brace-balanced after a partial apply", balanced(gui()));

    // an original whose POSITION Nova took over is hidden even if the year was re-labelled
    const r5 = await post([{ id: "yr_x", year: 1999, x: 420, y: 50, fontSize: 20, w: 170, h: 32, format: "left" }]);
    ok("re-label apply → 200", r5.s === 200, r5.b);
    ok("the original standing at that spot is hidden", !liveNames().includes("infantry_year3"), liveNames());
    ok("originals elsewhere are still drawing", liveNames().includes("infantry_year2") && liveNames().includes("infantry_year4"), liveNames());

    // removing restores the file exactly
    const r3 = await post([]);
    ok("remove → 200", r3.s === 200, r3.b);
    ok("removing Nova's years restores the file BYTE-FOR-BYTE", gui() === ORIGINAL, gui());
    ok("the mod's own labels draw again", liveNames().filter((n) => /^infantry_year/.test(n)).length === 3);

    console.log(`\ntest-research-year-labels-hide: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 25 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
