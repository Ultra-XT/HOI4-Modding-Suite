// ⛔ #a-wing-with-no-base-at-home-names-the-map-step (tool campaign B2-8, the words; Q3).
//
// An owner change that takes a country's last air-base state leaves its air wings based in another country's state:
// air_wing_based_abroad, a warning (HOI4 loads them without a word). Auto-fix re-bases a wing only onto an air base its own country
// owns, and invents none — that decline is decided (test-a-dated-air-wing-is-judged-by-who-held-its-state-then.js §7) and stays. What
// was wrong is the words: the rule and the 🔧 line named no step a Map tool can do, only a hand edit of history/units, while one exists
// — give one of the country's states an Air base in the state panel, Save, and Auto-fix all re-bases the wings (B2's drive: air_base 1
// on state 337 re-based DEN's 8 wings).
//   1. the row for a wing that cannot move names the state panel's Air base step, before the hand edit;
//   2. the page's Auto-fix line for such wings names it too;
//   3. control: when every wing can move, the row does not;
//   4. the step works: with an Air base on one of the country's states, the repair re-bases the wing and the row is gone.
// Binds no port. Run: node test-a-wing-with-no-base-at-home-names-the-map-step.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wing-no-base-"));
process.env.NOVA_APP_DATA_DIR = path.join(ROOT, "appdata"); process.env.APPDATA = process.env.NOVA_APP_DATA_DIR; process.env.XDG_CONFIG_HOME = process.env.NOVA_APP_DATA_DIR;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_APP_DATA_DIR, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const TL = require("./testlib-map-page.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// four states, each a row of four provinces; the base game gives 1-2 to AAA and 3-4 to BBB, every state an air base
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const rowOf = (id) => [1, 2, 3, 4].map((k) => 4 * id - 4 + k);
const stateTxt = (id, owner, airBase) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${rowOf(id).join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n${airBase ? `\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tair_base = ${airBase}\n\t\t}\n` : ""}\t}\n}\n`;
const GAME = path.join(ROOT, "game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
mk(GAME, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...Array.from({ length: 16 }, (_, i) => { const p = i + 1, [r, g, b] = COL(p); return `${p};${r};${g};${b};land;false;plains;1`; })].join("\n") + "\n");
for (const [id, o] of [[1, "AAA"], [2, "AAA"], [3, "BBB"], [4, "BBB"]]) mk(GAME, `history/states/${id}.txt`, stateTxt(id, o, 1));
mk(GAME, "history/countries/AAA - Aland.txt", 'capital = 2\nset_air_oob = "AAA_air"\n');
mk(GAME, "history/countries/BBB - Bland.txt", 'capital = 3\n');
mk(GAME, "history/units/AAA_air.txt", "air_wings = {\n\t1 = {\n\t\tfighter_equipment_0 = { owner = \"AAA\" amount = 50 }\n\t}\n}\n");
// the mod hands state 1 to BBB; `aaaBase` says whether AAA's state 2 keeps its air base
function mod(label, aaaBase) {
  const m = path.join(ROOT, label);
  mk(m, "descriptor.mod", `name="${label}"\nreplace_path="history/states"\n`);
  for (const [id, o, ab] of [[1, "BBB", 1], [2, "AAA", aaaBase], [3, "BBB", 1], [4, "BBB", 1]]) mk(m, `history/states/${id}.txt`, stateTxt(id, o, ab));
  return { modRoot: m, gameRoot: GAME, dependencyRoots: [] };
}
const row = (c) => (md.validateMapBitmap(c) || []).find((p) => p.rule === "air_wing_based_abroad");
const STEP = /give one of AAA's states an Air base in the state panel \(click the state, then its Air base field\), Save, and click "Auto-fix all" again/;

try {
  console.log("=== 1. a wing that cannot move: the row names the Map step ===");
  const c = mod("stuck", 0);
  const r = row(c);
  ok("AAA's wing in state 1 (now BBB's) is reported, and cannot move: AAA owns no state with an air base", r && r.total === 1 && r.movable === 0 && /AAA owns no state with an air base/.test(r.message), r);
  ok("…and the row names the state panel's Air base step", STEP.test(r.message), r.message);
  ok("…before the hand edit", r.message.search(STEP) < r.message.indexOf("Otherwise key each wing to a state of its own country yourself"), r.message);

  console.log("=== 2. the page's Auto-fix line ===");
  const fx = md.fixAirWingsBasedAbroad(c);
  ok("the repair declines it, as decided: noAirBase 1, nothing moved", fx && !fx.moved && fx.noAirBase === 1, fx);
  const line = TL.autoFixSummary({ ok: true, fixes: { airWingsAbroad: fx } });
  ok("the 🔧 line names the step", /air wing\(s\) are still based in another country's state: their own country owns no state with an air base, and Nova will not invent one — give one of its states an Air base in the state panel \(click the state, then its Air base field\), Save, and click Auto-fix all again/.test(line), line);

  console.log("=== 3. control: a wing that can move ===");
  const k = row(mod("movable", 1));
  ok("with AAA's state 2 keeping its air base the wing is movable, and the row names no such step", k && k.movable === 1 && !/To base (it|them) at home/.test(k.message), k);

  console.log("=== 4. the step works ===");
  mk(c.modRoot, "history/states/2.txt", stateTxt(2, "AAA", 1));   // what the state panel's Air base field writes
  const fx2 = md.fixAirWingsBasedAbroad(c);
  ok("with an Air base on state 2, Auto-fix's repair re-bases the wing", fx2 && fx2.moved === 1, fx2);
  ok("…and the row is gone", !row(c));
  console.log(`\ntest-a-wing-with-no-base-at-home-names-the-map-step: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixture */ }
}
