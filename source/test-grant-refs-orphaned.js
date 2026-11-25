// #grant-refs-orphaned — a rename must follow the effect references Nova wrote, wherever they live.
//
// An `add_ideas`, `set_technology` or `<kind>_event` that Nova wrote can sit in a country's history, a FOCUS
// reward, a DECISION's effect block, an EVENT option, or Nova's own all-countries on_actions file. Five makers
// each grew their own walker over whichever subset they happened to think of, so renaming a spirit followed
// its focus rewards but not its decision effects, renaming a technology followed history but no focus reward,
// and renaming an event followed history and nothing else. The leftover reference names an id that no longer
// exists, and HOI4 does not report that — the grant just silently never happens.
//
// renameGrantRefsEverywhere walks one shared site list for all of them. This asserts the sites each maker was
// previously MISSING, plus what must never be rewritten: a commented-out reference, and a dotted event id
// that merely starts with the renamed one (`nova_ns.10` when renaming `nova_ns.1`).
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-grantrefs-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "grantmod");
["common/ideas", "common/technologies", "common/decisions", "common/national_focus", "history/countries", "events", "common/on_actions"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="GrantMod"\nsupported_version="1.18.*"\n', "utf8");

// Seed the spirit and technology directly, the way the maker's own file would look.
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tnova_old_spirit = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n", "utf8");
const TECHFILE = path.join(MOD, "common", "technologies", "nova_tech.txt");
fs.writeFileSync(TECHFILE,
  "technologies = {\n\tnova_old_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t}\n}\n", "utf8");

const FOCUS = path.join(MOD, "common", "national_focus", "nova_focus.txt");
const DEC = path.join(MOD, "common", "decisions", "nova_decisions.txt");
const EVT = path.join(MOD, "events", "nova_events.txt");

// The sites each maker was missing, all naming the pre-rename ids. Re-seeded before each case so one
// maker's rename cannot mask another's.
function seedReferences() {
  fs.writeFileSync(FOCUS, [
    "focus_tree = {",
    "\tid = nova_tree",
    "\tfocus = {",
    "\t\tid = nova_focus_a",
    "\t\tcompletion_reward = {",
    "\t\t\tadd_ideas = nova_old_spirit",
    "\t\t\tset_technology = { nova_old_tech = 1 }",
    "\t\t\tcountry_event = nova_ns.1",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(DEC, [
    "nova_decisions = {",
    "\tnova_some_decision = {",
    "\t\tcomplete_effect = {",
    "\t\t\tadd_ideas = { nova_old_spirit }",
    "\t\t\tset_technology = { nova_old_tech = 1 }",
    "\t\t\tnews_event = { id = nova_ns.1 days = 3 }",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(EVT, [
    "add_namespace = nova_other",
    "",
    "country_event = {",
    "\tid = nova_other.5",
    "\toption = {",
    "\t\tname = nova_other.5.a",
    "\t\tadd_ideas = nova_old_spirit",
    "\t\tcountry_event = nova_ns.10",
    "\t\t# add_ideas = nova_old_spirit",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
}

const PORT = 42149;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = (p) => fs.readFileSync(p, "utf8");

  try {
    // ── SPIRIT: decision effects and event options were the missing sites ────────────────────────
    console.log("\n[spirit] add_ideas outside a focus reward");
    seedReferences();
    const rn = await post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: "nova_new_spirit", previousIdeaId: "nova_old_spirit",
      targetRelativeFile: "custom_ideas.txt", mode: "create", category: "country",
      name: "Nova New Spirit",
    });
    rec("the spirit rename succeeded", rn.status === 200 && rn.body && rn.body.ok !== false, rn.body || rn.status);
    rec("the focus reward follows (already worked before)", /add_ideas\s*=\s*nova_new_spirit/.test(read(FOCUS)), read(FOCUS));
    rec("a DECISION's effect block follows", /add_ideas\s*=\s*\{\s*nova_new_spirit\s*\}/.test(read(DEC)), read(DEC));
    rec("an EVENT option follows", /add_ideas\s*=\s*nova_new_spirit/.test(read(EVT)), read(EVT));
    rec("the commented-out reference is left alone",
      /#\s*add_ideas\s*=\s*nova_old_spirit/.test(read(EVT)), read(EVT));

    // ── TECHNOLOGY: focus rewards, decision effects and event options were all missing ───────────
    console.log("\n[technology] set_technology outside history");
    seedReferences();
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch(() => null);
    const mine = ((cat && cat.technologies) || []).find((t) => t.id === "nova_old_tech");
    rec("the catalog returned the tech", !!mine, ((cat && cat.technologies) || []).map((t) => t.id).slice(0, 6));
    if (mine) {
      const renamed = Object.assign({}, mine, { id: "nova_new_tech", previousId: "nova_old_tech" });
      const tr = await post("/api/technologies/save-batch", { modPath: MOD, technologies: [renamed] });
      rec("the tech rename succeeded", tr.status === 200 && tr.body && tr.body.ok !== false, tr.body || tr.status);
      rec("the FOCUS reward follows",
        /set_technology\s*=\s*\{\s*nova_new_tech\s*=\s*1\s*\}/.test(read(FOCUS)), read(FOCUS));
      rec("a DECISION's effect block follows",
        /set_technology\s*=\s*\{\s*nova_new_tech\s*=\s*1\s*\}/.test(read(DEC)), read(DEC));
    }

    // ── EVENT: everything except history was missing, and the dotted id must not over-match ──────
    console.log("\n[event] a fired event outside history, and ns.1 must not match ns.10");
    const made = await post("/api/events/save", {
      modPath: MOD, namespace: "nova_ns", id: "1", type: "country_event",
      title: "Original", description: "d", options: [{ name: "OK", script: "" }],
    });
    rec("the event was created", made.status === 200 && made.body && made.body.success !== false, made.body || made.status);
    seedReferences();
    const ev = await post("/api/events/save", {
      modPath: MOD, namespace: "nova_ns", id: "2", type: "country_event",
      title: "Renamed", description: "d", options: [{ name: "OK", script: "" }],
      previousEventId: "nova_ns.1",
    });
    rec("the event rename succeeded", ev.status === 200 && ev.body && ev.body.success !== false, ev.body || ev.status);
    rec("the FOCUS reward follows", /country_event\s*=\s*nova_ns\.2\b/.test(read(FOCUS)), read(FOCUS));
    rec("a DECISION's news_event block follows",
      /news_event\s*=\s*\{\s*id\s*=\s*nova_ns\.2\b/.test(read(DEC)), read(DEC));
    rec("nova_ns.10 was NOT rewritten by the nova_ns.1 rename",
      /country_event\s*=\s*nova_ns\.10\b/.test(read(EVT)), read(EVT));

    console.log(`\n=== grant refs orphaned: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
