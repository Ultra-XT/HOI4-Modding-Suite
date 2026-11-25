// #vanilla-owns-itself — SELECTING THE BASE GAME IN RESEARCH SHOWED AN EMPTY TECH TREE.
//
// /api/technologies/catalog answered 552 technologies when asked with no modPath, and ZERO when asked for
// the game directory itself — which is what the Research maker sends when the user picks "Hearts of Iron IV"
// in the mod selector. The base game is a listed, supported choice there (server.js unshifts it with
// isVanilla:true, and research.js has a whole read-only mode for it), so this was not a corner: it was the
// one root every modder looks at first, showing nothing.
//
// The cause is the class CLAUDE.md and the 08-29 hunt both name: A CORRECT GUARD EVALUATED AFTER THE STATE
// IT GUARDS ON. `activeIsGameRootT` correctly stops the active root being re-scanned as editable mod content
// when it IS the game root — but it was declared BELOW the ownership pass, which therefore ran without it and
// registered every one of vanilla's filenames under the active root's higher index. Nothing then read them:
// the only scan that runs, scanRoot(gameRoot, false, 0), keeps only files still owned by index 0.
//
// ⭐ The equipment collector never had this. It records ownership DURING its scan and prunes afterwards, so a
// scan that is skipped leaves vanilla owning its own files — which is why the same request returned a full
// equipment list beside an empty tech list, and is the asymmetry that pointed at the bug.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53531;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanilla-owns-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

