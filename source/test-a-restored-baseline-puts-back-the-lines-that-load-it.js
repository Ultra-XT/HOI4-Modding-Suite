// ⛔ #a-restored-map-keeps-the-lines-that-load-it — RESTORE BASELINE PUTS BACK THE DESCRIPTOR LINES THAT SAY WHICH STATES LOAD.
//
// THE DEFECT (review of the merged map editor, merge-integrity MI-2). 🌍 Generate a world's first step splices replace_path=
// "history/states" into the mod's descriptor.mod and the launcher's .mod (prepareModForNewWorld), so the base game's states stop
// loading under the new world. A baseline saved before that — on a fresh mod, the owner's own flow — holds no history/states, and
// Restore baseline put it back by taking the world's states out of the mod and leaving both lines where they were: no state loaded at
// all, FATAL land_not_in_state, after a confirm that says "It does guarantee the game loads".
//
// THE RULE NOW. A baseline keeps the bytes of the mod's descriptor files (descriptorFilesFor), and a restore puts each file's
// replace_path lines for the directories the baseline is a copy of back as that copy has them, every other byte as it is now, through
// safeModWrite — refusing before it writes anything when a file that needs a change is read-only. A baseline saved before it kept them
// cannot say which lines loaded its map: when it holds no history/states and a descriptor now replaces that folder, the restore refuses
// and says what to do, and changes nothing — unless the baseline is older than its `dirs`, whose restore takes no folder out and so
// leaves the mod's states loading (review of the units-baseline fixes, R5).
//
// On testlib-split-world's world through map-data's own steps: a fresh mod (its descriptor.mod with CRLF endings, a Windows-1252 byte
// in its name and a comment; the launcher's .mod beside it) -> Save baseline -> prepare, Delete map, Generate land, Auto-fix -> Restore.
// The states that load and the fatal rules are the validator's (isFatalRule); the counts are derived from the fixture. No port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-lines-"));
const D = { mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(D)) { D[k] = path.join(ROOT, D[k]); fs.mkdirSync(D[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_MODS_ROOT: D.mods, NOVA_HOME_DIR: D.home, APPDATA: D.app, NOVA_APP_DATA_DIR: D.app, XDG_CONFIG_HOME: D.app,
  HOI4_USER_DIR: D.user, NOVA_DOCUMENTS_DIR: D.docs, HOI4_WORKSHOP_ROOT: D.ws,
});
delete process.env.NOVA_WORLD_JOB;
const md = require("./map-data.js");
const L = require("./public/map-rule-labels.js");
const SW = require("./testlib-split-world.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const walk = (d, out = new Map(), base = d) => {
  for (const e of d && fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, base); else if (e.isFile()) out.set(path.relative(base, p).replace(/\\/g, "/"), sha(p));
  }
  return out;
};
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const validate = (ctx) => {
  const model = md.buildMapModel(Object.assign({}, ctx));
  const v = [...md.findStateFileConflicts(ctx.modRoot), ...md.validateMapModel(model), ...md.findBuildingAnchorMismatches(Object.assign({ model }, ctx)), ...(md.validateMapBitmap(ctx) || [])];
  return { states: (model.states || []).length, fatal: v.filter((p) => L.isFatalRule(p.rule)).map((p) => `${p.rule}=${p.total || 1}`) };
};
const lines = (f) => (fs.readFileSync(f, "latin1").match(/^[ \t]*replace_path[ \t]*=.*$/gm) || []).map((l) => l.trim());

// the world below, and a fresh mod as the new-mod wizard leaves it, with the launcher's .mod beside it
function freshWorld(name) {
  const S = SW.makeShapes();
  const game = path.join(ROOT, name + "-game");
  const g = SW.makeGame(game, S, {});
  const mod = path.join(D.mods, name);
  fs.mkdirSync(mod, { recursive: true });
  const descriptor = path.join(mod, "descriptor.mod"), launcher = path.join(D.mods, name + ".mod");
  fs.writeFileSync(descriptor, Buffer.from(`version="1.0"\r\ntags={\r\n\t"Map"\r\n}\r\nname="Große ${name}" # my world\r\nsupported_version="1.14.*"\r\n`, "latin1"));
  fs.writeFileSync(launcher, Buffer.from(`version="1.0"\ntags={\n\t"Map"\n}\nname="Große ${name}"\nsupported_version="1.14.*"\npath="${mod.replace(/\\/g, "/")}"\n`, "latin1"));
  return { S, g, game, mod, descriptor, launcher, ctx: { modRoot: mod, gameRoot: game, dependencyRoots: [] } };
}
function generateAWorld(w) {
  const pr = md.prepareModForNewWorld(Object.assign({ modsRoot: D.mods }, w.ctx));
  const b = md.blankMapToSea(w.ctx);
  const g = md.generateLand(Object.assign({ count: Math.round(w.S.N * 0.35), seed: 1, ownerMode: "inherit", owner: "" }, w.ctx));
  md.autoFixMap(w.ctx);
  return { pr, b, g };
}

