// ⛔ #a-wing-the-map-sent-abroad — AN AIR WING THE MAP SENT TO ANOTHER COUNTRY'S STATE IS BASED BACK HOME.
//
// history/units places an air wing by STATE ID (`air_wings = { 763 = { … } }`). A generated world has every id the scripts
// name, but each id is a different place, owned by whoever got that land: on the owner's TEST 32, 376 of the 394 started wings
// stood in another country's state — Germany's in British, Argentine and Indian states — and the only air rule asked whether the state
// EXISTS. The base game starts its wings in their own country's states (22 of 438 in a subject's, or one a bookmark hands over).
//
// THE RULE (findAirWingsBasedAbroad): a started wing whose state is another country's now, in a file the modder did not write
// (a layer below's, a key Nova's own copy placed, or a copy whose wings are all still the source's — what the division and fleet
// repairs leave when they copy a file in), where the world the mod's states REPLACED did not already put it there —
// read by statesBeneath, because statesBelow is null under replace_path="history/states", which every generated world declares.
// THE REPAIR (fixAirWingsBasedAbroad): the nearest state its own country owns with an air base AND ROOM for its planes, by the
// game's own AIRBASE_CAPACITY_MULT; room counts other countries' planes there too. Only the digits change, plus a note.
//
// THE FIXTURE: a 4×4 grid of 64-px land provinces; state n holds row n (provinces 4n-3 … 4n).
//     below  1 AAA · 2 AAA · 3 BBB · 4 BBB          mod (replace_path history/states)  1 BBB · 2 AAA · 3 AAA · 4 BBB, air_base 1
//   AAA_air (BOM + LF, vanilla's shape)  1 = {  # Old Field  (50 planes) · 2 = { (120) · a commented `#\t1 = {` · "Old Carrier"
//   BBB_air (CRLF)                       2 = { (60: AAA's state in both worlds — a subject-like wing, left alone) · 4 = { (30)
// AAA's wing in 1 is abroad. State 2 is nearer to 1 than 3, but holds 120 + 60 already: 230 > 200, so it goes to 3.
// Every expected value is computed below from the geometry, the planes and the define.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto"), vm = require("vm");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wingabroad-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wingabroad-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const rowOf = (id) => [1, 2, 3, 4].map((k) => 4 * id - 4 + k);
const stateTxt = (id, owner, airBase) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${rowOf(id).join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n${airBase ? `\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tair_base = ${airBase}\n\t\t}\n` : ""}\t}\n}\n`;
const wing = (sid, tag, planes, comment = "") => [`\t${sid} = {${comment}`, `\t\tfighter_equipment_0 = { owner = "${tag}" amount = ${planes} }`, `\t}`];
const PLANES = { AAA1: 50, AAA2: 120, BBB2: 60, BBB4: 30 };
const AAA_AIR = "﻿" + ["### AAA's air force — a header comment that names 1 = { on purpose", "air_wings = {",
  ...wing(1, "AAA", PLANES.AAA1, "   # Old Field"), ...wing(2, "AAA", PLANES.AAA2),
  "#\t1 = { fighter_equipment_0 = { amount = 5 } }", '\t"Old Carrier" = {', '\t\tcv_fighter_equipment_0 = { owner = "AAA" amount = 5 }', "\t}", "}", ""].join("\n");
const BBB_AIR = ["air_wings = {", ...wing(2, "BBB", PLANES.BBB2), ...wing(4, "BBB", PLANES.BBB4), "}", ""].join("\r\n");
const MULT = 200;
const DEFINES = `NDefines = {\nNBuildings = {\n\tAIRBASE_CAPACITY_MULT = ${MULT},\t\t-- each level of air base times this\n},\n}\n`;

function writeGame(g, { defines = true } = {}) {
  mk(g, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, gg, b] = COL(p); rows.push(`${p};${r};${gg};${b};land;false;plains;1`); }
  mk(g, "map/definition.csv", rows.join("\n") + "\n");
  for (const [id, o] of [[1, "AAA"], [2, "AAA"], [3, "BBB"], [4, "BBB"]]) mk(g, `history/states/${id}.txt`, stateTxt(id, o, 1));
  mk(g, "history/countries/AAA - Aland.txt", 'capital = 1\nset_air_oob = "AAA_air"\n');
  mk(g, "history/countries/BBB - Bland.txt", 'capital = 3\nset_air_oob = "BBB_air"\n');
  mk(g, "history/units/AAA_air.txt", AAA_AIR);
  mk(g, "history/units/BBB_air.txt", BBB_AIR);
  if (defines) mk(g, "common/defines/00_defines.lua", DEFINES);
  return g;
}
const MOD_OWNERS = { 1: "BBB", 2: "AAA", 3: "AAA", 4: "BBB" };
function writeMod(m) {
  mk(m, "descriptor.mod", 'name="wings abroad"\nreplace_path="history/states"\n');
  for (const id of [1, 2, 3, 4]) mk(m, `history/states/${id}.txt`, stateTxt(id, MOD_OWNERS[id], 1));
  return m;
}
const GAME = writeGame(tmp("game"));
const ctx = (modRoot, gameRoot = GAME, dependencyRoots = []) => ({ modRoot, gameRoot, dependencyRoots });
const unitsFile = (root, f) => path.join(root, "history", "units", f);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const rule = (c) => (md.validateMapBitmap(c) || []).filter((p) => p.rule === "air_wing_based_abroad");
const hits = (c) => (md.findAirWingsBasedAbroad(c).wings || []).map((w) => `${w.file}:${w.state}`).sort();

// ── the oracle: the destination rule, written from its statement over the fixture's own geometry and loads ───────────────
const centre = (id) => ({ x: 128, y: (id - 1) * 64 + 32 });                       // a state is a whole row: its centre
const d2 = (a, b) => (centre(a).x - centre(b).x) ** 2 + (centre(a).y - centre(b).y) ** 2;
function oracle({ from, planes, homes, load, capacity }) {
  const ranked = homes.slice().sort((a, b) => d2(from, a) - d2(from, b) || a - b);
  return (ranked.find((h) => (load[h] || 0) + planes <= capacity(h)) || ranked[0]);
}
// what stays where once AAA's wing in 1 moves: AAA's own 120 in 2, BBB's 60 in 2 (another country's), BBB's 30 in 4
const LOAD = { 2: PLANES.AAA2 + PLANES.BBB2, 4: PLANES.BBB4 };
const WANT = oracle({ from: 1, planes: PLANES.AAA1, homes: [2, 3], load: LOAD, capacity: () => MULT });

console.log("=== THE CONTROLS ===");
{
  const c = md.provinceCentroids({ ...ctx(GAME), wanted: new Set([...rowOf(1), ...rowOf(2), ...rowOf(3)]) });
  const okc = [1, 2, 3].every((id) => rowOf(id).every((p) => Math.abs((255 - c.get(p).z) - centre(id).y) <= 1));
  rec("THE CONTROL: the oracle's rows are where provinceCentroids puts them (z from the bottom)", okc);
  rec("THE CONTROL: nearest-only would take 2, room takes the other — so the fixture tells the two apart",
    oracle({ from: 1, planes: PLANES.AAA1, homes: [2, 3], load: LOAD, capacity: () => Infinity }) === 2 && WANT === 3, { WANT });
  rec("THE CONTROL: …and so would a load that forgets BBB's 60 in 2", oracle({ from: 1, planes: PLANES.AAA1, homes: [2, 3], load: { 2: PLANES.AAA2 }, capacity: () => MULT }) === 2);
  const keys = md.airWingKeysOf(AAA_AIR);
  rec("THE CONTROL: the text reader sees AAA's two keys and their planes — not the commented one, not the carrier",
    JSON.stringify(keys.map((k) => [k.state, k.planes])) === JSON.stringify([[1, PLANES.AAA1], [2, PLANES.AAA2]]), keys.map((k) => [k.state, k.planes]));
  // A `#` inside a quoted name is no comment (vanilla's own "Siamese Railway Gun #1"), and a brace inside one opens nothing. The
  // repair finds its keys with airWingKeysOf and the finder with the order-of-battle reader: the two must read the same keys.
  const g = writeGame(tmp("game-named"));
  const NAMED = ["air_wings = {", `\t1 = { name = "Wing #2" fighter_equipment_0 = { owner = "AAA" amount = ${PLANES.AAA1} } }`,
    `\t2 = { name = "{North} Wing"`, `\t\tfighter_equipment_0 = { owner = "AAA" amount = ${PLANES.AAA2} }`, "\t}", "}", ""].join("\n");
  mk(g, "history/units/AAA_air.txt", NAMED);
  const byReader = md.startingUnitLocations({ ...ctx(g, g), model: md.buildMapModel(ctx(g, g)), stateIds: true }).filter((u) => u.kind === "air_wing" && u.file === "AAA_air.txt").map((u) => [u.state, u.planes]);
  const byText = md.airWingKeysOf(NAMED).map((k) => [k.state, k.planes]);
  rec("⭐⭐ …and with a `#` and braces inside a wing's name, it reads the keys and planes the order-of-battle reader reads",
    byReader.length === 2 && JSON.stringify(byText) === JSON.stringify(byReader), { byText, byReader });
}

