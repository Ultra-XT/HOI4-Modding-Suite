// ⛔ #auto-fix-materialised-43-MB-to-repair-nothing.
//
// "Auto-fix all" repairs the problems on the screen. Each fixer finds its own work independently, and none
// of them asked whether the problem it found was this mod's — so on a Millennium Dawn add-on they set about
// repairing MD's map, and repairing a file means first COPYING it into the mod.
//
// Measured on a brand-new add-on holding a descriptor and one focus tree — 2 files, 67 bytes, with Nova's
// own validator reporting ZERO problems:
//
//     one click  ->  34 files, 43,595,033 bytes, in 48 seconds
//     including MD's whole 34.6 MB provinces.bmp, its 3.9 MB buildings.txt, its definition.csv, six
//     strategic-region files and a country file — none of which the add-on had ever had.
//
// That is worse than a false warning. The add-on now overrides MD's map with a frozen copy, so the next time
// MD updates its map the add-on silently pins the old one, and nothing in Nova undoes it. The modder asked
// to fix a screen that listed nothing.
//
// ⚠️ THE FIX CLOSES THE MEASURED CASE, NOT THE WHOLE CLASS, and this file says so on purpose. Give that same
// add-on ONE problem of its own and the pass runs, fixes it correctly, and still copies the 34.6 MB bitmap.
// The complete answer is per-fixer ownership filtering (the way fixSeaProvinceLeftovers already does it with
// modOwnedStateIds) plus skipping the bitmap passes when no reported problem points at the bitmap.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const walk = (d, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const bytes = (d) => walk(d).reduce((s, p) => s + fs.statSync(p).size, 0);

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

console.log("\n=== a synthetic clean mod: nothing reported, nothing written ===");
{
  // Self-contained, so this half runs with no HOI4 install.
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afxg-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1"].join("\r\n") + "\r\n");
  mk(path.join(g, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(g, "history", "countries", "AAA - A.txt"), "capital = 1\n");

  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afxm-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="Clean"\nsupported_version="1.19.*"\n');
  mk(path.join(m, "common", "national_focus", "t.txt"), "focus_tree = {\n\tid = t\n}\n");

  const before = walk(m).length, beforeBytes = bytes(m);
  const probs = md.validateMapModel(md.buildMapModel({ modRoot: m, gameRoot: g, dependencyRoots: [] }));
  ok(probs.length === 0, "the mod really is reported clean", probs.map((p) => p.rule));

  const r = md.autoFixMap({ modRoot: m, gameRoot: g, dependencyRoots: [] });
  ok(r && r.ok === true, "auto-fix still answers ok", r && r.error);
  ok(r && r.nothingToFix === true, "⭐ …and says there was nothing to fix", r && Object.keys(r));
  ok(typeof (r && r.note) === "string" && /nothing to fix/i.test(r.note),
    "…with a note the page can show", r && r.note);
  ok(walk(m).length === before && bytes(m) === beforeBytes,
    "⭐ …and wrote NOTHING into the mod", { before, after: walk(m).length, beforeBytes, afterBytes: bytes(m) });
}

console.log("\n=== ⚠️ THE CONTROL: a mod with a problem of its own still gets the full pass ===");
{
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afxg2-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1"].join("\r\n") + "\r\n");
  for (const i of [1, 2]) {
    mk(path.join(g, "history", "states", i + ".txt"),
      `state = {\n\tid = ${i}\n\tname = "S${i}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${i} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "history", "countries", "AAA - A.txt"), "capital = 1\n");

  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afxm2-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="Broken"\nsupported_version="1.19.*"\n');
  // The mod's OWN doing: it redefines state 2 without a manpower line.
  mk(path.join(m, "history", "states", "2.txt"),
    'state = {\n\tid = 2\n\tname = "S2"\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');

  const before = md.validateMapModel(md.buildMapModel({ modRoot: m, gameRoot: g, dependencyRoots: [] }));
  ok(before.length > 0, "the mod has a problem of its own", before.map((p) => p.rule));

  const r = md.autoFixMap({ modRoot: m, gameRoot: g, dependencyRoots: [] });
  ok(r && r.ok === true && !r.nothingToFix,
    "⚠️ the guard does NOT fire — the full pass runs", { ok: r && r.ok, nothingToFix: r && r.nothingToFix });
  ok(Object.keys((r && r.fixes) || {}).length > 10,
    "…and every fixer still gets its turn", Object.keys((r && r.fixes) || {}).length);
  const after = md.validateMapModel(md.buildMapModel({ modRoot: m, gameRoot: g, dependencyRoots: [] }));
  ok(after.length < before.length,
    "…and the mod's own problem is actually repaired",
    { before: before.map((p) => p.rule), after: after.map((p) => p.rule) });
}

console.log("\n=== 🈯 the real thing, if Millennium Dawn is installed ===");
if (!fs.existsSync(MD) || !fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("  ..   (Millennium Dawn or the base game is not installed — skipped)");
} else {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afxmd-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="AddonAF"\nsupported_version="1.19.*"\n');
  mk(path.join(m, "common", "national_focus", "t.txt"), "focus_tree = {\n\tid = t\n}\n");
  const beforeBytes = bytes(m);
  ok(beforeBytes < 1000, `the add-on starts at ${beforeBytes} bytes`, beforeBytes);

  const r = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [MD] });
  ok(r && r.nothingToFix === true, "⭐ an MD add-on with no map content has nothing to fix", r && Object.keys(r));
  ok(bytes(m) === beforeBytes,
    "⭐ …and does not gain 43.6 MB of Millennium Dawn's map", { beforeBytes, afterBytes: bytes(m) });
  ok(!fs.existsSync(path.join(m, "map", "provinces.bmp")),
    "…in particular, MD's 34.6 MB provinces.bmp is not copied into it");
}

console.log("\n=== the page repeats the reason ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  ok(/fr\.nothingToFix && fr\.note/.test(SRC),
    "the Auto-fix handler surfaces the note when there was nothing to fix");
  ok(/Nothing auto-fixable was found/.test(SRC),
    "…beside the message it already showed");
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== auto-fix writes nothing when nothing is wrong: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
