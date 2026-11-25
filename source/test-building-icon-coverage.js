// #buildings-missing-from-icon-table · ⛔ #nova-ships-no-third-party-art — EVERY BUILDING THE GAME DEFINES IS ONE THE ICON
// TABLES KNOW; IT GETS AN ICON WHERE A LAYER HAS ART FOR IT, AND A CLEAN EMPTY ANSWER WHERE NONE HAS.
//
// Nine buildings the game defines had no row in the state panel's icon tables, so a state holding them showed a blank where
// the icon goes. A tenth row, `floating_harbor`, was not a building at all: it is equipment
// (common/units/equipment/floating_harbor.txt). The check is written against the GAME's building list, never a fixed list of
// the nine, so a building a future patch or DLC adds shows up here instead of silently rendering blank. Landmarks and the
// `_spawn` helpers are left out: they are placed by script, not offered in the panel.
//
// A static scan of the sprite tables would not have found that and gave the wrong answer (it called 13 rows dead): a texture
// file lookup runs BEFORE the sprite names, so only the endpoint knows. That is why this drives /api/buildings/icon-map.
//
// Until 1.0.7 two of the nine resolved to Nova's own bundled art (public/GFX/Railway.png, Civilian_Nuclear_Reactor.png), and
// this test pinned that. None of public/GFX's 40 icons was Nova's (17 Paradox's, 23 the Toolpack Workshop mod's), and they are
// gone for the 1.0.7 licence. Every icon now comes from the player's own install, so "every building resolves" became a
// statement about the install, and this holds what it can hold anywhere:
//   1. the game Nova uses (its own detection, never a typed path) and the buildings it defines;
//   2. every one of them is a row of the icon tables: the endpoint's own default list, which is the tables' keys;
//   3. on that install each answer is well formed: an icon with a url that loads and a file in the mod, the game or a Workshop
//      item, none of Nova's own; or found:false with no url, which the panel draws as its empty box
//      (test-building-icons-actually-load.js runs the page on such answers). And the buildings the game draws with ONE icon
//      (the same icon_frame of its building strip) all get an icon or none does: the heavy-water reactor, which shares the
//      reactor's, went blank where the reactor had the Toolpack's picture, because only the copy Nova shipped was named for it;
//   4. every picture the Toolpack mod keeps (bst_*, in a folder the lookup searches) in any Workshop item on this machine is
//      named by the file-name table: bst_milf, its arms factory, was named by no row for as long as Nova shipped a military
//      factory picture of its own. A byte copy of a named picture is not excused: the lookup finds a file only by a name a row
//      gives, so the copy is shown for no building, and its twin only where that other item is installed. That excuse made
//      this pass here and fail where Millennium Dawn's copy of the Toolpack, with its bst_railway, is the only one (review
//      M2, 2026-11-19). The names and folders are read out of server.js;
//   5. on a FIXTURE game whose interface declares a GFX_building_<type> sprite for every one of them, every one resolves, to
//      its own sprite's file: an icon resolves wherever the game has one;
//   6. on a FIXTURE game with no art and an empty Workshop, every one answers found:false with no url: none reaches for a
//      copy of its own. Sections 1-4 skip, with a line the runner hears, where Nova finds no game (4 alone where no Toolpack
//      is installed); 5 and 6 then use the tables' own list and always run.
//
// ⚠️ THIS TEST ASKS WHAT RESOLVED AND FETCHES ONLY THE BUILDING LIST'S URLS. Whether the STATE PANEL's urls load, with a mod
// selected, and what the page draws for each answer, is test-building-icons-actually-load.js.
"use strict";
// An app-data folder of this process's own, so an icon cache of its own: section 3 fetches the install's pictures, and so does
// test-building-icons-actually-load.js, which says why one cache between two servers is not safe.
require("./testlib-own-app-data.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bicov-"));
process.env.HOI4_MODS_ROOT = ROOT;
// Each fixture's Workshop is the one beside its game: a HOI4_WORKSHOP_ROOT from the environment would add another.
delete process.env.HOI4_WORKSHOP_ROOT;
const OWN_HOI4_ROOT = process.env.HOI4_ROOT;
const S = require("./server.js");
const { createApp, setActiveRoot, resolveHoi4GameRoot, hoi4GameFolderFound } = S;

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    const why = "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500);
    // …and into the summary: run-tests.js shows a failing file's last 12 lines, which is where the summary lands.
    fails.push(label + why);
    console.log("  FAIL " + label + why);
  }
}
const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const under = (file, dir) => {
  if (!file || !dir) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
};

