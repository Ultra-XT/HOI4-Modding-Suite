/**
 * Integration test for POST /api/modhealth/fix (Mod Health "✨ AI Auto-Fix").
 *
 * Boots the REAL server headless via createApp() — no Electron, no Gemini key needed.
 * Covers everything that does NOT require a live AI call: the safety guards, the
 * deterministic missing_localization fix, and the orphan_spirit redirect. The AI path
 * (broken_reference / duplicate_id) reuses the proven /api/ai/logic plumbing plus the
 * same backup + atomic write exercised here, and is hard-validated before applying.
 *
 * Run:  node test-modhealth-fix.js
 * Exit: 0 = all green, 1 = a property regressed.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp, constants } = require("./server.js");

const PORT = 3472;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ FAIL: " + msg + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
async function post(route, body) {
  const r = await fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
async function get(route) {
  const r = await fetch(`${BASE}${route}`);
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhfix-"));
  fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
  fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova MH Fix Test"\n', "utf8");
  // A country spirit with NO localisation key -> triggers missing_localization (and,
  // since nothing grants it, also orphan_spirit — we target only the loc one).
  fs.writeFileSync(path.join(mod, "common", "ideas", "spirits.txt"),
    "ideas = {\n\tcountry = {\n\t\tnova_test_spirit = {\n\t\t\tallowed = { always = yes }\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { political_power_gain = 0.05 }\n\t\t}\n\t}\n}\n", "utf8");
  // Existing loc file with header only (the fix should append into this one).
  fs.writeFileSync(path.join(mod, "localisation", "english", "custom_l_english.yml"), "﻿l_english:\n", "utf8");
  return mod;
}

const FAKE = "FAKE_KEY_FOR_GUARD_TESTS";

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  console.log(`[modhealth-fix] server up on ${PORT}`);
  const mod = setupMod();
  const gameRoot = constants.resolveHoi4GameRoot();
  let r;
  try {
    console.log("\n[guards]");
    r = await post("/api/modhealth/fix", { modPath: mod });
    ok(r.json && /problem data/i.test(r.json.error || ""), "no problem -> error", r.json);

    r = await post("/api/modhealth/fix", { modPath: mod, apiKey: FAKE, problem: { rule: "broken_reference", file: "../../escape.txt", message: "m" } });
    ok(r.json && /outside the selected mod/i.test(r.json.error || ""), "path traversal -> refused", r.json);

    r = await post("/api/modhealth/fix", { modPath: mod, apiKey: FAKE, problem: { rule: "broken_reference", file: "common/ideas/nope.txt", message: "m" } });
    ok(r.json && /file not found/i.test(r.json.error || ""), "missing file -> error", r.json);

    if (gameRoot) {
      r = await post("/api/modhealth/fix", { modPath: gameRoot, apiKey: FAKE, problem: { rule: "broken_reference", file: "common/ideas/x.txt", message: "m" } });
      ok(r.json && /vanilla|does not exist|must be under/i.test(r.json.error || ""), "vanilla game root -> refused", r.json);
    } else { console.log("  (no game root resolvable; skipping vanilla guard)"); }

    r = await post("/api/modhealth/fix", { modPath: mod, problem: { rule: "broken_reference", file: "common/ideas/spirits.txt", message: "m" } });
    if (!process.env.GEMINI_API_KEY) ok(r.json && /api key/i.test(r.json.error || ""), "no api key -> graceful error", r.json);
    else console.log("  (GEMINI_API_KEY set; skipping no-key case)");

    console.log("\n[orphan_spirit redirect]");
    const spiritsBefore = fs.readFileSync(path.join(mod, "common", "ideas", "spirits.txt"), "utf8");
    r = await post("/api/modhealth/fix", { modPath: mod, problem: { rule: "orphan_spirit", entityId: "nova_test_spirit", file: "common/ideas/spirits.txt", message: "m" } });
    ok(r.json && /add to a country/i.test(r.json.error || ""), "orphan -> redirect message", r.json);
    ok(fs.readFileSync(path.join(mod, "common", "ideas", "spirits.txt"), "utf8") === spiritsBefore, "orphan redirect wrote nothing");

    console.log("\n[missing_localization deterministic fix]");
    let scan = await get("/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod));
    const problems = (scan.json && scan.json.problems) || [];
    const target = problems.find((p) => p.rule === "missing_localization" && p.entityId === "nova_test_spirit");
    ok(!!target, "scan found the missing_localization problem", problems.map((p) => p.rule + ":" + p.entityId));
    if (target) {
      r = await post("/api/modhealth/fix", { modPath: mod, problem: target });
      ok(r.json && r.json.ok === true && r.json.mode === "localization", "fix returned ok (localization mode)", r.json);

      const locText = fs.readFileSync(path.join(mod, "localisation", "english", "custom_l_english.yml"), "utf8");
      ok(/^\s*nova_test_spirit:0\s+"Nova Test Spirit"\s*$/m.test(locText), "loc key added with humanized name", locText);
      ok(/^﻿?l_english:/.test(locText), "loc header preserved", locText.slice(0, 20));
      ok(r.json.backupPath && fs.existsSync(r.json.backupPath), "loc backup created on disk", r.json.backupPath);

      scan = await get("/api/mod/index?fresh=1&modPath=" + encodeURIComponent(mod));
      const stillMissing = ((scan.json && scan.json.problems) || []).some((p) => p.rule === "missing_localization" && p.entityId === "nova_test_spirit");
      ok(!stillMissing, "rescan no longer reports missing_localization");

      // Spirit definition file must be completely untouched by a loc fix.
      ok(fs.readFileSync(path.join(mod, "common", "ideas", "spirits.txt"), "utf8") === spiritsBefore, "spirits.txt untouched by loc fix");
    }

    // ---- loc_missing_bom -> deterministic re-save WITH a BOM (no AI) ----
    {
      const relBom = "localisation/english/nobom_l_english.yml";
      const bomFile = path.join(mod, "localisation", "english", "nobom_l_english.yml");
      fs.mkdirSync(path.dirname(bomFile), { recursive: true });
      fs.writeFileSync(bomFile, `l_english:\n some_key:0 "Some Name"\n`, "utf8"); // NO bom
      ok(fs.readFileSync(bomFile, "utf8").charCodeAt(0) !== 0xFEFF, "precondition: loc file has no BOM");
      const r = await post("/api/modhealth/fix", { modPath: mod, problem: { rule: "loc_missing_bom", entityType: "localisation", file: relBom } });
      ok(r.json && r.json.ok && r.json.mode === "bom", "BOM fix returns ok/mode=bom", r.json);
      ok(fs.readFileSync(bomFile, "utf8").charCodeAt(0) === 0xFEFF, "loc file now starts with a UTF-8 BOM");
      ok(/some_key:0 "Some Name"/.test(fs.readFileSync(bomFile, "utf8")), "loc file content preserved");
      ok(r.json.backupPath && fs.existsSync(r.json.backupPath), "BOM fix backed up the original");
      // path-traversal guard: a file outside the mod must be refused
      const evil = await post("/api/modhealth/fix", { modPath: mod, problem: { rule: "loc_missing_bom", file: "../../evil.yml" } });
      ok(evil.json && evil.json.error, "BOM fix refuses a path outside the mod", evil.json);
    }

    console.log("\n========================================");
    console.log(`  ${pass} passed, ${fail} failed`);
    console.log("========================================");
  } catch (e) {
    console.error(e); fail++;
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    process.exit(fail > 0 ? 1 : 0);
  }
})();
