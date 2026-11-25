// Unit test: generateLand — the auto land generator. Turns a procedural subset of SEA provinces into LAND and
// wraps them in VALID states. Crash-safe per every rule: keeps province ids, only flips sea provinces that have
// a strategic region, groups the new states BY REGION (a state spanning two regions crashes), and gives each
// state the mandatory fields (id/name/manpower/state_category/provinces) with contiguous ids. Builds a synthetic
// ALL-SEA mod (two strategic regions) and verifies on disk. Run: node test-map-generate-land.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildAllSeaMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genland-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Gen"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  // 12 sea provinces (1..12) + dummy 0. All ocean — a blank canvas.
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= 12; i++) rows.push(`${i};${i * 17 % 256};${i * 53 % 256};${i * 91 % 256};sea;false;ocean;0;`);
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  // Two strategic regions partition the provinces (1..6 and 7..12) — so generated states must respect them.
  mk(path.join(mod, "map", "strategicregions", "r1.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 5 6 }\n\tweather={}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r2.txt"), 'strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ 7 8 9 10 11 12 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
function readStates(mod) {
  const dir = path.join(mod, "history", "states");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = parseInt((/id\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const cat = (/state_category\s*=\s*(\w+)/.exec(t) || [])[1];
    const mp = parseInt((/manpower\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const provs = ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").match(/\d+/g) || [];
    return { id, cat, mp, provs: provs.map(Number) };
  });
}

(() => {
  console.log("=== generateLand (auto land generator) ===");
  const mod = buildAllSeaMod();
  try {
    const csvLines0 = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n").length;
    const reg1Before = fs.readFileSync(path.join(mod, "map", "strategicregions", "r1.txt"), "utf8");

    const r = md.generateLand({ modRoot: mod, count: 8, provincesPerState: 3, seed: 7 });
    ok("generate reports changed + flipped 8 provinces", r.changed === true && r.flippedProvinces === 8, r);
    ok("created at least 3 states (8 provinces, ≤3 each, split across 2 regions)", r.createdStates >= 3, r.createdStates);

    // definition.csv: exactly 8 provinces are now land; ids/rows unchanged.
    let landCount = 0; for (let i = 1; i <= 12; i++) if (defRow(mod, i)[4] === "land") landCount++;
    ok("exactly 8 provinces became land", landCount === 8, landCount);
    ok("province ids unchanged (same definition row count)", fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n").length === csvLines0);
    ok("every generated land province has a NON-ZERO continent + plains terrain", (() => { for (let i = 1; i <= 12; i++) { const c = defRow(mod, i); if (c[4] === "land" && !(parseInt(c[7], 10) >= 1 && c[6] === "plains")) return false; } return true; })());

    const states = readStates(mod);
    const allProvs = states.flatMap((s) => s.provs);
    ok("every land province is in exactly one state (no stateless land)", (() => {
      const land = []; for (let i = 1; i <= 12; i++) if (defRow(mod, i)[4] === "land") land.push(i);
      return land.every((p) => allProvs.filter((q) => q === p).length === 1);
    })());
    ok("no SEA province got put in a state", allProvs.every((p) => defRow(mod, p)[4] === "land"));
    ok("every state has a category (rural) + manpower > 0", states.every((s) => s.cat === "rural" && s.mp > 0));

    // State ids contiguous starting at 1 (blank canvas had 0 states).
    const ids = states.map((s) => s.id).sort((a, b) => a - b);
    ok("state ids are contiguous starting at 1", ids[0] === 1 && ids.every((v, i) => v === i + 1), ids);

    // CRASH-SAFETY: no state's provinces span two strategic regions (1..6 = region 1, 7..12 = region 2).
    ok("no state spans two strategic regions", states.every((s) => {
      const regs = new Set(s.provs.map((p) => (p <= 6 ? 1 : 2)));
      return regs.size <= 1;
    }), states.map((s) => s.provs));

    ok("strategic region files untouched", fs.readFileSync(path.join(mod, "map", "strategicregions", "r1.txt"), "utf8") === reg1Before);

    // Deterministic for a given seed.
    const mod2 = buildAllSeaMod();
    const r2 = md.generateLand({ modRoot: mod2, count: 8, provincesPerState: 3, seed: 7 });
    const land1 = []; for (let i = 1; i <= 12; i++) if (defRow(mod, i)[4] === "land") land1.push(i);
    const land2 = []; for (let i = 1; i <= 12; i++) if (defRow(mod2, i)[4] === "land") land2.push(i);
    ok("same seed → same generated land set (deterministic)", JSON.stringify(land1) === JSON.stringify(land2));
    try { fs.rmSync(mod2, { recursive: true, force: true }); } catch (_) {}

    console.log(`\ntest-map-generate-land: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
