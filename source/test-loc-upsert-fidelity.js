// Localisation is cross-cutting — every maker writes it — and a defect there is invisible until the game
// renders a raw token instead of a name. Nothing asserted that writing ONE key leaves the rest of a real,
// heavily-formatted file alone.
//
// Exposure, measured rather than assumed: Millennium Dawn's localisation carries 167,108 lines containing §
// colour codes and 124,650 containing [tokens]; vanilla adds 8 legacy-encoded files. Memory records a
// load-time strip of exactly those codes once destroying MIO names, so this is a live shape, not a
// hypothetical.
//
// The fixture is built to be hostile in the ways that matter: § codes, [tokens], escaped quotes, \n escapes,
// a colon inside a value, an entry with a version number other than 0, and a BOM.
//
// Hermetic — the MD corpus informed the fixture, it is not required to run it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locfid-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "locmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocMod"\nsupported_version="1.18.*"\n', "utf8");

const FILE = "nua_l_english.yml";
const ABS = path.join(MOD, "localisation", "english", FILE);
const REL = "localisation/english/" + FILE;

// Every line here is something a naive rewrite would damage.
const SEED = "﻿" + [
  "l_english:",
  ' nua_colour:0 "§RDanger§! and §Ysafety§!"',
  ' nua_token:0 "Ruled by [ROOT.GetLeader] of [ROOT.GetNameDef]"',
  ' nua_quoted:0 "He said \\"no\\" twice"',
  ' nua_newline:0 "First line\\nSecond line"',
  ' nua_colon:0 "Ratio 3:1 — see notes"',
  ' nua_versioned:3 "A value on version three"',
  ' nua_existing:0 "Original Name"',
  ' nua_existing_desc:0 "Original description"',
  "",
].join("\n");

const PORT = 42413;
const app = createApp();
const server = app.listen(PORT, async () => {
  const upsert = async (entries) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/localization/upsert`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, path: REL, entries }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");
  const raw = () => fs.readFileSync(ABS);
  const count = (t, re) => (t.match(re) || []).length;
  const valueOf = (t, key) => {
    const m = new RegExp(`^\\s*${key}:\\d*\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(t);
    return m ? m[1] : null;
  };

  try {
    console.log("\n[add a key] everything else must survive untouched");
    fs.writeFileSync(ABS, SEED, "utf8");
    const before = read();

    // The contract is { id: { name, desc } } — a bare string leaves name undefined and the writer falls back
    // to the key as its own value, which is how this probe first mis-read the endpoint.
    let r = await upsert({ nua_added: { name: "Added Name", desc: "Added description" } });
    rec("the upsert succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);

    let t = read();
    rec("the new key landed with the value SENT", valueOf(t, "nua_added") === "Added Name", valueOf(t, "nua_added"));
    rec("…and its description too", valueOf(t, "nua_added_desc") === "Added description", valueOf(t, "nua_added_desc"));

    rec("§ colour codes are untouched", count(t, /§/g) === count(before, /§/g),
      { before: count(before, /§/g), after: count(t, /§/g) });
    rec("[tokens] are untouched", count(t, /\[[A-Za-z][A-Za-z0-9_.]*\]/g) === count(before, /\[[A-Za-z][A-Za-z0-9_.]*\]/g),
      { before: count(before, /\[[A-Za-z][A-Za-z0-9_.]*\]/g), after: count(t, /\[[A-Za-z][A-Za-z0-9_.]*\]/g) });
    rec("escaped quotes survive verbatim", valueOf(t, "nua_quoted") === 'He said \\"no\\" twice', valueOf(t, "nua_quoted"));
    rec("\\n escapes are not expanded", valueOf(t, "nua_newline") === "First line\\nSecond line", valueOf(t, "nua_newline"));
    rec("a colon inside a value is not treated as a separator", valueOf(t, "nua_colon") === "Ratio 3:1 — see notes", valueOf(t, "nua_colon"));
    rec("a non-zero version number is preserved", /nua_versioned:3\s/.test(t), (t.match(/nua_versioned:\d+/) || [])[0]);
    rec("the BOM is still there", raw()[0] === 0xEF && raw()[1] === 0xBB && raw()[2] === 0xBF, [...raw().slice(0, 3)]);
    rec("exactly one l_english header", count(t, /^﻿?l_english:/gm) === 1, count(t, /^﻿?l_english:/gm));

    // The sharpest form: no pre-existing line may have changed at all.
    const B = before.split(/\r?\n/), A = t.split(/\r?\n/);
    const m = new Map();
    for (const l of A) m.set(l, (m.get(l) || 0) + 1);
    const gone = [];
    for (const l of B) { const n = m.get(l) || 0; if (n > 0) m.set(l, n - 1); else gone.push(l); }
    rec("not a single pre-existing line changed", gone.length === 0, gone.slice(0, 5));

    console.log("\n[edit an existing key] the value changes and nothing else does");
    r = await upsert({ nua_existing: { name: "Renamed", desc: "New description" } });
    rec("the edit succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("the value was replaced", valueOf(t, "nua_existing") === "Renamed", valueOf(t, "nua_existing"));
    rec("…exactly once, not duplicated", count(t, /^\s*nua_existing:/gm) === 1, count(t, /^\s*nua_existing:/gm));
    rec("the description was replaced too", valueOf(t, "nua_existing_desc") === "New description", valueOf(t, "nua_existing_desc"));
    rec("the formatted neighbours are still intact",
      valueOf(t, "nua_colour") === "§RDanger§! and §Ysafety§!" &&
      valueOf(t, "nua_token") === "Ruled by [ROOT.GetLeader] of [ROOT.GetNameDef]",
      { colour: valueOf(t, "nua_colour"), token: valueOf(t, "nua_token") });

    console.log("\n[omitted desc] means leave it alone, not blank it");
    // #loc-upsert-blanks-desc — the handler documents this rule explicitly.
    r = await upsert({ nua_existing: { name: "Renamed Again" } });
    rec("the name-only edit succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("the name changed", valueOf(t, "nua_existing") === "Renamed Again", valueOf(t, "nua_existing"));
    rec("the description was NOT blanked", valueOf(t, "nua_existing_desc") === "New description", valueOf(t, "nua_existing_desc"));

    console.log("\n[repeat] the same upsert twice is byte-identical");
    const settled = raw();
    await upsert({ nua_existing: { name: "Renamed Again" } });
    rec("a second identical upsert changes nothing", raw().equals(settled),
      { before: settled.length, after: raw().length });

    console.log(`\n=== loc upsert fidelity: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
