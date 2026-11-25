// 3D unit models for a division_template's `override_model`. The parser must take each `entity = { … }`
// block's OWN top-level name — NOT every `name = "…_entity"` in the file, which would swallow `attach = { … }`
// references to entities the file doesn't define, and `state = { name = "idle" }` noise.
// Run: node test-unit-entities.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const PORT = 3941, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-entities-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Entity Test"\n');

  // Mirrors the real shapes found on disk, including the two traps.
  mk("gfx/entities/units_test.asset",
    'entity = {\n' +
    '\tname = "NOVA_infantry_entity"\n' +
    '\tpdxmesh = "nova_infantry_mesh"\n' +
    // TRAP 1: a nested state block with its own `name` — must NOT become an entity.
    '\tstate = { name = "idle" animation = "idle" }\n' +
    '\tstate = { name = "retreat" animation = "idle" }\n' +
    '}\n' +
    'entity = {\n' +
    '\tname = "NOVA_artillery_entity"\n' +
    '\tpdxmesh = "nova_arty_mesh"\n' +
    // TRAP 2: an attach REFERENCE to an entity defined elsewhere — must NOT be listed as defined here.
    '\tattach = { name = infantry\tinfantry = "SOMEONE_ELSES_entity" }\n' +
    '}\n' +
    // TRAP 3: a commented-out entity must not count.
    '#entity = { name = "NOVA_commented_out_entity" }\n');

  try {
    const d = await fetch(`${BASE}/api/army/entities?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("endpoint answers", d && d.ok === true, d);
    const e = d.entities || [];
    ok("finds a real entity definition", e.includes("NOVA_infantry_entity"), e.slice(0, 8));
    ok("finds the second one too", e.includes("NOVA_artillery_entity"), e.slice(0, 8));
    // The three traps — each one silently corrupts the list if the parser is naive.
    ok("a nested state's name is NOT an entity", !e.includes("idle") && !e.includes("retreat"), e.filter((x) => /idle|retreat/.test(x)));
    ok("an `attach` REFERENCE is not treated as a definition here", !e.includes("SOMEONE_ELSES_entity"), e);
    ok("a commented-out entity is ignored", !e.includes("NOVA_commented_out_entity"), e);
    ok("sorted + de-duped", JSON.stringify(e) === JSON.stringify([...new Set(e)].sort()), e.slice(0, 5));

    // Against the REAL game when it's present: the union must contain a known-good vanilla entity, and must
    // NOT contain entities that only exist in DLC the machine doesn't have (they're simply absent, which is
    // why this list is a suggestion and never a validator).
    const GAME = "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
    if (fs.existsSync(GAME)) {
      const real = await fetch(`${BASE}/api/army/entities?modPath=${encodeURIComponent(GAME)}`).then((r) => r.json());
      const re = real.entities || [];
      ok("real game scan returns a substantial list", re.length > 500, re.length);
      ok("...including a known vanilla entity", re.includes("GER_battleship_entity"), re.length);
      ok("...and no bare 'idle' leaked from state blocks", !re.includes("idle"), re.filter((x) => x === "idle"));
    }
    const bad = await fetch(`${BASE}/api/army/entities?modPath=`).then((r) => r.json());
    ok("no mod → a clean error, not a crash", bad && (bad.ok === false || Array.isArray(bad.entities)), bad);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nUNIT-ENTITIES: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
