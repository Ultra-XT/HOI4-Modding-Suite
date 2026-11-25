// ⛔ #a-checkpoint-makes-a-state-once — A 📌 CHECKPOINT TAKEN BEFORE A SAVE DOES NOT MAKE ITS NEW STATE A SECOND TIME.
//
// B6-9 (tool campaign, CONFIRMED, medium): ＋ New state, fill it, 📌 checkpoint, 💾 Save (create-state makes state 1082, the province
// moves in), then Restore the checkpoint ("Restore anyway") and 💾 Save again. The checkpoint still queued the create under its
// provisional id, so the second Save sent it AGAIN: state 1083, the province moved into it, and 1082 left with provinces = { } —
// empty_state, a FATAL the Save gate stopped for. The question before the restore said the Save "writes this older map back over
// them"; a create does not write over anything, it makes one more state.
//
// The fix (public/map.js foldLandedCreate): a create that has landed is folded into every snapshot the page holds — it leaves that
// snapshot's queue, and the provisional id becomes the real one in its model and in the writes it still queues. Only the create: the
// checkpoint's other writes are sent again, as decided (test-map-checkpoint-across-save.js), and the question says what the next Save
// does — and, for a checkpoint that queues nothing, that a Save has nothing of it to write (the judge's V2).
//
// Run, not read: the page's own flushMapSaves, addCheckpoint, restoreCheckpoint and the snapshot functions, lifted out of
// public/map.js into one sandbox, against a fake server that records what it is sent.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

const FNS = [
  ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
  "async function mapCrashGate", "function markSaveBoundary", "function snapshotMap", "function applyMapSnapshot", "function pushUndo",
  "function addCheckpoint", "function restoreCheckpoint", "function eachHeldSnapshot", "function foldIrreversibleAddition",
  "function foldLandedCreate", "function remapQueuedStateId", "function remapLocalStateId",
];

function world() {
  // the page after ＋ New state (provisional -1, for PER) and one fill click: province 1896 moved in from state 1000
  const st = { id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [1896], owner: "PER", cores: ["PER"], manpower: 0, category: "", victoryPoints: [], buildings: {}, resources: {}, provinceBuildings: {} };
  const from = { id: 1000, name: "STATE_1000", displayName: "Petrondek", provinces: [1895, 1897], owner: "PER", cores: ["PER"], manpower: 5000, category: "rural" };
  return {
    model: { states: [from, st], provinceToState: { 1895: 1000, 1896: -1, 1897: 1000 }, capitals: { PER: 7 }, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], stateToSupplyArea: {}, provinceToRegion: {} },
    stateById: new Map([[1000, from], [-1, st]]),
    pendingWrites: [
      { url: "/api/map/create-state", body: { name: "", owner: "PER" }, meta: { create: true, provisionalId: -1 } },
      { url: "/api/map/move-province", body: { provinceId: 1896, toStateId: -1 }, meta: { fromStateId: 1000 } },
    ],
  };
}

