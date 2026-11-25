// test-map-vanilla-write.js
// The Map Editor must honor Settings → "Allow editing vanilla game files". The server-level guard
// already did, but map-data.js's OWN writers had an independent "Refusing to write to the game
// directory." guard (modRoot === gameRoot) that ignored the toggle — so the map editor stayed blocked
// even with vanilla editing on. This locks in setAllowGameRootWrites(): OFF refuses, ON lets the write
// proceed (it then fails only because the temp "game root" has no states — i.e. it got PAST the guard).
//
// Uses a temp dir as BOTH modRoot and gameRoot (samePath = true) so it never touches a real install.
// Run: node test-map-vanilla-write.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const refusesGameDir = (r) => /refusing to write to the game directory/i.test((r && r.error) || "");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanwrite-"));
try {
  const args = { modRoot: root, gameRoot: root, dependencyRoots: [] }; // modRoot === gameRoot → "vanilla"

  console.log("\nMap writers honor the allow-vanilla toggle:");

  // Default = OFF: every writer refuses the game directory.
  md.setAllowGameRootWrites(false);
  ok(refusesGameDir(md.writeStateFields({ ...args, stateId: 1, fields: { manpower: 5 } })), "OFF: set-state refuses");
  ok(refusesGameDir(md.writeStateOwner({ ...args, stateId: 1, newOwner: "GER" })), "OFF: set-owner refuses");
  ok(refusesGameDir(md.createState({ ...args, name: "X", owner: "GER" })), "OFF: create-state refuses");
  ok(refusesGameDir(md.deleteState({ modRoot: root, gameRoot: root, stateId: 1 })), "OFF: delete-state refuses");

  // ON: the game-directory guard is bypassed — writers proceed (and only fail later for the missing
  // state in this empty temp root), i.e. they got PAST the refusal.
  md.setAllowGameRootWrites(true);
  const a = md.writeStateFields({ ...args, stateId: 999999, fields: { manpower: 5 } });
  ok(!refusesGameDir(a), "ON: set-state no longer refuses the game directory", a);
  const b = md.writeStateOwner({ ...args, stateId: 999999, newOwner: "GER" });
  ok(!refusesGameDir(b), "ON: set-owner no longer refuses the game directory", b);
  const c = md.deleteState({ modRoot: root, gameRoot: root, stateId: 999999 });
  ok(!refusesGameDir(c), "ON: delete-state no longer refuses the game directory", c);

  // Back to safe default for any later code in the same process.
  md.setAllowGameRootWrites(false);
  ok(refusesGameDir(md.writeStateFields({ ...args, stateId: 1, fields: { manpower: 5 } })), "reset to OFF: refuses again");

  // Cache freshness: when the active mod IS the game root (vanilla editing), buildMapModel must read
  // the game root FRESH (not the cached "stable" layer), or the editor would show pre-edit data after
  // every save. Write a state, build, edit it, build again — the second build must see the change.
  md.setAllowGameRootWrites(true);
  fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
  const sf = path.join(root, "history", "states", "1-Test.txt");
  fs.writeFileSync(sf, 'state = { id = 1 name = "T" manpower = 100 provinces = { 5 } history = { owner = GER } }\n');
  const m1 = md.buildMapModel({ modRoot: root, gameRoot: root, dependencyRoots: [], cacheStableLayers: true });
  ok(((m1.states.find((s) => s.id === 1) || {}).manpower) === 100, "vanilla model sees the state");
  fs.writeFileSync(sf, 'state = { id = 1 name = "T" manpower = 999 provinces = { 5 } history = { owner = GER } }\n');
  const m2 = md.buildMapModel({ modRoot: root, gameRoot: root, dependencyRoots: [], cacheStableLayers: true });
  ok(((m2.states.find((s) => s.id === 1) || {}).manpower) === 999, "re-build reflects the edit (no stale game-root cache)");
  md.setAllowGameRootWrites(false);

  console.log("\n  " + pass + " passed, " + fail + " failed");
} catch (e) {
  console.error(e); fail++;
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = fail ? 1 : 0;
}
