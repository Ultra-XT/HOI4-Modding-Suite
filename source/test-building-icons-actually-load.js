// #bundled-building-icons-are-not-allowed · ⛔ #nova-ships-no-third-party-art — EVERY BUILDING ICON THE STATE PANEL IS HANDED
// LOADS, AND A TYPE NO LAYER HAS ART FOR SHOWS A CLEAN EMPTY BOX, NOT A BROKEN IMAGE.
//
// The focus tree's state panel shows an icon per building type. Measured against the running app, sending exactly what
// public/app.js sends: 22 of the 22 STATE_INFO_BUILDING_TYPES resolved, and all 22 of their URLs came back 400 {"error":"Asset
// path not allowed."}. They were Nova's own bundled copies in public/GFX, and /api/asset admits no file of Nova's own. It only
// bit once a mod was selected (with none, the active root sits above the app folder and admits it), and the coverage test asked
// only whether an icon RESOLVED, never fetched its URL, so it passed with all 22 broken. So this test does the two things that
// one could not: it selects a mod, and it FETCHES every URL the endpoint hands out.
//
// Until 1.0.7 those icons were public/GFX's 40 files, and none of them was Nova's: 17 were Paradox's (two game textures and
// fifteen HOI4-wiki PNGs) and 23 the Toolpack Workshop mod's. They are gone for the 1.0.7 licence, and with them the shim
// that linked them straight at public/. Every icon now comes from the player's own install: the selected mod, the game, every
// Workshop item (the Toolpack's gfx/toolpack_interface/bst_interface/buildings among them). So this holds:
//   1. on a FIXTURE install whose every layer the test wrote itself (so it runs on any machine): the mod's icon wins, the
//      Toolpack's is used where the mod has none, the game's sprite where neither has art, and every other type answers
//      found:false with NO url; every url loads and serves the very file it named; nothing comes from Nova's own folder;
//   2. on the install Nova finds on this machine: every type answers, every url loads, an unresolved type has no url, and every
//      file lies in the mod, the game or a Workshop item, never in Nova's folder;
//   3. /api/asset refuses every picture of Nova's own, and for its folder: each one git tracks, of a type the endpoint serves,
//      loads once copied into the mod and is refused as "not allowed" where it lies. The fix was never "admit the app folder";
//   4. THE PAGE: public/app.js's own renderEffectListWizardStateInfoPanel, run in node on the server's answers above, draws the
//      empty placeholder (no <img> at all) for every found:false type, swaps a failed <img> for it through an addEventListener
//      handler (CSP: no inline handlers), and styles.css draws the box and hides what the handler hides. Its detectors are run
//      on doctored copies of the function first, so a pass is not a blind one.
// Section 2 skips, with a line the runner hears, on a machine where Nova finds no game; sections 1, 3 and 4 always run.
"use strict";
// An app-data folder of this process's own, so an icon cache of its own. run-tests.js hands every file of a run ONE, and two
// servers turning the same uncached .dds into a PNG in one cache at once answer 500 EBUSY (measured 2026-11-18: 4 of 60 cold
// fetches made from two servers in the same tick, with one cache between them; 0 of 60 with one each).
// test-building-icon-coverage.js fetches the same pictures of the same install; run beside it, this failed its url check once
// in 14 runs, and passed alone.
require("./testlib-own-app-data.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bicoload-"));
process.env.HOI4_MODS_ROOT = ROOT;
// The fixture's Workshop is the one beside its game: a HOI4_WORKSHOP_ROOT from the environment would add another.
delete process.env.HOI4_WORKSHOP_ROOT;
const OWN_HOI4_ROOT = process.env.HOI4_ROOT;
const S = require("./server.js");
const { createApp, setActiveRoot, resolveHoi4GameRoot, hoi4GameFolderFound } = S;
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  const why = detail == null ? "" : "   " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400);
  console.log((ok ? "  ok   " : "  FAIL ") + label + why);
  // …and into the summary: run-tests.js shows a failing file's last 12 lines, which is where the summary lands.
  if (!ok) fails.push(label + why);
};
const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const under = (file, dir) => {
  if (!file || !dir) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
};
const NOVA = __dirname;

