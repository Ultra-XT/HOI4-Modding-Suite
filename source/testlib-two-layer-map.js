// A small game, a dependency on top of it, and an add-on on top of that — for the tests that ask whether Map Errors and
// Auto-fix hand an add-on a problem only its dependency has. Driven through the endpoints the Map Errors popup calls.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// The game is a 256x256 map a validator has nothing to say about beyond province_too_large (the fixture is small):
//   sea 1 across the top · land 2 (coast, left) · 5 (inland, under 2) · 3 (coast, right) · 4 (inland, under 3)
//   state 1 = { 4 }   state 2 = { 2 5 }   state 3 = { 3 }       region 1 = { 1 }   region 2 = { 2 3 4 5 }
// with an air base and a rocket site for each state on its own land, and a naval_base_spawn for states 2 and 3 facing sea 1.
// hoi4.exe is a placeholder file, which is what resolveHoi4GameRoot looks for.
//
// makeWorld() must run BEFORE server.js is required: server.js reads HOI4_MODS_ROOT when it loads, and dependencies are
// resolved by descriptor name from that folder.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 200, 200] };
const provAt = (x, y) => (y < 64 ? 1 : x < 128 ? (y < 192 ? 2 : 5) : y < 160 ? 3 : 4);
/** definition.csv rows by id, so a test can change one and keep the rest as the game writes them. */
const DEF_ROWS = {
  0: "0;0;0;0;land;false;unknown;0", 1: "1;0;0;200;sea;false;ocean;0", 2: "2;200;0;0;land;true;plains;1",
  3: "3;0;200;0;land;true;plains;1", 4: "4;200;200;0;land;false;plains;1", 5: "5;0;200;200;land;false;plains;1",
};
const DEF = (over = {}) => Object.keys(DEF_ROWS).map((id) => over[id] || DEF_ROWS[id]).join("\r\n") + "\r\n";
const BUILD = [
  "1;air_base;192.00;9.50;47.00;0.00;0", "1;rocket_site_spawn;192.00;9.50;47.00;0.00;0",
  "2;air_base;64.00;9.50;95.00;0.00;0", "2;rocket_site_spawn;64.00;9.50;95.00;0.00;0",
  "3;air_base;192.00;9.50;155.00;0.00;0", "3;rocket_site_spawn;192.00;9.50;155.00;0.00;0",
  "2;naval_base_spawn;64.00;9.50;191.00;0.00;1", "3;naval_base_spawn;192.00;9.50;191.00;0.00;1",
];
/** A state file. o.manpower (default 1000), o.category ("" writes no state_category line; default rural), o.history (extra lines). */
const st = (id, provs, o = {}) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${o.manpower == null ? 1000 : o.manpower}\n`
  + `${o.category === "" ? "" : `\tstate_category = ${o.category || "rural"}\n`}\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n${o.history || ""}\t}\n}\n`;
const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
const GAME_STATES = { "history/states/1-A.txt": st(1, "4"), "history/states/2-B.txt": st(2, "2 5"), "history/states/3-C.txt": st(3, "3") };

function makeWorld(tag) {
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-" + tag + "-"));
  const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods");
  process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
  fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
  fs.mkdirSync(MODS, { recursive: true });
  process.env.HOI4_ROOT = GAME;
  process.env.HOI4_MODS_ROOT = MODS;
  write(GAME, {
    "hoi4.exe": "not really an exe",
    "map/provinces.bmp": bmp24(256, 256, (x, y) => COL[provAt(x, y)]),
    "map/definition.csv": DEF(),
    "map/buildings.txt": BUILD.join("\n"),
    "map/strategicregions/1-Sea.txt": region(1, "1"),
    "map/strategicregions/2-Land.txt": region(2, "2 3 4 5"),
    ...GAME_STATES,
    "common/state_category/00_state_category.txt": "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n\ttown = {\n\t\tlocal_building_slots = 4\n\t}\n}\n",
  });
  let n = 0;
  /** A mod under the mods root. deps: names it declares. */
  const mod = (name, files, deps = []) => write(path.join(MODS, "m" + (++n)), {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\n` + (deps.length ? `dependencies={\n${deps.map((d) => `\t"${d}"`).join("\n")}\n}\n` : ""),
    ...files,
  });
  return { ROOT, GAME, MODS, mod, cleanup: () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} } };
}

