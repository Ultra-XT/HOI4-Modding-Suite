// ⛔ #a-momentary-read-failure-emptied-a-map-folder — A FILE THAT IS LOCKED FOR A MOMENT IS NOT A FILE WITH NOTHING IN IT.
//
// readBlockFilesFromRoot turns a file it cannot read into "a file with no items" ON PURPOSE: an unreadable file is still
// there to replace a lower layer's file of the same name (#a-same-named-file-replaces-the-lower-one). But it made no
// distinction between a file that is unreadable and a file that was busy for a few milliseconds — and it is the one reader
// behind readStatesFromRoot, readStrategicRegionsFromRoot and readSupplyAreasFromRoot, so a blip from an antivirus scan or
// a sync client silently moves a state, region or supply-area answer, in a validate, in a rule, or in a fixer's dry run.
//
// MEASURED on d8e955b (scratchpad batch13/robust/verify-a.js, a 3-state / 2-area / 2-region mod, ONE injected failed read):
//   map/supplyareas        EBUSY  -> areas [2]     instead of [1, 2]        (no error, no warning)
//   history/states         EBUSY  -> states [2, 3] instead of [1, 2, 3]
//   map/strategicregions   EBUSY  -> regions [2]   instead of [1, 2]
//   map/supplyareas        EPERM / EMFILE -> the same loss (the Windows lock and the fd-exhaustion shapes)
// That is what made batch 12's Auto-fix guard flake under load: one lost read of map/supplyareas during the START validate
// made buildMapModel report 0 supply areas (scratchpad b12-flake.txt, item A).
//
// THE RULE THIS FILE ASKS FOR. A transient read error is waited out, on the same ladder renameOverWithRetry uses for the
// write side — one owner, in safe-write.js. A file that is really unreadable still answers "no items", still replaces the
// lower layer's file of the same name, and is still refused promptly. The waiting is bounded per folder read, so a whole
// folder gone unreadable cannot make a validate hang; and a read that succeeds first time costs exactly one read, as before.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const tmps = [];
const mkdtemp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-readblip-" + tag + "-")); tmps.push(d); return d; };
const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();

// ── What safe-write.js says is transient, and how long its ladder is — DERIVED, never typed here ───────────────────────
const SW = require("./safe-write.js");
const SW_SRC = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
const LADDER = (() => {
  const m = SW_SRC.match(/RENAME_RETRY_MS\s*=\s*\[([^\]]*)\]/);
  return m ? m[1].split(",").map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
})();
const TRANSIENT = Array.isArray(SW.TRANSIENT_READ_CODES) ? SW.TRANSIENT_READ_CODES.slice() : [];

// ── the fixture: a base game and a mod over it ────────────────────────────────────────────────────────────────────────
const GAME = mkdtemp("game");
const MOD = mkdtemp("mod");
const STATE_IDS = [1, 2, 3, 4, 5, 6, 7, 8];           // the answers below are derived from these three lists
const AREA_IDS = [1, 2];
const REGION_IDS = [1, 2];
const stateText = (id, name) => `state = {\n\tid = ${id}\n\tname = "${name}${id}"\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`;
w(GAME, "hoi4.exe", "placeholder");
w(GAME, "history/states/1-S.txt", stateText(1, "BASE_S"));          // the file the mod ships one of its own at
w(MOD, "descriptor.mod", 'name="read blip"\nsupported_version="1.*"\n');
for (const id of STATE_IDS) w(MOD, `history/states/${id}-S.txt`, stateText(id, "S"));
w(MOD, "map/supplyareas/1-A.txt", 'supply_area = {\n\tid = 1\n\tname = "A1"\n\tvalue = 1\n\tstates = { 1 2 }\n}\n');
w(MOD, "map/supplyareas/2-A.txt", 'supply_area = {\n\tid = 2\n\tname = "A2"\n\tvalue = 1\n\tstates = { 3 }\n}\n');
w(MOD, "map/strategicregions/1-R.txt", 'strategic_region = {\n\tid = 1\n\tname = "R1"\n\tprovinces = { 1 2 }\n}\n');
w(MOD, "map/strategicregions/2-R.txt", 'strategic_region = {\n\tid = 2\n\tname = "R2"\n\tprovinces = { 3 }\n}\n');

