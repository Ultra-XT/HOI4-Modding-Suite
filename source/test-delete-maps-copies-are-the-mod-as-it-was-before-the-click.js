// ⛔ #delete-maps-fold-kept-the-sunk-copy — EVERY COPY DELETE MAP KEEPS IS THE MOD'S FILE AS IT WAS BEFORE THE CLICK.
//
// THE DEFECT (review of the merged map editor, merge-integrity MI-1). Delete map keeps its copies in one folder per click: its backup
// scope copies there each file a safeModWrite of the click rewrites first, and its own snapshotFileBeforeOverwrite copies there each
// file a step offers it. On a mod Nova cut (a Generate land), the sink re-seats map/unitstacks.txt's heights through safeModWrite —
// so the scope keeps the file as it was — and the fold of the cut pieces then offers unitstacks.txt to snapshotFileBeforeOverwrite
// before its own write, which copied the SUNK file over that first copy. The folder the page names as "where the copies are" then
// held a unitstacks.txt with 117 rows re-seated by the click itself: a Restore from it does not give back the mod's unit stacks.
//
// The owner's flow on testlib-split-world's world, with a heightmap and a unit stack on every province below: Generate land (35%,
// seed 1: it cuts) -> Auto-fix -> Delete map. Then every file in the click's copies folder is hashed against the mod as it was before
// the click — the list is whatever the folder holds, not typed here. No port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delete-map-copies-"));
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
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
function bmp8(w, h, fn) {
  const rs = Math.floor((8 * w + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * h);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * h, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[off + (h - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const walk = (d, out = new Map(), base = d) => {
  for (const e of d && fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, base); else if (e.isFile()) out.set(path.relative(base, p).replace(/\\/g, "/"), p);
  }
  return out;
};

try {
  const S = SW.makeShapes();
  // a unit stack on every province below, at its first pixel; land at 100 and sea at 90 below
  const stacks = new Map();
  for (const id of S.keyOf.keys()) { const i = S.firstPx(id); stacks.set(id, [(i % W) + 1.5, H - 1 - Math.floor(i / W) - 0.5]); }
  const game = path.join(ROOT, "game");
  SW.makeGame(game, S, { unitstacks: stacks });
  fs.writeFileSync(path.join(game, "map", "heightmap.bmp"), bmp8(W, H, (x, y) => S.typeOf(S.gameIds[y * W + x]) === "land" ? 100 : 90));
  const mod = SW.makeMod(path.join(D.mods, "copies"), S, { name: "copies" });
  const ctx = { modRoot: mod, gameRoot: game, dependencyRoots: [] };

  const g = md.generateLand(Object.assign({ count: Math.round(S.N * 35 / 100), seed: 1, ownerMode: "inherit", owner: "" }, ctx));
  rec("Generate land raises the world and cuts provinces", g && g.changed !== false && ((g.provinceSplit || {}).newIds || 0) > 0, g && (g.error || g.provinceSplit));
  md.autoFixMap(ctx);
  const before = new Map([...walk(mod)].map(([r, p]) => [r, sha(p)]));
  rec("control — the mod owns its heightmap and its unit stacks before the click", before.has("map/heightmap.bmp") && before.has("map/unitstacks.txt"), [...before.keys()].filter((r) => r.startsWith("map/")));

  const b = md.blankMapToSea(ctx);
  rec("Delete map blanks the world and names its copies folder", b && b.changed && !!b.snapshotPath && fs.existsSync(b.snapshotPath), b && (b.error || b.snapshotPath));
  const sunk = (((b || {}).heightmap || {}).models || {}).files || {};
  rec(`control — the sink re-seats unit stacks (${sunk["unitstacks.txt"] || 0} rows) and the fold re-keys them (${((b || {}).provinceFold || {}).unitRows || 0} rows): unitstacks.txt is written twice`,
    (sunk["unitstacks.txt"] || 0) > 0 && (((b || {}).provinceFold || {}).unitRows || 0) > 0, { models: ((b || {}).heightmap || {}).models, fold: (b || {}).provinceFold && { families: b.provinceFold.families, unitRows: b.provinceFold.unitRows } });

  const copies = walk((b || {}).snapshotPath);
  const differ = [], notBefore = [];
  let same = 0;
  for (const [r, p] of copies) {
    if (!before.has(r)) { notBefore.push(r); continue; }
    if (before.get(r) === sha(p)) same++; else differ.push(r);
  }
  rec(`control — the folder holds copies (${copies.size}), unitstacks.txt among them`, copies.size > 0 && copies.has("map/unitstacks.txt"), [...copies.keys()].slice(0, 12));
  rec(`every copy in the folder is the mod's file as it was before the click (${same} of ${copies.size})`, !differ.length && !notBefore.length, { differ, notBefore });
  const after = walk(mod);
  const changed = [...after].filter(([r, p]) => before.has(r) && before.get(r) !== sha(p)).map(([r]) => r);
  const deleted = [...before.keys()].filter((r) => !after.has(r));
  const uncovered = [...changed, ...deleted].filter((r) => !copies.has(r));
  rec(`every file the click changed (${changed.length}) or deleted (${deleted.length}) has a copy there`, changed.length > 0 && !uncovered.length, uncovered);
} catch (e) {
  rec("the flow runs", false, e && e.stack);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== Delete map's copies are the mod as it was before the click: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
