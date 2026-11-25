// ⛔ #a-refused-move-leaves-no-copy — A PAINT OR MOVE THE SERVER REFUSES LEAVES THE MOD AS IT WAS: no copy of an inherited state's file
// (tool campaign B1-24 = B6-21, B2-30).
//
// THE DEFECT. moveProvince writes the target state first and only then cuts the province out of its sources ("ADD before REMOVE", so a
// failure never leaves land in no state). When the target is a state the mod does not have, that first write copies the base game's
// whole state file into the mod (editStateBlock answers `created`). When a source then cannot be written (its file read-only, or held
// open by the game), #a-carry-that-cannot-finish-gives-nothing writes the target's old text back — into the copy. The answer said
// "Couldn't write 5-Germany.txt … Nothing was changed … try again" while the mod had gained history/states/97-Bialystok.txt, byte for
// byte the base game's (337-Faroe Islands.txt on a refused Move): a file that from then on pins that state against every later change
// of the layer below, which the modder never asked for and was told nothing about.
//
// THE FIX. With nothing cut anywhere and the put-back landed, a target file the first write CREATED, and whose bytes are again the file
// of that name beneath the mod, is MOVED out of the mod into Nova's per-mod store (~/.nova/refused_moves/…), never deleted
// (takeBackAStateCopyNobodyChanged, _moveFileOutOfMod: copied, compared byte for byte, then taken out). One that cannot be taken out is
// named in the answer, which then no longer says "Nothing was changed".
//
// Driven through POST /api/map/move-province with what the page's Save sends (public/map.js: queueWrite's { provinceId, toStateId },
// flushMapSaves' Object.assign({}, w.body, { modPath }) and its X-Nova-Map-Save header), on testlib-two-layer-map.js's small game:
// state 2 = { 2 5 }, state 3 = { 3 }, both in the base game.
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

