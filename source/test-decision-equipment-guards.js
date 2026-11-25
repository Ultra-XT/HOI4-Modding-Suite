// Regression (bug-hunt #7): two HIGH corruption vectors.
//  (1) The Decision maker spliced free-text (available/visible/allowed/modifier/effect/remove/ai_will_do)
//      into the category file and wrote it with NO brace-balance guard — the 4th free-text write path missed
//      by hunt #5 (events + ideas were guarded; decisions was not). An unbalanced { corrupts the whole
//      category file (a stray brace consumes the category close, breaking every sibling decision).
//  (2) The equipment id was written UNVALIDATED, unlike the tech id (which is guarded client + server). A
//      leading-digit id like "123abc" is lexed by HOI4 as a number where a key is expected → the entire
//      equipment file fails to load. Now validated up-front (no partial save) + in the writer + client-side.
// Run: node test-decision-equipment-guards.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };
const balanced = (s) => { let d = 0; for (const c of String(s).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const balancedOrAbsent = (p) => !fs.existsSync(p) || balanced(fs.readFileSync(p, "utf8"));

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deqguard-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DEQGuard"\n');
const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o, json: (() => { try { return JSON.parse(o); } catch (_) { return null; } })() })); });
  r.on("error", rej); r.write(data); r.end();
});
const rejected = (r) => r.status >= 400 || (r.json && (r.json.ok === false || r.json.error));

