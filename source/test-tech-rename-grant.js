// #tech-rename-orphans-grant — renaming a technology left every country-history grant naming the old id, so
// the country started without the technology it had been given.
//
// The rename rewrote references inside common/technologies and stopped there. The
// `set_technology = { <id> = 1 }` grant Nova itself writes into a country's history (the "➕ Add to country"
// button) kept naming the OLD id. An unresolved id in a start-date block just does nothing, so the country
// silently lacked the tech and nothing anywhere said so.
//
// The rewrite is as narrow as the spirit and character walks, because a tech id is an ordinary word:
//   - only inside a `set_technology { … }` block
//   - only a `<id> = 0|1` entry, whole-word, so renaming `basic_gun` leaves `basic_gun_2` alone
//   - never inside a comment
//
// Last of the four rename bugs found by hunt 5.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-techrename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/technologies", "history/countries"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="T"\nsupported_version="1.18.*"\n');
const TECHFILE = path.join(MOD, "common", "technologies", "probe_tech.txt");
fs.writeFileSync(TECHFILE,
  "technologies = {\n" +
  "\tbasic_gun = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tcategories = { infantry_weapons }\n\t}\n" +
  "\tbasic_gun_2 = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }\n\t\tcategories = { infantry_weapons }\n\t}\n" +
  "}\n", "utf8");
const HIST = path.join(MOD, "history", "countries", "ABC - Testland.txt");
const HIST_SRC =
  "capital = 1\n\n" +
  "set_technology = {\n\tbasic_gun = 1\n\tbasic_gun_2 = 1\n\tunrelated_tech = 1\n}\n\n" +
  "1939.1.1 = {\n\tset_technology = {\n\t\tbasic_gun = 1\n\t}\n}\n\n" +
  "#set_technology = {\n#\tbasic_gun = 1\n#}\n";
fs.writeFileSync(HIST, HIST_SRC, "utf8");

const PORT = 40017, app = createApp();
const server = app.listen(PORT, async () => {
  const hist = () => fs.readFileSync(HIST, "utf8");
  const techs = () => fs.readFileSync(TECHFILE, "utf8");
  try {
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    const mine = (cat.technologies || []).find((t) => t.id === "basic_gun");
    ok("the catalog returned the tech", !!mine, (cat.technologies || []).map((t) => t.id).slice(0, 6));

    const renamed = Object.assign({}, mine, { id: "advanced_gun", previousId: "basic_gun" });
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: [renamed] }),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    // Assert the operation SUCCEEDED before asserting anything about its effects — "nothing changed"
    // satisfies most of the negative checks below.
    ok("the rename save succeeds", r.status === 200 && r.body && (r.body.ok || r.body.success), r);

    // ── the definition ───────────────────────────────────────────────────────────────────────────
    ok("the new id is defined", /(?:^|\n)\tadvanced_gun\s*=\s*\{/.test(techs()), techs().slice(0, 300));
    ok("…the old one is gone", !/(?:^|\n)\tbasic_gun\s*=\s*\{/.test(techs()), techs().slice(0, 300));
    ok("…and the LOOKALIKE tech survives", /(?:^|\n)\tbasic_gun_2\s*=\s*\{/.test(techs()), techs().slice(0, 300));

    // ── THE BUG: the country-history grant ───────────────────────────────────────────────────────
    const h = hist();
    ok("THE GRANT FOLLOWS THE RENAME", /\badvanced_gun\s*=\s*1/.test(h), h);
    ok("…and no live grant still names the old id", !/(?:^|\n)[ \t]*basic_gun[ \t]*=[ \t]*1/.test(h), h);
    ok("the LOOKALIKE grant is untouched", /\bbasic_gun_2\s*=\s*1/.test(h), h);
    ok("…as is an unrelated one", /\bunrelated_tech\s*=\s*1/.test(h), h);
    ok("a grant inside a DATED block follows too", (h.match(/advanced_gun\s*=\s*1/g) || []).length === 2, (h.match(/advanced_gun\s*=\s*1/g) || []).length);
    ok("…and a COMMENTED grant is left exactly as written", /#\tbasic_gun = 1/.test(h), h);

    let d = 0; for (const c of h) { if (c === "{") d++; else if (c === "}") d--; }
    ok("the history file is brace-balanced", d === 0, d);
    ok("…and its other content survived", /capital = 1/.test(h), h);

    // ── a save with no rename must not touch history ────────────────────────────────────────────
    const before = hist();
    const cat2 = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`).then((r2) => r2.json());
    const again = (cat2.technologies || []).find((t) => t.id === "advanced_gun");
    ok("the renamed tech reloads", !!again, (cat2.technologies || []).map((t) => t.id).slice(0, 6));
    const r2 = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: [again] }),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    ok("a plain re-save succeeds", r2.status === 200 && r2.body && (r2.body.ok || r2.body.success), r2);
    ok("…and the history is byte-identical", hist() === before, hist());

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a grant-rename walk", /function renameTechnologyGrantsEverywhere\(modRoot, oldId, newId\)/.test(src), "missing");
    ok("…scoped to set_technology blocks", /function renameTechnologyInHistoryText\(text, oldId, newId\)/.test(src), "missing");
    ok("…called from the rename branch", /renameTechnologyGrantsEverywhere\(activeRoot, previousId, String\(tech\.id\)\.trim\(\)\)/.test(src), "not wired in");
    ok("…and it explains why", /#tech-rename-orphans-grant/.test(src), "no marker comment");

    console.log("\ntest-tech-rename-grant: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
