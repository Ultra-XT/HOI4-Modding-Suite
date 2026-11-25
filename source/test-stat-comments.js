// Stat parsers must ignore `#`-commented lines. getStat (managed equipment stats) and the module add_stats/
// multiply_stats parser both matched their stat name anywhere in the block with no comment stripping, so a
// commented-out `# defense = 4` (MD's AA_Equipment) or `#soft_attack = 1` (vanilla tank_riveted_armor) showed
// as a live combat value. Run: node test-stat-comments.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statcmt-"));
fs.mkdirSync(path.join(mod, "common", "units", "equipment", "modules"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="stat comment test"\n');
// Equipment: defense + breakthrough COMMENTED OUT; soft_attack + hard_attack live.
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "custom.txt"), [
  "equipments = {",
  "\tnova_at_test = {",
  "\t\tyear = 1936",
  "\t\ttype = anti_tank",
  "\t\t# defense = 4",
  "\t\t# breakthrough = 1",
  "\t\tsoft_attack = 3",
  "\t\thard_attack = 7",
  "\t}",
  "}",
].join("\n"));
// Module: add_stats with a COMMENTED soft_attack, live defense + breakthrough.
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "modules", "custom_mods.txt"), [
  "equipment_modules = {",
  "\tnova_riveted = {",
  "\t\tcategory = nova_armor",
  "\t\tadd_stats = {",
  "\t\t\t#soft_attack = 1",
  "\t\t\tdefense = 2",
  "\t\t\tbreakthrough = 2",
  "\t\t}",
  "\t}",
  "}",
].join("\n"));

(async () => {
  const PORT = 3987, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // #2 managed equipment stats (getStat)
    const l = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const e = (l.equipment || []).find((x) => x.id === "nova_at_test");
    ok("equipment scanned", !!e, l && l.error);
    ok("live stats read (soft_attack=3, hard_attack=7)", e && e.softAttack === 3 && e.hardAttack === 7, e && { s: e.softAttack, h: e.hardAttack });
    ok("COMMENTED defense is NOT read (undefined, not 4)", e && (e.defense == null), e && e.defense);
    ok("COMMENTED breakthrough is NOT read (undefined, not 1)", e && (e.breakthrough == null), e && e.breakthrough);

    // #3 module stat deltas (add_stats)
    const md = await fetch(`${BASE}/api/equipment/modules?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const m = (md.modules || []).find((x) => x.id === "nova_riveted");
    ok("module scanned", !!m, md && md.error);
    ok("live deltas read (defense=2, breakthrough=2)", m && m.addStats && m.addStats.defense === 2 && m.addStats.breakthrough === 2, m && m.addStats);
    ok("COMMENTED soft_attack delta is NOT read (absent, no phantom +1)", m && m.addStats && !("soft_attack" in m.addStats), m && m.addStats);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nSTAT-COMMENTS: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
