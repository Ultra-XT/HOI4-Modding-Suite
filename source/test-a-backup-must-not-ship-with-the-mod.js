// A backup written INSIDE the mod is not a backup — it is a file the modder ships to every subscriber.
// #a-backup-must-not-ship-with-the-mod
//
// fixFractionedRegions snapshotted map/strategicregions to <mod>/map/strategicregions_bak/. One click of
// Auto-fix and a duplicate of the mod's strategic regions sat inside the mod for ever, in the release, on
// the workshop. Every other snapshot Nova takes is deliberately kept out: blankedMapSnapshotDir's own
// comment reads "Kept OUTSIDE the mod, beside map_baselines, so a snapshot of 1,500 files never ends up
// shipped in the release", and safe-write.js says the backup directory is derived in one place, under
// AppData, "NOT on the drive that happens to hold the program". This caller adopted none of it.
//
// ⭐⭐⭐ THE OLD TEST PASSED ON THE BUG. test-map-fix-fractioned-regions.js asserted:
//
//     ok("a strategicregions_bak snapshot was written before editing",
//        fs.existsSync(path.join(mod, "map", "strategicregions_bak", "regions.txt")));
//
// It asked whether a backup EXISTED. It never asked where — and the answer to "where" was the whole defect.
// A backup test that does not assert the location is measuring the half that was never in doubt.
//
// ⚠️ AND IT WAS A SNAPSHOT OF THE WRONG MOMENT. The guard was `!fs.existsSync(bakDir)`: only the FIRST run
// ever wrote one. A modder who clicked Auto-fix, looked at the result, and clicked again had no backup of
// the second run's edits at all — while a directory sat in their mod looking exactly like one. That is
// worse than having none, because it reads as safety. Each run now gets its own timestamped folder.
//
// ⛔ THE OLD DIRECTORIES ARE MOVED, NEVER DELETED. CLAUDE.md's fourth rule, and the 09-06 incident behind
// it was restoreCountry deleting a removal archive. Copy out, verify size by size, and only then remove —
// and if anything at all does not line up, leave the original exactly where it is and say so.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────────────
// 2026-09-16 — AND THE SAME RULE FOR A SINGLE FILE (sections 7 and 8). Owner's decision this night.
//
// The directory above was one mistake. The per-file copy was the same mistake 26 times: every map writer in
// map-data.js ran `fs.copyFileSync(f, f + ".bak")` on the line immediately above the safeModWrite that
// ALREADY backs that file up — byte for byte, into Nova's own backups folder, outside the mod. So the in-mod
// copy was never the backup; it was a second one, in the one place it must not be. HOI4 never reads it, and
// it uploads to the Workshop with the mod.
//
// MEASURED on the owner's machine, 2026-09-16: 43 .bak files totalling 63.9 MB across their mod folder —
// fifteen map/buildings.txt.bak at about 3.3 MB each, thirteen map/definition.csv.bak, an 11.5 MB
// map/rivers.bmp.bak — and one that had escaped into a SUBSCRIBED Workshop mod, Road to 56's
// common/countries/colors.txt.bak, in a folder that is not Nova's to write to at all. The editor
// walk-through that started this counted 17 files / 72 MB, including a 34.6 MB map/provinces.bmp.bak.
//
// Section 7 drives four real writers and asserts BOTH halves — no .bak beside the modder's file, AND the
// previous bytes still recoverable from Nova's backup folder. Section 8 derives the shipped-file list from
// package.json's build.files and refuses a .bak named anywhere in code, so the next writer cannot slip past
// the way this one did (test-mod-writes-have-one-owner.js had these two writes on an ALLOW-LIST).
//
// ⛔ NOTHING HERE DELETES AN EXISTING .bak. The ones already sitting in a modder's mod are their files now;
// the owner has not agreed to Nova removing them, and no code added for this does.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

