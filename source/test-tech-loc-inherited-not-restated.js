// #tech-loc-restates-resolved-inherited-text — RESOLVE FOR DISPLAY, NEVER FOR DISK.
//
// The tech catalogue resolves each tech's text for the editor to show:
//
//     tech.description = resolveLocReferences(locMap.descriptions[descKey] || "", locMap.names)
//
// and `persistTechnologySave` wrote whatever came back straight to disk. Nothing asked whether a lower layer
// already supplies that string, so an UNEDITED value arrived at the writer looking exactly like an edit.
//
// Two consequences, and the second is the serious one:
//
//   * the mod takes ownership of keys it never authored. "Copy Generic Tree" copies every vanilla tech with
//     `isMod = true`; measured, that is 876 loc lines (552 names + 324 descriptions). From then on the mod
//     shows its frozen copy, not the base game's text.
//   * where vanilla wrote a REFERENCE, the expansion went to disk instead. 34 of those 552 names are pure
//     indirection — `iw_small_airframe` is literally `"$small_plane_airframe_0$"` — and 3 descriptions
//     resolve only PARTIALLY, so what landed was a mixture of expanded and still-literal `$…$` in one string.
//     Vanilla made those names indirect on purpose; the copy freezes them.
//
// The guard is the one the decisions and events makers already carry, quoted from the events maker: "the base
// game or a dependency already says exactly this → leave it be, rather than taking ownership of an inherited
// key by restating it." Third caller, same rule.
//
// Comparing RESOLVED to RESOLVED is what keeps it correct: an author's edit no longer equals what the layers
// below resolve to, so it still writes. That is the half this test spends most of its checks on, because a
// guard that also swallows real edits would be far worse than the bug.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techloc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");

