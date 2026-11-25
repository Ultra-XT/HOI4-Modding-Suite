// ⛔ #a-restored-map-keeps-its-pictures-and-names — RESTORE BASELINE PUTS BACK EVERY FILE A WORLD WROTE, NOT ONLY ITS DIRECTORIES.
//
// THE DEFECT (review of the units-baseline fixes, R4). A baseline held map/, history/states, history/countries and history/units, the
// record of the cut and the descriptors' copies — and not three more files a world writes: the minimap's picture
// (gfx/minimap/minimap.dds, which Delete map, Generate land and Auto-fix repaint), the colour-grading boxes (gfx/posteffect_volumes.txt,
// which Auto-fix takes the stale ones out of) and Nova's region names (localisation/<lang>/replace/nova_region_names_l_<lang>.yml, which
// Redraw regions writes, with a record outside the mod of what it wrote). On the owner's TEST 37, a baseline, a re-roll (seed 2) and a
// Restore left exactly those differing from the baseline's moment — the minimap, the boxes and eleven languages of region names — with
// everything in map/ and history/ matching; on a fresh mod the world's minimap and boxes stayed in a mod that had neither. The game
// loads either way; its minimap and colour grading showed the second world, and its regions wore the second world's names, after a
// confirm that says the restore "DISCARDS every map edit".
//
// THE RULE NOW. A baseline keeps a copy of each of those files the mod has (its `files`) and of the region names' record; a restore
// puts each one it holds back byte for byte, MOVES out of the mod (to Nova's store, never deleted) each one the mod has now and the
// baseline did not, and puts the record back with them — or sets it aside, when there was none. A baseline saved before it kept them
// leaves them as they are, and says so. The page says what came back and where the moved files went.
//
// On testlib-split-world's world, its game given a minimap and colour-grading boxes, through map-data's own steps — Generate land, Auto-fix
// (which repaints the minimap into the mod), Delete map, Generate land on another seed, Auto-fix (which takes a box out, giving the mod
// its own copy of the boxes) — with the region names Redraw regions would write planted between them, as the world run's last step
// writes them. The whole mod is hashed: every file in it after the restore must be the file it was at the baseline's moment. No port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-files-"));
const D = { mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(D)) { D[k] = path.join(ROOT, D[k]); fs.mkdirSync(D[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_MODS_ROOT: D.mods, NOVA_HOME_DIR: D.home, APPDATA: D.app, NOVA_APP_DATA_DIR: D.app, XDG_CONFIG_HOME: D.app,
  HOI4_USER_DIR: D.user, NOVA_DOCUMENTS_DIR: D.docs, HOI4_WORKSHOP_ROOT: D.ws,
});
delete process.env.NOVA_WORLD_JOB;
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const dds = require("./dds-codec.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const tree = (d) => {
  const out = new Map();
  const go = (x) => { for (const e of fs.existsSync(x) ? fs.readdirSync(x, { withFileTypes: true }) : []) { const p = path.join(x, e.name); if (e.isDirectory()) go(p); else out.set(path.relative(d, p).replace(/\\/g, "/"), sha(p)); } };
  go(d);
  return out;
};
const treeDiff = (a, b) => {
  const out = [];
  for (const [k, v] of a) if (!b.has(k)) out.push("gone " + k); else if (b.get(k) !== v) out.push("changed " + k);
  for (const [k] of b) if (!a.has(k)) out.push("new " + k);
  return out;
};
const put = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const has = (root, rel) => fs.existsSync(path.join(root, ...rel.split("/")));
const MINI = "gfx/minimap/minimap.dds", BOXES = "gfx/posteffect_volumes.txt";
const NAMES = (lang) => `localisation/${lang}/replace/nova_region_names_l_${lang}.yml`;

// a 32-bit uncompressed DDS, one level, painted by fn(x, y) → [r, g, b, a]
function makeDds(W, H, fn) {
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4); h.writeUInt32LE(0x1007 | 0x8, 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16); h.writeUInt32LE(W * 4, 20); h.writeUInt32LE(1, 28); h.writeUInt32LE(32, 76);
  h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104);
  h.writeUInt32LE(0x1000, 108);
  const buf = Buffer.alloc(128 + W * H * 4); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf), rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(fn(x, y), (y * W + x) * 4);
  dds.patchDdsLevel(buf, hdr, 0, rgba, new Uint8Array(W * H).fill(1));
  return buf;
}
const box = (name, day, x, z) => [`\tposteffect_volume = {`, `\t\tname = ${name}`, `\t\tposteffect_values_day = ${day}`, `\t\tposteffect_values_night = ${day}_night`,
  `\t\tposition = { ${x}.0 300.0 ${z}.0 }`, `\t\tsize = { 40.0 800.0 40.0 }`, `\t\tfade_distance = 75.0`, `\t}`];
