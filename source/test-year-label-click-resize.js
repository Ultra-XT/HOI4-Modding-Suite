// #year-label-click-resizes — CLICKING A YEAR MARKER SILENTLY CHANGED ITS SIZE.
//
// Reported from play: "when I click on a font or a text in the research tree it auto-changes the size and
// doesn't put it back. The program doesn't say it changes the size, but it does."
//
// The resize handle bound mousedown and committed on mouseup unconditionally. A click IS a mousedown and a
// mouseup with no movement between them, so merely selecting a marker ran the commit. For a marker the user
// had never resized, `col.fontSize` is undefined, so `col.fontSize || 13` wrote 13px — while the label had
// been rendering at the stylesheet's 19px, because the renderer only applies an inline size once one exists
// (`if (col.fontSize) label.style.fontSize = …`). One click, a permanent size change, no message.
//
// Two fixes: only commit when the pointer actually moved, and take the implicit default from what is on
// SCREEN (the CSS 19px) instead of 13, so grabbing the handle no longer jumps before the first movement.
//
// This is a client-side behaviour, so the test pins it at the source level: the commit is guarded by a
// movement flag, and no path still defaults a year font to the old 13.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const JS = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "research.html"), "utf8");

// the resize-handle mousedown body, so the assertions are about THAT handler and not the whole file
function handlerBody() {
  const i = JS.indexOf("handle.addEventListener(\"mousedown\"");
  if (i === -1) return "";
  return JS.slice(i, i + 1600);
}

(async () => {
  try {
    console.log("\n[ground truth] the stylesheet's size is what an untouched marker shows");
    const rule = /\.year-marker-label\s*\{[\s\S]*?\}/.exec(HTML);
    rec("research.html styles .year-marker-label", !!rule, "no rule found");
    const css = rule ? /font-size:\s*(\d+)px/.exec(rule[0]) : null;
    rec("…with an explicit font-size", !!css, rule && rule[0].slice(0, 200));
    const cssPx = css ? Number(css[1]) : null;
    rec("the renderer only applies an inline size once the marker HAS one",
      /if \(col\.fontSize\) label\.style\.fontSize/.test(JS), "renderer changed shape");

    console.log("\n[the constant] the code's default matches the stylesheet");
    const decl = /const YEAR_LABEL_DEFAULT_PX = (\d+);/.exec(JS);
    rec("YEAR_LABEL_DEFAULT_PX is declared", !!decl, "not declared");
    rec("…and equals the CSS font-size", decl && cssPx && Number(decl[1]) === cssPx,
      { constant: decl && decl[1], css: cssPx });

    console.log("\n[the fix] a click must not commit");
    const body = handlerBody();
    rec("the resize handler was found", !!body, "handler not found");
    rec("it tracks whether the pointer moved", /let moved = false;/.test(body), body.slice(0, 300));
    rec("…sets that flag on movement", /onMove = \([^)]*\) => \{ moved = true;/.test(body), body.slice(0, 400));
    rec("…and commits ONLY when it moved", /if \(moved\) setYearFont\(/.test(body), body.slice(0, 700));
    rec("…so mouseup alone writes nothing",
      !/removeEventListener\("mouseup", onUp\); setYearFont\(/.test(body), "still commits unconditionally");

    console.log("\n[no stragglers] nothing still defaults a year font to 13");
    const codeOnly = JS.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const stragglers = [...codeOnly.matchAll(/fontSize[^\n]{0,40}\|\|\s*13\b/g)].map((m) => m[0]);
    rec("no `fontSize || 13` remains in code", stragglers.length === 0, stragglers);
    rec("the default is used in several places", (JS.match(/YEAR_LABEL_DEFAULT_PX/g) || []).length >= 5,
      (JS.match(/YEAR_LABEL_DEFAULT_PX/g) || []).length);

    console.log("\n[still parses]");
    rec("public/research.js is syntactically valid", (() => {
      try { new Function(JS); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(JS); return "ok"; } catch (e) { return String(e.message); } })());

    console.log(`\n=== year label click resize: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
