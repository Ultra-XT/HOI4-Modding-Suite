// #grant-then-save-deletes-it — "➕ Add to country" in the Research sidebar wrote the starting tech straight
// to disk, and the next Save silently deleted it again.
//
// The grant button POSTs /api/technologies/set-country-tech and reports "✓ TAG now starts with X researched."
// But the page keeps its own idea of which techs the open country starts with — countryResearchedTechs, filled
// once by the catalog load — and the button never told it. Two consequences:
//
//   1. the "starts researched" checkbox for that very tech still rendered UNCHECKED, flatly contradicting the
//      green success line directly above it;
//   2. the moment ANY such checkbox was touched (or a researched tech renamed or deleted), Save posted
//      `countryTechIds: Array.from(countryResearchedTechs)` — the stale set — and the server rewrote the
//      country's whole set_technology block from it, dropping the granted tech. The UI then announced
//      "Research tree, weapons, and country history saved successfully!"
//
// Measured before the fix, driving the real server:
//     BEFORE grant : set_technology = { probe_tech_b = 1 }
//     after grant  : set_technology = { probe_tech_a = 1  probe_tech_b = 1 }
//     after Save   : set_technology = { probe_tech_b = 1 }        <- probe_tech_a silently gone
//
// The grant is now reflected in the page's set, but ONLY when it targets the country the tree is showing —
// the grant picker has its own country dropdown, and that set belongs to activeCountryTag.
//
// The server half is exercised end-to-end here; the client half is asserted against the shipped source, since
// the bug is that the in-memory set and the disk disagreed.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-grant-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// ── the client must fold the grant into its own set ───────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const at = src.indexOf("async function setGranted(");
ok("the grant handler exists", at !== -1);
const handlerEnd = src.indexOf("\n    }", src.indexOf("catch (e)", at));
const handler = src.slice(at, handlerEnd === -1 ? at + 3000 : handlerEnd);
ok("…and the slice reaches its end", /catch \(e\)/.test(handler), handler.length + " chars");

ok("a successful grant updates the page's researched set",
  /countryResearchedTechs\.add\(t\)/.test(handler), handler);
ok("…and a revoke removes it", /countryResearchedTechs\.delete\(t\)/.test(handler), handler);
ok("…only when it targets the country the tree is showing",
  /tag === activeCountryTag/.test(handler), handler);
ok("…the checkbox is corrected too", /countryTechResearched/.test(handler), handler);
ok("…the sidebar is refreshed", /updateSidebar\(\)/.test(handler), handler);
ok("…and it explains itself", /grant-then-save-deletes-it/.test(handler), "no marker comment");
// The refresh call must be one that exists — a dead call inside a try/catch would look fine and do nothing.
ok("the refresh function it calls actually exists",
  /^  function updateSidebar\(\)/m.test(src), "updateSidebar not declared at that scope");
ok("…and it does not call a non-existent renderer", !/try \{ render\(\); \} catch/.test(handler), handler);

// ── the server half: grant then save must not lose it ─────────────────────────────────────────────
const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="GR"\nsupported_version="1.18.*"\n');
const FILE = path.join(MOD, "history", "countries", "ZZZ - Probeland.txt");
fs.writeFileSync(FILE, "capital = 1\n\nset_technology = {\n\tprobe_tech_b = 1\n}\n", "utf8");
// Both techs must really exist: the grant endpoint refuses an unknown id ("granting it would break the save"),
// which is a guard worth keeping — without these definitions the grant fails and the revoke checks below
// would pass against a tech that was never there.
fs.writeFileSync(path.join(MOD, "common", "technologies", "probe.txt"), `technologies = {
	probe_tech_a = {
		research_cost = 1
		start_year = 1936
		folder = { name = infantry_folder position = { x = 0 y = 0 } }
	}
	probe_tech_b = {
		research_cost = 1
		start_year = 1936
		folder = { name = infantry_folder position = { x = 2 y = 0 } }
	}
}
`, "utf8");

const read = () => fs.readFileSync(FILE, "utf8");
const grants = (id) => new RegExp(`\\b${id}\\s*=\\s*1`).test(read());

const PORT = 39967, app = createApp();
const server = app.listen(PORT, async () => {
  const grant = (techId, active) => fetch(`http://127.0.0.1:${PORT}/api/technologies/set-country-tech`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, tag: "ZZZ", techId, active }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const saveCountryTechs = (techIds) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-country-techs`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, tag: "ZZZ", techIds }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    ok("precondition: the country starts with one tech", grants("probe_tech_b") && !grants("probe_tech_a"), read());

    const g = await grant("probe_tech_a", true);
    ok("the grant succeeds", g.s === 200 && g.b && g.b.ok !== false, g.b);
    ok("…and the tech is on disk", grants("probe_tech_a"), read());

    // The page now holds BOTH (that is the fix). Saving that set must keep both.
    const s1 = await saveCountryTechs(["probe_tech_a", "probe_tech_b"]);
    ok("a later save succeeds", s1.s === 200 && s1.b && s1.b.ok, s1.b);
    ok("…and the granted tech survives it", grants("probe_tech_a"), read());
    ok("…alongside the original", grants("probe_tech_b"), read());

    // And revoking still genuinely removes it.
    const r2 = await grant("probe_tech_a", false);
    ok("revoking succeeds", r2.s === 200 && r2.b && r2.b.ok !== false, r2.b);
    ok("…and the tech is gone from disk", !grants("probe_tech_a"), read());
    ok("…while the untouched one remains", grants("probe_tech_b"), read());

    console.log("\ntest-research-grant-then-save: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 16 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
