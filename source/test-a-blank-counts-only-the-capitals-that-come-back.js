// ⛔ #a-blank-counts-capitals-its-own-files-already-hide — THE ADVISORY COUNTED CAPITALS THE MOD ALREADY HID.
//
// Delete map's survivor report tells the modder what a blank could NOT blank, and tells them to add
// replace_path lines to descriptor.mod to stop it loading — a change that alters what the WHOLE mod loads.
// Its two halves are not symmetric, and the capitals branch was written as if they were:
//
//   history/states     the mod's files are DELETED, so every base state really does resurface.
//   history/countries  the mod's files are KEPT. The blank strips `capital = N` out of them and writes
//                      them back, so a base file the mod ships a same-named copy of stays hidden —
//                      exactly as hidden as it was before the click.
//
// HOI4 merges history/countries BY FILENAME, and buildMapModel already does the same (effCountryFiles,
// keyed on the lowercased filename; see readCountryCapitalFiles). blankSurvivors counted base TAGS
// instead, so it reported every capital the base game ships whether the mod overrode it or not.
//
// 📊 Measured 2026-09-17 by driving POST /api/map/blank-to-sea on a copy of each installed map and then
// asking GET /api/map/model the same question a moment later:
//
//     map              advisory said   model found
//     Millennium Dawn            363           215
//     Road to 56                 363            28
//     Old World Blues            363           356
//     Novum Vexillum             363           149
//     Rise of Nations            363            35
//
// On Road to 56 the Save report claimed 363 capitals were still loaded while ⚠ Map Errors, reading the
// same mod on the same tick, found 28 — a thirteenfold cry-wolf on the one line that is supposed to tell
// the modder how much of the blank did not happen.
//
// ⭐⭐ WHY NOBODY SAW IT: every fixture in test-delete-map-says-what-it-cannot-blank.js is a mod that ships
// NO country files of its own, so shadowing never arises and tags and filenames agree. That is the same
// "one fixture shape where it works" that hid #delete-map-cannot-blank-an-overlay itself.
//
// THE ASSERTION IS DERIVED, NEVER TYPED: the advisory is compared against buildMapModel's own count on the
// blanked mod. If the two readers ever disagree again, on any shape, this fails — no number in this file
// has to be kept up to date for that to work.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];