/** A real 2x2 PNG of one colour. */
function png(r, g, b) {
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.from([0, r, g, b, r, g, b]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat([row, row]))), chunk("IEND", Buffer.alloc(0))]);
}

const MOD = path.join(ROOT, "bicovmod");
const FOCUS = write(path.join(MOD, "common", "national_focus", "probe.txt"), "focus_tree = { id = probe }\n");
write(path.join(MOD, "descriptor.mod"), 'name="BiCovMod"\nsupported_version="1.18.*"\n');
const FX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bicov-fx-"));
/** A fixture game laid out as Steam lays one out, with an empty Workshop beside it (else Nova reads the real one). */
function fixtureGame(name) {
  const game = path.join(FX, name, "steamapps", "common", "Hearts of Iron IV");
  write(path.join(game, "hoi4.exe"), "MZ");
  fs.mkdirSync(path.join(FX, name, "steamapps", "workshop", "content", "394360"), { recursive: true });
  return game;
}

// Read the game's own building list — the source of truth for "what can a state have".
function realBuildings(gameRoot) {
  const dir = path.join(gameRoot, "common", "buildings");
  if (!fs.existsSync(dir)) return [];
  const out = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "latin1"); } catch (_) { continue; }
    let depth = 0;
    for (const line of t.split(/\r?\n/)) {
      const c = line.replace(/#.*$/, "");
      if (depth === 1) {
        const m = /^\s*([a-z_0-9]+)\s*=\s*\{/.exec(c);
        if (m) out.add(m[1]);
      }
      depth += (c.match(/\{/g) || []).length - (c.match(/\}/g) || []).length;
    }
  }
  // Landmarks are pre-placed wonders and the *_spawn entries are script helpers — neither is offered in the
  // panel as something a modder sets a level on.
  return [...out].filter((k) => !k.startsWith("landmark_") && !k.endsWith("_spawn"));
}
// Which icon the game draws each building with: its icon_frame, a frame of the one building strip (GFX_buildings_strip).
function iconFrames(gameRoot) {
  const dir = path.join(gameRoot, "common", "buildings");
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((x) => x.endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "latin1"); } catch (_) { continue; }
    let depth = 0, cur = "";
    for (const line of t.split(/\r?\n/)) {
      const c = line.replace(/#.*$/, "");
      if (depth === 1) { const m = /^\s*([a-z_0-9]+)\s*=\s*\{/.exec(c); if (m) cur = m[1]; }
      if (depth === 2 && cur) { const m = /^\s*icon_frame\s*=\s*(\d+)/.exec(c); if (m) out.set(cur, Number(m[1])); }
      depth += (c.match(/\{/g) || []).length - (c.match(/\}/g) || []).length;
      if (depth === 0) cur = "";
    }
  }
  return out;
}
// The lookup's own tables, out of server.js with its comments masked (their prose names files too): every file name
// BUILDING_ICON_FILENAME_CANDIDATES gives, and the folders resolveBuildingIconDirectPath searches. Brackets are counted in
// the text with every literal blanked as well; a table that is missing, or found twice, answers null and fails below.
function lookupTablesFromServer() {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const code = maskJsComments(src), bare = maskJsLiterals(src);
  const span = (opening) => {
    const s = code.indexOf(opening);
    if (s < 0 || code.indexOf(opening, s + 1) >= 0) return null;
    const open = s + opening.length - 1, close = { "{": "}", "[": "]" }[code[open]];
    let d = 0;
    for (let i = open; i < bare.length; i++) {
      if (bare[i] === code[open]) d++;
      else if (bare[i] === close && --d === 0) return code.slice(open, i + 1);
    }
    return null;
  };
  const strings = (t) => [...String(t).matchAll(/"([^"\\]*)"/g)].map((m) => m[1]);
  const table = span("const BUILDING_ICON_FILENAME_CANDIDATES = {");
  const dirs = span("const relDirs = [");
  return {
    names: table == null ? null : new Set(strings(table).map((s) => s.toLowerCase())),
    folders: dirs == null ? null : [...dirs.slice(1, -1).matchAll(/\[([^\[\]]*)\]/g)].map((m) => strings(m[1])),
  };
}

