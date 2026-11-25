// ⛔ 🛟 RESTORE BASELINE BRINGS THE STATES BACK WITH THEIR NAMES. #a-baseline-keeps-its-states-names
//
// A map baseline is map/ + history/states + history/countries, and a state's name is in none of them: it is a line in Nova's
// own state-names files, one per language. Since #a-new-state-takes-no-name-a-gone-state-left a new state writes over a line
// only Nova's file holds for its key, so save baseline → Delete map → Generate land → 🛟 Restore baseline brought the first
// world back reading the second world's names. Measured on a scratch copy of vanilla's map: 832 of 832 states, and not one of
// the 832 victory points pairing with its state. (It came back whole before only because the second world had ADOPTED the
// first world's names — 229 of its 860 points read another state's; see test-a-new-state-takes-no-name-a-gone-state-left.js.)
// The page pulses 🛟 Restore whenever errors remain, and its dialog says it "DISCARDS every map edit": a rename is one.
//
// Now the baseline holds Nova's own state-names files too, and Restore puts each back byte for byte; one made since goes down
// to its header, for it named nothing then. A baseline saved before this holds no list: Delete map hands it the names first
// (section 7), and a Restore of one that never got them leaves the names alone and SAYS so (section 5). A list it cannot
// honour in full is refused before one write (section 6), and a Restore with nothing to put back writes nothing (3b) — review 2
// of 0456bef, F1-F4.
//
// Requests are the page's (public/map.js): queueWrite("/api/map/blank-to-sea", {}), fetch("/api/map/save-baseline" |
// "/api/map/restore-baseline" | "/api/map/auto-fix", { modPath }), Generate land's body, queueWrite("/api/map/set-state", { stateId, nameKey, fields })
// with the whole panel, queueWrite("/api/map/create-state", { name: "", owner }), queueWrite("/api/map/move-province",
// { provinceId, toStateId }); flushMapSaves adds modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const G = makeRegionWorld("basenames", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const BOM = String.fromCharCode(0xfeff);
const put = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
put(G.GAME, "localisation/english/state_names_l_english.yml", `${BOM}l_english:\n STATE_1:0 "Base One"\n`);
put(G.GAME, "localisation/german/state_names_l_german.yml", `${BOM}l_german:\n STATE_1:0 "Basis Eins"\n`);
// the modder's OWN file: theirs, and never part of a map baseline
const OWN = put(G.MOD, "localisation/english/my_names_l_english.yml", `${BOM}l_english:\n STATE_2:0 "Modders Two"\n`);
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent");
const ownHash = hash(OWN);

const { createApp } = require("./server.js");
const { BACKUP_DIR } = require("./safe-write.js");
/** The backups taken since `before` (a Set of names) of Nova's state-names file in `lang`, by 🛟 Restore — by NAME, so the pool
 *  pruning its oldest cannot hide a new one. */
const listBackups = () => new Set(fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : []);
const restoreBackupsOf = (before, lang) => [...listBackups()].filter((n) => !before.has(n) && n.includes("map-restoreBaseline") && n.endsWith(`nova_state_names_l_${lang}.yml`));

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*\r?$/gm)) m.set(x[1], x[2]); return m; };
const NOVA = (lang) => path.join(G.MOD, "localisation", lang, "replace", `nova_state_names_l_${lang}.yml`);
/** Every one of Nova's state-names files in the mod, by walking it — derived, never typed. */
const novaFiles = () => {
  const out = [], loc = path.join(G.MOD, "localisation");
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^nova_state_names_l_[a-z_]+\.yml$/.test(e.name)) out.push(path.relative(G.MOD, p).replace(/\\/g, "/")); } };
  walk(loc);
  return out.sort();
};
const hashes = () => Object.fromEntries(novaFiles().map((r) => [r, hash(path.join(G.MOD, r))]));
const SHAPE = /^[A-Z][a-z]{3,10}$/;

