// #the-fix-already-exists-next-door — `OOB = "…"` IN CAPITALS IS STILL AN ORDER OF BATTLE.
//
// Two of vanilla's country histories, ALB - Albania.txt and AFA - Afar.txt, write the keyword in upper case:
//
//     OOB = "ALB_1936"
//
// HOI4 loads them. Nova's OOB_REFERENCE_RE carried only the `g` flag, so it matched neither, and Albania's whole
// army was invisible to startingUnitLocations — and so to every rule and every fixer built on it.
//
// 📏 Found by workflow wf_bd965dd5-59d on the owner's TEST 21: one click of Auto-fix moved 2,922 drowned
// divisions onto land and left ALB's at sea on province 9914, because it never saw it. Every other country's
// army was repaired; Albania's was not even counted.
//
// ⭐ The fix already existed next door. server.js's Army-maker reader of the same keywords has used /gi all
// along, and the unit keys fifteen lines below the regex are compared lower-cased. One flag.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobcase-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0, skips = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const skip = (why) => { console.log("  skip " + why); skips++; };
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobcase-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── 1. a fixture: every spelling of the keyword the game accepts ─────────────────────────────────────
console.log("=== every casing of the keyword is an order of battle ===");
{
  const g = tmp("game");
  mk(g, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;20;30;land;false;plains;1\n2;40;50;60;land;false;plains;1\n3;70;80;90;land;false;plains;1\n4;90;80;70;land;false;plains;1\n");
  const SPELLINGS = { AAA: "oob", BBB: "OOB", CCC: "Oob", DDD: "SET_OOB" };
  let id = 0;
  for (const [tag, kw] of Object.entries(SPELLINGS)) {
    id++;
    mk(g, `history/states/${id}.txt`, `state = {\n\tid = ${id}\n\tprovinces = { ${id} }\n\thistory = { owner = ${tag} }\n}\n`);
    mk(g, `history/countries/${tag} - ${tag}land.txt`, `capital = ${id}\n${kw} = "${tag}_1936"\n`);
    mk(g, `history/units/${tag}_1936.txt`, `units = {\n\tdivision = { name = "${tag} D" location = ${id} division_template = "Inf" }\n}\n`);
  }
  const ctx = { modRoot: g, gameRoot: g, dependencyRoots: [] };
  const model = md.buildMapModel(ctx);
  const found = new Set(md.startingUnitLocations({ ...ctx, model }).map((u) => u.tag));
  for (const [tag, kw] of Object.entries(SPELLINGS)) {
    rec(`⭐⭐⭐ \`${kw} = "${tag}_1936"\` is found`, found.has(tag), [...found]);
  }
  // THE BACK-OUT CONTROL, applied to the regex itself rather than asserted in prose: the old flags miss exactly
  // the capitalised spellings, so this test would fail against the code as it was.
  const re = /(?:^|[^A-Za-z0-9_])(?:set_oob|set_naval_oob|set_air_oob|load_oob|oob)\s*=\s*(?:"([^"\r\n]+)"|([A-Za-z0-9_.-]+))/g;
  const oldMisses = Object.entries(SPELLINGS).filter(([, kw]) => { re.lastIndex = 0; return !re.test(`${kw} = "X"`); }).map(([, kw]) => kw);
  rec("THE BACK-OUT CONTROL: the old `g`-only regex misses exactly the three capitalised spellings",
    JSON.stringify(oldMisses) === JSON.stringify(["OOB", "Oob", "SET_OOB"]), oldMisses);
}

// ── 2. THE CORPUS: vanilla's own Albania ─────────────────────────────────────────────────────────────
// Not a fixture of what vanilla might write — what it does write, read off the installed game.
console.log("\n=== vanilla's own Albania and Afar ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "history", "countries"))) {
  skip("the base game is not installed here — vanilla's capitalised OOB lines were NOT checked");
} else {
  const hist = fs.readdirSync(path.join(GAME, "history", "countries"));
  const alb = hist.find((f) => /^ALB\b/.test(f));
  const txt = alb ? fs.readFileSync(path.join(GAME, "history", "countries", alb), "latin1").replace(/#[^\n]*/g, "") : "";
  rec("THE CONTROL: vanilla's ALB history really does write the keyword in capitals",
    /(^|[^A-Za-z0-9_])OOB\s*=/.test(txt), alb);
  const ctx = { modRoot: GAME, gameRoot: GAME, dependencyRoots: [] };
  const model = md.buildMapModel(ctx);
  const albUnits = md.startingUnitLocations({ ...ctx, model }).filter((u) => u.tag === "ALB");
  rec("⭐⭐⭐ Nova now sees Albania's army in vanilla itself", albUnits.length > 0, albUnits.length);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== an order of battle named in capitals is still found: ${pass + fails.length} checks, ${fails.length} failed${skips ? `, ${skips} skipped` : ""} ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
