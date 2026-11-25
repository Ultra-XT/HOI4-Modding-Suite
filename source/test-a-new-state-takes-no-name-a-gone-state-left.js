// ⛔ A NEW STATE IS NEVER HANDED THE NAME OF A STATE THAT IS GONE. #a-new-state-takes-no-name-a-gone-state-left
//
// Delete map → Generate land → Delete map → Generate land with another seed is the loop the map editor is built for. Delete
// map removes every state and leaves their names in Nova's own state-names files; Generate land then numbers from 1 again
// (max + 1 under replace_path), and localiseNewMapEntityNames KEPT any key the mod already defined — Nova's leftover lines
// included. So world 2 took world 1's names: a name the modder typed for world 1's state 1 ("Homeland", on provinces 4-37)
// landed on world 2's state 1 on the other side of the map, and on a vanilla-size world 229 of 860 victory points (26.6%)
// read a world-1 state's name instead of their own state's (design review of the parked map findings, 09-29, finding V3b).
//
// A sweep at Delete map was proposed and measured not to be enough: 🛟 Restore baseline removes every state made after the
// baseline and forgot no name either (it now puts back the names the baseline held, #a-baseline-keeps-its-states-names — and a
// baseline saved after Delete map holds the first world's leftovers all the same), and neither does a state file deleted by
// hand. The key a state is CREATED with is fresh by construction (max + 1, and freshStateNameKey skips a key any loading state
// uses), so a line only Nova's own file holds for it can only be a gone state's. So every creator — Generate land, Auto-fix's state-id floor and carve,
// "+ New state" — now writes over such a line; a name in the modder's OWN localisation is still theirs, and kept — and where
// Nova's files hold a leftover line for that key too, in any language, it goes, for in replace/ it won over theirs (section 6).
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
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const G = makeRegionWorld("gonename", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const BOM = String.fromCharCode(0xfeff);
const put = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
// the base game names the keys a new world reuses, in both its languages, as vanilla names all of its own
put(G.GAME, "localisation/english/state_names_l_english.yml", `${BOM}l_english:\n STATE_1:0 "Base One"\n`);
put(G.GAME, "localisation/german/state_names_l_german.yml", `${BOM}l_german:\n STATE_1:0 "Basis Eins"\n`);
// the modder's OWN files name STATE_2 — their text, whatever state comes to carry the key
const OWN = {
  english: put(G.MOD, "localisation/english/my_names_l_english.yml", `${BOM}l_english:\n STATE_2:0 "Modders Two"\n`),
  german: put(G.MOD, "localisation/german/my_names_l_german.yml", `${BOM}l_german:\n STATE_2:0 "Zwei des Modders"\n`),
};
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent");
const ownHash = { english: hash(OWN.english), german: hash(OWN.german) };

const { createApp } = require("./server.js");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
/** What one file defines: key → raw value (between the outer quotes). */
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*\r?$/gm)) m.set(x[1], x[2]); return m; };
const NOVA = (lang) => path.join(G.MOD, "localisation", lang, "replace", `nova_state_names_l_${lang}.yml`);
const LANGS = ["english", "german"];
const SHAPE = /^[A-Z][a-z]{3,10}$/;   // a made-up name (#a-generated-world-names-its-places)