/** A real 2x2 PNG of one colour, so each fixture icon's bytes are its own. */
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

// Derived from the page itself. Typing the list here would let it drift from what the panel actually asks for, and this bug
// was invisible precisely because nobody checked the real request.
const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8").replace(/\r\n/g, "\n");
const APP_CODE = maskJsComments(APP);
const APP_BARE = maskJsLiterals(APP);
function stateBuildingTypesFromApp() {
  const at = APP_CODE.indexOf("const STATE_INFO_BUILDING_TYPES = [");
  if (at === -1) return [];
  const end = APP_CODE.indexOf("];", at);
  return (APP.slice(at, end).match(/"([a-z0-9_]+)"/g) || []).map((s) => s.replace(/"/g, ""));
}
/** The picture types /api/asset serves: the Set that resolveAssetPath's own body asks `.has(path.extname(...))` of, and that
 *  Set's literal, read out of server.js with comments masked. Derived, so a type the endpoint gains or drops moves with it;
 *  an empty answer fails section 3, never passes it. */
function assetExtensionsFromServer() {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const code = maskJsComments(src);
  const at = code.indexOf("function resolveAssetPath(");
  const body = at === -1 ? null : jsBodyAt(maskJsLiterals(src), at);
  const set = body && /([A-Za-z_$][\w$]*)\.has\(\s*path\.extname\(/.exec(code.slice(body[0], body[1] + 1));
  const decl = set && new RegExp("\\bconst\\s+" + set[1].replace(/\$/g, "\\$") + "\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)").exec(code);
  return new Set(decl ? [...decl[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1].toLowerCase()) : []);
}

// ── the mod, and the fixture install: a game and a Workshop beside it, as Steam lays them out ──────────────────────────────
const MOD = path.join(ROOT, "iconloadmod");
const FOCUS = write(path.join(MOD, "common", "national_focus", "probe.txt"), "focus_tree = { id = probe }\n");
write(path.join(MOD, "descriptor.mod"), 'name="iconloadmod"\n');
const FX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bicoload-fx-"));
const FX_GAME = path.join(FX, "steamapps", "common", "Hearts of Iron IV");
write(path.join(FX_GAME, "hoi4.exe"), "MZ");
// The game's own convention: a building's sprite is GFX_building_<type>, declared under interface/.
const GAME_TYPE = "radar_station";
const GAME_FILE = write(path.join(FX_GAME, "gfx", "interface", "nova_fixture", GAME_TYPE + ".png"), png(200, 40, 40));
write(path.join(FX_GAME, "interface", "nova_fixture_buildings.gfx"),
  `spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_building_${GAME_TYPE}"\n\t\ttexturefile = "gfx/interface/nova_fixture/${GAME_TYPE}.png"\n\t}\n}\n`);
// The Toolpack (Workshop 1417069016) names its building art bst_*: bst_dock is the dockyard's, bst_civf the civilian factory's.
const TOOLPACK = path.join(FX, "steamapps", "workshop", "content", "394360", "1417069016", "gfx", "toolpack_interface", "bst_interface", "buildings");
const TOOLPACK_TYPE = "dockyard";
const TOOLPACK_FILE = write(path.join(TOOLPACK, "bst_dock.png"), png(40, 200, 40));
const TOOLPACK_SHADOWED = write(path.join(TOOLPACK, "bst_civf.png"), png(40, 40, 200));
// …and the mod has its own civilian factory, which must win over the Toolpack's.
const MOD_TYPE = "industrial_complex";
const MOD_FILE = write(path.join(MOD, "gfx", "interface", "buildings", MOD_TYPE + ".png"), png(200, 200, 40));
const FIXTURE_EXPECT = { [MOD_TYPE]: MOD_FILE, [TOOLPACK_TYPE]: TOOLPACK_FILE, [GAME_TYPE]: GAME_FILE };

/** The file an answer points at: the path in its key (a direct file) or in its url (a sprite's texture). */
function fileOf(entry, base) {
  const k = String((entry && entry.key) || "");
  if (k.startsWith("file:")) return k.slice(5);
  try { return new URL(String(entry.url || ""), base).searchParams.get("path") || ""; } catch (_) { return ""; }
}

/** Ask what the panel asks, fetch every url the answer hands out, and say where each file lies. */
async function askAndFetch(base, types, layers) {
  const r = await fetch(`${base}/api/buildings/icon-map?types=${types.join(",")}&focusPath=${encodeURIComponent(FOCUS)}`);
  const body = await r.json().catch(() => null);
  const icons = (body && body.icons) || {};
  const rows = [];
  for (const t of types) {
    const e = icons[t];
    const row = { type: t, answered: !!e, found: !!(e && e.found === true), url: String((e && e.url) || ""), file: e ? fileOf(e, base) : "" };
    row.layer = !row.file ? "" : (layers.find(([, dir]) => under(row.file, dir)) || ["elsewhere"])[0];
    if (row.url) {
      try {
        const res = await fetch(row.url.startsWith("http") ? row.url : base + row.url);
        row.status = res.status; row.ct = String(res.headers.get("content-type") || "");
        row.bytes = Buffer.from(await res.arrayBuffer());
      } catch (err) { row.status = "fetch failed: " + err.message; row.ct = ""; }
    }
    rows.push(row);
  }
  return { status: r.status, icons, rows };
}
const loads = (row) => row.status === 200 && /^image\//.test(row.ct);
const brief = (rows) => rows.map((x) => `${x.type}${x.found ? "" : " (none)"}${x.url ? " " + x.status : ""}${x.layer ? " <- " + x.layer : ""}`);

// ── the page: renderEffectListWizardStateInfoPanel and what it calls, lifted out of public/app.js ─────────────────────────
function liftConst(opening, close) {
  const s = APP_CODE.indexOf(opening);
  if (s < 0) throw new Error(`public/app.js has no "${opening}"`);
  const e = APP_CODE.indexOf(close, s);
  if (e < 0) throw new Error(`public/app.js: no end after "${opening}"`);
  return APP.slice(s, e + close.length);
}
function liftFunction(name) {
  const s = APP_BARE.indexOf("function " + name + "(");
  if (s < 0) throw new Error(`public/app.js has no function ${name}`);
  const b = jsBodyAt(APP_BARE, s);
  if (!b) throw new Error(`public/app.js: no body for ${name}`);
  return APP.slice(s, b[1] + 1);
}
const PAGE = [
  liftConst("const VANILLA_BUILDING_LABELS = {", "\n};"),
  liftConst("const STATE_INFO_BUILDING_TYPES = [", "\n];"),
  ...["escapeHtml", "getBuildingDisplayName", "getStateBuildingRule", "isSharedSlotsBuildingType", "renderEffectListWizardStateInfoPanel"].map(liftFunction),
].join("\n\n");

/** Enough of a DOM for what the panel does with its cards: innerHTML is parsed into elements that keep their attributes, a
 *  classList, their listeners and their next sibling; querySelectorAll answers "tag.class". */
function cardsElement() {
  const VOID = new Set(["img", "br", "hr", "input", "meta", "link"]);
  let html = "", els = [];
  const parse = (h) => {
    const out = [], stack = [];
    for (const m of h.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { while (stack.length && stack.pop().tag !== tag) { /* unwind to the matching open tag */ } continue; }
      const attrs = {};
      for (const a of m[3].matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
      const classes = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
      const el = {
        tag, attrs, parent: stack.length ? stack[stack.length - 1] : null, listeners: [], at: m.index,
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toArray: () => [...classes] },
        addEventListener(type, fn) { this.listeners.push({ type, fn }); },
        get nextElementSibling() { const i = out.indexOf(this); return out.slice(i + 1).find((x) => x.parent === this.parent) || null; },
        fire(type) { for (const l of this.listeners.filter((x) => x.type === type)) l.fn({ type, target: this }); },
      };
      out.push(el);
      if (!VOID.has(tag)) stack.push(el);
    }
    return out;
  };
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); els = parse(html); },
    get all() { return els; },
    querySelectorAll(sel) {
      const m = /^([a-z]+)?((?:\.[\w-]+)*)$/i.exec(sel);
      const tag = m && m[1] ? m[1].toLowerCase() : "";
      const cls = m ? m[2].split(".").filter(Boolean) : [];
      return els.filter((e) => (!tag || e.tag === tag) && cls.every((c) => e.classList.contains(c)));
    },
  };
}
/** Run the page's renderer, doctored by `edits` ([from, to] pairs, each of which must be found), on these icon answers. */
function renderPanel(iconMap, edits = []) {
  let code = PAGE;
  for (const [from, to] of edits) {
    if (code.indexOf(from) === -1) throw new Error("the control's anchor is not in the page any more: " + from);
    code = code.split(from).join(to);
  }
  const el = () => ({ textContent: "", innerHTML: "", classList: { add() {}, remove() {}, contains: () => false } });
  const cards = cardsElement();
  const ctx = {
    effectListWizardStateInfoPanelEl: el(), effectListWizardStateInfoTitleEl: el(), effectListWizardStateInfoMetaEl: el(),
    effectListWizardStateInfoSlotsEl: el(), effectListWizardStateInfoCardsEl: cards,
    localizationMap: {},
    collectPlannedStateBuildingDeltasForFocus: () => new Map(),
    effectListWizardState: {
      mode: "state_building_slots", selectedStateId: "1", focusId: "", isVanillaRoot: false, buildingRules: {},
      stateItems: [{ stateId: "1", displayName: "Fixture", ownerTag: "AAA", slots: { used: 0, cap: 4, sharedMax: 25 }, counts: {}, buildingRules: {} }],
      buildingIconMap: iconMap,
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\nthis.__render = renderEffectListWizardStateInfoPanel;\nthis.__types = STATE_INFO_BUILDING_TYPES;", ctx);
  ctx.__render(new Map());
  return { cards, types: [...ctx.__types] };
}
/** Each building card: its type (the name it shows: no loc and no vanilla root, so the type itself), its <img> and placeholder. */
function buildingCards(cards, types) {
  const cardEls = cards.all.filter((e) => e.tag === "div" && e.classList.contains("effect-list-state-card"));
  const out = [];
  for (const c of cardEls) {
    const inside = cards.all.filter((e) => { for (let p = e.parent; p; p = p.parent) if (p === c) return true; return false; });
    const nameEl = inside.find((e) => e.classList.contains("effect-list-state-card-name"));
    const after = nameEl ? cards.innerHTML.slice(cards.innerHTML.indexOf(">", nameEl.at) + 1) : "";
    const name = after.slice(0, after.indexOf("<"));
    if (!types.includes(name)) continue;           // the Shared Building Slots card
    out.push({ type: name, imgs: inside.filter((e) => e.tag === "img"),
      placeholders: inside.filter((e) => e.tag === "span" && e.classList.contains("effect-list-state-card-fallback")) });
  }
  return out;
}

const PORT = 42252;
const app = createApp();
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  try {
    // THE CONDITION THE OLD TEST NEVER CREATED: a mod selected. With none, the active root sits above the app folder.
    setActiveRoot(MOD);
    const types = stateBuildingTypesFromApp();
    rec("the panel's building list was read from app.js", types.length >= 20, types.length + " types");
    for (const t of Object.keys(FIXTURE_EXPECT)) rec(`the fixture's ${t} is one of the panel's types`, types.includes(t));

    console.log("\n1. A fixture install: the mod's icon, else the Toolpack's, else the game's sprite, else a clean empty answer");
    process.env.HOI4_ROOT = FX_GAME;
    rec("Nova uses the fixture's game", path.resolve(resolveHoi4GameRoot()) === path.resolve(FX_GAME), resolveHoi4GameRoot());
    const FX_LAYERS = [["the mod", MOD], ["the game", FX_GAME], ["the Toolpack", path.dirname(path.dirname(path.dirname(path.dirname(TOOLPACK))))], ["Nova's own folder", NOVA]];
    const fx = await askAndFetch(base, types, FX_LAYERS);
    rec("icon-map answered", fx.status === 200 && fx.rows.every((x) => x.answered), fx.rows.filter((x) => !x.answered).map((x) => x.type));
    for (const [t, file] of Object.entries(FIXTURE_EXPECT)) {
      const row = fx.rows.find((x) => x.type === t) || {};
      rec(`${t} resolves to ${path.relative(FX, file).startsWith("..") ? path.relative(ROOT, file) : path.relative(FX, file)}`,
        row.found && !!row.file && path.resolve(row.file) === path.resolve(file), row.file || row);
      rec(`…and its url loads that very file`, loads(row) && row.bytes && sha(row.bytes) === sha(fs.readFileSync(file)), { status: row.status, ct: row.ct });
    }
    const civ = fx.rows.find((x) => x.type === MOD_TYPE) || {};
    rec("the mod's own icon wins over the Toolpack's", !!civ.file && path.resolve(civ.file) !== path.resolve(TOOLPACK_SHADOWED), civ.file);
    const rest = fx.rows.filter((x) => !FIXTURE_EXPECT[x.type]);
    const notClean = rest.filter((x) => x.found || x.url);
    rec(`the other ${rest.length} types, which no layer has art for, answer found:false with no url`, rest.length > 0 && notClean.length === 0, brief(notClean));
    const nova = fx.rows.filter((x) => x.layer === "Nova's own folder" || x.layer === "elsewhere");
    rec("no answer points into Nova's own folder, or outside the fixture's layers", nova.length === 0, brief(nova));

    console.log("\n2. The install Nova finds on this machine");
    if (OWN_HOI4_ROOT === undefined) delete process.env.HOI4_ROOT; else process.env.HOI4_ROOT = OWN_HOI4_ROOT;
    if (!hoi4GameFolderFound()) {
      console.log("  SKIP — Nova found no Hearts of Iron IV on this machine: the real install's icons were not asked for (sections 1, 3 and 4 ran)");
    } else {
      const GAME = resolveHoi4GameRoot();
      const WS = S.constants.WORKSHOP_ROOT;
      const items = [];
      try { for (const d of fs.readdirSync(WS)) if (/^\d+$/.test(d)) items.push(path.join(WS, d)); } catch (_) { /* no Workshop */ }
      const LAYERS = [["the mod", MOD], ["the game", GAME], ...items.map((d) => ["Workshop " + path.basename(d), d]), ["Nova's own folder", NOVA]];
      const real = await askAndFetch(base, types, LAYERS);
      console.log(`     (the game: ${GAME}; ${items.length} Workshop item(s))`);
      rec("icon-map replied for every type asked about", real.rows.every((x) => x.answered), real.rows.filter((x) => !x.answered).map((x) => x.type));
      const found = real.rows.filter((x) => x.found);
      const broken = found.filter((x) => !loads(x));
      rec(`every url it hands out loads (${found.length} of ${types.length} types have one)`, found.length > 0 && broken.length === 0, brief(broken));
      const unclean = real.rows.filter((x) => !x.found && x.url);
      rec("a type it found no icon for has no url to draw a broken image with", unclean.length === 0, brief(unclean));
      const outside = found.filter((x) => !x.layer || x.layer === "Nova's own folder" || x.layer === "elsewhere");
      rec("every icon is a file of the mod, the game or a Workshop item, none of Nova's own", outside.length === 0, brief(outside));
      rec("some come from the game itself", found.some((x) => x.layer === "the game"),
        found.filter((x) => x.layer === "the game").length + " of " + found.length);
      const toolpacks = items.filter((d) => fs.existsSync(path.join(d, "gfx", "toolpack_interface", "bst_interface", "buildings")));
      if (toolpacks.length) {
        rec(`with a Toolpack installed (${toolpacks.map((d) => path.basename(d)).join(", ")}), some come from it`,
          found.some((x) => toolpacks.some((d) => under(x.file, d))), found.filter((x) => toolpacks.some((d) => under(x.file, d))).length + " of " + found.length);
      }
      const blank = real.rows.filter((x) => !x.found).map((x) => x.type);
      console.log(`     (${found.length} with an icon, ${blank.length} with the empty box${blank.length ? ": " + blank.join(", ") : ""})`);
    }

    console.log("\n3. /api/asset refuses every picture of Nova's own, for its folder");
    // Admitting the app folder would also have made the old icons load, and would let /api/asset serve every picture under
    // Nova's folder. ⚠ Until 2026-11-19 this asked for server.js, which the endpoint refuses for its type alone (a .js is no
    // picture), so a server.js that admitted the folder still passed it (review M3). So it asks only for what nothing but the
    // folder rule can refuse: every picture git tracks in Nova's folder, of a type /api/asset serves, each first asked for as
    // a copy in the mod, where the same bytes must load. A refusal of the one in Nova's folder is then its folder's.
    const served = assetExtensionsFromServer();
    rec(`the picture types /api/asset serves were read out of server.js (${[...served].join(" ") || "none"})`, served.size > 0);
    const listed = spawnSync("git", ["ls-files"], { cwd: NOVA, encoding: "utf8", maxBuffer: 1 << 26 });
    const ownPictures = (listed.status === 0 ? listed.stdout.split(/\r?\n/) : [])
      .filter((f) => f && served.has(path.extname(f).toLowerCase()) && fs.existsSync(path.join(NOVA, f)));
    rec(`Nova's folder has pictures of its own to ask for (${ownPictures.length}: ${ownPictures.join(", ")})`, ownPictures.length > 0,
      listed.status === 0 ? null : "git ls-files: " + String(listed.error || listed.stderr || listed.status));
    /** One /api/asset request: its status, type and bytes, and the error a refusal names. */
    const askAsset = async (file) => {
      try {
        const res = await fetch(`${base}/api/asset?path=${encodeURIComponent(file)}`);
        const ct = String(res.headers.get("content-type") || "");
        const bytes = Buffer.from(await res.arrayBuffer());
        let error = "";
        if (!/^image\//.test(ct)) { try { error = String(JSON.parse(bytes.toString("utf8")).error || ""); } catch (_) { error = bytes.toString("utf8").slice(0, 120); } }
        return { status: res.status, ct, bytes, error };
      } catch (err) { return { status: "fetch failed: " + err.message, ct: "", bytes: Buffer.alloc(0), error: "" }; }
    };
    const asked = [];
    for (const rel of ownPictures) {
      const bytes = fs.readFileSync(path.join(NOVA, rel));
      const copy = write(path.join(MOD, "nova-own-pictures", rel), bytes);
      asked.push({ rel, bytes, inMod: await askAsset(copy), inNova: await askAsset(path.join(NOVA, rel)) });
    }
    const unserved = asked.filter((a) => !(a.inMod.status === 200 && /^image\//.test(a.inMod.ct) && sha(a.inMod.bytes) === sha(a.bytes)));
    rec("each, copied into the mod, loads from there: its type is one /api/asset serves", asked.length > 0 && unserved.length === 0,
      unserved.map((a) => `${a.rel}: ${a.inMod.status} ${a.inMod.error}`));
    const admitted = asked.filter((a) => !(a.inNova.status === 400 && /not allowed/i.test(a.inNova.error)));
    rec("…and asked for where it lies, in Nova's own folder, each is refused as a path not allowed", asked.length > 0 && admitted.length === 0,
      admitted.map((a) => `${a.rel}: ${a.inNova.status} ${a.inNova.error || a.inNova.ct}`));

    console.log("\n4. The page draws an empty box for every type with no icon, and swaps a failed load for it");
    const { cards, types: pageTypes } = renderPanel(fx.icons);
    rec("the page renders the same building list it asks the server for", pageTypes.join(",") === types.join(","));
    const cardsOf = (c) => buildingCards(c, pageTypes);
    const bc = cardsOf(cards);
    rec(`one card per building type (${bc.length})`, bc.length === pageTypes.length);
    const visible = (e) => !e.classList.toArray().some((c) => /--hidden$/.test(c));
    /** The cards that draw something other than the empty box for an answer with no icon. */
    const wrongEmpty = (list) => list.filter((c) => !(fx.icons[c.type] || {}).url)
      .filter((c) => c.imgs.length !== 0 || c.placeholders.length !== 1 || !visible(c.placeholders[0])).map((c) => c.type);
    const empties = bc.filter((c) => !(fx.icons[c.type] || {}).url);
    rec(`each of the ${empties.length} types with no icon draws the empty box and no <img>`, empties.length > 0 && wrongEmpty(bc).length === 0, wrongEmpty(bc));
    const withIcon = bc.filter((c) => (fx.icons[c.type] || {}).url);
    const wrongIcon = withIcon.filter((c) => c.imgs.length !== 1 || c.imgs[0].attrs.src !== fx.icons[c.type].url
      || c.placeholders.length !== 1 || visible(c.placeholders[0])).map((c) => c.type);
    rec(`each of the ${withIcon.length} with an icon draws it from the server's url, its empty box hidden`, withIcon.length === 3 && wrongIcon.length === 0, wrongIcon);
    // What a broken load does: every <img> fires "error". What it leaves on screen must be the box.
    const imgs = cards.querySelectorAll("img.effect-list-state-card-img");
    const before = new Map(imgs.map((i) => [i, i.classList.toArray()]));
    imgs.forEach((i) => i.fire("error"));
    /** The cards with an icon whose <img>, once its load failed, is still drawn or left no box. */
    const stillBroken = (list) => list.filter((c) => (fx.icons[c.type] || {}).url)
      .filter((c) => c.imgs.some(visible) || !c.placeholders.some(visible)).map((c) => c.type);
    rec("a failed load hides the <img> and shows the empty box in its place", stillBroken(bc).length === 0, stillBroken(bc));
    const handlers = cards.all.flatMap((e) => Object.keys(e.attrs).filter((a) => /^on/.test(a)).map((a) => e.tag + " " + a));
    rec("nothing in the panel carries an inline handler (CSP script-src 'self' would drop it unrun)", handlers.length === 0, handlers);
    // styles.css: the classes the handler adds are display:none, and the box has a size. Derived from what the handler did.
    const css = fs.readFileSync(path.join(__dirname, "public", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (cls) => { const m = new RegExp("(^|[}\\s,])\\." + cls.replace(/[-]/g, "\\-") + "\\s*\\{([^}]*)\\}").exec(css); return m ? m[2] : null; };
    const hidImg = [...new Set(imgs.flatMap((i) => i.classList.toArray().filter((c) => !before.get(i).includes(c))))];
    const box = bc.find((c) => c.placeholders.length)?.placeholders[0];
    const boxBase = box ? box.classList.toArray().filter((c) => !/--hidden$/.test(c)) : [];
    rec(`styles.css hides what the handler hides (${hidImg.join(", ") || "none"}) and the hidden box`,
      hidImg.length > 0 && [...hidImg, ...boxBase.map((c) => c + "--hidden")].every((c) => /display\s*:\s*none/.test(rule(c) || "")),
      [...hidImg, ...boxBase.map((c) => c + "--hidden")].map((c) => c + ": " + rule(c)));
    rec(`…and the empty box itself has a size (${boxBase.join(", ")})`,
      boxBase.length > 0 && boxBase.some((c) => /\bwidth\s*:/.test(rule(c) || "") && /\bheight\s*:/.test(rule(c) || "")), boxBase.map((c) => c + ": " + rule(c)));
    // THE CONTROLS: the same detectors on doctored copies of the page, where the answer is known.
    const always = renderPanel(fx.icons, [["const iconUsable = Boolean(icon && icon.url && !icon.convertFailed);", "const iconUsable = true;"]]);
    rec("CONTROL: a page that draws an <img> for every type is caught by the empty-box check",
      wrongEmpty(cardsOf(always.cards)).length === empties.length, wrongEmpty(cardsOf(always.cards)).length + " caught");
    const deaf = renderPanel(fx.icons, [['img.addEventListener("error"', 'img.addEventListener("load"']]);
    deaf.cards.querySelectorAll("img.effect-list-state-card-img").forEach((i) => i.fire("error"));
    rec("CONTROL: a page that never hears a failed load is caught by the swap check",
      stillBroken(cardsOf(deaf.cards)).length === withIcon.length, stillBroken(cardsOf(deaf.cards)).length + " caught");

    console.log(`\n=== building icons actually load: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    for (const d of [ROOT, FX]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
});
