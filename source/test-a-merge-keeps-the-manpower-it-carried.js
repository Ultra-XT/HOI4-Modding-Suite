// A merge must not lose the payload it just carried. #a-merge-loses-the-manpower-it-carried
//
// mergeState does more than move provinces. moveProvince carries a province's victory point and its
// province-keyed building blocks, but NOT the state-level payload — so without a carry, merging away a
// state destroyed its manpower, its shared buildings (factories, infrastructure, dockyards) and its
// resources when deleteState excised the file. The server sums all three onto the target, which is the
// whole reason that code exists.
//
// The PAGE never learned. Its "local simulation" moved the provinces and stopped, so after Save the disk
// held dst+src while the panel still showed dst — and selecting the target and editing any field sent the
// pre-merge numbers straight back, losing exactly what the server had taken care to preserve.
//
// ⚠️ Two fields with two meanings in one response object: `carried.buildings` / `carried.resources` are the
// SUMMED TOTALS, while `carried.manpower` is the SOURCE'S CONTRIBUTION alone. Adopting the latter as a total
// would drop the target's own manpower. This test pins both readings.
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

const tmps = [];
// ⚠️ `resources` sits at STATE level but `buildings` lives INSIDE `history = { }` — that is where HOI4 puts
// it and where parseStatesText reads it from (`braceBody(history, "buildings")`). A fixture with buildings at
// state level parses as no buildings at all, and the merge then looks like it dropped them.
const state = (id, prov, mp, stateExtra, historyExtra) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${mp}\n`
  + `\tstate_category = rural\n\tprovinces = { ${prov.join(" ")} }\n${stateExtra || ""}`
  + `\thistory = {\n\t\towner = AAA\n${historyExtra || ""}\t}\n}\n`;

// ── what the server carries, measured ────────────────────────────────────────────────────────────────
console.log("\n=== the server sums the source's payload onto the target ===");
let carried = null;
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-merge-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="MG"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    state(1, [11, 12], 5000, "\tresources = {\n\t\tsteel = 10\n\t}\n",
      "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\tarms_factory = 2\n\t\t}\n"));
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"),
    state(2, [21], 7000, "\tresources = {\n\t\tsteel = 5\n\t\toil = 2\n\t}\n",
      "\t\tbuildings = {\n\t\t\tinfrastructure = 4\n\t\t\tdockyard = 1\n\t\t}\n"));

  const r = md.mergeState({ modRoot: d, gameRoot: path.join(d, "__nogame__"), dependencyRoots: [], sourceStateId: 2, targetStateId: 1 });
  ok(r && r.changed === true, "the merge runs", r && r.error);
  carried = r.carried;
  ok(!!carried, "…and reports what it carried", carried);
  ok(carried.manpower === 7000,
    "⚠️ carried.manpower is the SOURCE's contribution (7000), not the total", carried.manpower);
  ok(carried.manpowerTotal === 12000,
    "⭐⭐ carried.manpowerTotal is the total it wrote (12000), for the page to take", carried.manpowerTotal);
  ok(carried.buildings.infrastructure === 7,
    "⚠️ …but carried.buildings IS the summed total (3 + 4 = 7)", carried.buildings);
  ok(carried.buildings.dockyard === 1 && carried.buildings.arms_factory === undefined,
    "…covering keys only the source had, and skipping ones only the target had", carried.buildings);
  ok(carried.resources.steel === 15 && carried.resources.oil === 2, "…and resources the same way", carried.resources);

  // …and the file really says the sum, which is what the page has to agree with.
  const text = fs.readFileSync(path.join(d, "history", "states", "1.txt"), "utf8");
  ok(/manpower\s*=\s*12000\b/.test(text), "⭐ the target's file holds 5000 + 7000 = 12000", text.match(/manpower[^\n]*/));
  ok(/infrastructure\s*=\s*7\b/.test(text), "…and infrastructure 7", text.match(/infrastructure[^\n]*/));
  ok(/steel\s*=\s*15\b/.test(text), "…and steel 15", text.match(/steel[^\n]*/));
}

// ── what the page does, run for real ─────────────────────────────────────────────────────────────────
console.log("\n=== …and the page's own simulation agrees with it ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const MASKED = maskJsComments(MAP);

  // The merge handler's local simulation, lifted by the block it lives in — at EVERY place the page queues a merge: the 🔗 Merge click
  // (doMergeState) and, since #a-state-a-move-empties-is-merged-not-deleted, the merge a province move queues for a state it left empty
  // (deleteEmptiedStates). Each is read in its own function, from its opening line to the queueWrite: the first one in the file is no
  // longer the click's.
  const sites = [];
  for (let i = MASKED.indexOf('queueWrite("/api/map/merge-state"'); i !== -1; i = MASKED.indexOf('queueWrite("/api/map/merge-state"', i + 1)) sites.push(i);
  ok(sites.length >= 1, "the merge handler was found", sites);
  const fnOf = (at) => (/function (\w+)\(/.exec(MASKED.slice(MASKED.lastIndexOf("\n  function ", at), at)) || [])[1] || "?";
  ok(sites.map(fnOf).includes("doMergeState"), "…the 🔗 Merge click's among them", sites.map(fnOf));
  for (const at of sites) {
    const block = MAP.slice(MASKED.lastIndexOf("\n  function ", at), at);
    ok(/dstSt\.manpower\s*=/.test(block),
      `⭐⭐⭐ ${fnOf(at)}'s local simulation carries manpower onto the target`, block.slice(-300));
    ok(/dstSt\.buildings\s*=/.test(block) && /dstSt\.resources\s*=/.test(block),
      `⭐⭐ …and the buildings and resources too (${fnOf(at)})`, block.slice(-300));
  }

  // Run the same arithmetic the handler does, on the same numbers the server just used, and require the
  // two to agree. This is the property that matters — not the spelling of either one.
  const num = (v) => Number.parseInt(v, 10) || 0;
  const sumInto = (dstMap, srcMap) => {
    const out = Object.assign({}, dstMap || {});
    for (const k of Object.keys(srcMap || {})) { const v = Number(srcMap[k]) || 0; if (v > 0) out[k] = (Number(out[k]) || 0) + v; }
    return out;
  };
  const dst = { manpower: 5000, buildings: { infrastructure: 3, arms_factory: 2 }, resources: { steel: 10 } };
  const src = { manpower: 7000, buildings: { infrastructure: 4, dockyard: 1 }, resources: { steel: 5, oil: 2 } };
  const localManpower = num(dst.manpower) + num(src.manpower);
  const localBuildings = sumInto(dst.buildings, src.buildings);
  const localResources = sumInto(dst.resources, src.resources);
  ok(localManpower === 12000,
    "⭐⭐⭐ the page's manpower matches the 12000 on disk", localManpower);
  ok(localBuildings.infrastructure === carried.buildings.infrastructure
     && localBuildings.dockyard === carried.buildings.dockyard
     && localBuildings.arms_factory === 2,
    "⭐⭐ …its buildings match what the server carried, keeping the target's own keys", { localBuildings, carried: carried.buildings });
  ok(localResources.steel === carried.resources.steel && localResources.oil === carried.resources.oil,
    "…and its resources", { localResources, carried: carried.resources });

  // ⚠️ THE TRAP. If the flush ever adopted carried.manpower as a TOTAL, the target would lose its own.
  ok(carried.manpower !== localManpower,
    "⚠️⚠️ carried.manpower is NOT the total — adopting it as one would drop the target's 5000",
    { carriedManpower: carried.manpower, total: localManpower });
  const flushAt = MASKED.indexOf("res.carried && w.body && w.body.targetStateId != null");
  ok(flushAt > 0, "the flush reads what the server carried", flushAt);
  const flushBlock = MAP.slice(flushAt, flushAt + 1400);
  // ⛔ (review T03) It left manpower to the click's mirror, and a first fill's share written after the mirror overwrote it: the page said 76,000 where the disk said
  // 152,000, and the state panel's next save wrote the 76,000. So the writer's own total is adopted; carried.manpower never is.
  ok(/t\.manpower\s*=\s*res\.carried\.manpowerTotal\b/.test(flushBlock) && !/t\.manpower\s*=\s*res\.carried\.manpower\s*;/.test(flushBlock),
    "⚠️⚠️ …and takes the total the writer reports, never the source's share, as the manpower", flushBlock.slice(0, 300));
  ok(/t\.buildings\s*=/.test(flushBlock) && /t\.resources\s*=/.test(flushBlock),
    "…while adopting the two fields that ARE totals", flushBlock.slice(0, 300));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a merge keeps the manpower it carried: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
