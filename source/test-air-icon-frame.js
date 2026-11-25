// New Aircraft (POST /api/equipment/family, domain=air) must write the CORRECT air_map_icon_frame per type —
// the strategic-map silhouette. The old table had 6 of 8 wrong (naval bomber drew a tac-bomber icon, scout
// drew a missile, suicide drew a rocket-interceptor, transport drew the suicide icon). Frames are the real
// vanilla per-type values. Run: node test-air-icon-frame.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Verified against vanilla common/units/equipment/*airframe*.txt (land-based, non-carrier archetypes).
const EXPECT = { fighter: 1, cas: 2, naval_bomber: 3, tactical_bomber: 6, strategic_bomber: 11, transport_plane: 12, scout_plane: 13, suicide: 15 };

(async () => {
  const PORT = 3963, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airframe-"));
  fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Air Frame Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  try {
    let i = 0;
    for (const [type, frame] of Object.entries(EXPECT)) {
      const id = `nova_test_${type}_equipment_${i++}`;
      const res = await post("/api/equipment/family", { modPath: mod, id, name: `Test ${type}`, domain: "air", type, tierCount: 1, year: 1970 });
      ok(`create ${type} family ok`, res && res.ok === true, res && res.error);
      const txt = res && res.file ? fs.readFileSync(path.join(mod, "common", "units", "equipment", res.file), "utf8") : "";
      // ALL air families share custom_air_equipment.txt, so scope to THIS archetype's block (from its id) —
      // grabbing the file's first frame would read whichever plane was created first. #shared-air-file
      const block = txt.slice(txt.indexOf(id + " = {"));
      const m = /air_map_icon_frame\s*=\s*(\d+)/.exec(block);
      ok(`${type}: air_map_icon_frame = ${frame} (was wrong before)`, m && Number(m[1]) === frame, m ? m[1] : "no frame written");
      ok(`${type}: writes the type verbatim`, new RegExp(`type = ${type}\\b`).test(block), block.slice(0, 160));
    }
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nAIR-ICON-FRAME: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
