// #loc-map-follows-the-active-mod-not-the-open-tree — EVERY FOCUS SHOWED ITS RAW ID.
//
// Reported from the field: "all the focuses names are their id instead of their localization name".
//
// THE SEQUENCE THAT DID IT:
//   1. The page loads and fetches /api/localization before any tree is open. It sent no modPath, so the
//      server answered for ITS active mod — whatever active-mod.json last recorded, which on the reporting
//      machine was a leftover `e2e_test_mod` with no dependencies. That map is vanilla-only.
//   2. The client cached that map under `localStorage.activeModPath` — the mod the user is really working
//      in. The wrong map, filed under the right name.
//   3. loadFile then opened a tree from that mod and called fetchLocalizationMap again. The guard saw a
//      matching key and a non-empty map, returned early, and never refetched.
//
// So the vanilla-only map stuck. None of the mod's (or its base mod's) focus ids were in it,
// applyLocalization fell back to `focus.id`, and every node on the canvas was labelled with its raw id.
//
// THE RULE: ask for a specific root, and key the cache on the SAME root. A key that can disagree with what
// was actually requested is what turned a one-off wrong answer into a sticky one.
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

const LINES = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8")).split(/\r?\n/);
// ⚠️ Lift by the top-level terminator, not by counting braces — this file is full of regex literals and
// template strings whose braces do not balance.
function lift(name) {
  const at = LINES.findIndex((l) => l.startsWith(`async function ${name}(`) || l.startsWith(`function ${name}(`));
  if (at === -1) return null;
  const end = LINES.findIndex((l, i) => i > at && l === "}");
  return end === -1 ? null : LINES.slice(at, end + 1).join("\n");
}
// …and the one-liners. The terminator trick above would run past a `function f(x) { return y; }` all the way
// to the next standalone `}`, swallowing whatever function came after it.
function liftOneLine(name) {
  const l = LINES.find((x) => x.startsWith(`function ${name}(`) && x.trimEnd().endsWith("}"));
  return l || null;
}

console.log("\n[the real function] lifted out of app.js");
const src = lift("fetchLocalizationMap");
rec("fetchLocalizationMap was found", !!src, "not found");
// The rule about WHICH mod to name now lives in editorRequestModRoot, shared with the state and country
// catalogues (#editor-requests-do-not-name-the-mod). Lift the real ones so this still tests shipped logic
// rather than a stub that agrees with it.
for (const n of ["editorRequestModRoot"]) rec(`${n} was found`, !!lift(n), "not found");
for (const n of ["editorRequestModKey", "editorModPathQuery"]) rec(`${n} was found`, !!liftOneLine(n), "not found");

// Build a harness that supplies exactly the globals the function closes over, so the logic under test is
// the shipped logic and nothing else.
function makeHarness(serverMaps, serverActiveMod) {
  const calls = [];
  const deps = {
    // Stand-in for the server: answers for the modPath asked for, or for its own active mod when asked
    // for nothing — which is precisely the behaviour that caused the bug.
    fetch: async (url) => {
      calls.push(url);
      const m = /\?modPath=(.*)$/.exec(url);
      const root = m ? decodeURIComponent(m[1]) : serverActiveMod;
      const names = serverMaps[root] || {};
      return { ok: true, __body: { names, descriptions: {} } };
    },
    parseJsonSafe: async (r) => r.__body,
    inferModRootFromFocusPath: (p) => (p ? String(p).split("/common/")[0] : ""),
    // The REAL guard, lifted from app.js, so the vanilla case below tests shipped logic rather than a
    // restatement of it.
    isLoadedFocusUnderVanillaGameInstall: new Function(
      `let hoi4GameRootPath = ""; ${lift("isLoadedFocusUnderVanillaGameInstall")}; return isLoadedFocusUnderVanillaGameInstall;`)(),
    store: {},
  };
  const factory = new Function("deps", `
    let localizationMap = {};
    let localizationDescMap = {};
    let _locMapModKey = "";
    let loadedPath = "";
    const fetch = deps.fetch;
    const parseJsonSafe = deps.parseJsonSafe;
    const inferModRootFromFocusPath = deps.inferModRootFromFocusPath;
    const isLoadedFocusUnderVanillaGameInstall = deps.isLoadedFocusUnderVanillaGameInstall;
    const localStorage = {
      getItem: (k) => (k in deps.store ? deps.store[k] : null),
      setItem: (k, v) => { deps.store[k] = String(v); },
    };
    ${lift("editorRequestModRoot")}
    ${liftOneLine("editorRequestModKey")}
    ${liftOneLine("editorModPathQuery")}
    ${src}
    return {
      call: async (opts) => { loadedPath = (opts && opts.loadedPath) || ""; return fetchLocalizationMap(opts && opts.force); },
      state: () => ({ size: Object.keys(localizationMap).length, key: _locMapModKey }),
    };
  `);
  return { api: factory(deps), calls, store: deps.store };
}

const WORK = "C:/mods/workmod";
const STALE = "C:/mods/e2e_test_mod";
const TREE = `${WORK}/common/national_focus/EGY_focus_copy.txt`;
// The server's maps: the stale test mod knows nothing; the real mod knows its focuses (via its base mod).
const MAPS = {
  [STALE]: { some_vanilla_key: "Vanilla Thing" },
  [WORK]: { some_vanilla_key: "Vanilla Thing", EGY_politics: "Egyptian Politics", EGY_reform: "Constitutional Reform" },
};

