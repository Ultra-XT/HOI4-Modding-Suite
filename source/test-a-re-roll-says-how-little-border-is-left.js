// 🌍 #a-re-roll-has-no-borders-left — A WORLD GENERATED OVER AN EARLIER ONE IS CUT INSIDE WHAT IS LEFT OF THE PROVINCE BORDER BUDGET,
// AND THE CONFIRM MUST SAY SO BEFORE THE MODDER WAITS SEVEN MINUTES FOR IT.
//
// Until Delete map gives back the provinces an earlier world cut (batch C, C1: plan.joinsBackTheCut), a re-roll is cut from the ocean
// the last world left. Measured (reviewer, the real game, a seed-2 re-roll of the owner flow's world): 61,082 of the 62,000 border
// segments were already used, so Generate land's cut was allowed 293 new provinces where world 1 had 6,817; its target came out at
// 1,505.7 px (3.8 times the base game's 399), 625 land provinces over 1,000 px (world 1: 17). The confirm said only "the same seed
// will not give the same world", the time said "about 5 minutes" (it took 7.3), and the budget sentence sat in a closed details.
//
// map-data worldBorderBudget gives the dry plan the budget on the mod's map as Delete map will leave it, and `times`: Generate land's
// own provinceSplitPlan over that ocean, at each land share. ⛔ #a-re-roll-joins-back-the-cut — Delete map now gives the cut back
// (batch C), so whether it WILL is asked of the fold's own planner (map-data worldCutFoldForecast), never assumed because the fold
// exists. This test, on the split-world fixture:
//   · a new mod's plan has no budget (nothing was cut), and its confirm says the first world's time;
//   · after one world, the plan forecasts the fold giving back every province the record names: joined back, no budget, a re-roll's
//     own time (⛔ #a-re-roll-takes-a-re-rolls-time: it was the first world's "about 5 minutes", and the real game's joined-back re-rolls
//     took 5.9 to 7.3 — MOVED WITH THE FIX, review cr1 WR-2/F3) — and the re-roll's Delete map gives back exactly that;
//   · with a piece of a family in the middle of the record made a lake, the plan forecasts the fold stopping there (the families above
//     given back, the fold's own reason), carries the budget on the map as that partial fold leaves it, and the confirm says both;
//   · the re-roll over it agrees: its fold gave back and stopped as forecast, and its Generate land had the same T0 and limit, the
//     segments within 5%, and the predicted target within a third of the one its cut used (the real game: 1,696 predicted against
//     1,505.7, 11% over);
//   · with the record of the cut made unreadable, the plan does not say the cut is joined back (it counted no pieces from it, and
//     never asked the fold): its forecast is the fold's own skip, it carries no budget (Generate land cuts nothing over such a
//     record), and the confirm warns of both in the re-roll's time — and the re-roll over it does exactly that;
//   · the page's sentence: said with the real game's numbers (about 4 times), not when the land comes out near size, not once the
//     cut is given back; the earlier cut is "your earlier generated worlds"; and the time depends on the plan;
//   · ⛔ #a-re-roll-takes-a-re-rolls-time — every time label holds the real game's runs of its kind, read as the range it promises.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-border-left-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const md = require("./map-data.js");
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const P = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} } }).sb;
const text = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
async function runWorld(c, mod, extra) {
  const s = await c.post("/api/map/world-run", Object.assign({ modPath: mod, landShare: 35, seed: 1, ownerMode: "inherit", owner: "", confirm: true }, extra || {}));
  if (!s.body || !s.body.ok) return { state: "not-started", error: JSON.stringify(s.body) };
  const t0 = Date.now();
  for (;;) {
    await sleep(150);
    const run = ((await c.get("/api/map/world-run")).body || {}).run;
    if (run && run.state !== "running" && run.state !== "finishing") break;
    if (Date.now() - t0 > 180000) return { state: "timeout" };
  }
  const full = (await c.get("/api/map/world-run?answers=1")).body.run;
  await c.post("/api/map/world-run/seen", { id: full.id });
  return full;
}
const C = { pct: 35, seed: 1, ownerMode: "inherit", owner: "", picked: "inherit" };

