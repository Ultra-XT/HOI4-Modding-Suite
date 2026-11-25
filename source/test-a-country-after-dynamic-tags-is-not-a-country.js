// A country registered after `dynamic_tags = yes` is not a country — it is a throwaway civil-war tag,
// and HOI4 dies building its flag atlas the instant the main menu paints.
// #a-country-after-dynamic-tags-is-not-a-country
//
// THE OWNER'S ISLAND CRASH. Five launches, five crashes, and the cause was one filename.
//
// common/country_tags is read in FILENAME ORDER. Vanilla ships exactly two files, and the second is
// zz_dynamic_countries.txt, whose first line reads:
//
//     dynamic_tags  = yes # any tags after this is used for temporary civil wars
//
// Everything registered after that point is disposable — used when a civil war spawns a side — and the
// game never builds it a country flag. Nova wrote its tags to `zz_nova_countries.txt`, which sorts AFTER
// `zz_dynamic_countries.txt`. So every country Nova has ever made was registered as a civil-war tag.
//
// ⚠️ THE CRASH, FROM THE MINIDUMPS. All three island builds die in the same function —
// hoi4/source/graphics/flagtextureatlas.cpp, resolved from the exception offsets against hoi4.exe's own
// export table. v1 and v2 execute an integer divide with a divisor of ZERO (a flag count of none); v3 gets
// 117 bytes further into that same function and reads a null texture, which Windows reports as an access
// violation at 0xFFFFFFFFFFFFFFFF. Same worker thread, same instant as frontend.cpp's "Startup time", and
// error.log stays COMPLETELY EMPTY because it is a graphics-thread fault. Four separate map fixes changed
// which instruction died and never touched the cause.
//
// ⚠️ NOT ONE SHIPPING MOD REGISTERS A REAL TAG AFTER THE MARKER. Their files are 00_countries.txt,
// 01_countries.txt, 02_releasables.txt, COG_countries.txt, JPN_countries.txt, MR_countries.txt,
// PRK_countries.txt, r56_countries.txt — every one sorting before zz_dynamic_countries.txt. The only files
// in the whole installed corpus that appear after it are ones NOVA ITSELF wrote, into two of the owner's
// workshop mods.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__no_game_dyntags__");

// ── 🈯 the fact the whole thing rests on ────────────────────────────────────────────────────────────
console.log("\n=== 🈯 vanilla's own country_tags, in load order ===");
{
  const d = path.join(GAME, "common", "country_tags");
  if (!fs.existsSync(d)) console.log("  ..   (the base game is not installed)");
  else {
    const files = fs.readdirSync(d).filter((f) => f.endsWith(".txt")).sort();
    console.log("     " + files.join("   "));
    const marker = files.find((f) => /(^|[^A-Za-z0-9_])dynamic_tags\s*=\s*yes/.test(fs.readFileSync(path.join(d, f), "utf8")));
    ok(!!marker, `⭐⭐ one of them declares dynamic_tags = yes (${marker})`, files);
    ok(marker === files[files.length - 1],
      "⭐⭐⭐ …and it is the LAST one, so anything sorting after it is a civil-war tag", { marker, last: files[files.length - 1] });
    ok("00_nova_countries.txt" < marker,
      `⭐⭐⭐ Nova's filename sorts BEFORE it — 00_nova_countries.txt < ${marker}`, true);
    ok(!("zz_nova_countries.txt" < marker),
      `⚠️ …while the old name did NOT — zz_nova_countries.txt > ${marker}, which is the bug`, true);
  }
}

// ── ⚠️ ANTI-CRY-WOLF: shipping content never does this ──────────────────────────────────────────────
console.log("\n=== ⚠️ no shipping mod registers a real tag after the marker ===");
{
  if (!fs.existsSync(path.join(GAME, "common", "country_tags"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      if (fs.existsSync(path.join(WS, id, "common", "country_tags"))) roots.push(["ws-" + id, path.join(WS, id)]);
    }
    let checked = 0, offenders = 0;
    for (const [label, root] of roots) {
      const probs = md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: [] })
        .filter((p) => p.rule === "country_tag_after_dynamic_marker");
      checked++;
      // ⚠️ A MOD NOVA HAS ALREADY EDITED WILL FAIL THIS, and that is the finding rather than a false alarm:
      // it carries a zz_nova_countries.txt Nova wrote. Only such files may trip it.
      const novaOnly = probs.length === 0 || (probs[0].files || []).every((f) => /nova/i.test(f));
      if (probs.length) offenders++;
      ok(novaOnly,
        `⭐⭐ ${label}: ${probs.length ? "only a Nova-written file trips it (" + probs[0].files.join(", ") + ")" : "clean"}`,
        probs.map((p) => (p.files || []).join(", ")));
    }
    ok(checked >= 3, `${checked} installed root(s) checked`, checked);
    console.log(`     ${offenders} of ${checked} carry a file after the marker — all of them Nova's own doing`);
  }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
