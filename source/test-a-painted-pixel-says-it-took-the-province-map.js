// ⛔ #a-painted-pixel-takes-the-whole-province-map-in-silence
//
// map/provinces.bmp is 33 MB and it IS the map's identity — colour, not id, is what makes a province — so
// owning it means owning every province shape in the world, and no longer receiving any the layer below
// changes. A mod that ships none paints against the layer below, and applyProvinceDiff writes the result
// into the mod. One pixel, and the mod owns the world's shapes.
//
// It has always reported that, as `fromVanilla`. NOTHING on the page has ever read that key.
//
// 📊 MEASURED on a mod holding nothing but the descriptor Nova's own wizard writes, over the installed base
// game, sending the diff shape the client sends:
//
//     applyProvinceDiff({ diff: [{ x, y, r, g, b }] })  →  { ok: true, applied: 1, fromVanilla: true }
//     the mod went from 1 file (descriptor.mod) to 2:  + map/provinces.bmp, 33.00 MB
//
// …and the SAME mod made to depend on Millennium Dawn:
//
//     →  { ok: true, applied: 1, fromVanilla: FALSE }   and the mod still gained 33.00 MB
//
// So `fromVanilla` could never have carried this: it answers "was the source the base game?", not "did my
// mod just take a copy?". The new key is derived from `srcPath` — the very path the writer read the pixels
// from — so what is reported and what happened cannot drift apart.
//
// ⭐ AND THE SENTENCE ALREADY EXISTED AT THIS EXACT CALL SITE. heightmapNote is pushed into paintWarnings
// three lines below the new call, and its own comment records that this same handler once "dropped
// res.heightmap on the floor, which is precisely the silent acquisition the note exists to prevent".
// heightmap.bmp (11.5 MB) was adopted; provinces.bmp (33 MB, and the one that confers ownership) was not.
//
// ⚠️ blankRefusalBody REFUSES to copy this file on the modder's behalf, in terms: "a 34 MB bitmap makes your
// mod the owner of every province in it, and that is your decision, not a side effect of a button" — and it
// points them at painting as the deliberate way to do it. The one path that does it therefore has to say so.
//
// ✅ Silent on all six shipping maps, which own their own provinces.bmp.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 380) : "")); }
};

const tmps = [];
function tmp(tag) { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paintprov-" + tag + "-")); tmps.push(d); return d; }

// ⚠️ The sandbox goes in BEFORE map-data is required: it resolves its backup directory once, at module
// load, so a require above this line files this test's backups in the user's real AppData.
const APP = tmp("appdata");
for (const k of ["NOVA_APP_DATA_DIR", "APPDATA", "XDG_CONFIG_HOME", "NOVA_HOME_DIR"]) process.env[k] = APP;
const md = require("./map-data.js");

// ── fixture: a base "game" and a "dependency", each owning a provinces.bmp; mods that own none ─────────
const W = 8, H = 4;
function bmp24(colourAt) {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let p = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = colourAt(x, y); b[p++] = c[2]; b[p++] = c[1]; b[p++] = c[0]; } }
  return b;
}
const GAME_COL = (x) => (x < 4 ? [10, 10, 10] : [20, 20, 20]);
const DEP_COL = (x) => (x < 4 ? [30, 30, 30] : [40, 40, 40]);
function defn(rows) { return rows.join("\n") + "\n"; }

function baseRoot(tag, colour, rows) {
  const d = tmp(tag);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24(colour));
  fs.writeFileSync(path.join(d, "map", "definition.csv"), defn(rows));
  return d;
}
const GAME = baseRoot("game", GAME_COL, ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;sea;false;ocean;0"]);
const DEP = baseRoot("dep", DEP_COL, ["0;0;0;0;land;false;unknown;0", "1;30;30;30;land;false;plains;1", "2;40;40;40;sea;false;ocean;0"]);
function newMod() {
  const d = tmp("mod");
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PP"\nsupported_version="1.16.*"\n');
  return d;
}
function files(d) { const o = []; const st = [d]; while (st.length) { const c = st.pop(); let e = []; try { e = fs.readdirSync(c, { withFileTypes: true }); } catch (_) { continue; } for (const x of e) { const p = path.join(c, x.name); if (x.isDirectory()) st.push(p); else o.push(path.relative(d, p).replace(/\\/g, "/")); } } return o.sort(); }

// ── 1. over the base game ─────────────────────────────────────────────────────────────────────────────
console.log("\n=== one painted pixel, over the base game ===");
{
  const mod = newMod();
  const before = files(mod).length;
  const r = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], diff: [{ x: 1, y: 1, r: 20, g: 20, b: 20 }] });
  ok(r.ok === true, "the paint lands", r);
  ok(r.createdProvincesBmp === true, "⭐⭐ …and the writer reports that the mod has just taken the province map", r);
  ok(String(r.provincesBmpFrom || "").indexOf("provinces.bmp") !== -1, "…naming the file it copied", r.provincesBmpFrom);
  ok(fs.existsSync(path.join(mod, "map", "provinces.bmp")), "…the file is in the mod now");
  ok(files(mod).length > before, "…the mod gained a file", { before, after: files(mod).length });
  const again = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], diff: [{ x: 2, y: 1, r: 20, g: 20, b: 20 }] });
  ok(again.createdProvincesBmp === false, "✅ …and the SECOND stroke takes nothing, so it is said once", again);
}

