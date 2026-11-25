// #advisor-cost-invented-150 — OPENING AN ADVISOR AND SAVING IT WROTE A COST THE FILE NEVER HAD, AND FOR A
// MILITARY ADVISOR THAT COST WAS TRIPLE THE RIGHT ONE.
//
// The game supplies the default when `cost` is absent, and it is NOT one number. From the shipping
// common/defines/00_defines.lua:
//     DEFAULT_PP_COST_FOR_POLITICAL_ADVISOR = 150
//     DEFAULT_PP_COST_FOR_MILITARY_ADVISOR  = 50
// So an army_chief, air_chief, navy_chief, high_command or theorist that declares nothing costs 50.
//
// Vanilla relies on this completely: across common/ideas it declares `cost` on ZERO of 297 political_advisor,
// 234 high_command, 145 theorist, 112 army_chief and 98 air_chief ideas — 886 advisor-slot ideas, not one
// with a cost line. Nova's editor filled the box from `editData.cost || "150"`, so opening any of them and
// pressing Save wrote `cost = 150` into a block that had none: a no-op edit that silently tripled every
// military advisor's price and pinned every political one to a literal.
//
// Blank now means blank, and the field says what the game will do with it. The MANUFACTURER slots are a
// different case and are left alone: vanilla declares cost on 16-33% of them and 150 is the commonest value
// it declares (150x39 industrial_concern, 150x25 materiel_manufacturer, 150x21 aircraft_manufacturer), and
// Millennium Dawn declares 150 on 100% of its designers. So the Genesis company prompt still suggests 150.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const matchBrace = (s, i) => { let d = 0; for (; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };

console.log("\n[ground truth] the engine's own defaults, from common/defines");
let defines = "";
try { defines = fs.readFileSync(path.join(V, "common", "defines", "00_defines.lua"), "utf8"); } catch (_) {}
const pol = /DEFAULT_PP_COST_FOR_POLITICAL_ADVISOR\s*=\s*([0-9.]+)/.exec(defines);
const mil = /DEFAULT_PP_COST_FOR_MILITARY_ADVISOR\s*=\s*([0-9.]+)/.exec(defines);
rec("the defines file was readable", defines.length > 1000, defines.length);
rec("a political advisor defaults to 150", pol && pol[1] === "150", pol && pol[1]);
rec("…and a MILITARY advisor to 50, not 150", mil && mil[1] === "50", mil && mil[1]);
rec("…so one blanket default cannot be right for both", pol && mil && pol[1] !== mil[1], { pol: pol && pol[1], mil: mil && mil[1] });

console.log("\n[ground truth] vanilla declares no cost on any advisor slot");
const ADVISOR_SLOTS = ["political_advisor", "army_chief", "navy_chief", "air_chief", "high_command", "theorist"];
const perSlot = new Map();
let ideaFiles = [];
try { ideaFiles = fs.readdirSync(path.join(V, "common", "ideas")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
for (const f of ideaFiles) {
  let t = "";
  try { t = fs.readFileSync(path.join(V, "common", "ideas", f), "utf8"); } catch (_) { continue; }
  t = t.replace(/#[^\n\r]*/g, "");
  const im = /(^|\n)\s*ideas\s*=\s*\{/.exec(t);
  if (!im) continue;
  const iStart = t.indexOf("{", im.index);
  const inner = t.slice(iStart + 1, matchBrace(t, iStart));
  const re = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const slot = m[2];
    const s = inner.indexOf("{", m.index);
    const e = matchBrace(inner, s);
    if (e < 0) break;
    const body = inner.slice(s + 1, e);
    re.lastIndex = e;
    if (!ADVISOR_SLOTS.includes(slot)) continue;
    const re2 = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/g;
    let m2;
    while ((m2 = re2.exec(body)) !== null) {
      const s2 = body.indexOf("{", m2.index);
      const e2 = matchBrace(body, s2);
      if (e2 < 0) break;
      const ib = body.slice(s2 + 1, e2);
      re2.lastIndex = e2;
      if (!perSlot.has(slot)) perSlot.set(slot, { n: 0, withCost: 0 });
      const r = perSlot.get(slot);
      r.n++;
      if (/(^|\n)\s*cost\s*=/.test(ib)) r.withCost++;
    }
  }
}
const totals = [...perSlot.values()].reduce((a, r) => ({ n: a.n + r.n, withCost: a.withCost + r.withCost }), { n: 0, withCost: 0 });
rec("vanilla ships hundreds of advisor-slot ideas", totals.n > 500, Object.fromEntries(perSlot));
rec("…and NOT ONE of them declares a cost", totals.withCost === 0, Object.fromEntries(perSlot));

console.log("\n[the bug] the editor must not invent a number the file does not have");
const IJS = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
rec("the load path no longer falls back to 150",
  /ideaCost"\)\.value = editData\.cost \|\| "";/.test(IJS), "still invents 150 on load");
rec("…and no reset path seeds the box with 150",
  !/getElementById\("ideaCost"\)\.value = "150";/.test(IJS), "a reset path still seeds 150");
rec("…and the AI path keeps a supplied number but invents none",
  /String\(parsedData\.cost\)\.replace\(\/\[\^0-9\]\/g, ""\) \|\| "";/.test(IJS), "AI path still falls back to 150");
const IHTML = fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8");
rec("the field itself starts blank", /id="ideaCost"[^>]*value=""/.test(IHTML),
  (IHTML.match(/<input[^>]*id="ideaCost"[^>]*>/) || [""])[0]);
rec("…and says what blank means, with both numbers",
  /150 political \/ 50 military/.test(IHTML), (IHTML.match(/<input[^>]*id="ideaCost"[^>]*>/) || [""])[0]);

console.log("\n[the writer was already right] an empty cost emits no line");
// The invention was purely client-side; the server already omits the key. Asserted so a "fix" on the server
// side cannot be added later in the belief that this was a two-ended bug.
const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
rec("the writer passes an empty cost through as empty",
  /cost: isCountrySpirit \? "" : \(cost \|\| ""\)/.test(SRV), "writer shape changed");

console.log("\n[deliberate non-change] companies are a different case");
rec("the Genesis COMPANY prompt still suggests 150", /cost: political power to assign \(default "150"\)/.test(IJS),
  "the company suggestion was removed — see the header comment for why it should stay");

console.log(`\n=== advisor cost invented: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
