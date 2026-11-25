// A state merged away or deleted takes its name with it: Nova's own state-names file keeps no key for a state that is gone.
// #a-state-that-is-gone-leaves-no-name-behind
//
// Found in the owner's torture build (nova_torture_0917, through the real endpoints): "+ New state" named 1083 and 1084 in
// localisation/english/nova_state_names_l_english.yml (#a-new-state-has-no-name), 1084 was merged into 1083, and the file still
// held `STATE_1084:0 "State 1084"` — a name for a state that no longer exists. Harmless on its own, but not for long: the next
// "+ New state" takes id max+1, which is 1084 again, and create-state KEEPS a name the mod already has for its key
// (localiseNewMapEntityNames, so a modder's own text is never overwritten). A state renamed "Hué" and merged away hands "Hué" to
// the next new state. delete-state — which the page queues for a discarded or emptied state — left the same orphan.
//
// Now merge-state and delete-state take the removed state's key out of Nova's own state-names file: only that file (a name in the
// mod's own localisation is the modder's, and stays), and only when no state still loading uses the key.
// Requests are the client's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }),
// queueWrite("/api/map/move-province", { provinceId, toStateId }), stageStateWrite → queueWrite("/api/map/set-state",
// { stateId, nameKey, fields }) with the whole panel, queueWrite("/api/map/merge-state", { sourceStateId, targetStateId }),
// queueWrite("/api/map/delete-state", { stateId }); flushMapSaves adds modPath.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gone-name-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const BOM = String.fromCharCode(0xfeff);
// ⛔ A base game of the test's own, with languages besides English. Without one resolveHoi4GameRoot finds whatever install this
// machine has, so "gone in every language" meant something only where the real game is installed (review of e1f3586, 9).
// Outside ROOT, which is the mods root.
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gone-name-game-"));
for (const [rel, c] of Object.entries({
  "hoi4.exe": "not really an exe",
  "localisation/english/base_l_english.yml": `${BOM}l_english:\n STATE_900:0 "Earthone"\n`,
  "localisation/german/base_l_german.yml": `${BOM}l_german:\n STATE_900:0 "Erdeins"\n`,
  "localisation/french/base_l_french.yml": `${BOM}l_french:\n STATE_900:0 "Terreun"\n`,
  "common/state_category/00_state_category.txt": "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n\ttown = {\n\t\tlocal_building_slots = 4\n\t}\n}\n",
})) { const p = path.join(GAME, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
process.env.HOI4_ROOT = GAME;
const MOD = path.join(ROOT, "mod");
const ENG = path.join(MOD, "localisation", "english");
const NOVA_FILE = path.join(ENG, "replace", "nova_state_names_l_english.yml");
const OWN_FILE = path.join(ENG, "my_state_names_l_english.yml");
const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent");
/** Every definition of `key` in the mod's English localisation: [{ file, value }] — or in every language, with `lang` "*".
 *  ⚠️ MOVED WITH THE FIX: a name is now written into every language the game has (#a-state-name-in-every-language), so a
 *  count of 1 is a count in English; "no longer defined anywhere" still means anywhere, every language (anywhere()). */
const definitions = (key, lang = "english") => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!(lang === "*" ? /\.yml$/i : new RegExp(`_l_${lang}\\.yml$`, "i")).test(e.name)) continue;
      for (const line of read(p).replace(BOM, "").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_.]+):\d*\s*"(.*)"\s*$/.exec(line);
        if (m && m[1] === key) out.push({ file: path.basename(p), value: m[2] });
      }
    }
  };
  walk(path.join(MOD, "localisation"));
  return out;
};
const anywhere = (key) => definitions(key, "*");

const MAPJS = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
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

