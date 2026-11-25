// ⛔ #nova-writes-two-descriptors-and-named-one
//
// A local mod has TWO descriptor files, and Nova writes BOTH from the same builder:
//   <modRoot>/descriptor.mod          — the one inside the folder
//   <modsRoot>/<slug>.mod             — the launcher entry beside the folder
// (/api/mod/create and /api/mod/create-starter, buildLocalDescriptorContent + buildLauncherDescriptorContent.)
//
// Every message telling a modder to add replace_path named only the first. Follow it and the two disagree.
//
// ⭐ THE HOI4 LAUNCHER COPIES replace_path INTO ITS OWN ENTRY, VERBATIM. Measured on the five shipping map
// mods' launcher-generated ugc_<id>.mod entries against each mod's own descriptor.mod: 74/74, 95/95, 30/30,
// 26/26 and 2/2 replace_path lines. A launcher does not copy a directive it does not need, and hoi4.exe
// carries "descriptor.mod", "replace_path" AND a bare ".mod" as strings. Which file the engine finally reads
// is NOT established — no launch test here has separated them — so the advice names both, which is what all
// ten descriptors on this machine carrying a replace_path line do.
//
// Run: node test-the-advice-names-every-descriptor-nova-wrote.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-two-desc-"));
const w = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

console.log("=== the advice names every descriptor Nova wrote ===");

// Named first so a back-out reads as a FAILED ASSERTION and not as a stack trace: a control has to say
// which thing stopped being true.
ok(typeof md.descriptorFilesFor === "function", "map-data exports descriptorFilesFor");
ok(typeof md.blankSurvivors === "function", "map-data exports blankSurvivors, so the advice can be asked directly");
if (typeof md.descriptorFilesFor !== "function" || typeof md.blankSurvivors !== "function") {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ── 1. A LOCAL MOD, the shape Nova's own wizard creates: both files ───────────────────────────────
const modsRoot = path.join(tmp, "mod");
const local = path.join(modsRoot, "my_mod");
w(path.join(local, "descriptor.mod"), 'name="My Mod"\npath="mod/my_mod"\n');
w(path.join(modsRoot, "my_mod.mod"), 'name="My Mod"\npath="' + local.replace(/\\/g, "/") + '"\n');
const both = md.descriptorFilesFor(local);
ok(both.length === 2, "a local mod reports BOTH descriptor files", both);
ok(both.some((p) => same(p, path.join(local, "descriptor.mod"))), "the one inside the folder is named");
ok(both.some((p) => same(p, path.join(modsRoot, "my_mod.mod"))), "the launcher entry beside the folder is named");
ok(same(both[0], path.join(local, "descriptor.mod")), "the folder's own descriptor comes first", both[0]);

// ── 2. A WORKSHOP MOD: its launcher entry is ugc_<id>.mod in Documents, NOT a sibling ─────────────
// Derived from disk, so a sibling that is not there must not be invented.
const ws = path.join(tmp, "workshop", "820260968");
w(path.join(ws, "descriptor.mod"), 'name="R56"\n');
const one = md.descriptorFilesFor(ws);
ok(one.length === 1 && same(one[0], path.join(ws, "descriptor.mod")),
  "a mod with no sibling .mod reports only its own descriptor — nothing is invented", one);
ok(md.descriptorFilesFor(path.join(tmp, "nothing-here")).length === 0, "a folder with no descriptor at all reports none");
ok(md.descriptorFilesFor(null).length === 0, "no mod selected reports none, and does not throw");

// ── 3. THE ADVICE CARRIES THEM: blankSurvivors hands the list to the client that prints it ────────
const game = path.join(tmp, "game");
w(path.join(game, "map/definition.csv"), "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;0\n");
w(path.join(game, "history/states/1-Base.txt"), 'state = { id = 1 name = "Base" provinces = { 1 } history = { owner = GER } }');
w(path.join(game, "history/countries/GER.txt"), "capital = 1\n");
const surv = md.blankSurvivors(local, game, []);
ok(Array.isArray(surv.descriptors) && surv.descriptors.length === 2,
  "blankSurvivors returns both descriptor paths beside the replace_path advice", surv.descriptors);
ok(surv.needs.includes("history/states"), "…and still says which line is needed", surv.needs);

// ── 4. THE VALIDATOR RULE NAMES THEM TOO ─────────────────────────────────────────────────────────
// The mod retypes the base game's province 1 to sea while the base state still stands on it.
w(path.join(local, "map/definition.csv"), "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n2;20;20;20;land;false;plains;0\n");
w(path.join(local, "history/states/50-Mine.txt"), 'state = { id = 50 name = "Mine" provinces = { 2 } history = { owner = FRA } }');
const model = md.buildMapModel({ modRoot: local, gameRoot: game, dependencyRoots: [] });
const hit = (md.validateMapModel(model) || []).find((p) => p.rule === "inherited_states_still_load");
ok(!!hit, "the rule fires on this fixture (so the message below is the real one)");
for (const f of both) {
  ok(!!hit && String(hit.message).includes(f), "the message names " + path.basename(f), f);
}

// ── 5. THE EVIDENCE, re-measured rather than quoted: the launcher copies replace_path verbatim ────
// This is WHY both are named. It reads the real install when it is here, and asserts nothing when it is not.
const DOCS = path.join(os.homedir(), "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod");
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
const countRp = (p) => { try { return (fs.readFileSync(p, "utf8").match(/replace_path\s*=/g) || []).length; } catch (_) { return null; } };
let compared = 0, matched = 0;
if (fs.existsSync(DOCS) && fs.existsSync(WORKSHOP)) {
  for (const f of fs.readdirSync(DOCS)) {
    const m = /^ugc_(\d+)\.mod$/i.exec(f);
    if (!m) continue;
    const entry = countRp(path.join(DOCS, f));
    const own = countRp(path.join(WORKSHOP, m[1], "descriptor.mod"));
    if (entry == null || own == null || own === 0) continue;   // only mods that declare any
    compared++;
    if (entry === own) matched++;
    else console.log(`      ugc_${m[1]}: entry ${entry} vs descriptor ${own}`);
  }
}
if (compared) {
  ok(matched === compared,
    `the HOI4 launcher copies every replace_path into its own entry (${matched}/${compared} workshop mods agree exactly)`,
    { compared, matched });
} else {
  console.log("  --  no launcher-generated ugc_*.mod entries with replace_path here; the fixture checks above still ran");
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
