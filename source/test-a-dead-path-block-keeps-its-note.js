// A `path = { … }` block whose `leads_to_tech` is absent or commented out was DELETED on any save that
// re-serialized the tech. The model keys paths by the child they lead to, so a path leading nowhere has no
// key to live under: it entered no field, was re-emitted by nothing, and the strip list removed it.
//
// That was a DELIBERATE, DOCUMENTED deferral (test-technology-save-keeps-its-text.js), on the reasoning that
// such blocks are "dead weight in the file and deleting them changes no behaviour in game". True of most.
// Re-measured across the vanilla install and every installed workshop mod: 52 of 5,586 path blocks have no
// live edge, only 4 are genuinely empty, and NINE carry the author's commented-out edge inside the braces —
// the deliberate record of a branch they disabled:
//     #leads_to_tech = underway_replenishment_tech_1
//     # leads_to_tech = sp_centrifugal_jet_tech
// Deleting those destroys something hand-written, on a save that changed nothing, in a tech the author may
// never have opened — save-batch pulls a prerequisite PARENT into the batch when a child moves. The
// deferral's reasoning covered the dead weight; it did not cover the notes.
//
// ⭐ THE FIX IS THE `allow` SHAPE: strip only the blocks serializeTechnology can re-create (those with a
// LIVE leads_to_tech) and let the rest round-trip through extraScript.
//
// ⚠️ THE PREDICATE HAD TO MASK COMMENTS. removeBraceKeyBlocksIf hands over the RAW body, so a commented-out
// `#leads_to_tech = X` reads as a live edge and would strip the very block being rescued — the exact
// inversion of the fix. This test pins that with a real annotated block, which is the case that would break.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53512;
const BASE = `http://127.0.0.1:${PORT}`;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deadpath-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// A tech carrying all three shapes at once: a LIVE edge (must be regenerated), a dead block WITH the
// author's note (must survive), and an empty dead block (must survive too — it is still their text).
const TECH_FILE = `technologies = {

\tnova_root_tech = {

\t\tresearch_cost = 1.0
\t\tstart_year = 1936

\t\tpath = {
\t\t\tleads_to_tech = nova_child_tech
\t\t\tresearch_cost_coeff = 1
\t\t}

\t\tpath = {
\t\t\t#leads_to_tech = nova_disabled_branch\t#parked until the art exists
\t\t\tresearch_cost_coeff = 1
\t\t}

\t\tpath = {
\t\t}

\t\tfolder = {
\t\t\tname = infantry_folder
\t\t\tposition = { x = 0 y = 0 }
\t\t}

\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}

\tnova_child_tech = {

\t\tresearch_cost = 1.0
\t\tstart_year = 1936

\t\tfolder = {
\t\t\tname = infantry_folder
\t\t\tposition = { x = 0 y = 2 }
\t\t}

\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}
}
`;

(async () => {
  let server;
  try {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deadpath-"));
    fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DeadPath"\nsupported_version="1.16.*"\n');
    const techPath = path.join(mod, "common", "technologies", "nova_dead_path.txt");
    fs.writeFileSync(techPath, TECH_FILE, "utf8");

    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("1. The fixture really contains the three shapes");
    const before = fs.readFileSync(techPath, "utf8");
    rec("a live path edge", /leads_to_tech = nova_child_tech/.test(before));
    rec("a dead path block carrying the author's note", /#leads_to_tech = nova_disabled_branch/.test(before));
    rec("…and its reason", /parked until the art exists/.test(before));
    rec("an entirely empty path block", /path = \{\s*\n\s*\}/.test(before));

    console.log("\n2. Save every technology back UNCHANGED");
    // Exactly what the maker does when a sibling moves: hand each tech straight back.
    const cat = await (await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).json();
    const mine = (cat.technologies || []).filter((t) => t && t.isMod);
    rec("the catalogue found the fixture's techs", mine.length === 2, mine.map((t) => t.id));
    const res = await (await fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technologies: mine.map((t) => JSON.parse(JSON.stringify(t))),
        equipments: cat.equipments || {}, customTabs: [], modPath: mod,
        countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
      }),
    })).json();
    rec("the save reported success", res && res.ok !== false, res && res.error);

    const after = fs.readFileSync(techPath, "utf8");

    console.log("\n3. THE POINT: the author's note survived");
    rec("the commented-out edge is still there", /#\s*leads_to_tech = nova_disabled_branch/.test(after),
      "this is the hand-written record of a disabled branch");
    rec("…and so is the reason beside it", /parked until the art exists/.test(after));

    console.log("\n4. …exactly once — not double-written");
    // The danger of moving a block into extraScript is that the serializer ALSO re-creates it.
    const noteCount = (after.match(/nova_disabled_branch/g) || []).length;
    rec("the note appears exactly once", noteCount === 1, noteCount + " occurrences");
    const liveCount = (after.match(/leads_to_tech = nova_child_tech/g) || []).length;
    rec("the live edge appears exactly once", liveCount === 1, liveCount + " occurrences");

    console.log("\n5. The live edge is still REGENERATED, not merely preserved");
    // If the predicate were inverted, live blocks would round-trip and dead ones be stripped — the file
    // would look similar but the maker could no longer rewire anything.
    rec("the live path block is present", /leads_to_tech = nova_child_tech/.test(after));
    rec("…and the file still parses as one technologies block",
      (after.match(/technologies = \{/g) || []).length === 1);
    rec("both techs survived", /nova_root_tech\s*=\s*\{/.test(after) && /nova_child_tech\s*=\s*\{/.test(after));

    console.log("\n6. Nothing else was lost on the way");
    rec("the folder block survived", /name = infantry_folder/.test(after));
    rec("the categories survived", /infantry_tech/.test(after));
    rec("research_cost survived", /research_cost = 1\.0/.test(after));

    console.log(`\n=== a dead path block keeps its note: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((x) => console.log("   FAILED: " + x));
      console.log("\n--- file after save ---\n" + after);
      process.exitCode = 1;
    }
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
