// 🌍 Generate a world's step 1 writes exactly the two things Delete map's dialog leaves to the modder, and nothing else.
// #a-generated-world-owns-its-map, #a-world-of-its-own-is-asked-for-by-name
//
// Delete map refuses a mod that inherits its provinces.bmp and tells the modder to copy it in and to add replace_path="history/states"
// to the descriptors — "Nova does not copy it for you". 🌍 Generate a world IS that decision, asked for in its own confirm, so step 1
// (map-data prepareModForNewWorld, POST /api/map/prepare-world) does exactly those two things:
//   · map/provinces.bmp — the one that LOADS below the mod (a dependency's before the base game's), byte for byte;
//   · replace_path="history/states" spliced after the name line of every descriptor the mod has (its own descriptor.mod, and the
//     launcher's .mod entries that name it — else the <folder>.mod beside it), every other byte kept.
// It writes nothing else anywhere (the game, the dependency, a decoy .mod, the Workshop are hashed before and after), a dry run
// writes nothing at all, each refusal comes before any write, and the old descriptor text is copied out first.
//
// And WHAT A WORLD OF ITS OWN IS: the run's typed GENERATE gate (and the server's replacesOwnWorld rule) fire when the mod owns any
// file the run overwrites or deletes. That list (map-data NEW_WORLD_OWN_FILES) is not trusted as typed: section 5 runs all six
// steps on a mod owning a copy of every file of the world below it, hashes the mod before and after, and requires every file that
// changed or went to be one the list names — so a step that starts rewriting a new kind of file fails here until the list says so.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

// ── the sandbox, before server.js loads (it reads these when it loads) ───────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-own-"));
const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods"), HOME = path.join(ROOT, "home"), WS = path.join(ROOT, "workshop");
const OTHER = path.join(ROOT, "otherdocs", "mod");
for (const d of [MODS, HOME, WS, OTHER]) fs.mkdirSync(d, { recursive: true });
process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.NOVA_HOME_DIR = HOME;
process.env.HOI4_WORKSHOP_ROOT = WS;
const SW = require("./testlib-split-world.js");
const S = SW.makeShapes({});
SW.makeGame(GAME, S, {});
const write = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
// a dependency with a province map of its own (different bytes from the game's: one pixel's colour is the game's id 2's)
const DEP = path.join(MODS, "dep_world");
write(DEP, "descriptor.mod", 'name="Dep World"\nsupported_version="1.*"\n');
const depBmp = Buffer.from(fs.readFileSync(path.join(GAME, "map", "provinces.bmp")));
depBmp[54] = depBmp[54] ^ 1;
write(DEP, "map/provinces.bmp", depBmp);
write(MODS, "dep_world.mod", `name="Dep World"\npath="${DEP.replace(/\\/g, "/")}"\n`);
// an add-on on it, listed by a launcher entry that does NOT sit beside it, and a decoy .mod of its folder's name naming elsewhere
const ADD = path.join(MODS, "addon_folder");
write(ADD, "descriptor.mod", '\uFEFFname="Addon World"\r\nsupported_version="1.*"\r\ndependencies={\r\n\t"Dep World"\r\n}\r\n');
write(MODS, "addon_entry.mod", `name="Addon World"\r\n# the launcher's entry\r\npath="${ADD.replace(/\\/g, "/")}"\r\ndependencies={\r\n\t"Dep World"\r\n}\r\n`);
const ELSEWHERE = path.join(ROOT, "otherdocs", "mod", "addon_folder");
write(ELSEWHERE, "descriptor.mod", 'name="Addon World (old copy)"\n');
write(MODS, "addon_folder.mod", `name="Addon World (old copy)"\npath="${ELSEWHERE.replace(/\\/g, "/")}"\n`);
// a mod in the OTHER Documents that no launcher entry names: its own <folder>.mod beside it is its descriptor
const LONE = path.join(OTHER, "lone_world");
write(LONE, "descriptor.mod", 'name="Lone World"\nsupported_version="1.*"\n');
write(OTHER, "lone_world.mod", `name="Lone World"\npath="${LONE.replace(/\\/g, "/")}"\n`);
write(OTHER, "decoy.mod", 'name="Decoy"\npath="C:/nowhere/decoy"\n');
// a Workshop download
const WSMOD = path.join(WS, "123456");
write(WSMOD, "descriptor.mod", 'name="Workshop World"\n');
const md = require("./map-data.js");
const { createApp } = require("./server.js");

