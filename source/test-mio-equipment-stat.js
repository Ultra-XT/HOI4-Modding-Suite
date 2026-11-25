// #mio-equipment-stat — NOVA WROTE COMPANY BONUSES HOI4 REJECTS AS UNEXPECTED TOKENS.
//
// From the user's error.log while playing their mod:
//     unexpected token: reliability_mult
//     unexpected token: air_range_factor
// Both were written by Nova into `equipment_bonus` blocks, and the game threw the modifiers away — so the
// company trait did nothing, silently.
//
// Neither is catchable by shape, which is why nothing caught them:
//   reliability_mult  — does not exist ANYWHERE. 0 hits in vanilla, 0 in Millennium Dawn, and absent from
//                       the 812 modifiers in hoi4-spec.json. A pure invention.
//   air_range_factor  — a perfectly REAL country modifier (96 vanilla uses, 71 in MD, present in the spec)
//                       that is simply never legal inside an equipment_bonus: 0 of those 167 uses is.
// The intended stats were `reliability` and `air_range`.
//
// The spec is the wrong authority here — equipment STATS are a different namespace from country MODIFIERS,
// and `reliability` and `air_range` are not in the modifier list either. So the vocabulary is harvested
// from where it is really defined: the equipment_bonus/production_bonus blocks of every company the game
// loads.
//
// It WARNS and never blocks. The vocabulary is evidence, not a specification, and 4 of the 19 stats Nova's
// own picker offers appear in no vanilla company at all — refusing unknown names would refuse Nova's own
// suggestions.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miostat-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "miostatmod");
fs.mkdirSync(path.join(MOD, "common", "military_industrial_organization", "organizations"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MioStatMod"\nsupported_version="1.19.*"\n', "utf8");

// A game root with hoi4.exe present but NO companies to harvest. resolveHoi4GameRoot accepts any directory
// containing hoi4.exe, which is how the empty-catalogue path can be reached deliberately.
const FAKE_GAME = path.join(ROOT, "fake_game");
fs.mkdirSync(FAKE_GAME, { recursive: true });
fs.writeFileSync(path.join(FAKE_GAME, "hoi4.exe"), "");

const PORT = process.env.NOVA_MIOSTAT_CHILD ? 42496 : 42495;
const app = createApp();
const server = app.listen(PORT, async () => {
  let n = 0;
  const save = (equipmentBonus, traitBonus) => fetch(`http://127.0.0.1:${PORT}/api/mio`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, id: `nova_miostat_${++n}`, icon: "",
      equipmentType: ["infantry_equipment"], researchCategories: [], include: [],
      initial: { equipmentBonus: equipmentBonus || {}, productionBonus: {} },
      traits: traitBonus ? [{ token: `t_${n}`, x: 0, y: 0, equipmentBonus: traitBonus }] : [],
    }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const warn = (r) => String((r.b && r.b.refWarning) || "");

  if (process.env.NOVA_MIOSTAT_CHILD) {
    // Child mode — one save with a stat nothing defines, against a game root that has no companies at all.
    const cr = await save({ totally_made_up_stat: 0.5 });
    console.log("CHILD-FAILOPEN: " + ((cr.s === 200 && cr.b && cr.b.ok !== false) ? "ok" : "failed") +
      " warn=" + warn(cr).replace(/\s+/g, " "));
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    return;
  }

  try {
    console.log("\n[control] REAL equipment stats must stay silent");
    // FIRST. A stat lint that cries wolf is worse than none — and `reliability` is vanilla's most-used
    // company stat (140 uses), so a guard that flags it is broken outright.
    let r = await save({ reliability: 0.05, maximum_speed: 0.1, air_range: 0.05 });
    rec("a company with real stats saves", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…with no stat warning", !/not an equipment stat/i.test(warn(r)), warn(r));

    console.log("\n[the bug] the two tokens HOI4 actually rejected");
    r = await save({ reliability_mult: 0.05 });
    rec("reliability_mult is warned about", /reliability_mult/.test(warn(r)), warn(r));
    // The suggestion is the useful half — the author typed something plausible, not something random.
    rec("…and 'reliability' is suggested", /did you mean "reliability"/.test(warn(r)), warn(r));
    rec("…and the save still SUCCEEDS (warn, never block)", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);

    r = await save({ air_range_factor: 0.05 });
    rec("air_range_factor is warned about", /air_range_factor/.test(warn(r)), warn(r));
    rec("…and 'air_range' is suggested", /did you mean "air_range"/.test(warn(r)), warn(r));

    console.log("\n[traits are checked too — that is where the user's were]");
    r = await save({}, { reliability_mult: 0.05 });
    rec("a TRAIT's bonus is checked", /reliability_mult/.test(warn(r)), warn(r));
    rec("…and the trait is named", /trait "/.test(warn(r)), warn(r));

    console.log("\n[the written file still contains what the author asked for]");
    // The lint must not quietly rewrite the author's script — it reports, the file is theirs.
    const dir = path.join(MOD, "common", "military_industrial_organization", "organizations");
    const all = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    rec("the flagged stat was still written", /reliability_mult\s*=/.test(all), all.slice(0, 300));
    rec("…and so were the good ones", /reliability\s*=/.test(all) && /maximum_speed\s*=/.test(all), all.slice(0, 300));

    console.log("\n[a real modifier in the WRONG BLOCK is still wrong]");
    // air_range_factor exists — this is the case a spec-based name check would have passed.
    r = await save({ air_range_factor: 0.1, reliability: 0.05 });
    rec("the real-but-misplaced modifier is flagged", /air_range_factor/.test(warn(r)), warn(r));
    rec("…while the valid stat beside it is not", !/"reliability" is not/.test(warn(r)), warn(r));

    console.log("\n[the check must not validate the mod against itself]");
    // Found by a control that refused to fire. Harvesting the vocabulary from the ACTIVE mod makes the
    // check self-validating: the bad stat is written, joins the allow-list on the very next read, and is
    // never questioned again — so an existing typo is permanently blessed and the warning can only ever
    // fire once, on the save that created it. Saving the same bad stat twice is the smallest repro.
    r = await save({ reliability_mult: 0.05 });
    rec("a bad stat is STILL flagged on a later save", /reliability_mult/.test(warn(r)), warn(r));

    console.log("\n[fail OPEN] with no companies to learn from, say nothing at all");
    // The vocabulary is HARVESTED, so a machine with no game install (or a stripped one) would otherwise
    // have Nova lecture the author about every stat they typed. Run this in a child process pointed at a
    // fake game root — the parent's own run above proves the lint is awake, so a silent child here is the
    // fail-open working rather than the lint being broken.
    const childOut = require("child_process").spawnSync(process.execPath, [__filename], {
      encoding: "utf8", timeout: 200000,
      env: Object.assign({}, process.env, { NOVA_MIOSTAT_CHILD: "1", HOI4_ROOT: FAKE_GAME }),
    });
    const childText = (childOut.stdout || "") + (childOut.stderr || "");
    const m = /CHILD-FAILOPEN: (\S+) warn=(.*)$/m.exec(childText);
    rec("the fail-open child ran", !!m, childText.slice(-400));
    if (m) {
      rec("…the save succeeded there too", m[1] === "ok", m[1]);
      rec("…and NOTHING was warned about, despite a nonsense stat", !/not an equipment stat/i.test(m[2]), m[2]);
    }

    console.log(`\n=== mio equipment stat: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
