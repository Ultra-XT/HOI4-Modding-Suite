// ⛔ #a-nameless-advisor-is-named-by-its-trait / #a-hidden-idea-needs-no-name — MOD HEALTH ASKS FOR A NAME ONLY WHERE THE GAME
// WOULD SHOW NONE, AND FIX ALL WRITES ONE ONLY THERE.
//
// The base game (1.20), copied into a sandbox and judged as a mod, drew 2,645 missing_localization rows, and 2,213 of them were
// advisors: 1,273 characters such as BLZ.txt's BLZ_aa2 (an advisor role with one trait and a portrait, no name, no localisation
// for its key) and 941 old-style advisor ideas such as bavaria.txt's BAY_democratic_guy (a picture and one trait, in a slot
// common/idea_tags declares a `character_slot`). The trait is the only text any of them has, and traits_l_english.yml writes it
// to sit under a portrait ("Armor\n(Expert)"): that is the name the game shows. 46 more were ideas in hidden_ideas, a slot whose
// category declares `hidden = yes`, which the game never puts on screen. Every mod that copies such a file inherited the rows,
// and Fix all wrote a made-up name over the trait's ("BLZ aa2").
//
// What this pins, through the requests the Mod Health page sends (its own public/modhealth.js runs in a sandbox with a minimal
// DOM against a real server: GET /api/mod/index?fresh=1, the cards, the Fix all banner and the body its button posts):
//   · a nameless advisor whose trait is localised, an advisor-slot idea likewise, and an idea in a hidden slot are not reported,
//     and Fix all sends none of them;
//   · controls stay reported and fixable, and Fix all writes exactly their keys: an advisor whose trait has no text, an advisor
//     with no trait, a nameless general (a trait never names one), an advisor who is also a country leader, an advisor with two
//     roles one of whose traits has no text, an idea with a trait in a slot that is not an advisor slot, an idea in a category
//     that declares `ledger = hidden` only (the national-spirit category does), and a slot one category hides and another shows;
//   · #a-trait-names-an-advisor-only-if-the-game-loads-it — and so do an advisor and an advisor-slot idea whose "trait" has text
//     but is no leader trait any layer defines (the game drops it), and an advisor of a base-game trait in a mod that
//     replace_paths common/country_leader;
//   · the base game's own BLZ.txt, bavaria.txt and comchina.txt, copied byte for byte into a mod with the installed game as the
//     layer below (when the game is here; a heard SKIP otherwise): none of their nameless advisors or hidden ideas is reported
//     or sent, and a nameless general beside them still is.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nameless-advisor-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const { isHoi4GameFolder, scanLocalization, topLevelBlocks } = require("./mod-index.js");
const haveGame = isHoi4GameFolder(G);
if (haveGame && !process.env.HOI4_ROOT) process.env.HOI4_ROOT = G; // the server and this test read the same game
const srv = require("./server.js");

