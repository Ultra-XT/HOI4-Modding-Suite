// A state whose file writes no name must be reported — and never on shipping content.
// #a-state-with-no-name
//
// Five keys are written by every one of the 7,495 states in the six maps that ship their own map/ (vanilla,
// Millennium Dawn, Road to 56, Old World Blues, Novum Vexillum, Rise of Nations): id, name, manpower,
// state_category and provinces. The map validator had a rule for four of them and none for `name`, which is the
// localisation key the game names the state by. It could not have had one: the parser fills a missing name in
// with STATE_<id> so the editor keeps working, and that fallback is exactly what hid the gap.
//
// The parser now also says whether the FILE writes a name at the state's own level. A `name =` inside
// `set_province_name = { … }` names a province, not the state — the corpus carries 24 of those, and a naive
// match counts them — so it does not count.
//
// ⚠️ A WARNING, never fatal: there is no crash evidence, only the universal convention. It fires 0 times on all
// six shipping maps (re-derived below at the parser level), and only for a state the mod itself ships
// (#inherited-problem-not-yours).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noname-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

const state = (id, nameLine, extraHistory = "") =>
  `state = {\n\tid = ${id}\n${nameLine ? "\t" + nameLine + "\n" : ""}\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = AAA\n${extraHistory}\t}\n}\n`;
function writeDefinition(root) {
  mk(path.join(root, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6, 7].map((i) => `${i};${i * 20};0;0;land;false;plains;1`)).join("\r\n") + "\r\n");
  mk(path.join(root, "map", "strategicregions", "1-R.txt"), 'strategic_region = {\n\tid = 1\n\tname = "R1"\n\tprovinces = { 1 2 3 4 5 6 7 }\n}\n');
}
const nameless = (modRoot, gameRoot) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }))
  .filter((p) => p.rule === "state_no_name");

