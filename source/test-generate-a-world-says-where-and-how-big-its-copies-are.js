// 🌍 #a-re-roll-says-where-its-copies-are / #a-re-roll-says-what-its-copies-cost — A WORLD GENERATED OVER ANOTHER COPIES WHAT IT
// OVERWRITES INTO ONE FOLDER PER STEP, AND THE MODDER MUST BE TOLD WHICH FOLDER HOLDS WHAT THEIR MOD HAD, AND WHAT IT COSTS.
//
// Measured (reviewer, a seed-2 re-roll of the owner flow's world on the real game): the copies sat in four step folders
// (blanked_maps, generate_land, auto_fixes, region_rebuilds); 69 mod paths were copied twice, and in all 69 the LATER copy was an
// intermediate the run itself wrote — so copying the folders back in the wrong order restores intermediates. The re-roll added 1,850
// copy files, 230.3 MB, never pruned (never delete a backup), and the done note said only "Copies … are under ~/.nova".
//
// This test, on the split-world fixture:
//   · the done note lists every finished step's folder (the page's own worldStepCopies of each answer), in the order the steps ran
//     (world-run.js STEPS), and says the first folder holding a file has it as the mod had it — and that is TRUE on disk: for every
//     file the plan says a run overwrites or deletes (map-data newWorldOwnFiles), the first listed folder holding a copy holds the
//     bytes the mod had before the re-roll (a file no folder holds is still in the mod as it was);
//   · the plan's ownBytes is the size of those files, the re-roll's new copies take at least that much, and the confirm says it — for
//     a mod with a world of its own only (THE CONTROL: a new mod is told no size).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-copies-where-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const W = require("./world-run.js");
const md = require("./map-data.js");
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const P = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} } }).sb;
const text = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
function walk(root) { const m = new Map(); const r = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) r(p); else m.set(p, fs.statSync(p).size); } }; try { r(root); } catch (_) {} return m; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
async function runWorld(c, mod, extra) {
  const s = await c.post("/api/map/world-run", Object.assign({ modPath: mod, landShare: 35, seed: 1, ownerMode: "inherit", owner: "", confirm: true }, extra || {}));
  if (!s.body || !s.body.ok) return { state: "not-started", error: JSON.stringify(s.body) };
  const t0 = Date.now();
  for (;;) {
    await sleep(150);
    const run = ((await c.get("/api/map/world-run")).body || {}).run;
    if (run && run.state !== "running" && run.state !== "finishing") break;
    if (Date.now() - t0 > 180000) return { state: "timeout" };
  }
  const full = (await c.get("/api/map/world-run?answers=1")).body.run;
  await c.post("/api/map/world-run/seen", { id: full.id });
  return full;
}
const C = { pct: 35, seed: 1, ownerMode: "inherit", owner: "", picked: "inherit" };

(async () => {
  const srv = await listen(createApp());
  const c = client(`http://127.0.0.1:${srv.address().port}`);
  try {
    const mod = (await c.post("/api/mod/create", { modName: "Copies Where" })).body.modRoot;
    const fresh = (await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body.plan;
    rec("THE CONTROL: a new mod (no world of its own) is told no size", fresh && !fresh.ownsWorld && !/MB, so its copies/.test(text(P.worldConfirmBody(fresh, C))), fresh && { ownsWorld: fresh.ownsWorld, ownBytes: fresh.ownBytes });
    const w1 = await runWorld(c, mod);
    rec("world 1 is built", w1.state === "done", w1.error || w1.state);

    const plan = (await c.post("/api/map/prepare-world", { modPath: mod, dryRun: true })).body.plan;
    const own = md.newWorldOwnFiles(mod);
    const bytes = own.files.reduce((a, rel) => a + fs.statSync(path.join(mod, ...rel.split("/"))).size, 0);
    rec("the plan's ownBytes is the size of every file a run overwrites or deletes (newWorldOwnFiles)", plan.ownsWorld === true && plan.ownBytes === bytes && bytes > 0, { ownBytes: plan.ownBytes, measured: bytes, files: own.files.length });
    const body = text(P.worldConfirmBody(plan, C));
    const mb = (bytes / 1048576).toFixed(1);
    rec(`⭐ the confirm says the mod's world is ${mb} MB, that each world over it copies that again, and that Nova never deletes them`, body.includes(`${mb} MB, so its copies take at least that much more space each time a world is generated over it, and Nova never deletes them`), body);

    const before = new Map(own.files.map((rel) => [rel, sha(path.join(mod, ...rel.split("/")))]));
    const nova0 = walk(path.join(DIRS.home, ".nova"));
    const w2 = await runWorld(c, mod, { replacesOwnWorld: true });
    rec("the re-roll is built", w2.state === "done", w2.error || w2.state);
    const nova1 = walk(path.join(DIRS.home, ".nova"));
    let added = 0;
    for (const [p, sz] of nova1) if (!nova0.has(p)) added += sz;
    rec(`…and its new copies take at least the ${mb} MB the confirm said (${(added / 1048576).toFixed(1)} MB)`, added >= bytes, { added, ownBytes: bytes });

    // the done note's folders, read off the note itself (what the modder reads)
    const note = P.worldDoneNote(w2);
    const m = /one folder per step in the order the steps ran: (.+?)\. A file your mod had before is in the first of those folders that holds it, as it was\./.exec(note);
    const listed = m ? m[1].split("; ") : [];
    const expected = W.STEPS.map((s) => (w2.steps || []).find((x) => x.key === s.key)).filter((s) => s && s.state === "done")
      .map((s) => P.worldStepCopies(s.key, (w2.answers || {})[s.key])).filter(Boolean).map((x) => x.dir);
    rec("⭐ the done note lists each step's copies folder, in the order the steps ran (world-run.js STEPS)", listed.length >= 3 && JSON.stringify(listed) === JSON.stringify(expected), { listed, expected, note });
    rec("…and every folder it lists is on disk", listed.length > 0 && listed.every((d) => fs.existsSync(d)), listed);
    // …and what it says of them is true
    const wrong = [], kept = [];
    for (const [rel, h] of before) {
      const first = listed.find((d) => fs.existsSync(path.join(d, ...rel.split("/"))));
      if (first) { if (sha(path.join(first, ...rel.split("/"))) !== h) wrong.push(`${rel} in ${path.basename(path.dirname(path.dirname(first)))}`); }
      else if (!fs.existsSync(path.join(mod, ...rel.split("/"))) || sha(path.join(mod, ...rel.split("/"))) !== h) wrong.push(`${rel}: in no folder, and changed in the mod`);
      else kept.push(rel);
    }
    rec(`⭐ …the first listed folder holding a file holds what the mod had before (${before.size} files; ${kept.length} untouched in the mod)`, wrong.length === 0 && before.size > kept.length, { wrong: wrong.slice(0, 10), wrongCount: wrong.length });
    const twice = [...before.keys()].filter((rel) => listed.filter((d) => fs.existsSync(path.join(d, ...rel.split("/")))).length > 1);
    // (without one, the check above could not tell the first folder from any other)
    rec(`…and the fixture copies a file in more than one step, so the order is what that check tested (${twice.length} here)`, twice.length >= 1, twice.slice(0, 5));
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