const FOLDER = {
  states: { dir: path.join(MOD, "history", "states"), want: STATE_IDS },
  areas: { dir: path.join(MOD, "map", "supplyareas"), want: AREA_IDS },
  regions: { dir: path.join(MOD, "map", "strategicregions"), want: REGION_IDS },
};
const filesIn = (dir) => fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")).length;

// ── the driver: a child process that wraps fs.readFileSync BEFORE map-data.js is required ─────────────────────────────
const RIG = mkdtemp("rig");
const DRIVER = path.join(RIG, "driver.js");
fs.writeFileSync(DRIVER, `"use strict";
const fs = require("fs"), path = require("path");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const norm = (p) => String(p).replace(/\\\\/g, "/").toLowerCase();
const seen = { attempts: 0, thrown: 0, per: new Map() };
const real = fs.readFileSync;
fs.readFileSync = function (p, o) {
  if (typeof p === "string" && norm(p).indexOf(plan.pathContains) !== -1) {
    seen.attempts++;
    // perFile: the first \`failures\` reads of EACH file throw (a blip on every file). Otherwise: the first
    // \`failures\` reads of the folder throw, whichever file they land on.
    const key = norm(p);
    const mine = seen.per.get(key) || 0;
    if (plan.perFile ? mine < plan.failures : seen.thrown < plan.failures) {
      seen.per.set(key, mine + 1);
      seen.thrown++;
      const e = new Error(plan.code + ": injected by the test, read '" + p + "'");
      e.code = plan.code;
      throw e;
    }
  }
  return real.call(fs, p, o);
};
const M = require(plan.mapData);
const t0 = Date.now();
let answer = null, err = null;
try {
  if (plan.kind === "states") answer = M.readStatesFromRoot(plan.modRoot).map((s) => s.id);
  else {
    const model = M.buildMapModel({ modRoot: plan.modRoot, gameRoot: plan.gameRoot || null, dependencyRoots: [] });
    answer = (plan.kind === "areas" ? model.supplyAreas : plan.kind === "regions" ? model.strategicRegions : model.states).map((s) => s.id);
  }
  answer.sort((a, b) => a - b);
} catch (e) { err = String((e && e.message) || e); }
process.stdout.write(JSON.stringify({ answer, err, ms: Date.now() - t0, attempts: seen.attempts, thrown: seen.thrown }));
`);

