// A script filename containing a SPACE must be written to that file, not to a different one
// (#filename-space).
//
// Every maker's writer carried its own copy of a `path.basename(x).replace(/[^A-Za-z0-9_.-]/g, "")`
// filter, which silently deleted any character it didn't like — spaces included. Spaces are legal and
// real mods use them: Millennium Dawn ships `common/units/equipment/MD_infantry equipment.txt`, and
// stripping the space turns it into `MD_infantryequipment.txt` — which MD ALSO ships. So editing a
// weapon that lives in the first file wrote it into the second, and the mod ended up defining that
// weapon twice, in two files, with the user's edit in whichever one the game doesn't read.
//
// The traversal protection the filter existed for is unchanged: path.basename() removes any directory
// part, and a name that is only dots is rejected instead of being allowed through as a relative path.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const assert = require("assert");
const srv = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const S = srv.sanitizeModFileName;
ok("the helper is exported", typeof S === "function");

// ── the bug ────────────────────────────────────────────────────────────────────────────────────────
ok("a space is kept", S("MD_infantry equipment.txt") === "MD_infantry equipment.txt", S("MD_infantry equipment.txt"));
ok("a spaced name does NOT collide with the unspaced file MD also ships",
  S("MD_infantry equipment.txt") !== "MD_infantryequipment.txt");

// ── traversal is still impossible ──────────────────────────────────────────────────────────────────
ok("a directory part is stripped", S("../../evil.txt", "fb") === "evil.txt", S("../../evil.txt", "fb"));
ok("a windows directory part is stripped", S("..\\..\\evil.txt", "fb") === "evil.txt", S("..\\..\\evil.txt", "fb"));
ok('".." falls back instead of escaping', S("..", "fb") === "fb", S("..", "fb"));
ok('"." falls back', S(".", "fb") === "fb", S(".", "fb"));
ok("a name of only dots falls back", S("....", "fb") === "fb", S("....", "fb"));
ok("an empty name falls back", S("", "fb") === "fb");
ok("a null name falls back", S(null, "fb") === "fb");
ok("with no fallback an unusable name yields the empty string", S("..") === "");

// ── other characters still filtered ────────────────────────────────────────────────────────────────
ok("a quote is dropped", S('we"ird.txt') === "weird.txt", S('we"ird.txt'));
// On Windows path.basename() treats "C:" as a drive prefix and drops it, which is stricter than the
// character filter would have been — either way nothing drive-qualified survives.
ok("a drive-qualified path is reduced to its basename", S("C:evil.txt") === "evil.txt", S("C:evil.txt"));
ok("leading/trailing spaces are trimmed", S("  spaced.txt  ") === "spaced.txt", S("  spaced.txt  "));
// ⚠️ THIS USED TO ASSERT THE OPPOSITE — that runs of spaces collapse to one. That contradicted this file's
// own opening argument, one space deeper: a name that is written to a DIFFERENT file than the one the user
// picked is the whole defect here, and "HBC  - Hebei-Chahar.txt" (two spaces) is shipped by vanilla itself
// and by The Road to 56, "BGR -  Big Grass.txt" and "BLG  - Burning Legion.txt" by Old World Blues.
// Collapsing them lands the save one space away, on a file that may or may not exist.
//
// The collapse existed to fold tabs and newlines into spaces; those are stripped outright as control
// characters now, so runs of ordinary spaces are all it was still touching.
// #filename-sanitizer-stricter-than-the-filesystem
ok("runs of spaces are preserved", S("a    b.txt") === "a    b.txt", S("a    b.txt"));
ok("a tab is still removed", !/\t/.test(S("a\tb.txt")), S("a\tb.txt"));

// ── and the real write path honours it ─────────────────────────────────────────────────────────────
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fnspace-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="FnSpace"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
const edir = path.join(mod, "common", "units", "equipment");
fs.mkdirSync(tdir, { recursive: true });
fs.mkdirSync(edir, { recursive: true });
fs.writeFileSync(path.join(tdir, "probe.txt"), `technologies = {
\tspace_tech = {
\t\tresearch_cost = 1
\t\tstart_year = 1936
\t\tenable_equipments = { spaced_gun }
\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }
\t}
}
`);
// two files whose names differ ONLY by a space — exactly Millennium Dawn's situation
const SPACED = path.join(edir, "MD_probe equipment.txt");
const UNSPACED = path.join(edir, "MD_probeequipment.txt");
fs.writeFileSync(SPACED, "equipments = {\n\tspaced_gun = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t}\n}\n", "utf8");
fs.writeFileSync(UNSPACED, "equipments = {\n\tother_gun = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t}\n}\n", "utf8");
const UNSPACED_BEFORE = fs.readFileSync(UNSPACED, "utf8");

const PORT = 39578, app = srv.createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const bag = cat.equipments || cat.equipment || {};
    const eqById = Array.isArray(bag) ? Object.fromEntries(bag.map((e) => [e.id, e])) : bag;
    const tech = (cat.technologies || []).find((t) => t.id === "space_tech");
    const eq = eqById.spaced_gun;
    ok("the equipment in the spaced file is in the catalog", !!eq, Object.keys(eqById).slice(0, 5));
    ok("the catalog reports its real filename, space and all", eq && eq.fileName === "MD_probe equipment.txt", eq && eq.fileName);

    const edited = Object.assign({}, eq, { statsAll: Object.assign({}, eq.statsAll, { defense: 77 }) });
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ technologies: [tech], equipments: { spaced_gun: edited }, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
    }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
    ok("save → 200", r.s === 200, r.b);

    ok("the edit landed in the SPACED file", /defense\s*=\s*77/.test(fs.readFileSync(SPACED, "utf8")), fs.readFileSync(SPACED, "utf8"));
    ok("the other, similarly-named file is untouched", fs.readFileSync(UNSPACED, "utf8") === UNSPACED_BEFORE, fs.readFileSync(UNSPACED, "utf8"));
    ok("the equipment is NOT now defined in both files", !/spaced_gun\s*=\s*\{/.test(fs.readFileSync(UNSPACED, "utf8")));
    ok("no third equipment file was created", fs.readdirSync(edir).sort().join("|") === ["MD_probe equipment.txt", "MD_probeequipment.txt"].sort().join("|"), fs.readdirSync(edir));

    console.log(`\ntest-mod-filename-spaces: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
