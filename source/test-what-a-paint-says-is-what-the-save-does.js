// WHAT A STATE PAINT SAYS, AND WHAT THE PAGE HOLDS OF ITS DATED LEVELS, IS WHAT THE SAVE DOES. (Review of the coast rows, F9, F10, F11, F12, F15, T13.)
//
//   F9   reconcileNavalCarry put a giver's dated levels back by writing over what it held, so a giver that took in dockyards while its own were
//        away lost those on the page, and Delete state under-counted.
//   F10  12 painted into a new state and on into state 3: the Save skips the first paint, and its carry starts from state 4, while the click's
//        note of the second named the new state. The page's state 3 read 9 dockyards (3 from 1939) where the file says 9 (11).
//   F11  in + New state's fill mode the click's dockyard line was written over at once by "Added province…".
//   F12  a state whose only buildings block is dated is mirrored as undated, a known limit of the page: with the panel sending only what changed
//        (#a-panel-edit-sends-what-the-modder-changed) a panel edit no longer takes that copy to the file.
//   F15  a paint back that empties the queue still said "unsaved — click Save", and Save answered "Nothing to save."
//   T13  the auto-delete line named nothing of the dockyards it takes, where Delete state's confirm names them.
//
// The page's own functions on a fake DOM (testlib-state-panel-page.js), its own flushMapSaves posting to map-data.js in this process. Binds no port.
// Run: node test-what-a-paint-says-is-what-the-save-does.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paint-says-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");
const { makeWorld, openPage, stateText, hist } = L;

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const J = (x) => JSON.stringify(x);
const model = (roots) => md.buildMapModel({ ...roots, cacheStableLayers: false });
let seq = 0;
const world = (opts, pageOpts) => { const roots = makeWorld(ROOT, `w${++seq}`, opts); return { roots, pg: openPage(md, roots, model(roots), pageOpts) }; };
const H4 = hist(7, [["1939.1.1", 8]]), H3 = hist(2, [["1939.1.1", 3]]);
const levels = (s) => ({ undated: Number((s.buildings || {}).dockyard) || 0, dated: (s.navalDated || []).filter((d) => d.key === "dockyard").map((d) => `${d.date} ${d.level}`) });
const fileLevels = (roots, sid) => levels(model(roots).states.find((s) => s.id === sid) || {});
function disagreements(pg, roots) {
  const out = [];
  const disk = new Map(model(roots).states.map((s) => [s.id, s]));
  for (const s of pg.ctx.model.states) {
    const d = disk.get(s.id);
    if (!d) { out.push(`state ${s.id} is on the page and not in the files`); continue; }
    if (J(levels(s)) !== J(levels(d))) out.push(`state ${s.id}: page ${J(levels(s))}, file ${J(levels(d))}`);
  }
  for (const id of disk.keys()) if (!pg.ctx.stateById.get(id)) out.push(`state ${id} is in the files and not on the page`);
  return out;
}
const deleteWords = (pg, sid) => pg.ctx.navalLevelsWords(pg.ctx.stateNavalLevels(pg.state(sid))).text;

