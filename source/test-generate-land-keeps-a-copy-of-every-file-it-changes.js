// ⛔ #generate-land-evicted-its-own-backups — GENERATE LAND KEEPS A COPY OF EVERY FILE IT CHANGES, AND THE MAP PICTURE IS NEVER
// SERVED STALE.
//
// THE DEFECT. 🌍 Generate land opened no backup scope. Its first overwrite is map/definition.csv; then, for every state it makes,
// ensureBuildingSlotsForState rewrites map/buildings.txt — 1,081 times on the owner's flow, every one a `map-` backup — and
// pruneBackups cuts that pool to MAX_BACKUP_FILES after EVERY backup. So the copy of definition.csv taken before the click was
// gone before the click returned, and so was every other early copy: the click deleted its own way back. Auto-fix met the same
// thing (#a-bulk-map-click-evicted-its-own-backups) and opened one scope around the whole click, which copies each file it
// overwrites into a folder outside the mod and outside the pool. Generate land never adopted it — the fix next door, one caller
// missing. The milestone adds provinces.bmp, regions, adjacencies and rivers.bmp writes to this same click.
//
// And the page: load() asked for /api/map/provinces-bmp at the SAME URL after every write, and Chromium served the old image
// 1.5 s after a rewrite despite `no-store` (critic P7, measured in the Browser pane). The model answer now carries the bitmap's
// version and the page puts it on the URL, so a rewritten bitmap is a new URL and an unchanged one is the same URL.
//
// Pinned on a world of rectangles with more sea provinces in regions than the backup pool holds, one province per state, so the
// click overflows the pool on its own — the in-test control proves it did. Everything expected is derived from the fixture:
// the files a click changed are the files whose bytes changed.
//
// Review of 34e64e4: a click that THREW part-way said "Nothing was changed." over a half-written mod and never named the folder
// (3b, 4b); nothing pinned one folder per click (2b); a pool name over 255 characters cost the file its scope copy too, with
// nothing counted as failed (7); and the line offered the folder as the way back without saying the click also CREATED files
// it does not cover (1, 5).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gl-copies-"));
// BEFORE safe-write.js loads: the backup pool, the stores under ~/.nova and the mods root are this test's own.
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
const GAME = path.join(ROOT, "game");          // an empty game: nothing below the mod, so every file the click rewrites is the mod's
process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, GAME, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "not really an exe");   // what resolveHoi4GameRoot looks for

const safeWrite = require("./safe-write.js");
const { MAX_BACKUP_FILES, BACKUP_DIR } = safeWrite;
const md = require("./map-data.js");
const L2 = require("./testlib-two-layer-map.js");   // tree(): every file → sha1; startServer(): the app on a port of its own
const P = require("./testlib-map-page.js");         // runs the page's own functions, lifted out of public/map.js
const { maskJsComments } = require("./testlib-strip-comments.js");
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const colour = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];
const CELL = 8;

/**
 * An ocean of `cols` × `rows` square sea provinces, CELL px each, every row of them one strategic region — so every one may
 * become land. The mod owns the files the click rewrites (definition.csv, buildings.txt, the supply files, the heightmap) and
 * one it has no reason to touch (adjacencies.csv). `extra`: more files, rel → body.
 */
