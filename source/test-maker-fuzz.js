// SEEDED ROUND-TRIP FUZZER for the four maker save endpoints (bug-hunt #11 — method pivot: ten static
// read-hunts converged at 0 confirmed, so this probes the same writers at RUNTIME with randomized real-ish
// payloads instead). Invariants that must hold for EVERY generated case:
//   I1  save succeeds (2xx, no error) for a valid payload
//   I2  the written game file is brace-balanced
//   I3  saving the SAME payload again is IDEMPOTENT (file byte-identical — no duplicated keys, no drift)
//   I4  the item's loc key appears EXACTLY once after two saves (upsert replaces, never duplicates)
//   I5  an UNBALANCED script payload is REJECTED and never corrupts the file
// Deterministic: run with `node test-maker-fuzz.js [seed]` (default 20260706). Failures print the maker,
// case index, seed and payload — rerunning the same seed reproduces them exactly.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");

const SEED = parseInt(process.argv[2], 10) || 20260706;
let s = SEED >>> 0;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// Name fragments a user can actually TYPE into a single-line input (no newlines — the DOM strips those).
const NAMES = ["Iron Pact", "Operation \"Dawn\"", "L'Étoile du Nord", "§YGolden§! Age", "Plan [B]", "War & Peace", "50% Mobilization", "Anschluss önce", "The <Vanguard>", "Back\\slash Doctrine", "ØستقلالЯ"];
const SCRIPTS = [
  "add_political_power = 100",
  "add_stability = -0.05\nadd_war_support = 0.1",
  "if = {\n\tlimit = { has_war = yes }\n\tadd_manpower = 1000\n}",
  "random_owned_state = {\n\tadd_extra_state_shared_building_slots = 1\n}",
  "set_country_flag = fuzz_flag_@x\nclr_country_flag = other",
  "add_timed_idea = {\n\tidea = fuzz_idea\n\tdays = 90\n}",
  "", // empty is legal
];
const TRIGGERS = ["has_war = no", "date > 1936.1.1\nis_major = yes", "NOT = { has_government = fascism }", ""];
const BAD_SCRIPTS = ["has_war = {", "add_political_power = 100 }", "if = {\n\tlimit = { has_war = yes }\nadd_stability = 0.1"];

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fuzz-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Fuzz"\n');
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
const locCount = (yml, key) => { const t = read(yml); if (t == null) return -1; const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return (t.match(new RegExp(`^\\s*${esc}:`, "gm")) || []).length; };

let pass = 0, fail = 0; const failures = [];
const check = (maker, i, name, cond, extra) => { if (cond) { pass++; } else { fail++; failures.push({ maker, case: i, name, extra: String(extra == null ? "" : extra).slice(0, 400) }); } };

async function fuzzEvents(N) {
  for (let i = 0; i < N; i++) {
    const ns = "fz" + int(1, 4), id = String(int(1, 40));
    const relEvt = `events/${ns}.txt`, relLoc = "localisation/english/custom_events_l_english.yml";
    const bad = rnd() < 0.15;
    const payload = {
      modPath: mod, namespace: ns, id, type: "country_event",
      title: pick(NAMES), description: pick(NAMES), picture: "GFX_report_event_001",
      triggeredOnly: pick(["yes", "no"]), hidden: "no", fireOnce: pick(["yes", "no"]), major: "no",
      mtthDays: pick([0, 30, 365]), trigger: bad ? pick(BAD_SCRIPTS) : pick(TRIGGERS), immediate: bad ? "" : pick(SCRIPTS),
      options: Array.from({ length: int(0, 3) }, (_, k) => ({ name: `${ns}.${id}.${"abcd"[k]}`, title: pick(NAMES), script: pick(SCRIPTS) })),
    };
    const r1 = await post("/api/events/save", payload);
    if (bad && payload.trigger) { // I5: unbalanced trigger must be rejected + file stays sane
      check("event", i, "I5 unbalanced rejected", !okResp(r1), r1.body);
      const t = read(relEvt); check("event", i, "I5 file not corrupted", t == null || balanced(t), relEvt);
      continue;
    }
    check("event", i, "I1 save ok", okResp(r1), r1.body);
    const t1 = read(relEvt);
    const l1 = read(relLoc);
    check("event", i, "I2 file balanced", t1 != null && balanced(t1));
    const r2 = await post("/api/events/save", payload);
    check("event", i, "I1 re-save ok", okResp(r2), r2.body);
    const t2 = read(relEvt);
    const l2 = read(relLoc);
    check("event", i, "I3 idempotent (byte-identical)", t1 === t2, t1 && t2 && t1.length + " vs " + t2.length);
    // The LOC file must be byte-stable too — a lazy unanchored upsert regex once duplicated a quoted title's
    // tail on every re-save (live-e2e finding the original fuzzer missed by only byte-checking the event file).
    check("event", i, "I3 loc idempotent (byte-identical)", l1 === l2, l1 && l2 && l1.length + " vs " + l2.length);
    check("event", i, "I4 title loc exactly once", locCount(relLoc, `${ns}.${id}.t`) === 1, locCount(relLoc, `${ns}.${id}.t`));
  }
}

