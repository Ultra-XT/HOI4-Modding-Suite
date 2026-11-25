// ⛔ #two-documents-folders — WHICH FOLDERS ARE MODS IS WRITTEN IN THE LAUNCHER'S .mod FILES, NOT IN mod\'S SUBFOLDERS.
//
// Measured on the owner's machine 2026-09-29. Turning OneDrive's "back up Documents" off copied the whole
// Paradox Interactive\Hearts of Iron IV folder into plain Documents. The launcher reads the plain mod\ folder now, and its 68
// .mod files point (path=) at the folders the game loads: 51 of them back into OneDrive, 14 into the Workshop, 2 into a folder
// outside any mod\. The plain mod\ folder also held 51 byte-identical COPIES the game never loads. For HOI4 a mod exists only
// as a <user folder>\mod\*.mod file and is whatever folder its path= names (absolute as written, relative against the user
// folder); a subfolder with no .mod is never loaded, and one whose own X.mod points elsewhere is a copy.
//
// Nova built its mod list from mod\'s subfolders. So once its mods folder followed the launcher (New mod must write where the
// launcher reads), it would have offered the 51 copies, resolved every add-on's base mod to a copy, refused the live
// OneDrive folders on every allow-list, and saved edits into folders the game never loads — each reported as saved.
//
// Every case runs in a child process with a decoy home, decoy Documents folders and a decoy game folder, so nothing real is
// read for a mod or written. Requests are the ones the pages send (home.js, app.js).
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const CHILD_PORT = 54720;

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const key = (p) => path.resolve(p).toLowerCase();
const same = (a, b) => !!a && !!b && key(a) === key(b);

const decoy = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modlist-"));
const PI = ["Paradox Interactive", "Hearts of Iron IV"];
const plainUser = path.join(decoy, "Documents", ...PI);            // where Windows says Documents is: the launcher's
const mods = path.join(plainUser, "mod");
const oneMods = path.join(decoy, "OneDrive", "Documents", ...PI, "mod");   // the folder the .mod files still point into
const elsewhere = path.join(decoy, "Elsewhere");
const game = path.join(decoy, "game");

const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const modFolder = (dir, name, extra) => {
  put(path.join(dir, "descriptor.mod"), `version="1.0"\nname="${name}"\n${(extra && extra.descriptor) || ""}supported_version="1.*"\n`);
  for (const [rel, text] of Object.entries((extra && extra.files) || {})) put(path.join(dir, rel), text);
};
const fwd = (p) => p.replace(/\\/g, "/");
const lowerDrive = (p) => fwd(p).replace(/^([A-Za-z]):/, (_m, d) => d.toLowerCase() + ":");

// ── The fixture ──────────────────────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(game, { recursive: true });
fs.writeFileSync(path.join(game, "hoi4.exe"), "");                                   // resolveHoi4GameRoot's marker
fs.writeFileSync(path.join(game, "launcher-settings.json"), "﻿" + JSON.stringify({ gameId: "hoi4", gameDataPath: "%USER_DOCUMENTS%/Paradox Interactive/Hearts of Iron IV" }));
fs.mkdirSync(path.join(plainUser, "logs"), { recursive: true });
fs.mkdirSync(path.join(path.dirname(oneMods), "logs"), { recursive: true });

// live_a: the folder the game loads, in OneDrive. Its copy in plain mod\ has drifted (the owner could have edited either).
const live = path.join(oneMods, "live_a");
const copy = path.join(mods, "live_a");
modFolder(live, "Live A", { files: { "common/scripted_effects/a.txt": "live_a_effect = {\n}\n" } });
modFolder(copy, "Live A", { files: { "common/scripted_effects/a.txt": "copy_a_effect = {\n}\n" } });
// The launcher's own shape: BOM, CRLF, replace_path BEFORE path, a lowercase drive letter and forward slashes.
put(path.join(mods, "live_a.mod"), "﻿" + ['version="1.0"', 'replace_path="common/ideas"', 'name="Live A"', `path="${lowerDrive(live)}"`, 'supported_version="1.*"', ""].join("\r\n"));
// …and OneDrive's own old entry beside it, which no launcher reads any more (the owner's OneDrive mod\ still holds 67).
put(path.join(oneMods, "live_a.mod"), `name="Live A"\npath="${fwd(live)}"\n`);

// local_b: registered in place with a RELATIVE path, which the launcher reads against the user folder.
const localB = path.join(mods, "local_b");
modFolder(localB, "Local B");
put(path.join(mods, "local_b.mod"), 'name="Local B"\npath="mod/local_b"\n');

// elsewhere_c: outside any mod\ folder, its .mod on ONE line, after a commented-out path that must not be read.
const elsewhereC = path.join(elsewhere, "elsewhere_c");
modFolder(elsewhereC, "Elsewhere C", { files: { "gfx/flags/ABC.tga": "tga" } });
put(path.join(mods, "elsewhere_c.mod"), `# path="${fwd(path.join(elsewhere, "not_this_one"))}"\nname="Elsewhere C" path="${fwd(elsewhereC)}" supported_version="1.*"\n`);
fs.mkdirSync(path.join(elsewhere, "not_this_one"), { recursive: true });

// missing_d: a .mod whose folder is gone. The launcher marks it failed; there is nothing to list.
const missingD = path.join(elsewhere, "missing_d");
put(path.join(mods, "missing_d.mod"), `name="Missing D"\npath="${fwd(missingD)}"\n`);

// bare_e: a hand-made folder with no .mod yet — never loaded, but a mod to edit, as it always was.
const bareE = path.join(mods, "bare_e");
modFolder(bareE, "Bare E");

// addon_f: an add-on whose base mod is "Live A" — the name BOTH the live folder and its copy carry.
const addonF = path.join(mods, "addon_f");
modFolder(addonF, "Addon F", { descriptor: 'dependencies={\n\t"Live A"\n}\n' });
put(path.join(mods, "addon_f.mod"), 'name="Addon F"\npath="mod/addon_f"\n');

// rel_copy: a copy whose own .mod points, RELATIVELY, at another folder beside it — read against the user folder, that is
// mod\rel_live; read against the mods folder it would be mod\mod\rel_live, which does not exist, and the copy would pass.
const relLive = path.join(mods, "rel_live");
const relCopy = path.join(mods, "rel_copy");
modFolder(relLive, "Rel Live");
modFolder(relCopy, "Rel Live");
put(path.join(mods, "rel_copy.mod"), 'name="Rel Live"\npath="mod/rel_live"\n');

