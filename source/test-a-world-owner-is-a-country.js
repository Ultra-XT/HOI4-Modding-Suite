// 🌍 #a-world-owner-is-a-country — "ONE COUNTRY…" MUST BE A COUNTRY THE WORLD HAS.
//
// Measured (reviewer, ownerMode single, owner "zzz"): 🌍 Generate a world's confirm said "every state given to ZZZ" and the run ended
// "✓ Your new world is ready: … all owned by ZZZ; … Map Errors: 0 errors". No country has that tag: the world hands every state to a
// country that does not exist. Generate land's own dialog did the same, with no tag check either.
//
// The tags a world has are createApp's country catalog (collectCountryCatalogByRoots: the list ✨ New country refuses a taken tag
// against, GET /api/countries/catalog). This test, on the split-world fixture:
//   · the dry plan lists exactly the catalog's tags (countryTags, derived from the route);
//   · POST /api/map/world-run refuses a tag that is not one (400, refused "unknown-owner", the tag named, nothing written, no run)
//     — and THE CONTROLS: a known tag in any spelling starts and gives every new state to it; "inherit" never reads the tag;
//   · the world confirm keeps 🌍 Generate the world off and says why for an unknown tag, and turns it on for a known one;
//   · Generate land's own dialog does the same (its functions lifted from public/map.js, its elements from map.html).
// A catalog that lists none is "cannot tell", never a refusal of every tag.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-owner-tag-"));
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
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const T = require("./testlib-map-page.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
function treeHash(d) {
  const h = crypto.createHash("sha1");
  const r = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(x, e.name); if (e.isDirectory()) r(p); else h.update(path.relative(d, p) + "\0").update(fs.readFileSync(p)); } };
  try { r(d); } catch (_) { return "unreadable"; }
  return h.digest("hex");
}
async function waitEnd(c) {
  const t0 = Date.now();
  for (;;) {
    await sleep(150);
    const run = ((await c.get("/api/map/world-run")).body || {}).run;
    if (run && run.state !== "running" && run.state !== "finishing") { await c.post("/api/map/world-run/seen", { id: run.id }); return run; }
    if (Date.now() - t0 > 180000) return { state: "timeout" };
  }
}
const RUN = { landShare: 35, seed: 1, confirm: true };
const stateOwners = (mod) => {
  const d = path.join(mod, "history", "states");
  let names = [];
  try { names = fs.readdirSync(d).filter((f) => f.endsWith(".txt")); } catch (_) { names = []; }
  return names.map((f) => (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(fs.readFileSync(path.join(d, f), "utf8")) || [])[1] || "");
};