// ── 1. what is found ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the finder and the rule ===");
const MOD = writeMod(tmp("mod"));
rec("⭐⭐⭐ exactly AAA's wing in state 1 is found — not BBB's in 2, which the world beneath based there too", JSON.stringify(hits(ctx(MOD))) === '["AAA_air.txt:1"]', hits(ctx(MOD)));
{
  const w = md.findAirWingsBasedAbroad(ctx(MOD)).wings[0] || {};
  rec("⭐⭐ …with its owner now, its owner beneath, and the land its file meant", w.owner === "BBB" && w.was === "AAA" && JSON.stringify(w.oldProvinces) === JSON.stringify(rowOf(1)), w);
  const r = rule(ctx(MOD));
  const p = r[0] || {};
  rec("⭐⭐⭐ air_wing_based_abroad: a WARNING, one counted, one movable, the button offered", r.length === 1 && p.severity === "warning" && p.total === 1 && p.movable === 1 && p.autoFix === true,
    r.map((x) => ({ severity: x.severity, total: x.total, movable: x.movable, autoFix: x.autoFix })));
  rec("⭐⭐ …not fatal, with a label", labels.isFatalRule("air_wing_based_abroad") === false && !!labels.LABELS.air_wing_based_abroad);
  rec("⭐⭐ …it names the wing, its state, who holds it now, and the file it copies", /AAA's in state 1, now BBB's/.test(p.message || "") && /history\/units\/AAA_air\.txt/.test(p.message || "") && !/will crash/i.test(p.message || ""), p.message);
  rec("⭐ …and says the cause: the same land was handed over", /your states gave that state to another country/.test(p.message || ""), p.message);
}

