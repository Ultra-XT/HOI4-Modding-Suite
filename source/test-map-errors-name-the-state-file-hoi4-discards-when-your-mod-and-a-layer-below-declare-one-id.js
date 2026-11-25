// Map Errors names the state file HOI4 discards when your mod and a layer below it both declare one state id.
// #a-state-id-two-layers-declare
//
// THE DEFECT. duplicate_state_id (findStateFileConflicts) reads ONE folder, the mod's. A state id declared by a mod file and by a
// differently named file in the base game or a dependency was reported nowhere, though HOI4 loads both files and keeps only one
// of the two states:
//   * hoi4.exe 1.19.2 (dumpbin, scratchpad batch10/leaks/engine): 0x1424C5170 (virtualfilesystem_physfs.cpp) puts every mounted
//     layer's history/states names into ONE std::map compared with memcmp, a name already there is not added again, and the map
//     is walked in order; 0x140AAC160 inserts the files' blocks in that order; 0x140AAD450 (statetemplate.cpp, batch 9) keeps
//     the first block for an id and destroys a later one, logging "State ID conflict: Both …" (0x140AAD72D).
//   * The HOI4 wiki (State modding) says the same from the modder's side: the file name is not what decides how a state file
//     is handled, and renaming an existing file "can make it so that both the base game and the mod's state files will get read".
// MEASURED (read-only census, scratchpad batch11/dupes/probe-own-deps.js): the owner's kurdistan ships no replace_path over the
// base game and declares ids 2, 3 and 677 a second time — its 2-Aleppo.txt sorts before the game's 2-Italy.txt, while the game's
// 3-Swiss Plateau.txt and 677-Aleppo.txt sort before its 3-Syria.txt and 677-Auckland.txt — and GET /api/map/validate on the
// base commit said nothing about any of them. The six shipping maps have none.
//
// THE FIX. buildMapModel lists, from the layers it merges states from (replace_path applied), the ids more than one loaded file
// declares where those files stand in more than one layer and the mod ships at least one of them; validateMapModel reports each
// as duplicate_state_id_across_layers, a WARNING (the game logs the conflict and loads on), naming the file HOI4 keeps and the
// file or files it discards. A pair inside the mod alone stays duplicate_state_id's.
//
// Through the page's own request, GET /api/map/validate?modPath, over testlib-two-layer-map.js, each case checked against an
// independent reading of the files in the engine's order.
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

const W = lib.makeWorld("b11-dupes-across");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const RULE = "duplicate_state_id_across_layers";

/** Each state id's declarations in what HOI4 loads, read independently of Nova's layers: roots low -> high, one list of names (a
 *  higher root replaces the same name, compared without case as Nova's file layers do), sorted by UTF-8 bytes, each file counted
 *  once per id. id -> [{ root, file }] in load order. */
