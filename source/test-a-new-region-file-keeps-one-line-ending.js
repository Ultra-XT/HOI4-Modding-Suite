// #a-new-region-file-mixes-line-endings
//
// "+ NEW STRATEGIC REGION" WROTE A FILE THAT WAS NEITHER CRLF NOR LF, ON FOUR OF THE SIX SHIPPING MAPS.
//
// createStrategicRegion composes its block with literal "\n". The one part of that block it does not write —
// the `weather={ … }` body — is lifted VERBATIM out of an existing region file by cloneAnyRegionWeatherBody,
// so on a CRLF map it arrives CRLF. The result: a file with CRLF inside the weather block and lone LF around
// it, which Nova then goes back into with anchored edits (editBlockInDir, every province moved into the
// region). CLAUDE.md names this exactly: "an edit tool that emits \n into a CRLF file leaves a pocket of LF
// exactly where the next anchored edit will look, and nothing at runtime complains".
//
// matchMapFileEol already existed for this, with the corpus measured in its own comment — "5,193 files are
// entirely CRLF … NONE is currently mixed, so mixing one is new damage, and traceable to us". editStateBlock
// and editBlockInDir call it. These two creators never did.
//
// Measured by driving the real createStrategicRegion twice on a copy of each installed map's
// map/strategicregions, 2026-09-17, before the fix:
//     vanilla          LF   -> LF
//     Millennium Dawn  LF   -> LF
//     Road to 56       CRLF -> MIXED (314 CRLF, 14 lone LF)
//     Old World Blues  CRLF -> MIXED (314 CRLF, 14 lone LF)
//     Novum Vexillum   CRLF -> MIXED (314 CRLF, 14 lone LF)
//     Rise of Nations  CRLF -> MIXED (314 CRLF, 14 lone LF)
//
// Nothing here is typed in: the maps are read off disk, the sections skip loudly when one is not installed,
// and section 1 asserts the fixture really is CRLF before asking whether the output is — a CONTROL, because
// "no mixed file" is true of an empty directory too.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regioneol-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");

const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const MAPS = [["vanilla", VAN], ["Millennium Dawn", WS + "/2777392649"], ["Road to 56", WS + "/820260968"],
  ["Old World Blues", WS + "/2265420196"], ["Novum Vexillum", WS + "/1827273767"], ["Rise of Nations", WS + "/2026448968"]];

/** CRLF / LF / MIXED, plus the counts, for a text. A lone LF is an \n with no \r in front of it.
 *  ⚠️ Counted by SUBTRACTION, not by /(^|[^\r])\n/g — that regex consumes the character before the newline,
 *  so two adjacent lone LFs count as one and a file with a blank line reads one short. It cost this test a
 *  wrong number in its own commit message before the subtraction replaced it. */
function eolOf(text) {
  const t = String(text);
  const crlf = (t.match(/\r\n/g) || []).length;
  const lone = (t.match(/\n/g) || []).length - crlf;
  return { crlf, lone, kind: crlf === 0 ? (lone === 0 ? "EMPTY" : "LF") : (lone === 0 ? "CRLF" : "MIXED") };
}

/** A mod that OWNS `sub` — the files copied out of `src`, plus a descriptor that replaces the path. */
function modOwning(label, src, sub) {
  const mod = fs.mkdtempSync(path.join(ROOT, "mod-"));
  const dst = path.join(mod, "map", sub);
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  const from = path.join(src, "map", sub);
  if (fs.existsSync(from)) {
    for (const f of fs.readdirSync(from)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      fs.copyFileSync(path.join(from, f), path.join(dst, f));
      n++;
    }
  }
  for (const f of ["definition.csv", "weatherpositions.txt"]) {
    const p = path.join(src, "map", f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(mod, "map", f));
  }
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="' + label + ' eol probe"\nsupported_version="1.19.*"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\n');
  return { mod, copied: n };
}

console.log("\n1. every installed shipping map: two new strategic regions, and the file they land in");
{
  let ran = 0;
  const table = [];
  for (const [label, src] of MAPS) {
    if (!fs.existsSync(path.join(src, "map", "strategicregions"))) { skip(label + " is not installed"); continue; }
    ran++;
    const { mod, copied } = modOwning(label, src, "strategicregions");
    // CONTROL: what does this map actually use? An assertion about mixing is vacuous on an all-LF fixture,
    // so the kinds present are recorded and the CRLF maps are named.
    const kinds = {};
    for (const f of fs.readdirSync(path.join(mod, "map", "strategicregions"))) {
      const k = eolOf(fs.readFileSync(path.join(mod, "map", "strategicregions", f), "utf8")).kind;
      kinds[k] = (kinds[k] || 0) + 1;
    }
    rec(label + ": CONTROL — its region files are readable and whole (" + copied + " files, " + JSON.stringify(kinds) + ")",
      copied > 0 && !kinds.MIXED, kinds);

    const r1 = M.createStrategicRegion({ modRoot: mod, gameRoot: VAN, dependencyRoots: [] });
    const r2 = M.createStrategicRegion({ modRoot: mod, gameRoot: VAN, dependencyRoots: [] });
    rec(label + ": both creates succeeded", r1 && r1.ok && r2 && r2.ok, { r1, r2 });
    const out = path.join(mod, String(r1.file).split("/").join(path.sep));
    const e = eolOf(fs.readFileSync(out, "utf8"));
    table.push([label, JSON.stringify(kinds), e.kind, e.crlf, e.lone]);
    rec(label + ": the new region file is not MIXED (" + e.kind + ", CRLF " + e.crlf + ", lone LF " + e.lone + ")", e.kind !== "MIXED", e);
    // …and it holds both regions, so "not mixed" is not "not written".
    const txt = fs.readFileSync(out, "utf8");
    rec(label + ": …and it really holds both new regions", txt.indexOf("id=" + r1.id) !== -1 && txt.indexOf("id=" + r2.id) !== -1, { r1: r1.id, r2: r2.id, bytes: txt.length });
  }
  if (!ran) skip("no shipping map is installed — section 1 did NOT run");
  else console.log("   " + table.map((r) => r.join(" ")).join("\n   "));
}