// alias_j: registered through a junction to itself. A second spelling of the same folder is not a copy of it.
const aliasJ = path.join(mods, "alias_j");
const aliasLink = path.join(elsewhere, "j_link");
modFolder(aliasJ, "Alias J");
let junctionMade = false;
try { fs.mkdirSync(elsewhere, { recursive: true }); fs.symlinkSync(aliasJ, aliasLink, "junction"); junctionMade = true; } catch (_) { junctionMade = false; }
if (junctionMade) put(path.join(mods, "alias_j.mod"), `name="Alias J"\npath="${fwd(aliasLink)}"\n`);

// An image in a registered folder outside mod\, and one in a folder nothing registers (GET /api/asset's allow-list).
put(path.join(elsewhereC, "thumbnail.png"), "png");

// .mod files that name something that is not a mod: the top of a drive, the home folder above the mods folder, the game's
// user folder itself. None may be listed, and none may widen what Nova lets a request read.
put(path.join(mods, "bad_root.mod"), `name="Bad Root"\npath="${fwd(path.parse(decoy).root)}"\n`);
put(path.join(mods, "bad_home.mod"), `name="Bad Home"\npath="${fwd(decoy)}"\n`);
put(path.join(mods, "bad_user.mod"), `name="Bad User"\npath="${fwd(plainUser)}"\n`);
// …and one each that only ONE of the filters catches (the three above are all also folders above the mods folder):
// Nova's own folder (never a mod), the mods folder itself, and the OTHER Documents' user folder (loads on top of every mod).
const oneUser = path.dirname(oneMods);
put(path.join(mods, "bad_nova.mod"), `name="Bad Nova"\npath="${fwd(__dirname)}"\n`);
put(path.join(mods, "bad_mods.mod"), `name="Bad Mods"\npath="${fwd(mods)}"\n`);
put(path.join(mods, "bad_oneuser.mod"), `name="Bad OneDrive User"\npath="${fwd(oneUser)}"\n`);
const unregH = path.join(elsewhere, "unreg_h");
modFolder(unregH, "Unregistered H", { files: { "gfx/flags/XYZ.tga": "tga", "thumbnail.png": "png" } });
// …and one each for the rest, again caught by ONE filter apiece: a folder inside Windows' folder, one inside Nova's own app
// data, and the game's own folder.
const fakeWin = path.join(decoy, "Windows");
fs.mkdirSync(path.join(fakeWin, "System32"), { recursive: true });
put(path.join(mods, "bad_win.mod"), `name="Bad Win"\npath="${fwd(path.join(fakeWin, "System32"))}"\n`);
const appData = path.join(decoy, "ad", "NovaModdingSuite");        // safe-write.js: <APPDATA>\NovaModdingSuite
fs.mkdirSync(path.join(appData, "backups"), { recursive: true });
put(path.join(mods, "bad_appdata.mod"), `name="Bad AppData"\npath="${fwd(path.join(appData, "backups"))}"\n`);
put(path.join(mods, "bad_game.mod"), `name="Bad Game"\npath="${fwd(game)}"\n`);
// …and two that name a folder OF mods, not a mod: the other Documents' mods folder (named as a mod, every copy in it passed the
// write gate as "inside a registered mod") and the Workshop's content folder (HOI4_WORKSHOP_ROOT points the child at a decoy).
put(path.join(mods, "bad_onemods.mod"), `name="Bad OneDrive Mods"\npath="${fwd(oneMods)}"\n`);
const wsRoot = path.join(decoy, "steam", "workshop", "content", "394360");
fs.mkdirSync(wsRoot, { recursive: true });
put(path.join(mods, "bad_ws.mod"), `name="Bad Workshop"\npath="${fwd(wsRoot)}"\n`);

// nest_a: a mod kept inside a same-named folder (Windows' "Extract all" double-nests a zip; the launcher names a local mod's
// .mod after its folder's name). The outer folder HOLDS the mod — it is not a copy, and saving into the mod must work.
const nestOuter = path.join(mods, "nest_a");
const nestA = path.join(nestOuter, "nest_a");
modFolder(nestA, "Nest A");
put(path.join(mods, "nest_a.mod"), `name="Nest A"\npath="${fwd(nestA)}"\n`);
// nest_b: two registered mods side by side in one container folder, one of them under the container's name.
const nestBMain = path.join(mods, "nest_b", "main");
const nestBSub = path.join(mods, "nest_b", "sub");
modFolder(nestBMain, "Nest B");
modFolder(nestBSub, "Nest B Sub");
put(path.join(mods, "nest_b.mod"), 'name="Nest B"\npath="mod/nest_b/main"\n');
put(path.join(mods, "nest_b_sub.mod"), 'name="Nest B Sub"\npath="mod/nest_b/sub"\n');
// zip_c: a zipped mod — archive=, no path=. The launcher loads the zip, so the same-named folder is not what the game loads.
const zipCopy = path.join(mods, "zip_c");
const zipFile = path.join(mods, "zip_c.zip");
modFolder(zipCopy, "Zip C");
put(zipFile, "PK");
put(path.join(mods, "zip_c.mod"), 'name="Zip C"\narchive="mod/zip_c.zip"\n');
// zz_backup_live_a: no .mod, and the NAME of a registered mod — a backup the game never loads. It must not stand in for it.
const backupA = path.join(mods, "zz_backup_live_a");
modFolder(backupA, "Live A", { files: { "common/scripted_effects/a.txt": "backup_a_effect = {\n}\n" } });
// In the OTHER Documents' mods folder (OneDrive's): a mod no launcher .mod names — the user's work, still offered as before —
// and a copy there whose launcher .mod names the plain folder (live_a the other way round).
const legacyOnly = path.join(oneMods, "legacy_only");
modFolder(legacyOnly, "Legacy Only", { files: { "gfx/flags/LEG.tga": "tga" } });
const revLive = path.join(mods, "rev_d");
const revCopy = path.join(oneMods, "rev_d");
modFolder(revLive, "Rev D");
modFolder(revCopy, "Rev D");
put(path.join(mods, "rev_d.mod"), `name="Rev D"\npath="${fwd(revLive)}"\n`);
// cont_e: a copy (its .mod names a folder elsewhere) that ALSO holds a registered mod inside it — writing into that one is fine.
const contCopy = path.join(mods, "cont_e");
const contLive = path.join(elsewhere, "cont_e_live");
const contInner = path.join(contCopy, "inner");
modFolder(contLive, "Cont E");
modFolder(contInner, "Cont E Inner");
put(path.join(mods, "cont_e.mod"), `name="Cont E"\npath="${fwd(contLive)}"\n`);
put(path.join(mods, "cont_e_inner.mod"), 'name="Cont E Inner"\npath="mod/cont_e/inner"\n');
// A flag in the copy, for a read route that takes a mod folder (the flag-stem scan).
put(path.join(copy, "gfx", "flags", "CPY.tga"), "tga");
// A junction naming the mods folder: the same folder under a second spelling, which must not walk past the copy gate.
const modsAlias = path.join(elsewhere, "mods_alias");
let modsAliasMade = false;
try { fs.symlinkSync(mods, modsAlias, "junction"); modsAliasMade = true; } catch (_) { modsAliasMade = false; }
// For the writers safeModWrite never sees: a .dds in the live mod (the spirit-picture import copies it in), and a focus file
// in both folders (the focus editor's own save route).
put(path.join(live, "gfx", "probe.dds"), "DDS probe");
for (const d of [copy, live]) put(path.join(d, "common", "national_focus", "probe.txt"), "focus_tree = {\n\tid = probe\n}\n");

