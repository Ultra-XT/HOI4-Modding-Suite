// #a-merge-says-what-it-could-not-carry
//
// MERGING TWO STATES DESTROYS PART OF ONE STATE'S HISTORY, THE SERVER COUNTS EXACTLY WHICH PART, AND THE PAGE
// NEVER SAID A WORD.
//
// mergeState decides statement by statement what it can bring across: building levels are summed, effects on
// the land are copied into the same dates, the undated owner / controller / cores are replaced by the kept
// state's. Everything else it returns as `carriedHistory.leftBehind` (with `leftBehindCount`) — a list it
// computes for no purpose other than to be said — and then it deletes the source state's file.
// `carriedHistory` and `leftBehind` appeared NOWHERE in public/map.js, so the whole report went in the bin
// and the Save line read like any other successful merge.
//
// The merge's CHOICE is right: one state cannot hold two sets of variables, flags and modifiers. What was
// wrong is the silence — the same silence #a-save-still-says-what-it-discarded-from-the-queue fixed for the
// two queue purges one function away, on the same warning line.
//
// Size, measured rather than assumed (section 1 re-derives it from the installed maps): the states that
// would leave at least one statement behind if merged away are
//     Millennium Dawn 1250/1250 · Road to 56 1073/1143 · Rise of Nations 461/1154
//     vanilla 104/1081 · Novum Vexillum 53/1372 · Old World Blues 16/1524
//
// ⛔ (review T11) AND THE LEFT-BEHIND LIST ITSELF LEFT THINGS OUT. It read the source's history alone, so local_supplies (non-zero on 223 of the
// base game's 1,081 states, 190 of Road to 56's, 107 of Rise of Nations') went with its file without a word, as did a buildings_max_level_factor,
// an impassable, and every undated core and claim the kept state does not have, with the note saying the rest had been listed. Section 5: the
// supplies are the land's and are summed like its manpower; the others say what the state WAS, and are named with their values.
//
// Section 2 drives the REAL /api/map/merge-state on a fixture whose source state carries exactly the shapes
// the corpus does, reads the response, and then reads the DISK: the statements the server named are absent
// from the surviving target and the source's file is gone. Section 3 runs the page's own mergeLeftBehindNote
// over that response. Section 4 is the back-out control for the wiring.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mergesay-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const MAPS = [["vanilla", VAN], ["Millennium Dawn", WS + "/2777392649"], ["Road to 56", WS + "/820260968"],
  ["Old World Blues", WS + "/2265420196"], ["Novum Vexillum", WS + "/1827273767"], ["Rise of Nations", WS + "/2026448968"]];

const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));

// ── the page's own note function, lifted and run ────────────────────────────────────────────────
function blankComments(src) {
  let out = "", i = 0, state = "code", quote = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "str"; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "str") {
      if (c === "\\") { out += c + (d || ""); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += c; } else out += " "; i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; continue; } out += c === "\n" ? c : " "; i++; continue; }
  }
  return out;
}
const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const PAGE_CODE = blankComments(PAGE);
function fnText(name) {
  const at = PAGE_CODE.indexOf("function " + name + "(");
  if (at === -1) return "";
  const open = PAGE_CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < PAGE_CODE.length; i++) { if (PAGE_CODE[i] === "{") d++; else if (PAGE_CODE[i] === "}") { d--; if (d === 0) return PAGE_CODE.slice(at, i + 1); } }
  return "";
}

