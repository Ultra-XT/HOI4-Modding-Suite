// ⛔ #nova-wrote-into-the-drive-root — NOVA NEVER WRITES INTO THE DRIVE ON ITS OWN.
//
// Found 2026-09-26 during a D: cleanup: `D:\interface\focus_editor_generated.gfx`, dated 2026-07-28, 396 bytes, mapping
// GFX_night_vision2_medium to a texture inside `C:\Users\…\Temp\nova-sweep-equipment-…` — a tech save from a test sweep.
// The save put the .dds into the mod its REQUEST named, then called ensureSpriteTypeMapping, which looked up the server's
// process-global root itself: on a server nobody had told a mod, that is ROOT = path.resolve(__dirname, "..", "..") — the
// drive root. The route had checked one root; the helper wrote to another. The owner: "make sure nova dont ever write into
// D disk on its own like that".
//
// A sweep of every write path (five readers, a skeptic each) found the same shape in more places, all fixed here:
//   1. the guard ~100 write routes call compared `activeRoot === DEV_ROOT` as ONE exact string: `D:/`, `d:\`, a bare `D:`
//      (drive-relative — path.resolve gives the process's current folder, Nova's own) and Nova's own folder walked past it;
//   2. opening a focus tree at `<drive>:\common\national_focus` made the bare drive, i.e. Nova's folder, the active mod;
//   3. with no Documents\…\mod folder the mods folder fell back to path.dirname(ROOT) = the drive root: New mod wrote
//      `D:\<mod>` and `D:\<mod>.mod`, and the mod list offered every folder on D: as a mod;
//   4. three writers joined a file NAME from a request or a snapshot into a mod path, so `..\..\` walked out of the mod;
//   5. and nothing below the routes refused such a write: safeModWrite now does (safe-write.js strayWriteReason).
//
// ⚠️ SAFE TO BACK OUT. Nothing here can reach the real drive root even with a fix removed: the server's global root is
// pointed at a scratch folder (HOI4_MOD_ROOT), the mods-folder probe runs in a child whose home is a decoy and creates a
// mod only when the mods folder is inside that decoy, and the drive-root cases are checked on path STRINGS. The one real
// write the block is asked to refuse targets Nova's own folder under a unique name, and is removed if it was written.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_PORT = 54711;   // a `…PORT = <number>` line, so run-tests.js can read this file's claim
const PORT = Number(process.env.NOVA_TEST_PORT || DEFAULT_PORT);
const CHILD_PORT = 54712;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

const temps = [];
const mk = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); temps.push(d); return d; };
const appdata = mk("nova-nochoose-ad-");
const notAMod = mk("nova-nochoose-global-");   // stands in for the drive root: the server's global root resolves here
const WORKSPACE = mk("nova-nochoose-ws-");
const GAME = mk("nova-nochoose-game-");
const MOD = path.join(WORKSPACE, "probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="probe"\nsupported_version="1.19.*"\n');

process.env.APPDATA = appdata; process.env.NOVA_APP_DATA_DIR = appdata; process.env.XDG_CONFIG_HOME = appdata;
process.env.HOI4_MOD_ROOT = notAMod;
process.env.HOI4_MODS_ROOT = WORKSPACE;
const server = require("./server.js");
const { createApp, isNeverAModFolder, checkActiveRootNotGameRoot, detectModRootFromFocusPath, bareModFileName, getActiveRoot, setActiveRoot, isUnchosenRoot, ensureSpriteTypeMapping } = server;
const safeWrite = require("./safe-write.js");
const mapData = require("./map-data.js");

const NOVA_DIR = path.resolve(__dirname);
const DRIVE = path.parse(NOVA_DIR).root;            // e.g. D:\ — only ever used as a STRING below
const BARE = DRIVE.slice(0, 2);                      // e.g. D:
const lsAll = (d) => { const out = []; const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); out.push(path.relative(d, p)); if (e.isDirectory()) walk(p); } }; try { walk(d); } catch (_) {} return out; };
const throws = (fn) => { try { fn(); return ""; } catch (e) { return String((e && e.message) || e); } };