(async () => {
  const srv = await listen(createApp());
  const c = client(`http://127.0.0.1:${srv.address().port}`);
  let tags = [];
  try {
    // ── the server, over a world below that lists no country tags (the bare fixture): nothing to judge a tag by ──
    const modE = (await c.post("/api/mod/create", { modName: "Owner Tag Empty" })).body.modRoot;
    const catE = await c.get(`/api/countries/catalog?modPath=${encodeURIComponent(modE)}`);
    rec("THE FIXTURE, bare: its world below lists no country tags (the catalog route answers none)", Array.isArray(catE.body) && catE.body.length === 0, catE.body);
    const dryE = await c.post("/api/map/prepare-world", { modPath: modE, dryRun: true });
    rec("…its dry plan carries no countryTags", dryE.body && dryE.body.ok && !("countryTags" in dryE.body.plan), dryE.body && dryE.body.plan && dryE.body.plan.countryTags);
    const runE = await c.post("/api/map/world-run", Object.assign({ modPath: modE, ownerMode: "single", owner: "ZZZ" }, RUN));
    rec("…and a one-country run is not refused (a list of none cannot tell), and is built", runE.status === 200 && runE.body && runE.body.ok && (await waitEnd(c)).state === "done", runE);

    // the world below gets the country_tags file every real world has: one line per country its history/countries files name
    const histTags = fs.readdirSync(path.join(DIRS.game, "history", "countries")).map((f) => (/^([A-Z0-9]{3}) - /.exec(f) || [])[1]).filter(Boolean);
    SW.write(DIRS.game, "common/country_tags/00_countries.txt", histTags.map((t) => `${t} = "countries/${t}.txt"`).join("\n") + "\n");
    for (const t of histTags) SW.write(DIRS.game, `common/countries/${t}.txt`, "color = { 100 100 100 }\n");

    // ── the server ──
    const modA = (await c.post("/api/mod/create", { modName: "Owner Tag A" })).body.modRoot;
    const cat = await c.get(`/api/countries/catalog?modPath=${encodeURIComponent(modA)}`);
    tags = [...new Set((Array.isArray(cat.body) ? cat.body : []).map((x) => String((x && x.tag) || "").toUpperCase()).filter(Boolean))].sort();
    rec("THE FIXTURE: the world below has countries (the catalog route lists them)", tags.length >= 1, cat.body);
    const unknown = ["ZZZ", "QQQ", "XYZ"].find((t) => !tags.includes(t));
    const known = tags[0];
    const dry = await c.post("/api/map/prepare-world", { modPath: modA, dryRun: true });
    rec("the dry plan lists exactly the catalog's tags (countryTags)", dry.body && dry.body.ok && JSON.stringify(dry.body.plan.countryTags) === JSON.stringify(tags), { plan: dry.body && dry.body.plan && dry.body.plan.countryTags, tags });

    const before = treeHash(modA);
    const refused = await c.post("/api/map/world-run", Object.assign({ modPath: modA, ownerMode: "single", owner: unknown.toLowerCase() }, RUN));
    rec(`⭐ a run giving every state to ${unknown} (no country has it) is refused before anything is written (400)`, refused.status === 400 && refused.body && refused.body.refused === "unknown-owner", refused);
    rec("…the refusal names the tag and says nothing was written", !!refused.body && String(refused.body.error || "").includes(unknown) && /Nothing was written/.test(String(refused.body.error || "")), refused.body && refused.body.error);
    rec("…the mod is byte-for-byte as it was", treeHash(modA) === before, null);
    const after = ((await c.get("/api/map/world-run")).body || {}).run;
    rec("…and no run was started", !after || (after.state !== "running" && after.modRoot !== modA), after && { state: after.state, modRoot: after.modRoot });

    const started = await c.post("/api/map/world-run", Object.assign({ modPath: modA, ownerMode: "single", owner: ` ${known.toLowerCase()} ` }, RUN));
    rec(`THE CONTROL: ${known}, a country the world has (typed " ${known.toLowerCase()} "), starts`, started.status === 200 && started.body && started.body.ok, started);
    const r1 = await waitEnd(c);
    const owners = stateOwners(modA);
    rec(`…the world is built, every new state owned by ${known}`, r1.state === "done" && owners.length > 0 && owners.every((o) => o === known), { state: r1.state, error: r1.error, owners: [...new Set(owners)] });

    const modB = (await c.post("/api/mod/create", { modName: "Owner Tag B" })).body.modRoot;
    const inherit = await c.post("/api/map/world-run", Object.assign({ modPath: modB, ownerMode: "inherit", owner: unknown }, RUN));
    rec(`THE CONTROL: "inherit" never reads the tag box (${unknown} typed there) and starts`, inherit.status === 200 && inherit.body && inherit.body.ok, inherit);
    const r2 = await waitEnd(c);
    rec("…and is built", r2.state === "done", { state: r2.state, error: r2.error });
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }

  // ── the world confirm (the page's world block) ──
  const known = tags[0] || "AAA";
  const unknown = ["ZZZ", "QQQ", "XYZ"].find((t) => !tags.includes(t));
  const PLAN = { modName: "Owner Tag", replacePath: "history/states", bitmap: { own: false, from: "game", bytes: 1048576 }, descriptors: [{ file: "C:/m/o/descriptor.mod", kind: "mod", has: false }], dependencyNames: [], launcherListsIt: true, stateFiles: 0, ownsWorld: false, ownWorldParts: [], copiesUnder: "C:/home/.nova" };
  async function confirmWith(plan, mode, tag) {
    const p = WP.worldPage({ modPath: "C:/m/o", timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} },
      fetch: async (url) => ({ status: 200, json: async () => (String(url).startsWith("/api/map/prepare-world") ? { ok: true, plan } : { ok: true, run: null }) }) });
    await p.fire("mapGenerateWorld");
    p.el("mapWorldOwnerMode").value = mode;
    p.el("mapWorldOwnerTag").value = tag;
    await p.fire("mapWorldOwnerTag", "input");
    await p.fire("mapWorldOwnerMode", "change");
    return { go: p.el("mapWorldGo"), note: String(p.el("mapWorldOwnerNote").textContent || ""), plan: String(p.el("mapWorldPlan").innerHTML || "") };
  }
  const withTags = Object.assign({}, PLAN, { countryTags: tags.length ? tags : ["AAA", "BBB"] });
  const bad = await confirmWith(withTags, "single", unknown.toLowerCase());
  rec(`⭐ the world confirm keeps 🌍 Generate the world off for ${unknown}`, bad.go && bad.go.disabled === true, bad.go && bad.go.disabled);
  rec("…and says why under the owner choice", bad.note.includes(`No country has the tag ${unknown}`), bad.note);
  const good = await confirmWith(withTags, "single", known.toLowerCase());
  rec(`THE CONTROL: ${known} turns it on`, good.go && good.go.disabled === false, good.note);
  const inh = await confirmWith(withTags, "inherit", unknown);
  rec("THE CONTROL: \"inherit\" with that tag still typed is on", inh.go && inh.go.disabled === false, inh.note);
  const none = await confirmWith(Object.assign({}, PLAN, { countryTags: [] }), "single", unknown);
  rec("a plan whose catalog lists none cannot judge a tag: on", none.go && none.go.disabled === false, none.note);

  // ── Generate land's own dialog: its functions as written in public/map.js ──
  const lifted = [
    "let countryCatalogNames = null;",
    T.lift("async function countryNameOf("), T.lift("async function countryCatalogTags("), T.lift("function unknownOwnerTagNote("),
    T.lift("function genOwnerNote("), T.lift("async function genOwnerTagCheck("),
    T.lift("let genGateOn", "\n  };"), T.lift("const syncGenOwner = () => {", "\n  };"),
  ].join("\n");
  async function genDialog(catalog, mode, tag, gate) {
    const els = WP.htmlElements();
    const sb = { console, encodeURIComponent, $: (id) => els.get(id) || null, modPath: () => "C:/m/o",
      fetch: async () => ({ json: async () => catalog }) };
    vm.createContext(sb);
    vm.runInContext(lifted + "\nglobalThis.__f = { syncGenOwner, genOwnerTagCheck, setGenBtnEnabled };", sb);
    sb.__f.setGenBtnEnabled(gate);
    els.get("mapGenOwnerMode").value = mode;
    els.get("mapGenOwnerTag").value = tag;
    sb.__f.syncGenOwner();
    await sb.__f.genOwnerTagCheck();
    await WP.settle();
    const b = els.get("mapGenConfirmBtn");
    // the typed GENERATE gate turning on again must not turn on a bad tag
    sb.__f.setGenBtnEnabled(true);
    return { disabled: b.disabled, note: String(els.get("mapGenOwnerNote").textContent || "") };
  }
  const CAT = (tags.length ? tags : ["AAA", "BBB"]).map((t) => ({ tag: t, displayName: t }));
  const g1 = await genDialog(CAT, "single", unknown.toLowerCase(), true);
  rec(`⭐ Generate land's dialog keeps Generate off for ${unknown}, even once the typed gate is satisfied`, g1.disabled === true, g1);
  rec("…and says why under its owner choice", g1.note.includes(`No country has the tag ${unknown}`), g1.note);
  const g2 = await genDialog(CAT, "single", known, true);
  rec(`THE CONTROL: ${known} turns it on`, g2.disabled === false, g2);
  const g3 = await genDialog(CAT, "inherit", unknown, true);
  rec("THE CONTROL: \"inherit\" is on, with the inherit note", g3.disabled === false && !/No country has/.test(g3.note), g3);
  const g4 = await genDialog([], "single", unknown, true);
  rec("a catalog that lists none cannot judge a tag: on", g4.disabled === false, g4);
  const MASKED = T.MASKED;
  rec("the tag box is listened to (an input re-checks the tag)", /\$\("mapGenOwnerTag"\)\)\s*\$\("mapGenOwnerTag"\)\.addEventListener\("input"/.test(MASKED), null);

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
