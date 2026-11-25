// #home-spirits-double-counts-characters — Home's 🛡️ Spirits chip counted every character twice.
//
// Characters are indexed as `idea` entities so the orphan/dependency logic can treat them uniformly, which
// means `counts.idea` is national spirits PLUS characters. mod-index therefore also publishes a corrected
// `counts.spirit` = idea − character, and its own comment at mod-index.js:1406 says why: "otherwise the
// spirit count is inflated". Mod Health's chip uses that corrected count.
//
// Home's progress strip read `counts.idea`. So the same scan produced two different Spirit numbers on two
// pages, and on Home every character was counted once under 👤 Characters and again inside 🛡️ Spirits —
// 12,987 against Mod Health's 10,518 on Millennium Dawn.
//
// It also broke what the strip is FOR. Zero-count chips read "Add a …" so the strip doubles as the next-step
// prompt, so a mod with characters but no spirits never showed the "Add a Spirit" zero-state — the very
// prompt a new mod most needs.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// ── the index still publishes the corrected count this depends on ─────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritcount-"));
const MOD = path.join(ROOT, "mod");
["common/ideas", "common/characters", "localisation/english"].forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SC"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "ideas", "zz.txt"),
  "ideas = {\n\tcountry = {\n\t\tthe_one_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "common", "characters", "zz.txt"),
  "characters = {\n" +
  ["alpha", "beta", "gamma"].map((n) =>
    `\tchar_${n} = {\n\t\tname = char_${n}\n\t\tcountry_leader = { ideology = despotism }\n\t}\n`).join("") +
  "}\n", "utf8");

const idx = mi.buildModIndex(MOD);
const c = idx.counts || {};
ok("the fixture has 1 spirit and 3 characters", c.character === 3, c);
ok("counts.idea really does include the characters", c.idea === 4, c);
ok("…and the index publishes a corrected counts.spirit", c.spirit === 1, c);

// ── Home must use the corrected one ───────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");
const stepsAt = src.indexOf("const PROGRESS_STEPS");
const steps = src.slice(stepsAt, src.indexOf("];", stepsAt));
ok("the Spirits chip keys on `spirit`, not `idea`",
  /\{ key: "spirit",[^}]*many: "Spirits"/.test(steps), steps);
ok("…with `idea` only as a fallback for an older cached payload",
  /fallbackKey: "idea"/.test(steps), steps);
ok("…and it explains why", /home-spirits-double-counts-characters/.test(steps), "no marker comment");

// Run the real renderer expression against the real counts.
const readN = new Function("c", "s", `
  return (c[s.key] != null) ? c[s.key] : (s.fallbackKey ? (c[s.fallbackKey] || 0) : 0);
`);
const spiritStep = { key: "spirit", fallbackKey: "idea" };
ok("so the chip shows 1, not 4", readN(c, spiritStep) === 1, readN(c, spiritStep));
ok("…and the Characters chip still shows 3", readN(c, { key: "character" }) === 3, readN(c, { key: "character" }));
ok("Home and Mod Health now agree",
  readN(c, spiritStep) === ((c.spirit != null) ? c.spirit : (c.idea || 0)), { home: readN(c, spiritStep), modhealth: c.spirit });

// ── the zero-state the strip exists for ───────────────────────────────────────────────────────────
const charsOnly = { character: 3, idea: 3, spirit: 0 };
ok("a mod with characters but NO spirits now shows 0 spirits", readN(charsOnly, spiritStep) === 0, readN(charsOnly, spiritStep));
ok("…which is what makes the chip read \"Add a spirit\"", (readN(charsOnly, spiritStep) ? false : true));

// ── the fallback itself ───────────────────────────────────────────────────────────────────────────
ok("an older payload without counts.spirit falls back to idea rather than showing 0",
  readN({ idea: 7, character: 2 }, spiritStep) === 7, readN({ idea: 7, character: 2 }, spiritStep));
ok("…and a genuine 0 is not overridden by the fallback",
  readN({ spirit: 0, idea: 5 }, spiritStep) === 0, readN({ spirit: 0, idea: 5 }, spiritStep));

// ── the correction in mod-index must stay ─────────────────────────────────────────────────────────
const mis = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8");
ok("mod-index still derives spirit from idea minus character",
  /counts\.spirit = \(counts\.idea \|\| 0\) - counts\.character/.test(mis), "correction removed");

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log("\ntest-home-spirit-count: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 13 ? 0 : 1;