// Sandbox the home dir BEFORE map-data resolves anything, so nothing lands in the user's real home.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bak-home-"));
process.env.NOVA_HOME_DIR = HOME;
// …and the app-data dir, for that reason and one more: section 7 asserts that the backup Nova keeps INSTEAD
// of the in-mod .bak really holds the previous bytes, so it has to READ the backup folder. safe-write.js
// resolves that folder once, at require time, from APPDATA / XDG_CONFIG_HOME — so this has to happen above
// the require or the assertion would read (and this test's writes would prune) the user's real backups.
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bak-appdata-"));
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
const md = require("./map-data.js");
// DERIVED: wherever safe-write resolved it to under the sandbox above, not a path spelled out here.
const { BACKUP_DIR } = require("./safe-write.js");

const tmps = [HOME, APPDATA];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}

// The same fixture the sibling test uses: naval region 10 is split, province 1 is the orphan.
// ⚠️ MOVED WITH #the-wrap-seam-joins-a-region, exactly as test-map-fix-fractioned-regions.js moved: at 8 wide, sea 1
// (column 0) and sea 4 (column 7) touch across the map's wrap seam, so there was no orphan to repair. A column of
// land 7 down the right edge keeps them apart; the repair this test needs is unchanged.
const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
const provAt = (x, y) => (x === 8 ? 7 : (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)]);
const REGIONS_BEFORE =
  'strategic_region = {\n\tid = 10\n\tname = "R10"\n\tprovinces = { 1 3 4 }\n}\n' +
  'strategic_region = {\n\tid = 20\n\tname = "R20"\n\tprovinces = { 2 }\n}\n' +
  'strategic_region = {\n\tid = 30\n\tname = "R30"\n\tprovinces = { 5 }\n}\n' +
  'strategic_region = {\n\tid = 40\n\tname = "R40"\n\tprovinces = { 6 8 }\n}\n' +
  'strategic_region = {\n\tid = 50\n\tname = "R50"\n\tprovinces = { 7 }\n}\n';

function makeMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bak-mod-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="Bak"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(9, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;20;0;0;sea;false;ocean;0",
    "2;40;0;0;land;false;plains;1",
    "3;60;0;0;sea;false;ocean;0",
    "4;80;0;0;sea;false;ocean;0",
    "5;100;0;0;sea;false;ocean;0",
    "6;120;0;0;land;false;plains;1",
    "7;140;0;0;land;false;plains;1",
    "8;160;0;0;land;false;plains;1",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "strategicregions", "regions.txt"), REGIONS_BEFORE);
  return mod;
}
const inMod = (mod, p) => path.resolve(p || "").toLowerCase().startsWith(path.resolve(mod).toLowerCase());

/** Every path under `dir` whose name ends in .bak — what a modder would upload to the Workshop. */
function bakUnder(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) bakUnder(p, base, out);
    else if (/\.bak$/i.test(e.name)) out.push(path.relative(base, p).replace(/\\/g, "/"));
  }
  return out;
}

// 8-bit indexed BMP, the shape map/rivers.bmp has. palette: index -> {r,g,b}; indexFn(x, y) -> index.
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

/** A tiny rivers.bmp: grey land (254), white sea (255), a green source (0) feeding a small river (3). */
function riversBmp() {
  const PAL = [];
  PAL[0] = { r: 0, g: 255, b: 0 }; PAL[3] = { r: 0, g: 225, b: 255 };
  PAL[254] = { r: 122, g: 122, b: 122 }; PAL[255] = { r: 255, g: 255, b: 255 };
  return bmp8(8, 4, PAL, (x, y) => (x === 7 ? 255 : y === 1 && x === 0 ? 0 : y === 1 && x <= 3 ? 3 : 254));
}