try {
  console.log("1. 🈯 Shipping content: every state writes a name, so the rule has nothing to say about it");
  {
    // The positive control first — a corpus zero proves nothing if the flag can never be true.
    const probe = md.parseStatesText(state(9, "") + state(10, 'name = "STATE_10"'));
    rec("CONTROL: the parser flags a state with no name", probe.length === 2 && probe[0].nameMissing === true && probe[1].nameMissing === false,
      probe.map((s) => ({ id: s.id, nameMissing: s.nameMissing })));
    rec("…and still hands consumers the STATE_<id> fallback", probe[0] && probe[0].name === "STATE_9", probe[0] && probe[0].name);

    const roots = [];
    if (fs.existsSync(path.join(GAME, "history", "states"))) roots.push(GAME);
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const r = path.join(WS, id);
      if (fs.existsSync(path.join(r, "map", "definition.csv")) && fs.existsSync(path.join(r, "history", "states"))) roots.push(r);
    }
    if (roots.length < 3) {
      rec("enough installed maps to measure", false, roots.length + " found — a skip reads as a pass, so this fails");
    } else {
      // ⚠️ MOVED 2026-09-15. This said "not one shipping state is flagged as nameless", and a workshop map installed on 2026-09-14
      // (3721160655) ships 68-Guadeloupe.txt with no name line at all — a TRUE positive, so the check failed on every commit. What the
      // corpus can prove is that the flag is RIGHT: an independent reader (braces and comments respected, a `name` inside
      // set_province_name = { … } not counted) must agree with the parser on every state, and nameless states must stay rare.
      const rawTopLevelNamed = (text) => {
        const t = String(text).replace(/#[^\n\r]*/g, (m) => " ".repeat(m.length));
        const out = new Map();
        const re = /(?:^|[^A-Za-z0-9_])state\s*=\s*\{/g;
        let m;
        while ((m = re.exec(t))) {
          const open = t.indexOf("{", m.index);
          let d = 0, end = -1;
          for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { end = i; break; } } }
          if (end === -1) break;
          let flat = "", depth = 0;
          for (const ch of t.slice(open + 1, end)) { if (ch === "{") depth++; else if (ch === "}") depth--; flat += depth === 0 && ch !== "}" ? ch : " "; }
          re.lastIndex = end + 1;
          const idm = /(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(flat);
          if (idm) out.set(parseInt(idm[1], 10), /(?:^|[^A-Za-z0-9_])name\s*=\s*\S/.test(flat));
        }
        return out;
      };
      let total = 0;
      const missing = [], disagree = [];
      for (const r of roots) {
        const dir = path.join(r, "history", "states");
        for (const f of fs.readdirSync(dir)) {
          if (!f.toLowerCase().endsWith(".txt")) continue;
          let t = "";
          try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
          const raw = rawTopLevelNamed(t);
          for (const s of md.parseStatesText(t)) {
            total++;
            if (s.nameMissing) missing.push(path.basename(r) + "/" + f);
            if (raw.has(s.id) && raw.get(s.id) === !!s.nameMissing) disagree.push(path.basename(r) + "/" + f + " #" + s.id);
          }
        }
      }
      rec("the corpus is big enough to mean something", total > 5000, total + " states across " + roots.length + " maps");
      rec("⭐⭐⭐ the parser flags exactly the shipping states whose file writes no name", disagree.length === 0, disagree.slice(0, 6));
      rec("…and a state with no name is a rare exception in shipping content", missing.length * 100 < total, { missing: missing.length, total, examples: missing.slice(0, 4) });
    }
  }

  console.log("\n2. ⭐⭐ A mod's own nameless states are reported — once, as a warning");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noname-mod-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="NoName"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
    writeDefinition(mod);
    mk(path.join(mod, "history", "states", "1-Named.txt"), state(1, 'name = "STATE_1"'));
    mk(path.join(mod, "history", "states", "2-Nameless.txt"), state(2, ""));
    // Only a PROVINCE is named here — the state itself is not.
    mk(path.join(mod, "history", "states", "3-ProvinceNameOnly.txt"), state(3, "", "\t\tset_province_name = { id = 3 name = \"Kolkata\" }\n"));
    mk(path.join(mod, "history", "states", "4-EmptyName.txt"), state(4, 'name = ""'));
    mk(path.join(mod, "history", "states", "5-CommentedOut.txt"), state(5, '# name = "STATE_5"'));
    // A name that is written, with a province name inside its history as well — must NOT be flagged.
    mk(path.join(mod, "history", "states", "6-BothNames.txt"), state(6, 'name = "STATE_6"', "\t\tset_province_name = { id = 6 name = \"Delhi\" }\n"));

    const rep = nameless(mod, null);
    rec("⭐⭐⭐ the rule fires", rep.length >= 1, rep.length);
    rec("⭐⭐ …ONE report for the mod, not one per state", rep.length === 1, rep.length);
    const p = rep[0] || {};
    const ids = (p.states || []).slice().sort((a, b) => a - b);
    rec("⭐⭐⭐ …naming the state with no name, the one whose only name is a province's, the empty one and the commented-out one",
      JSON.stringify(ids) === JSON.stringify([2, 3, 4, 5]), ids);
    rec("⭐ …and not the states that do write one", !ids.includes(1) && !ids.includes(6), ids);
    rec("⚠️ it is a warning", p.severity === "warning", p.severity);
    rec("⚠️ …outside the fatal set", labels.isFatalRule("state_no_name") === false);
    rec("…with a curated label, not the prettified fallback", !!labels.LABELS.state_no_name, labels.mapRuleLabel("state_no_name"));
    rec("…and a fix hint", labels.mapRuleFixHint("state_no_name").length > 15, labels.mapRuleFixHint("state_no_name"));
    rec("…and a message that does not claim a crash", /no name/i.test(String(p.message)) && !/crash/i.test(String(p.message)), String(p.message).slice(0, 200));
    const model = md.buildMapModel({ modRoot: mod, gameRoot: null, dependencyRoots: [], cacheStableLayers: false });
    const two = (model.states || []).find((s) => s.id === 2);
    rec("the editor still sees state 2 as STATE_2, as before", !!two && two.name === "STATE_2", two && two.name);
  }

  console.log("\n3. ⛔ #inherited-problem-not-yours — a nameless state the mod does not ship is not the mod's to fix");
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noname-base-")); tmps.push(base);
    writeDefinition(base);
    for (let i = 1; i <= 6; i++) mk(path.join(base, "history", "states", `${i}-S.txt`), state(i, `name = "STATE_${i}"`));
    mk(path.join(base, "history", "states", "7-Base.txt"), state(7, ""));

    const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noname-addon-")); tmps.push(addon);
    mk(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    rec("⭐⭐⭐ an add-on that ships no states is not told about the base layer's nameless state", nameless(addon, base).length === 0,
      nameless(addon, base).map((x) => x.states));

    const own = fs.mkdtempSync(path.join(os.tmpdir(), "nova-noname-own-")); tmps.push(own);
    mk(path.join(own, "descriptor.mod"), 'name="Own"\n');
    mk(path.join(own, "history", "states", "7-Base.txt"), state(7, ""));
    const r = nameless(own, base);
    rec("⭐⭐ a mod that ships its own copy of that state is told", r.length === 1 && (r[0].states || []).includes(7), r.map((x) => x.states));

    rec("⭐ editing the base layer directly reports it", nameless(base, base).some((x) => (x.states || []).includes(7)), nameless(base, base).map((x) => x.states));
  }

  console.log(`\n=== a state with no name is reported: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
