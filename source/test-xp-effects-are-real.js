// #xp-presets-emit-a-nonexistent-effect — THE THREE XP BUTTONS WROTE AN EFFECT HOI4 DOES NOT HAVE.
//
// "Add Army XP" wrote `add_army_experience = 10`. That is not a HOI4 effect; the real one is
// `army_experience`. The focus granted nothing, HOI4 logged an unknown effect in error.log (non-fatal, easy
// to miss), and the editor showed the button as having worked.
//
// ⚠️ A REGRESSION, NOT A GAP. The first commit in this repository had it right — `command:
// "army_experience"`, and LEGACY_XP_COMMAND_RENAMES populated with all three. Commit 35ad677 (2026-05-21),
// titled "Audit and fix all EFFECT_PRESETS for valid HOI4 commands", replaced the correct command with the
// invalid one AND emptied the rename map that would have healed it.
//
// Both halves matter. The map is what repairs focuses Nova has already written since that date:
// normalizeLegacyEffectCommand runs on every effect line no other branch claims.
//
// ⭐ THE VOCABULARY IS DERIVED FROM THE SHIPPING CORPUS AND NOVA'S OWN SPEC, never typed in as an opinion.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const CODE = stripJsComments(APP);

const PAIRS = [
  ["add_army_experience", "army_experience"],
  ["add_navy_experience", "navy_experience"],
  ["add_air_experience", "air_experience"],
];

console.log("\n[⭐ ground truth] Nova's own bundled CWTools spec decides what an effect is");
{
  let spec = null;
  try { spec = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "hoi4-spec.json"), "utf8")); } catch (_) {}
  const fx = spec ? (spec.effects || spec.fx || {}) : {};
  const names = Array.isArray(fx) ? fx.map((x) => x.name || x) : Object.keys(fx);
  console.log(`     spec declares ${names.length} effects`);
  // ⚠️ If the spec failed to load, everything below would pass for the wrong reason.
  rec("the spec loaded", names.length > 100, names.length);
  for (const [wrong, right] of PAIRS) {
    rec(`${right} is a real effect`, names.includes(right), "missing from the spec");
    rec(`${wrong} is NOT`, !names.includes(wrong), "the spec disagrees — re-check this whole finding");
  }
}

console.log("\n[the presets] must emit the real command");
{
  for (const [wrong, right] of PAIRS) {
    // The preset KEY stays as-is (the effects menu groups by key); only the command it writes changed.
    const hasRight = new RegExp(`command:\\s*"${right}"`).test(CODE);
    const hasWrong = new RegExp(`command:\\s*"${wrong}"`).test(CODE);
    rec(`the ${right} preset writes the real effect`, hasRight, "not found");
    rec(`…and no preset still writes ${wrong}`, !hasWrong, "the invalid command is still emitted");
  }
}

console.log("\n[⭐ the healing half] output Nova already wrote must be repaired on save");
{
  // Restoring only the preset would leave every focus written since 2026-05-21 carrying a dead effect.
  const at = CODE.indexOf("LEGACY_XP_COMMAND_RENAMES = new Map([");
  const end = at === -1 ? -1 : CODE.indexOf("]);", at);
  const body = at === -1 ? "" : CODE.slice(at, end);
  rec("the legacy rename map exists", at !== -1, "gone");
  rec("…and is not empty", /\[\s*"/.test(body), "the map is empty — old output is never healed");
  for (const [wrong, right] of PAIRS) {
    rec(`…and maps ${wrong} to ${right}`,
      new RegExp(`\\["${wrong}",\\s*"${right}"\\]`).test(body.replace(/\s+/g, " ")), body.slice(0, 200));
  }
  // …and the map has to actually be consulted by the serializer, or it is decoration.
  rec("the serializer consults the map",
    /LEGACY_XP_COMMAND_RENAMES\.get\(/.test(CODE), "nothing reads the map");
}

console.log("\n[CONTROL] the simulator still understands both spellings");
{
  // It accepted the invalid form too, which is right: mods written by older Nova versions still contain it,
  // and the projection should keep counting their XP rather than silently ignoring it.
  for (const [wrong, right] of PAIRS) {
    rec(`the simulator handles ${right}`, new RegExp(`case "${right}":`).test(CODE), "no case");
    rec(`…and still tolerates ${wrong} in existing mods`, new RegExp(`case "${wrong}":`).test(CODE), "no tolerant case");
  }
}

console.log("\n[the corpus] the real vocabulary, measured rather than assumed");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ];
  const SUBS = [["common", "national_focus"], ["events"], ["common", "decisions"]];
  let measured = false;
  for (const [label, root] of ROOTS) {
    const counts = {};
    for (const [wrong, right] of PAIRS) { counts[wrong] = 0; counts[right] = 0; }
    let files = 0;
    for (const sub of SUBS) {
      const walk = (d) => {
        let e = [];
        try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        for (const x of e) {
          const f = path.join(d, x.name);
          if (x.isDirectory()) { walk(f); continue; }
          if (!/\.txt$/i.test(x.name)) continue;
          files++;
          let t = "";
          try { t = fs.readFileSync(f, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
          for (const k of Object.keys(counts)) {
            counts[k] += (t.match(new RegExp(`(^|[^A-Za-z0-9_])${k}\\s*=`, "g")) || []).length;
          }
        }
      };
      walk(path.join(root, ...sub));
    }
    if (!files) continue;
    measured = true;
    console.log(`     ${label} (${files} files): ` + PAIRS.map(([w, r]) => `${r}=${counts[r]} ${w}=${counts[w]}`).join(", "));
    for (const [wrong, right] of PAIRS) {
      rec(`${label}: ${right} is what the game actually uses`, counts[right] > 0, counts[right]);
      rec(`${label}: ${wrong} appears nowhere`, counts[wrong] === 0, counts[wrong]);
    }
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus check is skipped only because the games are absent", true, "skipped");
  }
}

console.log(`\n=== xp effects are real: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