try {
  console.log("1. ⭐⭐⭐ The snapshot lands outside the mod");
  {
    const mod = makeMod();
    const r = md.fixFractionedRegions({ modRoot: mod });
    rec("the repair ran", r.moved === 1, r.moved);
    rec("it reported where the snapshot went", !!r.snapshotDir, r.snapshotDir);
    rec("⭐ the snapshot is NOT inside the mod", !inMod(mod, r.snapshotDir), r.snapshotDir);
    rec("…it is under the sandboxed home, with every other Nova snapshot",
      path.resolve(r.snapshotDir).toLowerCase().startsWith(path.resolve(md.regionMoveSnapshotDir(mod)).toLowerCase()), r.snapshotDir);
    rec("…and it actually holds the file", fs.existsSync(path.join(r.snapshotDir, "regions.txt")));
    rec("⭐ nothing backup-shaped was left in map/", fs.readdirSync(path.join(mod, "map")).every((f) => !/_bak|backup/i.test(f)), fs.readdirSync(path.join(mod, "map")));
    rec("…and no stray directory anywhere in the mod", (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/_bak|backup/i.test(e.name)) return false;
        if (e.isDirectory() && !walk(path.join(d, e.name))) return false;
      }
      return true;
    })(mod));
  }

  console.log("\n2. ⚠️ EVERY run gets its own snapshot — the second-run gap");
  {
    const mod = makeMod();
    const first = md.fixFractionedRegions({ modRoot: mod });
    // Re-break it, so the second run has real work and therefore reaches the snapshot.
    mk(path.join(mod, "map", "strategicregions", "regions.txt"), REGIONS_BEFORE);
    const second = md.fixFractionedRegions({ modRoot: mod });
    rec("both runs repaired something", first.moved === 1 && second.moved === 1, { first: first.moved, second: second.moved });
    rec("⭐⭐ the second run got its OWN snapshot, not the first one's",
      !!second.snapshotDir && second.snapshotDir !== first.snapshotDir, { first: first.snapshotDir, second: second.snapshotDir });
    rec("…and both still exist, so either run can be undone",
      fs.existsSync(path.join(first.snapshotDir, "regions.txt")) && fs.existsSync(path.join(second.snapshotDir, "regions.txt")));
  }

  console.log("\n3. ⛔ An old in-mod backup is MOVED out, never deleted");
  {
    const mod = makeMod();
    const legacyDir = path.join(mod, "map", "strategicregions_bak");
    mk(path.join(legacyDir, "regions.txt"), REGIONS_BEFORE);
    mk(path.join(legacyDir, "extra.txt"), "strategic_region = { id = 99 name = \"R99\" provinces = { } }\n");
    const bytesBefore = fs.readFileSync(path.join(legacyDir, "regions.txt"), "utf8").length;

    const r = md.fixFractionedRegions({ modRoot: mod });
    rec("the legacy directory is gone from the mod", !fs.existsSync(legacyDir), fs.readdirSync(path.join(mod, "map")));
    rec("⛔ …because it was MOVED, and the caller was told where", !!r.legacyBackupMoved && !inMod(mod, r.legacyBackupMoved), r.legacyBackupMoved);
    rec("…every file arrived", fs.existsSync(path.join(r.legacyBackupMoved, "regions.txt")) && fs.existsSync(path.join(r.legacyBackupMoved, "extra.txt")),
      fs.existsSync(r.legacyBackupMoved || "") ? fs.readdirSync(r.legacyBackupMoved) : "(no dir)");
    rec("…intact, byte for byte", fs.readFileSync(path.join(r.legacyBackupMoved, "regions.txt"), "utf8").length === bytesBefore);
    rec("…and no warning was raised", !r.legacyBackupWarning, r.legacyBackupWarning);
  }

  console.log("\n4. ⛔ It refuses to remove a directory holding something it did not carry");
  {
    const mod = makeMod();
    const legacyDir = path.join(mod, "map", "strategicregions_bak");
    mk(path.join(legacyDir, "regions.txt"), REGIONS_BEFORE);
    mk(path.join(legacyDir, "MY NOTES.md"), "do not delete this, I wrote it\n");   // the modder's own file
    const res = md.migrateLegacyRegionBackup(mod);
    rec("⭐⭐⭐ the modder's own file is still there", fs.existsSync(path.join(legacyDir, "MY NOTES.md")));
    rec("…and so is the whole directory — nothing was removed", fs.existsSync(path.join(legacyDir, "regions.txt")));
    rec("…but the .txt was still copied out, so it is safe either way", !!res.movedTo && fs.existsSync(path.join(res.movedTo, "regions.txt")), res.movedTo);
    rec("…and it SAYS why it left the directory alone", /MY NOTES\.md/.test(String(res.warning)), res.warning);
  }

  console.log("\n5. A failed snapshot is reported, not swallowed");
  {
    const mod = makeMod();
    // Point the home dir at a FILE. mkdirSync below it fails with ENOTDIR on every platform.
    const notADir = path.join(os.tmpdir(), "nova-bak-not-a-dir-" + process.pid);
    fs.writeFileSync(notADir, "x");
    const saved = process.env.NOVA_HOME_DIR;
    process.env.NOVA_HOME_DIR = notADir;
    let r;
    try { r = md.fixFractionedRegions({ modRoot: mod }); } finally {
      process.env.NOVA_HOME_DIR = saved;
      try { fs.unlinkSync(notADir); } catch (_) {}
    }
    rec("⭐⭐ the failure is REPORTED", !!r.snapshotError, r.snapshotError);
    rec("…and there is no snapshotDir claiming otherwise", !r.snapshotDir, r.snapshotDir);
    rec("…while the repair still ran — a full disk must not block a fix", r.moved === 1, r.moved);
    rec("…and it still did not fall back to writing inside the mod",
      !fs.existsSync(path.join(mod, "map", "strategicregions_bak")), fs.readdirSync(path.join(mod, "map")));
  }

  console.log("\n6. Nothing to repair means nothing is written at all");
  {
    const mod = makeMod();
    md.fixFractionedRegions({ modRoot: mod });                     // fix it
    const before = fs.readdirSync(md.regionMoveSnapshotDir(mod)).length;
    const again = md.fixFractionedRegions({ modRoot: mod });       // now there is nothing to do
    rec("a no-op run moves nothing", again.moved === 0, again.moved);
    rec("…and takes no snapshot — an unchanged map does not need one",
      fs.readdirSync(md.regionMoveSnapshotDir(mod)).length === before, { before, after: fs.readdirSync(md.regionMoveSnapshotDir(mod)).length });
    const dry = md.fixFractionedRegions({ modRoot: makeMod(), dryRun: true });
    rec("…and neither does a dry run", dry.moved === 0 && !dry.snapshotDir, dry.snapshotDir);
  }

  console.log("\n7. ⭐⭐⭐ THE BACKUP IS NOVA'S, NOT THE MOD'S — a real edit leaves no .bak beside the file");
  {
    const mod = makeMod();
    mk(path.join(mod, "map", "adjacencies.csv"),
      "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\r\n-1;-1;;-1;-1;-1;-1;-1;;\r\n");
    mk(path.join(mod, "common", "countries", "colors.txt"), "AAA = {\r\n\tcolor = rgb { 1 2 3 }\r\n}\r\n");
    mk(path.join(mod, "map", "rivers.bmp"), riversBmp());

    // Is the previous content recoverable? Not "did a file appear" — the same half-question the old
    // fixFractionedRegions test asked. Compare the BYTES.
    const backupHolding = (bytes) => {
      let names = [];
      try { names = fs.readdirSync(BACKUP_DIR); } catch (_) { return ""; }
      for (const n of names) { try { if (fs.readFileSync(path.join(BACKUP_DIR, n)).equals(bytes)) return n; } catch (_) {} }
      return "";
    };

    // One writer per shape, from the flows the second editor walk-through watched: a csv row, an adjacency
    // line, a country colour, and a BINARY bitmap. The bitmaps are what made this expensive — the walk-through
    // measured a 34.6 MB map/provinces.bmp.bak, and the owner's mod folder still holds an 11.5 MB
    // map/rivers.bmp.bak and fifteen buildings.txt.bak of about 3.3 MB each.
    const flows = [
      ["map/definition.csv", () => md.setProvinceDefinition({ modRoot: mod, provinceId: 6, terrain: "forest" })],
      ["map/adjacencies.csv", () => md.writeAdjacency({ modRoot: mod, action: "add", from: 6, to: 7, type: "" })],
      ["common/countries/colors.txt", () => md.setCountryColor({ modRoot: mod, tag: "AAA", rgb: [9, 8, 7] })],
      ["map/rivers.bmp", () => md.clearAllRivers({ modRoot: mod })],
    ];
    for (const [rel, run] of flows) {
      const file = path.join(mod, ...rel.split("/"));
      const before = fs.readFileSync(file);
      const r = run();
      rec(rel + ": the edit landed", !(r && r.error) && !fs.readFileSync(file).equals(before), r);
      rec(rel + ": ⭐ no .bak was left beside the modder's file", !fs.existsSync(file + ".bak"));
      rec(rel + ": …and the previous bytes ARE in Nova's backup folder, outside the mod",
        !!backupHolding(before), backupHolding(before));
    }
    rec("⭐⭐⭐ nothing anywhere under the mod ends in .bak", bakUnder(mod).length === 0, bakUnder(mod));
  }

  console.log("\n8. ⭐⭐⭐ DERIVED FROM SOURCE — a NEW writer cannot slip past this");
  {
    const { maskJsComments } = require("./testlib-strip-comments.js");
    // The file list is package.json's build.files — the release WHITELIST, the same list scripts/release.js
    // derives its packaged-asar check from. A module that is not in it does not ship at all; one that is
    // arrives here the day somebody adds it, with nothing to keep in step by hand.
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    const shipped = [];
    const walkJs = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkJs(p);
        // .html too: the promise a modder actually reads lived in a BUTTON TOOLTIP ("a .bak is kept"), and a
        // guard that only reads .js would have left that sentence lying on the page for ever.
        else if (/\.(js|html)$/i.test(e.name)) shipped.push(path.relative(__dirname, p).replace(/\\/g, "/"));
      }
    };
    for (const pat of ((pkg.build || {}).files || [])) {
      const star = pat.indexOf("*");
      const abs = path.join(__dirname, star < 0 ? pat : pat.slice(0, star));
      if (star < 0) { if (/\.js$/i.test(pat) && fs.existsSync(abs)) shipped.push(pat); }
      else if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walkJs(abs);
    }
    rec("the file list was derived from build.files, not typed in here",
      shipped.length > 10 && ["map-data.js", "server.js", "public/map.js", "public/map.html"].every((f) => shipped.includes(f)), shipped.length);

    // A writer can spell the name three ways — `p + ".bak"`, a `const bak = …` two lines above the copy, or a
    // template literal — so the check is for the STRING in CODE, anywhere, rather than for one call shape.
    // Comments are masked: prose about the old behaviour is not a writer, and this project's source explains
    // itself at length. Length-preserving, so the line numbers it prints are the real ones.
    const hits = (rel, raw) => {
      // Only a .js file gets its comments masked. In markup there is no such distinction worth drawing: a
      // .bak named in a tooltip, an attribute or an HTML comment is a promise to the modder either way.
      const masked = /\.js$/i.test(rel) ? maskJsComments(raw) : raw;
      if (masked.length !== raw.length) return [rel + ": the comment mask desynced — this file cannot be judged"];
      const rawLines = raw.split("\n"), out = [];
      masked.split("\n").forEach((l, i) => { if (l.includes(".bak")) out.push(rel + ":" + (i + 1) + "  " + rawLines[i].trim().slice(0, 100)); });
      return out;
    };
    // ⭐ POSITIVE CONTROLS. A guard that cannot see the thing it forbids passes for the wrong reason, which is
    // exactly how the old "a strategicregions_bak exists" assertion survived the bug it was written for.
    rec("CONTROL: it sees a sibling copy", hits("c.js", 'fs.copyFileSync(p, p + ".bak");').length === 1);
    rec("CONTROL: …and a name built two lines earlier", hits("c.js", 'const bak = f + ".bak";\nfs.writeFileSync(bak, t);').length === 1);
    rec("CONTROL: …and a template literal", hits("c.js", "fs.copyFileSync(p, `${p}.bak`);").length === 1);
    rec("CONTROL: …and a promise of one in a message to the modder", hits("c.js", 'alert("a .bak is kept");').length === 1);
    rec("CONTROL: …and one in a tooltip on the page", hits("c.html", '<button title="a .bak is kept">go</button>').length === 1);
    rec("CONTROL: …and it does NOT fire on a comment about one", hits("c.js", "// the old writer kept a .bak here\nconst a = 1;").length === 0);

    const offenders = shipped.flatMap((rel) => hits(rel, fs.readFileSync(path.join(__dirname, rel), "utf8")));
    rec("⭐⭐⭐ no shipped file writes — or promises — a .bak inside the mod", offenders.length === 0,
      { count: offenders.length, first: offenders.slice(0, 6) });
  }

  console.log(`\n=== a backup must not ship with the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
