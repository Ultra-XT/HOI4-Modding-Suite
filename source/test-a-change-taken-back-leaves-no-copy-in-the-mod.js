// ⛔ #a-change-taken-back-leaves-no-copy — A PUT-BACK INTO A COPY THE SAME CLICK OR SAVE MADE LEAVES NO COPY IN THE MOD (final round, L2).
//
// THE CLASS. A state the mod does not have is copied in whole by its first write (editStateBlock answers `created`). When a later write gives
// that copy its old text back, the mod is left holding the base game's file byte for byte: a copy that pins the state against every later
// change of the layer below (1.20 changed 17 state files), which the modder never asked for and was told nothing about. final-data's item 2
// (#a-refused-move-leaves-no-copy, takeBackAStateCopyNobodyChanged) took such a copy back out of the mod for a refused paint or Move. Two
// more put-backs had the same shape:
//   * 🔧 Auto-fix all's fixNavalBuildingsWithoutCoast writes the receiver of a coastless state's dockyards first; when the giver cannot be
//     cut (its file read-only, or held open), the receiver is put back (#a-carry-that-cannot-finish-gives-nothing) — into the copy;
//   * a state painted away and back in ONE Save (tool campaign B2-16, left by final-page): the first set-owner copies the base file in, the
//     second gives it its owner back, and the Save ended with a copy nobody changed (the same through the state panel's Owner, set-state).
// THE FIX, as item 2's: a copy the click (or the Save, whose requests are one save run: safe-write.js saveRunCreated) created, and whose
// bytes are again the file of that name beneath the mod, is MOVED out of the mod into Nova's per-mod store, never deleted. A copy the mod
// already had stays; a copy that still holds a change stays.
// (createState's navalUncut put-back, named beside these, is refuted: it rewrites only the new state's own file, and a source whose cut
// fails left no copy, since editStateBlock's one write of it is the write that failed.)
//
// Driven through the endpoints with what the page sends (public/map.js queueWrite's bodies, flushMapSaves' Object.assign({}, w.body,
// { modPath }) and its X-Nova-Map-Save header; POST /api/map/auto-fix { modPath }), on testlib-two-layer-map.js's small game:
// state 1 = { 4 } (inland), 2 = { 2 5 }, 3 = { 3 } (coast), all owned by AAA in the base game.
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("change-taken-back");
const { createApp } = require("./server.js");
const HOME = process.env.NOVA_HOME_DIR;
const gameState = (f) => path.join(world.GAME, "history", "states", f);
const modState = (mod, f) => path.join(mod, "history", "states", f);
const bytesOf = (p) => { try { return fs.readFileSync(p); } catch (_) { return null; } };
const same = (a, b) => !!a && !!b && Buffer.compare(a, b) === 0;
/** every file under Nova's per-mod stores (~/.nova), by its path there */
const storeFiles = () => Object.keys(lib.tree(path.join(HOME, ".nova")));
const readOnly = (p) => { fs.chmodSync(p, 0o444); return () => fs.chmodSync(p, 0o666); };

