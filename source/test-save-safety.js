/**
 * Non-destructive save safety harness (Phase 0 bedrock).
 *
 * Proves the editor's #1 guarantee: saving never corrupts files it didn't author.
 * Drives the REAL server writer over HTTP against a throwaway temp mod, so it
 * exercises the same code path the app uses — no Electron required.
 *
 * Run:  node test-save-safety.js
 * Exit: 0 = all green, 1 = a safety property regressed.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp, constants } = require("./server.js");

const TEST_PORT = 3471;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let passes = 0;
let failures = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

function braceBalanced(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth < 0) return false; }
  }
  return depth === 0;
}

async function post(pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-json error page */ }
  return { status: res.status, json };
}

// A deliberately tricky vanilla-style block: nested limit{} inside enable_equipments,
// equipment_bonus-style stat block, ai_will_do, categories, and an inline comment.
// If the writer ever flattens/corrupts a sibling, this exact text won't survive.
const COMPLEX_B = [
  "\tcomplex_tech_B = {",
  "\t\tenable_equipments = {",
  "\t\t\tlimit = {",
  "\t\t\t\tNOT = { has_dlc = \"By Blood Alone\" }",
  "\t\t\t}",
  "\t\t\tsome_equipment_2",
  "\t\t}",
  "",
  "\t\trocket_artillery = {",
  "\t\t\tsoft_attack = 0.05",
  "\t\t}",
  "",
  "\t\tresearch_cost = 1.5",
  "\t\tstart_year = 1945",
  "",
  "\t\tfolder = {",
  "\t\t\tname = electronics_folder",
  "\t\t\tposition = { x = 7 y = 2 }",
  "\t\t}",
  "",
  "\t\tai_will_do = {",
  "\t\t\tfactor = 1",
  "\t\t}",
  "",
  "\t\tcategories = {",
  "\t\t\trocketry",
  "\t\t}",
  "\t\t# trailing comment inside B",
  "\t}",
].join("\n");

const SIMPLE_A = [
  "\tsimple_tech_A = {",
  "\t\tenable_equipments = {",
  "\t\t\tinfantry_equipment_1",
  "\t\t}",
  "\t\tresearch_cost = 1.0",
  "\t\tstart_year = 1936",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 0 y = 2 }",
  "\t\t}",
  "\t}",
].join("\n");

const SIMPLE_C = [
  "\tsimple_tech_C = {",
  "\t\tresearch_cost = 2.0",
  "\t\tstart_year = 1940",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 1 y = 10 }",
  "\t\t}",
  "\t}",
].join("\n");

function seedFile() {
  return `technologies = {\n${SIMPLE_A}\n\n${COMPLEX_B}\n\n${SIMPLE_C}\n}\n`;
}

