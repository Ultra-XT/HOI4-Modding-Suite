// ⛔ #a-momentary-read-failure-emptied-a-map-folder, THE JUDGEMENT SIDE — A FILE THAT IS BUSY FOR A MOMENT IS NOT
// A STATE THE MOD DOES NOT HAVE.
//
// Batch 13 gave readBlockFilesFromRoot a retry, and left ~90 other swallowed reads in map-data.js alone. Most of
// them cannot move an answer the modder acts on. Two can, and both decide what Nova WRITES or REPORTS about the
// one fatal map error class, duplicate state ids:
//
//   closeStateIdGaps      reads the mod's own state files to learn which ids it declares (present()), and the
//                         layers BENEATH it to learn which ids the game supplies anyway (the scan above it).
//                         A lost read on either side means "this id is not declared" — a GAP — and the
//                         gap-closer answers a gap by renumbering the highest state down into it.
//   findStateFileConflicts is the validator behind duplicate_state_id: the Mod Health crash check's list, its
//                         "🔧 Fix duplicate states" button, and Auto-fix's own reported-problem gate all read it.
//
// MEASURED by running this file against the unpatched tree — ONE injected EBUSY, in a child process wrapping
// fs.readFileSync before map-data.js is required:
//
//   closeStateIdGaps, a mod declaring states 1, 2 and 3, one lost read of 2-S.txt
//       clean    : { renumbered: [] }                       — nothing to do, the ids are contiguous
//       injected : { renumbered: [{ from: 3, to: 2 }] }     — and the mod is left with 2-S.txt: id 2 AND
//                                                             3-S.txt: id 2
//   findStateFileConflicts, a mod with a real duplicate id 1, one lost read of 1-restored.txt
//       clean    : ["duplicate_state_id:1"]
//       injected : []                                       — the crash class is not reported at all
//   closeStateIdGaps' BASE scan (section 7), vanilla supplying 1..3 and the mod adding 4, one lost read of
//   vanilla's own 3-V.txt — a mod is an overlay, and this is the same gap invented from the other side:
//       clean    : { renumbered: [] }                       — what the GAME loads is already contiguous
//       injected : { renumbered: [{ from: 4, to: 3 }] }     — the mod's state now declares id 3, which
//                                                             vanilla's unreplaced 3-V.txt declares too
//
// The first is the worse of the two: closeStateIdGaps' own header says it exists so the fixer cannot create
// "the fatal 'errors in the map definition' duplicate … in the same click that claimed to repair the map", and a
// 15 ms antivirus lock is enough to make it do precisely that.
//
// WHAT MUST NOT CHANGE, and is pinned below: a file that is REALLY unreadable is still skipped, is still refused
// on the first attempt (EACCES is a permission, not a lock), and a clean read still costs exactly one
// fs.readFileSync per file.
//
// Run: node test-a-momentary-read-failure-does-not-invent-a-state-id-gap.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const tmps = [];
const mk = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gapblip-" + tag + "-")); tmps.push(d); return d; };
const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();

// ── What safe-write.js calls transient, and how long its ladder is — DERIVED, never typed here ──────────────
const SW = require("./safe-write.js");
const SW_SRC = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
const LADDER = (() => {
  const m = SW_SRC.match(/RENAME_RETRY_MS\s*=\s*\[([^\]]*)\]/);
  return m ? m[1].split(",").map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
})();
const TRANSIENT = Array.isArray(SW.TRANSIENT_READ_CODES) ? SW.TRANSIENT_READ_CODES.slice() : [];

