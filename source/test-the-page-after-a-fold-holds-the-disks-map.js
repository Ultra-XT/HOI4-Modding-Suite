// ⛔ #delete-map-gives-back-the-cut — THE PAGE'S MAP AFTER A FOLD IS THE DISK'S, ON EVERY WAY OUT OF 💾 SAVE, AND WHAT WAS STAGED ON A
// PROVINCE THE FOLD GAVE BACK DOES NOT WEDGE THE SAVE. Delete map's fold takes the rows, colours and pixels of every piece an earlier
// Generate land cut; the page reloaded its map after a Save that finished (233931d8), and nowhere else. Measured at the owner's scale
// (review of 5a1af33f):
//   K6  unsaved 🪖 Army work: the reload asked "You have unsaved changes that will be discarded if you reload. Continue?", Cancel kept
//       20,218 provinces on the page against 13,414 on disk, and 🌍 Generate land's 35% sent 7,058 — 52.8% of the ocean;
//   K4  a Save that stopped after the fold (the stroke staged with it failed once) skipped the reload, and the next Save (the stroke
//       alone) did not reload either: Generate land sent 7,058 again;
//   K7  the Province inspector's type change on a piece, staged after Delete map: "Province 20217 not found in definition.csv", and
//       every Save after it stopped at step 1 with the same, for good;
//   K5  a stroke in a piece's colour after Delete map: the fold took the piece's row, the paint wrote its colour anyway — a colour with
//       no definition.csv row — and the Save said "✓ Saved 2 changes".
// Pinned on testlib-split-world.js's world through the real endpoints (listen(0)) and the page's own flushMapSaves / mapCrashGate /
// load / buildFromImage and Generate land's count, lifted out of public/map.js as test-delete-map-gives-back-the-cut-provinces.js §9
// lifts them. Every expected count is derived from the disk.
// Run: node test-the-page-after-a-fold-holds-the-disks-map.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-page-after-fold-"));
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const PAGE = require("./testlib-map-page.js");
let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!cond) fails.push(label);
};
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const W = SW.W, H = SW.H;
const S = SW.makeShapes();
const game = path.join(ROOT, "game");
SW.makeGame(game, S, {});
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const mk = (name) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, { name: "page after fold" });
const defOf = (mod) => SW.readDef(path.join(mod, "map", "definition.csv"));
const pageLines = (from, to, args, ret) => {
  const s = PAGE.MASKED.indexOf(from), e = s < 0 ? -1 : PAGE.MASKED.indexOf(to, s);
  if (s < 0 || e < 0) throw new Error(`public/map.js has no "${from}" … "${to}"`);
  return new Function(...args, PAGE.MAP.slice(s, e) + `\nreturn ${ret};`);
};
const flipToSea = pageLines("let flipped = 0;", "provinceToOwner = {};", ["provinceType", "provinceDef"], "flipped");
const genCount = pageLines("let seaCount = 0;", "const ownerTag = ", ["provinceType", "pct"], "count");
const unknownPx = (M) => { const d = defOf(M), ras = SW.decode(path.join(M, "map", "provinces.bmp"), d); let n = 0; for (let i = 0; i < ras.ids.length; i++) if (ras.ids[i] < 0 || ras.ids[i] === undefined) n++; return n; };