const world = lib.makeWorld("refused-move-copy");
const { createApp } = require("./server.js");
const HOME = process.env.NOVA_HOME_DIR;
const gameState = (f) => path.join(world.GAME, "history", "states", f);
const modState = (mod, f) => path.join(mod, "history", "states", f);
const bytesOf = (p) => { try { return fs.readFileSync(p); } catch (_) { return null; } };
/** every file under Nova's refused_moves store, by its path there */
const storeFiles = () => { const t = lib.tree(path.join(HOME, ".nova", "refused_moves")); return Object.keys(t); };
// the mod owns state 2 (one more man than the base game), so the move's source is a file of its own that can be made read-only
const ownTwo = () => ({ "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 1001 }) });
const readOnly = (p) => { fs.chmodSync(p, 0o444); return () => fs.chmodSync(p, 0o666); };

(async () => {
  let srv = null;
  try {
    console.log("0. What the page's Save sends for a paint or a Move");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("queueWrite('/api/map/move-province', { provinceId, toStateId }, …)", /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}/.test(MAP));
      rec("…posted by flushMapSaves as Object.assign({}, w.body, { modPath: modPath() })", /const body = Object\.assign\(\{\}, w\.body, \{ modPath: modPath\(\) \}\)/.test(MAP));
      rec("…with the Save's X-Nova-Map-Save header", /const saveHeaders = \{ "Content-Type": "application\/json", "X-Nova-Map-Save": saveRunId \}/.test(MAP));
    }

    srv = await lib.startServer(createApp);
    let n = 0;
    const save = (mod, provinceId, toStateId) => fetch(`${srv.base}/api/map/move-province`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": `refusedmove${++n}${Date.now().toString(36)}` },
      body: JSON.stringify(Object.assign({}, { provinceId, toStateId }, { modPath: mod })),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const holders = async (mod, pid) => ((await model(mod)).states || []).filter((s) => (s.provinces || []).includes(pid)).map((s) => s.id);

    console.log("\n1. ⭐⭐⭐ A paint of province 5 into the base game's state 3, refused because the mod's 2-B.txt is read-only");
    {
      const mod = world.mod("refused into a base state", ownTwo());
      const t0 = lib.tree(mod), store0 = storeFiles();
      const free = readOnly(modState(mod, "2-B.txt"));
      let r;
      try { r = await save(mod, 5, 3); } finally { free(); }
      const said = String((r.body && r.body.error) || "");
      rec("THE CONTROL: the server refuses it, naming the file it could not write", r.status === 400 && /Couldn't write 2-B\.txt/.test(said), r);
      rec("⭐⭐⭐ the mod gained no copy of the base game's 3-C.txt", !fs.existsSync(modState(mod, "3-C.txt")), Object.keys(lib.tree(mod)));
      rec("⭐⭐⭐ …nor anything else: the mod is byte for byte as it was", JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", lib.written(t0, lib.tree(mod)));
      rec("⭐⭐ so the answer's \"Nothing was changed\" is true", /Nothing was changed\./.test(said) && !/still there/.test(said), said);
      const moved = storeFiles().filter((k) => !store0.includes(k));
      const copy = moved.find((k) => /\/history\/states\/3-C\.txt$/.test(k));
      rec("⭐⭐⭐ the copy was MOVED into Nova's store for the mod, not deleted: ~/.nova/refused_moves/…/history/states/3-C.txt", moved.length === 1 && !!copy, moved);
      rec("⭐⭐ …and it is the base game's file, byte for byte", !!copy && Buffer.compare(fs.readFileSync(path.join(HOME, ".nova", "refused_moves", ...copy.split("/"))), fs.readFileSync(gameState("3-C.txt"))) === 0, copy);
      rec("…and the Save's answer counts no file it created", !(r.body.saveCopies && r.body.saveCopies.created), r.body.saveCopies);
      rec("(province 5 is still in state 2 only)", JSON.stringify(await holders(mod, 5)) === "[2]", await holders(mod, 5));
      const again = await save(mod, 5, 3);
      rec("CONTROL: with the file free the same Save lands, and the mod now has 3-C.txt holding province 5", again.status === 200 && again.body.ok === true && fs.existsSync(modState(mod, "3-C.txt")) && /provinces = \{[^}]*\b5\b/.test(fs.readFileSync(modState(mod, "3-C.txt"), "utf8")) && JSON.stringify(await holders(mod, 5)) === "[3]", again.body);
    }

    console.log("\n2. CONTROL: the same refusal into a state the mod already owns leaves that file, in the mod, byte for byte");
    {
      const mod = world.mod("refused into an own state", { ...ownTwo(), "history/states/3-C.txt": lib.st(3, "3", { manpower: 1003 }) });
      const mine = bytesOf(modState(mod, "3-C.txt")), store0 = storeFiles();
      const free = readOnly(modState(mod, "2-B.txt"));
      let r;
      try { r = await save(mod, 5, 3); } finally { free(); }
      rec("refused", r.status === 400 && /Couldn't write 2-B\.txt/.test(String(r.body.error || "")), r);
      rec("⭐⭐ the mod's own 3-C.txt is still in the mod, byte for byte as it was", Buffer.compare(bytesOf(modState(mod, "3-C.txt")) || Buffer.alloc(0), mine) === 0);
      rec("⭐⭐ …and nothing of the mod's own went to the store", JSON.stringify(storeFiles().filter((k) => !store0.includes(k))) === "[]", storeFiles());
    }

    console.log("\n3. When the copy cannot be taken back out, the answer names it instead of saying nothing was changed");
    {
      const mod = world.mod("refused, store blocked", ownTwo());
      // a FILE where Nova's refused_moves folder would go: nothing can be copied under it
      const blockAt = path.join(HOME, ".nova", "refused_moves");
      const hadStore = fs.existsSync(blockAt);
      const aside = blockAt + ".aside-" + Date.now();
      if (hadStore) fs.renameSync(blockAt, aside);
      fs.mkdirSync(path.dirname(blockAt), { recursive: true });
      fs.writeFileSync(blockAt, "not a folder");
      const free = readOnly(modState(mod, "2-B.txt"));
      let r;
      try { r = await save(mod, 5, 3); }
      finally { free(); fs.unlinkSync(blockAt); if (hadStore) fs.renameSync(aside, blockAt); }
      const said = String((r.body && r.body.error) || "");
      rec("refused", r.status === 400 && /Couldn't write 2-B\.txt/.test(said), r);
      rec("CONTROL: the copy is still in the mod, the base game's file byte for byte", fs.existsSync(modState(mod, "3-C.txt")) && Buffer.compare(fs.readFileSync(modState(mod, "3-C.txt")), fs.readFileSync(gameState("3-C.txt"))) === 0);
      rec("⭐⭐⭐ …and the answer names it, and no longer says that nothing was changed", !/Nothing was changed\./.test(said) && /Nothing else was changed, but this move had copied history\/states\/3-C\.txt into your mod/.test(said) && /it is still there/.test(said), said);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a refused move leaves no copy in the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
})();
