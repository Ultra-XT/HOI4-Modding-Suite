// Mod Health's crash-check fix buttons say WHERE the copies they took went. #a-recovery-copy-nobody-is-told-about
//
// THE DEFECT. #f25 gave the Map editor's "🔧 Auto-fix all" that sentence, and its own comment recorded that the two
// buttons Mod Health's "Will it crash?" card carries of its own were left out. They were:
//   "🔧 Fix duplicate states" -> POST /api/map/fix-duplicate-states -> mapData.fixDuplicateStateFiles
//   "🔧 Fix region overlaps"  -> POST /api/map/repair-region-overlaps -> mapData.repairRegionOverlaps
// Each opens a backup scope of its own (#a-bulk-map-click-evicted-its-own-backups, because a real mod's duplicates
// overrun the 200-file pool on their own) and hands the folder back on the click's own answer.
//
// 📊 MEASURED 2026-09-17 by clicking both on the real page, at http://127.0.0.1:54100/modhealth.html, against a real
// server and a scratch mod with 12 duplicated state ids and 12 states split across two strategic regions:
//   fix-duplicate-states  -> { removed: 12, keptIds: […], unresolved: [],
//                              backupSnapshot: { dir: "…/.nova/auto_fixes/fixmod_…/2026-09-17T12-01-44-416Z", files: 12, failed: 0 } }
//        the panel said, in full: "Removed 12 stray duplicate block(s)."
//   repair-region-overlaps -> { statesAligned: 12, provincesMoved: 21, doubleMembershipFixed: 20,
//                              backupSnapshot: { dir: "…/2026-09-17T12-01-58-386Z", files: 12, failed: 0 } }
//        the panel said: "Aligned 12 split state(s) to a single strategic region (moved 21 province(s) …)."
// Twelve state files removed and twelve region files rewritten, a folder outside the mod holding every one of them
// exactly as it was, and neither sentence named it — which is what map-data.js's own `finally` comment calls "only
// marginally better than none".
//
// WHAT THIS PINS, and why it is not a source-shape check. The REAL public/modhealth-crashcheck.js is executed in a
// sandbox that stands in for the browser, over a REAL in-process server and a REAL mod on disk: the card renders, the
// button is offered only because the validator really reported the rule, the click really posts, map-data really
// removes files and really takes copies, and this test reads the sentence the modder is left with. The wording is
// DERIVED from Delete map's own note in public/map.js — the same derivation test-auto-fix-says-where-the-copies-went.js
// uses — so the Map editor's summary and this panel cannot drift apart.
//
// THE NEGATIVE CONTROL is the second click: it writes nothing, returns no snapshot, and must claim no folder.
//
// Run: node test-a-mod-health-map-fix-says-where-the-copies-went.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("mh-snapshot-note");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");
const CRASHCHECK = fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8");
const MAP_JS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

const filesUnder = (d, out = []) => {
  let es = [];
  try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) filesUnder(p, out); else out.push(p); }
  return out;
};

/** A fake element that records its listeners — enough for the panel to wire its buttons. */
function element() {
  const listeners = {};
  return {
    style: {}, value: "", disabled: false, textContent: "", innerHTML: "", listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    insertAdjacentHTML(_where, html) { this.innerHTML += html; },
  };
}

/**
 * Run the REAL "Will it crash?" panel against a real server, and return handles to it.
 * Only /api/root, /api/modversion and /api/modhealth/loc-check are stood in for — the map check and both
 * fix endpoints are the server's own, so the buttons are offered for real problems and really repair them.
 */
function mountPanel(base, modPath) {
  const els = {};
  const el = (id) => (els[id] = els[id] || element());
  el("modSelector").value = modPath;
  el("mhCrashCheck");                              // the panel modhealth.html renders the card into
  const posted = [];
  let runFn = null;
  const sandbox = {
    console, JSON, encodeURIComponent, Number, String, Array, Math, Date, Object,
    window: { NovaMapRuleLabels: labels },
    localStorage: { getItem: () => modPath },
    // Every id the panel asks for answers — what makes a button REAL is that the render offered it, which
    // clickOffered checks against the card's own innerHTML before touching anything.
    document: { readyState: "complete", addEventListener() {}, getElementById: (id) => el(id) },
    setTimeout: (fn) => { runFn = fn; return 0; },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.indexOf("/api/root") === 0) return { json: async () => ({ hoi4GameRoot: world.GAME }) };
      if (u.indexOf("/api/modversion") === 0) return { json: async () => ({ ok: true, severity: "ok" }) };
      if (u.indexOf("/api/modhealth/loc-check") === 0) return { json: async () => ({ ok: true, problems: [] }) };
      const res = await fetch(base + u, opts);
      const body = await res.json().catch(() => ({}));
      posted.push({ url: u.split("?")[0], sent: opts && opts.body ? JSON.parse(opts.body) : null, body });
      return { ok: res.ok, status: res.status, json: async () => body };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CRASHCHECK, sandbox);
  // The panel only exists once run() has rendered it; els are created lazily as the script asks for them.
  return { els, el, posted, render: async () => { if (typeof runFn === "function") await runFn(); }, panel: () => el("mhCrashCheck") };
}

