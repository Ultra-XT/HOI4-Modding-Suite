// #preset-support-company-names — THREE OF THE FIVE DIVISION PRESETS NAMED UNITS HOI4 HAS NEVER DEFINED.
//
// The Map's Army tool offers five division-template presets. Three of them asked for `engineer_company` and
// `recon_company` as their support company. HOI4 has no such sub_units: the real keys are `engineer`
// (common/units/engineer.txt) and `recon`. The "_company" suffix is what the in-game UI calls them, not what
// the game files do.
//
// The presets are validated against the mod's real sub_units before being offered (#preset-subunit-valid),
// and that guard worked exactly as designed — so Infantry, Motorized and Armored were greyed out with
// "needs units this mod lacks" on EVERY mod, vanilla-based ones included. A country drawn on the Map could
// not take a template from a preset at all, which is the one route the Map offers for giving it an army.
//
// ⭐ The guard being right is what made this hard to see: nothing was broken in game, because nothing was
// ever written. The failure was silent refusal.
//
// This test reads the sub_unit names out of the GAME rather than restating them, so it fails if a preset
// ever names something the base game does not define — whatever the reason.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const UNITS = path.join(GAME, "common", "units");

// Every sub_unit the base game defines: a `<name> = {` at depth 1 inside `sub_units = { … }`.
function vanillaSubUnits() {
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(UNITS).filter((f) => /\.txt$/i.test(f)); } catch (_) { return out; }
  for (const f of files) {
    const t = fs.readFileSync(path.join(UNITS, f), "latin1").replace(/#.*$/gm, "");
    if (!/sub_units\s*=\s*\{/.test(t)) continue;
    let depth = 0, m;
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{|\{|\}/g;
    while ((m = re.exec(t)) !== null) {
      if (m[0] === "}") { depth--; continue; }
      if (m[0] === "{") { depth++; continue; }
      if (depth === 1) out.add(m[1]);
      depth++;
    }
  }
  return out;
}

// The unit keys each preset asks for, read out of the shipped map.js.
function presetUnits() {
  const src = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const i = src.indexOf("const ARMY_PRESETS = [");
  if (i === -1) return null;
  const j = src.indexOf("\n  ];", i);
  const block = src.slice(i, j === -1 ? i + 3000 : j);
  const presets = [];
  for (const line of block.split(/\r?\n/)) {
    const nm = /name:\s*"([^"]+)"/.exec(line);
    if (!nm) continue;
    const units = new Set();
    for (const m of line.matchAll(/armySlotGrid\("([a-z_]+)"/g)) units.add(m[1]);
    for (const m of line.matchAll(/unit:\s*"([a-z_]+)"/g)) units.add(m[1]);
    presets.push({ name: nm[1], units: [...units] });
  }
  return presets;
}

(async () => {
  try {
    const sub = vanillaSubUnits();
    if (!sub.size) {
      console.log("  (no HOI4 install — cannot check preset unit names)");
      console.log(`\n=== army preset subunits: ${checks} checks, ${fails.length} failed ===`);
      return;
    }

    console.log("\n[ground truth] what the base game actually calls these");
    console.log(`     ${sub.size} sub_units defined in common/units`);
    rec("the base game defines `engineer`", sub.has("engineer"), [...sub].filter((x) => /engineer/.test(x)));
    rec("…and `recon`", sub.has("recon"), [...sub].filter((x) => /recon/.test(x)));
    rec("…and does NOT define `engineer_company`", !sub.has("engineer_company"), sub.has("engineer_company"));
    rec("…nor `recon_company` — the _company suffix is the UI's word, not the file's",
      !sub.has("recon_company"), sub.has("recon_company"));

    console.log("\n[every preset] names only units the base game defines");
    const presets = presetUnits();
    rec("the preset list was found in map.js", !!presets && presets.length >= 5, presets && presets.length);
    if (presets) {
      let bad = 0;
      for (const p of presets) {
        const missing = p.units.filter((u) => !sub.has(u));
        console.log(`     ${p.name.padEnd(22)} ${p.units.join(", ")}${missing.length ? "   >>> MISSING: " + missing.join(", ") : ""}`);
        if (missing.length) bad++;
        rec(`…${p.name}`, missing.length === 0, { asked: p.units, missing });
      }
      rec("no preset asks for a unit the game has never heard of", bad === 0, bad);
      // …and the presets must still actually ask for support companies; a fix that emptied them would pass
      // every check above while quietly making the presets worse.
      const withSupport = presets.filter((p) => p.units.some((u) => u === "engineer" || u === "recon")).length;
      rec("…and three of them still bring a support company", withSupport === 3, withSupport);
    }

    console.log(`\n=== army preset subunits: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
