// `removeNamedBlockFromFile` returns false — writing nothing — down five paths: the file does not exist, the
// `id = {` regex does not match, there is no opening brace, the brace walk fails, or the result would be
// brace-unbalanced (that last one a deliberate safety valve).
//
// save-batch DISCARDED that return value, and then ran the rest of the deletion unconditionally: the grid box
// was removed, the name and description were stripped from every .yml, the game-start grants were unwired
// from every country and focus, and the icon sidecar was deleted.
//
// The technology block itself survived all of it. What is left is a NAMELESS, UNDRAWABLE ORPHAN that HOI4
// logs "Found no grid box for tech <id>" about — reported as ok:true with nothing but an upsert count.
//
// ⭐ A DELETE THAT HALF-HAPPENS IS WORSE THAN ONE THAT FAILS. An undeleted tech that still has its name, grid
// box and grants is intact. A "deleted" one that kept its block is wreckage.
//
// Reachable with NO user error: a brace-unbalanced technologies file trips the safety valve. Also reachable
// by editing "Target Script File" and deleting before saving, since the pending deletion carries the NEW
// filename while the block is still in the old one — which is the case this test drives, because it needs no
// malformed fixture.
//
// The equipment half of this same endpoint is already protected from exactly this shape by a survivor
// re-scan. It reads common/units/equipment, so it can never cover a technology. This was the sibling gap.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53521;
const BASE = `http://127.0.0.1:${PORT}`;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refdel-appdata-"));
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

const TECHS = `technologies = {

\tnova_orphan_probe = {

\t\tresearch_cost = 1.0
\t\tstart_year = 1936

\t\tfolder = {
\t\t\tname = infantry_folder
\t\t\tposition = { x = 2 y = 2 }
\t\t}

\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}
}
`;

function makeMod(label) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refdel-" + label + "-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.mkdirSync(path.join(mod, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="RefDel"\nsupported_version="1.16.*"\n');
  fs.writeFileSync(path.join(mod, "common", "technologies", "real_file.txt"), TECHS, "utf8");
  fs.writeFileSync(
    path.join(mod, "localisation", "english", "nova_tech_l_english.yml"),
    "﻿l_english:\n nova_orphan_probe:0 \"Orphan Probe\"\n nova_orphan_probe_desc:0 \"A technology used to prove a point.\"\n",
    "utf8"
  );
  return mod;
}

const del = async (mod, techId, techFile) => (await fetch(`${BASE}/api/technologies/save-batch`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    technologies: [], equipments: {}, customTabs: [], modPath: mod,
    countryTag: null, countryTechIds: null, newTechIds: [],
    deletions: [{ techId, techFile }],
  }),
})).json();

const locOf = (mod) => fs.readFileSync(path.join(mod, "localisation", "english", "nova_tech_l_english.yml"), "utf8");
const techsOf = (mod) => fs.readFileSync(path.join(mod, "common", "technologies", "real_file.txt"), "utf8");

(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("1. THE REFUSED DELETE — the pending deletion names the wrong file");
    // Exactly what happens after editing "Target Script File" and deleting before saving.
    const modA = makeMod("wrongfile");
    const before = techsOf(modA);
    rec("the fixture has the tech and its loc", /nova_orphan_probe\s*=\s*\{/.test(before)
      && /Orphan Probe/.test(locOf(modA)));

    const resA = await del(modA, "nova_orphan_probe", "some_other_file.txt");
    rec("the endpoint still answers ok", resA && resA.ok !== false, resA && resA.error);

    // THE POINT: nothing about the tech may be stripped, because the block was not removed.
    rec("the technology block still exists", /nova_orphan_probe\s*=\s*\{/.test(techsOf(modA)),
      "the refusal means it was never deleted");
    rec("⭐ its NAME was not stripped", /Orphan Probe/.test(locOf(modA)),
      "a nameless surviving tech is the orphan this fix exists to prevent");
    rec("⭐ its DESCRIPTION was not stripped", /A technology used to prove a point/.test(locOf(modA)));
    rec("the file is otherwise untouched", techsOf(modA) === before);

    console.log("\n2. …and it SAYS so, rather than reporting a clean success");
    rec("a warning came back", !!(resA && resA.refWarning), resA && resA.refWarning);
    rec("…naming the technology", !!(resA && resA.refWarning && resA.refWarning.includes("nova_orphan_probe")));
    rec("…and the file it looked in", !!(resA && resA.refWarning && resA.refWarning.includes("some_other_file.txt")));
    rec("…and telling the user what to do", !!(resA && resA.refWarning && /save first/i.test(resA.refWarning)),
      "a warning with no next step is barely better than silence");

    console.log("\n3. CONTROL — a correct delete still removes everything");
    // Without this, "skip the cleanup" could have been implemented as "never clean up".
    const modB = makeMod("correct");
    const resB = await del(modB, "nova_orphan_probe", "real_file.txt");
    rec("the endpoint answers ok", resB && resB.ok !== false, resB && resB.error);
    rec("the technology block is gone", !/nova_orphan_probe\s*=\s*\{/.test(techsOf(modB)),
      "the normal path must be unaffected");
    rec("…and its name went with it", !/Orphan Probe/.test(locOf(modB)),
      "if this survives, the fix has disabled cleanup entirely");
    rec("…and its description too", !/A technology used to prove a point/.test(locOf(modB)));
    rec("…with no spurious warning", !(resB && resB.refWarning && resB.refWarning.includes("could not be removed")),
      resB && resB.refWarning);

    console.log("\n4. The helper's contract, which the fix depends on");
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    rec("the return value is captured, not discarded",
      /const techBlockRemoved = removeNamedBlockFromFile\(/.test(SRC));
    rec("…and the cleanup is skipped when it refused",
      /if \(!techBlockRemoved\) \{[\s\S]{0,600}?return;\s*\n\s*\}/.test(SRC));
    rec("removeNamedBlockFromFile still returns false on refusal and true on success",
      /function removeNamedBlockFromFile\([\s\S]{0,1400}?return true;/.test(SRC)
      && (SRC.match(/function removeNamedBlockFromFile\([\s\S]{0,1400}?return true;/)[0].match(/return false;/g) || []).length >= 4,
      "the fix is only meaningful while the helper reports refusal this way");

    try { fs.rmSync(modA, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(modB, { recursive: true, force: true }); } catch (_) {}

    console.log(`\n=== a refused tech delete does not strip the rest: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
