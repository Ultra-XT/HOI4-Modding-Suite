// A victory point added in the state panel says so when nothing names it — and Nova invents no name for it.
// #a-new-victory-point-says-it-has-no-name
//
// Found in the owner's torture build (nova_torture_0917, through the real endpoints): a victory point added on province 517 in
// vanilla's 1032 - Yanan.txt got no VICTORY_POINTS_517 localisation, and nothing said so. That key is how the shipping maps name
// a victory point (hoi4.exe carries the VICTORY_POINTS_ prefix). Census of english localisation against every victory_points
// pair in history/states (scratch census-vp-names2.js): vanilla names 1,495 of its 1,500 victory-point provinces with
// VICTORY_POINTS_<id> and one more only with the per-country form (SOV_VICTORY_POINTS_11411 …); Millennium Dawn 4,428 of 4,430;
// Novum Vexillum 3,664 of 3,688; Rise of Nations 1,150 + 2 of 1,203; Road to 56 1,673 of 1,872; Old World Blues 932 of 1,776.
// No unnamed one is named in another language folder instead. Vanilla does not define VICTORY_POINTS_517.
//
// The panel's victory-point row has two inputs, province and value (collectVps below) — there is no name field, so the user
// never gives a name, and the city's name is not in the map files for Nova to find. So Nova must not write one. What it did
// wrong was saying nothing: the save now answers with the victory points it ADDED that no layer names (mod, dependencies, base
// game; either key form, replace/ included), and the key to define, on the line Save already shows warnings on (fileWarning).
//
// Not reported — no cry-wolf: a victory point the save did not add (a changed value, or any other field saved on a state that
// already holds an unnamed one: Road to 56 ships 199 and Old World Blues 844), and one either key form names.
// Requests are the client's: public/map.js stageStateWrite → queueWrite("/api/map/set-state", { stateId, nameKey, fields })
// with the WHOLE panel; flushMapSaves adds modPath and pushes res.fileWarning onto the post-save warning line.
// (Every panel save also writes the state's display name through the rename path — that is not a victory-point name, and
// this test does not judge it.)
//
// ⛔ (review T05) AND THE VICTORY POINT NOVA GIVES A CAPITAL STATE ITSELF. keep-capitals, Auto-fix and ✨ New country stand one on a province of
// the state, and on 84 of the base game's 89 capitals' stand-ins nothing names that province; none of the three said so. Sections 5-7.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vp-name-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const P_ = require("./testlib-map-page.js");
const vm = require("vm");

const BOM = String.fromCharCode(0xfeff);
const MOD = path.join(ROOT, "mod");
const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const read = (rel) => { const p = path.join(MOD, rel); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const hash = (rel) => { const p = path.join(MOD, rel); return fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent"; };
/** Every victory-point name the mod's localisation defines, with its file. Nova must add, change and remove none. */
const vpNames = () => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        if (/VICTORY_POINTS_\d+\s*:/.test(line)) out.push(path.relative(MOD, p) + " " + line.trim());
      }
    }
  };
  walk(path.join(MOD, "localisation"));
  return out.sort().join("\n");
};
const OWN_LOC = ["localisation/english/my_victory_points_l_english.yml", "localisation/english/replace/my_replaced_l_english.yml"];
const ownLoc = () => OWN_LOC.map(hash).join(" ");

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

