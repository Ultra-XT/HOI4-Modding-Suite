// Regression: a country history file named with the UNDERSCORE convention "TAG_Name.txt" must round-trip.
// The file WRITER (findCountryHistoryFile) always matched "TAG_…", but the READER (findModCountryFile) did
// not — so on such a mod, a variant/stockpile save read [] and then rebuilt the region from just the new
// entry, SILENTLY WIPING every prior variant. Both now share countryHistoryFileMatches. This test drives the
// real read→filter→write path through the delete endpoint and proves the sibling survives. #country-file-match
// Run: node test-country-file-underscore.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const PORT = 47961;
const BASE = `http://127.0.0.1:${PORT}`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-underscore-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="underscore test"\n');

const NOVA_START = "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>";
const NOVA_END = "# <<< NOVA equipment variants <<<";
const hdr = (v) => "# NOVA-VARIANT " + JSON.stringify(v);
const mkVar = (name) => ({ name, chassisType: "mbt_hull_0", dlc: "No Step Back", modules: [], upgrades: {}, fallbackType: "light_tank_equipment_1", fallbackUpgrades: {}, icon: "", obsolete: false });

// GER file uses the UNDERSCORE separator and already holds TWO Nova-managed variants.
fs.writeFileSync(path.join(mod, "history", "countries", "GER_Germany.txt"), [
  "capital = 64", "",
  NOVA_START, hdr(mkVar("Alpha")), hdr(mkVar("Beta")), NOVA_END, "",
  "1936.1.1 = {", "\tadd_political_power = 10", "}", "",
].join("\n"));

// Control: the classic "TAG - Name.txt" dash form must keep working.
fs.writeFileSync(path.join(mod, "history", "countries", "USA - United States.txt"), [
  "capital = 361", "",
  NOVA_START, hdr(mkVar("Gamma")), NOVA_END, "",
  "1936.1.1 = {", "\tadd_political_power = 5", "}", "",
].join("\n"));

const list = (tag) => fetch(`${BASE}/api/equipment/variant/list?modPath=${encodeURIComponent(mod)}&tag=${tag}`).then((r) => r.json());
const del = (tag, name) => fetch(`${BASE}/api/equipment/variant/delete`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ modPath: mod, tag, name }),
}).then((r) => r.json());

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // READ side of the fix: the underscore file must be found and both variants returned.
    const before = await list("GER");
    ok("underscore file: reader finds it and returns BOTH variants", before.ok && (before.variants || []).length === 2 && before.variants.every((v) => ["Alpha", "Beta"].includes(v.name)), before.variants);

    // WRITE round-trip: deleting Alpha must KEEP Beta — the data-loss bug wiped both because the read returned [].
    const d = await del("GER", "Alpha");
    ok("delete Alpha succeeds", d.ok === true, d.error);
    const after = await list("GER");
    ok("underscore file: Beta SURVIVES the delete (no silent wipe)", after.ok && (after.variants || []).length === 1 && after.variants[0].name === "Beta", after.variants);
    const disk = fs.readFileSync(path.join(mod, "history", "countries", "GER_Germany.txt"), "utf8");
    ok("on disk: Beta kept, Alpha gone, braces balanced, date block intact", /Beta/.test(disk) && !/"Alpha"/.test(disk) && !/name = "Alpha"/.test(disk) && /1936\.1\.1/.test(disk) && (disk.match(/{/g) || []).length === (disk.match(/}/g) || []).length, disk.slice(0, 160));
    ok("no duplicate GER file was minted (still exactly one)", fs.readdirSync(path.join(mod, "history", "countries")).filter((f) => /^GER/i.test(f)).length === 1, fs.readdirSync(path.join(mod, "history", "countries")));

    // Control: dash-form file still reads correctly (regression guard for the existing conventions).
    const usa = await list("USA");
    ok("dash-form 'TAG - Name.txt' still reads its variant", usa.ok && (usa.variants || []).length === 1 && usa.variants[0].name === "Gamma", usa.variants);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-FILE-UNDERSCORE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
