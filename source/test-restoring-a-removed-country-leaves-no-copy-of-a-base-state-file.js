// Restoring a removed country leaves no copy of a base game's (or a dependency's) state file in the mod.
// #a-restored-country-leaves-no-copy-of-a-base-state-file
//
// THE DEFECT. Removing a country (POST /api/map/delete-country) takes its owner and cores off each of its states through
// editStateBlock, which copies an inherited state's whole file into the mod under the same name. Restoring it
// (POST /api/map/restore-country) writes each state's original block back into that copy — and leaves the copy. The country
// file is handled: a stub over a base file is deleted so the base file shows through again. The state file is not, so the mod
// ends up pinning a verbatim copy of a file it never meant to own: if the game or the dependency later changes that state, the
// mod silently keeps the old one.
//
// THE EVIDENCE (batch 8 discovery F8, f1e.js on 65978a2, the Countries modal's own requests on a vanilla-based mod): removing
// AFA (state 908) with no reassign wrote .nova/removed_countries/AFA.json, history/countries/AFA - Afar.txt and
// history/states/908-Afar.txt; restoring answered { ok:true, statesRestored:1, archivedTo:".nova/removed_countries/restored/…" },
// every file that existed before was byte-identical and the country file was gone again, but history/states/908-Afar.txt stayed:
// sha1 d5857e10… for both the mod's file and the game's.
//
// WHAT IS REMOVED, AND WHAT IS NOT. Only a copy the removal itself made (the snapshot records, per state, whether the state was
// the mod's own before), only once every state is back (the archive's own rule), and only when the copy is byte-identical to the
// file of that name the layers below the mod load. A copy the modder had before the removal, one changed since, a snapshot written
// before this change (it does not say where a state came from), and a mod whose own replace_path loads nothing beneath it all
// keep their file. The archive is still moved aside, never deleted (#restore-deleted-the-snapshot-it-had-not-finished-with).
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

const world = lib.makeWorld("b9-restore-copy");
// The base game's state 3 belongs to BBB, whose history file names it as capital.
const owned = (id, provs, tag) => lib.st(id, provs).replace("owner = AAA", `owner = ${tag}\n\t\tadd_core_of = ${tag}`);
lib.write(world.GAME, {
  "history/states/3-C.txt": owned(3, "3", "BBB"),
  "history/countries/BBB - Bland.txt": "capital = 3\n",
});
const { createApp } = require("./server.js");
// ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — the archive is in Nova's store for the mod now, not under the mod's .nova
const { removedCountriesDir } = require("./map-data.js");

const statePath = (mod, f) => path.join(mod, "history", "states", f);
const same = (a, b) => { try { return Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0; } catch (_) { return false; } };
/** The files a request wrote outside Nova's own .nova folder. */
const outsideNova = (before, after) => lib.written(before, after).filter((k) => !k.startsWith(".nova/"));