let seq = 0;
function mkMod() {
  const n = "ZZTL" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
function locLines(dir) {
  const d = path.join(dir, "localisation", "english");
  if (!fs.existsSync(d)) return [];
  const out = [];
  for (const f of fs.readdirSync(d))
    for (const line of fs.readFileSync(path.join(d, f), "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"(.*)"\s*$/.exec(line);
      if (m) out.push({ key: m[1], value: m[2] });
    }
  return out;
}
const keyed = (dir, key) => locLines(dir).filter((l) => l.key === key);

let PORT = 49700;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      catalog: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/technologies/catalog?lite=1&modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      save: (mod, techs) => fetch("http://127.0.0.1:" + PORT + "/api/technologies/save-batch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: mod, technologies: techs, equipments: {}, customTabs: [], newTechIds: [] }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// What the client's "Copy Generic Tree" button produces for one tech.
const asCopied = (t, over) => Object.assign({}, t, { isMod: true, fileName: "custom_technologies.txt" }, over || {});

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(GAME)) { console.log("no HOI4 install — skipped"); return; }

    api = await serve(createApp());
    const probe = mkMod();
    const cat = await api.catalog(probe.dir);
    const vanilla = (cat.technologies || []).filter((t) => t && t.id && !t.isMod);

    console.log("\n[the corpus] what Copy Generic Tree would take over");
    const named = vanilla.filter((t) => String(t.name || "").trim());
    const described = vanilla.filter((t) => String(t.description || "").trim());
    console.log(`  ${vanilla.length} vanilla techs — ${named.length} names + ${described.length} descriptions = ${named.length + described.length} loc lines`);
    rec("the catalogue really does resolve text for these techs", named.length > 300, named.length);

    // Read vanilla's .yml exactly as the parser does, so a comparison means something. My first version of
    // this measurement did NOT unescape, and 29 descriptions containing a literal \n looked like differences
    // that were not there. A reader disagreeing with production is a question, not a verdict.
    const rawLoc = new Map();
    const unesc = (v) => v.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/_l_english\.yml$/i.test(e.name)) continue;
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"(.*)"\s*$/.exec(line);
          if (m && !rawLoc.has(m[1])) rawLoc.set(m[1], unesc(m[2]));
        }
      }
    };
    walk(path.join(GAME, "localisation", "english"));

    const refNames = named.filter((t) => {
      const raw = rawLoc.get(t.id);
      return raw !== undefined && raw !== t.name && /\$[A-Za-z0-9_.-]+\$/.test(raw);
    });
    console.log(`  …of which ${refNames.length} names are a REFERENCE vanilla resolves at runtime`);
    if (refNames[0]) console.log(`     e.g. ${refNames[0].id}: ${JSON.stringify(rawLoc.get(refNames[0].id))} → ${JSON.stringify(refNames[0].name)}`);
    rec("fixture: vanilla really does write tech names as $references$", refNames.length > 5, refNames.length);

    console.log("\n[copying a tech unedited] the mod takes over nothing");
    {
      const mod = mkMod();
      const victim = named.find((t) => String(t.description || "").trim()) || named[0];
      const r = await api.save(mod.dir, [asCopied(victim)]);
      rec("the save succeeds", r.ok === true, r);
      rec("…writing no localisation at all", locLines(mod.dir).length === 0, locLines(mod.dir).slice(0, 4));
    }

    console.log("\n[the reference case] the expansion must never reach disk");
    if (refNames.length) {
      const mod = mkMod();
      const t = refNames[0];
      const r = await api.save(mod.dir, [asCopied(t)]);
      rec("the save succeeds", r.ok === true, r);
      const wrote = keyed(mod.dir, t.id);
      rec(`…and ${t.id} is not frozen to its expansion`, wrote.length === 0, wrote);
      rec("…so the game still resolves vanilla's reference",
        /\$[A-Za-z0-9_.-]+\$/.test(rawLoc.get(t.id) || ""), rawLoc.get(t.id));
    }

    console.log("\n[the half that matters more] a real edit still writes");
    {
      const mod = mkMod();
      const victim = named.find((t) => String(t.description || "").trim()) || named[0];
      const r = await api.save(mod.dir, [asCopied(victim, { name: "A Name Nobody Else Uses" })]);
      rec("the save succeeds", r.ok === true, r);
      const n = keyed(mod.dir, victim.id);
      rec("…the edited name IS written", n.length === 1 && n[0].value === "A Name Nobody Else Uses", n);
      rec("…and the untouched description is still left alone",
        keyed(mod.dir, victim.id + "_desc").length === 0, keyed(mod.dir, victim.id + "_desc"));
    }
    {
      const mod = mkMod();
      const victim = described[0];
      const r = await api.save(mod.dir, [asCopied(victim, { description: "My own explanation of this tech." })]);
      rec("the save succeeds", r.ok === true, r);
      const d = keyed(mod.dir, victim.id + "_desc");
      rec("…an edited description IS written", d.length === 1 && d[0].value === "My own explanation of this tech.", d);
      rec("…and the untouched name is still left alone", keyed(mod.dir, victim.id).length === 0, keyed(mod.dir, victim.id));
    }

    console.log("\n[content the mod owns] unaffected");
    {
      const mod = mkMod();
      const r1 = await api.save(mod.dir, [{
        id: "zz_my_own_tech", isMod: true, fileName: "custom_technologies.txt",
        name: "My Own Tech", description: "Mine.", folder: "infantry_folder", researchCost: 1,
      }]);
      rec("a brand-new tech saves", r1.ok === true, r1);
      rec("…and gets its own name", keyed(mod.dir, "zz_my_own_tech").some((l) => l.value === "My Own Tech"), locLines(mod.dir));
      rec("…and its own description", keyed(mod.dir, "zz_my_own_tech_desc").some((l) => l.value === "Mine."), locLines(mod.dir));

      // Editing a key the mod already owns still rewrites it in place — the guard only covers keys the mod
      // has never written (#loc-update-in-place is a separate rule and must survive).
      const r2 = await api.save(mod.dir, [{
        id: "zz_my_own_tech", isMod: true, fileName: "custom_technologies.txt",
        name: "My Renamed Tech", description: "Mine.", folder: "infantry_folder", researchCost: 1,
      }]);
      rec("re-saving succeeds", r2.ok === true, r2);
      const after = keyed(mod.dir, "zz_my_own_tech");
      rec("…and the mod's own key is updated in place, not duplicated",
        after.length === 1 && after[0].value === "My Renamed Tech", after);
    }

    api.stop(); api = null;
    console.log(`\n=== tech loc inherited not restated: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
