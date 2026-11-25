// A port in map/buildings.txt whose 7th column is not a SEA — a lake, a province definition.csv does not have, or no
// province at all — is reported, removed when the water under it is retyped, and repaired by Auto-fix.
// #a-port-whose-sea-is-not-a-sea
//
// A naval_base_spawn row's 7th column is the sea province its ships go out into. hoi4.exe's buildings.txt loader has two
// messages for a column that is not one, beside its "ignoring instance" / "BUILDING IGNORED!" skips:
//     " port building has a lake as sea zone for province "
//     " port building has invalid sea zone for province "
// and the naval, trade and supply code later assumes every port has one: "Province with Port but no SeaZoneForPort",
// "Naval base province without sea province", "Naval base province does not have a valid sea zone for the port."
// The wiki (Map_modding, Troubleshooting) ties a naval base without a proper buildings.txt definition to a crash once
// the AI evaluates or uses it.
//
// Measured on the six shipping maps, every port row's 7th column is a SEA: naval_base_spawn vanilla 2,362 · Millennium
// Dawn 2,750 · Road to 56 2,544 (+ 1,707 naval_headquarters) · Old World Blues 4,421 · Novum Vexillum 2,752 · Rise of
// Nations 2,358. Lake 0, missing 0, zero-or-none 0.
//
// Nova reported only the LAND case (naval_base_water_is_gone: `if (isLand.get(a) !== true) continue;`), and the
// province inspector reaches the lake case in one click: its Type dropdown offers lake, the endpoint delegates only
// land→water, so sea→lake goes to setProvinceDefinition — which removed the ports facing a province only on →land.
//
// An ERROR, not in the FATAL set: the loader logs it, and no crash from a lake sea zone has been reproduced.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-portsea-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel, mapRuleFixHint } = require("./public/map-rule-labels.js");
const { createApp } = require("./server.js");
const RULE = "naval_base_sea_zone_invalid";
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 256x256. Land 1-12 are a 4x3 grid of 64px squares (states 1, 2, 3 by row). Below them, sea 13 (x < 96) — the water
// that gets retyped — and sea 14. Province 9 touches only 13; province 10 touches 13 AND 14; 11 and 12 touch only 14.
const provAt = (x, y) => (y < 192 ? Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1 : (x < 96 ? 13 : 14));
const COL = (p) => [p * 16, 255 - p * 8, (p * 37) % 256];
const Z = (y) => (255 - y).toFixed(2);                       // buildings.txt z is bottom-up
const port = (x, anchor) => `3;naval_base_spawn;${x.toFixed(2)};9.50;${Z(190)};0.00;${anchor}`;
const P9 = port(32, 13), P10 = port(80, 13), P11 = port(160, 14), P12 = port(224, 14);
const site = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${Z(y)};0.00;0`;
const SITES = [
  site(1, "air_base", 32, 32), site(1, "rocket_site_spawn", 36, 32),
  site(2, "air_base", 32, 96), site(2, "rocket_site_spawn", 36, 96),
  site(3, "air_base", 32, 160), site(3, "rocket_site_spawn", 36, 160),
];

function makeMod(name, { lake = false, extraRows = [] } = {}) {
  const mod = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n`);
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 12; p++) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};land;${p >= 9 ? "true" : "false"};plains;1`); }
  for (const p of [13, 14]) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};${p === 13 && lake ? "lake" : "sea"};false;${p === 13 && lake ? "lakes" : "ocean"};0`); }
  mk("map/definition.csv", rows.join("\n") + "\n");
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 5000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk("history/states/1-A.txt", st(1, "1 2 3 4"));
  mk("history/states/2-B.txt", st(2, "5 6 7 8"));
  mk("history/states/3-C.txt", st(3, "9 10 11 12"));
  mk("history/countries/AAA - Aland.txt", "capital = 1\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1-Land.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk("map/strategicregions/2-Sea.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 }\n\tnaval_terrain = water_deep_ocean\n${weather}}\n`);
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/buildings.txt", [P9, P10, P11, P12, ...extraRows, ...SITES].join("\n"));
  return mod;
}
const rowsOf = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const ports = (mod) => rowsOf(mod).filter((l) => l.split(";")[1] === "naval_base_spawn");
const validate = (mod) => M.validateMapBitmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
const defRow = (mod, id) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "";

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // Exactly what public/map.js sends: flushMapSaves posts Object.assign({}, w.body, { modPath }).
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("0. ⚠️ Nothing that ships trips it");
    if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  ..   (the base game is not installed)");
    else {
      const probs = M.validateMapBitmap({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).filter((p) => p.rule === RULE);
      const n = fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "utf8").split("\n").filter((l) => l.split(";")[1] === "naval_base_spawn").length;
      rec("⭐⭐ the base game: not one port reported", probs.length === 0, probs.map((p) => String(p.message).slice(0, 120)));
      rec(`…out of ${n} naval_base_spawn rows — not a vacuous pass`, n > 2000, n);
    }

    console.log("\n1. A map that already carries ports facing a lake, a missing province, or no province is told so");
    {
      const P10b = port(96, 99), P10c = port(100, 0);
      const mod = makeMod("carries", { lake: true, extraRows: [P10b, P10c] });
      const probs = validate(mod);
      const p = probs.filter((x) => x.rule === RULE);
      rec("⭐⭐⭐ the validator reports it, once", p.length === 1, probs.map((x) => x.rule));
      const it = p[0] || {};
      rec("⭐⭐ …naming all four rows", Array.isArray(it.items) && it.items.length === 4, it.items);
      rec("…and the provinces they point at", Array.isArray(it.provinces) && it.provinces.includes(13) && it.provinces.includes(99), it.provinces);
      rec("⭐ …as an ERROR", it.severity === "error", it.severity);
      rec("⭐⭐ …NOT in the fatal set: the loader logs it and no crash has been reproduced", isFatalRule(RULE) === false);
      rec("…quoting what the game logs", /lake as sea zone/.test(String(it.message)) && /invalid sea zone/.test(String(it.message)), String(it.message).slice(0, 300));
      rec("…with a label a modder can read", mapRuleLabel(RULE) !== "Naval base sea zone invalid", mapRuleLabel(RULE));
      rec("…and a fix hint", mapRuleFixHint(RULE).length > 15, mapRuleFixHint(RULE));
      rec("⚠️ the LAND sibling does not report the same rows", !probs.some((x) => x.rule === "naval_base_water_is_gone"), probs.map((x) => x.rule));

      console.log("\n2. …and one Auto-fix click leaves that coast with a port that faces the sea");
      const before11 = rowsOf(mod).filter((l) => l === P11 || l === P12);
      const r = await post("/api/map/auto-fix", { modPath: mod });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const after = validate(mod);
      rec("⭐⭐⭐ the rule is satisfied", !after.some((x) => x.rule === RULE), after.filter((x) => x.rule === RULE).map((x) => x.items));
      rec("⭐⭐ …and no coast is left without a port", !after.some((x) => x.rule === "coastal_no_port"), after.filter((x) => x.rule === "coastal_no_port").map((x) => x.provinces));
      const left = ports(mod);
      rec("⭐⭐ no port points at the lake, the missing province, or nothing", !left.some((l) => ["13", "99", "0"].includes(l.split(";")[6])), left);
      const on10 = left.filter((l) => provAt(Math.floor(parseFloat(l.split(";")[2])), M.buildingZToPixelY(256, parseFloat(l.split(";")[4]))) === 10);
      rec("⭐⭐⭐ province 10 — coastal to sea 14 as well — has a port on its own land facing 14", on10.length >= 1 && on10.every((l) => l.split(";")[6] === "14"), on10);
      rec("⚠️ the ports that faced the sea are still there, word for word", before11.every((l) => left.includes(l)), { before11, left });
    }

    console.log("\n3. ⛔ Retyping a port's sea as a lake in the province inspector takes the port with it");
    {
      const mod = makeMod("inspector");
      rec("the fixture starts with four ports", ports(mod).length === 4, ports(mod));
      rec("…and a clean bill for this rule", !validate(mod).some((x) => x.rule === RULE));
      // saveProvinceTerrain queues { provinceId, terrain, type, coastal }; a sea province's terrain dropdown holds "ocean".
      const r = await post("/api/map/set-province-terrain", { provinceId: 13, terrain: "ocean", type: "lake", coastal: false, modPath: mod });
      rec("the retype succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("…and was not delegated to the erase path (sea→lake is not land→water)", !(r.b && r.b.delegatedTo), r.b && r.b.delegatedTo);
      rec("the row is a lake now", /;lake;/.test(defRow(mod, 13)), defRow(mod, 13));
      rec("⭐⭐⭐ the two ports that faced it are gone", r.b && r.b.orphanedPorts && r.b.orphanedPorts.removed === 2, r.b && r.b.orphanedPorts);
      rec("⭐⭐ …none is left pointing at the lake", !ports(mod).some((l) => l.split(";")[6] === "13"), ports(mod));
      rec("⚠️ …while the two facing the sea are untouched", ports(mod).includes(P11) && ports(mod).includes(P12), ports(mod));
      rec("⭐ …and the rule has nothing to say", !validate(mod).some((x) => x.rule === RULE), validate(mod).filter((x) => x.rule === RULE));
      const fix = await post("/api/map/auto-fix", { modPath: mod });
      rec("Auto-fix ran", fix.s === 200 && fix.b && fix.b.ok === true, fix.b);
      const after = validate(mod);
      rec("⭐⭐ afterwards no coast is left without a port", !after.some((x) => x.rule === "coastal_no_port"), after.filter((x) => x.rule === "coastal_no_port").map((x) => x.provinces));
      const on10 = ports(mod).filter((l) => provAt(Math.floor(parseFloat(l.split(";")[2])), M.buildingZToPixelY(256, parseFloat(l.split(";")[4]))) === 10);
      rec("⭐⭐ …province 10 has a port facing sea 14", on10.length >= 1 && on10.every((l) => l.split(";")[6] === "14"), on10);
    }

    console.log("\n4. ⚠️ Controls: nothing else removes a port");
    {
      const mod = makeMod("controls", { lake: true });
      // Start with 13 a lake and two ports facing it: a lake that becomes sea again makes those ports valid — nothing to remove.
      const r = await post("/api/map/set-province-terrain", { provinceId: 13, terrain: "lakes", type: "sea", coastal: false, modPath: mod });
      rec("lake→sea succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("⭐ …and removed no port", !(r.b.orphanedPorts && r.b.orphanedPorts.removed) && ports(mod).length === 4, { orphanedPorts: r.b.orphanedPorts, ports: ports(mod) });
      const t = await post("/api/map/set-province-terrain", { provinceId: 11, terrain: "forest", type: "land", coastal: true, modPath: mod });
      rec("a terrain repaint on a coastal province succeeded", t.s === 200 && t.b && t.b.ok === true, t.b);
      rec("⭐ …and removed no port", !(t.b.orphanedPorts && t.b.orphanedPorts.removed) && ports(mod).length === 4, { orphanedPorts: t.b.orphanedPorts, ports: ports(mod) });
      rec("a map whose ports all face the sea is not reported", !validate(mod).some((x) => x.rule === RULE));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a port whose sea is not a sea: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
