/*
 * State-isolation guard: a save must write ONLY into the mod named by that request's modPath,
 * regardless of any global "active root". This is the invariant the activeRoot-middleware removal
 * was meant to guarantee — and the regression that broke it (idea/spirit loc paths resolved against
 * the stale global getActiveRoot() instead of the request's mod). Two mods, two saves, no crossover.
 *
 * Run: node test-loc-routing.js
 */
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

const PORT = 3601, BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const post = (r, b) => fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
const mkMod = (label) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iso-" + label + "-")); fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="' + label + '"\n'); return d; };
const locOf = (mod) => path.join(mod, "localisation", "english", "iso_l_english.yml");

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const modA = mkMod("A"), modB = mkMod("B");
  const spirit = (mod, id, name) => post("/api/ideas/upsert-definition", {
    modPath: mod, ideaId: id, targetRelativeFile: "common/ideas/iso.txt",
    targetLocalizationPath: "localisation/english/iso_l_english.yml",
    name, desc: "d", category: "country", mode: "create", selectedEffects: ["allowed = {\n\talways = yes\n}"],
  });
  try {
    console.log("\nPer-mod write isolation (no cross-contamination):");

    // Save a spirit into mod A, then a DIFFERENT spirit into mod B (interleaved roots).
    await spirit(modA, "spirit_in_a", "AlphaSpirit");
    await spirit(modB, "spirit_in_b", "BravoSpirit");
    // And one more into A again, to make sure B's save didn't leave the global root pointing at B.
    await spirit(modA, "second_in_a", "AlphaTwo");

    const aLoc = fs.existsSync(locOf(modA)) ? fs.readFileSync(locOf(modA), "utf8") : "";
    const bLoc = fs.existsSync(locOf(modB)) ? fs.readFileSync(locOf(modB), "utf8") : "";

    ok(/spirit_in_a:0\s+"AlphaSpirit"/.test(aLoc), "A's spirit loc landed in mod A", aLoc);
    ok(/second_in_a:0\s+"AlphaTwo"/.test(aLoc), "A's 2nd spirit loc landed in mod A (global root not stuck on B)", aLoc);
    ok(/spirit_in_b:0\s+"BravoSpirit"/.test(bLoc), "B's spirit loc landed in mod B", bLoc);

    // The crucial isolation asserts: no leakage either direction.
    ok(!/spirit_in_b|BravoSpirit/.test(aLoc), "mod A loc has NONE of mod B's entries");
    ok(!/spirit_in_a|AlphaSpirit|second_in_a|AlphaTwo/.test(bLoc), "mod B loc has NONE of mod A's entries");

    // The idea DEFINITIONS must likewise be in their own mod only.
    const aDef = fs.readFileSync(path.join(modA, "common/ideas/iso.txt"), "utf8");
    const bDef = fs.readFileSync(path.join(modB, "common/ideas/iso.txt"), "utf8");
    ok(/spirit_in_a/.test(aDef) && /second_in_a/.test(aDef) && !/spirit_in_b/.test(aDef), "mod A ideas file isolated");
    ok(/spirit_in_b/.test(bDef) && !/spirit_in_a/.test(bDef), "mod B ideas file isolated");

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) { console.error(e); fail++; } finally {
    // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(modA, { recursive: true, force: true }); fs.rmSync(modB, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
