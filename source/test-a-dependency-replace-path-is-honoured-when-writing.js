// ⛔ #always-pass-the-subpath — 22 MAP WRITERS IGNORED A DEPENDENCY'S replace_path.
//
// baseRootsFor(dependencyRoots, gameRoot, relPath) exists to honour replace_path: a root that replaces a
// folder hides every lower-priority root beneath it, because the game never loads those files. Called
// WITHOUT the third argument it returns every root, and the caller then materialises a base file the game
// does not use.
//
// Twenty-two call sites in map-data.js omitted it, every one of them looking under map/. The reader in the
// same file gets it right — buildMapModel passes "map" — so Nova read the overlay correctly and wrote as
// though it did not exist.
//
// What that did: an add-on depending on a total conversion that declares replace_path="map" and ships its
// own small railways.txt. Draw one railway and Nova materialised VANILLA's railways.txt instead — 909 rows,
// 3,123 of whose provinces do not exist in that mod — producing a file Nova's own validator immediately
// calls a crash. Measured after the fix: 2 rows, the dependency's own plus the new one.
//
// CLAUDE.md records this as a bug CLASS that was declared closed and reopened once already, with the rule
// in as many words: "Always pass the subpath."
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const roots = [];

try {
  console.log("\n-- ⭐ DERIVED: no map writer may ask for roots without naming the folder --");
  {
    // The real guard. One new call site written the old way reintroduces the whole class, and it would be
    // invisible until someone with an add-on hit it.
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const code = maskJsComments(src);
    const bare = [];
    const lines = code.split("\n"), raw = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("baseRootsFor(dependencyRoots, gameRoot)")) bare.push({ line: i + 1, text: raw[i].trim().slice(0, 120) });
    }
    ok(bare.length === 0, "every baseRootsFor call passes a subpath", { count: bare.length, bare: bare.slice(0, 5) });
  }

  console.log("\n-- and it does what the argument is for --");
  {
    const A = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bra-")); roots.push(A);
    const B = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brb-")); roots.push(B);
    fs.writeFileSync(path.join(A, "descriptor.mod"), 'version="1.0"\nname="A"\nreplace_path="map"\n', "utf8");
    fs.writeFileSync(path.join(B, "descriptor.mod"), 'version="1.0"\nname="B"\n', "utf8");
    // A replaces map/, so asking about map/ must stop at A and never reach the game root.
    const withSub = md.baseRootsFor([A], GAME, "map");
    const without = md.baseRootsFor([A], GAME);
    ok(without.length > withSub.length,
      "without a subpath every root comes back, game root included", { with: withSub.length, without: without.length });
    ok(!withSub.includes(GAME), "…with it, the replaced-away game root is cut", withSub);
    // A folder A does NOT replace is unaffected.
    ok(md.baseRootsFor([A], GAME, "history/states").includes(GAME),
      "…and a folder it does not replace still reaches the game");
  }

  console.log("\n-- end to end: a railway on an add-on --");
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tcbase-")); roots.push(base);
    fs.mkdirSync(path.join(base, "map"), { recursive: true });
    // #the-state-the-game-keeps — a total conversion replaces history/states with its map. Without it the game's own
    // 11-Kaunas.txt, 12-Latvia.txt and 13-Estonia.txt load beside this dependency's 11-S.txt..13-S.txt and sort first,
    // so HOI4 keeps the game's states 11-13 and provinces 11-13 belong to none (the model now says so, and the
    // railway writer refuses a province with no state). This test is about map/, not about which state loads.
    fs.writeFileSync(path.join(base, "descriptor.mod"), 'version="1.0"\nname="TCBase"\nreplace_path="map"\nreplace_path="history/states"\n', "utf8");
    fs.writeFileSync(path.join(base, "map", "railways.txt"), "1 2 11 12\n", "utf8");
    fs.writeFileSync(path.join(base, "map", "definition.csv"),
      ["0;0;0;0;land;false;unknown;0", "11;10;10;10;land;false;plains;1", "12;20;20;20;land;false;plains;1", "13;30;30;30;land;false;plains;1"].join("\n") + "\n", "utf8");
    fs.mkdirSync(path.join(base, "history", "states"), { recursive: true });
    for (const id of [11, 12, 13]) {
      fs.writeFileSync(path.join(base, "history", "states", `${id}-S.txt`),
        `state = {\n\tid = ${id}\n\tname = "S"\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`, "utf8");
    }
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tcaddon-")); roots.push(addon);
    fs.writeFileSync(path.join(addon, "descriptor.mod"), 'version="1.0"\nname="AddOn"\n', "utf8");

    const vanillaRows = fs.readFileSync(path.join(GAME, "map", "railways.txt"), "utf8").split(/\r?\n/).filter(Boolean).length;
    ok(vanillaRows > 500, `vanilla ships ${vanillaRows} railways — the file that must NOT be pulled in`, vanillaRows);

    const r = md.writeRailway({ modRoot: addon, gameRoot: GAME, dependencyRoots: [base], action: "add", level: 1, provinces: [11, 12, 13] });
    ok(r && r.changed, "the railway is written", r && r.error);

    const out = fs.readFileSync(path.join(addon, "map", "railways.txt"), "utf8").split(/\r?\n/).filter(Boolean);
    ok(out.length === 2, `the add-on's file has 2 rows, not ${vanillaRows}`, out.slice(0, 3));
    ok(out[0] === "1 2 11 12", "…the dependency's own railway came across", out[0]);
    ok(/^1 3 11 12 13/.test(out[1]), "…followed by the new one", out[1]);
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
