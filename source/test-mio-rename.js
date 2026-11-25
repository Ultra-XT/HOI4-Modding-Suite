// #mio-rename-clones — renaming a company in the Companies (MIO) editor CLONED it instead.
//
// The /api/mio handler had no previous-id concept at all: req.body was never read for one, and the client
// never sent one. writeMioToFile only upserts the block whose key equals mio.id, so a changed id took the
// "not found" branch and APPENDED a second top-level organization. The duplicate-id guard only refuses ids
// already defined in a DIFFERENT file, so a same-file rename sailed straight through.
//
// The result: the country offered TWO identical manufacturers in game — same display name, same
// equipment_type, same traits — the sidebar listed both, and the localisation keys were duplicated too.
// Nothing in the UI hinted at it; the status line just said "✓ Saved …".
//
// Every sibling maker already had this: spirits (previousIdeaId), characters (previousToken), decisions and
// technologies (previousId). MIO was the one that never got it.
//
// Two details this test pins beyond the basic rename:
//   - a SECOND rename in one editing session must also work. The client re-anchors d.loadedId to what was
//     just written; without that, the second save would still name the ORIGINAL id as its previous, removing
//     an already-removed block and leaving the intermediate one behind. (That is a real defect the Characters
//     maker has — found separately by the same hunt.)
//   - trait tokens are independent ids the user controls, NOT derived from the company id, so a company
//     rename must not sweep up their localisation.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-miorename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(MOD, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="M"\nsupported_version="1.18.*"\n');
const ORG = path.join(MOD, "common", "military_industrial_organization", "organizations", "nova_mio.txt");
const LOC = path.join(MOD, "localisation", "english", "nova_mio_l_english.yml");

const body = (id, previousId) => ({
  modPath: MOD, id, name: "Nova Works", desc: "Builds tanks.", allowedTag: "GER",
  icon: "GFX_idea_generic_air_manufacturer_3", fileName: "nova_mio.txt",
  equipmentType: ["medium_tank_chassis"], researchCategories: [], include: [],
  initial: { equipmentBonus: {}, productionBonus: {} }, companyType: "tank_manufacturer",
  traits: [{ token: "shared_trait_token", name: "Reliable Tracks", x: 0, y: 0, relativeTo: "", icon: "", parents: [], equipmentBonus: { reliability_mult: 0.05 }, productionBonus: {} }],
  previousId: previousId || "",
});

