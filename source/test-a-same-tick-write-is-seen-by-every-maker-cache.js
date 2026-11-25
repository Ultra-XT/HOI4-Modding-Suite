// ⛔ #a-same-tick-write-keeps-its-stamp — …AND THE MAKERS' CACHES IN server.js SEE IT TOO.
//
// The same shape as test-a-same-tick-write-is-seen-by-every-map-cache.js, for the in-memory caches the server keeps of a mod's
// files: the parsed event, decision and character files, the texts the "what fires this event?" lookup searches, the research
// screen's layout and its .gfx, the MIO catalogues, the equipment variants list, the country thumbnail's bitmap, the country
// names a catalogue rebuild reads, a mod's replace_path lines and the launcher's .mod files. Each was kept while the file's
// size and modified time (or the time alone) stood still, which a same-size write of Nova's inside one clock tick does.
// Driven through the endpoints with the queries the pages send; each section asks twice
// (the second answer must come from the cache, or this test could not tell), holds the clock, has Nova rewrite the file at the
// same size, and asks again. Binds nothing fixed: createApp().listen(0).
//
// …and two more shapes of the same miss. The focus editor saves through /api/save, a hand-rolled copy of safeModWrite that
// never announced its write, so the count did not see it: that section saves the way the focus editor does. And four SAVED
// catalogues — research, equipment, countries, states — keep their stamp on disk, so they keep the count beside it (novaWritesToken),
// not in it; dropping the entry in memory only took the saved one back, under a fingerprint the write had not moved. The state
// catalogue was missed by the first hunt (its stamp is built through fileFingerprintPart, which a scan for `.mtimeMs` never saw):
// its own sections take the answer in memory, the saved one once the one in memory has had its five minutes, and a modder's edit.
// The token is this process's, so each of the four is also asked at a NEXT LAUNCH, after a write landing in the tick its answer
// was saved in (savedInTheTickOf).
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { holdTheClock } = require("./testlib-held-clock.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-same-tick-makers-"));
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