// `political_decisions` is a real VANILLA filename, and a mod file at a vanilla file's relative path
// replaces it wholesale in HOI4 — so the save deliberately redirects to a nova_-prefixed name rather than
// silently deleting every vanilla decision in that file (#no-shadow-write). Resolve whichever of the two
// actually got written instead of assuming the un-prefixed one.
const decDir = path.join(mod, "common", "decisions");
const decPathFor = () => {
  for (const n of ["nova_political_decisions.txt", "political_decisions.txt"]) {
    if (fs.existsSync(path.join(decDir, n))) return path.join(decDir, n);
  }
  return path.join(decDir, "political_decisions.txt"); // nothing written yet
};
Object.defineProperty(globalThis, "decPath", { get: decPathFor });
const eqPath = path.join(mod, "common", "units", "equipment", "custom_equipment.txt");
// …and a directory-wide view, because writeEquipmentToFile now redirects a NEW file whose name would sort
// before the vanilla file defining the archetype — HOI4 reads the merged equipment directory alphabetically
// and would drop the equipment. These checks are about whether anything was written at all, not about where.
// (`eqPath` is still used below on purpose: case 2c pre-creates that exact file, and an EXISTING file keeps
// its name, so the brace guard is still exercised on it.) #equipment-file-sorts-before-archetype
const eqDir = path.join(mod, "common", "units", "equipment");
const eqFiles = () => { try { return fs.readdirSync(eqDir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; } };
const anyEqWritten = () => eqFiles().length > 0;
const allEqText = () => eqFiles().map((f) => fs.readFileSync(path.join(eqDir, f), "utf8")).join("\n");
const techPath = path.join(mod, "common", "technologies", "custom_technologies.txt");

const decBody = (extra) => Object.assign({
  modPath: mod, categoryId: "political_decisions", id: "my_decision", name: "My Decision",
  cost: 50, icon: "GFX_decision_generic", days: 0, fireOnce: "no",
  available: "has_war = yes", modifier: "", effect: "add_political_power = 100",
  decisionType: "standard", scope: "country", cooldown: 0, targetTrigger: "",
  removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
  visible: "", allowed: "original_tag = GER", aiWillDo: "factor = 1",
  priority: 0, cancelIfNotVisible: "", customCostText: "", customCostTrigger: "",
  targetedModifier: "", removeTrigger: "", onMapMode: "", highlightStates: "",
}, extra);

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── (1a) DECISION with an unbalanced 'available' → rejected, no corrupt file ──
    const rd = await post("/api/decisions/save", decBody({ available: "has_war = {" })); // missing close
    ok("decision save REJECTED on unbalanced available", rejected(rd), rd.body.slice(0, 140));
    ok("no corrupt decisions file written", balancedOrAbsent(decPath), fs.existsSync(decPath) ? fs.readFileSync(decPath, "utf8") : "(absent)");

    // ── (1b) CONTROL: a balanced decision still saves fine ──
    const rdok = await post("/api/decisions/save", decBody({ id: "ok_decision", available: "has_war = yes\ndate > 1936.1.1" }));
    ok("balanced decision still SUCCEEDS", rdok.status === 200 && !rejected(rdok), rdok.body.slice(0, 140));
    ok("saved decisions file is brace-balanced", balanced(fs.readFileSync(decPath, "utf8")));

    // ── (2a) EQUIPMENT id with a leading digit → rejected, NO partial save (neither tech nor equip file) ──
    const re = await post("/api/technologies/save", {
      modPath: mod,
      tech: { id: "valid_tech", fileName: "custom_technologies.txt", folder: "infantry_folder", name: "Valid Tech", year: 1936 },
      equipment: { id: "123abc", fileName: "custom_equipment.txt", year: 1936, archetype: "infantry_equipment", buildCostIc: 0.5 },
    });
    ok("tech+equipment save REJECTED on digit-leading equip id", rejected(re), re.body.slice(0, 160));
    ok("no equipment file written (bad id never reaches disk)", !anyEqWritten(), allEqText());
    ok("no PARTIAL save: tech file not written either (id checked up-front)", !fs.existsSync(techPath), fs.existsSync(techPath) ? fs.readFileSync(techPath, "utf8") : "");

    // ── (2b) CONTROL: a valid equipment id saves fine ──
    const reok = await post("/api/technologies/save", {
      modPath: mod,
      tech: { id: "valid_tech2", fileName: "custom_technologies.txt", folder: "infantry_folder", name: "Valid Tech 2", year: 1936 },
      equipment: { id: "valid_equipment", fileName: "custom_equipment.txt", year: 1936, archetype: "infantry_equipment", buildCostIc: 0.5 },
    });
    ok("valid tech+equipment SUCCEEDS", reok.status === 200 && !rejected(reok), reok.body.slice(0, 160));
    ok("equipment file written + brace-balanced", anyEqWritten() && balanced(allEqText()));
    ok("equipment id present in file", allEqText().includes("valid_equipment ="));

    // ── (2c) EQUIPMENT brace guard: pre-corrupt the file, then a valid save is refused (won't re-persist garbage) ──
    //
    // RETARGETED (#equipment-existing-file-no-redirect). This used to corrupt custom_equipment.txt and save a
    // NEW weapon into it — but that filename sorts before vanilla's infantry.txt, and Nova now moves a new
    // block out of such a file (HOI4 merges common/units/equipment alphabetically and would drop it with
    // "Malformed token: infantry_equipment"). The save therefore never touched the corrupt file, and the
    // brace guard it was pinning was not reached. Both paths that DO reach a corrupt file are covered instead,
    // which is a stronger test than the original.
    //
    // (2c-i) EDITING a block the corrupt file already defines: no redirect (moving it would claim the id
    // twice), so the write lands there and the guard has to catch it.
    fs.writeFileSync(eqPath, "equipments = {\n\tanother_equipment = {\n\t\tyear = 1936\n", "utf8"); // missing two closes
    const rec = await post("/api/technologies/save", {
      modPath: mod,
      tech: { id: "valid_tech3", fileName: "custom_technologies.txt", folder: "infantry_folder", name: "Valid Tech 3", year: 1936 },
      equipment: { id: "another_equipment", fileName: "custom_equipment.txt", year: 1936, archetype: "infantry_equipment", buildCostIc: 0.5 },
    });
    ok("editing into an ALREADY-corrupt equipment file is REJECTED (brace guard)", rejected(rec), rec.body.slice(0, 160));
    ok("…and the corrupt file was not re-persisted", fs.readFileSync(eqPath, "utf8").includes("\t\tyear = 1936\n")
      && !balanced(fs.readFileSync(eqPath, "utf8")), fs.readFileSync(eqPath, "utf8"));

    // (2c-ii) …and when the REDIRECT TARGET itself is the corrupt one, a new block must be refused too —
    // otherwise the redirect would have quietly routed the write past the guard.
    fs.writeFileSync(eqPath, "equipments = {\n}\n", "utf8"); // healthy again, so the redirect is the live path
    const zzPath = path.join(eqDir, "zz_nova_equipment.txt");
    fs.writeFileSync(zzPath, "equipments = {\n\tsomething = {\n\t\tyear = 1936\n", "utf8"); // missing two closes
    const rec2 = await post("/api/technologies/save", {
      modPath: mod,
      tech: { id: "valid_tech4", fileName: "custom_technologies.txt", folder: "infantry_folder", name: "Valid Tech 4", year: 1936 },
      equipment: { id: "third_equipment", fileName: "custom_equipment.txt", year: 1936, archetype: "infantry_equipment", buildCostIc: 0.5 },
    });
    ok("a REDIRECTED save into a corrupt target is REJECTED too", rejected(rec2), rec2.body.slice(0, 200));
    ok("…and that file was not re-persisted either", !balanced(fs.readFileSync(zzPath, "utf8")), fs.readFileSync(zzPath, "utf8"));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nDECISION-EQUIPMENT-GUARDS: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