(async () => {
  let server;
  try {
    console.log("1. The ownership pass and the scan agree about the game root");
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    // Derived, not typed: find the declaration and both uses, and require the declaration to come first.
    const decl = SERVER.indexOf("const activeIsGameRootT =");
    const claim = SERVER.indexOf("noteTechFiles(activeRoot,");
    const scan = SERVER.indexOf("scanRoot(activeRoot, true, _activeIdxT)");
    rec("all three sites exist", decl > 0 && claim > 0 && scan > 0, { decl, claim, scan });
    rec("…and the guard is declared before the ownership claim", decl < claim,
      "declared after it, the claim runs unguarded — which is the whole bug");
    rec("the ownership claim is guarded", /if \(activeRoot && !activeIsGameRootT\) noteTechFiles\(activeRoot,/.test(SERVER));
    rec("…and so is the scan it pairs with", /if \(activeRoot && !activeIsGameRootT\) scanRoot\(activeRoot, true,/.test(SERVER),
      "a root that will not be scanned must not claim ownership either");

    console.log("\n2. The cache tag moved with the answer");
    // The empty result is written to disk under its own cacheKey, and fingerprintDirs hashes only each .txt's
    // size and mtime — neither of which this fix moves. Without a bump the fix is invisible to a warm cache.
    const tag = /fingerprintDirs\(dirs\b[^)]*\) \+ "\|tcp(\d+)"/.exec(SERVER);   // (any arguments after dirs)
    rec("there is a tech-catalog parser tag", !!tag, tag && tag[1]);
    rec("…and it is past tcp18, the tag in place when this broke", tag && Number(tag[1]) >= 19, tag && tag[1]);

    console.log("\n3. Measured against the real install");
    if (!fs.existsSync(path.join(GAME, "common", "technologies"))) {
      rec("a vanilla install to measure against", false, "cannot verify the counts");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const catalog = async (qs) => (await (await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog${qs}`)).json());

      // ⭐ THE CONTROL IS THE NO-modPath REQUEST. Without it "552" is just a number; with it, the two paths
      // into the same directory must agree, and "before equals after" cannot be confused with a probe that
      // measures nothing.
      const implicit = await catalog("");
      const nImplicit = (implicit.technologies || []).length;
      rec("the implicit-root control returns a real tree", nImplicit > 100, nImplicit + " techs");

      // Every spelling the client could produce. The bug was blind to all of them because the comparison
      // that misfired is path.resolve()d and lowercased — it matched fine; it was simply consulted too late.
      // ⏱️ TWO spellings, not three. Each distinct modPath STRING is its own cache key, so every spelling
      // costs a full catalogue build (~13s) — and a trailing separator is normalised by the same
      // path.resolve() call as the separator style, so the third bought no new evidence for a sixth of this
      // test's runtime. The bug was never spelling-specific: the comparison already resolved and lowercased
      // correctly, it was simply consulted too late.
      for (const [label, spelling] of [
        ["exact", GAME],
        ["backslashes", GAME.replace(/\//g, "\\")],
      ]) {
        const d = await catalog(`?modPath=${encodeURIComponent(spelling)}`);
        const n = (d.technologies || []).length;
        rec(`asking for the game root (${label}) returns the same tree`, n === nImplicit, `${n} vs ${nImplicit}`);
      }

      console.log("\n4. ⛔ …and they are still READ-ONLY. The guard exists for a reason.");
      // Re-scanning the game root as mod content is what the guard prevents: it would let the editor drag,
      // serialize and write corrupted blocks straight into the user's game install. Showing the techs must
      // not have bought visibility by removing that protection.
      const d = await catalog(`?modPath=${encodeURIComponent(GAME)}`);
      const techs = d.technologies || [];
      const editable = techs.filter((t) => t.isMod);
      rec("no base-game tech is flagged as the mod's own", editable.length === 0,
        editable.slice(0, 5).map((t) => t.id));

      console.log("\n5. A mod root is unaffected");
      // Derived from what is installed rather than named, so this keeps working on another machine.
      //
      // ⚠️ THE FIXTURE MUST HAVE THE PROPERTY BEING MEASURED. The first pick here was Novum Vexillum, and
      // "some tech is read-only" failed on it — correctly. NV ships its own copy of every one of vanilla's
      // tech filenames, and HOI4 replaces a common/ file wholesale at the same relative path, so it inherits
      // nothing and every tech really is its own. That is Nova getting #tech-catalog-ignores-same-filename
      // right, not a regression. So the mod is chosen by whether it INHERITS, and that is asserted before it
      // is measured — otherwise a mod that shadows everything would make this check quietly vacuous.
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const vanillaFiles = new Set(fs.readdirSync(path.join(GAME, "common", "technologies"))
        .filter((f) => f.toLowerCase().endsWith(".txt")).map((f) => f.toLowerCase()));
      let mod = null, inheritedCount = 0;
      try {
        for (const dirent of fs.readdirSync(WS)) {
          const p = path.join(WS, dirent);
          const td = path.join(p, "common", "technologies");
          if (!fs.existsSync(td)) continue;
          let desc = "";
          try { desc = fs.readFileSync(path.join(p, "descriptor.mod"), "utf8"); } catch (_) {}
          if (/replace_path\s*=\s*"common\/technologies"/.test(desc)) continue;
          const own = new Set(fs.readdirSync(td).filter((f) => f.toLowerCase().endsWith(".txt")).map((f) => f.toLowerCase()));
          const inherited = [...vanillaFiles].filter((f) => !own.has(f));
          if (inherited.length) { mod = p; inheritedCount = inherited.length; break; }
        }
      } catch (_) {}
      if (!mod) {
        rec("an installed mod that INHERITS part of vanilla's tree", false,
          "every installed mod shadows or replaces all of it — nothing here can measure inheritance");
      } else {
        rec("the fixture inherits some of vanilla's tech files", inheritedCount > 0,
          `${path.basename(mod)} leaves ${inheritedCount} of ${vanillaFiles.size} vanilla files in place`);
        const md = await catalog(`?modPath=${encodeURIComponent(mod)}`);
        const mt = md.technologies || [];
        rec("a mod root still returns its tree", mt.length > 100, `${mt.length} techs`);
        rec("…and it owns some of them", mt.some((t) => t.isMod),
          "if nothing is editable the mod cannot be edited at all");
        rec("…while the inherited base-game techs stay read-only", mt.some((t) => !t.isMod),
          "none of vanilla's tree is the mod's to rewrite");
      }
    }

    console.log(`\n=== the base game still has technologies: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
