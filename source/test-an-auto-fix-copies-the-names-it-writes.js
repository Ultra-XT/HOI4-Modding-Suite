// ⛔ #an-auto-fixs-names-are-in-its-copies, #a-file-a-click-made-has-no-before, #a-renamed-file-is-a-made-file — AN AUTO-FIX CLICK'S
// FOLDER OF COPIES HOLDS EVERY FILE THE CLICK CHANGED, AS IT WAS, AND NOTHING THE CLICK MADE (B6-20).
//
// 🔧 Auto-fix's line says "Changed N files. A copy of all of them was saved first, outside your mod, at: <folder>". On a Nova-generated
// world one click changed 17 files (+4 ~12 -1) and the line said 4 (repro-B6-20):
//   · the states' names (localisation/*/replace/nova_state_names_l_*.yml, ten languages) were written by POST /api/map/auto-fix AFTER
//     mapData.autoFixMap's backup scope had closed, so they were neither counted nor in the folder;
//   · the folder held a state file the click itself had made (the id floor's) and a later pass of the same click rewrote, copied
//     mid-click as if it had a "before": copying the folder back over the mod, what it is laid out for, left state ids in two files;
//   · a state the gap-closer renumbers is written in place and then renamed (map-data.js renumberStateId), so its new file was counted
//     nowhere, and `created` said 3 of a click that made 4 files.
// Now the route opens the scope around autoFixMap AND the names writers (scopes nest; the outermost owns the folder), a file that was
// not in its folder when the scope first touched that folder is the click's own (not copied, counted as created), and the files that
// arrive in a folder without a write of their own are counted as the scope ends.
// (#generate-land-leaves-no-fatal, B5-WD1: autoFixMap and the names writers are now ONE function, autoFixMapAndItsNames, which 🌍 Generate
// land runs too, inside its own scope. The route calls it between the scope's open and close; §0 reads the function's body for the
// writers, and checks that it opens and closes no scope of its own.)
//
// Sections: 0, the wiring read from server.js (comments masked); 1, safe-write.js's scope alone; 2, the route, driven with the
// page's own requests (public/map.js: queueWrite's create-state { name: "", owner } and move-province { provinceId, toStateId }, and the
// Map Errors popup's POST /api/map/auto-fix { modPath }).
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const W = lib.makeWorld("autofix-names-copies");
process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const SW = require("./safe-write.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const put = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
/** every file of a folder by its path in it, with its sha: testlib-two-layer-map.js tree(), which outlasts a name that dies between the
 *  listing and the read (#a-file-listed-is-not-a-file-still-there: the on-access scanner's "<NAME>.TXT.tmp" beside a file Nova just
 *  renamed over). This walker of its own read every name it was handed and threw ENOENT out of a run now and then (b2b4 integration, s). */
const filesOf = (dir) => new Map(Object.entries(lib.tree(dir)));
/** …and a file the click made, taken back out: one already gone is the file gone (the scanner's own file, gone by itself) */
const takeOut = (p) => { try { fs.unlinkSync(p); } catch (e) { if (!(e && e.code === "ENOENT")) throw e; } };
/** what a click did to a folder: the files it changed, removed and added */
const delta = (before, after) => ({
  changed: [...before.keys()].filter((k) => after.has(k) && after.get(k) !== before.get(k)).sort(),
  removed: [...before.keys()].filter((k) => !after.has(k)).sort(),
  added: [...after.keys()].filter((k) => !before.has(k)).sort(),
});

console.log("0. The wiring, read from server.js (comments masked)");
{
  const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const code = maskJsComments(SRC), lits = maskJsLiterals(SRC);
  const at = code.indexOf('app.post("/api/map/auto-fix"');
  const b = at < 0 ? null : jsBodyAt(lits, at);
  const body = b ? code.slice(b[0], b[1] + 1) : "";
  // the click's work: autoFixMap and the names writers, in the one function the route (and 🌍 Generate land) calls
  const wAt = code.indexOf("function autoFixMapAndItsNames(");
  const wb = wAt < 0 ? null : jsBodyAt(lits, wAt);
  const work = wb ? code.slice(wb[0], wb[1] + 1) : "";
  rec("the auto-fix route is found and its handler read whole, and the work it calls (autoFixMapAndItsNames) too",
    body.length > 500 && /\bautoFixMapAndItsNames\(/.test(body) && /mapData\.autoFixMap\(/.test(work), { at, len: body.length, wAt, workLen: work.length });
  const begins = [...body.matchAll(/safeWrite\.beginBackupScope\(/g)].length, ends = [...body.matchAll(/safeWrite\.endBackupScope\(\)/g)].length;
  const begin = body.indexOf("safeWrite.beginBackupScope("), fix = body.search(/\bautoFixMapAndItsNames\(/), end = body.indexOf("safeWrite.endBackupScope()");
  rec("⭐⭐⭐ the route opens ONE backup scope, before the work runs, and closes it in a finally", begins === 1 && ends === 1 && begin !== -1 && begin < fix && fix < end && /\}\s*finally\s*\{\s*scopeSnap\s*=\s*safeWrite\.endBackupScope\(\);\s*\}/.test(body), { begins, ends, begin, fix, end });
  // every call the handler makes after autoFixMap answers is a writer that must land inside the scope: none comes after the close
  // but the answer itself
  const tail = end === -1 ? "" : body.slice(end + "safeWrite.endBackupScope()".length, body.indexOf("res.json(result)", end));
  const callsAfter = [...tail.matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)].map((m) => m[1]).filter((n) => n !== "if");
  rec("⭐⭐⭐ …and nothing the click runs comes after the close: every names writer is inside the scope", end !== -1 && callsAfter.length === 0 && /result\.fixes\.backupSnapshot\s*=\s*scopeSnap/.test(tail), { callsAfter, tail: tail.slice(0, 300) });
  const writers = ["forgetAutoFixRemovedStateNames(", "rekeyRenumberedStateNames(", "localiseNewStateNames(", "nameNewStates("];
  const fixInWork = work.indexOf("mapData.autoFixMap(");
  rec("…the four names writers among what the work runs, after autoFixMap answers", fixInWork !== -1 && writers.every((w) => work.indexOf(w) > fixInWork), writers.map((w) => work.indexOf(w)));
  rec("⭐⭐ …and the work opens and closes no scope of its own: it runs inside its caller's", work.length > 0 && !/safeWrite\.(begin|end)BackupScope\(/.test(work), { workLen: work.length });
}

console.log("\n1. safe-write.js alone: what a scope copies and what it counts");
{
  const R = path.join(W.ROOT, "unit-mod"), D = path.join(W.ROOT, "unit-scope");
  const A = put(R, "history/states/1-A.txt", "a before\n");
  const F = put(R, "history/states/5-F.txt", "f before\n");
  const K = put(R, "history/states/9-Kept.txt", "kept before\n");
  put(R, "map/buildings.txt", "buildings before\n");
  const before = filesOf(R);
  SW.beginBackupScope({ dir: D, root: R });
  let snap = null, inner = null;
  try {
    SW.safeModWrite(A, "a changed\n", "map-test");                                       // an existing file: its before is copied
    const N = path.join(R, "history", "states", "20-New.txt");
    SW.safeModWrite(N, "made by the click\n", "map-test");                              // a file the click makes…
    SW.safeModWrite(N, "made, then written again by a later pass\n", "map-test");       // …and writes again: no "before" to copy
    SW.safeModWrite(F, "f rewritten in place\n", "map-test");                           // a state written in place…
    const G = path.join(R, "history", "states", "4-F.txt");
    fs.renameSync(F, G);                                                                 // …then renamed, as renumberStateId does…
    SW.safeModWrite(G, "f under its new name, written again\n", "map-test");            // …and written again under its new name
    fs.copyFileSync(K, path.join(R, "history", "states", "21-Copied.txt"));             // a file that arrives with no write of its own
    const T = path.join(R, "history", "states", "22-Gone.txt");
    SW.safeModWrite(T, "made and then deleted\n", "map-test"); fs.unlinkSync(T);       // made and gone again: left in place by nobody
    fs.writeFileSync(path.join(R, "history", "states", "9-Kept.txt.tmp-123-456"), "a write's temp file");   // not a file of the click's
    SW.beginBackupScope({ dir: path.join(W.ROOT, "never-made"), root: R });             // a nested scope: the outer one owns the folder
    try { SW.safeModWrite(path.join(R, "map", "buildings.txt"), "buildings changed\n", "map-test"); } finally { inner = SW.endBackupScope(); }
  } finally { snap = SW.endBackupScope(); }
  fs.unlinkSync(path.join(R, "history", "states", "9-Kept.txt.tmp-123-456"));
  const after = filesOf(R), d = delta(before, after), held = filesOf(D);
  rec("THE CONTROL: the scope changed 2 files in place, removed 1 by renaming it, and left 3 new files", JSON.stringify(d) === JSON.stringify({
    changed: ["history/states/1-A.txt", "map/buildings.txt"], removed: ["history/states/5-F.txt"], added: ["history/states/20-New.txt", "history/states/21-Copied.txt", "history/states/4-F.txt"] }), d);
  rec("⭐⭐ the folder holds every file the scope changed or removed, each as it was before", [...d.changed, ...d.removed].every((k) => held.get(k) === before.get(k)), [...held.keys()]);
  rec("⭐⭐⭐ …and NOTHING the scope made: not the file it made and wrote again, not the renamed file it wrote under its new name", [...held.keys()].sort().join(",") === [...d.changed, ...d.removed].sort().join(","), [...held.keys()]);
  rec("⭐⭐ the answer counts the copies, and the files the scope left made: the renamed one and the one that arrived among them", !!snap && snap.dir === D && snap.files === 3 && snap.failed === 0 && snap.created === d.added.length, snap);
  rec("…and the nested scope's own close named the outer folder, not its own", !!inner && inner.dir === D && !fs.existsSync(path.join(W.ROOT, "never-made")), inner);
  // the folder is laid out to be copied back over the mod: that, and taking out the files the click made, is the mod as it was
  fs.cpSync(D, R, { recursive: true, force: true });
  for (const k of d.added) takeOut(path.join(R, ...k.split("/")));
  const back = filesOf(R);
  rec("⭐⭐⭐ copying the folder back and taking out the `created` files the click made gives the mod back byte for byte", back.size === before.size && [...before].every(([k, s]) => back.get(k) === s), { before: before.size, back: back.size });
}

(async () => {
  const { createApp } = require("./server.js");
  let S = null;
  try {
    S = await lib.startServer(createApp);
    const NAMES_REL = "localisation/english/replace/nova_state_names_l_english.yml";
    /** One click on `mod`, and what it says against what it did. `addedAtLeast`: how many files the click must make for the case to be the one meant. */
    const clickAndCheck = async (what, mod, { deleted, from, to, addedAtLeast }) => {
      const before = filesOf(mod);
      const fx = await S.autoFix(mod);
      const after = filesOf(mod), d = delta(before, after);
      const fixes = (fx.body && fx.body.fixes) || {}, es = fixes.emptyStates || {}, sg = fixes.stateGaps || {}, snap = fixes.backupSnapshot || null;
      rec(`THE CONTROL (${what}): Auto-fix deleted the empty state ${deleted} and renumbered ${from} into its id`, fx.status === 200 && fx.body.ok === true && (es.deleted || []).includes(deleted) && (sg.renumbered || []).some((x) => x.from === from && x.to === to), { status: fx.status, es, sg, error: fx.body && fx.body.error });
      rec(`THE CONTROL (${what}): …rewrote Nova's state-names file once autoFixMap had answered, and made ${addedAtLeast ? "the renumbered state's file under a new name" : "no file of a new name"}`, d.changed.includes(NAMES_REL) && (!!fx.body.nameLocalisation || !!fx.body.stateNameKeys) && d.added.length >= addedAtLeast && (addedAtLeast || d.added.length === 0), { d, nameLocalisation: fx.body.nameLocalisation, stateNameKeys: fx.body.stateNameKeys });
      const held = snap && snap.dir ? filesOf(snap.dir) : new Map();
      rec(`⭐⭐⭐ (${what}) the click's folder holds Nova's state-names file, as it was before the click`, held.has(NAMES_REL) && held.get(NAMES_REL) === before.get(NAMES_REL), { snap, held: [...held.keys()] });
      rec(`⭐⭐⭐ (${what}) …and every other file the click changed or removed, each as it was, and nothing it made`, [...held.keys()].sort().join(",") === [...d.changed, ...d.removed].sort().join(",") && [...held].every(([k, s]) => before.get(k) === s), { held: [...held.keys()], d });
      rec(`⭐⭐ (${what}) the answer counts the ${d.changed.length + d.removed.length} copies, and the ${d.added.length} file(s) the click made`, !!snap && snap.files === d.changed.length + d.removed.length && snap.failed === 0 && snap.created === d.added.length, { snap, d });
      if (snap && snap.dir) fs.cpSync(snap.dir, mod, { recursive: true, force: true });
      for (const k of d.added) takeOut(path.join(mod, ...k.split("/")));
      const back = filesOf(mod);
      rec(`⭐⭐⭐ (${what}) copying the folder back and taking out the files the click made gives the mod back as it was before the click`, back.size === before.size && [...before].every(([k, s]) => back.get(k) === s), { before: before.size, back: back.size, differ: [...before].filter(([k, s]) => back.get(k) !== s).map(([k]) => k) });
    };

    console.log("\n2. The route, on a mod's own states: 4 is empty, 5 is not — Auto-fix deletes 4, slides 5 into its id under a new file name, and redoes the names");
    {
      const BOM = String.fromCharCode(0xfeff);
      const mod = W.mod("Names in the copies", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/4-Empty.txt": 'state = {\n\tid = 4\n\tname = "STATE_4"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n',
        "history/states/5-Five.txt": 'state = {\n\tid = 5\n\tname = "STATE_5"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 5 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n',
        [NAMES_REL]: `${BOM}l_english:\n STATE_4:0 "Gone"\n STATE_5:0 "Fifth"\n`,
      });
      await clickAndCheck("own states", mod, { deleted: 4, from: 5, to: 4, addedAtLeast: 1 });
    }

    console.log("\n3. The route, on states the page made: + New state twice, a province moved into the second — the renumbered file takes the gone one's name");
    {
      const mod = W.mod("Names in the copies, made by the page", {});
      const a = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const b = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const mv = await S.post("/api/map/move-province", { provinceId: 5, toStateId: b.body.id }, mod);
      rec("THE CONTROL: two states made, a province moved into the second", a.body.ok === true && b.body.ok === true && mv.body.ok === true && b.body.id === a.body.id + 1, { a: a.body, b: b.body, mv: mv.body });
      await clickAndCheck("states the page made", mod, { deleted: a.body.id, from: b.body.id, to: a.body.id, addedAtLeast: 0 });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an auto-fix copies the names it writes: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
})();
