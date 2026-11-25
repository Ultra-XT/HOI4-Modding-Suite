// Three halves that survived the first pass of the newspaper campaign. Each was reported, each was
// half-fixed, and each needed checking against the corpus rather than assuming the fixed half covered it.
//
//   1. maxHeight was applied to the BODY only, so the headline was not clipped at all. All four installed
//      windows declare 32 for the title, which at the newspaper's font is one line — an author writing a
//      two-line headline saw both and the player sees one.
//
//   2. max_slots_horizontal was parsed NOWHERE, so the options always drew as one column. Vanilla and
//      Millennium Dawn declare 1 so nothing changes for them, but Old World Blues declares 2: a four-option
//      event is a 2x2 block in game and a 4-high column in Nova. Wrong shape and twice the height.
//
//   3. The Newspaper Style THUMBNAIL asked for a hardcoded GFX_event_news_bg while the preview beside it
//      draws layout.background. On a mod whose news window names a different backdrop those two disagree,
//      and both are labelled as that mod's newspaper.
//
// ⭐ The corpus is what makes 2 and 3 testable: they are invisible on vanilla and only appear on a mod that
// declares something different. A fixture would have proved the arithmetic and none of the point.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Read a declared attribute out of an installed EventWindow_News block. Derived, not restated.
function newsWindowAttr(dir, re) {
  const gui = path.join(dir, "interface", "eventwindow.gui");
  if (!fs.existsSync(gui)) return null;
  let text; try { text = fs.readFileSync(gui, "utf8"); } catch (_) { return null; }
  const at = text.indexOf("EventWindow_News");
  if (at === -1) return null;
  const m = re.exec(text.slice(at, at + 12000));
  return m ? Number(m[1]) : null;
}

try {
  console.log("1. The headline is clipped, like the body");
  rec("the title gets a maxHeight from the .gui", /maxHeight: \(e\.maxHeight > 0 \? e\.maxHeight \+ "px" : ""\)[\s\S]{0,200}?fontWeight: "700"/.test(EVENTS),
    "it was applied to the description only");
  rec("…and clips rather than overflowing", /overflow: \(e\.maxHeight > 0 \? "hidden" : ""\)/.test(EVENTS));
  rec("…while the body still has its own", /maxHeight: maxH \+ "px"/.test(EVENTS));

  console.log("\n2. The option grid honours max_slots_horizontal");
  rec("the parser collects it", /slotsH: attrNum\(inner, "max_slots_horizontal"\)/.test(SERVER),
    "it was parsed nowhere, so every grid drew as one column");
  rec("the client reads it", /const cols = e\.slotsH > 1 \? e\.slotsH : 1/.test(EVENTS));
  rec("…and lays out a wrapping row when it is wider than one", /flexDirection: cols > 1 \? "row" : "column"/.test(EVENTS));
  rec("…sized to hold exactly that many slots", /width: \(sw \* cols \+ GAP \* \(cols - 1\)\) \+ "px"/.test(EVENTS));

  console.log("\n3. The thumbnail resolves the sprite the PREVIEW draws");
  rec("it no longer hardcodes the key", !/sprite-url\?key=GFX_event_news_bg/.test(EVENTS),
    "the preview uses layout.background; a fixed key disagrees with it");
  rec("…it reads the window's own background", /nl\.background && nl\.background !== "GFX_tiled_window_transparent"/.test(EVENTS));
  rec("…and still falls back to the conventional key", /let key = "GFX_event_news_bg"/.test(EVENTS));

  console.log("\n4. Measured against the installed corpus");
  const roots = [];
  const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (fs.existsSync(game)) roots.push(["vanilla", game]);
  const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
  if (fs.existsSync(ws)) for (const d of fs.readdirSync(ws)) {
    const p = path.join(ws, d);
    if (fs.existsSync(path.join(p, "interface", "eventwindow.gui"))) roots.push([d, p]);
  }
  const rows = roots.map(([name, dir]) => ({
    mod: name,
    titleMaxHeight: newsWindowAttr(dir, /name\s*=\s*"Title"[\s\S]{0,600}?maxHeight\s*=\s*(\d+)/),
    slotsH: newsWindowAttr(dir, /max_slots_horizontal\s*=\s*(\d+)/),
  }));
  rows.forEach((r) => console.log(`     ${r.mod}: titleMaxHeight=${r.titleMaxHeight} max_slots_horizontal=${r.slotsH}`));
  rec("real windows were read", rows.length >= 2, rows.length + " windows");

  console.log("\n5. The corpus exercises BOTH branches, or the rules are untested");
  const single = rows.filter((r) => r.slotsH === 1);
  const multi = rows.filter((r) => r.slotsH > 1);
  rec("at least one window declares a SINGLE column", single.length >= 1, single.map((r) => r.mod));
  rec("…and at least one declares MORE", multi.length >= 1,
    multi.length ? multi.map((r) => `${r.mod}=${r.slotsH}`) : "nothing would prove the wrap branch");
  // The headline clip must be a real constraint, not a no-op.
  const clipped = rows.filter((r) => r.titleMaxHeight > 0);
  rec("windows really do declare a title height", clipped.length >= 1,
    clipped.map((r) => `${r.mod}=${r.titleMaxHeight}`));

  console.log("\n6. The layout maths, composed");
  const width = (sw, cols, gap) => sw * cols + gap * (cols - 1);
  rec("one column is just the slot width", width(300, 1, 3) === 300);
  rec("two 252px columns come to 507", width(252, 2, 3) === 507, "which is what Old World Blues renders");

  console.log("\n7. This would have rejected what shipped");
  rec("the old title style had no maxHeight",
    !/maxHeight/.test('Object.assign(title.style, { position: "absolute", left: e.x + "px", fontWeight: "700" });'));
  rec("the old grid had no column count",
    !/slotsH/.test('out.push({ kind: "grid", name: attrStr(inner, "name"), x: ex, y: ey, slot: slotSize(inner) });'));
  rec("the old thumbnail hardcoded the key",
    /key=GFX_event_news_bg/.test("fetch(`/api/ideas/sprite-url?key=GFX_event_news_bg&modPath=${m}`)"));

  console.log(`\n=== the newspaper grid and headline obey the gui: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
