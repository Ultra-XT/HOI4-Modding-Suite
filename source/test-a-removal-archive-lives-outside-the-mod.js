// ⛔ #a-removal-archive-lives-outside-the-mod — 🏳 Countries… Remove keeps its archive in Nova's store for the mod, never in the mod.
//
// THE DEFECT (tool campaign B2-28, repro-B2-28 on a fresh vanilla add-on, the page's own two requests). Remove country wrote its
// snapshot, the only copy of the state blocks and history files it overwrites, to <mod>/.nova/removed_countries/<TAG>.json, and Restore
// moved it to <mod>/.nova/removed_countries/restored/<TAG>-<stamp>.json: after a Remove, and still after a Restore, the mod carried a
// backup the launcher uploads to every subscriber (#a-backup-must-not-ship-with-the-mod). Every other record Nova keeps about a mod is
// in its per-mod store outside it (_novaModScopedDir).
//
// THE FIX (map-data.js). The archive is written to removedCountriesDir(mod) (~/.nova/removed_countries/<mod>_<hash>), and restored/ is
// there too. What an older Nova left inside the mod is still READ (the restorable list, Restore), and is carried out at the next Remove
// or Restore click by moveRemovalArchivesOutOfMod: copied, read back and compared byte for byte, and only then taken out of the mod
// (_moveFileOutOfMod), never deleted; a move that cannot complete leaves the file where it is, and leaves no second copy in the store.
// The list itself (a GET) moves nothing. And a country removed again while an earlier removal of it is still on the list has that
// earlier archive set aside in the store (replaced/), not written over.
//
// The probe sends what the page sends: delete-country { modPath, tag, reassignTo }, restore-country { modPath, tag } and
// GET removed-countries?modPath (public/map.js, read below with comments masked). The world is testlib-two-layer-map.js's, whose
// NOVA_HOME_DIR is the world's own temp folder, so every store this test makes is removed with it.
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

const world = lib.makeWorld("b2-28-archive");
// The base game's state 3 belongs to BBB, whose history file names it as capital.
const owned = (id, provs, tag) => lib.st(id, provs).replace("owner = AAA", `owner = ${tag}\n\t\tadd_core_of = ${tag}`);
lib.write(world.GAME, {
  "history/states/3-C.txt": owned(3, "3", "BBB"),
  "history/countries/BBB - Bland.txt": "capital = 3\n",
});
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const store = (mod) => md.removedCountriesDir(mod);
const legacy = (mod) => path.join(mod, ".nova", "removed_countries");
const inModNova = (mod) => Object.keys(lib.tree(path.join(mod, ".nova")));
const bytes = (p) => { try { return fs.readFileSync(p); } catch (_) { return null; } };
const same = (a, b) => !!a && !!b && Buffer.compare(a, b) === 0;
const restoredIn = (mod) => { try { return fs.readdirSync(path.join(store(mod), "restored")).sort(); } catch (_) { return []; } };

