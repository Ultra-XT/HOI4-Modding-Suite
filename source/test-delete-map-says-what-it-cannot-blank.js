// ⛔ #delete-map-cannot-blank-an-overlay — THE DIALOG PROMISED SOMETHING THE OPERATION CANNOT DELIVER.
//
// "🗑 Delete the entire map? This turns ALL land into sea and removes EVERY STATE — a blank ocean canvas to
// build a new world from scratch (e.g. with the land generator)."
//
// A mod is an overlay. Delete map deletes the state files, supply-area files and capitals the MOD owns.
// Deleting your copy of a base-game file does not remove it — it stops overriding it, and the original
// comes straight back. Measured against the real base game, on a mod whose descriptor is exactly what
// Nova's own wizard writes (name + supported_version + path, no replace_path):
//
//   before   states 1081   land 10155   capitals 363   errors  0
//   blank    deletedStates 0, deletedSupply 0            (the mod owned none to delete)
//   after    states 1081   land     1   capitals 363   errors 62
//
// Every state is back, holding provinces that are now entirely sea, and 🛠 Auto-fix cannot clear one of
// them — it ran for 18 seconds and left all 60 non_land_province_in_state, because those files are not the
// mod's to change. Running the land generator the dialog recommends next adds 129 new states over the top
// and 160 provinces end up claimed by two states.
//
// ⭐⭐ WHY NOBODY SAW IT: test-map-blank-sea.js and e2e-map-blank.js both build a fixture declaring
// replace_path for history/states, history/countries, map, map/strategicregions and map/supplyareas — the
// one shape where the operation works, and a shape Nova never creates. 5 of the 40 installed mods declare
// those paths (the big workshop total conversions); the other 35 do not.
//
// ⚠️ BOTH paths are needed, and history/states alone is the dangerous half-measure: it removes the states
// and leaves vanilla's country files pointing at them — 324 capital_state_missing, which IS one of the
// twelve fatal rules. The survivor report names each path separately for that reason.
//
// Reported, not refused: a modder may intend to add the replace_path lines afterwards, and the typed-DELETE
// gate is already a strong one. What was missing was the truth, before the click.
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
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