function engineDeclarations(roots) {
  const byName = new Map();
  for (const r of roots) {
    let names = [];
    try { names = fs.readdirSync(path.join(r, "history", "states")).filter((f) => /\.txt$/i.test(f)); } catch (_) { names = []; }
    for (const f of names) byName.set(f.toLowerCase(), { root: r, file: f });
  }
  const list = [...byName.values()].sort((a, b) => Buffer.compare(Buffer.from(a.file, "utf8"), Buffer.from(b.file, "utf8")));
  const out = new Map();
  for (const e of list) {
    const seen = new Set();
    for (const s of md.parseStatesText(fs.readFileSync(path.join(e.root, "history", "states", e.file), "utf8"))) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (!out.has(s.id)) out.set(s.id, []);
      out.get(s.id).push(e);
    }
  }
  return out;
}
const probs = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule);
const listed = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const keptClause = (msg) => { const m = /keeps the one in (.+?) and discards/.exec(String(msg || "")); return m ? m[1] : ""; };
const discardedClause = (msg) => { const m = /discards the ones? in (.+?) \(only a launch started with -debug writes "State ID conflict"/.exec(String(msg || "")); return m ? m[1] : ""; };
const fileOf = (who) => who.replace(/^your /, "").replace(/^.*'s /, "");

/** The one problem Map Errors must show for `id`: a warning naming exactly the file kept and the files discarded. */
function checkReported(title, v, id, keptWho, discardedWho) {
  const ps = probs(v, RULE).filter((p) => p.stateId === id);
  rec(`⭐⭐⭐ ${title}: Map Errors reports state ${id} once`, ps.length === 1, (v && v.problems || []).map((p) => p.rule));
  const p = ps[0] || {};
  rec("…as a warning: the game logs the conflict and loads on", p.severity === "warning", p.severity);
  rec(`⭐⭐ …naming ${keptWho} as the file HOI4 keeps`, p.keptFile === fileOf(keptWho) && keptClause(p.message) === keptWho, { keptFile: p.keptFile, clause: keptClause(p.message), message: p.message });
  rec(`⭐⭐⭐ …and exactly ${listed(discardedWho)} as what it discards`,
    JSON.stringify(p.discardedFiles) === JSON.stringify(discardedWho.map(fileOf)) && discardedClause(p.message) === listed(discardedWho),
    { discardedFiles: p.discardedFiles, clause: discardedClause(p.message), message: p.message });
  rec("…and names no Auto-fix, which does not repair it (so the popup offers no button for it)", !!p.message && !/\bAuto-fix\b/.test(p.message), p.message);
  return ps[0] || null;
}

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== 0. THE CONTROL: the engine reading of the fixture ===");
    {
      const e = engineDeclarations([W.GAME]);
      rec("the game alone declares each of its three states once", e.size === 3 && [...e.values()].every((d) => d.length === 1), [...e].map(([id, d]) => [id, d.length]));
      const order = ["2-A.txt", "2-B.txt", "2-M.txt", "2-Z.txt", "2-a.txt"];
      rec("byte order: " + order.join(" < "), order.every((n, i) => i === 0 || Buffer.compare(Buffer.from(order[i - 1]), Buffer.from(n)) < 0));
    }

    console.log("\n=== 1. your file sorts after the game's: HOI4 keeps the game's state and discards yours ===");
    {
      const mod = W.mod("Across later", { "history/states/2-Z.txt": lib.st(2, "5") });
      const d = engineDeclarations([W.GAME, mod]).get(2) || [];
      rec("THE ENGINE: state 2 is declared by the game's 2-B.txt, then the mod's 2-Z.txt", d.map((x) => x.file).join() === "2-B.txt,2-Z.txt", d.map((x) => x.file));
      const v = await S.validate(mod);
      const p = checkReported("your 2-Z.txt behind the game's 2-B.txt", v, 2, "the base game's 2-B.txt", ["your 2-Z.txt"]);
      rec("…and says how to load yours: a file of the same name replaces the game's", !!p && /file named 2-B\.txt/.test(p.message), p && p.message);
      rec("⭐⭐ it is not in the FATAL set, so Save is not stopped for it", labels.isFatalRule(RULE) === false);
      const g = p ? await lib.saveGate({ ok: true, problems: [p], errors: 0, warnings: 1 }) : null;
      rec("…and the real Save gate, handed this warning alone, stops for nothing", !!g && g.crashes === 0 && !g.armed, g || "no problem to hand it");
    }

    console.log("\n=== 2. your file sorts first: HOI4 keeps yours and discards the game's ===");
    {
      const mod = W.mod("Across earlier", { "history/states/2-A.txt": lib.st(2, "2 5") });
      const d = engineDeclarations([W.GAME, mod]).get(2) || [];
      rec("THE ENGINE: state 2 is declared by the mod's 2-A.txt, then the game's 2-B.txt", d.map((x) => x.file).join() === "2-A.txt,2-B.txt", d.map((x) => x.file));
      const v = await S.validate(mod);
      const p = checkReported("your 2-A.txt before the game's 2-B.txt", v, 2, "your 2-A.txt", ["the base game's 2-B.txt"]);
      rec("…and says how to replace the game's state instead: name your file 2-B.txt", !!p && /name your file 2-B\.txt/.test(p.message), p && p.message);
    }

    console.log("\n=== 3. byte order, not alphabetical: \"2-a.txt\" sorts after \"2-B.txt\" ===");
    {
      const mod = W.mod("Across lowercase", { "history/states/2-a.txt": lib.st(2, "5") });
      const d = engineDeclarations([W.GAME, mod]).get(2) || [];
      rec("THE ENGINE: the game's 2-B.txt comes first", d.map((x) => x.file).join() === "2-B.txt,2-a.txt", d.map((x) => x.file));
      checkReported("your 2-a.txt behind the game's 2-B.txt", await S.validate(mod), 2, "the base game's 2-B.txt", ["your 2-a.txt"]);
    }

    console.log("\n=== 4. an add-on over a dependency over the game ===");
    {
      W.mod("Across dependency", { "history/states/2-M.txt": lib.st(2, "5") });
      const dep = path.join(W.MODS, fs.readdirSync(W.MODS).find((n) => fs.readFileSync(path.join(W.MODS, n, "descriptor.mod"), "utf8").includes('"Across dependency"')));
      const addon = W.mod("Across addon", { "history/states/2-Z.txt": lib.st(2, "5") }, ["Across dependency"]);
      const d = engineDeclarations([W.GAME, dep, addon]).get(2) || [];
      rec("THE ENGINE: the game's 2-B.txt, the dependency's 2-M.txt, then the add-on's 2-Z.txt", d.map((x) => x.file).join() === "2-B.txt,2-M.txt,2-Z.txt", d.map((x) => x.file));
      checkReported("the add-on's 2-Z.txt behind the game's and the dependency's", await S.validate(addon), 2,
        "the base game's 2-B.txt", ["Across dependency's 2-M.txt", "your 2-Z.txt"]);
      const plain = W.mod("Across addon plain", {}, ["Across dependency"]);
      const vp = await S.validate(plain);
      rec("THE CONTROL: an add-on that ships no state file is not told of its dependency's pair with the game", probs(vp, RULE).length === 0, probs(vp, RULE));
    }

    console.log("\n=== 5. THE CONTROLS: a state id HOI4 does not load twice across layers is not reported ===");
    {
      const same = W.mod("Across same name", { "history/states/2-B.txt": lib.st(2, "2 5") });
      const vs = await S.validate(same);
      rec("a mod's 2-B.txt replaces the game's file of that name, so state 2 is declared once", probs(vs, RULE).length === 0 && probs(vs, "duplicate_state_id").length === 0, probs(vs, RULE));
      const repl = W.mod("Across replace_path", {
        "descriptor.mod": 'name="Across replace_path"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-A.txt": lib.st(1, "4"), "history/states/2-Z.txt": lib.st(2, "2 5"), "history/states/3-C.txt": lib.st(3, "3"),
      });
      const vr = await S.validate(repl);
      rec("a mod declaring replace_path=\"history/states\" loads none of the game's state files", probs(vr, RULE).length === 0, probs(vr, RULE));
      const pair = W.mod("Across own pair", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/2-Z.txt": lib.st(2, "5") });
      const vo = await S.validate(pair);
      rec("a pair inside your own mod is duplicate_state_id's, and only its", probs(vo, "duplicate_state_id").length === 1 && probs(vo, RULE).length === 0,
        { dup: probs(vo, "duplicate_state_id").length, across: probs(vo, RULE) });
    }

    console.log("\n=== 6. the label ===");
    {
      const keys = Object.keys(labels.LABELS);
      rec("the rule has a friendly label", !!labels.LABELS[RULE], labels.LABELS[RULE]);
      rec("…placed directly after duplicate_state_id's", keys.indexOf(RULE) > 0 && keys.indexOf(RULE) === keys.indexOf("duplicate_state_id") + 1, keys.slice(keys.indexOf("duplicate_state_id"), keys.indexOf("duplicate_state_id") + 3));
      rec("…and no Auto-fix hint, as nothing repairs it for you", labels.mapRuleFixHint(RULE) === "");
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== Map Errors names the state file HOI4 discards when your mod and a layer below declare one id: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