// ── the driver: a child process that wraps fs.readFileSync BEFORE map-data.js is required ───────────────────
const RIG = mk("rig");
const DRIVER = path.join(RIG, "driver.js");
fs.writeFileSync(DRIVER, `"use strict";
const fs = require("fs"), path = require("path");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const norm = (p) => String(p).replace(/\\\\/g, "/").toLowerCase();
const seen = { attempts: 0, thrown: 0 };
const real = fs.readFileSync;
fs.readFileSync = function (p, o) {
  if (typeof p === "string" && plan.pathContains && norm(p).indexOf(plan.pathContains) !== -1) {
    seen.attempts++;
    if (seen.thrown < plan.failures) {
      seen.thrown++;
      const e = new Error(plan.code + ": injected by the test, read '" + p + "'");
      e.code = plan.code;
      throw e;
    }
  }
  return real.call(fs, p, o);
};
const M = require(plan.mapData);
const out = {};
const t0 = Date.now();
try {
  if (plan.kind === "gaps") out.result = M.closeStateIdGaps(plan.mod, { gameRoot: plan.game, dependencyRoots: [] });
  else out.result = M.findStateFileConflicts(plan.mod).map((p) => p.rule + ":" + p.stateId).sort();
} catch (e) { out.err = String((e && e.message) || e); }
out.ms = Date.now() - t0;
out.attempts = seen.attempts;
out.thrown = seen.thrown;
// what each state file declares afterwards — two files with one id is the fatal duplicate
const idsIn = (dir) => {
  const o = {};
  for (const f of (function () { try { return fs.readdirSync(dir); } catch (_) { return []; } })()) {
    const t = real.call(fs, path.join(dir, f), "utf8");
    o[f] = (t.match(/\\bid\\s*=\\s*(\\d+)/g) || []).join(",");
  }
  return o;
};
out.idsPerFile = idsIn(path.join(plan.mod, "history", "states"));
// …and what the layers BENEATH it declare, so a mod state renumbered onto one of vanilla's is visible here too
out.baseIdsPerFile = plan.game ? idsIn(path.join(plan.game, "history", "states")) : {};
process.stdout.write(JSON.stringify(out));
`);

