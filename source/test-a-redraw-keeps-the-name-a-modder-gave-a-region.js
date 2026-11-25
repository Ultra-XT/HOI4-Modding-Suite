// ⛔ #a-redraw-keeps-the-modders-names — REDRAW STRATEGIC REGIONS KEEPS THE NAME KEY A MODDER GAVE A REGION.
//
// The redraw picks a name key for every region it plans — the key of the base region it lies over, or NOVA_REGION_<id> when
// it is named after a state Nova named — and splices that key over the block's `name=`. It never looked at the key the
// block already had. So, found by a read-only audit of the parked map findings (09-29) and confirmed in map-data.js:
//   · N1: a modder types a name for a region through ✎ Rename (it lands under the region's base key, STRATEGICREGION_3), then
//     renames a state in it through the state panel. The next redraw names that region after the state, re-keys it
//     NOVA_REGION_3, and the name they typed is left under a key nothing uses.
//   · A key the modder wrote in their own region file (`name = "MY_EAST_SEA"`, with a line in their own localisation) is
//     replaced by the base region's, and their name stops showing — whether or not they gave the key a line at all.
// server.js already knew whose a key is (regionNamePlan's `theirs`, which keeps the modder's names from being REWRITTEN);
// the planner that picks the key was never asked. Now a region that stays where it was keeps a key that is the modder's.
//
// Driven through the endpoints with the bodies public/map.js sends. The control: a region whose states are named the same
// way but whose name the modder never touched IS re-keyed — the flip is live, and only the modder's name stops it.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

// The base game's states stood ELSEWHERE, as a generated world's did: a renamed state flips its region only on new land
// (#a-renamed-state-keeps-its-regions-name), and in the default world the base game's state 1 covers continent A, so the
// CONTROL below would see no flip to stop.
const G = makeRegionWorld("keepname", { baseLoc: true, baseStates: "elsewhere" });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

// The body the Redraw dialog's confirm button sends, read out of public/map.js.
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
rec("(the dialog's request body was found in public/map.js)", /confirm:\s*true/.test(bodyText), bodyText);
const redrawBody = vm.runInNewContext("(" + bodyText + ")", { modPath: () => G.MOD });
// …and the two renames, as queueWrite sends them (the flush adds modPath)
rec("(the page renames a region as { nameKey, name } and a state as { stateId, nameKey, fields })",
  /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MASKED) && /queueWrite\("\/api\/map\/set-state", \{ stateId: sid, nameKey, fields \}\)/.test(MASKED), null);