// the world below, its game with a minimap (sea west, land east, as its map is) and three colour-grading boxes; the mod Delete map leaves
function world(name) {
  const S = SW.makeShapes();
  const game = path.join(ROOT, name + "-game");
  SW.makeGame(game, S, { divisions: { AAA: 10, BBB: 10 } });
  SW.write(game, MINI, makeDds(128, 64, (x) => (x < 64 ? [30, 60, 120, 255] : [120, 110, 70, 255])));
  SW.write(game, BOXES, ["posteffect_values = {", "\tname = default", "}", "posteffect_volumes = {",
    ...box("WestSea", "blue_water", 64, 64), ...box("EastLand", "green", 400, 128), ...box("WestSea2", "blue_water", 128, 192), "}", ""].join("\n"));
  const mod = SW.makeMod(path.join(D.mods, name), S, { name });
  return { S, mod, ctx: { modRoot: mod, gameRoot: game, dependencyRoots: [] } };
}
// the region names Redraw regions writes (each language's file under replace/, a BOM, `l_<lang>:`) and its record outside the mod
const writeNames = (w, langs, names) => {
  for (const lang of langs) put(w.mod, NAMES(lang), "﻿" + `l_${lang}:\n` + Object.entries(names).map(([k, v]) => ` ${k}:0 "${v}"\n`).join(""));
  const recordPath = md.regionNameRecordPath(w.mod);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify(names, null, 1));
};
const generate = (w, seed) => { md.generateLand(Object.assign({ count: Math.round(w.S.N * 0.35), seed, ownerMode: "inherit", owner: "" }, w.ctx)); md.autoFixMap(w.ctx); };

// the page's words, lifted out of public/map.js by their declarations and brace-counted bodies and run on what the server answers
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
const MAPJS_RAW = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MAPJS = maskJsComments(MAPJS_RAW);
const liftPure = (name) => {
  const at = MAPJS.indexOf(`function ${name}(`);
  const body = at < 0 ? null : jsBodyAt(maskJsLiterals(MAPJS_RAW), at);
  try { return body ? new Function(`${MAPJS_RAW.slice(at, body[1] + 1)}\nreturn ${name};`)() : null; } catch (_) { return null; }
};
const filesNote = liftPure("baselineFilesNote"), confirmText = liftPure("baselineRestoreConfirmText");