const PORT = 40011, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (id, prev) => fetch(`http://127.0.0.1:${PORT}/api/mio`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(id, prev)),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const orgs = () => { const t = fs.readFileSync(ORG, "utf8"); return (t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/gm) || []).map((s) => s.replace(/\s*=\s*\{$/, "")); };
  try {
    const a = await save("nova_tank_works", "");
    ok("the first save succeeds", a.status === 200 && a.body.ok, a);
    ok("…and reports no rename", a.body.renamedFrom == null, a.body.renamedFrom);
    ok("one organization exists", orgs().length === 1, orgs());

    // ── the rename ───────────────────────────────────────────────────────────────────────────────
    const b = await save("nova_armour_works", "nova_tank_works");
    ok("the rename save succeeds", b.status === 200 && b.body.ok, b);
    ok("…and reports what it renamed FROM", b.body.renamedFrom === "nova_tank_works", b.body.renamedFrom);

    const list = orgs();
    ok("THERE IS STILL ONLY ONE ORGANIZATION", list.length === 1, list);
    ok("…and it is the new one", list[0] === "nova_armour_works", list);
    ok("…the old id is gone from the file", !/(?:^|\n)nova_tank_works\s*=\s*\{/.test(fs.readFileSync(ORG, "utf8")), fs.readFileSync(ORG, "utf8").slice(0, 300));
    let d = 0; for (const c of fs.readFileSync(ORG, "utf8")) { if (c === "{") d++; else if (c === "}") d--; }
    ok("…and the file is brace-balanced", d === 0, d);

    const loc = fs.readFileSync(LOC, "utf8");
    ok("the new company's loc key exists", /^\s*nova_armour_works:/m.test(loc), loc);
    ok("…and the OLD company's keys are gone", !/^\s*nova_tank_works:/m.test(loc), loc);
    ok("…including its _desc", !/^\s*nova_tank_works_desc:/m.test(loc), loc);
    ok("…and its _initial", !/^\s*nova_tank_works_initial:/m.test(loc), loc);
    ok("the TRAIT's own key survives (it is not derived from the company id)", /^\s*shared_trait_token:/m.test(loc), loc);

    // ── a SECOND rename in the same session ─────────────────────────────────────────────────────
    const c = await save("nova_steel_works", "nova_armour_works"); // client re-anchored loadedId after the first
    ok("a second rename succeeds", c.status === 200 && c.body.ok, c);
    ok("…reporting the INTERMEDIATE id, not the original", c.body.renamedFrom === "nova_armour_works", c.body.renamedFrom);
    const list2 = orgs();
    ok("STILL only one organization after two renames", list2.length === 1, list2);
    ok("…and it is the newest id", list2[0] === "nova_steel_works", list2);
    const loc2 = fs.readFileSync(LOC, "utf8");
    ok("…no intermediate loc key was left behind", !/^\s*nova_armour_works:/m.test(loc2), loc2);

    // ── a plain re-save must not delete anything ────────────────────────────────────────────────
    const e = await save("nova_steel_works", "nova_steel_works");
    ok("re-saving with the same id succeeds", e.status === 200 && e.body.ok, e);
    ok("…reports no rename", e.body.renamedFrom == null, e.body.renamedFrom);
    ok("…and the organization is still there", orgs().length === 1 && orgs()[0] === "nova_steel_works", orgs());

    // ── the "also works without AAT" IDEA TWIN must be renamed too ──────────────────────────────
    // #mio-rename-leaves-idea-twin — that option writes a SECOND definition of the company as a legacy
    // `designer = yes` idea in common/ideas/nova_companies.txt. Removing only the organization left the twin
    // behind under the old id, so the country offered two designer companies — the same clone the org fix
    // addressed, one file over, and invisible because the twin has no UI of its own.
    const twinBody = (id, prev) => Object.assign(body(id, prev), { writeIdeaFallback: true });
    const t1 = await fetch(`http://127.0.0.1:${PORT}/api/mio`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(twinBody("twin_alpha", "")),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    ok("a company with the idea twin saves", t1.status === 200 && t1.body.ok, t1);
    ok("…and the twin was written", t1.body.ideaFallback && t1.body.ideaFallback.ok, t1.body.ideaFallback);

    const IDEAS = path.join(MOD, "common", "ideas", "nova_companies.txt");
    ok("the twin is on disk", /twin_alpha\s*=\s*\{/.test(fs.readFileSync(IDEAS, "utf8")), fs.readFileSync(IDEAS, "utf8").slice(0, 200));

    const t2 = await fetch(`http://127.0.0.1:${PORT}/api/mio`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(twinBody("twin_beta", "twin_alpha")),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    ok("renaming it succeeds", t2.status === 200 && t2.body.ok, t2);
    const ideasTxt = fs.readFileSync(IDEAS, "utf8");
    ok("THE OLD IDEA TWIN IS GONE", !/twin_alpha\s*=\s*\{/.test(ideasTxt), ideasTxt);
    ok("…and the new one is there", /twin_beta\s*=\s*\{/.test(ideasTxt), ideasTxt);
    ok("…exactly once", (ideasTxt.match(/twin_beta\s*=\s*\{/g) || []).length === 1, (ideasTxt.match(/twin_beta\s*=\s*\{/g) || []).length);
    ok("…the designer flag survived the removal", /designer\s*=\s*yes/.test(ideasTxt), ideasTxt);
    { let d = 0; for (const c of ideasTxt) { if (c === "{") d++; else if (c === "}") d--; }
      ok("…and the ideas file is brace-balanced", d === 0, d); }
    const twinLoc = path.join(MOD, "localisation", "english", "nova_companies_l_english.yml");
    if (fs.existsSync(twinLoc)) {
      const tl = fs.readFileSync(twinLoc, "utf8");
      ok("the twin's new loc key exists", /^\s*twin_beta:/m.test(tl), tl);
      ok("…and the old one is gone", !/^\s*twin_alpha:/m.test(tl), tl);
    }

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("the rename removes the idea twin as well",
      src.includes('deleteIdeaDefinitionFromIdeasFile(activeRoot, "nova_companies.txt", prevMioId, "", "", false);'), "twin not removed");
    ok("…and explains why", /#mio-rename-leaves-idea-twin/.test(src), "no marker comment");
    ok("the handler reads a previous id", /const prevMioId = String\(b\.previousId \|\| ""\)\.trim\(\);/.test(src), "no previousId");
    ok("…refuses to leave an unbalanced file", /if \(!bracesAreBalanced\(next\)\) continue;/.test(src), "no brace guard");
    // The behaviour, not the literal. This pinned `catch (_) { renamedFrom = null; }` exactly, and
    // #a-write-that-failed-reported-nothing added a noteRefWriteFailure call inside that same catch — the
    // save still stands and the loc cleanup is still skipped, which is everything this was protecting.
    // What must stay true: the catch keeps renamedFrom null AND does not rethrow.
    {
      // Anchored on THIS catch, by the message only it carries — an alternation matched the event
      // renamer's identically-shaped catch instead and reported on the wrong one.
      const at = src.indexOf('noteRefWriteFailure("the organization\'s previous file"');
      const open = at === -1 ? -1 : src.lastIndexOf("catch", at);
      const body = open === -1 ? "" : src.slice(open, src.indexOf("}", at) + 1);
      ok("…and never lets a cleanup failure undo the save",
        /renamedFrom = null/.test(body) && !/\bthrow\b/.test(body), "cleanup can fail the save");
      ok("…while still saying the cleanup failed", at !== -1,
        "a duplicate organization is left behind and nothing says so");
    }
    ok("…and it explains why", /#mio-rename-clones/.test(src), "no marker comment");
    const cli = fs.readFileSync(path.join(__dirname, "public", "mio-editor.js"), "utf8");
    ok("the client records the id it loaded", /loadedId: j\.id/.test(cli), "not recorded");
    ok("…sends it as previousId", /previousId: \(d\.loadedId \|\| ""\)\.trim\(\)/.test(cli), "not sent");
    ok("…and re-anchors after a successful save", /d\.loadedId = r\.id;/.test(cli), "second rename would misbehave");
    ok("a fresh draft has no previous id", /loadedId: ""/.test(cli), "new company would claim a rename");
    ok("the cache version was bumped",
      (() => { const m = /mio-editor\.js\?v=(\d+)/.exec(fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8")); return !!m && Number(m[1]) >= 9; })(), "stale cache version");

    console.log("\ntest-mio-rename: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 40 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
