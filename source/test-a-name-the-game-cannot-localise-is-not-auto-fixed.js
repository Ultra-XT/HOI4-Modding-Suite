// ⛔ #a-name-the-game-cannot-localise — FIX ALL WRITES ONLY A KEY THE GAME READS, AND NEVER ONE A .yml CANNOT HOLD.
//
// Mod Health's deterministic tier answers a missing name by writing `<key>:0 "<text>"` into the mod's localisation.
// Driven on copies of real mods with the client's own requests, it wrote keys nothing reads:
//
//   • a mod that ships vanilla's CHL.txt and PRU.txt unchanged — the most ordinary thing a modder does — got
//     ` es:0 "Es"` and ` rola:0 "Rola"`, the tails of CHL_jorge_gonzález_von_marées and CHL_escudero_oscar_otárola;
//   • Millennium Dawn's ITA_giovanni_ridinò, named by a quoted literal and needing nothing, got ` portraits:0`,
//     ` corps_commander:0` and ` advisor:0` — its own role blocks, indexed as characters;
//   • Rise of Nations got 55 cut keys in one click — ` GER_j:0 "GER J"` for `name = GER_jürgen_wagner`, ` COL_:0` —
//     and the panel went clean while every one of those characters still showed its raw token in game.
//
// The scan now reads keys and name tokens whole (test-a-character-key-is-read-whole.js) and names a character by
// its instances (test-a-character-is-named-by-its-instances.js). That makes the key on the row the one the game
// looks up — and for those Rise of Nations characters that key holds a letter outside ASCII, which no localisation
// line can hold: HOI4 stopped reading a file at the one such key Nova wrote, with "Expected colon(:)"
// (#loc-key-must-be-ascii). Writing it would break a .yml; writing anything else is a key the game never reads. So:
//
//   • RULE 3 (and RULE 1e, tooltip keys) mark such a row `autoFix: false` + `locKeyCannotBeWritten`, and say the
//     repair is in the script;
//   • the card shows no fix button for it and says why; Fix all does not send it (isDeterministicFix honours the
//     veto for every rule);
//   • both fix endpoints refuse it even when a client sends it anyway — the key through canBeLocalizationKey, the
//     one write-side test (mod-index.js owns it; server.js imports it), and the row by its `autoFix: false`.
//
// #loc-key-colon — that guard accepted ":", copied from the readers' class, and once the fixers wrote through it Fix all
// answered Novum Vexillum's `custom_effect_tooltip = "Abstained:"` with ` Abstained::0 "Abstained:"`: reported fixed, and
// re-reported by the rescan, since a ":" ends the key on a localisation line. So the guard is held to Mod Health's own
// reader here — it accepts exactly the keys scanLocalization reads back — and every check of what Fix all wrote counts
// LINES, not the key lines a key-shaped pattern can see (a `Abstained::0` line is not one).
//
// #a-quoted-tooltip-is-text — and that row should not exist at all. The game looks up "Abstained:", which no line can
// hold, always misses, and prints it as written: the text the modder wrote, quoted. This test once pinned it as a
// vetoed row, whose card told the modder both to add `Abstained:` to a localisation file and that no line can hold it.
// A quoted tooltip no key can be now raises nothing; a bare token no line can hold is still a vetoed row, and neither
// its message nor its "What does this mean?" tells the modder to add it to a localisation file.
//
// The client is not restated here: public/modhealth.js itself runs, in a sandbox with a minimal DOM, against a real
// server — its scan, its cards, its "Fix all" banner and the very request body its button posts. Every mod is a
// scratch copy; the base game is only read.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unwritable-key-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const { isHoi4GameFolder, canBeLocalizationKey, scanLocalization } = require("./mod-index.js");
const haveGame = isHoi4GameFolder(G);
if (haveGame && !process.env.HOI4_ROOT) process.env.HOI4_ROOT = G; // the server and this test read the same game
const srv = require("./server.js");

const DEFAULT_PORT = 53741;
const PORT = Number(process.env.NOVA_TEST_PORT) || DEFAULT_PORT;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 260) : JSON.stringify(detail).slice(0, 260))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

