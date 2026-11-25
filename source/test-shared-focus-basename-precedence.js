// #shared-focus-basename-first-wins — WHEN TWO ROOTS SHIP THE SAME FILENAME, THE MOD'S IS THE ONE THAT LOADS.
//
// Both shared-focus readers walk every root and dedupe by basename:
//
//     for (const root of getActiveRoots(modRoot, "common/national_focus")) {
//       …
//       if (seen.has(name)) continue; // mod overrides vanilla by same filename
//
// getActiveRoots returns `[gameRoot, ...deps, modRoot]` — LOAD order, lowest priority first. Keeping the
// first basename therefore kept VANILLA's copy, which is the exact opposite of what the comment on that line
// says and of what HOI4 does: a mod file at a vanilla `common/` path replaces it wholesale.
//
// Measured: a mod shipping its own `baltic_shared.txt` with 2 shared-focus groups was offered vanilla's 60.
// Its own two were invisible, and all 60 on offer were groups the game would never load — so linking one
// wrote a `shared_focus = <id>` reference pointing at nothing.
//
// Third instance of one shape. `#equip-same-filename` prunes equipment by basename and
// `#tech-file-shadows-base` refuses to create such a shadow; this reader was still first-wins.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sfbn-"));
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
const NF = path.join(GAME, "common", "national_focus");
const toPosix = (p) => p.split(path.sep).join("/");

const group = (id, x) => [
  "shared_focus = {",
  "\tid = " + id,
  "\ticon = GFX_goal_generic_demand_territory",
  "\tx = " + x,
  "\ty = 0",
  "\tcost = 10",
  "\tcompletion_reward = { add_political_power = 10 }",
  "}",
].join("\n");

let seq = 0;
function mkMod(deps) {
  const n = "ZZSF" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n', "utf8");
  return { name: n, dir };
}

