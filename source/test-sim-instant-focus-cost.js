// #falsy-zero (simulator) — AN INSTANT FOCUS SIMULATED AS TEN WEEKS.
//
// A focus may legitimately cost 0: it completes the moment it is started. Shipping content is full of them —
// vanilla 22, The Road to 56 39, Rise of Nations 14, Millennium Dawn 12, Novum Vexillum 9. Ninety-six across
// the installed corpus.
//
// `focus.cost || 10` reads every one of those as ABSENT, because 0 is falsy, and substitutes the ten-week
// default. So the simulator ran an instant focus for 70 days: the progress halo filled, the current-focus
// widget counted down, and every later focus in the plan slipped ten weeks behind where the game would put
// it. The whole point of the simulator is to answer "when does this plan finish", and it answered wrong by
// 70 days per instant focus in the chain.
//
// ⭐ NOVA ALREADY FIXED THIS TWICE. The sidebar loader (app.js, #falsy-zero) and the focus serializer both
// carry the correct guard and a comment explaining it — one of them notes that merely OPENING such a focus
// and hitting Save used to rewrite its cost from 0 to 10. The simulator's four sites never adopted it, and
// two of those comments sit in the same file. One shared helper now, so there is no fifth site.
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
const CODE = stripJsComments(APP); // ⚠️ two comments in this very file quote the buggy expression

console.log("\n[the helper] runs the real function, not a copy of it");
{
  // Lift the two helpers out of the shipped file and execute them, so this tests app.js rather than a
  // restatement of what app.js ought to say.
  const weeksSrc = /function simFocusCostWeeks\(focus\) \{[\s\S]*?\n\}/.exec(CODE);
  const daysSrc = /function simFocusTotalDays\(focus\) \{[\s\S]*?\}/.exec(CODE);
  rec("simFocusCostWeeks is findable", !!weeksSrc, "not found");
  rec("simFocusTotalDays is findable", !!daysSrc, "not found");
  if (weeksSrc && daysSrc) {
    // eslint-disable-next-line no-new-func
    const mk = new Function(`${weeksSrc[0]}\n${daysSrc[0]}\nreturn { simFocusCostWeeks, simFocusTotalDays };`);
    const { simFocusCostWeeks, simFocusTotalDays } = mk();

    console.log("\n[the defect] a real 0 must survive");
    // THE BUG: 0 || 10 === 10, so an instant focus became a ten-week one.
    rec("cost 0 is kept as 0 weeks", simFocusCostWeeks({ cost: 0 }) === 0, simFocusCostWeeks({ cost: 0 }));
    rec("…so it takes 0 days, not 70", simFocusTotalDays({ cost: 0 }) === 0, simFocusTotalDays({ cost: 0 }));
    rec("…and a string \"0\" too, since a form field is a string",
      simFocusTotalDays({ cost: "0" }) === 0, simFocusTotalDays({ cost: "0" }));

    console.log("\n[CONTROL] a genuinely absent cost still gets the ten-week default");
    // Removing the || would be the naive fix and would break every focus that declares no cost at all.
    rec("undefined falls back to 10 weeks", simFocusCostWeeks({}) === 10, simFocusCostWeeks({}));
    rec("null too", simFocusCostWeeks({ cost: null }) === 10, simFocusCostWeeks({ cost: null }));
    rec("an empty string too", simFocusCostWeeks({ cost: "" }) === 10, simFocusCostWeeks({ cost: "" }));
    rec("and so does nonsense", simFocusCostWeeks({ cost: "abc" }) === 10, simFocusCostWeeks({ cost: "abc" }));

    console.log("\n[CONTROL] an ordinary cost is unchanged");
    rec("cost 7 is 49 days", simFocusTotalDays({ cost: 7 }) === 49, simFocusTotalDays({ cost: 7 }));
    rec("cost 10 is 70 days", simFocusTotalDays({ cost: 10 }) === 70, simFocusTotalDays({ cost: 10 }));
    rec("a decimal survives", simFocusCostWeeks({ cost: 2.5 }) === 2.5, simFocusCostWeeks({ cost: 2.5 }));
  }
}

console.log("\n[⭐ every site] no simulator path may still compute the total itself");
{
  // Derived rather than a list of four line numbers: any `cost || 10` left in executable code is a site
  // that did not adopt the helper, and this file has had exactly that defect three times now.
  const strays = (CODE.match(/\.cost\s*\|\|\s*10/g) || []).length;
  console.log(`     '.cost || 10' left in executable code: ${strays}`);
  rec("no falsy-zero cost fallback survives anywhere in app.js", strays === 0, strays + " remaining");
  // …and the raw comments still mention it, which is how a future reader learns why the helper exists.
  const inComments = (APP.match(/\.cost\s*\|\|\s*10/g) || []).length;
  rec("…while the explanation is still written down", inComments > strays, { inComments, strays });
  // the simulator really does route through the helper
  const uses = (CODE.match(/simFocusTotalDays\(/g) || []).length;
  console.log(`     simFocusTotalDays( call sites: ${uses}`);
  rec("the simulator uses the helper in several places", uses >= 4, uses);
}

console.log("\n[the corpus] instant focuses are not a hypothetical");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  const roots = [["vanilla", GAME]];
  try {
    for (const d of fs.readdirSync(WS)) {
      let nm = "";
      try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
      if (nm) roots.push([nm.slice(0, 24), path.join(WS, d)]);
    }
  } catch (_) {}
  let total = 0;
  for (const [label, root] of roots) {
    let n = 0, files = [];
    try { files = fs.readdirSync(path.join(root, "common", "national_focus")).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(root, "common", "national_focus", f), "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
      n += (t.match(/^\s*cost\s*=\s*0\s*$/gm) || []).length;
    }
    if (n) { total += n; console.log(`     ${label.padEnd(26)} ${n}`); }
  }
  console.log(`     total: ${total}`);
  rec("shipping content really declares instant focuses", total > 20, total);
}

console.log(`\n=== sim instant focus cost: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
