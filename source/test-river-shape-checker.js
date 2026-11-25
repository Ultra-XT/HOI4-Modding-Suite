// The river shape checker sees every rule a generated river must keep, each on its own, and the classifier it reads a palette
// with is the one fixMalformedRivers repairs by. #a-generated-river-is-judged-by-the-rules-a-river-is-drawn-by #one-river-index-classifier
//
// riverShapeProblems (map-data.js) is the generator's GATE and its tests' judge: a generated river that breaks one of these is
// not written. It is deliberately NOT a Map Errors rule — vanilla itself has 8 illegal branches, 4 2x2 blocks, 11 diagonal
// contacts, 12 sourceless rivers and 4 loops, and launches. So each rule is pinned here on its own tiny drawing: a positive case
// where exactly that rule fires, and the clean river, where nothing does. A rule that is switched off fails its own case.
//
// Drawings: "." background (255), "g" the green source (0), "r" the red flow-in (1), "y" the yellow flow-out (2), "b" a river
// body (3) — read through vanilla's own palette layout (testlib-river-world.js), so the checker classifies by COLOUR.
"use strict";

const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const RW = require("./testlib-river-world.js");
const { maskJsLiterals, maskJsComments, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const CODE = { ".": RW.BG, g: RW.GREEN, r: RW.RED, y: 2, b: 3 };
function drawing(rows) {
  const H = rows.length, W = rows[0].length, idx = new Uint8Array(W * H);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { idx[y * W + x] = CODE[ch]; }));
  return { W, H, idx };
}
const judge = (rows, onlyRows = null) => {
  const d = drawing(rows);
  let onlyMask = null;
  if (onlyRows) { const m = drawing(onlyRows); onlyMask = Uint8Array.from(m.idx, (v) => (v === RW.BG ? 0 : 1)); }
  return md.riverShapeProblems({ W: d.W, H: d.H, idx: d.idx, palette: RW.PALETTE, onlyMask });
};
const RULES = ["isolated", "degree4", "illegalBranch", "greenNotAnEnd", "redNotAJoin", "onSeam", "blocks2x2", "diagonalOnly", "noSource", "twoSources", "loops", "tooShortBranch"];
const fired = (r) => RULES.filter((k) => r[k]).map((k) => `${k}:${r[k]}`);

// a clean river: a green head, a body, and a tributary of three pixels whose last pixel is a red beside the main
const CLEAN = [
  "..........",
  ".gbbbbbbb.",
  ".....r....",
  ".....b....",
  ".....b....",
  "..........",
];

console.log("1. The clean river breaks no rule");
{
  const r = judge(CLEAN);
  rec("⭐ every rule 0 on a green-headed river with a red-joined tributary of three pixels", fired(r).length === 0 && r.components === 1, { fired: fired(r), components: r.components });
}

console.log("\n2. Each rule fires on its own drawing");
const CASES = {
  isolated: ["....", ".b..", "...."],
  degree4: [".......", "...b...", ".gbbbb.", "...b...", "...b...", "......."],
  illegalBranch: ["........", ".gbbbbb.", "....b...", "....b...", "....b...", "........"],
  greenNotAnEnd: [".......", ".bbgbb.", "......."],
  redNotAJoin: [".......", ".gbbbr.", "......."],
  onSeam: ["......", "gbbbb.", "......"],
  blocks2x2: [".......", ".gbbbb.", "....bb.", "......."],
  diagonalOnly: [".........", ".gbb.....", "....bbbg.", "........."],
  noSource: [".......", ".bbbbb.", "......."],
  twoSources: [".......", ".gbbbg.", "......."],
  loops: ["........", ".bbbb...", ".b..b...", ".bbbb...", "....b...", "....b...", "....g...", "........"],
  tooShortBranch: ["..........", ".gbbbbbbb.", ".....r....", ".....b....", ".........."],
};
for (const rule of RULES) {
  const r = judge(CASES[rule]);
  rec(`⭐ ${rule} fires exactly once on its drawing`, r[rule] === 1, { [rule]: r[rule], fired: fired(r) });
  rec(`   …and names where (examples.${rule})`, !!(r.examples && r.examples[rule] && Number.isFinite(r.examples[rule].x)), r.examples);
}