/** A button is clickable only when the render really offered it — the same rule as a DOM query. */
async function clickOffered(p, id) {
  const offered = new RegExp(`id="${id}"`).test(p.panel().innerHTML);
  const btn = p.els[id];
  if (!offered || !btn || !btn.listeners.click) return { offered, clicked: false };
  await btn.listeners.click[0]();
  return { offered, clicked: true };
}

(async () => {
  let srv;
  try {
    srv = await L2.startServer(createApp);

    // A mod of its own that fires BOTH rules the card has a button for. The game below it ships states 1 = { 4 },
    // 2 = { 2 5 }, 3 = { 3 } and regions 1 = { 1 }, 2 = { 2 3 4 5 }.
    //  · duplicate_state_id: the mod ships its own 2-B.txt AND a 2-restored.txt for the same id, whose only
    //    province (3) is owned by the mod's own state 3 outside the duplicate set — so the stub is redundant and
    //    removable. ⚠️ state 3 has to be one of the MOD's files: fixDuplicateStateFiles reads the mod's own
    //    history/states and nothing below it, so a province held only by the game below is not "owned elsewhere".
    //  · state_split_strategic_regions: the mod ships both region files by their own basenames (a common/ or map/
    //    file replaces the lower one wholesale), moving province 2 into the sea region, so state 2 = { 2 5 } spans two.
    const makeMod = (n) => world.mod("MH Snapshot Note " + n, {
      "history/states/2-B.txt": L2.st(2, "2 5"),
      "history/states/3-C.txt": L2.st(3, "3"),
      "history/states/2-restored.txt": '\ufeffstate = {\r\n\tid = 2\r\n\tname = "STATE_2"\r\n\t# the modder\'s own note, unique: mh-keep-' + n + '\r\n\tprovinces = { 3 }\r\n\thistory = {}\r\n}\r\n',
      "map/strategicregions/1-Sea.txt": L2.region(1, "1 2"),
      "map/strategicregions/2-Land.txt": L2.region(2, "3 4 5"),
    });

    console.log("1. THE CONTROLS: the card really reports both rules, and really offers both buttons");
    const MOD = makeMod(1);
    const v = await srv.validate(MOD);
    const rules = (v.problems || []).map((p) => p.rule);
    rec("the mod really has a duplicate state id", rules.includes("duplicate_state_id"), rules);
    rec("…and a state split across two strategic regions", rules.includes("state_split_strategic_regions"), rules);
    const p1 = mountPanel(srv.base, MOD);
    await p1.render();
    rec("the card rendered", /Will it crash\?/.test(p1.panel().innerHTML), p1.panel().innerHTML.slice(0, 120));
    rec("…and offers 🔧 Fix duplicate states", /id="mhFixDup"/.test(p1.panel().innerHTML));
    rec("…and 🔧 Fix region overlaps", /id="mhFixRegions"/.test(p1.panel().innerHTML));

    console.log("\n2. ⭐⭐⭐ One click on 🔧 Fix duplicate states, and the sentence it leaves behind");
    {
      const victim = fs.readFileSync(path.join(MOD, "history", "states", "2-restored.txt"));
      const r = await clickOffered(p1, "mhFixDup");
      rec("THE CONTROL: the button was offered and clicked", r.offered && r.clicked, r);
      const call = p1.posted.find((q) => q.url === "/api/map/fix-duplicate-states");
      rec("THE CONTROL: it posted the click the page sends, with the mod path", !!call && call.sent && call.sent.modPath === MOD, call && call.sent);
      const snap = call && call.body && call.body.backupSnapshot;
      rec("THE CONTROL: the server removed a declaration and took copies", !!(call && (call.body.removed || []).length) && !!(snap && snap.dir && snap.files),
        { removed: call && (call.body.removed || []).length, snap });
      rec("…and the copy really holds the file as it was",
        !!snap && filesUnder(snap.dir).some((f) => { try { return fs.readFileSync(f).equals(victim); } catch (_) { return false; } }),
        snap && snap.dir);
      const said = p1.panel().innerHTML;
      rec("…the panel still says what it fixed", /Removed 1 stray duplicate block/.test(said.replace(/<[^>]+>/g, " ")), said.replace(/<[^>]+>/g, " ").slice(-200));
      rec("⭐⭐⭐ …and it names the folder the copies went to",
        !!snap && said.indexOf(snap.dir.replace(/&/g, "&amp;").replace(/</g, "&lt;")) !== -1, { dir: snap && snap.dir, tail: said.replace(/<[^>]+>/g, " ").slice(-260) });
      rec("⭐⭐ …with the count, and that the copy came first",
        /\b1 file\b/.test(said) && /saved first/.test(said) && /outside your mod/.test(said), said.replace(/<[^>]+>/g, " ").slice(-260));
      rec("…and the path is kept on its own line", /white-space:pre-wrap/.test(said));
    }

    console.log("\n3. ⭐⭐⭐ One click on 🔧 Fix region overlaps, and the sentence it leaves behind");
    {
      const MOD2 = makeMod(2);
      const regDir = path.join(MOD2, "map", "strategicregions");
      const before = new Map(fs.readdirSync(regDir).map((f) => [f, fs.readFileSync(path.join(regDir, f))]));
      const p2 = mountPanel(srv.base, MOD2);
      await p2.render();
      const r = await clickOffered(p2, "mhFixRegions");
      rec("THE CONTROL: the button was offered and clicked", r.offered && r.clicked, r);
      const call = p2.posted.find((q) => q.url === "/api/map/repair-region-overlaps");
      rec("THE CONTROL: it posted the click the page sends", !!call && call.sent && call.sent.modPath === MOD2, call && call.sent);
      const snap = call && call.body && call.body.backupSnapshot;
      rec("THE CONTROL: the repair rewrote region files and took copies", !!(call && call.body.statesAligned) && !!(snap && snap.dir && snap.files),
        { aligned: call && call.body.statesAligned, snap });
      const rewritten = [...before].filter(([f, bytes]) => { try { return !fs.readFileSync(path.join(regDir, f)).equals(bytes); } catch (_) { return true; } });
      rec("…and every region file it rewrote is in that folder as it STARTED the click",
        rewritten.length > 0 && rewritten.every(([, bytes]) => filesUnder(snap.dir).some((f) => { try { return fs.readFileSync(f).equals(bytes); } catch (_) { return false; } })),
        { rewritten: rewritten.map(([f]) => f), dir: snap && snap.dir });
      const said = p2.panel().innerHTML;
      rec("…the panel still says what it aligned", /Aligned 1 split state/.test(said.replace(/<[^>]+>/g, " ")), said.replace(/<[^>]+>/g, " ").slice(-240));
      rec("⭐⭐⭐ …and it names the folder the copies went to",
        !!snap && said.indexOf(snap.dir.replace(/&/g, "&amp;").replace(/</g, "&lt;")) !== -1, { dir: snap && snap.dir, tail: said.replace(/<[^>]+>/g, " ").slice(-260) });
      rec("⭐⭐ …with the count, and that the copy came first",
        /file[s]?\. A copy of/.test(said) && /saved first/.test(said) && /outside your mod/.test(said), said.replace(/<[^>]+>/g, " ").slice(-260));
    }

    console.log("\n4. ⭐⭐ THE NEGATIVE CONTROL: a click that writes nothing claims no folder");
    {
      const MOD3 = makeMod(3);
      const p3 = mountPanel(srv.base, MOD3);
      await p3.render();
      await clickOffered(p3, "mhFixDup");             // the first click does the work
      const p4 = mountPanel(srv.base, MOD3);
      await p4.render();
      const again = await clickOffered(p4, "mhFixDup");
      if (again.clicked) {
        const call = p4.posted.find((q) => q.url === "/api/map/fix-duplicate-states");
        rec("a second click has nothing left to copy", !(call && call.body && call.body.backupSnapshot), call && call.body && call.body.backupSnapshot);
        rec("⭐⭐ …and the panel says nothing about copies rather than inventing a folder",
          !/saved first/.test(p4.panel().innerHTML) && !/auto_fixes/.test(p4.panel().innerHTML),
          p4.panel().innerHTML.replace(/<[^>]+>/g, " ").slice(-200));
      } else {
        // The duplicate is gone, so the button is not offered at all — which is the same promise, more strongly kept.
        rec("a second click has nothing left to copy", !again.offered, again);
        rec("⭐⭐ …and the panel says nothing about copies rather than inventing a folder",
          !/saved first/.test(p4.panel().innerHTML) && !/auto_fixes/.test(p4.panel().innerHTML),
          p4.panel().innerHTML.replace(/<[^>]+>/g, " ").slice(-200));
      }
    }

    console.log("\n5. ⭐⭐ ONE SENTENCE, NOT TWO — derived from Delete map's own note in public/map.js");
    {
      const note = labels.backupSnapshotNote;
      rec("the shared module exports the sentence both pages use", typeof note === "function");
      // Delete map's note, straight out of public/map.js: the backtick template on the line using res.snapshotPath.
      const delLine = MAP_JS.split(/\r?\n/).find((l) => l.indexOf("res.snapshotPath") !== -1 && l.indexOf("`") !== -1) || "";
      const tpl = (/`([^`]*)`/.exec(delLine) || [])[1] || "";
      const literal = tpl.replace(/\$\{[^}]*\}/g, "").replace(/\\n/g, "\n");
      const at = literal.indexOf("was saved first");
      const shared = at === -1 ? "" : literal.slice(at);
      rec("Delete map's own sentence was derived from public/map.js", shared.length > 30 && shared.indexOf("outside your mod") !== -1, JSON.stringify(shared));
      const many = note({ backupSnapshot: { dir: "C:/somewhere/.nova/auto_fixes/m/stamp", files: 7, failed: 0 } });
      rec("⭐⭐ the shared note uses that same sentence, word for word", many.indexOf(shared) !== -1, many);
      rec("…one file reads as one file", /\b1 file\b/.test(note({ backupSnapshot: { dir: "C:/one", files: 1, failed: 0 } })));
      rec("⭐ a copy that FAILED is named, not counted in", /3 more files could not be copied/.test(note({ backupSnapshot: { dir: "C:/p", files: 2, failed: 3 } })));
      rec("nothing to say when the click wrote nothing", note({}) === "" && note(undefined) === "" && note({ backupSnapshot: { dir: "", files: 0 } }) === "");
      // ⭐⭐ AND THE MAP EDITOR'S OWN HELPER IS THE SAME SENTENCE, RUN. public/map.js keeps the name
      // backupSnapshotNote for its callers and delegates; if anyone re-implements it there, the two drift and this
      // bites. Lifted and executed with the module map.html loads beside it — not read for its shape.
      {
        const masked = MAP_JS.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
        const s = masked.indexOf("\n  function backupSnapshotNote(");
        const eol = MAP_JS.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
        const e = s < 0 ? -1 : masked.indexOf(eol + "  }", s + 1);
        const src = s < 0 || e < 0 ? "" : MAP_JS.slice(s + 1, e + eol.length + 3);
        const sb = { window: { NovaMapRuleLabels: labels } };
        sb.globalThis = sb;
        vm.createContext(sb);
        if (src) vm.runInContext(src, sb);
        const pageFn = typeof sb.backupSnapshotNote === "function" ? sb.backupSnapshotNote : null;
        rec("public/map.js's own helper was lifted and runs", !!pageFn, src.slice(0, 60) || "not found");
        const cases = [
          { backupSnapshot: { dir: "C:/somewhere/.nova/auto_fixes/m/stamp", files: 7, failed: 0 } },
          { backupSnapshot: { dir: "C:/one", files: 1, failed: 0 } },
          { backupSnapshot: { dir: "C:/p", files: 2, failed: 3 } },
          {}, undefined,
        ];
        const same = !!pageFn && cases.every((c) => pageFn(c) === note(c));
        rec("⭐⭐ the Map editor's summary and Mod Health's panel say the SAME sentence, for every shape",
          same, pageFn ? cases.map((c) => [pageFn(c), note(c)]).filter(([a, b]) => a !== b) : "no helper");
      }
      // Derived, so a third button cannot be added without adopting it: every fix handler in the panel that posts
      // to /api/map/ and writes a note must read the snapshot.
      const handlers = (CRASHCHECK.match(/fetch\("\/api\/map\/(?:fix-duplicate-states|repair-region-overlaps)"/g) || []).length;
      const reads = (CRASHCHECK.match(/(?<!function\s)snapshotHtml\(res\)/g) || []).length;
      rec("⭐⭐ every fix button in the panel reads the snapshot (derived from the posts)", handlers > 0 && reads === handlers, { handlers, reads });
      // CSP: this change is script-only, and a Windows path goes into innerHTML, so it must be escaped.
      rec("no inline handler was introduced", !/on(click|error|load)\s*=\s*["']/.test(CRASHCHECK));
      rec("⭐ the path is escaped before it reaches innerHTML", /esc\(note\.trim\(\)\)/.test(CRASHCHECK));
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a Mod Health map fix says where the copies went: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