// A self-contained base "game" so the shapes below can be checked without an install.
function makeBase() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dmg-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3].map((i) => `${i};${i * 60};0;0;land;false;plains;1`)).join("\r\n") + "\r\n");
  for (const i of [1, 2, 3]) {
    mk(path.join(g, "history", "states", i + ".txt"),
      `state = {\n\tid = ${i}\n\tname = "S${i}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${i} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "history", "countries", "AAA - A.txt"), "capital = 1\n");
  mk(path.join(g, "history", "countries", "BBB - B.txt"), "capital = 2\n");
  return g;
}
const mod = (tag, desc) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dmm-" + tag + "-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), desc);
  return d;
};

const base = makeBase();

console.log("\n=== ⭐ a plain overlay mod is told what survives ===");
{
  const m = mod("plain", 'name="P"\nsupported_version="1.19.*"\n');
  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok(r.changed === true, "the blank still runs — this is a report, not a refusal", r.error);
  ok(!!r.survivors, "…and it reports what it could not blank", Object.keys(r));
  ok(r.survivors.states === 3, "…naming the states that come back", r.survivors);
  ok(r.survivors.capitals === 2, "…and the capitals", r.survivors);
  ok((r.survivors.needs || []).join(",") === "history/states,history/countries",
    "…and BOTH replace_paths that would actually stop them loading", r.survivors.needs);
  // The proof the report is not just arithmetic: rebuild the model and count.
  const after = md.buildMapModel({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok((after.states || []).length === 3,
    "⭐ and they really are still there after the blank — the model rebuilds with every one", (after.states || []).length);
  ok(Object.keys(after.capitals || {}).length === 2,
    "…as are the capitals the blank claimed to strip", Object.keys(after.capitals || {}));
  // 🈯 Province 0 is the special "no province" black row and is deliberately left alone, so "all land is
  // sea" means every province EXCEPT 0. Asserting a flat zero here failed on the one row that must not move.
  ok((after.provinces || []).filter((p) => p.type === "land" && p.id !== 0).length === 0,
    "…over provinces that are now all sea, which is the part that DID happen",
    (after.provinces || []).filter((p) => p.type === "land").map((p) => p.id));
  ok((after.provinces || []).some((p) => p.id === 0 && p.type === "land"),
    "…and province 0, the special black row, is untouched");
}

console.log("\n=== ⚠️ history/states alone is the dangerous half ===");
{
  const m = mod("half", 'name="H"\nreplace_path="history/states"\n');
  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok(r.survivors.states === 0, "the states are genuinely gone", r.survivors);
  ok(r.survivors.capitals === 2, "⚠️ …but the capitals are not, and they now point at nothing", r.survivors);
  ok((r.survivors.needs || []).join(",") === "history/countries",
    "…so only the path that is still missing is named", r.survivors.needs);
  const probs = md.validateMapModel(md.buildMapModel({ modRoot: m, gameRoot: base, dependencyRoots: [] }));
  // ⭐ WHICH HALF OF THE RULE, AND WHY. Blanking history/states removes every state, so it removes every
  // OWNER too: at this instant not one country owns land, and capital_state_missing — gated only for a
  // land owner since 2026-09-23 — cannot be the row. It is capital_state_missing_no_land. The half-measure
  // is still reported and both paths are still checked; what changed is that Save is not stopped for a
  // world that has no land at all yet. Put land back under these countries (Generate land, then owners)
  // and the ones still pointing above the new maximum become the fatal row again.
  ok(probs.some((p) => /^capital_state_missing/.test(p.rule)),
    "…and that half-measure is still reported, which is why both paths are checked", probs.map((p) => p.rule));
  ok(probs.some((p) => p.rule === "capital_state_missing_no_land"),
    "⭐ …as the landless half, because blanking the states took every owner with them", probs.map((p) => p.rule));
}

console.log("\n=== a total conversion really does blank ===");
{
  const m = mod("tc", 'name="T"\nreplace_path="history/states"\nreplace_path="history/countries"\n');
  const r = md.blankMapToSea({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok(r.survivors.states === 0 && r.survivors.capitals === 0,
    "nothing survives, so nothing is reported", r.survivors);
  ok((r.survivors.needs || []).length === 0, "…and no descriptor advice is given", r.survivors.needs);
  const after = md.buildMapModel({ modRoot: m, gameRoot: base, dependencyRoots: [] });
  ok((after.states || []).length === 0, "⚠️ THE CONTROL: the shape both existing tests use is unchanged",
    (after.states || []).length);
}

console.log("\n=== a DEPENDENCY's states count too ===");
{
  // An add-on to a total conversion inherits the dependency's states, not vanilla's.
  const dep = mod("dep", 'name="D"\nreplace_path="history/states"\nreplace_path="history/countries"\n');
  mk(path.join(dep, "history", "states", "9.txt"),
    'state = {\n\tid = 9\n\tname = "S9"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(dep, "history", "countries", "AAA - A.txt"), "capital = 9\n");
  const addon = mod("addon", 'name="A"\n');
  const r = md.blankMapToSea({ modRoot: addon, gameRoot: base, dependencyRoots: [dep] });
  ok(r.survivors.states === 1, "the dependency's state is counted, not the base game's three", r.survivors);
  ok(r.survivors.capitals === 1, "…and its capital, not the base game's two", r.survivors);
}

console.log("\n=== the page says it before the click, and again after the write ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  ok(/id="mapBlankBody"/.test(HTML), "the confirm dialog's body can be rewritten at open time");
  ok(/function blankConfirmBody\(/.test(SRC), "…and there is a builder for it");
  // ⚠️ This read `/blankConfirmBody\(\)/` — the ZERO-ARGUMENT call — and had to move with the fix that gave
  // the builder a `descriptorPath` argument (#a-blank-an-overlay-cannot-deliver-needs-an-actionable-instruction,
  // test-delete-map-names-the-file-you-must-edit.js). The intent is unchanged and now stronger: the click
  // must build the body itself, from the mod actually loaded, rather than reuse a body built once at load.
  ok(/blankConfirmBody\(/.test(SRC.slice(SRC.indexOf("mapDeleteMap"))),
    "…wired to the Delete map button, so it is rebuilt for the mod actually loaded");
  ok(/blankConfirmBody\(modPath\(\)/.test(SRC.slice(SRC.indexOf("mapDeleteMap"))),
    "…and handed the active mod's own descriptor path, so the file it names is the modder's");
  ok(/res\.survivors/.test(SRC), "…and the save path reads survivors off the write response");
  // The old copy promised something no overlay mod gets. It must not still be sitting in the HTML.
  ok(!/removes <b>every state<\/b>/.test(HTML),
    "…and the dialog no longer promises to remove every state");

  // RUN the builder, so a back-out that stops it counting actually fails here.
  const a = SRC.indexOf("function blankConfirmBody(");
  let d = 0, end = -1;
  for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  const fn = end > 0 ? SRC.slice(a, end) : "";
  ok(!!fn, "blankConfirmBody was lifted out of public/map.js");
  const build = fn && new Function("model", fn + "\n return blankConfirmBody();");
  if (build) {
    const overlay = build({
      states: [{ id: 1, inBaseLayer: true }, { id: 2, inBaseLayer: true }, { id: 9, inBaseLayer: false }],
      capitals: { AAA: 1, BBB: 2 }, capitalFromMod: { BBB: true },
    });
    ok(/2 state/.test(overlay) && /1 country capital/.test(overlay),
      "⭐ RUN: it counts only the states and capitals that come from below", overlay.slice(0, 400));
    ok(/replace_path="history\/states"/.test(overlay) && /replace_path="history\/countries"/.test(overlay),
      "⭐ RUN: …and names both descriptor lines");
    ok(/will not leave a blank canvas/.test(overlay), "⭐ RUN: …and says so plainly");
    const tc = build({ states: [{ id: 9, inBaseLayer: false }], capitals: { AAA: 9 }, capitalFromMod: { AAA: true } });
    ok(!/will not leave a blank canvas/.test(tc) && /blank ocean canvas/.test(tc),
      "⚠️ RUN, THE CONTROL: a mod that owns everything is still promised a real blank", tc.slice(0, 300));
    ok(!/replace_path/.test(tc), "…with no descriptor advice it does not need");
  }
}

console.log("\n=== 🈯 against the real install, if it is here ===");
if (!fs.existsSync(path.join(GAME, "history", "states"))) {
  console.log("  ..   (the base game is not installed — the corpus half cannot run)");
} else {
  // ⛔ #a-blank-claims-a-world-the-mod-does-not-own — THIS FIXTURE MOVED WITH THE FIX, DELIBERATELY.
  //
  // It used to be a wizard-fresh mod with nothing but a descriptor, and the blank ran on it. It no longer
  // does: a mod with no map/provinces.bmp of its own owns not one pixel of the world it would be drowning,
  // so blankMapToSea refuses before it writes anything. That refusal, and its back-out control, belong to
  // test-a-blank-cannot-claim-a-world-the-mod-does-not-own.js. What THIS section measures is the SURVIVORS
  // advisory, which needs a blank that actually runs — so the fixture does the one thing the refusal tells
  // the modder to do and copies the world's bitmap in. It still owns no state files, which is the shape
  // being measured here.
  const m = mod("real", 'name="R"\nsupported_version="1.19.*"\n');
  fs.mkdirSync(path.join(m, "map"), { recursive: true });
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(m, "map", "provinces.bmp"));
  const before = md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const r = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  ok(r.changed === true, "the blank runs once the mod owns the world's shapes", r.error);
  ok(r.deletedStates === 0, "…and a mod that owns no state file has none for it to delete", r.deletedStates);
  ok(r.survivors.states === (before.states || []).length && r.survivors.states > 1000,
    `⭐ …and all ${r.survivors.states} base-game states are reported as surviving`, r.survivors);
  ok(r.survivors.capitals > 300, "…along with several hundred capitals", r.survivors.capitals);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== delete map says what it cannot blank: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
