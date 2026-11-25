// Mod Health "mod contents" overview counts. Characters are indexed as `idea` entities (so the
// orphan/dependency logic treats them uniformly), which used to inflate the Spirits chip. The index
// now also reports `counts.spirit` (true national spirits) and `counts.character` separately, plus
// `counts.country` from history. This guards that split so the overview stays accurate.
//
// Run:  node test-modhealth-counts.js
const fs = require("fs"), os = require("os"), path = require("path");
const { buildModIndex } = require("./mod-index.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhcounts-"));
try {
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Counts Test"\n');

  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(mod, "common", "ideas", "spirits.txt"),
    "ideas = {\n country = {\n spirit_a = { allowed = { always = yes } removal_cost = -1 modifier = { political_power_gain = 0.05 } }\n spirit_b = { allowed = { always = yes } removal_cost = -1 modifier = { stability_factor = 0.05 } }\n }\n}\n");

  fs.mkdirSync(path.join(mod, "common", "characters"), { recursive: true });
  fs.writeFileSync(path.join(mod, "common", "characters", "chars.txt"),
    'characters = {\n leader_x = { name = "X" country_leader = { ideology = despotism } }\n general_y = { name = "Y" corps_commander = { traits = {} skill = 3 } }\n advisor_z = { name = "Z" advisor = { slot = political_advisor idea_token = adv_z } }\n }\n');

  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "history", "countries", "ZZZ - Test.txt"),
    "capital = 1\nset_politics = { ruling_party = neutrality }\nideas = { spirit_a }\n");

  const idx = buildModIndex(mod, {});
  const c = idx.counts;
  console.log("[counts]", JSON.stringify({ idea: c.idea, spirit: c.spirit, character: c.character, country: c.country }));

  ok(c.idea === 5, "idea total = spirits + characters (2 + 3 = 5)", c.idea);
  ok(c.spirit === 2, "spirit count excludes characters (2)", c.spirit);
  ok(c.character === 3, "character count = 3", c.character);
  ok(c.spirit + c.character === c.idea, "spirit + character === idea total (no double count / no miss)");
  ok(c.country === 1, "country count = 1", c.country);

  console.log(`\n  ${pass} passed, ${fail} failed`);
} catch (e) { console.error(e); fail++; }
finally {
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail > 0 ? 1 : 0);
}
