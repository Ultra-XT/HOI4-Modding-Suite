// test-hoi4-spec.js — validates the shipped data/hoi4-spec.json (the CWTools-derived token spec).
// Does NOT depend on the reference clone — it checks the checked-in artifact that ships in the exe.
const fs = require("fs");
const path = require("path");

let failed = 0;
function ok(cond, msg) {
  if (cond) {
    console.log("  ok  " + msg);
  } else {
    console.error("  FAIL " + msg);
    failed++;
  }
}

const file = path.join(__dirname, "data", "hoi4-spec.json");
ok(fs.existsSync(file), "data/hoi4-spec.json exists (must be checked in + bundled)");

const spec = JSON.parse(fs.readFileSync(file, "utf8"));

ok(Array.isArray(spec.effects) && spec.effects.length >= 400, `effects >= 400 (got ${spec.effects?.length})`);
ok(Array.isArray(spec.triggers) && spec.triggers.length >= 400, `triggers >= 400 (got ${spec.triggers?.length})`);
ok(Array.isArray(spec.modifiers) && spec.modifiers.length >= 500, `modifiers >= 500 (got ${spec.modifiers?.length})`);

// known-good tokens must be present
const eff = new Set(spec.effects.map((e) => e.name));
const trg = new Set(spec.triggers.map((t) => t.name));
const mod = new Set(spec.modifiers.map((m) => m.name));
for (const n of ["add_stability", "add_manpower", "set_country_flag", "country_event"])
  ok(eff.has(n), `effect "${n}" present`);
for (const n of ["has_country_flag", "has_war", "date", "tag"]) ok(trg.has(n), `trigger "${n}" present`);
for (const n of ["army_attack_factor", "political_power_gain", "stability_factor"])
  ok(mod.has(n), `modifier "${n}" present`);

// every name must be a clean lowercase token (no leftover <placeholders> or pipes)
const nameRe = /^[a-z][a-z0-9_]*$/;
const badEff = spec.effects.find((e) => !nameRe.test(e.name));
const badTrg = spec.triggers.find((t) => !nameRe.test(t.name));
const badMod = spec.modifiers.find((m) => !nameRe.test(m.name));
ok(!badEff, "all effect names are clean tokens" + (badEff ? ` (bad: ${badEff.name})` : ""));
ok(!badTrg, "all trigger names are clean tokens" + (badTrg ? ` (bad: ${badTrg.name})` : ""));
ok(!badMod, "all modifier names are clean tokens" + (badMod ? ` (bad: ${badMod.name})` : ""));

// no duplicate names within a list
ok(eff.size === spec.effects.length, "no duplicate effect names");
ok(trg.size === spec.triggers.length, "no duplicate trigger names");
ok(mod.size === spec.modifiers.length, "no duplicate modifier names");

// block-vs-scalar arg shape — powers the picker inserting `name = { … }` vs `name = `
ok(spec.effects.every((e) => typeof e.block === "boolean"), "every effect has a boolean `block` flag");
ok(spec.triggers.every((t) => typeof t.block === "boolean"), "every trigger has a boolean `block` flag");
ok(spec.effects.some((e) => e.block) && spec.effects.some((e) => !e.block), "effects include both block and scalar forms");
const eSetCapital = spec.effects.find((e) => e.name === "set_capital");
ok(eSetCapital && eSetCapital.block === true, "set_capital is a block effect");
const eAddStability = spec.effects.find((e) => e.name === "add_stability");
ok(eAddStability && eAddStability.block === false, "add_stability is a scalar effect");

// meta + counts consistency
ok(spec._meta && spec._meta.counts && spec._meta.counts.effects === spec.effects.length, "_meta.counts.effects matches");

if (failed) {
  console.error(`\ntest-hoi4-spec: ${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("\ntest-hoi4-spec: all checks passed");
