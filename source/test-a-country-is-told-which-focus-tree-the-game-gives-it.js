// 🏳 A COUNTRY IS TOLD WHICH FOCUS TREE THE GAME GIVES IT. #country-card-focus-tree
//
// The map's country card (the owner's next milestone after TEST 31: click a country, see its focus tree, research,
// laws…) has to say when a country has no focus tree of its own — the owner asked for that warning in so many words.
// Nothing in Nova answered it: the tree list shows every tree with ONE tag read off it, which is not what the game
// does. HOI4 scores every loaded tree's `country = { … }` rule for the country, MTTH-style, and the highest score above
// 0 wins; a country no tree wants gets the `default = yes` one; a start-of-game `load_focus_tree` overrides both.
//
// GET /api/focus/tree-for-country?tag&modPath → { kind: own | shared | generic | loaded | none, tree }.
//
// 1. scoreFocusTreeCountryBlock on rule shapes copied from the base game's own files (named beside each).
// 2. The whole installed base game as a corpus: every country a base-game tree is written for is told "own", and a
//    country none is written for is told "generic". Derived from the files, not typed in.
// 3. The endpoint on a layered fixture: base game, a dependency, an add-on — same-path replacement, replace_path, the
//    shared-tree stand-in Millennium Dawn uses, load_focus_tree, and whose file it names.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("tree-for-country");
const { createApp, scoreFocusTreeCountryBlock, extractFocusTreeCountries } = require("./server.js");

// ── 1. The scoring, on the base game's own shapes ────────────────────────────────────────────────────────────────
console.log("1. scoring a tree's country rule");
const score = (block, tag, implied) => scoreFocusTreeCountryBlock(block, tag, implied);
{
  const ger = "country = { factor = 0 modifier = { add = 10 tag = GER } }"; // germany.txt
  rec("germany.txt's rule wants GER, at 10, by name", score(ger, "GER").score === 10 && score(ger, "GER").names === true, score(ger, "GER"));
  rec("…and nobody else", score(ger, "FRA").score === 0 && score(ger, "FRA").names === false, score(ger, "FRA"));

  const gen = "country = { factor = 1 }"; // generic.txt (default = yes)
  rec("generic.txt's rule scores 1 for anyone, naming nobody", score(gen, "HAI").score === 1 && score(gen, "HAI").names === false, score(gen, "HAI"));

  const usa = "country = { factor = 0 modifier = { add = 10 tag = USA } modifier = { add = 10 original_tag = USA } }"; // usa.txt
  rec("usa.txt's two modifiers add up to 20", score(usa, "USA").score === 20, score(usa, "USA"));

  const raj = 'country = { factor = 0 modifier = { add = 10 tag = RAJ has_dlc = "Together for Victory" NOT = { has_dlc = "Graveyard of Empires" } } }'; // india.txt
  rec("india.txt's no-DLC fallback is not counted (every DLC assumed owned)", score(raj, "RAJ").score === 0 && !score(raj, "RAJ").names, score(raj, "RAJ"));
  const rajGoe = 'country = { factor = 0 modifier = { add = 10 tag = RAJ has_dlc = "Graveyard of Empires" } }'; // india_goe.txt
  rec("india_goe.txt's rule counts, and says which DLC it needs",
    score(rajGoe, "RAJ").score === 10 && JSON.stringify(score(rajGoe, "RAJ").dlc) === '["Graveyard of Empires"]', score(rajGoe, "RAJ"));

  const sea = 'country = { base = 0 modifier = { add = 15 OR = { tag = YUN tag = SIK } has_dlc = "No Compromise, No Surrender" } }'; // china_warlord_sea.txt
  rec("china_warlord_sea.txt's `base = 0` is a base: 0 for a country it does not name", score(sea, "HAI").score === 0, score(sea, "HAI"));
  rec("…and 15 for one its OR list names", score(sea, "SIK").score === 15 && score(sea, "SIK").names, score(sea, "SIK"));

  const nor = "country = { factor = 0 modifier = { add = 10 NOR_AAT = yes } }"; // norway.txt — NOR_AAT is a scripted trigger
  rec("norway.txt's scripted-trigger rule counts for the tree's own prefix (NOR)", score(nor, "NOR", "NOR").score === 10 && score(nor, "NOR", "NOR").names, score(nor, "NOR", "NOR"));
  rec("…and for nobody else", score(nor, "SWE", "NOR").score === 0, score(nor, "SWE", "NOR"));

  const eth = 'country = { factor = 0 modifier = { add = 10 original_tag = ETH has_dlc = "By Blood Alone" NOT = { any_other_country = { original_tag = ETH has_government = ROOT } } } }'; // ethiopia.txt
  rec("ethiopia.txt's NOT around another country's check does not hide ETH", score(eth, "ETH").score === 10 && score(eth, "ETH").names, score(eth, "ETH"));

  const notGer = "country = { factor = 0 modifier = { add = 10 NOT = { tag = GER } } }";
  rec("a NOT = { tag = GER } names GER only to exclude it — even with GER as the focus-id prefix", score(notGer, "GER", "GER").score === 0 && !score(notGer, "GER", "GER").names, score(notGer, "GER", "GER"));
}

