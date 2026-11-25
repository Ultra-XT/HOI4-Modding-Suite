// #tech-bonus-percent-under-one — TYPING "1%" WROTE A 100% RESEARCH BONUS INTO THE MOD.
//
// The research-bonus wizard's input placeholder is "0.15 or 15%", so the contract is explicit: a bare
// number is a FACTOR, a %-suffixed number is a PERCENTAGE. parseTechBonusAmount honoured that only above 1:
//
//   if (hadPct && v > 1) v /= 100;
//
// "15%" became 0.15 correctly. "1%" stayed 1 — which HOI4 reads as +100% research speed — and "0.5%" stayed
// 0.5, or +50%. Every percentage at or below 1 was written a hundred times too large, silently, into the
// author's mod. A research bonus is a plain number in the file, so nothing in game complains; the focus
// simply grants far more than intended.
//
// ⭐ THE PARSER IS LIFTED OUT OF app.js AND RUN, not re-typed here, so this cannot drift from the code it
// guards.
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

// Lift the function by brace-matching from its signature. Safe here: parseTechBonusAmount contains no
// regex literal with an unpaired brace (unlike the flag branch elsewhere in this file, where naive
// brace-counting runs off the end).
function lift(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    const c = CODE[i];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return null;
}

console.log("\n[the real parser] lifted out of app.js");
const src = lift("parseTechBonusAmount");
rec("parseTechBonusAmount was found", !!src, "not found");
let parse = null;
if (src) {
  try {
    // eslint-disable-next-line no-new-func
    parse = new Function(`${src}; return parseTechBonusAmount;`)();
  } catch (e) { rec("…and is runnable", false, e.message); }
}
rec("…and is callable", typeof parse === "function", typeof parse);

const val = (s) => {
  if (typeof parse !== "function") return null;
  const r = parse(s);
  return r && r.ok ? r.value : { rejected: (r && r.error) || "no result" };
};

console.log("\n[CONTROL] a bare number is a FACTOR and must be untouched");
{
  // ⚠️ If these are divided too, the fix has gone too far and every existing bonus would be wrong.
  for (const [input, want] of [["0.15", 0.15], ["0.5", 0.5], ["1", 1], ["0.05", 0.05]]) {
    const got = val(input);
    console.log(`     ${String(input).padEnd(7)} -> ${JSON.stringify(got)}`);
    rec(`a bare "${input}" stays ${want}`, got === want, got);
  }
}

console.log("\n[CONTROL] a percentage above 1 already worked and must keep working");
{
  for (const [input, want] of [["15%", 0.15], ["100%", 1], ["5%", 0.05], ["150%", 1.5]]) {
    const got = val(input);
    console.log(`     ${String(input).padEnd(7)} -> ${JSON.stringify(got)}`);
    rec(`"${input}" is ${want}`, Math.abs(got - want) < 1e-9, got);
  }
}

console.log("\n[THE BUG] a percentage at or below 1");
{
  // Before the fix: "1%" -> 1 (a +100% research bonus) and "0.5%" -> 0.5 (+50%).
  for (const [input, want] of [["1%", 0.01], ["0.5%", 0.005], ["0.1%", 0.001], ["1 %", 0.01]]) {
    const got = val(input);
    console.log(`     ${String(input).padEnd(7)} -> ${JSON.stringify(got)}   (want ${want})`);
    rec(`"${input}" is ${want}, not ${want * 100}`, typeof got === "number" && Math.abs(got - want) < 1e-9, got);
  }
}

console.log("\n[the contract] the input still advertises both forms");
{
  const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  // The whole reason a % suffix is unambiguous is that the box says so.
  rec("the bonus input's placeholder offers both a factor and a percentage",
    /id="techBonusWizardBonusInput"[^>]*placeholder="[^"]*0\.15[^"]*15%/.test(html), "the placeholder changed");
}

console.log("\n[rejections still work]");
{
  rec("an empty value is rejected", !!(val("") || {}).rejected, val(""));
  rec("a non-numeric value is rejected", !!(val("abc") || {}).rejected, val("abc"));
}

console.log(`\n=== tech bonus percent: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
