// 🌍 A world generated AGAIN on the same mod (the confirm's 🎲 New seed, typed GENERATE) overwrites or deletes the mod's whole world —
// and every one of those files has a byte-identical copy under ~/.nova, where the page says the copies are.
// #a-re-rolled-world-keeps-a-copy-of-everything-it-overwrites (review-safety of the world run)
//
// Each step copies what it overwrites into its own backup scope (new_worlds, blanked_maps, generate_land, auto_fixes,
// region_rebuilds). Measured on the real game (review-safety measure-copies.js, a seed-2 re-roll of a seed-1 world): 1,783 files
// changed or deleted, 1,773 with a copy — and the 10 without were localisation/*/replace/nova_region_names_l_*.yml. 🗺 Redraw
// regions writes the region names in server.js AFTER rebuildStrategicRegions has closed its scope (writeRegionNames), so they reach
// only the rolling 200-file pool, which a world's thousands of writes flush; Generate land's route writes its state names INSIDE its
// scope through generateLandInBackupScope's `then` (#generate-land-evicted-its-own-backups) — the fix next door. Those files carry
// the names a modder gave regions in the map editor (map-setRegionName writes them).
//
// Derived, not typed: the files are whatever the second run changed or deleted; the copies are whatever it added under ~/.nova.
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
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-reroll-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const { createApp } = require("./server.js");
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const walk = (d, out = new Map(), base = d) => {
  let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out, base); else if (e.isFile()) out.set(path.relative(base, p).replace(/\\/g, "/"), p); }
  return out;
};

(async () => {
  const server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const runWorld = async (body) => {
    const s = await call("POST", "/api/map/world-run", body);
    if (!s.body || !s.body.ok) return { start: s };
    for (let i = 0; i < 1500; i++) {
      const g = await call("GET", "/api/map/world-run?answers=1");
      const r = g.body && g.body.run;
      if (r && r.state !== "running" && r.state !== "finishing") return { start: s, run: r };
      await new Promise((x) => setTimeout(x, 200));
    }
    return { start: s, run: null };
  };
  try {
    const mod = (await call("POST", "/api/mod/create", { modName: "Reroll World" })).body.modRoot;
    const first = await runWorld({ modPath: mod, confirm: true, landShare: 35, seed: 1, ownerMode: "inherit", owner: "" });
    rec("THE CONTROL: the first world was built", first.run && first.run.state === "done", first.run ? { state: first.run.state, error: first.run.error } : first.start);
    const before = new Map([...walk(mod)].map(([rel, p]) => [rel, sha(p)]));
    const novaBefore = new Set(walk(path.join(DIRS.home, ".nova")).keys());
    rec("THE CONTROL: the first world wrote region names (the file family the gap is in)", [...before.keys()].some((k) => /nova_region_names_l_/.test(k)), [...before.keys()].filter((k) => /localisation/.test(k)));
    const second = await runWorld({ modPath: mod, confirm: true, replacesOwnWorld: true, landShare: 35, seed: 2, ownerMode: "inherit", owner: "" });
    rec("THE CONTROL: the re-roll was built", second.run && second.run.state === "done", second.run ? { state: second.run.state, error: second.run.error } : second.start);
    const after = new Map([...walk(mod)].map(([rel, p]) => [rel, sha(p)]));
    const touched = [...before.keys()].filter((k) => after.get(k) !== before.get(k));
    rec("THE CONTROL: the re-roll overwrote or deleted files of the first world", touched.length > 20, touched.length);
    const copies = new Set([...walk(path.join(DIRS.home, ".nova"))].filter(([rel]) => !novaBefore.has(rel)).map(([, p]) => sha(p)));
    const uncovered = touched.filter((k) => !copies.has(before.get(k)));
    rec(`⭐⭐⭐ every one of the ${touched.length} files the re-roll overwrote or deleted has a byte-identical copy under ~/.nova`, uncovered.length === 0, uncovered);
  } catch (e) {
    rec("the test ran to the end", false, e && e.stack);
  } finally {
    server.close();
    try { server.closeAllConnections(); } catch (_) {}
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
