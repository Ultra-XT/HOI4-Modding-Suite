// SEEDED FUZZER round 2 (bug-hunt #12) — extends test-maker-fuzz.js to the writers it didn't cover:
//   • TECHNOLOGIES  (/api/technologies/save — tech block splice + extraScript + optional equipment pair)
//   • CONTINUOUS FOCUSES (cfUpsertFocus/cfRenameFocus/cfDeleteFocus — pure text fns, fuzzed directly)
//   • COUNTRY HISTORY DETAILS (/api/history/save-country-details — set_politics/popularities/capital splice)
// Same invariants as round 1: save ok • file brace-balanced • re-save IDEMPOTENT (byte-identical) •
// loc key exactly once • unbalanced input rejected and never corrupts. Plus cf-specific: rename A→B→A
// restores the ORIGINAL bytes; delete removes the block and stays balanced.
// Deterministic: `node test-maker-fuzz2.js [seed]` (default 20260707).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");

const SEED = parseInt(process.argv[2], 10) || 20260707;
let s = SEED >>> 0;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const NAMES = ["Iron Pact", "Operation \"Dawn\"", "L'Étoile", "§YGolden§! Age", "Plan [B]", "50% Better Guns", "Añjali's Doctrine"];
const EXTRAS = [
  "",
  "ai_will_do = {\n\t\tfactor = 2\n\t}",
  "on_research_complete = {\n\t\tadd_political_power = 25\n\t}",
  "research_cost = 1.5\n\tshow_equipment_icon = yes",
];
const BAD_EXTRAS = ["on_research_complete = {", "ai_will_do = { factor = 2 } }"];
const CF_MODS = ["stability_factor = 0.05", "resistance_target = -0.10\nresistance_damage_to_garrison = -0.05", "political_power_factor = 0.1"];

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fuzz2-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Fuzz2"\n');
const app = S.createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o, json: (() => { try { return JSON.parse(o); } catch (_) { return null; } })() })); });
  r.on("error", rej); r.write(data); r.end();
});
const okResp = (r) => r.status < 400 && !(r.json && (r.json.ok === false || r.json.error));
const balanced = (txt) => { let d = 0, q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (c === '"') q = !q; if (q) continue; if (c === "#") { while (i < txt.length && txt[i] !== "\n") i++; continue; } if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const read = (rel) => { try { return fs.readFileSync(path.join(mod, rel), "utf8"); } catch (_) { return null; } };
const locCount = (yml, key) => { const t = read(yml); if (t == null) return -1; const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return (t.match(new RegExp(`^\\s*${esc}:`, "gm")) || []).length; };

let pass = 0, fail = 0; const failures = [];
const check = (maker, i, name, cond, extra) => { if (cond) { pass++; } else { fail++; failures.push({ maker, case: i, name, extra: String(extra == null ? "" : extra).slice(0, 300) }); } };

async function fuzzTechs(N) {
  const relTech = "common/technologies/custom_technologies.txt";
  const relEq = "common/units/equipment/custom_equipment.txt";
  const relLoc = "localisation/english/custom_technologies_l_english.yml";
  for (let i = 0; i < N; i++) {
    const id = `fz_tech_${int(1, 20)}`;
    const bad = rnd() < 0.15;
    const withEq = !bad && rnd() < 0.4;
    const payload = {
      modPath: mod,
      tech: { id, fileName: "custom_technologies.txt", folder: pick(["infantry_folder", "armour_folder"]), name: pick(NAMES), year: int(1936, 1944), extraScript: bad ? pick(BAD_EXTRAS) : pick(EXTRAS) },
      equipment: withEq ? { id: `fz_eq_${int(1, 12)}`, fileName: "custom_equipment.txt", year: 1936, archetype: "infantry_equipment", buildCostIc: pick([0.5, 4, 12]) } : undefined,
    };
    const r1 = await post("/api/technologies/save", payload);
    if (bad) {
      check("tech", i, "I5 unbalanced extraScript rejected", !okResp(r1), r1.body);
      const t = read(relTech); check("tech", i, "I5 tech file not corrupted", t == null || balanced(t));
      continue;
    }
    check("tech", i, "I1 save ok", okResp(r1), r1.body);
    const t1 = read(relTech);
    check("tech", i, "I2 tech file balanced", t1 != null && balanced(t1));
    const r2 = await post("/api/technologies/save", payload);
    check("tech", i, "I1 re-save ok", okResp(r2), r2.body);
    const t2 = read(relTech);
    check("tech", i, "I3 tech idempotent (byte-identical)", t1 === t2, t1 && t2 && `${t1.length} vs ${t2.length}`);
    check("tech", i, "I4 tech name loc exactly once", locCount(relLoc, id) === 1, locCount(relLoc, id));
    if (withEq) {
      // Read the equipment DIRECTORY, not one filename: writeEquipmentToFile redirects a NEW file whose name
      // would sort before the vanilla file defining the archetype, because HOI4 reads the merged directory
      // alphabetically and would otherwise drop the equipment. These invariants are about the CONTENT being
      // balanced and defined once, not about which file it lands in. #equipment-file-sorts-before-archetype
      const eqDir = path.join(mod, "common", "units", "equipment");
      let e = null;
      try {
        e = fs.readdirSync(eqDir).filter((f) => /\.txt$/i.test(f))
          .map((f) => fs.readFileSync(path.join(eqDir, f), "utf8")).join("\n");
      } catch (_) { e = null; }
      check("tech", i, "I2 equipment file balanced", e != null && balanced(e));
      const defs = (e || "").match(new RegExp(`^\\s*${payload.equipment.id}\\s*=\\s*\\{`, "gm")) || [];
      check("tech", i, "I3 equipment defined exactly once", defs.length === 1, defs.length);
    }
  }
}

async function fuzzContinuousFocus(N) {
  for (let i = 0; i < N; i++) {
    const base = S.cfDefaultPaletteFileContent ? S.cfDefaultPaletteFileContent("fz_palette") : null;
    if (!base) { check("cf", i, "harness: default palette available", false); return; }
    check("cf", i, "base palette balanced", balanced(base));
    const fid = `continuous_fz_${int(1, 999)}`;
    const fields = { modifier: pick(CF_MODS), dailyCost: pick([1, 2, 5]), enable: pick(["", "always = yes"]) };
    let t1;
    try { t1 = S.cfUpsertFocus(base, "fz_palette", fid, fields); } catch (e) { check("cf", i, "I1 upsert ok", false, e.message); continue; }
    check("cf", i, "I2 upsert balanced", balanced(t1));
    check("cf", i, "focus present after upsert", new RegExp(`\\bid\\s*=\\s*${fid}\\b`).test(t1));
    // idempotent upsert
    let t2;
    try { t2 = S.cfUpsertFocus(t1, "fz_palette", fid, fields); } catch (e) { check("cf", i, "I1 re-upsert ok", false, e.message); continue; }
    check("cf", i, "I3 upsert idempotent (byte-identical)", t1 === t2, `${t1.length} vs ${t2.length}`);
    // rename there-and-back restores the original bytes
    try {
      const rb = S.cfRenameFocus(S.cfRenameFocus(t1, "fz_palette", fid, fid + "_x"), "fz_palette", fid + "_x", fid);
      check("cf", i, "I3 rename A→B→A restores bytes", rb === t1, `${t1.length} vs ${rb.length}`);
    } catch (e) { check("cf", i, "I3 rename round-trip ok", false, e.message); }
    // delete removes + stays balanced
    try {
      const del = S.cfDeleteFocus(t1, "fz_palette", fid);
      check("cf", i, "I2 delete balanced", balanced(del));
      check("cf", i, "focus gone after delete", !new RegExp(`\\bid\\s*=\\s*${fid}\\b`).test(del));
    } catch (e) { check("cf", i, "delete ok", false, e.message); }
    // unbalanced modifier must be REJECTED at the save ENDPOINT (the guard lives there — the single write
    // choke point, like every other maker) and must never corrupt the on-disk palette.
    const rBad = await post("/api/continuous-focus/save", { modPath: mod, op: "upsert-focus", paletteId: "generic_focus", focusId: `${fid}_bad`, fields: { modifier: "stability_factor = 0.05 }" } });
    check("cf", i, "I5 unbalanced modifier rejected at endpoint", !okResp(rBad), rBad.body);
    const onDisk = read("common/continuous_focus/generic.txt");
    check("cf", i, "I5 on-disk palette not corrupted", onDisk == null || balanced(onDisk));
    // control: a BALANCED endpoint save still succeeds (guard doesn't over-reject)
    const rOk = await post("/api/continuous-focus/save", { modPath: mod, op: "upsert-focus", paletteId: "generic_focus", focusId: fid, fields });
    check("cf", i, "I1 balanced endpoint save ok", okResp(rOk), rOk.body);
  }
}

async function fuzzCountryDetails(N) {
  for (let i = 0; i < N; i++) {
    const tag = pick(["FZA", "FZB", "FZC"]);
    const rel = (() => { const dir = path.join(mod, "history", "countries"); try { const f = fs.readdirSync(dir).find((x) => x.startsWith(tag)); return f ? `history/countries/${f}` : null; } catch (_) { return null; } });
    const details = {
      capital: int(1, 800), researchSlots: int(2, 5), stability: pick([0.1, 0.5, 0.75]), warSupport: pick([0.2, 0.6]), convoys: pick([0, 50, 200]),
      politics: { rulingParty: pick(["democratic", "fascism", "communism", "neutrality"]), lastElection: pick(["1936.1.1", "1934.5.15"]), electionFrequency: pick([36, 48]), electionsAllowed: pick(["yes", "no"]) },
      popularities: { democratic: 40, fascism: int(0, 30), communism: int(0, 20), neutrality: 10 },
    };
    const r1 = await post("/api/history/save-country-details", { modPath: mod, tag, details });
    check("country", i, "I1 save ok", okResp(r1), r1.body);
    const f = rel(); const t1 = f ? read(f) : null;
    check("country", i, "I2 file balanced", t1 != null && balanced(t1), f);
    const r2 = await post("/api/history/save-country-details", { modPath: mod, tag, details });
    check("country", i, "I1 re-save ok", okResp(r2), r2.body);
    const t2 = f ? read(f) : null;
    check("country", i, "I3 idempotent (byte-identical)", t1 != null && t1 === t2, t1 && t2 && `${t1.length} vs ${t2.length}`);
    if (t2) {
      check("country", i, "exactly ONE set_politics", (t2.match(/set_politics\s*=\s*\{/g) || []).length === 1, (t2.match(/set_politics\s*=\s*\{/g) || []).length);
      check("country", i, "exactly ONE set_popularities", (t2.match(/set_popularities\s*=\s*\{/g) || []).length === 1, (t2.match(/set_popularities\s*=\s*\{/g) || []).length);
      check("country", i, "exactly ONE capital line", (t2.match(/^\s*capital\s*=/gm) || []).length === 1, (t2.match(/^\s*capital\s*=/gm) || []).length);
      check("country", i, "exactly ONE set_research_slots", (t2.match(/set_research_slots\s*=/g) || []).length === 1, (t2.match(/set_research_slots\s*=/g) || []).length);
    }
  }
}

server.listen(0, "127.0.0.1", async () => {
  const t0 = Date.now();
  try {
    await fuzzTechs(25);
    await fuzzContinuousFocus(25);
    await fuzzCountryDetails(25);
  } catch (e) { fail++; failures.push({ maker: "harness", case: -1, name: "threw", extra: (e && e.stack || String(e)).slice(0, 600) }); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nMAKER-FUZZ2 seed=${SEED}: ${pass} checks passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const f of failures.slice(0, 60)) console.log(`  FAIL [${f.maker} #${f.case}] ${f.name} → ${f.extra}`);
    if (failures.length > 60) console.log(`  …and ${failures.length - 60} more`);
    process.exit(fail ? 1 : 0);
  }
});