console.log("\n3. The controls: one pixel moved and the rule is quiet");
{
  // ⚠️ each negative is its positive with ONE change, so a drawing cannot pass for a reason other than the rule
  const pairs = {
    illegalBranch: ["........", ".gbbbbb.", "....r...", "....b...", "....b...", "........"],     // the branch joins through a red
    greenNotAnEnd: [".......", ".gbbbb.", "......."],                                             // the green at the end
    redNotAJoin: [".......", ".gbbbb.", "......."],                                               // no red at the end
    onSeam: [".......", ".gbbbb.", "......."],                                                    // one pixel off the seam
    blocks2x2: [".......", ".gbbbb.", ".....b.", "......."],                                     // one pixel of the block gone
    diagonalOnly: [".........", ".gbbb....", "....bbbg.", "........."],                           // the corner drawn
    noSource: [".......", ".gbbbb.", "......."],
    twoSources: [".......", ".gbbbb.", "......."],
    tooShortBranch: CLEAN,                                                                        // the branch is three pixels
  };
  for (const [rule, rows] of Object.entries(pairs)) {
    const r = judge(rows);
    rec(`${rule} is 0 once the drawing keeps the rule`, r[rule] === 0, { [rule]: r[rule] });
  }
  rec("⭐ THE CONTROL: a two-pixel river is too short from its own green, a three-pixel one is not",
    judge([".....", ".gb..", "....."]).tooShortBranch === 1 && judge([".....", ".gbb.", "....."]).tooShortBranch === 0);
}

console.log("\n4. onlyMask judges only the rivers a write drew");
{
  // ⚠️ the river that is not this write's breaks a COMPONENT rule (no source) and a PIXEL rule (a 2x2 block): the two are scoped
  // by different code, and one drawing must catch either scope being dropped
  const both = [
    "..........",
    ".gbbbbbb..",
    "..........",
    ".bbbbb....",   // a river with no source and a 2x2 block in it — not this write's
    "....bb....",
    "..........",
  ];
  const ours = [
    "..........",
    ".gbbbbbb..",
    "..........",
    "..........",
    "..........",
    "..........",
  ];
  const all = judge(both), mine = judge(both, ours);
  rec("THE CONTROL: judged whole, the other river's missing source and its 2x2 block are counted", all.noSource === 1 && all.blocks2x2 === 1 && all.components === 2, { noSource: all.noSource, blocks2x2: all.blocks2x2, components: all.components });
  rec("⭐ judged by the write's own pixels, only the write's river is judged, and it is clean", fired(mine).length === 0 && mine.components === 1, { fired: fired(mine), components: mine.components });
  // a diagonal contact between the write's river and one it found is the write's to answer for
  const touch = [".........", ".gbb.....", "....bbbb.", "........."], touchOurs = [".........", ".gbb.....", ".........", "........."];
  rec("⭐ a diagonal contact with a river the write found counts against the write", judge(touch, touchOurs).diagonalOnly === 1, judge(touch, touchOurs));
}

