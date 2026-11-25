// A new state must adopt the name, manpower and category the server actually wrote.
// #a-new-state-keeps-its-placeholder-name
//
// "+ New state" builds a LOCAL state with placeholders — name "STATE_new1", displayName "New state 1",
// manpower 0, no category — and queues a create. createState picks the real values:
//
//   name           = "STATE_<realId>"   (or whatever the caller typed)
//   manpower       = >= 1000            the guard against HOI4's "State has no people living in it"
//   state_category = rural              the guard against state_no_category / unsized building slots
//
// …and returns all of them. The client read back only `res.id`. So after Save the page held a state whose
// name was a placeholder that appears in no file on disk, and whose manpower read 0 against the 1000 that
// was written. Two consequences, both silent:
//
//   · rename it, and the localisation is written under the placeholder key while the state file says
//     STATE_<realId> — the game shows the raw token;
//   · edit any other field, and the panel sends manpower 0 back, undoing the very default that exists to
//     stop "State has no people living in it".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

// ── the server half: it has to REPORT what it chose ──────────────────────────────────────────────────
console.log("\n=== createState says what it wrote, not just the id ===");
const tmps = [];
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newstate-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="NS"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });

  const r = md.createState({ modRoot: d, gameRoot: path.join(d, "__nogame__"), dependencyRoots: [], owner: "AAA", provinces: [11, 12] });
  ok(r && r.ok === true, "a state is created", r && r.error);
  ok(Number.isFinite(r.id), "…with a real id", r && r.id);
  ok(r.name === `STATE_${r.id}`, "⭐ …and it reports the NAME it wrote", r && r.name);
  ok(r.manpower > 0, "⭐ …the MANPOWER it defaulted", r && r.manpower);
  ok(!!r.category, "⭐ …and the CATEGORY it defaulted", r && r.category);

  // …and those really are what is on disk, not just what it claims.
  // ⚠️ `file` is mod-relative (e.g. "1-STATE_1.txt"), not an absolute path.
  const onDisk = path.isAbsolute(r.file) ? r.file : path.join(d, "history", "states", r.file);
  const text = fs.readFileSync(onDisk, "utf8");
  ok(text.indexOf(`name = "${r.name}"`) >= 0, "the name it reported is the name in the file", text.slice(0, 160));
  ok(new RegExp(`manpower\\s*=\\s*${r.manpower}\\b`).test(text), "…and so is the manpower", text.slice(0, 200));
  ok(new RegExp(`state_category\\s*=\\s*${r.category}\\b`).test(text), "…and the category", text.slice(0, 220));
}

// ── the client half: it has to ADOPT them ────────────────────────────────────────────────────────────
console.log("\n=== …and the page adopts them instead of keeping its placeholders ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const MASKED = maskJsComments(MAP);
  const s = MASKED.indexOf("function remapLocalStateId");
  const remap = s < 0 ? "" : MAP.slice(s, MASKED.indexOf("\n  }", s) + 4);
  ok(remap.length > 200, "remapLocalStateId lifted", remap.length);

  // The flush must actually hand it the response, or the parameter is decoration.
  ok(/remapLocalStateId\(w\.meta\.provisionalId, res\.id, res\)/.test(MASKED),
    "⭐ the save passes the create's response through, not just the id");

  const sandbox = {
    console,
    stateById: new Map(),
    model: { states: [], provinceToState: {}, stateToSupplyArea: {}, capitals: {} },
    selected: null, stateFormBaseline: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(remap, sandbox);

  // Exactly what "+ New state" builds locally (public/map.js), then exactly what createState returns.
  const mkLocal = () => ({ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [11, 12],
    owner: "AAA", cores: ["AAA"], manpower: 0, category: "", victoryPoints: [], buildings: {}, resources: {} });
  const served = { ok: true, id: 5, file: "x", name: "STATE_5", manpower: 2000, category: "rural" };

  sandbox.st = mkLocal();
  vm.runInContext("stateById.set(-1, st); model.states = [st]; model.provinceToState = { 11: -1, 12: -1 };", sandbox);
  sandbox.served = served;
  vm.runInContext("remapLocalStateId(-1, 5, served);", sandbox);
  ok(sandbox.st.id === 5, "the id is remapped, as before", sandbox.st.id);
  ok(sandbox.st.name === "STATE_5",
    "⭐⭐⭐ the placeholder name is replaced by the one on disk", sandbox.st.name);
  ok(sandbox.st.displayName === "STATE_5",
    "⭐⭐ …and the display name with it, so the panel stops showing “New state 1”", sandbox.st.displayName);
  ok(sandbox.st.manpower === 2000,
    "⭐⭐⭐ …and manpower is the 2000 written, not the 0 placeholder — the next panel edit cannot undo it",
    sandbox.st.manpower);
  ok(sandbox.st.category === "rural", "…and the category is adopted too", sandbox.st.category);

  // ⚠️ THE CONTROL: a name the MODDER typed is theirs. Adopting the server's name over it would rename
  // their state behind their back, which is a worse bug than the one being fixed.
  const mine = mkLocal();
  mine.name = "STATE_MY_HOMELAND";
  mine.displayName = "My Homeland";
  mine.manpower = 50000;
  mine.category = "urban";
  sandbox.st2 = mine;
  vm.runInContext("stateById.set(-1, st2); model.states = [st2];", sandbox);
  vm.runInContext("remapLocalStateId(-1, 6, { ok: true, id: 6, name: 'STATE_6', manpower: 2000, category: 'rural' });", sandbox);
  ok(sandbox.st2.id === 6, "the modder's own state is still remapped", sandbox.st2.id);
  ok(sandbox.st2.name === "STATE_MY_HOMELAND",
    "⚠️⚠️ …but the name THEY chose is left alone", sandbox.st2.name);
  ok(sandbox.st2.displayName === "My Homeland", "⚠️ …and so is their display name", sandbox.st2.displayName);
  ok(sandbox.st2.manpower === 50000, "⚠️ …and their manpower is not overwritten", sandbox.st2.manpower);
  ok(sandbox.st2.category === "urban", "⚠️ …nor their category", sandbox.st2.category);

  // …and a response without the new fields (an older server, or a create that failed to report) must not
  // wipe anything.
  const bare = mkLocal();
  sandbox.st3 = bare;
  vm.runInContext("stateById.set(-1, st3); model.states = [st3];", sandbox);
  vm.runInContext("remapLocalStateId(-1, 7, { ok: true, id: 7 });", sandbox);
  ok(sandbox.st3.id === 7 && sandbox.st3.name === "STATE_new1",
    "a response with no name leaves the placeholder rather than blanking it", sandbox.st3.name);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a new state adopts what the server named it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
