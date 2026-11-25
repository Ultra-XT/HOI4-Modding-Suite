// ⛔ #a-dropped-paint-refuses-what-rests-on-it — A CLICK THAT TAKES A STAGED PAINT BACK OUT OF THE QUEUE IS REFUSED WHEN A WRITE QUEUED SINCE NAMES THE
// STATE IT GAVE OR TOOK. (Review of the coast rows, F2 to F6 and F13.)
//
// A paint back, an Erase of a province with a queued paint and the discard of a new state each drop the earlier paint. Dropping one undoes its own
// click and nothing else: it does not follow a merge or a delete queued since, nor another province's carry, nor a later paint whose last-coast
// question it answered. The review found the page and the files parting in each shape, with dockyards deleted or invented on the next panel edit:
//   F2 (N1, N2, S9b)  a later paint of state 4 was judged with the dropped paint in place
//   F3 (S6)           12 into 3, 4 merged into 5, 12 erased: the kept state's copy misses the dockyards
//   F4 (T12, S5, S5b) the state it came from deleted since: the dockyards go with the delete, and nothing says so
//   F5 (S2)           12 into 3, 3 merged into 5, 12 back: the kept state keeps 7 that went home
//   F6 (S3c)          state 3's last coast painted on with what 12 gave it, 12 back: 7 on two states
//   F13 (T11)         a naval base typed on 12 while it was in state 3, 12 back: written to state 3's file
// Each is now one refusal at the click, saying what it would undo and "Save first, or use Undo", instead of a replay of the queue. Undo goes
// back through all of it, and the Save does what the page says.
//
// The page's own functions on a fake DOM (testlib-state-panel-page.js), each write sent to map-data.js as server.js's handler passes it. Binds no
// port. Run: node test-a-dropped-paint-refuses-what-rests-on-it.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dropped-paint-"));
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
const world = (opts) => { const roots = makeWorld(ROOT, `w${++seq}`, opts); return { roots, pg: openPage(md, roots, model(roots)) }; };
const H4 = hist(7, [["1939.1.1", 8]]), H3 = hist(2, [["1939.1.1", 3]]);
// state 4 has two coasts, 12 and 13, and an inland 8
const TWO = { 1: [2, 6], 2: [3, 7], 3: [4, 5], 4: [8, 12, 13], 5: [9], 6: [10, 11] };
const levels = (s) => ({ undated: Number((s.buildings || {}).dockyard) || 0, dated: (s.navalDated || []).filter((d) => d.key === "dockyard").map((d) => `${d.date} ${d.level}`) });
const pageStates = (pg) => J(pg.ctx.model.states.map((s) => ({ id: s.id, provinces: s.provinces, b: s.buildings, d: s.navalDated, v: s.victoryPoints, p: s.provinceBuildings })).sort((a, b) => a.id - b.id));
const typeManpower = (pg, sid, pid) => { pg.inspect(pid); pg.$("miManpowerInp").value = "4321"; pg.saveStateButton(); };
const typeNaval = (pg, pid, level) => { pg.inspect(pid); pg.$("miNavalBase").value = String(level); pg.saveStateButton(); };

/** Every state the file holds, read back, against the page's copy of it. */
function disagreements(pg, roots) {
  const out = [];
  const disk = new Map(model(roots).states.map((s) => [s.id, s]));
  for (const s of pg.ctx.model.states) {
    if (s.id < 0) continue;
    const d = disk.get(s.id);
    if (!d) { out.push(`state ${s.id} is on the page and not in the files`); continue; }
    if (J(levels(s)) !== J(levels(d))) out.push(`state ${s.id}: page ${J(levels(s))}, file ${J(levels(d))}`);
  }
  for (const id of disk.keys()) if (!pg.ctx.stateById.get(id)) out.push(`state ${id} is in the files and not on the page`);
  return out;
}

