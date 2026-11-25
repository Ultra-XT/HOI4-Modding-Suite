// Regression guard for the user's #1 fear: "make sure saving anything does not break the whole
// tree, especially if I moved something around." This complements test-tech-roundtrip.js (which
// re-saves every tech at the same spot in the default file) by exercising the parts a MOVE stresses:
//   1. Techs live in a NON-default file (infantry.txt) — so a dropped `fileName` would misroute the
//      saved tech into custom_technologies.txt and DUPLICATE it (one of the worst "broke the tree" bugs).
//   2. A real position CHANGE (x/y actually differ) — not a re-save at the same coords.
//   3. Saving ONLY the moved tech while its parent/children are NOT in the payload — the surgical
//      single-tech merge + the save-batch "load full catalog so a parent's path edges to UNSAVED
//      children aren't dropped" guarantee.
//   4. A stray brace inside a `#` comment — to prove the brace matcher doesn't mis-cut the file.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3496, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-move-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Move Test"\n', "utf8");
  // A PARENT with two CHILD techs (parent reaches both via path edges), plus a real allow gate and an
  // on_research_complete that must survive via extraScript. Note the file is infantry.txt, NOT the default.
  fs.writeFileSync(path.join(mod, "common", "technologies", "infantry.txt"),
    "# a stray brace { lives in this comment to stress the brace matcher\n" +
    "technologies = {\n" +
    "\tparent_tech = {\n" +
    "\t\tenable_equipments = { parent_equip }\n" +
    "\t\tpath = { leads_to_tech = child_a research_cost_coeff = 1 }\n" +
    "\t\tpath = { leads_to_tech = child_b research_cost_coeff = 1 }\n" +
    "\t\tresearch_cost = 2\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n" +
    "\t\ton_research_complete = { add_political_power = 10 }\n" +
    "\t\tallow = { ROOT = { has_dlc = \"Man the Guns\" } }\n" +
    "\t}\n" +
    "\tchild_a = {\n" +
    "\t\tprerequisite = { parent_tech }\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1937\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 2 y = 1 } }\n" +
    "\t}\n" +
    "\tchild_b = {\n" +
    "\t\tprerequisite = { parent_tech }\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1937\n" +
    "\t\tfolder = { name = infantry_folder position = { x = -2 y = 1 } }\n" +
    "\t}\n}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const infantryTxt = path.join(mod, "common", "technologies", "infantry.txt");
  const defaultTxt = path.join(mod, "common", "technologies", "custom_technologies.txt");
  const getAll = async () => {
    const res = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const j = await res.json();
    return (j.technologies || []);
  };
  const byId = (list, id) => list.find((t) => t.id === id);
  const save = async (techs) => {
    await fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, technologies: techs, equipments: {} }),
    });
  };
  try {
    // --- Baseline: the tree parses, the parent reaches both children, the source file is infantry.txt.
    let all = await getAll();
    const p0 = byId(all, "parent_tech"), a0 = byId(all, "child_a"), b0 = byId(all, "child_b");
    ok(!!p0 && !!a0 && !!b0, "all three techs parse");
    ok(p0 && p0.fileName === "infantry.txt", "parent's source file is infantry.txt", p0 && p0.fileName);
    ok(p0 && (p0.leadsTo || []).includes("child_a") && (p0.leadsTo || []).includes("child_b"),
       "baseline: parent reaches BOTH children", p0 && p0.leadsTo);

    // ===== SCENARIO 1: MOVE THE PARENT, save ONLY the parent (children left untouched in the file) =====
    const movedParent = { ...p0, x: 7, y: 4 };
    await save([movedParent]);
    all = await getAll();
    const p1 = byId(all, "parent_tech"), a1 = byId(all, "child_a"), b1 = byId(all, "child_b");
    // The catalog merges vanilla + mod; count only THIS mod's techs to detect loss/duplication.
    ok(all.filter((t) => t.isMod).length === 3, "after moving parent: still exactly 3 MOD techs (none lost/duplicated)", all.filter((t) => t.isMod).length);
    ok(p1 && p1.x === 7 && p1.y === 4, "parent landed at the NEW position", p1 && [p1.x, p1.y]);
    ok(p1 && (p1.leadsTo || []).includes("child_a") && (p1.leadsTo || []).includes("child_b"),
       "parent STILL reaches BOTH children after move (edges to unsaved children preserved)", p1 && p1.leadsTo);
    ok(/on_research_complete/.test((p1 && p1.extraScript) || ""), "on_research_complete preserved through move");
    ok(/has_dlc/.test((p1 && p1.extraScript) || ""), "real allow gate preserved through move");
    ok(a1 && a1.x === a0.x && a1.y === a0.y, "child_a position UNCHANGED (not touched)", a1 && [a1.x, a1.y]);
    ok(b1 && b1.x === b0.x && b1.y === b0.y, "child_b position UNCHANGED (not touched)", b1 && [b1.x, b1.y]);
    // File-level integrity: written back to infantry.txt, NOT misrouted to custom_technologies.txt.
    ok(!fs.existsSync(defaultTxt), "parent was NOT misrouted into custom_technologies.txt (no duplicate file)");
    const txt1 = fs.readFileSync(infantryTxt, "utf8");
    ok((txt1.match(/\n[ \t]*parent_tech\s*=\s*\{/g) || []).length === 1, "exactly ONE parent_tech block on disk", (txt1.match(/\n[ \t]*parent_tech\s*=\s*\{/g) || []).length);
    ok((txt1.match(/\n[ \t]*child_a\s*=\s*\{/g) || []).length === 1, "exactly ONE child_a block on disk", (txt1.match(/\n[ \t]*child_a\s*=\s*\{/g) || []).length);
    ok((txt1.match(/\n[ \t]*child_b\s*=\s*\{/g) || []).length === 1, "exactly ONE child_b block on disk", (txt1.match(/\n[ \t]*child_b\s*=\s*\{/g) || []).length);
    ok(/stray brace \{ lives in this comment/.test(txt1), "the comment (with stray brace) survived the merge");

    // ===== SCENARIO 2: MOVE A CHILD, save ONLY that child (parent + sibling left untouched) =====
    const movedChild = { ...a1, x: 5, y: 9 };
    await save([movedChild]);
    all = await getAll();
    const p2 = byId(all, "parent_tech"), a2 = byId(all, "child_a"), b2 = byId(all, "child_b");
    ok(all.filter((t) => t.isMod).length === 3, "after moving child: still exactly 3 MOD techs", all.filter((t) => t.isMod).length);
    ok(a2 && a2.x === 5 && a2.y === 9, "child_a landed at its NEW position", a2 && [a2.x, a2.y]);
    ok(p2 && p2.x === 7 && p2.y === 4, "parent position UNCHANGED by the child move", p2 && [p2.x, p2.y]);
    ok(p2 && (p2.leadsTo || []).includes("child_a") && (p2.leadsTo || []).includes("child_b"),
       "parent STILL reaches BOTH children after the child move (tree not broken)", p2 && p2.leadsTo);
    ok(b2 && b2.x === b0.x && b2.y === b0.y, "sibling child_b STILL untouched", b2 && [b2.x, b2.y]);
    const txt2 = fs.readFileSync(infantryTxt, "utf8");
    ok((txt2.match(/\n[ \t]*child_a\s*=\s*\{/g) || []).length === 1, "still exactly ONE child_a block on disk", (txt2.match(/\n[ \t]*child_a\s*=\s*\{/g) || []).length);
    ok(!fs.existsSync(defaultTxt), "child move also did NOT spawn custom_technologies.txt");
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    // Reliable teardown (avoid the Windows UV_HANDLE_CLOSING abort that scores a pass as a fail).
    process.exitCode = fail ? 1 : 0;
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
  console.log(`\n  ${pass} passed, ${fail} failed`);
})();
