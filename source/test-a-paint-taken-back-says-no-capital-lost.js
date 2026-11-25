// ⛔ #a-paint-taken-back-says-no-capital-lost (tool campaign B2-16) — A STATE PAINTED AWAY AND BACK IN ONE SAVE IS NOT A CAPITAL LOST.
//
// 🖌 Paint ENG on state 16, then FRA on it again, 💾 Save: the Save sent both set-owner writes, and its line printed both answers'
// capitalWarning — "State 16 was FRA's CAPITAL … FRA would not start with the capital its history names" and "…owned by ENG, which now
// loses it" — though the Save ended with FRA owning 16, its capital, and Map Errors at 0/0. The server words each warning on the owner the
// file has AT THAT WRITE; within one Save only a state's first paint now speaks (a later one's previous owner got the state in this Save),
// and a paint that hands the state back to the owner it had before the first takes that warning back out.
//
// RUN, not grepped: the page's own flushMapSaves (lifted from public/map.js) on the bodies and metas the page queues, with each write's
// answer canned as the server words it (capitalTransferWarning's two shapes, read out of server.js); and every set-owner queue site of the
// page, from its masked source, gives the owner it saw. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 700) : "")); } };
const MAP = T.MAP, MASKED = T.MASKED;
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }"), MARK = grab("function markSaveBoundary", "\n  }"), NOTE = grab("function blankAdjacencyNote", "\n  }");
const HELPERS = ["function firstLandNote", "function adoptFirstLand", "function capitalTownNotes", "function adoptCapitalTown"].map((n) => grab(n, "\n  }"));
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];
const labels = require("./public/map-rule-labels.js");

// The two warnings as the server words them (capitalTransferWarning in server.js), with the tags and states of this test.
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const lost = (sid, tag) => `State ${sid} was ${tag}'s CAPITAL. HOI4 refuses a capital a country does not own (only a launch started with -debug writes "Attempting to set capital state #${sid} … they dont own it!" to error.log), so ${tag} would not start with the capital its history names. Give ${tag} a new capital, or give the state back.`;
const owned = (sid, tag, cap) => `State ${sid} was owned by ${tag}, which now loses it. ${tag} keeps its own capital (state ${cap}), so this is only a territory change.`;
ok(SERVER.includes("HOI4 refuses a capital a country does not own (only a launch started with -debug writes") && SERVER.includes("which now loses it. ${prevOwner} keeps its own capital (state ${prevCapital}), so this is only a territory change."),
  "THE CONTROL: the two warnings are worded here as server.js's capitalTransferWarning words them");