// ── the world: a game with one event file of its own, a mods folder, and a mod carrying one file for each maker ─────────
const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods"), MOD = path.join(MODS, "sametick");
write(GAME, "hoi4.exe", "not really an exe");
write(GAME, "events/base.txt", "add_namespace = base\ncountry_event = {\n\tid = base.1\n\ttitle = base.1.t\n\toption = { name = base.1.a }\n}\n");
write(MOD, "descriptor.mod", 'name="Same Tick"\nsupported_version="1.*"\n');
write(MODS, "sametick.mod", `name="Same Tick"\npath="${MOD.replace(/\\/g, "/")}"\n`);
write(MODS, "other.mod", 'name="Other"\npath="C:/somewhere/aaaa"\n');
write(MOD, "events/tst.txt", "add_namespace = tst\ncountry_event = {\n\tid = tst.1\n\ttitle = tst.1.t\n\tdesc = tst.1.d\n\toption = { name = tst.1.a }\n}\n");
write(MOD, "common/decisions/tst.txt", "tst_category = {\n\ttst_decision = {\n\t\tcost = 10\n\t\tcomplete_effect = { add_political_power = 5 }\n\t}\n}\n");
write(MOD, "common/characters/tst.txt", "characters = {\n\tAAA_joe_smith = {\n\t\tname = AAA_joe_smith\n\t\tcountry_leader = {\n\t\t\tideology = liberalism\n\t\t}\n\t}\n}\n");
write(MOD, "common/national_focus/tst.txt", "focus_tree = {\n\tid = tst_tree\n\tfocus = {\n\t\tid = tst_focus_a\n\t\tx = 1\n\t\ty = 0\n\t\tcompletion_reward = { country_event = tst.1 }\n\t}\n}\n");
write(MOD, "interface/countrytechtreeview.gui", "guiTypes = {\n\tcontainerWindowType = {\n\t\tname = \"tst_folder\"\n\t\tposition = { x = 0 y = 0 }\n\t\tsize = { width = 100% height = 100% }\n\t\tgridboxType = {\n\t\t\tname = \"tst_tree\"\n\t\t\tposition = { x = 110 y = 220 }\n\t\t\tslotsize = { width = 70 height = 70 }\n\t\t}\n\t}\n}\n");
// the MIO files twice over: one request reads both catalogues, so each section asks of a mod of its own
const MIO_CATS = path.join(MODS, "sametick_cats");
for (const m of [MOD, MIO_CATS]) {
  if (m !== MOD) write(m, "descriptor.mod", 'name="Same Tick Cats"\nsupported_version="1.*"\n');
  write(m, "common/equipment_groups/tst.txt", "mio_cat_eq_tst_rifles = {\n\tequipment_type = { infantry_equipment }\n}\n");
  write(m, "common/military_industrial_organization/organizations/AAA_tst.txt", "AAA_arms_organization = {\n\tallowed = { original_tag = AAA }\n\tequipment_type = { mio_cat_eq_tst_rifles }\n\ticon = GFX_idea_generic_infantry_company\n}\n");
}
// …and a mod whose replace_path nothing else asks about before its section does
const REPLACING = path.join(MODS, "sametick_replacing");
write(REPLACING, "descriptor.mod", 'name="Same Tick Replacing"\nsupported_version="1.*"\nreplace_path="events"\n');
write(REPLACING, "events/tst.txt", "add_namespace = tst\ncountry_event = {\n\tid = tst.1\n\ttitle = tst.1.t\n\toption = { name = tst.1.a }\n}\n");
// …and one whose research tab draws its wide box from a sprite in countrytechtreeview.gfx: a picture 90 x 40, or 60 x 60
const GFXMOD = path.join(MODS, "sametick_gfx");
write(GFXMOD, "descriptor.mod", 'name="Same Tick Gfx"\nsupported_version="1.*"\n');
write(GFXMOD, "interface/countrytechtreeview.gui", "guiTypes = {\n\tcontainerWindowType = {\n\t\tname = \"tst_folder\"\n\t\tsize = { width = 100% height = 100% }\n\t\tgridboxType = {\n\t\t\tname = \"tst_tree\"\n\t\t\tposition = { x = 110 y = 220 }\n\t\t\tslotsize = { width = 70 height = 70 }\n\t\t}\n\t}\n\tcontainerWindowType = {\n\t\tname = \"techtree_tst_folder_item\"\n\t\tposition = { x = -56 y = -7 }\n\t\tsize = { width = 183 height = 84 }\n\t}\n}\n");
write(GFXMOD, "interface/countrytechtreeview.gfx", "spriteTypes = {\n\tspriteType = {\n\t\tname = \"GFX_technology_tst_folder_available_item_bg\"\n\t\ttexturefile = \"gfx/aa.dds\"\n\t}\n}\n");
const ddsOf = (w, h) => { const b = Buffer.alloc(128); b.write("DDS ", 0, "latin1"); b.writeUInt32LE(124, 4); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); return b; };
write(GFXMOD, "gfx/aa.dds", ddsOf(90, 40));
write(GFXMOD, "gfx/bb.dds", ddsOf(60, 60));
// …and one with a designed tank in a country history file, for the equipment variants list
const VARIANTS = path.join(MODS, "sametick_variants");
write(VARIANTS, "descriptor.mod", 'name="Same Tick Variants"\nsupported_version="1.*"\n');
write(VARIANTS, "history/countries/AAA - Alpha.txt", "capital = 1\ncreate_equipment_variant = {\n\tname = \"Tank Mark A\"\n\ttype = light_tank_chassis_1\n\tparent_version = 0\n}\n");
// …and one whose country names only the country catalogue's rebuild reads
const NAMES = path.join(MODS, "sametick_names");
write(NAMES, "descriptor.mod", 'name="Same Tick Names"\nsupported_version="1.*"\n');
write(NAMES, "localisation/english/tst_l_english.yml", "﻿l_english:\n AAA: \"Alpha\"\n");
// …and one whose focus tree the focus editor saves (/api/save), for the event-trigger lookup
const FOCUS = path.join(MODS, "sametick_focus");
write(FOCUS, "descriptor.mod", 'name="Same Tick Focus"\nsupported_version="1.*"\n');
write(FOCUS, "events/tst.txt", "add_namespace = tst\ncountry_event = {\n\tid = tst.1\n\ttitle = tst.1.t\n\toption = { name = tst.1.a }\n}\n");
write(FOCUS, "common/national_focus/tst.txt", "focus_tree = {\n\tid = tst_tree\n\tfocus = {\n\t\tid = tst_focus_a\n\t\tx = 1\n\t\ty = 0\n\t\tcompletion_reward = { country_event = tst.1 }\n\t}\n}\n");
// …and one each for the saved catalogues: a technology, an equipment, a country
const TECHS = path.join(MODS, "sametick_techs"), EQUIP = path.join(MODS, "sametick_equipment"), COUNTRIES = path.join(MODS, "sametick_countries");
for (const [m, n] of [[TECHS, "Techs"], [EQUIP, "Equipment"], [COUNTRIES, "Countries"]]) write(m, "descriptor.mod", `name="Same Tick ${n}"\nsupported_version="1.*"\n`);
write(TECHS, "common/technologies/tst.txt", "technologies = {\n\ttst_tech_a = {\n\t\tresearch_cost = 1.5\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 1 y = 0 } }\n\t}\n}\n");
write(EQUIP, "common/units/equipment/tst.txt", "equipments = {\n\ttst_rifle_1 = {\n\t\tyear = 1936\n\t\tis_archetype = no\n\t\ttype = infantry\n\t\tdefense = 20\n\t\tbuild_cost_ic = 0.50\n\t}\n}\n");
write(COUNTRIES, "common/country_tags/tst.txt", "BBB = \"countries/Bravo.txt\"\n");
write(COUNTRIES, "common/countries/Bravo.txt", "color = { 10 20 30 }\ngraphical_culture = western_european_gfx\n");
write(COUNTRIES, "localisation/english/tst_l_english.yml", "﻿l_english:\n BBB: \"Bravo\"\n");
// …and a copy of the technology mod nobody asks about before a fresh start does (the control: a cold build reads its file)
const TECHS_COLD = path.join(MODS, "sametick_techs_cold");
write(TECHS_COLD, "descriptor.mod", 'name="Same Tick Techs Cold"\nsupported_version="1.*"\n');
write(TECHS_COLD, "common/technologies/tst.txt", fs.readFileSync(path.join(TECHS, "common", "technologies", "tst.txt")));
// …and three for the state catalogue (the focus editor's building panel, the Army air-base picker): its answer in memory, the one
// it saves, and a modder's own edit — state 1 GER's in each
const STATES_MEM = path.join(MODS, "sametick_states_mem"), STATES_SAVED = path.join(MODS, "sametick_states_saved"), STATES_EDIT = path.join(MODS, "sametick_states_edit");
for (const [m, n] of [[STATES_MEM, "Memory"], [STATES_SAVED, "Saved"], [STATES_EDIT, "Edit"]]) {
  write(m, "descriptor.mod", `name="Same Tick States ${n}"\nsupported_version="1.*"\n`);
  write(m, "history/states/1-A.txt", "state={\n\tid=1\n\tname=\"STATE_1\"\n\tprovinces={ 2 }\n\thistory={\n\t\towner=GER\n\t\tbuildings={ infrastructure=1 }\n\t}\n}\n");
}
// …and a copy of each saved catalogue's mod for the next launch, after a write in the very tick its answer was saved in
const TICK = {};
for (const [k, from] of [["techs", TECHS], ["equipment", EQUIP], ["countries", COUNTRIES], ["states", STATES_SAVED]]) {
  TICK[k] = path.join(MODS, "sametick_next_launch_" + k);
  fs.cpSync(from, TICK[k], { recursive: true });
  write(TICK[k], "descriptor.mod", `name="Same Tick Next Launch ${k}"\nsupported_version="1.*"\n`);
}
// a 64 x 32 map: AAA owns the east half (province 2), the west half is province 1
const W = 64, H = 32, rs = W * 3;
const bmp = Buffer.alloc(54 + rs * H);
bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(rs * H, 34);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = 54 + y * rs + x * 3; if (x < 32) { bmp[o] = 200; } else { bmp[o + 2] = 200; } }
write(MOD, "map/provinces.bmp", bmp);
write(MOD, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;0;0;200;land;false;plains;1\n2;200;0;0;land;false;plains;1\n");
write(MOD, "history/states/1-A.txt", "state={\n\tid=1\n\tname=\"STATE_1\"\n\tprovinces={ 2 }\n\thistory={\n\t\towner=AAA\n\t}\n}\n");

process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

// ── the reads, counted by file ──────────────────────────────────────────────────────────────────────────────
const keyOf = (p) => { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; };
const reads = new Map();
const count = (p) => { try { if (typeof p === "string" || Buffer.isBuffer(p)) { const k = keyOf(p); reads.set(k, (reads.get(k) || 0) + 1); } } catch (_) { /* an fd */ } };
const realRead = fs.readFileSync, realReadCb = fs.readFile, realReadP = fs.promises.readFile;
fs.readFileSync = function readFileSync(p) { count(p); return realRead.apply(fs, arguments); };
fs.readFile = function readFile(p) { count(p); return realReadCb.apply(fs, arguments); };
fs.promises.readFile = function readFile(p) { count(p); return realReadP.apply(fs.promises, arguments); };
const readsOf = (f) => reads.get(keyOf(f)) || 0;
const seen = (p) => { const s = fs.statSync(p); return [s.size, s.mtimeMs, s.ctimeMs, s.birthtimeMs, s.ino].join(":"); };

const srv = require("./server.js");
const { safeModWrite, ICON_CACHE_DIR } = require("./safe-write.js");

/** A fresh start: another node process on the same app data and folders asks each { url, file } of its own server, and says how
 *  many times it read that file for it → { ok, answers: [{ reads, body }], error }. */
function freshStart(asks) {
  const child = [
    "'use strict';",
    "const fs = require('fs'), path = require('path');",
    "const [serverJs, asksJson] = process.argv.slice(1);",
    "const keyOf = (p) => { const r = path.resolve(String(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };",
    "const reads = new Map(), realRead = fs.readFileSync;",
    "fs.readFileSync = function readFileSync(p) { if (typeof p === 'string') { const k = keyOf(p); reads.set(k, (reads.get(k) || 0) + 1); } return realRead.apply(fs, arguments); };",
    "const srv = require(serverJs);",
    "(async () => {",
    "  const server = await new Promise((res, rej) => { const s = srv.createApp().listen(0, '127.0.0.1', () => res(s)); s.on('error', rej); });",
    "  const answers = [];",
    "  for (const a of JSON.parse(asksJson)) {",
    "    const n = reads.get(keyOf(a.file)) || 0;",
    "    const body = await (await fetch('http://127.0.0.1:' + server.address().port + a.url)).json();",
    "    answers.push({ reads: (reads.get(keyOf(a.file)) || 0) - n, body });",
    "  }",
    "  server.close();",
    "  process.stdout.write('\\nFRESH ' + JSON.stringify(answers) + '\\n', () => process.exit(0));",
    "})().catch((e) => { process.stdout.write('\\nFRESH-ERROR ' + (e && e.stack || e) + '\\n', () => process.exit(1)); });",
  ].join("\n");
  const r = require("child_process").spawnSync(process.execPath, ["-e", child, path.join(__dirname, "server.js"), JSON.stringify(asks)], { env: process.env, encoding: "utf8", timeout: 180000, maxBuffer: 64 << 20 });
  const line = String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("FRESH "));
  if (!line) return { ok: false, error: { status: r.status, tail: String((r.stdout || "") + (r.stderr || "")).slice(-800) } };
  return { ok: true, answers: JSON.parse(line.slice(6)) };
}