// ── 2. The base game as a corpus ─────────────────────────────────────────────────────────────────────────────────
console.log("2. the installed base game");
const REAL_GAME = (() => {
  for (const c of ["D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV"]) {
    if (fs.existsSync(path.join(c, "common", "national_focus"))) return c;
  }
  return "";
})();

// ── 3. The endpoint, on a layered fixture ───────────────────────────────────────────────────────────────────────
const TREE = (id, rule, def) => `focus_tree = {\n\tid = ${id}\n\tcountry = ${rule}\n\tdefault = ${def ? "yes" : "no"}\n\tfocus = {\n\t\tid = ${id}_first\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n`;
lib.write(world.GAME, {
  "common/national_focus/generic.txt": TREE("generic_focus", "{ factor = 1 }", true),
  "common/national_focus/germany.txt": TREE("german_focus", "{ factor = 0 modifier = { add = 10 tag = GER } }", false),
  "common/national_focus/italy.txt": TREE("italian_focus", "{ factor = 0 modifier = { add = 10 OR = { tag = ITA tag = RSI } } }", false),
});
// A mod that re-ships germany.txt at the same path with a WEAKER rule: under a merge the base game's (10) would win.
const REPLACER = world.mod("Replacer", {
  "common/national_focus/germany.txt": TREE("modded_german_focus", "{ factor = 0 modifier = { add = 5 tag = GER } }", false),
});
// Millennium Dawn's pattern: generic.txt re-shipped (replacing the base game's) as a factor-2 shared tree, and the
// one default parked on a dummy that scores 0.
const BASE = world.mod("Base Mod", {
  "common/national_focus/generic.txt": TREE("generic_focus", "{ factor = 2 }", false),
  "common/national_focus/generic_dummy.txt": TREE("dummy_generic_focus", "{ factor = 0 }", true),
});
const ADDON = world.mod("Addon", {}, ["Base Mod"]);
// A total conversion of the focus folder: one tree for its own country, no default.
const TC = world.mod("Total", {
  "common/national_focus/abc.txt": TREE("abc_focus", "{ factor = 0 modifier = { add = 10 tag = ABC } }", false),
}, []);
fs.appendFileSync(path.join(TC, "descriptor.mod"), 'replace_path="common/national_focus"\n');
// A country history that loads a tree at the start — and a dated load_focus_tree, which is not the start of the game.
const LOADER = world.mod("Loader", {
  "common/national_focus/haiti.txt": TREE("haiti_focus", "{ factor = 0 }", false),
  "common/national_focus/other.txt": TREE("other_focus", "{ factor = 0 }", false),
  "history/countries/HAI - Haiti.txt": "capital = 1\nload_focus_tree = { tree = haiti_focus keep_completed = no }\n",
  "history/countries/CUB - Cuba.txt": "capital = 1\n1939.1.1 = {\n\tload_focus_tree = other_focus\n}\n",
});