(async () => {
  process.env.HOI4_ROOT = game;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const variants = ["plain (control)", "army", "paint-fails-once", "paint-piece", "inspect-piece", "edit-after-stop", "only-edit-after-stop"];
    for (const variant of variants) {
      console.log(`\n-- ${variant} --`);
      const M = mk(variant);
      const g = await fetch(base + "/api/map/generate-land", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: M, count: COUNT, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true }) }).then((r) => r.json());
      const record = md.readProvinceSplitRecord(M), pieces = record.families.flatMap((f) => f.pieces);
      const rootOf = new Map(); for (const f of record.families) for (const q of f.pieces) rootOf.set(q, f.parent);
      rec("(control: the click cut)", g.ok === true && pieces.length > 0, { ok: g.ok, error: g.error, pieces: pieces.length });
      // the page's map as it stood at the Delete map click: the model it loaded after Generate land, every land province flipped to sea
      const seen = await fetch(`${base}/api/map/model?modPath=${encodeURIComponent(M)}`).then((x) => x.json());
      const provinceType = new Map(), provinceDef = new Map(), colorToProvince = new Map();
      for (const p of seen.provinces || []) { provinceType.set(p.id, p.type); provinceDef.set(p.id, p); colorToProvince.set((p.r << 16) | (p.g << 8) | p.b, p.id); }
      flipToSea(provinceType, provinceDef);
      let paintFailures = variant === "paint-fails-once" || variant.endsWith("after-stop") ? 1 : 0;
      const confirms = [], posted = [];
      const piece = Math.max(...pieces);
      const armyModel = { file: "", templates: [], divisions: [{ name: "1. Inf", location: piece, template: "Inf", _dirty: true }, { name: "2. Inf", location: 1, template: "Inf" }] };
      const page = PAGE.runPage([
        ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
        "function markSaveBoundary", "function queueWrite(url, body, meta)",
        ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
        "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
      ], PAGE.loadGlobals({
        console, JSON, Image: PAGE.fakeImageClass({ width: W, height: H }),
        pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] }, provinceType, provinceDef, colorToProvince,
        armyHasUnsaved: () => variant === "army", armyModel,
        window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: (q) => { confirms.push(q); return false; } },
        stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
        undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => M,
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        remapQueuedStateId: () => {}, remapLocalStateId: () => {},
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        fetch: async (url, opts) => {
          posted.push(String(url).split("?")[0]);
          if (String(url) === "/api/map/paint-provinces" && paintFailures > 0) { paintFailures--; throw new Error("Failed to fetch"); }
          return fetch(base + url, opts);
        },
      }));
      const ras = SW.decode(path.join(M, "map", "provinces.bmp"), defOf(M));
      /** a stroke beside a province, in a colour — the brush picked off one of the map's pixels */
      const stroke = (beside, col) => {
        let first = -1; for (let i = 0; i < ras.ids.length; i++) if (ras.ids[i] === beside) { first = i; break; }
        const fx = first % W, fy = (first - fx) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = fx + dx, y = fy + dy; if (x < 0 || y < 0 || x >= W || y >= H || ras.ids[y * W + x] === beside) continue;
          page.sb.paintDiff.set(x + "," + y, { x, y, r: col.r, g: col.g, b: col.b });
        }
      };
      const inspectPiece = () => page.sb.queueWrite("/api/map/set-province-terrain", { provinceId: piece, terrain: "lakes", type: "lake", coastal: false });   // the inspector's own body
      const lastLine = () => String(page.statuses[page.statuses.length - 1] || "");
      page.sb.queueWrite("/api/map/blank-to-sea", {});
      if (variant === "paint-fails-once" || variant === "paint-piece") stroke(piece, provinceDef.get(piece));
      if (variant === "edit-after-stop" || variant === "only-edit-after-stop") stroke(piece, provinceDef.get(rootOf.get(piece)));   // a stroke of a province that stays: the piece's parent
      if (variant === "inspect-piece") inspectPiece();
      await page.sb.flushMapSaves(); await PAGE.settle(150);
      if (variant === "paint-fails-once" || variant.endsWith("after-stop")) {
        rec(`(control: [${variant}] the first Save stopped after the fold, at the stroke)`, /^Province-shape save failed/.test(lastLine()) && page.sb.paintDiff.size > 0, lastLine().slice(0, 160));
        if (variant === "paint-fails-once") {
          const kept = [...page.sb.paintDiff.values()], root = provinceDef.get(rootOf.get(piece));
          rec("⭐⭐ [paint-fails-once] the stroke kept for the next Save paints the province the piece was cut from — the piece's colour has no row now",
            kept.length > 0 && kept.every((px) => px.r === root.r && px.g === root.g && px.b === root.b), { root: [root.r, root.g, root.b], kept: kept.slice(0, 2) });
        }
        if (variant.endsWith("after-stop")) {
          inspectPiece();   // staged on the page's map, which still holds every piece
          if (variant === "only-edit-after-stop") page.sb.paintDiff.clear();   // …the stroke undone, so the edit is all there is
        }
        await page.sb.flushMapSaves(); await PAGE.settle(150);
      }
      if (variant === "inspect-piece" || variant.endsWith("after-stop")) {
        await page.sb.flushMapSaves(); await PAGE.settle(150);   // 💾 Save again: whatever is left in the queue
        const lines = page.statuses.join("\n");
        rec(`⭐⭐⭐ [${variant}] an edit staged on a piece the fold gave back does not wedge the Save: it is dropped, and the line says so`,
          !/^Save stopped/.test(lastLine()) && page.sb.pendingWrites.length === 0 && /Dropped 1 unsaved change made on a province 🗑 Delete map gave back/.test(lines)
          && posted.filter((u) => u === "/api/map/set-province-terrain").length === 0, { last: lastLine().slice(0, 200), pendingLeft: page.sb.pendingWrites.length, terrainPosts: posted.filter((u) => u === "/api/map/set-province-terrain").length });
      }
      const def = defOf(M), diskSea = def.ids.filter((id) => id > 0 && def.rows.get(id).type === "sea").length, want = Math.max(1, Math.round(diskSea * 35 / 100));
      const pt = page.sb.provinceType, count = genCount(pt, 35);
      rec(`⭐⭐⭐ [${variant}] after 💾 Save the page's map is the disk's, and 🌍 Generate land's 35% is 35% of the sea on disk`,
        Math.max(...pt.keys()) === Math.max(...def.ids) && count === want && !page.sb.model.provinceFold, { pageMax: Math.max(...pt.keys()), diskMax: Math.max(...def.ids), count, want, stale: !!page.sb.model.provinceFold });
      if (variant === "army") {
        rec("⭐⭐ [army] the reload after the Save did not ask about the 🪖 Army work, which it keeps (Cancel left the page stale)", confirms.length === 0, confirms);
        rec("⭐ [army] …and the division the army tool stood on a piece stands on the province it was cut from, as the fold moved the mod's own",
          armyModel.divisions[0].location === rootOf.get(piece) && armyModel.divisions[1].location === 1, armyModel.divisions.map((d) => d.location));
      }
      if (variant === "paint-piece" || variant === "paint-fails-once") {
        const v = await fetch(`${base}/api/map/validate?modPath=${encodeURIComponent(M)}`).then((x) => x.json());
        const undef = (v.problems || []).filter((p) => p.rule === "province_color_not_defined");
        rec(`⭐⭐ [${variant}] the stroke wrote no colour without a definition.csv row, and the line said what it did with it`,
          unknownPx(M) === 0 && undef.length === 0 && /painted with a province 🗑 Delete map gave back/.test(page.statuses.join("\n")), { unknownPx: unknownPx(M), undef: undef.length });
      }
      if (variant === "plain (control)") {
        // ⛔ K5's second guard: POST /api/map/paint-provinces refuses a colour no row has, from any client — the piece's, sent as the old
        // page sent it — and writes nothing
        const bmp = path.join(M, "map", "provinces.bmp"), before = sha(bmp), d = provinceDef.get(piece);
        const r = await fetch(base + "/api/map/paint-provinces", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modPath: M, diff: [{ x: 1, y: 1, r: d.r, g: d.g, b: d.b }] }) });
        const b = await r.json().catch(() => ({}));
        rec("⭐⭐ the paint endpoint refuses a colour with no definition.csv row, says why, and writes nothing", r.status === 400 && b.ok === false && /no row in map\/definition\.csv/.test(b.error || "") && sha(bmp) === before, { status: r.status, error: b.error });
        const p1 = provinceDef.get(1);
        const ok = await fetch(base + "/api/map/paint-provinces", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modPath: M, diff: [{ x: 1, y: 1, r: p1.r, g: p1.g, b: p1.b }] }) }).then((x) => x.json());
        rec("(control: …and paints a colour a row has)", ok.ok === true, ok.error);
      }
    }

    console.log("\n-- 🌍 Generate land reads the map again while the page holds the one from before a fold --");
    {
      const s = PAGE.MASKED.indexOf('if (typeof model !== "undefined" && model && model.provinceFold) {'), e = s < 0 ? -1 : PAGE.MASKED.indexOf("let seaCount = 0;", s);
      const at = PAGE.MASKED.indexOf('$("mapGenConfirmBtn").addEventListener("click"'), atEnd = at < 0 ? -1 : PAGE.MASKED.indexOf("const count = Math.max(1, Math.round(seaCount * pct / 100));", at);
      rec("(control: the guard is in the confirm's handler, before the count)", s > at && at > 0 && e > 0 && e < atEnd, { s, at, e, atEnd });
      const run = async (reloads) => {
        const ctx = { model: { provinceFold: { rootOf: new Map([[9, 1]]), from: 9, to: 9 } }, pct: 35, loads: [], statuses: [] };
        ctx.load = async (msg, o) => { ctx.loads.push([msg, o]); if (reloads) ctx.model = { states: [] }; };
        ctx.setStatus = (t) => ctx.statuses.push(t);
        vm.createContext(ctx);
        const r = await vm.runInContext(`(async () => {\n${PAGE.MAP.slice(s, e)}\nreturn "counted";\n})()`, ctx);
        return { r, ctx };
      };
      const a = await run(true), b = await run(false);
      rec("⭐⭐ a stale page reads the map again, not asking about the army work, before it counts the ocean", a.r === "counted" && a.ctx.loads.length === 1 && a.ctx.loads[0][1] && a.ctx.loads[0][1].afterSave === true, a.ctx.loads);
      rec("⭐ …and a read that does not finish runs nothing, and says so", b.r === undefined && b.ctx.loads.length === 1 && /did not run/.test(b.ctx.statuses.join(" ")), b.ctx.statuses);
    }

    console.log("\n-- every field a queued write names a province by is one the fold's clean-up reads --");
    {
      // the bodies public/map.js queues: inline object literals, or a `const body = { … }` it builds first
      const listed = /const PROVINCE_ID_FIELDS = (\[[^\]]*\]), PROVINCE_LIST_FIELDS = (\[[^\]]*\]);/.exec(PAGE.MASKED);
      const fields = listed ? JSON.parse(listed[1]).concat(JSON.parse(listed[2])) : [];
      const keys = new Set();
      const keysOf = (lit) => { for (const part of lit.split(",")) { const k = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part); if (k) keys.add(k[1]); } };
      for (const m of PAGE.MASKED.matchAll(/queueWrite\("\/api\/map\/[a-z-]+",\s*(\{[^{}]*\}|[A-Za-z_$][\w$]*)/g)) {
        if (m[1].startsWith("{")) keysOf(m[1].slice(1, -1));
        else { const decl = [...PAGE.MASKED.slice(0, m.index).matchAll(new RegExp(`const ${m[1]} = \\{([^{}]*)\\}`, "g"))].pop(); if (decl) keysOf(decl[1]); }
      }
      const provincey = [...keys].filter((k) => /province/i.test(k) || ["from", "to", "through"].includes(k));
      rec("(control: the bodies were read — provinceId, from, to and provinces among their keys)", ["provinceId", "from", "to", "provinces"].every((k) => keys.has(k)), [...keys]);
      rec("⭐⭐ every key a queued write names a province by is in the clean-up's lists", provincey.length > 0 && provincey.every((k) => fields.includes(k)), { provincey, fields });
    }
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 900));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
  }
  console.log(`\n=== the page after a fold holds the disk's map: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