try {
  // ── 1. a baseline of world 1, restored after a re-roll
  {
    const w = world("reroll");
    generate(w, 9);
    rec("control — world 1's Auto-fix repainted the minimap into the mod, which had none", has(w.mod, MINI));
    writeNames(w, ["english", "german"], { NOVA_REGION_1: "World One Sea", NOVA_REGION_2: "World One Coast" });
    const whole0 = tree(w.mod), record0 = fs.readFileSync(md.regionNameRecordPath(w.mod));
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    rec("Save baseline keeps a copy of the minimap and both languages' region names, and says how many", sb.ok && sb.files === 3 && !sb.filesError, { files: sb.files, error: sb.filesError });
    rec("⭐ baseline-info says it holds them", md.getMapBaselineInfo({ modRoot: w.mod }).heldFiles === true);
    md.blankMapToSea(w.ctx);
    generate(w, 4);
    rec("control — the re-roll's Auto-fix gave the mod its own colour-grading boxes, which it did not have at the baseline", has(w.mod, BOXES) && !whole0.has(BOXES));
    writeNames(w, ["english", "german", "french"], { NOVA_REGION_1: "World Two Ocean", NOVA_REGION_3: "World Two Bay" });
    const moved0 = { [BOXES]: sha(path.join(w.mod, BOXES)), [NAMES("french")]: sha(path.join(w.mod, NAMES("french"))) };
    rec("control — the mod differs from the baseline's moment in its pictures and names", treeDiff(whole0, tree(w.mod)).some((d) => /gfx\/posteffect|nova_region_names/.test(d)), treeDiff(whole0, tree(w.mod)).filter((d) => !/^changed (map|history)\//.test(d)).slice(0, 8));
    const r = md.restoreMapBaseline(w.ctx);
    rec("Restore baseline answers ok", r.ok, r.error);
    const after = tree(w.mod), diff = treeDiff(whole0, after);
    rec("⭐⭐⭐ every file in the mod is byte for byte the file it was at the baseline's moment — map/ and history/, the minimap, the boxes and the names", diff.length === 0, diff.slice(0, 12));
    rec("⭐⭐ the region names' record is back as it was then", fs.readFileSync(md.regionNameRecordPath(w.mod)).equals(record0), fs.readFileSync(md.regionNameRecordPath(w.mod), "utf8").slice(0, 200));
    const f = r.files || {};
    rec("⭐⭐ the answer names the names files it put back", ["english", "german"].every((l) => (f.restored || []).includes(NAMES(l))) && f.regionNames === "restored", f);
    rec("⭐⭐ …and the files the baseline did not have as MOVED out of the mod, each copy the file as it was",
      (f.movedOut || []).map((m) => m.rel).sort().join() === [BOXES, NAMES("french")].sort().join()
        && (f.movedOut || []).every((m) => fs.existsSync(m.to) && sha(m.to) === moved0[m.rel] && !String(m.to).startsWith(w.mod)), f.movedOut);
    rec("THE CONTROL: nothing failed", !(f.failed || []).length && !f.error, f);
    const note = filesNote ? String(filesNote(f)) : "";
    rec("⭐ the page says what came back and where the moved files went", /are back as they were then/.test(note) && /MOVED out of your mod \(not deleted\)/.test(note)
      && (f.movedOut || []).every((m) => note.includes(String(m.to).slice(0, String(m.to).length - m.rel.length - 1))), note);
  }

  // ── 2. a baseline of the mod before any world: the world's pictures and names leave the mod again
  {
    const w = world("fresh");
    const whole0 = tree(w.mod);
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    rec("control — the mod holds none of those files, and its baseline says so", sb.ok && sb.files === 0 && !has(w.mod, MINI) && !has(w.mod, BOXES));
    generate(w, 9);
    md.blankMapToSea(w.ctx);
    generate(w, 4);
    writeNames(w, ["english"], { NOVA_REGION_1: "World Sea" });
    rec("control — the world left the mod a minimap, colour-grading boxes and region names", has(w.mod, MINI) && has(w.mod, BOXES) && has(w.mod, NAMES("english")));
    const r = md.restoreMapBaseline(w.ctx);
    const diff = treeDiff(whole0, tree(w.mod));
    rec("⭐⭐⭐ after the restore the mod is the mod it was: not one of the world's files is left in it", r.ok && diff.length === 0, diff.slice(0, 12));
    rec("⭐⭐ …each of them MOVED, its copy kept outside the mod", ((r.files || {}).movedOut || []).length === 3 && r.files.movedOut.every((m) => fs.existsSync(m.to)), r.files);
    rec("⭐ …and the region names' record set aside, a copy beside where it was", !fs.existsSync(md.regionNameRecordPath(w.mod)) && r.files.regionNames === "setAside"
      && fs.readdirSync(path.dirname(md.regionNameRecordPath(w.mod))).some((n) => /\.before-restore-baseline-.*\.json$/.test(n)), fs.readdirSync(path.dirname(md.regionNameRecordPath(w.mod))));
  }

  // ── 3. a baseline saved before it kept those files: they are left as they are, and said
  {
    const w = world("older");
    generate(w, 9);
    writeNames(w, ["english"], { NOVA_REGION_1: "World One Sea" });
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    const metaPath = path.join(sb.baselinePath, "_baseline.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    delete meta.files; delete meta.regionNames;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    rec("baseline-info says an older baseline does not hold them", md.getMapBaselineInfo({ modRoot: w.mod }).heldFiles === false);
    writeNames(w, ["english"], { NOVA_REGION_1: "World Two Ocean" });
    const before = sha(path.join(w.mod, NAMES("english"))), recordBefore = fs.readFileSync(md.regionNameRecordPath(w.mod));
    const r = md.restoreMapBaseline(w.ctx);
    rec("⭐⭐ an older baseline leaves the minimap and the names as they are, and the record", r.ok && sha(path.join(w.mod, NAMES("english"))) === before && has(w.mod, MINI)
      && fs.readFileSync(md.regionNameRecordPath(w.mod)).equals(recordBefore), r.files);
    rec("⭐⭐ …and says it could not judge them", !!r.files && r.files.notJudged === true && r.files.files.includes(MINI) && r.files.files.includes(NAMES("english")), r.files);
    rec("⭐ …and the page says they stay as they are", filesNote && /older than Nova keeping the minimap/.test(String(filesNote(r.files))), filesNote && filesNote(r.files));
  }

  // ── 4. the confirm names them among what it discards, for a baseline that holds them
  {
    rec("the confirm and the note are lifted out of public/map.js", typeof confirmText === "function" && typeof filesNote === "function");
    const holds = confirmText ? String(confirmText({ exists: true, heldUnits: true, heldDescriptors: true, heldFiles: true })) : "";
    const older = confirmText ? String(confirmText({ exists: true, heldUnits: true, heldDescriptors: true })) : "";
    // ⚠️ MOVED WITH B6-26 (#a-restore-says-what-it-leaves): the confirm lists what it puts back, then discards the edits made to them since
    const putsBack = (s) => { const m = /It puts back, as they were when the baseline was saved, ([^.]*)\./.exec(s); return m ? m[1] : ""; };
    rec("⭐ a baseline that holds them: the minimap, the boxes and the regions' names are among what the restore puts back (and so discards the edits to)",
      /the names Nova gave the regions/.test(putsBack(holds)) && /the minimap and the map's colour-grading boxes/.test(putsBack(holds)) && /This DISCARDS every map edit made to them since/.test(holds), holds);
    rec("⭐ one that does not: they stay as they are, and the confirm says so", !/the minimap and the map's colour-grading boxes/.test(putsBack(older)) && !/the names Nova gave the regions/.test(putsBack(older))
      && /The minimap, the map's colour-grading boxes and the names Nova gave your regions are not in this baseline, so they stay as they are now/.test(older), older);
    const handler = (() => { const at = MAPJS.indexOf('fetch("/api/map/restore-baseline"'); return at < 0 ? "" : MAPJS.slice(at, MAPJS.indexOf("} catch (e)", at)); })();
    rec("⭐ the Restore handler puts baselineFilesNote(r.files) on the line load() leaves", /const filesNote = baselineFilesNote\(r\.files\);/.test(handler) && /const restoredLine = [^;]*\bfilesNote\b/.test(handler), handler.length);
  }
} catch (e) {
  rec("the flow runs", false, e && e.stack);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a restored baseline puts back the files a world wrote: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
