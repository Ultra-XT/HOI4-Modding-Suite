// ⛔ #a-validator-must-not-cry-wolf — NOVA'S TWO HALVES DISAGREED ABOUT ONE FACT.
//
// Taking a state that was somebody's capital warns the modder, and rightly so. But the warning asserted
// "HOI4 crashes when a country with no valid capital is selected" whenever the taken state was the capital,
// without asking whether that country still holds any land. A country that owns nothing is not selectable
// at game start, so it cannot crash on selection.
//
// The map validator already knew. Its capital_state_owned_by_other rule skips exactly this case and says so:
// "country doesn't exist at start → unowned capital is harmless". Two subsystems, one fact, two answers —
// and the careful reasoning was the one that was not being shown to the user.
//
// Not a corner case. ICE owns exactly ONE state in vanilla (100 — Iceland) and its capital is that state, so
// a modder carving a new country out of Iceland was told to expect a crash that cannot happen, about a
// country that has simply been removed from the map.
//
// BOTH DIRECTIONS, and the crash case first: this rule is only worth changing if the real warning survives.
// GER owns 36 states with its capital at 64, so taking Berlin leaves a country that still exists, still gets
// selected, and genuinely has no valid capital.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capwarn-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const mkMod = (name) => {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `version="1"\nname="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
};

const PORT = 42574;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    if (!fs.existsSync(path.join(GAME, "history", "states"))) {
      console.log("  (no HOI4 install — skipped)");
      console.log("\n=== a country that owns nothing cannot crash on selection: 0 checks, 0 failed ===");
      return;
    }

    // ⚠️ ASSERT THE FIXTURE. These two numbers are the whole basis of the test, and a game update could move
    // either — at which point the checks below would pass or fail for reasons that have nothing to do with
    // the rule. Derived from the install, never typed as an expectation.
    const ownersOf = (tag) => fs.readdirSync(path.join(GAME, "history", "states"))
      .filter((f) => f.endsWith(".txt"))
      .filter((f) => new RegExp(`\\bowner\\s*=\\s*${tag}\\b`).test(fs.readFileSync(path.join(GAME, "history", "states", f), "utf8"))).length;
    const capitalOf = (tag) => {
      const dir = path.join(GAME, "history", "countries");
      const f = fs.readdirSync(dir).find((x) => x.toUpperCase().startsWith(tag + " ") || x.toUpperCase() === tag + ".TXT");
      if (!f) return null;
      const m = /^\s*capital\s*=\s*(\d+)/m.exec(fs.readFileSync(path.join(dir, f), "utf8"));
      return m ? Number(m[1]) : null;
    };
    const iceOwns = ownersOf("ICE"), iceCap = capitalOf("ICE");
    const gerOwns = ownersOf("GER"), gerCap = capitalOf("GER");
    console.log(`\nfixture: ICE owns ${iceOwns} state(s), capital ${iceCap} · GER owns ${gerOwns}, capital ${gerCap}`);
    ok(iceOwns === 1 && iceCap !== null, "fixture: ICE owns exactly one state, and it is its capital", { iceOwns, iceCap });
    ok(gerOwns > 1 && gerCap !== null, "fixture: GER owns many states and has a capital", { gerOwns, gerCap });

    const create = async (mod, tag, name, capitalStateId) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/countries/create`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, tag, name, color: "51 85 170", graphicalCulture: "western_european_gfx", capitalStateId: String(capitalStateId) }),
      });
      const d = await r.json();
      // READ THE RESPONSE BEFORE JUDGING THE TEXT. A rejected create returns no warning at all, which reads
      // exactly like "the wolf-cry is gone".
      if (!r.ok || d.error) throw new Error(`create rejected (${r.status}): ${d.error || "?"}`);
      return String(d.capitalWarning || "");
    };

    console.log("\n-- CONTROL: a country that KEEPS land loses the capital its history names, and must still be told so --");
    {
      const w = await create(mkMod("capwarn_ger"), "PRA", "Probia", gerCap);
      ok(/GER/.test(w), "taking Berlin warns about GER", w.slice(0, 200));
      // Moved with #a-map-message-matches-what-the-engine-checks: not "it crashes" — HOI4 refuses the capital and logs it.
      ok(/refuses/i.test(w) && !/harmless/i.test(w), "…and still warns that the game refuses GER's capital, because GER still exists", w.slice(0, 240));
    }

    console.log("\n-- ⭐ THE FIX: a country left owning nothing is not a crash --");
    {
      const w = await create(mkMod("capwarn_ice"), "PRB", "Probeland", iceCap);
      ok(w.length > 0, "taking Iceland still says something — the modder just removed a country", w.slice(0, 200));
      ok(!/crash/i.test(w), "…but does NOT claim a crash that cannot happen", w.slice(0, 260));
      ok(/owns no land|only state|not exist at game start/i.test(w), "…it says what actually happened instead", w.slice(0, 260));
    }

    console.log("\n-- and the map validator agrees it is harmless --");
    {
      // The whole point of the change: the two halves now say the same thing about the same mod.
      const mod = mkMod("capwarn_agree");
      await create(mod, "ZZC", "Probelund", iceCap);
      const v = await (await fetch(`http://127.0.0.1:${PORT}/api/map/validate?modPath=${encodeURIComponent(mod)}`)).json();
      const all = [].concat(v.problems || [], v.errors || [], v.warnings || []);
      const cap = all.filter((p) => /capital/i.test(p.rule || p.id || p.type || ""));
      ok(cap.length === 0, "no capital finding for a country that owns nothing", cap.slice(0, 3));
    }

    console.log(`\n=== a country that owns nothing cannot crash on selection: ${pass} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
  } catch (e) {
    console.log("THREW " + (e && e.stack ? e.stack : e));
    fails.push("threw");
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    process.exit(fails.length ? 1 : 0);
  }
});
