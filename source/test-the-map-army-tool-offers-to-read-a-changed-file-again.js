// 🪖 ⛔ #a-stale-army-save-offers-to-read-it-again — WHEN THE MAP PAGE'S 💾 SAVE ARMY IS REFUSED BECAUSE THE COUNTRY'S FILE CHANGED ON
// DISK, THE PAGE SAYS A WAY BACK IT HAS, AND OFFERS IT (review cr2, page-process R4).
//
// Since 6749cf35 the map page's 🪖 Army tool sends the fingerprint of the file it read (baseFingerprint), and the server refuses a Save
// over a file something rewrote since — 🌍 Generate a world, Generate land, Auto-fix, Delete map's fold, another page — with 409 and
// nothing written. Its words end "Reload this country's army to pick it up, then make your edit again." On the map page nothing
// obvious does that (measured by the reviewer on a re-rolled copy of the owner's world, 28 of GER's 31 divisions on what is now
// water): Alt+click on the same country answers "Already editing GER." and keeps the stale model, a plain click places one more
// division, entering the Army tool again reads nothing while a country is loaded, and load() keeps a model with unsaved work. The
// one way was the panel's "change" button and then a click on the country.
//
// So the page asks, there and then, whether to read the country's army again (which drops the unsaved work, and the question says
// so); told yes, it reads it and says so; told no, it keeps the work and its panel names the way that does it — the "change" button
// by the text map.html gives it, then one of the country's provinces — and that way works.
//
// Everything runs through the real endpoints (createApp().listen(0): no fixed port) and the page's own functions lifted out of
// public/map.js by testlib-map-page: armyHasUnsaved, armyLoad, armySave, armyClickAt and armyWireOnce (the "change" button's own
// handler). The file's bytes, its fingerprint and the divisions are read off the server and the disk.
// Run: node test-the-map-army-tool-offers-to-read-a-changed-file-again.js
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
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-army-reads-again-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), { divisions: { AAA: 6, BBB: 6 } });
const { createApp } = require("./server.js");
const PAGE = require("./testlib-map-page.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = "AAA";

// the panel's controls, as map.html gives them (the page reads its own buttons' text; a fake element carries map.html's)
const HTML = PAGE.readSource("public", "map.html");
const buttonText = (id) => { const m = new RegExp(`<button id="${id}"[^>]*>([^<]*)</button>`).exec(HTML); return m ? m[1].trim() : null; };
const CHANGE = buttonText("armyChangeCountry"), SAVE = buttonText("armySaveBtn");

(async () => {
  const srv = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (ep, b) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const get = (ep) => fetch(base + ep).then((r) => r.json());
  try {
    const mod = (await post("/api/mod/create", { modName: "Army Reads Again" })).body.modRoot;
    const armyOnDisk = () => get(`/api/army?modPath=${encodeURIComponent(mod)}&tag=${TAG}`);
    const first = await armyOnDisk();
    const unitsFile = () => path.join(mod, "history", "units", first.file || `${TAG}_1936.txt`);
    const fileHash = () => { try { return crypto.createHash("sha1").update(fs.readFileSync(unitsFile())).digest("hex"); } catch (_) { return "(none)"; } };
    const byName = (divs) => JSON.stringify(divs.map((d) => [d.name, Number(d.location)]).sort());
    const SPOT = first.divisions.length ? Number(first.divisions[0].location) : null;

    /** The page's 🪖 Army tool: its own functions and state (the page's lets, as globals), the live server behind its fetch, and a
     *  confirm whose answer the test sets (`page.answer`) and whose questions it records (`page.asked`). */
    const armyPage = () => {
      const els = { armySaveBtn: PAGE.element("button"), armySaveStatus: PAGE.element("div"), armyChangeCountry: PAGE.element("button") };
      els.armyChangeCountry.textContent = CHANGE || "";
      els.armySaveBtn.textContent = SAVE || "";
      const asked = [], answers = [];
      const box = { answer: false };
      const confirm = (q) => { asked.push(String(q)); return box.answer; };
      const p = PAGE.runPage(["function armyHasUnsaved()", "async function armyLoad(", "async function armySave()", "function armyClickAt(", "function armyWireOnce()"], {
        armyTag: "", armyModel: { file: "", templates: [], divisions: [] }, armyLoadSeq: 0, armyDirtyTemplates: new Set(), armyRemovedSinceSave: false,
        armyVariants: [], armyTemplate: "", armyRemoveMode: false, _armyWired: false, renderArmyPanel() {}, draw() {}, modPath: () => mod,
        // the click lands on one of the country's own land provinces (the map's pixel lookup stands in for here)
        armyProvinceAt: () => ({ pid: SPOT, owner: TAG, type: "land" }),
        toggleArmyPresetPicker() {}, setMode() {},
        $: (id) => els[id] || null, confirm, window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm },
        fetch: async (u, init) => { const r = await fetch(base + u, init); answers.push({ url: String(u).split("?")[0], status: r.status }); return r; },
      });
      Object.assign(p, { els, asked, answers, box });
      return p;
    };
    const place = (page) => page.sb.armyModel.divisions.push({ name: `${90 + page.sb.armyModel.divisions.length}. ${page.sb.armyTemplate || "Inf"}`, location: SPOT, template: page.sb.armyTemplate || "Inf", _dirty: true });
    const saves = (page) => page.answers.filter((a) => a.url === "/api/army/save").map((a) => a.status);

    console.log("0. the fixture");
    rec("THE CONTROL: map.html's Army panel has its change and Save buttons", !!CHANGE && !!SAVE, { CHANGE, SAVE });
    rec("THE CONTROL: the country has an army, on a province of its own", first.divisions.length > 0 && SPOT != null && !!first.fingerprint, { divisions: first.divisions.length, SPOT });
    const CANCEL = armyPage(), YES = armyPage(), OTHER = armyPage();
    for (const p of [CANCEL, YES, OTHER]) await p.sb.armyLoad(TAG);
    rec("THE CONTROL: three map pages' Army tools loaded the country, with the fingerprint of the file they read", [CANCEL, YES, OTHER].every((p) => p.sb.armyTag === TAG && p.sb.armyModel.fingerprint === first.fingerprint), [CANCEL, YES, OTHER].map((p) => p.sb.armyModel.fingerprint));

    console.log("\n1. something else rewrites the country's file");
    place(OTHER);
    await OTHER.sb.armySave();
    const now = await armyOnDisk();
    rec("THE CONTROL: another page's Save wrote it (its order of battle changed on disk)", saves(OTHER).join() === "200" && now.fingerprint !== first.fingerprint && now.divisions.length === first.divisions.length + 1, { saves: saves(OTHER), divisions: now.divisions.length });
    const hash = fileHash();

    console.log("\n2. a Save over it, refused — and the modder says not now");
    place(CANCEL);
    const heldBefore = byName(CANCEL.sb.armyModel.divisions);
    CANCEL.box.answer = false;
    await CANCEL.sb.armySave();
    const said = String(CANCEL.els.armySaveStatus.textContent || "");
    rec("THE CONTROL: the server answered 409 and the file is byte for byte what the other page wrote", saves(CANCEL).join() === "409" && fileHash() === hash, { saves: saves(CANCEL), same: fileHash() === hash });
    rec("THE CONTROL: …and the panel says the file changed and nothing was written", /changed on disk/.test(said) && /Nothing was written/.test(said), said);
    rec("⭐⭐ the page offers to read the country's army again, there and then, and says the unsaved work goes", CANCEL.asked.length === 1 && CANCEL.asked[0].includes(TAG) && /again/i.test(CANCEL.asked[0]) && /discard/i.test(CANCEL.asked[0]), CANCEL.asked);
    rec("⭐ told no, it keeps the unsaved work and the model it had", CANCEL.sb.armyHasUnsaved() === true && byName(CANCEL.sb.armyModel.divisions) === heldBefore && CANCEL.sb.armyModel.fingerprint === first.fingerprint, { unsaved: CANCEL.sb.armyHasUnsaved() });
    rec("⭐⭐⭐ …and its panel names a way back the map page has: its “" + CHANGE + "” button, then one of " + TAG + "'s provinces", !!CHANGE && said.includes(`“${CHANGE}”`) && said.includes(`${TAG}'s provinces`), said);
    rec("⭐⭐ …not the server's \"Reload this country's army\", which nothing on the map page does", !/Reload this country's army/.test(said), said);
    // why it must say so: the obvious ways do not read it again
    CANCEL.sb.armyClickAt(0, 0, true);
    rec("THE CONTROL: Alt+click on the same country reads nothing (\"Already editing\"), so it could never be the way", /Already editing/.test(CANCEL.statuses[CANCEL.statuses.length - 1] || "") && CANCEL.sb.armyModel.fingerprint === first.fingerprint, CANCEL.statuses.slice(-1));

    console.log("\n3. the way the panel names works");
    CANCEL.sb.armyWireOnce();
    CANCEL.box.answer = true;   // "Change country? Unsaved divisions/templates … will be discarded." — yes
    for (const fn of CANCEL.els.armyChangeCountry.listeners.click || []) fn({});
    rec("THE CONTROL: the panel's change button drops the country, asking first", CANCEL.sb.armyTag === "" && /^Change country\?/.test(CANCEL.asked[CANCEL.asked.length - 1] || ""), { tag: CANCEL.sb.armyTag, asked: CANCEL.asked });
    CANCEL.sb.armyClickAt(0, 0, false);
    for (let i = 0; i < 50 && CANCEL.sb.armyModel.fingerprint !== now.fingerprint; i++) await sleep(100);
    rec("⭐⭐ …and a click on one of the country's provinces reads its army again, as it is on disk now", CANCEL.sb.armyTag === TAG && CANCEL.sb.armyModel.fingerprint === now.fingerprint && byName(CANCEL.sb.armyModel.divisions) === byName(now.divisions), { tag: CANCEL.sb.armyTag, fp: CANCEL.sb.armyModel.fingerprint });
    place(CANCEL);
    await CANCEL.sb.armySave();
    rec("⭐ …after which a Save writes", saves(CANCEL).join() === "409,200" && (await armyOnDisk()).divisions.length === now.divisions.length + 1, saves(CANCEL));

    console.log("\n4. a Save over it, refused — and the modder says yes, read it again");
    const before4 = await armyOnDisk(), hash4 = fileHash();
    place(YES);
    YES.box.answer = true;
    await YES.sb.armySave();
    const said4 = String(YES.els.armySaveStatus.textContent || "");
    rec("THE CONTROL: the server answered 409 and wrote nothing", saves(YES).join() === "409" && fileHash() === hash4, { saves: saves(YES) });
    rec("⭐⭐ the page asked, once, and the unsaved work went as the question said", YES.asked.length === 1 && YES.sb.armyHasUnsaved() === false, { asked: YES.asked, unsaved: YES.sb.armyHasUnsaved() });
    rec("⭐⭐⭐ …and it read the country's army again: the model and its fingerprint are the file's as it is now", YES.sb.armyTag === TAG && YES.sb.armyModel.fingerprint === before4.fingerprint && byName(YES.sb.armyModel.divisions) === byName(before4.divisions), { fp: YES.sb.armyModel.fingerprint, disk: before4.fingerprint });
    rec("⭐ …and its panel says so, and to make the edit again", /changed on disk/.test(said4) && /read again/i.test(said4) && /again/.test(said4), said4);
    place(YES);
    await YES.sb.armySave();
    rec("⭐⭐ a placement made then saves", saves(YES).join() === "409,200" && (await armyOnDisk()).divisions.length === before4.divisions.length + 1, saves(YES));
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
