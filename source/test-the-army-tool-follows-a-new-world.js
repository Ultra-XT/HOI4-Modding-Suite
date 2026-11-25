// 🪖 ⛔ #the-army-tool-follows-the-map-it-is-drawn-on — THE MAP PAGE'S ARMY TOOL NEVER SAVES THE OLD WORLD'S ORDER OF BATTLE OVER A NEW
// WORLD (review cr1, page-honesty F2).
//
// The 🪖 Army tool keeps the country it loaded (armyModel) for as long as the page is open. 🌍 Generate a world moves that country's
// divisions onto the land it makes (and Generate land, Auto-fix, Delete map's fold and Restore baseline move or replace the provinces
// they stand on); the page reloaded its map after the run and kept the army model from before it, and its 💾 Save merged that model
// into the file the world had just rewritten. Measured on a copy of the owner's world: 28 of GER's 31 divisions written back onto
// water. Reproduced here on testlib-split-world's fixture with an army on every province: the model the page held before the world
// put 58 of 144 divisions on non-land, and the validator then reported division_starts_on_water 58.
//
// So, as public/army.js already does:
//   1. armySave sends the fingerprint of the file its model was read from (baseFingerprint), and the server answers 409 and writes
//      nothing when the file changed since; a Save that wrote re-baselines on the fingerprint it answers;
//   2. load() — every reload after a write, a world's end included — reads the Army tool's country again (armyAfterMapReload). Its
//      unsaved work goes only through a reload that asked about it and was told to go on; one that did not ask (a Save's re-read,
//      a world's end) keeps it, and (1) refuses its Save if the file underneath changed;
//   3. 🌍 Generate a world will not start while the Army tool has unsaved work: the toolbar button and Go both say so and send nothing.
//
// Everything runs through the real endpoints (createApp().listen(0)) and the page's own functions: the world block through
// testlib-world-page, armyHasUnsaved / armyLoad / armyAfterMapReload / armySave and reloadAfterImmediateWrite / load lifted out of
// public/map.js by testlib-map-page. Every expected count is read off the disk.
// Run: node test-the-army-tool-follows-a-new-world.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-army-follows-world-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;
const SW = require("./testlib-split-world.js");
// an army on every province each country holds below, so the world's land cannot hold them all where they stood
SW.makeGame(DIRS.game, SW.makeShapes({}), { divisions: { AAA: 999, BBB: 999 } });
const md = require("./map-data.js");
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const PAGE = require("./testlib-map-page.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = "AAA";

// The line the world's gate says, read off the page (a back-out has none: that is one failed check, and the gate checks below fail too)
const pendingLit = /const WORLD_ARMY_PENDING = ("(?:[^"\\]|\\.)*");/.exec(PAGE.MASKED);
const WORLD_ARMY_PENDING = pendingLit ? JSON.parse(pendingLit[1]) : null;
const has = (opening) => PAGE.MASKED.indexOf(opening) !== -1;