const MAPJS_RAW = read(path.join(__dirname, "public", "map.js"));
const MAPJS = maskJsComments(MAPJS_RAW);
const html = read(path.join(__dirname, "public", "map.html"));
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
/** stageStateWrite's reading of the panel, filled from the model the way showInfo fills it (as the gone-name test). */
function panelFields(st, edit) {
  const f = {
    displayName: String(st.displayName || st.name || "").trim(), owner: st.owner || "", clearOwner: false,
    cores: (st.cores || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    manpower: String(st.manpower || 0), category: String(st.category || "").trim(),
    victoryPoints: (st.victoryPoints || []).map((v) => ({ province: parseInt(v.province, 10), value: parseInt(v.value, 10) })).filter((v) => Number.isFinite(v.province) && Number.isFinite(v.value) && v.value > 0),
    buildings: {}, resources: {},
  };
  for (const b of BLD) f.buildings[b] = parseInt((st.buildings && st.buildings[b]) || 0, 10) || 0;
  for (const r of RES) f.resources[r] = parseFloat((st.resources && st.resources[r]) || 0) || 0;
  const pid = (st.provinces || [])[0];
  if (pid !== undefined) {
    const pb = st.provinceBuildings && st.provinceBuildings[pid];
    f.provinceBuildings = [{ province: pid, building: "naval_base", level: parseInt((pb && pb.naval_base) || 0, 10) || 0 }];
  }
  if (edit) edit(f);
  return f;
}

(async () => {
  let server = null;
  try {
    console.log("0. The page's requests, as this test sends them — and what it says when a name could not travel");
    rec("save-baseline and restore-baseline are { modPath }", ["save-baseline", "restore-baseline"].every((ep) => new RegExp(`fetch\\("\\/api\\/map\\/${ep}", \\{ method: "POST", headers: \\{ "Content-Type": "application\\/json" \\}, body: JSON\\.stringify\\(\\{ modPath: modPath\\(\\) \\}\\) \\}\\)`).test(MAPJS)));
    rec("…and 🔧 Auto-fix all, which a refused Save baseline tells the modder to run first, is { modPath } too", new RegExp(`fetch\\("\\/api\\/map\\/auto-fix", \\{ method: "POST", headers: \\{ "Content-Type": "application\\/json" \\}, body: JSON\\.stringify\\(\\{ modPath: modPath\\(\\) \\}\\) \\}\\)`).test(MAPJS));
    rec("…Generate land is { modPath, count, seed, ownerMode, owner, replacesExistingWorld }", /JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\)/.test(MAPJS));
    rec("…set-state is { stateId, nameKey, fields }; create-state { name: \"\", owner }; Delete map {}",
      /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MAPJS) && /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS) && /queueWrite\("\/api\/map\/blank-to-sea", \{\}\)/.test(MAPJS));
    const handler = (ep) => { const at = MAPJS.indexOf(`fetch("/api/map/${ep}"`); return at < 0 ? "" : MAPJS.slice(at, MAPJS.indexOf("} catch (e)", at)); };
    rec("⭐ the Save baseline handler says a names error on the status line, rather than a complete click",
      /r\.stateNames && r\.stateNames\.error/.test(handler("save-baseline")) && /setStatus\([^;]*r\.stateNames\.error/.test(handler("save-baseline")), handler("save-baseline").length);
    // ⚠️ MOVED WITH review 2 of 0456bef (F1, F4). This asked the Restore handler for the same inline error test; it now hands the
    // answer to baselineStateNamesNote, which says the error, a baseline too old to hold the names, and the names it put back —
    // so that helper is lifted out of the page and RUN below, rather than grepped.
    // ⚠️ MOVED WITH the review of 5a1af33f (K2): the Restore line, namesNote in it, is built once and handed to setStatus AND to load(),
    // whose picture then wrote "Ready — …" over a bare `await load()`'s status — every note of the restore with it.
    { const h = handler("restore-baseline");
      rec("⭐ the Restore handler puts baselineStateNamesNote(r.stateNames) on its status line — and it is the line load() leaves, not \"Ready\"",
        /const namesNote = baselineStateNamesNote\(r\.stateNames\);/.test(h) && /const restoredLine = [^;]*\bnamesNote\b/.test(h) && /setStatus\(restoredLine\b/.test(h) && /await load\(restoredLine(?:, \{ afterSave: true \})?\)/.test(h), h.length); }
    /** A pure helper of the page, lifted by its declaration and its brace-counted body (either line ending), made callable. */
    const liftPure = (name) => {
      const at = MAPJS.indexOf(`function ${name}(`);
      const body = at < 0 ? null : jsBodyAt(maskJsLiterals(MAPJS_RAW), at);
      try { return body ? new Function(`${MAPJS_RAW.slice(at, body[1] + 1)}\nreturn ${name};`)() : null; } catch (_) { return null; }
    };
    const namesNote = liftPure("baselineStateNamesNote");
    const say = (sn) => (namesNote ? namesNote(sn) : null);
    rec("baselineStateNamesNote is lifted out of public/map.js", typeof namesNote === "function");
    rec("⭐ …it says a names file that could not be put back", /^ ⚠ Not every state's name could be put back \(disk full\)/.test(String(say({ restored: [], emptied: [], error: "disk full" }))), say({ error: "disk full" }));
    rec("⭐⭐ …and a baseline too old to hold the names: the states keep the names they have now, and a fresh baseline fixes it",
      /older than Nova keeping the states' names/.test(String(say({ notJudged: true }))) && /Save a fresh baseline/.test(String(say({ notJudged: true }))), say({ notJudged: true }));
    rec("⭐⭐ …and how many of Nova's names files it put back as they were — renames made since are undone, and said",
      say({ restored: ["a", "b"], emptied: ["c"] }) === " The names Nova gave your states are back as they were then (3 language files)."
      && say({ restored: [], emptied: ["c"] }) === " The names Nova gave your states are back as they were then (1 language file).", [say({ restored: ["a", "b"], emptied: ["c"] }), say({ restored: [], emptied: ["c"] })]);
    rec("⚠️ …and nothing at all when no name changed, or the answer says nothing of names", say({ restored: [], emptied: [] }) === "" && say(undefined) === "", [say({ restored: [], emptied: [] }), say(undefined)]);
    // ⚠️ MOVED WITH the review of the units-baseline fixes (R2): the dialog's text is built by baselineRestoreConfirmText from what the
    // baseline holds, so it is lifted and run for a baseline of each shape, rather than read off a `const restoreMsg = "…"` literal
    const confirmText = liftPure("baselineRestoreConfirmText");
    const restoreMsgs = confirmText ? [{ exists: true, heldUnits: true, heldDescriptors: true }, { exists: true }].map((i) => String(confirmText(i))) : [""];
    rec("⭐ the Restore dialog says the names Nova gave the states are discarded with every other map edit", restoreMsgs.every((m) => /DISCARDS every map edit/.test(m) && /names Nova gave them/.test(m)), restoreMsgs);

    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: G.MOD })) })
      .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
    // ⚠️ MOVED WITH #a-baseline-is-the-copy-known-to-load (review MF-1). POST /api/map/save-baseline now asks the Save check first,
    // over the game folder in use, and refuses a map Save stops for. Every world here is drawn on makeRegionWorld's grid, where four
    // provinces meet at each cell corner: an X-crossing, which is in the fatal set (112 of them after Generate land, seed 1). So a
    // baseline is saved the way the refusal tells a modder to: 🔧 Auto-fix all first (the page's own POST {modPath}), which here
    // recolours the crossing pixels and, measured on seed 1's world, leaves the same 13 states with the same provinces.
    const saveBaseline = async () => {
      const fx = await post("/api/map/auto-fix", {});
      const sb = await post("/api/map/save-baseline", {});
      if (sb.s !== 200) console.log(`   (Save baseline answered ${sb.s}: ${String(sb.b.error || "").slice(0, 300)}; Auto-fix: ${fx.b.ok ? "ok" : String(fx.b.error || fx.s)})`);
      return sb;
    };
    const model = () => fetch(`${base}/api/map/model?modPath=${encodeURIComponent(G.MOD)}`).then((r) => r.json());
    const stateOf = async (id) => ((await model()).states || []).find((s) => s.id === id);
    const generate = async (seed) => {
      const sea = ((await model()).provinces || []).filter((p) => p.type === "sea").length;
      return post("/api/map/generate-land", { count: Math.max(1, Math.round(sea * 35 / 100)), seed, ownerMode: "inherit", owner: "", replacesExistingWorld: true });
    };
    const rename = async (id, name) => { const st = await stateOf(id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (f) => { f.displayName = name; }) }); };
    const names = async () => ((await model()).states || []).map((s) => [s.id, s.displayName]);
    /** What every victory point reads in Nova's English and German files: [[province, en, de]]. (A panel rename leaves a state's
     *  city its name, as vanilla's cities are named apart from their states — so this is compared with itself, not with the state.) */
    const points = async () => {
      const en = defs(NOVA("english")), de = defs(NOVA("german")), out = [];
      for (const s of (await model()).states || []) for (const v of s.victoryPoints || []) out.push([v.province, en.get(`VICTORY_POINTS_${v.province}`), de.get(`VICTORY_POINTS_${v.province}`)]);
      return out.sort((a, b) => a[0] - b[0]);
    };

    console.log("\n1. A first world, named and renamed, saved as the baseline");
    let baselinePath = "", world1 = [], points1 = [], novaAtBaseline = {};
    {
      const b = await post("/api/map/blank-to-sea", {});
      const g = await generate(1);
      rec("Delete map, then Generate land (seed 1)", b.b.ok === true && g.b.ok === true && (g.b.newStates || []).length >= 2, { blank: b.b.error, gen: g.b.error, n: (g.b.newStates || []).length });
      const r = await rename(1, "Homeland");
      rec("its state 1 is renamed \"Homeland\" in the state panel", r.s === 200 && defs(NOVA("english")).get("STATE_1") === "Homeland", r.b);
      const sb = await saveBaseline();
      baselinePath = sb.b.baselinePath || "";
      rec("PRECONDITION: Nova names the world in two languages — the files a baseline has to carry", JSON.stringify(novaFiles()) === JSON.stringify(["localisation/english/replace/nova_state_names_l_english.yml", "localisation/german/replace/nova_state_names_l_german.yml"]), novaFiles());
      rec("⭐⭐ the baseline is saved, and says it holds every one of Nova's state-names files", sb.s === 200 && sb.b.ok === true && sb.b.stateNames && sb.b.stateNames.files === novaFiles().length && !sb.b.stateNames.error, sb.b.stateNames);
      // ⚠️ With no baseline saved here, baselinePath is "" and sections 5-7 join their folders onto it: path.join("", …) is RELATIVE,
      // so they wrote nova_state_names/_files.json and outside_l_english.yml into the folder the test was run from (seen in the
      // b6-g1 worktree while review MF-1's route refused this world). Nothing below works without this baseline: stop, and say why.
      if (!path.isAbsolute(baselinePath)) throw new Error(`section 1 saved no baseline (${sb.s}: ${String(sb.b.error || "").slice(0, 200)}), so no later section has a baseline folder to work in`);
      world1 = await names();
      points1 = await points();
      novaAtBaseline = hashes();
    }

    console.log("\n2. Delete map → Generate a second world — whose new states write over the first world's names");
    {
      const listAt = path.join(baselinePath, "nova_state_names", "_files.json");
      const listBefore = hash(listAt);
      const b = await post("/api/map/blank-to-sea", {});
      // an older baseline takes the names at Delete map (section 7); this one holds its own, and they are the baseline's
      rec("⚠️⚠️ Delete map leaves a baseline that holds its own names alone — it says it took none, and its list is byte-identical",
        b.b.ok === true && b.b.baselineStateNames === undefined && listBefore !== "absent" && hash(listAt) === listBefore, { said: b.b.baselineStateNames, listBefore, listNow: hash(listAt) });
      const g = await generate(7);
      rec("Delete map, then Generate land (seed 7)", b.b.ok === true && g.b.ok === true, { blank: b.b.error, gen: g.b.error });
      rec("PRECONDITION: the second world's state 1 took the key, so Nova's file no longer names it \"Homeland\"", defs(NOVA("english")).get("STATE_1") !== "Homeland" && SHAPE.test(String(defs(NOVA("english")).get("STATE_1"))), defs(NOVA("english")).get("STATE_1"));
      // a Nova state-names file made SINCE the baseline (the base game gains a language, say): it named nothing at the baseline
      put(G.MOD, "localisation/french/replace/nova_state_names_l_french.yml", `${BOM}l_french:\n STATE_1:0 "Troisieme"\n`);
    }

    console.log("\n3. ⭐⭐⭐ 🛟 Restore baseline — the first world comes back with its own names");
    {
      const pool = listBackups();
      const rb = await post("/api/map/restore-baseline", {});
      rec("the restore is answered", rb.s === 200 && rb.b.ok === true, rb.b);
      const now = await names();
      rec("⭐⭐⭐ every state reads the name it had at the baseline — state 1 \"Homeland\" among them", world1.length >= 2 && JSON.stringify(now) === JSON.stringify(world1) && (now.find(([id]) => id === 1) || [])[1] === "Homeland",
        { changed: now.filter(([id, n]) => (world1.find(([i]) => i === id) || [])[1] !== n).slice(0, 5), states: now.length });
      const p = await points();
      rec(`⭐⭐⭐ every victory point reads what it read at the baseline, in English and German (${points1.length} points)`, points1.length >= 2 && points1.every(([, en, de]) => !!en && de === en) && JSON.stringify(p) === JSON.stringify(points1),
        { at: points1.slice(0, 6), now: p.slice(0, 6) });
      const h = hashes();
      rec("⭐⭐ Nova's English and German files are byte for byte what they were at the baseline", Object.keys(novaAtBaseline).every((r) => h[r] === novaAtBaseline[r]), { at: novaAtBaseline, now: h });
      rec("⭐⭐ the French file made since the baseline is down to its header — it named nothing then", read(path.join(G.MOD, "localisation/french/replace/nova_state_names_l_french.yml")).replace(/\r\n/g, "\n") === `${BOM}l_french:\n`, read(path.join(G.MOD, "localisation/french/replace/nova_state_names_l_french.yml")));
      rec("⭐ the answer says which files it put back and which it emptied", JSON.stringify((rb.b.stateNames || {}).restored) === JSON.stringify(Object.keys(novaAtBaseline))
        && JSON.stringify((rb.b.stateNames || {}).emptied) === JSON.stringify(["localisation/french/replace/nova_state_names_l_french.yml"]) && !(rb.b.stateNames || {}).error, rb.b.stateNames);
      rec("⚠️ the modder's own file is byte-identical", hash(OWN) === ownHash);
      // every write a Restore makes into the mod is backed up first (CLAUDE.md, "All writes go through safeModWrite") — one each
      const took = { english: restoreBackupsOf(pool, "english"), german: restoreBackupsOf(pool, "german") };
      rec("⭐⭐ each file it put back was backed up first — exactly one backup of the English file, and one of the German", took.english.length === 1 && took.german.length === 1, took);
      const tookFr = restoreBackupsOf(pool, "french");
      rec("⭐⭐ …and the file it emptied too — exactly one backup of the French file, holding the name it took out", tookFr.length === 1 && /Troisieme/.test(read(path.join(BACKUP_DIR, tookFr[0] || "none"))), tookFr);
    }

    console.log("\n3b. ⚠️ A second 🛟 Restore with nothing changed since writes nothing — and takes no backup");
    {
      // Without these, every Restore click rewrote each of Nova's files, one backup per file per language (up to ten) into the
      // pool whose 200 slots hold the modder's real backups (review 2 of 0456bef, F3).
      const before = hashes(), pool = listBackups();
      const rb = await post("/api/map/restore-baseline", {});
      const sn = rb.b.stateNames || {};
      rec("⚠️⚠️ a file already as the baseline holds it is not put back again — restored [], and no backup of English or German",
        rb.b.ok === true && Array.isArray(sn.restored) && sn.restored.length === 0 && restoreBackupsOf(pool, "english").length === 0 && restoreBackupsOf(pool, "german").length === 0, sn);
      rec("⚠️⚠️ a file made since that is already down to its header is not emptied again — emptied [], and no backup of French",
        Array.isArray(sn.emptied) && sn.emptied.length === 0 && restoreBackupsOf(pool, "french").length === 0, sn);
      rec("⚠️ …and every one of Nova's files is byte-identical", JSON.stringify(hashes()) === JSON.stringify(before), { before, now: hashes() });
    }

    console.log("\n3c. ⚠️ A names file that cannot be written costs only itself — and is said, never swallowed");
    {
      const r = await rename(1, "Lockedout");
      const de = NOVA("german");
      rec("PRECONDITION: state 1 is renamed after the baseline, in English and German", r.s === 200 && defs(NOVA("english")).get("STATE_1") === "Lockedout" && defs(de).get("STATE_1") === "Lockedout", r.b);
      fs.chmodSync(de, 0o444);
      let rb = null;
      try { rb = await post("/api/map/restore-baseline", {}); } finally { fs.chmodSync(de, 0o644); }
      const sn = (rb && rb.b.stateNames) || {};
      rec("⚠️⚠️ the German file it could not write is named in the answer, and English is put back all the same",
        String(sn.error || "").startsWith("localisation/german/replace/nova_state_names_l_german.yml: ") && JSON.stringify(sn.restored) === JSON.stringify(["localisation/english/replace/nova_state_names_l_english.yml"])
        && defs(NOVA("english")).get("STATE_1") === "Homeland" && defs(de).get("STATE_1") === "Lockedout", { names: sn, de: defs(de).get("STATE_1") });
      const rb2 = await post("/api/map/restore-baseline", {});
      rec("(and once it can be written, a Restore puts German back too)", JSON.stringify((rb2.b.stateNames || {}).restored) === JSON.stringify(["localisation/german/replace/nova_state_names_l_german.yml"]) && defs(de).get("STATE_1") === "Homeland", rb2.b.stateNames);
    }

    console.log("\n4. ⭐⭐ \"+ New state\" after a Restore gets a name of its own — the Restore took the gone state's \"Hué\" back with it");
    {
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" });
      const id = a.b.id, key = a.b.name;
      const donor = ((await model()).states || []).find((s) => s.id !== id && (s.provinces || []).length >= 2);
      const mv = await post("/api/map/move-province", { provinceId: donor.provinces[0], toStateId: id });
      const r = await rename(id, "Hué");
      rec(`+ New state ${id}, a province moved in, renamed "Hué"`, a.b.ok === true && mv.b.ok === true && r.s === 200 && defs(NOVA("english")).get(key) === "Hué", { a: a.b, mv: mv.b, r: r.b });
      const rb = await post("/api/map/restore-baseline", {});
      rec(`⭐⭐ 🛟 Restore takes state ${id} away, and its name with it`, rb.b.ok === true && !(await stateOf(id)) && !defs(NOVA("english")).has(key) && !defs(NOVA("german")).has(key), { en: defs(NOVA("english")).get(key), de: defs(NOVA("german")).get(key) });
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec(`⭐⭐ "+ New state" takes id ${id} again, and a made-up name of its own, not "Hué"`, c.b.id === id && c.b.displayName !== "Hué" && SHAPE.test(String(c.b.displayName)) && defs(NOVA("english")).get(key) === c.b.displayName, c.b);
      const rb2 = await post("/api/map/restore-baseline", {});
      rec("(and a Restore puts the baseline back once more)", rb2.b.ok === true && JSON.stringify(await names()) === JSON.stringify(world1), rb2.b);
    }

    console.log("\n5. ⚠️ A baseline saved before its states' names went into it: Restore leaves the names alone, as it always did — and says so");
    {
      const sb = await saveBaseline();
      const list = path.join(sb.b.baselinePath || baselinePath, "nova_state_names", "_files.json");
      rec("PRECONDITION: the baseline holds the list of Nova's files", sb.b.ok === true && fs.existsSync(list), list);
      if (fs.existsSync(list)) fs.renameSync(list, list + ".aside");   // a baseline written by the Nova before this one: no list
      const r = await rename(1, "Changed");
      rec("state 1 is renamed \"Changed\" after that baseline", r.s === 200 && defs(NOVA("english")).get("STATE_1") === "Changed", r.b);
      const before = hashes();
      const rb = await post("/api/map/restore-baseline", {});
      rec("the restore is answered", rb.s === 200 && rb.b.ok === true, rb.b);
      const after = hashes();
      rec("⚠️⚠️ not one of Nova's names files is written — state 1 still reads \"Changed\"", JSON.stringify(after) === JSON.stringify(before) && defs(NOVA("english")).get("STATE_1") === "Changed", { before, after });
      // ⚠️ MOVED WITH review 2 of 0456bef (F1). This asserted the answer said NOTHING of the names here. But a state made since such a
      // baseline may have written over their lines, and a silent Restore then brought the first world back wearing the second
      // world's names; the page now says the baseline is too old to hold them (baselineStateNamesNote, section 0).
      rec("⭐⭐ …and the answer says it could not judge the names, for the page to say so", !!rb.b.stateNames && rb.b.stateNames.notJudged === true && !rb.b.stateNames.restored, rb.b.stateNames);
      // CONTROL: a mod with no names of Nova's has nothing such a Restore could have left wrong, and is told nothing
      const mine = novaFiles();
      for (const r of mine) fs.renameSync(path.join(G.MOD, r), path.join(G.MOD, r) + ".aside");
      const rb2 = await post("/api/map/restore-baseline", {});
      rec("⚠️ CONTROL: with none of Nova's state-names files in the mod, the same Restore says nothing about names", rb2.b.ok === true && mine.length >= 2 && novaFiles().length === 0 && rb2.b.stateNames === undefined, { files: mine, names: rb2.b.stateNames });
      for (const r of mine) fs.renameSync(path.join(G.MOD, r) + ".aside", path.join(G.MOD, r));
      if (fs.existsSync(list + ".aside")) fs.renameSync(list + ".aside", list);
    }

    console.log("\n6. ⚠️ A list naming anything but one of Nova's state-names files is refused — whole, before one write");
    {
      const sb = await saveBaseline();
      const dir = path.join(sb.b.baselinePath || baselinePath, "nova_state_names");
      const held = JSON.parse(read(path.join(dir, "_files.json")) || "{}").files || [];
      const outside = path.join(G.ROOT, "mods", "outside_l_english.yml");
      put(dir, "../outside_l_english.yml", `${BOM}l_english:\n X:0 "x"\n`);
      put(dir, "_files.json", JSON.stringify({ files: ["../outside_l_english.yml"] }));
      let before = hashes();
      const rb = await post("/api/map/restore-baseline", {});
      rec("⚠️ nothing is written outside the mod's localisation", rb.b.ok === true && !fs.existsSync(outside), { outside: fs.existsSync(outside), names: rb.b.stateNames });
      rec("⚠️ …and the answer says why", /not one of Nova's state-names files/.test(String((rb.b.stateNames || {}).error)), rb.b.stateNames);
      // …and the refusal is not the end of it: the loop after it emptied every file of Nova's the bad list did not name, so every
      // state in the world fell back to the base game's name — "Base One" for state 1 (review 2 of 0456bef, F2)
      rec("⭐⭐⭐ not one of Nova's names files is written — none put back, none emptied, every one byte-identical",
        JSON.stringify(hashes()) === JSON.stringify(before) && JSON.stringify((rb.b.stateNames || {}).restored) === "[]" && JSON.stringify((rb.b.stateNames || {}).emptied) === "[]" && (await stateOf(1)).displayName !== "Base One",
        { names: rb.b.stateNames, before, now: hashes() });
      // a list whose every other entry is good: a restore of part of the names is not the baseline's either
      const r = await rename(1, "Renamedsince");
      rec("PRECONDITION: state 1 is renamed after that baseline, so a Restore of Nova's English file would change it", r.s === 200 && defs(NOVA("english")).get("STATE_1") === "Renamedsince" && held.length >= 2, { held, line: defs(NOVA("english")).get("STATE_1") });
      put(dir, "_files.json", JSON.stringify({ files: [...held, "localisation/english/replace/../../../descriptor.mod"] }));
      before = hashes();
      const rb2 = await post("/api/map/restore-baseline", {});
      rec("⭐⭐ a list with ONE entry refused among good ones puts back none of them — state 1 still reads \"Renamedsince\"",
        rb2.b.ok === true && JSON.stringify(hashes()) === JSON.stringify(before) && defs(NOVA("english")).get("STATE_1") === "Renamedsince" && /descriptor\.mod: not one of Nova's state-names files/.test(String((rb2.b.stateNames || {}).error)),
        { names: rb2.b.stateNames, line: defs(NOVA("english")).get("STATE_1") });
      // …and one the baseline holds no copy of: a list it cannot honour in full
      const r2 = await rename(1, "Renamedagain");
      const lacks = held.find((rel) => !/\/english\//.test(rel));
      fs.renameSync(path.join(dir, ...lacks.split("/")), path.join(dir, ...lacks.split("/")) + ".aside");
      put(dir, "_files.json", JSON.stringify({ files: held }));
      before = hashes();
      const rb3 = await post("/api/map/restore-baseline", {});
      rec(`⭐ a list naming a copy the baseline lacks (${lacks.split("/")[1]}) puts back none of them either — not English — and says which`, r2.s === 200 && rb3.b.ok === true && JSON.stringify(hashes()) === JSON.stringify(before)
        && defs(NOVA("english")).get("STATE_1") === "Renamedagain" && String((rb3.b.stateNames || {}).error).startsWith(lacks), { names: rb3.b.stateNames, line: defs(NOVA("english")).get("STATE_1") });
    }

    console.log("\n7. ⭐⭐⭐ An OLDER baseline (no names in it) → Delete map → Generate → 🛟 Restore: the first world comes back with its own names");
    {
      // Every baseline saved before the names went into one — the released build's among them — holds none. Since
      // #a-new-state-takes-no-name-a-gone-state-left the second world's states write over the first world's leftover lines, so
      // this flow brought the first world back wearing the second world's names: 11 of 11 states, "Homeland" gone, and the page
      // said only "Restored" (review 2 of 0456bef, F1; 0 of 11 before that fix, when the second world adopted the leftovers).
      const r = await rename(1, "Homeland");
      const sb = await saveBaseline();
      const dir = path.join(sb.b.baselinePath || baselinePath, "nova_state_names");
      if (fs.existsSync(dir)) fs.renameSync(dir, dir + ".aside");   // what a baseline from before the names went into one holds: none
      rec("PRECONDITION: state 1 reads \"Homeland\", and the baseline just saved holds no names — as an older Nova's",
        r.s === 200 && sb.b.ok === true && !fs.existsSync(path.join(dir, "_files.json")) && defs(NOVA("english")).get("STATE_1") === "Homeland", { names: sb.b.stateNames });
      const world = await names();
      const b = await post("/api/map/blank-to-sea", {});
      rec("⭐⭐ Delete map hands that baseline the names of every one of Nova's files, before a new state can write over them",
        b.b.ok === true && !!b.b.baselineStateNames && b.b.baselineStateNames.files === novaFiles().length && novaFiles().length >= 2
        && JSON.stringify(JSON.parse(read(path.join(dir, "_files.json")) || "{}").files) === JSON.stringify(novaFiles()), { said: b.b.baselineStateNames, files: novaFiles() });
      const g = await generate(7);
      rec("PRECONDITION: Generate land (seed 7) — its state 1 writes over \"Homeland\"", g.b.ok === true && defs(NOVA("english")).get("STATE_1") !== "Homeland", { gen: g.b.error, line: defs(NOVA("english")).get("STATE_1") });
      const rb = await post("/api/map/restore-baseline", {});
      const now = await names();
      rec("⭐⭐⭐ 🛟 Restore: every state reads the name it had before Delete map — state 1 \"Homeland\" among them",
        rb.b.ok === true && world.length >= 2 && JSON.stringify(now) === JSON.stringify(world) && (now.find(([id]) => id === 1) || [])[1] === "Homeland",
        { changed: now.filter(([id, n]) => (world.find(([i]) => i === id) || [])[1] !== n).slice(0, 5), states: now.length });
      rec("⭐ …and the answer says it put Nova's names back, not that it could not judge them", !!rb.b.stateNames && !rb.b.stateNames.notJudged && (rb.b.stateNames.restored || []).length >= 1 && !rb.b.stateNames.error, rb.b.stateNames);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(G.ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a baseline keeps its states' names: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
