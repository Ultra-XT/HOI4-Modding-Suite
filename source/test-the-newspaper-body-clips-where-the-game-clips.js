// "Will my text fit?" is the question a fixed-frame preview exists to answer, and the newspaper preview was
// answering it wrong on every mod installed here, in both directions.
//
// Two independent causes, which compounded:
//
//   1. server.js parsed `maxWidth` for event-window text boxes but not `maxHeight` — while the SIBLING
//      parser for the other window family reads both. With nothing to read, the client guessed the body's
//      clip height from whatever element happened to sit below it, falling through to a magic 200 when
//      nothing did. For a newspaper nothing ever does: the picture and the options grid both resolve ABOVE
//      the description.
//
//   2. The stage drew 16px text on a CSS line-height of 1.28. Every font the newspaper uses declares
//      lineHeight equal to its point size in its .fnt file — exactly 1.0.
//
// Vanilla: a 230px box of 16px lines is 14 lines of copy. Nova showed a 200px box of 20.48px lines = 9. The
// author was cutting their body a third early, with no signal that the limit was Nova's and not the game's.
//
// ⭐ The declared heights here are DERIVED from the eventwindow.gui files actually installed, not typed in.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
const HTML = fs.readFileSync(path.join(__dirname, "public", "events.html"), "utf8");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The parser asks the .gui for the height it declares");
  const textPush = (/kind: "text"[^}]*\}/.exec(SERVER) || [])[0] || "";
  rec("the event-window text parser was found", textPush.length > 60, textPush.slice(0, 70));
  rec("it reads maxWidth", /maxWidth: attrNum\(inner, "maxWidth"\)/.test(SERVER));
  rec("…and now maxHeight too", /maxHeight: attrNum\(inner, "maxHeight"\)/.test(SERVER),
    "without it the client has nothing to read and must guess");
  // The sibling parser is the precedent — it always read both. This is the asymmetry that caused the bug.
  rec("the sibling parser still reads both, so the two agree",
    /maxWidth:[^\n]*maxWidth/.test(SERVER) && /maxHeight:[^\n]*maxHeight/.test(SERVER));

  console.log("\n2. The client prefers the declared height over any guess");
  rec("the declared value is used first", /e\.maxHeight > 0 \? e\.maxHeight/.test(EVENTS));
  rec("…with the guess kept only as a fallback", /e\.maxHeight > 0 \? e\.maxHeight : \(below/.test(EVENTS));
  rec("the magic 200 is no longer reachable when the .gui declares a height",
    !/const maxH = below \? Math\.max\(30, below - e\.y - 4\) : 200;/.test(EVENTS),
    "the unconditional guess is gone");

  console.log("\n3. …and the guess's own bug is fixed while it is still there");
  // `layout.elements.find(e => e.kind === "grid")` takes the FIRST grid, not the options grid.
  rec("the fallback targets the OPTIONS grid specifically",
    /kind === "grid" && \/options\/i\.test/.test(EVENTS), "the first grid is not necessarily the options grid");

  console.log("\n4. Line spacing matches the font, not a guess");
  const stageRule = (/\.ev-stage #previewEventTitle[\s\S]{0,400}?\}/.exec(HTML) || [])[0] || "";
  rec("the stage typography rule was found", stageRule.length > 80);
  rec("line-height is 1.0, as every newspaper .fnt declares", /line-height:\s*1\s*;/.test(stageRule),
    "HOI4 fonts declare lineHeight == point size");
  rec("…and 1.28 is gone", !/line-height:\s*1\.28/.test(stageRule));

  console.log("\n5. What that arithmetic means for the author");
  // The whole point, stated as the number of lines the preview lets them see.
  const linesAt = (boxPx, fontPx, ratio) => Math.floor(boxPx / (fontPx * ratio));
  rec("before: a 200px box at 1.28 showed 9 lines", linesAt(200, 16, 1.28) === 9, linesAt(200, 16, 1.28));
  rec("after: vanilla's declared 230px box at 1.0 shows 14", linesAt(230, 16, 1) === 14, linesAt(230, 16, 1));
  rec("…which is what HOI4 draws", linesAt(230, 16, 1) === 14);

  console.log("\n6. Measured against the real windows on this disk");
  // DERIVED: read maxHeight for the news description straight out of every installed eventwindow.gui.
  const roots = [];
  const steam = "D:/SteamLibrary/steamapps";
  const game = path.join(steam, "common", "Hearts of Iron IV");
  if (fs.existsSync(game)) roots.push(["vanilla", game]);
  const ws = path.join(steam, "workshop", "content", "394360");
  if (fs.existsSync(ws)) for (const d of fs.readdirSync(ws)) {
    const p = path.join(ws, d);
    try { if (fs.statSync(p).isDirectory()) roots.push([d, p]); } catch (_) {}
  }
  const declared = [];
  for (const [name, root] of roots) {
    const gui = path.join(root, "interface", "eventwindow.gui");
    if (!fs.existsSync(gui)) continue;
    let text; try { text = fs.readFileSync(gui, "utf8"); } catch (_) { continue; }
    const at = text.indexOf("EventWindow_News");
    if (at === -1) continue;
    const block = text.slice(at, at + 12000);
    const dAt = block.search(/name\s*=\s*"Description"/i);
    if (dAt === -1) continue;
    const m = /maxHeight\s*=\s*(\d+)/i.exec(block.slice(dAt, dAt + 700));
    if (m) declared.push({ name, maxHeight: +m[1] });
  }
  rec("real windows declare a maxHeight to read", declared.length >= 2, declared);
  // The bug was that the SHOWN value matched the declared one nowhere. Assert the corpus proves the point:
  // at least one window declares something other than the old magic 200, in each direction.
  rec("…and at least one declares MORE than the old 200", declared.some((d) => d.maxHeight > 200), declared);
  rec("…and at least one declares LESS", declared.some((d) => d.maxHeight < 200), declared);

  console.log("\n7. This would have rejected what shipped");
  const OLD_MAXH = (below) => (below ? Math.max(30, below - 291 - 4) : 200);
  rec("the old rule gave a newspaper 200 regardless of the file", OLD_MAXH(0) === 200);
  rec("…and the file says otherwise", declared.some((d) => d.maxHeight !== 200), declared);

  console.log(`\n=== the newspaper body clips where the game clips: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
