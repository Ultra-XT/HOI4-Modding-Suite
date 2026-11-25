// ⛔ #a-failed-redraw-puts-back-bytes — A REDRAW THAT STOPS HALFWAY LEAVES THE MOD AS IT FOUND IT.
//
// Redraw strategic regions writes many files. When one write fails — a region file held read-only, as Steam Workshop content
// and OneDrive locks often are — everything the click already wrote must go back. The adversarial review of 60ed681 found the
// failure path had never been run by any test (removing the restore passed all four), and when run it:
//   · restored by decoding and re-encoding, so a definition.csv byte that is not UTF-8 came back as U+FFFD;
//   · left behind a map/unitstacks.txt it had CREATED, with sea-only rows on two provinces that were lakes again;
//   · answered "Nothing was changed" (safeModWrite's sentence about the ONE file) after twenty files had been written.
// Here: one mod region file is read-only, so the click fails partway. Afterwards every file the mod had is byte-identical,
// every file the click created holds what loaded in its place before (the layer below's bytes), the map reads back exactly
// as it did, and the message says what it put back.
// Back-out control (by hand, 2026-09-24): with the restore loop skipped, definition.csv keeps the lakes as sea and the
// "byte-identical" checks fail.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };

const W = makeRegionWorld("fails");
process.env.APPDATA = path.join(W.ROOT, "appdata");
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");
const roots = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };

// a definition.csv byte that is not UTF-8 (cp1252 "ö"), which a decode/re-encode would turn into EF BF BD
const defPath = path.join(W.MOD, "map", "definition.csv");
fs.writeFileSync(defPath, Buffer.concat([fs.readFileSync(defPath), Buffer.from([0x23, 0x20, 0x53, 0xf6, 0x64, 0x65, 0x72, 0x0a])]));
// the mod's own copy of region 5's file, held read-only — the late write that fails
const locked = path.join(W.MOD, "map", "strategicregions", "5-East Sea.txt");
fs.mkdirSync(path.dirname(locked), { recursive: true });
fs.copyFileSync(path.join(W.GAME, "map", "strategicregions", "5-East Sea.txt"), locked);
fs.chmodSync(locked, 0o444);

const bytesOf = (dir) => { const out = new Map(); const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.set(r, fs.readFileSync(path.join(d, e.name))); } }; walk(dir, ""); return out; };
const before = bytesOf(W.MOD);
const m0 = md.buildMapModel(roots);
const p2r0 = JSON.stringify(m0.provinceToRegion), types0 = JSON.stringify(m0.provinces.map((p) => [p.id, p.type]));
// the three lists, not the answer's `source`: a created file that holds the base game's bytes again is still a file the mod
// now has (Nova never deletes one), so where the rows are read from moves while what they say does not
const usLists = (u) => JSON.stringify([u.seaTypeOnLand, u.landTypeOnSea, u.seaMissingFloor]);
const us0 = usLists(md.findUnitStackMismatches({ ...roots }));

let r;
try { r = md.rebuildStrategicRegions({ ...roots, opts }); } finally { try { fs.chmodSync(locked, 0o644); } catch (_) {} }
ok(r && r.ok === false, `the click fails on the read-only file: ${JSON.stringify(r).slice(0, 300)}`);
ok(/5-East Sea\.txt/.test(r.error) && !/Nothing was changed/.test(r.error), `⭐ the message names the file and does not say "Nothing was changed": ${r.error}`);
ok(/put back the \d+ files? it had changed/.test(r.error) && r.restored > 0, `⭐ …it says what it put back (${r.restored} restored, ${r.reset} reset)`);
ok((r.unrestored || []).length === 0, `nothing is left unrestored (${r.unrestored})`);

const after = bytesOf(W.MOD);
const changed = [...before].filter(([k, v]) => !after.has(k) || Buffer.compare(v, after.get(k)) !== 0).map(([k]) => k);
ok(changed.length === 0, `⭐⭐⭐ every file the mod had is byte-identical afterwards (changed: ${changed})`);
ok(Buffer.compare(fs.readFileSync(defPath), before.get("map/definition.csv")) === 0, "⭐⭐ …definition.csv included, its non-UTF-8 byte and all");
// the files the click CREATED hold what loaded in their place before: the layer below's bytes
const created = [...after.keys()].filter((k) => !before.has(k));
ok(created.length > 0, `the click had created files before it failed (${created.length})`);
const notBase = created.filter((k) => { const b = path.join(W.GAME, ...k.split("/")); return fs.existsSync(b) ? Buffer.compare(fs.readFileSync(b), after.get(k)) !== 0 : false; });
ok(notBase.length === 0, `⭐⭐ every created file that shadows the base game holds the base game's bytes again (differ: ${notBase})`);
ok(!created.includes("map/unitstacks.txt") || Buffer.compare(after.get("map/unitstacks.txt"), fs.readFileSync(path.join(W.GAME, "map", "unitstacks.txt"))) === 0,
  "⭐⭐ a map/unitstacks.txt the click created is the base game's again — no sea rows left on provinces that are lakes again");