function makeMod(tagFileName) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dyntag-")); tmps.push(d);
  const td = path.join(d, "common", "country_tags");
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="DT"\n');
  fs.writeFileSync(path.join(td, "00_countries.txt"), 'AAA = "countries/Aaa.txt"\n');
  fs.writeFileSync(path.join(td, "zz_dynamic_countries.txt"),
    'dynamic_tags  = yes # any tags after this is used for temporary civil wars\nD01 = "countries/D01.txt"\n');
  if (tagFileName) fs.writeFileSync(path.join(td, tagFileName), 'ZTM = "countries/Tormentia.txt"\n');
  // createCountry needs a real capital state to point at, so the fixture ships one.
  const sd = path.join(d, "history", "states");
  fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, "1.txt"),
    'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 1000\n\tstate_category = rural\n' +
    '\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  return d;
}
const flagged = (d) => md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
  .filter((p) => p.rule === "country_tag_after_dynamic_marker");

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ a tag file sorting after the marker is reported ===");
{
  const bad = makeMod("zz_nova_countries.txt");
  const f = flagged(bad);
  ok(f.length === 1, "⭐⭐⭐ a tag registered after dynamic_tags = yes IS reported", f.length);
  ok(f.length === 1 && f[0].severity === "error", "…as an ERROR", f[0] && f[0].severity);
  ok(isFatalRule("country_tag_after_dynamic_marker") === true,
    "⭐⭐ …and it is FATAL, so Save gates on it — the game cannot start with one", true);
  ok(mapRuleLabel("country_tag_after_dynamic_marker") !== "Country tag after dynamic marker",
    "…and it has a human label", mapRuleLabel("country_tag_after_dynamic_marker"));
  ok(f.length === 1 && /civil.war/i.test(String(f[0].message)),
    "…and the message says what the game actually does with it", f[0] && String(f[0].message).slice(0, 120));

  // ⚠️ THE CONTROL: the same tag, in a file that sorts BEFORE the marker, is fine.
  const good = makeMod("00_nova_countries.txt");
  ok(flagged(good).length === 0,
    "⚠️ THE CONTROL: the identical tag in 00_nova_countries.txt is not reported", flagged(good).map((p) => p.message.slice(0, 80)));

  // …and the marker file's OWN tags are dynamic by design and must never be flagged
  const none = makeMod(null);
  ok(flagged(none).length === 0,
    "⚠️ …and vanilla's own D01 inside the marker file is left alone — those are dynamic on purpose", flagged(none).length);
}

// ── ⭐⭐⭐ the writer puts it in the right place, and migrates the old one ───────────────────────────
console.log("\n=== ⭐⭐⭐ createCountry registers the tag where the game will read it ===");
{
  const d = makeMod(null);
  const r = md.createCountry({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], tag: "ZTM", name: "Tormentia", rgb: [220, 40, 90], stateIds: [1], capitalStateId: 1 });
  ok(!r.error, "the country was created", r.error);
  const td = path.join(d, "common", "country_tags");
  ok(fs.existsSync(path.join(td, "00_nova_countries.txt")),
    "⭐⭐⭐ the tag went into 00_nova_countries.txt", fs.readdirSync(td));
  ok(!fs.existsSync(path.join(td, "zz_nova_countries.txt")),
    "…and nothing was written to the old name", fs.readdirSync(td));
  ok(flagged(d).length === 0, "⭐⭐ …so the mod is clean", flagged(d).map((p) => p.message.slice(0, 90)));
}

console.log("\n=== ⭐⭐ a mod already carrying the old file is migrated, not left broken ===");
{
  const d = makeMod("zz_nova_countries.txt");   // an existing, already-broken mod
  fs.writeFileSync(path.join(d, "common", "country_tags", "zz_nova_countries.txt"),
    'OLD = "countries/Oldland.txt"\nZZZ = "countries/Zed.txt"\n');
  ok(flagged(d).length === 1, "it starts out reported", flagged(d).length);

  const r = md.createCountry({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], tag: "NEW", name: "Newland", rgb: [10, 20, 30], stateIds: [1], capitalStateId: 1 });
  ok(!r.error, "making another country runs the migration", r.error);
  const td = path.join(d, "common", "country_tags");
  const now = fs.existsSync(path.join(td, "00_nova_countries.txt")) ? fs.readFileSync(path.join(td, "00_nova_countries.txt"), "utf8") : "";
  ok(/OLD\s*=/.test(now) && /ZZZ\s*=/.test(now),
    "⭐⭐⭐ the countries the modder already made were carried over, not lost", now.slice(0, 160));
  ok(/NEW\s*=/.test(now), "…along with the new one", now.slice(0, 160));
  ok(!fs.existsSync(path.join(td, "zz_nova_countries.txt")),
    "⭐⭐ …and the old file is GONE — leaving it would declare every tag a second time, after the marker",
    fs.readdirSync(td));
  ok(flagged(d).length === 0, "⭐⭐⭐ …so a mod broken for months repairs itself on the next country", flagged(d).map((p) => p.message.slice(0, 90)));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a country after dynamic tags is not a country: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