(async () => {
  let srv = null;
  try {
    console.log("0. The Countries modal's requests");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("it posts a removal as { modPath, tag, reassignTo }", /fetch\("\/api\/map\/delete-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag, reassignTo \}\) \}\)/.test(MAP));
      rec("…and a restore as { modPath, tag }", /fetch\("\/api\/map\/restore-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag \}\) \}\)/.test(MAP));
    }

    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const remove = (mod, tag) => srv.post("/api/map/delete-country", { tag, reassignTo: "" }, mod);
    const restore = (mod, tag) => srv.post("/api/map/restore-country", { tag }, mod);

    console.log("\n1. ⭐⭐⭐ A mod over the base game removes BBB and restores it");
    {
      const mod = world.mod("restore plain", {});
      const t0 = lib.tree(mod);
      const d = await remove(mod, "BBB");
      rec("the removal answers ok, 1 state changed", d.status === 200 && d.body.ok === true && d.body.statesChanged === 1, d.body);
      rec("CONTROL: the removal copied the base game's 3-C.txt into the mod", fs.existsSync(statePath(mod, "3-C.txt")), lib.tree(mod));
      const r = await restore(mod, "BBB");
      rec("the restore answers ok, 1 state restored", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐⭐ the copy of 3-C.txt is gone from the mod", !fs.existsSync(statePath(mod, "3-C.txt")), lib.tree(mod));
      rec("⭐⭐ outside .nova the mod is exactly as it was before the removal", JSON.stringify(outsideNova(t0, lib.tree(mod))) === "[]", outsideNova(t0, lib.tree(mod)));
      rec("⭐⭐ …and inside it too: the archive is kept outside the mod (B2-28)", JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", lib.written(t0, lib.tree(mod)));
      const m = await model(mod);
      const s3 = (m.states || []).find((s) => s.id === 3) || {};
      rec("⭐⭐ state 3 is BBB's again, read from the base game", s3.owner === "BBB" && path.resolve(String(s3.rootPath || "")).toLowerCase() === path.resolve(world.GAME).toLowerCase(), { owner: s3.owner, rootPath: s3.rootPath });
      rec("…and BBB's capital is back", (m.capitals || {}).BBB === 3, m.capitals);
      const kept = fs.readdirSync(path.join(removedCountriesDir(mod), "restored"));
      rec("the archive was moved aside, not deleted", kept.length === 1 && kept[0].startsWith("BBB-"), kept);
    }

    console.log("\n2. ⭐⭐ An add-on removes its dependency's country and restores it");
    {
      const DEP = "restore dep";
      const dep = world.mod(DEP, {
        "history/states/2-B.txt": owned(2, "2 5", "CCC"),
        "history/countries/CCC - Cland.txt": "capital = 2\n",
      });
      const depTree = lib.tree(dep);
      const addon = world.mod("restore addon", {}, [DEP]);
      const t0 = lib.tree(addon);
      const d = await remove(addon, "CCC");
      rec("the removal answers ok", d.status === 200 && d.body.ok === true && d.body.statesChanged === 1, d.body);
      rec("CONTROL: it copied the dependency's 2-B.txt into the add-on", fs.existsSync(statePath(addon, "2-B.txt")));
      const r = await restore(addon, "CCC");
      rec("the restore answers ok", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐⭐ the copy of the dependency's 2-B.txt is gone from the add-on", !fs.existsSync(statePath(addon, "2-B.txt")), lib.tree(addon));
      rec("⭐⭐ outside .nova the add-on is exactly as it was", JSON.stringify(outsideNova(t0, lib.tree(addon))) === "[]", outsideNova(t0, lib.tree(addon)));
      const s2 = ((await model(addon)).states || []).find((s) => s.id === 2) || {};
      rec("state 2 is CCC's again, read from the dependency", s2.owner === "CCC" && path.resolve(String(s2.rootPath || "")).toLowerCase() === path.resolve(dep).toLowerCase(), { owner: s2.owner, rootPath: s2.rootPath });
      rec("the dependency was never written to", lib.written(depTree, lib.tree(dep)).length === 0, lib.written(depTree, lib.tree(dep)));
    }

    console.log("\n3. CONTROL: a mod that had its own copy of 3-C.txt before the removal keeps it");
    {
      const mod = world.mod("restore own copy", { "history/states/3-C.txt": fs.readFileSync(path.join(world.GAME, "history", "states", "3-C.txt"), "utf8") });
      const before = fs.readFileSync(statePath(mod, "3-C.txt"));
      await remove(mod, "BBB");
      const r = await restore(mod, "BBB");
      rec("the restore answers ok", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐ the mod's own 3-C.txt is still there, byte for byte", fs.existsSync(statePath(mod, "3-C.txt")) && Buffer.compare(fs.readFileSync(statePath(mod, "3-C.txt")), before) === 0);
    }

    console.log("\n4. CONTROL: a copy the modder changed between the removal and the restore is kept");
    {
      const mod = world.mod("restore changed copy", {});
      await remove(mod, "BBB");
      const p = statePath(mod, "3-C.txt");
      fs.writeFileSync(p, "# my note about this state\n" + fs.readFileSync(p, "utf8"));
      const r = await restore(mod, "BBB");
      rec("the restore answers ok, 1 state restored", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐⭐ the changed copy is kept", fs.existsSync(p) && /# my note about this state/.test(fs.readFileSync(p, "utf8")));
      rec("…with state 3 restored in it", /owner = BBB/.test(fs.readFileSync(p, "utf8")) && !same(p, path.join(world.GAME, "history", "states", "3-C.txt")));
    }

    console.log("\n5. CONTROL: a snapshot that does not say where its states came from removes nothing");
    {
      const mod = world.mod("restore old snapshot", {});
      await remove(mod, "BBB");
      const snap = path.join(removedCountriesDir(mod), "BBB.json");
      const j = JSON.parse(fs.readFileSync(snap, "utf8"));
      for (const s of j.states || []) delete s.origin;
      fs.writeFileSync(snap, JSON.stringify(j, null, 2));
      const r = await restore(mod, "BBB");
      rec("the restore answers ok", r.status === 200 && r.body.ok === true && r.body.statesRestored === 1, r.body);
      rec("⭐ the copy stays: nothing says the removal made it", fs.existsSync(statePath(mod, "3-C.txt")));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== restoring a removed country leaves no copy of a base state file: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
