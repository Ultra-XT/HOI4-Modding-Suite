// ⛔ #delete-map-leaves-the-rivers-running — "Delete map → blank ocean canvas" left every river the base game
// ever drew still drawn, now across open ocean.
//
// Nova has had THREE writers for map/rivers.bmp since long before the blank existed — the river paint tool
// (writeRiversPaint), the clear-rivers tool (clearAllRivers) and fixMalformedRivers — and blankMapToSea called
// none of them. The dominant bug shape on this project: the fix already exists next door and one caller never
// adopted it. Same shape as the supply hubs (#erase-leaves-the-land-standing) and the terrain (batch 18).
//
// 📊 THE SCALE, measured through the real function on a scratch mod over the installed base game (5,632×2,048):
//
//     before                   90,353 river pixels — 88,174 over land · 1,549 over sea · 630 over lake,
//                              spread across 5,158 provinces
//     after Delete map         89,723 of those 90,353 (99.3%) stood over SEA, and none over land
//     after Generate land 35%  53,959 (59.7%) still over sea, and 35,764 (39.6%) stranded on the NEW
//                              continents — the drowned world's rivers, cut up and scattered over land they
//                              never ran through. 1,734 of the 4,651 new land provinces carried one.
//
// …and the mod did not even own rivers.bmp. It was vanilla's file showing through the new world, exactly as
// the terrain did before #a-retyped-province-keeps-its-old-look ("weird things that looked like glass").
//
// ⭐⭐ WHY THE WHOLE-FILE CLEAR AND NOT A CLEAR SCOPED TO THE PROVINCES JUST DROWNED — the more careful-looking
// option is the worse one, and only measuring says so. A river is a 4-CONNECTED COMPONENT and HOI4 needs
// exactly one source marker per component, so clearing the land half of each river cuts every one of them
// loose from its source. Both options run on the same fixture, then read back through Nova's OWN
// fixMalformedRivers:
//
//     scoped to the 10,155 drowned provinces   88,174 cleared → 329 sourceless components REPORTED, 289 of
//                                              which Auto-fix would "repair" by painting a green source
//                                              marker into the open ocean, and 40 wiped as specks
//     clearAllRivers                           90,353 cleared → 0 sourceless, and a second call clears 0
//
// A fix that hands the validator 329 findings it never had is the cry-wolf shape. And the whole-file clear is
// not the broader answer here, it is the SAME answer: after the blank there is no land left on the map, so
// "every river over water" and "every river" are one set — which is why it is GATED on a land row surviving
// the retype rather than assumed. That gate is exercised below.
//
// ⚠️ Nothing is invented to replace them. A river needs a source, a mouth and a direction, HOI4 logs errors
// for a malformed one, and Delete map's job is the empty canvas — not a new world's hydrology.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__nova_no_game_blank_rivers__");

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 12x4 map: provinces 1, 2 and 3 are land, province 4 is already sea. rivers.bmp draws one river across the
// land (a green source, then a cyan body) and one stray river pixel out on the sea province, so the two
// halves of the question — "what the blank drowned" and "what was already water" — are both present.
const PAL = [];
PAL[0] = { r: 0, g: 255, b: 0 };      // green source
PAL[3] = { r: 0, g: 225, b: 255 };    // cyan river body
PAL[11] = { r: 0, g: 0, b: 100 };     // deep-blue wide river
PAL[254] = { r: 122, g: 122, b: 122 };// grey background (the "land colour" the writers clear back to)
PAL[255] = { r: 255, g: 255, b: 255 };// white background
const RIVER_INDICES = [0, 3, 11];

function bmp8(width, height, palette, indexFn) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = palette[i] || { r: 0, g: 0, b: 0 }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}

const W = 12, H = 4;
function makeMod(opts) {
  const o = opts || {};
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankriver-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="BR"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });

  // provinces.bmp — the blank REFUSES on a mod that owns no world of its own
  // (#a-blank-claims-a-world-the-mod-does-not-own), so the fixture owns one.
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  const provAtX = (x) => (x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let p = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[p++] = c[2]; bmp[p++] = c[1]; bmp[p++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);

  fs.writeFileSync(path.join(d, "map", "definition.csv"), (o.definition || [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;false;plains;1",
    "3;30;30;30;land;true;plains;1",
    "4;40;40;40;sea;false;ocean;0",
  ]).join("\n") + "\n");

  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');

  if (o.rivers !== false) {
    // y = 1: a green source at x = 1, then cyan body across the land to x = 8, plus a 2px deep-blue stretch.
    // y = 2, x = 10: one pixel out on province 4, which was sea before this call and stays sea.
    fs.writeFileSync(path.join(d, "map", "rivers.bmp"), bmp8(W, H, PAL, (x, y) => {
      if (y === 1 && x === 1) return 0;
      if (y === 1 && x >= 2 && x <= 6) return 3;
      if (y === 1 && x >= 7 && x <= 8) return 11;
      if (y === 2 && x === 10) return 3;
      return 254;
    }));
  }
  return d;
}

