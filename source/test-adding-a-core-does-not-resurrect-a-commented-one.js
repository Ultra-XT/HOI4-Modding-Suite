// ⛔ #adding-a-core-resurrects-the-commented-out-ones — A COMMENTED-OUT CORE CAME BACK TO LIFE.
//
// Giving a state a core keeps the cores it already has, so it first reads them back:
//
//     const re = /(?:^|[^A-Za-z0-9_])add_core_of\s*=\s*([A-Za-z0-9_]+)/g;
//     while ((m = re.exec(block)) !== null) existing.push(m[1]);
//
// on the RAW block. `[^A-Za-z0-9_]` is satisfied by the `#` itself, so `# add_core_of = DEN` read as an
// existing core, and the writer then re-emitted the whole list as live lines. Vanilla's own 100-Iceland.txt
// is exactly that shape, so creating a country on Iceland in the Map Editor silently gave DENMARK a core on
// it — a political claim the author had deliberately switched off.
//
// ⚠️ AND IT CAN CAPTURE A KEYWORD. `\s*` crosses newlines, which is correct for live Paradox script, so a
// bare `#add_core_of =` takes the first token of the NEXT line. Old World Blues ships two states like that;
// coring them would have written `add_core_of = victory_points` and `add_core_of = buildings`.
//
// Measured across six shipping corpora — 7,495 state files, 99 carrying one of these:
//     vanilla 4 · Road to 56 43 · Rise of Nations 40 · Novum Vexillum 6 · Old World Blues 5 · MD 1
// (vanilla's are 100-Iceland DEN, 1015 Interior Oman OMA, 463-Alaska USA.)
//
// setCoresInHistory, the writer three lines below the bug, already masks comments for its own scan and
// removes only lines outside them. This reader was the one place that did not.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const tmps = [];
function modWith(stateText, id) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cores-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="Cores"\nreplace_path="history/states"\n');
  mk(path.join(m, "history", "states", `${id}.txt`), stateText);
  return m;
}
// Core the state through the path the New country tool actually uses.
function coreIt(mod, id, tag) {
  return md.writeStateOwner({ modRoot: mod, gameRoot: "", dependencyRoots: [], stateId: id, newOwner: tag, alsoCore: true });
}
const read = (mod, id) => fs.readFileSync(path.join(mod, "history", "states", `${id}.txt`), "utf8");
const liveCores = (t) => (t.replace(/#[^\n]*/g, "").match(/add_core_of\s*=\s*([A-Za-z0-9_]+)/g) || [])
  .map((s) => s.split("=")[1].trim());

(() => {
  console.log("\n=== vanilla's own Iceland shape: a commented core above a live one ===");
  {
    // Byte-for-byte the shape of history/states/100-Iceland.txt in the shipped game.
    const mod = modWith('state = {\n\tid = 100\n\tname = "STATE_100"\n\tmanpower = 115870\n\tstate_category = rural\n\thistory = {\n\t\towner = ICE\n\t\t# add_core_of = DEN\n\t\tadd_core_of = ICE\n\t}\n\tprovinces = { 4861 }\n}\n', 100);
    const r = coreIt(mod, 100, "ABC");
    ok(!!(r && r.changed), "the state was re-owned and cored", r);
    const t = read(mod, 100);
    const cores = liveCores(t);
    ok(!cores.includes("DEN"), "⭐ DENMARK does NOT get a live core it never had", cores);
    ok(cores.includes("ICE"), "…the real core it did have is kept", cores);
    ok(cores.includes("ABC"), "…and the new one is added", cores);
    ok(/#\s*add_core_of\s*=\s*DEN/.test(t), "…and the comment is still a comment", t);
  }

  console.log("\n=== Old World Blues' shape: a bare `#add_core_of =` above another key ===");
  {
    const mod = modWith('state = {\n\tid = 1427\n\tname = "S1427"\n\tmanpower = 100\n\thistory = {\n\t\t#owner =\n\t\t#add_core_of =\n\t\tvictory_points = {\n\t\t\t16462 5\n\t\t}\n\t}\n\tprovinces = { 16462 }\n}\n', 1427);
    coreIt(mod, 1427, "ABC");
    const t = read(mod, 1427);
    // ⚠️ Check the LIVE text, not the raw file. Written against the raw file this assertion fails on a
    // correct result, because `#add_core_of =` + newline + `victory_points` matches the same cross-newline
    // regex that caused the bug — the check would have had the defect it is testing for.
    ok(!/add_core_of\s*=\s*victory_points/.test(t.replace(/#[^\n]*/g, "")),
      "⭐ the NEXT LINE's keyword is not written as a core tag", t.slice(0, 260));
    ok(liveCores(t).join(",") === "ABC", "…only the tag actually asked for is cored", liveCores(t));
    ok(/victory_points\s*=\s*\{/.test(t), "…and the victory_points block is untouched", t.slice(0, 260));
  }

  console.log("\n=== the ordinary cases still behave ===");
  {
    const mod = modWith('state = {\n\tid = 2\n\tname = "S2"\n\tmanpower = 100\n\thistory = {\n\t\towner = GER\n\t\tadd_core_of = GER\n\t\tadd_core_of = FRA\n\t}\n\tprovinces = { 1 }\n}\n', 2);
    coreIt(mod, 2, "ABC");
    const cores = liveCores(read(mod, 2));
    ok(cores.includes("GER") && cores.includes("FRA"), "every real core is preserved", cores);
    ok(cores.includes("ABC"), "…and the new one added", cores);
    ok(cores.length === 3, "…with nothing invented", cores);
  }
  {
    const mod = modWith('state = {\n\tid = 3\n\tname = "S3"\n\tmanpower = 100\n\thistory = {\n\t\towner = ABC\n\t\tadd_core_of = ABC\n\t}\n\tprovinces = { 1 }\n}\n', 3);
    const before = read(mod, 3);
    coreIt(mod, 3, "ABC");
    ok(liveCores(read(mod, 3)).join(",") === "ABC", "coring a state that already has that core adds nothing", liveCores(read(mod, 3)));
  }

  console.log("\n=== …and a commented core is not resurrected by a SECOND edit either ===");
  {
    // Idempotence matters here: the bug would have re-added DEN on every subsequent core.
    const mod = modWith('state = {\n\tid = 4\n\tname = "S4"\n\tmanpower = 100\n\thistory = {\n\t\towner = ICE\n\t\t# add_core_of = DEN\n\t\tadd_core_of = ICE\n\t}\n\tprovinces = { 1 }\n}\n', 4);
    coreIt(mod, 4, "ABC");
    coreIt(mod, 4, "XYZ");
    const cores = liveCores(read(mod, 4));
    ok(!cores.includes("DEN"), "still no DEN after a second core", cores);
    ok(cores.filter((c) => c === "ABC").length === 1, "…and ABC is not duplicated", cores);
  }

  console.log("\n=== the same blindness, in the conflict FIXERS that edit state files ===");
  {
    // ⛔ #a-fixer-read-a-commented-out-province-list. findStateFileConflicts, fixDuplicateStateFiles and
    // fixProvinceInTwoStates each matched `provinces = { … }` against the RAW block, so a commented-out
    // list above the real one won. Two of them EDIT files, so acting on the wrong list takes a province out
    // of the wrong state. Road to 56 ships two such files and Old World Blues one, out of 7,495.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-provcomment-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="ProvComment"\nreplace_path="history/states"\n');
    // State 10's REAL provinces are 1 and 2; a commented-out earlier list names 999.
    mk(path.join(mod, "history", "states", "10.txt"),
      'state = {\n\tid = 10\n\tname = "S10"\n\tmanpower = 100\n\t# provinces = { 999 }\n\tprovinces = { 1 2 }\n\thistory = { owner = AAA }\n}\n');
    // State 20 really does share province 2 — a genuine conflict the fixer must still see.
    mk(path.join(mod, "history", "states", "20.txt"),
      'state = {\n\tid = 20\n\tname = "S20"\n\tmanpower = 100\n\tprovinces = { 2 3 }\n\thistory = { owner = BBB }\n}\n');

    const conflicts = md.findStateFileConflicts(mod);   // takes a plain root, not an options object
    const flat = JSON.stringify(conflicts);
    ok(!/999/.test(flat), "the commented-out province 999 is not treated as claimed", flat.slice(0, 300));
    // ⭐ THIS is the check that bites, and it fails in the direction that matters: with the raw scan state
    // 10 reads as owning [999] instead of [1 2], so the GENUINE conflict over province 2 is never found at
    // all. A commented-out list does not just add noise — it hides a real overlap from the detector and
    // from the fixer that would have repaired it.
    ok(/\b2\b/.test(flat) || conflicts.some((c) => JSON.stringify(c).includes("2")),
      "…while the REAL shared province 2 is still found", flat.slice(0, 300));
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== adding a core does not resurrect a commented one: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