/** Bytes with every `from` replaced by `to` (same length) — at least once. */
const swap = (from, to) => (b) => {
  const s = b.toString("latin1");
  if (from.length !== to.length || !s.includes(from)) throw new Error(`fixture: "${from}" not in the file, or not "${to}"'s length`);
  return Buffer.from(s.split(from).join(to), "latin1");
};
/** The shape every section takes (see the header); `wait` ms before the last question, for a memo that also keeps a time;
 *  `answers.writer(file, bytes)` writes the new bytes the way that file's own editor does (safeModWrite when there is none). */
async function sameTick(name, file, ask, rewrite, answers = {}, wait = 0) {
  const rel = path.relative(MOD, file).replace(/\\/g, "/");
  let answer;
  const readsFor = async () => { const n = readsOf(file); answer = await ask(); return readsOf(file) - n; };
  const cold = await readsFor();
  if (answers.before) answers.before(answer);
  const warm = await readsFor();
  ok(cold > warm, `(${name}: the second question reads ${rel} ${warm}x, the first ${cold}x — the answer is cached)`, { cold, warm });
  const before = realRead(file), next = rewrite(Buffer.from(before));
  const release = holdTheClock([file, path.dirname(file)]);
  try {
    const s0 = seen(file), d0 = seen(path.dirname(file));
    if (answers.writer) await answers.writer(file, next);
    else safeModWrite(file, next, "test-same-tick");
    const wrote = !realRead(file).equals(before) && realRead(file).length === before.length;
    ok(wrote && seen(file) === s0 && seen(path.dirname(file)) === d0, `(${name}: ${rel} rewritten by Nova at the same size, and stat sees nothing of it)`);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const after = await readsFor();
    // …as the first question did — or, where another cache that keeps its answer for a TIME also read the file the first time,
    // exactly once more than the cached question (answers.stampedReads: how many of the first question's reads were this cache's)
    const want = answers.stampedReads ? warm + answers.stampedReads : cold;
    ok(cold > warm && after === want, `⭐⭐ ${name}: …and after it, the next question reads ${rel} ${want}x, not from the cache`, { cold, warm, after });
    if (answers.after) answers.after(answer);
    return { cold, warm, after };
  } finally { release(); }
}

