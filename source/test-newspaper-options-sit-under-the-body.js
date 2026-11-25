// The event preview lays the newspaper out from the mod's own eventwindow.gui. For the OPTION BUTTONS it
// used the file's literal y, and that number is a baseline rather than a drawn position: HOI4 stacks an event
// window's sections at runtime, so the midsection grows to fit the description and the bottom section follows
// it down. Everyone has seen this — a long event popup is taller and its buttons sit lower.
//
// Drawn literally, vanilla's newspaper puts the option buttons at y=220 while its description starts at
// y=291. The buttons land across the bottom of the photograph and on top of the headline, 71px ABOVE the body
// they belong under. That render contradicts itself whatever the engine does.
//
// The fix must NOT be "always put them at the bottom". Old World Blues re-authored its news window
// self-consistently — grid at 462, below its own body — and renders correctly today. So the rule is: the
// file's y is a FLOOR, and it is only overridden where the file contradicts itself.
//
// ⭐ The geometry here is DERIVED from the eventwindow.gui files actually installed on this machine, not
// typed in. A hand-made fixture would only prove the arithmetic, and the whole point is which real windows
// are inconsistent.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

function extractFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

try {
  console.log("1. The placement is a function, not a literal");
  const fnSrc = extractFunction(SRC, "optionsTopFor");
  rec("optionsTopFor was extracted", !!fnSrc && fnSrc.length > 120, fnSrc ? fnSrc.length + " chars" : "NOT FOUND");
  rec("the grid no longer takes the file's y unconditionally",
    !/top: e\.y \+ "px", width: sw/.test(SRC), "the raw .gui y was being used as the drawn position");
  rec("…it goes through the function", /top: optionsTopFor\(e\) \+ "px"/.test(SRC));
  if (!fnSrc) throw new Error("cannot continue without optionsTopFor");

  // Run it for real, with the module-scope values it closes over injected.
  const build = (descTextEl, slotEl, H) =>
    new Function("descTextEl", "slotEl", "H", fnSrc + "; return optionsTopFor;")(descTextEl, slotEl, H);

  console.log("\n2. The real windows on this disk");
  // Derived, not typed: find every eventwindow.gui the machine has and read the two numbers that matter.
  const roots = [];
  const steam = "D:/SteamLibrary/steamapps";
  const game = path.join(steam, "common", "Hearts of Iron IV");
  if (fs.existsSync(game)) roots.push(["vanilla", game]);
  const ws = path.join(steam, "workshop", "content", "394360");
  if (fs.existsSync(ws)) {
    for (const d of fs.readdirSync(ws)) {
      const p = path.join(ws, d);
      try { if (fs.statSync(p).isDirectory()) roots.push([d, p]); } catch (_) {}
    }
  }
  const windows = [];
  for (const [name, root] of roots) {
    const gui = path.join(root, "interface", "eventwindow.gui");
    if (!fs.existsSync(gui)) continue;
    let text;
    try { text = fs.readFileSync(gui, "utf8"); } catch (_) { continue; }
    // The news window's own block, then the description y and the option grid's y inside it.
    const at = text.indexOf("EventWindow_News");
    if (at === -1) continue;
    const block = text.slice(at, at + 12000);
    const descAt = block.search(/name\s*=\s*"Description"/i);
    const gridAt = block.search(/gridboxtype/i);
    if (descAt === -1 || gridAt === -1) continue;
    const yOf = (from) => {
      const m = /y\s*=\s*(-?\d+)/.exec(block.slice(from, from + 700));
      return m ? Number(m[1]) : null;
    };
    const dy = yOf(descAt), gy = yOf(gridAt);
    if (dy == null || gy == null) continue;
    windows.push({ name, descY: dy, gridY: gy });
  }
  rec("found real eventwindow.gui files to measure", windows.length >= 2, windows.map((w) => w.name));

  console.log("\n3. Inconsistent windows are corrected; consistent ones are untouched");
  let corrected = 0, untouched = 0;
  for (const w of windows) {
    // These y values are relative to their own parents in the file; what matters for the rule is only
    // whether the description begins below the grid, which is the self-contradiction being fixed.
    const fn = build({ y: w.descY }, null, 595);
    const got = fn({ y: w.gridY, slot: { w: 300, h: 47 } });
    if (w.descY > w.gridY) {
      corrected++;
      rec(`${w.name}: grid ${w.gridY} is above body ${w.descY} → pushed below it`, got > w.descY,
        `moved to ${got}`);
    } else {
      untouched++;
      rec(`${w.name}: already self-consistent → left exactly where the file says`, got === w.gridY, `${got}`);
    }
  }
  // CONTROL: if every window fell in one bucket the rule would be untested in the other direction.
  rec("the corpus exercises BOTH branches", corrected > 0 && untouched > 0,
    `${corrected} corrected, ${untouched} untouched`);

  console.log("\n4. It cannot push the buttons off the paper");
  const tall = build({ y: 291 }, null, 595)({ y: 220, slot: { w: 300, h: 47 } });
  rec("the result stays inside the window height", tall + 47 <= 595, `top ${tall} + 47 <= 595`);
  const silly = build({ y: 10 }, null, 100)({ y: 5, slot: { w: 300, h: 47 } });
  rec("…even when the body claims more room than exists", silly + 47 <= 100 || silly === 53, `top ${silly}`);

  console.log("\n5. A negative slotsize height is a real mod, not a hypothetical");
  // Novum Vexillum ships `height = -67`. (sh - 4) gave "-71px", which is not a valid CSS length, so the
  // browser dropped it silently and the buttons took their natural height.
  rec("slot width is guarded against non-positive values", /e\.slot && e\.slot\.w > 0/.test(SRC));
  rec("slot height is guarded too", /e\.slot && e\.slot\.h > 0/.test(SRC));
  rec("…so the emitted height can never be negative",
    !/const sh = e\.slot \? e\.slot\.h : 47/.test(SRC), "the unguarded form is gone");
  const negSlot = build({ y: 291 }, null, 595)({ y: 220, slot: { w: 300, h: -67 } });
  rec("…and a negative slot does not corrupt the placement", Number.isFinite(negSlot) && negSlot > 0, negSlot);

  console.log("\n6. These checks would reject the behaviour that shipped");
  // No bug left to back out, so compose the old rule and confirm it fails where the new one passes.
  const OLD = (e) => e.y;
  const vanillaLike = { y: 220, slot: { w: 300, h: 47 } };
  rec("the old rule put the buttons above the body", OLD(vanillaLike) < 291);
  rec("…and the new rule does not", build({ y: 291 }, null, 595)(vanillaLike) > 291);

  console.log(`\n=== newspaper options sit under the body: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