// ── 2. over a DEPENDENCY — the case fromVanilla gets wrong ────────────────────────────────────────────
console.log("\n=== the same stroke, over a dependency ===");
{
  const mod = newMod();
  const r = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [DEP], diff: [{ x: 1, y: 1, r: 40, g: 40, b: 40 }] });
  ok(r.ok === true, "the paint lands over a dependency too", r);
  ok(r.fromVanilla === false, "…and `fromVanilla` is FALSE here — it answers a different question", r);
  ok(fs.existsSync(path.join(mod, "map", "provinces.bmp")), "⭐⭐ …yet the mod took the 33 MB copy all the same");
  ok(r.createdProvincesBmp === true, "⭐⭐⭐ …which is exactly what the new key reports, and fromVanilla could not", r);
  // String(… || "") on purpose: with the change backed out this key is undefined, and a bare .indexOf
  // would throw and stop the run before the page assertions below ever reported. A back-out must FAIL
  // every check it breaks, not die at the first one.
  ok(String(r.provincesBmpFrom || "").indexOf(path.basename(DEP)) !== -1, "…and it names the DEPENDENCY as the source, not vanilla", r.provincesBmpFrom);
}

// ── 3. a mod that already owns one is told nothing ────────────────────────────────────────────────────
console.log("\n=== a mod that owns its own province map ===");
{
  const mod = newMod();
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(GAME_COL));
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defn(["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;sea;false;ocean;0"]));
  const r = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], diff: [{ x: 1, y: 1, r: 20, g: 20, b: 20 }] });
  ok(r.ok === true && r.createdProvincesBmp === false, "✅ nothing is claimed — which is every shipping map", r);
  ok(r.provincesBmpFrom === "", "…and no source is named", r);
}

// ── 4. the page says it, at the call site that already says it for the other four bitmaps ─────────────
console.log("\n=== the page words it ===");
{
  // 🈯 CRLF-tolerant: this repo checks out CRLF and a bare-newline anchor finds nothing in a worktree.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  const s0 = MAP.indexOf("function provincesBmpNote(");
  let note = null;
  if (s0 >= 0) { try { note = new Function(MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4) + "\nreturn provincesBmpNote;")(); } catch (_) { note = null; } }
  ok(typeof note === "function", "provincesBmpNote lifts and runs");
  if (typeof note === "function") {
    const said = note({ createdProvincesBmp: true, provincesBmpFrom: "D:/HOI4/map/provinces.bmp" });
    ok(/map\/provinces\.bmp/.test(said), "⭐ it names the file the mod now owns", said);
    ok(said.indexOf("D:/HOI4/map/provinces.bmp") !== -1, "⭐ …and where the copy came from", said);
    ok(/every province shape/.test(said), "⭐⭐ …and what owning it MEANS, which is the whole point", said);
    ok(note({ createdProvincesBmp: false }) === "", "✅ …and says NOTHING when nothing was taken");
    ok(note({}) === "" && note(null) === "", "…and nothing on a response that does not mention it");
  }
  // wired in beside heightmapNote, on the paint response
  const i = MAP.indexOf("const note = heightmapNote(res.heightmap);\n          if (note && paintWarnings");
  ok(i > 0, "the paint handler's heightmapNote line was found");
  ok(i > 0 && /provincesBmpNote\(res\)/.test(MAP.slice(i, i + 700)),
    "⭐⭐ …and provincesBmpNote is pushed onto the SAME paintWarnings line", i > 0 ? MAP.slice(i, i + 500) : null);
}

// ── 5. the fact is derived from the path the writer read, not re-decided ──────────────────────────────
console.log("\n=== one source of truth ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n");
  const a = SRC.indexOf("function applyProvinceDiff(");
  const body = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10));
  ok(body.length > 0, "applyProvinceDiff was found");
  ok(/createdProvincesBmp: srcPath !== modBmp/.test(body),
    "⭐⭐ the reported fact IS the writer's own source path — it cannot drift from what happened");
  ok(/fromVanilla: srcPath === vanBmp/.test(body), "…and the old key is kept, because test-map-data.js pins it");
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log("\n" + pass + " passed, " + fails.length + " failed");
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
