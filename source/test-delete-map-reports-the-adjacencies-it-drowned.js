// Delete map must say which adjacencies still describe the land it drowned — and must change none of them.
// #delete-map-leaves-the-adjacencies-standing
//
// blankMapToSea turns every land province to sea, deletes the mod's states and supply areas, strips capitals,
// sinks the heightmap and pulls supply hubs and railways off the new water. The string "adjacen" appeared nowhere
// in it, and its survivors advisory named only states and capitals. Measured over the six shipping maps on
// 2026-09-10: 1,291 of 1,291 impassable rows join two LAND provinces. After a blank on a mod that inherits vanilla,
// every one of vanilla's impassable borders, straits and canals names a province that was land a moment ago — a
// shape no shipping map contains — and nothing said so. (The count is re-derived below from the installed game.)
//
// ⚠️ WHAT HOI4 DOES WITH SUCH A ROW IS NOT ESTABLISHED. hoi4.exe's own strings carry "is not adjacent with THROUGH"
// (logged, and the row is still loaded — #a-strait-row-is-still-loaded) and "Invalid adjacency rule name", and nothing about an impassable border or a strait
// between two sea provinces; no error.log on this machine records a blanked map. fixWaterSupplyRail removes hubs
// and railways because a measured CTD says to; adjacencies have no such evidence, and deleting rows a modder wrote
// by hand on an unproven rule is exactly what this project keeps undoing. So this REPORTS — how many rows in the
// effective file touch a drowned province, split by type, and whose file it is — and changes nothing:
//   • the mod's own map/adjacencies.csv is left byte-identical;
//   • an inherited one (base game or dependency) is never materialised into the mod;
//   • a mod whose replace_path="map" hides the base file is told nothing, because nothing loads.
// A row that joins two seas with no through (vanilla's seven rule-controlled straits) is not reported: the blank
// does not change it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const tmps = [];
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankadj-home-")); tmps.push(HOME);
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = path.join(HOME, "appdata");
process.env.APPDATA = path.join(HOME, "roaming");
process.env.XDG_CONFIG_HOME = path.join(HOME, "xdg");
for (const d of [process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function liftFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return "";
  let depth = 0, i = src.indexOf("(", at);
  for (; i < src.length; i++) { if (src[i] === "(") depth++; else if (src[i] === ")") { depth--; if (depth === 0) break; } }
  let d = 0;
  for (i = src.indexOf("{", i); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return "";
}

const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const LAND = [1, 2, 3];
const DEF = ["0;0;0;0;land;false;unknown;0"]
  .concat(LAND.map((i) => `${i};${i * 40};0;0;land;false;plains;1`))
  .concat(["4;160;0;0;sea;false;ocean;0", "5;200;0;0;sea;false;ocean;0"]).join("\r\n") + "\r\n";
const BASE_ROWS = [
  "1;2;impassable;-1;-1;-1;-1;-1;;Wall",           // both ends drowned
  "1;3;sea;4;-1;-1;-1;-1;;Strait",                  // both ends drowned, crossing still sea
  "4;5;sea;2;-1;-1;-1;-1;CANAL_RULE;Canal",         // two seas, but the land it cut through is drowned
  "4;5;;-1;-1;-1;-1;-1;PASSAGE_RULE;Sea passage",   // two seas, no through — the blank changes nothing here
];
const csv = (rows) => [HEADER, ...rows, "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";
/** Rows naming a drowned province as an end or as the through — derived, so the fixture can change freely. */
function drownedRows(rows, drowned) {
  return rows.filter((r) => {
    const c = r.split(";");
    return [c[0], c[1], c[3]].map((v) => parseInt(v, 10)).some((id) => Number.isFinite(id) && id > 0 && drowned.has(id));
  });
}
function byTypeOf(rows) {
  const out = {};
  for (const r of rows) { const t = (r.split(";")[2] || "").trim(); out[t] = (out[t] || 0) + 1; }
  return out;
}
const sameCounts = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].every((k) => (a[k] || 0) === (b[k] || 0));
};

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankadj-game-")); tmps.push(GAME);
  mk(path.join(GAME, "map", "definition.csv"), DEF);
  mk(path.join(GAME, "map", "adjacencies.csv"), csv(BASE_ROWS));
  const mod = (tag, desc) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankadj-" + tag + "-")); tmps.push(d); mk(path.join(d, "descriptor.mod"), desc); return d; };
  const LANDSET = new Set(LAND);
  const want = drownedRows(BASE_ROWS, LANDSET);
  const results = {};

  console.log("\n1. ⭐⭐⭐ a plain overlay mod is told what its base game's adjacencies now describe");
  {
    const A = mod("plain", 'name="A"\nsupported_version="1.19.*"\n');
    const baseBytes = fs.readFileSync(path.join(GAME, "map", "adjacencies.csv"));
    const r = md.blankMapToSea({ modRoot: A, gameRoot: GAME, dependencyRoots: [] });
    results.inherited = r;
    rec("the blank ran and drowned the land", r.changed === true && r.flippedProvinces === LAND.length, { error: r.error, flipped: r.flippedProvinces });
    const adj = r.adjacencies;
    rec("⭐⭐⭐ the result reports the adjacency rows that still describe the drowned land", !!adj && adj.rows === want.length, { adj, want: want.length });
    rec("⭐ …split by type", !!adj && sameCounts(adj.byType, byTypeOf(want)), { got: adj && adj.byType, want: byTypeOf(want) });
    rec("…and says the file is NOT the mod's own", !!adj && adj.own === false, adj);
    rec("⛔ an inherited adjacencies.csv is never materialised into the mod", !fs.existsSync(path.join(A, "map", "adjacencies.csv")));
    rec("⛔ …and the base game's file is untouched", Buffer.compare(baseBytes, fs.readFileSync(path.join(GAME, "map", "adjacencies.csv"))) === 0);
  }

  console.log("\n2. ⭐⭐ a mod's OWN adjacencies are reported as its own, and left exactly as they were");
  {
    const B = mod("own", 'name="B"\n');
    mk(path.join(B, "map", "adjacencies.csv"), csv(BASE_ROWS));
    const ownBytes = fs.readFileSync(path.join(B, "map", "adjacencies.csv"));
    const r = md.blankMapToSea({ modRoot: B, gameRoot: GAME, dependencyRoots: [] });
    results.own = r;
    const adj = r.adjacencies;
    rec("⭐⭐ the mod's own rows are reported as its own", !!adj && adj.own === true && adj.rows === want.length, adj);
    rec("⚠️ …and the file is byte-identical: reported, not deleted, because what HOI4 does with them is unproven",
      Buffer.compare(ownBytes, fs.readFileSync(path.join(B, "map", "adjacencies.csv"))) === 0);
  }

  console.log("\n3. CONTROL: replace_path=\"map\" hides the base file, so nothing is reported");
  {
    const C = mod("tc", 'name="C"\nreplace_path="map"\n');
    mk(path.join(C, "map", "definition.csv"), DEF);
    const r = md.blankMapToSea({ modRoot: C, gameRoot: GAME, dependencyRoots: [] });
    results.hidden = r;
    rec("the blank still drowned the mod's own land", r.changed === true && r.flippedProvinces === LAND.length, r.flippedProvinces);
    rec("…and reports no adjacency row, because no adjacencies.csv loads", !!r.adjacencies && r.adjacencies.rows === 0, r.adjacencies);
  }

  console.log("\n4. a dependency's adjacencies.csv is the one that loads, so it is the one counted");
  {
    const dep = mod("dep", 'name="D"\n');
    mk(path.join(dep, "map", "adjacencies.csv"), csv([BASE_ROWS[0]]));
    const addon = mod("addon", 'name="Addon"\n');
    const r = md.blankMapToSea({ modRoot: addon, gameRoot: GAME, dependencyRoots: [dep] });
    rec("the dependency's rows are counted, not the base game's", !!r.adjacencies && r.adjacencies.rows === drownedRows([BASE_ROWS[0]], LANDSET).length && r.adjacencies.own === false, r.adjacencies);
    rec("⛔ …and they are not copied into the add-on either", !fs.existsSync(path.join(addon, "map", "adjacencies.csv")));
  }

  console.log("\n5. ⭐ the save says it — RUN the note builder the page uses");
  {
    const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    const fnSrc = liftFunction(SRC, "blankAdjacencyNote");
    rec("blankAdjacencyNote was lifted out of public/map.js", !!fnSrc);
    const note = fnSrc ? new Function(fnSrc + "\nreturn blankAdjacencyNote;")() : () => "";
    const inh = String(note(results.inherited.adjacencies) || "");
    const own = String(note(results.own.adjacencies) || "");
    const none = String(note(results.hidden.adjacencies) || "");
    rec("⭐ RUN: it gives the count and names the file", new RegExp("\\b" + want.length + " ").test(inh) && /map\/adjacencies\.csv/.test(inh), inh);
    rec("⭐ RUN: …says an inherited file is the base game's or a dependency's, and was not changed",
      /base game/.test(inh) && /dependency/.test(inh) && /not change/i.test(inh), inh);
    rec("⭐ RUN: …says the mod's own rows were left as they were", /your mod's own/i.test(own) && !/base game/.test(own), own);
    rec("RUN: …and says nothing when nothing loads", none === "", none);
    const stripped = stripJsComments(SRC);
    rec("…and the save puts it on the same warning line as the other Delete map notes",
      (stripped.match(/blankAdjacencyNote\(\s*res\.adjacencies\s*\)/g) || []).length === 1);
  }

  console.log("\n6. 🈯 against the real base game, if it is installed");
  const REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(path.join(REAL, "map", "adjacencies.csv")) || !fs.existsSync(path.join(REAL, "map", "definition.csv"))) {
    console.log("  ..   (the base game is not installed — the corpus half cannot run)");
  } else {
    rec("the report is exported, so it can be asked without running a blank", typeof md.blankAdjacencySurvivors === "function");
    if (typeof md.blankAdjacencySurvivors === "function") {
      // The same land blankMapToSea flips: every `land` row except the reserved province 0.
      const land = new Set();
      for (const ln of fs.readFileSync(path.join(REAL, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
        const c = ln.split(";");
        const id = parseInt(c[0], 10);
        if (Number.isFinite(id) && id !== 0 && (c[4] || "").trim() === "land") land.add(id);
      }
      const rows = md.parseAdjacencies(fs.readFileSync(path.join(REAL, "map", "adjacencies.csv"), "utf8"));
      const hit = rows.filter((r) => [r.from, r.to, r.through].some((id) => Number.isFinite(id) && id > 0 && land.has(id)));
      const plain = mod("real", 'name="R"\nsupported_version="1.19.*"\n');
      const rep = md.blankAdjacencySurvivors({ modRoot: plain, gameRoot: REAL, dependencyRoots: [], drownedIds: [...land] });
      console.log(`     vanilla: ${rows.length} rows, ${hit.length} name a land province; reported ${rep.rows} (${JSON.stringify(rep.byType)})`);
      rec(`⭐ all ${hit.length} of vanilla's rows that describe its land are reported, as inherited`, hit.length > 200 && rep.rows === hit.length && rep.own === false, rep);
      rec("…and the rows that join two seas are not", rows.length - hit.length > 0 && rep.rows < rows.length, { rows: rows.length, reported: rep.rows });
      rec("⛔ …and asking materialised nothing", !fs.existsSync(path.join(plain, "map")));
    }
  }

  console.log(`\n=== delete map reports the adjacencies it drowned: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