console.log("\n=== 1. Each shape the review found: refused at the click, nothing changed, Undo still goes back, and the Save does what the page says ===");
{
  // Each runs twice on a fresh world: the click then the Save, and the click then Undo to the map as loaded.
  const CASES = [
    { id: "F2 N1", title: "13 into a new state, 12 out with state 4's dockyards, the new state discarded",
      opts: { states: TWO, history: { 4: H4, 3: H3 } },
      steps(pg, v) { v.n = pg.newState(); pg.move(13, v.n); pg.move(12, 3); },
      click(pg, v) { pg.deleteState(v.n, 13); },
      said: /^🚫 Discarding New state 1 would undo the unsaved paint of province 13 into New state 1, but the paint of province 12 into STATE_3 came after that paint/ },
    { id: "F2 N1b", title: "…the same with the taker's panel edited since",
      opts: { states: TWO, history: { 4: H4, 3: H3 } },
      steps(pg, v) { v.n = pg.newState(); pg.move(13, v.n); pg.move(12, 3); typeManpower(pg, 3, 4); },
      click(pg, v) { pg.deleteState(v.n, 13); },
      said: /^🚫 Discarding New state 1/ },
    { id: "F2 N2", title: "13 into state 1, 12 out with the dockyards, 13 erased",
      opts: { states: TWO, history: { 4: H4, 3: H3 } },
      steps(pg) { pg.move(13, 1); pg.move(12, 3); },
      click(pg) { ok(pg.erase(13) === false, "(F2 N2: the erase flips nothing)"); },
      said: /^🚫 Erasing province 13 would undo the unsaved paint of province 13 into STATE_1, but the paint of province 12 into STATE_3 came after that paint/ },
    { id: "F2 S9b", title: "3 into 4 with state 2's dockyards, 12 into 3 because 3 keeps 4 a coast, 3 back into 2",
      opts: { states: { 1: [2, 6], 2: [3, 7], 3: [4, 5], 4: [8, 12], 5: [9, 13], 6: [10, 11] }, history: { 4: H4, 2: hist(5), 3: H3 } },
      steps(pg) { pg.move(3, 4); pg.move(12, 3); typeManpower(pg, 4, 8); },
      click(pg) { pg.move(3, 2); },
      said: /^🚫 Putting province 3 back into STATE_2 would undo the unsaved paint of province 3 into STATE_4 and the 5 dockyards that went with it, but the paint of province 12 into STATE_3 came after that paint/ },
    { id: "F3 S6", title: "12 into 3, 4 merged into 5, 12 erased",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg) { pg.move(12, 3); pg.merge(4, 5); },
      click(pg) { ok(pg.erase(12) === false, "(F3 S6: the erase flips nothing)"); },
      said: /^🚫 Erasing province 12 would undo the unsaved paint of province 12 into STATE_3 and the 7 dockyards \(8 from 1939\.1\.1\) that went with it, but the merge of state 4 into STATE_5 came after that paint/ },
    // (⛔ #a-state-a-move-empties-is-merged-not-deleted — the state a move empties goes into the state that took its land, so what came since is that merge)
    { id: "F4 T12", title: "state 7's only province into 1, auto-merging 7 into 1, then erased",
      opts: { history: { 7: hist(5, [["1939.1.1", 6]]), 1: hist(1) } },
      steps(pg) { pg.move(3, 1); },
      click(pg) { ok(pg.erase(3) === false, "(F4 T12: the erase flips nothing)"); },
      said: /^🚫 Erasing province 3 would undo .*but the merge of state 7 into STATE_1 came after that paint/ },
    { id: "F4 S5", title: "12 into 3, state 4 deleted, 12 erased",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg) { pg.move(12, 3); pg.deleteState(4, 8); },
      click(pg) { ok(pg.erase(12) === false, "(F4 S5: the erase flips nothing)"); },
      said: /^🚫 Erasing province 12 would undo .*but the delete of state 4 came after that paint/ },
    { id: "F4 S5b", title: "12 into a new state, state 4 deleted, the new state discarded",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg, v) { v.n = pg.newState(); pg.move(12, v.n); pg.deleteState(4, 8); },
      click(pg, v) { pg.deleteState(v.n, 12); },
      said: /^🚫 Discarding New state 1 would undo .*but the delete of state 4 came after that paint/ },
    { id: "F5 S2", title: "12 into 3, 3 merged into 5, 12 back into 4",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg) { pg.move(12, 3); pg.merge(3, 5); },
      click(pg) { pg.ctx.doMoveProvince(12, 5, 4); },
      said: /^🚫 Putting province 12 back into STATE_4 would undo .*but the merge of state 3 into STATE_5 came after that paint/ },
    { id: "F6 S3c", title: "12 into 3, on into 6, 3's last coasts into 1 with what 12 gave it, 12 back into 4",
      opts: { states: { 1: [2, 6], 2: [3], 3: [4, 5, 7], 4: [8, 12], 5: [9, 13], 6: [10, 11] }, history: { 4: H4 } },
      steps(pg) { pg.move(12, 3); pg.move(12, 6); pg.move(4, 1); pg.move(5, 1); },
      click(pg) { pg.move(12, 4); },
      said: /^🚫 Putting province 12 back into STATE_4 would undo .*but the paint of province 4 into STATE_1 came after that paint/ },
    { id: "F13 T11", title: "12 into 3, a naval base typed on it there, 12 back into 4",
      opts: { history: { 4: H4, 3: hist(2) } },
      steps(pg) { pg.move(12, 3); typeNaval(pg, 12, 5); },
      click(pg) { pg.move(12, 4); },
      said: /^🚫 Putting province 12 back into STATE_4 would undo .*but the change to STATE_3 came after that paint/ },
    { id: "out of the new state", title: "12 and 13 into a new state, 12 on into 3, the new state discarded",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg, v) { v.n = pg.newState(); pg.move(12, v.n); pg.move(13, v.n); pg.move(12, 3); },
      click(pg, v) { pg.deleteState(v.n, 13); },
      said: /^🚫 Discarding New state 1 would undo .*but the paint of province 12 into STATE_3 came after that paint/ },
    // (review T14 — a new state a Merge is queued into is refused before its paints are asked of, with or without one: the state merged into it would
    // be left off the map while the mod still has it; its words name the two ways out)
    { id: "merged into the new state", title: "12 into a new state, state 5 merged into it, the new state discarded",
      opts: { history: { 4: H4, 3: H3 } },
      steps(pg, v) { v.n = pg.newState(); pg.move(12, v.n); pg.merge(5, v.n); },
      click(pg, v) { pg.deleteState(v.n, 12); },
      said: /^🚫 New state 1 took in a state merged into it, and discarding it would leave that state off the map while your mod still has it\./,
      todo: /Undo \(Ctrl\+Z\) takes the merge back; or 💾 Save, and delete it then\.$/ },
  ];
  for (const c of CASES) {
    console.log(`  --- ${c.id}: ${c.title}`);
    const { roots, pg } = world(c.opts);
    const start = pageStates(pg), v = {};
    c.steps(pg, v);
    const queued = pg.queue(), states = pageStates(pg), undos = pg.ctx.undoStack.length;
    pg.statuses.length = 0;
    c.click(pg, v);
    ok(c.said.test(pg.last()), `⭐⭐ ${c.id}: the click is refused, saying what it would undo and what came since`, pg.last());
    ok((c.todo || /Nothing was changed\. Save first, or use Undo\.$/).test(pg.last()), `⭐ ${c.id}: …and what to do`, pg.last());
    ok(pg.queue().length === queued.length && pg.queue().every((w, i) => w === queued[i]), `⭐ ${c.id}: the queue is as it was`, pg.urls());
    ok(pageStates(pg) === states, `⭐ ${c.id}: the page's states are as they were`);
    ok(pg.ctx.undoStack.length === undos, `${c.id}: the refused click leaves no Undo step`, pg.ctx.undoStack.length);
    ok(pg.ctx.moveSource === null, `${c.id}: the tool is not left holding the province`);
    const answers = pg.save();
    ok(answers.every((a) => a && !a.error), `${c.id}: the Save runs`, answers.filter((a) => !a || a.error));
    const off = disagreements(pg, roots);
    ok(!off.length, `⭐⭐ ${c.id}: after the Save the page and the files agree on every state's dockyards`, off);

    // ...and Undo, which the words offer, goes back through all of it
    const again = world(c.opts), w = {};
    c.steps(again.pg, w);
    c.click(again.pg, w);
    while (again.pg.ctx.undoStack.length) again.pg.undo();
    ok(pageStates(again.pg) === start && !again.pg.queue().length, `⭐ ${c.id}: Undo after the refusal goes back to the map as loaded, with nothing queued`, { queue: again.pg.urls(), same: pageStates(again.pg) === start });
  }
}

