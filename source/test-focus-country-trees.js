/*
 * Guards /api/focus/country-trees — the data behind the focus tab's "open a country's tree" dropdown.
 * Verifies it discovers real countries from the vanilla national_focus folder, with tags, tree ids,
 * file paths, and (best-effort) localized names. Run: node test-focus-country-trees.js
 */
const { createApp } = require("./server.js");

const PORT = 3603, BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  try {
    console.log("\nFocus country-trees directory:");
    const root = await fetch(BASE + "/api/root").then((x) => x.json());
    const gameRoot = root.hoi4GameRoot;
    if (!gameRoot) { ok(false, "game root resolved (needed for this test)"); throw new Error("no game root"); }

    const r = await fetch(BASE + "/api/focus/country-trees?modPath=" + encodeURIComponent(gameRoot)).then((x) => x.json());
    const trees = r.trees || [];
    ok(trees.length >= 30, "found many country trees (>=30)", trees.length);

    const ger = trees.find((t) => t.tag === "GER");
    ok(!!ger, "Germany (GER) is present");
    ok(ger && ger.fileName === "germany.txt", "GER maps to germany.txt", ger && ger.fileName);
    ok(ger && ger.treeId === "german_focus", "GER tree id parsed (german_focus)", ger && ger.treeId);
    ok(ger && typeof ger.file === "string" && ger.file.toLowerCase().endsWith("germany.txt"), "GER carries an absolute file path", ger && ger.file);

    // Every entry has a file to open; a COUNTRY entry has a valid tag, a GENERIC entry has none.
    ok(trees.every((t) => t.file && (t.generic ? t.tag === "" : /^[A-Z]{2,3}$/.test(t.tag))), "every entry has a file; country entries a tag, generic ones none");

    // The GENERIC/fallback tree must be listed now (so it can be opened + edited) — it used to be skipped.
    const generics = trees.filter((t) => t.generic);
    ok(generics.length >= 1, "the generic/fallback tree is listed (was previously hidden)", generics.length);
    const gen = generics.find((t) => t.treeId === "generic_focus");
    ok(!!gen, "vanilla generic_focus tree present as a generic entry");
    ok(gen && gen.tag === "" && gen.generic === true, "generic tree has NO country tag + a generic flag", gen);
    ok(gen && gen.isDefault === true, "vanilla generic tree flagged default = yes", gen && gen.isDefault);
    ok(trees.find((t) => t.tag === "GER") !== undefined && generics.every((g) => g.tag === ""), "a default/generic tree never steals a country tag (GER still its own)");

    // A few more well-known majors should be discoverable.
    ["USA", "SOV", "ITA", "JAP"].forEach((tag) => {
      ok(trees.some((t) => t.tag === tag), `${tag} discovered`);
    });

    // Best-effort localized name (at least some resolved).
    ok(trees.some((t) => t.name && t.name.length > 0), "at least some trees have a localized country name");

    console.log("\n  " + pass + " passed, " + fail + " failed");
  } catch (e) { console.error(e.message); fail++; } finally {
    server.close(); process.exit(fail ? 1 : 0);
  }
})();
