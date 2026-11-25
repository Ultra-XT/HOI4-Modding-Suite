// ⏱ #the-active-mod-was-read-eight-times-for-one-press
//
// Map Errors is a button a modder presses and waits on. The layers BELOW the mod are cached; the active mod is
// read fresh on every buildMapModel, and rightly — the editor writes to it. What was never true is that one
// validate builds one model. Measured on Millennium Dawn at 215c8f3: GET /api/map/validate built TEN models
// and read the mod's own layer EIGHT times, because validateMapBitmap's own `sharedModel` was already there and
// five callers beside it had never adopted it — the dominant bug shape on this project, again.
//
// readOnlyMapPass makes a read-only sweep share one parse per root. This pins the three things that matter:
//   1. inside a pass the mod's layer is read ONCE however many models are built,
//   2. outside one nothing changed — every build still reads fresh, so no press can serve another press's bytes,
//   3. a write DURING a pass invalidates it, because a validator that writes is a bug of its own but must not
//      also be served text it just replaced.
//
// It counts real reads through fs, so it measures the behaviour rather than asserting the shape of the code.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const APP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onepass-app-"));
process.env.NOVA_APP_DATA_DIR = APP;
process.env.APPDATA = APP;
process.env.XDG_CONFIG_HOME = APP;

const md = require("./map-data.js");
const { safeModWrite } = require("./safe-write.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onepass-"));
const game = path.join(tmp, "game");
const mod = path.join(tmp, "mod");

const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};

// A 2x2 grid of 64px land provinces, one state per province — enough that a model build is a real parse.
const bmp24 = (wid, hei, fn) => {
  const rs = (wid * 3 + 3) & ~3, is = rs * hei, b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(wid, 18); b.writeInt32LE(hei, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < hei; y++) { let o = 54 + (hei - 1 - y) * rs; for (let x = 0; x < wid; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
};
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 2 + 1;

w(game, "map/provinces.bmp", bmp24(128, 128, (x, y) => COL(provAt(x, y))));
const rows = ["0;0;0;0;land;false;unknown;0"];
for (let p = 1; p <= 4; p++) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};land;false;plains;1`); }
w(game, "map/definition.csv", rows.join("\n") + "\n");
w(mod, "descriptor.mod", 'version="1"\nname="onepass"\nsupported_version="1.19.*"\npath="mod/onepass"\n');
for (let id = 1; id <= 4; id++) {
  w(mod, `history/states/${id}-STATE_${id}.txt`,
    `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
}
w(mod, "history/countries/AAA - Aland.txt", "capital = 1\n");

// ── count the reads of the MOD's own files, through fs ─────────────────────────────────────────────────────
const real = fs.readFileSync;
let counting = false, reads = 0;
fs.readFileSync = function (p, ...rest) {
  if (counting && typeof p === "string" && p.startsWith(mod) && /history[\\/]states/.test(p)) reads++;
  return real.call(this, p, ...rest);
};
const build = () => md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
const measure = (fn) => { reads = 0; counting = true; try { fn(); } finally { counting = false; } return reads; };

let checks = 0, failed = 0;
const rec = (label, ok, detail) => {
  checks++; if (!ok) failed++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + JSON.stringify(detail)));
};

// ── 1. THE CONTROL: without a pass, every build reads the mod again ────────────────────────────────────────
const oneBuild = measure(() => build());
assert.ok(oneBuild > 0, "the probe never saw a read of the mod's state files — it is measuring nothing");
const threeLoose = measure(() => { build(); build(); build(); });
rec("THE CONTROL: outside a pass, three builds read the mod three times over", threeLoose >= oneBuild * 3, { oneBuild, threeLoose });

// ── 2. inside a pass, the mod's layer is read once however many models are built ───────────────────────────
const threeInPass = measure(() => md.readOnlyMapPass(() => { build(); build(); build(); }));
rec("⭐⭐⭐ inside one pass, three builds read the mod ONCE", threeInPass === oneBuild, { oneBuild, threeInPass, threeLoose });

// ── 3. a nested pass is the outer one's, not a second ──────────────────────────────────────────────────────
const nested = measure(() => md.readOnlyMapPass(() => { build(); md.readOnlyMapPass(() => { build(); }); build(); }));
rec("a nested pass joins the outer one rather than starting its own", nested === oneBuild, { oneBuild, nested });

// ── 4. nothing survives the pass — the next press reads fresh ──────────────────────────────────────────────
md.readOnlyMapPass(() => build());
const afterPass = measure(() => build());
rec("⭐⭐ nothing is cached BETWEEN passes, so no press can serve another press's bytes", afterPass === oneBuild, { oneBuild, afterPass });

// ── 5. a write during a pass invalidates it ────────────────────────────────────────────────────────────────
// A validator that writes is a bug of its own, but it must not also be served the text it just replaced.
let sawOwner = "";
md.readOnlyMapPass(() => {
  build();
  safeModWrite(path.join(mod, "history", "states", "1-STATE_1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n',
    "map-test-onepass");
  const after = build();
  const st = (after.states || []).find((s) => s.id === 1);
  sawOwner = (st && st.owner) || "";
});
rec("⭐⭐⭐ a write DURING a pass is seen by the next build in that same pass", sawOwner === "ZZZ", { sawOwner });

fs.readFileSync = real;
for (const d of [tmp, APP]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* leave it */ } }

console.log(`\n=== one map validate reads the mod once: ${checks} checks, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