// the map reads back exactly as it did
const m1 = md.buildMapModel(roots);
ok(JSON.stringify(m1.provinceToRegion) === p2r0, "⭐⭐⭐ every province is in the region it was in before");
ok(JSON.stringify(m1.provinces.map((p) => [p.id, p.type])) === types0, "…and every province has the type it had");
ok(usLists(md.findUnitStackMismatches({ ...roots })) === us0, "…and the unit stacks disagree with the province types exactly as they did before");
// the restore takes no pool backup: the scope holds the originals, and a created file holds only this click's output — a
// failed redraw that reset ~300 created shadows once pushed every older backup out of the 200-file pool (round-two review)
{
  const { BACKUP_DIR } = require("./safe-write.js");
  const restoreBackups = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((f) => /rebuildStrategicRegions-restore/.test(f)) : [];
  ok(restoreBackups.length === 0, `⭐⭐ the restore's writes took no pool backup (${restoreBackups.length} found in ${BACKUP_DIR})`);
}
// with the lock gone, the same click succeeds
const r2 = md.rebuildStrategicRegions({ ...roots, opts });
ok(r2.ok && r2.written > 0, `control: with the file writable again the redraw is written (${JSON.stringify(r2).slice(0, 200)})`);

// ── a lower file that is THERE but cannot be read during the restore is never replaced by an empty stand-in ──
// Round-two review: one momentary read failure of the base game's 3-A North.txt while resetting the shadow of it made the mod's
// copy an EMPTY region 3 — hiding the base's region 3 and leaving its provinces in none — and reported it "set to what loaded
// before". Here the base file is held (EBUSY, every attempt) from the moment the redraw has failed, so the read ladder runs out.
{
  const V = makeRegionWorld("fails-unreadable");
  const vRoots = { modRoot: V.MOD, gameRoot: V.GAME, dependencyRoots: [] };
  const vLocked = path.join(V.MOD, "map", "strategicregions", "5-East Sea.txt");
  fs.mkdirSync(path.dirname(vLocked), { recursive: true });
  fs.copyFileSync(path.join(V.GAME, "map", "strategicregions", "5-East Sea.txt"), vLocked);
  fs.chmodSync(vLocked, 0o444);
  const held = path.resolve(V.GAME, "map", "strategicregions", "3-A North.txt");
  const realRename = fs.renameSync, realRead = fs.readFileSync;
  let failed = false;
  fs.renameSync = function (from, to) { try { return realRename.apply(fs, arguments); } catch (e) { if (path.resolve(String(to)) === path.resolve(vLocked)) failed = true; throw e; } };
  fs.readFileSync = function (p) { if (failed && path.resolve(String(p)) === held) { const e = new Error("EBUSY: resource busy or locked, open '" + held + "'"); e.code = "EBUSY"; throw e; } return realRead.apply(fs, arguments); };
  let rv;
  try { rv = md.rebuildStrategicRegions({ ...vRoots, opts }); }
  finally { fs.renameSync = realRename; fs.readFileSync = realRead; try { fs.chmodSync(vLocked, 0o644); } catch (_) {} }
  ok(failed && rv && rv.ok === false, `the click failed on the read-only file, and the base file was then held (${failed})`);
  const shadow = path.join(V.MOD, "map", "strategicregions", "3-A North.txt");
  const shadowText = fs.existsSync(shadow) ? fs.readFileSync(shadow, "utf8") : "";
  ok(!/provinces\s*=\s*\{\s*\}/.test(shadowText), `⭐⭐⭐ the shadow of the held base file is NOT an empty region 3 (${shadowText.slice(0, 120)})`);
  ok((rv.stillCreated || []).some((x) => x.file === "map/strategicregions/3-A North.txt" && path.resolve(x.from) === held), `⭐⭐ …it is reported as still holding the redrawn regions (${JSON.stringify(rv.stillCreated)})`);
  ok(/still hold/.test(rv.error) && rv.error.includes("3-A North.txt") && !/copies taken before the click/.test(rv.error), `⭐⭐ …and the message names the file to copy over it, not a folder with no copy of it: ${rv.error}`);
}

console.log(`✓ test-a-failed-redraw-puts-back-what-it-changed.js — ${pass} checks`);