const md = require("./map-data.js");
const { createApp } = require("./server.js");
const roots = { modRoot: G.MOD, gameRoot: G.GAME, dependencyRoots: [] };
const REG_DIR = path.join(G.MOD, "map", "strategicregions");
const keyOf = (id) => {
  for (const f of fs.readdirSync(REG_DIR)) {
    const text = fs.readFileSync(path.join(REG_DIR, f), "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (b) { const m = /\bname\s*=\s*"?([A-Za-z0-9_.]+)"?/.exec(text.slice(b.start, b.end)); return m ? m[1] : ""; }
  }
  return "";
};
// Give region `id`'s block in the mod the name key `key`, as a modder editing their own region file would.
const setBlockKey = (id, key) => {
  for (const f of fs.readdirSync(REG_DIR)) {
    const abs = path.join(REG_DIR, f);
    const text = fs.readFileSync(abs, "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (!b) continue;
    const block = text.slice(b.start, b.end);
    const next = /\bname\s*=/.test(block) ? block.replace(/\bname\s*=\s*"?[A-Za-z0-9_.]+"?/, () => `name="${key}"`) : block.replace(/\bid\s*=\s*\d+/, (m) => `${m}\n\tname="${key}"`);
    fs.writeFileSync(abs, text.slice(0, b.start) + next + text.slice(b.end));
    return true;
  }
  return false;
};
const sha = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");

(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));

    // ── 1. the first redraw: continent A is one land region, named by the base game's key for the region it lies over ──
    const r1 = await post("/api/map/rebuild-regions", redrawBody);
    rec("(the first redraw is written)", r1.status === 200 && r1.body.ok === true, r1.body);
    let m = md.buildMapModel(roots);
    const N = m.provinceToRegion[G.idAt(4, 0)];
    const E = m.provinceToRegion[G.idAt(14, 0)], Wst = m.provinceToRegion[G.idAt(7, 0)];
    rec("(precondition: continent A's region is named by the base game's key)", N != null && keyOf(N) === "STRATEGICREGION_3", { N, key: keyOf(N) });
    rec("(precondition: the east and west seas are regions of their own)", E != null && Wst != null && new Set([N, E, Wst]).size === 3, { N, E, Wst });

    // The CONTROL: a copy of the mod as it stands now, given the same state renames but no region rename.
    const CTRL = path.join(path.dirname(G.MOD), "control");
    fs.cpSync(G.MOD, CTRL, { recursive: true });
    fs.writeFileSync(path.join(CTRL, "descriptor.mod"), fs.readFileSync(path.join(G.MOD, "descriptor.mod"), "utf8").replace(/name="[^"]*"/, 'name="Control"'));

    // ── 2. the modder names the region through ✎ Rename, then renames its states in the state panel ──
    const rn = await post("/api/map/set-region-name", { modPath: G.MOD, nameKey: keyOf(N), name: "My Northland" });
    rec("(the region rename is written)", rn.status === 200 && rn.body.renamed, rn.body);
    const statesIn = (rid) => [...new Set(m.strategicRegions.find((r) => r.id === rid).provinces.map((p) => m.provinceToState[p]).filter((s) => s != null))];
    const renameStates = async (mod) => {
      const named = [];
      for (const sid of statesIn(N)) {
        const st = m.states.find((s) => s.id === sid);
        const r = await post("/api/map/set-state", { modPath: mod, stateId: sid, nameKey: st.name, fields: { displayName: `Town ${sid}` } });
        if (r.status === 200 && r.body.renamed) named.push(sid);
      }
      return named;
    };
    const named = await renameStates(G.MOD), namedCtrl = await renameStates(CTRL);
    rec("(every state of the region is renamed through the state panel, in the mod and in the control)", named.length === statesIn(N).length && named.length >= 2 && namedCtrl.length === named.length, { named, namedCtrl });

    // ── 3. …and writes two keys of their own into their own region file: one with a line in their own localisation, one with none ──
    rec("(the modder's own keys are written into the blocks)", setBlockKey(E, "MY_EAST_SEA") && setBlockKey(Wst, "MY_WEST_SEA"), null);
    const ownLoc = path.join(G.MOD, "localisation", "english", "my_regions_l_english.yml");
    fs.mkdirSync(path.dirname(ownLoc), { recursive: true });
    fs.writeFileSync(ownLoc, "﻿l_english:\n MY_EAST_SEA:0 \"The Modder's Sea\"\n");
    const ownLocHash = sha(ownLoc);

    // ── 4. redraw again ──
    const r2 = await post("/api/map/rebuild-regions", redrawBody);
    rec("(the second redraw is written)", r2.status === 200 && r2.body.ok === true, r2.body);
    m = md.buildMapModel(roots);
    rec("(the regions stayed where they were: the same ids hold the same provinces)",
      m.provinceToRegion[G.idAt(4, 0)] === N && m.provinceToRegion[G.idAt(14, 0)] === E && m.provinceToRegion[G.idAt(7, 0)] === Wst, null);
    const rc = await post("/api/map/rebuild-regions", Object.assign({}, redrawBody, { modPath: CTRL }));
    const ctrlKey = (() => {
      for (const f of fs.readdirSync(path.join(CTRL, "map", "strategicregions"))) {
        const text = fs.readFileSync(path.join(CTRL, "map", "strategicregions", f), "utf8");
        const b = md.strategicRegionBlocksIn(text).find((x) => x.id === N);
        if (b) { const mm = /\bname\s*=\s*"?([A-Za-z0-9_.]+)"?/.exec(text.slice(b.start, b.end)); return mm ? mm[1] : ""; }
      }
      return "";
    })();
    rec("⭐ CONTROL: in the copy whose states were renamed the same way but whose region the modder never named, the region IS re-keyed after them",
      rc.status === 200 && rc.body.ok === true && ctrlKey === `NOVA_REGION_${N}`, { ok: rc.body.ok, ctrlKey });
    rec("⭐⭐⭐ N1: the north keeps the key the modder typed a name under", keyOf(N) === "STRATEGICREGION_3", keyOf(N));
    const novaEn = path.join(G.MOD, "localisation", "english", "replace", "nova_region_names_l_english.yml");
    const novaText = fs.existsSync(novaEn) ? fs.readFileSync(novaEn, "utf8") : "";
    rec("⭐⭐ …and that key still holds the name they typed", /^[ \t]*STRATEGICREGION_3:\d*[ \t]*"My Northland"/m.test(novaText), novaText.slice(0, 400));
    rec("⭐⭐⭐ a key the modder wrote into their own region file is kept", keyOf(E) === "MY_EAST_SEA", keyOf(E));
    rec("⭐⭐ …and so is one they made up with no line anywhere (the game shows a key it cannot resolve as the key: still theirs)", keyOf(Wst) === "MY_WEST_SEA", keyOf(Wst));
    rec("the modder's own localisation file is not touched", sha(ownLoc) === ownLocHash, null);
    // A kept key the modder named is theirs to name: Nova writes no line of its own for it.
    rec("⭐⭐ Nova writes no line of its own for a kept key the modder named", !/^[ \t]*MY_EAST_SEA:/m.test(novaText), novaText.slice(0, 400));
    // …but one that NOTHING names showed its raw key in game for good, and the dialog never said so (review of the keep): it is
    // named in Nova's file, under the key the modder chose. The third redraw below finds it named and leaves it.
    rec("⭐⭐ a kept key nothing names is given a name in Nova's file, and stays the modder's key",
      /^[ \t]*MY_WEST_SEA:\d*[ \t]*"[^"]+"/m.test(novaText) && keyOf(Wst) === "MY_WEST_SEA", novaText.slice(0, 400));

    // ── 5. a third redraw has nothing left to change ──
    const r3 = await post("/api/map/rebuild-regions", Object.assign({}, redrawBody, { dryRun: true, confirm: undefined }));
    rec("a third redraw has nothing to write (the kept keys are what it plans)", r3.status === 200 && r3.body.summary && r3.body.summary.nothingToWrite === true, r3.body.summary);

    // ── 6. a key stays with its region only while the region stays where it was ──
    // Swap the two seas' province lists in the mod's blocks: the block keyed MY_EAST_SEA now holds the west sea's water. The
    // redraw puts each sea back under the id of the base region it lies over, so neither id is where it was, and neither key
    // may stick to the other sea.
    const provsOf = (id) => m.strategicRegions.find((r) => r.id === id).provinces.slice();
    const eastProvs = provsOf(E), westProvs = provsOf(Wst);
    const setBlockProvinces = (id, provs) => {
      for (const f of fs.readdirSync(REG_DIR)) {
        const abs = path.join(REG_DIR, f);
        const text = fs.readFileSync(abs, "utf8");
        const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
        if (!b) continue;
        fs.writeFileSync(abs, text.slice(0, b.start) + text.slice(b.start, b.end).replace(/provinces\s*=\s*\{[^}]*\}/, () => `provinces={ ${provs.join(" ")} }`) + text.slice(b.end));
        return true;
      }
      return false;
    };
    rec("(the two seas' provinces are swapped in the mod's blocks)", setBlockProvinces(E, westProvs) && setBlockProvinces(Wst, eastProvs), null);
    const r4 = await post("/api/map/rebuild-regions", redrawBody);
    rec("(the redraw after the swap is written)", r4.status === 200 && r4.body.ok === true, r4.body);
    m = md.buildMapModel(roots);
    rec("(each sea is back under its own id)", m.provinceToRegion[G.idAt(14, 0)] === E && m.provinceToRegion[G.idAt(7, 0)] === Wst, null);
    rec("⭐⭐ a key does not stay with an id whose region moved away: neither sea keeps the key that sat on the other's water",
      keyOf(E) !== "MY_EAST_SEA" && keyOf(Wst) !== "MY_WEST_SEA", { east: keyOf(E), west: keyOf(Wst) });

    // ── 7. one key on two blocks is kept by neither: two live regions would show one name ──
    rec("(both seas' blocks are given the same key)", setBlockKey(E, "MY_ONE_SEA") && setBlockKey(Wst, "MY_ONE_SEA"), null);
    const r5 = await post("/api/map/rebuild-regions", redrawBody);
    rec("(the redraw is written)", r5.status === 200 && r5.body.ok === true, r5.body);
    rec("⭐ a key two blocks share is not kept by both", !(keyOf(E) === "MY_ONE_SEA" && keyOf(Wst) === "MY_ONE_SEA"), { east: keyOf(E), west: keyOf(Wst) });
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
