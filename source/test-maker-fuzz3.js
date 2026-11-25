// SEEDED FUZZER round 3 (bug-hunt #13) — LIFECYCLE cycles the first two rounds didn't cover:
//   • CREATE→DELETE cycles (events / decisions / characters / ideas): after every delete the file must be
//     brace-balanced, the item + its loc key GONE, and the file must NOT GROW across repeated cycles
//     (delete-side splice drift would accumulate exactly like the save-side drift hunts #11-12 fixed).
//   • TECH RENAME cycles (the previousId path): A→B→A must leave exactly ONE definition, no dead ids,
//     loc for the live id exactly once and the dead id stripped, with stable file size across pairs.
// Deterministic: `node test-maker-fuzz3.js [seed]` (default 20260708).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");

const SEED = parseInt(process.argv[2], 10) || 20260708;
let s = SEED >>> 0;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const NAMES = ["Iron Pact", "Operation \"Dawn\"", "§YGolden§! Age", "Plan [B]", "L'Étoile"];
const SCRIPTS = ["add_political_power = 100", "if = {\n\tlimit = { has_war = yes }\n\tadd_stability = 0.05\n}", ""];

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fuzz3-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Fuzz3"\n');
const app = createApp();
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
const locCount = (yml, key) => { const t = read(yml); if (t == null) return 0; const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return (t.match(new RegExp(`^\\s*${esc}:`, "gm")) || []).length; };

let pass = 0, fail = 0; const failures = [];
const check = (maker, i, name, cond, extra) => { if (cond) { pass++; } else { fail++; failures.push({ maker, case: i, name, extra: String(extra == null ? "" : extra).slice(0, 300) }); } };

// Run `cycles` create→delete rounds for one item; assert per-round invariants + no cross-round growth.
async function lifecycle(maker, N, { create, del, files, locFile, locKey, gone }) {
  for (let i = 0; i < N; i++) {
    let prevLens = null;
    for (let cyc = 0; cyc < 3; cyc++) {
      const rc = await create(i);
      check(maker, i, `c${cyc} create ok`, okResp(rc), rc.body);
      const rd = await del(i);
      check(maker, i, `c${cyc} delete ok`, okResp(rd), rd.body);
      const lens = [];
      for (const f of files(i)) {
        const t = read(f);
        check(maker, i, `c${cyc} ${f} balanced after delete`, t == null || balanced(t));
        if (t != null) check(maker, i, `c${cyc} item gone from ${f}`, !gone(i).test(t), (t.match(gone(i)) || [])[0]);
        lens.push(t == null ? 0 : t.length);
      }
      const lc = locCount(locFile(i), locKey(i));
      check(maker, i, `c${cyc} loc key stripped`, lc === 0, lc);
      lens.push((read(locFile(i)) || "").length);
      if (prevLens) check(maker, i, `c${cyc} NO cross-cycle growth`, JSON.stringify(lens) === JSON.stringify(prevLens), `${JSON.stringify(prevLens)} -> ${JSON.stringify(lens)}`);
      prevLens = lens;
    }
  }
}

async function techRenameCycles(N) {
  const relTech = "common/technologies/custom_technologies.txt";
  const relLoc = "localisation/english/custom_technologies_l_english.yml";
  for (let i = 0; i < N; i++) {
    const A = `fzr_a_${i}`, B = `fzr_b_${i}`;
    const mk = (id, prev) => ({ modPath: mod, tech: { id, previousId: prev || "", fileName: "custom_technologies.txt", folder: "infantry_folder", name: pick(NAMES), year: int(1936, 1944), extraScript: "" } });
    const r1 = await post("/api/technologies/save", mk(A));
    check("techRename", i, "create A ok", okResp(r1), r1.body);
    let prevLen = null;
    for (let pair = 0; pair < 2; pair++) {
      const r2 = await post("/api/technologies/save", mk(B, A)); // rename A -> B
      check("techRename", i, `p${pair} rename A->B ok`, okResp(r2), r2.body);
      const r3 = await post("/api/technologies/save", mk(A, B)); // rename back B -> A
      check("techRename", i, `p${pair} rename B->A ok`, okResp(r3), r3.body);
      const t = read(relTech) || "";
      check("techRename", i, `p${pair} balanced`, balanced(t));
      const defsA = (t.match(new RegExp(`^\\s*${A}\\s*=\\s*\\{`, "gm")) || []).length;
      const defsB = (t.match(new RegExp(`^\\s*${B}\\s*=\\s*\\{`, "gm")) || []).length;
      check("techRename", i, `p${pair} exactly ONE ${A} definition`, defsA === 1, defsA);
      check("techRename", i, `p${pair} dead id ${B} fully removed`, defsB === 0, defsB);
      check("techRename", i, `p${pair} live loc exactly once`, locCount(relLoc, A) === 1, locCount(relLoc, A));
      check("techRename", i, `p${pair} dead loc stripped`, locCount(relLoc, B) === 0, locCount(relLoc, B));
      if (prevLen != null) check("techRename", i, `p${pair} no growth across pairs`, t.length === prevLen, `${prevLen} -> ${t.length}`);
      prevLen = t.length;
    }
  }
}