async function fuzzDecisions(N) {
  for (let i = 0; i < N; i++) {
    const id = `fz_dec_${int(1, 30)}`, cat = pick(["fz_cat_a", "fz_cat_b"]);
    const relDec = `common/decisions/${cat}.txt`, relLoc = "localisation/english/custom_decisions_l_english.yml";
    const bad = rnd() < 0.15;
    const payload = {
      modPath: mod, categoryId: cat, id, name: pick(NAMES),
      cost: pick([0, 25, 150, 9999]), icon: "GFX_decision_generic", days: pick([0, 90]), fireOnce: pick(["yes", "no"]),
      available: bad ? pick(BAD_SCRIPTS) : pick(TRIGGERS), modifier: "", effect: pick(SCRIPTS),
      decisionType: "standard", scope: "country", cooldown: pick([0, 180]), targetTrigger: "",
      removeEffect: "", activation: "", isGood: "no", cancelTrigger: "", visible: pick(TRIGGERS),
      allowed: "", aiWillDo: pick(["", "factor = 1"]), priority: 0, cancelIfNotVisible: "",
      customCostText: "", customCostTrigger: "", targetedModifier: "", removeTrigger: "", onMapMode: "", highlightStates: "",
    };
    const r1 = await post("/api/decisions/save", payload);
    if (bad && payload.available) {
      check("decision", i, "I5 unbalanced rejected", !okResp(r1), r1.body);
      const t = read(relDec); check("decision", i, "I5 file not corrupted", t == null || balanced(t));
      continue;
    }
    check("decision", i, "I1 save ok", okResp(r1), r1.body);
    const t1 = read(relDec);
    check("decision", i, "I2 file balanced", t1 != null && balanced(t1));
    const r2 = await post("/api/decisions/save", payload);
    check("decision", i, "I1 re-save ok", okResp(r2), r2.body);
    const t2 = read(relDec);
    check("decision", i, "I3 idempotent (byte-identical)", t1 === t2, t1 && t2 && t1.length + " vs " + t2.length);
    check("decision", i, "I4 name loc exactly once", locCount(relLoc, id) === 1, locCount(relLoc, id));
  }
}

async function fuzzIdeas(N) {
  for (let i = 0; i < N; i++) {
    const id = `fz_spirit_${int(1, 30)}`;
    const relIdeas = "common/ideas/custom_ideas.txt", relLoc = "localisation/english/custom_ideas_l_english.yml";
    const bad = rnd() < 0.15;
    const mk = (mode) => ({
      modPath: mod, ideaId: id, targetRelativeFile: "custom_ideas.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: pick(NAMES), desc: pick([...NAMES, ""]), picture: "militant_group_soldier", category: "country", mode,
      selectedEffects: bad ? [pick(BAD_SCRIPTS)] : [pick(["modifier = {\n\tstability_factor = 0.05\n}", "on_add = {\n\tadd_political_power = 25\n}", ""]).trim()].filter(Boolean),
    });
    const r1 = await post("/api/ideas/upsert-definition", mk("create"));
    if (bad) {
      check("idea", i, "I5 unbalanced rejected", !okResp(r1), r1.body);
      const t = read(relIdeas); check("idea", i, "I5 file not corrupted", t == null || balanced(t));
      continue;
    }
    check("idea", i, "I1 save ok", okResp(r1), r1.body);
    const t1 = read(relIdeas);
    check("idea", i, "I2 file balanced", t1 != null && balanced(t1));
    const r2 = await post("/api/ideas/upsert-definition", mk("edit")); // same id → must REPLACE
    check("idea", i, "I1 edit ok", okResp(r2), r2.body);
    const t2 = read(relIdeas);
    check("idea", i, "I2 file balanced after edit", t2 != null && balanced(t2));
    const defs = (t2 || "").match(new RegExp(`^\\s*${id}\\s*=\\s*\\{`, "gm")) || [];
    check("idea", i, "I3 exactly ONE definition after edit", defs.length === 1, defs.length);
    check("idea", i, "I4 name loc exactly once", locCount(relLoc, id) === 1, locCount(relLoc, id));
  }
}