console.log("\n=== 2. A write that rests on nothing dropped leaves the click alone ===");
{
  {
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    const before = { 3: stateText(roots, 3), 4: stateText(roots, 4) };
    pg.move(12, 3);
    pg.move(12, 4);
    ok(!pg.queue().length && /is back in STATE_4/.test(pg.last()), "⭐ painted out and back with nothing since: taken out of the Save, as before", { q: pg.urls(), s: pg.last() });
    pg.save();
    ok(stateText(roots, 3) === before[3] && stateText(roots, 4) === before[4], "(…and both files stay as they were)");
    pg.undo();
    ok(pg.urls().join() === "move-province" && pg.state(3).provinces.includes(12), "(Undo of the back gives the first paint back)", pg.urls());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.move(9, 6);
    pg.move(12, 4);
    ok(pg.urls().join() === "move-province" && pg.queue()[0].body.provinceId === 9 && /is back in STATE_4/.test(pg.last()), "⭐ a paint between states 5 and 6 names neither: the paint back still runs, and that paint stays", pg.queue().map((w) => w.body));
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    typeManpower(pg, 4, 8);
    pg.move(12, 3);
    pg.move(12, 4);
    ok(pg.urls().join() === "set-state" && /is back in STATE_4/.test(pg.last()), "⭐ a write queued BEFORE the paint rests on nothing it dropped", pg.urls());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.move(12, 2);
    pg.move(12, 4);
    ok(!pg.queue().length && /is back in STATE_4/.test(pg.last()), "⭐ the province's own later paints leave with the first", { q: pg.urls(), s: pg.last() });
  }
  {
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    ok(pg.erase(12) === true && pg.urls().join() === "flip-province-sea", "⭐ painted and erased with nothing since: the paint goes, the flip stays", pg.urls());
    ok(levels(pg.state(4)).undated === 7 && levels(pg.state(3)).undated === 2, "(…and the dockyards are back where the files hold them)", { s3: levels(pg.state(3)), s4: levels(pg.state(4)) });
    pg.save();
    const off = disagreements(pg, roots).filter((x) => /^state [34]:/.test(x));
    ok(!off.length, "(…and the Save agrees)", off);
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.move(9, 6);
    ok(pg.erase(12) === true && pg.urls().join() === "move-province,flip-province-sea", "⭐ erased with an unrelated paint since: the erase still runs", pg.urls());
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.move(12, n);
    pg.inspect(12);
    pg.$("miManpowerInp").value = "4321";
    pg.saveStateButton();
    pg.statuses.length = 0;
    pg.deleteState(n, 12);
    ok(!pg.queue().length && /^Discarded the unsaved new state/.test(pg.last()), "⭐ a new state's own edit goes with it: the discard still runs", { q: pg.urls(), s: pg.last() });
    ok(pg.state(4).provinces.includes(12) && levels(pg.state(4)).undated === 7, "(…and 12 is back in state 4, with its dockyards)", pg.state(4).provinces);
  }
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(9, 3);
    pg.move(9, 5);
    ok(pg.urls().join() === "move-province,move-province", "(a paint out and back that took no dockyards drops nothing, so it asks nothing: both stay queued)", pg.urls());
  }
}