// Count river pixels in a rivers.bmp, by the palette's own classification.
function riverPixels(file) {
  const buf = fs.readFileSync(file);
  const bmp = md.readIndexedBmp(buf);
  let n = 0;
  for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) if (RIVER_INDICES.indexOf(buf[bmp.pixelOffset(x, y)]) !== -1) n++;
  return n;
}

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ a blank canvas keeps no river running across the water it just made ===");
{
  const d = makeMod();
  const river = path.join(d, "map", "rivers.bmp");
  const before = fs.readFileSync(river);
  const meta = md.readIndexedBmp(before);
  const had = riverPixels(river);
  ok(had > 0, `⚠️ the fixture really does draw ${had} river pixels to begin with`, had);

  const r = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.changed === true && r.flippedProvinces === 3, "the blank drowned the three land provinces", r.flippedProvinces);
  ok(!!(r.rivers && r.rivers.changed === true), "⭐ …and it reports what it did to the rivers", r.rivers);
  ok(r.rivers.cleared === had, `⭐ …clearing exactly the ${had} river pixels that were there`, { cleared: r.rivers.cleared, had });
  ok(riverPixels(river) === 0, "⭐ NOT ONE river pixel is left anywhere on the drowned map", riverPixels(river));

  // The discipline every bitmap writer here keeps: only index bytes change.
  const after = fs.readFileSync(river);
  ok(after.length === before.length, "the file is the same size — only pixel bytes were touched", { before: before.length, after: after.length });
  ok(Buffer.compare(before.slice(0, meta.dataOffset), after.slice(0, meta.dataOffset)) === 0,
    "⭐ …and its header and palette came through byte-for-byte");
}

// ── ⭐⭐ the control that chose the whole-file clear: it must leave Nova's OWN validator quiet ─────────
console.log("\n=== ⭐⭐ the clear does not hand Map Errors a river it cannot resolve ===");
{
  const d = makeMod();
  md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  // fixMalformedRivers is the rule behind river_no_source. A clear that cut rivers loose from their sources
  // would show up here as sourceless components — and Auto-fix would then paint green markers into the sea.
  const dry = md.fixMalformedRivers({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], dryRun: true });
  ok(dry.sourceless.length === 0,
    "⭐⭐ no sourceless river is left behind — a partial clear leaves 329 of them on vanilla", dry.sourceless);
  ok(dry.addedSources === 0 && dry.removedComponents === 0,
    "…so Auto-fix has nothing to add and nothing to wipe", { added: dry.addedSources, removed: dry.removedComponents });
}

// ── ⚠️ a second blank writes nothing ─────────────────────────────────────────────────────────────────
console.log("\n=== ⚠️ a second Delete map writes no rivers ===");
{
  const d = makeMod();
  md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const river = path.join(d, "map", "rivers.bmp");
  const snap = fs.readFileSync(river);
  const r2 = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r2.flippedProvinces === 0, "there is nothing left to drown", r2.flippedProvinces);
  ok(!(r2.rivers && r2.rivers.changed), "…so the rivers are not touched again", r2.rivers);
  ok(Buffer.compare(snap, fs.readFileSync(river)) === 0, "⭐ …and rivers.bmp is byte-identical after the second click");
}

