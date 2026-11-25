// #editor-requests-do-not-name-the-mod — THE FOCUS EDITOR ASKED THE SERVER FOR "WHATEVER MOD YOU FEEL LIKE".
//
// A request that names no modPath is answered for the SERVER's active mod — whatever active-mod.json last
// recorded. The tree on the canvas can easily belong to a different one: you open a tree by path, or from
// another mod, or the active mod was left pointing somewhere else. Nothing errors. The answer is simply about
// the wrong mod, and it looks entirely plausible.
//
// That is what the user reported: every focus on the canvas labelled with its raw id instead of its name
// (#loc-map-follows-the-active-mod-not-the-open-tree). The same two mistakes were still live one screen over,
// in ensureGlobalDataLoaded:
//
//   1. Neither /api/buildings/state-catalog nor /api/countries/catalog carried the mod.
//   2. The guard was `if (cachedStates.length > 0 && cachedCountries.length > 0) return` — no mod key — so
//      the FIRST mod asked was the only mod ever asked, for the life of the page.
//
// Both catalogues feed resolveStateName/resolveCountryName, the labels on every focus effect that touches a
// state or a country. Measured through the real endpoints: 439 countries for vanilla against 561/647/745 for
// three installed mods, and 1,081 states against 1,371/1,154/1,524. So the wrong catalogue is not a near miss
// — hundreds of the current mod's states and countries are simply absent, and their effects fall back to a
// bare "State 42".
//
// And the tree-owner competition hint had the same bare guard with no reset anywhere in the file
// (#tree-owner-hint-cached-across-mods): open the owner dialog once and every later answer, for the life of
// the page, came from the first mod asked. That hint decides whether the user is told another tree already
// claims this country — HOI4 SCORES every tree whose `country = { … }` matches, so a rival they are not told
// about is one they do not know they must out-weigh.
//
// THE RULE, now in one place: editorRequestModRoot() — prefer the open tree's mod, fall back to the active
// mod, never point at the vanilla install. Key every cache on what was actually asked for.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const SRC = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const CODE = stripJsComments(SRC);

// ── Lift the shipped functions and RUN them, rather than restating their logic here. ───────────────────
function lift(name) {
  let at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return null;
  // ⚠️ Keep a preceding `async`. Slicing from `function` drops it, and the lifted body then fails to parse
  // on its own `await` — a harness that cannot run the real code measures nothing.
  if (CODE.slice(Math.max(0, at - 6), at) === "async ") at -= 6;
  // Balance braces from the first { after the signature.
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") d++;
    else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return null;
}

const NEEDED = ["inferModRootFromFocusPath", "isLoadedFocusUnderVanillaGameInstall",
  "editorRequestModRoot", "editorRequestModKey", "editorModPathQuery", "ensureGlobalDataLoaded"];
console.log("\n[the helper exists and is shared]");
const bodies = {};
for (const n of NEEDED) {
  bodies[n] = lift(n);
  rec(`${n} is liftable`, !!bodies[n], "not found in app.js");
}