(async () => {
  const srv = await listen(createApp());
  const c = client(`http://127.0.0.1:${srv.address().port}`);
  let plan1 = null;
  try {
    const mod = (await c.post("/api/mod/create", { modName: "Border Left" })).body.modRoot;
    const fresh = (await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body;
    rec("a new mod's plan: nothing was cut, so no budget", fresh && fresh.ok && !(Number(fresh.plan.earlierCut) > 0) && !fresh.plan.borderBudget, fresh && fresh.plan && { earlierCut: fresh.plan.earlierCut, borderBudget: fresh.plan.borderBudget });
    const freshBody = text(P.worldConfirmBody(fresh.plan, C));
    rec("…its confirm says the first world's time (about 5 minutes; Generate land 3 to 5)", /about 5 minutes/.test(freshBody) && /usually 3 to 5 minutes/.test(freshBody) && !/province borders/.test(freshBody), freshBody);

    const w1 = await runWorld(c, mod);
    rec("world 1 is built", w1.state === "done", w1.error || w1.state);
    // world 1's map, where the prediction is checked against Generate land's own plan where the budget binds (below)
    const rowsW1 = md.parseDefinitionCsv(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8"));
    const rW1 = md.provinceIdRaster(fs.readFileSync(path.join(mod, "map", "provinces.bmp")), rowsW1);
    const dry =(await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body;
    plan1 = dry && dry.plan;
    rec("…and cut provinces (the plan's earlierCut, from the record of the cut)", !!plan1 && Number(plan1.earlierCut) > 0, plan1 && plan1.earlierCut);
    // ── ⛔ #a-re-roll-joins-back-the-cut — the plan ASKS whether Delete map will give the cut back (the fold's own planner, on the map as
    // Delete map will leave it), where it used to say yes because foldRecordedProvinceSplits exists. The record, read here: the pieces of
    // every family that still names rows the mod's definition.csv has
    const recordOf = () => JSON.parse(fs.readFileSync(md.provinceSplitRecordPath(mod), "utf8"));
    const defMaxOf = () => md.parseDefinitionCsv(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")).reduce((m, p) => Math.max(m, p.id), 0);
    const livePieces = (rec0, max) => rec0.families.filter((f) => f.parent <= max && f.pieces.every((q) => q <= max)).reduce((a, f) => a + f.pieces.length, 0);
    const cut1 = livePieces(recordOf(), defMaxOf());
    const f1 = (plan1 && plan1.cutFold) || {};
    rec("THE CONTROL: world 1 left a record of the families it cut, every one on this map", cut1 > 0 && cut1 === Number(plan1 && plan1.earlierCut), { cut1, earlierCut: plan1 && plan1.earlierCut });
    rec("⭐⭐ the plan forecasts the fold: Delete map gives back every province world 1 cut, none left", f1.joinsBack === true && f1.left === 0 && f1.provinces === cut1 && !f1.stopped, f1);
    rec("⭐ …so it says the cut is joined back, and carries no border budget (the ocean is the first world's)", plan1.joinsBackTheCut === true && !plan1.borderBudget, { joinsBackTheCut: plan1.joinsBackTheCut, borderBudget: plan1.borderBudget });
    const joinedBody = text(P.worldConfirmBody(plan1, C));
    // ⛔ #a-re-roll-takes-a-re-rolls-time — MOVED WITH THE FIX (review cr1, WR-2/F3): this pinned the first world's "about 5 minutes" here
    // on purpose (the ocean is the first world's again); the real game's joined-back re-rolls took 5.9 to 7.3 minutes, Generate land 5.1
    // to 6.3 of them. Its intent stands: a joined-back re-roll is NOT the slow one cut from an earlier world's ocean (8 minutes).
    rec("…and its confirm says it joins back those provinces, in a re-roll's own time (not the slow 8 minutes), with no word of borders", joinedBody.includes(`joins back the ${cut1.toLocaleString()} provinces your earlier generated worlds cut`) && /about 6 to 7 minutes/.test(joinedBody) && /usually 5 to 6 minutes/.test(joinedBody) && !/about 8 minutes/.test(joinedBody) && !/province borders/.test(joinedBody) && !/cannot yet join back/.test(joinedBody), joinedBody);
    const w2 = await runWorld(c, mod, { replacesOwnWorld: true });
    rec("the re-roll is built", w2.state === "done", w2.error || w2.state);
    const fold2 = (((w2.answers || {}).blank) || {}).provinceFold || {};
    rec("⭐⭐ …and its Delete map gave back what the plan said: every province, none left", fold2.changed === true && fold2.provinces === f1.provinces && fold2.left === 0 && !fold2.stopped, { fold: { changed: fold2.changed, provinces: fold2.provinces, left: fold2.left, stopped: fold2.stopped }, forecast: f1 });

    // ── …and a fold that STOPS: a family in the middle of world 2's record with its last piece made a lake (Delete map makes only land
    // sea, so the fold stops there, "province N is lake, not sea"), the families above it given back, the rest left cut
    const rec2 = recordOf(), max2 = defMaxOf();
    const fams = rec2.families.filter((f) => f.parent <= max2 && f.pieces.every((q) => q <= max2)).map((f) => ({ parent: f.parent, pieces: [...f.pieces].sort((a, b) => a - b) }))
      .sort((a, b) => b.pieces[b.pieces.length - 1] - a.pieces[a.pieces.length - 1]);
    const at = Math.floor(fams.length / 2), stopAt = fams[at] || { parent: 0, pieces: [0] };
    const lakeId = stopAt.pieces[stopAt.pieces.length - 1];
    const givenBack = fams.slice(0, at).reduce((a, f) => a + f.pieces.length, 0);
    rec("THE CONTROL: world 2 cut families enough to stop in the middle of", fams.length >= 4 && at > 0 && givenBack > 0, { families: fams.length, at, givenBack });
    const defP = path.join(mod, "map", "definition.csv"), defText = fs.readFileSync(defP, "utf8");
    // (a piece of world 2's land is a land row now; Delete map would make it sea, a lake it leaves as it is)
    const lakeText = defText.replace(new RegExp(`^(${lakeId};[^;\\r\\n]*;[^;\\r\\n]*;[^;\\r\\n]*;)(?:land|sea);`, "m"), (_m, head) => head + "lake;");
    rec("THE CONTROL: that piece's row is made a lake (one row, test fixture only)", lakeText !== defText, lakeId);
    fs.writeFileSync(defP, lakeText);
    const plan2 = ((await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body || {}).plan || {};
    const f2 = plan2.cutFold || {};
    rec("⭐⭐ the plan forecasts the stop: the families above it given back, and why the rest are not", f2.joinsBack === false && f2.provinces === givenBack && f2.left === fams.length - at
      && !!f2.stopped && f2.stopped.why === `province ${lakeId} is lake, not sea` && f2.stopped.parent === stopAt.parent, { forecast: f2, want: { provinces: givenBack, left: fams.length - at, lakeId, parent: stopAt.parent } });
    rec("⭐ …so the cut is not joined back, and the plan carries the border budget", plan2.joinsBackTheCut === false && !!plan2.borderBudget, { joinsBackTheCut: plan2.joinsBackTheCut, borderBudget: !!plan2.borderBudget });
    const stopBody = text(P.worldConfirmBody(plan2, C));
    rec("⭐ …and its confirm says how many it joins back of how many, and the fold's own reason it stops — never “cannot yet”",
      stopBody.includes(`joins back only ${givenBack.toLocaleString()} of the ${Number(plan2.earlierCut).toLocaleString()} provinces`) && stopBody.includes(`province ${lakeId} is lake, not sea`) && !/cannot yet join back/.test(stopBody), stopBody);
    {
      const b = plan2.borderBudget || {};
      const rows = md.parseDefinitionCsv(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8"));
      const r = md.provinceIdRaster(fs.readFileSync(path.join(mod, "map", "provinces.bmp")), rows);
      const segments = md.provinceBorderSegments({ W: r.W, H: r.H, ids: r.ids }).segments;
      const T0 = md.layerBelowLandMeanArea({ modRoot: mod, gameRoot: DIRS.game, dependencyRoots: [] });
      rec("⭐ a re-roll's plan carries the border budget", !!plan2.borderBudget, plan2.borderBudget);
      // the budget is the map's once the fold has given back what it will: fewer borders than the map has now, by the families above
      rec("⭐⭐ …its segments: the map as Delete map will leave it, fewer than now (the families above the stop given back)", b.segments > 0 && b.segments < segments, { plan: b.segments, now: segments });
      rec("…its allowance: provinceSplitAllowance of those, under PROVINCE_BORDER_BUDGET", b.allowed === md.provinceSplitAllowance(b.segments) && b.limit === md.PROVINCE_BORDER_BUDGET, { allowed: b.allowed, limit: b.limit });
      rec("…its T0: the land province of the map below (layerBelowLandMeanArea)", b.T0 === Math.round(T0 * 10) / 10, { plan: b.T0, below: T0 });
      const keys = Object.keys(b.times || {}).map(Number).sort((x, y) => x - y);
      rec("…its predicted sizes cover the confirm's land shares (1-90) in steps no wider than 5", keys.length >= 18 && keys[0] <= 5 && keys[keys.length - 1] >= 90 && keys.every((k, i) => i === 0 || k - keys[i - 1] <= 5), keys);
      rec("…and grow with the land share (more land, the same budget)", keys.every((k, i) => i === 0 || b.times[k] >= b.times[keys[i - 1]]), b.times);
      // the prediction where the budget BINDS (this fixture's own budget does not): Generate land's own provinceSplitPlan for random
      // 35% picks of world 1's ocean, at an allowance such a pick could spend only a small part of what it wants, against the
      // prediction at 35% for the same allowance (map-data worldCutTimes, the function the plan's `times` come from)
      const parents = md.worldOceanParents(rowsW1, rW1);
      const wantFree = md.provinceSplitPlan({ parents, T0, allowed: Infinity }).projected;
      const tight = Math.max(1, Math.round(wantFree * 0.35 * 0.15));
      const predictedTight = md.worldCutTimes({ parents, T0, allowed: tight, pcts: [35] })[35];
      let s = 12345;
      const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
      const picks = [];
      for (let k = 0; k < 20; k++) { const pick = parents.filter(() => rnd() < 0.35); const pl = md.provinceSplitPlan({ parents: pick, T0, allowed: tight }); picks.push({ times: pl.scale / T0, binds: pl.binds }); }
      const mean = picks.reduce((a, x) => a + x.times, 0) / picks.length;
      rec(`⭐ where the budget binds (${tight} new provinces for a pick that wants ~${Math.round(wantFree * 0.35)}), the prediction at 35% is within a quarter of Generate land's own plan for random 35% picks`,
        parents.length >= 50 && picks.every((x) => x.binds) && Math.abs(predictedTight - mean) / mean < 0.25, { predictedTight, mean: Math.round(mean * 100) / 100, parents: parents.length, wantFree, tight });

      const w3 = await runWorld(c, mod, { replacesOwnWorld: true });
      rec("the re-roll over the stop is built", w3.state === "done", w3.error || w3.state);
      const fold3 = (((w3.answers || {}).blank) || {}).provinceFold || {};
      rec("⭐⭐ …its Delete map gave back what the plan said, and stopped where it said", fold3.changed === true && fold3.provinces === f2.provinces && fold3.left === f2.left && !!fold3.stopped && fold3.stopped.why === f2.stopped.why,
        { fold: { changed: fold3.changed, provinces: fold3.provinces, left: fold3.left, stopped: fold3.stopped }, forecast: f2 });
      const t = (((w3.answers || {}).generate || {}).provinceSplit || {}).target || {};
      rec("…its Generate land sized its cut by the same T0 and limit", t.T0 === b.T0 && t.limit === b.limit, { cut: { T0: t.T0, limit: t.limit }, plan: { T0: b.T0, limit: b.limit } });
      rec("…from segments within 5% of the plan's (Delete map and the new coast move a few borders)", Number(t.segmentsBefore) > 0 && Math.abs(t.segmentsBefore - b.segments) / b.segments < 0.05, { cut: t.segmentsBefore, plan: b.segments });
      const actual = Number(t.scale) / Number(t.T0), predicted = Number((b.times || {})[35]);
      rec("⭐ …and its target within a third of the plan's prediction at 35%", actual > 0 && predicted > 0 && Math.abs(predicted - actual) / actual < 1 / 3, { predicted, actual, binds: t.binds });
      const rerollBody = text(P.worldConfirmBody(plan2, C));
      rec("the re-roll's confirm says its time is longer (about 8 minutes; Generate land 6 to 7)", /about 8 minutes/.test(rerollBody) && /usually 6 to 7 minutes/.test(rerollBody), rerollBody);
      rec("…and counts the earlier cut as \"your earlier generated worlds\", never \"your last\"", /your earlier generated worlds cut/.test(rerollBody) && !/your last generated world/.test(rerollBody), rerollBody);
      rec(`…and says the borders only when the land would come out over twice the size (the fixture's: ${predicted} times)`, (predicted >= 2) === /province borders/.test(rerollBody), rerollBody);
    }

    // ── …and a record of the cut that CANNOT BE READ (torn, edited by hand, or written by a newer Nova: isProvinceSplitRecord refuses
    // it). The plan counted no earlier cut from it (earlierCut 0), so it never asked the fold and promised the first world's ocean and
    // time; the run's Delete map then gave back nothing (the fold's own skip) and its Generate land raised the ocean provinces whole
    // (planGeneratedProvinceSplit refuses to cut over a record it cannot read), with no border budget to speak of. Truncated here
    // (test fixture only, under this test's own NOVA_HOME_DIR), and the re-roll over it run, so the confirm is held to the run
    {
      const recP = md.provinceSplitRecordPath(mod), whole = fs.readFileSync(recP);
      fs.writeFileSync(recP, whole.subarray(0, Math.floor(whole.length / 2)));
      rec("THE CONTROL: the record of world 3's cut cannot be read now", whole.length > 2 && md.readProvinceSplitRecord(mod).unreadable === true, whole.length);
      const planU = ((await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body || {}).plan || {};
      const fu = planU.cutFold || {};
      rec("⭐⭐ a record that cannot be read: the plan does not say the cut is joined back", planU.joinsBackTheCut === false, { joinsBackTheCut: planU.joinsBackTheCut, earlierCut: planU.earlierCut, cutFold: planU.cutFold });
      rec("…its forecast says why, in the fold's own words (the record cannot be read, and where it is)", fu.joinsBack === false && typeof fu.skipped === "string" && /cannot be read/.test(fu.skipped) && fu.skipped.includes(recP), fu);
      rec("…and it carries no border budget: Generate land will not cut at all over that record", planU.borderBudget === null, planU.borderBudget);
      const bodyU = text(P.worldConfirmBody(planU, C));
      rec("⭐⭐ …and its confirm warns that clearing it cannot join back the provinces earlier worlds cut, and why — with no count it cannot know",
        bodyU.includes("⚠ Clearing it cannot join back the provinces your earlier generated worlds cut out of the ocean: the record of the provinces Nova cut cannot be read") && !/the 0 provinces/.test(bodyU) && !/joins back the /.test(bodyU), bodyU);
      rec("⭐ …and that the new land is raised in the ocean's provinces whole, for the same reason", /raises the ocean's provinces whole/.test(bodyU), bodyU);
      // (a re-roll that cuts nothing is not the slow one: on the real game its Generate land took 307 s, a joined-back re-roll's 318 s —
      // so it is a re-roll's time, as a joined-back one's is: MOVED WITH THE FIX, review cr1 WR-2/F3, from the first world's)
      rec("…in a re-roll's time, not the slow one cut from an earlier ocean: Generate land cuts nothing over that record", /about 6 to 7 minutes/.test(bodyU) && /usually 5 to 6 minutes/.test(bodyU) && !/about 8 minutes/.test(bodyU), bodyU);
      const w4 = await runWorld(c, mod, { replacesOwnWorld: true });
      rec("the re-roll over that record is built", w4.state === "done", w4.error || w4.state);
      const fold4 = ((w4.answers || {}).blank || {}).provinceFold || {};
      rec("⭐ …its Delete map gave back nothing, for the reason the plan gave", fold4.changed === false && fold4.skipped === fu.skipped, { fold: fold4, forecast: fu });
      const split4 = ((w4.answers || {}).generate || {}).provinceSplit || {};
      rec("⭐ …and its Generate land left the raised provinces whole, as the confirm said (the record still cannot be read)", split4.changed === false && split4.why === "recordUnreadable", { changed: split4.changed, why: split4.why, skipped: split4.skipped });
    }
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }

  // ── the page's sentence, with the real game's re-roll (rehearsal world t35a, read-only: 61,082 segments, 293 allowed, T0 399.1) ──
  const REAL = { earlierCut: 6806, joinsBackTheCut: false, dependencyNames: [], ownsWorld: true, modName: "Real", bitmap: { own: true }, descriptors: [], copiesUnder: "C:/home/.nova",
    borderBudget: { segments: 61082, limit: 62000, allowed: 293, provinces: 20164, T0: 399.1, times: { 5: 1.5, 10: 2.4, 20: 3.4, 35: 4.2, 50: 4.8, 70: 5.4, 90: 5.8 } } };
  const line = P.worldBorderBudgetLine(REAL, 35);
  rec("⭐ the real game's re-roll is told its land comes out about 4 times the base game's provinces", /about 4 times the size of the base game's land provinces/.test(line), line);
  rec("…and why: the borders its earlier worlds used, of the limit", line.includes("61,082 of 62,000") && /earlier generated worlds/.test(line), line);
  rec("…and what to do instead (a new mod)", /generate it in a new mod/.test(line), line);
  rec("…shown in the confirm itself, not in a closed details", text(P.worldConfirmBody(REAL, C)).includes(line), null);
  rec("THE CONTROL: at a share whose land comes out under twice the size, nothing is said", P.worldBorderBudgetLine(REAL, 5) === "", P.worldBorderBudgetLine(REAL, 5));
  rec("THE CONTROL: once Delete map gives the cut back, nothing is said", P.worldBorderBudgetLine(Object.assign({}, REAL, { joinsBackTheCut: true }), 35) === "", null);
  rec("THE CONTROL: a plan with no budget says nothing", P.worldBorderBudgetLine(Object.assign({}, REAL, { borderBudget: null }), 35) === "", null);
  rec("an add-on is told the size of the mod it is built on, not the base game's", /the mod yours is built on/.test(P.worldBorderBudgetLine(Object.assign({}, REAL, { dependencyNames: ["Base"] }), 35)), null);
  // (MOVED WITH THE FIX, review cr1 WR-2/F3: this said "the first world's again")
  rec("once the cut is given back, the time is a re-roll's, not the 8 minutes of one cut from an earlier ocean", /about 6 to 7 minutes/.test(text(P.worldConfirmBody(Object.assign({}, REAL, { joinsBackTheCut: true, borderBudget: null }), C))) && !/about 8 minutes/.test(text(P.worldConfirmBody(Object.assign({}, REAL, { joinsBackTheCut: true, borderBudget: null }), C))), null);

  // ── ⛔ #a-re-roll-takes-a-re-rolls-time (review cr1, WR-2/F3) — THE LABELS HOLD THE RUNS THEY WERE MEASURED ON. Each label is read as
  // the range it promises — "usually A to B minutes" and "about A to B minutes" as A - 0.5 to B + 0.5, "about N minutes" as N ± 1 — and
  // every run measured of its kind must fall inside it, for the step (Generate land) and for the whole run. The runs, in seconds: the
  // base game's map, seed 1, 35% — review cr1's reviewers and skeptics (2026-10-21; some on a machine running the unit suite: kept, a
  // label has to hold on a busy machine too), commit 48262411's own, and the re-roll over an earlier ocean in this test's header.
  const MEASURED = {
    "a first world": { plan: {}, step: [229.6, 221.9, 281.6, 270, 281, 226], all: [277.0, 261.6, 334, 321, 332] },
    "a re-roll that gives the cut back": { plan: { earlierCut: 6804, joinsBackTheCut: true }, step: [312.3, 331.0, 321.7, 318, 353, 379], all: [352, 384.6, 377.3, 357, 367, 410, 437] },
    "a re-roll over a record it cannot read": { plan: { earlierCut: 0, cutRecordUnreadable: true, joinsBackTheCut: false }, step: [307], all: [] },
    "a re-roll cut from an earlier world's ocean": { plan: { earlierCut: 6806, joinsBackTheCut: false }, step: [390], all: [438] },
  };
  const rangeOf = (label) => {
    let m = /(?:usually|about) (\d+) to (\d+) minutes/.exec(label);
    if (m) return [Number(m[1]) - 0.5, Number(m[2]) + 0.5];
    m = /about (\d+) minutes/.exec(label);
    return m ? [Number(m[1]) - 1, Number(m[1]) + 1] : null;
  };
  for (const [kind, M] of Object.entries(MEASURED)) {
    const t = P.worldMinutes(M.plan);
    for (const [which, runs] of [["step", M.step], ["all", M.all]]) {
      if (!runs.length) continue;
      const r = rangeOf(t[which]), out = runs.filter((s) => !(r && s / 60 >= r[0] && s / 60 <= r[1]));
      rec(`⭐⭐ ${kind}: "${t[which]}" holds every run measured ${which === "step" ? "for its Generate land" : "in all"} (${runs.map((s) => (s / 60).toFixed(1)).join(", ")} min)`, !!r && out.length === 0, { label: t[which], range: r, outside: out });
    }
  }

  // ⛔ #a-re-roll-takes-a-re-rolls-time (review cr2, R5) — THE TOOLBAR BUTTON'S TITLE SAYS EVERY KIND'S TIME AS THE CONFIRM DOES. It said
  // "about 5 minutes, or 6 to 7 for a world generated again in the same mod", while the confirm shown for the same click says "about 8
  // minutes" for a re-roll cut from an earlier world's ocean. Read off map.html: the title says a first world's time in the confirm's
  // words, and its range for a world generated again holds every re-roll kind's own label and every run measured of that kind.
  {
    const HTML = require("./testlib-map-page.js").readSource("public", "map.html");
    const tm = /<button id="mapGenerateWorld"[^>]*\btitle="([^"]*)"/.exec(HTML);
    const title = tm ? tm[1] : "";
    const firstAll = P.worldMinutes({}).all, at = title.indexOf(firstAll);
    const again = at === -1 ? null : /(\d+) to (\d+)\b[^.]*\bagain\b/.exec(title.slice(at + firstAll.length));
    rec(`THE CONTROL: the 🌍 Generate a world button's title says a first world's time as the confirm does ("${firstAll}")`, at !== -1, title);
    rec("THE CONTROL: …and a range for a world generated again in the same mod", !!again, title);
    const lo = again ? Number(again[1]) : NaN, hi = again ? Number(again[2]) : NaN;
    for (const [kind, M] of Object.entries(MEASURED)) {
      if (!P.worldHasEarlierCut(M.plan)) continue;   // a world generated again, as the page itself tells one (an earlier world's cut)
      const label = P.worldMinutes(M.plan).all;
      const said = (/(\d+) to (\d+) minutes/.exec(label) || /(\d+) minutes/.exec(label) || []).slice(1).map(Number);
      const runs = M.all.map((s) => s / 60).filter((m) => !(m >= lo - 0.5 && m <= hi + 0.5));
      rec(`⭐⭐ ${kind}: the title's "${lo} to ${hi}" holds its confirm's "${label}" and every run measured of it`, said.length > 0 && said.every((n) => n >= lo && n <= hi) && runs.length === 0, { title, label, outside: runs });
    }
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