// ── What the .mod files say, read here by a parser of this test's own (tokens, not a copy of Nova's regex) ─────────────
const readRegistry = (folder) => fs.readdirSync(folder).filter((f) => /\.mod$/i.test(f)).map((file) => {
  const text = fs.readFileSync(path.join(folder, file), "utf8").replace(/^﻿/, "")
    .split(/\r?\n/).map((l) => l.replace(/#.*$/, "")).join("\n");
  const pairs = [...text.matchAll(/([A-Za-z_]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]);
  const at = (k) => { const v = (pairs.find(([x]) => x === k) || [])[1] || ""; return v ? (path.isAbsolute(v) ? path.resolve(v) : path.resolve(path.dirname(folder), v)) : ""; };
  const dir = at("path");
  return { file, dir, archive: dir ? "" : at("archive") };
});
const registry = readRegistry(mods);
const isUnder = (p, root) => key(p) === key(root) || key(p).startsWith(key(root) + path.sep);
const usable = (d) => !!d && fs.existsSync(d) && fs.statSync(d).isDirectory() && path.parse(d).root.toLowerCase() !== key(d)
  && !isUnder(mods, d) && !isUnder(plainUser, d) && !isUnder(oneUser, d) && !isUnder(__dirname, d)
  && !isUnder(decoy, d) && !isUnder(game, d) && !isUnder(d, fakeWin) && !isUnder(d, appData)
  && !isUnder(oneMods, d) && !isUnder(wsRoot, d);
// One folder under two spellings (a junction) is one folder: compared by its real path.
const real = (p) => { try { return fs.realpathSync.native(p).toLowerCase(); } catch (_) { return key(p); } };
const subfolders = (folder) => fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(folder, e.name));
// A copy: no launcher .mod names it, and the launcher's .mod of its name names a zip that exists, or another usable folder that
// neither is it nor lies inside it.
const isCopy = (d) => {
  if (registry.some((r) => r.dir && same(r.dir, d))) return false;
  const named = (reg) => reg.find((r) => r.file.replace(/\.mod$/i, "").toLowerCase() === path.basename(d).toLowerCase());
  const own = named(registry);
  if (!own) return false;
  if (!own.dir) return !!own.archive && fs.existsSync(own.archive);
  if (same(own.dir, d) || isUnder(own.dir, d)) return false;
  return usable(own.dir) && fs.realpathSync.native(own.dir).toLowerCase() !== fs.realpathSync.native(d).toLowerCase();
};
const copies = [...subfolders(mods), ...subfolders(oneMods)].filter(isCopy);
const expected = new Set([
  ...registry.filter((r) => usable(r.dir)).map((r) => real(r.dir)),
  ...[...subfolders(mods), ...subfolders(oneMods)].filter((d) => !copies.some((c) => same(c, d))).map(real),
]);

// Every file under a folder with its hash: "nothing was written" is a statement about contents, not about a status code.
const snapshot = (root) => {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(root, p)] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } };
  try { walk(root); } catch (_) { /* missing: empty */ }
  return out;
};