(async () => {
  let srv = null;
  try {
    console.log("0. What the page sends");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("a paint: queueWrite('/api/map/set-owner', { stateId: sid, owner: tag }, …)", /queueWrite\("\/api\/map\/set-owner", \{ stateId: sid, owner: tag \}/.test(MAP));
      rec("the state panel's Owner: queueWrite('/api/map/set-state', { stateId: sid, nameKey, fields })", /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MAP));
      rec("…posted by flushMapSaves as Object.assign({}, w.body, { modPath: modPath() }), with the Save's X-Nova-Map-Save header",
        /const body = Object\.assign\(\{\}, w\.body, \{ modPath: modPath\(\) \}\)/.test(MAP) && /const saveHeaders = \{ "Content-Type": "application\/json", "X-Nova-Map-Save": saveRunId \}/.test(MAP));
      rec("…one id for every write of a Save", /const saveRunId = \(model && model\.saveRunId\) \|\| /.test(MAP));
      rec("Auto-fix all: POST /api/map/auto-fix { modPath: modPath() }", /fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/.test(MAP));
    }

    srv = await lib.startServer(createApp);
    let n = 0;
    const newSave = () => `takenback${++n}${Date.now().toString(36)}`;
    const send = (save, ep, body, mod) => fetch(`${srv.base}${ep}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": save },
      body: JSON.stringify(Object.assign({}, body, { modPath: mod })),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const paint = (save, mod, stateId, owner) => send(save, "/api/map/set-owner", { stateId, owner }, mod);
    const panel = (save, mod, stateId, fields) => send(save, "/api/map/set-state", { stateId, nameKey: `STATE_${stateId}`, fields }, mod);
    const base3 = bytesOf(gameState("3-C.txt")), base2 = bytesOf(gameState("2-B.txt"));

    console.log("\n1. ⭐⭐⭐ State 3 painted away and back in ONE Save (B2-16)");
    {
      const mod = world.mod("paint away and back", {});
      const t0 = lib.tree(mod), store0 = storeFiles();
      const save = newSave();
      const a = await paint(save, mod, 3, "BBB");
      rec("(the first paint copies the base game's 3-C.txt into the mod, owner BBB)", a.status === 200 && a.body.ok && /owner = BBB/.test(String(bytesOf(modState(mod, "3-C.txt")) || "")), a);
      const b = await paint(save, mod, 3, "AAA");
      rec("(the second paint is answered ok)", b.status === 200 && b.body.ok, b);
      rec("⭐⭐⭐ the mod keeps no copy of the base game's 3-C.txt", !fs.existsSync(modState(mod, "3-C.txt")), Object.keys(lib.tree(mod)));
      rec("⭐⭐⭐ …nor anything else: the mod is byte for byte as it was", JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", lib.written(t0, lib.tree(mod)));
      const moved = storeFiles().filter((k) => !store0.includes(k) && /\/history\/states\/3-C\.txt$/.test(k));
      rec("⭐⭐ the copy was MOVED into Nova's store for the mod, not deleted, and it is the base game's file, byte for byte",
        moved.length === 1 && same(bytesOf(path.join(HOME, ".nova", moved[0])), base3), moved);
    }

    console.log("\n2. ⭐⭐ The same through the state panel's Owner (set-state), either way round");
    for (const [label, away, back] of [["painted away, given back with the panel", (s, m) => paint(s, m, 3, "BBB"), (s, m) => panel(s, m, 3, { owner: "AAA" })],
      ["given away with the panel, painted back", (s, m) => panel(s, m, 3, { owner: "BBB" }), (s, m) => paint(s, m, 3, "AAA")]]) {
      const mod = world.mod(label, {});
      const t0 = lib.tree(mod);
      const save = newSave();
      const a = await away(save, mod), b = await back(save, mod);
      rec(`⭐⭐ ${label}: both answered ok, and the mod is byte for byte as it was`, a.body.ok && b.body.ok && JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", [a.body, b.body, lib.written(t0, lib.tree(mod))]);
    }

    console.log("\n3. THE CONTROLS: a copy the mod already had stays, and so does one that still holds a change");
    {
      const mod = world.mod("had its own copy", { "history/states/3-C.txt": base3.toString("utf8") });
      const save = newSave();
      await paint(save, mod, 3, "BBB"); await paint(save, mod, 3, "AAA");
      rec("⭐⭐ a copy the mod had before the Save stays, though it is the base game's bytes again", same(bytesOf(modState(mod, "3-C.txt")), base3), Object.keys(lib.tree(mod)));
    }
    {
      const mod = world.mod("two saves", {});
      await paint(newSave(), mod, 3, "BBB");
      await paint(newSave(), mod, 3, "AAA");
      rec("⭐ painted away in one Save and back in the next: the copy the first Save made is the mod's by then, and stays", same(bytesOf(modState(mod, "3-C.txt")), base3), Object.keys(lib.tree(mod)));
    }
    {
      const mod = world.mod("away only", {});
      await paint(newSave(), mod, 3, "BBB");
      rec("a paint away only: the copy stays, owner BBB", /owner = BBB/.test(String(bytesOf(modState(mod, "3-C.txt")) || "")));
    }
    {
      const mod = world.mod("away and back with a change", {});
      const save = newSave();
      await paint(save, mod, 3, "BBB"); await panel(save, mod, 3, { manpower: 1234 }); await paint(save, mod, 3, "AAA");
      const t = String(bytesOf(modState(mod, "3-C.txt")) || "");
      rec("away, a manpower change, and back: the copy stays, with the change", /manpower = 1234/.test(t) && /owner = AAA/.test(t), t);
    }
    {
      // without a Save's id there is no save run to ask, so nothing is taken back: as before
      const mod = world.mod("no save id", {});
      await srv.post("/api/map/set-owner", { stateId: 3, owner: "BBB" }, mod);
      await srv.post("/api/map/set-owner", { stateId: 3, owner: "AAA" }, mod);
      rec("(two writes outside any Save: nothing is taken back)", same(bytesOf(modState(mod, "3-C.txt")), base3));
    }

    console.log("\n4. ⭐⭐⭐ Auto-fix all: a dockyard the mod's own coastless state holds, whose cut is refused, leaves no copy of its receiver");
    {
      // the mod ships 1-A.txt = { 4 } (inland) with a dockyard: Auto-fix carries it to AAA's nearest coast, state 2 (base; 4 touches 2, 3 and 5, and a tie goes to the lower id), written first
      const own1 = lib.st(1, "4", { history: "\t\tbuildings = {\n\t\t\tdockyard = 2\n\t\t}\n" });
      {
        const mod = world.mod("naval free", { "history/states/1-A.txt": own1 });
        const r = await srv.autoFix(mod);
        const nn = (r.body && r.body.fixes && r.body.fixes.navalNoCoast) || {};
        rec("THE CONTROL: with 1-A.txt free, Auto-fix carries the dockyard to state 2 (copied in, as it must be)",
          (nn.carried || []).some((c) => +c.from === 1 && +c.to === 2) && /dockyard = 2/.test(String(bytesOf(modState(mod, "2-B.txt")) || "")), nn);
      }
      const mod = world.mod("naval refused", { "history/states/1-A.txt": own1 });
      const t0 = lib.tree(mod), store0 = storeFiles();
      const free = readOnly(modState(mod, "1-A.txt"));
      let r;
      try { r = await srv.autoFix(mod); } finally { free(); }
      const nn = (r.body && r.body.fixes && r.body.fixes.navalNoCoast) || {};
      rec("(the click says it could not write 1-A.txt, and carries nothing)", (nn.failed || []).some((f) => +f.stateId === 1) && !(nn.carried || []).length, nn);
      rec("⭐⭐⭐ the mod keeps no copy of the base game's 2-B.txt", !fs.existsSync(modState(mod, "2-B.txt")), Object.keys(lib.tree(mod)));
      const statesWritten = lib.written(t0, lib.tree(mod)).filter((k) => /^history\/states\//.test(k));
      rec("⭐⭐ …and its history/states is byte for byte as it was", JSON.stringify(statesWritten) === "[]", statesWritten);
      const moved = storeFiles().filter((k) => !store0.includes(k) && /\/history\/states\/2-B\.txt$/.test(k));
      rec("⭐⭐ the copy was MOVED into Nova's store, the base game's bytes", moved.length === 1 && same(bytesOf(path.join(HOME, ".nova", moved[0])), base2), moved);
      rec("(…and no failure says the dockyard is in both states)", !(nn.failed || []).some((f) => /in both/.test(String(f.reason || ""))), nn.failed);
    }
    {
      // the receiver the mod already had (byte for byte the base game's) stays
      const mod = world.mod("naval refused, own receiver", { "history/states/1-A.txt": lib.st(1, "4", { history: "\t\tbuildings = {\n\t\t\tdockyard = 2\n\t\t}\n" }), "history/states/2-B.txt": base2.toString("utf8") });
      const free = readOnly(modState(mod, "1-A.txt"));
      try { await srv.autoFix(mod); } finally { free(); }
      rec("⭐ THE CONTROL: a receiver file the mod already had stays", same(bytesOf(modState(mod, "2-B.txt")), base2));
    }

    console.log("\n5. Derived: each put-back asks the one take-back");
    {
      const MD = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      rec("the refused Move's take-back is as item 2 left it", /const back = takeBackAStateCopyNobodyChanged\(\{ modRoot, gameRoot, dependencyRoots \}, to\.file\);/.test(MD));
      rec("fixNavalBuildingsWithoutCoast's put-back asks it of a receiver its own first write created",
        /if \(fine\(r\) && first && first\.created && first\.file\) takeBackAStateCopyNobodyChanged\(\{ modRoot, gameRoot, dependencyRoots \}, first\.file, "copies_taken_back"\);/.test(MD));
      rec("writeStateOwner and writeStateFields ask it of a copy the Save created", (MD.match(/return takeBackACopyThisSaveMade\(\{ modRoot, gameRoot, dependencyRoots \}, /g) || []).length === 2);
      const SW = maskJsComments(fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8"));
      rec("…which asks the save run being handled what it created (safe-write.js saveRunCreated)", /function saveRunCreated\(absPath\) \{/.test(SW) && /saveRunCreated,/.test(SW));
    }
  } catch (e) {
    rec("the test ran to the end", false, (e && e.stack) || String(e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a change taken back leaves no copy in the mod: ${checks - fails.length}/${checks} ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length || checks < 25 ? 1 : 0);
})();
