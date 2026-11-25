// ⛔ #capital-taken-from-owner (final round, L7) — THE STATE PANEL'S OWNER SAYS WHAT 🖌 PAINT SAYS WHEN IT HANDS A COUNTRY'S CAPITAL AWAY.
//
// THE DEFECT. Two tools change a state's owner: 🖌 Paint (POST /api/map/set-owner) and the state panel's Owner (POST /api/map/set-state with
// fields.owner, or fields.clearOwner for "— none —"). Only set-owner asked capitalTransferWarning. Measured 2026-11-20 on vanilla add-ons
// (probe-L7): painting state 16 to ENG answered "State 16 was FRA's CAPITAL. HOI4 refuses a capital a country does not own …"; the panel's
// ENG, and its none, answered no capitalWarning at all, and the Save line said nothing. Now set-state asks the same helper before its write
// when it changes an owner, and answers the same key.
//
// AND THE TAKE-BACK STILL HOLDS (review of B2-16, P3, d4753b18). The page's Save line keeps only a state's FIRST owner write's warning in one
// Save and takes it back out when a later one hands the state back (#a-paint-taken-back-says-no-capital-lost). It was built on canned answers
// in which the panel said nothing; here the page's own flushMapSaves runs against the real server, so the panel's new warning goes through
// that trail, and a state handed away and back with any mix of the two tools leaves no warning and no copy in the mod
// (#a-change-taken-back-leaves-no-copy).
//
// Driven through the endpoints with what the page sends (queueWrite's bodies, flushMapSaves' Object.assign({}, w.body, { modPath }) and its
// X-Nova-Map-Save header), on testlib-two-layer-map.js's small game (states 1 = { 4 }, 2 = { 2 5 }, 3 = { 3 }, all AAA's), each mod giving
// AAA its capital, state 3, in its own history/countries/AAA - A.txt.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("panel-owner-capital");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");
const MAP = T.MAP, MASKED = T.MASKED;
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }"), MARK = grab("function markSaveBoundary", "\n  }"), NOTE = grab("function blankAdjacencyNote", "\n  }");
const HELPERS = ["function firstLandNote", "function adoptFirstLand", "function capitalTownNotes", "function adoptCapitalTown"].map((n) => grab(n, "\n  }"));
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

const newMod = (name) => world.mod(name, { "history/countries/AAA - A.txt": "capital = 3\n" });
const has = (mod, f) => fs.existsSync(path.join(mod, "history", "states", f));

