// A strategic-region move that FAILS must leave the map as it was. #a-refused-region-move-is-not-atomic
//
// moveProvinceToRegion is deliberately overlap-proof: a province must live in EXACTLY ONE strategic region
// or HOI4 cannot load the map, so it scans every region for the province and removes it from all but the
// target. The order it did that in was the problem — remove from the sources, THEN add to the target:
//
//   · target add fails  ->  returns { changed:false }, the endpoint answers 400, the page believes nothing
//                           happened — and on disk the province has been taken out of its old region and
//                           put into none. A province in ZERO regions is the same crash class as one in two.
//
// Adding first means the only failure that can occur before any write is the target's, and that leaves the
// map untouched. A removal failing afterwards is the lesser evil — the province is in two regions, which
// the validator and "Fix region overlaps" both already handle — and it is now REPORTED rather than
// swallowed behind changed:false.
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
const region = (id, prov) => `strategic_region={\n\tid=${id}\n\tname="R${id}"\n\tprovinces={ ${prov.join(" ")} }\n`
  + `\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n}\n`;
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regmove-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RM"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(d, "map", "strategicregions"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;false;plains;1",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "strategicregions", "1-a.txt"), region(1, [1, 2]));
  return d;
};
const regionsOf = (d, pid) => {
  const out = [];
  const dir = path.join(d, "map", "strategicregions");
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = parseInt((t.match(/id\s*=\s*(\d+)/) || [])[1], 10);
    const body = (t.match(/provinces\s*=\s*\{([^}]*)\}/) || [])[1] || "";
    if (body.split(/\s+/).filter(Boolean).map(Number).includes(pid)) out.push(id);
  }
  return out.sort((a, b) => a - b);
};

const GAME = path.join(os.tmpdir(), "__nova_no_game__");

console.log("\n=== a move to a region that does not exist changes nothing ===");
{
  const d = mk();
  const before = fs.readFileSync(path.join(d, "map", "strategicregions", "1-a.txt"), "utf8");
  ok(regionsOf(d, 1).join(",") === "1", "province 1 starts in region 1 only", regionsOf(d, 1));

  // Region 99 has no file anywhere — the target cannot be written.
  const r = md.moveProvinceToRegion({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceId: 1, fromRegionId: 1, toRegionId: 99 });
  ok(r && r.changed === false, "the move is refused", r);
  ok(/Target region/.test(String(r.error || "")), "…naming the target as the reason", r && r.error);

  // ⭐⭐⭐ THE POINT: the refusal must not have already emptied the province out of its old region.
  const after = regionsOf(d, 1);
  ok(after.join(",") === "1",
    "⭐⭐⭐ …and province 1 is STILL in region 1 — not orphaned into no region at all", after);
  ok(after.length > 0,
    "⭐⭐⭐ …a province in ZERO strategic regions is what this prevents", after);
  ok(fs.readFileSync(path.join(d, "map", "strategicregions", "1-a.txt"), "utf8") === before,
    "⚠️ the source region's file is byte-identical — the refusal wrote nothing at all");
}

console.log("\n=== …while a move that CAN work still works ===");
{
  const d = mk();
  fs.writeFileSync(path.join(d, "map", "strategicregions", "2-b.txt"), region(2, []));
  const r = md.moveProvinceToRegion({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceId: 1, fromRegionId: 1, toRegionId: 2 });
  ok(r && r.changed === true, "the move succeeds", r && r.error);
  const after = regionsOf(d, 1);
  ok(after.join(",") === "2",
    "⭐⭐ province 1 is in region 2 and ONLY region 2 — the overlap-proofing still holds", after);
  ok(regionsOf(d, 2).join(",") === "1", "…and province 2 was left where it was", regionsOf(d, 2));
  ok(Array.isArray(r.removedFrom) && r.removedFrom.indexOf(1) >= 0, "…and it reports what it removed it from", r.removedFrom);
}

console.log("\n=== the ORDER is the fix, so pin it ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const s = SRC.indexOf("function moveProvinceToRegion");
  const body = s < 0 ? "" : SRC.slice(s, SRC.indexOf("\nfunction ", s + 10));
  ok(body.length > 400, "moveProvinceToRegion was found", body.length);
  const addAt = body.indexOf("addProvinceToBlock");
  const removeAt = body.indexOf("removeProvinceFromBlock");
  ok(addAt > 0 && removeAt > 0, "both edits are in it", { addAt, removeAt });
  ok(addAt < removeAt,
    "⭐⭐⭐ the TARGET is written before any source is touched — reverse them and a refusal orphans the province",
    { addAt, removeAt });
  // …and a removal that fails after the add must not report changed:false.
  ok(/partial: true/.test(body),
    "⚠️ a removal failing after the add is reported as a partial change, not as nothing happening", body.length);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a refused region move changes nothing: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
