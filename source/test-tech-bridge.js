// E2E: research->country bridge. Add a tech to a country (set_technology), confirm it lands,
// merges with existing techs (doesn't clobber), reads back as active, and removes cleanly.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3493, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j=null; try{j=await res.json();}catch(_){} return { status: res.status, json: j }; }
async function get(r) { const res = await fetch(BASE + r); let j=null; try{j=await res.json();}catch(_){} return { status: res.status, json: j }; }

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techbridge-"));
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Tech Bridge Test"\n', "utf8");
  // Country already has one tech researched — bridge must MERGE, not clobber.
  fs.writeFileSync(path.join(mod, "history", "countries", "GER - Germany.txt"),
    "capital = 64\nset_technology = {\n\tinfantry_weapons = 1\n}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const hist = path.join(mod, "history", "countries", "GER - Germany.txt");
  try {
    // 1. status before for a NEW tech
    let r = await get(`/api/technologies/country-tech-status?tag=GER&techId=fighter2&modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.active === false, "status before: not researched", r.json);

    // 2. add fighter2
    r = await post("/api/technologies/set-country-tech", { tag: "GER", techId: "fighter2", active: true, modPath: mod });
    ok(r.json && r.json.ok, "set-country-tech add returned ok", r.json);
    let content = fs.readFileSync(hist, "utf8");
    ok(/set_technology\s*=\s*\{[\s\S]*\bfighter2\s*=\s*1\b/.test(content), "fighter2 = 1 written", content);
    ok(/\binfantry_weapons\s*=\s*1\b/.test(content), "existing infantry_weapons PRESERVED (merge, not clobber)", content);
    ok((content.match(/set_technology\s*=\s*\{/g) || []).length === 1, "still exactly ONE set_technology block", content);

    // 3. status after
    r = await get(`/api/technologies/country-tech-status?tag=GER&techId=fighter2&modPath=${encodeURIComponent(mod)}`);
    ok(r.json && r.json.active === true, "status after: researched", r.json);

    // 4. remove
    r = await post("/api/technologies/set-country-tech", { tag: "GER", techId: "fighter2", active: false, modPath: mod });
    content = fs.readFileSync(hist, "utf8");
    ok(!/\bfighter2\s*=\s*1\b/.test(content), "fighter2 removed on toggle off", content);
    ok(/\binfantry_weapons\s*=\s*1\b/.test(content), "infantry_weapons still preserved after remove", content);

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  finally { server.close(); try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} process.exit(fail ? 1 : 0); }
})();