// ── The child: a fresh server.js (the mods folder is decided at load) answering the pages' own requests ─────────────────
const tech = (id) => ({
  id, name: "Probe tech", description: "Probe tech description", folder: "infantry_folder", x: 1, y: 1, researchCost: 1.5, startYear: 1936,
  prerequisites: [], dependencies: [], enableEquipments: [], modifiers: "", extraScript: "", isMod: true, fileName: "probe_technologies.txt",
});
const childSrc = path.join(decoy, "probe-modlist.js");
fs.writeFileSync(childSrc, [
  '"use strict";',
  `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))});`,
  `const out = { MODS_ROOT: s.constants.MODS_ROOT, gate: {} };`,
  `for (const p of ${JSON.stringify([copy, live, bareE, localB, addonF, relCopy, aliasJ, nestA, nestBMain, nestBSub, revCopy, zipCopy, contCopy, contInner, ...(modsAliasMade ? [path.join(modsAlias, "live_a")] : [])].map((d) => path.join(d, "common", "ideas", "x.txt")).concat([path.join(mods, "live_a.mod")]))}) {`,
  `  try { s.assertModWritablePath(p); out.gate[p] = ""; } catch (e) { out.gate[p] = String(e && e.message || e); }`,
  `}`,
  `out.liveForAlias = s.liveFolderForCopy(${JSON.stringify(aliasJ)});`,
  `try { out.assetDeps = s.resolveDependencyRootsForAssets(${JSON.stringify(addonF)}); } catch (e) { out.assetDeps = "threw " + e.message; }`,
  `try { const md = require(${JSON.stringify(path.join(__dirname, "map-data.js"))}); out.descriptors = md.descriptorFilesFor(${JSON.stringify(live)}); out.descriptorsLocal = md.descriptorFilesFor(${JSON.stringify(localB)}); } catch (e) { out.descriptors = "threw " + e.message; }`,
  `const base = "http://127.0.0.1:${CHILD_PORT}";`,
  `const post = (ep, o) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));`,
  `const app = s.createApp();`,
  `const fsx = require("fs");`,
  `const saved = () => { try { return JSON.parse(fsx.readFileSync(s.ACTIVE_MOD_STATE_FILE, "utf8")).modPath; } catch (_) { return ""; } };`,
  `s.setActiveRoot(${JSON.stringify(bareE)}); app.locals.persistActiveMod(${JSON.stringify(copy)});`,
  `out.persistCopy = { active: s.getActiveRoot(), saved: saved() };`,
  `s.setActiveRoot(${JSON.stringify(bareE)}); app.locals.persistActiveMod(${JSON.stringify(zipCopy)});`,
  `out.persistZip = { active: s.getActiveRoot(), saved: saved() };`,
  `fsx.writeFileSync(s.ACTIVE_MOD_STATE_FILE, JSON.stringify({ modPath: ${JSON.stringify(copy)} }));`,
  `s.setActiveRoot(${JSON.stringify(bareE)}); s.initActiveRootFromDisk(); out.initCopy = s.getActiveRoot();`,
  `fsx.writeFileSync(s.ACTIVE_MOD_STATE_FILE, JSON.stringify({ modPath: ${JSON.stringify(localB)} }));`,
  `s.setActiveRoot(${JSON.stringify(bareE)}); s.initActiveRootFromDisk(); out.initLocal = s.getActiveRoot();`,
  `const srv = app.listen(${CHILD_PORT}, async () => {`,
  `  try {`,
  `    out.list = await fetch(base + "/api/mods/list").then((r) => r.json());`,
  `    out.effects = await fetch(base + "/api/scripted-effects?modPath=" + encodeURIComponent(${JSON.stringify(addonF)})).then((r) => r.json());`,
  `    out.flagsRegistered = await post("/api/flags/gfx-stems-scan", { dir: ${JSON.stringify(elsewhereC)} });`,
  `    out.flagsUnregistered = await post("/api/flags/gfx-stems-scan", { dir: ${JSON.stringify(unregH)} });`,
  `    out.assetRegistered = (await fetch(base + "/api/asset?path=" + encodeURIComponent(${JSON.stringify(path.join(elsewhereC, "thumbnail.png"))}))).status;`,
  `    out.assetUnregistered = (await fetch(base + "/api/asset?path=" + encodeURIComponent(${JSON.stringify(path.join(unregH, "thumbnail.png"))}))).status;`,
  `    out.saveCopy = await post("/api/technologies/save-batch", { modPath: ${JSON.stringify(copy)}, technologies: [${JSON.stringify(tech("probe_copy_tech"))}], equipments: [] });`,
  `    out.saveLive = await post("/api/technologies/save-batch", { modPath: ${JSON.stringify(live)}, technologies: [${JSON.stringify(tech("probe_live_tech"))}], equipments: [] });`,
  // The focus editor's own save route, as app.js sends it — a manual save and an autosave snapshot. It rate-limits, so wait.
  `    const wait = () => new Promise((r) => setTimeout(r, 250));`,
  `    const focusSave = (file, snapshot) => post("/api/save", { path: file, content: "focus_tree = {\\n\\tid = probe\\n\\tcountry = { factor = 0 }\\n}\\n", baseFingerprint: "", createBackup: !snapshot, backupReason: snapshot ? "autosave" : "manual-save", snapshot });`,
  `    await wait(); out.focusCopy = await focusSave(${JSON.stringify(path.join(copy, "common", "national_focus", "probe.txt"))}, false);`,
  `    await wait(); out.focusCopySnap = await focusSave(${JSON.stringify(path.join(copy, "common", "national_focus", "probe.txt"))}, true);`,
  `    await wait(); out.focusLive = await focusSave(${JSON.stringify(path.join(live, "common", "national_focus", "probe.txt"))}, false);`,
  // A raw writer (copyFileSync) behind the mod-root check ~100 routes make, as app.js sends it.
  `    out.ddsCopy = await post("/api/ideas/import-spirit-dds", { sourcePath: ${JSON.stringify(path.join(live, "gfx", "probe.dds"))}, pictureToken: "probe_dds", modPath: ${JSON.stringify(copy)} });`,
  `    out.ddsLive = await post("/api/ideas/import-spirit-dds", { sourcePath: ${JSON.stringify(path.join(live, "gfx", "probe.dds"))}, pictureToken: "probe_dds", modPath: ${JSON.stringify(live)} });`,
  `    out.flagsLegacy = await post("/api/flags/gfx-stems-scan", { dir: ${JSON.stringify(legacyOnly)} });`,
  `    out.flagsCopy = await post("/api/flags/gfx-stems-scan", { dir: ${JSON.stringify(copy)} });`,
  // The focus editor's Load, as app.js sends it (rate-limited too).
  `    await wait(); out.loadCopy = await post("/api/load", { path: ${JSON.stringify(path.join(copy, "common", "national_focus", "probe.txt"))} });`,
  `    await wait(); out.loadLive = await post("/api/load", { path: ${JSON.stringify(path.join(live, "common", "national_focus", "probe.txt"))} });`,
  // The list is remembered for a moment: a folder made now must still be in the next answer.
  `    const fresh = ${JSON.stringify(path.join(mods, "fresh_z"))};`,
  `    await fetch(base + "/api/mods/list").then((r) => r.json());`,
  `    require("fs").mkdirSync(fresh, { recursive: true }); require("fs").writeFileSync(fresh + "/descriptor.mod", 'name="Fresh Z"\\n');`,
  `    out.listAfterNew = (await fetch(base + "/api/mods/list").then((r) => r.json())).mods.map((m) => m.path);`,
  `    await wait(); out.locCopy = await post("/api/localization/create", { path: "localisation/english/probe_l_english.yml", modPath: ${JSON.stringify(copy)} });`,
  `    await wait(); out.locLive = await post("/api/localization/create", { path: "localisation/english/probe_l_english.yml", modPath: ${JSON.stringify(live)} });`,
  // New mod, as home.js sends it: a name whose folder exists only in the other Documents' mods folder, then a fresh one.
  `    await wait(); out.createClash = await post("/api/mod/create", { modName: "legacy_only", dependencies: [] });`,
  `    out.listAfterClash = (await fetch(base + "/api/mods/list").then((r) => r.json())).mods.map((m) => m.path);`,
  `    await wait(); out.createFresh = await post("/api/mod/create", { modName: "Probe Fresh Mod", dependencies: [] });`,
  `  } catch (e) { out.error = String(e && e.stack || e); }`,
  `  console.log("RESULT " + JSON.stringify(out));`,
  `  srv.close(); setTimeout(() => process.exit(0), 50);`,
  `});`,
].join("\n"));

