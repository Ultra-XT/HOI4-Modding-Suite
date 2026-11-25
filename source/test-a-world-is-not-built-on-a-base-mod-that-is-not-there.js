// 🌍 Generate a world on an add-on whose base mod is NOT installed copies the BASE GAME's province map into it, silently.
// #a-world-is-not-built-on-a-base-mod-that-is-not-there (review-safety of the world run)
//
// Step 1 (map-data prepareModForNewWorld, POST /api/map/prepare-world) copies the provinces.bmp that LOADS below the mod — a
// dependency's before the base game's. resolveDependencyRootsForAssets answers [] for BOTH "this mod declares no base mod" and "it
// declares one that is not installed" (or is spelled differently from that mod's descriptor name), so for the second the run copies
// the base game's 34 MB bitmap into the add-on, builds the new world on the base game's provinces and countries, and the confirm
// says "from the base game" without naming the base mod it declared. Installed later, that base mod loads UNDER a world it never
// saw. server.js already tells the two answers apart for the same shape of write (#addon-copies-vanillas-gui: baseGuiSourceRoots,
// baseModMissingError) — every materialising path that copies "the one from below" refuses there; this one never adopted it.
//
// Pinned: an add-on declaring a base mod that is not there is refused before anything is written (dry run, step 1, and the run),
// and the refusal names the base mod; the two controls (no base mod at all; an installed one) still answer a plan.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-orphan-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const write = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const fwd = (p) => p.replace(/\\/g, "/");
const mod = (folder, name, deps) => {
  const dir = path.join(DIRS.mods, folder);
  const depBlock = deps && deps.length ? `dependencies={\n${deps.map((d) => `\t"${d}"\n`).join("")}}\n` : "";
  write(dir, "descriptor.mod", `version="1"\nname="${name}"\n${depBlock}supported_version="1.*"\n`);
  write(DIRS.mods, folder + ".mod", `version="1"\nname="${name}"\n${depBlock}supported_version="1.*"\npath="${fwd(dir)}"\n`);
  return dir;
};
// the base mod that IS installed, with a province map of its own (one byte different from the game's)
const BASE = mod("base_world", "Base World", []);
const bmp = Buffer.from(fs.readFileSync(path.join(DIRS.game, "map", "provinces.bmp")));
bmp[54] ^= 1;
write(BASE, "map/provinces.bmp", bmp);
const PLAIN = mod("plain_world", "Plain World", []);                         // control: declares no base mod
const ADDON = mod("addon_world", "Addon World", ["Base World"]);             // control: its base mod is installed
const ORPHAN = mod("orphan_world", "Orphan World", ["Base World: Extended"]); // the case: its base mod is not installed
const { createApp } = require("./server.js");

function hashTree(d) {
  const out = {};
  const walk = (x) => {
    let ents = [];
    try { ents = fs.readdirSync(x, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out[path.relative(d, p)] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); }
  };
  walk(d);
  return out;
}

(async () => {
  const server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  try {
    console.log("THE CONTROLS: a mod with no base mod, and an add-on whose base mod is installed, still get a plan");
    const p = await post("/api/map/prepare-world", { modPath: PLAIN, dryRun: true });
    rec("CONTROL: no base mod declared -> a plan, the bitmap from the base game", p.status === 200 && p.body.ok === true && p.body.plan.bitmap.from === "game", p.body);
    const a = await post("/api/map/prepare-world", { modPath: ADDON, dryRun: true });
    rec("CONTROL: the base mod is installed -> a plan, the bitmap from it", a.status === 200 && a.body.ok === true && a.body.plan.bitmap.from === "dependency" && a.body.plan.bitmap.fromName === "Base World", a.body);

    console.log("\n⭐⭐⭐ an add-on whose base mod is not installed is refused before anything is written, and the refusal names it");
    const before = hashTree(DIRS.mods);
    // the run first, while the add-on still inherits its whole world (after a step 1 it would be refused as "own-world" instead)
    const run = await post("/api/map/world-run", { modPath: ORPHAN, confirm: true, landShare: 35, seed: 1, ownerMode: "inherit", owner: "" });
    rec("⭐⭐ the run is refused before it forks", run.status === 400 && run.body.ok === false && /Base World: Extended/.test(String(run.body.error || "")), { status: run.status, body: run.body });
    if (run.status === 200) {   // it forked: let it end before anything else is asked (the lock answers 423 meanwhile)
      for (let i = 0; i < 600; i++) {
        const g = await fetch(base + "/api/map/world-run").then((r) => r.json()).catch(() => null);
        if (g && g.run && g.run.state !== "running" && g.run.state !== "finishing") break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const dry = await post("/api/map/prepare-world", { modPath: ORPHAN, dryRun: true });
    rec("⭐⭐ the dry run (the confirm's plan) refuses it", dry.status === 400 && dry.body.ok === false && !!dry.body.refused, { status: dry.status, ok: dry.body.ok, from: dry.body.plan && dry.body.plan.bitmap && dry.body.plan.bitmap.from });
    rec("…and names the base mod it declared", /Base World: Extended/.test(String(dry.body.error || "")), dry.body.error);
    const step1 = await post("/api/map/prepare-world", { modPath: ORPHAN, confirm: true });
    rec("⭐⭐⭐ step 1 refuses it too", step1.status === 400 && step1.body.ok === false, { status: step1.status, ok: step1.body.ok, bitmapCopied: step1.body.bitmapCopied });
    rec("⭐⭐⭐ …and no province map (the base game's) was copied into the add-on", !fs.existsSync(path.join(ORPHAN, "map", "provinces.bmp")));
    const after = hashTree(DIRS.mods);
    const changed = Object.keys(after).filter((k) => before[k] !== after[k]).concat(Object.keys(before).filter((k) => !(k in after)));
    rec("⭐⭐⭐ nothing in the mods folder changed", changed.length === 0, changed);
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