server.listen(0, "127.0.0.1", async () => {
  const t0 = Date.now();
  try {
    await lifecycle("event", 8, {
      create: (i) => post("/api/events/save", { modPath: mod, namespace: `lc${i}`, id: "1", type: "country_event", title: pick(NAMES), description: pick(NAMES), picture: "GFX_report_event_001", triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: pick(SCRIPTS), options: [{ name: `lc${i}.1.a`, title: pick(NAMES), script: pick(SCRIPTS) }] }),
      del: (i) => post("/api/events/delete-definition", { modPath: mod, eventId: `lc${i}.1` }),
      files: (i) => [`events/lc${i}.txt`],
      locFile: () => "localisation/english/custom_events_l_english.yml",
      locKey: (i) => `lc${i}.1.t`,
      gone: (i) => new RegExp(`id\\s*=\\s*lc${i}\\.1\\b`),
    });
    await lifecycle("decision", 8, {
      create: (i) => post("/api/decisions/save", { modPath: mod, categoryId: `lc_cat_${i % 2}`, id: `lc_dec_${i}`, name: pick(NAMES), cost: 50, icon: "GFX_decision_generic", days: 0, fireOnce: "no", available: "has_war = yes", modifier: "", effect: pick(SCRIPTS), decisionType: "standard", scope: "country", cooldown: 0, targetTrigger: "", removeEffect: "", activation: "", isGood: "no", cancelTrigger: "", visible: "", allowed: "", aiWillDo: "", priority: 0, cancelIfNotVisible: "", customCostText: "", customCostTrigger: "", targetedModifier: "", removeTrigger: "", onMapMode: "", highlightStates: "" }),
      del: (i) => post("/api/decisions/delete-definition", { modPath: mod, categoryId: `lc_cat_${i % 2}`, decisionId: `lc_dec_${i}` }),
      files: (i) => [`common/decisions/lc_cat_${i % 2}.txt`],
      locFile: () => "localisation/english/custom_decisions_l_english.yml",
      locKey: (i) => `lc_dec_${i}`,
      gone: (i) => new RegExp(`\\blc_dec_${i}\\s*=\\s*\\{`),
    });
    await lifecycle("char", 8, {
      create: (i) => post("/api/characters/save", { modPath: mod, token: `LC_char_${i}`, name: pick(NAMES), file: "custom_characters.txt", roleLeader: true, leaderIdeology: "conservatism", leaderExpire: "", leaderTraits: "", roleAdvisor: false, roleGeneral: false }),
      del: (i) => post("/api/characters/delete", { modPath: mod, token: `LC_char_${i}`, file: "custom_characters.txt" }),
      files: () => ["common/characters/custom_characters.txt"],
      locFile: () => "localisation/english/custom_characters_l_english.yml",
      locKey: (i) => `LC_char_${i}`,
      gone: (i) => new RegExp(`\\bLC_char_${i}\\s*=\\s*\\{`),
    });
    await lifecycle("idea", 8, {
      create: (i) => post("/api/ideas/upsert-definition", { modPath: mod, ideaId: `lc_spirit_${i}`, targetRelativeFile: "custom_ideas.txt", targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml", name: pick(NAMES), desc: "", picture: "militant_group_soldier", category: "country", mode: "create", selectedEffects: ["modifier = {\n\tstability_factor = 0.05\n}"] }),
      del: (i) => post("/api/ideas/delete-definition", { modPath: mod, ideaId: `lc_spirit_${i}`, targetRelativeFile: "custom_ideas.txt" }),
      files: () => ["common/ideas/custom_ideas.txt"],
      locFile: () => "localisation/english/custom_ideas_l_english.yml",
      locKey: (i) => `lc_spirit_${i}`,
      gone: (i) => new RegExp(`\\blc_spirit_${i}\\s*=\\s*\\{`),
    });
    await techRenameCycles(8);
  } catch (e) { fail++; failures.push({ maker: "harness", case: -1, name: "threw", extra: (e && e.stack || String(e)).slice(0, 600) }); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nMAKER-FUZZ3 seed=${SEED}: ${pass} checks passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const f of failures.slice(0, 60)) console.log(`  FAIL [${f.maker} #${f.case}] ${f.name} → ${f.extra}`);
    if (failures.length > 60) console.log(`  …and ${failures.length - 60} more`);
    process.exit(fail ? 1 : 0);
  }
});
