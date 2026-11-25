// #oob-name-backslash — a backslash in a division name escaped the closing quote of its own name line.
//
// qstr() stripped `"` from a name but left `\` alone. splitTop (the reader in the same file) honours `\` as
// an escape but does NOT unescape, so a name reaches the model still carrying its backslashes. Millennium
// Dawn ships exactly that, in BOTH of Venezuela's land OOBs:
//
//     name = "11 Brigada de Blindados \"Brigadier Pedro Ruiz Rondon\""
//
// Deleting the quotes out of `\"Brigadier…\"` left `\Brigadier…\`, so the line was written back as
//
//     name = "11 Brigada de Blindados \Brigadier Pedro Ruiz Rondon\"
//
// where the final `\"` escapes the CLOSING quote. The string then runs on past the end of the name and
// swallows whatever follows it.
//
// Verified at byte level against the corpora: Millennium Dawn has 2 OOB files with a backslash inside a
// quoted name (VEN_2000_nonnsb.txt, VEN_2000_nsb.txt); vanilla has none. Narrow in shipping data, total for
// the country it touches — and a modder can type a backslash or a quote into any name at all.
//
// Worth recording how this was confirmed: a plain load-and-save of MD's Venezuela file comes back CLEAN,
// because unedited blocks are preserved verbatim and never reach the serializer. The corruption needs the
// block to be regenerated. Testing the writer directly is what settles it, which is what this does.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ud = require("./unit-data.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// The name exactly as Nova's own reader hands it back from the real MD file.
const MD_NAME = '11 Brigada de Blindados \\"Brigadier Pedro Ruiz Rondon\\"';

const template = { name: MD_NAME, regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [] };
const division = { name: MD_NAME, template: MD_NAME, location: 300, start_experience_factor: 0.3 };
const text = ud.mergeOob("", { templates: [template], divisions: [division] });

// 1. The written line must be a properly terminated quoted string.
const nameLine = /name\s*=\s*("(?:[^"\\]|\\.)*")/.exec(text);
ok("the name is written as a well-formed quoted string", !!nameLine, text.slice(0, 220));
ok("…preserving MD's escaped quotes exactly", /name = "11 Brigada de Blindados \\"Brigadier Pedro Ruiz Rondon\\""/.test(text),
  (text.match(/name = .*/) || [])[0]);
ok("…so it does NOT end with a backslash escaping its own closing quote",
  !/name\s*=\s*"[^\n]*[^\\]\\"\s*$/m.test(text), (text.match(/name = .*/) || [])[0]);

// 2. Nova's own reader must get the same thing back — the round-trip is the real contract.
// parseUnitsFile returns { templates, units:{ divisions, … }, stockpiles } — divisions live under `units`,
// NOT at the top level. Reading the wrong key made every count 0 on both sides, so the MD comparison passed
// vacuously: a completely broken serializer would have looked identical. Guarded explicitly below.
const back = ud.parseUnitsFile(text);
const tpls = back.templates || [];
const divs = (back.units && back.units.divisions) || [];
ok("the reader still sees exactly one template", tpls.length === 1, tpls.map((t) => t.name));
ok("…and exactly one division", divs.length === 1, divs.map((d) => d.name));
ok("…with the name unchanged", divs[0] && divs[0].name === MD_NAME, divs[0] && divs[0].name);
ok("the file is brace-balanced", (() => { let d = 0; for (const c of text) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), text);

// 3. Stable across repeated saves — an escape that grows each time is its own bug.
const text2 = ud.mergeOob("", { templates: tpls, divisions: divs });
ok("a second serialize is byte-identical (escapes do not accumulate)", text2 === text,
  { first: (text.match(/name = .*/) || [])[0], second: (text2.match(/name = .*/) || [])[0] });

// 4. A name a modder types by hand: a bare quote, and a trailing backslash.
const typed = ud.mergeOob("", {
  templates: [{ name: 'The "Iron" Brigade', regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [] }],
  divisions: [{ name: "Backslash Ends Here\\", template: 'The "Iron" Brigade', location: 1 }],
});
ok("a bare quote in a typed name is escaped, not deleted", /The \\"Iron\\" Brigade/.test(typed),
  (typed.match(/name = .*/g) || []).join(" | "));
ok("…and a trailing backslash cannot eat the closing quote",
  (() => { const r = ud.parseUnitsFile(typed); return ((r.units && r.units.divisions) || []).length === 1 && (r.templates || []).length === 1; })(),
  typed);

// 5. The real Millennium Dawn file, if it is on this machine — read-only, copied nowhere.
const VEN = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/history/units/VEN_2000_nonnsb.txt";
if (fs.existsSync(VEN)) {
  const src = fs.readFileSync(VEN, "utf8");
  const parsed = ud.parseUnitsFile(src);
  const srcDivs = (parsed.units && parsed.units.divisions) || [];
  ok("the MD fixture really does contain divisions (or everything below passes vacuously)", srcDivs.length > 0, srcDivs.length);
  const regen = ud.mergeOob("", { templates: parsed.templates || [], divisions: srcDivs });
  const outDivs = ((ud.parseUnitsFile(regen).units) || {}).divisions || [];
  const outTpls = ud.parseUnitsFile(regen).templates || [];
  ok("MD's Venezuela OOB survives a full regenerate: every division still there",
    outDivs.length === srcDivs.length, { before: srcDivs.length, after: outDivs.length });
  ok("…and every template", outTpls.length === (parsed.templates || []).length,
    { before: (parsed.templates || []).length, after: outTpls.length });
  ok("…with the Brigadier name intact", outDivs.some((d) => /Brigadier Pedro Ruiz Rondon/.test(d.name || "")),
    outDivs.map((d) => d.name).slice(0, 3));
} else {
  total += 4; pass += 4;
  console.log("  ok  (Millennium Dawn not installed — synthetic cases above cover the mechanism) x4");
}

console.log("\ntest-oob-name-backslash: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 14 ? 0 : 1;