const PORT = Number(process.env.NOVA_TEST_PORT) || 54733;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 260) : JSON.stringify(detail).slice(0, 260))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

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
const ymlLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "").replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
const added = (before, after) => { const n = new Map(); for (const k of before) n.set(k, (n.get(k) || 0) + 1); return after.filter((k) => { const c = n.get(k) || 0; if (c) { n.set(k, c - 1); return false; } return true; }); };
const keyOfLine = (l) => (/^\s*([^\s:#"]+):\d*\s*"/.exec(l) || [])[1] || null;
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const norm = (f) => String(f || "").replace(/\\/g, "/");

// ── public/modhealth.js, run as the page runs it (the harness of test-a-name-the-game-cannot-localise-is-not-auto-fixed.js) ──
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
  return {
    posts,
    async load() { for (const f of ready) await f(); await settle(); },
    async clickFixAll() {
      const btn = { disabled: false, textContent: "" };
      for (const f of content().listeners.click || []) await f({ target: { closest: (sel) => (sel === ".mh-fixallbtn" ? btn : null) } });
      await settle();
      const due = timers.splice(0); for (const f of due) f(); // the rescan the page schedules after a fix
      await settle();
    },
    banner() { const m = /<div class="mh-fixall">[\s\S]*?Fix all (\d+)<\/button>/.exec(content().innerHTML); return m ? Number(m[1]) : 0; },
  };
}

// ── the fixture: every shape, self-contained (its own idea categories and localisation), so it judges the same without the game ──
const TRAIT = "prb_trait_with_text";
const NO_TEXT = "prb_trait_without_text";
// #a-trait-names-an-advisor-only-if-the-game-loads-it — text, but no layer defines it as a leader trait: the game drops it.
const NOWHERE = "prb_trait_defined_nowhere";
const advisor = (slot, token, trait) => `\t\tadvisor = {\n\t\t\tslot = ${slot}\n\t\t\tidea_token = ${token}\n`
  + (trait ? `\t\t\ttraits = {\n\t\t\t\t${trait}\n\t\t\t}\n` : "") + "\t\t}\n";
const portraits = "\t\tportraits = {\n\t\t\tarmy = {\n\t\t\t\tsmall = \"GFX_idea_generic_army_europe_1\"\n\t\t\t}\n\t\t}\n";
// [character key, body, reported?]. Only the shapes the game names from the trait resolve.
const CHARACTERS = [
  ["PRB_named_by_trait", advisor("political_advisor", "PRB_named_by_trait", TRAIT) + portraits, false],
  ["PRB_declared_key_without_text", "\t\tname = PRB_declared_key_without_text_name\n" + advisor("high_command", "PRB_declared_key_without_text", TRAIT) + portraits, false],
  ["PRB_trait_without_text", advisor("army_chief", "PRB_trait_without_text", NO_TEXT) + portraits, true],
  ["PRB_no_trait", advisor("navy_chief", "PRB_no_trait", null) + portraits, true],
  ["PRB_nameless_general", `\t\tcorps_commander = {\n\t\t\ttraits = { ${TRAIT} }\n\t\t\tskill = 1\n\t\t}\n` + portraits, true],
  ["PRB_advisor_and_leader", advisor("theorist", "PRB_advisor_and_leader", TRAIT) + `\t\tcountry_leader = {\n\t\t\tideology = despotism\n\t\t\ttraits = { ${TRAIT} }\n\t\t}\n` + portraits, true],
  ["PRB_two_roles_one_without_text", advisor("political_advisor", "PRB_two_roles_a", TRAIT) + advisor("air_chief", "PRB_two_roles_b", NO_TEXT) + portraits, true],
  ["PRB_trait_defined_nowhere", advisor("political_advisor", "PRB_trait_defined_nowhere", NOWHERE) + portraits, true],
  ["PRB_focus_key_for_a_trait", advisor("theorist", "PRB_focus_key_for_a_trait", "PRB_a_focus_with_text") + portraits, true],
];
// [slot, idea key, body, reported?]
const IDEAS = [
  ["prb_advisor_slot", "PRB_old_style_named_by_trait", `\t\t\tpicture = generic_political_advisor_europe_1\n\t\t\ttraits = { ${TRAIT} }\n`, false],
  ["prb_advisor_slot", "PRB_old_style_trait_without_text", `\t\t\ttraits = { ${NO_TEXT} }\n`, true],
  ["prb_advisor_slot", "PRB_old_style_trait_defined_nowhere", `\t\t\ttraits = { ${NOWHERE} }\n`, true],
  ["prb_hidden", "PRB_hidden_idea", "\t\t\tmodifier = { stability_factor = 0.01 }\n", false],
  ["prb_ledger_hidden", "PRB_ledger_hidden_spirit", "\t\t\tmodifier = { stability_factor = 0.01 }\n", true],
  ["prb_ledger_hidden", "PRB_spirit_with_a_trait", `\t\t\ttraits = { ${TRAIT} }\n`, true],
  ["prb_half_hidden", "PRB_half_hidden_idea", "\t\t\tmodifier = { stability_factor = 0.01 }\n", true],
];
// A file at a path of its own, so with the game below it adds to the base game's 00_idea.txt instead of replacing it.
const TAGS_A = "idea_categories = {\n"
  + "\tprb_hidden = {\n\t\thidden = yes\n\t\tledger = hidden\n\t}\n"
  + "\tprb_ledger_hidden = {\n\t\ttype = national_spirit\n\t\tledger = hidden\n\t}\n"
  + "\tprb_staff = {\n\t\tcharacter_slot = prb_advisor_slot\n\t\tledger = civilian\n\t}\n"
  + "\tprb_half_hidden = {\n\t\thidden = yes\n\t}\n"
  + "}\n";
const TAGS_B = "idea_categories = {\n\tprb_shows_it = {\n\t\tslot = prb_half_hidden\n\t\tledger = civilian\n\t}\n}\n";

const roots = [MODS];
let server;
(async () => {
  try {
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(PORT, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const scanOf = async (mod) => ((await (await fetch(BASE + "/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod))).json()).problems || []);

    console.log("\n-- a mod holding every shape --");
    const mod = fs.mkdtempSync(path.join(MODS, "shapes-"));
    write(mod, "descriptor.mod", 'name="nameless advisors"\nsupported_version="1.20.*"\n');
    write(mod, "common/characters/zz_probe.txt", "characters = {\n" + CHARACTERS.map(([k, body]) => `\t${k} = {\n${body}\t}\n`).join("") + "}\n");
    const slots = [...new Set(IDEAS.map(([s]) => s))];
    write(mod, "common/ideas/zz_probe.txt", "ideas = {\n" + slots.map((s) => `\t${s} = {\n`
      + IDEAS.filter(([x]) => x === s).map(([, k, body]) => `\t\t${k} = {\n${body}\t\t}\n`).join("") + "\t}\n").join("") + "}\n");
    write(mod, "common/idea_tags/zz_probe_tags_a.txt", TAGS_A);
    write(mod, "common/idea_tags/zz_probe_tags_b.txt", TAGS_B);
    // The fixture's own traits, as a mod defines them; NOWHERE and the focus key have text and no definition.
    write(mod, "common/country_leader/zz_probe_traits.txt", "leader_traits = {\n\t" + TRAIT + " = {\n\t\tstability_factor = 0.01\n\t}\n\t" + NO_TEXT + " = {\n\t\tstability_factor = 0.01\n\t}\n}\n");
    const YML = path.join(mod, "localisation", "english", "zz_probe_l_english.yml");
    write(mod, "localisation/english/zz_probe_l_english.yml", "\ufeffl_english:\n " + TRAIT + ":0 \"Probe\\n(Expert)\"\n " + NOWHERE + ":0 \"Nowhere\\n(Expert)\"\n PRB_a_focus_with_text:0 \"A Focus\"\n");

    const rows = (await scanOf(mod)).filter((p) => p.rule === "missing_localization");
    const reported = new Set(rows.map((p) => p.entityId));
    for (const [k, , want] of CHARACTERS) rec(`character ${k}: ${want ? "reported" : "not reported"}`, reported.has(k) === want, rows.filter((p) => p.entityId === k).map((p) => p.message));
    for (const [s, k, , want] of IDEAS) rec(`idea ${k} (slot ${s}): ${want ? "reported" : "not reported"}`, reported.has(k) === want, rows.filter((p) => p.entityId === k).map((p) => p.message));
    const wanted = [...CHARACTERS.filter((c) => c[2]).map((c) => c[0]), ...IDEAS.filter((i) => i[3]).map((i) => i[1])];
    rec("nothing else is reported (no advisor token, no trait)", sameSet(reported, wanted), [...reported].filter((k) => !wanted.includes(k)));
    rec("every row still reported is left fixable", rows.every((p) => p.autoFix !== false), rows.filter((p) => p.autoFix === false).map((p) => p.entityId));

    console.log("\n-- the page: Fix all offers and writes only the real missing names --");
    const page = openPage(mod);
    await page.load();
    rec(`the Fix all banner counts the ${wanted.length} real missing names`, page.banner() === wanted.length, page.banner());
    const before = hashTree(mod), linesBefore = ymlLines(YML);
    await page.clickFixAll();
    const sent = page.posts.filter((p) => p.url === "/api/modhealth/fix-batch");
    const sentRows = sent.flatMap((p) => p.body.problems);
    rec("one batch request, for this mod", sent.length === 1 && sent[0].body.modPath === mod, sent.map((p) => p.body.modPath));
    rec("it sends exactly the real missing names", sameSet(sentRows.map((p) => p.entityId), wanted), sentRows.map((p) => p.entityId));
    rec("only the localisation file changed", sameSet(changedFiles(before, hashTree(mod)), ["localisation/english/zz_probe_l_english.yml"]), changedFiles(before, hashTree(mod)));
    const gained = added(linesBefore, ymlLines(YML));
    const wantKeys = rows.map((p) => p.locKey || p.entityId);
    rec("...gaining one line per key sent, each a key the game reads, and no other line", gained.length === wantKeys.length && sameSet(gained.map(keyOfLine), wantKeys), gained);
    const resolved = [...CHARACTERS.filter((c) => !c[2]).map((c) => c[0]), ...IDEAS.filter((i) => !i[3]).map((i) => i[1])];
    rec("no line names a resolved advisor or hidden idea", !gained.some((l) => resolved.some((k) => (keyOfLine(l) || "").startsWith(k))), gained);
    const rescanned = (await scanOf(mod)).filter((p) => p.rule === "missing_localization");
    rec("a rescan reports none of them", rescanned.length === 0, rescanned.map((p) => p.entityId));

    console.log("\n-- the base game's own files, copied into a mod, with the installed game below --");
    if (haveGame) {
      const vmod = fs.mkdtempSync(path.join(MODS, "vanilla-files-"));
      write(vmod, "descriptor.mod", 'name="ships vanilla advisors"\nsupported_version="1.20.*"\n');
      const COPIED = ["common/characters/BLZ.txt", "common/ideas/bavaria.txt", "common/ideas/comchina.txt"];
      for (const rel of COPIED) {
        fs.mkdirSync(path.dirname(path.join(vmod, rel)), { recursive: true });
        fs.copyFileSync(path.join(G, rel), path.join(vmod, rel));
      }
      write(vmod, "common/characters/zz_control.txt", "characters = {\n\tPRB_vanilla_layer_general = {\n\t\tcorps_commander = { skill = 1 }\n\t}\n}\n");
      write(vmod, "localisation/english/zz_v_l_english.yml", "\ufeffl_english:\n");
      // What the files say, read here: the game's own English keys, each block's depth-0 shape, and the declared slots.
      const loc = scanLocalization(G);
      const strip = (t) => t.replace(/#[^\r\n]*/g, "");
      const firstTrait = (inner) => { for (const b of topLevelBlocks(inner)) if (b.key === "traits") return b.inner.trim().split(/\s+/)[0] || null; return null; };
      const tags = strip(fs.readFileSync(path.join(G, "common", "idea_tags", "00_idea.txt"), "utf8"));
      const charSlots = new Set([...tags.matchAll(/\bcharacter_slot\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]));
      const hidden = new Set();
      for (const top of topLevelBlocks(tags)) if (top.key === "idea_categories") for (const c of topLevelBlocks(top.inner)) {
        const own = c.inner.replace(/\{[^{}]*\}/g, " ");
        if (/(^|\s)hidden\s*=\s*yes\b/.test(own) && !/(^|\s)slot\s*=/.test(own)) hidden.add(c.key);
      }
      // The leader traits the game defines (common/country_leader): a trait names an advisor only if the game loads it.
      const defined = new Set();
      const CL = path.join(G, "common", "country_leader");
      for (const f of fs.readdirSync(CL).filter((n) => /\.txt$/i.test(n))) {
        for (const top of topLevelBlocks(strip(fs.readFileSync(path.join(CL, f), "utf8")))) if (top.key === "leader_traits") for (const t of topLevelBlocks(top.inner)) defined.add(t.key);
      }
      const names = (t) => !!t && defined.has(t) && loc[t] !== undefined;
      const advisors = [], oldStyle = [], hiddenIdeas = [];
      let gameTrait = null; // a trait the game localises, read off BLZ.txt, for the overlay mods below
      for (const top of topLevelBlocks(strip(fs.readFileSync(path.join(G, COPIED[0]), "utf8")))) if (top.key === "characters") for (const ch of topLevelBlocks(top.inner)) {
        const blocks = [...topLevelBlocks(ch.inner)];
        const roles = blocks.filter((b) => b.key === "advisor");
        if (!/(^|\s)name\s*=/.test(ch.inner.replace(/\{[^{}]*\}/g, " ")) && loc[ch.key] === undefined && roles.length && blocks.every((b) => b.key === "advisor" || b.key === "portraits")
          && roles.every((r) => names(firstTrait(r.inner)))) { advisors.push(ch.key); gameTrait = gameTrait || firstTrait(roles[0].inner); }
      }
      for (const rel of COPIED.slice(1)) for (const top of topLevelBlocks(strip(fs.readFileSync(path.join(G, rel), "utf8")))) if (top.key === "ideas") for (const slot of topLevelBlocks(top.inner)) {
        for (const idea of topLevelBlocks(slot.inner)) {
          if (loc[idea.key] !== undefined || /(^|\s)name\s*=/.test(idea.inner.replace(/\{[^{}]*\}/g, " "))) continue;
          if (charSlots.has(slot.key) && names(firstTrait(idea.inner))) oldStyle.push(idea.key);
          if (hidden.has(slot.key)) hiddenIdeas.push(idea.key);
        }
      }
      const shapes = { "nameless advisors in BLZ.txt": advisors, "nameless advisor-slot ideas in the copied ideas files": oldStyle, "unnamed hidden ideas in the copied ideas files": hiddenIdeas };
      const resolvedIds = new Set(Object.values(shapes).flat());
      const vrows = (await scanOf(vmod)).filter((p) => p.rule === "missing_localization");
      for (const [what, ids] of Object.entries(shapes)) {
        if (!ids.length) { skip(`${what}: the installed game ships none of that shape any more, so this check did not run`); continue; }
        rec(`the installed game still ships ${ids.length} ${what}, and none is reported`, !vrows.some((p) => ids.includes(p.entityId)), vrows.filter((p) => ids.includes(p.entityId)).map((p) => p.entityId).slice(0, 8));
      }
      rec("...while a nameless general beside them still is", vrows.some((p) => p.entityId === "PRB_vanilla_layer_general"), vrows.map((p) => p.entityId).slice(0, 8));
      const vpage = openPage(vmod);
      await vpage.load();
      const vbefore = hashTree(vmod);
      await vpage.clickFixAll();
      const vsent = vpage.posts.filter((p) => p.url === "/api/modhealth/fix-batch").flatMap((p) => p.body.problems);
      rec("Fix all sends none of those advisors and hidden ideas", !vsent.some((p) => resolvedIds.has(p.entityId)), vsent.filter((p) => resolvedIds.has(p.entityId)).map((p) => norm(p.file) + " " + p.entityId).slice(0, 8));
      rec("...and still sends the nameless general", vsent.some((p) => p.entityId === "PRB_vanilla_layer_general"), vsent.map((p) => p.entityId));
      rec("the copied files are byte-identical to the base game's", COPIED.every((rel) => fs.readFileSync(path.join(vmod, rel)).equals(fs.readFileSync(path.join(G, rel)))));
      rec("...and only the localisation file changed", sameSet(changedFiles(vbefore, hashTree(vmod)), ["localisation/english/zz_v_l_english.yml"]), changedFiles(vbefore, hashTree(vmod)));

      // The idea categories are read the way the game loads them: a mod's file at the base game's own path replaces it
      // wholesale, and replace_path = "common/idea_tags" drops the base game's. In both mods political_advisor is only a
      // plain slot, so an idea there is no advisor and its trait names nothing: it is reported.
      const firstSlot = [...charSlots][0];
      if (!gameTrait || !firstSlot) skip("no nameless advisor with a localised trait, or no character_slot, in the installed game: the overlay mods did not run");
      else {
        const overlay = (label, tagsRel, descriptorExtra) => {
          const omod = fs.mkdtempSync(path.join(MODS, label + "-"));
          write(omod, "descriptor.mod", 'name="' + label + '"\nsupported_version="1.20.*"\n' + descriptorExtra);
          write(omod, tagsRel, "idea_categories = {\n\tprb_politics = {\n\t\tslot = " + firstSlot + "\n\t}\n}\n");
          write(omod, "common/ideas/zz_probe.txt", "ideas = {\n\t" + firstSlot + " = {\n\t\tPRB_overlay_" + label.replace(/-/g, "_") + " = {\n\t\t\ttraits = { " + gameTrait + " }\n\t\t}\n\t}\n}\n");
          return omod;
        };
        const samePath = overlay("same-path", "common/idea_tags/00_idea.txt", "");
        const replaced = overlay("replace-path", "common/idea_tags/zz_probe_tags.txt", 'replace_path="common/idea_tags"\n');
        rec(`a mod whose own common/idea_tags/00_idea.txt makes ${firstSlot} a plain slot: its trait-only idea there is reported`,
          (await scanOf(samePath)).some((p) => p.rule === "missing_localization" && p.entityId === "PRB_overlay_same_path"));
        rec("...and so it is in a mod that replace_paths common/idea_tags",
          (await scanOf(replaced)).some((p) => p.rule === "missing_localization" && p.entityId === "PRB_overlay_replace_path"));
        // #a-trait-names-an-advisor-only-if-the-game-loads-it — replace_path = "common/country_leader" unloads the base game's
        // traits, so its trait text no longer names a nameless advisor (the BLZ.txt copy above, with the traits loaded, is the control).
        const noTraits = fs.mkdtempSync(path.join(MODS, "no-traits-"));
        write(noTraits, "descriptor.mod", 'name="no traits"\nsupported_version="1.20.*"\nreplace_path="common/country_leader"\n');
        write(noTraits, "common/characters/zz_probe.txt", "characters = {\n\tPRB_advisor_of_unloaded_trait = {\n" + advisor(firstSlot, "PRB_advisor_of_unloaded_trait", gameTrait) + portraits + "\t}\n}\n");
        rec("a mod that replace_paths common/country_leader: a nameless advisor of the base game's trait is reported",
          (await scanOf(noTraits)).some((p) => p.rule === "missing_localization" && p.entityId === "PRB_advisor_of_unloaded_trait"));
      }
    } else {
      skip("the base-game files: no game at " + G + " (set HOI4_ROOT). They did NOT run; the fixture above holds every shape.");
    }
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) { /* older node */ } server.close(); }
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    if (fails.length) console.log("\nfailed:\n" + fails.map((f) => "  " + f.slice(0, 150)).join("\n"));
    console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
      + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
    process.exitCode = fails.length || checks < 20 ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 300).unref();
  }
})();
