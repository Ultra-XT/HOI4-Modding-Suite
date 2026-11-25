// Regression (bug-hunt #5): free-text script fields (Extra Script / option effects — filled by the AI or
// typed) were spliced into technologies / events / ideas files with NO brace-balance guard, unlike every
// GUI-write. An unbalanced { or } would corrupt the whole file (and bleed into adjacent blocks on re-save).
// Now each write refuses an unbalanced result. This test confirms the save is REJECTED and no broken file is
// written. Run: node test-write-brace-guards.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };
const balanced = (s) => { let d = 0; for (const c of String(s).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const balancedOrAbsent = (p) => !fs.existsSync(p) || balanced(fs.readFileSync(p, "utf8"));

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-braceguard-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="BraceGuard"\n');
const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o, json: (() => { try { return JSON.parse(o); } catch (_) { return null; } })() })); });
  r.on("error", rej); r.write(data); r.end();
});
const rejected = (r) => r.status >= 400 || (r.json && (r.json.ok === false || r.json.error));

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── IDEA: unbalanced extra script ──
    const ideaFile = path.join(mod, "common", "ideas", "custom_ideas.txt");
    const ri = await post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: "brk_spirit", targetRelativeFile: "custom_ideas.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "Broken", desc: "", picture: "militant_group_soldier", category: "country", mode: "create",
      selectedEffects: ["on_remove = {\n\tadd_stability = 0.1"], // MISSING closing brace
    });
    ok("idea save REJECTED on unbalanced script", rejected(ri), ri.body.slice(0, 120));
    ok("no corrupt ideas file written", balancedOrAbsent(ideaFile), fs.existsSync(ideaFile) ? fs.readFileSync(ideaFile, "utf8") : "(absent)");

    // ── EVENT: unbalanced option effect ──
    const evtFile = path.join(mod, "events", "brkns.txt");
    const re = await post("/api/events/save", {
      modPath: mod, namespace: "brkns", id: "1", type: "country_event",
      title: "Broken", description: "d", picture: "GFX_report_event_001", triggeredOnly: "yes",
      hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "",
      options: [{ name: "brkns.1.a", title: "OK", script: "add_political_power = 100 }" }], // EXTRA closing brace
    });
    ok("event save REJECTED on unbalanced option effect", rejected(re), re.body.slice(0, 120));
    ok("no corrupt event file written", balancedOrAbsent(evtFile), fs.existsSync(evtFile) ? fs.readFileSync(evtFile, "utf8") : "(absent)");

    // ── TECH: unbalanced extra script ──
    const rt = await post("/api/technologies/save", {
      modPath: mod, tech: { id: "brk_tech", folder: "infantry_folder", name: "Broken Tech", year: 1936, extraScript: "on_research_complete = {\n\tadd_stability = 0.1" }, // MISSING close
    });
    ok("tech save REJECTED on unbalanced extra script", rejected(rt), rt.body.slice(0, 140));
    // any technologies file that got written must be balanced
    const techDir = path.join(mod, "common", "technologies");
    let techFilesOk = true;
    try { for (const f of fs.readdirSync(techDir)) { if (f.endsWith(".txt") && !balanced(fs.readFileSync(path.join(techDir, f), "utf8"))) techFilesOk = false; } } catch (_) {}
    ok("no corrupt technologies file written", techFilesOk);

    // ── CONTROL: a BALANCED idea still saves fine (guard doesn't reject valid input) ──
    const rok = await post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: "ok_spirit", targetRelativeFile: "custom_ideas2.txt",
      targetLocalizationPath: "localisation/english/custom_ideas2_l_english.yml",
      name: "Fine", desc: "", picture: "militant_group_soldier", category: "country", mode: "create",
      selectedEffects: ["modifier = {\n\tstability_factor = 0.05\n}"],
    });
    ok("balanced idea save still SUCCEEDS", rok.status === 200 && !rejected(rok), rok.body.slice(0, 120));
    ok("the valid ideas file is brace-balanced", balanced(fs.readFileSync(path.join(mod, "common", "ideas", "custom_ideas2.txt"), "utf8")));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nWRITE-BRACE-GUARDS: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