if (Object.values(bodies).every(Boolean)) {
  // A sandbox with the module state these functions close over, plus recording stubs.
  function makeHarness() {
    const calls = [];
    const store = { activeModPath: "" };
    const harness = new Function("record", "store", `
      let loadedPath = "";
      let hoi4GameRootPath = "";
      let cachedStates = [];
      let cachedCountries = [];
      let _globalDataModKey = null;
      const localStorage = { getItem: (k) => (k in store ? store[k] : null) };
      const dbgInfo = () => {};
      const dbgError = () => {};
      const fetch = (url) => { record(url); return Promise.resolve({
        json: () => Promise.resolve(url.indexOf("state-catalog") !== -1
          ? { items: [{ stateId: 1, displayName: "S" }] }
          : [{ tag: "AAA", name: "A" }]),
      }); };
      ${NEEDED.map((n) => bodies[n]).join("\n")}
      return {
        setTree: (p) => { loadedPath = p; },
        setActive: (p) => { store.activeModPath = p; },
        root: () => editorRequestModRoot(),
        key: () => editorRequestModKey(editorRequestModRoot()),
        load: () => ensureGlobalDataLoaded(),
        counts: () => [cachedStates.length, cachedCountries.length],
      };
    `)((u) => calls.push(u), store);
    return { h: harness, calls };
  }

  console.log("\n[which mod does a request name?]");
  {
    const { h } = makeHarness();
    h.setActive("D:/mods/alpha");
    rec("no tree open → the active mod", h.root() === "D:/mods/alpha", h.root());

    h.setTree("D:/mods/beta/common/national_focus/tree.txt");
    rec("a tree open → the tree's own mod, not the active one", h.root() === "D:/mods/beta", h.root());

    // ⚠️ The vanilla case: inferModRootFromFocusPath has no game-root exclusion, so naming the root it
    // returns would ask for the INSTALL and drop everything the user's own mod defines.
    h.setTree("D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/usa.txt");
    rec("a VANILLA tree → falls back to the active mod", h.root() === "D:/mods/alpha", h.root());
    h.setTree("D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\common\\national_focus\\usa.txt");
    rec("…with backslashes too", h.root() === "D:/mods/alpha", h.root());

    // CONTROL: nothing known at all must NOT key as the empty string, or one mod's answer is stored under
    // another mod's name — the exact sharp edge that made the reported bug permanent.
    h.setTree("");
    h.setActive("");
    rec("nothing known → the server chooses", h.root() === "", h.root());
    rec("…and the key is a sentinel, not \"\"", h.key() === "(server-active-mod)", h.key());
  }

  console.log("\n[THE BUG] the catalogues must name the mod, and must refetch when it changes");
  {
    const { h, calls } = makeHarness();
    h.setActive("D:/mods/alpha");
    return h.load().then(async () => {
      rec("both catalogues were fetched", calls.length === 2, calls);
      rec("…state catalogue names the mod", calls.some((u) => /state-catalog\?modPath=D%3A%2Fmods%2Falpha/.test(u)), calls);
      rec("…country catalogue names the mod", calls.some((u) => /countries\/catalog\?modPath=D%3A%2Fmods%2Falpha/.test(u)), calls);

      // Same mod again: the cache must still work, or this "fix" is just a slower request.
      const before = calls.length;
      await h.load();
      rec("a second load for the SAME mod is cached", calls.length === before, calls.slice(before));

      // THE BUG: a different mod must refetch. The old guard returned early forever.
      h.setTree("D:/mods/beta/common/national_focus/tree.txt");
      await h.load();
      rec("a different mod REFETCHES", calls.length === before + 2, calls.slice(before));
      rec("…for the new mod", calls.slice(before).every((u) => /modPath=D%3A%2Fmods%2Fbeta/.test(u)), calls.slice(before));

      // …and back again, so the key is a real key and not a one-way latch.
      h.setTree("");
      await h.load();
      rec("switching back refetches the first mod", calls.slice(-2).every((u) => /modPath=D%3A%2Fmods%2Falpha/.test(u)), calls.slice(-2));

      finish();
    });
  }
}

function finish() {
  console.log("\n[the rule, in the source] every mod-sensitive request in this page uses it");
  {
    // ⭐ Strip comments first: the fixes' own prose quotes the expressions they removed.
    rec("the localisation map uses the shared helper", /const requestRoot = editorRequestModRoot\(\);/.test(CODE), "kept its own copy");
    rec("…and asks with it", /fetch\(`\/api\/localization\$\{editorModPathQuery\(requestRoot\)\}`\)/.test(CODE), "not using the shared query builder");
    rec("the catalogues use it", /const root = editorRequestModRoot\(\);/.test(CODE), "not adopted");
    rec("…and are keyed", /_globalDataModKey === key/.test(CODE), "guard has no mod key");
    rec("…and record what was asked for", /_globalDataModKey = key;/.test(CODE), "key never stored");
    // The bare guards must be GONE, not merely joined by a keyed one.
    rec("no bare catalogue guard remains",
      !/if \(cachedStates\.length > 0 && cachedCountries\.length > 0\) return;/.test(CODE), "the bare guard is back");
    rec("no bare tree-owner guard remains",
      !/if \(treeOwnerCountryTreesCache\) return treeOwnerCountryTreesCache;/.test(CODE), "the bare guard is back");
    rec("the tree-owner hint is keyed", /treeOwnerCountryTreesModKey === modRoot/.test(CODE), "still unkeyed");
    rec("…and records its mod", /treeOwnerCountryTreesModKey = modRoot;/.test(CODE), "key never stored");
  }

  console.log(`\n=== editor requests name the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
