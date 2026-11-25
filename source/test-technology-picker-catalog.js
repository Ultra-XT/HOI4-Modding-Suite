// FINDING #6 regression: the Set-Technology focus-reward effect picker (wizardMode "technology_picker"
// in public/app.js) fills its tech list from /api/technologies/catalog. The endpoint returns the techs
// under the `technologies` key, but the client used to read `payload.items` (undefined) → fell through
// to the `|| payload` fallback (a plain object) → `.map` threw → the picker was ALWAYS EMPTY, so no tech
// could ever be selected for a focus completion_reward. This locks the contract the client now depends
// on: the catalog response exposes the techs under `technologies` (an array of { id, name }), and the
// active mod's own custom techs are included. (Fix: app.js reads `payload.technologies`.)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3533;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, extra != null ? "→ " + extra : ""); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techpicker-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="TechPicker Test"\nsupported_version="*"\n');
  mk("common/technologies/custom.txt",
    "technologies = {\n\tnova_picker_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n");
  mk("localisation/english/custom_l_english.yml", "﻿l_english:\n nova_picker_tech:0 \"Nova Picker Tech\"\n");
  return mod;
}

async function getJson(route, params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(BASE + route + (qs ? "?" + qs : ""));
  let body = null; try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

(async () => {
  console.log("=== TECHNOLOGY-PICKER CATALOG CONTRACT TEST (FINDING #6) ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  try {
    // The exact request the Set-Technology wizard makes (lite, active-mod on, vanilla off for determinism).
    const { status, body } = await getJson("/api/technologies/catalog",
      { sourcePath: mod, modPath: mod, includeVanilla: 0, includeActiveMod: 1, lite: 1 });
    ok("catalog responds 200", status === 200, "HTTP " + status);
    const techs = body && body.technologies;
    ok("response exposes techs under `technologies` (the key the client reads)",
      Array.isArray(techs), JSON.stringify(body && Object.keys(body || {})));
    ok("`technologies` is non-empty", Array.isArray(techs) && techs.length > 0, techs && techs.length);
    ok("each tech carries the id the picker maps",
      Array.isArray(techs) && techs.every((t) => t && typeof t.id === "string"), "a tech is missing its id");
    ok("the active mod's OWN custom tech is included",
      Array.isArray(techs) && techs.some((t) => t.id === "nova_picker_tech"),
      JSON.stringify((techs || []).slice(0, 3)));
    // Regression guard documenting the exact bug: the techs must NOT live under the old client key `items`.
    ok("techs are NOT under `items` (the old, broken client key)",
      !(body && Array.isArray(body.items) && body.items.some((t) => t && t.id === "nova_picker_tech")),
      "items unexpectedly carries the techs");
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    fs.rmSync(mod, { recursive: true, force: true });
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  console.log(`\nTECH-PICKER CATALOG TEST: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
