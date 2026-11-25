// A renumbered state's FILE NAME follows the key it now has — and a name the modder chose is left alone.
// #a-renumbered-state-file-is-named-for-the-key-it-now-has
//
// Auto-fix closes a state-id gap by sliding the highest state down (renumberStateId), which renames
// `<oldId>-<part>.txt` to `<newId>-<the SAME part>.txt`. The state's name key then moves to STATE_<newId>
// (#a-renumbered-state-keeps-a-name-of-its-own, rekeyRenumberedStateNames in server.js), and the file name
// was never re-derived. Measured on the map built by hand on 2026-09-16: history/states/1093-STATE_1094.txt,
// whose block reads `id = 1093` and `name = "STATE_1093"` — a file named after a key nothing declares any
// more, and after a state id that is now a DIFFERENT state. A replace_path probe the same night produced
// five more (1-STATE_1084.txt, 2-STATE_1082.txt, …).
//
// WHICH NAME PART IS RIGHT was decided from the corpus, not guessed. Census of every installed map's
// history/states file names against the key each block declares and that key's English localisation
// (scratchpad/batch13/small/census-state-filenames.js, run 2026-09-16 over the base game + 15 workshop
// mods = 8,746 state files):
//
//     <id>-<the key>   0        <id>-<a human label>  8,746   (4,851 of them exactly the English loc,
//                                                              3,750 some other label: 1-France.txt is
//                                                              loc "Corse", 10-Poland.txt is "Mazovia",
//                                                              OWB ships 1408 × "<id>-State.txt")
//
// So NO shipping map names a state file after its key — the part is a human label, and HOI4 reads none of
// it (history/states is loaded by filename only for overriding). Nova's own createState, on the other hand,
// writes `<id>-<key>.txt` (measured below from the file it writes). That gives the rule both halves:
//
//   * a file whose name part IS a STATE_<n> key is one Nova named -> re-derive it from the key the state
//     now has, so the name never points at another state's id;
//   * anything else is the modder's own label -> never rewritten into something they did not choose.
//
// The refused branch matters too: when the key does NOT move (the modder's own localisation names it), the
// file must keep the part, because the part still is the state's key.
//
// Requests are the page's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }),
// queueWrite("/api/map/move-province", { provinceId, toStateId }), POST /api/map/auto-fix { modPath }.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail === undefined ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b13-state-file-names");
const { createApp } = require("./server.js");

