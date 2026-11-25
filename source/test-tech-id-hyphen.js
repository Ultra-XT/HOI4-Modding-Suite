// #tech-id-hyphen — a technology whose id contains a hyphen was invisible, and saving its parent deleted
// the edge to it.
//
// collectTechBlocksFromText matched top-level tech blocks with `[a-zA-Z0-9_@]+`, so it stopped at the hyphen
// and never matched Millennium Dawn's `self-replicated_3D_printer = {` (industry.txt). Meanwhile every
// reference parser — prerequisite, path, dependency — accepts `[A-Za-z0-9_@\-]`, so the PARENT's
// `leads_to_tech = self-replicated_3D_printer` parsed perfectly.
//
// serializeTechnology rebuilds a parent's outgoing edges FROM the catalog. So re-serializing the parent —
// which happens when you move it, move a sibling, or edit any child of it — silently dropped the edge to a
// tech Nova could not see. The tech itself stayed in the file, orphaned and unreachable in the research tree.
//
// Fixing the matcher then exposed a second, stricter guard: writeTechnologyToFile rejected any id containing
// a hyphen, so once the tech became visible the save THREW — after the batch had already rewritten part of
// the file. Its own message says the constraint is a leading digit, which is the real HOI4 lexer rule; a
// hyphen after the first character is legal and shipping. Both now agree.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-hyphen-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const techDir = path.join(MOD, "common", "technologies");
fs.mkdirSync(techDir, { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HY"\nsupported_version="1.18.*"\n');

// Shaped after Millennium Dawn's industry.txt pair.
const FILE = path.join(techDir, "custom_technologies.txt");
fs.writeFileSync(FILE, `technologies = {
	large_scale_3D_printing = {
		research_cost = 2
		start_year = 1936
		folder = { name = industry_folder position = { x = 0 y = 0 } }
		categories = { industry }
		path = {
			leads_to_tech = self-replicated_3D_printer
			research_cost_coeff = 1
		}
	}
	self-replicated_3D_printer = {
		research_cost = 2
		start_year = 1936
		folder = { name = industry_folder position = { x = 0 y = 2 } }
		categories = { industry }
		prerequisite = { large_scale_3D_printing }
	}
}
`, "utf8");

const edges = (t) => (t.match(/leads_to_tech\s*=\s*self-replicated_3D_printer/g) || []).length;

const PORT = 39931, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const techs = (cat.technologies || cat.techs || []).filter((t) => t && t.isMod);

    ok("the hyphenated tech is in the catalog", techs.some((t) => t.id === "self-replicated_3D_printer"),
      techs.map((t) => t.id));
    ok("…and both techs are read, not just the parent", techs.length === 2, techs.map((t) => t.id));
    const parent = techs.find((t) => t.id === "large_scale_3D_printing");
    ok("the parent's edge to it is parsed", (parent && parent.leadsTo || []).includes("self-replicated_3D_printer"),
      parent && parent.leadsTo);

    ok("precondition: the file starts with exactly one such edge", edges(fs.readFileSync(FILE, "utf8")) === 1);

    const saved = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: techs }),
    }).then((r) => r.json());
    // Not just "no error": a save that throws mid-batch leaves the file half-rewritten, and every check
    // below would then be reading a file the save never finished with.
    ok("the save actually succeeds (it used to throw on the hyphenated id)", saved && saved.ok === true, saved);
    ok("…and reports having written both techs", saved && saved.savedTechCount === 2, saved);

    const after = fs.readFileSync(FILE, "utf8");
    ok("the parent still leads to the hyphenated tech", edges(after) === 1, after);
    ok("the hyphenated tech is still defined", /(?:^|\n)\s*self-replicated_3D_printer\s*=\s*\{/.test(after), after);
    ok("…and so is its parent", /(?:^|\n)\s*large_scale_3D_printing\s*=\s*\{/.test(after), after);
    // The LINK is what matters, and Nova models it as the parent's `path` edge — it derives each tech's
    // prerequisites from those edges and normalises to path-only on write. That is the shipping convention:
    // Millennium Dawn's industry.txt contains zero physical `prerequisite = { }` blocks, yet 125 of its 133
    // techs resolve prerequisites. So do not assert the child's explicit block round-trips; assert the edge
    // that actually carries the dependency does.
    const catAfter = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const childAfter = (catAfter.technologies || []).find((t) => t.id === "self-replicated_3D_printer");
    ok("the hyphenated tech still resolves its prerequisite after the save",
      ((childAfter && childAfter.prerequisites) || []).some((p) => p && p.tech === "large_scale_3D_printing"),
      childAfter && childAfter.prerequisites);
    ok("the file is brace-balanced", (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), after);

    // The guard's actual purpose must still hold: a leading digit breaks HOI4's lexer.
    const bad = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{ id: "3d_printing", fileName: "custom_technologies.txt", isMod: true, researchCost: 1,
          startYear: 1936, folder: "industry_folder", x: 0, y: 4, categories: [], enableEquipments: [],
          prerequisites: [], leadsTo: [], xor: [], dependencies: [], subTechnologies: [] }],
      }),
    }).then((r) => r.json());
    ok("an id starting with a digit is STILL rejected", bad && bad.ok !== true && /must start with a letter/i.test(String(bad.error || "")), bad);
    ok("…and that refusal did not add it to the file", !/3d_printing\s*=\s*\{/.test(fs.readFileSync(FILE, "utf8")), fs.readFileSync(FILE, "utf8"));

    console.log("\ntest-tech-id-hyphen: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 13 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