(async () => {

console.log("\n[THE BUG] page init poisons the cache, and the load never corrects it");
if (src) {
  const h = makeHarness(MAPS, STALE);
  h.store.activeModPath = WORK;          // the client believes it is working in workmod…
  await h.api.call({});                  // …but page init runs with no tree open
  const afterInit = h.api.state();
  await h.api.call({ loadedPath: TREE });// then the tree is opened
  const afterLoad = h.api.state();

  rec("page init asks for a specific mod, not 'whatever you think'",
    /\?modPath=/.test(h.calls[0] || ""), h.calls[0]);
  rec("…and the key it files the result under matches that request",
    afterInit.key === WORK, { key: afterInit.key, want: WORK });
  // The load-bearing assertion: the map must contain the mod's focus names, not the stale mod's.
  rec("the focus names are in the map after loading the tree", afterLoad.size === 3, afterLoad);
  rec("…and the key still describes the tree's mod", afterLoad.key === WORK, afterLoad.key);
}

console.log("\n[CONTROL] the cache still works — no refetch when nothing changed");
if (src) {
  const h = makeHarness(MAPS, STALE);
  h.store.activeModPath = WORK;
  await h.api.call({ loadedPath: TREE });
  await h.api.call({ loadedPath: TREE });
  await h.api.call({ loadedPath: TREE });
  // ⚠️ This is why the guard exists at all: the map is 25-50 MB on a big mod. A fix that simply always
  // refetched would pass every assertion above and make the editor unusable.
  rec("three loads of the same tree fetch once", h.calls.length === 1, h.calls);
  rec("…and force=true still refetches", await (async () => {
    await h.api.call({ loadedPath: TREE, force: true });
    return h.calls.length === 2;
  })(), h.calls);
}

console.log("\n[CONTROL] switching to a tree in ANOTHER mod refetches");
if (src) {
  const OTHER = "C:/mods/othermod";
  const maps = { ...MAPS, [OTHER]: { other_focus: "Other Name" } };
  const h = makeHarness(maps, STALE);
  h.store.activeModPath = WORK;
  await h.api.call({ loadedPath: TREE });
  const a = h.api.state();
  await h.api.call({ loadedPath: `${OTHER}/common/national_focus/t.txt` });
  const b = h.api.state();
  rec("the first tree's mod is fetched", a.key === WORK && a.size === 3, a);
  rec("switching mods refetches rather than reusing", h.calls.length === 2, h.calls);
  rec("…and the map is now the other mod's", b.key === OTHER && b.size === 1, b);
}

console.log("\n[CONTROL] a VANILLA tree must not cost you your mod's localisation");
if (src) {
  // inferModRootFromFocusPath strips at common/national_focus with no game-root exclusion, so for a tree
  // opened out of the HOI4 install it returns the install itself. Asking for THAT root is not harmful, it
  // is just wrong: the map comes back vanilla-only and every key the user's own mod defines disappears.
  // Studying a vanilla tree is an ordinary thing to do, so it falls through to the active mod instead —
  // which still contains vanilla's keys, so the vanilla tree's own focus names resolve either way.
  const VANILLA_TREE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/germany.txt";
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const maps = { ...MAPS, [GAME]: { some_vanilla_key: "Vanilla Thing" } };
  const h = makeHarness(maps, STALE);
  h.store.activeModPath = WORK;
  await h.api.call({ loadedPath: VANILLA_TREE });
  const s = h.api.state();
  rec("the request names the user's mod, not the game install",
    /modPath=/.test(h.calls[0] || "") && !/Hearts%20of%20Iron/.test(h.calls[0] || ""), h.calls[0]);
  rec("…so the mod's own keys are still there", s.size === 3, s);
  rec("…and the key is the mod, not the install", s.key === WORK, s.key);
}

console.log("\n[CONTROL] with no mod known at all, the key says so");
if (src) {
  // Nothing in activeModPath and no tree open: we cannot name a root, so the server picks. The key must
  // then be a sentinel that cannot collide with a real path — otherwise the next load reuses this map.
  const h = makeHarness(MAPS, STALE);
  await h.api.call({});
  const s = h.api.state();
  rec("no modPath is sent when no root is known", !/\?modPath=/.test(h.calls[0] || ""), h.calls[0]);
  rec("…and the key is a sentinel, not a mod path", s.key === "(server-active-mod)", s.key);
  await h.api.call({ loadedPath: TREE });
  rec("…so opening a tree afterwards DOES refetch", h.calls.length === 2, h.calls);
  rec("…and picks up the real names", h.api.state().size === 3, h.api.state());
}

console.log("\n[the other half] the e2e tests must put the user's active mod back");
{
  // How the reporter ended up in the broken state at all: e2e-workflow-test / e2e-research-test create a
  // throwaway mod through the app's real create-mod flow, which makes the SERVER persist it in
  // active-mod.json — and nothing restored the previous value. The app then opened pointing at
  // `e2e_test_mod`, a mod with no dependencies.
  //
  // ⚠️ This guard lives in a test-*.js on purpose. run-tests.js runs test-*.js ONLY; a rule policed by the
  // e2e files themselves would never run on an ordinary change and would quietly decay.
  for (const f of ["e2e-workflow-test.js", "e2e-research-test.js"]) {
    let src = "";
    try { src = fs.readFileSync(path.join(__dirname, f), "utf8"); } catch (_) { src = ""; }
    rec(`${f} snapshots the active mod`, /__activeModBefore/.test(src), "no snapshot");
    rec(`${f} restores it on exit`, /process\.on\('exit', restoreActiveMod\)/.test(src), "no restore on exit");
  }
}

console.log(`\n=== loc map follows the open tree: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }

})();
