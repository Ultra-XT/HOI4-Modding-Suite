// ⏱ #the-state-the-game-keeps-was-looked-for-twice — ONE EDIT, ONE WALK OF history/states.
//
// editStateBlock asks stateFileTheGameKeeps which file holds the state HOI4 keeps. That helper walks the mod's
// history/states in listTxt order, reads each file and stops at the first that declares the id — and hands back
// that file's name, its whole text and the block it found. editStateBlock threw all three away and walked the
// folder again from the top, reading every file up to that one a SECOND time, before editing the very block it
// had just been given.
//
// MEASURED on the owner's flow (a fresh mod over vanilla, Delete map → Generate land 35% → Auto-fix ×2, 832
// generated states): the first Auto-fix read its ~830 state files 7,319 times over — 3.35 million reads, 125 of
// its 343 seconds — and 5,650 of those folder walks came from editStateBlock, two per province conflict
// fixProvinceInTwoStates repairs, each walking twice.
//
// What this pins is the invariant, not a stopwatch: ONE edit of a state the mod owns must not read any state
// file twice. The count comes from the fixture's own file list, never typed in. The behaviour either side of it
// — which file is edited when a base layer's copy is the one the game keeps, and what happens for an id nothing
// declares — is asserted beside it, because the fast path is only correct if it answers the same as the walk.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-editonce-" + tag + "-")); tmps.push(d); return d; };
const APP = tmp("appdata");
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = tmp("home");

// Count every read of a history/states file — installed before map-data.js loads, as it reads at call time.
const reads = new Map();
let counting = false;
const origRead = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  if (counting && typeof p === "string" && /[\\/]history[\\/]states[\\/]/i.test(p)) {
    const k = path.resolve(p); reads.set(k, (reads.get(k) || 0) + 1);
  }
  return origRead.call(this, p, ...rest);
};
const md = require("./map-data.js");
const measure = (fn) => { reads.clear(); counting = true; try { return fn(); } finally { counting = false; } };
const under = (root) => [...reads.entries()].filter(([k]) => k.startsWith(path.resolve(root)));
const worst = (root) => under(root).reduce((b, [k, n]) => (n > b.n ? { n, file: path.basename(k) } : b), { n: 0, file: "" });