// ── 2. the repair ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 2. the repair ===");
{
  const r = md.fixAirWingsBasedAbroad(ctx(MOD));
  rec("⭐⭐⭐ one wing moved, AAA_air.txt copied in and named", r.moved === 1 && (r.materialised || []).join() === "AAA_air.txt" && (r.files || []).join() === "AAA_air.txt", r);
  const out = read(unitsFile(MOD, "AAA_air.txt"));
  const now = md.airWingKeysOf(out).map((k) => k.state);
  rec(`⭐⭐⭐ THE ASSERTION: it is based in ${WANT} — the nearest of AAA's states with room for its ${PLANES.AAA1} planes, not the nearer 2 that holds ${LOAD[2]}`,
    JSON.stringify(now) === JSON.stringify([WANT, 2]), { now, meaning: now[0] === 2 ? "nearest-only, or a load that forgot BBB's planes" : "?" });
  const a = AAA_AIR.split("\n"), b = out.split("\n");
  const diff = a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
  rec("⭐⭐⭐ exactly one line differs, and it says what happened, the old comment kept",
    a.length === b.length && diff.length === 1 && diff[0][1] === `\t${WANT} = {    # Nova: moved from state 1, which is BBB's in this map  # Old Field`, diff);
  rec("⭐⭐ …the BOM is kept and no CR is introduced", out.charCodeAt(0) === 0xfeff && out.indexOf("\r") === -1);
  rec("⭐⭐ the base game's copy is unchanged, and BBB's file is not copied in", read(unitsFile(GAME, "AAA_air.txt")) === AAA_AIR && !fs.existsSync(unitsFile(MOD, "BBB_air.txt")));
  const h = sha(out);
  const r2 = md.fixAirWingsBasedAbroad(ctx(MOD));
  rec("⭐⭐⭐ a second run moves nothing and writes nothing", r2.moved === 0 && sha(read(unitsFile(MOD, "AAA_air.txt"))) === h, r2);
  rec("⭐⭐⭐ …and the rule goes silent", rule(ctx(MOD)).length === 0, rule(ctx(MOD)).map((p) => p.total));
}

