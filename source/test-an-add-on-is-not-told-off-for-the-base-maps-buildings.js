// ⛔ #inherited-problem-not-yours, ON THE DEPENDENCY AXIS — buildings.txt and naval regions.
//
// Two rules were still comparing against the base GAME on a mod that does not sit on the base game.
//
// 1. baseFractionedProvinces took a dependencyRoots argument and never used one. It always asked vanilla
//    what was already fractioned, and cached the answer under gameRoot alone, so every mod on the machine
//    shared vanilla's answer regardless of what it actually sat on. Millennium Dawn ships ONE fractioned
//    naval region — sea provinces 1940 and 2143 — and vanilla ships none, so on an MD add-on the
//    subtraction removed nothing. One click of the Terrain tool (which materialises MD's whole
//    definition.csv into the add-on) then reported MD's fractioned region as the add-on's error, on a mod
//    that had not touched a single sea province.
//    ⚠️ #the-wrap-seam-joins-a-region — that "one fractioned region" was region 96 split at the date line by an
//    adjacency that never wrapped; MD reports none now. The dependency-axis bug was real all the same, and its
//    check below now stands on Old World Blues, which still reports fragments of its own.
//
// 2. The buildings rules ask whether the STATE a row names is the mod's. On a vanilla-based mod that is
//    right — buildings.txt is a whole-file override that Nova materialises on the first map edit, so asking
//    about the FILE would say "yours" for all ~66,000 rows. On the dependency axis it is not enough: moving
//    one province in and out of MD's state 10 makes state 10 the add-on's, and three of MD's own problems
//    (a fuel_silo on province 6268, a floating_harbor on 11297, an anchor on 11299) began being reported as
//    the add-on's work. MD reports all three for itself, with the same province ids.
//
// ⚠️⚠️ AND THE OBVIOUS FIX IS WRONG. "Is the ROW TEXT the mod's?" silences a real defect: a mod that moves a
// province out of a state while shipping buildings.txt unchanged has made an inherited row wrong — the row
// is byte-identical and the mistake is entirely the mod's. Measured: that version took
// hellenic_ascendancy's 4 building_wrong_state to 0, and all four are its own doing.
//
// So both now ask what the naval rule always meant to ask: WAS THIS EXACT PROBLEM ALREADY THERE BELOW?
// Subtract the base layer's own answer, computed once per base root against that root as if it were the
// mod. Inherited-and-unchanged goes quiet; caused-by-your-edit still reports, because in the base the
// province was in the state the row names and there was no problem to inherit.
//
// 📊 CORPUS, measured before and after (anchor / wrong-state):
//     vanilla edited directly      7 / 151   ->  7 / 151   unchanged   (nothing below it)
//     Millennium Dawn itself      17 / 275   -> 17 / 275   unchanged   (it authors its own file)
//     Old World Blues             23 / 664   -> 23 / 664   unchanged   (ships its own everything)
//     hellenic_ascendancy          0 /   4   ->  0 /   4   unchanged   (its own doing — see the ⚠️ above)
//     kurdistan                   35 /   0   -> 28 /   0   the 7 vanilla has, exactly
//     workshop 820260968         173 / 192   -> 166 /  97
//     ⭐ MD add-on (edited)         1 /   2   ->  0 /   0
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

