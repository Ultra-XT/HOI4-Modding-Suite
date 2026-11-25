// #country-no-flag — Mod Health said "no problems found" about a country that had no flag at all.
//
// HOI4 draws a country's flag on the selection screen, the diplomacy list, every unit counter, every event
// popup and every peace conference. A tag with no gfx/flags/<TAG>.tga gets a blank placeholder in all of
// them. It is the single most visible thing that can be missing from a new country, and nothing checked.
//
// Found the plain way: the demo mod this campaign has been building had passed Mod Health clean for passes on
// end, and when I went to audit whether everything in it had a picture, its only country had no flag folder
// whatsoever. The tool was silent about the most conspicuous gap in the mod.
//
// Scoped like every other rule here, and that scoping is most of the work:
//   • only tags the mod DECLARES itself in common/country_tags — adding content to Germany does not make
//     Germany's flag your problem;
//   • and only when no layer supplies one, so an add-on whose parent mod already ships the art is silent.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const flagsOf = (probs) => probs.filter((p) => p.rule === "country_no_flag").map((p) => p.entityId);

// A minimal "base game" that owns GER and ships its flag.
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-game-"));
mk(path.join(GAME, "common", "country_tags", "00_countries.txt"), 'GER = "countries/Germany.txt"\n');
mk(path.join(GAME, "gfx", "flags", "GER.tga"), "not-a-real-tga-but-a-file");

(() => {
  console.log("=== a country the mod introduces, with no flag ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="FlagMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod, "common", "country_tags", "custom.txt"), 'NUA = "countries/Nova Union.txt"\n');

  const r1 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("the mod's own flagless country is reported", flagsOf(r1.problems).includes("NUA"), flagsOf(r1.problems));
  const p = r1.problems.find((x) => x.rule === "country_no_flag");
  ok("…as a warning, not an error", p.severity === "warning", p.severity);
  ok("…naming the file the modder needs to create", /gfx\/flags\/NUA\.tga/.test(p.message), p.message);
  ok("…and where in Nova to do it", /Country Setup/.test(p.message), p.message);

  console.log("\n=== …and once it has one ===");
  mk(path.join(mod, "gfx", "flags", "NUA.tga"), "flag-bytes");
  const r2 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("it is no longer reported", !flagsOf(r2.problems).includes("NUA"), flagsOf(r2.problems));

  console.log("\n=== a country the mod does NOT introduce is never its problem ===");
  // The mod adds content to Germany. Germany's flag is the base game's business, not the modder's — this is
  // the same #inherited-problem-not-yours rule the map checks now follow.
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-mod2-"));
  mk(path.join(mod2, "descriptor.mod"), 'name="ContentForGermany"\nsupported_version="1.19.*"\n');
  mk(path.join(mod2, "history", "countries", "GER - Germany.txt"), "capital = 64\n");
  const r3 = mi.buildModIndex(mod2, { vanillaRoot: GAME });
  ok("a mod that only adds content to GER is not told about GER's flag",
    !flagsOf(r3.problems).includes("GER"), flagsOf(r3.problems));

  // Even if the base game somehow had no flag for it, the mod did not declare the tag, so it is not asked.
  const GAME2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-game2-"));
  mk(path.join(GAME2, "common", "country_tags", "00_countries.txt"), 'GER = "countries/Germany.txt"\n');
  const r4 = mi.buildModIndex(mod2, { vanillaRoot: GAME2 });
  ok("…not even when the base game itself is missing it", !flagsOf(r4.problems).includes("GER"), flagsOf(r4.problems));

  console.log("\n=== an add-on whose parent already ships the flag stays quiet ===");
  // The add-on re-declares the parent's tag (a normal override) but the parent supplies the art.
  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-dep-"));
  mk(path.join(DEP, "gfx", "flags", "PAR.tga"), "parent-flag-bytes");
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-addon-"));
  mk(path.join(mod3, "descriptor.mod"), 'name="AddOn"\nsupported_version="1.19.*"\n');
  mk(path.join(mod3, "common", "country_tags", "custom.txt"), 'PAR = "countries/Parent.txt"\n');
  const r5 = mi.buildModIndex(mod3, { vanillaRoot: GAME, dependencyRoots: [DEP] });
  ok("the add-on is not blamed for a flag its parent ships",
    !flagsOf(r5.problems).includes("PAR"), flagsOf(r5.problems));
  const r6 = mi.buildModIndex(mod3, { vanillaRoot: GAME, dependencyRoots: [] });
  ok("…but with no parent supplying it, it is reported", flagsOf(r6.problems).includes("PAR"), flagsOf(r6.problems));

  console.log("\n=== .dds is a flag too ===");
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-dds-"));
  mk(path.join(mod4, "descriptor.mod"), 'name="DdsMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod4, "common", "country_tags", "custom.txt"), 'XYZ = "countries/Xyz.txt"\n');
  mk(path.join(mod4, "gfx", "flags", "XYZ.dds"), "dds-bytes");
  const r7 = mi.buildModIndex(mod4, { vanillaRoot: GAME });
  ok("a .dds flag counts", !flagsOf(r7.problems).includes("XYZ"), flagsOf(r7.problems));

  [GAME, GAME2, DEP, mod, mod2, mod3, mod4].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log("\ntest-country-no-flag: " + pass + " checks passed");
})();