(async () => {
  const srv = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (ep, b) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const get = (ep) => fetch(base + ep).then((r) => r.json());
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; };
  try {
    const mod = (await post("/api/mod/create", { modName: "Army Follows" })).body.modRoot;
    const unitsFile = path.join(mod, "history", "units", `${TAG}_1936.txt`);
    const armyOnDisk = () => get(`/api/army?modPath=${encodeURIComponent(mod)}&tag=${TAG}`);
    const landNow = () => {
      const own = path.join(mod, "map", "definition.csv");   // a fresh mod has none until the world writes one: the game's loads
      const def = md.parseDefinitionCsv(fs.readFileSync(fs.existsSync(own) ? own : path.join(DIRS.game, "map", "definition.csv"), "utf8"));
      return new Set(def.filter((p) => p.id > 0 && p.type === "land").map((p) => p.id));
    };
    const wet = (divs, land) => divs.filter((d) => !land.has(Number(d.location))).length;
    const fileHash = () => { try { return crypto.createHash("sha1").update(fs.readFileSync(unitsFile)).digest("hex"); } catch (_) { return "(none)"; } };

    /** The page's 🪖 Army tool: its own functions, its own state (the page's lets, as globals), the live server behind its fetch. */
    const armyPage = () => {
      const els = { armySaveBtn: PAGE.element("button"), armySaveStatus: PAGE.element("span") };
      const answers = [];
      const openings = ["function armyHasUnsaved()", "async function armyLoad(", "async function armySave()"].concat(has("function armyAfterMapReload(") ? ["function armyAfterMapReload("] : []);
      const p = PAGE.runPage(openings, {
        armyTag: "", armyModel: { file: "", templates: [], divisions: [] }, armyLoadSeq: 0, armyDirtyTemplates: new Set(), armyRemovedSinceSave: false,
        armyVariants: [], armyTemplate: "", renderArmyPanel() {}, draw() {}, modPath: () => mod, $: (id) => els[id] || null,
        fetch: async (u, init) => { const r = await fetch(base + u, init); answers.push({ url: String(u).split("?")[0], status: r.status, body: init && init.body ? JSON.parse(init.body) : null }); return r; },
      });
      if (typeof p.sb.armyAfterMapReload !== "function") p.sb.armyAfterMapReload = () => {};   // a page with no re-read (the back-out)
      p.els = els; p.answers = answers;
      return p;
    };
    /** The page's reload after a write: its own reloadAfterImmediateWrite and load, the army they ask about being `army`'s. */
    const reloadPage = (army, confirmAnswer) => {
      const asked = [], reread = [];
      const p = PAGE.runPage(["async function reloadAfterImmediateWrite(doneMsg, loadOpts)", "async function load(doneMsg)"], PAGE.loadGlobals({
        armyHasUnsaved: () => army.sb.armyHasUnsaved(),
        armyAfterMapReload: (d) => { reread.push(d); return army.sb.armyAfterMapReload(d); },
        window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: (q) => { asked.push(q); return confirmAnswer; } },
        mapCrashGate: async () => null, modPath: () => mod, model: null, Image: class { set src(v) { this._src = v; } },
        fetch: (u, init) => fetch(base + u, init),
      }));
      p.asked = asked; p.reread = reread;
      return p;
    };
    const place = (army, land, n = 1) => { for (let i = 0; i < n; i++) army.sb.armyModel.divisions.push({ name: `${90 + army.sb.armyModel.divisions.length}. Inf`, location: [...land][i % land.size], template: "Inf", _dirty: true }); };

    console.log("0. the page's army before the world");
    const before = await armyOnDisk();
    const A = armyPage(), STALE = armyPage();
    await A.sb.armyLoad(TAG); await STALE.sb.armyLoad(TAG);
    rec("THE CONTROL: the Army tool loaded the country, as the server reads it", A.sb.armyTag === TAG && A.sb.armyModel.divisions.length === before.divisions.length && before.divisions.length > 0, { page: A.sb.armyModel.divisions.length, disk: before.divisions.length });
    rec("⭐ …and keeps the fingerprint of the file its model was read from", !!before.fingerprint && A.sb.armyModel.fingerprint === before.fingerprint, { page: A.sb.armyModel.fingerprint, disk: before.fingerprint });

    console.log("\n1. 🌍 Generate a world will not start over unsaved 🪖 Army work");
    rec("the page says what it refuses with (WORLD_ARMY_PENDING)", !!WORLD_ARMY_PENDING && /Army/.test(WORLD_ARMY_PENDING) && /save/i.test(WORLD_ARMY_PENDING));
    const sent = [];
    const W = WP.worldPage({ modPath: mod, armyUnsaved: () => A.sb.armyHasUnsaved(),
      fetch: async (u, init) => { sent.push([String(u), init && init.body ? JSON.parse(init.body) : null]); return fetch(base + u, init); } });
    const posted = (u) => sent.filter(([x, b]) => x === u && b).length;
    const lastLine = () => String(W.statuses[W.statuses.length - 1] || "");
    place(A, landNow());
    rec("THE CONTROL: a division placed and not saved is unsaved work", A.sb.armyHasUnsaved() === true);
    const sentBefore = sent.length;
    await W.fire("mapGenerateWorld");
    rec("⭐⭐ the toolbar button says so and asks the server nothing", !!WORLD_ARMY_PENDING && lastLine() === WORLD_ARMY_PENDING && sent.length === sentBefore && W.el("mapWorldConfirm").style.display !== "flex", { line: lastLine(), sent: sent.slice(sentBefore).map((s) => s[0]) });
    A.sb.armyModel.divisions.pop();
    rec("THE CONTROL: the placement taken back, nothing is unsaved", A.sb.armyHasUnsaved() === false);
    await W.fire("mapGenerateWorld");
    rec("THE CONTROL: …and the button opens the world's confirm", W.el("mapWorldConfirm").style.display === "flex" && W.el("mapWorldGo").disabled === false, { shown: W.el("mapWorldConfirm").style.display, sent: sent.map((s) => s[0]) });
    place(A, landNow());   // a placement made while the confirm is open
    await W.fire("mapWorldGo");
    rec("⭐⭐ Go says so too and starts no run, when the work was made after the button was clicked", !!WORLD_ARMY_PENDING && lastLine() === WORLD_ARMY_PENDING && posted("/api/map/world-run") === 0, { line: lastLine(), posts: posted("/api/map/world-run") });
    A.sb.armyModel.divisions.pop();
    await W.fire("mapGenerateWorld");
    await W.fire("mapWorldGo");
    rec("THE CONTROL: with nothing unsaved, Go starts the run", posted("/api/map/world-run") === 1, sent.map((s) => s[0]));
    const ended = await until(() => W.reloads.length > 0, 240000);
    rec("THE CONTROL: the run ended and the page reloaded its map once", ended && W.reloads.length === 1, { reloads: W.reloads, line: lastLine() });

    console.log("\n2. what the world did to the country's army on disk");
    const after = await armyOnDisk(), land = landNow();
    const staleWet = wet(STALE.sb.armyModel.divisions, land);
    rec("THE CONTROL: the world rewrote the country's order of battle (its fingerprint moved)", !!after.fingerprint && after.fingerprint !== before.fingerprint, { before: before.fingerprint, after: after.fingerprint });
    rec("THE CONTROL: …and left none of its divisions on water", after.divisions.length > 0 && wet(after.divisions, land) === 0, { divisions: after.divisions.length, wet: wet(after.divisions, land) });
    rec("THE CONTROL: the model the page held from before the world has divisions on what is now water", staleWet > 0, { staleWet, of: STALE.sb.armyModel.divisions.length });

    console.log("\n3. a Save of the model from before the world writes nothing");
    const hashBefore = fileHash();
    place(STALE, land);   // work made on the old model (during the run, say), which the gate above could not see
    await STALE.sb.armySave();
    const saveAns = STALE.answers.filter((a) => a.url === "/api/army/save");
    rec("⭐⭐ armySave sends the fingerprint its model was read from", saveAns.length === 1 && saveAns[0].body && saveAns[0].body.baseFingerprint === before.fingerprint, saveAns.map((a) => a.body && a.body.baseFingerprint));
    rec("⭐⭐⭐ …so the server answers 409, and the page says the file changed and nothing was written", saveAns.length === 1 && saveAns[0].status === 409 && /changed on disk/.test(STALE.els.armySaveStatus.textContent) && /Nothing was written/.test(STALE.els.armySaveStatus.textContent), { status: saveAns.map((a) => a.status), says: STALE.els.armySaveStatus.textContent });
    const afterStale = await armyOnDisk();
    rec("⭐⭐⭐ THE EVIDENCE: the file is byte for byte the world's, and no division of the country stands on water", fileHash() === hashBefore && wet(afterStale.divisions, land) === 0, { same: fileHash() === hashBefore, wet: wet(afterStale.divisions, land), divisions: afterStale.divisions.length });

    console.log("\n4. the page's own reload after the world reads the army again");
    const R = reloadPage(A, true);
    await R.sb.reloadAfterImmediateWrite(W.reloads[0], W.reloadOpts[0]);
    const reread = await until(() => A.sb.armyModel.fingerprint === after.fingerprint, 10000);
    rec("THE CONTROL: the world's end reloads as a Save's re-read ({ afterSave: true }), which asks nothing", !!(W.reloadOpts[0] && W.reloadOpts[0].afterSave) && R.asked.length === 0, { opts: W.reloadOpts, asked: R.asked });
    rec("⭐⭐ load() reads the Army tool's country again, keeping only what it did not ask about", R.reread.length === 1 && R.reread[0] === false, R.reread);
    const byName = (divs) => JSON.stringify(divs.map((d) => [d.name, Number(d.location)]).sort());
    rec("⭐⭐⭐ …so the Army tool now holds the world's order of battle, and its fingerprint", reread && byName(A.sb.armyModel.divisions) === byName(after.divisions) && wet(A.sb.armyModel.divisions, land) === 0, { reread, page: A.sb.armyModel.divisions.length, disk: after.divisions.length, wet: wet(A.sb.armyModel.divisions, land) });
    place(A, land);
    await A.sb.armySave();
    const first = A.answers.filter((a) => a.url === "/api/army/save");
    const saved1 = await armyOnDisk();
    rec("⭐⭐ a division placed on the new world then saves, and nothing of the country is on water", first.length === 1 && first[0].status === 200 && saved1.divisions.length === after.divisions.length + 1 && wet(saved1.divisions, land) === 0, { status: first.map((a) => a.status), divisions: saved1.divisions.length, wet: wet(saved1.divisions, land) });
    place(A, land);
    await A.sb.armySave();
    const second = A.answers.filter((a) => a.url === "/api/army/save");
    const saved2 = await armyOnDisk();
    rec("⭐ …and so does a second Save: the first re-baselined on the fingerprint the server answered", second.length === 2 && second[1].status === 200 && saved2.divisions.length === after.divisions.length + 2 && A.sb.armyModel.fingerprint === saved2.fingerprint, { status: second.map((a) => a.status), says: A.els.armySaveStatus.textContent });

    console.log("\n5. unsaved work goes only through a reload that asked about it");
    {
      const B = armyPage(); await B.sb.armyLoad(TAG);
      place(B, land);
      const kept = reloadPage(B, true);
      await kept.sb.load("a Save's re-read", { afterSave: true }); await sleep(300);
      rec("⭐ a reload that did not ask (a Save's re-read) keeps the unsaved division", kept.asked.length === 0 && B.sb.armyHasUnsaved() === true && B.sb.armyModel.divisions.length === saved2.divisions.length + 1, { asked: kept.asked.length, unsaved: B.sb.armyHasUnsaved(), page: B.sb.armyModel.divisions.length });
      const no = reloadPage(B, false);
      await no.sb.load("a reload"); await sleep(300);
      rec("THE CONTROL: a reload answered Cancel changes nothing, and reads no army", no.asked.length === 1 && no.reread.length === 0 && B.sb.armyHasUnsaved() === true, { asked: no.asked.length, reread: no.reread });
      const yes = reloadPage(B, true);
      await yes.sb.load("a reload");
      const dropped = await until(() => !B.sb.armyHasUnsaved(), 10000);
      rec("⭐⭐ a reload answered Continue drops it, as its question said, and reads the country again", yes.asked.length === 1 && yes.reread.length === 1 && yes.reread[0] === true && dropped && byName(B.sb.armyModel.divisions) === byName(saved2.divisions), { asked: yes.asked.length, reread: yes.reread, unsaved: B.sb.armyHasUnsaved(), page: B.sb.armyModel.divisions.length });
      // …and a reload that asked nothing, because nothing was unsaved, was told nothing would go: a division placed while it reads the
      // country again (its request is out when load() returns, and the server answers only once this test yields) is kept
      const none = reloadPage(B, true);
      await none.sb.load("a reload with nothing unsaved");
      place(B, land);
      await sleep(500);
      rec("⭐ a reload that asked nothing keeps a division placed while it reads the country again", none.asked.length === 0 && none.reread.length === 1 && none.reread[0] === false && B.sb.armyHasUnsaved() === true && B.sb.armyModel.divisions.length === saved2.divisions.length + 1, { asked: none.asked.length, reread: none.reread, unsaved: B.sb.armyHasUnsaved(), page: B.sb.armyModel.divisions.length, disk: saved2.divisions.length });
    }
    console.log("\n6. the validator agrees");
    const v = await get(`/api/map/validate?modPath=${encodeURIComponent(mod)}`);
    const water = (v.problems || []).filter((p) => p.rule === "division_starts_on_water").reduce((n, p) => n + (p.total || 1), 0);
    rec("⭐⭐ no division starts on water after all of it", Array.isArray(v.problems) && water === 0, { water });
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