// ── 2b. a wing written on one line (Rise of Nations ships 168): the note goes after its closing brace, or nowhere ──────────
console.log("\n=== 2b. one-line wings ===");
{
  const one = (sid, planes) => `${sid} = { fighter_equipment_0 = { owner = "AAA" amount = ${planes} } }`;
  for (const [label, body, want] of [
    ["a one-line wing with a comment after it takes the note after its brace, the comment kept",
      `\t${one(1, PLANES.AAA1)}   # Old Field\n\t${one(2, PLANES.AAA2)}\n`, `\t${one(WANT, PLANES.AAA1)}    # Nova: moved from state 1, which is BBB's in this map  # Old Field`],
    ["two wings on one line: live script follows the first, so only its digits change",
      `\t${one(1, PLANES.AAA1)} ${one(2, PLANES.AAA2)}\n`, `\t${one(WANT, PLANES.AAA1)} ${one(2, PLANES.AAA2)}`],
  ]) {
    const g = writeGame(tmp("game-oneline"));
    const text = "air_wings = {\n" + body + "}\n";
    mk(g, "history/units/AAA_air.txt", text);
    const m = writeMod(tmp("oneline"));
    const r = md.fixAirWingsBasedAbroad(ctx(m, g));
    const got = read(unitsFile(m, "AAA_air.txt")).split("\n")[1];
    rec("⭐⭐ " + label, r.moved === 1 && got === want, { got, want });
  }
}

// ── 2c. a CRLF file (the workshop maps' shape): the note goes in before the CR, and the file stays pure CRLF ─────────────────
console.log("\n=== 2c. a CRLF order of battle ===");
{
  const endings = (s) => { let crlf = 0, lf = 0; for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; } return { crlf, lf }; };
  const CRLF_AIR = AAA_AIR.split("\n").join("\r\n");
  const g = writeGame(tmp("game-crlf"));
  mk(g, "history/units/AAA_air.txt", CRLF_AIR);
  const m = writeMod(tmp("crlf"));
  const r = md.fixAirWingsBasedAbroad(ctx(m, g));
  const out = read(unitsFile(m, "AAA_air.txt"));
  const a = CRLF_AIR.split("\r\n"), b = out.split("\r\n");
  const diff = a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
  rec("⭐⭐⭐ the moved key's line takes the note, the old comment kept — exactly one line differs",
    r.moved === 1 && a.length === b.length && diff.length === 1 && diff[0][1] === `\t${WANT} = {    # Nova: moved from state 1, which is BBB's in this map  # Old Field`, diff);
  rec("⭐⭐ …and every line still ends CRLF: no bare LF, no CR lost", endings(out).lf === 0 && endings(out).crlf === endings(CRLF_AIR).crlf, endings(out));
}