(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (url) => { const r = await fetch(base + url); const t = await r.text(); try { return JSON.parse(t); } catch (_) { return { status: r.status, bytes: t.length, text: t }; } };
    const q = encodeURIComponent(MOD);

    console.log("\n-- the parsed files the makers list --");
    const optionsOf = (b) => ((b.events || []).find((e) => e.fullId === "tst.1") || {}).options;
    await sameTick("the events list (eventFileCache)", path.join(MOD, "events", "tst.txt"), () => get(`/api/events/list?modPath=${q}`), swap("tst.1.a", "tst.1.b"), {
      before: (b) => ok(JSON.stringify(optionsOf(b) || "").includes("tst.1.a"), "(the fixture: the event's option is tst.1.a)", optionsOf(b)),
      after: (b) => ok(JSON.stringify(optionsOf(b) || "").includes("tst.1.b"), "⭐ …and the list shows the new file's option, tst.1.b", optionsOf(b)) });
    const costOf = (b) => { for (const c of b.categories || []) for (const d of c.decisions || []) if (d.id === "tst_decision") return d.cost; return undefined; };
    await sameTick("the decisions list (decisionFileCache)", path.join(MOD, "common", "decisions", "tst.txt"), () => get(`/api/decisions/list?modPath=${q}`), swap("cost = 10", "cost = 20"), {
      before: (b) => ok(String(costOf(b)) === "10", "(the fixture: the decision costs 10)", costOf(b)),
      after: (b) => ok(String(costOf(b)) === "20", "⭐ …and the list shows the new file's cost, 20", costOf(b)) });
    const tokens = (b) => (b.files || []).flatMap((f) => (f.characters || []).map((c) => c.token || c.id)).join(",");
    await sameTick("the characters list (characterFileCache)", path.join(MOD, "common", "characters", "tst.txt"), () => get(`/api/characters/list?modPath=${q}`), swap("AAA_joe_smith", "AAA_ann_jones"), {
      before: (b) => ok(tokens(b) === "AAA_joe_smith", "(the fixture: one character, AAA_joe_smith)", tokens(b)),
      after: (b) => ok(tokens(b) === "AAA_ann_jones", "⭐ …and the list shows the new file's character, AAA_ann_jones", tokens(b)) });

    console.log("\n-- what fires this event (_evTriggerCache: the modified time alone) --");
    const focusesOf = (b) => (b.focuses || []).map((f) => f.focus).join(",");
    await sameTick("the texts the event-trigger lookup searches", path.join(MOD, "common", "national_focus", "tst.txt"), () => get(`/api/events/triggers?id=tst.1&modPath=${q}`), swap("tst_focus_a", "tst_focus_b"), {
      before: (b) => ok(focusesOf(b) === "tst_focus_a", "(the fixture: focus tst_focus_a fires tst.1)", b),
      after: (b) => ok(focusesOf(b) === "tst_focus_b", "⭐ …and the lookup names the new file's focus, tst_focus_b", b) });
    // …when the focus editor saves the tree, through /api/save, as public/app.js sends it
    const post = async (url, body) => { const r = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const focusEditorSave = async (file, next) => {
      const r = await post("/api/save", { path: file, content: next.toString("utf8"), baseFingerprint: srv.novaFileFingerprint(realRead(file, "utf8")), createBackup: true, backupReason: "manual-save", snapshot: false });
      ok(r.status === 200 && r.body && r.body.ok === true, "(the focus editor's save was taken)", r);
    };
    await sameTick("the texts the event-trigger lookup searches, saved by the focus editor (/api/save)", path.join(FOCUS, "common", "national_focus", "tst.txt"),
      () => get(`/api/events/triggers?id=tst.1&modPath=${encodeURIComponent(FOCUS)}`), swap("tst_focus_a", "tst_focus_c"), {
        writer: focusEditorSave,
        before: (b) => ok(focusesOf(b) === "tst_focus_a", "(the fixture: focus tst_focus_a fires tst.1)", b),
        after: (b) => ok(focusesOf(b) === "tst_focus_c", "⭐ …and the lookup names the saved tree's focus, tst_focus_c", b) });

    console.log("\n-- the research screen's layout (_guiLayoutCache) --");
    const gridOf = (b) => JSON.stringify((b.folders || {}).tst_folder || null);
    await sameTick("the research screen layout", path.join(MOD, "interface", "countrytechtreeview.gui"), () => get(`/api/research/gui-layout?modPath=${q}`), swap("x = 110 y = 220", "x = 130 y = 240"), {
      before: (b) => ok(gridOf(b).includes("110"), "(the fixture: the folder's grid stands at x 110)", gridOf(b)),
      after: (b) => ok(gridOf(b).includes("130") && !gridOf(b).includes("110"), "⭐ …and the layout is the new file's: x 130", gridOf(b)) });
    const boxOf = (b) => { const w = ((b.folders || {}).tst_folder || {}).wideBox; return w ? `${w.w}x${w.h}` : "none"; };
    await sameTick("the research screen layout's plate sizes (its .gfx)", path.join(GFXMOD, "interface", "countrytechtreeview.gfx"), () => get(`/api/research/gui-layout?modPath=${encodeURIComponent(GFXMOD)}`), swap("gfx/aa.dds", "gfx/bb.dds"), {
      before: (b) => ok(boxOf(b) === "90x40", "(the fixture: the tab's wide box is its sprite's picture, 90 x 40)", boxOf(b)),
      after: (b) => ok(boxOf(b) === "60x60", "⭐ …and after the sprite points at another picture, 60 x 60", boxOf(b)) });

    console.log("\n-- the MIO catalogues --");
    const mio = (m) => () => get(`/api/mio/for-equipment?modPath=${encodeURIComponent(m)}&archetype=infantry_equipment&tag=AAA`);
    const ids = (b) => (b.companies || []).map((c) => c.id).join(",");
    await sameTick("the MIO companies (scanAllMioCompanies)", path.join(MOD, "common", "military_industrial_organization", "organizations", "AAA_tst.txt"), mio(MOD), swap("AAA_arms_organization", "AAA_guns_organization"), {
      before: (b) => ok(ids(b) === "AAA_arms_organization", "(the fixture: one company designs infantry equipment)", b),
      after: (b) => ok(ids(b) === "AAA_guns_organization", "⭐ …and the answer is the new file's company", b) });
    await sameTick("the MIO equipment categories (mioCategoryEquipmentMap)", path.join(MIO_CATS, "common", "equipment_groups", "tst.txt"), mio(MIO_CATS), swap("infantry_equipment", "support_equipments"), {
      before: (b) => ok(ids(b) === "AAA_arms_organization", "(the fixture: its category covers infantry equipment)", b),
      after: (b) => ok(ids(b) === "", "⭐ …and the answer is the new file's: the category no longer covers infantry equipment", b) });

    const variantNames = (b) => (b.variants || []).filter((v) => v.tag === "AAA").map((v) => v.name).join(",");
    await sameTick("the equipment variants list (scanAllCountryVariants)", path.join(VARIANTS, "history", "countries", "AAA - Alpha.txt"), () => get(`/api/equipment/variants/all?modPath=${encodeURIComponent(VARIANTS)}`), swap("Tank Mark A", "Tank Mark B"), {
      before: (b) => ok(variantNames(b) === "Tank Mark A", "(the fixture: AAA designs Tank Mark A)", variantNames(b)),
      after: (b) => ok(variantNames(b) === "Tank Mark B", "⭐ …and after it, Tank Mark B", variantNames(b)) });

    console.log("\n-- the saved catalogues: research, equipment, countries (the count beside the saved stamp, never in it) --");
    const costOfTech = (b) => String(((b.technologies || []).find((t) => t.id === "tst_tech_a") || {}).researchCost);
    const techRun = await sameTick("the research catalogue (collectAllTechnologies)", path.join(TECHS, "common", "technologies", "tst.txt"), () => get(`/api/technologies/catalog?modPath=${encodeURIComponent(TECHS)}`), swap("research_cost = 1.5", "research_cost = 2.5"), {
      before: (b) => ok(costOfTech(b) === "1.5", "(the fixture: the technology costs 1.5)", costOfTech(b)),
      after: (b) => ok(costOfTech(b) === "2.5", "⭐ …and the catalogue is the new file's: 2.5", costOfTech(b)) });
    const defenceOf = (b) => String(((b.equipment || []).find((e) => e.id === "tst_rifle_1") || {}).defense);
    await sameTick("the equipment catalogue (collectAllEquipments)", path.join(EQUIP, "common", "units", "equipment", "tst.txt"), () => get(`/api/equipment/list?modPath=${encodeURIComponent(EQUIP)}`), swap("defense = 20", "defense = 30"), {
      before: (b) => ok(defenceOf(b) === "20", "(the fixture: the rifle's defence is 20)", defenceOf(b)),
      after: (b) => ok(defenceOf(b) === "30", "⭐ …and the catalogue is the new file's: 30", defenceOf(b)) });
    const nameOfBBB = (b) => ((Array.isArray(b) ? b : []).find((c) => c.tag === "BBB") || {}).displayName;
    await sameTick("the country catalogue (collectCountryCatalogByRoots)", path.join(COUNTRIES, "localisation", "english", "tst_l_english.yml"), () => get(`/api/countries/catalog?modPath=${encodeURIComponent(COUNTRIES)}`), swap("Bravo", "Delta"), {
      before: (b) => ok(nameOfBBB(b) === "Bravo", "(the fixture: BBB is named Bravo)", nameOfBBB(b)),
      after: (b) => ok(nameOfBBB(b) === "Delta", "⭐ …and the catalogue is the new file's: Delta", nameOfBBB(b)) });

    console.log("\n-- the state catalogue (collectStateCatalogByRoots): the focus editor's building panel and the Army air-base picker --");
    // asked as public/army.js asks it: the mod, and the country whose states come first
    const stateCatalog = (m) => () => get(`/api/buildings/state-catalog?${new URLSearchParams({ modPath: m, countryTag: "GER" })}`);
    const ownerOf1 = (b) => ((b.items || []).find((s) => String(s.stateId) === "1") || {}).ownerTag;
    const statesFile = (m) => path.join(m, "history", "states", "1-A.txt");
    const savedStates = (m) => path.join(ICON_CACHE_DIR, "statecatalog_" + crypto.createHash("sha1").update(String(m)).digest("hex") + ".json");
    // in memory: the map editor's owner change, GER → FRA, at the same size as every change of tag. The saved copy is put aside
    // with the write, so the answer can only be the one in memory — the next part asks the saved one alone.
    await sameTick("the state catalogue in memory", statesFile(STATES_MEM), stateCatalog(STATES_MEM), swap("owner=GER", "owner=FRA"), {
      writer: (file, next) => {
        safeModWrite(file, next, "test-same-tick");
        const saved = savedStates(STATES_MEM), had = fs.existsSync(saved);
        if (had) fs.renameSync(saved, saved + ".aside");
        ok(had && !fs.existsSync(saved), "(the saved state catalogue was there, and is put aside: only the answer in memory is left)");
      },
      before: (b) => ok(ownerOf1(b) === "GER", "(the fixture: state 1 is GER's)", ownerOf1(b)),
      after: (b) => ok(ownerOf1(b) === "FRA", "⭐ …and the catalogue is the new file's: FRA", ownerOf1(b)) });
    // …and the saved copy, which outlives the one in memory (five minutes) and the process: asked with the clock moved past that
    {
      const file = statesFile(STATES_SAVED), ask = stateCatalog(STATES_SAVED);
      const later = async (min) => { const realNow = Date.now; Date.now = () => realNow() + min * 60000; try { return await ask(); } finally { Date.now = realNow; } };
      const readsFor = async (q) => { const n = readsOf(file); const b = await q(); return { reads: readsOf(file) - n, owner: ownerOf1(b) }; };
      const cold = await readsFor(ask);
      ok(cold.reads === 1 && cold.owner === "GER" && fs.existsSync(savedStates(STATES_SAVED)), "(the fixture: state 1 is GER's, its file read once, and the catalogue saved)", cold);
      const before = realRead(file), next = swap("owner=GER", "owner=ITA")(Buffer.from(before));
      const release = holdTheClock([file, path.dirname(file)]);
      try {
        const s0 = seen(file);
        safeModWrite(file, next, "test-same-tick");
        ok(!realRead(file).equals(before) && realRead(file).length === before.length && seen(file) === s0, "(the saved state catalogue's file rewritten by Nova at the same size, and stat sees nothing of it)");
        const after = await readsFor(() => later(6));
        ok(after.reads === 1 && after.owner === "ITA", "⭐⭐ the state catalogue saved before the write is not taken back once the one in memory has had its five minutes: the file is read again, and says ITA", after);
        const again = await readsFor(() => later(12));
        ok(again.reads === 0, "⭐ …and the one saved after the write is taken back, five minutes on again, without reading the file: Nova's writes are saved beside it", again);
        ok(again.owner === "ITA", "⭐ …and says ITA", again);
        // (the answer it took back is kept in memory under the same writes, or every question after a disk hit read it again)
        const savedReads = readsOf(savedStates(STATES_SAVED)), minuteOn = await readsFor(() => later(13));
        ok(minuteOn.reads === 0 && readsOf(savedStates(STATES_SAVED)) === savedReads && minuteOn.owner === "ITA", "⭐ …and a minute on it is answered from memory: neither the file nor the saved copy is read", { ...minuteOn, savedReads: readsOf(savedStates(STATES_SAVED)) - savedReads });
      } finally { release(); }
    }
    // …and a modder's own edit in their text editor — no write of Nova's to count — at a new size: the answer in memory was kept
    // five minutes on the time alone, so it went on saying GER whatever had changed
    {
      const file = statesFile(STATES_EDIT), ask = stateCatalog(STATES_EDIT);
      const first = await ask(), n = readsOf(file), warm = await ask();
      ok(ownerOf1(first) === "GER" && ownerOf1(warm) === "GER" && readsOf(file) === n, "(the fixture: state 1 is GER's, and the second question is answered without reading its file)", { reads: readsOf(file) - n });
      fs.writeFileSync(file, realRead(file, "latin1").replace("owner=GER", "owner=SWE\n\t\tadd_core_of=SWE"), "latin1");
      const m = readsOf(file), b = await ask();
      ok(readsOf(file) - m === 1 && ownerOf1(b) === "SWE", "⭐⭐ a modder's own edit at a new size is seen at the next question, not five minutes on", { reads: readsOf(file) - m, owner: ownerOf1(b) });
    }
    // ⛔ …and the NEXT LAUNCH, which has no writes of its own to compare (savedInTheTickOf): an answer saved, a same-size write of
    // Nova's in the very tick it was saved in, and no question after it — the next launch took the saved copy back and said GER
    // (review of the fix round). A write can share a tick with the save only when the file's last write did too, so the tick is
    // not left to chance: the file's time and the saved copy's are set to one whole second, as one tick leaves them.
    console.log("\n-- the saved catalogues at the next launch, after a write in the tick their answer was saved in --");
    const PIN = 1700000000;
    const savedNow = (prefix) => new Set(fs.readdirSync(ICON_CACHE_DIR).filter((n) => n.startsWith(prefix)));
    const tickAsks = [];
    for (const [k, url, file, prefix, rewrite, valueOf, was, now] of [
      ["research", `/api/technologies/catalog?modPath=${encodeURIComponent(TICK.techs)}`, path.join(TICK.techs, "common", "technologies", "tst.txt"), "techcatalog_", swap("research_cost = 1.5", "research_cost = 2.5"), costOfTech, "1.5", "2.5"],
      ["equipment", `/api/equipment/list?modPath=${encodeURIComponent(TICK.equipment)}`, path.join(TICK.equipment, "common", "units", "equipment", "tst.txt"), "equipcatalog_", swap("defense = 20", "defense = 30"), defenceOf, "20", "30"],
      ["country", `/api/countries/catalog?modPath=${encodeURIComponent(TICK.countries)}`, path.join(TICK.countries, "localisation", "english", "tst_l_english.yml"), "countrycatalog_", swap("Bravo", "Delta"), nameOfBBB, "Bravo", "Delta"],
      ["state", `/api/buildings/state-catalog?${new URLSearchParams({ modPath: TICK.states, countryTag: "GER" })}`, statesFile(TICK.states), "statecatalog_", swap("owner=GER", "owner=ITA"), ownerOf1, "GER", "ITA"],
    ]) {
      fs.utimesSync(file, PIN, PIN);
      const had = savedNow(prefix), b = await get(url), made = [...savedNow(prefix)].filter((n) => !had.has(n));
      ok(made.length === 1 && valueOf(b) === was, `(the ${k} catalogue: the fixture says ${was}, and the answer is saved)`, { made, value: valueOf(b) });
      if (made.length !== 1) continue;
      const saved = path.join(ICON_CACHE_DIR, made[0]), before = realRead(file);
      fs.utimesSync(saved, PIN, PIN);
      safeModWrite(file, rewrite(Buffer.from(before)), "test-same-tick");
      fs.utimesSync(file, PIN, PIN);
      ok(!realRead(file).equals(before) && realRead(file).length === before.length && fs.statSync(file).mtimeMs === PIN * 1000 && fs.statSync(saved).mtimeMs === PIN * 1000,
        `(the ${k} catalogue: its file rewritten by Nova at the same size, in the second its answer was saved in, and nothing asked after it)`);
      tickAsks.push({ k, url, file, valueOf, now });
    }
    // ⛔ …and the count is BESIDE each saved stamp, never in it (#loc-warm-fingerprint-never-matches): a fresh start — another process
    // on the same app data, which has written nothing — takes every saved catalogue back without reading its file. Asked once more
    // here first with the clock let go, so what is saved carries the files' real times, as it would in use: in a later tick than the
    // last write (above, a few questions back for the state catalogue), which a clock of 15.6 ms ticks does not promise without a wait.
    await new Promise((r) => setTimeout(r, 50));
    const askAll = [
      { url: `/api/technologies/catalog?modPath=${encodeURIComponent(TECHS)}`, file: path.join(TECHS, "common", "technologies", "tst.txt") },
      { url: `/api/equipment/list?modPath=${encodeURIComponent(EQUIP)}`, file: path.join(EQUIP, "common", "units", "equipment", "tst.txt") },
      { url: `/api/countries/catalog?modPath=${encodeURIComponent(COUNTRIES)}`, file: path.join(COUNTRIES, "localisation", "english", "tst_l_english.yml") },
      { url: `/api/buildings/state-catalog?${new URLSearchParams({ modPath: STATES_SAVED, countryTag: "GER" })}`, file: statesFile(STATES_SAVED) },
    ];
    for (const a of askAll) await get(a.url);
    const coldAsk = { url: `/api/technologies/catalog?modPath=${encodeURIComponent(TECHS_COLD)}`, file: path.join(TECHS_COLD, "common", "technologies", "tst.txt") };
    const fresh = freshStart(askAll.concat(coldAsk, tickAsks.map(({ url, file }) => ({ url, file }))));
    ok(fresh.ok, "(the fresh start ran)", fresh.error);
    const [fTech, fEquip, fCountries, fStates, fCold, ...fTick] = fresh.answers || [];
    ok(tickAsks.length === 4, "(the four saved catalogues were each saved in the tick of a write after them)", tickAsks.map((t) => t.k));
    for (const [i, t] of tickAsks.entries()) {
      const a = fTick[i];
      ok(a && a.reads > 0 && t.valueOf(a.body) === t.now, `⭐⭐ the next launch does not take back the ${t.k} catalogue saved in the tick of the write after it: it reads the file again, and says ${t.now}`, a && { reads: a.reads, value: t.valueOf(a.body) });
    }
    ok(fCold && techRun && fCold.reads === techRun.cold && costOfTech(fCold.body) === "1.5", `(CONTROL: in the fresh start a catalogue nobody built reads its file ${techRun && techRun.cold}x, as the first question here did)`, fCold && { reads: fCold.reads });
    ok(fTech && fTech.reads === 0 && costOfTech(fTech.body) === "2.5", "⭐⭐ …and the research catalogue saved after the write is taken back without reading its file, and says 2.5", fTech && { reads: fTech.reads, cost: costOfTech(fTech.body) });
    ok(fEquip && fEquip.reads === 0 && defenceOf(fEquip.body) === "30", "⭐⭐ …the equipment catalogue too, and says 30", fEquip && { reads: fEquip.reads, defence: defenceOf(fEquip.body) });
    ok(fCountries && fCountries.reads === 0 && nameOfBBB(fCountries.body) === "Delta", "⭐⭐ …and the country catalogue, which says Delta", fCountries && { reads: fCountries.reads, name: nameOfBBB(fCountries.body) });
    ok(fStates && fStates.reads === 0 && ownerOf1(fStates.body) === "ITA", "⭐⭐ …and the state catalogue, which says ITA", fStates && { reads: fStates.reads, owner: ownerOf1(fStates.body) });

    console.log("\n-- the country thumbnail's bitmap (getThumbContext: the modified time alone) --");
    let png0 = null;
    await sameTick("the country thumbnail", path.join(MOD, "map", "provinces.bmp"), () => get(`/api/map/country-thumb?modPath=${q}&tag=AAA`), (b) => {
      const o = Buffer.from(b); for (let y = 0; y < H; y++) for (let x = 32; x < 48; x++) { const i = 54 + y * rs + x * 3; o[i] = 200; o[i + 2] = 0; } return o;   // a quarter of AAA's land to province 1
    }, { before: (b) => { png0 = b.text; ok(b.bytes > 0, "(the fixture: AAA's thumbnail is drawn)", b.status); }, after: (b) => ok(b.text !== png0, "⭐ …and the thumbnail is drawn from the new bitmap", b.status) });

    console.log("\n-- the country names a catalogue rebuild reads (getCountryLocNames, fresh) --");
    // a fresh read skips the hour-long memo and the localisation epoch, and keeps its answer while the files' stamp stands:
    // the catalogue asks for it only when something else changed, and saves what it is given beside a fingerprint of the files
    ok(typeof srv.getCountryLocNames === "function", "(server.js exports getCountryLocNames for this section)");
    const countryNames = typeof srv.getCountryLocNames === "function" ? srv.getCountryLocNames : () => ({});
    await sameTick("the country names (getCountryLocNames)", path.join(NAMES, "localisation", "english", "tst_l_english.yml"), async () => countryNames(NAMES, { fresh: true }), swap("Alpha", "Omega"), {
      before: (n) => ok(n && n.AAA === "Alpha", "(the fixture: AAA is named Alpha)", n),
      after: (n) => ok(n && n.AAA === "Omega", "⭐ …and after it, Omega", n) });

    console.log("\n-- a mod's replace_path lines (getModReplacePaths) and the launcher's .mod files (readModsFolderRegistry) --");
    const inherited = (b) => (b.events || []).map((e) => e.fullId).sort().join(",");
    // three reads the first time: the dependency names (every request), getModReplacePaths, and the localisation map's own
    // dependency lookup, which that map keeps for LOC_MAP_TTL_MS — a time, not a stamp, so it is not this test's
    await sameTick("the replace_path lines behind the inherited events list", path.join(REPLACING, "descriptor.mod"), () => get(`/api/events/list?modPath=${encodeURIComponent(REPLACING)}&includeInherited=1`), swap('replace_path="events"', 'replace_path="eventz"'), {
      stampedReads: 1,
      before: (b) => ok(inherited(b) === "tst.1", "(the fixture: replace_path=\"events\" drops the game's events)", inherited(b)),
      after: (b) => ok(inherited(b) === "base.1,tst.1", "⭐ …and after the line is changed, the game's event loads again", inherited(b)) });
    // a .mod file the launcher registry has never read, and the registry's 1.5 s memo run out, so the first question is cold
    const late = write(MODS, "late.mod", 'name="Late"\npath="C:/somewhere/aaaa"\n');
    await new Promise((r) => setTimeout(r, 1600));
    const lateEntry = () => (srv.readLauncherRegistry().find((e) => /Late/.test(JSON.stringify(e))) || null);
    await sameTick("the launcher's .mod files (readModsFolderRegistry, which also keeps its answer 1.5 s)", late, async () => lateEntry(), swap("somewhere/aaaa", "somewhere/bbbb"), {
      before: (e) => ok(/aaaa/.test(JSON.stringify(e)), "(the fixture: the launcher's Late mod points at …/aaaa)", e),
      after: (e) => ok(/bbbb/.test(JSON.stringify(e)), "⭐ …and after it, at …/bbbb", e) }, 1600);
  } catch (e) {
    fail++;
    console.log("  FAIL (threw) " + (e && e.stack || e));
  } finally {
    fs.readFileSync = realRead; fs.readFile = realReadCb; fs.promises.readFile = realReadP;
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* temp */ }
  }
  console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