// A self-contained base "game": three states, three countries, each with a capital.
function makeBase() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bcc-game-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3].map((i) => `${i};${i * 60};0;0;land;false;plains;1`)).join("\r\n") + "\r\n");
  for (const i of [1, 2, 3]) {
    mk(path.join(g, "history", "states", i + ".txt"),
      `state = {\n\tid = ${i}\n\tname = "S${i}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${i} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "history", "countries", "AAA - A.txt"), "capital = 1\n");
  mk(path.join(g, "history", "countries", "BBB - B.txt"), "capital = 2\n");
  mk(path.join(g, "history", "countries", "CCC - C.txt"), "capital = 3\n");
  return g;
}
const mod = (tag, desc) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bcc-" + tag + "-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), desc);
  return d;
};

// The one question, asked of both readers. `capitals` in the model is tag -> id for every capital the
// game will actually load, so its size IS the number of capitals that came back.
const modelCapitals = (modRoot, gameRoot, deps) =>
  Object.keys(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: deps || [] }).capitals || {}).length;

const base = makeBase();

console.log("\n=== ⭐ a mod that shadows two of the three base country files ===");
{
  // The mod ships its own AAA and BBB files, under the base game's own filenames, each with a capital of
  // its own. It does NOT ship CCC. After the blank the mod's two files are still there with their capital
  // lines stripped, so only CCC's capital can come back.
  const m = mod("shadow", 'name="S"\nreplace_path="history/states"\n');
  mk(path.join(m, "history", "countries", "AAA - A.txt"), "capital = 1\noob = \"AAA_1936\"\n");
  mk(path.join(m, "history", "countries", "BBB - B.txt"), "capital = 2\n");
  mk(path.join(m, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');

  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok(r.changed === true, "the blank runs", r.error);

  const found = modelCapitals(m, base, []);
  ok(r.survivors.capitals === found,
    `⭐ THE ADVISORY AGREES WITH THE MODEL — it says ${r.survivors.capitals}, the model finds ${found}`,
    { advisory: r.survivors, model: found });

  // …and the shape is the one described, not a coincidence of both being zero.
  ok(found === 1, "…and exactly one capital came back: the base file the mod does not shadow", found);
  ok(fs.existsSync(path.join(m, "history", "countries", "AAA - A.txt")),
    "…because the blank KEEPS the mod's country files (it strips the capital, it does not delete the file)");
  ok(!/capital\s*=/.test(fs.readFileSync(path.join(m, "history", "countries", "AAA - A.txt"), "utf8")),
    "…with its own capital gone");
  ok(/oob\s*=/.test(fs.readFileSync(path.join(m, "history", "countries", "AAA - A.txt"), "utf8")),
    "…and the rest of that file untouched — a strip, not a rebuild");
  ok((r.survivors.needs || []).join(",") === "history/countries",
    "…and the descriptor advice still names the path that would stop the one survivor", r.survivors.needs);
}

console.log("\n=== a mod that shadows EVERY base country file is told nothing survives ===");
{
  const m = mod("all", 'name="A"\nreplace_path="history/states"\n');
  for (const [f, c] of [["AAA - A.txt", 1], ["BBB - B.txt", 2], ["CCC - C.txt", 3]]) {
    mk(path.join(m, "history", "countries", f), `capital = ${c}\n`);
  }
  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  const found = modelCapitals(m, base, []);
  ok(r.survivors.capitals === found, `the advisory agrees with the model (${r.survivors.capitals} vs ${found})`,
    { advisory: r.survivors, model: found });
  ok(r.survivors.capitals === 0, "⭐ nothing survives, so nothing is claimed — and no descriptor advice is given",
    r.survivors);
  ok((r.survivors.needs || []).indexOf("history/countries") === -1,
    "…so the modder is not sent to edit descriptor.mod for a problem they do not have", r.survivors.needs);
}

console.log("\n=== the control: a mod that shadows NOTHING still reports every base capital ===");
{
  // This is the shape the older fixtures use. It must keep answering exactly as it did — the fix narrows
  // the count to what comes back, and here everything does.
  const m = mod("none", 'name="N"\nreplace_path="history/states"\n');
  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  const found = modelCapitals(m, base, []);
  ok(r.survivors.capitals === found, `the advisory agrees with the model (${r.survivors.capitals} vs ${found})`,
    { advisory: r.survivors, model: found });
  ok(r.survivors.capitals === 3, "⚠️ THE CONTROL: all three base capitals are still reported", r.survivors);
}

console.log("\n=== a DEPENDENCY's country file is shadowed the same way ===");
{
  // The add-on inherits from a total conversion. The conversion replaces history/countries, so the base
  // game is hidden below it; the add-on ships a same-named copy of one of the conversion's own files.
  const dep = mod("dep", 'name="D"\nreplace_path="history/states"\nreplace_path="history/countries"\n');
  mk(path.join(dep, "history", "states", "9.txt"),
    'state = {\n\tid = 9\n\tname = "S9"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(dep, "history", "countries", "AAA - A.txt"), "capital = 9\n");
  mk(path.join(dep, "history", "countries", "BBB - B.txt"), "capital = 9\n");

  const addon = mod("addon", 'name="A"\n');
  mk(path.join(addon, "history", "countries", "BBB - B.txt"), "capital = 9\n");

  const r = md.blankMapToSea({ modRoot: addon, gameRoot: base, dependencyRoots: [dep] });
  const found = modelCapitals(addon, base, [dep]);
  ok(r.survivors.capitals === found, `the advisory agrees with the model (${r.survivors.capitals} vs ${found})`,
    { advisory: r.survivors, model: found });
  ok(r.survivors.capitals === 1,
    "⭐ only the dependency file the add-on does NOT shadow is counted — and the base game's three are hidden below the conversion",
    r.survivors);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("   - " + f); process.exit(1); }
