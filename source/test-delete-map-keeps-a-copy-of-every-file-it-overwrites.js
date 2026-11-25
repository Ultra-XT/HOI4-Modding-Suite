// ⛔ #delete-map-keeps-a-copy-of-every-file-it-overwrites — EVERY FILE 🗑 DELETE MAP CHANGES HAS A COPY IN ITS OWN SNAPSHOT FOLDER.
//
// Delete map copied what it DELETES (history/states, map/supplyareas) and what it rewrote by hand (definition.csv, the country files)
// into blanked_maps/<stamp> — and nothing else. The pictures it repaints (heightmap, terrain, trees, world_normal, the colour
// textures, the minimap) and the rows it takes out of rivers.bmp, buildings.txt, supply_nodes.txt and railways.txt reached only
// safeModWrite's rolling pool (the newest 200 map files — and the Auto-fix after it in one 🌍 Generate a world writes more than that).
// Measured by the critic (probe-blank.js) on a mod owning vanilla's map files: eight files overwritten, snapshotPath "", no folder.
// So 🌍 Generate a world's confirm ("Nova copies it outside your mod, into a folder of its own") would have been false on exactly
// the mods its typed gate asks about. blankMapToSea now opens ONE backup scope over its whole click, on that same snapshot folder.
//
// Fixture: a mod that OWNS a copy of every file of the base game's world that the world run may overwrite — every file a row of
// map-data NEW_WORLD_OWN_FILES matches (derived; units and the names Nova writes aside: Delete map does not touch them) — with
// replace_path="history/states", as a mod with a world of its own has. Delete map is POSTed as the page posts it. Then every file
// whose bytes changed or that went (derived by hashing the mod before and after) must have a byte-identical copy at the same path
// under the answer's snapshotPath, outside the mod.
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
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp")) || !fs.existsSync(path.join(GAME, "map", "heightmap.bmp"))) {
  console.log("  ..   (the base game is not installed — this test measures Delete map against its world and cannot run)");
  process.exit(0);
}
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blank-copies-"));
const DIRS = { mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: GAME, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
function hashTree(root) {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(root, p).split(path.sep).join("/"), sha(p)); } };
  walk(root);
  return out;
}
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });

(async () => {
  let srv = null;
  try {
    srv = await listen(createApp());
    const base = `http://127.0.0.1:${srv.address().port}`;
    const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const mod = (await post("/api/mod/create", { modName: "Owns Its World" })).body.modRoot;
    rec("THE FIXTURE: a mod made the way 🏠 New mod makes one", !!mod && fs.existsSync(path.join(mod, "descriptor.mod")));

    // every file of the base game's world a row of NEW_WORLD_OWN_FILES matches (derived), but the order of battle and Nova's names
    const copied = [];
    const walk = (abs, rel, depth) => {
      let ents = [];
      try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isFile()) {
          const part = md.newWorldOwnFilePart(r);
          if (!part || part === "units" || part === "names") continue;
          const dst = path.join(mod, ...r.split("/"));
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(path.join(abs, e.name), dst);
          copied.push([r, part]);
        } else if (e.isDirectory() && depth > 0) walk(path.join(abs, e.name), r, depth - 1);
      }
    };
    for (const [top, depth] of [["map", 1], ["history", 1], ["gfx", 0], ["gfx/minimap", 0]]) walk(path.join(GAME, ...top.split("/")), top, depth);
    const parts = [...new Set(copied.map((c) => c[1]))].sort();
    rec(`THE FIXTURE: the mod owns ${copied.length} files of the world below, of every part (${parts.join(", ")})`, ["countries", "mapFiles", "pictures", "provinceMap", "regions", "states"].every((p) => parts.includes(p)), parts);
    const desc = path.join(mod, "descriptor.mod");
    fs.writeFileSync(desc, md.spliceReplacePathLine(fs.readFileSync(desc, "utf8"), "history/states").text);

    const before = hashTree(mod);
    const r = await post("/api/map/blank-to-sea", { modPath: mod });
    rec("Delete map ran and changed the map", r.status === 200 && r.body && r.body.ok === true && r.body.changed === true, r.body && { ok: r.body.ok, error: r.body.error });
    const after = hashTree(mod);
    const changed = [...before.keys()].filter((k) => after.get(k) !== before.get(k));
    const created = [...after.keys()].filter((k) => !before.has(k));
    const partOf = (k) => md.newWorldOwnFilePart(k) || "(other)";
    const changedParts = [...new Set(changed.map(partOf))].sort();
    rec(`THE CONTROL: it overwrote or deleted ${changed.length} files of the mod's own, of parts ${changedParts.join(", ")} — the pictures and the line files among them`,
      changed.length >= 8 && changedParts.includes("pictures") && changedParts.includes("mapFiles"), { changed: changed.filter((k) => !/^history\/states\//.test(k)).slice(0, 30), states: changed.filter((k) => /^history\/states\//.test(k)).length });
    const snap = (r.body && r.body.snapshotPath) || "";
    rec("⭐ the answer names its snapshot folder", !!snap && fs.existsSync(snap), { snapshotPath: snap, snapshotFailed: r.body && r.body.snapshotFailed });
    rec("…outside the mod (a copy inside the mod ships with it)", !!snap && path.relative(mod, snap).startsWith(".."), snap);
    rec("…and no copy failed", r.body && Number(r.body.snapshotFailed || 0) === 0 && Number(r.body.overwriteSnapshotFailed || 0) === 0, r.body && { snapshotFailed: r.body.snapshotFailed, overwriteSnapshotFailed: r.body.overwriteSnapshotFailed });
    const missing = [], wrong = [];
    for (const k of changed) {
      const copy = snap ? path.join(snap, ...k.split("/")) : "";
      if (!copy || !fs.existsSync(copy)) missing.push(k);
      else if (sha(copy) !== before.get(k)) wrong.push(k);
    }
    rec(`⭐⭐⭐ every one of the ${changed.length} files it changed or deleted has a copy at its own path in that folder`, changed.length > 0 && missing.length === 0, { missing: missing.slice(0, 20), missingCount: missing.length });
    rec("⭐⭐ …byte for byte as it was before the click", changed.length > 0 && wrong.length === 0, wrong.slice(0, 20));
    const extra = snap ? [...hashTree(snap).keys()].filter((k) => !before.has(k)) : [];
    rec("…and the folder holds copies of the mod's own files only (nothing it created, nothing from below)", extra.length === 0, extra.slice(0, 10));
    console.log(`     ${changed.length} changed, ${created.length} created (no copy needed: they did not exist), snapshot ${snap}`);
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    try { if (srv) { try { srv.closeAllConnections(); } catch (_) {} srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
  }
  console.log(`\n=== Delete map keeps a copy of every file it overwrites: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
