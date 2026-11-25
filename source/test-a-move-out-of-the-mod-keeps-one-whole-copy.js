// ⛔ #a-move-out-of-the-mod-keeps-one-whole-copy — WHEN THE BYTE-CHECKED MOVE OF ONE FILE OUT OF THE MOD FAILS HALF-WAY, EXACTLY ONE WHOLE
// COPY IS LEFT, AND IT IS THE ONE NOVA READS (final round, review of group data's B2-28 work).
//
// _moveFileOutOfMod (map-data.js) copies a file into Nova's per-mod store, reads the copy back, compares it byte for byte, and only then
// takes the file out of the mod. It carries Remove country's archives out of the mod (moveRemovalArchivesOutOfMod, restoreCountry) into
// removedCountriesDir, a store kept BY NAME: <store>/<TAG>.json is the archive the restorable list shows and Restore reads FIRST.
//
// THE DEFECTS, both in the move's failure paths, both measured below on the Countries modal's own requests:
//   1. A copy that did not match (a write that came out short) was LEFT at <store>/<TAG>.json. Restore then read that broken copy before
//      the whole one still in the mod, and answered "No saved removal found" for a country the list still offered; every later click
//      left the whole archive in the mod for good, because the store "already holds a removal of that name".
//   2. When the file could not be taken out of the mod, the copy was deleted to avoid a second live copy — without asking whether the
//      file was still there. Gone from the mod meanwhile (an antivirus quarantine takes a file the moment it is read: the unlink answers
//      ENOENT), the copy deleted was the ONLY one: Restore answered "No saved removal found", and the removed country's original state
//      blocks and history files existed nowhere Nova could reach.
//
// THE FIX. A copy that is not whole is taken back (it is this call's own, made a moment ago, never the only one: the file it copies is
// untouched); and after a failed unlink the copy is taken back only while the file is still in the mod — a file gone from the mod has
// left it, and its verified copy is the one that stays.
//
// The server runs in this process, so each fault is put on fs itself, once, on the one path it concerns.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("move-out-one-copy");
// the base game's state 3 belongs to BBB, whose history file names it as its capital (as test-a-removal-archive-lives-outside-the-mod.js)
const owned = (id, provs, tag) => lib.st(id, provs).replace("owner = AAA", `owner = ${tag}\n\t\tadd_core_of = ${tag}`);
lib.write(world.GAME, {
  "history/states/3-C.txt": owned(3, "3", "BBB"),
  "history/countries/BBB - Bland.txt": "capital = 3\n",
});
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const store = (mod) => md.removedCountriesDir(mod);
const legacy = (mod) => path.join(mod, ".nova", "removed_countries");
const bytes = (p) => { try { return fs.readFileSync(p); } catch (_) { return null; } };
const same = (a, b) => !!a && !!b && Buffer.compare(a, b) === 0;
const under = (d) => { try { return Object.keys(lib.tree(d)).sort(); } catch (_) { return []; } };
const samePath = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
/** Put `fn` in place of fs[name] for the one call whose first argument is `p`; every other call goes through. Returns how to undo it. */
function onceOn(name, p, fn) {
  const real = fs[name];
  let hits = 0;
  fs[name] = function (a, ...rest) {
    if (!hits && samePath(a, p)) { hits++; return fn(real, a, ...rest); }
    return real.call(fs, a, ...rest);
  };
  return { undo: () => { fs[name] = real; }, hits: () => hits };
}