let server;
(async () => {
  // ---- Boot the real server on a test port -------------------------------
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(TEST_PORT, resolve); });
  console.log(`[save-safety] server up on ${TEST_PORT}`);

  // ---- Throwaway temp mod ------------------------------------------------
  const tmpMod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-savetest-"));
  fs.writeFileSync(path.join(tmpMod, "descriptor.mod"), 'name="Nova Save Test"\n', "utf8");
  const techDir = path.join(tmpMod, "common", "technologies");
  fs.mkdirSync(techDir, { recursive: true });
  const techFile = path.join(techDir, "custom_technologies.txt");
  fs.writeFileSync(techFile, seedFile(), "utf8");

  try {
    // === TEST 1: vanilla write guard ===
    console.log("\n[1] Vanilla write guard");
    const gameRoot = constants.resolveHoi4GameRoot();
    const evil = {
      technologies: [{ id: "evil_test_tech", isMod: true, folder: "infantry_folder", x: 0, y: 0, name: "Evil", fileName: "custom_technologies.txt" }],
      equipments: {},
      modPath: gameRoot,
    };
    const r1 = await post("/api/technologies/save-batch", evil);
    ok(r1.status === 400, `save-batch to game root rejected (got ${r1.status})`);
    ok(r1.json && /vanilla/i.test(r1.json.error || ""), "rejection mentions vanilla");
    const r1b = await post("/api/technologies/save", { tech: evil.technologies[0], modPath: gameRoot });
    ok(r1b.status === 400, `single save to game root rejected (got ${r1b.status})`);

    // === TEST 2: sibling preservation when ADDING a new tech ===
    console.log("\n[2] Sibling preservation — add new tech D");
    fs.writeFileSync(techFile, seedFile(), "utf8");
    const addD = {
      technologies: [{
        id: "new_tech_D", isMod: true, folder: "infantry_folder", x: 2, y: 4,
        name: "New Tech D", researchCost: 1.5, startYear: 1938,
        prerequisites: [], mutuallyExclusive: [], enableEquipments: [],
        subTechnologies: [], dependencies: [], modifiers: "", extraScript: "",
        iconKey: "", fileName: "custom_technologies.txt",
      }],
      equipments: {},
      modPath: tmpMod,
    };
    const r2 = await post("/api/technologies/save-batch", addD);
    ok(r2.status === 200, `add tech D succeeded (got ${r2.status})`);
    let after = fs.readFileSync(techFile, "utf8");
    ok(after.includes(COMPLEX_B), "complex sibling B preserved byte-for-byte");
    ok(after.includes(SIMPLE_A), "sibling A preserved byte-for-byte");
    ok(after.includes(SIMPLE_C), "sibling C preserved byte-for-byte");
    ok(/\bnew_tech_D\s*=\s*\{/.test(after), "new tech D written");
    ok(braceBalanced(after), "file brace-balanced after add");

    // === TEST 3: sibling preservation when EDITING an existing simple tech ===
    console.log("\n[3] Sibling preservation — edit simple tech A in place");
    fs.writeFileSync(techFile, seedFile(), "utf8");
    const editA = {
      technologies: [{
        id: "simple_tech_A", isMod: true, folder: "infantry_folder", x: 5, y: 6,
        name: "Edited A", researchCost: 3.0, startYear: 1939,
        prerequisites: [], mutuallyExclusive: [], enableEquipments: ["infantry_equipment_1"],
        subTechnologies: [], dependencies: [], modifiers: "", extraScript: "",
        iconKey: "", fileName: "custom_technologies.txt",
      }],
      equipments: {},
      modPath: tmpMod,
    };
    const r3 = await post("/api/technologies/save-batch", editA);
    ok(r3.status === 200, `edit tech A succeeded (got ${r3.status})`);
    after = fs.readFileSync(techFile, "utf8");
    ok(after.includes(COMPLEX_B), "complex sibling B untouched by editing A");
    ok(after.includes(SIMPLE_C), "sibling C untouched by editing A");
    ok(braceBalanced(after), "file brace-balanced after edit");
    // A itself should reflect the new position (y=6 -> still y in folder)
    ok(/simple_tech_A\s*=\s*\{[\s\S]*position\s*=\s*\{\s*x\s*=\s*5/.test(after), "edited A has new x=5");

    // === TEST 4: mod tech round-trips through the catalog ===
    console.log("\n[4] Mod tech round-trips via catalog");
    const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(tmpMod)}`).then(r => r.json());
    const techs = cat.technologies || [];
    const d = techs.find(t => t.id === "new_tech_D");
    // D was added in test 2 but file was overwritten in test 3; re-add then refetch
    await post("/api/technologies/save-batch", addD);
    const cat2 = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(tmpMod)}`).then(r => r.json());
    const d2 = (cat2.technologies || []).find(t => t.id === "new_tech_D");
    ok(!!d2, "tech D present in catalog");
    if (d2) {
      ok(d2.isMod === true, "tech D flagged isMod");
      ok(d2.folder === "infantry_folder", "tech D folder round-tripped");
      ok(Number(d2.researchCost) === 1.5, "tech D research cost round-tripped");
      ok(Number(d2.startYear) === 1938, "tech D start year round-tripped");
    }

    // === TEST 5: localization header auto-repair ===
    console.log("\n[5] Localization header auto-repair");
    const locDir = path.join(tmpMod, "localisation", "english");
    fs.mkdirSync(locDir, { recursive: true });
    const locFile = path.join(locDir, "custom_technologies_l_english.yml");
    fs.writeFileSync(locFile, "", "utf8"); // empty / no header — must not block save
    const r5 = await post("/api/technologies/save-batch", {
      technologies: [{
        id: "loc_tech_E", isMod: true, folder: "infantry_folder", x: 3, y: 4,
        name: "Loc Tech E", researchCost: 1.0, startYear: 1936,
        prerequisites: [], mutuallyExclusive: [], enableEquipments: [],
        subTechnologies: [], dependencies: [], modifiers: "", extraScript: "",
        iconKey: "", fileName: "custom_technologies.txt",
      }],
      equipments: {},
      modPath: tmpMod,
    });
    ok(r5.status === 200, `save with empty loc file succeeded (got ${r5.status})`);
    const locTxt = fs.readFileSync(locFile, "utf8");
    ok(/l_english\s*:/.test(locTxt), "loc header auto-repaired");
    ok(/loc_tech_E\s*:\s*0\s+"Loc Tech E"/.test(locTxt), "loc entry written");

    // === TEST 6: every maker's write endpoint refuses the vanilla game root ===
    console.log("\n[6] All makers reject writes to the vanilla game root");
    const G = constants.resolveHoi4GameRoot();
    const rejects = async (label, pathName, body) => {
      const r = await post(pathName, body);
      ok(r.status === 400, `${label} rejected at game root (got ${r.status})`);
    };
    await rejects("events/save", "/api/events/save",
      { modPath: G, namespace: "nova_test", id: 1, type: "country_event", title: "t", description: "d", picture: "", triggeredOnly: "yes", options: [] });
    await rejects("decisions/save", "/api/decisions/save",
      { modPath: G, categoryId: "nova_cat", id: "nova_dec", cost: 0, icon: "", days: 0, fireOnce: false, available: "", modifier: "", effect: "" });
    await rejects("ideas/upsert-definition", "/api/ideas/upsert-definition",
      { modPath: G, ideaId: "nova_spirit", targetRelativeFile: "common/ideas/nova.txt", name: "Nova", desc: "", picture: "", selectedEffects: [], mode: "create" });
    await rejects("history/set-startup", "/api/history/set-startup",
      { modPath: G, tag: "GER", itemId: "nova_spirit", itemType: "spirit", active: true });
    await rejects("mod/add-focus-tree", "/api/mod/add-focus-tree",
      { modPath: G, fileName: "nova_test_tree.txt" });
    await rejects("save (focus)", "/api/save",
      { path: path.join(G, "common", "national_focus", "nova_test.txt"), content: "focus_tree = {}" });

  } finally {
    // cleanup
    try { fs.rmSync(tmpMod, { recursive: true, force: true }); } catch (_) {}
    if (server) server.close();
  }

  console.log(`\n========================================`);
  console.log(`  ${passes} passed, ${failures} failed`);
  console.log(`========================================`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("HARNESS ERROR:", err);
  if (server) server.close();
  process.exit(1);
});
