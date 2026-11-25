// A state made in the map editor must have a name in game, not its raw key.
// #a-new-state-has-no-name
//
// A state names itself with `name = "STATE_<id>"`, and that is a LOCALISATION KEY: the game shows the key's
// value, or the bare key when nothing defines it. Measured across the six maps that ship their own map/ —
// vanilla, Millennium Dawn, Road to 56, Old World Blues, Novum Vexillum, Rise of Nations — 7,495 states, every
// one writes a name, every one of those keys resolves, and the 1,009 states the five mods add beyond vanilla's
// 1,081 define their key in the adding mod's OWN localisation. STATE_<max+1> is defined in none of the six, so a
// new state cannot borrow a name by luck.
//
// /api/map/create-state wrote the state file and returned. It was the one map creator of four that wrote no
// localisation: create-region and create-supplyarea call writeMapEntityLocName, and create-country calls
// writeCountryNameLocalization under #new-country-has-no-name — which is this bug, already fixed, for countries.
// So every state made with "+ New state" read "STATE_1082" in game unless the modder happened to rename it.
//
// Two client paths had to move with it, both found by sending exactly what public/map.js sends:
//   · after Save the page adopted the create's KEY as the state's display name, and the state panel posts that
//     display name back on every edit — so the next panel edit of that state wrote "STATE_1082" over its name;
//   · a name typed into the panel BEFORE the first Save was queued under the placeholder key STATE_new1, which
//     no file will ever reference, so the name the modder chose never reached the game.
//
// ⚠️ And a name the modder already wrote for that key is theirs: it is kept, never overwritten or duplicated.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const vm = require("vm");
const { spawn } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

// ⚠️ A plain constant, not process.env.NOVA_PORT — that name marks a test that drives the LIVE app. This one
// starts its own server, and the runner reads the constant as this file's claim on the port.
const PORT = 54147;
const BOM = String.fromCharCode(0xfeff);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statename-"));
const APPDATA = path.join(tmp, "appdata");
const HOME = path.join(tmp, "home");
const HOI4_USER = path.join(tmp, "hoi4user");
fs.mkdirSync(APPDATA, { recursive: true });
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(path.join(HOI4_USER, "logs"), { recursive: true });
process.env.NOVA_HOME_DIR = HOME;
const modIndex = require("./mod-index.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const MODS = path.join(tmp, "mods");
const mod = path.join(MODS, "statename");
fs.mkdirSync(mod, { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="StateName"\nsupported_version="1.19.*"\n');
const ENG = path.join(mod, "localisation", "english");

const post = (url, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
    let b = ""; res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } j.__status = res.statusCode; resolve(j); });
  });
  req.on("error", (e) => resolve({ error: String(e) }));
  req.setTimeout(240000, () => { req.destroy(); resolve({ error: "timeout" }); });
  req.write(data); req.end();
});

// Every definition of `key` in the mod's own localisation in one language (English unless said), with the file and its value.
// ⚠️ MOVED WITH THE FIX: this read every .yml, and a name is now written into every language the game has
// (#a-state-name-in-every-language), so "defined exactly once" counted ten. It is once PER LANGUAGE.
const definitions = (key, lang = "english") => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!new RegExp(`_l_${lang}\\.yml$`, "i").test(e.name)) continue;
      for (const line of fs.readFileSync(p, "utf8").replace(BOM, "").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_.\-]+):\d*\s*"(.*)"\s*$/.exec(line);
        if (m && m[1] === key) out.push({ file: path.relative(mod, p).replace(/\\/g, "/"), value: m[2] });
      }
    }
  };
  walk(path.join(mod, "localisation"));
  return out;
};

// Lift a function out of public/map.js by brace depth, counted on the comment-masked source.
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const lift = (signature) => {
  const at = MASKED.indexOf(signature);
  if (at < 0) return "";
  let d = 0;
  for (let i = MASKED.indexOf("{", at); i < MASKED.length; i++) {
    if (MASKED[i] === "{") d++;
    else if (MASKED[i] === "}") { d--; if (d === 0) return MAP.slice(at, i + 1); }
  }
  return "";
};

const done = (srv) => {
  try { srv.kill(); } catch (_) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
};