(async () => {
  let srv = null;
  try {
    console.log("0. The Countries modal's requests");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("it posts a removal as { modPath, tag, reassignTo }", /fetch\("\/api\/map\/delete-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag, reassignTo \}\) \}\)/.test(MAP));
      rec("…a restore as { modPath, tag }", /fetch\("\/api\/map\/restore-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag \}\) \}\)/.test(MAP));
      rec("…and reads the restorable list as GET removed-countries?modPath", /fetch\(`\/api\/map\/removed-countries\?modPath=\$\{encodeURIComponent\(modPath\(\)\)\}`\)/.test(MAP));
    }

    srv = await lib.startServer(createApp);
    const remove = (mod, tag) => srv.post("/api/map/delete-country", { tag, reassignTo: "" }, mod);
    const restore = (mod, tag) => srv.post("/api/map/restore-country", { tag }, mod);
    const list = (mod) => fetch(`${srv.base}/api/map/removed-countries?modPath=${encodeURIComponent(mod)}`).then((r) => r.json()).then((j) => (j.countries || []).map((c) => c.tag).sort());

    console.log("\n1. ⭐⭐⭐ Remove writes its archive to Nova's store for the mod, and nothing into the mod's .nova");
    let first = null;
    {
      const mod = world.mod("archive plain", {});
      const d = await remove(mod, "BBB");
      rec("the removal answers ok, 1 state changed", d.status === 200 && d.body.ok === true && d.body.statesChanged === 1, d.body);
      rec("⭐⭐⭐ nothing of Nova's is written into the mod's .nova", !fs.existsSync(path.join(mod, ".nova")), inModNova(mod));
      const a = path.join(store(mod), "BBB.json");
      let j = null; try { j = JSON.parse(fs.readFileSync(a, "utf8")); } catch (_) { j = null; }
      rec("⭐⭐ the archive is in the store, holding state 3's original block", !!j && j.tag === "BBB" && (j.states || []).some((s) => s.id === 3 && /owner = BBB/.test(s.originalBlock)), j && j.states);
      rec("⭐ …and the store is outside the mod", path.relative(mod, store(mod)).startsWith(".."), { mod, store: store(mod) });
      rec("the restorable list names BBB", JSON.stringify(await list(mod)) === '["BBB"]', await list(mod));
      const stub = fs.readFileSync(path.join(mod, "history", "countries", "BBB - Bland.txt"), "utf8");
      rec("…and the stub it writes points to no folder inside the mod", !/\.nova|removed_countries/.test(stub), stub);
      first = bytes(a);

      console.log("\n2. ⭐⭐⭐ Restore moves it to restored/ in the store, and still writes nothing into the mod's .nova");
      const r = await restore(mod, "BBB");
      rec("the restore answers ok, 1 state restored", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐⭐ nothing of Nova's is left in the mod's .nova", !fs.existsSync(path.join(mod, ".nova")), inModNova(mod));
      const kept = restoredIn(mod);
      rec("⭐⭐ the archive is under restored/ in the store, byte for byte", kept.length === 1 && kept[0].startsWith("BBB-") && same(bytes(path.join(store(mod), "restored", kept[0])), first), kept);
      rec("…the answer names it", kept.length === 1 && path.resolve(String(r.body.archivedTo || "")) === path.resolve(store(mod), "restored", kept[0]), r.body.archivedTo);
      rec("…and BBB is off the list", JSON.stringify(await list(mod)) === "[]", await list(mod));
    }

    console.log("\n3. ⭐⭐⭐ An archive an older Nova left inside the mod is read there, and moved out by the next Restore");
    {
      const mod = world.mod("archive left by an older Nova", {});
      const d = await remove(mod, "BBB");
      rec("the fixture: a real removal", d.status === 200 && d.body.ok === true, d.body);
      // what an older Nova would have left: the archive under the mod's .nova, and one it had already restored
      fs.mkdirSync(path.join(legacy(mod), "restored"), { recursive: true });
      fs.renameSync(path.join(store(mod), "BBB.json"), path.join(legacy(mod), "BBB.json"));
      fs.writeFileSync(path.join(legacy(mod), "restored", "AAA-2026-01-02T03-04-05-678Z.json"), JSON.stringify({ tag: "AAA", states: [], countryHistory: [] }, null, 2));
      const planted = bytes(path.join(legacy(mod), "BBB.json")), plantedOld = bytes(path.join(legacy(mod), "restored", "AAA-2026-01-02T03-04-05-678Z.json"));
      rec("⭐⭐ the restorable list reads the old place", JSON.stringify(await list(mod)) === '["BBB"]', await list(mod));
      rec("⭐⭐ …and moves nothing: reading the list is not a write", same(bytes(path.join(legacy(mod), "BBB.json")), planted)
        && same(bytes(path.join(legacy(mod), "restored", "AAA-2026-01-02T03-04-05-678Z.json")), plantedOld) && !fs.existsSync(path.join(store(mod), "BBB.json")));
      const r = await restore(mod, "BBB");
      rec("the restore answers ok, 1 state restored", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐⭐ the mod's .nova is gone: both archives were carried out", !fs.existsSync(path.join(mod, ".nova")), inModNova(mod));
      const kept = restoredIn(mod);
      const mine = kept.find((f) => f.startsWith("BBB-"));
      rec("⭐⭐⭐ the archive it restored from is under restored/ in the store, byte for byte", !!mine && same(bytes(path.join(store(mod), "restored", mine)), planted), kept);
      rec("⭐⭐ …and the one the older Nova had restored is there too, byte for byte, under its own name",
        same(bytes(path.join(store(mod), "restored", "AAA-2026-01-02T03-04-05-678Z.json")), plantedOld), kept);
      rec("…and BBB is off the list", JSON.stringify(await list(mod)) === "[]", await list(mod));
    }

    console.log("\n4. ⭐⭐⭐ A move that cannot complete leaves the archive where it is, and a removal that cannot keep one changes nothing");
    {
      const mod = world.mod("archive with its store blocked", {});
      const d = await remove(mod, "BBB");
      rec("the fixture: a real removal", d.status === 200 && d.body.ok === true, d.body);
      fs.mkdirSync(legacy(mod), { recursive: true });
      fs.renameSync(path.join(store(mod), "BBB.json"), path.join(legacy(mod), "BBB.json"));
      const planted = bytes(path.join(legacy(mod), "BBB.json"));
      // a FILE where the store's folder goes: nothing can be copied into it
      fs.rmdirSync(store(mod));
      fs.writeFileSync(store(mod), "not a folder");
      const r = await restore(mod, "BBB");
      rec("the restore still puts the state back", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐⭐ …and the archive it could not move stays in the mod, byte for byte (never deleted)", same(bytes(path.join(legacy(mod), "BBB.json")), planted));
      rec("⭐ …the answer names no place it went", !r.body.archivedTo, r.body.archivedTo);
      rec("…and the store's place was not written over", fs.readFileSync(store(mod), "utf8") === "not a folder");
      // the removal: the state is BBB's again after the restore, so removing it would need an archive the store cannot take
      const t0 = lib.tree(mod);
      const d2 = await remove(mod, "BBB");
      rec("⭐⭐ a removal whose archive cannot be written is refused", d2.status === 400 && d2.body.ok === false, d2.body);
      rec("⭐⭐⭐ …and changes nothing in the mod", JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", lib.written(t0, lib.tree(mod)));
      // the store comes back: the next Restore carries the archive out, as it would have the first time
      fs.unlinkSync(store(mod));
      const r2 = await restore(mod, "BBB");
      rec("with the store back, the restore answers ok", r2.status === 200 && r2.body.ok === true, r2.body);
      const mine = restoredIn(mod).find((f) => f.startsWith("BBB-"));
      rec("⭐⭐ …and the archive left the mod, byte for byte, into restored/", !fs.existsSync(path.join(mod, ".nova")) && !!mine && same(bytes(path.join(store(mod), "restored", mine)), planted), { left: inModNova(mod), kept: restoredIn(mod) });
    }

    console.log("\n5. ⭐⭐ A file that cannot be taken out of the mod (held by another program) stays, and no second copy of it is left in the store");
    {
      const mod = world.mod("archive held open", {});
      const d = await remove(mod, "BBB");
      rec("the fixture: a real removal", d.status === 200 && d.body.ok === true, d.body);
      fs.mkdirSync(legacy(mod), { recursive: true });
      const held = path.join(legacy(mod), "BBB.json");
      fs.renameSync(path.join(store(mod), "BBB.json"), held);
      const planted = bytes(held);
      // The server runs in this process, so the hold is put on fs itself: on this machine neither a read-only flag nor an open handle
      // stops Node's unlink, while an antivirus scan or the game holding the file does (EBUSY).
      const realUnlink = fs.unlinkSync;
      let refusedUnlinks = 0;
      fs.unlinkSync = function (p, ...rest) {
        if (path.resolve(String(p)).toLowerCase() === path.resolve(held).toLowerCase()) { refusedUnlinks++; const e = new Error(`EBUSY: resource busy or locked, unlink '${p}'`); e.code = "EBUSY"; throw e; }
        return realUnlink.call(fs, p, ...rest);
      };
      let r = null;
      try { r = await restore(mod, "BBB"); } finally { fs.unlinkSync = realUnlink; }
      rec("the fixture: Nova tried to take it out of the mod, and was refused", refusedUnlinks > 0, refusedUnlinks);
      rec("the restore puts the state back", r && r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r && r.body);
      rec("⭐⭐ the held archive is still in the mod, byte for byte", same(bytes(held), planted));
      let inStore = []; try { inStore = Object.keys(lib.tree(store(mod))); } catch (_) { inStore = []; }
      rec("⭐⭐ …and the store holds no second copy of it, at its name or under restored/", inStore.length === 0, inStore);
      rec("…so the list names it once, where it is", JSON.stringify(await list(mod)) === '["BBB"]', await list(mod));
    }

    console.log("\n6. ⭐⭐ A country removed again while its earlier removal is on the list: the earlier archive is set aside, not written over");
    {
      const mod = world.mod("archive removed twice", {});
      const d = await remove(mod, "BBB");
      rec("the fixture: a first removal", d.status === 200 && d.body.ok === true && d.body.statesChanged === 1, d.body);
      const earlier = bytes(path.join(store(mod), "BBB.json"));
      // BBB is given state 3 again by hand (a paint would do the same) and removed a second time
      fs.writeFileSync(path.join(mod, "history", "states", "3-C.txt"), owned(3, "3", "BBB"));
      const d2 = await remove(mod, "BBB");
      rec("the second removal answers ok", d2.status === 200 && d2.body.ok === true && d2.body.statesChanged === 1, d2.body);
      let aside = []; try { aside = fs.readdirSync(path.join(store(mod), "replaced")); } catch (_) { aside = []; }
      rec("⭐⭐⭐ the first archive is kept, byte for byte, under replaced/ in the store", aside.length === 1 && aside[0].startsWith("BBB-") && same(bytes(path.join(store(mod), "replaced", aside[0])), earlier), aside);
      rec("…the answer names where it went", aside.length === 1 && path.resolve(String(d2.body.earlierSetAside || "")) === path.resolve(store(mod), "replaced", aside[0]), d2.body.earlierSetAside);
      rec("…and the list holds the newer removal", !same(bytes(path.join(store(mod), "BBB.json")), earlier) && JSON.stringify(await list(mod)) === '["BBB"]', await list(mod));
      rec("…with nothing in the mod's .nova", !fs.existsSync(path.join(mod, ".nova")), inModNova(mod));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a removal archive lives outside the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
