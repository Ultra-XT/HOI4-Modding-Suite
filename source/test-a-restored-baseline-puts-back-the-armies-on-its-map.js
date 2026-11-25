// ⛔ #a-restored-map-keeps-its-armies — RESTORE BASELINE PUTS BACK THE ARMIES AND FLEETS THAT STAND ON THE MAP IT PUTS BACK.
//
// THE DEFECT (review of the merged map editor, merge-integrity MI-3). A baseline held map/, history/states and history/countries, and
// not history/units. A re-roll after it (Delete map, Generate land on another seed, Auto-fix) rewrites the mod's own order-of-battle
// files onto the second world's province ids — the fold moves units off the first world's cut pieces, the crash repair and Auto-fix
// re-berth fleets and move divisions — and Restore then put the first world's map back under the second world's units: divisions at
// sea and units on ids the restored definition.csv has no row for, under a confirm that says "It does guarantee the game loads".
//
// THE RULE NOW. history/units is one of the baseline's directories, restored with the map; a baseline records which directories it
// was asked (`asked`), so one saved before history/units was asked leaves the mod's units alone and says it could not judge them.
// ⛔ …AND THE PAGE PROMISES ONLY WHAT THE BASELINE HOLDS (review of the units-baseline fixes, R2). Every baseline saved before that —
// every one the owner already has — holds neither the units nor the descriptor's lines, and on the owner's TEST 37 such a baseline, a
// re-roll and a Restore left 160 fleets on land with no sea (FATAL) under the same "It does guarantee the game loads". baseline-info
// says what a baseline holds (heldUnits, heldDescriptors), the restore says its units were left because it does not (unitsNotHeld), and
// the confirm, the button's title and the note after it — lifted out of public/map.js and run on those answers — promise the game
// loads only for a baseline that holds both, and otherwise say what stays as it is and that Auto-fix moves what Map Errors lists.
//
// On testlib-split-world's world with a navy (four fleets each, at harbours on the coast below) and an army of 60 each: Generate land
// seed 9 -> Auto-fix -> Save baseline -> Delete map -> Generate land seed 4 -> Auto-fix -> Restore baseline. The units are judged by the
// test's own reader of the mod's history/units files against the mod's definition.csv and provinces.bmp. No port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-armies-"));
const D = { mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(D)) { D[k] = path.join(ROOT, D[k]); fs.mkdirSync(D[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_MODS_ROOT: D.mods, NOVA_HOME_DIR: D.home, APPDATA: D.app, NOVA_APP_DATA_DIR: D.app, XDG_CONFIG_HOME: D.app,
  HOI4_USER_DIR: D.user, NOVA_DOCUMENTS_DIR: D.docs, HOI4_WORKSHOP_ROOT: D.ws,
});
delete process.env.NOVA_WORLD_JOB;
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const W = SW.W, H = SW.H;

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
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// a world with a navy and an army; the mod Delete map leaves
function world(name) {
  const S = SW.makeShapes();
  const game = path.join(ROOT, name + "-game");
  const g = SW.makeGame(game, S, { divisions: { AAA: 60, BBB: 60 } });
  const coastBelow = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = S.gameIds[y * W + x];
    if (S.typeOf(a) !== "land") continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      if (S.typeOf(S.gameIds[yy * W + ((x + dx + W) % W)]) === "sea") { coastBelow.add(a); break; }
    }
  }
  const ownerOf = new Map(); for (const s of g.states) for (const p of s.provinces) ownerOf.set(p, s.owner);
  for (const t of ["AAA", "BBB"]) {
    const ports = [...coastBelow].filter((p) => ownerOf.get(p) === t).sort((a, b) => a - b).slice(0, 4);
    for (const s of g.states.filter((x) => x.owner === t)) {
      const here = ports.filter((p) => s.provinces.includes(p));
      if (!here.length) continue;
      const f = path.join(game, "history", "states", `${s.id}-STATE_${s.id}.txt`);
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/(\t\tbuildings = \{\n)/, (m) => m + here.map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")));
    }
    const fleets = ports.map((p, i) => `\tfleet = {\n\t\tname = "${t} Fleet ${i + 1}"\n\t\tnaval_base = ${p}\n\t\ttask_force = {\n\t\t\tname = "${t} TF ${i + 1}"\n`
      + `\t\t\tlocation = ${p}\n\t\t\tship = { name = "${t} ${i + 1}" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = ${t} } } }\n\t\t}\n\t}\n`).join("");
    fs.writeFileSync(path.join(game, "history", "units", `${t}_naval.txt`), `units = {\n${fleets}}\n`);
    fs.appendFileSync(path.join(game, "history", "countries", `${t} - Land of ${t}.txt`), `set_naval_oob = "${t}_naval"\n`);
  }
  const mod = SW.makeMod(path.join(D.mods, name), S, { name });
  return { S, mod, ctx: { modRoot: mod, gameRoot: game, dependencyRoots: [] } };
}
// the test's own judge: every unit in the mod's own history/units files, against a map's definition.csv and provinces.bmp
function judge(unitsDir, mapDir) {
  const def = SW.readDef(path.join(mapDir, "definition.csv"));
  const ids = SW.decode(path.join(mapDir, "provinces.bmp"), def).ids;
  const typeNow = (p) => (def.rows.get(p) || {}).type;
  const seaBeside = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ids[y * W + x];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const yy = y + dy; if (yy >= H) continue;
      const b = ids[yy * W + ((x + dx) % W)];
      if (a === b) continue;
      if (typeNow(b) === "sea") seaBeside.add(a);
      if (typeNow(a) === "sea") seaBeside.add(b);
    }
  }
  const out = { tf: 0, div: 0, stranded: [] };
  for (const f of fs.existsSync(unitsDir) ? fs.readdirSync(unitsDir) : []) {
    const t = fs.readFileSync(path.join(unitsDir, f), "utf8").replace(/#[^\r\n]*/g, "");
    for (const m of t.matchAll(/\b(task_force|division)\s*=\s*\{[^{}]*?location\s*=\s*(\d+)/g)) {
      const p = +m[2], ty = typeNow(p);
      if (m[1] === "task_force") out.tf++; else out.div++;
      if (!def.rows.has(p)) out.stranded.push(`${f}@${p} no such province`);
      else if (m[1] === "task_force" && ty === "land" && !seaBeside.has(p)) out.stranded.push(`${f}@${p} fleet on land with no sea`);
      else if (m[1] === "division" && (ty === "sea" || ty === "lake")) out.stranded.push(`${f}@${p} division on water`);
    }
  }
  return out;
}
// ⛔ the page's words for it (review of the units-baseline fixes, R2): the confirm, the button's title and the note after the restore,
// lifted out of public/map.js by their declarations and brace-counted bodies (either line ending) and run on what the server answers
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
const MAPJS_RAW = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MAPJS = maskJsComments(MAPJS_RAW);
const liftPure = (name) => {
  const at = MAPJS.indexOf(`function ${name}(`);
  const body = at < 0 ? null : jsBodyAt(maskJsLiterals(MAPJS_RAW), at);
  try { return body ? new Function(`${MAPJS_RAW.slice(at, body[1] + 1)}\nreturn ${name};`)() : null; } catch (_) { return null; }
};
const confirmText = liftPure("baselineRestoreConfirmText"), titleText = liftPure("baselineRestoreTitle"), notJudgedNote = liftPure("baselineNotJudgedNote");
const GUARANTEE = /guarantee(s)? the game loads/;
const reroll = (w, seed) => {
  md.blankMapToSea(w.ctx);
  md.generateLand(Object.assign({ count: Math.round(w.S.N * 0.35), seed, ownerMode: "inherit", owner: "" }, w.ctx));
  md.autoFixMap(w.ctx);
};

try {
  // ── 0. the page asks the baseline what it holds, and says it
  {
    rec("the confirm, the title and the note are lifted out of public/map.js", [confirmText, titleText, notJudgedNote].every((f) => typeof f === "function"));
    const at = MAPJS.indexOf('restoreBaseBtn.addEventListener("click"'), h = at < 0 ? "" : MAPJS.slice(at, MAPJS.indexOf("No dialog and no yes", at));
    rec("⭐⭐ the Restore click asks baseline-info what the baseline holds, and builds its confirm from that answer",
      /await fetch\(`\/api\/map\/baseline-info\?modPath=\$\{encodeURIComponent\(modPath\(\)\)\}`\)/.test(h) && /const restoreMsg = baselineRestoreConfirmText\(baseInfo\);/.test(h) && /novaConfirm\(restoreMsg,/.test(h), h.length);
    rec("⭐ …its status line says what it could not judge through baselineNotJudgedNote, with the answer's unitsNotHeld",
      /baselineNotJudgedNote\(\{ notJudged: r\.notJudged \|\| \[\], unitsNotHeld: r\.unitsNotHeld \}\)/.test(h), h.length);
    const from = MAPJS.indexOf("function baselineRestoreConfirmText("), to = MAPJS.indexOf("function baselineNotJudgedNote(");
    const promises = [...MAPJS.matchAll(/guarantees? the game loads/g)].map((m) => m.index);
    rec("⭐ …and the button's title is baselineRestoreTitle's — no line of the page outside those two promises the game loads",
      /restoreBaseBtn\.title = baselineRestoreTitle\(info\);/.test(MAPJS) && from > 0 && to > from && promises.length > 0 && promises.every((i) => i > from && i < to),
      promises.filter((i) => !(i > from && i < to)).map((i) => MAPJS.slice(Math.max(0, i - 80), i + 30).replace(/\s+/g, " ")));
  }

  // ── 1. a baseline of world 1, restored after a re-roll
  {
    const w = world("armies");
    md.generateLand(Object.assign({ count: Math.round(w.S.N * 0.35), seed: 9, ownerMode: "inherit", owner: "" }, w.ctx));
    md.autoFixMap(w.ctx);
    const units = path.join(w.mod, "history", "units");
    const units1 = tree(units), j1 = judge(units, path.join(w.mod, "map"));
    rec(`control — world 1's own unit files place the navy and the army (${j1.tf} task forces, ${j1.div} divisions) and strand none`, j1.tf > 0 && j1.div > 0 && !j1.stranded.length, j1.stranded.slice(0, 6));
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    rec("Save baseline holds history/units", sb.ok && (sb.dirs || []).some((d) => String(d).replace(/\\/g, "/") === "history/units"), sb.dirs);
    const info = md.getMapBaselineInfo({ modRoot: w.mod });
    rec("⭐ baseline-info says this baseline holds the armies and fleets and the descriptor's lines", info.heldUnits === true && info.heldDescriptors === true, info);
    const say = confirmText ? String(confirmText(info)) : "";
    // ⚠️ MOVED WITH B6-5 (#a-baseline-guarantees-only-what-its-check-said): holding the armies and the lines is no longer enough for the
    // promise — the baseline's own check, stored when it was saved (getMapBaselineInfo's heldVerdict), must have found nothing Save stops
    // for. This baseline is saved without a game folder, so with no verdict; the promise is asked of the same info with a clean one.
    const clean = info.heldVerdict && typeof info.heldVerdict.fatal === "number" && info.heldVerdict.fatal === 0;
    const checked = Object.assign({}, info, { heldVerdict: { fatal: 0, rules: [] } });
    rec("⭐ …so the confirm names the armies and fleets among what it puts back, and promises the game loads only with a clean check",
      /history\/units \(the armies and fleets\)/.test(say) && !/does not hold/.test(say) && /It does guarantee the game loads\./.test(say) === !!clean
        && /It does guarantee the game loads\./.test(String(confirmText(checked))), say);
    rec("…and so does the button's title", titleText && / — guarantees the game loads\./.test(String(titleText(checked))) && / — guarantees the game loads\./.test(String(titleText(info))) === !!clean, titleText && titleText(info));
    reroll(w, 4);
    const j2own = judge(units, path.join(w.mod, "map"));
    const j2on1 = judge(units, path.join(sb.baselinePath, "map"));
    rec(`control — the re-roll rewrote the unit files, and on world 1's map they would strand ${j2on1.stranded.length} units`,
      !sameTree(units1, tree(units)) && j2on1.stranded.length > 0 && !j2own.stranded.length, { onWorld1: j2on1.stranded.slice(0, 6), onWorld2: j2own.stranded.slice(0, 6) });
    const r = md.restoreMapBaseline(w.ctx);
    rec("Restore baseline answers ok and names history/units among what it restored", r.ok && (r.restored || []).some((d) => String(d).replace(/\\/g, "/") === "history/units"), r.ok ? r.restored : r.error);
    rec("the mod's own unit files are byte for byte world 1's", sameTree(units1, tree(units)), { was: units1.size, now: tree(units).size });
    const j3 = judge(units, path.join(w.mod, "map"));
    rec("on the restored map no unit is stranded", j3.tf === j1.tf && j3.div === j1.div && !j3.stranded.length, j3.stranded.slice(0, 6));
    const st = md.findUnitsStrandedByTheMap(w.ctx);
    const left = { fleets: st.fleets.length, homes: st.fleetHomes.length, divisions: st.divisions.length, laterFleets: st.laterFleets.length, laterDivisions: st.laterDivisions.length };
    rec("…and the search agrees", Object.values(left).every((n) => n === 0), left);
    const unitRules = (md.validateMapBitmap(w.ctx) || []).filter((p) => /^(fleet|division)_/.test(p.rule)).map((p) => `${p.rule}=${p.total || 1}`);
    rec("…and Map Errors names no fleet or division", !unitRules.length, unitRules);
    rec("…and the page says nothing about units it left", !r.unitsNotHeld && notJudgedNote && !/history\/units/.test(String(notJudgedNote(r))), { unitsNotHeld: r.unitsNotHeld, note: notJudgedNote && notJudgedNote(r) });
  }

  // ── 2. a baseline saved before history/units was one of its directories: the units are left, and said
  {
    const w = world("older");
    md.generateLand(Object.assign({ count: Math.round(w.S.N * 0.35), seed: 9, ownerMode: "inherit", owner: "" }, w.ctx));
    md.autoFixMap(w.ctx);
    const sb = md.saveMapBaseline({ modRoot: w.mod });
    const metaPath = path.join(sb.baselinePath, "_baseline.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    // what an older Nova wrote — every baseline before 3b083b4a, every one the owner already has: the three directories it had, and no
    // `asked`, no `descriptors` (review of the units-baseline fixes, R2)
    const three = (meta.dirs || []).filter((d) => String(d).replace(/\\/g, "/") !== "history/units");
    fs.writeFileSync(metaPath, JSON.stringify({ savedAt: meta.savedAt, modRoot: meta.modRoot, dirs: three, provinceSplits: meta.provinceSplits }, null, 2));
    const heldUnits = path.join(sb.baselinePath, "history", "units");
    if (fs.existsSync(heldUnits)) fs.renameSync(heldUnits, path.join(ROOT, "older-baseline-units-set-aside"));
    reroll(w, 4);
    const units = path.join(w.mod, "history", "units");
    const before = tree(units);
    const r = md.restoreMapBaseline(w.ctx);
    rec("an older baseline restores its three directories", r.ok && (r.restored || []).length === three.length, r.ok ? r.restored : r.error);
    rec("…leaves the mod's history/units as it is", sameTree(before, tree(units)) && before.size > 0);
    rec("…and says it could not judge it", (r.notJudged || []).some((d) => String(d).replace(/\\/g, "/") === "history/units") && !(r.movedAside || []).length, { notJudged: r.notJudged, movedAside: r.movedAside });
    // ⛔ R2 — and so the page must not promise the game loads: the units the re-roll rewrote stand on world 1's ids now
    const jr = judge(units, path.join(w.mod, "map"));
    rec(`control — after the restore, ${jr.stranded.length} of the re-roll's units stand stranded on the restored map (what the confirm promised could not happen)`, jr.stranded.length > 0, jr.stranded.slice(0, 6));
    const info = md.getMapBaselineInfo({ modRoot: w.mod });
    rec("⭐⭐ baseline-info says this baseline holds neither the armies and fleets nor the descriptor's lines", info.exists && info.heldUnits === false && info.heldDescriptors === false, info);
    const say = confirmText ? String(confirmText(info)) : "";
    rec("⭐⭐⭐ the confirm for it does not promise the game loads, and says the armies and fleets stay as they are on the restored map's ids, with Auto-fix to move them",
      !!say && !/It does guarantee the game loads/.test(say) && /does not guarantee the game loads/.test(say) && /does not hold them/.test(say) && /restored map's province ids/.test(say) && /Auto-fix all/.test(say)
        && !/armies and fleets\) made since/.test(say), say);
    rec("⭐⭐ …nor that it puts back the descriptor's replace_path lines: they stay as they are", !/puts back the replace_path lines/.test(say) && /replace_path lines[^.]*not in this baseline, so they stay as they are now/.test(say), say);
    rec("⭐ …and nor does the button's title", titleText && !/guarantees the game loads/.test(String(titleText(info))) && /check Map Errors/.test(String(titleText(info))), titleText && titleText(info));
    const note = notJudgedNote ? String(notJudgedNote(r)) : "";
    rec("⭐⭐⭐ the restore's answer says its armies and fleets were left because the baseline does not hold them (unitsNotHeld)", r.unitsNotHeld === true, r);
    rec("⭐⭐⭐ …and the page's note says so, with Auto-fix — not \"save a fresh baseline\", which would hold today's units",
      /history\/units\/ was left as it is/.test(note) && /restored map's province ids/.test(note) && /Auto-fix all moves them/.test(note)
        && !/history\/units\/ is in your mod but not in the baseline/.test(note) && !/Save a fresh baseline/.test(note), note);
    rec("THE CONTROL: a folder other than history/units an older baseline could not judge keeps the old sentence",
      notJudgedNote && /history\/states\/ is in your mod but not in the baseline[^.]*\. Save a fresh baseline to fix that\./.test(String(notJudgedNote({ notJudged: ["history\\states", "history\\units"], unitsNotHeld: true })))
        && /history\/units\/ was left as it is/.test(String(notJudgedNote({ notJudged: ["history\\states", "history\\units"], unitsNotHeld: true }))),
      notJudgedNote && notJudgedNote({ notJudged: ["history\\states", "history\\units"], unitsNotHeld: true }));
  }
} catch (e) {
  rec("the flow runs", false, e && e.stack);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a restored baseline puts back the armies on its map: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