try {
  // ── 1. a baseline of a fresh mod, restored after a world
  {
    const w = freshWorld("fresh");
    const before = { descriptor: fs.readFileSync(w.descriptor), launcher: fs.readFileSync(w.launcher) };
    const v0 = validate(w.ctx);
    rec(`control — the fresh mod loads the base game's ${w.g.states.length} states`, v0.states === w.g.states.length && !v0.fatal.length, v0);
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    rec("Save baseline keeps a copy of both descriptor files", sb.ok && sb.descriptors === 2 && !sb.descriptorsError, sb);
    const run = generateAWorld(w);
    rec("the world is generated", run.pr.ok && run.b.changed && run.g.changed !== false, { pr: run.pr.error, b: run.b.error, g: run.g.error });
    const v1 = validate(w.ctx);
    rec(`control — the world puts replace_path="history/states" in both files and loads only its own ${v1.states} states`,
      lines(w.descriptor).includes('replace_path="history/states"') && lines(w.launcher).includes('replace_path="history/states"') && v1.states > 0 && !v1.fatal.length,
      { descriptor: lines(w.descriptor), launcher: lines(w.launcher), v1 });
    const r = md.restoreMapBaseline(w.ctx);
    rec("Restore baseline answers ok", r.ok, r.error);
    rec("both descriptor files are byte for byte what they were before the world", fs.readFileSync(w.descriptor).equals(before.descriptor) && fs.readFileSync(w.launcher).equals(before.launcher),
      { descriptor: fs.readFileSync(w.descriptor, "latin1"), launcher: fs.readFileSync(w.launcher, "latin1") });
    const said = ((r.descriptors || {}).realigned || []).map((d) => `${path.basename(d.file)}:-${d.removed.join(",")}+${d.added.join(",")}`).sort();
    rec("…and the answer names each file and the line it took out", JSON.stringify(said) === JSON.stringify(["descriptor.mod:-history/states+", "fresh.mod:-history/states+"]), r.descriptors);
    const v2 = validate(w.ctx);
    rec(`the restored mod loads the base game's ${w.g.states.length} states again, and no fatal rule fires`, v2.states === w.g.states.length && !v2.fatal.length, v2);
    rec("the world's own folders are moved out of the mod, history/units among them (it had none when the baseline was saved)",
      ["map", "history/states", "history/units"].every((d) => (r.movedAside || []).some((m) => String(m.dir).replace(/\\/g, "/") === d)) && !fs.existsSync(path.join(w.mod, "history", "units")),
      (r.movedAside || []).map((m) => m.dir));
  }

  // ── 2. a baseline saved before Nova kept the descriptors in it: refused, nothing changed
  {
    const w = freshWorld("older");
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    const metaPath = path.join(sb.baselinePath, "_baseline.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    // what an older Nova wrote: no `asked`, no `descriptors`
    fs.writeFileSync(metaPath, JSON.stringify({ savedAt: meta.savedAt, modRoot: meta.modRoot, dirs: meta.dirs, provinceSplits: meta.provinceSplits }, null, 2));
    generateAWorld(w);
    const modBefore = walk(w.mod), launcherBefore = sha(w.launcher);
    const r = md.restoreMapBaseline(w.ctx);
    rec("an older baseline the line would leave with no state is refused", !r.ok && r.refused === "baseline-without-descriptors", r);
    rec("…naming both files and the line, and what to do", /descriptor\.mod/.test(r.error || "") && /older\.mod/.test(r.error || "") && /replace_path="history\/states"/.test(r.error || "") && /Nothing was changed/.test(r.error || ""), r.error);
    rec("…and nothing in the mod or the launcher's .mod changed", sameTree(modBefore, walk(w.mod)) && sha(w.launcher) === launcherBefore);
    const v = validate(w.ctx);
    rec("…so the world still loads its own states", v.states > 0 && !v.fatal.length, v);
  }

  // ── 2b. ⛔ a baseline saved before it recorded its `dirs` (2026-09-17) takes no folder out, so it is not refused (review of the
  // units-baseline fixes, R5): it held map/ only, and since then the mod gained history/states and a descriptor line replacing the base
  // game's. The refusal above said such a restore "would load with no state at all" and told the modder to take the line out — but the
  // restore leaves the mod's history/states where it is, and taking the line out would load the base game's states beside the mod's own.
  {
    const mod = path.join(D.mods, "oldest");
    const put = (rel, body) => { const p = path.join(mod, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
    put("descriptor.mod", 'name="oldest"\nsupported_version="1.19.*"\n');
    put("map/adjacency_rules.txt", "# world 1\n");
    const sb = md.saveMapBaseline({ modRoot: mod });
    const metaPath = path.join(sb.baselinePath, "_baseline.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    // what Nova wrote before 2026-09-17: no `dirs`, no `asked`, no `descriptors`
    fs.writeFileSync(metaPath, JSON.stringify({ savedAt: meta.savedAt, modRoot: meta.modRoot }, null, 2));
    put("map/adjacency_rules.txt", "# world 2\n");
    const statesFile = put("history/states/1-STATE_1.txt", 'state = { id = 1 name = "STATE_1" provinces = { 1 } }\n');
    const descriptor = put("descriptor.mod", 'name="oldest"\nreplace_path="history/states"\nsupported_version="1.19.*"\n');
    const descriptorBefore = sha(descriptor), statesBefore = sha(statesFile);
    const r = md.restoreMapBaseline({ modRoot: mod, gameRoot: path.join(ROOT, "fresh-game") });
    rec("⭐⭐ a baseline older than `dirs` is not refused for the descriptor line: the restore answers ok and puts its map/ back",
      r.ok === true && !r.refused && (r.restored || []).map((d) => String(d).replace(/\\/g, "/")).join() === "map"
        && fs.readFileSync(path.join(mod, "map", "adjacency_rules.txt"), "utf8") === "# world 1\n", r);
    rec("⭐⭐ …leaves the mod's history/states where it is, and says it could not judge it",
      sha(statesFile) === statesBefore && (r.notJudged || []).some((d) => String(d).replace(/\\/g, "/") === "history/states"), r.notJudged);
    rec("⭐ …and leaves the descriptor's line as it is — no advice to take it out", sha(descriptor) === descriptorBefore && !/take the replace_path/.test(String(r.error || "")),
      fs.readFileSync(descriptor, "latin1"));
  }

  // ── 3. a descriptor that needs the change and is read-only: refused before anything is written
  {
    const w = freshWorld("locked");
    md.saveMapBaseline({ modRoot: w.mod });
    generateAWorld(w);
    fs.chmodSync(w.launcher, 0o444);
    let readOnly = false; try { fs.accessSync(w.launcher, fs.constants.W_OK); } catch (_) { readOnly = true; }
    const modBefore = walk(w.mod), launcherBefore = sha(w.launcher);
    const r = md.restoreMapBaseline(w.ctx);
    fs.chmodSync(w.launcher, 0o666);
    rec("control — the launcher's .mod is read-only", readOnly);
    rec("a read-only descriptor that needs the change refuses the restore, naming it", !r.ok && r.refused === "descriptor-read-only" && (r.error || "").includes(w.launcher), r);
    rec("…before anything is written", sameTree(modBefore, walk(w.mod)) && sha(w.launcher) === launcherBefore);
  }

  // ── 4. the line work itself, on text
  {
    const inScope = (v) => ["map", "history/states", "history/countries", "history/units"].some((d) => v === d || v.startsWith(d + "/"));
    const now = 'name="x"\r\n# my own line\r\nreplace_path="history/states" \r\nreplace_path="gfx/flags"\r\n#replace_path="history/countries"\r\nreplace_path="map/strategicregions"';
    const r1 = md.realignReplacePathLines(now, 'name="x"\r\nreplace_path="gfx/flags"\r\n', inScope);
    rec("a line the baseline lacks comes out whole; a folder outside the map's and a commented line are left; the file's last line keeps the newline before it",
      r1.text === 'name="x"\r\n# my own line\r\nreplace_path="gfx/flags"\r\n#replace_path="history/countries"\r\n' && JSON.stringify(r1.removed) === JSON.stringify(["history/states", "map/strategicregions"]), r1);
    const r2 = md.realignReplacePathLines('ï»¿name="x"\r\nversion="1"\r\n', 'name="x"\nreplace_path="history/states"\n', inScope);
    rec("a line the baseline has goes back after the name line, in the file's own line ending, its BOM kept",
      r2.text === 'ï»¿name="x"\r\nreplace_path="history/states"\r\nversion="1"\r\n' && JSON.stringify(r2.added) === '["history/states"]', r2);
    const r3 = md.realignReplacePathLines('name="x"\nreplace_path="history/states" replace_path="map/x"\n', 'name="x"\n', inScope);
    rec("a line holding more than its one replace_path is left, and named", r3.stuck === 'replace_path="history/states" replace_path="map/x"' && r3.text.includes("replace_path"), r3);
    const r4 = md.realignReplacePathLines('name="x"\nreplace_path="History\\States\\"\n', 'name="x"\nreplace_path="history/states"\n', inScope);
    rec("a line spelled another way is the same line (slashes, case, a trailing slash)", r4.text === 'name="x"\nreplace_path="History\\States\\"\n' && !r4.added.length && !r4.removed.length, r4);
  }
} catch (e) {
  rec("the flow runs", false, e && e.stack);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a restored baseline puts back the lines that load it: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