const PORT = 42247;
const app = createApp();
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  // What the panel sends: the open focus file, which names the mod. (`modPath` is a parameter the endpoint never reads.)
  const ask = async (types) => {
    const q = (types ? `types=${types.join(",")}&` : "") + `focusPath=${encodeURIComponent(FOCUS)}`;
    const r = await fetch(`${base}/api/buildings/icon-map?${q}`);
    const body = await r.json().catch(() => null);
    return (body && body.icons) || {};
  };
  const fileOf = (e) => {
    const k = String((e && e.key) || "");
    if (k.startsWith("file:")) return k.slice(5);
    try { return new URL(String(e.url || ""), base).searchParams.get("path") || ""; } catch (_) { return ""; }
  };
  try {
    setActiveRoot(MOD);

    console.log("\n1. The game Nova uses, and the buildings it defines");
    const gameFound = hoi4GameFolderFound();
    const GAME = gameFound ? resolveHoi4GameRoot() : "";
    const buildings = gameFound ? realBuildings(GAME) : [];
    const defaults = await ask(null);
    const tableKeys = Object.keys(defaults);
    rec("the icon tables' own list (the endpoint's default) is not empty", tableKeys.length > 10, tableKeys.length);
    rec("floating_harbor is not offered as a building", !tableKeys.includes("floating_harbor"), tableKeys);
    if (!gameFound) {
      console.log("  SKIP — Nova found no Hearts of Iron IV on this machine: the game's building list was not read (sections 2 to 4); the fixtures use the tables' own list");
    } else {
      console.log(`     (the game: ${GAME})`);
      rec("the game's building list was read", buildings.length > 20, buildings.length);
      rec("…and the game agrees floating_harbor is not one", !buildings.includes("floating_harbor"), "the game defines it as a building after all — re-check");

      console.log("\n2. Every building the game defines is a row of the icon tables");
      const missing = buildings.filter((b) => !tableKeys.includes(b));
      rec(`all ${buildings.length} are among the tables' ${tableKeys.length} rows`, missing.length === 0, missing);

      console.log("\n3. On this install, each answer is an icon that loads from the mod, the game or the Workshop, or a clean empty one");
      const icons = await ask(buildings);
      rec("icon-map answered for every building asked about", buildings.every((b) => icons[b]), buildings.filter((b) => !icons[b]));
      const ws = S.constants.WORKSHOP_ROOT;
      const layerOf = (f) => under(f, MOD) ? "mod" : under(f, GAME) ? "game" : (ws && under(f, ws)) ? "workshop" : under(f, __dirname) ? "nova" : "elsewhere";
      const bad = [];
      let withIcon = 0;
      for (const b of buildings) {
        const e = icons[b] || {};
        if (e.found !== true) { if (e.url) bad.push(`${b}: found:false with a url`); continue; }
        withIcon++;
        const f = fileOf(e), where = layerOf(f);
        if (!e.url) { bad.push(`${b}: found with no url`); continue; }
        if (!["mod", "game", "workshop"].includes(where)) { bad.push(`${b}: ${where} <- ${f}`); continue; }
        const res = await fetch(e.url.startsWith("http") ? e.url : base + e.url);
        const ct = String(res.headers.get("content-type") || "");
        await res.arrayBuffer();
        if (!res.ok || !/^image\//.test(ct)) bad.push(`${b}: ${res.status} ${ct} <- ${where}`);
      }
      rec(`every answer is well formed (${withIcon} with an icon, ${buildings.length - withIcon} with the empty box)`, withIcon > 0 && bad.length === 0, bad);
      const blank = buildings.filter((b) => !(icons[b] && icons[b].found === true));
      if (blank.length) console.log(`     (no layer on this machine has art for: ${blank.join(", ")})`);
      const frames = iconFrames(GAME), byFrame = new Map();
      for (const b of buildings) if (frames.has(b)) byFrame.set(frames.get(b), [...(byFrame.get(frames.get(b)) || []), b]);
      const shared = [...byFrame.values()].filter((g) => g.length > 1);
      const split = shared.filter((g) => new Set(g.map((b) => !!(icons[b] && icons[b].found === true))).size > 1)
        .map((g) => g.map((b) => `${b}${icons[b] && icons[b].found === true ? "" : " (none)"}`).join(" / "));
      rec(`the ${shared.length} groups of buildings the game draws with one icon (one icon_frame) get an icon alike: all or none`,
        frames.size > 20 && shared.length > 0 && split.length === 0, split.length ? split : `${frames.size} icon frames read`);

      console.log("\n4. Every picture a Toolpack on this machine keeps is one the file-name table names");
      // The Toolpack mod (Workshop 1417069016, and copies such as Millennium Dawn's) names its building art bst_*, and the lookup
      // finds a file only by a name a row gives. So each picture needs a name in the table: one that is byte for byte another
      // item's named picture is shown for no building, and a verdict that excused it would hang on which items are installed.
      const { names, folders } = lookupTablesFromServer();
      rec("the file-name table and the searched folders were read out of server.js", !!names && names.size > 20 && !!folders && folders.length > 0,
        { names: names && names.size, folders });
      const items = [];
      try { for (const d of fs.readdirSync(ws)) if (/^\d+$/.test(d)) items.push(path.join(ws, d)); } catch (_) { /* no Workshop */ }
      const pics = [];
      for (const item of items) for (const parts of folders || []) {
        let ents = [];
        try { ents = fs.readdirSync(path.join(item, ...parts), { withFileTypes: true }); } catch (_) { continue; }
        for (const e of ents) if (e.isFile() && /^bst_/i.test(e.name)) pics.push(path.join(item, ...parts, e.name));
      }
      if (!pics.length) {
        console.log(`  SKIP — no Toolpack picture (bst_*) in any of this machine's ${items.length} Workshop item(s): none to hold to the table`);
      } else {
        const stem = (f) => path.basename(f, path.extname(f)).toLowerCase();
        const unnamed = pics.filter((f) => !(names && names.has(stem(f)))).map((f) => path.relative(ws, f));
        const holders = new Set(pics.map((f) => path.relative(ws, f).split(path.sep)[0]));
        rec(`all ${pics.length} in ${holders.size} Workshop item(s) (${[...holders].join(", ")}) are named by the file-name table`,
          unnamed.length === 0, unnamed);
      }
    }

    // The fixtures take the game's list, or the tables' own where there is no game.
    const LIST = buildings.length ? buildings : tableKeys;

    console.log(`\n5. A game whose interface has a GFX_building_<type> sprite for each of the ${LIST.length}: every one resolves to it`);
    const GAME_A = fixtureGame("with-art");
    const own = {};
    LIST.forEach((b, i) => { own[b] = write(path.join(GAME_A, "gfx", "interface", "nova_fixture", b + ".png"), png((i * 37) % 256, (i * 71) % 256, 90)); });
    write(path.join(GAME_A, "interface", "nova_fixture_buildings.gfx"), "spriteTypes = {\n" + LIST.map((b) =>
      `\tspriteType = {\n\t\tname = "GFX_building_${b}"\n\t\ttexturefile = "gfx/interface/nova_fixture/${b}.png"\n\t}\n`).join("") + "}\n");
    process.env.HOI4_ROOT = GAME_A;
    rec("Nova uses the fixture's game", path.resolve(resolveHoi4GameRoot()) === path.resolve(GAME_A), resolveHoi4GameRoot());
    const a = await ask(LIST);
    const offA = LIST.filter((b) => !(a[b] && a[b].found === true && path.resolve(fileOf(a[b]) || ".") === path.resolve(own[b])))
      .map((b) => `${b}: ${a[b] && a[b].found ? fileOf(a[b]) : "not found"}`);
    rec(`all ${LIST.length} resolve, each to its own sprite's file`, offA.length === 0, offA);

    console.log("\n6. A game with no art and an empty Workshop: every one answers found:false with no url");
    const GAME_B = fixtureGame("no-art");
    process.env.HOI4_ROOT = GAME_B;
    rec("Nova uses the second fixture's game", path.resolve(resolveHoi4GameRoot()) === path.resolve(GAME_B), resolveHoi4GameRoot());
    const bAns = await ask(LIST);
    const offB = LIST.filter((b) => !bAns[b] || bAns[b].found !== false || bAns[b].url)
      .map((b) => `${b}: ${bAns[b] ? (bAns[b].found ? "found " + fileOf(bAns[b]) : "url " + bAns[b].url) : "no answer"}`);
    rec(`all ${LIST.length} answer found:false, with no url`, offB.length === 0, offB);

    console.log(`\n=== building icon coverage: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (OWN_HOI4_ROOT === undefined) delete process.env.HOI4_ROOT; else process.env.HOI4_ROOT = OWN_HOI4_ROOT;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    for (const d of [ROOT, FX]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
