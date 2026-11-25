// A state Auto-fix deletes for being empty takes its name with it: Nova's own state-names file keeps no key for it.
// #a-state-auto-fix-deletes-leaves-no-name-behind
//
// THE DEFECT. #a-state-that-is-gone-leaves-no-name-behind (batch 6, D5) taught POST /api/map/merge-state and delete-state to take a
// removed state's STATE_<id> key out of localisation/english/nova_state_names_l_english.yml, because the next "+ New state" takes the
// freed id and create-state KEEPS a name the file already has for that key — a state renamed "Hué" and deleted handed "Hué" to the
// next new state. Auto-fix deletes states too: fixEmptyStates removes every empty state through the same deleteState, and
// closeStateIdGaps then slides the highest id down. POST /api/map/auto-fix forgot nothing, so the sibling stayed open (b6-history.txt,
// D5 risks: "Auto-fix leaves orphan names").
//
// MEASURED on the base commit 4592c54 through the page's own requests (probe-base.js): create-state twice (4 and 5), move-province 5
// into state 5, then POST /api/map/auto-fix { modPath }. Auto-fix deleted state 4 and renumbered 5 to 4, and the names file still read
// `STATE_4:0 "State 4"` — a key no state uses any more.
//
// THE FIX. fixEmptyStates keeps what deleteState says about each state it removed (nameKey, and whether a state still loading uses it),
// autoFixMap carries both passes' answers, and the auto-fix endpoint hands each to forgetRemovedStateName — the helper merge-state
// and delete-state already use. Only Nova's own file; never a key another loaded state uses; never the mod's own localisation.
// Requests are the client's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }), queueWrite(
// "/api/map/move-province", { provinceId, toStateId }), stageStateWrite -> queueWrite("/api/map/set-state", { stateId, nameKey, fields })
// with the whole panel, and the Map Errors popup's fetch("/api/map/auto-fix", { body: JSON.stringify({ modPath: modPath() }) }).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("gonebyfix");
const { createApp } = require("./server.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const BOM = String.fromCharCode(0xfeff);
const NOVA_FILE = (mod) => path.join(mod, "localisation", "english", "replace", "nova_state_names_l_english.yml");
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
/** Every definition of `key` in the mod's localisation: [{ file, value }]. */
function definitions(mod, key) {
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
}

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

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);
    const stateOf = async (mod, id) => ((await fetch(`${S.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json())).states || []).find((s) => s.id === id);

    console.log("0. The client's requests, as this test sends them");
    rec("the page creates a state with { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…and Auto-fix posts { modPath } and nothing else", /fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/.test(MAPJS));

    console.log("\n1. A new state renamed \"Hué\", emptied, and deleted by Auto-fix  (create-state, move-province, set-state, move-province, auto-fix)");
    {
      const mod = W.mod("Names", {});
      const a = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("the state is created and named in Nova's state-names file", a.status === 200 && a.body.ok === true && definitions(mod, a.body.name).length === 1, a.body);
      const A = a.body.id, keyA = a.body.name;
      rec("a province moves into it", (await S.post("/api/map/move-province", { provinceId: 5, toStateId: A }, mod)).body.ok === true);
      const stA = await stateOf(mod, A);
      const ren = await S.post("/api/map/set-state", { stateId: A, nameKey: stA.name, fields: panelFields(stA, (f) => { f.displayName = "Hué"; }) }, mod);
      rec("it is renamed \"Hué\" in the state panel", ren.status === 200 && ren.body.ok === true && definitions(mod, keyA).some((d) => d.value === "Hué"), { res: ren.body, defs: definitions(mod, keyA) });
      rec("the province moves back out, leaving it empty", (await S.post("/api/map/move-province", { provinceId: 5, toStateId: 2 }, mod)).body.ok === true && ((await stateOf(mod, A)).provinces || []).length === 0);
      const novaBefore = read(NOVA_FILE(mod));
      const fx = await S.autoFix(mod);
      rec("Auto-fix deleted the empty state", fx.status === 200 && fx.body.ok === true && (((fx.body.fixes || {}).emptyStates || {}).deleted || []).includes(A), (fx.body.fixes || {}).emptyStates);
      rec(`⭐⭐⭐ ${keyA} is no longer defined anywhere in the mod`, definitions(mod, keyA).length === 0, definitions(mod, keyA));
      const eol = novaBefore.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
      rec("⭐⭐ only that line left Nova's state-names file, BOM and header kept", read(NOVA_FILE(mod)) === novaBefore.split(eol).filter((l) => !new RegExp(`^\\s*${keyA}:`).test(l)).join(eol) && read(NOVA_FILE(mod)).startsWith(BOM + "l_english:"),
        { before: novaBefore, after: read(NOVA_FILE(mod)) });
      rec("⭐ the response says so", !!(fx.body.nameLocalisation && fx.body.nameLocalisation.removed === 1), fx.body.nameLocalisation);
      const c = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      // #a-generated-world-names-its-places — a state nobody named gets a made-up name now, not "State <id>"
      rec(`⭐⭐⭐ the next "+ New state" takes id ${A} again — and is called by a name of its own, not "Hué"`, c.body.ok === true && c.body.id === A && /^[A-Z][a-z]{3,10}$/.test(String(c.body.displayName || "")) && c.body.displayName !== "Hué", c.body);
    }

    console.log("\n2. Two new states, the first renamed \"Gone\" and empty: Auto-fix deletes it and slides the second into its id  (create-state ×2, move-province, set-state, auto-fix)");
    {
      // ⚠️ MOVED WITH #a-renumbered-state-keeps-a-name-of-its-own. This section used to pin that the renumbered state "still loads
      // under" its OLD key — the very shape that let the next "+ New state" share it. The renumbered state now takes its new id's
      // key, so the deleted state's key is defined again, by the state that owns it now. What this section guards is unchanged:
      // the deleted state's NAME is gone. So the deleted state gets a name of its own, "Gone", that the renumbered one does not share.
      const mod = W.mod("Renumbered", {});
      const a = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const b = await S.post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("both states are created", a.body.ok === true && b.body.ok === true && b.body.id === a.body.id + 1, { a: a.body.id, b: b.body.id });
      rec("a province moves into the second", (await S.post("/api/map/move-province", { provinceId: 5, toStateId: b.body.id }, mod)).body.ok === true);
      const stA = await stateOf(mod, a.body.id);
      const ren = await S.post("/api/map/set-state", { stateId: a.body.id, nameKey: stA.name, fields: panelFields(stA, (f) => { f.displayName = "Gone"; }) }, mod);
      rec("the first is renamed \"Gone\"", ren.status === 200 && ren.body.ok === true && definitions(mod, a.body.name).some((d) => d.value === "Gone"), { res: ren.body, defs: definitions(mod, a.body.name) });
      const givenB = ((await stateOf(mod, b.body.id)) || {}).displayName;   // the made-up name Nova gave the second
      const fx = await S.autoFix(mod);
      const es = (fx.body.fixes || {}).emptyStates || {}, sg = (fx.body.fixes || {}).stateGaps || {};
      rec("Auto-fix deleted the first and renumbered the second into its id", (es.deleted || []).includes(a.body.id) && (sg.renumbered || []).some((x) => x.from === b.body.id && x.to === a.body.id), { es, sg });
      const values = [a.body.name, b.body.name].flatMap((k) => definitions(mod, k).map((d) => d.value));
      rec("⭐⭐⭐ \"Gone\", the deleted state's name, is defined nowhere in the mod", !values.includes("Gone"), { [a.body.name]: definitions(mod, a.body.name), [b.body.name]: definitions(mod, b.body.name) });
      const s = (await stateOf(mod, a.body.id)) || {};
      rec(`⭐⭐ the renumbered state loads under ${a.body.name}, its new id's key, still called "${givenB}" — and ${b.body.name} is defined nowhere`,
        s.name === a.body.name && /^[A-Z][a-z]{3,10}$/.test(String(givenB || "")) && JSON.stringify(definitions(mod, a.body.name).map((d) => d.value)) === JSON.stringify([givenB]) && definitions(mod, b.body.name).length === 0,
        { defs: { [a.body.name]: definitions(mod, a.body.name), [b.body.name]: definitions(mod, b.body.name) }, state: s });
    }

    console.log("\n3. ⚠️ A key another state still uses stays, and the mod's own localisation is the modder's");
    {
      const own = `${BOM}l_english:\n STATE_4:0 "My own name"\n`;
      const mod = W.mod("Kept", {
        "history/states/4-Empty.txt": 'state = {\n\tid = 4\n\tname = "STATE_4"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n}\n',
        "history/states/5-Shares.txt": 'state = {\n\tid = 5\n\tname = "SHARED_NAME"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 5 }\n}\n',
        "history/states/6-Empty.txt": 'state = {\n\tid = 6\n\tname = "SHARED_NAME"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n}\n',
        "history/states/2-B.txt": lib.st(2, "2"),
        "localisation/english/replace/nova_state_names_l_english.yml": `${BOM}l_english:\n SHARED_NAME:0 "Shared"\n`,
        "localisation/english/my_names_l_english.yml": own,
      });
      const novaBefore = read(NOVA_FILE(mod));
      const fx = await S.autoFix(mod);
      rec("Auto-fix deleted both empty states", fx.status === 200 && [4, 6].every((id) => (((fx.body.fixes || {}).emptyStates || {}).deleted || []).includes(id)), (fx.body.fixes || {}).emptyStates);
      rec("⚠️⚠️ SHARED_NAME stays in Nova's file — state 5 still uses it", read(NOVA_FILE(mod)) === novaBefore, read(NOVA_FILE(mod)));
      rec("⚠️⚠️ the modder's own file is byte-identical — STATE_4 stays where they wrote it", read(path.join(mod, "localisation", "english", "my_names_l_english.yml")) === own);
    }

    console.log("\n4. A capital's empty state, deleted by the SECOND sweep once Auto-fix has moved the capital off it");
    {
      // fixEmptyStates skips a capital's empty state; fixForeignCapitals then moves AAA's capital to a state AAA holds land in, and
      // autoFixMap's final empty-state sweep deletes the state it left behind (test-map-autofix-empty-capital.js). That second pass
      // must hand its answer on too.
      const mod = W.mod("CapitalMoved", {
        "history/countries/AAA.txt": "capital = 4\n",
        "history/states/4-Cap.txt": 'state = {\n\tid = 4\n\tname = "STATE_4"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n',
        "localisation/english/replace/nova_state_names_l_english.yml": `${BOM}l_english:\n STATE_4:0 "Hué"\n`,
      });
      const fx = await S.autoFix(mod);
      const es = (fx.body.fixes || {}).emptyStates || {}, cap = (fx.body.fixes || {}).capitals || {};
      rec("setup: Auto-fix moved AAA's capital off the empty state, then deleted the state", fx.status === 200 && fx.body.ok === true && cap.fixed >= 1 && (es.deleted || []).includes(4), { es, cap });
      rec("⭐⭐⭐ STATE_4 is no longer defined anywhere in the mod", definitions(mod, "STATE_4").length === 0, definitions(mod, "STATE_4"));
      rec("⭐ the response says so", !!(fx.body.nameLocalisation && fx.body.nameLocalisation.removed === 1), fx.body.nameLocalisation);
    }

    console.log("\n5. A click that deletes no state writes no names file");
    {
      const mod = W.mod("Nothing", { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }), "localisation/english/replace/nova_state_names_l_english.yml": `${BOM}l_english:\n STATE_2:0 "Beta"\n` });
      const before = read(NOVA_FILE(mod));
      const fx = await S.autoFix(mod);
      rec("the click ran", fx.status === 200 && fx.body.ok === true && !(((fx.body.fixes || {}).emptyStates || {}).deleted || []).length, fx.body.fixes && fx.body.fixes.emptyStates);
      rec("⭐ Nova's names file is untouched and the response carries no nameLocalisation", read(NOVA_FILE(mod)) === before && fx.body.nameLocalisation === undefined, fx.body.nameLocalisation);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== a state auto-fix deletes leaves no name behind: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
})();