function sandbox(w, sent, nextId) {
  return Object.assign(T.loadGlobals(), {
    model: w.model, stateById: w.stateById, pendingWrites: w.pendingWrites,
    paintDiff: new Map(), provinceToOwner: { 1895: "PER", 1896: "PER", 1897: "PER" }, provinceType: new Map(), provinceDef: new Map(),
    countryColors: {}, stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [], checkpointSeq: 0,
    saveGeneration: 0, dirtyMap: true, selected: null, info: null, moveTarget: null, stateFormBaseline: null, UNDO_LIMIT: 30,
    STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"],
    statusEl: { style: {}, textContent: "" },
    modPath: () => "D:/fixture/mod", isVanillaTarget: () => false, setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
    renderCheckpoints: () => {}, renderHistoryPanel: () => {}, rebuildStagedRiversFromPending: () => {}, loadRiversOverlay: () => {},
    regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {}, syncCountryColorInput: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stageStateWrite: () => {},
    openMapErrorsModal: () => {}, saveMapBackup: () => {}, problemsPanelOpen: () => false, refreshProblems: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, reconcileNavalCarry: () => {},
    fetch: async (url, opts) => {
      const u = String(url).split("?")[0];
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      sent.push({ url: u, body });
      if (u === "/api/map/validate") return { json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      if (u === "/api/map/create-state") { const id = nextId(); return { json: async () => ({ ok: true, id, name: "STATE_" + id, displayName: "Petrondek Nova", manpower: 1000, category: "rural" }) }; }
      return { json: async () => ({ ok: true, changed: true }) };
    },
  });
}

(async () => {
  // ── the repro's own sequence, through the page's own functions ───────────────────────────────────────────────────────────
  const w = world();
  const sent = [];
  let id = 1081;
  let page = null;
  try {
    page = T.runPage(FNS, sandbox(w, sent, () => ++id));
  } catch (e) { rec("the page's save, checkpoint and snapshot functions are lifted out of public/map.js", false, e.message); }
  if (page) {
    const { sb } = page;
    let asked = null;
    sb.window.novaConfirm = (msg, yes, opts) => { asked = { msg, opts }; yes(); };
    sb.addCheckpoint();
    rec("the checkpoint holds the create and the fill, as the page queued them", sb.checkpoints.length === 1
      && sb.checkpoints[0].snapshot.pendingWrites.map((q) => q.url).join() === "/api/map/create-state,/api/map/move-province", sb.checkpoints[0] && sb.checkpoints[0].snapshot.pendingWrites);
    try { await sb.flushMapSaves(); } catch (e) { rec("Save 1 runs", false, e.stack); }
    const save1 = sent.filter((q) => q.url !== "/api/map/validate").map((q) => q.url);
    rec("Save 1 made the state (1082) and moved the province into it", save1.join() === "/api/map/create-state,/api/map/move-province"
      && sent.some((q) => q.url === "/api/map/move-province" && q.body.toStateId === 1082), sent);
    const snap = sb.checkpoints[0].snapshot;
    rec("⭐⭐⭐ the checkpoint no longer queues the create the Save made", !snap.pendingWrites.some((q) => q.url === "/api/map/create-state"), snap.pendingWrites);
    rec("⭐⭐ …and the write it still queues names the state by its real id", snap.pendingWrites.length === 1 && snap.pendingWrites[0].body.toStateId === 1082 && snap.pendingWrites[0].meta.fromStateId === 1000, snap.pendingWrites);
    const held = JSON.parse(snap.states).find((s) => s.provinces && s.provinces.indexOf(1896) !== -1);
    rec("⭐⭐ …as does its model: the state is 1082, with the name the server gave it, not the page's placeholders",
      held && held.id === 1082 && held.name === "STATE_1082" && held.displayName === "Petrondek Nova" && held.manpower === 1000 && held.category === "rural"
        && snap.provinceToState[1896] === 1082, { held, p2s: snap.provinceToState });
    rec("…and it records the state it made, for the question to name", JSON.stringify(snap.made) === "[1082]", snap.made);
    rec("CONTROL: the live page was remapped as before (remapLocalStateId)", sb.stateById.has(1082) && !sb.stateById.has(-1), [...sb.stateById.keys()]);

    // Restore the checkpoint ("Restore anyway"), then Save 2
    sent.length = 0;
    sb.restoreCheckpoint(0);
    rec("the restore asks first (the checkpoint predates the Save)", !!asked && asked.opts && asked.opts.danger === true, asked);
    const msg = asked ? asked.msg : "";
    rec("⭐⭐ the question says the Save sends its queued edit again, and that the state it made is not made a second time",
      /It holds 1 edit that was waiting to be saved when you took it: restoring puts it back in the queue, and saving afterwards sends it again/.test(msg)
        && /The new state it held is already in your mod \(state 1082\), and is not made a second time\./.test(msg), msg);
    rec("…and still says the files are not undone (decided)", /stay exactly as they are/.test(msg) && /does not undo them/.test(msg), msg);
    rec("the restore put the checkpoint's one write back", sb.pendingWrites.length === 1 && sb.pendingWrites[0].url === "/api/map/move-province", sb.pendingWrites);
    try { await sb.flushMapSaves(); } catch (e) { rec("Save 2 runs", false, e.stack); }
    const creates = sent.filter((q) => q.url === "/api/map/create-state");
    rec("⭐⭐⭐ Save 2 does NOT send create-state again (no second state, no empty first one)", creates.length === 0, sent.map((q) => q.url));
    rec("⭐ …it sends the fill to the state the first Save made", sent.some((q) => q.url === "/api/map/move-province" && q.body.toStateId === 1082 && q.body.provinceId === 1896), sent);
  }

  // ── a snapshot from before ＋ New state never knew the state: it is left as it was ───────────────────────────────────────────
  {
    let page2 = null;
    try { page2 = T.runPage(["function eachHeldSnapshot", "function foldIrreversibleAddition", "function foldLandedCreate", "function remapQueuedStateId"], { undoStack: [], redoStack: [], checkpoints: [], pendingWrites: [], STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"] }); }
    catch (e) { rec("foldLandedCreate is lifted alone", false, e.message); }
    if (page2) {
      const { sb } = page2;
      const before = { states: JSON.stringify([{ id: 1000, provinces: [1895, 1896] }]), provinceToState: { 1896: 1000 }, capitals: {}, pendingWrites: [{ url: "/api/map/set-owner", body: { stateId: 1000, owner: "GER" }, meta: {} }] };
      const other = { states: JSON.stringify([{ id: -2, provinces: [] }]), provinceToState: {}, capitals: {}, pendingWrites: [{ url: "/api/map/create-state", body: { name: "" }, meta: { create: true, provisionalId: -2 } }] };
      const keep = JSON.stringify([before, other]);
      sb.checkpoints.push({ name: "older", snapshot: before, generation: 0 }, { name: "another new state", snapshot: other, generation: 0 });
      sb.foldLandedCreate(-1, 1082, { ok: true, id: 1082, name: "STATE_1082" });
      rec("⭐ a snapshot that never held this state, and one holding ANOTHER new state, are left exactly as they were",
        JSON.stringify([before, other]) === keep && !("made" in before) && !("made" in other), [before, other]);
    }
  }

  // ── the question, for each kind of pre-save checkpoint (V2: one that queues nothing) ─────────────────────────────────────────
  {
    const ask = (snapshot) => {
      let msg = null;
      const p = T.runPage(["function restoreCheckpoint"], {
        checkpoints: [{ name: "cp", snapshot, generation: 0 }], saveGeneration: 1,
        pushUndo: () => {}, applyMapSnapshot: () => {},
        window: { novaConfirm: (m) => { msg = m; }, confirm: () => false },
      });
      p.sb.restoreCheckpoint(0);
      return String(msg);
    };
    const none = ask({ pendingWrites: [], paintDiff: new Map() });
    rec("⭐⭐ V2: a checkpoint that queues nothing says a Save has nothing of it to write, and no longer that it writes the older map back",
      /It holds no edit that was waiting to be saved, so a Save afterwards has nothing of it to write/.test(none) && !/writes this older map back/.test(none), none);
    const three = ask({ pendingWrites: [{ url: "/a" }, { url: "/b" }], paintDiff: new Map([["1,1", {}]]) });
    rec("…a checkpoint with queued edits (and a painted stroke) counts them and says they are sent again", /It holds 3 edits that were waiting to be saved when you took it: restoring puts them back in the queue, and saving afterwards sends them again, so it writes this older map back over them\./.test(three) && !/already in your mod/.test(three), three);
    const two = ask({ pendingWrites: [{ url: "/a" }], made: [1082, 1083] });
    rec("…and two states a Save made are both named", /The new states it held are already in your mod \(states 1082, 1083\), and are not made a second time\./.test(two), two);
  }

  console.log(`\n=== a checkpoint makes a state once: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