function makeMod(name, cols, rows, extra = {}) {
  const mod = path.join(process.env.HOI4_MODS_ROOT, name);
  const W = cols * CELL, H = rows * CELL;
  const idAt = (x, y) => 1 + Math.floor(y / CELL) * cols + Math.floor(x / CELL);
  const ids = []; for (let i = 1; i <= cols * rows; i++) ids.push(i);
  write(mod, "descriptor.mod", `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", L2.bmp24(W, H, (x, y) => colour(idAt(x, y))));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  for (let r = 0; r < rows; r++) {
    write(mod, `map/strategicregions/${r + 1}-R${r + 1}.txt`, `strategic_region = {\n\tid = ${r + 1}\n\tname = "R${r + 1}"\n\tprovinces = { ${ids.slice(r * cols, (r + 1) * cols).join(" ")} }\n\tweather = {}\n}\n`);
  }
  write(mod, "map/buildings.txt", "# the modder's own buildings.txt\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  write(mod, "map/heightmap.bmp", bmp8(W, H, () => 89));
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  for (const [rel, body] of Object.entries(extra)) write(mod, rel, body);
  return { mod, W, H, seas: ids.length };
}

/** Every file under `d`, relative with forward slashes → its bytes. */
const bytesUnder = (d) => {
  const out = new Map();
  // (#a-file-listed-is-not-a-file-still-there — as testlib-two-layer-map.js tree() does: a name that dies between the listing and the read,
  // the on-access scanner's "<NAME>.TXT.tmp", is no file of the folder; any other failure to read still throws)
  const walk = (x) => { if (!fs.existsSync(x)) return; for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else { let b; try { b = fs.readFileSync(p); } catch (err) { if (err && err.code === "ENOENT") continue; throw err; } out.set(path.relative(d, p).replace(/\\/g, "/"), b); } } };
  walk(d);
  return out;
};
/** The pre-existing files a click changed: present before, and gone or different after. Derived from the bytes. */
const changedFiles = (before, after) => [...before.keys()].filter((k) => !after.has(k) || !after.get(k).equals(before.get(k))).sort();
/** The files a click created: absent before, present after. */
const createdFiles = (before, after) => [...after.keys()].filter((k) => !before.has(k)).sort();
/** Is any scope still open? endBackupScope answers null when none is — and closes one that leaked, so a later check is clean. */
const scopeLeftOpen = () => safeWrite.endBackupScope() !== null;
/** The folder a click on `mod` files its copies under (one sub-folder per click), as map-data.js works it out. */
const storeOf = (mod) => (typeof md.generateLandSnapshotDir === "function" ? md.generateLandSnapshotDir(mod) : path.join(process.env.NOVA_HOME_DIR, "<no generateLandSnapshotDir>"));
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };

(async () => {
  let srv = null;
  try {
    console.log("\n1. ⭐ One click that overflows the backup pool keeps a pre-click copy of every file it changed");
    {
      const N = MAX_BACKUP_FILES + 20;     // states, one per province: more buildings.txt rewrites than the pool holds
      const cols = 16, rows = Math.ceil((N + 2 * cols) / cols);
      const { mod } = makeMod("copies", cols, rows);
      const before = bytesUnder(mod);
      const r = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: N, provincesPerState: 1, seed: 1 });
      const after = bytesUnder(mod);
      const changed = changedFiles(before, after);
      // #generate-land-fills-the-seas-it-cuts-off — the grid's new land can close a pocket of sea, and Generate land raises that
      // with it (one more state per province here), and it leaves a pick sea to keep a pocket open to the ocean
      // (#generate-land-leaves-no-sea-cut-off): the states it made are the N asked for, less those left sea, plus the seas filled.
      const filled = (r.inlandSeas && Number(r.inlandSeas.filled)) || 0, leftSea = (r.inlandSeas && (r.inlandSeas.leftSea || []).length) || 0;
      const made = N - leftSea + filled;
      rec(`THE CONTROL: the click made ${made} states (${N} asked for, ${leftSea} left sea, ${filled} filled sea), more than the ${MAX_BACKUP_FILES} backups the pool keeps`,
        r.changed === true && r.createdStates === made && made > MAX_BACKUP_FILES, { changed: r.changed, createdStates: r.createdStates, leftSea, filled, error: r.error });
      rec("THE CONTROL: it overwrote definition.csv (its first overwrite) and buildings.txt (once per state)",
        changed.includes("map/definition.csv") && changed.includes("map/buildings.txt"), changed);
      // The pool, as safe-write.js keeps it: full, and without the definition.csv the click started from.
      const pool = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];
      const preClickCsv = before.get("map/definition.csv");
      const poolHasIt = pool.some((n) => { try { return fs.readFileSync(path.join(BACKUP_DIR, n)).equals(preClickCsv); } catch (_) { return false; } });
      rec(`THE CONTROL: the pool overflowed — it holds exactly ${MAX_BACKUP_FILES} backups, and none of them is the pre-click definition.csv`,
        pool.length === MAX_BACKUP_FILES && !poolHasIt, { pool: pool.length, poolHasIt });

      const b = r.backups || null;
      rec("⭐ the answer says where the click's copies are: backups = { dir, files, failed }",
        !!(b && typeof b.dir === "string" && b.dir && Number.isInteger(b.files) && b.failed === 0), b);
      const dir = (b && b.dir) || "";
      rec("…in a folder outside the mod (a copy inside it ships with the mod), under ~/.nova/generate_land",
        !!dir && !inside(dir, mod) && inside(dir, storeOf(mod)) && inside(dir, process.env.NOVA_HOME_DIR), dir);
      const copies = dir ? bytesUnder(dir) : new Map();
      const missing = changed.filter((k) => !copies.has(k) || !copies.get(k).equals(before.get(k)));
      rec(`⭐⭐⭐ every one of the ${changed.length} files the click changed has a byte-identical pre-click copy, at its own path in the mod`,
        !!dir && changed.length > 0 && missing.length === 0, { missing, changed });
      const extra = [...copies.keys()].filter((k) => !changed.includes(k));
      rec("⭐⭐ …and nothing else: a file the click did not change gets no copy", !!dir && extra.length === 0, extra);
      rec("⭐ the count it reports is the number of files it changed", !!b && b.files === changed.length, { reported: b && b.files, changed: changed.length });
      // #generate-land-created-what-its-copies-cannot-cover — what the folder does NOT hold: the files the click made from nothing.
      const created = createdFiles(before, after);
      rec(`THE CONTROL: the click also created ${created.length} files, the ${made} state files among them, which have no pre-click bytes to copy`,
        created.filter((k) => k.startsWith("history/states/")).length === made, created);
      rec(`⭐⭐ the answer counts every file a write landed on: the ${changed.length} it changed and the ${created.length} it created`,
        !!b && b.written === changed.length + created.length, { written: b && b.written, derived: changed.length + created.length });
      rec("⭐⭐ …and, of those, the files it created", !!b && b.created === created.length, { created: b && b.created, derived: created.length });
      rec("⭐ the scope is closed when the click returns", !scopeLeftOpen());
    }

    console.log("\n2. ⭐ A click that writes nothing makes no folder, and every way out closes the scope");
    {
      // A refusal before any write: an ocean with no strategic region has nothing that may become land.
      const { mod } = makeMod("refused", 4, 4);
      for (const f of fs.readdirSync(path.join(mod, "map", "strategicregions"))) fs.unlinkSync(path.join(mod, "map", "strategicregions", f));
      const before = bytesUnder(mod);
      const r = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 });
      rec("THE CONTROL: the click was refused and wrote nothing", r.changed === false && !!r.error && changedFiles(before, bytesUnder(mod)).length === 0, r.error);
      rec("⭐ …says it copied nothing", !!(r.backups && r.backups.files === 0 && r.backups.dir === ""), r.backups);
      rec("⭐⭐ …and made no folder for it", !fs.existsSync(storeOf(mod)), storeOf(mod));
      rec("⭐⭐ …and closed its scope", !scopeLeftOpen());

      // No mod at all (the endpoint's modRoot when nothing is active): generateLand's own refusal, as before — there is no mod
      // to file copies under, so the wrapper must not try to work out a folder for one.
      let none = null, noneThrew = "";
      try { none = md.generateLand({ gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 }); }
      catch (e) { noneThrew = String((e && e.message) || e); }
      rec("⭐ no mod selected: the refusal generateLand always gave, not a throw, and no scope left open",
        !noneThrew && !!none && none.changed === false && typeof none.error === "string" && !!none.error && !scopeLeftOpen(), noneThrew || none);

      // The claim refusal (#generate-land-claims-a-world-the-mod-does-not-own), the first way out after the root guards: a mod
      // with no provinces.bmp of its own asking for more ocean than the smallest continent below it. A layer below of its own,
      // passed as this call's gameRoot: one land province on continent 1 and a row of sea provinces the same size.
      const below = path.join(ROOT, "claim-game");
      const seaBelow = 6, cl = makeMod("claimed", 1, 1);
      fs.rmSync(path.join(cl.mod, "map"), { recursive: true, force: true });
      write(below, "map/provinces.bmp", L2.bmp24((seaBelow + 1) * CELL, CELL, (x) => colour(1 + Math.floor(x / CELL))));
      write(below, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};land;false;plains;1`]
        .concat(Array.from({ length: seaBelow }, (_, i) => `${i + 2};${colour(i + 2).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
      const clBefore = bytesUnder(cl.mod);
      const cr = md.generateLand({ modRoot: cl.mod, gameRoot: below, dependencyRoots: [], count: 2, provincesPerState: 1, seed: 1 });
      rec("THE CONTROL: the claim gate refused it (2 sea provinces are twice the smallest continent) and it wrote nothing",
        cr.changed === false && cr.refusedRebuildsInheritedWorld === true && changedFiles(clBefore, bytesUnder(cl.mod)).length === 0, { error: cr.error, claim: cr.claim && cr.claim.over });
      rec("⭐ …says it copied nothing, made no folder, and closed its scope",
        !!(cr.backups && cr.backups.files === 0 && cr.backups.dir === "") && !fs.existsSync(storeOf(cl.mod)) && !scopeLeftOpen(), cr.backups);

      // A throw after the scope is open: definition.csv is a FOLDER, which the read meets after the root guards and the claim.
      const t = makeMod("throws", 4, 4);
      fs.unlinkSync(path.join(t.mod, "map", "definition.csv"));
      fs.mkdirSync(path.join(t.mod, "map", "definition.csv"));
      let threw = "";
      try { md.generateLand({ modRoot: t.mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 }); }
      catch (e) { threw = String((e && e.code) || (e && e.message) || e); }
      rec("THE CONTROL: the click threw (EISDIR) — the throw reaches the caller, it is not swallowed", /EISDIR/.test(threw), threw || "did not throw");
      rec("⭐⭐⭐ …and the scope was closed on the way out", !scopeLeftOpen());

      // Nested inside a scope another click opened (scopes are depth-counted): the copies are THAT click's — they land in its
      // folder, and it is the one that says where. The convention every scoped fixer here keeps.
      const n = makeMod("nested", 4, 4);
      const outerDir = path.join(ROOT, "outer-click");
      const nBefore = bytesUnder(n.mod);
      safeWrite.beginBackupScope({ dir: outerDir, root: n.mod });
      let nr = null, outer = null;
      try { nr = md.generateLand({ modRoot: n.mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 }); }
      finally { outer = safeWrite.endBackupScope(); }
      const nChanged = changedFiles(nBefore, bytesUnder(n.mod));
      const outerCopies = bytesUnder(outerDir);
      rec("THE CONTROL: the nested click changed files", !!(nr && nr.changed) && nChanged.length > 0, { changed: nChanged, error: nr && nr.error });
      rec("⭐ nested, the copies land in the outer click's folder, all of them", !!outer && outer.dir === outerDir && outer.files === nChanged.length
        && nChanged.every((k) => outerCopies.has(k) && outerCopies.get(k).equals(nBefore.get(k))), { outer, copies: [...outerCopies.keys()] });
      rec("⭐⭐ …and the nested click reports no folder of its own, nor makes one", !!nr && nr.backups === undefined && !fs.existsSync(storeOf(n.mod)), nr && nr.backups);
      rec("…and leaves no scope open", !scopeLeftOpen());
    }

    console.log("\n2b. ⭐ Two clicks on one mod keep two folders: the second holds the files as the first click left them");
    {
      // A copy is taken once per folder (the first is the one to hand back), so two clicks sharing a folder would leave the
      // second with no copy at all — the owner clicks again after Delete map. One folder per click is what keeps them apart.
      const tw = makeMod("twice", 6, 4);
      const t0 = bytesUnder(tw.mod);
      const r1 = md.generateLand({ modRoot: tw.mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 });
      const t1 = bytesUnder(tw.mod);
      const r2 = md.generateLand({ modRoot: tw.mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 2 });
      const t2 = bytesUnder(tw.mod);
      const second = changedFiles(t1, t2);
      rec("THE CONTROL: both clicks changed files, and the second rewrote the definition.csv the first had left",
        changedFiles(t0, t1).length > 0 && second.includes("map/definition.csv") && !t1.get("map/definition.csv").equals(t0.get("map/definition.csv")), second);
      const d1 = (r1.backups && r1.backups.dir) || "", d2 = (r2.backups && r2.backups.dir) || "";
      const folders = fs.existsSync(storeOf(tw.mod)) ? fs.readdirSync(storeOf(tw.mod)) : [];
      rec("⭐⭐ two clicks, two folders", !!d1 && !!d2 && d1 !== d2 && folders.length === 2, { d1, d2, folders });
      const c2 = d2 ? bytesUnder(d2) : new Map();
      rec(`⭐⭐⭐ the second folder holds each of the ${second.length} files the second click changed as the FIRST click left it, and counts them`,
        !!d2 && second.every((k) => c2.has(k) && c2.get(k).equals(t1.get(k))) && c2.size === second.length && r2.backups.files === second.length,
        { second, copies: [...c2.keys()], files: r2.backups && r2.backups.files });
    }

    console.log("\n3. ⭐ The endpoint the page posts keeps a copy of the names it writes as well");
    srv = await L2.startServer(createApp);
    {
      // Nova's own English names file, from an earlier world: the click rewrites it after the land is made.
      const NAMES = "localisation/english/replace/nova_state_names_l_english.yml";
      const { mod } = makeMod("endpoint", 6, 4, { [NAMES]: "\uFEFFl_english:\n STATE_900:0 \"Old World Name\"\n" });
      const before = bytesUnder(mod);
      // Exactly the page's body (public/map.js, the Generate land confirm button).
      const res = await srv.post("/api/map/generate-land", { count: 8, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, mod);
      const body = res.body || {};
      const changed = changedFiles(before, bytesUnder(mod));
      rec("THE CONTROL: the click ran and rewrote Nova's names file", res.status === 200 && body.ok === true && changed.includes(NAMES), { status: res.status, error: body.error, changed });
      const dir = (body.backups && body.backups.dir) || "";
      const copies = dir ? bytesUnder(dir) : new Map();
      rec("⭐⭐⭐ the names file's pre-click copy is in the click's own folder", !!dir && copies.has(NAMES) && copies.get(NAMES).equals(before.get(NAMES)), { dir, copies: [...copies.keys()] });
      rec("⭐⭐ …with every other file the click changed, and the count says all of them",
        !!dir && changed.every((k) => copies.has(k) && copies.get(k).equals(before.get(k))) && copies.size === changed.length && body.backups.files === changed.length,
        { changed, copies: [...copies.keys()], files: body.backups && body.backups.files });
      rec("⭐ the scope is closed when the request ends", !scopeLeftOpen());
    }

    console.log("\n3b. ⭐⭐ A click that stops part-way says so, and names the folder of copies — the one moment they matter");
    {
      // A state file the click must create cannot be written (here a FOLDER stands at its path; in the field a full disk, or a lock
      // that outlasts the retry ladder). The throw escapes generateLand after definition.csv and buildings.txt were rewritten and the
      // states before it were created. safeModWrite's own refusal ends "Nothing was changed." — true of that one file, not of the click.
      // Which file the third state gets is learned from the same click on an identical mod, not typed in.
      const BODY = { count: 8, provincesPerState: 1, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true };
      const learn = makeMod("learn", 6, 4);
      const lr = await srv.post("/api/map/generate-land", BODY, learn.mod);
      const stateFiles = fs.readdirSync(path.join(learn.mod, "history", "states")).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      rec(`THE CONTROL: the same click on an identical mod made ${BODY.count} states, one per province`, lr.status === 200 && stateFiles.length === BODY.count, { status: lr.status, stateFiles });
      const blocked = stateFiles[2] || "<none>";
      const stopping = (name) => { const s = makeMod(name, 6, 4); fs.mkdirSync(path.join(s.mod, "history", "states", blocked)); return s; };

      // Called directly: the error carries the copies, and says the click stopped part-way.
      const direct = stopping("stops-direct");
      const dBefore = bytesUnder(direct.mod);
      let derr = null;
      try { md.generateLand({ modRoot: direct.mod, gameRoot: GAME, dependencyRoots: [], count: BODY.count, provincesPerState: 1, seed: 1, ownerMode: "inherit" }); }
      catch (e) { derr = e; }
      const dAfter = bytesUnder(direct.mod);
      const dWritten = changedFiles(dBefore, dAfter).length + createdFiles(dBefore, dAfter).length;
      rec(`THE CONTROL: the click threw at ${blocked}, after writing ${dWritten} files`, !!derr && String(derr.message).indexOf(blocked) !== -1 && dWritten > 0, derr ? derr.message : "did not throw");
      const db = (derr && derr.backups) || null;
      rec("⭐⭐ the error carries where the copies are and what the click wrote before it stopped",
        !!(db && db.dir && fs.existsSync(db.dir)) && db.written === dWritten, db);
      rec("⭐⭐ …and no longer says nothing was changed: it names how many files it had written",
        !!derr && !/Nothing was changed/.test(derr.message) && new RegExp("\\b" + dWritten + " files\\b").test(derr.message), derr && derr.message);
      rec("…and the scope was closed on the way out", !scopeLeftOpen());

      // Through the endpoint, as the page posts it.
      const sm = stopping("stops");
      const before = bytesUnder(sm.mod);
      const res = await srv.post("/api/map/generate-land", BODY, sm.mod);
      const body = res.body || {};
      const after = bytesUnder(sm.mod);
      const changed = changedFiles(before, after), created = createdFiles(before, after);
      rec("THE CONTROL: the endpoint refused the click, after it had changed files and created files",
        res.status === 400 && body.ok === false && changed.includes("map/definition.csv") && created.length > 0, { status: res.status, changed, created });
      const bk = body.backups || null;
      const copies = bk && bk.dir ? bytesUnder(bk.dir) : new Map();
      rec(`⭐⭐⭐ the answer names the folder, and it holds a pre-click copy of each of the ${changed.length} files the click changed`,
        !!(bk && bk.dir) && changed.every((k) => copies.has(k) && copies.get(k).equals(before.get(k))) && bk.files === changed.length,
        { backups: bk, copies: [...copies.keys()], changed });
      // The FOLDER at the state's path holds no bytes and the write onto it failed on its own: not a copy that could not be taken,
      // which the line would name as "1 more file could not be copied". (Asked of whatever the answer carries; that it carries the
      // copies at all is the check above.)
      rec("⭐ …and the folder standing at the state's path is not counted as a copy that failed", !bk || bk.failed === 0, bk);
      rec("⭐⭐ …and counts what the click wrote and created before it stopped",
        !!bk && bk.created === created.length && bk.written === changed.length + created.length, { backups: bk, created: created.length });
      rec("⭐ …and its error does not say nothing was changed", typeof body.error === "string" && !/Nothing was changed/.test(body.error), body.error);
      rec("…and the scope is closed when the request ends", !scopeLeftOpen());
    }

    /** The page's own Generate land click handler, load() and reloadAfterImmediateWrite, lifted out of public/map.js and run against
     *  the real server on `mod` with the confirm dialog's defaults. */
    const openPage = async (mod) => {
      const model0 = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((x) => x.json());
      const provinceType = new Map((model0.provinces || []).map((p) => [p.id, p.type]));
      const requests = [], log = [], srcs = [], els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      el("mapGenConfirmBtn", { disabled: false }); el("mapGenPct", { value: "35" }); el("mapGenSeed", { value: "1" });
      const Base = P.fakeImageClass({ log });
      class Img extends Base { set src(v) { srcs.push(String(v)); super.src = v; } get src() { return super.src; } }
      const page = P.runPage([
        ['if ($("mapGenConfirmBtn")) $("mapGenConfirmBtn").addEventListener("click"', "\n  });"],
        "async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "async function mapCrashGate(", "function openMapErrorsModal(",
        "async function reloadAfterImmediateWrite(",
      ], P.loadGlobals({
        modPath: () => mod, provinceType, closeGenConfirm: () => {}, $: (id) => els[id] || el(id),
        Image: Img,
        fetch: async (url, opts) => {
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      const reloaded = async (n) => { for (let i = 0; i < 600 && log.filter((x) => x === "image-loaded").length < n; i++) await P.settle(10); await P.settle(40); };
      return { page, requests, srcs, els, reloaded };
    };

    console.log("\n4. ⭐⭐ The page: the Generate land line says where the copies are, and the map picture carries its file's version");
    {
      const { mod } = makeMod("page", 6, 4);
      const { page, requests, srcs, els, reloaded } = await openPage(mod);
      const pBefore = bytesUnder(mod);
      els.mapGenConfirmBtn.listeners.click[0]();
      await reloaded(1);
      const pChanged = changedFiles(pBefore, bytesUnder(mod));
      const gen = requests.find((q) => q.url === "/api/map/generate-land");
      const dir = (gen && gen.body && gen.body.backups && gen.body.backups.dir) || "";
      rec("THE CONTROL: the click generated land and the server took a copy of each file it changed",
        !!(gen && gen.body.ok === true && gen.body.backups && dir) && pChanged.length > 0 && gen.body.backups.files === pChanged.length, { backups: gen && gen.body && gen.body.backups, changed: pChanged });
      const last = page.statuses[page.statuses.length - 1] || "";
      rec("⭐⭐⭐ the line left on screen names the folder the copies went to", !!dir && last.indexOf(dir) !== -1, last);
      rec("…and still says what it generated", /Generated \d+ land province/.test(last), last);

      // The picture's URL: the version the model answer gave, and only that.
      const models = requests.filter((q) => q.url === "/api/map/model");
      const ver = (models[models.length - 1] && models[models.length - 1].body.provincesBmpVersion) || "";
      const bmpSrcs = srcs.filter((s) => s.indexOf("/api/map/provinces-bmp?") === 0);
      const vOf = (s) => { const m = /[?&]v=([^&]*)/.exec(s || ""); return m ? decodeURIComponent(m[1]) : null; };
      rec("⭐⭐ the model answer carries the bitmap's version", typeof ver === "string" && ver.length > 0, ver);
      rec("⭐⭐⭐ …and the map picture is asked for with exactly that version", bmpSrcs.length === 1 && vOf(bmpSrcs[0]) === ver, bmpSrcs);

      // The bitmap's time set to a whole second, so a later write can be made to leave it exactly where it was (below).
      const bmpPath = path.join(mod, "map", "provinces.bmp");
      const T = Math.floor(Date.now() / 1000) - 3600;
      fs.utimesSync(bmpPath, T, T);
      const stamp = () => { const s = fs.statSync(bmpPath); return `${s.size}@${s.mtimeMs}`; };
      const stamped = stamp();
      // Reload with nothing written: the same URL — the version is the FILE's, not a clock's, so an unchanged picture can be reused.
      await page.sb.load();
      await reloaded(2);
      await page.sb.load();
      await reloaded(3);
      const again = srcs.filter((s) => s.indexOf("/api/map/provinces-bmp?") === 0);
      rec("⭐ a reload with the bitmap unchanged asks for the same URL", again.length === 3 && again[2] === again[1], again.slice(1));

      // Rewrite the bitmap the way every Nova bitmap write does, the same size — and put its time back, as a write landing in the
      // clock tick of the one before it leaves it (Windows' clock moves every 15.6 ms; #a-same-tick-write-keeps-its-stamp).
      const old = fs.readFileSync(bmpPath);
      const buf = Buffer.from(old);
      const px = buf.readUInt32LE(10);
      buf[px] = (buf[px] + 1) & 255;
      safeWrite.safeModWrite(bmpPath, buf, "map-test-rewrite");
      fs.utimesSync(bmpPath, T, T);
      const now = fs.readFileSync(bmpPath);
      rec("THE CONTROL: the rewrite changed the bitmap's bytes and left its size and time exactly as they were",
        stamp() === stamped && now.equals(buf) && !now.equals(old), { before: stamped, after: stamp() });
      await page.sb.load();
      await reloaded(4);
      const fourth = srcs.filter((s) => s.indexOf("/api/map/provinces-bmp?") === 0);
      // The server's half on its own: the version it answers moved with that write, though the size and the time did not.
      const vers = requests.filter((q) => q.url === "/api/map/model").map((q) => q.body.provincesBmpVersion);
      rec("⭐⭐ the model answer's version moved with the same-size, same-tick rewrite",
        vers.length === fourth.length && !!vers[vers.length - 1] && vers[vers.length - 1] !== vers[vers.length - 2], vers.slice(-2));
      rec("⭐⭐⭐ after a same-size, same-tick rewrite of provinces.bmp the page asks for a NEW URL, so the old picture cannot be served",
        fourth.length === 4 && fourth[3] !== fourth[2] && vOf(fourth[3]) !== null, fourth.slice(2));
    }

    console.log("\n4b. ⭐⭐ The page: a click that stopped part-way names the folder of copies, and shows the map as it now is");
    {
      // The state file the page's own click makes first, learned by clicking on an identical mod; then a FOLDER at that path.
      const learn = makeMod("page-learn", 6, 4);
      const lp = await openPage(learn.mod);
      lp.els.mapGenConfirmBtn.listeners.click[0]();
      await lp.reloaded(1);
      const first = (fs.readdirSync(path.join(learn.mod, "history", "states")).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)))[0] || "<none>";
      const { mod } = makeMod("page-stops", 6, 4);
      fs.mkdirSync(path.join(mod, "history", "states", first));
      const { page, requests, els, reloaded } = await openPage(mod);
      const before = bytesUnder(mod);
      els.mapGenConfirmBtn.listeners.click[0]();
      await reloaded(1);
      const after = bytesUnder(mod);
      const wrote = changedFiles(before, after).length + createdFiles(before, after).length;
      const gi = requests.findIndex((q) => q.url === "/api/map/generate-land");
      const gen = requests[gi];
      rec(`THE CONTROL: the page's click failed at ${first} after it had written ${wrote} file(s)`,
        !!gen && gen.body.ok === false && String(gen.body.error || "").indexOf(first) !== -1 && wrote > 0, { body: gen && gen.body, wrote });
      const dir = (gen && gen.body && gen.body.backups && gen.body.backups.dir) || "";
      const last = page.statuses[page.statuses.length - 1] || "";
      rec("⭐⭐⭐ the line left on screen says the click failed and names the folder the copies went to",
        !!dir && /Generate land failed/.test(last) && last.indexOf(dir) !== -1, last);
      rec("⭐⭐ …and the map was read again after it, since the mod on disk is not the one on screen",
        gi !== -1 && requests.slice(gi + 1).some((q) => q.url === "/api/map/model"), requests.map((q) => q.url));
    }

    console.log("\n5. ⭐ The Generate land note, lifted out of public/map.js and run");
    {
      const MAP_JS = P.MAP, MASKED = P.MASKED;
      const at = MASKED.indexOf("\n  function generatedLandBackupsNote(");
      const end = at < 0 ? -1 : MASKED.indexOf("\n  }", at + 1);
      const src = at < 0 || end < 0 ? "" : MAP_JS.slice(at + 1, end + 4);
      const sb = { window: { NovaMapRuleLabels: require("./public/map-rule-labels.js") } };
      sb.globalThis = sb;
      vm.createContext(sb);
      if (src) vm.runInContext(src, sb);
      const fn = typeof sb.generatedLandBackupsNote === "function" ? sb.generatedLandBackupsNote : null;
      rec("the note helper is in public/map.js and runs", !!fn, src.slice(0, 80) || "not found");
      const note = (res) => { try { return fn ? String(fn(res)) : "<no helper>"; } catch (e) { return "<threw: " + e.message + ">"; } };
      // The sentence is Auto-fix's and Delete map's, from the module both pages load — not typed a third time.
      const shared = require("./public/map-rule-labels.js").backupSnapshotNote({ backupSnapshot: { dir: "C:/x/.nova/generate_land/m/stamp", files: 3, failed: 0 } });
      const said = note({ backups: { dir: "C:/x/.nova/generate_land/m/stamp", files: 3, failed: 0 } });
      rec("⭐⭐ with copies: the shared sentence, naming the folder and the count", !!shared && said === shared && said.indexOf("C:/x/.nova/generate_land/m/stamp") !== -1 && /\b3 files\b/.test(said), { said, shared });
      const partial = note({ backups: { dir: "C:/p", files: 2, failed: 1 } });
      rec("…a copy that could not be taken is named, not counted in", /1 more file could not be copied/.test(partial), partial);
      rec("⭐ nothing to say when nothing was copied",
        !!fn && note({ backups: { dir: "", files: 0, failed: 0 } }) === "" && note({}) === "" && note(undefined) === "", [note({}), note({ backups: { dir: "", files: 0 } })]);
      // #generate-land-created-what-its-copies-cannot-cover — Auto-fix's sentence offers the folder as the way back; this click also
      // CREATES files (1,090 on the owner's flow), and copying the folder back over the mod leaves every one of them in place.
      const made = note({ backups: { dir: "C:/x/.nova/generate_land/m/stamp", files: 3, failed: 0, created: 1090 } });
      rec("⭐⭐ with files created as well: the shared sentence, then a line that says the folder does not cover them, with their count",
        !!shared && made.indexOf(shared) === 0 && made.length > shared.length && /created 1,?090 new files\b/.test(made.slice(shared.length)), made);
      rec("…and no such line when it created nothing",
        note({ backups: { dir: "C:/x/.nova/generate_land/m/stamp", files: 3, failed: 0, created: 0 } }) === shared, note({ backups: { dir: "C:/x/.nova/generate_land/m/stamp", files: 3, failed: 0, created: 0 } }));
    }

    console.log("\n6. ⭐ Every map picture public/map.js loads from an /api/map/ image route carries a version on its URL");
    {
      const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      // The image routes, from the server: a GET under /api/map/ whose handler answers with an image type.
      const routes = [];
      const re = /app\.get\("(\/api\/map\/[A-Za-z0-9-]+)"/g;
      let m;
      while ((m = re.exec(SERVER))) {
        const next = SERVER.indexOf("app.", m.index + 10);
        const body = SERVER.slice(m.index, next < 0 ? m.index + 4000 : next);
        if (/res\.type\("image\/|image\/png|image\/bmp/.test(body)) routes.push(m[1]);
      }
      // THE CONTROL: the derivation sees a bmp route and a png route, the two kinds the page draws.
      rec("the server's image routes were derived", routes.includes("/api/map/provinces-bmp") && routes.includes("/api/map/rivers-png"), routes);
      // EVERY place the page names one of them — an `.src =`, an <img> in markup, a fetch — on the line that builds its URL.
      const PAGE = P.MASKED;
      const loads = [];
      for (const route of routes) {
        for (let i = PAGE.indexOf(route); i !== -1; i = PAGE.indexOf(route, i + 1)) {
          const end = PAGE.indexOf("\n", i);
          loads.push({ route, line: PAGE.slice(PAGE.lastIndexOf("\n", i) + 1, end < 0 ? PAGE.length : end).trim() });
        }
      }
      rec("…and the page loads the map picture from one of them", loads.some((l) => l.route === "/api/map/provinces-bmp"), loads);
      const bare = loads.filter((l) => !/[&?](v|t)=/.test(l.line));
      rec(`⭐⭐⭐ all ${loads.length} of the page's picture URLs carry a version`, loads.length > 0 && bare.length === 0, bare);
    }

    console.log("\n7. ⭐⭐ A backup-pool name too long for the disk does not cost the click its copy");
    {
      // ⛔ #a-long-pool-name-cost-the-scope-copy — the pool's file name spells out the file's whole path; past NTFS's 255 characters
      // for one name the pool copy throws, and the scope copy used to sit behind it in the same try. The scope's own path is the
      // file's path in the mod, under a short folder, so it fits. The mod folder's length is DERIVED: the shortest one for which
      // even a one-letter file under map/ with a one-letter reason gets a pool name over 255 characters.
      const poolNameOf = (abs, reason) => path.basename(safeWrite.buildBackupPath(abs, reason)).length;
      let L = 1;
      while (poolNameOf(path.join(process.env.HOI4_MODS_ROOT, "g".repeat(L), "map", "x"), "x") <= 255) L++;
      const scopeName = path.basename(storeOf(path.join(process.env.HOI4_MODS_ROOT, "g".repeat(L))));
      rec(`THE CONTROL: a mod folder of ${L} characters gives every pool name over 255 characters, and the click's own folder name fits (${scopeName.length})`,
        poolNameOf(path.join(process.env.HOI4_MODS_ROOT, "g".repeat(L), "map", "definition.csv"), "map-generateLand") > 255 && scopeName.length <= 255, L);
      const lm = makeMod("g".repeat(L), 4, 4);
      const pool0 = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).sort().join("|") : "";
      const before = bytesUnder(lm.mod);
      const r = md.generateLand({ modRoot: lm.mod, gameRoot: GAME, dependencyRoots: [], count: 4, provincesPerState: 1, seed: 1 });
      const changed = changedFiles(before, bytesUnder(lm.mod));
      const pool1 = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).sort().join("|") : "";
      rec("THE CONTROL: the click changed files, and not one of them reached the pool", r.changed === true && changed.length > 0 && pool1 === pool0, { changed, error: r.error });
      const b = r.backups || {};
      const copies = b.dir ? bytesUnder(b.dir) : new Map();
      rec(`⭐⭐⭐ each of the ${changed.length} files has its pre-click copy in the click's folder anyway, and the count says so`,
        !!b.dir && changed.every((k) => copies.has(k) && copies.get(k).equals(before.get(k))) && b.files === changed.length && b.failed === 0, { backups: r.backups, copies: [...copies.keys()], changed });

      // The bitmap path's twin, backupAssetBeforeOverwrite: the same pool copy, the same scope copy behind it.
      const pic = path.join(lm.mod, "map", "heightmap.bmp");
      const picBytes = fs.readFileSync(pic);
      const sdir = path.join(ROOT, "asset-scope");
      safeWrite.beginBackupScope({ dir: sdir, root: lm.mod });
      let snap = null;
      try { safeWrite.backupAssetBeforeOverwrite(pic, "map-test-asset"); } finally { snap = safeWrite.endBackupScope(); }
      const acopy = path.join(sdir, "map", "heightmap.bmp");
      rec("⭐⭐ a bitmap backed up under the same long name still gets its scope copy, counted",
        fs.existsSync(acopy) && fs.readFileSync(acopy).equals(picBytes) && !!snap && snap.files === 1 && snap.failed === 0, snap);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== generate land keeps a copy of every file it changes: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