try {
  // ⛔ #a-fake-windows-folder-killed-the-child — WINDIR is what server.js reads first for Windows' folder (notInside), so faking it
  // is enough. SystemRoot must stay the REAL one: pointed at the decoy, Node's own start-up cannot reach the system's random
  // numbers and aborts ("Assertion failed: ncrypto::CSPRNG(nullptr, 0)" — 24 of 24 children, scratchpad csprng-probe.js). It
  // looked like a flake under load because Windows names are case-insensitive and only the spelling decided it: Git Bash passes
  // SYSTEMROOT, which sorted ahead of the added SystemRoot and won; PowerShell passes SystemRoot, which this overwrote — 50 of 70
  // checks failed on every run from PowerShell. So every spelling of both is replaced, never added beside.
  const sysRoot = Object.keys(process.env).filter((k) => /^systemroot$/i.test(k)).map((k) => process.env[k]).find(Boolean);
  const winless = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(windir|systemroot)$/i.test(k)));
  const env = { ...winless, USERPROFILE: decoy, HOME: decoy, OneDrive: path.join(decoy, "OneDrive"), HOI4_ROOT: game,
    APPDATA: path.join(decoy, "ad"), NOVA_APP_DATA_DIR: path.join(decoy, "ad"), XDG_CONFIG_HOME: path.join(decoy, "ad"),
    NOVA_DOCUMENTS_DIR: path.join(decoy, "Documents"), WINDIR: fakeWin, ...(sysRoot ? { SystemRoot: sysRoot } : {}), HOI4_WORKSHOP_ROOT: wsRoot };
  for (const k of ["HOI4_USER_DIR", "HOI4_MODS_ROOT", "HOI4_MOD_ROOT", "OneDriveConsumer", "OneDriveCommercial"]) delete env[k];
  const copyBefore = snapshot(copy);
  const copyLocBefore = fs.existsSync(path.join(copy, "localisation"));
  const r = spawnSync(process.execPath, [childSrc], { cwd: __dirname, env, encoding: "utf8", timeout: 240000 });
  const line = String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("RESULT ")) || "";
  let o = {};
  try { o = JSON.parse(line.slice(7)); } catch (_) { o = {}; }
  if (!line) console.log(String(r.stdout || "").slice(-2000) + String(r.stderr || "").slice(-2000));
  const listed = ((o.list && o.list.mods) || []).filter((m) => !m.isVanilla).map((m) => m.path).filter((p) => p && isUnder(p, decoy));

  console.log("\n1. ⭐⭐⭐ The mods folder is the one the launcher reads");
  ok(same(o.MODS_ROOT, mods), "⭐⭐⭐ with two Documents folders both holding mod\\, it is the one the launcher's settings name (New mod writes where the launcher looks)", o.MODS_ROOT);

  console.log("\n2. ⭐⭐⭐ The mod list is the launcher's .mod files, not the mods folder's subfolders (GET /api/mods/list, as home.js sends it)");
  ok(listed.some((p) => same(p, live)), "⭐⭐⭐ the folder the game loads is listed, though it is not under the mods folder", listed);
  ok(listed.includes(live), "⭐ …spelled as the folder is (its .mod writes the drive as c:/ — a page matching a remembered path by string found nothing)", listed.filter((p) => same(p, live)));
  ok(!listed.some((p) => same(p, copy)), "⭐⭐⭐ …and the copy beside its .mod is NOT (the game never loads it; it used to be the only one listed)", listed);
  ok(listed.some((p) => same(p, localB)), "⭐ a relative path= is read against the game's user folder, as the launcher reads it", listed);
  ok(listed.some((p) => same(p, elsewhereC)) && !listed.some((p) => same(p, path.join(elsewhere, "not_this_one"))), "⭐ a .mod on one line is read, and a commented-out path= is not", listed);
  ok(listed.some((p) => same(p, bareE)), "⭐ a hand-made folder with no .mod yet is still offered — a mod to edit, as it always was", listed);
  ok(listed.some((p) => same(p, relLive)) && !listed.some((p) => same(p, relCopy)), "⭐⭐ a copy whose .mod points RELATIVELY at another folder is left out too (read against the user folder, as the launcher does)", listed);
  if (junctionMade) ok(listed.filter((p) => real(p) === real(aliasJ)).length === 1, "⭐ a folder registered through a junction to itself is listed once: not taken for a copy of itself, and not twice", listed.filter((p) => real(p) === real(aliasJ)));
  if (junctionMade) ok(o.liveForAlias === "", "⭐ …and liveFolderForCopy says so itself: what the game loads INSTEAD of a folder is never that folder under another spelling", o.liveForAlias);
  const reals = listed.map(real), twice = reals.filter((k, i) => reals.indexOf(k) !== i);
  ok(twice.length === 0, "⭐ no folder is listed twice under two spellings (the .mod's, through a junction, and the mods folder's)", twice);
  ok(!listed.some((p) => same(p, missingD)), "a .mod whose folder is gone lists nothing", listed);
  ok(!listed.some((p) => same(p, decoy) || same(p, plainUser) || same(p, path.parse(decoy).root)), "⭐⭐ a .mod naming the home folder, the game's user folder or the top of a drive is not taken for a mod", listed);
  const allListed = ((o.list && o.list.mods) || []).map((m) => m.path).filter(Boolean);
  ok(!allListed.some((p) => same(p, __dirname)), "⭐⭐ …nor one naming Nova's own folder", allListed.filter((p) => same(p, __dirname)));
  ok(!listed.some((p) => same(p, mods)), "⭐ …nor one naming the mods folder itself", listed.filter((p) => same(p, mods)));
  ok(!listed.some((p) => same(p, oneUser)), "⭐⭐ …nor one naming the OTHER Documents' game folder, which the game would load on top of every mod", listed.filter((p) => same(p, oneUser)));
  ok(!listed.some((p) => same(p, oneMods)), "⭐⭐ …nor one naming the other Documents' mods folder (a folder OF mods; named as one, every copy in it passed the gate)", listed.filter((p) => same(p, oneMods)));
  ok(!listed.some((p) => same(p, wsRoot)), "⭐ …nor one naming the Workshop's content folder", listed.filter((p) => same(p, wsRoot)));
  const got = new Set(listed.map(real));
  const missing = [...expected].filter((k) => !got.has(k)), extra = [...got].filter((k) => !expected.has(k));
  ok(expected.size === 17 && missing.length === 0 && extra.length === 0, `⭐⭐ derived: exactly the ${expected.size} folders this test's own reading of the .mod files expects`, { missing, extra });
  ok(copies.length === 5 && [copy, relCopy, zipCopy, revCopy, contCopy].every((x) => copies.some((c) => same(c, x))), "(the fixture has exactly five copies, by this test's own reading)", copies);
  ok([nestA, nestBMain, nestBSub].every((d) => listed.some((p) => same(p, d))), "⭐⭐ a mod nested in a same-named folder, and two side by side in one folder, are all listed", listed.filter((p) => isUnder(p, nestOuter) || isUnder(p, path.join(mods, "nest_b"))));
  ok(listed.some((p) => same(p, legacyOnly)) && !listed.some((p) => same(p, revCopy)), "⭐⭐ the OTHER Documents' mods folder keeps its mods in the list (it vanished), minus its copies", listed.filter((p) => isUnder(p, oneMods)));
  ok(!listed.some((p) => same(p, zipCopy)), "⭐ a folder beside a zipped mod's .mod (archive=) is not taken for the mod the game loads", listed.filter((p) => same(p, zipCopy)));
  ok(![path.join(fakeWin, "System32"), path.join(appData, "backups"), game].some((d) => listed.some((p) => same(p, d))), "⭐⭐ a .mod naming a folder inside Windows' folder, inside Nova's app data, or the game's own folder is not taken for a mod", listed.filter((p) => isUnder(p, fakeWin) || isUnder(p, appData) || same(p, game)));
  ok(Array.isArray(o.listAfterNew) && o.listAfterNew.some((p) => same(p, path.join(mods, "fresh_z"))), "⭐ a folder made a moment ago is in the next list (the list is remembered, but not past a change)", (o.listAfterNew || []).filter((p) => isUnder(p, mods)).length);

  console.log("\n3. ⭐⭐⭐ A base mod named by an add-on is the folder the game loads, not the copy with the same name");
  const effects = Object.keys((o.effects && o.effects.effects) || {});
  ok(effects.includes("live_a_effect") && !effects.includes("copy_a_effect"), "⭐⭐⭐ GET /api/scripted-effects for the add-on reads its base mod's live folder (it read the copy)", effects);
  ok(!effects.includes("backup_a_effect"), "⭐⭐ …and not a never-loaded backup folder carrying the same name (the resolver kept the LAST of a name)", effects);
  ok(Array.isArray(o.assetDeps) && o.assetDeps.length === 1 && same(o.assetDeps[0], live), "⭐⭐ …and so does the resolver the sprite and map scans use", o.assetDeps);

  console.log("\n4. ⭐⭐ A mod the launcher loads from outside the mods folder is readable; a .mod cannot widen that to anything else");
  ok(o.flagsRegistered && o.flagsRegistered.status === 200 && ((o.flagsRegistered.body || {}).stems || []).includes("ABC"), "⭐⭐ POST /api/flags/gfx-stems-scan on a registered folder outside mod\\ reads it (it was refused as outside the mods folder)", o.flagsRegistered);
  ok(o.flagsUnregistered && o.flagsUnregistered.status === 400, "⭐⭐ …while a folder no .mod names is still refused, though another .mod names the home folder above it", o.flagsUnregistered);
  ok(o.assetRegistered === 200 && o.assetUnregistered === 400, "⭐ GET /api/asset serves a registered folder's image, and still refuses one from a folder nothing names", { registered: o.assetRegistered, unregistered: o.assetUnregistered });
  ok(o.flagsLegacy && o.flagsLegacy.status === 200 && ((o.flagsLegacy.body || {}).stems || []).includes("LEG"), "⭐⭐ a mod in the other Documents' mods folder is still readable (it was refused once the mods folder moved)", o.flagsLegacy);

  console.log("\n5. ⭐⭐⭐ A save cannot land in a copy the game does not load");
  const gate = o.gate || {};
  const gCopy = gate[path.join(copy, "common", "ideas", "x.txt")];
  ok(typeof gCopy === "string" && gCopy.includes(live) && /does not load/.test(gCopy), "⭐⭐⭐ the write gate every save passes refuses the copy, and names the folder the game loads", gCopy);
  const allowed = [path.join(live, "common", "ideas", "x.txt"), path.join(bareE, "common", "ideas", "x.txt"), path.join(localB, "common", "ideas", "x.txt"), path.join(mods, "live_a.mod"), path.join(addonF, "common", "ideas", "x.txt")];
  ok(allowed.every((p) => gate[p] === ""), "⭐⭐ …and allows the live folder, a hand-made one, ones registered in place, and the .mod file itself", allowed.map((p) => [path.relative(decoy, p), gate[p]]));
  const gRel = gate[path.join(relCopy, "common", "ideas", "x.txt")];
  ok(typeof gRel === "string" && gRel.includes(relLive), "⭐⭐ the copy behind a relative .mod is refused as well", gRel);
  if (junctionMade) ok(gate[path.join(aliasJ, "common", "ideas", "x.txt")] === "", "⭐⭐ …but a folder registered through a junction to itself is written normally (a false refusal would block a real mod)", gate[path.join(aliasJ, "common", "ideas", "x.txt")]);
  ok(o.saveCopy && o.saveCopy.status >= 400 && JSON.stringify(o.saveCopy.body || {}).includes("does not load"), "⭐⭐⭐ POST /api/technologies/save-batch into the copy is refused, and says why", o.saveCopy);
  const copyAfter = snapshot(copy);
  ok(JSON.stringify(copyAfter) === JSON.stringify(copyBefore), "⭐⭐⭐ …and not one file in the copy changed", { before: Object.keys(copyBefore).length, after: Object.keys(copyAfter).length });
  const liveTech = Object.entries(snapshot(live)).filter(([rel]) => /technolog/i.test(rel));
  ok(o.saveLive && o.saveLive.status === 200 && liveTech.length > 0, "⭐⭐ …while the same save into the live folder writes", { saveLive: o.saveLive, liveTech: liveTech.map(([p]) => p) });
  const x = (d) => gate[path.join(d, "common", "ideas", "x.txt")];
  ok([nestA, nestBMain, nestBSub].every((d) => x(d) === ""), "⭐⭐⭐ a save into a mod nested in a same-named folder is written, not refused as a copy (every such save was)", [nestA, nestBMain, nestBSub].map((d) => [path.relative(mods, d), x(d)]));
  ok(typeof x(revCopy) === "string" && x(revCopy).includes(revLive), "⭐⭐ a copy in the OTHER Documents' mods folder is refused too, naming the one the launcher loads", x(revCopy));
  ok(typeof x(zipCopy) === "string" && x(zipCopy).includes(zipFile), "⭐ …and a folder beside a zipped mod's .mod, naming the zip", x(zipCopy));
  ok(typeof x(contCopy) === "string" && x(contCopy).includes(contLive) && x(contInner) === "", "⭐⭐ a registered mod kept INSIDE a copy's folder is written normally, while the copy itself is refused", { copy: x(contCopy), inner: x(contInner) });
  ok(o.loadCopy && o.loadCopy.status >= 400 && /does not load/.test(JSON.stringify(o.loadCopy.body || {})) && JSON.stringify(o.loadCopy.body || {}).includes("live_a"),
    "⭐⭐ the focus editor's Load refuses a file in a copy, naming the one the game loads (it opened it, and made the copy the page's mod)", o.loadCopy);
  ok(o.loadLive && o.loadLive.status === 200, "…and loads the live one", o.loadLive && o.loadLive.status);
  ok(o.flagsCopy && o.flagsCopy.status >= 400 && /does not load/.test(JSON.stringify(o.flagsCopy.body || {})), "⭐ a read route that takes a mod folder refuses a copy too, and says why", o.flagsCopy);
  if (modsAliasMade) ok(typeof x(path.join(modsAlias, "live_a")) === "string" && x(path.join(modsAlias, "live_a")).includes(live), "⭐⭐ the mods folder under a second spelling (a junction) does not walk past the gate", x(path.join(modsAlias, "live_a")));
  ok(o.focusCopy && o.focusCopy.status >= 400 && /does not load/.test(JSON.stringify(o.focusCopy.body || {})) && o.focusCopySnap && o.focusCopySnap.status >= 400 && /does not load/.test(JSON.stringify(o.focusCopySnap.body || {})),
    "⭐⭐⭐ the focus editor's own save route refuses the copy — a manual save and an autosave snapshot (it wrote both)", { focusCopy: o.focusCopy, focusCopySnap: o.focusCopySnap });
  ok(!fs.existsSync(path.join(copy, "common", "national_focus", "probe.focus_editor_temp")), "…and left no autosave snapshot in it");
  ok(o.focusLive && o.focusLive.status === 200 && /country = \{ factor = 0 \}/.test(fs.readFileSync(path.join(live, "common", "national_focus", "probe.txt"), "utf8")), "⭐⭐ …while the same save into the live folder writes", o.focusLive);
  ok(o.ddsCopy && o.ddsCopy.status >= 400 && /does not load/.test(JSON.stringify(o.ddsCopy.body || {})) && !fs.existsSync(path.join(copy, "gfx", "interface", "ideas", "probe_dds.dds")), "⭐⭐⭐ a writer that copies a file in without safeModWrite (the spirit-picture import) refuses the copy at its mod-root check", o.ddsCopy);
  ok(o.ddsLive && o.ddsLive.status === 200 && fs.existsSync(path.join(live, "gfx", "interface", "ideas", "probe_dds.dds")), "⭐ …and still imports into the live folder", o.ddsLive);
  ok(!copyLocBefore && o.locCopy && o.locCopy.status >= 400 && /does not load/.test(JSON.stringify(o.locCopy.body || {})) && !fs.existsSync(path.join(copy, "localisation")),
    "⭐ POST /api/localization/create refuses the copy BEFORE making its folder (a refused write left an empty localisation folder behind)", { before: copyLocBefore, locCopy: o.locCopy, after: fs.existsSync(path.join(copy, "localisation")) });
  ok(o.locLive && o.locLive.status === 200 && fs.existsSync(path.join(live, "localisation", "english", "probe_l_english.yml")), "…and still creates the file in the live folder", o.locLive);

  console.log("\n5c. ⭐⭐ The mod Nova remembers across launches is never a copy");
  ok(o.persistCopy && same(o.persistCopy.active, live) && same(o.persistCopy.saved, live),
    "⭐⭐ handed a copy as the last-used mod (main.js mirrors the renderer's), Nova takes the folder the game loads instead, and remembers that", o.persistCopy);
  ok(o.persistZip && same(o.persistZip.active, bareE) && same(o.persistZip.saved, live), "⭐ …and takes nothing for a copy of a zipped mod (there is no folder to open)", o.persistZip);
  ok(same(o.initCopy, live), "⭐⭐ a copy remembered from before is not reopened at launch: the folder the game loads is (pages read the copy as the mod)", o.initCopy);
  ok(same(o.initLocal, localB), "…while a remembered mod that is not a copy reopens as it was", o.initLocal);

  console.log("\n5d. ⭐⭐ New mod does not take a name the other Documents' mods folder holds");
  ok(o.createClash && o.createClash.status >= 400 && JSON.stringify(o.createClash.body || {}).includes("would hide it") && !fs.existsSync(path.join(mods, "legacy_only")) && !fs.existsSync(path.join(mods, "legacy_only.mod")),
    "⭐⭐ New mod refuses a name whose folder is in the other mods folder, and writes nothing (its .mod turned the user's mod there into a 'copy': gone from the list, refused, pointing at the new empty one)", o.createClash);
  ok(Array.isArray(o.listAfterClash) && o.listAfterClash.some((p) => same(p, legacyOnly)), "…and that mod is still in the list", (o.listAfterClash || []).filter((p) => isUnder(p, oneMods)));
  ok(o.createFresh && o.createFresh.status === 200 && fs.existsSync(path.join(mods, "probe_fresh_mod.mod")), "⭐ …while a fresh name is created as before", o.createFresh);

  console.log("\n5b. ⭐⭐ The map editor's replace_path advice names the launcher's entry, not the stale one beside the folder");
  const d = Array.isArray(o.descriptors) ? o.descriptors : [];
  ok(d.length === 2 && same(d[0], path.join(live, "descriptor.mod")) && same(d[1], path.join(mods, "live_a.mod")),
    "⭐⭐ for a mod the launcher loads from OneDrive: its descriptor.mod and the launcher's live_a.mod (it named OneDrive's, which nothing reads)", o.descriptors);
  const dl = Array.isArray(o.descriptorsLocal) ? o.descriptorsLocal : [];
  ok(dl.length === 2 && same(dl[1], path.join(mods, "local_b.mod")), "…and for a mod registered in place, the entry beside it, as before", o.descriptorsLocal);

  console.log("\n6. ⭐⭐ Derived: nothing else in server.js builds a mod list from the mods folder's subfolders");
  {
    const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
    const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const SRC = maskJsComments(RAW), CODE = maskJsLiterals(RAW);   // same length: an index in one is an index in the other
    const at = SRC.indexOf("function modFolderCandidateGroups(");
    const body = at === -1 ? null : jsBodyAt(CODE, at);
    const sites = [...SRC.matchAll(/readdirSync\(\s*MODS_ROOT\b/g)].map((m) => m.index);
    const subfolderScans = sites.filter((i) => /isDirectory\(\)/.test(SRC.slice(i, i + 400)) && !/\.mod\b/.test(SRC.slice(i, i + 200)));
    const outside = subfolderScans.filter((i) => !(body && i > body[0] && i < body[1]));
    const own = body ? SRC.slice(body[0], body[1]) : "";
    ok(!!body && sites.length >= 2 && /for \(const folder of \[MODS_ROOT, \.\.\.others\]\)/.test(own) && /readdirSync\(folder, \{ withFileTypes: true \}\)\) \{\s*if \(!f\.isDirectory\(\)\) continue;/.test(own),
      "(precondition: modFolderCandidateGroups found, reading the subfolders of the mods folder and of the other Documents' ones)", { at, body, sites: sites.length });
    ok(outside.length === 0, "⭐⭐ every read of the mods folder's subfolders is the one inside modFolderCandidateGroups (the list, both dependency resolvers and the newspaper sources used their own)", outside.map((i) => SRC.slice(Math.max(0, SRC.lastIndexOf("\n", i) + 1), i + 80).trim()));
    // Every route that writes a new <slug>.mod into the mods folder (New mod, and New mod from the template) checks the name.
    const creates = [...SRC.matchAll(/path\.join\(MODS_ROOT, `\$\{slug\}\.mod`\)/g)].map((m) => m.index);
    const unchecked = creates.filter((i) => !/modFolderOfThisNameElsewhere\(slug\)/.test(SRC.slice(i, i + 1500)));
    ok(creates.length >= 2 && unchecked.length === 0, "⭐ derived: every route that makes a new mod's .mod checks the other mods folder for the name first", { creates: creates.length, unchecked: unchecked.map((i) => SRC.slice(SRC.lastIndexOf("\n", i) + 1, i + 60).trim()) });
    const MAIN = maskJsComments(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"));
    ok(/const allowedRoots = \[[^\]]*\.\.\.registered[^\]]*\]/.test(MAIN) && /registered = \[\.\.\.constants\.registeredModDirs\(\), \.\.\.constants\.otherModsFolders\(\)\]/.test(MAIN), "⭐ main.js's open-in-Notepad allow-list takes the registered folders and the other Documents' mods folders too");
  }

  console.log("\n6b. ⭐ With the mods folder OUTSIDE the home folder, a .mod naming the home folder still names no mod");
  {
    // Only the home-folder filter can catch this one: home is not above this mods folder, nor a game user folder.
    const home3 = path.join(decoy, "home3"), mods3 = path.join(decoy, "mods3"), real3 = path.join(decoy, "mods3_real");
    fs.mkdirSync(home3, { recursive: true });
    modFolder(real3, "Real Three");
    put(path.join(mods3, "home.mod"), `name="Home"\npath="${fwd(home3)}"\n`);
    put(path.join(mods3, "real.mod"), `name="Real Three"\npath="${fwd(real3)}"\n`);
    const user3 = path.join(home3, "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV");
    fs.mkdirSync(path.join(user3, "logs"), { recursive: true });
    put(path.join(mods3, "user3.mod"), `name="User Three"\npath="${fwd(user3)}"\n`);
    const src3 = path.join(decoy, "probe-home3.js");
    fs.writeFileSync(src3, `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))}); console.log("REG " + JSON.stringify(s.registeredModDirs()));`);
    const env3 = { ...env, USERPROFILE: home3, HOME: home3, OneDrive: path.join(home3, "OneDrive"), HOI4_MODS_ROOT: mods3 };
    const r3 = spawnSync(process.execPath, [src3], { cwd: __dirname, env: env3, encoding: "utf8", timeout: 120000 });
    let reg3 = null;
    try { reg3 = JSON.parse((String(r3.stdout || "").split(/\r?\n/).find((l) => l.startsWith("REG ")) || "").slice(4)); } catch (_) { reg3 = null; }
    ok(Array.isArray(reg3) && reg3.some((d) => same(d, real3)) && !reg3.some((d) => same(d, home3)), "⭐ the home folder is not taken for a mod (while a real one beside it is)", { reg3, err: String(r3.stderr || "").slice(0, 300) });
    ok(Array.isArray(reg3) && !reg3.some((d) => same(d, user3)), "⭐ …nor a game user folder that has no mods folder in it yet (the game loads it on top of every mod)", reg3);
  }

  console.log("\n7. ⭐⭐ run-e2e.js watches EVERY copy of the game's folders, not the first one it finds");
  {
    // run-e2e.js does its work when loaded, so its two functions are lifted out and run in a child with a decoy home that
    // has both Documents folders, each with a user folder and a mod\ folder.
    const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
    const RAW = fs.readFileSync(path.join(__dirname, "run-e2e.js"), "utf8");
    const SRC = maskJsComments(RAW), CODE = maskJsLiterals(RAW);
    const lift = (name) => { const at = SRC.indexOf(`function ${name}(`); const b = at === -1 ? null : jsBodyAt(CODE, at); return b ? RAW.slice(at, b[1] + 1) : ""; };
    const fns = ["registryDocumentsDir", "realGameFolders"].map(lift);
    const home2 = path.join(decoy, "home2");
    const want = [path.join(home2, "OneDrive", "Documents", ...PI), path.join(home2, "Documents", ...PI)];
    for (const u of want) fs.mkdirSync(path.join(u, "mod"), { recursive: true });
    const src = path.join(decoy, "probe-e2e-watch.js");
    fs.writeFileSync(src, ['"use strict";', 'const fs = require("fs"), os = require("os"), path = require("path");', ...fns, 'console.log("WATCH " + JSON.stringify(realGameFolders()));'].join("\n"));
    const env2 = { ...process.env, USERPROFILE: home2, HOME: home2, OneDrive: path.join(home2, "OneDrive") };
    const w = spawnSync(process.execPath, [src], { cwd: decoy, env: env2, encoding: "utf8", timeout: 60000 });
    let watched = [];
    try { watched = JSON.parse((String(w.stdout || "").split(/\r?\n/).find((l) => l.startsWith("WATCH ")) || "WATCH []").slice(6)); } catch (_) { watched = []; }
    const wantAll = [...want, ...want.map((u) => path.join(u, "mod"))];
    ok(fns[1] !== "" && wantAll.every((p) => watched.some((x) => same(x, p))), "⭐⭐ both user folders and both mod\\ folders are watched (it watched OneDrive's mod\\ only)", { watched, stderr: String(w.stderr || "").slice(0, 300) });
  }
} catch (e) {
  ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e));
} finally {
  try { fs.rmSync(decoy, { recursive: true, force: true }); } catch (_) { /* temp */ }
  console.log(`\n=== the mod list is the launcher's: ${pass + fail} checks, ${fail} failed ===`);
  process.exitCode = fail === 0 && pass >= 18 ? 0 : 1;
}
