// fixInlandSeas' plan is exactly what its repair fills. #generate-land-fills-the-seas-it-cuts-off
//
// THE DEFECT. The only way to ask fixInlandSeas "which seas would you fill?" without letting it write was its dry run, and that
// answers a different question on purpose: baseInlandSeaProvinces measures a layer BELOW the mod with it, so it applies neither
// the mod's own evidence that a sea is in use nor the seas the layers below ship cut off. Asked for the seas Auto-fix is about to
// fill, it named both kinds too (critic R6, verified: "the dry run ignores inUse and the inherited set"). Generate land and the
// rivers writer both need the real answer.
//
// THE FIX. inlandSeaPlan is the one plan; the repair converts what it says, `plan: true` returns it under the repair's own
// filters and writes nothing, and the dry run keeps its contract.
//
// The fixture: an add-on over a dependency over the base game, with four isolated seas of its own, one of each kind —
//   2   cut off in the dependency too (inherited)          4   cut off by the add-on alone (to fill)
//   9   faced by a port in the add-on's own buildings.txt  11  alone in its strategic region (mostly water)
// Every expectation below is derived from the tables that build it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seaplan-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  for (const [rel, body] of Object.entries(files)) { const p = path.join(d, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return d;
}
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// Twelve provinces, two columns each. The ocean is 6 and 7; the base game is land everywhere else.
const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const COL = Object.fromEntries(IDS.map((i) => [i, [i * 20, 255 - i * 20, (i * 37) % 256]]));
const provAtX = (x) => IDS[Math.floor(x / 2)];
const GAME_TYPE = Object.fromEntries(IDS.map((i) => [i, i === 6 || i === 7 ? "sea" : "land"]));
const DEP_SEA = [2], ADDON_SEA = [2, 4, 9, 11], PORT_ON = 9;
const REGIONS = { 100: [1, 2, 3, 4, 5, 8, 9, 10, 12], 200: [11], 300: [6, 7] };
const typesWith = (seas) => Object.fromEntries(IDS.map((i) => [i, seas.includes(i) ? "sea" : GAME_TYPE[i]]));
const DEF = (types) => ["0;0;0;0;land;false;unknown;0"].concat(IDS.map((i) => `${i};${COL[i].join(";")};${types[i]};false;${types[i] === "sea" ? "ocean" : "plains"};${types[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n";
const reg = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`;
const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;

const GAME = dir("game", {
  "map/provinces.bmp": bmp24(24, 4, (x) => COL[provAtX(x)]),
  "map/definition.csv": DEF(GAME_TYPE),
  ...Object.fromEntries(Object.entries(REGIONS).map(([r, ps]) => [`map/strategicregions/${r}-R.txt`, reg(r, ps)])),
  "history/states/1-A.txt": st(1, [1, 2, 3, 4, 5]),
  "history/states/2-B.txt": st(2, [8, 9, 10, 11, 12]),
});
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEF(typesWith(DEP_SEA)) });
const addonFiles = {
  "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n',
  "map/definition.csv": DEF(typesWith(ADDON_SEA)),
  "map/buildings.txt": `2;naval_base_spawn;17.00;9.90;2.00;0.00;${PORT_ON}\r\n`,
};
const opts = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [DEP] });
const sorted = (a) => [...a].sort((x, y) => x - y);
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const hashTree = (d) => {
  const out = [];
  const walk = (p) => { for (const f of fs.readdirSync(p).sort()) { const q = path.join(p, f); if (fs.statSync(q).isDirectory()) walk(q); else out.push(path.relative(d, q) + ":" + crypto.createHash("sha1").update(fs.readFileSync(q)).digest("hex")); } };
  walk(d);
  return out.join("\n");
};

