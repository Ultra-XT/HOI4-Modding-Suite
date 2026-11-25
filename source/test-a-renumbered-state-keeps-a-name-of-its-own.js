// A renumbered state keeps a name of its own: the key moves with its id, and the next new state never shares it.
// #a-renumbered-state-keeps-a-name-of-its-own
//
// A state names itself with `name = "STATE_<id>"`, a localisation key. Measured over the installed maps (batch 8
// census-state-keys.js): the key is STATE_<its own id> for 1,081 of 1,081 vanilla states, 1,250/1,250 Millennium Dawn,
// 1,143/1,143 Road to 56, 1,371/1,371 Novum Vexillum, 1,154/1,154 Rise of Nations, 1,222/1,222 workshop 3721160655 and
// 1,523 of 1,524 Old World Blues, whose one exception is a shared key (states 1214 and 1314 both name STATE_1214). Nova's
// own writers — createState, generateLand, the model reader's default — all write STATE_<id>.
//
// Auto-fix closes a state-id gap by sliding the highest state down (renumberStateId). It rewrote the id, the filename,
// supply areas, buildings.txt and script references, and kept name = "STATE_<old id>". The next "+ New state" takes the
// old id back (max + 1) and writes the same key, so two states shared one name: create-state keeps a name the mod already
// has for its key, so the new state was handed the renumbered state's name, and renaming either renamed both. Measured by
// batch 7 owners (item H, probe-base.js, on 4592c54 and 396c560): Auto-fix deleted empty state 4 and renumbered 5 to 4;
// the model showed id 4 named STATE_5, and the next create-state took id 5 and key STATE_5.
//
// Now, when Auto-fix renumbers a state whose key is STATE_<old id>, the key moves to STATE_<new id> — in the state file
// and in Nova's own nova_state_names_l_english.yml — only when nothing but that file defines either key (not the modder's
// own localisation, in any language; not the base game or a dependency) and no other state uses either. Otherwise the key
// stays, and "+ New state" gives a new state a key no state uses.
//
// Requests are the page's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }),
// queueWrite("/api/map/move-province", { provinceId, toStateId }), stageStateWrite → queueWrite("/api/map/set-state",
// { stateId, nameKey, fields }) with the whole panel, POST /api/map/auto-fix { modPath }; flushMapSaves adds modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b8-renumbered-names");
const { createApp } = require("./server.js");

const BOM = String.fromCharCode(0xfeff);
const NOVA = "nova_state_names_l_english.yml";
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent");
/** Every definition of `key` in the mod's localisation: [{ file, value }]. */
const definitions = (mod, key) => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.yml$/i.test(e.name)) continue;
      for (const line of read(p).replace(BOM, "").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_.]+):\d*\s*"(.*)"\s*$/.exec(line);
        if (m && m[1] === key) out.push({ file: path.basename(p), value: m[2] });
      }
    }
  };
  walk(path.join(mod, "localisation"));
  return out;
};
/** The name key the mod's own state file writes for `id`, read off disk. */
const nameOnDisk = (mod, id) => {
  const d = path.join(mod, "history", "states");
  for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) {
    const txt = read(path.join(d, f)).replace(/#[^\n]*/g, "");
    const re = /state\s*=\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      if (new RegExp(`\\bid\\s*=\\s*${id}\\b`).test(m[1])) { const n = /\bname\s*=\s*"([^"]*)"/.exec(m[1]); return n ? n[1] : null; }
    }
  }
  return undefined;
};