console.log("\n5. ⛔ #one-river-index-classifier — one reading of a palette, shared with fixMalformedRivers");
{
  const roles = md.riverIndexRoles(RW.PALETTE);
  const grey = (c) => Math.abs(c.r - c.g) <= 12 && Math.abs(c.g - c.b) <= 12 && Math.abs(c.r - c.b) <= 12;
  // what the wiki's scheme says of each index, read off the fixture palette's own colours
  const wrong = [];
  RW.PALETTE.forEach((c, i) => {
    const want = { bg: grey(c), source: c.g === 255 && !c.r && !c.b, flowIn: c.r === 255 && !c.g && !c.b, flowOut: c.r === 255 && c.g >= 250 && !c.b };
    for (const k of Object.keys(want)) if (roles[k][i] !== want[k]) wrong.push(`${i}.${k}`);
    if (roles.srcFlow[i] !== (want.source || want.flowIn || want.flowOut)) wrong.push(`${i}.srcFlow`);
  });
  rec("⭐ background, source, flow-in, flow-out and srcFlow per index, as the colours say", wrong.length === 0, wrong.slice(0, 10));
  rec("THE CONTROL: the fixture palette has each role (a classifier that answered false everywhere would pass the line above on a grey palette)",
    roles.source.filter(Boolean).length >= 1 && roles.flowIn.filter(Boolean).length >= 1 && roles.flowOut.filter(Boolean).length >= 1 && roles.bg.filter((v) => !v).length >= 12);
  rec("an index the palette does not have is background", md.riverIndexRoles([{ r: 0, g: 255, b: 0 }]).bg[1] === true);
  // ⚠️ "background" is the overlay's reading too (isRiverBackground, which once called the green source background and hid all
  // 317 of vanilla's): one grey rule, so a fix to it reaches every reader. Swept over colours on both sides of its threshold.
  {
    const sweep = [];
    for (const base of [0, 40, 122, 200, 255]) for (const d of [0, 1, 11, 12, 13, 14, 40]) for (const [dr, dg, db] of [[d, 0, 0], [0, d, 0], [0, 0, d], [d, d, 0], [-d, 0, d]]) {
      const cl = (v) => Math.max(0, Math.min(255, v));
      sweep.push({ r: cl(base + dr), g: cl(base + dg), b: cl(base + db) });
    }
    const off = [];
    for (let s = 0; s < sweep.length; s += 256) {
      const pal = sweep.slice(s, s + 256), roles2 = md.riverIndexRoles(pal);
      pal.forEach((c, i) => { if (roles2.bg[i] !== md.isRiverBackground(c)) off.push(c); });
    }
    const greyN = sweep.filter((c) => md.isRiverBackground(c)).length;
    rec("THE CONTROL: the sweep has colours either side of the grey threshold (a difference of 12 is grey, 13 is not)",
      greyN > 0 && greyN < sweep.length && md.isRiverBackground({ r: 122, g: 134, b: 122 }) && !md.isRiverBackground({ r: 122, g: 135, b: 122 }), { greyN, of: sweep.length });
    rec("⭐ riverIndexRoles calls an index background exactly when isRiverBackground calls its colour background", off.length === 0, off.slice(0, 5));
  }

  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const masked = maskJsLiterals(src), at = masked.indexOf("function fixMalformedRivers(");
  const span = at < 0 ? null : jsBodyAt(masked, at);
  const body = span ? stripJsComments(src.slice(span[0], span[1] + 1)) : "";
  rec("THE CONTROL: fixMalformedRivers' body is found and is the river repair", body.length > 2000 && /safeModWrite\(modFile, buf, "map-fixMalformedRivers"\)/.test(body), body.length);
  rec("⭐ fixMalformedRivers reads its palette AND the base game's through the module's riverIndexRoles",
    (body.match(/\briverIndexRoles\(/g) || []).length === 2, (body.match(/\briverIndexRoles\(/g) || []).length);
  rec("⭐ …and keeps no classifier of its own beside it (a second copy is how two readers of one file part)",
    !/(const|let|var|function)\s+riverIndexRoles\b/.test(body) && !/\bisSrc\b|\bisFlow\b/.test(body), (body.match(/(const|let|var|function)\s+riverIndexRoles\b|\bisSrc\b|\bisFlow\b/) || [])[0]);
  // ⚠️ the marker colour rules as riverIndexRoles writes them, each split into its comparisons with the colour's name left open: a
  // copy is a rule ALL of whose comparisons stand in fixMalformedRivers again, in any order, under any name (its green index was
  // found by such a copy until 10-02)
  const rAt = masked.indexOf("function riverIndexRoles("), rSpan = rAt < 0 ? null : jsBodyAt(masked, rAt);
  const rBody = rSpan ? stripJsComments(src.slice(rSpan[0], rSpan[1] + 1)) : "";
  const rules = [...rBody.matchAll(/\b(source|flowIn|flowOut)\[i\] = ([^;]+);/g)].map((m) => ({ role: m[1], parts: m[2].split(/&&|\|\|/).map((p) => p.replace(/[()\s]/g, "")).filter(Boolean) }));
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (part) => new RegExp("\\b\\w+\\." + esc(part.replace(/^\w+\./, "")).replace(/(<=|>=|<|>|===|==)/, "\\s*$1\\s*") + "(?!\\d)").test(body);
  rec("THE CONTROL: riverIndexRoles' three marker rules are read off its source, three comparisons each",
    rules.length === 3 && rules.every((r) => r.parts.length === 3 && r.parts.every((p) => /^\w+\.[rgb](<=|>=)\d+$/.test(p))), rules);
  const copied = rules.filter((r) => r.parts.every(has)).map((r) => r.role);
  rec("⭐ …and fixMalformedRivers repeats none of them: its green index comes from riverIndexRoles too", copied.length === 0, copied);
  // ⚠️ …nor does any other line of map-data.js: the next river reader written beside the classifier (a sink, a writer) is where the
  // next copy goes. A copy is a LINE holding all the comparisons of one rule, in any order, under any name — measured 10-06, each
  // comparison stands on at most six lines of the file, so a line with all three of a rule is no coincidence. Comments are masked
  // in place, so a line number is the file's.
  const partRe = (p) => { const m = /^\w+\.([rgb])(<=|>=)(\d+)$/.exec(p); return m ? new RegExp("\\b\\w+\\." + m[1] + "\\s*" + m[2] + "\\s*" + m[3] + "(?!\\d)") : /(?!)/; };
  const ruleLines = (lines, from) => {
    const hits = [];
    lines.forEach((l, n) => { for (const r of rules) if (r.parts.every((p) => partRe(p).test(l))) hits.push(`${r.role}@${from + n + 1}`); });
    return hits;
  };
  const code = maskJsComments(src), line0 = rSpan ? code.slice(0, rSpan[0]).split("\n").length - 1 : 0;
  const own = rSpan ? ruleLines(code.slice(rSpan[0], rSpan[1] + 1).split("\n"), line0) : [];
  rec("THE CONTROL: read line by line, riverIndexRoles' own body holds each of the three rules once", own.length === 3 && rules.every((r) => own.some((h) => h.startsWith(r.role + "@"))), own);
  const outside = rSpan ? code.slice(0, rSpan[0]) + code.slice(rSpan[0], rSpan[1] + 1).replace(/[^\n]/g, " ") + code.slice(rSpan[1] + 1) : "";
  const elsewhere = ruleLines(outside.split("\n"), 0);
  rec("⭐ …and no other line of map-data.js repeats one of them: every river reader classifies through riverIndexRoles", outside.length === code.length && elsewhere.length === 0, elsewhere);
  rec("⭐ riverIndexRoles reads background through isRiverBackground and keeps no grey rule of its own (no colour difference in it)",
    /\bisRiverBackground\(/.test(rBody) && !/Math\.abs\(/.test(rBody), (rBody.match(/Math\.abs\([^)]*\)/) || [])[0]);
}

console.log("\n6. ⛔ A gate that cannot read a river refuses to judge one");
{
  // PLAN.md wrote the gate as riverShapeProblems({ W, H, idx, onlyMask }). Without the palette every index read as background, and
  // a drawing breaking five rules came back with every rule 0 and no component (review F3): a gate that passes everything, which
  // a caller checking "every rule 0" cannot tell from a clean river. So it throws.
  const bad = drawing([".........", ".gbbbbg..", "..bb.....", "..bb.....", ".bbbb....", ".b..b....", ".bbbb....", "........."]);
  const read = md.riverShapeProblems({ W: bad.W, H: bad.H, idx: bad.idx, palette: RW.PALETTE });
  rec("THE CONTROL: read by its palette, the drawing breaks several rules", fired(read).length >= 3 && read.components >= 1, fired(read));
  const thrown = (args) => { try { md.riverShapeProblems(args); return null; } catch (e) { return e; } };
  const noPalette = thrown({ W: bad.W, H: bad.H, idx: bad.idx });
  rec("⭐⭐ called without a palette — PLAN.md's signature — it throws, and says it needs the palette", !!noPalette && /palette/.test(noPalette.message), noPalette ? noPalette.message : "returned an answer");
  rec("⭐ …and with palette: null", !!thrown({ W: bad.W, H: bad.H, idx: bad.idx, palette: null }));
  const greys = RW.PALETTE.map(() => ({ r: 122, g: 122, b: 122 }));
  rec("⭐ …and with a palette that reads no index as a river (all grey): every pixel would be background", !!thrown({ W: bad.W, H: bad.H, idx: bad.idx, palette: greys }));
  const oneColour = greys.map((c, i) => (i === RW.GREEN ? { r: 0, g: 255, b: 0 } : c));
  rec("THE CONTROL: a palette with one river colour in it is read, not refused", !thrown({ W: bad.W, H: bad.H, idx: bad.idx, palette: oneColour }));
}

console.log(`\n=== the river shape checker: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