const MAPJS = maskJsComments(read(path.join(__dirname, "public", "map.js")));
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
    console.log("0. The page's requests, as this test sends them");
    rec("Delete map queues blank-to-sea with {}", /queueWrite\("\/api\/map\/blank-to-sea", \{\}\)/.test(MAPJS));
    rec("…save-baseline and restore-baseline are { modPath }", ["save-baseline", "restore-baseline"].every((ep) => new RegExp(`fetch\\("\\/api\\/map\\/${ep}", \\{ method: "POST", headers: \\{ "Content-Type": "application\\/json" \\}, body: JSON\\.stringify\\(\\{ modPath: modPath\\(\\) \\}\\) \\}\\)`).test(MAPJS)));
    rec("…and 🔧 Auto-fix all, which a refused Save baseline tells the modder to run first, is { modPath } too", new RegExp(`fetch\\("\\/api\\/map\\/auto-fix", \\{ method: "POST", headers: \\{ "Content-Type": "application\\/json" \\}, body: JSON\\.stringify\\(\\{ modPath: modPath\\(\\) \\}\\) \\}\\)`).test(MAPJS));
    rec("…Generate land is { modPath, count, seed, ownerMode, owner, replacesExistingWorld }", /JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\)/.test(MAPJS));
    rec("…its count is round(sea provinces × percent / 100)", /const count = Math\.max\(1, Math\.round\(seaCount \* pct \/ 100\)\);/.test(MAPJS));
    rec("…set-state is { stateId, nameKey, fields }", /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MAPJS));
    rec("…create-state is { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…move-province is { provinceId, toStateId }", /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}/.test(MAPJS));

    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: G.MOD })) })
      .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
    // ⚠️ MOVED WITH #a-baseline-is-the-copy-known-to-load (review MF-1). POST /api/map/save-baseline now asks the Save check first,
    // over the game folder in use, and refuses a map Save stops for. Every map here — the blank canvas Delete map leaves among them —
    // is drawn on makeRegionWorld's grid, where four provinces meet at each cell corner: an X-crossing, which is in the fatal set. So
    // a baseline is saved the way the refusal tells a modder to: 🔧 Auto-fix all first (the page's own POST {modPath}), which here
    // recolours the crossing pixels.
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
    /** What a key reads as in English in game: the modder's own file wins where it names it, else Nova's. */
    const shownEn = (key) => { const own = defs(OWN.english); return own.has(key) ? own.get(key) : defs(NOVA("english")).get(key); };
    const homelandIn = () => LANGS.filter((l) => [...defs(NOVA(l)).values()].includes("Homeland"));

    /** The first world: Generate, then the modder renames its state 1 "Homeland" in the state panel. */
    const firstWorld = async (tag) => {
      const g = await generate(1);
      rec(`${tag}: Generate land (seed 1) makes a world`, g.s === 200 && g.b.ok === true && (g.b.newStates || []).length >= 2, { status: g.s, error: g.b.error, n: (g.b.newStates || []).length });
      const r = await rename(1, "Homeland");
      rec(`${tag}: its state 1 is renamed "Homeland" in the state panel`, r.s === 200 && r.b.ok === true && defs(NOVA("english")).get("STATE_1") === "Homeland", { res: r.b, line: defs(NOVA("english")).get("STATE_1") });
    };
    /** The second world, judged. `gen` is Generate land's answer; `leftover` what Nova's file named STATE_1 before it. */
    const judgeSecondWorld = async (tag, gen, leftover) => {
      const made = gen.b.newStates || [];
      const keys = made.map((s) => s.name);
      rec(`PRECONDITION (${tag}): the second world has a state 1 and a state 2, the keys the leftover line and the modder's own file name`,
        gen.s === 200 && gen.b.ok === true && keys.includes("STATE_1") && keys.includes("STATE_2"), { status: gen.s, error: gen.b.error, keys });
      const en = defs(NOVA("english"));
      rec(`⭐⭐⭐ ${tag}: state 1 is not handed "${leftover}" — the line a state that is gone left — but a made-up name of its own`,
        en.get("STATE_1") !== leftover && SHAPE.test(String(en.get("STATE_1"))), en.get("STATE_1"));
      const s1 = await stateOf(1);
      rec(`⭐⭐ ${tag}: …which is what the map shows for it`, !!s1 && s1.displayName === en.get("STATE_1"), s1 && [s1.name, s1.displayName]);
      const st = (await model()).states || [];
      const vps = [], wrong = [];
      for (const s of st) for (const v of s.victoryPoints || []) {
        vps.push(v.province);
        const got = en.get(`VICTORY_POINTS_${v.province}`), want = shownEn(s.name);
        if (got !== want) wrong.push({ state: s.id, province: v.province, point: got, state_reads: want });
      }
      rec(`⭐⭐⭐ ${tag}: every victory point reads its own state's name (${vps.length} points)`, vps.length >= 2 && wrong.length === 0, wrong);
      const de = defs(NOVA("german")), deWrong = [];
      for (const s of st) {
        if (defs(OWN.german).has(s.name)) continue;          // the modder's own translation is theirs
        if (de.get(s.name) !== en.get(s.name)) deWrong.push({ state: s.id, de: de.get(s.name), en: en.get(s.name) });
        for (const v of s.victoryPoints || []) if (de.get(`VICTORY_POINTS_${v.province}`) !== de.get(s.name)) deWrong.push({ state: s.id, point: v.province, de: de.get(`VICTORY_POINTS_${v.province}`) });
      }
      rec(`⭐⭐ ${tag}: German follows — each state Nova named, and its point, read the new name there too`, deWrong.length === 0, deWrong);
      rec(`⭐ ${tag}: "Homeland" is in none of Nova's files, in any language`, homelandIn().length === 0, homelandIn());
      const loc = gen.b.nameLocalisation || {};
      rec(`⭐⭐ ${tag}: the modder's own STATE_2 is kept — the one name the answer counts as kept`, loc.kept === 1 && shownEn("STATE_2") === "Modders Two" && !en.has("STATE_2"), { loc, shows: shownEn("STATE_2") });
      rec(`⭐ ${tag}: …and every other state is counted as named now`, loc.written === made.length - 1, { loc, states: made.length });
      rec(`⚠️ ${tag}: the modder's own files, English and German, are byte-identical`, hash(OWN.english) === ownHash.english && hash(OWN.german) === ownHash.german);
    };

    console.log("\n1. ⭐⭐⭐ Delete map → Generate → rename → Delete map → Generate");
    {
      const b1 = await post("/api/map/blank-to-sea", {});
      rec("Delete map empties the rebuilt world", b1.s === 200 && b1.b.ok === true && ((await model()).states || []).length === 0, { status: b1.s, error: b1.b.error });
      await firstWorld("1");
      const b2 = await post("/api/map/blank-to-sea", {});
      rec("Delete map again", b2.s === 200 && b2.b.ok === true, { status: b2.s, error: b2.b.error });
      rec("PRECONDITION: no state loads, and Nova's file still names STATE_1 \"Homeland\" — the line a new state 1 was handed",
        ((await model()).states || []).length === 0 && defs(NOVA("english")).get("STATE_1") === "Homeland", defs(NOVA("english")).get("STATE_1"));
      await judgeSecondWorld("1", await generate(7), "Homeland");
    }

    console.log("\n2. ⭐⭐⭐ Delete map → save baseline → Generate → rename → Restore baseline → Generate");
    {
      const b = await post("/api/map/blank-to-sea", {});
      rec("Delete map", b.s === 200 && b.b.ok === true, { status: b.s, error: b.b.error });
      const sb = await saveBaseline();
      rec("the blank canvas is saved as the baseline", sb.s === 200 && sb.b.ok === true, sb.b);
      await firstWorld("2");
      const rb = await post("/api/map/restore-baseline", {});
      rec("🛟 Restore baseline", rb.s === 200 && rb.b.ok === true, rb.b);
      // ⚠️ MOVED WITH #a-baseline-keeps-its-states-names. This asserted Nova's file still named STATE_1 "Homeland" after the Restore
      // ("Restore forgets no name either"). Restore now puts Nova's names back as the baseline held them, so "Homeland", typed
      // after it, goes with its state — but this baseline was saved after Delete map, when Nova's file still named section 1's
      // second world: those lines are leftovers all the same, with no state to name, and the next Generate must not adopt them.
      const leftover = defs(NOVA("english")).get("STATE_1");
      rec("PRECONDITION: no state loads, and Nova's file still names STATE_1 — a leftover the baseline held",
        ((await model()).states || []).length === 0 && SHAPE.test(String(leftover)), leftover);
      await judgeSecondWorld("2", await generate(7), leftover);
    }

    console.log("\n3. ⚠️ Delete map → Restore baseline with no new state between: the world comes back with every name it had");
    {
      // Nothing is forgotten when states go — a leftover is only written over when a new state takes its key — so a Restore with
      // no new state between finds every name as it left it, and writes none.
      const sb = await saveBaseline();
      rec("the second world is saved as the baseline", sb.s === 200 && sb.b.ok === true, sb.b);
      const before = ((await model()).states || []).map((s) => [s.id, s.displayName]);
      const novaBefore = LANGS.map((l) => hash(NOVA(l)));
      const b = await post("/api/map/blank-to-sea", {});
      const rb = await post("/api/map/restore-baseline", {});
      rec("Delete map, then 🛟 Restore baseline", b.b.ok === true && rb.b.ok === true, { blank: b.b.error, restore: rb.b });
      const after = ((await model()).states || []).map((s) => [s.id, s.displayName]);
      rec("⚠️ every state reads the name it had", before.length >= 2 && JSON.stringify(after) === JSON.stringify(before), { before, after });
      rec("⚠️ …and Nova's files, every language, are byte-identical", LANGS.every((l, i) => hash(NOVA(l)) === novaBefore[i]));
    }

    console.log("\n4. ⭐⭐⭐ \"+ New state\" after a state's file is deleted by hand takes the gone state's id — and a name of its own, not the gone state's panel name");
    {
      // ⚠️ MOVED WITH #a-baseline-keeps-its-states-names. This section made its leftover with 🛟 Restore baseline, which now puts
      // Nova's names back as the baseline held them and takes "Hué" away with its state (test-a-baseline-keeps-its-states-names.js).
      // A state file deleted by hand leaves the line behind, and only the creator can tell it is a gone state's.
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" });
      const id = a.b.id, key = a.b.name;
      rec("+ New state", a.s === 200 && a.b.ok === true && key === `STATE_${id}`, a.b);
      const donor = ((await model()).states || []).find((s) => s.id !== id && (s.provinces || []).length >= 2);
      const mv = await post("/api/map/move-province", { provinceId: donor.provinces[0], toStateId: id });
      rec("a province moves into it", mv.s === 200 && mv.b.ok === true, mv.b);
      const r = await rename(id, "Hué");
      rec(`it is renamed "Hué"`, r.s === 200 && defs(NOVA("english")).get(key) === "Hué" && defs(NOVA("german")).get(key) === "Hué", { res: r.b, en: defs(NOVA("english")).get(key), de: defs(NOVA("german")).get(key) });
      const dir = path.join(G.MOD, "history", "states");
      const own = fs.readdirSync(dir).filter((f) => new RegExp(`\\bid\\s*=\\s*${id}\\b`).test(read(path.join(dir, f))));
      if (own.length === 1) fs.unlinkSync(path.join(dir, own[0]));   // the modder deletes the state's file by hand
      rec(`PRECONDITION: state ${id}'s one file is deleted by hand, and Nova's file still names ${key} "Hué"`,
        own.length === 1 && !(await stateOf(id)) && defs(NOVA("english")).get(key) === "Hué", { files: own, line: defs(NOVA("english")).get(key) });
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec(`"+ New state" takes id ${id} and key ${key} again`, c.s === 200 && c.b.id === id && c.b.name === key, c.b);
      const now = defs(NOVA("english")).get(key);
      rec(`⭐⭐⭐ …and is called by a made-up name of its own, not "Hué"`, now !== "Hué" && SHAPE.test(String(now)), now);
      rec("⭐⭐ …which is what the page is told to show", c.b.displayName === now, c.b.displayName);
      rec("⭐⭐ …in German too", defs(NOVA("german")).get(key) === now, defs(NOVA("german")).get(key));
      rec("⭐ the answer counts it as written, not kept", c.b.nameLocalisation && c.b.nameLocalisation.written === 1 && c.b.nameLocalisation.kept === 0, c.b.nameLocalisation);
    }

    console.log("\n5. ⚠️ CONTROL: a LIVE state's name is never touched by a create — only a key no loading state uses is written over");
    {
      const live = ((await model()).states || []).find((s) => s.id !== 1 && s.id !== 2 && defs(NOVA("english")).has(s.name));
      const r = await rename(live.id, "Livename");
      rec(`live state ${live.id} is renamed "Livename"`, r.s === 200 && defs(NOVA("english")).get(live.name) === "Livename" && defs(NOVA("german")).get(live.name) === "Livename", { res: r.b, en: defs(NOVA("english")).get(live.name) });
      const before = LANGS.map((l) => defs(NOVA(l)));
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec("+ New state", c.s === 200 && c.b.ok === true && !!c.b.name, c.b);
      const after = LANGS.map((l) => defs(NOVA(l)));
      const changed = LANGS.map((l, i) => [...new Set([...before[i].keys(), ...after[i].keys()])].filter((k) => before[i].get(k) !== after[i].get(k)));
      rec("⚠️⚠️ in every language, the new state's own key is the only line of Nova's that changed", changed.every((ks) => JSON.stringify(ks) === JSON.stringify([c.b.name])), changed);
      const st = await stateOf(live.id);
      rec(`⚠️ state ${live.id} still reads "Livename" on the map`, !!st && st.displayName === "Livename", st && st.displayName);
      rec("⚠️ the modder's own files are still byte-identical", hash(OWN.english) === ownHash.english && hash(OWN.german) === ownHash.german);
    }

    console.log("\n6. ⭐⭐ A key being created that the MODDER's own English names: Nova's leftover lines for it go, every language, so theirs shows");
    {
      // A created key is fresh, so Nova's line for it is a gone state's even where the modder's own English names the key too —
      // and in replace/ it wins over the modder's file. So the gone state's "Hue" was what the new state showed, German got a
      // copy, and a German-only leftover stayed (review 2 of 0456bef, F5; the same at 0c4e824 — the shape is rare, since a panel
      // rename edits the modder's own file in place where it names the key).
      /** Nova's line for `key` in `lang` made to read `value` — or taken out, for null — as a leftover of a gone state would. */
      const setNova = (lang, key, value) => {
        const kept = read(NOVA(lang)).split(/\r?\n/).filter((l) => !new RegExp(`^[ \\t]*${key}:`).test(l) && l !== "");
        fs.writeFileSync(NOVA(lang), kept.join("\n") + "\n" + (value == null ? "" : ` ${key}:0 "${value}"\n`));
      };
      const b = await post("/api/map/blank-to-sea", {});
      setNova("english", "STATE_2", "Gonetwo");
      rec("PRECONDITION: Delete map, and Nova's English file holds a gone state's \"Gonetwo\" for STATE_2 — which the modder's own file names too",
        b.b.ok === true && defs(NOVA("english")).get("STATE_2") === "Gonetwo" && defs(OWN.english).get("STATE_2") === "Modders Two", defs(NOVA("english")).get("STATE_2"));
      const g = await generate(3);
      const s2 = await stateOf(2);
      rec("⭐⭐ Generate land: the new state 2 shows the modder's \"Modders Two\", not the gone state's \"Gonetwo\"", g.b.ok === true && !!s2 && s2.displayName === "Modders Two" && !defs(NOVA("english")).has("STATE_2"),
        { shows: s2 && s2.displayName, nova: defs(NOVA("english")).get("STATE_2"), loc: g.b.nameLocalisation });
      const pts = ((s2 && s2.victoryPoints) || []).map((v) => defs(NOVA("english")).get(`VICTORY_POINTS_${v.province}`));
      rec("⭐⭐ …and its victory point is paired with the name it shows, not with the gone state's", pts.length >= 1 && pts.every((p) => p === "Modders Two"), pts);
      rec("⭐ …and the answer counts it kept, as the modder's", (g.b.nameLocalisation || {}).kept === 1, g.b.nameLocalisation);
      rec("⚠️ the modder's own files are byte-identical", hash(OWN.english) === ownHash.english && hash(OWN.german) === ownHash.german);

      // "+ New state": a leftover in English and German (a panel rename of a gone state), and the modder's English names the key
      const nextId = () => model().then((m) => Math.max(0, ...(m.states || []).map((s) => s.id)) + 1);
      const later = path.join(G.MOD, "localisation", "english", "my_later_names_l_english.yml");
      const k1 = `STATE_${await nextId()}`;
      for (const lang of LANGS) setNova(lang, k1, "Hue");
      fs.writeFileSync(later, `${BOM}l_english:\n ${k1}:0 "Modderthree"\n`);
      const c1 = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec(`PRECONDITION: "+ New state" takes ${k1}, which Nova's English and German name "Hue" and the modder's own English "Modderthree"`, c1.b.ok === true && c1.b.name === k1, c1.b);
      rec("⭐⭐⭐ …and is shown the modder's \"Modderthree\", not the gone state's \"Hue\"", c1.b.displayName === "Modderthree" && (await stateOf(c1.b.id) || {}).displayName === "Modderthree", c1.b.displayName);
      rec("⭐⭐ …for Nova's \"Hue\" is gone from every language — German is not handed a copy of it", LANGS.every((l) => !defs(NOVA(l)).has(k1)), LANGS.map((l) => defs(NOVA(l)).get(k1)));
      rec("⭐ …and the answer counts it kept, not written", c1.b.nameLocalisation && c1.b.nameLocalisation.kept === 1 && c1.b.nameLocalisation.written === 0, c1.b.nameLocalisation);
      // …and a leftover in German alone
      const k2 = `STATE_${await nextId()}`;
      setNova("english", k2, null);
      setNova("german", k2, "Gonename");
      fs.appendFileSync(later, ` ${k2}:0 "Moddersfour"\n`);
      rec(`PRECONDITION: of Nova's files only the German names ${k2} ("Gonename"), and the modder's own English names it "Moddersfour"`,
        !defs(NOVA("english")).has(k2) && defs(NOVA("german")).get(k2) === "Gonename" && defs(later).get(k2) === "Moddersfour", { en: defs(NOVA("english")).get(k2), de: defs(NOVA("german")).get(k2) });
      const c2 = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec(`"+ New state" takes ${k2}, and shows the modder's "Moddersfour"`, c2.b.ok === true && c2.b.name === k2 && c2.b.displayName === "Moddersfour", c2.b);
      rec("⭐⭐ …and Nova's German \"Gonename\" is gone — German no longer shows a gone state's name on it", !defs(NOVA("german")).has(k2) && !defs(NOVA("english")).has(k2), { de: defs(NOVA("german")).get(k2), en: defs(NOVA("english")).get(k2) });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(G.ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a new state takes no name a gone state left: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
