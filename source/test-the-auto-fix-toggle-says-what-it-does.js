// ⛔ #the-auto-fix-toggle-says-what-it-does — THE 🛠 AUTO-FIX TOGGLE'S WORDS SAY WHAT IT GATES, AND ONLY THAT.
//
// B6-19 (tool campaign, CONFIRMED, medium): the toggle's dialog said that with it ON the editor "silently repairs crash-causing mistakes
// as you work (e.g. deleting a state you just emptied, fixing region splits)" and that with it OFF it "changes nothing on its own". Driven
// on a generated world: (a) ON asked the same "Keep the state in one strategic region?" question OFF asks; (b) OFF still carried a coast's
// dockyard with the province in the same status that said "Auto-fix is OFF, so nothing was changed"; (c) OFF's Save still dropped a
// new state nobody filled. The flag is read at exactly two places: what a ↔ Move and a 🧹 Erase stroke do with a state they empty.
//
// So the words name that one thing. DERIVED, so the guard cannot outlive the code: the flag's reads are found in public/map.js (comments
// masked), and if a third appears, this fails and says the words have to be looked at again.
"use strict";
const fs = require("fs");
const path = require("path");
const T = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

const SRC = T.MASKED;
const HTML = T.readSource("public", "map.html");

// ── what the flag gates, derived ─────────────────────────────────────────────────────────────────────────────────────────
{
  const own = [];   // the toggle's own functions: the declaration, renderAutoFixBtn, setAutoFix and the click handler
  const decl = SRC.indexOf("let autoFix = ");
  own.push([decl, SRC.indexOf("\n", decl)]);
  for (const [a, b] of [["function renderAutoFixBtn", "\n  }"], ["const setAutoFix = (on) =>", "\n  };"], ['$("mapAutoFix").addEventListener("click"', "\n    });"]]) {
    const s = SRC.indexOf(a);
    own.push([s, s < 0 ? -1 : SRC.indexOf(b, s)]);
  }
  rec("the toggle's own code is found", own.every(([s, e]) => s >= 0 && e > s), own);
  const reads = [];
  const re = /(^|[^.\w$])autoFix\b/g;
  let m;
  while ((m = re.exec(SRC))) {
    const at = m.index + m[1].length;
    if (own.some(([s, e]) => at >= s && at <= e)) continue;
    reads.push(at);
  }
  // `if (!autoFix) {` opens a branch whose OFF line (the next "now EMPTY … Auto-fix is OFF" after it, before the next read) says the state was left
  const gatesAnEmptiedState = (at, i) => /^if \(!autoFix\) \{/.test(SRC.slice(at - 5, at + 20))
    && /now EMPTY — HOI4 will not start a game with an empty state\. Auto-fix is OFF/.test(SRC.slice(at, i + 1 < reads.length ? reads[i + 1] : at + 3000));
  rec("⭐⭐⭐ the flag is read at exactly the two places that decide what happens to a state a Move or an Erase empties (a third read means the words below must be looked at again)",
    reads.length === 2 && reads.every((at, i) => gatesAnEmptiedState(at, i)), reads.map((at) => SRC.slice(at - 40, at + 160)));
}

// ── the words: the toggle's title, its dialog, the status it sets ──────────────────────────────────────────────────────────
{
  const title = (/<button id="mapAutoFix" title="([^"]*)"/.exec(HTML) || [])[1] || "";
  const warnAt = HTML.indexOf('<div id="mapAutofixWarn"');
  const dialog = warnAt < 0 ? "" : HTML.slice(warnAt, HTML.indexOf('id="mapAutofixWarnCancel"', warnAt)).replace(/<[^>]+>/g, "");
  rec("the toggle's title and its dialog are found", title.length > 40 && dialog.length > 100, { title, dialog: dialog.slice(0, 200) });
  const FALSE_CLAIMS = [/fixing region splits/i, /changes\s+nothing on its own/i, /won't change anything on its own/i, /silently repairs crash-causing mistakes/i];
  for (const [what, text] of [["title", title], ["dialog", dialog]]) {
    rec(`⭐⭐ the ${what} no longer claims what the flag does not do (region splits; "nothing on its own")`, !FALSE_CLAIMS.some((r) => r.test(text)), text);
    rec(`⭐⭐ the ${what} names the one thing it decides: a state a Move or an Erase empties`, /empty/i.test(text) && /Move province/.test(text) && /Erase/.test(text), text);
  }
  rec("⭐ the dialog says what still happens with it OFF (dockyards, the region question, the Save's purge)",
    /dockyards/.test(dialog) && /strategic region/.test(dialog) && /new state nothing was put in/.test(dialog), dialog);

  let sb = null;
  try {
    const fnSrc = T.liftFrom(T.MAP, SRC, "const setAutoFix = (on) =>", "\n  };");
    // (stateById: ⛔ #turning-auto-fix-on-says-what-it-leaves — the ON line names a state the page still holds empty; none here)
    const ctx = { autoFix: true, localStorage: { setItem() {} }, renderAutoFixBtn() {}, setStatus(s) { ctx.status = String(s); }, stateById: new Map() };
    require("vm").createContext(ctx);
    require("vm").runInContext(fnSrc + "\nglobalThis.setAutoFix = setAutoFix;", Object.assign(ctx, { globalThis: ctx }));
    sb = ctx;
  } catch (e) { rec("setAutoFix is lifted out of public/map.js", false, e.message); }
  if (sb) {
    sb.setAutoFix(true); const on = sb.status;
    sb.setAutoFix(false); const off = sb.status;
    rec("⭐⭐ the ON status says a state a Move or an Erase empties is deleted for you", /^🛠 Auto-fix ON — a state you empty with ↔ Move province or 🧹 Erase is deleted for you/.test(on), on);
    rec("⭐⭐ the OFF status says that state is left as it is and you are warned — not that the editor changes nothing", /^🛠 Auto-fix OFF — a state you empty with ↔ Move province or 🧹 Erase is left as it is, and you are warned/.test(off) && !FALSE_CLAIMS.some((r) => r.test(off)), off);
  }
}

// ── the OFF line after a Move or an Erase stroke: the STATE was left, the click's other changes are said beside it ───────────────
{
  rec("⭐⭐⭐ no line says \"Auto-fix is OFF, so nothing was changed\" (a Move carries a coast's dockyards in the same line)", !/Auto-fix is OFF, so nothing was changed/.test(SRC), "");
  // (the Erase says it of `bare`: a state its stroke leaves holding only water has a sentence of its own, #an-erase-that-leaves-only-water-empties-the-state)
  const n = (SRC.match(/Auto-fix is OFF, so \$\{(emptied|bare)\.length > 1 \? "they were" : "it was"\} left as \$\{\1\.length > 1 \? "they are" : "it is"\}:/g) || []).length;
  rec("…both say the emptied state was left as it is", n === 2, n);
}

console.log(`\n=== the auto-fix toggle says what it does: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