// ── ⚠️ a mod with nothing to drown keeps its rivers, and does not acquire the file ───────────────────
console.log("\n=== ⚠️ a mod whose rivers are all over land it keeps is untouched ===");
{
  const d = makeMod({ definition: [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;sea;false;ocean;0",
    "2;20;20;20;sea;false;ocean;0",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;sea;false;ocean;0",
  ] });
  const river = path.join(d, "map", "rivers.bmp");
  const had = riverPixels(river);
  const r = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.flippedProvinces === 0, "nothing was drowned", r.flippedProvinces);
  ok(!(r.rivers && r.rivers.changed), "…so no river was cleared", r.rivers);
  ok(riverPixels(river) === had, "⭐ …and every river pixel is still exactly where it was", { had, now: riverPixels(river) });
}
{
  // …and the mod must not GAIN an 11.5 MB rivers.bmp for a click that drowned nothing.
  const d = makeMod({ rivers: false, definition: [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;sea;false;ocean;0",
    "2;20;20;20;sea;false;ocean;0",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;sea;false;ocean;0",
  ] });
  md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(fs.existsSync(path.join(d, "map", "rivers.bmp")) === false,
    "⭐ a blank that drowned nothing does not materialise rivers.bmp either");
}

// ── ⚠️ THE GATE: a land row the retype could not reach means the rivers are left alone ───────────────
console.log("\n=== ⚠️ the gate — a surviving land row stops the clear and SAYS so ===");
{
  // The flip needs 7 columns. A malformed shorter row keeps `land`, so land survives the blank and a river
  // may still have land to run on. The whole-file clear is only correct because no land is left; when that
  // is not true it must not run, and silence would read as "there were no rivers".
  const d = makeMod({ definition: [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;false;plains;1",
    "3;30;30;30;land;false",
    "4;40;40;40;sea;false;ocean;0",
  ] });
  const river = path.join(d, "map", "rivers.bmp");
  const had = riverPixels(river);
  const r = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.flippedProvinces === 2, "the two well-formed land rows were drowned", r.flippedProvinces);
  ok(!(r.rivers && r.rivers.changed), "⭐ …and the rivers were left alone, because land survived", r.rivers);
  ok(riverPixels(river) === had, "…every river pixel still there", { had, now: riverPixels(river) });
  ok(typeof r.rivers.skipped === "string" && /still say land/.test(r.rivers.skipped),
    "⭐ …and it SAYS why rather than staying silent", r.rivers);
}