(async () => {
  let srv = null;
  const strayProbe = path.join(NOVA_DIR, "interface", `nova-stray-probe-${process.pid}.gfx`);
  const strayProbeDirExisted = fs.existsSync(path.dirname(strayProbe));
  try {
    console.log("\n1. ⭐⭐⭐ Every spelling of a folder that is never a mod is refused — the old guard caught one");
    {
      // …and the top of the drive the temp folder is on: when that is another drive, it holds nothing of Nova's, so only the
      // drive-root rule refuses it.
      const spellings = [DRIVE, DRIVE.toLowerCase(), DRIVE.replace(/\\/g, "/"), BARE, NOVA_DIR, path.dirname(NOVA_DIR), path.join(NOVA_DIR, "..", ".."), path.parse(os.tmpdir()).root];
      for (const s of spellings) {
        ok(isNeverAModFolder(s) === true, `never a mod: ${JSON.stringify(s)}`);
        ok(/not a mod|Must select/.test(throws(() => checkActiveRootNotGameRoot(s))), `…and the write guard refuses it: ${JSON.stringify(s)}`, throws(() => checkActiveRootNotGameRoot(s)));
      }
      ok(isNeverAModFolder(MOD) === false && throws(() => checkActiveRootNotGameRoot(MOD)) === "", "a real mod passes both", throws(() => checkActiveRootNotGameRoot(MOD)));
      // A bare drive resolves to the process's current folder ON THAT DRIVE. Here that folder is Nova's own, which the
      // folder rule already catches; from anywhere else only the bare-drive rule does. So ask from somewhere else.
      const elsewhere = mk("nova-nochoose-cwd-");
      const bareElsewhere = path.parse(elsewhere).root.slice(0, 2);
      const probe = path.join(elsewhere, "bare.js");
      fs.writeFileSync(probe, `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))}); console.log("BARE " + JSON.stringify({ cwd: process.cwd(), resolved: require("path").resolve(${JSON.stringify(bareElsewhere)}), never: s.isNeverAModFolder(${JSON.stringify(bareElsewhere)}), detected: s.detectModRootFromFocusPath(${JSON.stringify(path.join(path.parse(elsewhere).root, "common", "national_focus", "x.txt"))}) }));`);
      const bc = spawnSync(process.execPath, [probe], { cwd: elsewhere, env: { ...process.env }, encoding: "utf8", timeout: 120000 });
      let bo = {}; try { bo = JSON.parse((String(bc.stdout || "").split(/\r?\n/).find((l) => l.startsWith("BARE ")) || "BARE {}").slice(5)); } catch (_) {}
      ok(bo.never === true && path.resolve(String(bo.resolved || "")).toLowerCase() === path.resolve(elsewhere).toLowerCase(),
        `⭐⭐ a bare drive (${bareElsewhere}) is refused from a folder that is not Nova's — it means "wherever this process stands on ${bareElsewhere}"`, bo);
      // The focus-tree detector takes the text before `\common\` as the mod — for a tree at the top of a drive, the bare
      // drive. From Nova's folder the folder rule hides it (section 2); from anywhere else only its own bare-drive rule does.
      ok(bc.status === 0 && bo.detected === null, `⭐⭐ …and a focus tree at the top of ${bareElsewhere} names no mod from there either (it named the folder this process stood in)`, bo);
      ok(isUnchosenRoot(DRIVE.toLowerCase()) === true && isUnchosenRoot(NOVA_DIR) === true && isUnchosenRoot(MOD) === false,
        "the \"is this a root nobody chose\" check the read-only routes ask says yes to every spelling of the drive and to Nova's folder");
      ok(isNeverAModFolder(notAMod) === false, "an explicitly configured HOI4_MOD_ROOT is not refused by this check (isUnchosenRoot keeps refusing it where asked)");
      ok(path.resolve(getActiveRoot()) === path.resolve(notAMod), "PRECONDITION: the server's global root is the scratch stand-in, so nothing below can reach the drive", getActiveRoot());
    }

    console.log("\n2. ⭐⭐ A focus tree at the top of a drive does not make Nova's own folder the active mod");
    {
      const atDriveTop = path.join(DRIVE, "common", "national_focus", "x.txt");
      ok(detectModRootFromFocusPath(atDriveTop) === null, "the detector names no mod for it (it named the bare drive, which resolves to Nova's folder)", detectModRootFromFocusPath(atDriveTop));
      ok(path.resolve(String(detectModRootFromFocusPath(path.join(MOD, "common", "national_focus", "x.txt")))) === path.resolve(MOD), "…and still names a real mod");
      const APPJS = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const fnSrc = (APPJS.match(/function inferModRootFromFocusPath\(focusFilePath\) \{[\s\S]*?\n\}/) || [""])[0];
      // It asks isLoadedFocusUnderVanillaGameInstall first (a base-game tree names no mod, #vanilla-tree-made-the-active-mod).
      const vanillaSrc = (APPJS.match(/function isLoadedFocusUnderVanillaGameInstall\(focusFilePath\) \{[\s\S]*?\n\}/) || [""])[0];
      // eslint-disable-next-line no-new-func
      const infer = fnSrc && vanillaSrc ? new Function(`let hoi4GameRootPath = "";\n${vanillaSrc}\n${fnSrc}; return inferModRootFromFocusPath;`)() : null;
      ok(!!infer && infer(atDriveTop) === "" && infer(path.join(MOD, "common", "national_focus", "x.txt")) === MOD, "…and the page's twin agrees", infer ? infer(atDriveTop) : "no function");
    }

    srv = createApp().listen(PORT);
    await new Promise((r) => srv.once("listening", r));
    const post = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) })
      .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

    console.log("\n3. ⭐⭐⭐ THE BUG: a tech save with an icon registers its sprite in the mod it names, not in the global root");
    {
      fs.mkdirSync(path.join(MOD, "gfx", "interface", "technologies"), { recursive: true });
      fs.writeFileSync(path.join(MOD, "gfx", "interface", "technologies", "nova_probe_tech.dds"), Buffer.from("DDS probe"));
      const tech = {
        id: "nova_probe_tech", name: "Probe tech", description: "Probe tech description", folder: "infantry_folder", x: 1, y: 1,
        researchCost: 1.5, startYear: 1936, prerequisites: [], dependencies: [], enableEquipments: [],
        modifiers: "", extraScript: "", isMod: true, iconKey: "GFX_nova_probe_tech_medium", fileName: "custom_technologies.txt",
      };
      const r = await post("/api/technologies/save-batch", { modPath: MOD, technologies: [tech], equipments: [] });
      ok(r.s === 200, "save-batch answers ok", r.b);
      const gfx = (() => { try { return fs.readFileSync(path.join(MOD, "interface", "focus_editor_generated.gfx"), "utf8"); } catch (_) { return ""; } })();
      ok(/name = "GFX_nova_probe_tech_medium"/.test(gfx) && /texturefile = "gfx\/interface\/technologies\/nova_probe_tech\.dds"/.test(gfx), "⭐⭐⭐ the sprite is in the mod, pointing at its own picture", gfx.slice(0, 300));
      ok(lsAll(notAMod).length === 0, "⭐⭐⭐ …and NOTHING was written into the global root (it wrote interface\\focus_editor_generated.gfx there)", lsAll(notAMod));
      // The sprite's texturefile is written relative to the mod, so a picture outside it would be registered under a path
      // like "../../x.dds" that HOI4 cannot load. The helper refuses instead of writing that.
      const outside = path.join(WORKSPACE, "outside_the_mod.dds");
      fs.writeFileSync(outside, Buffer.from("DDS outside"));
      const gfxBefore = fs.readFileSync(path.join(MOD, "interface", "focus_editor_generated.gfx"), "utf8");
      const why = throws(() => ensureSpriteTypeMapping(MOD, "GFX_outside_the_mod", outside));
      ok(/is not inside the mod/.test(why) && fs.readFileSync(path.join(MOD, "interface", "focus_editor_generated.gfx"), "utf8") === gfxBefore,
        "⭐ the sprite helper refuses a picture that is not inside the mod it names, and registers nothing", why);
    }

    console.log("\n4. ⭐⭐ The focus editor's icon import lands in the mod the page names, sprite and picture together");
    {
      const src = path.join(appdata, "probe_icon.dds");
      fs.writeFileSync(src, Buffer.from("DDS probe icon"));
      const r = await post("/api/gfx/import-dds", { sourcePath: src, focusId: "nova_probe_focus", modPath: MOD });
      ok(r.s === 200 && r.b.ok === true, "import-dds answers ok", r.b);
      ok(fs.existsSync(path.join(MOD, "gfx", "interface", "goals", "nova_probe_focus.dds")), "the picture is in the mod");
      const gfx = (() => { try { return fs.readFileSync(path.join(MOD, "interface", "focus_editor_generated.gfx"), "utf8"); } catch (_) { return ""; } })();
      ok(/GFX_nova_probe_focus"/.test(gfx), "…and so is its sprite", gfx.slice(0, 300));
      ok(lsAll(notAMod).length === 0, "…and the global root is still empty", lsAll(notAMod));
      const APPJS = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      ok(/fetch\("\/api\/gfx\/import-dds"[\s\S]{0,200}modPath: \(localStorage\.getItem\("activeModPath"\) \|\| ""\)\.trim\(\) \|\| String\(editorActiveRootPath \|\| ""\)\.trim\(\)/.test(APPJS),
        "…and the page sends the mod it edits, the way the spirit picker next door does");
    }

    console.log("\n5. ⭐⭐ A file NAME from a request or a snapshot never walks out of the mod");
    {
      ok(bareModFileName("custom_technologies.txt") === "custom_technologies.txt" && bareModFileName("!Generic (TAG).txt") === "!Generic (TAG).txt", "a real file name is kept, odd characters and all");
      ok(["..\\x.txt", "../x.txt", "a/b.txt", "a\\b.txt", "..", ".", ""].every((n) => bareModFileName(n) === ""), "a path, a parent step or nothing is refused");
      const escape = path.join(WORKSPACE, "escape_techs.txt");
      const escapeText = "escaped_tech = {\n\tresearch_cost = 1\n}\n";
      fs.writeFileSync(escape, escapeText);
      const b = await post("/api/technologies/save-batch", { modPath: MOD, technologies: [], equipments: [], deletions: [{ techId: "escaped_tech", techFile: "..\\..\\..\\escape_techs.txt", equipId: null, equipFile: null }] });
      ok(fs.readFileSync(escape, "utf8") === escapeText, "⭐⭐ save-batch's deletion did not edit a file outside the mod", { status: b.s, body: b.b });
      const d = await post("/api/technologies/delete", { techId: "escaped_tech", techFile: "..\\..\\..\\escape_techs.txt", modPath: MOD });
      ok(d.s === 400 && fs.readFileSync(escape, "utf8") === escapeText, "⭐⭐ …nor did the old single delete route, which now refuses the name", { status: d.s, body: d.b });
      // The same deletion has an equipment half. Equipment sits one folder deeper, so it takes four steps up to leave the mod.
      const escapeEq = path.join(WORKSPACE, "escape_equipment.txt");
      const escapeEqText = "equipments = {\n\tescaped_equipment = {\n\t\tyear = 1936\n\t}\n}\n";
      fs.writeFileSync(escapeEq, escapeEqText);
      ok(path.resolve(path.join(MOD, "common", "units", "equipment", "..\\..\\..\\..\\escape_equipment.txt")) === path.resolve(escapeEq), "PRECONDITION: the name really reaches the file outside the mod");
      const e = await post("/api/technologies/save-batch", { modPath: MOD, technologies: [], equipments: [], deletions: [{ techId: null, techFile: null, equipId: "escaped_equipment", equipFile: "..\\..\\..\\..\\escape_equipment.txt" }] });
      ok(fs.readFileSync(escapeEq, "utf8") === escapeEqText, "⭐⭐ …and its equipment deletion did not edit one either", { status: e.s, body: e.b });

      // A character save that MOVES a character names the file it came from, and that name went into a path raw: the move's
      // cleanup spliced the character out of whatever file "..\..\..\x.txt" reached. The page sends a name read off disk;
      // the server now keeps only a name, and a path counts as "not moved".
      const escapeCh = path.join(WORKSPACE, "escape_characters.txt");
      const escapeChText = "characters = {\n\tzz_nova_escaped = {\n\t\tname = \"Escaped\"\n\t}\n}\n";
      fs.writeFileSync(escapeCh, escapeChText);
      const chBody = (extra) => Object.assign({
        modPath: MOD, token: "zz_nova_escaped", name: "Escaped", file: "nova_probe_characters.txt",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: "zz_nova_escaped",
        previousToken: "zz_nova_escaped",
      }, extra);
      const ch = await post("/api/characters/save", chBody({ previousFile: "..\\..\\..\\escape_characters.txt" }));
      ok(ch.s === 200 && fs.readFileSync(escapeCh, "utf8") === escapeChText, "⭐⭐ a character save did not splice a character out of a file outside the mod", { status: ch.s, body: ch.b });
      // …and the up-front "can both files be written?" check reads the same name: a read-only file outside the mod, named
      // as the file the character came from, refused a save that moves nothing.
      const lockedCh = path.join(WORKSPACE, "locked_characters.txt");
      fs.writeFileSync(lockedCh, escapeChText);
      fs.chmodSync(lockedCh, 0o444);
      const lk = await post("/api/characters/save", chBody({ previousFile: "..\\..\\..\\locked_characters.txt" }));
      try { fs.chmodSync(lockedCh, 0o666); } catch (_) {}
      ok(lk.s === 200, "⭐ …nor did a read-only file out there refuse a save that moves nothing", { status: lk.s, body: lk.b });

      const canary = path.join(WORKSPACE, "canary.txt");
      fs.writeFileSync(canary, "still here");
      const snapDir = path.join(MOD, ".nova", "removed_countries");
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, "ABC.json"), JSON.stringify({ tag: "ABC", states: [], countryHistory: [
        { origin: "mod", file: "..\\..\\..\\escaped_history.txt", content: "ABC = {}" },
        { origin: "base", file: "..\\..\\..\\canary.txt" },
      ] }));
      let rr = null; try { rr = mapData.restoreCountry({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], tag: "ABC" }); } catch (e) { rr = { threw: e.message }; }
      ok(!fs.existsSync(path.join(WORKSPACE, "escaped_history.txt")), "⭐⭐ restoring a country wrote no history file outside the mod", rr);
      ok(fs.existsSync(canary), "⭐⭐ …and deleted none there either", rr);
    }

    console.log("\n5b. ⭐⭐ The other roots a request can name are held to the same rule");
    {
      // resolveAllowedModDirectory's allow-list holds Nova's own folder (and the global root), and three write routes resolve
      // their root through it. Asked read-only here, through the route that answers with its reason.
      const s = await post("/api/flags/gfx-stems-scan", { dir: NOVA_DIR });
      ok(/top of a drive or Nova's own folder/.test(String(s.b.error || "")), "⭐⭐ the mod-folder resolver refuses Nova's own folder, by name", s.b);
      // The country-flag upload compared `=== DEV_ROOT` alone: a folder that is not there any more was recreated as a mod
      // skeleton with flags in it. The same check every maker makes refuses it now.
      const phantom = path.join(WORKSPACE, "gone-mod");
      const fd = new FormData();
      fd.append("image", new Blob([fs.readFileSync(path.join(__dirname, "docs", "screenshots", "map-editor.png"))], { type: "image/png" }), "flag.png");
      fd.append("tag", "NOV");
      fd.append("modPath", phantom);
      const u = await fetch(`http://127.0.0.1:${PORT}/api/flags/upload-country-flag`, { method: "POST", body: fd }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
      ok(u.s === 400 && !fs.existsSync(phantom), "⭐⭐ the country-flag upload refuses a mod folder that is gone, and does not recreate it", { status: u.s, body: u.b, created: fs.existsSync(phantom) });
      // The localisation "create file" route checked the root only when the request named none. Named, safeModWrite refused
      // the file — but after mkdir -p had made its folder. Asked of Nova's own folder, under a folder name nothing uses.
      const locProbeDir = path.join(NOVA_DIR, "localisation", "english", `nova-stray-probe-${process.pid}`);
      const lc = await post("/api/localization/create", { modPath: NOVA_DIR, path: `localisation/english/nova-stray-probe-${process.pid}/x_l_english.yml` });
      const locMade = fs.existsSync(locProbeDir);
      try { if (locMade && !fs.readdirSync(locProbeDir).length) fs.rmdirSync(locProbeDir); } catch (_) {}
      ok(lc.s === 400 && /Nova will not create a localisation file/.test(String(lc.b.error || "")) && !locMade, "⭐⭐ creating a localisation file in Nova's own folder is refused before any folder is made", { status: lc.s, body: lc.b, folderMade: locMade });
      // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — the snapshot is written to Nova's store for the mod now, not into the mod, so
      // the question is asked of the mod folder Remove country writes into (history/countries), before the carry-out of an older Nova's
      // in-mod archives and before the snapshot's folder is made: before anything is written.
      const MDm = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const dcAt = MDm.indexOf("function deleteCountry(");
      const dc = dcAt < 0 ? "" : MDm.slice(dcAt, MDm.indexOf("\nfunction ", dcAt + 10));
      const askAt = dc.indexOf('assertNotStrayWrite(path.join(modRoot, "history", "countries", `${T}.txt`));');
      ok(askAt > 0 && dc.indexOf("moveRemovalArchivesOutOfMod(modRoot);") > askAt && dc.indexOf("fs.mkdirSync(snapDir, { recursive: true });") > askAt,
        "the map's Remove country asks the last line of the mod folder it writes into before it writes anything", { askAt, dc: dc.length });
      const driveTop = path.parse(WORKSPACE).root;
      let dr = null; try { dr = mapData.deleteCountry({ modRoot: driveTop, gameRoot: GAME, dependencyRoots: [], tag: "ABC" }); } catch (e) { dr = { threw: e.message }; }
      ok(/Nova refused to write/.test(String((dr && (dr.threw || dr.error)) || "")) && !fs.existsSync(mapData.removedCountriesDir(driveTop)),
        "⭐ …and a removal asked of the top of a drive is refused, with no snapshot made for it", dr);
    }

    console.log("\n6. ⭐⭐⭐ The last line: safeModWrite refuses to put a mod's folders on top of a drive or into Nova's folder");
    {
      const SW = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
      ok(/function safeModWrite\([^)]*\) \{\s*assertNotStrayWrite\(absPath\);/.test(SW), "safeModWrite asks it before anything else");
      ok(/function renameOverWithRetry\([^)]*\) \{[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*try \{ assertNotStrayWrite\(absPath\); \} catch \(e\) \{ try \{ fs\.unlinkSync\(tmpPath\); \} catch \(_\) \{\} throw e; \}/.test(SW),
        "…and so does the rename every save ends in, taking the caller's temp file away with the refusal");
      // Derived: every top-level folder Nova's writers join onto a mod root.
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const folders = new Set();
      for (const f of ["server.js", "map-data.js"]) {
        const src = maskJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"));
        // `[,)]`: a folder joined with nothing after it counts too — every `events` join is `path.join(activeRoot, "events")`,
        // and requiring a comma left the event maker's own folder out of this list (and out of the check below).
        for (const m of src.matchAll(/path\.join\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([A-Za-z_.][\w.]*)"\s*[,)]/g)) {
          // "mod" is the game's user folder's mods folder (path.join(root, "mod")), not a folder inside a mod.
          if (/^(modRoot|root|activeRoot|importRoot|upsertRoot|definitionRoot|modAbs|targetRoot|base|MOD)$/.test(m[1]) && !/\.(mod|json|txt|exe|yml)$/i.test(m[2]) && m[2] !== "mod") folders.add(m[2]);
        }
      }
      for (const m of fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").matchAll(/path\.join\("(\.[a-z]+)",/g)) folders.add(m[1]);
      ok(folders.size >= 9 && folders.has("events"), `PRECONDITION: the derivation found the folders Nova writes, events among them (${[...folders].sort().join(", ")})`, [...folders]);
      const missed = [...folders].filter((x) => !safeWrite.strayWriteReason(path.join(DRIVE, x, "probe.txt")) || !safeWrite.strayWriteReason(path.join(NOVA_DIR, x, "probe.txt")));
      ok(missed.length === 0, "⭐⭐⭐ each of them is refused on top of the drive AND in Nova's folder", missed);
      ok(!!safeWrite.strayWriteReason(path.join(DRIVE, "stray.txt")) && !!safeWrite.strayWriteReason(path.join(DRIVE, "New Mod.mod")), "a file directly on the drive, or a .mod launcher there, is refused");
      ok(!!safeWrite.strayWriteReason(path.join(NOVA_DIR, "New Mod.mod")) && safeWrite.strayWriteReason(path.join(NOVA_DIR, "notes.txt")) === "", "…and a .mod launcher in Nova's folder, which is not a mods folder (while Nova's own files there are its business)");
      const allowed = [path.join(MOD, "interface", "x.gfx"), path.join(MOD, "common", "ideas", "x.txt"), path.join(NOVA_DIR, "Nova_backups", "x.zip"), path.join(appdata, "backups", "x.txt")];
      ok(allowed.every((p) => safeWrite.strayWriteReason(p) === ""), "…while a real mod, Nova's backups and its app data are left alone", allowed.map((p) => [p, safeWrite.strayWriteReason(p)]));
      // Spellings that name the same place: a trailing dot or space (Node creates "interface." — Explorer shows "interface")
      // and the \\?\ and \\?\UNC\ prefixes, which path.parse reads as a different root.
      const letter = DRIVE[0];
      const spelled = [path.join(DRIVE, "interface.", "x.gfx"), path.join(DRIVE, "interface ", "x.gfx"), `\\\\?\\${DRIVE}interface\\x.gfx`, `\\\\?\\UNC\\localhost\\${letter}$\\interface\\x.gfx`];
      ok(spelled.every((p) => !!safeWrite.strayWriteReason(p)), "⭐ …however the drive or the folder is spelled", spelled.map((p) => [p, safeWrite.strayWriteReason(p)]));
      ok([`\\\\?\\UNC\\localhost\\${letter}$`, `\\\\?\\${BARE}`].every((p) => isNeverAModFolder(p) === true), "⭐ …and the route guard reads those spellings of the drive's top the same way");

      // ⛔ #a-home-folder-named-like-a-mod-folder — THE PACKAGED EXE. It runs from %TEMP%\<id>\resources\app.asar, and "every
      // folder that holds Nova" then took in C:\Users\<you>: an account named Music refused every save into its own mods
      // folder. Only Nova's folder, the one above and the dev root two above are never a mod — asked as that exe would.
      const exeHome = path.join(DRIVE, "Users", "music", "AppData", "Local", "Temp", "2nova1", "resources", "app.asar");
      const realMod = path.join(DRIVE, "Users", "music", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "MyMod");
      ok(safeWrite.strayWriteReason(path.join(realMod, "common", "ideas", "x.txt"), exeHome) === "" && safeWrite.strayWriteReason(path.join(path.dirname(realMod), "MyMod.mod"), exeHome) === "",
        "⭐⭐⭐ the packaged exe of a Windows account named \"music\" still saves into its own mods folder", safeWrite.strayWriteReason(path.join(realMod, "common", "ideas", "x.txt"), exeHome));
      ok(!!safeWrite.strayWriteReason(path.join(exeHome, "..", "..", "interface", "x.gfx"), exeHome) && !!safeWrite.strayWriteReason(path.join(DRIVE, "interface", "x.gfx"), exeHome),
        "…while its dev root and the top of its drive are still refused");
      // A mod kept INSIDE a folder named like a mod folder (E:\Assets\…, E:\Music\mods\…) is still a mod: its descriptor.mod
      // says so. Built under a stand-in install whose dev root is a scratch folder, so nothing here touches a real drive's top.
      const install = mk("nova-nochoose-install-");
      const instHome = path.join(install, "resources", "app.asar");
      const kept = path.join(install, "assets", "KeptMod");
      fs.mkdirSync(kept, { recursive: true });
      fs.writeFileSync(path.join(kept, "descriptor.mod"), 'name="Kept"\n');
      ok(safeWrite.strayWriteReason(path.join(kept, "common", "ideas", "x.txt"), instHome) === "", "⭐⭐ a mod kept in a folder named \"assets\" under the dev root is written to — its descriptor.mod says it is a mod", safeWrite.strayWriteReason(path.join(kept, "common", "ideas", "x.txt"), instHome));
      ok(safeWrite.strayWriteReason(path.join(install, "assets", "NewMod", "descriptor.mod"), instHome) === "", "…and New mod may write the descriptor that makes one");
      ok(!!safeWrite.strayWriteReason(path.join(install, "assets", "NoMod", "common", "x.txt"), instHome) && !!safeWrite.strayWriteReason(path.join(install, "common", "x.txt"), instHome) && !!safeWrite.strayWriteReason(path.join(install, "interface", "descriptor.mod"), instHome),
        "…while a folder with no descriptor, a mod folder straight in the dev root, and a descriptor there are still refused");
      const refused = throws(() => safeWrite.safeModWrite(strayProbe, "spriteTypes = {\n}\n", "probe"));
      const leftovers = (() => { try { return fs.readdirSync(path.dirname(strayProbe)).filter((n) => n.startsWith(path.basename(strayProbe))); } catch (_) { return []; } })();
      ok(/Nova refused to write/.test(refused) && !fs.existsSync(strayProbe) && leftovers.length === 0, "⭐⭐⭐ a real write into Nova's own interface folder is refused, and nothing appears — not even its temp file", { refused, leftovers });
      ok(throws(() => safeWrite.safeModWrite(path.join(MOD, "interface", "nova_probe_ok.gfx"), "spriteTypes = {\n}\n", "probe")) === "" && fs.existsSync(path.join(MOD, "interface", "nova_probe_ok.gfx")), "…while the same write into the mod goes through");
    }

    console.log("\n7. ⭐⭐⭐ No Documents mod folder: the mods folder is where HOI4 looks, never the top of the drive");
    {
      const decoy = mk("nova-nochoose-home-");
      const childSrc = path.join(decoy, "probe-mods-root.js");
      fs.writeFileSync(childSrc, [
        '"use strict";',
        `const path = require("path");`,
        `const decoy = ${JSON.stringify(decoy)};`,
        `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))});`,
        `const MODS_ROOT = s.constants.MODS_ROOT;`,
        `const inside = !!MODS_ROOT && path.resolve(MODS_ROOT).toLowerCase().startsWith(path.resolve(decoy).toLowerCase() + path.sep);`,
        `const out = { MODS_ROOT, never: s.isNeverAModFolder(MODS_ROOT), inside };`,
        `const srv = s.createApp().listen(${CHILD_PORT}, async () => {`,
        `  try {`,
        `    const l = await fetch("http://127.0.0.1:${CHILD_PORT}/api/mods/list").then((r) => r.json());`,
        `    out.listed = (l.mods || []).map((m) => m.path);`,
        // Create only inside the decoy: with the fix backed out MODS_ROOT is the real drive root, and this must not write there.
        `    if (inside) out.create = await fetch("http://127.0.0.1:${CHILD_PORT}/api/mod/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modName: "Decoy Probe", dependencies: [] }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));`,
        `  } catch (e) { out.error = String(e && e.message || e); }`,
        `  console.log("RESULT " + JSON.stringify(out));`,
        `  srv.close(); process.exitCode = 0;`,
        `});`,
      ].join("\n"));
      const env = { ...process.env, USERPROFILE: decoy, HOME: decoy, OneDrive: path.join(decoy, "OneDrive"), APPDATA: path.join(decoy, "ad"), NOVA_APP_DATA_DIR: path.join(decoy, "ad"), XDG_CONFIG_HOME: path.join(decoy, "ad") };
      for (const k of ["HOI4_MODS_ROOT", "HOI4_MOD_ROOT", "HOI4_USER_DIR", "OneDriveConsumer", "OneDriveCommercial"]) delete env[k];
      // "No answer", said explicitly: left unset, server.js asks Windows' registry, and that answer is this machine's, not the decoy's.
      env.NOVA_DOCUMENTS_DIR = "none";
      const c = spawnSync(process.execPath, [childSrc], { cwd: __dirname, env, encoding: "utf8", timeout: 120000 });
      const line = String(c.stdout || "").split(/\r?\n/).find((l) => l.startsWith("RESULT ")) || "";
      let o = {}; try { o = JSON.parse(line.slice(7)); } catch (_) { o = { raw: (c.stdout || "") + (c.stderr || "") }; }
      const want = path.join(decoy, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod");
      ok(!!o.MODS_ROOT && path.resolve(o.MODS_ROOT).toLowerCase() === path.resolve(want).toLowerCase(), "⭐⭐⭐ the mods folder is Documents\\Paradox Interactive\\Hearts of Iron IV\\mod, even before it exists", o);
      ok(o.never === false, "…which is not a folder that is never a mod", o.never);
      const onTop = (o.listed || []).filter((p) => { const r = path.parse(path.resolve(p)).root; return path.resolve(path.dirname(path.resolve(p))).toLowerCase() === path.resolve(r).toLowerCase(); });
      ok(Array.isArray(o.listed) && onTop.length === 0, "⭐⭐⭐ the mod list offers no folder straight off the top of a drive as a mod", onTop.slice(0, 8));
      const made = path.join(want, "decoy_probe");
      ok(!!o.create && o.create.status === 200 && fs.existsSync(path.join(made, "descriptor.mod")) && fs.existsSync(path.join(want, "decoy_probe.mod")), "⭐⭐ New mod creates it there, launcher file beside it", { create: o.create, made });

      // A mods folder that is Nova's own (or a drive's top) is refused before New mod writes anything. Asked of the guard
      // itself, in a child whose HOI4_MODS_ROOT names Nova's folder — no create is sent, so nothing can be written.
      const guardSrc = path.join(decoy, "probe-mods-guard.js");
      fs.writeFileSync(guardSrc, `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))}); let e = ""; try { s.assertModsFolderIsReal(); } catch (x) { e = x.message; } console.log("GUARD " + JSON.stringify({ MODS_ROOT: s.constants.MODS_ROOT, error: e }));`);
      const gc = spawnSync(process.execPath, [guardSrc], { cwd: __dirname, env: { ...env, HOI4_MODS_ROOT: NOVA_DIR }, encoding: "utf8", timeout: 120000 });
      let g = {}; try { g = JSON.parse((String(gc.stdout || "").split(/\r?\n/).find((l) => l.startsWith("GUARD ")) || "GUARD {}").slice(6)); } catch (_) {}
      ok(path.resolve(String(g.MODS_ROOT || "")).toLowerCase() === NOVA_DIR.toLowerCase() && /could not find your Hearts of Iron IV mod folder/.test(String(g.error || "")), "⭐⭐ a mods folder that is Nova's own is refused", g);
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      ok((SRV.match(/assertModsFolderIsReal\(\);[^\n]*\n\s*const modRoot = path\.join\(MODS_ROOT, slug\);/g) || []).length === 2, "…and both New-mod routes ask it before they join a mod onto the mods folder");

      // ⭐⭐ "Documents" IS WHEREVER WINDOWS SAYS IT IS. OneDrive's "back up Documents" (and the folder's Location tab) move it,
      // HOI4 follows, and a guessed <home>\Documents made New mod create a mod the launcher never lists. main.js hands over
      // Electron's answer as NOVA_DOCUMENTS_DIR. Each case is a fresh child (the mods folder is decided at load) that only
      // prints it — nothing is created.
      const modsRootWith = (extraEnv, label) => {
        const src = path.join(decoy, `probe-mods-${label}.js`);
        fs.writeFileSync(src, `const s = require(${JSON.stringify(path.join(__dirname, "server.js"))}); console.log("MODS " + JSON.stringify({ MODS_ROOT: s.constants.MODS_ROOT }));`);
        const r = spawnSync(process.execPath, [src], { cwd: __dirname, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 120000 });
        try { return JSON.parse((String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("MODS ")) || "MODS {}").slice(5)).MODS_ROOT || ""; } catch (_) { return ""; }
      };
      const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
      const PI = ["Paradox Interactive", "Hearts of Iron IV"];
      const moved = path.join(decoy, "OneDrive", "Dokumente");   // a moved, and localised, Documents
      fs.mkdirSync(moved, { recursive: true });
      fs.rmSync(path.join(decoy, "Documents"), { recursive: true, force: true });   // the decoy's, made by New mod above
      const mA = modsRootWith({ NOVA_DOCUMENTS_DIR: moved }, "moved");
      ok(same(mA, path.join(moved, ...PI, "mod")), "⭐⭐ with no mods folder yet, it is named in the Documents folder Windows reports, not a guessed one", mA);
      // ⛔ #two-documents-folders — …AND ONCE THE GAME'S FOLDER IS THERE, IT IS THE LAUNCHER'S EVEN WHEN ANOTHER DOCUMENTS
      // STILL HOLDS A mod\ FOLDER. Turning OneDrive's backup off copied every mod into plain Documents; the launcher reads that
      // one, so New mod must write there. Which folders are mods comes from its .mod files, which still point into OneDrive, and
      // the copies are left out — test-the-mod-list-is-the-launchers.js. (This case used to assert the opposite, while the list
      // was still built from subfolders.)
      fs.mkdirSync(path.join(moved, ...PI, "mod"), { recursive: true });
      fs.mkdirSync(path.join(decoy, "Documents", ...PI, "mod"), { recursive: true });
      const mB = modsRootWith({ NOVA_DOCUMENTS_DIR: moved }, "both");
      ok(same(mB, path.join(moved, ...PI, "mod")), "⭐⭐⭐ with both Documents holding a mods folder, it is the one the launcher reads (the reported Documents)", mB);
      fs.rmSync(path.join(moved, ...PI, "mod"), { recursive: true, force: true });
      const mC = modsRootWith({ NOVA_DOCUMENTS_DIR: moved }, "notyet");
      ok(same(mC, path.join(moved, ...PI, "mod")), "⭐⭐ …even before the launcher has made its mod folder: New mod creates it where the launcher looks", mC);
      fs.rmSync(path.join(decoy, "Documents", ...PI, "mod"), { recursive: true, force: true });
      const custom = path.join(decoy, "Games", "HOI4 user");
      fs.mkdirSync(custom, { recursive: true });
      const mD = modsRootWith({ HOI4_USER_DIR: custom }, "userdir");
      ok(same(mD, path.join(custom, "mod")), "⭐ an explicit HOI4_USER_DIR names the game's folder here as it does for diagnostics", mD);
      fs.mkdirSync(path.join(decoy, "Documents", ...PI, "mod"), { recursive: true });
      const mE = modsRootWith({ HOI4_USER_DIR: custom }, "userdirwins");
      ok(same(mE, path.join(custom, "mod")), "⭐ …even when a Documents mods folder exists (it is Nova's stand-in for the game's -userdir=, which the game obeys)", mE);
      fs.rmSync(path.join(decoy, "Documents", ...PI, "mod"), { recursive: true, force: true });
      const MAIN = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"));
      const handOff = MAIN.search(/process\.env\.NOVA_DOCUMENTS_DIR = app\.getPath\("documents"\)/), serverLoad = MAIN.indexOf('require("./server")');
      ok(handOff !== -1 && serverLoad !== -1 && handOff < serverLoad, "⭐⭐ …and main.js hands Electron's answer over before server.js loads", { handOff, serverLoad });
    }

    console.log("\n8. ⭐⭐ Derived: no function in server.js reads the global root and writes without checking it");
    {
      const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
      const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const SRC = maskJsComments(RAW), CODE = maskJsLiterals(RAW);   // same length: an index in one is an index in the other
      const WRITE = /\bsafeModWrite\(|fs\.writeFileSync\(|fs\.mkdirSync\(|fs\.renameSync\(|fs\.copyFileSync\(|fs\.appendFileSync\(|fs\.cpSync\(|fs\.rmSync\(|fs\.unlinkSync\(|writeUtf8BomFile\(|upsertLocalizationLines\(|setLocalizationKeyInPlace\(|forgetLocKeysInFile\(|ensureSpriteTypeMapping\(|backupAssetBeforeOverwrite\(|renameOverWithRetry\(/;
      const MOD_WRITE = /\bsafeModWrite\(|writeUtf8BomFile\(|upsertLocalizationLines\(|setLocalizationKeyInPlace\(|forgetLocKeysInFile\(|ensureSpriteTypeMapping\(|backupAssetBeforeOverwrite\(|renameOverWithRetry\(/;
      const GUARD = /checkActiveRootNotGameRoot\(|isUnchosenRoot\(|isNeverAModFolder\(|assertModsFolderIsReal\(/;
      // Braces are counted in CODE, where a `{` inside a regex, string or template is blanked: counted in SRC, 174 of the
      // 966 bodies never closed, came back empty, and a removed guard in 15 of them — save-batch among them — went unseen.
      const offenders = [], cacheOnly = [], bodiless = [];
      let scanned = 0, guardedSaveBatch = 0;
      for (const m of SRC.matchAll(/(?:^|\n)[ \t]*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g)) {
        const name = m[1] ? m[1] : `${m[2].toUpperCase()} ${m[3]}`;
        const span = jsBodyAt(CODE, m.index + m[0].length - (m[1] ? 1 : 0));
        scanned++;
        if (!span) { bodiless.push(name); continue; }
        const body = SRC.slice(span[0], span[1] + 1);
        if (name === "POST /api/technologies/save-batch" && GUARD.test(body) && body.length > 10000) guardedSaveBatch++;
        if (!/getActiveRoot\(\)/.test(body) || !WRITE.test(body) || GUARD.test(body)) continue;
        // A cache: every file it writes is under Nova's own cache folder, never in a mod.
        if (/ICON_CACHE_DIR/.test(body) && !MOD_WRITE.test(body)) { cacheOnly.push(name); continue; }
        offenders.push(name);
      }
      ok(offenders.length === 0, "every one either checks the root or only writes Nova's own cache", offenders);
      ok(cacheOnly.length >= 1, `PRECONDITION: the scan does see the cache writers (${cacheOnly.join(", ")}), so it is reading the file`, cacheOnly);
      ok(scanned > 900 && bodiless.length === 0, `PRECONDITION: every one of the ${scanned} functions and routes has a body the scan can read`, bodiless.slice(0, 10));
      ok(guardedSaveBatch === 1, "PRECONDITION: …including save-batch, where this bug came in, read whole and guarded");
      ok(/function ensureSpriteTypeMapping\(modRoot, iconKey, ddsAbsolutePath\) \{\s*checkActiveRootNotGameRoot\(modRoot\);/.test(SRC), "the sprite helper takes its mod as an argument and checks it");
    }

    console.log("\n9. ⭐⭐ The session's write root never becomes a folder that is never a mod — and is not remembered as one");
    {
      // Last on purpose: with this fix backed out the global moves, so put it back before anything else could write.
      const before = getActiveRoot();
      try {
        const changed = setActiveRoot(NOVA_DIR);
        ok(changed === false && path.resolve(getActiveRoot()) === path.resolve(before), "⭐⭐ setActiveRoot refuses Nova's own folder and leaves the root where it was", { changed, now: getActiveRoot() });
        const stateFile = path.join(safeWrite.NOVA_APP_DATA_DIR, "active-mod.json");
        const hadState = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : null;
        const app2 = createApp();
        ok(typeof app2.locals.persistActiveMod === "function", "PRECONDITION: the app still hands main.js its persistActiveMod");
        app2.locals.persistActiveMod(NOVA_DIR);
        const nowState = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : null;
        ok(nowState === hadState, "⭐⭐ …and \"remember the last mod\" does not store it for the next launch", { hadState, nowState, stateFile });
      } finally {
        if (path.resolve(getActiveRoot()) !== path.resolve(before)) setActiveRoot(before);
      }
    }
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
  } finally {
    // The only thing this test could leave outside its temp folders: the refused probe in Nova's folder, if the block failed.
    try { if (fs.existsSync(strayProbe)) fs.unlinkSync(strayProbe); } catch (_) {}
    try { if (!strayProbeDirExisted && fs.existsSync(path.dirname(strayProbe)) && !fs.readdirSync(path.dirname(strayProbe)).length) fs.rmdirSync(path.dirname(strayProbe)); } catch (_) {}
    try { if (srv) { srv.closeAllConnections && srv.closeAllConnections(); srv.close(); } } catch (_) {}
    for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
    console.log(`\n=== Nova never writes into a folder nobody chose: ${pass + fail} checks, ${fail} failed ===`);
    process.exitCode = fail === 0 && pass >= 30 ? 0 : 1;
  }
})();