console.log("\n2. appending to a file that is already CRLF keeps it CRLF — regions and supply areas both");
{
  // A mod's own zz_nova_*.txt goes through git like any other file, and core.autocrlf is how the four CRLF
  // maps in the corpus got that way. So the append has to match what is on disk, not what it wrote last time.
  for (const [sub, keyword, create] of [
    ["strategicregions", "strategic_region", (mod) => M.createStrategicRegion({ modRoot: mod, gameRoot: VAN, dependencyRoots: [] })],
    ["supplyareas", "supply_area", (mod) => M.createSupplyArea({ modRoot: mod, gameRoot: VAN, dependencyRoots: [] })],
  ]) {
    const mod = fs.mkdtempSync(path.join(ROOT, "crlf-"));
    fs.mkdirSync(path.join(mod, "map", sub), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"),
      'name="crlf"\nsupported_version="1.19.*"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\n');
    const first = create(mod);
    rec(sub + ": the first create succeeded", first && first.ok, first);
    const file = path.join(mod, String(first.file).split("/").join(path.sep));
    // put the file through a CRLF checkout, the way the modder's own git would
    const asCrlf = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    fs.writeFileSync(file, asCrlf);
    const before = eolOf(asCrlf);
    rec(sub + ": CONTROL — the file on disk is now entirely CRLF (" + before.crlf + " CRLF, " + before.lone + " lone LF)", before.kind === "CRLF", before);
    const second = create(mod);
    rec(sub + ": the second create succeeded", second && second.ok, second);
    const after = eolOf(fs.readFileSync(file, "utf8"));
    rec(sub + ": …and the file is still entirely CRLF (" + after.kind + ", " + after.crlf + " CRLF, " + after.lone + " lone LF)", after.kind === "CRLF", after);
    const txt = fs.readFileSync(file, "utf8");
    const blocks = (txt.replace(/#[^\r\n]*/g, "").match(new RegExp("(^|[^A-Za-z0-9_])" + keyword + "\\s*=\\s*\\{", "g")) || []).length;
    rec(sub + ": …and holds both blocks, so the match did not eat one", blocks === 2, blocks);
  }
}

console.log("\n3. the mechanism: the CRLF comes in with the cloned weather body, and nothing else");
{
  // A mod whose ONLY region file is CRLF. cloneAnyRegionWeatherBody reads the mod's own layer first, so the
  // body it copies is that file's — and with it, unless the writer says otherwise, that file's line endings.
  const mod = fs.mkdtempSync(path.join(ROOT, "mech-"));
  fs.mkdirSync(path.join(mod, "map", "strategicregions"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="mechanism"\nsupported_version="1.19.*"\nreplace_path="map/strategicregions"\n');
  const donor = [
    "strategic_region={",
    "\tid=900",
    '\tname="STRATEGICREGION_900"',
    "\tprovinces={ 1 2 }",
    "\tweather={",
    "\t\tperiod={",
    "\t\t\tbetween={ 0.0 30.11 }",
    "\t\t\ttemperature={ -5.0 25.0 }",
    "\t\t\tno_phenomenon=0.700",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\r\n");
  fs.writeFileSync(path.join(mod, "map", "strategicregions", "900-Donor.txt"), donor);
  const before = eolOf(donor);
  rec("CONTROL: the donor region file is entirely CRLF (" + before.crlf + " CRLF, " + before.lone + " lone LF)", before.kind === "CRLF", before);
  const r = M.createStrategicRegion({ modRoot: mod, gameRoot: VAN, dependencyRoots: [] });
  rec("the create succeeded", r && r.ok, r);
  const out = fs.readFileSync(path.join(mod, String(r.file).split("/").join(path.sep)), "utf8");
  const e = eolOf(out);
  rec("the new file is whole (" + e.kind + ", " + e.crlf + " CRLF, " + e.lone + " lone LF)", e.kind !== "MIXED", e);
  // …and it really did clone THAT body, so "not mixed" is not "cloned nothing". The fallback body has no
  // `no_phenomenon=0.700` line spelled this way at this depth by accident — it is the donor's own.
  rec("…and it carries the donor's weather period, so the clone did happen", out.indexOf("between={ 0.0 30.11 }") !== -1 && out.indexOf("temperature={ -5.0 25.0 }") !== -1, out.slice(0, 400));
  rec("…and the donor file is untouched", fs.readFileSync(path.join(mod, "map", "strategicregions", "900-Donor.txt"), "utf8") === donor, "donor changed");
}

console.log("\n" + (checks - fails.length) + "/" + checks + " checks passed" + (skips ? ", " + skips + " skipped" : "") + (fails.length ? "\nFAILED: " + fails.join("\n        ") : ""));
process.exit(fails.length ? 1 : 0);