function hashTree(d, skip = () => false) {
  const out = {};
  const walk = (x) => {
    let ents = [];
    try { ents = fs.readdirSync(x, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(x, e.name), rel = path.relative(d, p).replace(/\\/g, "/");
      if (skip(rel)) continue;
      if (e.isDirectory()) walk(p);
      else out[rel] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(d);
  return out;
}
const diff = (a, b) => Object.keys(b).filter((k) => a[k] !== b[k]).concat(Object.keys(a).filter((k) => !(k in b))).sort();
// everything in the sandbox but Nova's own stores (the copies it keeps outside the mod) and the app data
const outside = (rel) => rel.startsWith("home/") || rel.startsWith("appdata/");
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");

(async () => {
  const server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  try {
    console.log("1. the splice: one line added, every other byte kept");
    {
      const cases = [
        ["New mod's descriptor (LF)", 'version="1"\ntags={\n\t"Gameplay"\n}\nname="Nova test 35a"\nsupported_version="1.19.*"\npath="mod/nova_test_t35a"\n',
          'version="1"\ntags={\n\t"Gameplay"\n}\nname="Nova test 35a"\nreplace_path="history/states"\nsupported_version="1.19.*"\npath="mod/nova_test_t35a"\n'],
        ["BOM and CRLF kept", '\uFEFFname="X"\r\nversion="1"\r\n', '\uFEFFname="X"\r\nreplace_path="history/states"\r\nversion="1"\r\n'],
        ["the name line's comment stays on it", 'name="X" # mine\nversion="1"\n', 'name="X" # mine\nreplace_path="history/states"\nversion="1"\n'],
        ["name last with no line end (CRLF)", 'version="1"\r\nname="X"', 'version="1"\r\nname="X"\r\nreplace_path="history/states"'],
        ["already there (spelled differently)", 'name="X"\nreplace_path = "history/states/"\n', null],
        ["a commented-out line is not the line", 'name="X"\n#replace_path="history/states"\n', 'name="X"\nreplace_path="history/states"\n#replace_path="history/states"\n'],
        ["no name line: appended", 'version="1"', 'version="1"\nreplace_path="history/states"\n'],
        ["name= inside a string is not a name line", 'tags={ "name=" }\nname="Y"\n', 'tags={ "name=" }\nname="Y"\nreplace_path="history/states"\n'],
      ];
      for (const [label, input, want] of cases) {
        const r = md.spliceReplacePathLine(input, "history/states");
        const exp = want === null ? input : want;
        rec(`splice: ${label}`, r.text === exp && r.added === (want !== null), r);
      }
      // the derived corpus: the descriptors New mod writes, and every descriptor the fixtures above wrote
      const created = await post("/api/mod/create", { modName: "Plain World" });
      rec("THE CONTROL: New mod made a mod", created.status === 200 && created.body.ok !== false && !!created.body.modRoot, created.body);
      const PLAIN = created.body.modRoot;
      const corpus = [path.join(PLAIN, "descriptor.mod"), path.join(MODS, "plain_world.mod"), path.join(ADD, "descriptor.mod"), path.join(MODS, "addon_entry.mod"),
        path.join(DEP, "descriptor.mod"), path.join(LONE, "descriptor.mod"), path.join(OTHER, "lone_world.mod")].filter((f) => fs.existsSync(f));
      const captions = (t) => { const m = {}; const ls = t.split(/\r?\n/); ls.forEach((l, i) => { if (/^\s*#/.test(l)) { const n = ls.slice(i + 1).find((x) => x.trim() && !/^\s*#/.test(x)); m[l.trim()] = n ? n.split("=")[0].trim() : ""; } }); return m; };
      let bad = [];
      for (const f of corpus) {
        const t = fs.readFileSync(f, "utf8");
        const r = md.spliceReplacePathLine(t, "history/states");
        const eol = t.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
        const without = r.text.replace('replace_path="history/states"' + eol, "").replace(eol + 'replace_path="history/states"', "");
        const scratch = fs.mkdtempSync(path.join(ROOT, "splice-"));
        fs.writeFileSync(path.join(scratch, "descriptor.mod"), r.text);
        if (!(r.added && without === t && md.readReplacePaths(scratch).has("history/states") && JSON.stringify(captions(t)) === JSON.stringify(captions(r.text)))) bad.push(path.basename(f));
      }
      rec(`⭐⭐ ${corpus.length} real descriptors: the line is added, and taking it out gives back every byte`, corpus.length >= 6 && bad.length === 0, { corpus: corpus.length, bad });
    }

    console.log("\n2. ⭐⭐⭐ a fresh mod: the base game's province map and both of its descriptors — nothing else");
    {
      const PLAIN = path.join(MODS, "plain_world");
      const before = hashTree(ROOT, outside);
      const dry = await post("/api/map/prepare-world", { modPath: PLAIN, dryRun: true });
      rec("THE CONTROL: the dry run answers a plan", dry.status === 200 && dry.body.ok === true && !!dry.body.plan, dry.body);
      const plan = dry.body.plan || {};
      rec("…the bitmap comes from the base game, at its own size", plan.bitmap && plan.bitmap.from === "game" && plan.bitmap.bytes === fs.statSync(path.join(GAME, "map", "provinces.bmp")).size, plan.bitmap);
      rec("…both descriptors are named, the mod's own and the launcher's, neither has the line", (plan.descriptors || []).map((d) => d.kind + ":" + d.has).join(",") === "mod:false,launcher:false", plan.descriptors);
      rec("…the launcher lists it, and it has no world of its own (so no typed gate)", plan.launcherListsIt === true && plan.ownsWorld === false && plan.stateFiles === 0, { l: plan.launcherListsIt, own: plan.ownsWorld, parts: plan.ownParts });
      rec("⭐⭐ the dry run wrote nothing anywhere", diff(before, hashTree(ROOT, outside)).length === 0, diff(before, hashTree(ROOT, outside)));
      const r = await post("/api/map/prepare-world", { modPath: PLAIN, confirm: true });
      rec("THE CONTROL: step 1 answered ok", r.status === 200 && r.body.ok === true, r.body);
      const changed = diff(before, hashTree(ROOT, outside));
      rec("⭐⭐⭐ it wrote exactly the province map and the two descriptors", JSON.stringify(changed) === JSON.stringify(["mods/plain_world.mod", "mods/plain_world/descriptor.mod", "mods/plain_world/map/provinces.bmp"]), changed);
      rec("⭐⭐ …the province map is the base game's, byte for byte", sha(path.join(PLAIN, "map", "provinces.bmp")) === sha(path.join(GAME, "map", "provinces.bmp")));
      rec("…and definition.csv is NOT copied (Delete map writes the mod's own)", !fs.existsSync(path.join(PLAIN, "map", "definition.csv")));
      for (const f of [path.join(PLAIN, "descriptor.mod"), path.join(MODS, "plain_world.mod")]) {
        const t = fs.readFileSync(f, "utf8");
        rec(`…${path.basename(f)} carries replace_path="history/states", once, after its name line`, (t.match(/replace_path="history\/states"/g) || []).length === 1 && /name="[^"]*"\r?\nreplace_path="history\/states"/.test(t), t);
      }
      rec("history/countries is NOT replaced: the owners are inherited from the countries below", !md.readReplacePaths(PLAIN).has("history/countries"));
      const b = r.body.backups || {};
      const copies = b.dir ? hashTree(b.dir) : {};
      rec("⭐⭐ the descriptors' old text was copied out first, outside the mod", b.files === 2 && b.failed === 0 && !path.relative(PLAIN, b.dir).replace(/\\/g, "/").match(/^[^.]/) && Object.values(copies).includes(before["mods/plain_world/descriptor.mod"]), { b, copies: Object.keys(copies) });
      // once step 1 has run, the mod owns its province map: a second run is a re-roll, asked for by name (replacesOwnWorld)
      const asked = await post("/api/map/prepare-world", { modPath: PLAIN, confirm: true });
      rec("a second step 1 without replacesOwnWorld is refused: the mod owns its province map now", asked.status === 400 && asked.body.refused === "own-world", asked.body);
      const again = await post("/api/map/prepare-world", { modPath: PLAIN, confirm: true, replacesOwnWorld: true });
      rec("…and with it writes nothing (it owns its map and has the line)", again.body.ok === true && again.body.bitmapCopied === false && again.body.descriptorsWritten.length === 0, again.body);
    }

    console.log("\n3. ⭐⭐⭐ an add-on: the DEPENDENCY's province map, the launcher entry that names it — never the decoy of its name");
    {
      const before = hashTree(ROOT, outside);
      const dry = await post("/api/map/prepare-world", { modPath: ADD, dryRun: true });
      const plan = (dry.body && dry.body.plan) || {};
      rec("the plan names the dependency as the bitmap's source", plan.bitmap && plan.bitmap.from === "dependency" && plan.bitmap.fromName === "Dep World", plan.bitmap);
      rec("…and the launcher entry, not the .mod of its folder's name", (plan.descriptors || []).map((d) => path.basename(d.file) + ":" + d.kind).join(",") === "descriptor.mod:mod,addon_entry.mod:launcher", plan.descriptors);
      rec("…and the dependency is named below it", JSON.stringify(plan.dependencyNames) === JSON.stringify(["Dep World"]), plan.dependencyNames);
      const r = await post("/api/map/prepare-world", { modPath: ADD, confirm: true });
      const changed = diff(before, hashTree(ROOT, outside));
      rec("⭐⭐⭐ it wrote the add-on's province map, its descriptor and its launcher entry, nothing else", r.body.ok === true && JSON.stringify(changed) === JSON.stringify(["mods/addon_entry.mod", "mods/addon_folder/descriptor.mod", "mods/addon_folder/map/provinces.bmp"]), changed);
      rec("⭐⭐ …the province map is the dependency's, byte for byte (not the game's)", sha(path.join(ADD, "map", "provinces.bmp")) === sha(path.join(DEP, "map", "provinces.bmp")) && sha(path.join(DEP, "map", "provinces.bmp")) !== sha(path.join(GAME, "map", "provinces.bmp")));
      const t = fs.readFileSync(path.join(ADD, "descriptor.mod"), "utf8");
      rec("…its BOM and CRLF are kept", t.charCodeAt(0) === 0xfeff && t.indexOf('name="Addon World"\r\nreplace_path="history/states"\r\nsupported_version') === 1 && !/[^\r]\n/.test(t), JSON.stringify(t.slice(0, 80)));
    }

    console.log("\n4. a mod no launcher entry names: its own .mod beside it, copied first — and the plan says the game will not load it");
    {
      const before = hashTree(ROOT, outside);
      const dry = await post("/api/map/prepare-world", { modPath: LONE, dryRun: true });
      const plan = (dry.body && dry.body.plan) || {};
      rec("the plan says no launcher entry names it", plan.launcherListsIt === false, { l: plan.launcherListsIt, body: dry.body.error });
      rec("…and its descriptors are its own descriptor.mod and the .mod beside it", (plan.descriptors || []).map((d) => path.basename(d.file) + ":" + d.kind).join(",") === "descriptor.mod:mod,lone_world.mod:sibling", plan.descriptors);
      const r = await post("/api/map/prepare-world", { modPath: LONE, confirm: true });
      const changed = diff(before, hashTree(ROOT, outside));
      rec("⭐⭐ it wrote those two and its province map — never the decoy beside them", r.body.ok === true && JSON.stringify(changed) === JSON.stringify(["otherdocs/mod/lone_world.mod", "otherdocs/mod/lone_world/descriptor.mod", "otherdocs/mod/lone_world/map/provinces.bmp"]), { changed, err: r.body.error });
      rec("…with a copy of the .mod beside it", r.body.backups && r.body.backups.files === 2, r.body.backups);
    }

    console.log("\n5. ⛔ refusals come before any write");
    {
      const NODESC = path.join(MODS, "no_descriptor"); fs.mkdirSync(path.join(NODESC, "map"), { recursive: true });
      const DIRDESC = path.join(MODS, "dir_descriptor"); fs.mkdirSync(path.join(DIRDESC, "descriptor.mod"), { recursive: true });
      write(MODS, "dir_descriptor.mod", `name="Dir"\npath="${DIRDESC.replace(/\\/g, "/")}"\n`);
      const before = hashTree(ROOT, outside);
      const cases = [
        ["no mod named in the body", {}, /Select a mod first/],
        ["the game folder", { modPath: GAME }, /game/i],
        ["a Workshop download", { modPath: WSMOD }, /Steam Workshop download/],
        ["no descriptor.mod", { modPath: NODESC }, /has no descriptor\.mod/],
        ["a descriptor that cannot be read", { modPath: DIRDESC }, /could not read .*descriptor\.mod/],
      ];
      for (const [label, body, re] of cases) {
        for (const mode of [{ dryRun: true }, { confirm: true }]) {
          const r = await post("/api/map/prepare-world", Object.assign({}, body, mode));
          rec(`${label} (${Object.keys(mode)[0]}): 400 with its own reason`, r.status === 400 && r.body.ok === false && re.test(String(r.body.error)), r.body);
        }
      }
      // a mod that owns no province map, over a game with none
      const bare = path.join(ROOT, "bare_mod"); write(bare, "descriptor.mod", 'name="Bare"\n');
      const beforeBare = hashTree(bare);
      const nw = md.prepareModForNewWorld({ modRoot: bare, gameRoot: path.join(ROOT, "empty-game"), dependencyRoots: [] });
      rec("no province map anywhere below: refused as no-world, writing nothing", nw.ok === false && nw.refused === "no-world" && diff(beforeBare, hashTree(bare)).length === 0, nw);
      fs.rmSync(bare, { recursive: true, force: true });   // made by this test, inside its own sandbox
      const changed = diff(before, hashTree(ROOT, outside));
      rec("⭐⭐⭐ not one refusal wrote a byte", changed.length === 0, changed);
      const confirmless = await post("/api/map/prepare-world", { modPath: path.join(MODS, "plain_world") });
      rec("a write without confirm: true is refused too", confirmless.status === 400 && /confirm/.test(String(confirmless.body.error)), confirmless.body);
    }

    console.log("\n6. ⭐⭐⭐ WHAT A WORLD OF ITS OWN IS — derived from a run, not typed");
    {
      // a mod owning a copy of every file of the world below it, then the six steps
      const OWN = path.join(MODS, "owner_world");
      write(OWN, "descriptor.mod", 'name="Owner World"\nsupported_version="1.*"\n');
      write(MODS, "owner_world.mod", `name="Owner World"\npath="${OWN.replace(/\\/g, "/")}"\n`);
      const gameTree = hashTree(GAME);
      const worldFiles = Object.keys(gameTree).filter((r) => /^(map|history|gfx)\//.test(r));
      for (const rel of worldFiles) write(OWN, rel, fs.readFileSync(path.join(GAME, ...rel.split("/"))));
      write(OWN, "localisation/english/nova_state_names_l_english.yml", "\uFEFFl_english:\n STATE_1:0 \"Old One\"\n");
      rec("THE CONTROL: the mod owns the world's files", worldFiles.length >= 10, worldFiles.length);
      const dry = await post("/api/map/prepare-world", { modPath: OWN, dryRun: true });
      const plan = (dry.body && dry.body.plan) || {};
      rec("the plan says it has a world of its own, part by part", plan.ownsWorld === true && plan.ownParts && plan.ownParts.states > 0 && plan.ownParts.provinceMap === 2 && plan.ownParts.regions > 0 && plan.countryCapitalFiles === 2 && (plan.ownWorldParts || []).length >= 4, { parts: plan.ownParts, words: plan.ownWorldParts });
      const refused = await post("/api/map/world-run", { modPath: OWN, confirm: true, landShare: 35, seed: 1, ownerMode: "inherit", owner: "" });
      rec("⭐⭐ …so the run is refused unless the modder agreed to replace it", refused.status === 400 && refused.body.refused === "own-world" && /world of its own/.test(refused.body.error), refused.body);
      const before = hashTree(OWN);
      const W = require("./world-run.js");
      let err = null;
      try { await W.runWorldSequence({ base, modPath: OWN, choices: { landShare: 35, seed: 1, ownerMode: "inherit", owner: "", replacesOwnWorld: true } }); }
      catch (e) { err = e; }
      rec("THE CONTROL: the six steps ran on it", !err, err && err.message);
      const after = hashTree(OWN);
      const touched = Object.keys(before).filter((k) => before[k] !== after[k]);   // changed or gone; new files are the world's own
      const unlisted = touched.filter((rel) => rel !== "descriptor.mod" && !md.newWorldOwnFilePart(rel));
      rec("⭐⭐⭐ every file of the mod's that the run changed or deleted is one NEW_WORLD_OWN_FILES names", touched.length >= 10 && unlisted.length === 0, { touched: touched.length, unlisted });
      const parts = new Set(touched.map((r) => md.newWorldOwnFilePart(r)).filter(Boolean));
      // (a country file can come out byte-identical: Delete map takes its capital line out and Generate land puts the same one back)
      rec("…and the run did touch states, the province map and regions, among at least four parts (the list is load-bearing)", ["states", "provinceMap", "regions"].every((p) => parts.has(p)) && parts.size >= 4, [...parts]);
      const fresh = await post("/api/map/prepare-world", { modPath: path.join(MODS, "plain_world"), dryRun: true });
      rec("a mod whose step 1 already ran owns its province map, so another run asks for GENERATE (the re-roll case)", !!fresh.body.plan && fresh.body.plan.ownsWorld === true && Object.keys(fresh.body.plan.ownParts || {}).join(",") === "provinceMap", fresh.body.plan && fresh.body.plan.ownParts);
    }

    console.log("\n7. ⭐⭐ A TEXTURE MOD IS NOT A WORLD OF ITS OWN — the picture rows name the files the writers write, not every .dds");
    {
      // Section 6 proves the list is not too NARROW (every file a run changed is named). Its fixture world has no .dds at all, so
      // nothing there would notice a row that is too BROAD — and a row like /^map\/terrain\/[^/]+\.dds$/ would make every texture
      // mod (atlas0.dds, the 81 .dds of map/terrain) type GENERATE for a world it does not have. The names are derived: the five
      // colour pictures from map-data's own WORLD_TEXTURES, the minimap from the MINIMAP_REL line of its source.
      const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
      const mm = /const MINIMAP_REL = path\.join\(([^)]*)\)/.exec(src);
      const minimapRel = mm ? mm[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).join("/") : "";
      const textures = Object.values(md.WORLD_TEXTURES || {});
      rec("THE CONTROL: the writers' names were read out of map-data (five colour pictures and the minimap)", textures.length === 5 && /^gfx\/minimap\/[^/]+\.dds$/.test(minimapRel), { textures, minimapRel });
      const named = textures.map((t) => [`map/terrain/${t}`, md.newWorldOwnFilePart(`map/terrain/${t}`)]).concat([[minimapRel, md.newWorldOwnFilePart(minimapRel)]]);
      rec("every picture a step writes is a part of the world", named.every(([, p]) => p === "pictures"), named);
      const others = ["map/terrain/atlas0.dds", "map/terrain/atlas_normal0.dds", "map/terrain/colormap_rgb_cityemissivemask_a_old.dds", "gfx/minimap/minimap_overlay.dds", "gfx/interface/minimap_frame.dds"];
      const misnamed = others.map((r) => [r, md.newWorldOwnFilePart(r)]).filter(([, p]) => p);
      rec("⭐⭐ …and a picture no step writes is not one", misnamed.length === 0, misnamed);
      // and the gate as the confirm reads it: a mod owning only such pictures is asked plainly; the same mod owning one the run repaints is asked for GENERATE
      const TEX = path.join(MODS, "texture_mod");
      write(TEX, "descriptor.mod", 'name="Texture Mod"\nsupported_version="1.*"\n');
      write(MODS, "texture_mod.mod", `name="Texture Mod"\npath="${TEX.replace(/\\/g, "/")}"\n`);
      for (const r of others) write(TEX, r, Buffer.from("DDS |not a real picture, never read\n"));
      const texPlan = ((await post("/api/map/prepare-world", { modPath: TEX, dryRun: true })).body || {}).plan || {};
      rec("⭐⭐⭐ a mod owning only textures no step writes has no world of its own (no GENERATE to type)", texPlan.ownsWorld === false && !(texPlan.ownParts || {}).pictures, { ownsWorld: texPlan.ownsWorld, ownParts: texPlan.ownParts });
      write(TEX, `map/terrain/${textures[0] || "colormap.dds"}`, Buffer.from("DDS |not a real picture, never read\n"));
      const texPlan2 = ((await post("/api/map/prepare-world", { modPath: TEX, dryRun: true })).body || {}).plan || {};
      rec("THE CONTROL: …and the same mod owning one colour picture the run repaints has (pictures: 1)", texPlan2.ownsWorld === true && (texPlan2.ownParts || {}).pictures === 1, { ownsWorld: texPlan2.ownsWorld, ownParts: texPlan2.ownParts });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* our own mkdtemp sandbox only */ }
    console.log(`\n=== 🌍 Generate a world owns only what it must: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