(async () => {
  let srv = null;
  try {
    console.log("0. What the page sends, and what its Save reads");
    rec("THE CONTROL: the panel's Save state queues set-state { stateId, nameKey, fields } and gives an owner change the owner it showed",
      /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\);/.test(MASKED) && /if \(fields\.owner \|\| fields\.clearOwner\) pendingWrites\[pendingWrites\.length - 1\]\.meta\.ownerBefore = String\(shown\.owner \|\| ""\);/.test(MASKED));
    rec("THE CONTROL: …its Owner is fields.owner, or fields.clearOwner for “— none —”", /if \(now\.owner !== shown\.owner\) \{ if \(now\.owner\) fields\.owner = now\.owner; else fields\.clearOwner = true; \}/.test(MASKED));
    rec("THE CONTROL: 🖌 Paint queues set-owner { stateId, owner } with the owner the click saw", /queueWrite\("\/api\/map\/set-owner", \{ stateId: sid, owner: tag \}, \{ ownerBefore:/.test(MASKED));
    rec("THE CONTROL: flushMapSaves reads every write's capitalWarning, and counts a set-state owner write in its owner trail",
      /const capW = res\.capitalWarning \? String\(res\.capitalWarning\) : "";/.test(MASKED) && /const panelOwner = w\.url === "\/api\/map\/set-state" && body\.fields && \(body\.fields\.owner \|\| body\.fields\.clearOwner\)/.test(MASKED));
    rec("THE CONTROL: flushMapSaves, mapCrashGate and markSaveBoundary were lifted", FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80, [FLUSH.length, GATE.length, MARK.length]);

    srv = await lib.startServer(createApp);
    let n = 0;
    const newSave = () => `panelcap${++n}${Date.now().toString(36)}`;
    const send = (save, ep, body, mod) => fetch(`${srv.base}${ep}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": save },
      body: JSON.stringify(Object.assign({}, body, { modPath: mod })),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const paintOne = (mod, stateId, owner) => send(newSave(), "/api/map/set-owner", { stateId, owner }, mod);
    const panelOne = (mod, stateId, fields) => send(newSave(), "/api/map/set-state", { stateId, nameKey: `STATE_${stateId}`, fields }, mod);
    const cw = (r) => (r && r.body && "capitalWarning" in r.body ? String(r.body.capitalWarning) : null);

    console.log("\n1. ⭐⭐⭐ The panel's answer carries the warning a paint's does");
    {
      const p = await paintOne(newMod("paint 3"), 3, "BBB");
      const q = await panelOne(newMod("panel 3"), 3, { owner: "BBB" });
      rec("THE CONTROL: painting AAA's capital, state 3, to BBB says it was AAA's capital", p.status === 200 && /^State 3 was AAA's CAPITAL\. HOI4 refuses a capital a country does not own/.test(cw(p) || ""), p.body);
      rec("⭐⭐⭐ the panel's Owner BBB on state 3 says it too", q.status === 200 && q.body.ok && /^State 3 was AAA's CAPITAL\./.test(cw(q) || ""), q.body);
      rec("⭐⭐ …in the same words as the paint", !!cw(q) && cw(q) === cw(p), [cw(q), cw(p)]);
      const c = await panelOne(newMod("panel clear 3"), 3, { clearOwner: true });
      rec("⭐⭐ the panel's “— none —” on state 3 says it was AAA's capital", c.status === 200 && c.body.ok && /^State 3 was AAA's CAPITAL\. HOI4 refuses a capital a country does not own/.test(cw(c) || ""), c.body);
      const p1 = await paintOne(newMod("paint 1"), 1, "BBB"), q1 = await panelOne(newMod("panel 1"), 1, { owner: "BBB" });
      rec("⭐ a state that is not the capital: “only a territory change”, as the paint says", /^State 1 was owned by AAA, which now loses it\. AAA keeps its own capital \(state 3\)/.test(cw(q1) || "") && cw(q1) === cw(p1), [cw(q1), cw(p1)]);
      const m = await panelOne(newMod("panel manpower"), 1, { manpower: 5000 });
      rec("THE CONTROL: a panel save that changes no owner answers no capitalWarning", m.status === 200 && m.body.ok && cw(m) === null, m.body);
      const x = await panelOne(newMod("panel missing"), 99, { owner: "BBB" });
      rec("THE CONTROL: a write that did not land (no state 99) says nothing about a capital", x.status === 400 && cw(x) === null, x);
      const only = newMod("panel only state");
      const s1 = newSave();
      await send(s1, "/api/map/set-state", { stateId: 1, nameKey: "STATE_1", fields: { owner: "CCC" } }, only);
      await send(s1, "/api/map/set-state", { stateId: 2, nameKey: "STATE_2", fields: { owner: "CCC" } }, only);
      const o = await panelOne(only, 3, { clearOwner: true });
      rec("⭐ AAA's last state cleared: it says AAA no longer exists, and its words fit a state that is now nobody's",
        /^State 3 was AAA's CAPITAL — and its only state\./.test(cw(o) || "") && /pointing at a state it no longer owns is harmless/.test(cw(o) || "") && !/somebody else's/.test(cw(o) || ""), o.body);
    }

    console.log("\n2. ⭐⭐⭐ The Save line: the page's own flushMapSaves against this server");
    /** flushMapSaves itself on `writes`, every write posted to the server as the page posts it; the map check after it stood in for
     *  (as test-a-paint-taken-back-says-no-capital-lost.js does). Returns the Save's last line. */
    async function save(mod, writes) {
      let status = "";
      const sb = {
        console, JSON, encodeURIComponent,
        pendingWrites: writes.slice(), paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] }, provinceToOwner: {},
        stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
        orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
        stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels },
        fetch: async (url, opts) => {
          const u = String(url).split("?")[0];
          if (u === "/api/map/validate") return { ok: true, status: 200, json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }), clone() { return this; } };
          const r = await fetch(srv.base + String(url), opts);
          const j = await r.json().catch(() => ({}));
          return { ok: r.ok, status: r.status, json: async () => j, clone() { return this; } };
        },
      };
      sb.globalThis = sb;
      vm.createContext(sb);
      vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${HELPERS.join("\n")}\n${FLUSH}\nglobalThis.__run = flushMapSaves;`, sb);
      await sb.__run();
      return status;
    }
    const paint = (sid, owner, ownerBefore) => ({ url: "/api/map/set-owner", body: { stateId: sid, owner }, meta: { ownerBefore } });
    const panel = (sid, owner, ownerBefore) => ({ url: "/api/map/set-state", body: { stateId: sid, nameKey: `STATE_${sid}`, fields: owner ? { owner } : { clearOwner: true } }, meta: { ownerBefore } });
    {
      const mod = newMod("save panel away");
      const line = await save(mod, [panel(3, "BBB", "AAA")]);
      rec("⭐⭐⭐ the panel's Owner hands AAA's capital away: the Save line says so", /Saved 1 change/.test(line) && /State 3 was AAA's CAPITAL/.test(line), line.slice(0, 600));
    }
    {
      const mod = newMod("save panel none");
      const line = await save(mod, [panel(3, "", "AAA")]);
      rec("⭐⭐ …and its “— none —” does too", /Saved 1 change/.test(line) && /State 3 was AAA's CAPITAL/.test(line), line.slice(0, 600));
    }
    {
      const mod = newMod("save paint then panel back");
      const line = await save(mod, [paint(3, "BBB", "AAA"), panel(3, "AAA", "BBB")]);
      rec("⭐⭐⭐ painted away, given back with the panel, in one Save: no capital lost, and BBB is not said to lose it", /Saved 2 changes/.test(line) && !/AAA's CAPITAL/.test(line) && !/owned by BBB/.test(line), line.slice(0, 600));
      rec("⭐⭐ …and the mod keeps no copy of 3-C.txt", !has(mod, "3-C.txt"), Object.keys(lib.tree(mod)));
    }
    {
      const mod = newMod("save panel then paint back");
      const line = await save(mod, [panel(3, "BBB", "AAA"), paint(3, "AAA", "BBB")]);
      rec("⭐⭐⭐ given away with the panel, painted back: the panel's warning is taken back out", /Saved 2 changes/.test(line) && !/AAA's CAPITAL/.test(line) && !/owned by BBB/.test(line), line.slice(0, 600));
      rec("⭐⭐ …and the mod keeps no copy of 3-C.txt", !has(mod, "3-C.txt"), Object.keys(lib.tree(mod)));
    }
    {
      const mod = newMod("save panel away and back");
      const line = await save(mod, [panel(3, "BBB", "AAA"), panel(3, "AAA", "BBB")]);
      rec("⭐⭐ away and back with the panel alone: no warning, no copy", /Saved 2 changes/.test(line) && !/AAA's CAPITAL/.test(line) && !has(mod, "3-C.txt"), line.slice(0, 600));
    }
    {
      const mod = newMod("save paint then panel on");
      const line = await save(mod, [paint(3, "BBB", "AAA"), panel(3, "CCC", "BBB")]);
      rec("THE CONTROL: painted away and passed on with the panel to a third country, AAA's capital is still said lost (once)",
        /State 3 was AAA's CAPITAL/.test(line) && (line.match(/AAA's CAPITAL/g) || []).length === 1 && has(mod, "3-C.txt"), line.slice(0, 600));
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== the state panel's owner warns of a capital as a paint does: ${checks - fails.length}/${checks} ===`);
    if (fails.length) fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length || checks < 21 ? 1 : 0;
  }
})();