const stateFile = (id, name, provinces) => `state = {\n\tid = ${id}\n\tname = "${name}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t}\n\tprovinces = {\n\t\t${provinces.join(" ")}\n\t}\n}\n`;
mk("descriptor.mod", 'name="gone name"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q, i) => `${q};${i + 1};0;0;land;false;plains;1`)].join("\n") + "\n");
mk("history/states/1-Alpha.txt", stateFile(1, "STATE_1", [1, 2, 3]));
mk("history/states/2-Beta.txt", stateFile(2, "STATE_2", [4, 5, 6, 7, 8]));
mk("history/states/3-Gamma.txt", stateFile(3, "SHARED_NAME", [9]));
mk("history/states/4-Delta.txt", stateFile(4, "SHARED_NAME", [10]));
mk("localisation/english/my_state_names_l_english.yml", `${BOM}l_english:\n STATE_1:0 "Alpha"\n STATE_2:0 "Beta"\n`);

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: MOD })) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const stateOf = async (id) => ((await fetch(`http://127.0.0.1:${PORT}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json())).states || []).find((s) => s.id === id);
  try {
    console.log("0. The client's requests, as this test sends them");
    rec("the page still creates a state with { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…merges with { sourceStateId, targetStateId }", /queueWrite\("\/api\/map\/merge-state", \{ sourceStateId: sourceSid, targetStateId: targetSid \}/.test(MAPJS));
    rec("…and deletes with { stateId }", /queueWrite\("\/api\/map\/delete-state", \{ stateId: (s\.id|sid) \}/.test(MAPJS));

    console.log("\n1. Two new states, the second renamed, then merged into the first  (create-state, move-province, set-state, merge-state)");
    const a = await post("/api/map/create-state", { name: "", owner: "AAA" });
    const b = await post("/api/map/create-state", { name: "", owner: "AAA" });
    rec("both states are created", a.b.ok === true && b.b.ok === true && b.b.id === a.b.id + 1, { a: a.b, b: b.b });
    const A = a.b.id, B = b.b.id, keyA = a.b.name, keyB = b.b.name;
    rec("…each named in Nova's state-names file", definitions(keyA).length === 1 && definitions(keyB).length === 1 && definitions(keyB)[0].file === path.basename(NOVA_FILE), { A: definitions(keyA), B: definitions(keyB) });
    rec("a province moves into each", (await post("/api/map/move-province", { provinceId: 4, toStateId: A })).b.ok === true
      && (await post("/api/map/move-province", { provinceId: 5, toStateId: B })).b.ok === true);
    const stB = await stateOf(B);
    const ren = await post("/api/map/set-state", { stateId: B, nameKey: stB.name, fields: panelFields(stB, (f) => { f.displayName = "Hué"; }) });
    rec("the second is renamed \"Hué\" in the state panel", ren.s === 200 && ren.b.ok === true && definitions(keyB).length === 1 && definitions(keyB)[0].value === "Hué", { res: ren.b, defs: definitions(keyB) });
    rec("PRECONDITION: German and French carry the renamed name too, so \"gone in every language\" below is not vacuous",
      ["german", "french"].every((l) => definitions(keyB, l).length === 1 && definitions(keyB, l)[0].value === "Hué"), ["german", "french"].map((l) => definitions(keyB, l)));
    const novaBefore = read(NOVA_FILE);
    const ownBefore = hash(OWN_FILE);
    const nameABefore = (definitions(keyA)[0] || {}).value;   // the made-up name Nova gave state A (#a-generated-world-names-its-places)
    const mg = await post("/api/map/merge-state", { sourceStateId: B, targetStateId: A });
    rec("the merge succeeded", mg.s === 200 && mg.b.ok === true && mg.b.deleted && mg.b.deleted.changed === true, mg.b);
    rec(`⭐⭐⭐ ${keyB} is no longer defined anywhere in the mod, in any language`, anywhere(keyB).length === 0, anywhere(keyB));
    rec(`⭐⭐ ${keyA}, the state it merged into, keeps its name`, definitions(keyA).length === 1 && /^[A-Z][a-z]{3,10}$/.test(String(nameABefore || "")) && definitions(keyA)[0].value === nameABefore, { now: definitions(keyA), before: nameABefore });
    const eol = novaBefore.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    rec("⭐⭐ only that line left Nova's state-names file", read(NOVA_FILE) === novaBefore.split(eol).filter((l) => !new RegExp(`^\\s*${keyB}:`).test(l)).join(eol), { before: novaBefore, after: read(NOVA_FILE) });
    rec("⚠️ the mod's own names file is untouched", hash(OWN_FILE) === ownBefore);
    rec("the response says so", !!(mg.b.nameLocalisation && mg.b.nameLocalisation.removed === 1), mg.b.nameLocalisation);

    console.log("\n2. ⭐⭐⭐ The next new state gets that id again — and its own name, not the gone state's");
    const c = await post("/api/map/create-state", { name: "", owner: "AAA" });
    rec(`"+ New state" takes id ${B} again`, c.b.ok === true && c.b.id === B && c.b.name === keyB, c.b);
    const newName = (definitions(keyB)[0] || {}).value;
    rec(`⭐⭐⭐ …and is called by a name of its own in game, not "Hué"`, definitions(keyB).length === 1 && /^[A-Z][a-z]{3,10}$/.test(String(newName || "")) && newName !== "Hué", definitions(keyB));
    rec("⭐⭐ …which is what the page is told to show", c.b.displayName === newName, c.b.displayName);

    console.log("\n3. ⚠️ A name in the mod's OWN localisation is the modder's  (merge-state)");
    {
      const novaHash = hash(NOVA_FILE), own = read(OWN_FILE);
      const r = await post("/api/map/merge-state", { sourceStateId: 2, targetStateId: 1 });
      rec("merging state 2 (named in my_state_names_l_english.yml) into state 1 succeeded", r.s === 200 && r.b.ok === true, r.b);
      rec("⚠️⚠️ the modder's file is byte-identical — STATE_2 \"Beta\" stays where they wrote it", read(OWN_FILE) === own, read(OWN_FILE));
      rec("⚠️ …and Nova's file is untouched", hash(NOVA_FILE) === novaHash);
    }

    console.log("\n4. ⚠️ A key another state still uses stays  (merge-state)");
    {
      fs.appendFileSync(NOVA_FILE, ` SHARED_NAME:0 "Shared"${read(NOVA_FILE).indexOf("\r\n") !== -1 ? "\r\n" : "\n"}`);
      const novaHash = hash(NOVA_FILE);
      const r = await post("/api/map/merge-state", { sourceStateId: 4, targetStateId: 3 });
      rec("merging state 4 into state 3, both named SHARED_NAME, succeeded", r.s === 200 && r.b.ok === true, r.b);
      rec("⚠️⚠️ SHARED_NAME is still defined — state 3 still uses it", definitions("SHARED_NAME").length === 1 && hash(NOVA_FILE) === novaHash, definitions("SHARED_NAME"));
    }

    console.log("\n5. delete-state — the page's discard of a new state  (create-state, delete-state)");
    {
      const d = await post("/api/map/create-state", { name: "", owner: "AAA" });
      rec("a new state is created and named", d.b.ok === true && definitions(d.b.name).length === 1, d.b);
      const before = read(NOVA_FILE);
      const del = await post("/api/map/delete-state", { stateId: d.b.id });
      rec("deleting it succeeded", del.s === 200 && del.b.ok === true && del.b.changed === true, del.b);
      rec(`⭐⭐⭐ ${d.b.name} is no longer defined anywhere in the mod, in any language`, anywhere(d.b.name).length === 0, anywhere(d.b.name));
      rec("⭐ …and nothing else in Nova's file changed", read(NOVA_FILE) === before.split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${d.b.name}:`).test(l)).join(before.indexOf("\r\n") !== -1 ? "\r\n" : "\n"), { before, after: read(NOVA_FILE) });
      const again = hash(NOVA_FILE);
      const del2 = await post("/api/map/delete-state", { stateId: d.b.id });
      rec("⚠️ deleting it a second time is refused", del2.s === 400 && del2.b.ok === false, del2.b);
      rec("⚠️ …and changes nothing", hash(NOVA_FILE) === again);
      rec("⚠️ the file still starts with its BOM and header", read(NOVA_FILE).startsWith(BOM + "l_english:"), read(NOVA_FILE).slice(0, 20));
    }

    console.log("\n6. ⭐⭐ A world Nova named before its names moved into replace/ (#a-name-nova-writes-must-win)  (create-state, delete-state)");
    {
      // the name as a world written before this change holds it: in the file beside replace/, not in replace/
      const OLD_FILE = path.join(ENG, "nova_state_names_l_english.yml");
      const d = await post("/api/map/create-state", { name: "", owner: "AAA" });
      const line = read(NOVA_FILE).split(/\r?\n/).find((l) => new RegExp(`^\\s*${d.b.name}:`).test(l));
      rec("a new state is created and named", d.b.ok === true && !!line, d.b);
      fs.writeFileSync(NOVA_FILE, read(NOVA_FILE).split(/\r?\n/).filter((l) => l !== line).join("\n"));
      fs.writeFileSync(OLD_FILE, `${BOM}l_english:\n ${String(line).trim()}\n STATE_99:0 "Kept"\n`);
      rec("…and its name now lives only in the old file", JSON.stringify(definitions(d.b.name).map((x) => x.file)) === JSON.stringify([path.basename(OLD_FILE)]) && !new RegExp(`^\\s*${d.b.name}:`, "m").test(read(NOVA_FILE)), definitions(d.b.name));
      const del = await post("/api/map/delete-state", { stateId: d.b.id });
      rec("deleting it succeeded", del.s === 200 && del.b.ok === true && del.b.changed === true, del.b);
      rec(`⭐⭐ ${d.b.name} is gone from the old file too, and from every language`, anywhere(d.b.name).length === 0, { defs: anywhere(d.b.name), old: read(OLD_FILE) });
      rec("⭐ …which keeps its BOM, its header and its other line", read(OLD_FILE) === `${BOM}l_english:\n STATE_99:0 "Kept"\n`, read(OLD_FILE));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(GAME, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a state that is gone leaves no name behind: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