// ── 3. the copy is Nova's only where Nova placed a key ────────────────────────────────────────────────────────────────────
console.log("\n=== 3. whose wing it is: the modder's own file, and a copy Nova made ===");
{
  // B: the modder's OWN copy, with no note, that re-equipped its wing in 2 (Rise of Nations' shape: its copies re-equip every wing).
  // It made an air-wing decision in this file, so the whole file is theirs — the wing in 1 too, though that one is still the source's.
  // ⚠️ B used to be the source byte for byte. That is what the division and fleet repairs leave when they copy a file in, and taking it
  // for the modder's blinded the rule to the wing such a copy carried (B2 and section 6 below).
  const B = writeMod(tmp("own"));
  const bText = AAA_AIR.replace(`fighter_equipment_0 = { owner = "AAA" amount = ${PLANES.AAA2} }`, `fighter_equipment_1 = { owner = "AAA" amount = ${PLANES.AAA2} }`);
  mk(B, "history/units/AAA_air.txt", bText);
  {
    const s = md.airWingKeysOf(AAA_AIR), t = md.airWingKeysOf(bText), w = (x, k) => x.slice(k.at, k.close + 1);
    rec("THE CONTROL: B is the source with its wing in 2 re-equipped — the same keys in the same places, the wing in 1 untouched",
      bText !== AAA_AIR && JSON.stringify(t.map((k) => k.state)) === JSON.stringify(s.map((k) => k.state)) && w(bText, t[0]) === w(AAA_AIR, s[0]) && w(bText, t[1]) !== w(AAA_AIR, s[1]));
  }
  rec("⭐⭐⭐ B: the mod's OWN AAA_air.txt, with no note and a wing it re-equipped, is the modder's deployment — nothing is reported", hits(ctx(B)).length === 0, hits(ctx(B)));
  rec("⭐⭐ …and nothing is moved", md.fixAirWingsBasedAbroad(ctx(B)).moved === 0 && read(unitsFile(B, "AAA_air.txt")) === bText);

  // B2: a copy with no note whose every wing is still the source's — it made no air-wing decision, so its wings are judged as the
  // inherited file's were. Line endings aside: an editor that re-saved it CRLF decided nothing about a wing.
  for (const [label, text] of [["byte for byte", AAA_AIR], ["re-saved with CRLF line endings", AAA_AIR.split("\n").join("\r\n")]]) {
    const B2 = writeMod(tmp("untouched"));
    mk(B2, "history/units/AAA_air.txt", text);
    rec(`⭐⭐⭐ B2: an un-noted copy whose wings are the source's ${label} — AAA's wing in 1 is reported, as the inherited one was`,
      JSON.stringify(hits(ctx(B2))) === '["AAA_air.txt:1"]', hits(ctx(B2)));
  }

  // C: a copy Nova made. Its first key carries a note (it came from state 3, BBB's beneath) and stands in BBB's state 1: Nova put it
  // there, so being BBB's beneath excuses nothing. Its second key the modder re-keyed 2 → 4 (BBB's): theirs, never judged.
  const C = writeMod(tmp("noted"));
  const cText = AAA_AIR.replace("\t1 = {   # Old Field", "\t1 = {    # Nova: moved from state 3, which is AAA's in this map  # Old Field").replace("\t2 = {", "\t4 = {");
  mk(C, "history/units/AAA_air.txt", cText);
  rec("THE CONTROL: C's two keys are 1 (noted) and 4 (not)", JSON.stringify(md.airWingKeysOf(cText).map((k) => [k.state, k.note])) === "[[1,3],[4,null]]");
  rec("⭐⭐⭐ C: only the noted key is judged, and reported though the world beneath gave its first state to BBB", JSON.stringify(hits(ctx(C))) === '["AAA_air.txt:1"]', hits(ctx(C)));
  // moved again, it goes nearest to the state its author meant (3, by the note) and the note keeps that first state
  const wantC = oracle({ from: 3, planes: PLANES.AAA1, homes: [2, 3], load: { 2: PLANES.BBB2, 4: PLANES.AAA2 + PLANES.BBB4 }, capacity: () => MULT });
  md.fixAirWingsBasedAbroad(ctx(C));
  const cLine = read(unitsFile(C, "AAA_air.txt")).split("\n")[2];
  rec(`⭐⭐ C: moved again, to ${wantC}, its note keeps the state its author meant and names the one it left`,
    cLine === `\t${wantC} = {    # Nova: moved from state 3, then from 1, which is BBB's in this map  # Old Field`, cLine);

  // E: a copy Nova made whose 120-plane wing the modder re-keyed 2 → 1 by hand. State 1 is BBB's now and AAA's beneath, so judged
  // like an inherited key it WOULD be reported; it is the modder's, because it no longer matches the source's key there.
  const E = writeMod(tmp("rekeyed"));
  const eText = AAA_AIR.replace("\t1 = {   # Old Field", "\t3 = {    # Nova: moved from state 1, which is BBB's in this map  # Old Field").replace("\t2 = {", "\t1 = {");
  mk(E, "history/units/AAA_air.txt", eText);
  rec("⭐⭐⭐ E: the wing the modder re-keyed inside Nova's copy is theirs — nothing reported", hits(ctx(E)).length === 0, hits(ctx(E)));

  // F: the other direction. A copy the repair made holds the wing it moved (noted) and the wing that was home (un-noted, still the
  // source's at the same place). A later map edit gives state 2 to BBB: that key is still Nova's, so it is judged again — and only it.
  const F = writeMod(tmp("handover"));
  md.fixAirWingsBasedAbroad(ctx(F));
  const fKeys = md.airWingKeysOf(read(unitsFile(F, "AAA_air.txt"))).map((k) => [k.state, k.note]);
  rec("THE CONTROL: F's copy holds the moved key, noted, and the home key in 2, un-noted", JSON.stringify(fKeys) === JSON.stringify([[WANT, 1], [2, null]]), fKeys);
  mk(F, "history/states/2.txt", stateTxt(2, "BBB", 1));
  rec("⭐⭐⭐ F: once state 2 is BBB's, the un-noted key that still equals the source's is reported",
    JSON.stringify(hits(ctx(F))) === '["AAA_air.txt:2"]', hits(ctx(F)));
}