(async () => {
  console.log("\n=== F9. A mirror the Save did not carry goes back to a giver that took in more since: summed, not written over ===");
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    const D = (level) => [{ date: "1939.1.1", key: "dockyard", level }];
    const s4 = { id: 4, provinces: [8], buildings: { dockyard: 5 }, navalDated: D(6) };      // state 7's 5, 6 from 1939, taken in while 4's own were away
    const s3 = { id: 3, provinces: [4, 5, 12], buildings: { dockyard: 9 }, navalDated: D(11) };
    const of = (id) => ({ 3: s3, 4: s4 })[id];
    const n = pg.ctx.reconcileNavalCarry(3, [{ from: 4, keys: { dockyard: 7 }, dated: D(8) }], [], of);
    ok(n === 1 && s4.buildings.dockyard === 12, "(the undated levels go back, summed, as they always did)", s4.buildings);
    ok(J(levels(s4).dated) === J(["1939.1.1 14"]), "⭐⭐ …and every moment of them: 14 from 1939, the 6 it took in and the 8 that came back", s4.navalDated);
    ok(pg.ctx.navalLevelsWords(pg.ctx.stateNavalLevels(s4)).text === "12 dockyards (14 from 1939.1.1)", "⭐ Delete state's words say what the file says", pg.ctx.navalLevelsWords(pg.ctx.stateNavalLevels(s4)).text);
    ok(s3.buildings.dockyard === 2 && J(levels(s3).dated) === J(["1939.1.1 3"]), "(…and the taker keeps its own)", s3);
    const own = { id: 4, provinces: [8], buildings: { dockyard: 5 }, navalDated: D(6) }, to = { id: 3, provinces: [12], buildings: { dockyard: 9 }, navalDated: D(6) };
    pg.ctx.reconcileNavalCarry(3, [{ from: 4, keys: { dockyard: 7 } }], [], (id) => ({ 3: to, 4: own })[id]);
    ok(J(levels(own).dated) === J(["1939.1.1 13"]), "⭐ undated levels going back lift the giver's later moment too: 6 + 7", own.navalDated);
    const empty = { id: 4, provinces: [8], buildings: {} }, took = { id: 3, provinces: [12], buildings: { dockyard: 9 }, navalDated: D(11) };
    pg.ctx.reconcileNavalCarry(3, [{ from: 4, keys: { dockyard: 7 }, dated: D(8) }], [], (id) => ({ 3: took, 4: empty })[id]);
    ok(empty.buildings.dockyard === 7 && J(levels(empty).dated) === J(["1939.1.1 8"]), "(a giver that took in nothing gets exactly its own back)", empty);
  }

  console.log("\n=== F10. A paint through a new state that is then gone: the next paint gives what the first took, and the page agrees with the file ===");
  {
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(12, 3);
    ok(!pg.state(n), "(the new state, emptied, is gone from the page)");
    ok(pg.queue().some((w) => w.body.toStateId === n), "(…and its paint is still queued, for the Save's purge)", pg.urls());
    const line = await pg.flush();
    ok(/Dropped 1 unsaved change/.test(pg.statuses.join("\n")) && /^SAVED 1 /.test(line), "(the Save drops that paint and runs the other)", line);
    ok(J(fileLevels(roots, 3)) === J({ undated: 9, dated: ["1939.1.1 11"] }) && J(fileLevels(roots, 4)) === J({ undated: 0, dated: [] }), "(the file: state 3 holds 9, 11 from 1939; state 4 none)", { three: fileLevels(roots, 3), four: fileLevels(roots, 4) });
    ok(J(levels(pg.state(3))) === J({ undated: 9, dated: ["1939.1.1 11"] }), "⭐⭐ the page's state 3 says the same", levels(pg.state(3)));
    ok(deleteWords(pg, 3) === "9 dockyards (11 from 1939.1.1)", "⭐ …so Delete state says it", deleteWords(pg, 3));
    ok(J(levels(pg.state(4))) === J({ undated: 0, dated: [] }), "⭐ …and state 4 holds none", levels(pg.state(4)));
  }
  {
    // on through two new states
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    const a = pg.newState(), b = pg.newState();
    pg.move(12, a);
    pg.move(12, b);
    pg.move(12, 3);
    await pg.flush();
    ok(!disagreements(pg, roots).length && J(fileLevels(roots, 3)) === J({ undated: 9, dated: ["1939.1.1 11"] }), "⭐ through two new states, gone in turn: the same", disagreements(pg, roots));
  }
  {
    // two givers into one new state, each province painted on: the second one out of it gave the new state's whole 12 at its click
    const { roots, pg } = world({ states: { 1: [2, 6], 2: [3], 3: [4, 5], 4: [8, 12], 5: [7, 13], 6: [9, 10, 11] }, history: { 4: H4, 3: H3, 5: hist(5, [["1939.1.1", 6]]) } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(13, n);
    pg.move(12, 3);
    pg.move(13, 3);
    const clicked = levels(pg.state(3));
    await pg.flush();
    ok(J(fileLevels(roots, 3)) === J({ undated: 14, dated: ["1939.1.1 17"] }), "(the file: state 3 holds its own and both givers')", fileLevels(roots, 3));
    ok(J(levels(pg.state(3))) === J(clicked) && !disagreements(pg, roots).length, "⭐⭐ two givers through one new state: the page holds what its clicks said and what the file says, each giver with none", disagreements(pg, roots));
  }
  {
    // control: a new state that stays
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(13, n);
    pg.move(13, 5);
    await pg.flush();
    ok(!/Dropped/.test(pg.statuses.join("\n")) && !disagreements(pg, roots).length, "(a new state that stays: nothing dropped, and the page and the files agree)", { s: pg.statuses.slice(-2), off: disagreements(pg, roots) });
  }

  console.log("\n=== F11. + New state's fill mode keeps what the click said ===");
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.ctx.moveTarget = n;
    pg.ctx.handleMoveClick(12, 4);
    ok(/^Added province 12 to new state -1 \(1 province\)\./.test(pg.last()), "(the fill line says it was added)", pg.last());
    ok(/\n⚓ Province 12 was STATE_4's last coast: its 7 dockyards \(8 from 1939\.1\.1\) go with it to New state 1/.test(pg.last()), "⭐⭐ …and the line left on screen still says the dockyards go with it", pg.last());
    pg.ctx.handleMoveClick(7, 2);
    // (⛔ #a-state-a-move-empties-is-merged-not-deleted — the state it empties goes into the one that took its land)
    ok(/^Added province 7 to new state -1 \(2 provinces\)\./.test(pg.last()) && /✅ Auto-fixed: merged the now-empty state STATE_2 into New state 1, which took its last province/.test(pg.last()), "⭐ …and that it emptied a state and merged it into the new one", pg.last());
    pg.ctx.handleMoveClick(9, 5);
    ok(pg.last() === "Added province 9 to new state -1 (3 provinces). Keep clicking to add more, or switch tools to stop.", "(a province that took nothing adds nothing to the line)", pg.last());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } }, { autoFix: false });
    const n = pg.newState();
    pg.ctx.moveTarget = n;
    pg.ctx.handleMoveClick(7, 2);
    ok(/^Added province 7 to new state -1/.test(pg.last()) && /⚠ STATE_2 is now EMPTY — HOI4 will not start a game with an empty state\. Auto-fix is OFF/.test(pg.last()), "⭐ with Auto-fix off, that the state it emptied is left empty", pg.last());
  }

  console.log("\n=== F12. A state whose only buildings block is dated: a panel edit no longer takes the page's copy to the file ===");
  {
    const DATED_ONLY = (l) => `\t\towner = AAA\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = ${l}\n\t\t\t}\n\t\t}\n`;
    {
      // the giver holds only a dated block (T7)
      const { roots, pg } = world({ history: { 4: DATED_ONLY(3), 3: H3 } });
      pg.move(12, 3);
      await pg.flush();
      const file = fileLevels(roots, 3);
      ok(J(file) === J({ undated: 2, dated: ["1939.1.1 6"] }), "(the Save carries the giver's dated 3 as dated: state 3 holds 2, 6 from 1939)", file);
      pg.inspect(4);
      pg.$("miManpowerInp").value = "4321";
      pg.saveStateButton();
      ok(!("buildings" in pg.queue()[0].body.fields), "⭐⭐ a population typed on state 3 sends no building, whatever the page's copy holds", pg.queue()[0].body.fields);
      await pg.flush();
      ok(J(fileLevels(roots, 3)) === J(file), "⭐⭐ …so the file's start date is not lifted to the page's 5", fileLevels(roots, 3));
    }
    {
      // the taker holds only a dated block (T7b)
      const { roots, pg } = world({ history: { 4: H4, 3: DATED_ONLY(3) } });
      pg.move(12, 3);
      await pg.flush();
      const file = fileLevels(roots, 3);
      pg.inspect(4);
      pg.$("miManpowerInp").value = "4321";
      pg.saveStateButton();
      await pg.flush();
      ok(J(fileLevels(roots, 3)) === J(file), "⭐⭐ …and a taker's dated level is not lowered to what the panel shows", { before: file, after: fileLevels(roots, 3) });
    }
    const corpus = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (fs.existsSync(path.join(corpus, "history", "states"))) {
      const m = model({ modRoot: corpus, gameRoot: corpus, dependencyRoots: [] });
      const n = m.states.filter((s) => s.buildingsDated && Number((s.buildings || {}).dockyard) > 0).length;
      ok(n === 0, "(the base game has no state of this shape holding a dockyard)", n);
    }
  }

  console.log("\n=== F15. A paint back that leaves nothing to save does not say to save ===");
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    ok(/\(unsaved — click 💾 Save\)/.test(pg.last()), "(the paint says it is unsaved)", pg.last());
    pg.move(12, 4);
    ok(!pg.queue().length && !/unsaved — click/.test(pg.last()) && /^Province 12 → state 4\n⚓ Province 12 is back in STATE_4/.test(pg.last()), "⭐⭐ the paint back, with the queue empty, does not", pg.last());
    ok(/Nothing to save/.test(await pg.flush()) || /nothing to save/i.test(pg.statuses.join("\n")), "(…and Save agrees)", pg.last());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(12, 4);
    ok(!pg.queue().length && !pg.state(n) && !/unsaved — click/.test(pg.last()), "⭐ …nor when it empties a new state and that goes too", { q: pg.urls(), s: pg.last() });
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(9, 6);
    pg.move(12, 3);
    pg.move(12, 4);
    ok(/^Province 12 → state 4 \(unsaved — click 💾 Save\)/.test(pg.last()), "(another write still queued: it says so)", pg.last());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.ctx.paintDiff.set(1, 2);
    pg.move(12, 4);
    ok(/^Province 12 → state 4 \(unsaved — click 💾 Save\)/.test(pg.last()), "(a stroke still staged: it says so)", pg.last());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(9, 6);
    pg.move(9, 5);
    ok(/\(unsaved — click 💾 Save\)/.test(pg.last()) && pg.queue().length === 2, "(a paint out and back that took nothing stays queued, and says so)", pg.last());
  }

  console.log("\n=== T13. The auto-delete line names the dockyards as Delete's confirm does ===");
  {
    const { pg } = world({ history: { 7: hist(5, [["1939.1.1", 6]]), 1: hist(1) } });
    ok(pg.erase(3) === true, "(the erase runs)");
    ok(/✅ Auto-fixed: deleted the now-empty state STATE_7\. STATE_7's 5 dockyards \(6 from 1939\.1\.1\) go with it\./.test(pg.last()), "⭐⭐ a plain erase of a state's only province says its 5, 6 from 1939, go with it", pg.last());
  }
  {
    // (⛔ #a-state-a-move-empties-is-merged-not-deleted — a state a MOVE empties is merged into the state that took its land, and the dockyard its
    // province could not take goes there with the rest of it; the Erase brush, whose land is sea, still deletes, and says its one dockyard as one)
    const { roots, pg } = world({ history: { 2: hist(1) } });
    pg.move(7, 1);
    ok(/✅ Auto-fixed: merged the now-empty state STATE_2 into STATE_1, which took its last province — its 1,000 people, its infrastructure, dockyard go with the land/.test(pg.last()) && !/goes with it/.test(pg.last()), "⭐ a move that empties a state whose dockyard could not go with its province says where it goes: into the state that took the land", pg.last());
    await pg.flush();
    ok(J(fileLevels(roots, 1)) === J({ undated: 1, dated: [] }) && !disagreements(pg, roots).length, "(…as the Save writes it: state 1 holds it, and the page agrees)", { file: fileLevels(roots, 1), off: disagreements(pg, roots) });
  }
  {
    const { roots, pg } = world({ history: { 2: hist(1, [["1939.1.1", 2]]) } });
    pg.move(7, 1);
    await pg.flush();
    ok(J(fileLevels(roots, 1)) === J({ undated: 1, dated: ["1939.1.1 2"] }) && !disagreements(pg, roots).length, "⭐⭐ …and every moment of them: the page's state 1 holds 1, and from 1939 2, as the file does", { file: fileLevels(roots, 1), page: levels(pg.state(1)), off: disagreements(pg, roots) });
  }
  {
    const { pg } = world({ history: { 7: hist(1) } });
    ok(pg.erase(3) === true && /✅ Auto-fixed: deleted the now-empty state STATE_7\. STATE_7's 1 dockyard goes with it\./.test(pg.last()), "⭐ an erase that deletes a state says its one dockyard as one", pg.last());
  }
  {
    const { roots, pg } = world({ history: { 7: hist(5), 1: hist(1) } });
    pg.move(3, 1);
    const merged = pg.last().split("\n").find((l) => /^✅ Auto-fixed/.test(l)) || "";
    ok(/⚓ Province 3 was STATE_7's last coast: its 5 dockyards go with it/.test(pg.last()) && /^✅ Auto-fixed: merged the now-empty state STATE_7 into STATE_1, which took its last province — its 1,000 people, its infrastructure go with the land/.test(merged) && !/dockyard/.test(merged), "⭐ what went with the coast is not said twice: the state merged holds none", pg.last());
    await pg.flush();
    ok(J(fileLevels(roots, 1)) === J({ undated: 6, dated: [] }) && !disagreements(pg, roots).length, "(…and the Save writes them once: state 1 holds its 1 and the 5, and the page agrees)", { file: fileLevels(roots, 1), off: disagreements(pg, roots) });
  }
  // ⛔ #a-handed-on-merge-gives-its-dockyards-once — A STATE MERGED INTO A NEW STATE THAT IS THEN EMPTIED: the merge goes on to the state that
  // took the new state's land (deleteEmptiedStates), and the Save, which never writes the new state, carries the merged state's dockyards ONCE,
  // with that merge. A paint that took the new state's last coast in between took them on with the coast on the page, and the hand-off gave them
  // again (review of the merge, H-LOST-1: the page's state 3 read 2 (4 from 1939) before the Save and 1 (4 from 1939) after it, the file 1 (2
  // from 1939)); and the click said the dockyard went with the new state, while the Save put it in the state that took the land (H-LOST-2).
  // 12 is state 4's only coast, 7 STATE_2's only province (inland), holding 1 dockyard and from 1939 2.
  for (const [label, coastTo] of [["the coast and the land into one state", 3], ["the coast into another state than the land", 5]]) {
    const { roots, pg } = world({ history: { 2: hist(1, [["1939.1.1", 2]]) } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(7, n);
    pg.move(12, coastTo);
    const line = pg.move(7, 3);
    const clicked = { three: levels(pg.state(3)), coast: levels(pg.state(coastTo)) };
    await pg.flush();
    const file = { three: fileLevels(roots, 3), coast: fileLevels(roots, coastTo) };
    ok(J(file.three) === J({ undated: 1, dated: ["1939.1.1 2"] }) && (coastTo === 3 || J(file.coast) === J({ undated: 0, dated: [] })), `(${label}: the file gives state 3 STATE_2's 1, 2 from 1939, once${coastTo === 3 ? "" : ", and state 5 none"})`, file);
    ok(J(clicked) === J(file), `⭐⭐⭐ ${label}: before the Save the page holds what the file holds`, { clicked, file });
    ok(!disagreements(pg, roots).length, `⭐⭐ ${label}: …and after it`, disagreements(pg, roots));
    const where = coastTo === 3 ? " — the one the paint of province 12 took there\\." : ", back from STATE_5, where the paint of province 12 took it\\.";
    ok(new RegExp(`✅ Auto-fixed: deleted the now-empty state New state 1 \\(HOI4 will not start a game with an empty state\\)\\. STATE_2, merged into it, goes into STATE_3 instead, and its 1 dockyard \\(2 from 1939\\.1\\.1\\) with it${where} Press Undo`).test(line) && !/goes with it/.test(line),
      `⭐ ${label}: the click says where the merged state's dockyards go`, line);
  }
  {
    const { roots, pg } = world({ history: { 2: hist(1) } });
    const n = pg.newState();
    pg.move(7, n);
    const line = pg.move(7, 3);
    ok(/✅ Auto-fixed: deleted the now-empty state New state 1 \(HOI4 will not start a game with an empty state\)\. STATE_2, merged into it, goes into STATE_3 instead, and its 1 dockyard with it\. Press Undo/.test(line) && !/goes with it/.test(line),
      "⭐⭐ a new state that held only the merge: the click says the merged state goes on with its dockyard, and no dockyard goes with the new state", line);
    await pg.flush();
    ok(J(fileLevels(roots, 3)) === J({ undated: 1, dated: [] }) && !disagreements(pg, roots).length, "(…as the Save writes it: state 3 holds it, and the page agrees)", { file: fileLevels(roots, 3), off: disagreements(pg, roots) });
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.erase(3);
    ok(/✅ Auto-fixed: deleted the now-empty state STATE_7\.\n/.test(pg.last()), "(a state holding none is told nothing of them)", pg.last());
    const n = pg.newState();
    pg.move(12, n);
    pg.statuses.length = 0;
    pg.erase(12);
    ok(!/go with it/.test(pg.last()) && !/goes with it/.test(pg.last()), "(a new state discarded by the erase says nothing of the dockyards its paint gave back)", pg.last());
  }

  console.log(`\n=== what a paint says is what the Save does: ${pass} passed, ${fail} failed ===`);
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error("HARNESS ERROR", e && e.stack ? e.stack : e); process.exitCode = 1; });