/** flushMapSaves itself, the writes answered in order from `answers`. Returns the Save's last line. */
async function save(writes, answers) {
  let status = "";
  const queue = answers.slice();
  const sb = {
    console, JSON, encodeURIComponent,
    pendingWrites: writes.slice(), paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] }, provinceToOwner: {},
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "D:/fixture",
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels },
    fetch: async (url) => {
      const u = String(url).split("?")[0];
      const ans = u === "/api/map/validate" ? { ok: true, errors: 0, warnings: 0, problems: [] } : (queue.shift() || { ok: true, changed: true });
      return { ok: true, status: 200, json: async () => ans, clone() { return this; } };
    },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${HELPERS.join("\n")}\n${FLUSH}\nglobalThis.__run = flushMapSaves;`, sb);
  await sb.__run();
  return status;
}
const paint = (sid, owner, ownerBefore) => ({ url: "/api/map/set-owner", body: { stateId: sid, owner }, meta: ownerBefore === undefined ? {} : { ownerBefore } });

(async () => {
  try {
    ok(FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80, "THE CONTROL: flushMapSaves, mapCrashGate and markSaveBoundary were lifted", [FLUSH.length, GATE.length, MARK.length]);

    console.log("\n-- the page's set-owner writes carry the owner each click saw --");
    const sites = [...MASKED.matchAll(/queueWrite\("\/api\/map\/set-owner", \{ stateId: sid, owner: tag \}(, \{ ownerBefore: [^}]*\})?\)/g)];
    const all = (MASKED.match(/queueWrite\("\/api\/map\/set-owner"/g) || []).length;
    ok(all >= 3 && sites.length === all && sites.every((m) => !!m[1]), "⭐⭐ every set-owner the page queues gives meta.ownerBefore", { all, withMeta: sites.filter((m) => m[1]).length });

    console.log("\n-- away and back in one Save --");
    const back = await save([paint(16, "ENG", "FRA"), paint(16, "FRA", "ENG")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/Saved 2 changes/.test(back), "THE CONTROL: the Save sent both writes", back.slice(0, 200));
    ok(!/was FRA's CAPITAL/.test(back), "⭐⭐⭐ the line warns of no capital lost: FRA holds 16 again", back.slice(0, 600));
    ok(!/owned by ENG, which now loses it/.test(back), "⭐⭐ …nor of ENG losing a state it got in this Save", back.slice(0, 600));

    console.log("\n-- THE CONTROLS: a paint away, and a paint on through a third country --");
    const away = await save([paint(16, "ENG", "FRA")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }]);
    ok(/State 16 was FRA's CAPITAL/.test(away), "⭐⭐ a paint away still warns of the capital it takes", away.slice(0, 400));
    const on = await save([paint(16, "ENG", "FRA"), paint(16, "GER", "ENG")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/State 16 was FRA's CAPITAL/.test(on) && !/owned by ENG, which now loses it/.test(on), "⭐⭐ FRA → ENG → GER warns of FRA's capital, and not of ENG, which held 16 only in this Save", on.slice(0, 600));
    const again = await save([paint(16, "ENG", "FRA"), paint(16, "FRA", "ENG"), paint(16, "GER", "FRA")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }, { ok: true, changed: true, capitalWarning: lost(16, "FRA") }]);
    ok((again.match(/State 16 was FRA's CAPITAL/g) || []).length === 1, "⭐ away, back, and away again warns once, for the last loss", again.slice(0, 600));
    const other = await save([paint(16, "ENG", "FRA"), paint(16, "FRA", "ENG"), paint(17, "ENG", "FRA")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }, { ok: true, changed: true, capitalWarning: owned(17, "FRA", 16) }]);
    ok(/State 17 was owned by FRA, which now loses it/.test(other) && !/State 16 was FRA's CAPITAL/.test(other), "⭐ another state's paint in the same Save still speaks", other.slice(0, 600));
    const noMeta = await save([paint(16, "ENG"), paint(16, "FRA")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/State 16 was FRA's CAPITAL/.test(noMeta), "…and a write that carries no owner before takes nothing back", noMeta.slice(0, 400));

    // ⛔ (review of B2-16, P3) — THE STATE PANEL'S OWNER IS AN OWNER CHANGE TOO. Painted away and given back with the panel's Owner (a set-state
    // write with fields.owner, which then answered no capitalWarning), the first paint's warning stayed: the B2-16 false alarm through the other owner tool.
    // (Since the final round's L7 a set-state owner change answers the capitalWarning a paint answers, so the canned answers below carry it; the same
    // Saves against a real server: test-the-state-panels-owner-warns-of-a-capital-as-a-paint-does.js.)
    console.log("\n-- the state panel's Owner hands a state back as a paint does --");
    const panel = (sid, owner, ownerBefore) => ({ url: "/api/map/set-state", body: { stateId: sid, nameKey: `STATE_${sid}`, fields: owner ? { owner } : { clearOwner: true } }, meta: ownerBefore === undefined ? {} : { ownerBefore } });
    const viaPanel = await save([paint(16, "ENG", "FRA"), panel(16, "FRA", "ENG")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/Saved 2 changes/.test(viaPanel) && !/was FRA's CAPITAL/.test(viaPanel) && !/owned by ENG, which now loses it/.test(viaPanel), "⭐⭐⭐ painted away, then given back with the state panel's Owner: no capital lost", viaPanel.slice(0, 600));
    const panelFirst = await save([panel(16, "ENG", "FRA"), paint(16, "FRA", "ENG")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/Saved 2 changes/.test(panelFirst) && !/owned by ENG, which now loses it/.test(panelFirst) && !/was FRA's CAPITAL/.test(panelFirst), "⭐⭐ given away with the panel, painted back: ENG, which held it only in this Save, is not said to lose it, and the panel's own warning is taken back", panelFirst.slice(0, 600));
    const panelOn = await save([paint(16, "ENG", "FRA"), panel(16, "GER", "ENG")], [{ ok: true, changed: true, capitalWarning: lost(16, "FRA") }, { ok: true, changed: true, capitalWarning: owned(16, "ENG", 126) }]);
    ok(/State 16 was FRA's CAPITAL/.test(panelOn), "THE CONTROL: painted away and passed on with the panel to a third country, FRA's capital is still said lost", panelOn.slice(0, 400));
    // …and the panel's own Save state queues that change with the owner it showed. RUN: the page's stageStateWrite, lifted by
    // testlib-state-panel-page.js, on its small world (state 5 = [9, 13], owned by AAA), the panel's Owner set to BBB.
    {
      const os = require("os");
      const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-panel-owner-"));
      process.env.APPDATA = process.env.NOVA_APP_DATA_DIR = process.env.XDG_CONFIG_HOME = path.join(ROOT, "appdata");
      process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
      fs.mkdirSync(process.env.APPDATA, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
      const md = require("./map-data.js"), L = require("./testlib-state-panel-page.js");
      const roots = L.makeWorld(ROOT, "w");
      const pg = L.openPage(md, roots, md.buildMapModel({ ...roots, cacheStableLayers: false }));
      pg.inspect(9);
      ok(pg.$("miOwnerSel").value === "AAA", "THE CONTROL: the panel shows state 5's owner, AAA", pg.$("miOwnerSel").value);
      pg.$("miOwnerSel").value = "BBB"; pg.saveStateButton();
      const sw = pg.queue().filter((w) => w.url === "/api/map/set-state").pop();
      ok(!!sw && !!sw.body.fields && sw.body.fields.owner === "BBB" && JSON.stringify(Object.keys(sw.body)) === JSON.stringify(["stateId", "nameKey", "fields"]),
        "THE CONTROL: Save state queues the owner change, and the request is still { stateId, nameKey, fields }", sw);
      ok(!!sw && !!sw.meta && sw.meta.ownerBefore === "AAA", "⭐ …with the owner the panel showed (meta.ownerBefore), as a paint gives the one it saw", sw && sw.meta);
    }
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e));
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
})();