let PORT = 49620;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      available: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/focus/shared-available?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      shared: (mod, rel) => fetch("http://127.0.0.1:" + PORT + "/api/focus/shared?modPath=" + encodeURIComponent(mod)
        + "&relPath=" + encodeURIComponent(rel)).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      allIds: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/focus/all-ids?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(NF)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] which vanilla filename a mod is likely to collide with");
    // Count comment-aware. Vanilla's baltic_shared.txt opens with a commented-out `# shared_focus = {`, so a
    // naive count says 61 where the file really defines 60 — my first version of this test read that
    // disagreement as a Nova bug when it was the indexer being right.
    const defs = (txt) => (String(txt).replace(/#.*$/gm, "").match(/(^|[^A-Za-z0-9_])shared_focus[ \t]*=[ \t]*\{/g) || []).length;
    let victim = "", vanillaCount = 0, vanillaRaw = 0, filesWithGroups = 0;
    for (const f of fs.readdirSync(NF).filter((x) => x.endsWith(".txt"))) {
      const txt = fs.readFileSync(path.join(NF, f), "latin1");
      const n = defs(txt);
      if (!n) continue;
      filesWithGroups++;
      if (!victim) { victim = f; vanillaCount = n; vanillaRaw = (txt.match(/(^|[^A-Za-z0-9_])shared_focus[ \t]*=[ \t]*\{/g) || []).length; }
    }
    console.log(`  ${filesWithGroups} vanilla national_focus files define shared_focus groups; using ${victim} (${vanillaCount})`);
    rec("vanilla really does ship shared-focus files to collide with", filesWithGroups > 0 && !!victim, filesWithGroups);
    rec("…and that file really does carry a commented-out definition to be fooled by",
      vanillaRaw > vanillaCount, { raw: vanillaRaw, live: vanillaCount });

    api = await serve(createApp());

    console.log("\n[control] with no collision the picker offers vanilla's groups");
    const bare = mkMod(null);
    {
      const r = await api.available(bare.dir);
      const v = (r.groups || []).find((g) => g.file === victim);
      rec("the endpoint answers", r.ok === true, r);
      rec(`…offering vanilla's ${victim}`, !!v, (r.groups || []).slice(0, 3));
      rec("…with vanilla's live group count, ignoring the commented-out one",
        v && v.count === vanillaCount, { got: v && v.count, want: vanillaCount, raw: vanillaRaw });
    }

    console.log("\n[the mod ships that filename] its file is the one the game loads");
    const own = mkMod(null);
    fs.writeFileSync(path.join(own.dir, "common", "national_focus", victim),
      group("zz_mine_one", 1) + "\n" + group("zz_mine_two", 3) + "\n", "utf8");
    {
      const r = await api.available(own.dir);
      const v = (r.groups || []).find((g) => g.file === victim);
      rec("the endpoint answers", r.ok === true, r);
      rec("…and that filename resolves to the MOD's file", v && /^zz_mine/.test(v.rootId || ""), v);
      rec("…with the mod's group count, not vanilla's", v && v.count === 2, { got: v && v.count, want: 2 });
      rec("…while vanilla's OTHER files are still offered", (r.groups || []).length > 1, (r.groups || []).length);
    }

    console.log("\n[a dependency ships it] the base mod beats vanilla, and the add-on beats the base");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "national_focus", victim),
        group("zz_base_one", 1) + "\n", "utf8");

      const addon = mkMod(base.name);
      const r1 = await api.available(addon.dir);
      const v1 = (r1.groups || []).find((g) => g.file === victim);
      rec("an add-on sees the BASE MOD's file, not vanilla's", v1 && v1.rootId === "zz_base_one", v1);

      fs.writeFileSync(path.join(addon.dir, "common", "national_focus", victim),
        group("zz_addon_one", 1) + "\n" + group("zz_addon_two", 3) + "\n", "utf8");
      const r2 = await api.available(addon.dir);
      const v2 = (r2.groups || []).find((g) => g.file === victim);
      rec("…and its own file beats the base mod's", v2 && v2.rootId === "zz_addon_one", v2);
      rec("…with its own count", v2 && v2.count === 2, { got: v2 && v2.count, want: 2 });
    }

    console.log("\n[the sibling reader] /api/focus/shared resolves against the same files");
    {
      // The read-only display of the sub-trees a tree pulls in. Same loop, same dedupe — it must agree.
      const tree = mkMod(null);
      fs.writeFileSync(path.join(tree.dir, "common", "national_focus", victim),
        group("zz_mine_one", 1) + "\n", "utf8");
      fs.writeFileSync(path.join(tree.dir, "common", "national_focus", "zz_tree.txt"), [
        "focus_tree = {",
        "\tid = zz_tree",
        "\tcountry = { factor = 0 }",
        "\tshared_focus = zz_mine_one",
        "\tfocus = {",
        "\t\tid = zz_root",
        "\t\ticon = GFX_goal_generic_demand_territory",
        "\t\tx = 0",
        "\t\ty = 0",
        "\t\tcost = 10",
        "\t\tcompletion_reward = { add_political_power = 10 }",
        "\t}",
        "}",
        "",
      ].join("\n"), "utf8");
      const r = await api.shared(tree.dir, "common/national_focus/zz_tree.txt");
      rec("the endpoint answers", r.ok === true, r);
      rec("…resolving the shared focus the MOD defines",
        (r.focuses || []).some((f) => (f.id || f.focus) === "zz_mine_one"),
        (r.focuses || []).slice(0, 3));
    }

    console.log("\n[the uniqueness check] ids in a file the mod replaced are not 'already taken'");
    {
      // /api/focus/all-ids decides whether an id collides. It walks the same folder and never asked which
      // root last ships each basename, so a mod replacing baltic_shared.txt was told its ids clash with the
      // 60 in vanilla's copy — a copy the game does not load. Cry-wolf on a warning is its own failure.
      const before = await api.allIds(bare.dir);
      const inhBefore = Object.keys((before && before.inherited) || {}).length;
      rec("the endpoint answers", before.ok === true, before);
      rec("control: vanilla's ids are inherited when nothing shadows them",
        inhBefore > 100, inhBefore);

      const shadow = mkMod(null);
      fs.writeFileSync(path.join(shadow.dir, "common", "national_focus", victim),
        group("zz_only_mine", 1) + "\n", "utf8");
      const after = await api.allIds(shadow.dir);
      const inh = (after && after.inherited) || {};
      const fromVictim = Object.keys(inh).filter((k) => inh[k] === victim).length;
      rec("…and none of them survive once the mod ships that filename", fromVictim === 0,
        { stillInherited: fromVictim, sample: Object.keys(inh).filter((k) => inh[k] === victim).slice(0, 3) });
      rec("…while ids from vanilla's OTHER files are untouched",
        Object.keys(inh).length > 0 && Object.keys(inh).length < inhBefore,
        { after: Object.keys(inh).length, before: inhBefore });
      rec("…and the mod's own id is reported as its own",
        Object.keys((after && after.mine) || {}).includes("zz_only_mine"), (after && after.mine) || {});
    }

    api.stop(); api = null;
    console.log(`\n=== shared focus basename precedence: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