// ── section 1: how many states of each shipping map would lose something ────────────────────────
// Classified the way stateHistoryToCarry does, with BOTH sets derived from map-data.js's own source rather
// than typed here — a hand-copied key list is one that has never heard of the key added next month.
function carryVocabulary() {
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const code = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const setOf = (name) => {
    const at = code.indexOf("const " + name + " = new Set([");
    if (at === -1) return null;
    const open = code.indexOf("[", at), close = code.indexOf("]", open);
    return new Set(code.slice(open + 1, close).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean));
  };
  const scal = setOf("MERGE_CARRIED_SCALARS"), blk = setOf("MERGE_CARRIED_BLOCKS"), repl = setOf("MERGE_REPLACED_UNDATED");
  if (!scal || !blk || !repl) return null;
  return new Set([...scal, ...blk, ...repl, "buildings"]);
}
function braceBlock(text, key) {
  const scan = mask(text);
  const m = new RegExp("(^|[^A-Za-z0-9_])" + key + "\\s*=\\s*\\{").exec(scan);
  if (!m) return null;
  const open = scan.indexOf("{", m.index);
  let d = 0;
  for (let i = open; i < scan.length; i++) { if (scan[i] === "{") d++; else if (scan[i] === "}") { d--; if (d === 0) return { open, close: i }; } }
  return null;
}
function depth0Keys(body) {
  const scan = mask(body), out = [];
  let i = 0, d = 0;
  while (i < scan.length) {
    const c = scan[i];
    if (c === "{") { d++; i++; continue; }
    if (c === "}") { d--; i++; continue; }
    if (d === 0 && /[A-Za-z_]/.test(c) && (i === 0 || !/[A-Za-z0-9_]/.test(scan[i - 1]))) {
      const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*=/.exec(scan.slice(i));
      if (m) { out.push(m[1]); i += m[0].length; continue; }
    }
    i++;
  }
  return out;
}

console.log("\n1. how many states of each installed map would leave history behind when merged away");
{
  const KEPT = carryVocabulary();
  rec("the carry vocabulary is derived from map-data.js, not typed here", !!KEPT && KEPT.size >= 6, KEPT && [...KEPT]);
  // …and what the PROVINCE move carries out of the source before the merge reads it, which is why these are
  // not in leftBehind either. Derived from the piece kinds provinceHistoryToCarry names.
  const BY_MOVE = new Set(["victory_points", "add_victory_points", "add_province_modifier", "set_province_name"]);
  const DATE = /^\d{3,4}\.\d{1,2}\.\d{1,2}$/;
  let ran = 0;
  for (const [label, root] of MAPS) {
    const dir = path.join(root, "history", "states");
    if (!KEPT || !fs.existsSync(dir)) { skip(label + " is not installed"); continue; }
    ran++;
    let states = 0, lossy = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      const h = braceBlock(t, "history");
      states++;
      if (!h) continue;
      const body = t.slice(h.open + 1, h.close);
      const keys = depth0Keys(body);
      const re = /(^|[^A-Za-z0-9_])(\d{3,4}\.\d{1,2}\.\d{1,2})\s*=\s*\{/g;
      const scan = mask(body);
      let m;
      while ((m = re.exec(scan))) {
        const open = scan.indexOf("{", m.index);
        let d = 0, close = -1;
        for (let j = open; j < scan.length; j++) { if (scan[j] === "{") d++; else if (scan[j] === "}") { d--; if (d === 0) { close = j; break; } } }
        if (close === -1) break;
        for (const k of depth0Keys(body.slice(open + 1, close))) keys.push(k);
      }
      if (keys.some((k) => !DATE.test(k) && !KEPT.has(k) && !BY_MOVE.has(k))) lossy++;
    }
    console.log("   " + label.padEnd(17) + String(lossy).padStart(5) + " of " + String(states).padStart(5)
      + " states would leave at least one statement behind (" + (100 * lossy / (states || 1)).toFixed(1) + "%)");
    rec(label + ": the scan read its states", states > 500, states);
  }
  if (!ran) skip("no shipping map is installed — section 1 did NOT run");
}

