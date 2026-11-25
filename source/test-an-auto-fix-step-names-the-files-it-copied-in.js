// ⛔ #an-add-on-is-told-what-auto-fix-froze — AN AUTO-FIX STEP THAT COPIES A FILE OF THE LAYER BELOW INTO THE MOD NAMES IT.
// (Tool campaign B6-16; the data half the B6 review found missing, MF-3.)
//
// THE DEFECT. On an add-on over Millennium Dawn with one state emptied by hand (MD's 1000-Nice.txt with provinces = { }), one 🔧 click
// added MD's history/states/63-Provence.txt (the stateless land was homed in it) and MD's map/buildings.txt (4,001,600 bytes: the two
// ports the click gave went into it), and the line named neither. From then on the add-on pins both files as MD has them today — the
// overlay rule — and an MD update no longer reaches them. The page's clause for it (" — to do it, X is now YOUR mod's, frozen at this
// build of the map below") reads each step's `materialised`, and the data answered none: fixStatelessLand answered { fixed, details,
// skipped, buildingRows? } though editStateBlock told it { file, created: true }, and fixCoastalNoPort answered { added, provinces }
// though it wrote the layer's buildings.txt into the mod. MEASURED with the page's own click on b4210996 (b6-fix/g1/fixup/probe-mf3.js):
// statelessLand { fixed: 2 }, coastalNoPort { added: 2 }, buildingsTxt { materialized: false } — and the two files added.
//
// THE FIX. fixStatelessLand answers `materialised`: each state file editStateBlock copied in (created: true) and map/buildings.txt
// when the rows given the homed land are the first the mod has of it. fixCoastalNoPort answers `materialised`: the buildings.txt and
// the definition.csv it read from the layer below and wrote. autoFixMap's settle passes keep what both passes copied (one helper,
// read off the source in section 4) — on the MD add-on it was the port settle, not the first pass, that wrote the buildings.txt.
// (b6-g3's d7e8b2df wrote the same answer fields while this fix-up ran; b6-g1 carries its hunks byte for byte, so the two branches
// merge as one change, and this test guards them from b6-g1's side.)
//
//   0. THE CONTROL: the base map has nothing an add-on is told to fix.
//   1. fixStatelessLand homing land in a state the base game declares names that state's file — and the base game's buildings.txt
//      when the land it homes gets its rows; a mod that owns both files is told of none.
//   2. fixCoastalNoPort names the base game's buildings.txt and definition.csv it wrote; a mod that owns both is told of neither.
//   3. The whole click on the Millennium Dawn shape: every file it added is named by the statelessLand / coastalNoPort / buildingsTxt
//      answers the page words, the ports coming from the settle pass.
//   4. 🔎 DERIVED (comments masked): every rebuild of those two steps' answers in autoFixMap keeps `materialised`.
// The back-out control: drop the collection in fixStatelessLand and section 1 fails; in fixCoastalNoPort, section 2; the settle
// merge, section 3 (and 4). Binds no port. Run through the runner: node run-tests.js test-an-auto-fix-step-names-the-files-it-copied-in
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-step-names-copies-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 700) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
/** Every file under `d`, mod-relative with forward slashes. */
function filesOf(d) {
  const out = new Set();
  const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out.add(path.relative(d, p).split(path.sep).join("/")); } };
  if (fs.existsSync(d)) walk(d);
  return out;
}
const added = (before, d) => [...filesOf(d)].filter((f) => !before.has(f)).sort();
const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