// ── 4. no define: room is not asked ───────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 4. a world with no AIRBASE_CAPACITY_MULT anywhere ===");
{
  const G2 = writeGame(tmp("game-nodefine"), { defines: false });
  const D = writeMod(tmp("nodefine"));
  const want = oracle({ from: 1, planes: PLANES.AAA1, homes: [2, 3], load: LOAD, capacity: () => Infinity });
  md.fixAirWingsBasedAbroad(ctx(D, G2));
  const now = md.airWingKeysOf(read(unitsFile(D, "AAA_air.txt"))).map((k) => k.state);
  rec(`⭐⭐⭐ D: the nearest wins (${want}) — no capacity is typed in`, now[0] === want && want === 2, now);
}

// ── 5. wired into the click, and said on the page ─────────────────────────────────────────────────────────────────────────
console.log("\n=== 5. wired into Auto-fix all, and its summary line ===");
{
  const m2 = writeMod(tmp("click"));
  const fr = md.autoFixMap(ctx(m2)) || {};
  const aw = (fr.fixes || {}).airWingsAbroad || {};
  rec("⭐⭐⭐ one click on Auto-fix all bases the wing back home", aw.moved === 1 && md.airWingKeysOf(read(unitsFile(m2, "AAA_air.txt")))[0].state === WANT, aw);
  const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(MAP_SRC);
  const at = MASKED.indexOf("const ro = (fr.fixes"), endAt = MASKED.indexOf("const summaryLine = (parts.length", at);
  const LIFT = at >= 0 && endAt >= 0 ? MAP_SRC.slice(at, MASKED.indexOf(";", endAt) + 1) : "";
  let line = "";
  try {
    const sb = { console, JSON, Set, Math, Array, Number, String, Object, fr };
    sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(P.withNoteHelpers(`var statusEl = null;\n${LIFT}`) + "\nglobalThis.__line = summaryLine;", sb);
    line = String(sb.__line);
  } catch (e) { line = "THREW " + e.message; }
  rec("⭐⭐ …and the summary says so, and names the file it copied", /based 1 air wing\(s\) that the map had put in another country's state/.test(line) && /AAA_air\.txt/.test(line), line.slice(0, 600));
}

// ── 6. one file, a drowned division AND a wing abroad: the division repair's copy does not blind the air rule ───────────────
// Auto-fix moves divisions before wings. To move one it copies the whole file in, changing the division's digits and nothing else —
// no note — and the finder took any un-noted mod file for the modder's own, so the wing that copy carried stayed abroad and the rule
// went silent. Shipping maps start such files (Novum Vexillum 1, Old World Blues 2; vanilla none).
//     AAA starts AAA_1936: a division on 16 (BBB's land beneath, sea in this mod, which keeps 13–15 in state 4) and a wing in 1.
console.log("\n=== 6. a drowned division and a wing abroad in one order of battle ===");
{
  const g = writeGame(tmp("game-mixed"));
  mk(g, "history/countries/AAA - Aland.txt", 'capital = 1\noob = "AAA_1936"\n');
  const MIXED = ["units = {", '\tdivision = { name = "1st" location = 16 division_template = "Inf" }', "}", "air_wings = {", ...wing(1, "AAA", PLANES.AAA1), "}", ""].join("\n");
  mk(g, "history/units/AAA_1936.txt", MIXED);
  const defs = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, gg, b] = COL(p); defs.push(p === 16 ? `${p};${r};${gg};${b};sea;false;ocean;0` : `${p};${r};${gg};${b};land;false;plains;1`); }
  const mixedMod = (t) => {
    const m = writeMod(tmp(t));
    mk(m, "map/definition.csv", defs.join("\n") + "\n");
    mk(m, "history/states/4.txt", stateTxt(4, "BBB", 1).replace("provinces = { 13 14 15 16 }", "provinces = { 13 14 15 }"));
    return m;
  };
  // AAA_air is not loaded here: what stays where is BBB's 60 in 2 and 30 in 4
  const wantM = oracle({ from: 1, planes: PLANES.AAA1, homes: [2, 3], load: { 2: PLANES.BBB2, 4: PLANES.BBB4 }, capacity: () => MULT });
  const M = mixedMod("mixed");
  const locOf = (s) => +((/location = (\d+)/.exec(s) || [])[1]);
  const dd = md.fixDrownedDivisions(ctx(M, g));
  const copy = read(unitsFile(M, "AAA_1936.txt"));
  const loc = locOf(copy);
  rec("THE CONTROL: the division repair moved the division and copied the file in — its digits changed, no note, the wing as it was",
    dd.moved === 1 && (dd.materialised || []).join() === "AAA_1936.txt" && loc !== 16 && copy === MIXED.replace("location = 16", `location = ${loc}`)
    && md.airWingKeysOf(copy).every((k) => k.note === null), { moved: dd.moved, materialised: dd.materialised, loc });
  rec("⭐⭐⭐ after that copy, AAA's wing in 1 is still found", JSON.stringify(hits(ctx(M, g))) === '["AAA_1936.txt:1"]', hits(ctx(M, g)));
  const r = md.fixAirWingsBasedAbroad(ctx(M, g));
  const keys = md.airWingKeysOf(read(unitsFile(M, "AAA_1936.txt")));
  rec(`⭐⭐⭐ …and moved to ${wantM}, AAA's, with its note — the division where the repair put it`,
    r.moved === 1 && keys.length === 1 && keys[0].state === wantM && keys[0].note === 1 && locOf(read(unitsFile(M, "AAA_1936.txt"))) === loc,{ r, keys: keys.map((k) => [k.state, k.note]) });

  const M2 = mixedMod("mixed-click");
  const fx = (md.autoFixMap(ctx(M2, g)) || {}).fixes || {};
  const after = read(unitsFile(M2, "AAA_1936.txt"));
  rec("⭐⭐⭐ one click on Auto-fix all moves both: the division off the water, the wing home",
    (fx.drownedDivisions || {}).moved === 1 && (fx.airWingsAbroad || {}).moved === 1 && (md.airWingKeysOf(after)[0] || {}).state === wantM,
    { divisions: (fx.drownedDivisions || {}).moved, wings: fx.airWingsAbroad });
  rec("⭐⭐ …and the rule is silent after it", rule(ctx(M2, g)).length === 0, rule(ctx(M2, g)).map((p) => p.total));
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a wing the map sent abroad flies home: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