// ── sections 2-4 ────────────────────────────────────────────────────────────────────────────────
const mkMod = () => {
  const MOD = fs.mkdtempSync(path.join(ROOT, "mod-"));
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  const ids = [11, 12, 13, 14, 21, 22];
  mk("descriptor.mod", 'name="merge says"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((q, i) => `${q};${i + 1};0;0;land;false;plains;1`)].join("\n") + "\n");
  // The SOURCE carries one of each shape the corpus does: a variable, a dynamic modifier, a state flag, and a
  // dated statement — plus land the merge must still carry, so "it said something" is not "it lost everything".
  mk("history/states/11-Source.txt",
    'state = {\n\tid = 11\n\tname = "STATE_11"\n\tmanpower = 500\n\tstate_category = rural\n\tresources = {\n\t\toil = 4\n\t}\n'
    + '\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n'
    + '\t\tset_variable = { productivity_state_var = 1019 }\n\t\tadd_dynamic_modifier = { modifier = nova_probe_modifier }\n'
    + '\t\tset_state_flag = nova_probe_flag\n\t\t1939.1.1 = {\n\t\t\tset_compliance = 40\n\t\t}\n\t}\n'
    + '\tprovinces = {\n\t\t11 12\n\t}\n}\n');
  mk("history/states/13-Target.txt",
    'state = {\n\tid = 13\n\tname = "STATE_13"\n\tmanpower = 700\n\tstate_category = rural\n'
    + '\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n\t}\n'
    + '\tprovinces = {\n\t\t13 14\n\t}\n}\n');
  mk("map/strategicregions/1-R.txt", 'strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 11 12 13 14 21 22 }\n}\n');
  return MOD;
};

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (url, body) => new Promise((resolve) => {
    const http = require("http");
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let b = ""; res.on("data", (c) => { b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch (_) {} resolve({ status: res.statusCode, body: j, raw: b }); });
    });
    req.on("error", (e) => resolve({ status: 0, body: null, raw: String(e.message) }));
    req.end(data);
  });

  try {
    console.log("\n2. the real merge: what the server reports, and what the disk then holds");
    const MOD = mkMod();
    const srcTxt = fs.readFileSync(path.join(MOD, "history", "states", "11-Source.txt"), "utf8");
    // Requests are the client's: queueWrite("/api/map/merge-state", { sourceStateId, targetStateId }, { merge: true })
    // and flushMapSaves adds modPath.
    const res = await post("/api/map/merge-state", { sourceStateId: 11, targetStateId: 13, modPath: MOD });
    rec("the merge succeeded", res.status === 200 && res.body && res.body.ok !== false, res.body && res.body.error);
    const ch = res.body && res.body.carriedHistory;
    rec("the response carries a leftBehind list with a count", !!ch && Array.isArray(ch.leftBehind) && Number.isFinite(ch.leftBehindCount), ch);
    console.log("   leftBehind: " + JSON.stringify(ch && ch.leftBehind));
    rec("CONTROL: the merge really did carry the land it could", !!res.body && Array.isArray(res.body.movedProvinces) && res.body.movedProvinces.length === 2, res.body && res.body.movedProvinces);
    const dstTxt = fs.readFileSync(path.join(MOD, "history", "states", "13-Target.txt"), "utf8");
    rec("CONTROL: …and summed what it carries (manpower 500 + 700)", /manpower\s*=\s*1200/.test(dstTxt), dstTxt);
    rec("CONTROL: …and the resources came across", /oil\s*=\s*4/.test(dstTxt), dstTxt);
    rec("the source's file is gone", !fs.existsSync(path.join(MOD, "history", "states", "11-Source.txt")), "still there");
    // Everything the server NAMED is measurably absent from the state that survived.
    const measured = [];
    for (const raw of srcTxt.split(/\r?\n/)) {
      const t = raw.trim();
      if (!/^(set_variable|add_dynamic_modifier|set_state_flag|set_compliance)\b/.test(t)) continue;
      if (dstTxt.indexOf(t) === -1) measured.push(t);
    }
    console.log("   absent from the surviving target: " + JSON.stringify(measured));
    rec("the count the server reported is the number actually dropped", (ch && ch.leftBehindCount) === measured.length, { reported: ch && ch.leftBehindCount, measured: measured.length, measured });
    rec("…and it is not zero, so the rest of this test is not vacuous", measured.length > 0, measured);

    console.log("\n3. the page's own note, run over that exact response");
    const src = fnText("mergeLeftBehindNote");
    rec("mergeLeftBehindNote was found in public/map.js", src.length > 200, src.length);
    const ctx = { console, Array, Number, Map, String, JSON };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const note = ctx.mergeLeftBehindNote(res.body, 11, 13);
    console.log("   " + note);
    rec("it produces a note", typeof note === "string" && note.length > 80, note);
    rec("…naming both states", note.indexOf("state 11") !== -1 && note.indexOf("state 13") !== -1, note);
    rec("…naming the file that is gone", note.indexOf("11-Source.txt") !== -1, note);
    for (const k of new Set((ch.leftBehind || []).map((x) => x.key))) {
      rec("…naming " + k, note.indexOf(k) !== -1, note);
    }
    rec("…and the real total", note.indexOf(String(ch.leftBehindCount)) !== -1, note);
    // …and it says NOTHING when there is nothing to say: a note on every merge is a note nobody reads.
    rec("a merge that carried everything gets no note", ctx.mergeLeftBehindNote({ carriedHistory: { leftBehind: [], leftBehindCount: 0 } }, 1, 2) === "", "note on a clean merge");
    rec("…and a response without carriedHistory gets no note", ctx.mergeLeftBehindNote({ ok: true }, 1, 2) === "", "note on a bare response");
    // The cap: the server sends at most 200 entries but the true count in leftBehindCount. Saying the sample
    // size instead of the total would be this bug over again, one level down.
    const capped = ctx.mergeLeftBehindNote({ carriedHistory: { leftBehind: [{ date: null, key: "set_variable" }], leftBehindCount: 207 }, deleted: { file: "x.txt" } }, 4, 5);
    rec("a capped list still reports the real total", capped.indexOf("207") !== -1, capped);

    console.log("\n4. 💾 Save, through the page's own flushMapSaves — does the modder READ it?");
    {
      // ⚠️ NOT a grep. A source-shape check passes with the call site wrapped in `if (false &&` — which is
      // exactly what the first version of this section did, and it is why the back-out did not bite. So the
      // real flushMapSaves is lifted and RUN against the real server, and the assertion is on the status line.
      const MOD2 = mkMod();
      // ⚠️ THE END ANCHORS ARE BUILT FROM THE FILE'S OWN LINE ENDING, not from a literal "\n". lift()'s default
      // end is "\n  }", and public/map.js is CRLF in a fresh checkout (core.autocrlf, no .gitattributes) and LF
      // in a working tree a tool has written since — so a bare-newline anchor matches nothing THERE and
      // everything HERE, which is CLAUDE.md's "single most common way an edit here appears to work and does
      // not", aimed at a test instead of a file. Detected, never assumed.
      const NL = P.MAP.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
      const END = NL + "  }";
      // runPage's withNoteHelpers pulls in every `…Note()` the lifted code calls — mergeLeftBehindNote
      // included — so this list cannot go stale the way six tests once did over one new helper.
      const { sb, statuses } = P.runPage([
        ["const STATE_ID_FIELDS = ", NL],
        ["function orphanedQueuedWrites(writes)", END],
        ["function emptyNewStateWrites(writes, stateById)", END],
        ["function markSaveBoundary", END],
        ["async function mapCrashGate", END],
        ["function terrainWriteNotes", END],
        ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }" + END],
      ], {
        JSON, Array, Number, Map, String, Object,
        // the page's own body for a merge click:
        //   queueWrite("/api/map/merge-state", { sourceStateId, targetStateId }, { merge: true })
        pendingWrites: [{ url: "/api/map/merge-state", body: { sourceStateId: 11, targetStateId: 13 }, meta: { merge: true } }],
        paintDiff: new Map(),
        stateById: new Map([[11, { id: 11, provinces: [11, 12] }], [13, { id: 13, provinces: [13, 14] }]]),
        model: { states: [{ id: 11, provinces: [11, 12] }, { id: 13, provinces: [13, 14] }] },
        stagedRiverEdits: [], riversShow: false, undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
        baseImageData: null, baseImageDataPristine: null, provinceDef: new Map(),
        setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => MOD2, isVanillaTarget: () => false,
        problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {},
        loadRiversOverlay: () => {}, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        remapQueuedStateId: () => {}, remapLocalStateId: () => {}, adoptMergeRegions: () => {},
        openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        rebuildStagedRiversFromPending: () => {},
        // the page posts to relative urls; this reaches the real server started above
        fetch: (url, opts) => fetch("http://127.0.0.1:" + PORT + String(url), opts),
      });
      await sb.flushMapSaves();
      const last = statuses[statuses.length - 1] || "";
      console.log("   final Save line: " + last.slice(0, 700));
      rec("the save ran and reported", statuses.length > 0 && !/stopped/i.test(last), statuses);
      rec("⭐⭐⭐ the final Save line says what the merge could not carry", /left \d+ statements? behind/.test(last), last);
      rec("…and names them", last.indexOf("set_variable") !== -1 && last.indexOf("set_state_flag") !== -1, last);
      rec("…and names the file that is gone", last.indexOf("11-Source.txt") !== -1, last);
      rec("CONTROL: the merge really happened on disk", !fs.existsSync(path.join(MOD2, "history", "states", "11-Source.txt")), "source still there");
    }

    console.log("\n5. ⭐ what the state block says outside its history, and the undated cores and claims");
    {
      const MOD3 = fs.mkdtempSync(path.join(ROOT, "mod-"));
      const mk = (rel, c) => { const p = path.join(MOD3, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
      const read = (rel) => fs.readFileSync(path.join(MOD3, rel), "utf8");
      const ids = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
      mk("descriptor.mod", 'name="merge says 2"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
      mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((q, i) => `${q};${i + 1};0;0;land;false;plains;1`)].join("\n") + "\n");
      mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
      const state = (id, top, hist, provinces) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n${top.map((l) => `\t${l}\n`).join("")}\thistory = {\n${hist.map((l) => `\t\t${l}\n`).join("")}\t}\n\tprovinces = {\n\t\t${provinces.join(" ")}\n\t}\n}\n`;
      // the rich one: a target that has its own supplies, with a comment on them
      mk("history/states/31-Source.txt", state(31, ["local_supplies = 3.5", "buildings_max_level_factor = 2.0", "impassable = yes", "impassable_ignored_links = { 1 2 }"],
        ["owner = AAA", "add_core_of = AAA", "add_core_of = ENG", "add_claim_by = SIA"], [31, 32]));
      mk("history/states/33-Target.txt", state(33, ["local_supplies = 1.250 # the mines", "buildings_max_level_factor = 1.000"], ["owner = AAA", "add_core_of = AAA"], [33, 34]));
      const r1 = await post("/api/map/merge-state", { sourceStateId: 31, targetStateId: 33, modPath: MOD3 });
      const t1 = read("history/states/33-Target.txt");
      rec("(guard: the merge ran)", r1.status === 200 && r1.body && r1.body.ok !== false, r1.body);
      rec("⭐⭐⭐ local_supplies is the land's: 3.5 + 1.250 summed, with the comment on its line kept", /local_supplies = 4\.75 # the mines/.test(t1) && (t1.match(/local_supplies/g) || []).length === 1, t1);
      const said = ((r1.body && r1.body.carriedHistory) || {}).leftBehind || [];
      const shown = said.map((x) => x.key + (x.value != null ? ` = ${x.value}` : ""));
      const want = ["buildings_max_level_factor = 2.0", "impassable = yes", "impassable_ignored_links", "add_core_of = ENG", "add_claim_by = SIA"];
      rec("⭐⭐⭐ what the merge does not carry is listed, with its values, and nothing it does", JSON.stringify(shown) === JSON.stringify(want) && r1.body.carriedHistory.leftBehindCount === want.length, shown);
      rec("⭐ …none of it written onto the kept state, which is who it was", !/ENG|SIA|impassable|= 2\.0/.test(t1) && /buildings_max_level_factor = 1\.000/.test(t1), t1);
      const ctx5 = { console, Array, Number, Map, String, JSON };
      vm.createContext(ctx5);
      vm.runInContext(fnText("mergeLeftBehindNote"), ctx5);
      const note5 = ctx5.mergeLeftBehindNote(r1.body, 31, 33);
      rec("⭐⭐⭐ the page's note says each of them, with its value", want.every((w) => note5.includes(w)) && note5.includes("left 5 statements behind"), note5);
      // the shapes: no history at all, which the list used to return early on; a target with no supplies of its own; a CRLF file
      mk("history/states/35-NoHist.txt", "state = {\r\n\tid = 35\r\n\tname = \"STATE_35\"\r\n\tmanpower = 100\r\n\tstate_category = rural\r\n\tlocal_supplies = 2.0\r\n\tbuildings_max_level_factor = 0.5\r\n\tprovinces = {\r\n\t\t35 36\r\n\t}\r\n}\r\n");
      mk("history/states/37-Plain.txt", state(37, [], ["owner = AAA", "add_core_of = AAA"], [37, 38]).replace(/\n/g, "\r\n"));
      const r2 = await post("/api/map/merge-state", { sourceStateId: 35, targetStateId: 37, modPath: MOD3 });
      const t2 = read("history/states/37-Plain.txt");
      rec("⭐⭐ a state with no history still has its supplies carried and its factor said", /local_supplies = 2\b/.test(t2) && JSON.stringify((r2.body.carriedHistory || {}).leftBehind) === JSON.stringify([{ date: null, key: "buildings_max_level_factor", value: "0.5" }]), { t2, res: r2.body.carriedHistory });
      rec("⭐ …a kept state with no line of its own is given one, in its file's own line endings", /\tid = 37\r\n\tlocal_supplies = 2\r\n/.test(t2) && !/[^\r]\n/.test(t2), JSON.stringify(t2.slice(0, 120)));
      // ⚠️ no cry-wolf: the shipping maps write 0.000 and 1.000, or leave them off, and most states of a country share its cores
      mk("history/states/39-Quiet.txt", state(39, ["local_supplies = 0.000", "buildings_max_level_factor = 1"], ["owner = AAA", "add_core_of = AAA", "add_claim_by = BBB", "owner = CCC"], [39, 40]));
      mk("history/states/41-Kept.txt", state(41, [], ["# whose it is", "add_claim_by=BBB", "add_core_of = AAA", "owner = AAA"], [41, 42]));
      const before = read("history/states/41-Kept.txt");
      const r3 = await post("/api/map/merge-state", { sourceStateId: 39, targetStateId: 41, modPath: MOD3 });
      const t3 = read("history/states/41-Kept.txt");
      rec("⚠️ a 0.000 and a factor of 1 say nothing, and write nothing: the shipping maps write them on hundreds of states and leave them off the rest", !/local_supplies|buildings_max_level_factor/.test(t3) && !((r3.body.carriedHistory || {}).leftBehind || []).length, { t3, res: r3.body.carriedHistory });
      rec("⚠️ …nor does a core or a claim the kept state has too, however it is spaced; nor the owner, which one state can have only one of", ((r3.body.carriedHistory || {}).leftBehindCount) === 0 && ctx5.mergeLeftBehindNote(r3.body, 39, 41) === "", r3.body.carriedHistory);
      rec("CONTROL: the kept state took the land and its own lines stayed", t3.includes("add_claim_by=BBB") && t3.includes("# whose it is") && before !== t3, t3);
    }
  } catch (e) {
    console.log("THREW: " + (e && e.stack || e));
    fails.push("threw");
  }
  console.log("\n" + (checks - fails.length) + "/" + checks + " checks passed" + (skips ? ", " + skips + " skipped" : "") + (fails.length ? "\nFAILED: " + fails.join("\n        ") : ""));
  server.close();
  process.exit(fails.length ? 1 : 0);
});