let run = 0;
function drive(kind, { pathContains = null, code = "EBUSY", failures = 0, perFile = false, gameRoot = null } = {}) {
  const planPath = path.join(RIG, `plan-${++run}.json`);
  fs.writeFileSync(planPath, JSON.stringify({
    mapData: path.join(__dirname, "map-data.js"), modRoot: MOD, gameRoot, kind, code, failures, perFile,
    pathContains: pathContains === null ? "::no-such-path::" : norm(pathContains),
  }));
  const r = spawnSync(process.execPath, [DRIVER, planPath], { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0 || !r.stdout) return { answer: null, err: `driver exit ${r.status}: ${(r.stderr || "").slice(0, 400)}`, attempts: 0, thrown: 0, ms: 0 };
  try { return JSON.parse(r.stdout); } catch (_) { return { answer: null, err: "unparsable: " + r.stdout.slice(0, 300), attempts: 0, thrown: 0, ms: 0 }; }
}
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

try {
  console.log("\n0. The rig, and what the ladder says");
  rec("safe-write.js owns a retry ladder, and this test reads it from there", LADDER.length >= 2, LADDER);
  rec("⭐ …and names the read errors that are worth waiting out", TRANSIENT.length > 0 && TRANSIENT.every((c) => typeof c === "string"),
    { TRANSIENT_READ_CODES: TRANSIENT });
  rec("…including EBUSY, the code the measured flake threw", TRANSIENT.includes("EBUSY"), TRANSIENT);
  rec("…and not EACCES or EISDIR, which do not go away by waiting",
    !TRANSIENT.includes("EACCES") && !TRANSIENT.includes("EISDIR"), TRANSIENT);
  rec("map-data.js reads one folder of blocks through that one owner, with no bare read of its own", (() => {
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r/g, ""));
    const at = src.indexOf("function readBlockFilesFromRoot(");
    if (at === -1) return false;
    const body = src.slice(at, src.indexOf("\n}", at));
    return /readTextWithRetry\s*\(/.test(body) && !/fs\.readFileSync\s*\(/.test(body);
  })(), "readBlockFilesFromRoot must not keep a raw read beside the shared one");

  console.log("\n1. THE CONTROL: with nothing injected, each folder answers in full");
  const clean = {};
  for (const kind of Object.keys(FOLDER)) {
    clean[kind] = drive(kind);
    rec(`${kind}: every id the fixture ships is there`, same(clean[kind].answer, FOLDER[kind].want), clean[kind]);
  }
  console.log("\n   …and a clean read costs exactly one read per file (a retry that never fires costs nothing)");
  for (const kind of Object.keys(FOLDER)) {
    const files = filesIn(FOLDER[kind].dir);
    const r = drive(kind, { pathContains: FOLDER[kind].dir });
    rec(`${kind}: ${files} file(s), ${r.attempts} read(s)`, r.attempts === files, { files, attempts: r.attempts });
  }

  console.log("\n2. ⭐⭐⭐ ONE momentary failure does not move the answer");
  for (const kind of Object.keys(FOLDER)) {
    for (const code of TRANSIENT.length ? TRANSIENT : ["EBUSY"]) {
      const r = drive(kind, { pathContains: FOLDER[kind].dir, code, failures: 1 });
      rec(`${kind}: one ${code} on the first read answers the same as a clean read`,
        r.thrown === 1 && same(r.answer, FOLDER[kind].want), r);
    }
  }
  {
    const files = filesIn(FOLDER.states.dir);
    const r = drive("states", { pathContains: FOLDER.states.dir, code: "EBUSY", failures: 1, perFile: true });
    rec("…and one on EVERY file of the folder still answers in full", r.thrown === files && same(r.answer, FOLDER.states.want), { files, ...r });
  }

  console.log("\n3. PINNED: a file that is really unreadable is still a file with no items, and still replaces the layer below");
  {
    const one = drive("states", { pathContains: path.join(MOD, "history", "states", "1-S.txt"), code: "EACCES", failures: 9999, gameRoot: GAME });
    const want = STATE_IDS.filter((id) => id !== 1);
    rec("⭐⭐ the mod's unreadable 1-S.txt still shadows the base game's 1-S.txt — state 1 does not come back",
      same(one.answer, want), { answer: one.answer, want });
    rec("…and it was refused on the FIRST attempt — no amount of waiting turns a permission into a read",
      one.attempts === 1, { attempts: one.attempts });
    const forever = drive("states", { pathContains: path.join(MOD, "history", "states", "1-S.txt"), code: "EBUSY", failures: 9999, gameRoot: GAME });
    rec("⭐⭐ …and a file that stays busy for ever is given up on too, after the ladder and no longer",
      same(forever.answer, want) && forever.attempts === LADDER.length + 1, { attempts: forever.attempts, ladder: LADDER.length, answer: forever.answer });
    const ctl = drive("states", { gameRoot: GAME });
    rec("THE CONTROL: with that file readable, the mod's own state 1 is there (so the check above is not vacuous)",
      same(ctl.answer, STATE_IDS), ctl);
    const eisdir = drive("states", { pathContains: path.join(MOD, "history", "states", "1-S.txt"), code: "EISDIR", failures: 9999, gameRoot: GAME });
    rec("…and a path that is a directory is refused the same way, without waiting", same(eisdir.answer, want) && eisdir.attempts === 1, eisdir);
  }

  console.log("\n4. A whole folder gone unreadable cannot make a validate hang");
  {
    const files = filesIn(FOLDER.states.dir);
    const ceiling = files * (LADDER.length + 1);
    const r = drive("states", { pathContains: FOLDER.states.dir, code: "EBUSY", failures: 999999 });
    const ladderMs = LADDER.reduce((a, b) => a + b, 0);
    rec(`the answer still comes back (${files} files, ${r.attempts} reads, ${r.ms} ms)`, Array.isArray(r.answer) && !r.err, r);
    rec("⭐⭐ …without paying the whole ladder for every file", r.attempts > files && r.attempts < ceiling, { attempts: r.attempts, ceiling });
    rec("…and in less time than a per-file ladder would take", r.ms < files * ladderMs, { ms: r.ms, perFileLadder: files * ladderMs });
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  console.log(`\n=== a momentary read failure does not empty a map folder: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