try {
  console.log("=== fixInlandSeas' plan is what its repair fills ===\n");

  // what each sea is, from the tables: every add-on sea but the ocean is cut off (land lies between any two of them)
  const addonTypes = typesWith(ADDON_SEA);
  const isWater = (i) => addonTypes[i] === "sea" || addonTypes[i] === "lake";
  const regionOf = (i) => Object.keys(REGIONS).find((r) => REGIONS[r].includes(i));
  const halfWater = (i) => { const ps = REGIONS[regionOf(i)]; return 2 * ps.filter(isWater).length >= ps.length; };
  const ocean = IDS.filter((i) => GAME_TYPE[i] === "sea");
  const cutOff = ADDON_SEA.filter((i) => !ocean.includes(i));
  const want = { caspian: cutOff.filter(halfWater) };
  want.inUse = cutOff.filter((i) => !want.caspian.includes(i) && i === PORT_ON);
  want.inherited = cutOff.filter((i) => !want.caspian.includes(i) && !want.inUse.includes(i) && DEP_SEA.includes(i));
  want.fill = cutOff.filter((i) => ![...want.caspian, ...want.inUse, ...want.inherited].includes(i));
  rec("THE CONTROL: the fixture holds one cut-off sea of each kind", ["caspian", "inUse", "inherited", "fill"].every((k) => want[k].length === 1), want);

  console.log("\n1. The plan");
  const a = dir("addon", addonFiles);
  const before = hashTree(a);
  const plan = md.fixInlandSeas({ ...opts(a), plan: true });
  rec("⭐⭐⭐ the plan fills exactly the sea the add-on alone cut off", !plan.error && plan.plan === true && eq(plan.fill || [], want.fill), plan);
  rec("⭐⭐ …and keeps the others, each for its own reason",
    eq((plan.kept || {}).caspian || [], want.caspian) && eq((plan.kept || {}).inUse || [], want.inUse) && eq((plan.kept || {}).inherited || [], want.inherited), plan.kept);
  rec("…counting the bodies it keeps whole the way the repair always has (mostly-water and put-to-use ones)", plan.keptSeaBodies === want.caspian.length + want.inUse.length, plan.keptSeaBodies);
  rec("⭐⭐ a plan writes nothing", hashTree(a) === before);
  const planGiven = md.fixInlandSeas({ ...opts(a), plan: true, inUse: md.seaProvincesPutToUse({ modRoot: a }) });
  rec("…and with the evidence handed in, as autoFixMap hands it, the plan is the same", eq(planGiven.fill || [], plan.fill || []), planGiven);

  console.log("\n2. The repair, on a twin");
  const b = dir("addon-twin", addonFiles);
  const r = md.fixInlandSeas(opts(b));
  const converted = (r.details || []).map((d) => d.province);
  rec("⭐⭐⭐ the repair converts exactly what the plan said it would fill", !r.error && eq(converted, plan.fill || []), { converted, plan: plan.fill });
  rec("…and keeps as many bodies", r.keptSeaBodies === plan.keptSeaBodies, { repair: r.keptSeaBodies, plan: plan.keptSeaBodies });
  const t = fs.readFileSync(path.join(b, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";"));
  const typeIn = (i) => (t.find((c) => c[0] === String(i)) || [])[4];
  rec("…and on disk every kept sea is still sea", [...want.caspian, ...want.inUse, ...want.inherited].every((i) => typeIn(i) === "sea") && want.fill.every((i) => typeIn(i) === "land"),
    Object.fromEntries(cutOff.map((i) => [i, typeIn(i)])));

  console.log("\n3. The dry run keeps its own contract");
  const c = dir("addon-dry", addonFiles);
  const dry = md.fixInlandSeas({ ...opts(c), dryRun: true });
  rec("⭐⭐ the dry run still names every cut-off sea a mostly-water region does not keep — the put-to-use and inherited ones too, as baseInlandSeaProvinces needs",
    !dry.error && eq(dry.targets || [], cutOff.filter((i) => !want.caspian.includes(i))), dry);

  console.log(`\n=== fixInlandSeas' plan is what its repair fills: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