// ── the base game: a sea on top; land 3 in the corner under it, land 2 round 3, land 4 on the right ──────────────────────────────
//   state 1 (1-West.txt) = { 2 }, state 2 (2-East.txt) = { 3 4 }. Every land province has its depot, fort and special-project rows,
//   every coast its port (keyed to the state it is in), every state its air base and rocket site: a map with nothing to fix.
const W = 256, H = 256;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const provAt = (x, y) => (y < 64 ? 1 : x < 64 && y < 128 ? 3 : x < 128 ? 2 : 4);
const st = (id, name, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory={ owner = GER }\n\tprovinces={ ${provs} }\n}\n`;
const row = (sid, type, x, y, sea = 0) => `${sid};${type};${x.toFixed(2)};9.50;${(H - 1 - y).toFixed(2)};0.00;${sea}`;
const LAND_ROWS = ["supply_node", "bunker", "special_project_facility_spawn"];
const AT = { 2: [96, 160], 3: [32, 96], 4: [192, 160] }, PORT = { 2: [96, 64], 3: [32, 64], 4: [192, 64] }, STATE_BELOW = { 2: 1, 3: 2, 4: 2 };
function buildingRows({ skipLandRowsOf = null } = {}) {
  const rows = [];
  for (const p of [2, 3, 4]) {
    if (p !== skipLandRowsOf) for (const t of LAND_ROWS) rows.push(row(STATE_BELOW[p], t, AT[p][0], AT[p][1]));
    rows.push(row(STATE_BELOW[p], "naval_base_spawn", PORT[p][0], PORT[p][1], 1));
  }
  rows.push(row(1, "air_base", 96, 200), row(1, "rocket_site_spawn", 96, 200), row(2, "air_base", 192, 200), row(2, "rocket_site_spawn", 192, 200));
  return rows.join("\n");
}
const DEFINITION = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\n") + "\n";
function makeGame(tag, opts = {}) {
  const g = path.join(ROOT, "game-" + tag);
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(g, "map/definition.csv", DEFINITION);
  write(g, "map/buildings.txt", buildingRows(opts));
  write(g, "history/states/1-West.txt", st(1, "West", "2"));
  write(g, "history/states/2-East.txt", st(2, "East", "3 4"));
  write(g, "history/countries/GER - Germany.txt", "capital = 1\n");
  write(g, "common/country_tags/00_countries.txt", 'GER = "countries/Germany.txt"\n');
  return g;
}
const GAME = makeGame("full");
const GAME_SHORT = makeGame("short", { skipLandRowsOf: 3 });   // province 3 has no depot, fort or special-project row below
let modN = 0;
function makeMod(files) {
  const d = path.join(ROOT, "mod-" + (++modN));
  write(d, "descriptor.mod", `name="Mod ${modN}"\n`);
  for (const [rel, body] of Object.entries(files || {})) write(d, rel, body);
  return d;
}
const roots = (modRoot, gameRoot = GAME) => ({ modRoot, gameRoot, dependencyRoots: [] });

try {
  // ═══ 0. THE CONTROL ════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 0. the base map has nothing an add-on is told to fix ===");
  {
    const bare = makeMod();
    const probs = md.validateMapModel(md.buildMapModel({ ...roots(bare), cacheStableLayers: false })).concat(md.validateMapBitmap(roots(bare)));
    ok(!probs.some((p) => p.rule === "land_not_in_state" || p.rule === "coastal_no_port"), "a bare add-on is told of no stateless land and no portless coast",
      probs.map((p) => p.rule));
  }

  // ═══ 1. fixStatelessLand ═══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. homing land in a state the base game declares names the file it copied in ===");
  {
    const A = makeMod({ "history/states/2-East.txt": st(2, "East", "4") });      // the mod's own state 2 dropped province 3
    const before = filesOf(A);
    const r = md.fixStatelessLand(roots(A));
    ok(r && !r.error && r.fixed === 1 && (r.details || [])[0] && r.details[0].province === 3 && r.details[0].addedToState === 1,
      "THE CONTROL: province 3, which the mod's own state 2 dropped, is homed in state 1 — a state only the base game declares", r);
    ok(same(added(before, A), ["history/states/1-West.txt"]), "THE CONTROL: …which copied the base game's 1-West.txt into the mod, and nothing else", added(before, A));
    ok(same(r.materialised, ["history/states/1-West.txt"]), "⭐⭐⭐ the answer NAMES it, mod-relative: materialised [history/states/1-West.txt]", r.materialised);

    const A2 = makeMod({ "history/states/2-East.txt": st(2, "East", "4") });
    const before2 = filesOf(A2);
    const r2 = md.fixStatelessLand(roots(A2, GAME_SHORT));
    const rows = r2 && r2.buildingRows && (r2.buildingRows.placed || []).find((p) => p.stateId === 1);
    ok(r2 && r2.fixed === 1 && !!rows && (rows.land || []).includes(3),
      "THE CONTROL: where the base game gives province 3 no depot, fort or special-project row, homing it gives it them", r2 && r2.buildingRows);
    ok(same(added(before2, A2), ["history/states/1-West.txt", "map/buildings.txt"]), "THE CONTROL: …which copied the base game's buildings.txt in too", added(before2, A2));
    ok(same(r2.materialised, ["history/states/1-West.txt", "map/buildings.txt"]), "⭐⭐⭐ …and the answer names both files", r2.materialised);

    const own = makeMod({ "history/states/1-West.txt": st(1, "West", "2"), "history/states/2-East.txt": st(2, "East", "4"),
      "map/buildings.txt": buildingRows({ skipLandRowsOf: 3 }) });
    const before3 = filesOf(own);
    const r3 = md.fixStatelessLand(roots(own));
    ok(r3 && r3.fixed === 1 && added(before3, own).length === 0, "THE CONTROL: a mod that owns state 1 and its buildings.txt is repaired in its own files", { r3, added: added(before3, own) });
    ok(r3 && !("materialised" in r3) && !(r3.buildingRows && r3.buildingRows.materialised), "⭐⭐ …and is told of no copy", r3);
  }

  // ═══ 2. fixCoastalNoPort ═══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 2. a port given in the base game's buildings.txt names the files it copied in ===");
  {
    // the mod moved coastal province 4 into state 1: its port row is keyed to state 2, so it counts for no province any more
    const files = { "history/states/1-West.txt": st(1, "West", "2 4"), "history/states/2-East.txt": st(2, "East", "3") };
    const B = makeMod(files);
    const dry = md.fixCoastalNoPort({ ...roots(B), dryRun: true });
    ok(dry && JSON.stringify(dry.targets) === "[4]", "THE CONTROL: the moved coast, 4, is the one portless coast", dry);
    const before = filesOf(B);
    const r = md.fixCoastalNoPort(roots(B));
    ok(r && !r.error && r.added === 1, "THE CONTROL: it is given a port", r);
    ok(same(added(before, B), ["map/buildings.txt", "map/definition.csv"]),
      "THE CONTROL: …which copied the base game's buildings.txt in, and its definition.csv to say 4 is coastal", added(before, B));
    ok(same(r.materialised, ["map/buildings.txt", "map/definition.csv"]), "⭐⭐⭐ the answer names both, mod-relative", r.materialised);

    const own = makeMod({ ...files, "map/buildings.txt": buildingRows(), "map/definition.csv": DEFINITION });
    const before2 = filesOf(own);
    const r2 = md.fixCoastalNoPort(roots(own));
    ok(r2 && r2.added === 1 && added(before2, own).length === 0, "THE CONTROL: a mod that owns both files gets its port in them", { r2, added: added(before2, own) });
    ok(r2 && !("materialised" in r2), "⭐⭐ …and is told of no copy", r2);
  }

  // ═══ 3. THE WHOLE CLICK, ON THE MILLENNIUM DAWN SHAPE ══════════════════════════════════════════════════════════════════════
  console.log("\n=== 3. one click on an add-on that emptied a base-game state: every file it copied in is named ===");
  {
    const C = makeMod({ "history/states/2-East.txt": st(2, "East", "") });       // the mod emptied state 2 by hand
    const dry = md.fixCoastalNoPort({ ...roots(C), dryRun: true });
    ok(dry && (dry.targets || []).length === 0, "THE CONTROL: before the click no coast lacks a port — 3 and 4 are in no state, so nothing can be given one", dry);
    const before = filesOf(C);
    const r = md.autoFixMap(roots(C));
    const f = (r && r.fixes) || {};
    const sl = f.statelessLand || {}, cnp = f.coastalNoPort || {}, bt = f.buildingsTxt || {};
    const got = added(before, C);
    ok(r && r.ok === true && !r.nothingToFix, "the click ran", r && (r.error || r.note));
    ok(sl.fixed === 2 && cnp.added >= 1, "THE CONTROL: it homed 3 and 4, then gave their coast its port — in the pass that settles the click", { sl, cnp });
    ok(got.includes("history/states/1-West.txt") && got.includes("map/buildings.txt"), "THE CONTROL: the click copied the base game's 1-West.txt and buildings.txt in", got);
    ok((sl.materialised || []).includes("history/states/1-West.txt"), "⭐⭐⭐ the stateless-land step names the state file", sl);
    ok((cnp.materialised || []).includes("map/buildings.txt"), "⭐⭐⭐ the port step names the buildings.txt its settling pass copied in", cnp);
    const named = [].concat(sl.materialised || [], cnp.materialised || [], Array.isArray(bt.materialised) ? bt.materialised : bt.materialized ? [bt.file || "map/buildings.txt"] : []);
    const unnamed = got.filter((rel) => rel !== "history/states/2-East.txt" && !named.includes(rel));
    ok(unnamed.length === 0, "⭐⭐⭐ EVERY file the click added is named by the three steps the page words", { got, named, unnamed });
  }

  // ═══ 4. 🔎 DERIVED ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 4. every rebuild of those steps' answers in autoFixMap keeps what they copied in ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const at = code.indexOf("function autoFixMap(");
    const span = at >= 0 ? jsBodyAt(lit, at) : null;
    const body = span ? code.slice(span[0], span[1] + 1) : "";
    const bodyLit = span ? lit.slice(span[0], span[1] + 1) : "";
    ok(body.length > 20000, "autoFixMap's body was found (or nothing below proves anything)", body.length);
    const rebuilds = [];
    for (const m of bodyLit.matchAll(/fixes\.(statelessLand|coastalNoPort)\s*=\s*\{/g)) {
      let d = 0, end = -1;
      for (let j = m.index + m[0].length - 1; j < bodyLit.length; j++) { if (bodyLit[j] === "{") d++; else if (bodyLit[j] === "}" && --d === 0) { end = j; break; } }
      const text = body.slice(m.index, end + 1);
      if (/^\S+\s*=\s*\{\s*\.\.\./.test(text)) rebuilds.push({ step: m[1], text });     // a rebuild from the answer before it
    }
    ok(rebuilds.filter((x) => x.step === "statelessLand").length >= 1 && rebuilds.filter((x) => x.step === "coastalNoPort").length >= 1,
      "both steps are rebuilt by a pass that settles the click (or this proves nothing)", rebuilds.map((x) => x.step));
    // the helper the rebuilds ask, read off the source, not named here: the one small function over a rest list of answers that reads
    // each one's `.materialised` (b6-g1 and b6-g3 both wrote one for B6-16; the merge keeps one, byte-identical on both branches)
    const helpers = [];
    for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*\.\.\.\s*[A-Za-z_$][\w$]*\s*\)|\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*\.\.\.\s*[A-Za-z_$][\w$]*\s*\)\s*=>/g)) {
      const hspan = jsBodyAt(lit, m.index), hbody = hspan ? code.slice(hspan[0], hspan[1] + 1) : "";
      if (hbody.length < 600 && /\.materialised\b/.test(hbody)) helpers.push({ name: m[1] || m[2], body: hbody });
    }
    const helper = helpers.length === 1 ? helpers[0] : null;
    ok(!!helper && /(\bincludes\(|\bindexOf\([^)]*\)\s*===\s*-1)/.test(helper.body), "⭐ …through one helper that unites every pass's list, each file once",
      helpers.map((h) => h.name + ": " + h.body.slice(0, 160)));
    const call = new RegExp(`\\b${helper ? helper.name.replace(/\$/g, "\\$") : "(?!)"}\\(([^)]*)\\)`, "g");
    const drops = rebuilds.filter((x) => !new RegExp(call.source).test(x.text));
    ok(drops.length === 0, "⭐⭐⭐ every such rebuild carries what its passes copied in, through that helper", drops.map((x) => x.text.slice(0, 160)));
    const uses = [...body.matchAll(call)].map((m) => m[1].split(",").length);
    ok(uses.length >= 2 && uses.every((n) => n >= 2), "⭐⭐ …asked of the step's previous answer AND the pass's own, at each rebuild", uses);
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  // only this test's own temp folder, and only when it is inside the temp folder
  const rel = path.relative(os.tmpdir(), ROOT);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); }
process.exitCode = fails.length ? 1 : 0;