// Non-ASCII letters from code points, so an editor or a shell cannot change what the fixture holds.
const u_ = "\u00fc", c_ = "\u0107", a_ = "\u00e1";
const WAGNER = "GER_j" + u_ + "rgen_wagner";            // Rise of Nations: a bare non-ASCII name token
const BACKTICK = "USA_terrence_o`shaughnessy";          // Rise of Nations writes exactly this
const TURSUNOVIC = "BOS_husein_tursunovi" + c_;         // Novum Vexillum: no name at all, so the key is the token
const FOCUS_TEXT = "NVX_b" + a_ + "r_focus";
const TOOLTIP = "GER_" + u_ + "berfall_tt";
const COLON_TT = "Abstained:";                           // Novum Vexillum, events/TestEvents.txt: a quoted tooltip
const ACCENT_TT = u_.toUpperCase() + "berfall";          // the same, quoted, with a letter outside ASCII
const VETOED = [WAGNER, "USA_terrence_oshaughnessy", TURSUNOVIC, "nvx_focus", TOOLTIP]; // entityIds
const LITERALS = [COLON_TT, ACCENT_TT];                  // quoted tooltips no key can be: text, so no row at all
const CONTROLS = ["XCT_first", "XCT_second"];            // ASCII characters with an unlocalised name: really fixable

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const write = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const hashTree = (root) => {
  const out = {};
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else out[path.relative(root, full).replace(/\\/g, "/")] = crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex");
    }
  }
  return out;
};
const changedFiles = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
const ymlKeys = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "").split(/\r?\n/)
  .map((l) => /^\s*([^\s:#"]+):\d*\s*"/.exec(l)).filter(Boolean).map((m) => m[1]);
const added = (before, after) => { const n = new Map(); for (const k of before) n.set(k, (n.get(k) || 0) + 1); return after.filter((k) => { const c = n.get(k) || 0; if (c) { n.set(k, c - 1); return false; } return true; }); };
// Every LINE a file gained, whatever its shape — the check a key-shaped pattern cannot make for it.
const ymlLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "").replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
const keyLineOf = (k) => new RegExp("^\\s*" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":\\d*\\s*\"");

const post = async (url, body) => (await fetch(BASE + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

// ── public/modhealth.js, run as the page runs it ─────────────────────────────────────────────────────────────
// A minimal DOM: elements remember innerHTML and their listeners; fetch goes to this test's server; confirm() says
// yes; timers are held and run on demand, so "rescan after the fix" happens when the test says.
function openPage(modPath) {
  const src = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
  const els = new Map();
  const ready = [];
  const timers = [];
  const pending = new Set();
  const posts = [];
  const track = (p) => { pending.add(p); p.then(() => pending.delete(p), () => pending.delete(p)); return p; };
  const el = (id) => {
    const listeners = {};
    return {
      id, innerHTML: "", textContent: "", className: "", value: "", disabled: false, style: {}, dataset: {}, children: [], listeners,
      get firstChild() { return this.children[0] || null; },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      insertAdjacentHTML(where, html) { this.innerHTML = where === "afterbegin" ? html + this.innerHTML : this.innerHTML + html; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      closest() { return null; }, select() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
    };
  };
  const store = new Map([["activeModPath", modPath]]);
  const context = {
    console,
    document: {
      getElementById(id) { if (!els.has(id)) els.set(id, el(id)); return els.get(id); },
      createElement(tag) { return el("<" + tag + ">"); },
      querySelectorAll() { return []; },
      addEventListener(type, fn) { if (type === "DOMContentLoaded") ready.push(fn); },
      body: el("body"), execCommand() {},
    },
    window: {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    fetch: (url, opts) => {
      if (opts && String(opts.method).toUpperCase() === "POST") posts.push({ url, body: JSON.parse(opts.body) });
      return track(fetch(BASE + url, opts).then((res) => ({ ok: res.ok, status: res.status, json: () => track(res.json()), text: () => track(res.text()) })));
    },
    confirm: () => true,
    alert: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
  };
  vm.runInNewContext(src, context, { filename: "public/modhealth.js" });
  const settle = async () => {
    for (let quiet = 0; quiet < 3;) {
      if (pending.size) { quiet = 0; await Promise.allSettled([...pending]); }
      else { quiet++; await new Promise((r) => setImmediate(r)); }
    }
  };
  const content = () => context.document.getElementById("content");
  const card = (p) => {
    const anchor = '<div class="meta">' + esc(p.entityType + " · " + p.entityId);
    return content().innerHTML.split('<div class="mh-problem ').slice(1).find((c) => c.includes(anchor)) || null;
  };
  return {
    posts, content, card,
    async load() { for (const f of ready) await f(); await settle(); },
    async clickFixAll() {
      const btn = { disabled: false, textContent: "" };
      for (const f of content().listeners.click || []) await f({ target: { closest: (sel) => (sel === ".mh-fixallbtn" ? btn : null) } });
      await settle();
      const due = timers.splice(0); for (const f of due) f(); // the rescan the page schedules after a fix
      await settle();
      return btn;
    },
    banner() { const m = /<div class="mh-fixall">[\s\S]*?Fix all (\d+)<\/button>/.exec(content().innerHTML); return m ? Number(m[1]) : 0; },
  };
}

const roots = [MODS];
let server;
(async () => {
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(PORT, () => res(s)); s.on("error", rej); });

    console.log("\n-- the one write-side test --");
    rec("server.js writes through mod-index.js's canBeLocalizationKey", srv.canBeLocalizationKey === canBeLocalizationKey, typeof srv.canBeLocalizationKey);
    // #loc-key-colon — the guard accepts a key exactly when Mod Health's own reader reads the line written for it back
    // as that key. Wider, and Fix all reports a fix its own rescan cannot see.
    {
      const probeRoot = fs.mkdtempSync(path.join(MODS, "reader-"));
      const probes = ["XCT_plain", "XCT_dotted.key", "XCT_hyphen-key", "XCT_1st", COLON_TT, "XCT_colon:inside", WAGNER, BACKTICK,
        "XCT_apostrophe's", "two words", "XCT_brace{"];
      write(probeRoot, "localisation/english/probe_l_english.yml", "\ufeffl_english:\n" + probes.map((k, i) => " " + k + ":0 \"v" + i + "\"").join("\n") + "\n");
      const read = scanLocalization(probeRoot);
      const disagree = probes.filter((k, i) => canBeLocalizationKey(k) !== (Object.prototype.hasOwnProperty.call(read, k) && read[k] === "v" + i));
      rec("the guard accepts exactly the keys Mod Health's own localisation reader reads back", disagree.length === 0,
        disagree.map((k) => ({ key: k, guard: canBeLocalizationKey(k), readBack: Object.prototype.hasOwnProperty.call(read, k) })));
      rec("...and a \":\" is not one of them", !canBeLocalizationKey(COLON_TT) && !canBeLocalizationKey("XCT_colon:inside"));
    }

    // ── A mod holding every shape whose key the game reads cannot be a localisation key, and two that can ──
    const mod = fs.mkdtempSync(path.join(MODS, "veto-"));
    write(mod, "descriptor.mod", 'name="unwritable keys"\nsupported_version="1.19.*"\n');
    write(mod, "common/characters/x.txt", "characters = {\n"
      + `\t${WAGNER} = {\n\t\tname = ${WAGNER}\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
      + `\tUSA_terrence_oshaughnessy={\n\t\tname=${BACKTICK}\n\t\tcorps_commander = { skill = 1 }\n\t}\n`
      + `\t${TURSUNOVIC}={\n\t\t#name="Husein Tursunovi${c_}"\n\t\tportraits={\n\t\t\tarmy={ small="GFX_x" }\n\t\t}\n`
      + "\t\tcorps_commander={\n\t\t\tskill=1\n\t\t}\n\t\tadvisor={\n\t\t\tslot = political_advisor\n\t\t\tidea_token = bos_token\n\t\t}\n\t}\n"
      + CONTROLS.map((k) => `\t${k} = {\n\t\tname = ${k}_name\n\t\tcorps_commander = { skill = 1 }\n\t}\n`).join("")
      + "}\n");
    write(mod, "common/national_focus/f.txt",
      `focus_tree = {\n\tid = nvx_tree\n\tfocus = {\n\t\tid = nvx_focus\n\t\ttext = ${FOCUS_TEXT}\n\t\ticon = GFX_goal_unknown\n\t\tx = 1\n\t\ty = 1\n\t\tcost = 1\n\t}\n}\n`);
    write(mod, "common/decisions/d.txt",
      `xct_category = {\n\txct_decision = {\n\t\tcomplete_effect = {\n\t\t\tcustom_effect_tooltip = ${TOOLTIP}\n\t\t\tcustom_effect_tooltip = "${COLON_TT}"\n\t\t\tcustom_effect_tooltip = "${ACCENT_TT}"\n\t\t}\n\t}\n}\n`);
    const YML = path.join(mod, "localisation", "english", "x_l_english.yml");
    write(mod, "localisation/english/x_l_english.yml", "\ufeffl_english:\n xct_category:0 \"Category\"\n xct_decision:0 \"Decision\"\n bos_token:0 \"Token\"\n");

    const scan = await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod))).json();
    const rows = (scan.problems || []).filter((p) => p.rule === "missing_localization" || p.rule === "tooltip_key_no_localization");
    const row = (id) => rows.find((p) => p.entityId === id);

    console.log("\n-- the scan names the key the game reads, and marks the ones no line can hold --");
    const wantKey = { [WAGNER]: WAGNER, "USA_terrence_oshaughnessy": BACKTICK, [TURSUNOVIC]: TURSUNOVIC, nvx_focus: FOCUS_TEXT, [TOOLTIP]: TOOLTIP };
    for (const id of VETOED) {
      const r = row(id);
      rec(`${id}: reported under the whole key the game reads`, !!r && (r.locKey || r.entityId) === wantKey[id], r && (r.locKey || r.entityId));
      rec(`${id}: marked autoFix:false and locKeyCannotBeWritten`, !!r && r.autoFix === false && r.locKeyCannotBeWritten === true, r && { autoFix: r.autoFix, w: r.locKeyCannotBeWritten });
      rec(`${id}: the message says Nova will not write it and where the repair is`,
        !!r && /Nova will not write a localisation line for/.test(r.message) && /The repair is in the script/.test(r.message), r && r.message);
      rec(`${id}: ...and never tells the modder to add it to a localisation file`, !!r && !/\bAdd\b[^.]*\bto a localisation file\b/.test(r.message), r && r.message);
    }
    for (const id of CONTROLS) {
      const r = row(id);
      rec(`${id}: an ASCII name is reported under its key and left fixable`, !!r && r.locKey === id + "_name" && r.autoFix !== false, r && { locKey: r.locKey, autoFix: r.autoFix });
    }
    for (const id of LITERALS) {
      rec(`"${id}": a quoted tooltip no key can be is text the game prints as written, so no row`,
        !(scan.problems || []).some((p) => p.entityId === id || p.locKey === id), (scan.problems || []).filter((p) => p.entityId === id || p.locKey === id).map((p) => p.rule));
    }
    rec("nothing is reported under a cut key or a role block", !rows.some((p) => ["GER_j", "USA_terrence_o", "NVX_b", "portraits", "corps_commander", "advisor"].includes(p.locKey || p.entityId)),
      rows.map((p) => p.locKey || p.entityId));
    rec("no duplicate_id for five different characters", !(scan.problems || []).some((p) => p.rule === "duplicate_id"), (scan.problems || []).filter((p) => p.rule === "duplicate_id").map((p) => p.entityId));

    console.log("\n-- the page: no button on a key no line can hold, and it says why --");
    const page = openPage(mod);
    await page.load();
    for (const id of VETOED) {
      const c = page.card(row(id) || { entityType: "?", entityId: id });
      rec(`${id}: its card has no fix button`, !!c && !/mh-aifixbtn/.test(c), c ? c.slice(0, 160) : "no card");
      rec(`${id}: ...and says there is no auto-fix and why`, !!c && /mh-nofix/.test(c) && /cannot be a localisation key/.test(c), c ? c.slice(-260) : "no card");
      const why = c ? (/<div class="mh-why-body">([\s\S]*?)<\/div>/.exec(c) || [])[1] : null;
      rec(`${id}: ...and its "What does this mean?" names the case with no key to add`, !!why && /can never be a localisation key/.test(why), why || "no help");
    }
    // ...which reads every such rule's help only while every rule that can veto a row has a vetoed row here. The rules
    // that can are counted off mod-index.js's own calls, comments masked (its prose names the function too).
    {
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const code = maskJsComments(fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8"));
      const callSites = (code.match(/\bmarkUnwritableLocKey\s*\(/g) || []).length - 1; // the definition is not a call
      const vetoRules = [...new Set(VETOED.map(row).filter(Boolean).map((p) => p.rule))].sort();
      rec("every rule that can veto a row has a vetoed row in this fixture (a new caller needs one, and a help clause)",
        callSites > 0 && callSites === vetoRules.length, { callSites, vetoRules });
    }
    for (const id of CONTROLS) {
      const c = page.card(row(id) || { entityType: "?", entityId: id });
      rec(`${id}: its card offers the deterministic Auto-fix`, !!c && /🩹 Auto-fix/.test(c) && !/mh-nofix/.test(c), c ? c.slice(0, 160) : "no card");
    }
    rec("the Fix all banner counts only the fixable two", page.banner() === CONTROLS.length, page.banner());

    console.log("\n-- Fix all, clicked: it sends the fixable rows and writes only their keys --");
    const before = hashTree(mod), keysBefore = ymlKeys(YML), linesBefore = ymlLines(YML);
    await page.clickFixAll();
    const sent = page.posts.filter((p) => p.url === "/api/modhealth/fix-batch");
    rec("one batch request, for this mod", sent.length === 1 && sent[0].body.modPath === mod, sent.map((p) => p.body.modPath));
    const sentIds = sent.length ? sent[0].body.problems.map((p) => p.entityId).sort() : [];
    rec("it sends exactly the fixable rows", JSON.stringify(sentIds) === JSON.stringify([...CONTROLS].sort()), sentIds);
    const after = hashTree(mod);
    rec("only the localisation file changed", JSON.stringify(changedFiles(before, after)) === JSON.stringify(["localisation/english/x_l_english.yml"]), changedFiles(before, after));
    rec("...gaining exactly the two keys the game reads", JSON.stringify(added(keysBefore, ymlKeys(YML)).sort()) === JSON.stringify(CONTROLS.map((k) => k + "_name").sort()), added(keysBefore, ymlKeys(YML)));
    const gainedLines = added(linesBefore, ymlLines(YML));
    rec("...and exactly two lines, one for each — no line of any other shape", gainedLines.length === CONTROLS.length
      && CONTROLS.every((k) => gainedLines.filter((l) => keyLineOf(k + "_name").test(l)).length === 1), gainedLines);
    const rescanned = (await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod))).json()).problems || [];
    rec("a rescan clears the two it fixed", !rescanned.some((p) => CONTROLS.includes(p.entityId)), rescanned.filter((p) => CONTROLS.includes(p.entityId)).map((p) => p.entityId));
    rec(`...and still reports the ${VETOED.length} it could not, which are real`, VETOED.every((id) => rescanned.some((p) => p.entityId === id && p.autoFix === false)),
      rescanned.filter((p) => VETOED.includes(p.entityId)).map((p) => p.entityId));
    rec("the page's own rescan offers no Fix all banner for them", page.banner() === 0, page.banner());

    console.log("\n-- a client that sends them anyway is refused: the server decides, not the client --");
    const vetoed = VETOED.map(row).filter(Boolean);
    const snap = hashTree(mod);
    const asScanned = await post("/api/modhealth/fix-batch", { modPath: mod, problems: vetoed });
    rec("Fix all with the rows as scanned: every one refused", (asScanned.fixed || 0) === 0 && (asScanned.results || []).filter((r) => r.error).length === vetoed.length, asScanned);
    const stripped = vetoed.map((p) => { const q = Object.assign({}, p); delete q.autoFix; delete q.locKeyCannotBeWritten; return q; });
    const asOld = await post("/api/modhealth/fix-batch", { modPath: mod, problems: stripped });
    rec("...with the veto stripped, as an older client would send them: refused by the key itself", (asOld.fixed || 0) === 0, asOld);
    const vetoAscii = Object.assign({}, row(CONTROLS[0]), { autoFix: false });
    const asciiVeto = await post("/api/modhealth/fix-batch", { modPath: mod, problems: [vetoAscii] });
    rec("...and a row the scan vetoed is refused even when its key could be written", (asciiVeto.fixed || 0) === 0, asciiVeto);
    for (const p of [row(WAGNER), stripped[0], vetoAscii]) {
      const one = await post("/api/modhealth/fix", { modPath: mod, problem: p, apiKey: "" });
      rec(`the per-card fix refuses ${p.entityId}${p.autoFix === false ? " (vetoed)" : " (veto stripped)"}`, !!one.error && !one.ok, one);
    }
    rec("...and nothing in the mod changed", JSON.stringify(changedFiles(snap, hashTree(mod))) === "[]", changedFiles(snap, hashTree(mod)));

    console.log("\n-- a mod shipping the base game's own character files, if the game is here --");
    if (haveGame) {
      const vmod = fs.mkdtempSync(path.join(MODS, "vanilla-files-"));
      write(vmod, "descriptor.mod", 'name="ships vanilla characters"\nsupported_version="1.19.*"\n');
      const own = ["CHL.txt", "PRU.txt"];
      for (const f of own) {
        fs.mkdirSync(path.join(vmod, "common", "characters"), { recursive: true });
        fs.copyFileSync(path.join(G, "common", "characters", f), path.join(vmod, "common", "characters", f));
      }
      write(vmod, "common/characters/zz_controls.txt", "characters = {\n" + CONTROLS.map((k) => `\t${k} = {\n\t\tname = ${k}_name\n\t\tcorps_commander = { skill = 1 }\n\t}\n`).join("") + "}\n");
      const VYML = path.join(vmod, "localisation", "english", "v_l_english.yml");
      write(vmod, "localisation/english/v_l_english.yml", "\ufeffl_english:\n");
      // What those two files spell, read independently: every character key and every `name =` token, whole.
      const spelled = new Set();
      for (const f of own) {
        const t = fs.readFileSync(path.join(G, "common", "characters", f), "utf8").replace(/#[^\r\n]*/g, "");
        for (const m of t.matchAll(/(?:^|[\s{}])([^\s{}="#]+)\s*=\s*\{/g)) spelled.add(m[1]);
        for (const m of t.matchAll(/\bname\s*=\s*([^\s{}="#]+)/g)) spelled.add(m[1]);
      }
      const vpage = openPage(vmod);
      await vpage.load();
      const vscan = (await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(vmod))).json()).problems || [];
      const inFiles = vscan.filter((p) => /common[\\/]characters[\\/](CHL|PRU)\.txt$/.test(p.file || ""));
      rec("no duplicate_id: the two files define each key once", !inFiles.some((p) => p.rule === "duplicate_id"), inFiles.filter((p) => p.rule === "duplicate_id").map((p) => p.entityId));
      const vbefore = hashTree(vmod), vkeys = ymlKeys(VYML), vlines = ymlLines(VYML);
      await vpage.clickFixAll();
      const vsent = vpage.posts.filter((p) => p.url === "/api/modhealth/fix-batch").flatMap((p) => p.body.problems);
      const fromFiles = vsent.filter((p) => /common[\\/]characters[\\/](CHL|PRU)\.txt$/.test(p.file || ""));
      const foreign = fromFiles.map((p) => p.locKey || p.entityId).filter((k) => !spelled.has(k) || !canBeLocalizationKey(k));
      rec("Fix all sends no key those files do not spell whole, and none a .yml cannot hold", foreign.length === 0, foreign);
      rec("...and still sends the two fixable controls", CONTROLS.every((id) => vsent.some((p) => p.entityId === id)), vsent.map((p) => p.entityId));
      const vadded = added(vkeys, ymlKeys(VYML));
      rec("the .yml gained exactly the keys sent, and nothing else in the mod changed",
        JSON.stringify(vadded.sort()) === JSON.stringify(vsent.map((p) => p.locKey || p.entityId).sort())
          && JSON.stringify(changedFiles(vbefore, hashTree(vmod))) === JSON.stringify(["localisation/english/v_l_english.yml"]),
        { added: vadded, changed: changedFiles(vbefore, hashTree(vmod)) });
      const vgained = added(vlines, ymlLines(VYML));
      rec("...one line per key sent, and no line of any other shape", vgained.length === vsent.length
        && vsent.every((p) => vgained.filter((l) => keyLineOf(p.locKey || p.entityId).test(l)).length === 1), vgained);
      rec("CHL.txt and PRU.txt are byte-identical to the base game's", own.every((f) => fs.readFileSync(path.join(vmod, "common", "characters", f)).equals(fs.readFileSync(path.join(G, "common", "characters", f)))));
    } else {
      skip("the base-game files: no game at " + G + " (set HOI4_ROOT). They did NOT run; the fixture above holds every shape.");
    }
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) { /* older node */ } server.close(); }
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    // The runner shows only a failing file's last lines, so name what failed where it will be read.
    if (fails.length) console.log("\nfailed:\n" + fails.map((f) => "  " + f.slice(0, 150)).join("\n"));
    console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
      + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
    process.exitCode = fails.length ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 300).unref();
  }
})();
