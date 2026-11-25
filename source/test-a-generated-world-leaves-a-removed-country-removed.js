// ⛔ #a-generated-world-keeps-every-country-below — …BUT A COUNTRY THE MOD ITSELF LEFT LANDLESS STAYS LANDLESS.
//
// Generate land gives every country of the world below a state (keepEveryCountryBelow), and asks who owns what of the world AS
// IT LOADS NOW before it asks the layer below (ownerFactsForGeneration). Without that second half the owner passes read the layer
// below alone, and a world built over a mod brought back countries the modder had dealt with:
//   (a) a country removed with Nova's own Delete country, whose land can never rise, was handed the nearest state by the keep
//       pass, and its "Intentionally empty" stub would have been given a capital line;
//   (b) a country removed with its land reassigned took 21–23 of the states raised on that land (measured on the critic's probe,
//       at 799a560 and with the keep pass alike);
//   (c) an add-on whose own states annexed a coastal country into its neighbour gave the islands it raised beside that coast back
//       to the annexed country, by proximity over the layer below;
//   (d) a world whose own states re-made part of a country's old land for a neighbour still counted that country as needing land.
//   (e) the same add-on as (c) with the annexed country inland: it gets nothing.
//   (g) a CHAIN of Delete country — CCC's land to BBB, then BBB's to AAA, or to nobody, or back to CCC: the removal was followed one
//       step, so CCC's old land went to BBB, which then spread over its own and took 23–28 states with no capital line (measured on
//       e725f4d2), and Map Errors said nothing.
// And the other side of that line: a country the mod did NOT deal with is kept even when the id its capital line names is a state
// the mod re-used for someone else —
//   (f) its line is written onto the state it was given, not left naming its neighbour's (capital_state_owned_by_other).
//
// Fixture-only: binds no port. Run: node test-a-generated-world-leaves-a-removed-country-removed.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-removed-country-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// A 24 x 16 lattice of one-pixel provinces. `shape` picks where CCC is below: "coast" (x 10..11, beside the ocean from x 12) or
// "inland" (x 2..3, y 6..9, inside AAA's land). AAA holds x < 5, BBB the rest of x < 12 (x 5..9 for "coast"). `ccRegionless` puts
// CCC's land in no strategic region, so it can never rise; `seaRegionsOnly` gives regions only to the two ocean columns beside
// CCC's coast (x 12..13), so whatever is raised is raised there.
const W = 24, H = 16, N = W * H;
const idAt = (x, y) => y * W + x + 1, xOf = (id) => (id - 1) % W, yOf = (id) => Math.floor((id - 1) / W);
const colourOf = (id) => [id & 255, (id >> 8) & 255, 83];
function world(label, { shape, ccRegionless = false, seaRegionsOnly = false }) {
  const tagBelow = (id) => {
    const x = xOf(id), y = yOf(id);
    if (shape === "inland") return (x >= 2 && x <= 3 && y >= 6 && y <= 9) ? "CCC" : x < 5 ? "AAA" : x < 12 ? "BBB" : "";
    return x < 5 ? "AAA" : x < 10 ? "BBB" : x < 12 ? "CCC" : "";
  };
  const regionOf = (id) => {
    if (ccRegionless && tagBelow(id) === "CCC") return 0;
    if (seaRegionsOnly && !tagBelow(id) && !(xOf(id) >= 12 && xOf(id) <= 13)) return 0;
    return Math.floor(xOf(id) / 6) + 4 * Math.floor(yOf(id) / 8) + 1;
  };
  const base = path.join(SANDBOX, "base-" + label);
  const defRows = (landOf) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
    const id = i + 1, [r, g, b] = colourOf(id);
    return landOf(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`;
  })).join("\r\n") + "\r\n";
  mk(path.join(base, "map", "definition.csv"), defRows((id) => !!tagBelow(id)));
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byR = new Map();
  for (let id = 1; id <= N; id++) { const r = regionOf(id); if (!r) continue; if (!byR.has(r)) byR.set(r, []); byR.get(r).push(id); }
  for (const [r, p] of byR) mk(path.join(base, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${p.join(" ")} }\n\tweather={}\n}\n`);
  mk(path.join(base, "common", "state_category", "00.txt"), "state_categories = {\n\ttown = { local_building_slots = 4 }\n\trural = { local_building_slots = 2 }\n}\n");
  const byKey = new Map();
  for (let id = 1; id <= N; id++) { const t = tagBelow(id); if (!t) continue; const k = `${t}|${Math.floor(yOf(id) / 4)}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(id); }
  let sid = 1; const capOf = {}; const states = [];
  for (const [k, p] of [...byKey].sort()) {
    const t = k.split("|")[0], me = sid;   // `me`, not `sid`: block() is called again later, when sid has moved on
    if (!capOf[t]) capOf[t] = me;
    const block = (owner) => `state = {\n\tid = ${me}\n\tname = "STATE_${me}"\n\tmanpower = ${1000 * p.length}\n\tstate_category = town\n\tprovinces = { ${p.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${t}\n${capOf[t] === me ? `\t\tvictory_points = { ${p[0]} 20 }\n` : ""}\t}\n}\n`;
    mk(path.join(base, "history", "states", `${me}-S.txt`), block(t));
    states.push({ id: me, tag: t, provinces: p, block });
    sid++;
  }
  for (const t of Object.keys(capOf)) mk(path.join(base, "history", "countries", `${t} - X.txt`), `﻿capital = ${capOf[t]} # home\r\noob = "${t}_1936"\r\n`);
  return { base, tagBelow, regionOf, states, defRows };
}
// Delete map's world over `w`: every province sea (`keepLand` stays land), replace_path="history/states".
function blankedMod(w, label, keepLand = () => false) {
  const mod = path.join(SANDBOX, "mod-" + label);
  mk(path.join(mod, "descriptor.mod"), 'name="Removed"\nreplace_path="history/states"\n');
  mk(path.join(mod, "map", "definition.csv"), w.defRows(keepLand));
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return mod;
}
function statesOn(mod) {
  const d = path.join(mod, "history", "states");
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).map((f) => { const t = fs.readFileSync(path.join(d, f), "utf8"); return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/owner\s*=\s*(\w+)/.exec(t) || [])[1] || "", provinces: ((((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number) }; });
}
const seaRegionCount = (mod, w) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).filter((l) => /;sea;/.test(l) && w.regionOf(+l.split(";")[0])).length;

console.log("=== (a) a country removed with Delete country, whose land can never rise, is not brought back ===");
{
  const w = world("a", { shape: "inland", ccRegionless: true });
  const mod = blankedMod(w, "a");
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const del = md.deleteCountry({ ...roots, tag: "CCC", reassignTo: "" });
  const stubPath = path.join(mod, "history", "countries", "CCC - X.txt");
  rec("the fixture: CCC is removed by Nova's own Delete country, which leaves its stub and its archive", del.ok === true && fs.existsSync(stubPath)
    && md.listRemovedCountries({ modRoot: mod }).some((r) => r.tag === "CCC"), del);
  const stub = fs.readFileSync(stubPath);
  const r = md.generateLand({ ...roots, count: seaRegionCount(mod, w), seed: 3, provincesPerState: 6 });
  rec("generate land ran", r.changed === true && r.createdStates > 4, { error: r.error, states: r.createdStates });
  const ccc = statesOn(mod).filter((s) => s.owner === "CCC");
  rec("⭐⭐⭐ the removed country owns no state in the world built over it", ccc.length === 0, ccc.map((s) => s.id));
  rec("⭐⭐ …nor is it reported as kept, or as gone: the mod left it landless", !((r.countries || {}).kept || []).some((k) => k.tag === "CCC")
    && !((r.countries || {}).stillGone || []).includes("CCC"), r.countries);
  rec("⭐⭐⭐ …and its \"intentionally empty\" stub is byte-identical — no capital line was written into it",
    Buffer.compare(stub, fs.readFileSync(stubPath)) === 0, fs.readFileSync(stubPath, "utf8").split(/\r?\n/)[0]);
  rec("CONTROL: the other countries below still hold land", ["AAA", "BBB"].every((t) => statesOn(mod).some((s) => s.owner === t)));
}

console.log("\n=== (b) a country removed with its land reassigned: the land raised there goes to whoever took it ===");
{
  const w = world("b", { shape: "coast" });
  const mod = blankedMod(w, "b");
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const del = md.deleteCountry({ ...roots, tag: "CCC", reassignTo: "BBB" });
  rec("the fixture: CCC removed, its land reassigned to BBB", del.ok === true && del.reassignedTo === "BBB", del);
  const r = md.generateLand({ ...roots, count: seaRegionCount(mod, w), seed: 3, provincesPerState: 6 });
  const st = statesOn(mod);
  const onCCC = st.filter((s) => { const n = s.provinces.filter((p) => w.tagBelow(p) === "CCC").length; return n * 2 > s.provinces.length; });
  rec("the fixture: states were raised on CCC's old land", onCCC.length > 0, onCCC.length);
  rec("⭐⭐⭐ the removed country owns no state", !st.some((s) => s.owner === "CCC"), st.filter((s) => s.owner === "CCC").map((s) => s.id));
  rec("⭐⭐⭐ …every state raised mostly on its old land goes to the country it was reassigned to", onCCC.every((s) => s.owner === "BBB"),
    onCCC.filter((s) => s.owner !== "BBB").map((s) => `${s.id}:${s.owner}`));
  rec("…and the result says nothing of keeping CCC", !((r.countries || {}).kept || []).some((k) => k.tag === "CCC"), r.countries);
}

console.log("\n=== (c) an add-on that annexed a coastal country: the islands raised beside its coast go to the annexer ===");
function annexingAddOn(label, shape) {
  const w = world(label, { shape, seaRegionsOnly: true });
  const mod = path.join(SANDBOX, "mod-" + label);
  mk(path.join(mod, "descriptor.mod"), 'name="Annexing add-on"\n');
  // the add-on's own copy of each of CCC's state files, same name, owner BBB — an annexation, the way a mod writes one
  for (const s of w.states.filter((x) => x.tag === "CCC")) mk(path.join(mod, "history", "states", `${s.id}-S.txt`), s.block("BBB"));
  return { w, mod };
}
{
  const { w, mod } = annexingAddOn("c", "coast");
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const before = new Set(statesOn(mod).map((s) => s.id));
  const r = md.generateLand({ ...roots, count: 6, seed: 5, provincesPerState: 2 });
  rec("generate land ran on the add-on", r.changed === true && r.createdStates > 0, { error: r.error, states: r.createdStates });
  const made = statesOn(mod).filter((s) => !before.has(s.id));
  const beside = made.filter((s) => s.provinces.some((p) => xOf(p) === 12));
  rec("the fixture: islands were raised right beside CCC's old coast", beside.length > 0, made.map((s) => `${s.id}:[${s.provinces}]`));
  rec("⭐⭐⭐ every state raised there goes to the country that annexed CCC, as the world loads now — not to CCC, as it was below",
    made.length > 0 && made.every((s) => s.owner === "BBB"), made.map((s) => `${s.id}:${s.owner}`));
}

console.log("\n=== (d) a world whose own states re-made part of a country's land for a neighbour: that country is not kept ===");
{
  const w = world("d", { shape: "inland", ccRegionless: true });
  // Delete map's world, but the modder kept CCC's first state as land and made it BBB's — the rest of CCC's land is drowned
  const cccFirst = w.states.find((s) => s.tag === "CCC");
  const keep = new Set(cccFirst.provinces);
  const mod = blankedMod(w, "d", (id) => keep.has(id));
  mk(path.join(mod, "history", "states", `${cccFirst.id}-S.txt`), cccFirst.block("BBB"));
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const r = md.generateLand({ ...roots, count: seaRegionCount(mod, w), seed: 3, provincesPerState: 6 });
  rec("generate land ran", r.changed === true && r.createdStates > 4, { error: r.error, states: r.createdStates });
  rec("the fixture: CCC still has drowned land below that loads in no state", w.states.filter((s) => s.tag === "CCC").length > 1);
  const ccc = statesOn(mod).filter((s) => s.owner === "CCC");
  rec("⭐⭐⭐ the country whose land the mod's own state gave to its neighbour is not handed a state", ccc.length === 0 && !((r.countries || {}).kept || []).some((k) => k.tag === "CCC"),
    { ccc: ccc.map((s) => s.id), kept: (r.countries || {}).kept });
  rec("CONTROL: a country the mod did not deal with is still on the map", ["AAA"].every((t) => statesOn(mod).some((s) => s.owner === t)));
}

console.log("\n=== (e) the same add-on with the annexed country inland: it gets nothing ===");
{
  const { w, mod } = annexingAddOn("e", "inland");
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const r = md.generateLand({ ...roots, count: 6, seed: 5, provincesPerState: 2 });
  rec("generate land ran on the add-on", r.changed === true && r.createdStates > 0, { error: r.error, states: r.createdStates });
  const model = md.buildMapModel({ ...roots, cacheStableLayers: false });
  rec("⭐⭐ the annexed country owns no state, and nothing was kept for it", !(model.states || []).some((s) => s.owner === "CCC")
    && !((r.countries || {}).kept || []).some((k) => k.tag === "CCC"), (r.countries || {}).kept);
  rec("…and no country file was written into the add-on", !fs.existsSync(path.join(mod, "history", "countries")), fs.existsSync(path.join(mod, "history", "countries")) ? fs.readdirSync(path.join(mod, "history", "countries")) : []);
}

console.log("\n=== (f) a kept country whose capital line names a state the mod re-used for its neighbour gets a line of its own ===");
{
  const w = world("f", { shape: "inland", ccRegionless: true });
  // Delete map's world, but the modder kept BBB's first state as land and filed it under the id CCC's capital line names: CCC's own
  // land is all drowned and none of it loads, so CCC is not dealt with — only its capital id was taken
  const bbbFirst = w.states.find((s) => s.tag === "BBB"), cccCap = w.states.find((s) => s.tag === "CCC").id;
  const keep = new Set(bbbFirst.provinces);
  const mod = blankedMod(w, "f", (id) => keep.has(id));
  mk(path.join(mod, "history", "states", `${cccCap}-S.txt`), `state = {\n\tid = ${cccCap}\n\tname = "STATE_${cccCap}"\n\tmanpower = 1000\n\tstate_category = town\n`
    + `\tprovinces = { ${bbbFirst.provinces.join(" ")} }\n\thistory = {\n\t\towner = BBB\n\t\tadd_core_of = BBB\n\t}\n}\n`);
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const bbbFile = path.join(mod, "history", "states", `${cccCap}-S.txt`), bbbBytes = fs.readFileSync(bbbFile);
  const before = md.buildMapModel({ ...roots, cacheStableLayers: false });
  rec("the fixture: CCC's capital line names a state the mod has, owned by BBB, holding none of CCC's land",
    before.capitals.CCC === cccCap && ((before.states || []).find((s) => s.id === cccCap) || {}).owner === "BBB"
    && !bbbFirst.provinces.some((p) => w.tagBelow(p) === "CCC"), { cap: before.capitals.CCC });
  const r = md.generateLand({ ...roots, count: seaRegionCount(mod, w), seed: 3, provincesPerState: 6 });
  rec("generate land ran", r.changed === true && r.createdStates > 4, { error: r.error, states: r.createdStates });
  md.clearMapLayerCache();
  const after = md.buildMapModel({ ...roots, cacheStableLayers: false });
  const ccc = (after.states || []).filter((s) => s.owner === "CCC");
  rec("CCC was kept: it holds exactly one state", ccc.length === 1 && ((r.countries || {}).kept || []).some((k) => k.tag === "CCC"), { ccc: ccc.map((s) => s.id), kept: (r.countries || {}).kept });
  rec("⭐⭐⭐ CCC's capital line now names the state it was given — not the one the mod re-used for BBB",
    ccc.length === 1 && after.capitals.CCC === ccc[0].id && ((r.countries || {}).capitals || {}).written.some((x) => x.tag === "CCC" && x.state === ccc[0].id),
    { cap: after.capitals.CCC, written: ((r.countries || {}).capitals || {}).written });
  rec("…and the state the mod filed under that id is byte-for-byte the mod's still", Buffer.compare(bbbBytes, fs.readFileSync(bbbFile)) === 0
    && ((after.states || []).find((s) => s.id === cccCap) || {}).owner === "BBB");
}

console.log("\n=== (g) a chain of Delete country is followed to the end: no country removed along it comes back ===");
for (const [label, chain] of [["g1", [["CCC", "BBB"], ["BBB", "AAA"]]], ["g2", [["CCC", "BBB"], ["BBB", ""]]], ["g3", [["CCC", "BBB"], ["BBB", "CCC"]]]]) {
  const w = world(label, { shape: "coast" });
  const mod = blankedMod(w, label);
  const roots = { modRoot: mod, gameRoot: w.base, dependencyRoots: [] };
  const dels = chain.map(([tag, to]) => md.deleteCountry({ ...roots, tag, reassignTo: to }));
  const said = chain.map(([t, to]) => `${t}->${to || "nobody"}`).join(", ");
  // where the chain ends, followed by hand over the fixture's own list: a tag met twice is a cycle, and stands for nobody
  const end = (t) => { const to = new Map(chain); for (const seen = new Set(); to.has(t); t = to.get(t)) { if (seen.has(t)) return ""; seen.add(t); } return t; };
  const gone = chain.map(([t]) => t);
  rec(`(${label}) the fixture: ${said} — both removed by Delete country, each leaving its stub`, dels.every((d) => d.ok === true)
    && gone.every((t) => fs.existsSync(path.join(mod, "history", "countries", `${t} - X.txt`)))
    && gone.every((t) => md.listRemovedCountries({ modRoot: mod }).some((r) => r.tag === t)), dels);
  const stubs = new Map(gone.map((t) => [t, fs.readFileSync(path.join(mod, "history", "countries", `${t} - X.txt`))]));
  const r = md.generateLand({ ...roots, count: seaRegionCount(mod, w), seed: 3, provincesPerState: 6 });
  const st = statesOn(mod);
  const mostlyOf = (t) => st.filter((s) => s.provinces.filter((p) => w.tagBelow(p) === t).length * 2 > s.provinces.length);
  rec(`(${label}) the fixture: states were raised mostly on CCC's old land and on BBB's`, mostlyOf("CCC").length > 0 && mostlyOf("BBB").length > 0,
    { onCCC: mostlyOf("CCC").length, onBBB: mostlyOf("BBB").length });
  rec(`(${label}) ⭐⭐⭐ no country removed along the chain owns a state`, !st.some((s) => gone.includes(s.owner)),
    st.filter((s) => gone.includes(s.owner)).map((s) => `${s.id}:${s.owner}`));
  // CCC's and BBB's old land goes where the chain ends — to that country, or, when it ends with nobody, to whoever proximity
  // gives it, which is never a removed tag (above)
  const endTag = end("CCC");
  rec(`(${label}) ⭐⭐ …every state raised mostly on CCC's or BBB's old land goes ${endTag ? "to " + endTag + ", where the chain ends" : "to a country that stands"}`,
    [...mostlyOf("CCC"), ...mostlyOf("BBB")].every((s) => endTag ? s.owner === endTag : !gone.includes(s.owner)),
    [...mostlyOf("CCC"), ...mostlyOf("BBB")].map((s) => `${s.id}:${s.owner}`));
  rec(`(${label}) …neither is reported as kept or as gone`, !((r.countries || {}).kept || []).some((k) => gone.includes(k.tag))
    && !((r.countries || {}).stillGone || []).some((t) => gone.includes(t)), r.countries);
  rec(`(${label}) …and both "intentionally empty" stubs are byte-identical`, gone.every((t) => Buffer.compare(stubs.get(t), fs.readFileSync(path.join(mod, "history", "countries", `${t} - X.txt`))) === 0));
  md.clearMapLayerCache();
  const model = md.buildMapModel({ ...roots, cacheStableLayers: false });
  const capless = [...new Set((model.states || []).map((s) => s.owner).filter(Boolean))].filter((t) => model.capitals[t] == null);
  rec(`(${label}) ⭐⭐ every country that owns a state in the world written has a capital line`, capless.length === 0, { capless, capitals: model.capitals });
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