console.log("\n=== the helper takes the dependency into account at all ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const at = SRC.indexOf("function baseFractionedProvinces(");
  const body = at < 0 ? "" : SRC.slice(at, SRC.indexOf("\n}", at));
  ok(body.length > 0, "baseFractionedProvinces was found");
  // It USED to accept dependencyRoots and pass [] straight through, so the parameter was decorative.
  // It now goes through layersBelow, which is baseRootsFor PLUS the active mod's own replace_path — a mod
  // that replaces map/ outright has nothing beneath it and must be told about all of its own rows.
  ok(/layersBelow\(modRoot, gameRoot, dependencyRoots/.test(body),
    "⭐ it resolves the base from the dependency chain, not from gameRoot alone", body.slice(0, 260));
  ok(!/dependencyRoots:\s*\[\]/.test(body),
    "…and no longer hands the fractioned scan an empty dependency list", body.slice(0, 300));
  ok(/_baseFractionedCache\.set\(key/.test(body) && /String\(baseRoot\)\.toLowerCase\(\)/.test(body),
    "…and caches on the RESOLVED base root, so two mods on different bases can't share one answer");

  const at2 = SRC.indexOf("function baseBuildingProblemKeys(");
  const body2 = at2 < 0 ? "" : SRC.slice(at2, SRC.indexOf("\n}", at2));
  ok(body2.length > 0, "baseBuildingProblemKeys was found");
  ok(/_baseBuildingProblemCache\.set\(key, null\)/.test(body2),
    "…and seeds its cache before computing, so the recursive base scan cannot loop for ever");
  ok(/rehome/.test(body2),
    "…and reads the RAW rehome list, not the already-gated report");
  ok(/layersBelow\(modRoot, gameRoot, dependencyRoots/.test(body2),
    "…and it too honours the active mod's own replace_path");

  // ⚠️ A mod that replaces map/ outright has NOTHING beneath it, so nothing may be subtracted from it.
  // Without this, a mod shipping its own provinces.bmp, definition.csv, states and buildings.txt went quiet
  // about its own stale row because the base game happened to have one with the same key.
  const lb = SRC.indexOf("function layersBelow(");
  const lbBody = lb < 0 ? "" : SRC.slice(lb, SRC.indexOf("\n}", lb));
  ok(lbBody.length > 0 && /readReplacePaths\(modRoot\)/.test(lbBody),
    "⚠️ layersBelow returns nothing when the mod itself replaces the folder", lbBody.slice(0, 200));
}

if (!fs.existsSync(MD) || !fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("\n  ..   (Millennium Dawn or the base game is not installed — the corpus half cannot run)");
} else {
  const os = require("os");
  const tmps = [];
  const addon = (deps) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mdaddon-")); tmps.push(d);
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="A"\nsupported_version="1.19.*"\n');
    return d;
  };

  // ⚠️ MOVED WITH #the-wrap-seam-joins-a-region. This section stood on Millennium Dawn's one fractioned region (1940,
  // 2143). That was region 96 split at the date line by an adjacency that never wrapped: with the seam linked MD
  // reports none, and "the add-on is not told" would pass without testing anything. Old World Blues still reports
  // fragments for itself (27 provinces in regions 1 and 104), so the same question is asked of it.
  // ⚠️ MOVED AGAIN WITH #a-fractioned-region-is-judged-the-way-the-game-judges-it. Those 27 were Nova judging a region's
  // sea without its own coast; hoi4.exe floods every province a region lists (0x1401F1160 in 1.19.4.1), and read that way Old World
  // Blues — which thousands of players load — has none. No shipping map is left with a real one to inherit, so the
  // dependency-axis subtraction is exercised on fixtures instead (test-a-map-warning-is-about-what-the-mod-changed.js,
  // test-auto-fix-leaves-a-fractioned-region-the-mod-inherited.js); this section now pins the six-map answer on OWB.
  const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
  console.log("\n=== ⭐ the fractioned naval region is the dependency's, not the add-on's ===");
  {
    const fr = (root, deps) => md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: deps })
      .filter((p) => p.rule === "fractioned_naval_region");
    ok(fr(OWB, []).length === 0, "Old World Blues reports none for itself, read the way the game reads it", fr(OWB, []).map((p) => p.provinces));
    ok(fr(GAME, []).length === 0, "…and the base game reports none, which is why the old gate removed nothing",
      fr(GAME, []).length);
    ok(fr(MD, []).length === 0, "…and Millennium Dawn reports none, once the map wraps", fr(MD, []).map((p) => p.provinces));

    // The shape that broke: an add-on holding a COPY of the dependency's definition.csv, exactly as one Terrain
    // click leaves it. Copy only the map file — everything else still resolves through the dependency.
    const a = addon([OWB]);
    fs.mkdirSync(path.join(a, "map"), { recursive: true });
    fs.copyFileSync(path.join(OWB, "map", "definition.csv"), path.join(a, "map", "definition.csv"));
    ok(fr(a, [OWB]).length === 0,
      "⭐ an add-on holding Old World Blues' map verbatim is not told its region is fractioned", fr(a, [OWB]).map((p) => p.message));
  }

  console.log("\n=== ⭐ …and neither are Millennium Dawn's buildings ===");
  {
    const b = (root, deps) => {
      const model = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: deps });
      const probs = [].concat(
        md.findBuildingAnchorMismatches({ modRoot: root, gameRoot: GAME, dependencyRoots: deps, model }),
        md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: deps }));
      const by = { anchor: 0, wrong: 0 };
      for (const p of probs) {
        if (p.rule === "building_anchor_wrong_state") by.anchor++;
        if (p.rule === "building_wrong_state") by.wrong++;
      }
      return by;
    };
    const mdOwn = b(MD, []);
    // ⚠️ `wrong > 0` was dropped from this control, and the reason matters.
    // #a-building-is-read-one-pixel-north — the placement scan used to resolve every row one bitmap row
    // NORTH of where it sits, which made MD look like it had placement problems of its own. It does not:
    // with the z→row mapping corrected, building_wrong_state reports ZERO on all five shipping maps here.
    // The ANCHOR rule still fires 17 times on MD, so this control still has real teeth — it just no longer
    // asserts a count that only existed because the reader was off by one.
    ok(mdOwn.anchor > 0,
      `Millennium Dawn reports its own (${mdOwn.anchor} anchor, ${mdOwn.wrong} placement)`, mdOwn);

    // An add-on that ships MD's buildings.txt AND one of MD's state files — which is what any state edit
    // leaves behind — used to inherit MD's problems for every state it happened to materialise.
    const a = addon([MD]);
    fs.mkdirSync(path.join(a, "map"), { recursive: true });
    fs.copyFileSync(path.join(MD, "map", "buildings.txt"), path.join(a, "map", "buildings.txt"));
    const sdir = path.join(MD, "history", "states");
    fs.mkdirSync(path.join(a, "history", "states"), { recursive: true });
    let copied = 0;
    for (const f of fs.readdirSync(sdir).filter((x) => x.endsWith(".txt")).slice(0, 40)) {
      fs.copyFileSync(path.join(sdir, f), path.join(a, "history", "states", f)); copied++;
    }
    const got = b(a, [MD]);
    ok(got.anchor === 0 && got.wrong === 0,
      `⭐ an add-on holding MD's buildings.txt and ${copied} of its state files is told nothing`, got);

    // ⚠️ THE CONTROL THAT MATTERS. Break one of those states for real — move a province out of it — and the
    // inherited row IS now the add-on's mistake, even though its text never changed.
    // A state the add-on itself ships (so it is the add-on's to break) with a province to give away.
    const victim = md.buildMapModel({ modRoot: a, gameRoot: GAME, dependencyRoots: [MD] }).states
      .find((st) => st && st.rootPath && st.rootPath.indexOf(a) === 0 && (st.provinces || []).length >= 2) || null;
    if (!victim) {
      console.log("  ..   (no suitable state to break — control skipped)");
    } else {
      const other = md.buildMapModel({ modRoot: a, gameRoot: GAME, dependencyRoots: [MD] })
        .states.find((s) => s.id !== victim.id && (s.provinces || []).length);
      md.moveProvince({ modRoot: a, gameRoot: GAME, dependencyRoots: [MD],
        provinceId: victim.provinces[0], fromStateId: victim.id, toStateId: other.id });
      const after = b(a, [MD]);
      ok(after.wrong >= got.wrong,
        "⚠️ THE CONTROL: moving a province out does not make the add-on quieter",
        { before: got, after });
    }
  }

  console.log("\n=== ⭐ …nor a dependency's capital mismatch, the last rule still using the coarse standard ===");
  {
    // Millennium Dawn pointed NPM's capital at state 706, which ABK owns. An add-on that ships COPIES of both
    // files involved satisfies "could the mod have caused this" on both counts — and had not caused
    // anything. Found by mirroring all 2,129 of MD's map and history files into an add-on, changing nothing:
    // 295 of MD's 296 problems were correctly silent and this one was not.
    // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy ships no capital mismatch, so
    // "Millennium Dawn reports one for itself" failed on every commit, and the add-on half passed without testing
    // anything. The question never depended on MD: it is asked of the first installed map that reports one for
    // itself (MD first, then the rest of the workshop folder — Novum Vexillum and Rise of Nations ship several).
    const caps = (root, deps) => {
      const model = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: deps });
      return md.validateMapModel(model).filter((p) => p.rule === "capital_state_owned_by_other");
    };
    const WORKSHOP = path.dirname(MD);
    const candidates = [MD].concat(fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => d !== MD).sort());
    let SRC = null, srcCaps = [];
    for (const root of candidates) {
      if (!fs.existsSync(path.join(root, "history", "countries")) || !fs.existsSync(path.join(root, "history", "states"))) continue;
      let found = []; try { found = caps(root, []); } catch (_) { found = []; }
      if (found.length) { SRC = root; srcCaps = found; break; }
    }
    if (!SRC) {
      console.log("  ..   (no installed map reports a capital mismatch for itself — this section cannot run)");
    } else {
    ok(srcCaps.length >= 1, `${path.basename(SRC)} reports one for itself`, srcCaps.length);
    const item = ((srcCaps[0] || {}).items || [])[0] || {};
    ok(!!item.tag && item.capital != null, "…and names the tag and the state", item);

    const a = addon([SRC]);
    // Copy the two files that decide it: the country file that points the capital, and the state file that
    // says who owns it. Both byte-identical — the add-on changed neither.
    const copyMatching = (rel, pick) => {
      const src = path.join(SRC, ...rel.split("/"));
      if (!fs.existsSync(src)) return 0;
      fs.mkdirSync(path.join(a, ...rel.split("/")), { recursive: true });
      let n = 0;
      for (const f of fs.readdirSync(src)) {
        if (!pick(f)) continue;
        fs.copyFileSync(path.join(src, f), path.join(a, ...rel.split("/"), f)); n++;
      }
      return n;
    };
    const nc = copyMatching("history/countries", (f) => f.toUpperCase().startsWith(item.tag + " ") || f.toUpperCase().startsWith(item.tag + "-") || f.toUpperCase() === item.tag + ".TXT");
    const ns = copyMatching("history/states", (f) => new RegExp("^" + item.capital + "[-. ]").test(f));
    ok(nc > 0 && ns > 0, `the add-on now ships both files (${nc} country, ${ns} state), byte-identical`, { nc, ns });
    ok(caps(a, [SRC]).length === 0,
      "⭐ …and is still not told about a mismatch it copied rather than made", caps(a, [SRC]).map((p) => p.message));
    }
  }

  console.log("\n=== ⚠️ nothing that authors its own map goes quiet ===");
  {
    const count = (root, deps) => {
      const model = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: deps });
      return md.findBuildingAnchorMismatches({ modRoot: root, gameRoot: GAME, dependencyRoots: deps, model }).length;
    };
    ok(count(GAME, []) > 0, "the base game edited directly still reports its own", count(GAME, []));
    ok(count(MD, []) > 0, "…and so does Millennium Dawn", count(MD, []));
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
}

console.log(`\n=== an add-on is not told off for the base map's buildings: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