// Province ids no shipping map uses, so no base-game name can answer for them.
const P = (n) => 90000 + n;
const stateFile = (id, provinces, vps) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n${vps.map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("")}\t}\n\tprovinces = {\n\t\t${provinces.join(" ")}\n\t}\n}\n`;
mk("descriptor.mod", 'name="vp names"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => `${P(n)};${n};0;0;land;false;plains;1`)].join("\n") + "\n");
mk("history/states/1-Alpha.txt", stateFile(1, [P(1), P(2), P(3), P(4), P(9), P(10)], [[P(2), 1]]));
mk("history/states/2-Beta.txt", stateFile(2, [P(5), P(6), P(7), P(8)], [[P(5), 5]]));
mk(OWN_LOC[0], `${BOM}l_english:\n VICTORY_POINTS_${P(5)}:0 "Named Town"\n VICTORY_POINTS_${P(3)}:0 "Already Named"\n AAA_VICTORY_POINTS_${P(7)}:0 "Tag Town"\n`);
mk(OWN_LOC[1], `${BOM}l_english:\n VICTORY_POINTS_${P(8)}:0 "Replaced Town"\n`);
// capitals with no victory point: UNN's and AFX's and the state ✨ New country takes have provinces nothing names; NAM's are all named, the one form each
const capitalState = (id, provinces, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory = {\n${owner ? `\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n` : ""}\t}\n\tprovinces = {\n\t\t${provinces.join(" ")}\n\t}\n}\n`;
mk("history/states/3-Unnamed.txt", capitalState(3, [P(11), P(12)], "UNN"));
mk("history/states/4-Named.txt", capitalState(4, [P(13), P(14)], "NAM"));
mk("history/states/5-AutoFix.txt", capitalState(5, [P(15), P(16)], "AFX"));
mk("history/states/6-NewCountry.txt", capitalState(6, [P(17), P(18)], ""));
mk("history/countries/UNN - Unnamed.txt", "capital = 3\n");
mk("history/countries/NAM - Named.txt", "capital = 4\n");
mk("history/countries/AFX - Autofix.txt", "capital = 5\n");
// …and AFX's supply hub on its state's SECOND province: Auto-fix gives a capital a point only where the point moves it, off the first
// province HOI4 stands a capital with none on (review of the T39 merge, C-F1), so its point goes to the hub, P(16)
mk("map/supply_nodes.txt", `1 ${P(16)}\n`);
mk("localisation/english/capital_towns_l_english.yml", `${BOM}l_english:\n VICTORY_POINTS_${P(13)}:0 "Thirteen"\n NAM_VICTORY_POINTS_${P(14)}:0 "Fourteen"\n`);

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: MOD })) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const stateOf = async (id) => ((await fetch(`http://127.0.0.1:${PORT}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json())).states || []).find((s) => s.id === id);
  /** One state-panel save, as the page stages it. */
  const save = async (id, edit) => {
    const st = await stateOf(id);
    return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, edit) });
  };
  const quiet = (r) => !(r.b.unnamedVictoryPoints && r.b.unnamedVictoryPoints.length) && !/VICTORY_POINTS_/.test(String(r.b.fileWarning || ""));
  const vpBefore = vpNames(), ownBefore = ownLoc();
  const noNameWritten = () => vpNames() === vpBefore && ownLoc() === ownBefore;
  try {
    console.log("0. The client's side of it");
    // ⚠️ MOVED WITH #a-victory-point-has-a-town: these two read collectVps's object literal, and `victoryPoints: collectVps(),` in
    // stageStateWrite, out of the source. A row now carries a 🏘 Town box as well, which collectVps reads with the row and
    // stageStateWrite takes off before the state's own write — so the same two facts are asked of the page's own collectVps and
    // stageStateWrite, RUN against a panel of two rows, one with its box ticked: what set-state is sent is each victory point's
    // province and value, and nothing else.
    const PG = require("./testlib-map-page.js");
    const row = (prov, val, town) => { const els = { ".mi-vp-prov": { value: String(prov) }, ".mi-vp-val": { value: String(val) }, ".mi-vp-town": { checked: town } }; return { querySelector: (s) => els[s] || null }; };
    const rows = [row(P(2), 1, false), row(P(4), 3, true)], queued = [];
    const ids = { miNameInp: "Alpha", miOwnerSel: "AAA", miCoresInp: "AAA", miManpowerInp: "1000", miCategoryInp: "rural", miNavalBase: "0" };
    // (⛔ #a-panel-edit-sends-what-the-modder-changed — the panel stages what changed since showInfo filled it: shown here as the model has
    // state 1, AAA's with nothing else and no victory point, and then typed into, so every field but the owner is the modder's)
    let shown = { miOwnerSel: "AAA" }, shownRows = [];
    const pg = PG.runPage(["function collectVps(", "function readStateForm(", "function stageStateWrite("], {
      $: (id) => (id === "miVpList" ? { querySelectorAll: () => shownRows || rows } : { value: (shown || ids)[id] || "" }), document: { querySelectorAll: () => [], createElement: () => ({}) },
      pendingWrites: [], pushUndo() {}, rebaselineStateForm() {}, stateFormBaseline: null, stateById: new Map([[1, { id: 1, name: "STATE_1", owner: "AAA", provinces: [] }]]),
      provinceToOwner: {}, countrySelect: { options: [{ value: "AAA" }], appendChild() {} }, queueWrite: (url, body) => queued.push({ url, body }),
    });
    pg.sb.stateFormBaseline = { stateId: 1, provinceId: undefined, shown: pg.sb.readStateForm() };
    shown = null; shownRows = null;
    pg.sb.stageStateWrite(1, undefined);
    const sent = queued.find((w) => w.url === "/api/map/set-state");
    const vpsSent = sent && sent.body && sent.body.fields ? sent.body.fields.victoryPoints : null;
    rec("⭐ the panel's victory-point row sends { province, value } — there is no name for Nova to write (the page's own collectVps and stageStateWrite, run; one row's 🏘 box ticked)",
      Array.isArray(vpsSent) && vpsSent.every((v) => JSON.stringify(Object.keys(v)) === JSON.stringify(["province", "value"])) && JSON.stringify(vpsSent) === JSON.stringify([{ province: P(2), value: 1 }, { province: P(4), value: 3 }]), vpsSent);
    rec("…stageStateWrite sends that list with the rest of what was typed (the name and the category; #a-panel-edit-sends-what-the-modder-changed)", !!sent && sent.body.stateId === 1 && sent.body.nameKey === "STATE_1" && !!sent.body.fields && sent.body.fields.displayName === "Alpha" && sent.body.fields.category === "rural"
      && /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MAPJS), sent && sent.body);
    rec("…and a Save shows a write's fileWarning on its warning line", /if \(res\.fileWarning && writeWarnings\.indexOf\(res\.fileWarning\) === -1\) writeWarnings\.push\(res\.fileWarning\);/.test(MAPJS));

    console.log("\n1. ⭐⭐⭐ A new victory point nothing names  (set-state)");
    {
      const r = await save(1, (f) => { f.victoryPoints.push({ province: P(4), value: 3 }); });
      rec("the save succeeded and wrote the victory point", r.s === 200 && r.b.ok === true && r.b.changed === true && read("history/states/1-Alpha.txt").includes(`victory_points = { ${P(4)} 3 }`), { res: r.b, file: read("history/states/1-Alpha.txt") });
      rec(`⭐⭐⭐ the response names it: unnamedVictoryPoints = [${P(4)}]`, JSON.stringify(r.b.unnamedVictoryPoints) === JSON.stringify([P(4)]), r.b.unnamedVictoryPoints);
      const w = String(r.b.fileWarning || "");
      rec(`⭐⭐⭐ …and the warning Save shows gives the key to define, VICTORY_POINTS_${P(4)}`, w.includes(`VICTORY_POINTS_${P(4)}`) && /no name/i.test(w), w);
      rec("⚠️ …and promises no crash", !/crash/i.test(w), w);
      rec("⭐⭐ Nova wrote no victory-point name, and the mod's own localisation files are byte-identical", noNameWritten(), { before: vpBefore, after: vpNames() });
    }

    console.log("\n2. A new victory point something already names  (set-state)");
    {
      const r = await save(1, (f) => { f.victoryPoints.push({ province: P(3), value: 2 }); });
      rec(`VICTORY_POINTS_${P(3)} in the mod's own file: saved, and nothing to say`, r.s === 200 && r.b.ok === true && r.b.changed === true && quiet(r), r.b);
      const t = await save(2, (f) => { f.victoryPoints.push({ province: P(7), value: 2 }); });
      rec(`⚠️ named only as AAA_VICTORY_POINTS_${P(7)} (vanilla's per-country form): nothing to say`, t.s === 200 && t.b.ok === true && t.b.changed === true && quiet(t), t.b);
      const q = await save(2, (f) => { f.victoryPoints.push({ province: P(8), value: 1 }); });
      rec(`⚠️ named in localisation/english/replace/: nothing to say`, q.s === 200 && q.b.ok === true && q.b.changed === true && quiet(q), q.b);
    }

    console.log("\n3. ⚠️ No cry-wolf: a save that adds no victory point says nothing  (set-state)");
    {
      const m = await save(1, (f) => { f.manpower = "2500"; });
      rec(`a manpower edit on a state holding unnamed ${P(2)} and ${P(4)}: saved, nothing to say`, m.s === 200 && m.b.ok === true && m.b.changed === true && quiet(m), m.b);
      const v = await save(1, (f) => { f.victoryPoints = f.victoryPoints.map((x) => (x.province === P(2) ? { province: x.province, value: 4 } : x)); });
      rec(`changing unnamed ${P(2)}'s value: saved, nothing to say`, v.s === 200 && v.b.ok === true && v.b.changed === true && read("history/states/1-Alpha.txt").includes(`victory_points = { ${P(2)} 4 }`) && quiet(v), v.b);
      const d = await save(1, (f) => { f.victoryPoints = f.victoryPoints.filter((x) => x.province !== P(4)); });
      rec(`removing ${P(4)}: saved, nothing to say`, d.s === 200 && d.b.ok === true && d.b.changed === true && quiet(d), d.b);
      const n = await save(1);
      rec("a save that changes nothing: nothing to say", n.s === 200 && n.b.ok === true && quiet(n), n.b);
    }

    console.log("\n4. Three at once, none of them named  (set-state)");
    {
      const r = await save(1, (f) => { f.victoryPoints.push({ province: P(9), value: 1 }, { province: P(10), value: 2 }, { province: P(4), value: 3 }); });
      rec("saved", r.s === 200 && r.b.ok === true && r.b.changed === true, r.b);
      rec(`⭐⭐ unnamedVictoryPoints = [${P(9)}, ${P(10)}, ${P(4)}] — every one the save added that nothing names, in the panel's order`, JSON.stringify(r.b.unnamedVictoryPoints) === JSON.stringify([P(9), P(10), P(4)]), r.b.unnamedVictoryPoints);
      const w = String(r.b.fileWarning || "");
      rec("⭐ one warning names all three keys", [P(9), P(10), P(4)].every((p) => w.includes(`VICTORY_POINTS_${p}`)), w);
      rec("⭐⭐ still no victory-point name written", noNameWritten(), { before: vpBefore, after: vpNames() });
    }

    const givenOf = (cvp) => ((cvp || {}).given || []).map((g) => g.province);
    const pageNotes = (ct) => {
      const body = P_.lift("function capitalTownNotes(");
      const sb = {};
      vm.createContext(sb);
      vm.runInContext(P_.withNoteHelpers(body) + "\nglobalThis.__notes = capitalTownNotes;", sb);
      return Array.from(sb.__notes(ct, (s) => `state ${s}`));
    };

    console.log("\n5. ⭐⭐⭐ The victory point keep-capitals gives a capital state  (what a Save asks after its last write)");
    {
      const r = await post("/api/map/keep-capitals", { tags: ["UNN"] });
      const vp = (r.b.capitalTown || {}).victoryPoints || {};
      const p = givenOf(vp)[0];
      rec("(guard: UNN's capital state was given one, on a province of its own)", r.s === 200 && r.b.ok === true && [P(11), P(12)].includes(p) && read("history/states/3-Unnamed.txt").includes(`{ ${p} `), r.b);
      const w = String(vp.unnamedNote || "");
      rec(`⭐⭐⭐ the answer gives the key to define, VICTORY_POINTS_${p}`, w.includes(`VICTORY_POINTS_${p}`) && /no name/i.test(w) && w.includes(`province ${p}`), r.b.capitalTown);
      rec("⚠️ …and promises no crash", !/crash/i.test(w), w);
      rec("⭐⭐ Nova wrote no victory-point name for it", !vpNames().includes(`VICTORY_POINTS_${p}:`), vpNames());
      const notes = pageNotes(r.b.capitalTown);
      rec("⭐⭐⭐ …and the Save's line says it, in the page's own notes", notes.includes(w) && notes.length === 2 && w.length > 0, notes);
      const n = await post("/api/map/keep-capitals", { tags: ["NAM"] });
      const nv = (n.b.capitalTown || {}).victoryPoints || {};
      rec("⚠️ no cry-wolf: a stand-in on a province something names, by either key form, says nothing", n.s === 200 && givenOf(nv).length === 1 && [P(13), P(14)].includes(givenOf(nv)[0]) && !nv.unnamedNote && pageNotes(n.b.capitalTown).length === 1, n.b);
      const again = await post("/api/map/keep-capitals", { tags: ["UNN", "NAM"] });
      rec("⚠️ …and asked again, with nothing to give, nothing to say", again.s === 200 && !again.b.capitalTown, again.b);
    }

    console.log("\n6. ⭐⭐ …the one 🔧 Auto-fix gives");
    {
      const r = await post("/api/map/auto-fix", {});
      const cvp = (r.b.fixes || {}).capitalVictoryPoints || {};
      const p = givenOf(cvp).find((x) => [P(15), P(16)].includes(x));
      rec("(guard: Auto-fix gave AFX's capital state one)", r.s === 200 && r.b.ok === true && !!p, r.b.fixes && r.b.fixes.capitalVictoryPoints);
      rec(`⭐⭐ its answer gives the key to define, VICTORY_POINTS_${p}`, String(cvp.unnamedNote || "").includes(`VICTORY_POINTS_${p}`), cvp);
      rec("⭐ …and the page's Auto-fix line says it", /if \(cvp\.unnamedNote\) parts\.push\(/.test(MAPJS));
    }

    console.log("\n7. ⭐⭐ …and the one ✨ New country gives");
    {
      const r = await post("/api/map/create-country", { tag: "NEW", name: "New Land", rgb: [10, 20, 30], stateIds: [6], capitalStateId: 6 });
      const vp = (r.b.capitalTown || {}).victoryPoints || {};
      const p = givenOf(vp)[0];
      rec("(guard: the new country's capital state was given one)", r.s === 200 && r.b.ok === true && [P(17), P(18)].includes(p), r.b);
      rec(`⭐⭐ its answer gives the key to define, VICTORY_POINTS_${p}`, String(vp.unnamedNote || "").includes(`VICTORY_POINTS_${p}`), vp);
      rec("⭐ …which the page's own notes say (New country prints capitalTownNotes)", pageNotes(r.b.capitalTown).includes(vp.unnamedNote), pageNotes(r.b.capitalTown));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a new victory point says it has no name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