// ── 🈯 against the real base game ────────────────────────────────────────────────────────────────────
console.log("\n=== 🈯 against the real base game ===");
if (!fs.existsSync(path.join(GAME, "map", "rivers.bmp")) || !fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) {
  console.log("  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankriver-real-")); tmps.push(m);
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="BRreal"\nsupported_version="1.19.*"\n');
  fs.mkdirSync(path.join(m, "map"), { recursive: true });
  // The blank refuses on a mod that owns no world of its own, so the fixture does what the refusal says.
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(m, "map", "provinces.bmp"));

  // Count the base game's own river pixels, by its own palette — DERIVED, never typed in.
  const vanillaRivers = path.join(GAME, "map", "rivers.bmp");
  const vbuf = fs.readFileSync(vanillaRivers);
  const vmeta = md.readIndexedBmp(vbuf);
  const isGrey = (c) => c && Math.abs(c.r - c.g) <= 12 && Math.abs(c.g - c.b) <= 12 && Math.abs(c.r - c.b) <= 12;
  const isRiver = new Array(256).fill(false);
  for (let i = 0; i < (vmeta.palette || []).length; i++) { const c = vmeta.palette[i]; if (!c) continue; if (!isGrey(c) && !(c.r >= 245 && c.g >= 245 && c.b >= 245)) isRiver[i] = true; }
  let shipped = 0;
  for (let y = 0; y < vmeta.height; y++) for (let x = 0; x < vmeta.width; x++) if (isRiver[vbuf[vmeta.pixelOffset(x, y)]]) shipped++;
  console.log(`     the base game draws ${shipped.toLocaleString()} river pixels`);
  ok(shipped > 50000, "⚠️ …a five-figure cleanup, not a corner case", shipped);

  const r = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  ok(r.flippedProvinces > 1000, `the blank drowned ${r.flippedProvinces} provinces`, r.flippedProvinces);
  ok(!!(r.rivers && r.rivers.changed && r.rivers.cleared === shipped),
    `⭐ …and cleared all ${shipped.toLocaleString()} of the base game's river pixels with them`, r.rivers);
  const own = path.join(m, "map", "rivers.bmp");
  const owns = fs.existsSync(own);
  ok(owns, "the mod now owns its own map/rivers.bmp");
  ok(r.rivers.created === true,
    "⭐ …and SAYS so — 11.5 MB is not a file to gain in silence", r.rivers);

  // ⚠️ Guarded, so BACKING THE FIX OUT gives a clean FAIL for every remaining check rather than an ENOENT
  // stack trace that truncates the run. A back-out control you cannot read is not a control.
  if (!owns) {
    ok(false, "⭐ …same size as the file it copied (not reached: the mod has no rivers.bmp)");
    ok(false, "⭐ …header and palette byte-for-byte (not reached)");
    ok(false, "⭐ ZERO river pixels left on the blanked world (not reached)");
    ok(false, "⭐⭐ …Map Errors reports no sourceless river afterwards (not reached)");
  } else {
    const got = fs.readFileSync(own);
    ok(got.length === vbuf.length, "it is the same size as the file it copied", { base: vbuf.length, got: got.length });
    ok(Buffer.compare(vbuf.slice(0, vmeta.dataOffset), got.slice(0, vmeta.dataOffset)) === 0,
      "⭐ …with Paradox's header and palette carried over byte-for-byte");

    // …and the whole point: nothing is left drawn over the new ocean.
    let left = 0;
    for (let y = 0; y < vmeta.height; y++) for (let x = 0; x < vmeta.width; x++) if (isRiver[got[vmeta.pixelOffset(x, y)]]) left++;
    ok(left === 0, "⭐ ZERO river pixels are left on the blanked world", left);

    // The anti-cry-wolf control, on the real corpus this time.
    const dry = md.fixMalformedRivers({ modRoot: m, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    ok(dry.sourceless.length === 0,
      "⭐⭐ …and Map Errors reports no sourceless river afterwards", dry.sourceless.slice(0, 4));
  }
}

// ── the page says what happened ──────────────────────────────────────────────────────────────────────
console.log("\n=== the Save report names the file the mod just took ===");
{
  // 🈯 Lifted CRLF-tolerantly on purpose: this repo checks out CRLF, and a bare-newline anchor finds nothing
  // in a fresh worktree while reporting success.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  // (anchored on the name, not the whole first line: it gained the world's `opts` — ⛔ #nova-draws-the-rivers-delete-map-cleared)
  const s0 = MAP.indexOf("function riversNote(");
  const body = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
  ok(body.length > 0, "riversNote was found on the map page");
  let note = null;
  try { note = new Function(body + "\nreturn riversNote;")(); } catch (_) { note = null; }
  ok(typeof note === "function", "…and it lifts and runs");
  const said = note({ changed: true, cleared: 90353, created: true });
  ok(/map\/rivers\.bmp/.test(said), "⭐ it names the file the mod has just taken a copy of", said);
  ok(/90,353/.test(said), "…and how many pixels went", said);
  ok(/no rivers at all/.test(said), "⭐ …and that the new map has none, so nobody goes looking for them", said);
  // ⛔ #nova-draws-the-rivers-delete-map-cleared (review cr1, F4) — it said "Nova does not invent them … Draw them in 💧 River mode", and
  // 🌍 Generate land has drawn rivers on the land it raises since 2026-10-07: map-data's generateLand calls generateRivers unless asked
  // `drawRivers: false`, which the page's Generate land POST never sends — both read here, so the sentence is held to the code
  const MD = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const genAt = MD.indexOf("\nfunction generateLand(");
  const genBody = genAt < 0 ? "" : MD.slice(genAt, MD.indexOf("\nfunction ", genAt + 10));
  const post = MAP.indexOf('fetch("/api/map/generate-land"'), postLine = post < 0 ? "" : MAP.slice(post, MAP.indexOf("\n", post));
  ok(/rivers = generateRivers\(/.test(genBody) && /drawRivers === false/.test(genBody) && post > 0 && !/drawRivers/.test(postLine),
    "THE CONTROL: 🌍 Generate land draws rivers on the land it raises (generateRivers), and the page never turns that off", { generateRivers: /rivers = generateRivers\(/.test(genBody), post: postLine.slice(0, 200) });
  ok(!/does not invent/.test(said) && /🌍 Generate land draws rivers on the land it raises/.test(said),
    "⭐⭐ …so it never says Nova does not invent rivers: it says 🌍 Generate land draws them, and the river tool by hand", said);
  // ⛔ #a-note-names-the-tool-the-page-has (review cr2, R3) — THE CONTROLS IT NAMES ARE THE PAGE'S OWN. The rewrite above kept the old
  // sentence's "💧 River mode", a control the page never had: its river tool is "🌊 Rivers" (TOOL_LABELS.rivers, the #mapModeRivers
  // button), and 💧 appeared nowhere else in public/. Every emoji in the sentence must open the name of a control the page shows — a
  // tool's TOOL_LABELS name, or a map.html button's, label's or option's own text — both read here, never typed.
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");
  const tl = /\n  const TOOL_LABELS = (\{[^\n]*\});\n/.exec(MAP);
  let TOOL = null;
  try { TOOL = tl ? new Function("return " + tl[1])() : null; } catch (_) { TOOL = null; }
  ok(!!(TOOL && TOOL.rivers), "THE CONTROL: the page names its tools (TOOL_LABELS), the river tool among them", tl ? tl[1].slice(0, 160) : null);
  const shown = new Set(Object.values(TOOL || {}));
  for (const m of HTML.matchAll(/<(button|label|option)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) shown.add(t);
  }
  ok(TOOL && [...shown].filter((n) => n === TOOL.rivers).length >= 1 && /id="mapModeRivers"[^>]*>\s*<span class="tool-ico">🌊<\/span><span class="tool-name">Rivers<\/span>/.test(HTML),
    "THE CONTROL: …and map.html's river tool button says the same name", TOOL && TOOL.rivers);
  const named = [...said.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => said.slice(m.index));
  const unknown = named.filter((rest) => ![...shown].some((n) => rest.startsWith(n)));
  ok(named.length >= 2 && unknown.length === 0, "⭐⭐ every control the sentence names is one the page has (a tool's own name, or a button's)", { named: named.map((u) => u.slice(0, 24)), unknown: unknown.map((u) => u.slice(0, 24)) });
  ok(!!TOOL && said.includes(`and ${TOOL.rivers} draws them by hand`), `⭐ …and it sends the modder to the river tool by the page's own name for it (${TOOL && TOOL.rivers})`, said);
  const inWorld = note({ changed: true, cleared: 90353, created: true }, { world: true });
  ok(/90,353/.test(inWorld) && /map\/rivers\.bmp/.test(inWorld) && !/River mode/.test(inWorld) && !(TOOL && inWorld.includes(TOOL.rivers)) && !/no rivers at all/.test(inWorld),
    "⭐ 🌍 Generate a world's step 2 says only what was cleared (its step 3 draws the rivers, and says how many)", inWorld);
  ok(note({ changed: false, cleared: 0 }) === "", "…and it says NOTHING when nothing was cleared");
  ok(/left alone/.test(note({ changed: false, cleared: 0, skipped: "2 row(s) in definition.csv still say land, so the rivers were left alone" })),
    "⭐ …and says what it did not do when the gate stopped it");

  // …and the overlay must reload, or the page keeps drawing rivers the file no longer holds.
  // ⚠️ #the-click-save-asymmetry-is-a-class — this is the half that bites.
  ok(/riversWrittenByServer/.test(MAP),
    "⭐ the save tracks a rivers.bmp the SERVER wrote with no staged river edit");
  ok(/stagedRiverEdits\.length \|\| riversWrittenByServer/.test(MAP),
    "⭐⭐ …and the overlay reload is gated on that too, not only on staged edits");
}

// ── the writer this adopted is the one that already existed ──────────────────────────────────────────
console.log("\n=== it adopted a writer rather than adding a fourth ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  // ⚠️ MOVED WITH 🌍 Generate a world: blankMapToSea is now the wrapper that opens ONE backup scope over the whole blank
  // (blanked_maps/<stamp>), and the blank itself is blankMapToSeaInto — so the body read here is that one's.
  const a = SRC.indexOf("function blankMapToSeaInto(");
  const body = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10));
  ok(body.length > 0 && /\nfunction blankMapToSea\(opts\)[^]*?return blankMapToSeaInto\(/.test(SRC), "blankMapToSeaInto was found, and blankMapToSea hands the blank to it");
  ok(/clearAllRivers\(/.test(body), "⭐ it calls clearAllRivers, the writer the clear-rivers tool already used");
  // Derived, not typed: every function in map-data.js that writes map/rivers.bmp through safeModWrite.
  const writers = (SRC.match(/safeModWrite\([^,]+,[^,]+,\s*"map-(writeRiversPaint|clearAllRivers|fixMalformedRivers)"\)/g) || []).length;
  ok(writers === 3, "⚠️ …and there are still exactly three rivers.bmp writers, not a fourth", writers);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== Delete map takes the rivers with it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