/** Every file under d -> sha1, so a click that writes nothing can be told from one that writes the same bytes back.
 *
 *  ⚠️ A FILE LISTED IS NOT A FILE STILL THERE. This walk reads every name readdirSync just handed it, and on this
 *  machine a name can die in between: watching os.tmpdir() through six runs of
 *  test-restoring-a-removed-country-leaves-no-copy-of-a-base-state-file.js caught a "<NAME>.TXT.tmp" — the target's
 *  name uppercased, with a bare ".tmp" — appearing in the fixture's history/states about 10ms after each
 *  safeModWrite rename and vanishing within a millisecond, as a create+delete pair with no write between. It is not
 *  ours: no .js in this repo contains a bare ".tmp" (safeModWrite writes "<file>.tmp-<pid>-<ts>"), an fs hook over
 *  every creating call recorded zero in-process creations, and plain writeFileSync+renameSync in a scratch folder
 *  never produced one. It is an on-access scanner reacting to the rapid re-writes of one path that ⛔2 in CLAUDE.md
 *  is about, and it is why that test failed 1 run in 3 with "ENOENT … 2-B.TXT.tmp" thrown out of readFileSync.
 *
 *  The throw was worse than a failing check: it aborted the file at check 15 of 24, so NINE checks never ran and the
 *  summary line still looked like a test. Only ENOENT is tolerated, and only for a path this walk already listed —
 *  a file that really went away is absent from the tree either way, which is exactly what `written()` compares.
 *  Anything else still throws. What vanished is kept on the tree, non-enumerably, so a test can ask. */
function tree(d) {
  const out = {};
  const vanished = [];
  const walk = (x) => { if (!fs.existsSync(x)) return; for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); const rel = path.relative(d, p).replace(/\\/g, "/"); if (e.isDirectory()) walk(p); else { let bytes; try { bytes = fs.readFileSync(p); } catch (err) { if (err && err.code === "ENOENT") { vanished.push(rel); continue; } throw err; } out[rel] = crypto.createHash("sha1").update(bytes).digest("hex"); } } };
  Object.defineProperty(out, "__vanished", { value: vanished, enumerable: false });
  walk(d);
  return out;
}
const written = (before, after) => Object.keys(after).filter((k) => before[k] !== after[k]).concat(Object.keys(before).filter((k) => !(k in after))).sort();

/** The server, and the three requests public/map.js makes: GET /api/map/validate?modPath, POST /api/map/auto-fix { modPath }, and
 *  any other queued write, which flushMapSaves posts as Object.assign({}, body, { modPath }). */
function startServer(createApp) {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(0, () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
      resolve({
        base,
        validate: (modPath) => fetch(`${base}/api/map/validate?modPath=${encodeURIComponent(modPath)}`).then((r) => r.json()),
        autoFix: (modPath) => post("/api/map/auto-fix", { modPath }),
        post: (ep, body, modPath) => post(ep, Object.assign({}, body, { modPath })),
        close: () => { try { server.closeAllConnections(); } catch (_) {} server.close(); },
      });
    });
    server.on("error", reject);
  });
}

/** The ids a validate response names for one rule: states, provinces, and each item's stateId / province. */
function idsOf(v, rule) {
  const out = [];
  for (const p of (v && v.problems) || []) {
    if (p.rule !== rule) continue;
    for (const s of p.states || []) out.push(+s);
    for (const q of p.provinces || []) out.push(+q);
    for (const i of p.items || []) { if (i && i.stateId != null) out.push(+i.stateId); else if (i && i.province != null) out.push(+i.province); }
    if (p.stateId != null) out.push(+p.stateId);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
const rulesIn = (v) => [...new Set(((v && v.problems) || []).map((p) => p.rule))].sort();

/** The Save gate as the Map editor runs it after a Save: the REAL mapCrashGate and openMapErrorsModal lifted out of public/map.js
 *  (as test-a-fatal-map-rule-is-an-error-everywhere-it-is-shown.js lifts them) and handed one validate response. Returns how many
 *  problems the status line says Save stops for, the status line, and whether the popup's type-"save" gate is armed. The count is
 *  read off the status line's own words (#the-save-gate-says-what-hoi4-does), so a rewording that stops matching makes every
 *  "Save is not stopped" check pass without looking: keep this pattern in step with test-a-fatal-map-rule-is-an-error-everywhere-it-is-shown.js. */
async function saveGate(v) {
  const vm = require("vm");
  const labels = require("./public/map-rule-labels.js");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(MAP);
  const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
  const gate = grab("async function mapCrashGate"), modal = grab("function openMapErrorsModal(");
  if (gate.length < 300 || modal.length < 2000) throw new Error("could not lift mapCrashGate / openMapErrorsModal out of public/map.js");
  let status = "";
  const overlays = [];
  const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "",
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el() });
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; }, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, statusEl: { style: {} }, setStatus: (s) => { status = String(s); }, modPath: () => "D:/fixture",
    escHtml: (s) => String(s == null ? "" : s), hasPendingMapEdits: () => false,
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0 ? v : {}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${modal}\n${gate}\nglobalThis.__gate = mapCrashGate;`, sandbox);
  await sandbox.__gate({ done: 1 });
  const m = /⛔ The map now has (\d+) problems? Save stops for/.exec(status);
  return { crashes: m ? +m[1] : 0, status, armed: overlays.some((o) => /id="mapErrGateInput"/.test(o.innerHTML)) };
}

module.exports = { write, bmp24, COL, provAt, DEF, DEF_ROWS, BUILD, st, region, GAME_STATES, makeWorld, tree, written, startServer, idsOf, rulesIn, saveGate };