let run = 0;
function drive(kind, mod, game, { pathContains = null, code = "EBUSY", failures = 0 } = {}) {
  const planPath = path.join(RIG, `plan-${++run}.json`);
  fs.writeFileSync(planPath, JSON.stringify({
    mapData: path.join(__dirname, "map-data.js"), mod, game, kind, code, failures,
    pathContains: pathContains === null ? null : norm(pathContains),
  }));
  const r = spawnSync(process.execPath, [DRIVER, planPath], { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0 || !r.stdout) return { err: `driver exit ${r.status}: ${(r.stderr || "").slice(0, 300)}`, attempts: 0, thrown: 0 };
  try { return JSON.parse(r.stdout); } catch (_) { return { err: "unparsable: " + r.stdout.slice(0, 200), attempts: 0, thrown: 0 }; }
}

const GAME = mk("game");
w(GAME, "hoi4.exe", "x");

/** A mod whose state ids are contiguous 1..N — so a correct gap-closer has nothing to do. */
function gapMod(n) {
  const mod = mk("gap");
  w(mod, "descriptor.mod", 'name="gap blip"\nreplace_path="history/states"\n');
  for (let id = 1; id <= n; id++) {
    w(mod, `history/states/${id}-S.txt`, `state = {\r\n\tid = ${id}\r\n\tname = "S${id}"\r\n\tprovinces = { ${id} }\r\n\thistory = {}\r\n}\r\n`);
  }
  return mod;
}
/** A mod with a real duplicate state id — what the validator must report. */
function dupMod() {
  const mod = mk("dup");
  w(mod, "descriptor.mod", 'name="gap blip"\nreplace_path="history/states"\n');
  w(mod, "history/states/1-Real.txt", 'state = {\r\n\tid = 1\r\n\tname = "R"\r\n\tprovinces = { 11 }\r\n\thistory = {}\r\n}\r\n');
  w(mod, "history/states/1-restored.txt", 'state = {\r\n\tid = 1\r\n\tname = "S"\r\n\tprovinces = { 77 }\r\n\thistory = {}\r\n}\r\n');
  return mod;
}
/** A mod that OVERLAYS the base game: vanilla supplies states 1..n in files of its own, the mod adds the next id
 *  in a file of its own and replaces nothing — so what the GAME loads is contiguous and there is nothing to close.
 *  That only holds while the base layer can be read. */
function overlayMod(n) {
  const game = mk("game");
  w(game, "hoi4.exe", "x");
  for (let id = 1; id <= n; id++) {
    w(game, `history/states/${id}-V.txt`, `state = {\r\n\tid = ${id}\r\n\tname = "V${id}"\r\n\tprovinces = { ${id} }\r\n\thistory = {}\r\n}\r\n`);
  }
  const mod = mk("overlay");
  w(mod, "descriptor.mod", 'name="gap blip overlay"\n');       // NO replace_path: vanilla's own state files really load
  w(mod, `history/states/${n + 1}-M.txt`, `state = {\r\n\tid = ${n + 1}\r\n\tname = "M"\r\n\tprovinces = { ${(n + 1) * 100} }\r\n\thistory = {}\r\n}\r\n`);
  return { mod, game };
}
const idsOf = (ids) => String(ids || "").split(",").filter(Boolean).map((one) => one.replace(/[^0-9]+/g, ""));
const oneIdPerFile = (idsPerFile) => {
  const seen = new Set();
  for (const ids of Object.values(idsPerFile || {})) for (const one of String(ids).split(",").filter(Boolean)) {
    if (seen.has(one)) return false;
    seen.add(one);
  }
  return true;
};
/** Ids declared by BOTH a mod state file and a base file the mod does not replace by name — i.e. loaded twice. */
const crossLayerDuplicates = (r) => {
  const modIds = new Set();
  for (const ids of Object.values(r.idsPerFile || {})) for (const one of idsOf(ids)) modIds.add(one);
  const replaced = new Set(Object.keys(r.idsPerFile || {}).map((f) => f.toLowerCase()));
  const out = [];
  for (const [f, ids] of Object.entries(r.baseIdsPerFile || {})) {
    if (replaced.has(f.toLowerCase())) continue;               // the mod ships a file of that name, so this one does not load
    for (const one of idsOf(ids)) if (modIds.has(one)) out.push(f + " and the mod both declare " + one);
  }
  return out;
};

try {
  console.log("0. The rig, and the ladder it reads out of safe-write.js");
  rec("safe-write.js still owns one retry ladder", LADDER.length >= 2, LADDER);
  rec("…and still names the read codes worth waiting out", TRANSIENT.length > 0 && TRANSIENT.includes("EBUSY"), TRANSIENT);
  rec("…and still refuses EACCES, which does not go away by waiting", !TRANSIENT.includes("EACCES"), TRANSIENT);

  console.log("\n1. THE CONTROL: with nothing injected, both answers are right");
  {
    const mod = gapMod(3);
    const clean = drive("gaps", mod, GAME);
    rec("a contiguous mod has no gap to close", !!clean.result && clean.result.renumbered.length === 0, clean);
    rec("…and every state file still declares its own id", oneIdPerFile(clean.idsPerFile), clean.idsPerFile);
    const dm = dupMod();
    const cleanC = drive("conflicts", dm, GAME);
    rec("a real duplicate id IS reported", (cleanC.result || []).includes("duplicate_state_id:1"), cleanC.result);
  }

  console.log("\n2. …and a clean read still costs exactly one fs.readFileSync per file");
  {
    const mod = gapMod(6);
    const dir = path.join(mod, "history", "states");
    const files = fs.readdirSync(dir).length;
    const r = drive("gaps", mod, GAME, { pathContains: dir });
    rec(`the gap-closer reads ${files} file(s) once each (${r.attempts} reads)`, r.attempts === files, { files, attempts: r.attempts });
    const dm = dupMod();
    const ddir = path.join(dm, "history", "states");
    const dfiles = fs.readdirSync(ddir).length;
    const rc = drive("conflicts", dm, GAME, { pathContains: ddir });
    rec(`the conflict scan reads ${dfiles} file(s) once each (${rc.attempts} reads)`, rc.attempts === dfiles, { files: dfiles, attempts: rc.attempts });
  }

  console.log("\n3. ⭐⭐⭐ One momentary failure must not invent a state-id gap — or the fixer renumbers into it");
  for (const code of (TRANSIENT.length ? TRANSIENT : ["EBUSY"])) {
    const mod = gapMod(3);
    const r = drive("gaps", mod, GAME, { pathContains: path.join(mod, "history", "states", "2-S.txt"), code, failures: 1 });
    rec(`one ${code} on 2-S.txt leaves the map alone (no phantom gap, no renumber)`,
      r.thrown === 1 && !!r.result && r.result.renumbered.length === 0, { thrown: r.thrown, result: r.result });
    rec(`…and no two state files end up declaring one id (the fatal duplicate)`,
      oneIdPerFile(r.idsPerFile), r.idsPerFile);
  }

  console.log("\n4. ⭐⭐⭐ One momentary failure must not hide a duplicate state id from the crash check");
  for (const code of (TRANSIENT.length ? TRANSIENT : ["EBUSY"])) {
    const dm = dupMod();
    const r = drive("conflicts", dm, GAME, { pathContains: path.join(dm, "history", "states", "1-restored.txt"), code, failures: 1 });
    rec(`one ${code} on 1-restored.txt still reports duplicate_state_id`,
      r.thrown === 1 && (r.result || []).includes("duplicate_state_id:1"), { thrown: r.thrown, result: r.result });
  }

  console.log("\n5. PINNED: a file that is REALLY unreadable is still skipped, and refused promptly");
  {
    // ⚠️ COUNTED AS A RATIO, NOT AS A NUMBER. The gap-closer reads a state file several times in one run (the
    // id scan, then the renumber pass), and how many times depends on what it decides — so "attempts === 1" is
    // not the question. The question is what ONE read costs: a permission must cost one attempt where a lock
    // costs the whole ladder. Both runs below take the same decision (the file is skipped either way), so they
    // make the same number of READ CALLS and the ratio between their attempts is the ladder, derived from
    // safe-write.js rather than typed here.
    const acc = drive("gaps", gapMod(3), GAME, { pathContains: "2-s.txt", code: "EACCES", failures: 9999 });
    const forever = drive("gaps", gapMod(3), GAME, { pathContains: "2-s.txt", code: "EBUSY", failures: 9999 });
    const eis = drive("gaps", gapMod(3), GAME, { pathContains: "2-s.txt", code: "EISDIR", failures: 9999 });
    rec("a really unreadable file is still skipped, and the answer still comes back",
      !acc.err && !!acc.result && !forever.err && !!forever.result, { eacces: acc.err || "", ebusy: forever.err || "" });
    // ⚠️ AND NOT AS AN EXACT RATIO EITHER. The first version of this check asserted
    // ebusy === eacces × (ladder + 1) and failed on a correct fix (21, not 25): the waiting is also bounded by
    // TRANSIENT_READ_BUDGET_MS per folder, so a folder that has gone unreadable stops paying the ladder partway
    // — which is the behaviour batch 13 designed and this file must not forbid. The ladder is the CEILING.
    rec("EACCES is not waited out where a lock is — a permission costs fewer attempts",
      acc.attempts > 0 && acc.attempts < forever.attempts,
      { eaccesAttempts: acc.attempts, ebusyAttempts: forever.attempts, ladder: LADDER.length });
    rec("…and so does EISDIR", eis.attempts === acc.attempts, { eisdir: eis.attempts, eacces: acc.attempts });
    rec("⭐⭐ a file that stays busy for ever is given up on after the ladder and no longer",
      forever.attempts <= acc.attempts * (LADDER.length + 1),
      { attempts: forever.attempts, ceiling: acc.attempts * (LADDER.length + 1) });
  }

  console.log("\n6. CONTROL: the injection really is what moves the answer");
  {
    // Same fixture, same path, ZERO failures: if this run also renumbered, section 3 would be vacuous.
    const mod = gapMod(3);
    const r = drive("gaps", mod, GAME, { pathContains: path.join(mod, "history", "states", "2-S.txt"), failures: 0 });
    rec("with nothing thrown on that same file, there is nothing to close", r.thrown === 0 && r.result.renumbered.length === 0, r);
  }

  console.log("\n7. ⭐⭐⭐ …and the same BENEATH the mod: a lost base read is not a state vanilla does not have");
  {
    // A MOD IS AN OVERLAY. closeStateIdGaps learns what the layers below supply by reading their state files too
    // (the loop above present()), and a lost read there drops an id vanilla really loads. That is the same phantom
    // gap seen from the other side — #gap-closer-invented-a-gap-vanilla-fills, the shape that slid the owner's
    // Otago down onto vanilla's France: the fixer renumbers the mod's own state into an id a base file the mod
    // does not replace already declares, and HOI4 loads two states with it.
    const c = overlayMod(3);
    const clean = drive("gaps", c.mod, c.game);
    rec("the overlay control: vanilla 1..3 plus the mod's 4 is contiguous, so nothing is renumbered",
      !!clean.result && clean.result.renumbered.length === 0, clean);
    rec("…and no id is declared by both a mod file and a vanilla file", crossLayerDuplicates(clean).length === 0, clean);
    for (const code of (TRANSIENT.length ? TRANSIENT : ["EBUSY"])) {
      const f = overlayMod(3);
      const r = drive("gaps", f.mod, f.game, { pathContains: path.join(f.game, "history", "states", "3-V.txt"), code, failures: 1 });
      rec(`one ${code} on vanilla's 3-V.txt gives the same answer as reading it (no invented gap)`,
        r.thrown === 1 && !!r.result && !!clean.result && JSON.stringify(r.result.renumbered) === JSON.stringify(clean.result.renumbered),
        { thrown: r.thrown, result: r.result });
      rec(`…and the mod's own state is not renumbered onto one vanilla declares`,
        crossLayerDuplicates(r).length === 0, { duplicates: crossLayerDuplicates(r), mod: r.idsPerFile });
    }
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  console.log(`\n=== a momentary read failure does not invent a state-id gap: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
