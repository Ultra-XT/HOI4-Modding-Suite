// A company must display in-game regardless of the player's DLC. In-game a company is surfaced by TWO
// mutually-exclusive systems: a MIO (Arms Against Tyranny ON) and a legacy `designer = yes` idea (AAT OFF).
// Millennium Dawn ships every company in BOTH forms. So POST /api/mio, when asked (writeIdeaFallback + companyType),
// ALSO writes a designer-idea twin (same id, its own nova_companies.txt) with designer=yes + loc, so the company
// works with or without AAT. The MIO stays primary; the fallback is best-effort and never fails the MIO save.
// Run: node test-mio-idea-fallback.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miofb-modsroot-"));
process.env.HOI4_MODS_ROOT = MODS;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miofb-mod-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MioFbMod"\n');

const orgDir = path.join(mod, "common", "military_industrial_organization", "organizations");
const ideasDir = path.join(mod, "common", "ideas");
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const mioTxt = () => readIf(path.join(orgDir, "nova_mio.txt"));
const ideaTxt = () => readIf(path.join(ideasDir, "nova_companies.txt"));
const ideaLoc = () => readIf(path.join(mod, "localisation", "english", "nova_companies_l_english.yml"));
// RETARGETED (#spirit-loc-second-definition). This read ONE hardcoded .yml while testing CONTENT, and the
// content it wanted is the company's display name — which the MIO writer emits first, into nova_mio.yml. The
// idea twin used to append the SAME key to nova_companies.yml, so `NOVA_tank_works:0` was defined twice in
// one mod and the game picked by load order. The idea writer now edits the key where the mod already defines
// it, so the assertion is "the name is localised, exactly once", not "it is in this particular file".
const allLoc = () => {
  const dir = path.join(mod, "localisation", "english");
  const out = [];
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.yml$/i.test(e.name)) out.push({ file: path.relative(mod, fp), text: fs.readFileSync(fp, "utf8") });
    }
  };
  walk(dir);
  return out;
};
const locFilesDefining = (key) =>
  allLoc().filter((f) => new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*".*"[ \\t]*$`, "m").test(f.text)).map((f) => f.file);

const PORT = 3987, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    // ── (1) MIO + idea fallback in one save ──
    const r = await post("/api/mio", {
      modPath: mod, id: "NOVA_tank_works", name: "Nova Tank Works", allowedTag: "GER",
      icon: "GFX_idea_generic_tank_manufacturer_1",
      equipmentType: ["mio_cat_all_armor"], researchCategories: ["CAT_armor", "CAT_afv"],
      initial: { equipmentBonus: { reliability: 0.05 } },
      writeIdeaFallback: true, companyType: "tank_manufacturer",
    });
    ok("1: save reports ok", r && r.ok === true, r);
    ok("1: ideaFallback reports ok", r && r.ideaFallback && r.ideaFallback.ok === true, r && r.ideaFallback);

    // ── (2) the MIO is written correctly (primary, AAT) ──
    const mt = mioTxt();
    ok("2: MIO block written", /(^|\n)\s*NOVA_tank_works\s*=\s*\{/.test(mt), mt.slice(0, 200));
    ok("2: MIO has allowed original_tag GER", /allowed\s*=\s*\{\s*original_tag\s*=\s*GER\s*\}/.test(mt), mt);
    ok("2: MIO has equipment_type", /equipment_type\s*=\s*\{[^}]*mio_cat_all_armor/.test(mt), mt);

    // ── (3) the idea twin is written correctly (fallback, no-AAT) ──
    const it = ideaTxt();
    ok("3: idea file has the manufacturer category", /tank_manufacturer\s*=\s*\{/.test(it), it.slice(0, 300));
    ok("3: idea category carries designer = yes", /tank_manufacturer\s*=\s*\{[\s\S]*?designer\s*=\s*yes/.test(it), it.slice(0, 300));
    ok("3: idea block for the company id exists", /(^|\n)\s*NOVA_tank_works\s*=\s*\{/.test(it), it);
    ok("3: idea has allowed original_tag GER", /allowed\s*=\s*\{[\s\S]*?original_tag\s*=\s*GER/.test(it), it);
    ok("3: idea has a picture (prefix stripped)", /picture\s*=\s*generic_tank_manufacturer_1/.test(it), it);
    ok("3: idea carries a research_bonus from the CAT_ categories", /research_bonus\s*=\s*\{[\s\S]*?CAT_armor/.test(it), it);
    ok("3: idea is brace-balanced", (it.match(/\{/g) || []).length === (it.match(/\}/g) || []).length, it);

    // ── (4) loc written for the company display name ──
    ok("4: the display name is localised somewhere in the mod",
      allLoc().some((f) => /NOVA_tank_works:0\s*"Nova Tank Works"/.test(f.text)), allLoc());
    ok("4: …and the key is defined EXACTLY ONCE across the mod",
      locFilesDefining("NOVA_tank_works").length === 1, locFilesDefining("NOVA_tank_works"));

    // ── (5) WITHOUT the flag, NO idea twin is written (MIO only) ──
    const r2 = await post("/api/mio", {
      modPath: mod, id: "NOVA_no_fallback", name: "No Fallback", allowedTag: "USA",
      equipmentType: ["mio_cat_all_armor"],
    });
    ok("5: MIO-only save ok", r2 && r2.ok === true, r2);
    ok("5: no ideaFallback reported", r2 && (r2.ideaFallback == null), r2 && r2.ideaFallback);
    ok("5: the id is NOT in the idea file", !new RegExp("NOVA_no_fallback\\s*=").test(ideaTxt()), ideaTxt());
  } finally {
    server.close();
  }
  console.log(`\nMIO-IDEA-FALLBACK: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
