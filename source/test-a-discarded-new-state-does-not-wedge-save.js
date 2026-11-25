// ⛔ #a-failed-move-still-took-the-province  +  #an-abandoned-new-state-wedges-every-save
//
// Two halves of the same story, found by driving the New state tool.
//
// SERVER. moveProvince removed the province from every source state FIRST and only then looked for the
// target, so a target that does not exist returned {ok:false, changed:false} with the disk already
// rewritten. Measured: POST move-province {provinceId:18, toStateId:-1} answered HTTP 400 while province 18
// vanished from 879-Kargopol.txt and belonged to NO state. Stateless land is one of the things map-data.js
// exists to prevent, and "changed: false" made it invisible — the response and the bytes disagreed.
//
// CLIENT. A new state holds a NEGATIVE provisional id until its create returns a real one. Abandon the
// state — Undo the create, or move its last province out so Auto-fix deletes the emptied state — and the
// writes referencing that id stay in the queue. Save then stops at step 1 with "State -1 not found",
// keeps the rest, and does the same on every later attempt: the editor can never save again.
//
// The two compounded: the wedged save re-sent the doomed move on every attempt, and each attempt took
// another province out of its state.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const roots = [];
const mkMod = () => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wedge-"));
  roots.push(m);
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="wedge"\n', "utf8");
  fs.writeFileSync(path.join(m, "history", "states", "1-Alpha.txt"),
    'state = {\n\tid = 1\n\tname = "A"\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = GER\n\t\tvictory_points = { 1 5 }\n\t\tbuildings = { 1 = { naval_base = 3 } }\n\t}\n}\n', "utf8");
  fs.writeFileSync(path.join(m, "history", "states", "2-Beta.txt"),
    'state = {\n\tid = 2\n\tname = "B"\n\tprovinces = { 3 4 }\n\thistory = { owner = GER }\n}\n', "utf8");
  return m;
};
const stateFile = (m, f) => fs.readFileSync(path.join(m, "history", "states", f), "utf8");

try {
  console.log("\n-- ⭐ a move to a state that does not exist must take NOTHING --");
  {
    const m = mkMod();
    const before1 = stateFile(m, "1-Alpha.txt"), before2 = stateFile(m, "2-Beta.txt");
    const r = md.moveProvince({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceId: 1, toStateId: -1 });
    ok(r && r.changed === false, "the move reports failure", r);
    ok(/not found/i.test(String(r.error)), "…naming the missing target", r.error);
    ok(stateFile(m, "1-Alpha.txt") === before1, "the SOURCE file is byte-identical — the province was not taken");
    ok(stateFile(m, "2-Beta.txt") === before2, "…and no other state was touched either");
    // The response and the disk must agree. That they disagreed is what made this invisible.
    ok(/provinces = \{[^}]*\b1\b/.test(stateFile(m, "1-Alpha.txt")), "province 1 still belongs to state 1");
    ok(/victory_points = \{[^}]*\b1 5\b/.test(stateFile(m, "1-Alpha.txt")), "…keeping its victory point");
    ok(/1 = \{ naval_base = 3 \}/.test(stateFile(m, "1-Alpha.txt")), "…and its province buildings");
  }

  console.log("\n-- a real move still works, and carries what the province owns --");
  {
    const m = mkMod();
    const r = md.moveProvince({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceId: 1, toStateId: 2 });
    ok(r && r.changed, "the move succeeds", r && r.error);
    ok(r.carriedVp === 5, "…the victory point was read before anything was written", r.carriedVp);
    ok(r.carriedBuildings && r.carriedBuildings.naval_base === 3, "…and so were the province buildings", r.carriedBuildings);
    const a = stateFile(m, "1-Alpha.txt"), b = stateFile(m, "2-Beta.txt");
    ok(!/provinces = \{[^}]*\b1\b/.test(a), "the province left the source");
    ok(/provinces = \{[^}]*\b1\b/.test(b), "…and arrived at the target");
    ok(/victory_points = \{[^}]*\b1 5\b/.test(b), "…with its victory point");
    ok(/1 = \{ naval_base = 3 \}/.test(b), "…and its naval base");
    ok(!/victory_points = \{[^}]*\b1 5\b/.test(a), "…and the source no longer claims a VP for a province it lost");
  }

  console.log("\n-- repeating the failed move never accumulates damage --");
  {
    // The wedged save re-sent the same doomed write on every attempt. Even with the client fixed, the
    // server must be idempotent under it.
    const m = mkMod();
    const before = stateFile(m, "1-Alpha.txt");
    for (let i = 0; i < 5; i++) md.moveProvince({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceId: 1, toStateId: -1 });
    ok(stateFile(m, "1-Alpha.txt") === before, "five failed attempts leave the file byte-identical");
  }

  console.log("\n-- the queue drops writes aimed at a state that was discarded --");
  {
    // The pure helper out of public/map.js, lifted rather than reimplemented.
    const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    const a = SRC.indexOf("function orphanedQueuedWrites(");
    let d = 0, end = -1;
    for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
      if (SRC[i] === "{") d++;
      else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
    }
    const STATE_ID_FIELDS = ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"];
    const orphaned = a < 0 ? null : new Function("STATE_ID_FIELDS", "return (" + SRC.slice(a, end) + ")")(STATE_ID_FIELDS);
    ok(!!orphaned, "orphanedQueuedWrites was found in public/map.js");

    if (orphaned) {
      const create = { url: "/api/map/create-state", body: {}, meta: { create: true, provisionalId: -1 } };
      const fill = { url: "/api/map/move-province", body: { provinceId: 1, toStateId: -1 }, meta: {} };
      const other = { url: "/api/map/set-owner", body: { stateId: 2, owner: "GER" }, meta: {} };

      ok(orphaned([create, fill, other]).length === 0,
        "while the create is queued, its fills are kept", orphaned([create, fill, other]));
      const dropped = orphaned([fill, other]);
      ok(dropped.length === 1 && dropped[0] === fill,
        "once the create is gone, the fill pointing at -1 is dropped", dropped.length);
      ok(orphaned([fill, other]).indexOf(other) === -1, "…and an ordinary write is never dropped");
      ok(orphaned([{ url: "x", body: { stateId: 5 }, meta: {} }]).length === 0,
        "a REAL state id is never treated as provisional — only negatives are");
      ok(orphaned([]).length === 0 && orphaned(null).length === 0, "…and it copes with an empty queue");

      // Every field that can carry a provisional id must be covered, or one route stays wedged.
      for (const k of STATE_ID_FIELDS) {
        const w = { url: "x", body: { [k]: -7 }, meta: {} };
        ok(orphaned([w]).length === 1, `…including a provisional id in ${k}`, k);
      }
    }
  }

  console.log("\n-- ⭐ CONTROL: the old order took the province anyway --");
  {
    // Remove-then-check, as it was: the source is edited before the target is ever looked for.
    const m = mkMod();
    const before = stateFile(m, "1-Alpha.txt");
    md.editStateBlock({ modRoot: m, gameRoot: GAME, dependencyRoots: [], stateId: 1 }, (b) => md.removeProvinceFromBlock(b, 1));
    ok(stateFile(m, "1-Alpha.txt") !== before,
      "removing first really does rewrite the source — which is what used to happen before the target was checked");
    ok(!/provinces = \{[^}]*\b1\b/.test(stateFile(m, "1-Alpha.txt")),
      "…leaving province 1 in no state at all, the crash this ordering exists to avoid");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