async function fuzzCharacters(N) {
  for (let i = 0; i < N; i++) {
    const tok = `FZ_char_${int(1, 30)}`;
    const relChar = "common/characters/custom_characters.txt", relLoc = "localisation/english/custom_characters_l_english.yml";
    const roleLeader = rnd() < 0.6, roleAdvisor = !roleLeader || rnd() < 0.5;
    const payload = {
      modPath: mod, token: tok, name: pick(NAMES), file: "custom_characters.txt",
      roleLeader, leaderIdeology: roleLeader ? pick(["conservatism", "fascism_ideology", "marxism"]) : "",
      leaderExpire: "", leaderTraits: roleLeader ? pick(["", "nationalist", "cautious stubborn"]) : "",
      roleAdvisor, advisorSlot: roleAdvisor ? pick(["political_advisor", "army_chief", "high_command", "theorist"]) : "",
      advisorIdeaToken: roleAdvisor ? tok.toLowerCase() : "", advisorLedger: roleAdvisor ? pick(["", "army", "navy", "air", "civilian"]) : "",
      advisorCost: roleAdvisor ? String(pick([0, 100, 150])) : "", advisorTraits: roleAdvisor ? pick(["", "ideological_crusader", "war_industrialist quartermaster_general"]) : "",
      roleGeneral: false,
    };
    if (!roleLeader && !roleAdvisor) payload.roleLeader = true; // at least one role
    const r1 = await post("/api/characters/save", payload);
    check("char", i, "I1 save ok", okResp(r1), r1.body);
    const t1 = read(relChar);
    check("char", i, "I2 file balanced", t1 != null && balanced(t1));
    const r2 = await post("/api/characters/save", payload);
    check("char", i, "I1 re-save ok", okResp(r2), r2.body);
    const t2 = read(relChar);
    check("char", i, "I3 idempotent (byte-identical)", t1 === t2, t1 && t2 && t1.length + " vs " + t2.length);
    // managed advisor keys must never duplicate inside this character's block
    if (payload.roleAdvisor && t2) {
      const m = t2.match(new RegExp(`(^|\\n)\\s*${tok}\\s*=\\s*\\{[\\s\\S]*?\\n\\t\\}`, "m"));
      const block = m ? m[0] : "";
      for (const key of ["slot", "idea_token", "ledger"]) {
        const n = (block.match(new RegExp(`\\b${key}\\s*=`, "g")) || []).length;
        check("char", i, `I3 ${key} appears <=1x`, n <= 1, `${key}=${n}`);
      }
    }
  }
}

server.listen(0, "127.0.0.1", async () => {
  const t0 = Date.now();
  try {
    await fuzzEvents(40);
    await fuzzDecisions(40);
    await fuzzIdeas(30);
    await fuzzCharacters(30);
  } catch (e) { fail++; failures.push({ maker: "harness", case: -1, name: "threw", extra: (e && e.stack || String(e)).slice(0, 600) }); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nMAKER-FUZZ seed=${SEED}: ${pass} checks passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const f of failures.slice(0, 200)) console.log(`  FAIL [${f.maker} #${f.case}] ${f.name} → ${f.extra}`);
    if (failures.length > 200) console.log(`  …and ${failures.length - 200} more`);
    process.exit(fail ? 1 : 0);
  }
});