(async () => {
  if (REAL_GAME) {
    const envBefore = process.env.HOI4_ROOT;
    // Derive the countries the base game writes a tree for: every tag a tree's rule names outside a NOT, plus the
    // focus-id prefix of a rule that names none (how norway.txt is labelled in the tree list).
    const dir = path.join(REAL_GAME, "common", "national_focus");
    const written = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
      for (const t of extractFocusTreeCountries(fs.readFileSync(path.join(dir, f), "utf8"))) {
        if (t.isDefault) continue;
        const cb = String(t.countryBlock || "").replace(/\bNOT\s*=\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, " ");
        const named = [...cb.matchAll(/\b(?:original_)?tag\s*=\s*([A-Z][A-Z0-9]{2})\b/g)].map((m) => m[1]);
        if (named.length) named.forEach((x) => written.add(x));
        else if (t.tag && /^[A-Z][A-Z0-9]{2}$/.test(t.tag)) written.add(t.tag);
      }
    }
    process.env.HOI4_ROOT = REAL_GAME;
    const srv = await lib.startServer(createApp);
    const ask = (tag) => fetch(`${srv.base}/api/focus/tree-for-country?tag=${tag}&modPath=${encodeURIComponent(REAL_GAME)}`).then((r) => r.json());
    const notOwn = [];
    for (const tag of [...written].sort()) {
      const r = await ask(tag);
      if (r.kind !== "own") notOwn.push(`${tag}:${r.kind}`);
    }
    rec(`every one of the ${written.size} countries a base-game tree is written for is told "own"`, written.size > 50 && notOwn.length === 0, { size: written.size, notOwn });
    const hai = await ask("HAI");
    rec('a country no base-game tree is written for (HAI) is told "generic", on generic_focus', hai.kind === "generic" && hai.tree && hai.tree.treeId === "generic_focus", hai);
    rec('…from the "base game", when the workspace is the base game itself', hai.tree && hai.tree.sourceName === "base game", hai.tree);
    srv.close();
    process.env.HOI4_ROOT = envBefore;
  } else {
    console.log("  SKIP section 2: no installed base game found — its checks did not run");
  }

  console.log("3. the endpoint, on a layered fixture");
  const srv = await lib.startServer(createApp);
  const ask = (mod, tag) => fetch(`${srv.base}/api/focus/tree-for-country?tag=${tag}&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

  let r = await ask(ADDON, "GER");
  rec("an add-on inherits the base game's German tree: own, german_focus, from the base game",
    r.kind === "own" && r.tree && r.tree.treeId === "german_focus" && r.tree.sourceName === "base game" && r.tree.inMod === false, r);
  r = await ask(ADDON, "HAI");
  rec("under the base mod's factor-2 generic.txt, HAI gets the SHARED tree, named for the mod that ships it",
    r.kind === "shared" && r.tree && r.tree.treeId === "generic_focus" && r.tree.sourceName === "Base Mod" && r.tree.score === 2, r);
  rec("…the base game's generic.txt, replaced at the same path, is not what it is told", r.tree && !r.tree.file.startsWith(world.GAME), r.tree);

  r = await ask(REPLACER, "GER");
  rec("a mod's germany.txt replaces the base game's at the same path: GER gets the mod's tree, even at a lower score",
    r.kind === "own" && r.tree && r.tree.treeId === "modded_german_focus" && r.tree.inMod === true && r.tree.sourceName === "your mod" && r.tree.score === 5, r);
  r = await ask(REPLACER, "RSI");
  rec("RSI, named in italy.txt's OR list, has a tree of its own", r.kind === "own" && r.tree && r.tree.treeId === "italian_focus", r);
  r = await ask(REPLACER, "HAI");
  rec("HAI, named by nothing, is told generic", r.kind === "generic" && r.tree && r.tree.treeId === "generic_focus" && r.tree.isDefault === true, r);

  r = await ask(TC, "GER");
  rec("replace_path on the focus folder: the base game's German tree is gone, and GER has nothing", r.kind === "none" && r.tree === null, r);
  r = await ask(TC, "ABC");
  rec("…while the conversion's own country has its own", r.kind === "own" && r.tree && r.tree.treeId === "abc_focus", r);

  r = await ask(LOADER, "HAI");
  rec("a history's start-of-game load_focus_tree picks the tree, though its rule scores 0", r.kind === "loaded" && r.tree && r.tree.treeId === "haiti_focus", r);
  r = await ask(LOADER, "CUB");
  rec("…and one inside a dated block is not the start of the game", r.kind === "generic", r);

  r = await ask(world.GAME, "GER");
  rec("with the base game as the workspace, its file is labelled \"base game\", not \"your mod\"", r.tree && r.tree.sourceName === "base game", r.tree);

  const bad = await fetch(`${srv.base}/api/focus/tree-for-country?modPath=${encodeURIComponent(ADDON)}`);
  rec("no tag is a 400 that says so", bad.status === 400 && /tag/i.test(((await bad.json()) || {}).error || ""), bad.status);

  srv.close();
  world.cleanup();
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  // exitCode, not process.exit: a forced exit while a handle is closing aborts with UV_HANDLE_CLOSING on Windows
  // (test-idea-extra-script.js), and a crash after every check passed still reads as a failed file.
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})().catch((e) => { console.error(e); world.cleanup(); process.exitCode = 1; });