(async () => {
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), APPDATA, XDG_CONFIG_HOME: APPDATA, NOVA_APP_DATA_DIR: path.join(APPDATA, "NovaModdingSuite"),
      NOVA_HOME_DIR: HOME, HOI4_MOD_ROOT: MODS, HOI4_USER_DIR: HOI4_USER },
  });
  process.on("exit", () => done(srv));

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      up = await new Promise((r) => {
        const q = http.get({ host: "127.0.0.1", port: PORT, path: "/api/settings/allow-vanilla-edits" }, (res) => { res.resume(); r(true); });
        q.on("error", () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); });
      });
    }
    rec(`the server answered on ${PORT}`, up);
    if (!up) throw new Error("no server");

    console.log("\n1. ⛔ \"+ New state\", then Save — the body public/map.js sends");
    rec("the client still queues create-state with an empty name (so this test sends what it sends)",
      /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MASKED));
    const r1 = await post("/api/map/create-state", { name: "", owner: "AAA", modPath: mod });
    rec("the state is created", r1.ok === true && Number.isFinite(r1.id), r1.error || r1.raw || r1.id);
    const key = r1.name;
    rec("…under the key every shipping state uses, STATE_<id>", key === `STATE_${r1.id}`, key);
    const defs = definitions(key);
    rec("⭐⭐⭐ that key now has a name in the mod's own localisation", defs.length >= 1 && defs.every((d) => d.value.trim() && d.value !== key), defs);
    rec("⭐⭐ …defined exactly once", defs.length === 1, defs);
    // …and once in each other language the mod now has, with the same name (#a-state-name-in-every-language)
    const langs = fs.existsSync(path.join(mod, "localisation")) ? fs.readdirSync(path.join(mod, "localisation"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "english").map((e) => e.name) : [];
    const perLang = langs.map((l) => ({ l, d: definitions(key, l) }));
    rec("⭐ …and once in every other language, with the same name", perLang.every((x) => x.d.length === 1 && defs[0] && x.d[0].value === defs[0].value), perLang.filter((x) => !(x.d.length === 1 && defs[0] && x.d[0].value === defs[0].value)));
    const resolved = modIndex.scanLocalization(mod)[key];
    rec("⭐⭐ …and a localisation reader resolves it to a name, not to the raw key", !!resolved && resolved !== key, resolved);
    if (defs[0]) {
      const buf = fs.readFileSync(path.join(mod, defs[0].file));
      rec("…written with a UTF-8 BOM, which HOI4 requires of a .yml", buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, [...buf.slice(0, 3)]);
      rec("…under an l_english: header", /^l_english:/.test(buf.toString("utf8").replace(BOM, "")), buf.toString("utf8").slice(0, 40));
    }
    rec("⭐ the response says what the state is now called", !!resolved && r1.displayName === resolved, { displayName: r1.displayName, resolved });

    console.log("\n2. ⭐⭐⭐ The page adopts that name, so the next panel edit cannot write the key over it");
    const remapLocal = lift("function remapLocalStateId");
    rec("remapLocalStateId lifted", remapLocal.length > 200, remapLocal.length);
    rec("the local placeholders are still STATE_new<n> / New state <n> (this fixture mirrors them)",
      /name: `STATE_new\$\{-provId\}`, displayName: `New state \$\{-provId\}`/.test(MASKED));
    const sandbox = { console, stateById: new Map(), model: { states: [], provinceToState: {}, stateToSupplyArea: {}, capitals: {} }, selected: null, stateFormBaseline: null };
    sandbox.st = { id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [], owner: "AAA", cores: ["AAA"], manpower: 0,
      category: "", victoryPoints: [], buildings: {}, resources: {}, provinceBuildings: {} };
    sandbox.served = r1;
    vm.createContext(sandbox);
    vm.runInContext(remapLocal, sandbox);
    vm.runInContext("stateById.set(-1, st); model.states = [st]; remapLocalStateId(-1, served.id, served);", sandbox);
    rec("the page takes the key the server wrote", sandbox.st.name === key, sandbox.st.name);
    rec("⭐⭐⭐ …and shows the state's NAME, not its key", !!resolved && sandbox.st.displayName === resolved, sandbox.st.displayName);

    // stageStateWrite: nameKey = st.name, and displayName = the panel's name field, which showInfo fills from
    // st.displayName. The rest is what the panel sends for an unchanged new state.
    const edit = await post("/api/map/set-state", { modPath: mod, stateId: r1.id, nameKey: sandbox.st.name, fields: {
      displayName: sandbox.st.displayName, owner: "AAA", clearOwner: false, cores: ["AAA"], manpower: "2500", category: "rural",
      victoryPoints: [], buildings: {}, resources: {} } });
    rec("a later panel edit of that state saves", edit.ok === true, edit.error || edit.raw);
    const after = definitions(key);
    rec("⭐⭐⭐ …and leaves the state's name in place instead of writing the raw key over it",
      after.length === 1 && !!resolved && after[0].value === resolved, after);

    console.log("\n3. ⚠️ A name the modder already wrote for the new key is theirs");
    const nextKey = `STATE_${r1.id + 1}`;
    fs.mkdirSync(ENG, { recursive: true });
    fs.writeFileSync(path.join(ENG, "my_state_names_l_english.yml"), `${BOM}l_english:\n ${nextKey}:0 "Kurdistan"\n`);
    const r2 = await post("/api/map/create-state", { name: "", owner: "AAA", modPath: mod });
    rec("a second state is created with the next id", r2.ok === true && r2.name === nextKey, { ok: r2.ok, name: r2.name, error: r2.error });
    const d2 = definitions(nextKey);
    rec("⚠️⚠️ the modder's own name for that key is left exactly as they wrote it", d2.length >= 1 && d2.every((d) => d.value === "Kurdistan"), d2);
    rec("⚠️⚠️ …and not defined a second time in another file", d2.length === 1 && d2[0].file === "localisation/english/my_state_names_l_english.yml", d2);
    rec("⚠️ …and the response reports their name", r2.displayName === "Kurdistan", r2.displayName);

    console.log("\n4. ⭐⭐⭐ A name typed into the panel BEFORE the first Save reaches the game");
    const remapQueued = lift("function remapQueuedStateId");
    const listSrc = (/const STATE_ID_FIELDS = \[[^\]]*\];/.exec(MAP) || [""])[0];
    rec("remapQueuedStateId and its field list lifted", remapQueued.length > 120 && listSrc.length > 40, { fn: remapQueued.length, list: listSrc.length });
    rec("⭐ the save hands the create's whole response to the queue rewrite, not only the id",
      /remapQueuedStateId\(w\.meta\.provisionalId, res\.id, res\);/.test(MASKED));
    // "+ New state" queued the create; the panel then named the state, which stageStateWrite queued under
    // nameKey = st.name — still the placeholder. A second new state's rename sits behind it.
    const queue = [
      { url: "/api/map/create-state", body: { name: "", owner: "AAA" }, meta: { create: true, provisionalId: -1 } },
      { url: "/api/map/set-state", body: { stateId: -1, nameKey: "STATE_new1", fields: { displayName: "Anatolia", owner: "AAA", clearOwner: false,
        cores: ["AAA"], manpower: "1000", category: "rural", victoryPoints: [], buildings: {}, resources: {} } }, meta: {} },
      { url: "/api/map/set-state", body: { stateId: -2, nameKey: "STATE_new2", fields: { displayName: "Elsewhere" } }, meta: {} },
    ];
    const r3 = await post("/api/map/create-state", Object.assign({}, queue[0].body, { modPath: mod }));
    rec("the create in the queue runs", r3.ok === true && Number.isFinite(r3.id), r3.error || r3.raw);
    const qctx = { pendingWrites: queue, served: r3 };
    vm.createContext(qctx);
    let threw = null;
    try { vm.runInContext(listSrc + "\n" + remapQueued + "\nremapQueuedStateId(-1, served.id, served);", qctx); } catch (e) { threw = e.message; }
    rec("the rewrite runs", threw === null, threw);
    rec("the queued rename now points at the real state", queue[1].body.stateId === r3.id, queue[1].body.stateId);
    rec("⭐⭐⭐ …and at the state's real name key, not the placeholder", queue[1].body.nameKey === r3.name, queue[1].body.nameKey);
    rec("⚠️ a different new state's queued write is left alone", queue[2].body.stateId === -2 && queue[2].body.nameKey === "STATE_new2", queue[2].body);
    const rn = await post("/api/map/set-state", Object.assign({}, queue[1].body, { modPath: mod }));
    rec("the queued rename saves", rn.ok === true, rn.error || rn.raw);
    const d3 = definitions(r3.name);
    rec("⭐⭐⭐ …and the name the modder typed is the state's name in game", d3.length === 1 && d3[0].value === "Anatolia", d3);
    rec("⚠️ …with nothing written under the placeholder key", definitions("STATE_new1").length === 0, definitions("STATE_new1"));
  } catch (e) {
    if (e && e.message !== "no server") { console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e); fails.push("harness"); }
    else fails.push("server did not start");
  }

  console.log(`\n=== a new state is named in game: ${checks} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
