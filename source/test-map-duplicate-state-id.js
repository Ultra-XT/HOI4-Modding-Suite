// Regression guard: a DUPLICATE state id within one root must resolve FIRST-file-wins (HOI4 load order),
// not last-wins. Real mods ship stray second files for an id — e.g. Millennium Dawn's auto-generated
// `<id>-restored.txt` China stubs beside the real `<id>-<Name>.txt`. HOI4 loads history/states
// alphabetically and keeps the first definition (an uppercase name sorts before lowercase "restored"),
// so the real state's provinces are owned in-game. Last-wins made Nova keep the stub and paint those
// provinces as stateless/grey — the bug the user hit on MD's Egyptian/Libyan/Sudanese deserts.
const md = require("./map-data.js");
const fs = require("fs"), os = require("os"), path = require("path");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupstate-"));
fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
const w = (name, body) => fs.writeFileSync(path.join(root, "history", "states", name), body, "utf8");
// The REAL state (proper name → sorts first) lists the desert provinces.
w("200-Western Desert.txt", 'state = {\n\tid = 200\n\tname = "Western Desert"\n\tprovinces = { 11 12 13 }\n\thistory = { owner = EGY }\n}\n');
// The junk stub (lowercase "restored" → sorts last) reassigns id 200 to one throwaway province.
w("200-restored.txt", 'state = {\n\tid = 200\n\tname = "STATE_200"\n\tprovinces = { 99 }\n\thistory = { owner = CHI }\n}\n');
// A control state with no duplicate, to prove normal states are untouched.
w("201-Cairo.txt", 'state = {\n\tid = 201\n\tname = "Cairo"\n\tprovinces = { 20 }\n\thistory = { owner = EGY }\n}\n');

try {
  const states = md.readStatesFromRoot(root);
  const s200 = states.filter((s) => s.id === 200);
  ok(s200.length === 1, "state 200 appears exactly once (deduped by id)", s200.length);
  const provs = s200[0] ? s200[0].provinces : [];
  ok(provs.includes(11) && provs.includes(12) && provs.includes(13), "the REAL file's provinces win (11,12,13)", provs);
  ok(!provs.includes(99), "the `-restored` stub's province (99) does NOT win", provs);
  ok(s200[0] && s200[0].owner === "EGY", "the real owner (EGY) wins, not the stub's CHI", s200[0] && s200[0].owner);
  ok(s200[0] && s200[0].file === "200-Western Desert.txt", "the first-alphabetical file is the kept source", s200[0] && s200[0].file);
  const s201 = states.find((s) => s.id === 201);
  ok(s201 && s201.provinces.includes(20), "a non-duplicated state is unaffected", s201 && s201.provinces);
} catch (e) { ok(false, "threw: " + e.message); }
finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
