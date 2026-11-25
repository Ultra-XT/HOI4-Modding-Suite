// Typing a core into the state panel changes only that core: a core written in a date or behind a condition stays where it is.
// #a-core-edit-keeps-the-dated-and-conditional-cores
//
// THE DEFECT (discovery F14, verified on 790cb21 and again on c093c16). The state panel's Cores box is filled from the model's
// flat list of every add_core_of in history — a date's and an IF's included — and stageStateWrite sends that whole list back.
// setCoresInHistory then stripped EVERY add_core_of in history and re-appended the list, undated, at the end. So typing one
// core into vanilla's 1038 - Jinan.txt, whose SND core is
//     1936.1.1 = { IF = { limit = { has_dlc = "No Compromise, No Surrender" } transfer_state_to = SND add_core_of = SND } }
// removed `add_core_of = SND` from inside the IF and wrote `add_core_of = SND` (and the new JAP) undated after the dated
// entries: SND became an unconditional core with or without the DLC. Measured on c093c16 with setStateFieldsInBlock on the
// installed file: lines removed ["\t\t\t\tadd_core_of = SND"], lines added ["\t\tadd_core_of = SND", "\t\tadd_core_of = JAP"].
// Validate still said 0/0 and the page showed only JAP added. Reach, states with a core tag written ONLY inside a nested or
// dated block (census of the installed corpus, 2026-09-16): vanilla 46, Road to 56 12, Novum Vexillum 2, Rise of Nations 183
// (Millennium Dawn and Old World Blues 0). Any core added to or removed from one of them did it.
//
// Now the list is spliced against the lines the history already writes: a tag the list keeps is not touched wherever it is
// written; a new tag is one undated line after the state's last undated core; a tag the list drops loses only its undated
// lines. A dropped tag that the history still writes inside a date or a condition is left there — Nova does not edit those
// blocks — and the response and the Save line say so.
//
// Requests are the client's: public/map.js stageStateWrite is lifted and run against a panel filled the way showInfo fills it
// (the Cores box is st.cores.join(", ")), and flushMapSaves posts Object.assign({}, body, { modPath }).
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const world = lib.makeWorld("b11-cores");
// The game's state 3 carries the shapes that bit: an undated core with a trailing comment, a DLC-conditional core inside a date,
// and a core written only in a later date.
const JINAN = [
  "state = {", "\tid = 3", '\tname = "STATE_3"', "\tmanpower = 1000", "\tstate_category = rural", "\tprovinces = { 3 }", "",
  "\thistory = {", "\t\towner = AAA", "\t\tadd_core_of = AAA", "\t\tadd_core_of = CCC # claimed since the war", "",
  "\t\t1936.1.1 = {", "\t\t\tIF = {", "\t\t\t\tlimit = {", '\t\t\t\t\thas_dlc = "No Compromise, No Surrender"', "\t\t\t\t}",
  "\t\t\t\ttransfer_state_to = BBB", "\t\t\t\tadd_core_of = BBB", "\t\t\t}", "\t\t}", "",
  "\t\tvictory_points = {", "\t\t\t3 5", "\t\t}", "",
  "\t\t1939.1.1 = {", "\t\t\tadd_core_of = DDD", "\t\t}", "\t}", "}", "",
].join("\n");
fs.writeFileSync(path.join(world.GAME, "history", "states", "3-C.txt"), JINAN);

const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");
const M = require("./map-data.js");

const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const MASKED = maskJsComments(MAP);
const lift = (signature) => {
  const at = MASKED.indexOf(signature);
  if (at < 0) return "";
  let d = 0;
  for (let i = MASKED.indexOf("{", at); i < MASKED.length; i++) {
    if (MASKED[i] === "{") d++;
    else if (MASKED[i] === "}") { d--; if (d === 0) return MAP.slice(at, i + 1); }
  }
  return "";
};
const STAGE = lift("function stageStateWrite(");
const READ = lift("function readStateForm(");   // (⛔ #a-panel-edit-sends-what-the-modder-changed — the panel as a write reads it)
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }");
const MARK = grab("function markSaveBoundary", "\n  }");
const NOTE = grab("function blankAdjacencyNote", "\n  }");
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];
const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];