(async () => {
  let srv = null;
  try {
    console.log("The Countries modal's requests, which this test sends");
    {
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("a removal is posted as { modPath, tag, reassignTo }", /fetch\("\/api\/map\/delete-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag, reassignTo \}\) \}\)/.test(MAP));
      rec("…a restore as { modPath, tag }", /fetch\("\/api\/map\/restore-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag \}\) \}\)/.test(MAP));
      rec("…and the restorable list is GET removed-countries?modPath", /fetch\(`\/api\/map\/removed-countries\?modPath=\$\{encodeURIComponent\(modPath\(\)\)\}`\)/.test(MAP));
    }
    srv = await lib.startServer(createApp);
    const remove = (mod, tag) => srv.post("/api/map/delete-country", { tag, reassignTo: "" }, mod);
    const restore = (mod, tag) => srv.post("/api/map/restore-country", { tag }, mod);
    const list = (mod) => fetch(`${srv.base}/api/map/removed-countries?modPath=${encodeURIComponent(mod)}`).then((r) => r.json()).then((j) => (j.countries || []).map((c) => c.tag).sort());
    /** a mod holding the archive an older Nova left inside it: a real removal, its archive put where that Nova kept it */
    const olderNovasMod = async (name) => {
      const mod = world.mod(name, {});
      const d = await remove(mod, "BBB");
      if (!(d.status === 200 && d.body.ok === true && d.body.statesChanged === 1)) throw new Error("fixture: the removal did not land " + JSON.stringify(d.body));
      fs.mkdirSync(legacy(mod), { recursive: true });
      fs.renameSync(path.join(store(mod), "BBB.json"), path.join(legacy(mod), "BBB.json"));
      return { mod, held: path.join(legacy(mod), "BBB.json"), planted: bytes(path.join(legacy(mod), "BBB.json")) };
    };
    const stateThreeOwner = (mod) => {
      let t = ""; try { t = fs.readFileSync(path.join(mod, "history", "states", "3-C.txt"), "utf8"); } catch (_) { t = fs.readFileSync(path.join(world.GAME, "history", "states", "3-C.txt"), "utf8"); }
      const m = /owner = ([A-Z]{3})/.exec(t); return m ? m[1] : null;
    };

    console.log("0. CONTROL: with nothing in the way, Restore carries the older Nova's archive out whole and restores from it");
    {
      const { mod, planted } = await olderNovasMod("move clean");
      const r = await restore(mod, "BBB");
      rec("the restore answers ok, 1 state restored", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      const kept = under(path.join(store(mod), "restored"));
      rec("…and the archive is under restored/ in the store, byte for byte, with none left in the mod", kept.length === 1 && same(bytes(path.join(store(mod), "restored", kept[0])), planted) && !fs.existsSync(legacy(mod)), { kept, left: under(legacy(mod)) });
    }

    console.log("\n1. ⭐⭐⭐ A copy that comes out short is not left in the store, where Restore would read it before the whole one");
    {
      const { mod, held, planted } = await olderNovasMod("copy comes out short");
      // the copy lands, but short: what a disk that filled, or a program that touched the file mid-copy, leaves
      const fault = onceOn("copyFileSync", held, (real, src, dest) => { fs.writeFileSync(dest, fs.readFileSync(src).subarray(0, 40)); });
      let r = null;
      try { r = await restore(mod, "BBB"); } finally { fault.undo(); }
      rec("the fixture: the carry-out's copy came out short", fault.hits() === 1, fault.hits());
      rec("⭐⭐⭐ the restore still answers ok, from the whole archive in the mod", !!r && r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r && r.body);
      rec("⭐⭐ …so state 3 is BBB's again", stateThreeOwner(mod) === "BBB", stateThreeOwner(mod));
      rec("⭐⭐⭐ the store holds no short copy at the archive's name", !fs.existsSync(path.join(store(mod), "BBB.json")), under(store(mod)));
      const kept = under(path.join(store(mod), "restored"));
      rec("⭐⭐ …and the archive it restored from left the mod whole, into restored/ (the fault was once)", kept.length === 1 && same(bytes(path.join(store(mod), "restored", kept[0])), planted) && !fs.existsSync(held), { kept, left: under(legacy(mod)) });
      rec("…and BBB is off the list", JSON.stringify(await list(mod)) === "[]", await list(mod));
    }

    console.log("\n2. ⭐⭐ A copy that fails half-way (it throws) is not left in the store either");
    {
      const { mod, held, planted } = await olderNovasMod("copy throws half-way");
      const fault = onceOn("copyFileSync", held, (real, src, dest) => {
        fs.writeFileSync(dest, fs.readFileSync(src).subarray(0, 40));
        const e = new Error(`ENOSPC: no space left on device, copyfile '${src}' -> '${dest}'`); e.code = "ENOSPC"; throw e;
      });
      let list1 = null, r = null;
      try { list1 = await list(mod); r = await restore(mod, "BBB"); } finally { fault.undo(); }
      rec("the fixture: the copy threw", fault.hits() === 1, fault.hits());
      rec("the list (a GET) offered BBB from the mod", JSON.stringify(list1) === '["BBB"]', list1);
      rec("⭐⭐⭐ the restore answers ok, from the archive in the mod", !!r && r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r && r.body);
      rec("⭐⭐⭐ …and nothing short is left at the archive's name in the store", !fs.existsSync(path.join(store(mod), "BBB.json")), under(store(mod)));
      const kept = under(path.join(store(mod), "restored"));
      rec("⭐⭐ …and the archive left the mod whole, into restored/", kept.length === 1 && same(bytes(path.join(store(mod), "restored", kept[0])), planted) && !fs.existsSync(held), { kept, left: under(legacy(mod)) });
    }

    console.log("\n3. ⭐⭐⭐ A file that another program takes away while Nova moves it: the verified copy is the one left, and it is kept");
    {
      const { mod, held, planted } = await olderNovasMod("file taken away mid-move");
      const quarantine = path.join(world.ROOT || path.dirname(mod), "quarantine-" + Date.now());
      fs.mkdirSync(quarantine, { recursive: true });
      // what an on-access scanner does: the file is gone from the mod when Nova comes to take it out, so the unlink answers ENOENT
      const fault = onceOn("unlinkSync", held, (real, p) => {
        fs.renameSync(p, path.join(quarantine, "BBB.json"));
        const e = new Error(`ENOENT: no such file or directory, unlink '${p}'`); e.code = "ENOENT"; throw e;
      });
      let r = null;
      try { r = await restore(mod, "BBB"); } finally { fault.undo(); }
      rec("the fixture: the file was taken away and the unlink answered ENOENT", fault.hits() === 1 && !fs.existsSync(held), fault.hits());
      rec("⭐⭐⭐ the restore still answers ok: the archive Nova copied is there to restore from", !!r && r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r && r.body);
      rec("⭐⭐ …so state 3 is BBB's again", stateThreeOwner(mod) === "BBB", stateThreeOwner(mod));
      const kept = under(path.join(store(mod), "restored"));
      rec("⭐⭐⭐ …and that copy is kept, byte for byte, under restored/ in the store", kept.length === 1 && same(bytes(path.join(store(mod), "restored", kept[0])), planted), { kept, store: under(store(mod)) });
    }

    console.log("\n4. CONTROL: a file still in the mod that cannot be taken out stays, and the store keeps no second copy of it");
    {
      const { mod, held, planted } = await olderNovasMod("file held open");
      const realUnlink = fs.unlinkSync;
      let refused = 0;
      fs.unlinkSync = function (p, ...rest) {
        if (samePath(p, held)) { refused++; const e = new Error(`EBUSY: resource busy or locked, unlink '${p}'`); e.code = "EBUSY"; throw e; }
        return realUnlink.call(fs, p, ...rest);
      };
      let r = null;
      try { r = await restore(mod, "BBB"); } finally { fs.unlinkSync = realUnlink; }
      rec("the fixture: every unlink of it was refused", refused > 0, refused);
      rec("the restore puts the state back", !!r && r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r && r.body);
      rec("⭐⭐ the held archive is still in the mod, byte for byte", same(bytes(held), planted));
      rec("⭐⭐ …and the store holds no second copy of it", under(store(mod)).length === 0, under(store(mod)));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a move out of the mod keeps one whole copy: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
