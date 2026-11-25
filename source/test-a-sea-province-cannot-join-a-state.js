// Moving a SEA province into a state must be refused. #move-province-accepts-the-sea
//
// Nova's own validator reports `non_land_province_in_state` as an error: no shipping map puts a sea province in a
// state (the corpus check below). What the game does with one is unmeasured — the engine text the rule once quoted
// ("province is not a land province but is used in state") is not in hoi4.exe 1.19, and the rule no longer claims
// a crash (test-a-map-message-claims-only-what-the-engine-shows.js, section G). And moveProvince would happily
// produce one: it validated the province id, the target state, source-vs-target and
// that the target exists, and never once looked at the province's TYPE.
//
// Found while building a torture mod: four sea→land flips failed (a wrong URL in the builder), the moves
// that followed went through anyway, and Nova reported its own map as
//   ERROR non_land_province_in_state: 4 sea province(s) are inside a state (e.g. province 2918 in state 1082)
// A writer that produces exactly what its own rule reports as an error.
//
// ⚠️⚠️ SEA ONLY, NOT "non-land". Measured across vanilla and five installed workshop maps:
//
//     sea provinces in a state : 0, 0, 0, 0, 0, 0        (out of 1,081-1,524 states each)
//     LAKE provinces in a state: 118, 162, 128, 89, 167, 103   ← every map, ubiquitous, correct
//
// Refusing "not land" would break something every shipping map does. The validator rule tests `ty === "sea"`
// for exactly this reason, and this guard mirrors it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── ⚠️ THE CORPUS, which decides how wide the guard may be ───────────────────────────────────────────
console.log("\n=== 🈯 sea in a state is unheard of; LAKE in a state is everywhere ===");
if (!fs.existsSync(path.join(GAME, "history", "states"))) {
  console.log("  ..   (the base game is not installed — the corpus half cannot run)");
} else {
  const roots = [["vanilla", GAME]];
  for (const id of fs.existsSync(WS) ? fs.readdirSync(WS) : []) {
    if (fs.existsSync(path.join(WS, id, "history", "states"))) roots.push([id, path.join(WS, id)]);
  }
  let checked = 0, lakeMaps = 0;
  let lakeTotal = 0;
  for (const [label, root] of roots.slice(0, 6)) {
    let m; try { m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] }); } catch (_) { continue; }
    const type = new Map((m.provinces || []).map((p) => [p.id, p.type]));
    let sea = 0, lake = 0;
    for (const s of m.states || []) for (const p of s.provinces || []) {
      const t = type.get(p);
      if (t === "sea") sea++; else if (t === "lake") lake++;
    }
    checked++;
    if (lake > 0) lakeMaps++;
    lakeTotal += lake;
    ok(sea === 0, `⭐⭐ ${label}: not one sea province sits in a state`, { sea, lake });
  }
  ok(checked >= 2, `${checked} shipping map(s) checked`, checked);
  // ⚠️ MOVED 2026-09-23 — THE CORPUS GREW AND "EVERY" STOPPED BEING TRUE. Hearts of Minecraft has 19 lake
  // provinces and puts NONE of them in a state, which is a real variation rather than an empty case. What
  // justifies the guard saying "sea" and never "not land" is not that every map does it — it is that a
  // not-land guard would reject a large amount of real shipping data: vanilla alone puts 118 of its 126
  // lakes inside states, and seven of the eight installed maps do the same. That total is what is asserted
  // now, because it is the consequence the guard actually turns on.
  ok(lakeTotal > 100 && lakeMaps >= 2,
    `⚠️⚠️ …while shipping maps put ${lakeTotal} lake province(s) in states across ${lakeMaps} of ${checked} — so the guard must say "sea", never "not land"`,
    { lakeTotal, lakeMaps, checked });
}

// ── the guard ────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== a sea province is refused, a land one is not ===");
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seastate-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="SS"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;false;plains;1",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;lake;false;lakes;0",
  ].join("\n") + "\n");
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  const st = (id, prov) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n`
    + `\tprovinces = { ${prov.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"), st(1, [1]));
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"), st(2, [2]));

  const NOGAME = path.join(d, "__nogame__");
  const move = (pid, to) => md.moveProvince({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: pid, toStateId: to });

  const sea = move(3, 1);
  ok(sea && sea.changed === false, "⭐⭐⭐ a SEA province is refused", sea);
  ok(/sea/i.test(String(sea && sea.error)), "…and the reason names it", sea && sea.error);
  const after = md.buildMapModel({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const s1 = (after.states || []).find((s) => s.id === 1);
  ok(!!s1 && (s1.provinces || []).indexOf(3) < 0,
    "⭐⭐⭐ …and it is NOT on disk in the state — the refusal wrote nothing", s1 && s1.provinces);

  // ⚠️ THE CONTROL THAT MATTERS: land still moves, and so does a LAKE.
  const land = move(2, 1);
  ok(land && land.changed === true, "⚠️ a LAND province still moves", land && land.error);
  const lake = move(4, 1);
  ok(lake && lake.changed === true,
    "⚠️⚠️ …and so does a LAKE — every shipping map has lakes in states", lake && lake.error);
  const after2 = md.buildMapModel({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const s1b = (after2.states || []).find((s) => s.id === 1);
  ok(!!s1b && (s1b.provinces || []).indexOf(4) >= 0, "…the lake really is in the state on disk", s1b && s1b.provinces);
}

// ── and the click answers the same question, so Save is not where you find out ───────────────────────
console.log("\n=== the map page refuses it at click time too ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const MASKED = maskJsComments(MAP);
  const s = MASKED.indexOf("function doMoveProvince");
  const body = s < 0 ? "" : MASKED.slice(s, MASKED.indexOf("\n  }", s) + 4);
  ok(body.length > 200, "doMoveProvince was found", body.length);
  ok(/provinceType\.get\(provinceId\) === "sea"/.test(body),
    "⭐⭐ it checks the type before staging — the click/save asymmetry class", body.slice(0, 220));
  ok(!/!==\s*"land"/.test(body),
    "⚠️⚠️ …and does NOT phrase it as \"not land\", which would refuse lakes", body.slice(0, 220));
  ok(body.indexOf("provinceType.get") < body.indexOf("queueWrite"),
    "⭐ …and does it BEFORE queueing the write", { check: body.indexOf("provinceType.get"), queue: body.indexOf("queueWrite") });
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a sea province cannot join a state: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
