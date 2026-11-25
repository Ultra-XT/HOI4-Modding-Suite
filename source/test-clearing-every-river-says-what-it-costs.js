// ⛔ #clearing-every-river-promises-a-backup-that-does-not-exist
//
// 🧹 Clear rivers is an IMMEDIATE write — no Save to hold it, no ↶ Undo to take it back. Before the click it
// said, in terms: "This writes immediately — Nova backs your current rivers.bmp up first, into its own
// backups folder rather than into your mod." After it, it said: "your previous rivers.bmp is in Nova's
// backups." On a mod that owns no map/rivers.bmp BOTH are false. Nothing of theirs is overwritten, so
// safeModWrite has nothing to copy, and the modder has been handed a restore point that does not exist.
//
// 📊 Measured through the real endpoint's own function, on a mod holding nothing but the descriptor Nova's
// own wizard writes, over the installed base game:
//
//     POST /api/map/rivers-clear  →  { ok: true, changed: true, cleared: 90353, created: true }
//     the mod went from 1 file (descriptor.mod) to 2: + map/rivers.bmp, 11.00 MB
//     backups written: 0
//
// So one click silently made the mod the owner of every river in the world, 11 MB of it, with no way back —
// and `created`, the fact that says so, was computed by the writer and dropped by the caller.
//
// ⭐ THE WORDS ALREADY EXISTED NEXT DOOR. riversNote() on the same page words exactly this acquisition
// ("Your mod now has its own map/rivers.bmp: …") for the Delete map → Save path. The 🧹 button never adopted
// it. The dominant bug shape on this project.
//
// ⭐⭐ AND IT IS SAID BEFORE THE CLICK, NOT REPORTED AFTER IT. The response arrives once the 11 MB is already
// in the mod, so the honest sentence has to come off the model — which is why buildMapModel now carries
// `riversBmpFromMod` / `inheritedRiversBmp` beside the `provincesBmpFromMod` that blankRefusalBody reads for
// the very same reason. ONE helper (riversBmpSource) answers it for the model AND for the two writers'
// `created`, so the thing the page promises and the thing the writer does cannot drift apart: a guard that
// lives in two places and disagrees is worse than one that lives in neither.
//
// ✅ IT COSTS THE SHIPPING MAPS NOTHING. vanilla, Millennium Dawn, Road to 56, Old World Blues, New Ways and
// Rise of Nations all own map/rivers.bmp (11.0-12.4 MB each), so `own` is true on every one of the six and
// the wording there is byte-identical to before.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const tmps = [];
function tmp(tag) { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-riverclear-" + tag + "-")); tmps.push(d); return d; }

// Every write this test provokes is backed up into Nova's app-data dir; give the run a private one so it
// counts ITS OWN backups and never touches the user's.
const APP = tmp("appdata");
for (const k of ["NOVA_APP_DATA_DIR", "APPDATA", "XDG_CONFIG_HOME", "NOVA_HOME_DIR"]) process.env[k] = APP;

// ⚠️ REQUIRED AFTER the sandbox is set, never before. map-data.js resolves its backup directory once, at
// module load, so a `require` above this line files every backup this test provokes in the USER'S real
// AppData/Roaming/NovaModdingSuite — beside the backups of their actual work. That is exactly the leak
// run-tests.js hands each run a private app-data dir to prevent, and an import ordered wrongly walks
// straight past it. Caught here by this test's own "a backup really is taken" assertion reading 0.
const md = require("./map-data.js");

// ── fixture: a base "game" with rivers, and mods that do / do not own their own copy ──────────────────
const PAL = [];
PAL[0] = { r: 0, g: 255, b: 0 };       // green source
PAL[3] = { r: 0, g: 225, b: 255 };     // cyan river body
PAL[254] = { r: 122, g: 122, b: 122 }; // grey background — what the writers clear back to
PAL[255] = { r: 255, g: 255, b: 255 };
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
const RW = 12, RH = 4;
// 6 river pixels on row 1: one green source then five cyan body — derived below, never typed as a count.
const riverAt = (x, y) => (y === 1 && x >= 2 && x <= 7 ? (x === 2 ? 0 : 3) : 254);
const RIVERS_BMP = bmp8(RW, RH, PAL, riverAt);
let EXPECT_CLEARED = 0;
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (riverAt(x, y) !== 254) EXPECT_CLEARED++;

const GAME = tmp("game");
fs.mkdirSync(path.join(GAME, "map"), { recursive: true });
fs.writeFileSync(path.join(GAME, "map", "rivers.bmp"), RIVERS_BMP);

function newMod(ownsRivers) {
  const d = tmp("mod");
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RC"\nsupported_version="1.16.*"\n');
  if (ownsRivers) { fs.mkdirSync(path.join(d, "map"), { recursive: true }); fs.writeFileSync(path.join(d, "map", "rivers.bmp"), RIVERS_BMP); }
  return d;
}
function countFiles(d) {
  let n = 0; const st = [d];
  while (st.length) { const c = st.pop(); let e = []; try { e = fs.readdirSync(c, { withFileTypes: true }); } catch (_) { continue; }
    for (const x of e) { const p = path.join(c, x.name); if (x.isDirectory()) st.push(p); else n++; } }
  return n;
}

// ── 1. the writer: what a clear really costs a mod that owns no rivers.bmp ────────────────────────────
console.log("\n=== the write itself ===");
{
  const mod = newMod(false);
  const before = countFiles(mod), backupsBefore = countFiles(APP);
  const r = md.clearAllRivers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  ok(r.ok === true && r.changed === true, "a mod with no rivers.bmp still clears", r);
  ok(r.cleared === EXPECT_CLEARED, "…every river pixel in the inherited file goes", { got: r.cleared, want: EXPECT_CLEARED });
  ok(r.created === true, "⭐ …and the writer REPORTS that the mod has just taken its own copy", r);
  ok(fs.existsSync(path.join(mod, "map", "rivers.bmp")), "…the file is now in the mod");
  ok(countFiles(mod) === before + 1, "…the mod gained exactly one file", { before, after: countFiles(mod) });
  ok(countFiles(APP) === backupsBefore, "⭐⭐ …and NOTHING was backed up — there is no restore point to promise",
    { backupsBefore, backupsAfter: countFiles(APP) });
}
{
  const mod = newMod(true);
  const backupsBefore = countFiles(APP);
  const r = md.clearAllRivers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  ok(r.ok === true && r.changed === true && !r.created, "a mod that OWNS rivers.bmp reports no acquisition", r);
  ok(countFiles(APP) > backupsBefore, "…and there its backup really is taken, so the old promise was true there",
    { backupsBefore, backupsAfter: countFiles(APP) });
}

// ── 2. the model answers the same question the writer does — cold AND warm ────────────────────────────
console.log("\n=== one helper, so the promise and the write cannot drift ===");
for (const owns of [false, true]) {
  const mod = newMod(owns);
  const src = md.riversBmpSource({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  ok(src.own === owns, "riversBmpSource says own=" + owns, src);
  const cold = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  const warm = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  const warm2 = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  ok(cold.riversBmpFromMod === owns && warm.riversBmpFromMod === owns && warm2.riversBmpFromMod === owns,
    "⭐ the model carries it, and cold and warm give ONE answer",
    { cold: cold.riversBmpFromMod, warm: warm.riversBmpFromMod, warm2: warm2.riversBmpFromMod });
  ok(owns ? cold.inheritedRiversBmp === "" : cold.inheritedRiversBmp.indexOf("rivers.bmp") !== -1,
    "…and names the inherited file only when there is one", cold.inheritedRiversBmp);
  // the fact the page words is exactly the negation of the fact the writer reports
  const r = md.clearAllRivers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  ok(cold.riversBmpFromMod === !r.created, "⭐⭐ model.riversBmpFromMod === !created, on the same mod", { fromMod: cold.riversBmpFromMod, created: r.created });
}

// ── 3. the page words it ──────────────────────────────────────────────────────────────────────────────
console.log("\n=== what the modder is told BEFORE the click ===");
{
  // 🈯 CRLF-tolerant on purpose: this repo checks out CRLF and a bare-newline anchor finds nothing in a
  // fresh worktree while reporting success.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  function lift(name) {
    const s0 = MAP.indexOf("function " + name + "(");
    if (s0 < 0) return null;
    const body = MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
    try { return new Function(body + "\nreturn " + name + ";")(); } catch (_) { return null; }
  }
  const confirmBody = lift("riversClearConfirmBody");
  const clearedNote = lift("riversClearedNote");
  ok(typeof confirmBody === "function", "riversClearConfirmBody lifts and runs");
  ok(typeof clearedNote === "function", "riversClearedNote lifts and runs");

  // ⚠️ If either is missing, STOP this block rather than running the assertions against a stub. A stub that
  // returns "" would pass every NEGATIVE assertion below ("does not promise a backup") while the behaviour is
  // absent — a back-out that reads as a pass, which is the failure mode this project keeps having to undo.
  // The two failures already recorded above carry the verdict, and part 4 still runs.
  if (typeof confirmBody !== "function" || typeof clearedNote !== "function") {
    console.log("  (both must lift before the wording can be judged — not judging it against a stub)");
  } else {

  const INHERITED = "D:/HOI4/map/rivers.bmp";
  const notOurs = { riversBmpFromMod: false, inheritedRiversBmp: INHERITED };
  const ours = { riversBmpFromMod: true, inheritedRiversBmp: "" };

  for (const unsaved of [false, true]) {
    const said = confirmBody(notOurs, unsaved);
    ok(!/backs your current rivers\.bmp up first/.test(said),
      "⭐⭐ it does NOT promise a backup it cannot make" + (unsaved ? " (unsaved-edits branch)" : ""), said);
    ok(/nothing to back up/i.test(said),
      "⭐ …it says so in terms" + (unsaved ? " (unsaved-edits branch)" : ""), said);
    ok(said.indexOf(INHERITED) !== -1,
      "⭐ …and names the file the mod is about to take" + (unsaved ? " (unsaved-edits branch)" : ""), said);
    ok(/owner of every river/.test(said), "…and what taking it means" + (unsaved ? " (unsaved-edits branch)" : ""), said);
  }
  ok(/unsaved river edits/.test(confirmBody(notOurs, true)), "…the unsaved-edits branch still says the edits go", confirmBody(notOurs, true));
  ok(!/unsaved river edits/.test(confirmBody(notOurs, false)), "…and the other branch does not invent them");

  // the six shipping maps all own the file: their wording is the one that was always there
  const shipping = confirmBody(ours, false);
  ok(/backs your current rivers\.bmp up first/.test(shipping), "✅ a mod that owns rivers.bmp keeps the old, true sentence", shipping);
  ok(!/nothing to back up/i.test(shipping), "…and is told nothing about an acquisition that is not happening", shipping);

  console.log("\n=== …and AFTER it ===");
  const tookIt = clearedNote({ changed: true, cleared: 90353, created: true });
  ok(!/in Nova's backups/.test(tookIt), "⭐⭐ the result line does not claim a backup that was never taken", tookIt);
  ok(/map\/rivers\.bmp/.test(tookIt), "⭐ …it names the file the mod now owns", tookIt);
  ok(/90,353/.test(tookIt), "…and how many pixels went", tookIt);
  const overwrote = clearedNote({ changed: true, cleared: 12, created: false });
  ok(/in Nova's backups/.test(overwrote), "…and when a file really was overwritten it still says where the copy is", overwrote);
  ok(clearedNote({ changed: false, cleared: 0 }).indexOf("already river-free") !== -1, "…and says nothing happened when nothing did");
  }
}

// ── 3b. the OTHER writer that takes the file: one painted pixel ───────────────────────────────────────
// writeRiversPaint materialises the same 11 MB bitmap before it can patch a byte of it, and the Save flush
// read `addedSource` off that very response while never reading `created`.
console.log("\n=== the first river stroke takes the whole file too ===");
{
  const mod = newMod(false);
  const r = md.writeRiversPaint({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], edits: [{ x: 4, y: 1, index: 3 }] });
  ok(r.ok === true && r.created === true, "⭐ one painted pixel acquires map/rivers.bmp, and the writer says so", r);
  ok(fs.existsSync(path.join(mod, "map", "rivers.bmp")), "…the file is in the mod");
  const again = md.writeRiversPaint({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], edits: [{ x: 5, y: 1, index: 3 }] });
  ok(!again.created, "…and the SECOND stroke acquires nothing, so the note speaks once", again);

  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  const s0 = MAP.indexOf("function riversPaintNote(");
  let note = null;
  if (s0 >= 0) { try { note = new Function(MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4) + "\nreturn riversPaintNote;")(); } catch (_) { note = null; } }
  ok(typeof note === "function", "riversPaintNote lifts and runs");
  if (typeof note === "function") {
    const said = note({ ok: true, changed: 1, created: true });
    ok(/map\/rivers\.bmp/.test(said), "⭐⭐ …and the Save report names the file the mod has just taken", said);
    ok(note({ ok: true, changed: 1, created: false }) === "", "✅ …and says NOTHING when the mod already owned it — which is all six shipping maps");
    ok(note({ ok: true, changed: 1 }) === "", "…and nothing when the writer did not report an acquisition at all");
  }
  // scoped by URL: `created` is not a rivers-only key, so a blanket read would cry wolf on other writers
  ok(/w\.url === "\/api\/map\/rivers-paint"/.test(MAP), "⭐⭐ the flush reads it SCOPED to the rivers-paint write", null);
  const i = MAP.indexOf('w.url === "/api/map/rivers-paint"');
  ok(i > 0 && /riversPaintNote\(res\)/.test(MAP.slice(i, i + 300)), "⭐⭐ …and calls riversPaintNote there");
}

// ── 4. the handler adopted them (the back-out control) ────────────────────────────────────────────────
console.log("\n=== the button uses them ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  const i = MAP.indexOf('$("mapRiversClear")');
  const handler = i < 0 ? "" : MAP.slice(i, i + 2500);
  ok(handler.length > 0, "the 🧹 Clear rivers handler was found");
  ok(/riversClearConfirmBody\(model,/.test(handler), "⭐⭐ it asks riversClearConfirmBody before the POST", handler.slice(0, 500));
  ok(/riversClearedNote\(r\)/.test(handler), "⭐⭐ …and riversClearedNote after it", handler.slice(0, 900));
  ok(!/backs your current rivers\.bmp up first/.test(handler),
    "⭐⭐ the unconditional backup promise is gone from the handler");
  ok(!/previous rivers\.bmp is in Nova's backups/.test(handler),
    "⭐⭐ …and so is the unconditional one in the result line");
}

// ── 5. the corpus: a rule that fires on a shipping map is a bug in the rule ────────────────────────────
console.log("\n=== the six shipping maps ===");
{
  const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
  const CORPUS = { vanilla: VAN, MD: WS + "2777392649", R56: WS + "820260968", OWB: WS + "2265420196", NV: WS + "1827273767", RoN: WS + "2026448968" };
  const present = Object.entries(CORPUS).filter(([, r]) => { try { return fs.existsSync(path.join(r, "descriptor.mod")) || fs.existsSync(path.join(r, "map")); } catch (_) { return false; } });
  if (!present.length) console.log("  (the installed corpus is not on this machine — the fixture assertions above still ran)");
  for (const [k, r] of present) {
    const s = md.riversBmpSource({ modRoot: r, gameRoot: VAN, dependencyRoots: [] });
    ok(s.own === true, "✅ " + k + " owns map/rivers.bmp, so the new wording never speaks there", s);
  }
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log("\n" + pass + " passed, " + fails.length + " failed");
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