const BOM = String.fromCharCode(0xfeff);
const statesDir = (mod) => path.join(mod, "history", "states");
const fileNames = (mod) => { try { return fs.readdirSync(statesDir(mod)).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { return []; } };
/** [{ id, key }] for every state block in one file, comments masked. */
const blocksIn = (mod, f) => {
  let txt = ""; try { txt = fs.readFileSync(path.join(statesDir(mod), f), "utf8"); } catch (_) { return []; }
  const bare = txt.replace(/#[^\n]*/g, "");
  const out = [];
  const re = /state\s*=\s*\{/g;
  let m;
  while ((m = re.exec(bare)) !== null) {
    let depth = 0, end = bare.length;
    for (let i = bare.indexOf("{", m.index); i < bare.length; i++) {
      if (bare[i] === "{") depth++;
      else if (bare[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = bare.slice(m.index, end);
    const id = /\bid\s*=\s*(\d+)/.exec(body), key = /\bname\s*=\s*"([^"]*)"/.exec(body);
    out.push({ id: id ? Number(id[1]) : null, key: key ? key[1] : null });
    re.lastIndex = end;
  }
  return out;
};
/** The mod's file that declares `id`, and what its name says. */
const fileOf = (mod, id) => {
  for (const f of fileNames(mod)) {
    const bl = blocksIn(mod, f);
    if (!bl.some((b) => b.id === id)) continue;
    const m = /^(\d+)(?:-(.*))?\.txt$/i.exec(f);
    return { file: f, prefix: m ? Number(m[1]) : null, part: m && m[2] != null ? m[2] : null, blocks: bl };
  }
  return null;
};
/** THE INVARIANT, derived from each file rather than from a list of names: a state file whose name part is a
 *  STATE_<n> key (the shape Nova's own writer uses) must name the key the block inside it declares. */
const filesNamedForAKeyTheyDoNotDeclare = (mod) => {
  const out = [];
  for (const f of fileNames(mod)) {
    const m = /^(\d+)-(.*)\.txt$/i.exec(f);
    if (!m || !/^STATE_\d+$/i.test(m[2])) continue;       // a human label is the modder's, not Nova's to judge
    const bl = blocksIn(mod, f);
    if (bl.length !== 1) continue;                        // one file, several states: the name is about none of them
    if (bl[0].key !== m[2]) out.push({ file: f, declares: bl[0].key, id: bl[0].id });
  }
  return out;
};
/** Key-shaped (STATE_<n>) name parts used by more than one state file. */
const keyShapedPartsUsedTwice = (mod) => {
  const by = new Map();
  for (const f of fileNames(mod)) {
    const m = /^(\d+)-(.*)\.txt$/i.exec(f);
    if (!m || !/^STATE_\d+$/i.test(m[2])) continue;
    if (!by.has(m[2])) by.set(m[2], []);
    by.get(m[2]).push(f);
  }
  return [...by.entries()].filter(([, fs2]) => fs2.length > 1);
};
const stateKeys = (model) => (model.states || []).map((s) => `${s.id}=${s.name}`);

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    const post = (ep, body, mod) => srv.post(ep, body, mod).then((r) => ({ s: r.status, b: r.body }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);

    console.log("0. Nova's OWN naming convention, measured from the file createState writes");
    let novaPart = null;
    {
      const mod = world.mod("b13 convention", {});
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const f = fileOf(mod, c.b.id);
      novaPart = f && f.part;
      rec("\"+ New state\" writes <id>-<its name key>.txt", c.b.ok === true && f && f.prefix === c.b.id && f.part === c.b.name,
        { id: c.b.id, key: c.b.name, file: f && f.file });
    }

    console.log("\n1. ⭐⭐⭐ A state Nova named, renumbered by Auto-fix: the file follows the key");
    {
      const mod = world.mod("b13 nova named", {});
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const b = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("two states are created, 4 and 5, keyed STATE_4 and STATE_5", a.b.id === 4 && b.b.id === 5 && a.b.name === "STATE_4" && b.b.name === "STATE_5", { a: a.b.name, b: b.b.name });
      rec("a province moves into state 5, leaving 4 empty", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const before = fileOf(mod, 5);
      rec("state 5's file is 5-STATE_5.txt on disk before the click", before && before.prefix === 5 && before.part === "STATE_5", before);

      const fx = await srv.autoFix(mod);
      const f = (fx.body.fixes || {});
      rec("POSITIVE CONTROL: Auto-fix deletes the empty state 4 and renumbers 5 into it", fx.status === 200
        && ((f.emptyStates || {}).deleted || []).includes(4)
        && JSON.stringify((f.stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]),
        { status: fx.status, stateGaps: f.stateGaps, emptyStates: f.emptyStates, error: fx.body.error });
      rec("POSITIVE CONTROL: …and the name key really moves to STATE_4", JSON.stringify((fx.body.stateNameKeys || {}).renamed) === JSON.stringify([{ stateId: 4, from: "STATE_5", to: "STATE_4" }]), fx.body.stateNameKeys);

      const after = fileOf(mod, 4);
      rec("⭐⭐⭐ the state's file is named for the key it now has, not the id it came from", after && after.part === "STATE_4",
        { file: after && after.file, keyOnDisk: after && after.blocks[0] && after.blocks[0].key, files: fileNames(mod) });
      rec("⭐⭐ …and the response SAYS the file was renamed, rather than doing it silently",
        JSON.stringify((fx.body.stateNameKeys || {}).filesRenamed) === JSON.stringify([{ stateId: 4, from: "4-STATE_5.txt", to: "4-STATE_4.txt" }]), (fx.body.stateNameKeys || {}).filesRenamed);
      rec("⭐⭐ …with the new id as its prefix", after && after.prefix === 4, after && after.file);
      rec("⭐⭐ no file in the mod is named for a key it does not declare", filesNamedForAKeyTheyDoNotDeclare(mod).length === 0, filesNamedForAKeyTheyDoNotDeclare(mod));
      rec("⭐ the old name is gone (2-B.txt is there because moving the province materialised the base state)", !fileNames(mod).includes("5-STATE_5.txt"), fileNames(mod));
      rec("⭐ the state itself is untouched: id 4, key STATE_4, still owns its province", await (async () => {
        const s = await stateOf(mod, 4); return !!s && s.name === "STATE_4" && (s.provinces || []).includes(5);
      })(), await stateOf(mod, 4));

      console.log("   …and the next \"+ New state\" cannot collide with it");
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("the new state takes id 5 and writes its own 5-STATE_5.txt", c.b.id === 5 && (fileOf(mod, 5) || {}).part === "STATE_5", { id: c.b.id, files: fileNames(mod) });
      // Two files may share a HUMAN label — Old World Blues ships 1,408 named "<id>-State.txt" — but two files
      // carrying the same STATE_<n> part means one of them names a key it does not declare. On base this is where
      // 4-STATE_5.txt met the new state's own 5-STATE_5.txt.
      rec("⭐⭐⭐ no two state files carry the same key-shaped name", keyShapedPartsUsedTwice(mod).length === 0, { dupes: keyShapedPartsUsedTwice(mod), files: fileNames(mod) });
      rec("⭐⭐ …and state 4 and state 5 are still two different files", (fileOf(mod, 4) || {}).file !== (fileOf(mod, 5) || {}).file, [fileOf(mod, 4), fileOf(mod, 5)].map((x) => x && x.file));
      rec("…and no two states share a key", new Set(stateKeys(await model(mod)).map((x) => x.split("=")[1])).size === (await model(mod)).states.length, stateKeys(await model(mod)));
    }

    console.log("\n2. ⚠️⚠️ A file name the MODDER chose is never rewritten");
    {
      // The province is moved in through the page's own request rather than written into the fixture: a
      // province listed by two states is a problem of its own, and fixProvinceInTwoStates would delete the
      // state under test before the gap-closer ever ran (measured while writing this).
      const mod = world.mod("b13 modder named", {
        "history/states/4-Empty.txt": lib.st(4, ""),
        "history/states/5-East Azerbaijan.txt": lib.st(5, ""),
      });
      rec("a province moves into state 5, leaving 4 empty", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const fx = await srv.autoFix(mod);
      rec("POSITIVE CONTROL: Auto-fix renumbers 5 into the gap at 4", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]),
        { stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      rec("POSITIVE CONTROL: …and its key moves to STATE_4", JSON.stringify((fx.body.stateNameKeys || {}).renamed) === JSON.stringify([{ stateId: 4, from: "STATE_5", to: "STATE_4" }]), fx.body.stateNameKeys);
      const after = fileOf(mod, 4);
      rec("⚠️⚠️ the label the modder typed is kept, byte for byte", after && after.part === "East Azerbaijan", after && after.file);
      rec("⚠️ …under the new id", after && after.prefix === 4 && after.file === "4-East Azerbaijan.txt", after && after.file);
    }

    console.log("\n3. ⚠️ When the key does NOT move, the file keeps the key it still names");
    {
      const mod = world.mod("b13 key stays", {
        "history/states/4-Empty.txt": lib.st(4, ""),
        "history/states/5-STATE_5.txt": lib.st(5, ""),
        "localisation/english/my_state_names_l_english.yml": `${BOM}l_english:\n STATE_5:0 "Paris"\n`,
      });
      rec("a province moves into state 5, leaving 4 empty", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const fx = await srv.autoFix(mod);
      rec("POSITIVE CONTROL: Auto-fix renumbers 5 into the gap at 4", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]),
        { stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      rec("POSITIVE CONTROL: …and the key stays STATE_5, because the modder's own localisation names it",
        ((fx.body.stateNameKeys || {}).renamed || []).length === 0 && ((fx.body.stateNameKeys || {}).kept || []).some((k) => k.key === "STATE_5"), fx.body.stateNameKeys);
      const after = fileOf(mod, 4);
      rec("⚠️ the file still names the key the state still has", after && after.part === "STATE_5" && after.blocks[0].key === "STATE_5", after);
      rec("⚠️ no file is named for a key it does not declare", filesNamedForAKeyTheyDoNotDeclare(mod).length === 0, filesNamedForAKeyTheyDoNotDeclare(mod));
    }

    console.log("\n4. CONTROL: the invariant can fail — a file named for another state's key is reported");
    {
      const mod = world.mod("b13 control", { "history/states/9-STATE_8.txt": lib.st(9, "2") });
      rec("a hand-made 9-STATE_8.txt declaring STATE_9 is caught by the check", filesNamedForAKeyTheyDoNotDeclare(mod).length === 1, filesNamedForAKeyTheyDoNotDeclare(mod));
    }
  } catch (e) {
    rec("the run finished without throwing", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    try { world.cleanup(); } catch (_) {}
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
})();