/** The panel as showInfo fills it for `st`, `edit` typed into it, then public/map.js's own stageStateWrite. Returns the queued write. */
function pageBody(st, pid, edit) {
  const inputs = {
    miNameInp: { value: String(st.displayName || st.name || "") },
    miOwnerSel: { value: String(st.owner || "") },
    miCoresInp: { value: (st.cores || []).join(", ") },
    miManpowerInp: { value: String(st.manpower || 0) },
    miCategoryInp: { value: String(st.category || "") },
    miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
  };
  const bld = BLD.map((b) => ({ dataset: { bld: b }, value: String((st.buildings || {})[b] || 0) }));
  const res = RES.map((r) => ({ dataset: { res: r }, value: String((st.resources || {})[r] || 0) }));
  const queued = [];
  const sb = {
    // (pendingWrites: stageStateWrite replaces the state's queued 🏘 towns in the page's queue: #a-queued-town-is-the-panels-own)
    console, pushUndo: () => {}, rebaselineStateForm: () => {}, provinceToOwner: {}, pendingWrites: [], stateFormBaseline: null,
    stateById: new Map([[st.id, JSON.parse(JSON.stringify(st))]]),
    $: (id) => inputs[id] || { value: "" },
    // collectVps reads the rows renderVpRows drew from st.victoryPoints.
    collectVps: () => (st.victoryPoints || []).map((v) => ({ province: parseInt(v.province, 10), value: parseInt(v.value, 10) })).filter((v) => Number.isFinite(v.province) && Number.isFinite(v.value) && v.value > 0),
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
    queueWrite: (url, body, meta) => queued.push({ url, body, meta: meta || {} }),
    countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${READ}\n${STAGE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);   // what showInfo leaves
  if (edit) edit(inputs);
  sb.__stage(st.id, pid);
  return queued[0];
}

/** flushMapSaves itself, over the real server. Returns the status line and every write's answer. */
async function saveThroughThePage(srv, mod, writes, states) {
  let status = "";
  const answers = [];
  const sandbox = {
    console, JSON, encodeURIComponent,
    pendingWrites: writes.slice(),
    paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map((states || []).map((s) => [s.id, s])), model: { states: states || [] },
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels },
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${FLUSH}\nglobalThis.__run = flushMapSaves;`, sandbox);
  await sandbox.__run();
  return { status, answers };
}

/** The body of the first `key = { … }` block in text, brace-counted. */
function blockBody(text, key) {
  const m = new RegExp(`(?:^|[^A-Za-z0-9_.])${key.replace(/\./g, "\\.")}\\s*=\\s*\\{`).exec(text);
  if (!m) return null;
  const open = text.indexOf("{", m.index);
  let d = 0;
  for (let i = open; i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) return text.slice(open + 1, i); } }
  return null;
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code, as this test runs it");
    rec("stageStateWrite, flushMapSaves, mapCrashGate, markSaveBoundary and blankAdjacencyNote lifted out of public/map.js",
      STAGE.length > 500 && FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80 && NOTE.length > 200, [STAGE.length, FLUSH.length, GATE.length, MARK.length, NOTE.length]);
    rec("showInfo fills the Cores box with the model's whole list", /\$\("miCoresInp"\)\.value = \(st\.cores \|\| \[\]\)\.join\(", "\);/.test(MASKED));
    rec("…and stageStateWrite sends back whatever the box holds, split, trimmed and upper-cased",
      /cores: \$\("miCoresInp"\)\.value\.split\(","\)\.map\(\(s\) => s\.trim\(\)\.toUpperCase\(\)\)\.filter\(Boolean\)/.test(READ));
    rec("the panel's building and resource inputs are read out of public/map.html", BLD.length >= 5 && RES.length >= 3, { BLD, RES });

    srv = await lib.startServer(createApp);
    const stateOf = async (mod, id) => ((await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json())).states || []).find((s) => s.id === id);
    const gameFile = path.join(world.GAME, "history", "states", "3-C.txt");
    const modFile = (mod) => path.join(mod, "history", "states", "3-C.txt");
    const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

    console.log("\n1. ⛔ Type \", EEE\" into the Cores box of a base-game state whose history has a core in a date and one behind a DLC");
    {
      const mod = world.mod("Cores Add", {});
      const st = await stateOf(mod, 3);
      rec("the model reads all four cores, the date's and the IF's included", !!st && JSON.stringify(st.cores) === JSON.stringify(["AAA", "CCC", "BBB", "DDD"]), st && st.cores);
      const w = pageBody(st, 3, (i) => { i.miCoresInp.value += ", EEE"; });
      rec("the page queues set-state with the WHOLE list, the nested cores among them", !!w && w.url === "/api/map/set-state" && JSON.stringify(w.body.fields.cores) === JSON.stringify(["AAA", "CCC", "BBB", "DDD", "EEE"]), w && w.body);
      const r = await srv.post(w.url, w.body, mod);
      rec("the save succeeded", r.status === 200 && r.body.ok === true && r.body.changed === true, r.body);
      const after = read(modFile(mod)) || "";
      rec("⭐⭐⭐ BBB's core is still inside the DLC IF", /add_core_of = BBB/.test(blockBody(after, "IF") || ""), blockBody(after, "IF"));
      rec("⭐⭐⭐ DDD's core is still inside 1939.1.1", /add_core_of = DDD/.test(blockBody(after, "1939.1.1") || ""), blockBody(after, "1939.1.1"));
      rec("⭐⭐⭐ …and neither is written undated anywhere", !/\n\t\tadd_core_of = (BBB|DDD)\b/.test(after), after);
      rec("⭐⭐ the new core is one undated line right after the last undated one", /\n\t\tadd_core_of = CCC # claimed since the war\n\t\tadd_core_of = EEE\n/.test(after), after);
      rec("⭐⭐ nothing else changed: take the new line out and it is the game's file byte for byte", after.replace(/^[ \t]*add_core_of = EEE\r?\n/m, "") === read(gameFile), after);
      const back = await stateOf(mod, 3);
      rec("the model reads five cores", !!back && JSON.stringify([...back.cores].sort()) === JSON.stringify(["AAA", "BBB", "CCC", "DDD", "EEE"]), back && back.cores);
    }

    console.log("\n2. THE CONTROL: Save state with nothing typed writes no state file");
    {
      const mod = world.mod("Cores Unchanged", {});
      const st = await stateOf(mod, 3);
      // ⛔ #a-panel-edit-sends-what-the-modder-changed — the panel sends nothing it did not change, so nothing goes; the list as it stands, sent by anyone, still writes nothing
      rec("⚠️ the page staged nothing", pageBody(st, 3) === undefined, pageBody(st, 3));
      const r = await srv.post("/api/map/set-state", { stateId: 3, fields: { cores: st.cores } }, mod);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⚠️ …and the mod has no copy of the state's file", read(modFile(mod)) === null, read(modFile(mod)));
    }

    console.log("\n3. Remove CCC, an undated core, in the Cores box");
    {
      const mod = world.mod("Cores Remove Undated", {});
      const st = await stateOf(mod, 3);
      const w = pageBody(st, 3, (i) => { i.miCoresInp.value = st.cores.filter((c) => c !== "CCC").join(", "); });
      const r = await srv.post(w.url, w.body, mod);
      rec("the save succeeded", r.status === 200 && r.body.ok === true && r.body.changed === true, r.body);
      const after = read(modFile(mod)) || "";
      rec("⭐⭐⭐ only its line went, trailing comment and all", after === read(gameFile).replace("\t\tadd_core_of = CCC # claimed since the war\n", ""), after);
      rec("…and the response names no core left behind", !(r.body.coresKept || []).length, r.body.coresKept);
    }

    console.log("\n4. ⛔ Remove BBB, whose only core is inside 1936.1.1 = { IF = { … } }");
    let w4 = null, st4 = null, mod4 = null;
    {
      mod4 = world.mod("Cores Remove Conditional", {});
      st4 = await stateOf(mod4, 3);
      w4 = pageBody(st4, 3, (i) => { i.miCoresInp.value = st4.cores.filter((c) => c !== "BBB").join(", "); });
      const r = await srv.post(w4.url, w4.body, mod4);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ the conditional core is not stripped: the mod has no changed copy of the state's file", read(modFile(mod4)) === null || read(modFile(mod4)) === read(gameFile), read(modFile(mod4)));
      const kept = (r.body.coresKept || []).find((k) => k.tag === "BBB");
      rec("⭐⭐ the response says BBB is still written inside 1936.1.1 = { IF = { … } }", !!kept && JSON.stringify(kept.inside) === JSON.stringify(["1936.1.1", "IF"]), r.body.coresKept);
      rec("⭐⭐ …in words the Save line can show: the tag, the block, and that Nova left it", /BBB/.test(r.body.fileWarning || "") && /1936\.1\.1 = \{ IF = \{/.test(r.body.fileWarning || "") && /add_core_of/.test(r.body.fileWarning || ""), r.body.fileWarning);
    }

    console.log("\n5. …and the Save line says so, through the page's own flushMapSaves");
    {
      const mod = world.mod("Cores Save Line", {});
      const s = await saveThroughThePage(srv, mod, [{ url: w4.url, body: w4.body, meta: w4.meta }], [st4]);
      const a = s.answers.find((x) => x.url === "/api/map/set-state");
      rec("the Save posted the write and it answered ok", !!a && a.res.ok === true, s.answers);
      rec("⭐⭐⭐ the Save line names BBB and the block it is still written in", /BBB/.test(s.status) && /1936\.1\.1 = \{ IF = \{/.test(s.status), s.status);
    }

    console.log("\n6. Remove DDD, whose only core is in the dated 1939.1.1 block");
    {
      const mod = world.mod("Cores Remove Dated", {});
      const st = await stateOf(mod, 3);
      const w = pageBody(st, 3, (i) => { i.miCoresInp.value = st.cores.filter((c) => c !== "DDD").join(", "); });
      const r = await srv.post(w.url, w.body, mod);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ the dated core is not stripped", read(modFile(mod)) === null || read(modFile(mod)) === read(gameFile), read(modFile(mod)));
      const kept = (r.body.coresKept || []).find((k) => k.tag === "DDD");
      rec("⭐⭐ the response says DDD is still written inside 1939.1.1", !!kept && JSON.stringify(kept.inside) === JSON.stringify(["1939.1.1"]), r.body.coresKept);
    }

    console.log("\n7. The mod's own CRLF state file, with no undated core at all: add FFF");
    {
      const crlf = ["state = {", "\tid = 2", '\tname = "STATE_2"', "\tmanpower = 1000", "\tstate_category = rural", "\tprovinces = { 2 5 }",
        "\thistory = {", "\t\towner = AAA", "\t\t1936.1.1 = {", "\t\t\tadd_core_of = AAA", "\t\t}", "\t}", "}", ""].join("\r\n");
      const mod = world.mod("Cores CRLF", { "history/states/2-B.txt": crlf });
      const st = await stateOf(mod, 2);
      const w = pageBody(st, 2, (i) => { i.miCoresInp.value += ", FFF"; });
      const r = await srv.post(w.url, w.body, mod);
      rec("the save succeeded", r.status === 200 && r.body.ok === true && r.body.changed === true, r.body);
      const after = read(path.join(mod, "history", "states", "2-B.txt")) || "";
      rec("⭐⭐ the new core goes on its own line after the owner", /\r\n\t\towner = AAA\r\n\t\tadd_core_of = FFF\r\n/.test(after), after);
      rec("⭐⭐ AAA's dated core is still in its date", /add_core_of = AAA/.test(blockBody(after, "1936.1.1") || ""), after);
      rec("⭐⭐ nothing else changed", after.replace(/^[ \t]*add_core_of = FFF\r\n/m, "") === crlf, after);
      rec("⚠️ no bare LF line ending was written into the CRLF file", !/[^\r]\n/.test(after), JSON.stringify(after));
    }

    console.log("\n8. The shipping maps' own states (derived from the installed corpus): a save that changes nothing, adding one core, and removing a core written only in a date or a condition");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      // Independent of the writer: the core tags a file writes inside history at depth 0, and all of them, on a comment-stripped copy.
      const coreDepths = (raw) => {
        const s = raw.replace(/#[^\n]*/g, (m) => " ".repeat(m.length));
        const hist = /(?:^|[^A-Za-z0-9_])history\s*=\s*\{/.exec(s);
        if (!hist) return null;
        const open = s.indexOf("{", hist.index);
        let d = 0, close = -1;
        for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) { close = i; break; } } }
        if (close < 0) return null;
        const inner = s.slice(open + 1, close);
        const top = new Set(), all = new Set();
        let depth = 0, at = 0;
        for (const m of inner.matchAll(/(?<![A-Za-z0-9_])add_core_of\s*=\s*([A-Za-z0-9_]+)/g)) {
          for (; at < m.index; at++) { if (inner[at] === "{") depth++; else if (inner[at] === "}") depth--; }
          all.add(m[1]); if (depth === 0) top.add(m[1]);
        }
        return { top, all };
      };
      let ran = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed`); continue; }
        ran++;
        let tried = 0, reach = 0;
        const same = [], add = [], drop = [];
        const note = (arr, x) => { arr.push(arr.length < 3 ? x : null); };
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          const raw = fs.readFileSync(path.join(sdir, f), "utf8");
          const parsed = M.parseStatesText(raw);
          if (parsed.length !== 1 || !(parsed[0].cores || []).length) continue;
          const st = parsed[0];
          tried++;
          if (M.setStateFieldsInBlock(raw, { cores: st.cores.slice() }) !== raw) note(same, f);
          const tag = ["ZZZ", "ZZY", "ZZX"].find((t) => !st.cores.includes(t));
          const added = M.setStateFieldsInBlock(raw, { cores: [...st.cores, tag] });
          // Exactly one line changed: the new core on a line of its own, or — where the author writes the last core beside other
          // script on one line (Rise of Nations: `add_core_of = KOR add_core_of = DPK`, `add_core_of = BOX 1912.1.1 = { … }`,
          // `set_state_flag = RUS_core add_core_of = SOV`) — written right after that core on its line, as the victory-point writer
          // does. Either way, taking the one ` add_core_of = TAG` out of the one changed line gives the file back.
          const A = raw.split("\n"), B = added.split("\n");
          const ownLine = B.length === A.length + 1 && added.replace(new RegExp(`^[ \\t]*add_core_of = ${tag}\\r?\\n`, "m"), "") === raw;
          const diff = B.length === A.length ? A.map((l, i) => i).filter((i) => A[i] !== B[i]) : [];
          const sameLine = diff.length === 1 && B[diff[0]].split(` add_core_of = ${tag}`).length === 2 && B[diff[0]].replace(` add_core_of = ${tag}`, "") === A[diff[0]];
          const readBack = (M.parseStatesText(added)[0] || {}).cores || [];
          if (!(ownLine || sameLine) || readBack.length !== st.cores.length + 1 || !readBack.includes(tag)) note(add, { f, readBack: readBack.length });
          const depths = coreDepths(raw);
          const nestedOnly = depths ? [...depths.all].filter((t) => !depths.top.has(t)) : [];
          if (nestedOnly.length) {
            reach++;
            if (M.setStateFieldsInBlock(raw, { cores: st.cores.filter((t) => t !== nestedOnly[0]) }) !== raw) note(drop, { f, tag: nestedOnly[0] });
          }
        }
        rec(`${label}: a save that changes no core changes no byte, in each of ${tried} states`, same.length === 0, { bad: same.length, samples: same.filter(Boolean) });
        rec(`${label}: ⭐⭐⭐ adding a core to each of ${tried} states changed nothing but the new line`, add.length === 0, { bad: add.length, samples: add.filter(Boolean) });
        rec(`${label}: ⭐⭐⭐ removing a core written only in a date or a condition changed nothing, in each of ${reach} states that have one`, drop.length === 0, { bad: drop.length, samples: drop.filter(Boolean) });
      }
      if (!ran) skip("no shipping map is installed — section 8 did NOT run");
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a core edit keeps the dated and conditional cores: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