console.log("\n=== 2b. \"Save first\" is true: once the Save has run, the same click goes ===");
{
  {
    const { roots, pg } = world({ history: { 4: H4, 3: hist(2) } });
    pg.move(12, 3);
    typeNaval(pg, 12, 5);
    pg.move(12, 4);
    ok(/^🚫/.test(pg.last()), "(a naval base typed on 12 in state 3: the paint back is refused)", pg.last());
    pg.save();
    ok(/naval_base = 5/.test(stateText(roots, 3)), "(the Save writes it to the state that holds 12)");
    pg.move(12, 4);
    ok(!/^🚫/.test(pg.last()) && pg.urls().join() === "move-province", "⭐ after the Save, the same click is an ordinary move", { s: pg.last(), q: pg.urls() });
    pg.save();
    ok(/naval_base = 5/.test(stateText(roots, 4)) && !/naval_base/.test(stateText(roots, 3)), "⭐ …and 12's naval base goes home with it", { four: /naval_base = 5/.test(stateText(roots, 4)), three: /naval_base/.test(stateText(roots, 3)) });
  }
  {
    const { roots, pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.merge(4, 5);
    ok(pg.erase(12) === false, "(12 into 3, 4 merged into 5: the erase is refused)", pg.last());
    pg.save();
    ok(pg.erase(12) === true && pg.urls().join() === "flip-province-sea", "⭐ after the Save, the same erase runs", { s: pg.last(), q: pg.urls() });
    pg.save();
    const off = disagreements(pg, roots);
    ok(!off.length, "⭐ …and the page and the files still agree", off);
  }
}

console.log("\n=== 3. The refusal comes before anything else the click does ===");
{
  {
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    typeManpower(pg, 3, 4);
    pg.ctx.model.provinceToRegion[12] = 99;                              // going back would split state 4's region, which asks first
    let called = false;
    pg.confirms.length = 0;
    pg.statuses.length = 0;
    pg.ctx.moveTarget = null;
    pg.move(12, 4, () => { called = true; });
    ok(/^🚫 Putting province 12 back/.test(pg.last()) && !pg.confirms.length, "⭐ no region question is asked first", { s: pg.last(), asked: pg.confirms });
    ok(!called, "⭐ the fill tool's after() is not told it was added", called);
  }
  {
    // the brush: a stroke over two refused provinces and one it can flip
    const { pg } = world({ states: { 1: [2, 6], 2: [3, 7], 3: [4, 5], 4: [8, 12], 5: [9, 13], 6: [10, 11] }, history: { 4: H4, 3: H3 } });
    pg.move(12, 3);
    pg.move(4, 6);
    pg.move(5, 6);                                                       // 4 and 5 leave state 3 after 12 came in: 12 and 4 are both held
    const undos = pg.ctx.undoStack.length;
    pg.ctx.beginEraseStroke();
    ok(pg.ctx.eraseProvinceLocal(12) === false && pg.ctx.eraseProvinceLocal(4) === false, "(the stroke leaves both)");
    ok(pg.ctx.eraseProvinceLocal(12) === false && pg.ctx.eraseHeld.size === 2, "(…sampled again, it asks nothing new)", pg.ctx.eraseHeld.size);
    ok(pg.ctx.undoStack.length === undos, "⭐ a stroke that flipped nothing takes no Undo step");
    pg.ctx.commitEraseStroke();
    ok(/^🚫 Erasing province 12 would undo/.test(pg.last()) && /\(1 more province under the brush left the same way\.\)$/.test(pg.last()), "⭐ …and its end says why, the first in full and how many more", pg.last());
    pg.ctx.beginEraseStroke();
    ok(pg.ctx.eraseProvinceLocal(12) === false && pg.ctx.eraseProvinceLocal(13) === true, "(a stroke over a province held and one with no paint: flips the second)");
    pg.ctx.commitEraseStroke();
    ok(/^🧹 Erased 1 coastal province to sea\.\n🚫 Erasing province 12 would undo/.test(pg.last()), "⭐ …and says both", pg.last());
    pg.ctx.beginEraseStroke();
    ok(pg.ctx.eraseHeld.size === 0, "(the next stroke starts clean)");
  }
  {
    // a drag across two provinces painted into one new state: the earlier rests on the later until the later is erased, and the brush samples a province many times a stroke
    const { pg } = world({ history: { 4: H4, 3: H3 } });
    const n = pg.newState();
    pg.move(12, n);
    pg.move(13, n);
    pg.ctx.beginEraseStroke();
    ok(pg.ctx.eraseProvinceLocal(12) === false && pg.ctx.eraseHeld.has(12), "(the stroke first meets the earlier paint, which the later rests on)", [...pg.ctx.eraseHeld.keys()]);
    ok(pg.ctx.eraseProvinceLocal(13) === true, "(the later paint rests on nothing, so it goes)");
    ok(pg.ctx.eraseProvinceLocal(12) === true && !pg.ctx.eraseHeld.size, "⭐ …and the brush, coming back over the first in the same stroke, takes it too", [...pg.ctx.eraseHeld.keys()]);
    pg.ctx.commitEraseStroke();
    ok(/^🧹 Erased 2 coastal provinces to sea\./.test(pg.last()) && !/🚫/.test(pg.last()), "(…and the stroke says so, with no refusal left in it)", pg.last());
    ok(!pg.state(n) && pg.urls().join() === "flip-province-sea,flip-province-sea", "(the new state, emptied, goes; only the two flips stay queued)", pg.urls());
    ok(levels(pg.state(4)).undated === 7, "(…and state 4's dockyards are back where the files hold them)", levels(pg.state(4)));
  }
}

console.log("\n=== 4. What counts as naming a state, run on the pure question ===");
{
  const { pg } = world({ history: { 4: H4, 3: H3 } });
  const q = (paints, going, writes) => pg.ctx.paintDropRefusal(paints, going, writes, (id) => `S${id}`);
  const paint = (provinceId, toStateId, fromStateId, yards) => ({ url: "/api/map/move-province", body: { provinceId, toStateId }, meta: { fromStateId, yards: yards || [] } });
  const p = paint(12, 3, 4, [{ from: 4, keys: { dockyard: 7 }, dated: [{ date: "1939.1.1", key: "dockyard", level: 8 }] }]);
  ok(/and the 7 dockyards \(8 from 1939\.1\.1\) that went with it/.test(q([p], [], [p, paint(9, 4, 5)])), "(the words carry every moment of what it took)", q([p], [], [p, paint(9, 4, 5)]));
  ok(!/that went with it/.test(q([paint(8, 3, 4)], [], ((x) => [x, paint(9, 4, 5)])(paint(8, 3, 4))) || "that went with it"), "(…and none when it took none)");
  for (const [what, x, why] of [
    ["into the state it took from", paint(9, 4, 5), /paint of province 9 into S4/],
    ["into the state it went to", paint(9, 3, 5), /paint of province 9 into S3/],
    ["out of the state it took from: the giver only in the meta", paint(8, 6, 4), /paint of province 8 into S6/],
    ["out of the state it went to: the taker only in the meta", paint(5, 6, 3), /paint of province 5 into S6/],
    ["carrying that state's dockyards, its from another", paint(5, 6, 9, [{ from: 3, keys: { dockyard: 1 } }]), /paint of province 5 into S6/],
    ["a state edit", { url: "/api/map/set-state", body: { stateId: 3, fields: { manpower: "1" } }, meta: {} }, /the change to S3/],
    ["a new owner", { url: "/api/map/set-owner", body: { stateId: 4, owner: "BBB" }, meta: {} }, /the change to S4/],
    ["a capital", { url: "/api/map/set-capital", body: { tag: "AAA", stateId: 3 }, meta: {} }, /the change to S3/],
    ["a delete", { url: "/api/map/delete-state", body: { stateId: 4 }, meta: {} }, /the delete of S4/],
    ["a merge away", { url: "/api/map/merge-state", body: { sourceStateId: 3, targetStateId: 5 }, meta: { merge: true } }, /the merge of S3 into S5/],
    ["a merge in", { url: "/api/map/merge-state", body: { sourceStateId: 5, targetStateId: 4 }, meta: { merge: true } }, /the merge of S5 into S4/],
  ]) ok(why.test(q([p], [], [p, x])), `⭐ ${what} refuses`, q([p], [], [p, x]));
  const yardsOnly = { url: "/api/map/move-province", body: { provinceId: 12, toStateId: 3 }, meta: { yards: [{ from: 4, keys: { dockyard: 7 } }] } };
  ok(/paint of province 9 into S4/.test(q([yardsOnly], [], [yardsOnly, paint(9, 4, 5)])), "⭐ a giver only the yards say is a giver", null);
  for (const [what, x] of [
    ["a flip", { url: "/api/map/flip-province-sea", body: { provinceId: 13 }, meta: {} }],
    ["the region move that came with the paint", { url: "/api/map/move-province-region", body: { provinceId: 12, fromRegionId: 10, toRegionId: 20 }, meta: { forStateId: 3 } }],
    ["a paint between two other states", paint(9, 6, 5)],
    ["a state edit of another state", { url: "/api/map/set-state", body: { stateId: 6, fields: { manpower: "1" } }, meta: {} }],
    ["a railway", { url: "/api/map/railway", body: { action: "add", provinces: [12, 13], level: 1 }, meta: {} }],
  ]) ok(q([p], [], [p, x]) === "", `(${what} does not)`, q([p], [], [p, x]));
  const edit = { url: "/api/map/set-state", body: { stateId: 3, fields: { manpower: "1" } }, meta: {} };
  ok(q([p], [edit], [p, edit]) === "", "⭐ a write leaving with the paints does not", q([p], [edit], [p, edit]));
  ok(q([p], [], [edit, p]) === "", "⭐ a write queued before the paint does not", q([p], [], [edit, p]));
  const on = paint(12, 6, 3);
  ok(q([p, on], [], [p, on]) === "", "(nor the province's own later paint leaving with it)", q([p, on], [], [p, on]));
  const between = paint(5, 6, 3);
  ok(/paint of province 5 into S6/.test(q([p, on], [], [p, between, on])), "⭐ each paint is asked from its own place in the queue, and a write between two of them counts for the first", q([p, on], [], [p, between, on]));
  const late = paint(9, 2, 5), first = paint(5, 6, 3);
  ok(q([late], [], [first, late]) === "", "⭐ …and one before the second does not count for it", q([late], [], [first, late]));
}

console.log(`\n=== a dropped paint refuses what rests on it: ${pass} passed, ${fail} failed ===`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
if (fail) process.exitCode = 1;