const write = (root, files) => { for (const [rel, body] of Object.entries(files)) { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return root; };
const st = (id, extra = "") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = AAA\n${extra}\t}\n}\n`;

console.log("A STATE EDIT FINDS ITS FILE ONCE:");

try {
  // ── A mod with many state files. The one we edit sorts LAST, so the walk to reach it is as long as it gets.
  const N = 40;
  const MOD_IDS = [];
  for (let i = 1; i <= N; i++) MOD_IDS.push(i);
  const TARGET = MOD_IDS[MOD_IDS.length - 1];
  const GAME = tmp("game"), MOD = tmp("mod");
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of MOD_IDS) rows.push(`${id};${id};${(id * 7) % 250};${(id * 13) % 250};land;false;plains;1`);
  rows.push(`${N + 1};250;250;250;land;false;plains;1`);        // a province only the base game's state holds
  write(GAME, { "map/definition.csv": rows.join("\r\n") + "\r\n", "history/states/900-Base.txt": st(N + 1) });
  const modFiles = {};
  // Zero-padded names so listTxt's plain sort and the numeric order agree, and the target really is last.
  const nameOf = (id) => `${String(id).padStart(4, "0")}-S${id}.txt`;
  for (const id of MOD_IDS) modFiles["history/states/" + nameOf(id)] = st(id);
  write(MOD, modFiles);
  const args = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [] };

  // Warm the base layer's cached parse, so what is counted below is this edit's own reading of the folders.
  md.buildMapModel({ ...args, cacheStableLayers: true });

  // ── 1. One edit of a state the mod owns reads no state file twice ──────────────────────────────────────
  const r1 = measure(() => md.editStateBlock({ ...args, stateId: TARGET }, (b) => b.replace("manpower = 1000", "manpower = 2000")));
  const w = worst(MOD), others = under(MOD).filter(([k]) => path.basename(k) !== nameOf(TARGET));
  rec(`the edit landed in the mod's own ${nameOf(TARGET)}`, !!(r1 && r1.changed && r1.file === nameOf(TARGET) && r1.location === "mod"), r1);
  // The edited file is read a second time by safeModWrite, which matches the line endings of the file it replaces.
  // That read is the writer's; what must not happen twice is the SEARCH, and no other file is written at all.
  rec("the state's own file is read to find it and once more by the writer, no more", w.file === nameOf(TARGET) && w.n <= 2, w);
  rec("no other state file is read twice", others.every(([, n]) => n <= 1), others.filter(([, n]) => n > 1).map(([k]) => path.basename(k)));
  rec(`at most one read per state file in the folder (${MOD_IDS.length} files)`, under(MOD).length <= MOD_IDS.length, under(MOD).length);
  rec("the new manpower is on disk", origRead.call(fs, path.join(MOD, "history", "states", nameOf(TARGET)), "utf8").includes("manpower = 2000"));

  // ── 2. A transform that changes nothing writes nothing — so this counts the SEARCH alone ───────────────
  const before = origRead.call(fs, path.join(MOD, "history", "states", nameOf(TARGET)), "utf8");
  const r2 = measure(() => md.editStateBlock({ ...args, stateId: TARGET }, (b) => b));
  rec("an unchanged block reports no change", !!(r2 && r2.changed === false && r2.file === nameOf(TARGET)), r2);
  rec("…and leaves the file byte-identical", origRead.call(fs, path.join(MOD, "history", "states", nameOf(TARGET)), "utf8") === before);
  rec("⭐ the search reads no state file twice", worst(MOD).n <= 1, worst(MOD));

  // ── 3. A state only the base game declares is still materialised into the mod ──────────────────────────
  const r3 = md.editStateBlock({ ...args, stateId: N + 1 }, (b) => b.replace("manpower = 1000", "manpower = 3000"));
  rec("a base-only state is copied in under the base file's own name", !!(r3 && r3.changed && r3.file === "900-Base.txt" && r3.created === true), r3);
  rec("…with the edit applied", fs.existsSync(path.join(MOD, "history", "states", "900-Base.txt"))
    && origRead.call(fs, path.join(MOD, "history", "states", "900-Base.txt"), "utf8").includes("manpower = 3000"));

  // ── 4. An id nothing declares is reported, not invented ────────────────────────────────────────────────
  const r4 = md.editStateBlock({ ...args, stateId: 99999 }, (b) => b);
  rec("an id no layer declares comes back as an error", !!(r4 && r4.changed === false && /not found/i.test(r4.error || "")), r4);

  // ── 5. The block the GAME keeps still wins over the mod's own copy ─────────────────────────────────────
  // #the-state-the-game-keeps: a base file that sorts before every mod file declaring the id IS the state, so the
  // edit goes to a copy of THAT file, and the mod's own copy is left exactly where it was.
  const MOD2 = tmp("mod2"), GAME2 = tmp("game2");
  write(GAME2, { "map/definition.csv": rows.join("\r\n") + "\r\n", "history/states/0001-First.txt": st(7) });
  write(MOD2, { "history/states/9999-Mine.txt": st(7, "\t\tadd_core_of = BBB\n") });
  const args2 = { modRoot: MOD2, gameRoot: GAME2, dependencyRoots: [] };
  const r5 = md.editStateBlock({ ...args2, stateId: 7 }, (b) => b.replace("manpower = 1000", "manpower = 4000"));
  rec("the base file the game keeps is the one edited", !!(r5 && r5.changed && r5.file === "0001-First.txt"), r5);
  rec("…and the mod's own copy is untouched", origRead.call(fs, path.join(MOD2, "history", "states", "9999-Mine.txt"), "utf8").includes("manpower = 1000"));
} finally {
  fs.readFileSync = origRead;
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`  ${checks - fails.length}/${checks} passed`);
if (fails.length) { console.log("  FAILED: " + fails.join(" | ")); process.exit(1); }
process.exit(0);