const MAPJS = maskJsComments(read(path.join(__dirname, "public", "map.js")));
const html = read(path.join(__dirname, "public", "map.html"));
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
/** stageStateWrite's reading of the panel, filled from the model the way showInfo fills it. */
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
const sharedKeys = (model) => {
  const by = new Map();
  for (const s of (model.states || [])) { if (!by.has(s.name)) by.set(s.name, []); by.get(s.name).push(s.id); }
  return [...by.entries()].filter(([, ids]) => ids.length > 1);
};

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests, as this test sends them");
    rec("the page still creates a state with { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…moves a province with { provinceId, toStateId }", /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}/.test(MAPJS));
    rec("…and posts Auto-fix as { modPath: modPath() }", /fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/.test(MAPJS));

    srv = await lib.startServer(createApp);
    const post = (ep, body, mod) => srv.post(ep, body, mod).then((r) => ({ s: r.status, b: r.body }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);
    const rename = async (mod, id, name) => { const st = await stateOf(mod, id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (f) => { f.displayName = name; }) }, mod); };

    console.log("\n1. ⭐⭐⭐ Two states made with \"+ New state\", the second renamed \"Hué\", the first left empty, then Auto-fix");
    {
      const mod = world.mod("names nova", {});
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const b = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("both are created as 4 and 5, keyed STATE_4 and STATE_5", a.b.ok === true && b.b.ok === true && a.b.id === 4 && b.b.id === 5 && a.b.name === "STATE_4" && b.b.name === "STATE_5", { a: a.b, b: b.b });
      rec("a province moves into state 5", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const rn = await rename(mod, 5, "Hué");
      rec("state 5 is renamed \"Hué\" in the state panel", rn.s === 200 && rn.b.ok === true && definitions(mod, "STATE_5").length === 1 && definitions(mod, "STATE_5")[0].value === "Hué", { res: rn.b, defs: definitions(mod, "STATE_5") });

      const fx = await srv.autoFix(mod);
      const f = fx.body.fixes || {};
      rec("Auto-fix deletes the empty state 4 and renumbers 5 into it", fx.status === 200 && fx.body.ok === true
        && ((f.emptyStates || {}).deleted || []).includes(4) && JSON.stringify((f.stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), { status: fx.status, emptyStates: f.emptyStates, stateGaps: f.stateGaps, error: fx.body.error });
      const s4 = await stateOf(mod, 4);
      rec("⭐⭐⭐ the renumbered state is keyed STATE_4 in the model", s4 && s4.name === "STATE_4", s4 && s4.name);
      rec("⭐⭐ …and in its state file on disk", nameOnDisk(mod, 4) === "STATE_4", nameOnDisk(mod, 4));
      rec("⭐⭐ …and is still called \"Hué\"", s4 && s4.displayName === "Hué", s4 && s4.displayName);
      rec("⭐⭐ Nova's names file defines STATE_4 \"Hué\", once", JSON.stringify(definitions(mod, "STATE_4")) === JSON.stringify([{ file: NOVA, value: "Hué" }]), definitions(mod, "STATE_4"));
      rec("⭐ …and no longer defines STATE_5", definitions(mod, "STATE_5").length === 0, definitions(mod, "STATE_5"));
      rec("the response says which key moved", JSON.stringify((fx.body.stateNameKeys || {}).renamed) === JSON.stringify([{ stateId: 4, from: "STATE_5", to: "STATE_4" }]), fx.body.stateNameKeys);

      const c = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("\"+ New state\" takes id 5 again", c.b.ok === true && c.b.id === 5, c.b);
      // #a-generated-world-names-its-places — a state nobody named gets a made-up name now, not "State 5"
      rec("⭐⭐⭐ …and is called by a name of its own, not \"Hué\"", /^[A-Z][a-z]{3,10}$/.test(String(c.b.displayName || "")) && c.b.displayName !== "Hué", c.b.displayName);
      rec("⭐⭐ no two states share a name key", sharedKeys(await model(mod)).length === 0, sharedKeys(await model(mod)));
      rec("a province moves into the new state", (await post("/api/map/move-province", { provinceId: 2, toStateId: 5 }, mod)).b.ok === true);
      const rn2 = await rename(mod, 5, "Paris");
      rec("the new state is renamed \"Paris\"", rn2.s === 200 && rn2.b.ok === true, rn2.b);
      rec("⭐⭐⭐ …and the renumbered state is still \"Hué\"", ((await stateOf(mod, 4)) || {}).displayName === "Hué", ((await stateOf(mod, 4)) || {}).displayName);
    }

    console.log("\n2. ⭐⭐ A renumbered state Nova named keeps that name under its new id's key");
    {
      // #a-generated-world-names-its-places — Nova names a state nobody named with a made-up name, which is not tied to its id
      // the way "State 5" was, so the name simply moves with the key: STATE_5 "Colagrand" becomes STATE_4 "Colagrand".
      const mod = world.mod("names default", {});
      await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("a province moves into state 5", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const given = ((await stateOf(mod, 5)) || {}).displayName;
      rec("state 5 was given a made-up name", /^[A-Z][a-z]{3,10}$/.test(String(given || "")), given);
      const fx = await srv.autoFix(mod);
      rec("Auto-fix renumbers 5 into 4", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), (fx.body.fixes || {}).stateGaps);
      const s4 = await stateOf(mod, 4);
      rec("⭐⭐ state 4 is keyed STATE_4 and still called what state 5 was", s4 && s4.name === "STATE_4" && s4.displayName === given, s4 && [s4.name, s4.displayName, given]);
      rec("⭐ Nova's file holds STATE_4 with that name and no STATE_5", JSON.stringify(definitions(mod, "STATE_4")) === JSON.stringify([{ file: NOVA, value: given }]) && definitions(mod, "STATE_5").length === 0, { s4: definitions(mod, "STATE_4"), s5: definitions(mod, "STATE_5") });
    }

    console.log("\n3. ⚠️⚠️ A state whose STATE_5 name the modder's OWN localisation defines keeps its key");
    {
      const own = `${BOM}l_english:\n STATE_5:0 "Paris"\n`;
      const mod = world.mod("names own", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/4-Empty.txt": lib.st(4, ""),
        "history/states/5-Paris.txt": lib.st(5, "5"),
        "localisation/english/my_state_names_l_english.yml": own,
      });
      const OWN = path.join(mod, "localisation", "english", "my_state_names_l_english.yml");
      const fx = await srv.autoFix(mod);
      rec("Auto-fix deletes the empty state 4 and renumbers 5 into it", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), { status: fx.status, stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      const s4 = await stateOf(mod, 4);
      rec("⚠️⚠️ the renumbered state keeps STATE_5, the key the modder named", s4 && s4.name === "STATE_5" && nameOnDisk(mod, 4) === "STATE_5", s4 && [s4.name, nameOnDisk(mod, 4)]);
      rec("⚠️ …and is still called \"Paris\"", s4 && s4.displayName === "Paris", s4 && s4.displayName);
      rec("⚠️⚠️ the modder's names file is byte-identical", read(OWN) === own);
      rec("⚠️ …and Nova wrote no STATE_4 or STATE_5 of its own", definitions(mod, "STATE_4").length === 0 && JSON.stringify(definitions(mod, "STATE_5")) === JSON.stringify([{ file: "my_state_names_l_english.yml", value: "Paris" }]), { s4: definitions(mod, "STATE_4"), s5: definitions(mod, "STATE_5") });
      const ownHash = hash(OWN);
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("\"+ New state\" takes id 5", c.b.ok === true && c.b.id === 5, c.b);
      rec("⭐⭐⭐ …under a key no state uses — not STATE_5, which state 4 still names", c.b.name && c.b.name !== "STATE_5" && sharedKeys(await model(mod)).length === 0, { name: c.b.name, shared: sharedKeys(await model(mod)) });
      rec("⭐⭐⭐ …and is called by a name of its own, not \"Paris\"", /^[A-Z][a-z]{3,10}$/.test(String(c.b.displayName || "")) && c.b.displayName !== "Paris", c.b.displayName);
      rec("a province moves into the new state", (await post("/api/map/move-province", { provinceId: 2, toStateId: 5 }, mod)).b.ok === true);
      const rn = await rename(mod, 5, "Lyon");
      rec("the new state is renamed \"Lyon\"", rn.s === 200 && rn.b.ok === true, rn.b);
      rec("⭐⭐⭐ …and state 4 is still \"Paris\"", ((await stateOf(mod, 4)) || {}).displayName === "Paris", ((await stateOf(mod, 4)) || {}).displayName);
      rec("⚠️⚠️ …with the modder's file still untouched", hash(OWN) === ownHash, read(OWN));
    }

    console.log("\n4. ⚠️ A dependency that names STATE_4 itself: the key does not move onto a name a lower layer gives");
    {
      world.mod("b8 names dep", { "localisation/english/dep_state_names_l_english.yml": `${BOM}l_english:\n STATE_4:0 "Dep Four"\n` });
      const mod = world.mod("names addon", {}, ["b8 names dep"]);
      await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("a province moves into state 5", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const fx = await srv.autoFix(mod);
      rec("Auto-fix renumbers 5 into 4", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), (fx.body.fixes || {}).stateGaps);
      const s4 = await stateOf(mod, 4);
      rec("⚠️ the renumbered state keeps STATE_5 — the dependency already names STATE_4 \"Dep Four\"", s4 && s4.name === "STATE_5", s4 && s4.name);
      rec("⚠️ …and is not called \"Dep Four\"", s4 && s4.displayName !== "Dep Four", s4 && s4.displayName);
      const c = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("⭐⭐ the next new state takes a key no state uses", c.b.ok === true && c.b.id === 5 && sharedKeys(await model(mod)).length === 0, { c: c.b, shared: sharedKeys(await model(mod)) });
    }

    console.log("\n5. ⭐⭐ Generate land, the other writer of new states, gives its state a key no state uses too");
    {
      // ⚠️ MOVED WITH THE FIX. The page now also sends `replacesExistingWorld: true` — the endpoint gained a
      // populated-map gate that used to live only in the browser (#generate-land-is-gated-only-in-the-browser).
      // This fixture is far under that line, so the gate does not fire either way; what matters is that a
      // test whose job is to mirror the client keeps mirroring it, in the assertion AND in the request.
      // ⚠️ MOVED AGAIN — #a-generated-world-nobody-rules. The dialog gained a "Who owns it" control, because
      // every world Nova had ever generated was ownerless, so the body carries `ownerMode` and `owner` too.
      // THIRD test to mirror this one body literal; all three had to move together.
      const GEN = /fetch\("\/api\/map\/generate-land", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\) \}\)/;
      rec("the page still posts Generate land as { modPath, count, seed, ownerMode, owner, replacesExistingWorld }", GEN.test(MAPJS));
      const mod = world.mod("names generate", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/4-Empty.txt": lib.st(4, ""),
        "history/states/5-Paris.txt": lib.st(5, "5"),
        "localisation/english/my_state_names_l_english.yml": `${BOM}l_english:\n STATE_5:0 "Paris"\n`,
      });
      const fx = await srv.autoFix(mod);
      const s4 = await stateOf(mod, 4);
      rec("after Auto-fix, state 4 is the modder's \"Paris\", still keyed STATE_5", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]) && s4 && s4.name === "STATE_5", s4 && s4.name);
      const g = await post("/api/map/generate-land", { count: 1, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, mod);
      const made = (g.b.newStates || [])[0] || {};
      rec("Generate land makes one state, id 5", g.s === 200 && g.b.ok === true && made.id === 5, { status: g.s, error: g.b.error, newStates: g.b.newStates });
      rec("⭐⭐ …under a key no other state uses", made.name && made.name !== "STATE_5" && sharedKeys(await model(mod)).length === 0, { made, shared: sharedKeys(await model(mod)) });
      rec("⭐ …so state 4 is still \"Paris\"", ((await stateOf(mod, 4)) || {}).displayName === "Paris", ((await stateOf(mod, 4)) || {}).displayName);
    }

    console.log("\n6. ⭐⭐ A world Nova named before its names moved into replace/ (#a-name-nova-writes-must-win): the key moves where it is");
    {
      const OLD = path.join("localisation", "english", NOVA);
      const mod = world.mod("names before replace", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/4-Empty.txt": lib.st(4, ""),
        "history/states/5-Hue.txt": lib.st(5, "5"),
        [OLD.split(path.sep).join("/")]: `${BOM}l_english:\n STATE_5:0 "Hué"\n`,
      });
      const fx = await srv.autoFix(mod);
      rec("Auto-fix deletes the empty state 4 and renumbers 5 into it", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), { status: fx.status, stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      const s4 = await stateOf(mod, 4);
      rec("⭐⭐ the old file is Nova's own: the renumbered state is keyed STATE_4 and still called \"Hué\"", s4 && s4.name === "STATE_4" && s4.displayName === "Hué", s4 && [s4.name, s4.displayName]);
      rec("⭐⭐ …STATE_4 \"Hué\" is defined once, in that old file, and STATE_5 nowhere",
        JSON.stringify(definitions(mod, "STATE_4")) === JSON.stringify([{ file: NOVA, value: "Hué" }]) && /STATE_4:0 "Hué"/.test(read(path.join(mod, OLD))) && definitions(mod, "STATE_5").length === 0,
        { s4: definitions(mod, "STATE_4"), s5: definitions(mod, "STATE_5"), old: read(path.join(mod, OLD)) });
    }

    console.log("\n7. ⭐⭐ The key moves in the old file while a leftover line for its new key sits in replace/: the leftover goes too");
    {
      // Nova's two names files are one namespace since cac3a9f, and replace/ is the one that wins. The move used to run per
      // file and write only a file it had moved a key in, so a leftover STATE_4 in replace/ outlived a move made in the old
      // file and named the renumbered state "Stale Leftover" (review of cac3a9f, probe zz-probe-leftover.js). The empty
      // state 4 is keyed OTHER_4, so forgetting it does not take STATE_4 with it.
      const OLD = path.join("localisation", "english", NOVA), REP = path.join("localisation", "english", "replace", NOVA);
      const mod = world.mod("names leftover", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/4-Empty.txt": lib.st(4, "").replace('name = "STATE_4"', 'name = "OTHER_4"'),
        "history/states/5-Hue.txt": lib.st(5, "5"),
        [OLD.split(path.sep).join("/")]: `${BOM}l_english:\n STATE_5:0 "Hué"\n`,
        [REP.split(path.sep).join("/")]: `${BOM}l_english:\n STATE_4:0 "Stale Leftover"\n`,
      });
      const fx = await srv.autoFix(mod);
      rec("Auto-fix deletes the empty state 4 and renumbers 5 into it", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), { status: fx.status, stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      const s4 = await stateOf(mod, 4);
      rec("⭐⭐ the renumbered state is keyed STATE_4 and called \"Hué\", not the leftover's \"Stale Leftover\"", s4 && s4.name === "STATE_4" && s4.displayName === "Hué", s4 && [s4.name, s4.displayName]);
      rec("⭐⭐ …replace/ no longer defines STATE_4, and the old file defines it once as \"Hué\"",
        !/STATE_4:/.test(read(path.join(mod, REP))) && JSON.stringify(definitions(mod, "STATE_4")) === JSON.stringify([{ file: NOVA, value: "Hué" }]),
        { rep: read(path.join(mod, REP)), s4: definitions(mod, "STATE_4") });
      rec("…and replace/ keeps its BOM and header", read(path.join(mod, REP)).startsWith(BOM + "l_english:"), JSON.stringify(read(path.join(mod, REP)).slice(0, 20)));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a renumbered state keeps a name of its own: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
