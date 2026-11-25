// Guard renumberStateId — the wiki's safe way to remove a state with no 1..max id gap (slide the highest
// id down into the freed slot). It must rewrite EVERY kind of state reference, not just the definition:
// the state file (+ its name), supply-area state lists, country capitals, state-id effects/triggers, and
// the bare `<id> = { … }` state scope — without touching unrelated numbers (province ids, values, the
// SAME digits as a substring of another number).
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-renum-"));
const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
const R = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

try {
  // State 100 = the one we'll renumber to 7 (the freed gap). State 1000 is a decoy whose digits CONTAIN
  // 100 (must NOT be touched). Province ids 100/1000 in unrelated places must NOT be touched either.
  w("history/states/100-Old Name.txt", 'state = {\n\tid = 100\n\tname = "STATE_100"\n\tprovinces = { 4001 4002 }\n\thistory = { owner = ENG }\n}\n');
  w("history/states/1000-Decoy.txt",   'state = {\n\tid = 1000\n\tname = "STATE_1000"\n\tprovinces = { 100 1000 }\n\thistory = {}\n}\n'); // provinces 100/1000 = decoys
  w("map/supplyareas/1-area.txt",      'supply_area = {\n\tid = 1\n\tname = "A"\n\tstates = { 100 1000 5 }\n\tvalue = 10\n}\n');
  w("history/countries/ENG - England.txt", 'capital = 100\noecd = yes\nset_research_slots = 4\n');
  w("common/national_focus/eng.txt",   'focus = {\n\tid = f1\n\tcompleted = { owns_state = 100 }\n\tcompletion_reward = {\n\t\ttransfer_state = 100\n\t\tadd_state_core = 1000\n\t\t100 = { add_core_of = ENG }\n\t}\n}\n');
  w("events/eng.txt",                  'country_event = {\n\tid = e.1\n\timmediate = { controls_state = 100 }\n}\n');

  const rep = md.renumberStateId(root, 100, 7);

  ok(/\bid\s*=\s*7\b/.test(R("history/states/7-Old Name.txt")) , "state definition id changed 100 → 7 and file renamed", rep);
  ok(!fs.existsSync(path.join(root, "history/states/100-Old Name.txt")), "old state file is gone");
  ok(/\bid\s*=\s*1000\b/.test(R("history/states/1000-Decoy.txt")) && /provinces = \{ 100 1000 \}/.test(R("history/states/1000-Decoy.txt")), "decoy state 1000 + its province ids 100/1000 untouched", R("history/states/1000-Decoy.txt"));
  ok(/states = \{ 7 1000 5 \}/.test(R("map/supplyareas/1-area.txt")), "supply-area state list: 100 → 7, 1000 kept", R("map/supplyareas/1-area.txt"));
  ok(/capital = 7\b/.test(R("history/countries/ENG - England.txt")), "country capital 100 → 7", R("history/countries/ENG - England.txt"));
  const focus = R("common/national_focus/eng.txt");
  ok(/owns_state = 7\b/.test(focus), "trigger owns_state 100 → 7");
  ok(/transfer_state = 7\b/.test(focus), "effect transfer_state 100 → 7");
  ok(/add_state_core = 1000\b/.test(focus), "add_state_core = 1000 (decoy) NOT touched");
  ok(/\n\t\t7 = \{ add_core_of = ENG \}/.test(focus), "state SCOPE `100 = { … }` → `7 = { … }`", focus);
  ok(/controls_state = 7\b/.test(R("events/eng.txt")), "event trigger controls_state 100 → 7");
  ok(Array.isArray(rep.residualFiles), "report lists residual files (transparency)", rep.residualFiles);

  fs.rmSync(root, { recursive: true, force: true });
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
