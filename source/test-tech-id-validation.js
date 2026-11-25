// Regression: a technology id MUST start with a letter or underscore. HOI4's lexer rejects an id that
// starts with a digit (e.g. "1badtech"), which breaks the whole technologies file. The research editor's
// input validation wrongly allowed a leading digit (/^[a-zA-Z0-9_]+$/), so saving renamed a tech to a
// digit-leading id and corrupted the mod. Fixed: the editor now requires /^[A-Za-z_][A-Za-z0-9_]*$/, and
// the server writer (writeTechnologyToFile) guards it too so a bad id can never reach disk via the API.
// Found by the research-controls audit. Run: node test-tech-id-validation.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3501, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mkTech = (id) => ({ id, name: id, folder: "infantry_folder", x: 0, y: 0, researchCost: 1, startYear: 1936, isMod: true, fileName: "custom_technologies.txt", prerequisites: [], dependencies: [], enableEquipments: [], modifiers: "", extraScript: "" });

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techid-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="TechId"\n');
  const techFile = path.join(mod, "common", "technologies", "custom_technologies.txt");
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json().then((j) => ({ status: r.status, body: j })));
  const fileHas = (s) => fs.existsSync(techFile) && new RegExp(s).test(fs.readFileSync(techFile, "utf8"));
  try {
    // leading digit -> rejected, never written
    const bad = await post("/api/technologies/save", { modPath: mod, tech: mkTech("1badtech"), allTechs: [mkTech("1badtech")] });
    ok(bad.status === 400 && bad.body && bad.body.error, "leading-digit tech id is rejected (400)", bad);
    ok(!fileHas("1badtech"), "the leading-digit id never reached disk");
    // space -> rejected
    const bad2 = await post("/api/technologies/save", { modPath: mod, tech: mkTech("bad id"), allTechs: [mkTech("bad id")] });
    ok(bad2.status === 400 && bad2.body && bad2.body.error, "id with a space is rejected (400)", bad2);
    // valid letter-start id -> saved
    const good = await post("/api/technologies/save", { modPath: mod, tech: mkTech("good_tech"), allTechs: [mkTech("good_tech")] });
    ok(good.body && good.body.ok, "valid letter-start id saves ok", good);
    ok(fileHas("good_tech\\s*=\\s*\\{"), "valid tech written to disk");
    // underscore-start id -> valid
    const good2 = await post("/api/technologies/save", { modPath: mod, tech: mkTech("_under"), allTechs: [mkTech("_under")] });
    ok(good2.body && good2.body.ok, "underscore-start id is allowed", good2);
    ok(fileHas("_under\\s*=\\s*\\{"), "underscore-start tech written to disk");
    // save-batch path (the one the UI uses) also rejects a leading-digit id
    const batch = await post("/api/technologies/save-batch", { modPath: mod, technologies: [mkTech("9nope")], equipments: {}, allTechs: [mkTech("9nope")] });
    ok(batch.status === 400 && batch.body && batch.body.error, "save-batch also rejects a leading-digit id", batch);
    ok(!fileHas("9nope"), "save-batch never wrote the bad id");
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
