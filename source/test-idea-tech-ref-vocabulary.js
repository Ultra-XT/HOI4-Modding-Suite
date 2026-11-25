// Renaming a spirit or a technology followed ONE of the ways real content names it, and left the rest dead.
//
// #spirit-rename-only-follows-add-ideas — `add_ideas` is barely a fifth of the idea-by-id vocabulary.
// Counted over the directories the walker visits: vanilla writes add_ideas 3,146 times but has_idea 4,079,
// add_timed_idea 1,650, remove_ideas 1,501 and swap_ideas 1,358; Millennium Dawn writes has_idea 12,681
// against 5,928 add_ideas. HOI4 reports none of them after a rename — the swap swaps in nothing, the timed
// idea never arrives, and a `has_idea` for an id nothing defines is permanently FALSE, so the gate it guards
// silently inverts.
//
// #tech-rename-leaves-has-tech — the same shape one maker over. The rename followed `set_technology` and not
// `has_tech`, and `has_tech` is the more common of the two in vanilla (2,811 vs 2,275). A focus whose
// prerequisite names a dead tech can never be completed.
//
// #grant-ref-sites-incomplete — and both walkers only ever visited five directories, which hold 70% of
// vanilla's references and 68% of MD's. The decision CATEGORY files were invisible because they live in a
// SUBdirectory of common/decisions and the scan filters for `.txt` at one level.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-idearef-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "idearef");
const mk = (...p) => { fs.mkdirSync(path.join(MOD, ...p), { recursive: true }); return path.join(MOD, ...p); };
mk("common", "ideas");
mk("common", "national_focus");
mk("common", "decisions", "categories");
mk("common", "scripted_effects");
mk("common", "characters");
mk("common", "technologies");
mk("events");
mk("history", "countries");
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="IdeaRef"\nsupported_version="1.19.*"\n', "utf8");

// The spirit itself, in the shape Nova's own writer produces.
const IDEAS = path.join(MOD, "common", "ideas", "nova_spirits.txt");
fs.writeFileSync(IDEAS, [
  "ideas = {",
  "\tcountry = {",
  "\t\tnv_old_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { war_support_factor = 0.05 }",
  "\t\t}",
  "\t\tnv_other_spirit = {",
  // a SIBLING spirit gated on the one being renamed — common/ideas was never visited
  "\t\t\tallowed = { has_idea = nv_old_spirit }",
  "\t\t\tmodifier = { political_power_gain = 0.1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// Every other shape, spread across the directories that were and were not visited.
const FOCUS = path.join(MOD, "common", "national_focus", "nova_focus.txt");
fs.writeFileSync(FOCUS, [
  "focus_tree = {",
  "\tid = nova_tree",
  "\tfocus = {",
  "\t\tid = nv_focus_a",
  "\t\tavailable = { has_idea = nv_old_spirit }",
  "\t\tcompletion_reward = {",
  "\t\t\tswap_ideas = { remove_idea = nv_old_spirit add_idea = nv_other_spirit }",
  "\t\t\tadd_timed_idea = { idea = nv_old_spirit days = 365 }",
  "\t\t\tremove_ideas = nv_old_spirit",
  "\t\t\t# remove_ideas = nv_old_spirit   <- commented out, must stay untouched",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
const CAT = path.join(MOD, "common", "decisions", "categories", "nova_categories.txt");
fs.writeFileSync(CAT, "nv_cat = {\n\tvisible = { has_idea = nv_old_spirit }\n}\n", "utf8");
const SEFF = path.join(MOD, "common", "scripted_effects", "nova_effects.txt");
fs.writeFileSync(SEFF, "nv_grant = {\n\tadd_ideas = { nv_old_spirit }\n\tremove_ideas = { nv_other_spirit }\n}\n", "utf8");
const CHARS = path.join(MOD, "common", "characters", "nova_chars.txt");
fs.writeFileSync(CHARS, [
  "characters = {",
  "\tnv_adv = {",
  "\t\tadvisor = { slot = political_advisor idea_token = nv_adv_tok available = { has_idea = nv_old_spirit } }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// …and a decoy whose id merely CONTAINS the old one. Whole-word only, or the rename corrupts it.
const HIST = path.join(MOD, "history", "countries", "MZA - Mozambique.txt");
fs.writeFileSync(HIST, "capital = 1\nadd_ideas = { nv_old_spirit_extra }\nhas_idea = nv_old_spirit\n", "utf8");

// The technology side.
const TECHS = path.join(MOD, "common", "technologies", "nova_tech.txt");
fs.writeFileSync(TECHS, "technologies = {\n\tnv_old_tech = {\n\t\tresearch_cost = 1\n\t\tfolder = { name = nova_folder position = { x = 0 y = 0 } }\n\t}\n}\n", "utf8");
const TFOCUS = path.join(MOD, "common", "national_focus", "nova_tech_focus.txt");
fs.writeFileSync(TFOCUS, [
  "focus_tree = {",
  "\tid = nova_tech_tree",
  "\tfocus = {",
  "\t\tid = nv_focus_t",
  "\t\tavailable = { has_tech = nv_old_tech }",
  "\t\tcompletion_reward = { set_technology = { nv_old_tech = 1 } }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 43277;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };

  try {
    console.log("\n[ground truth] add_ideas is a minority of the idea vocabulary in real content");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const SITES = [["history", "countries"], ["common", "national_focus"], ["common", "decisions"], ["events"], ["common", "on_actions"]];
    const tally = {};
    for (const rel of SITES) {
      const dir = path.join(V, ...rel);
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = read(path.join(dir, f));
        for (const k of ["add_ideas", "remove_ideas", "swap_ideas", "add_timed_idea", "has_idea"]) {
          const n = (t.match(new RegExp(`\\b${k}\\s*=`, "g")) || []).length;
          if (n) tally[k] = (tally[k] || 0) + n;
        }
      }
    }
    rec("vanilla was measurable", (tally.add_ideas || 0) > 1000, tally);
    rec("…and has_idea alone outnumbers add_ideas", (tally.has_idea || 0) > (tally.add_ideas || 0), tally);
    const others = (tally.remove_ideas || 0) + (tally.swap_ideas || 0) + (tally.add_timed_idea || 0) + (tally.has_idea || 0);
    rec("…so following only add_ideas leaves the majority of references dead",
      others > (tally.add_ideas || 0) * 2, { add_ideas: tally.add_ideas, others });

    console.log("\n[the bug] renaming a spirit must carry EVERY shape that names it");
    let r = await post("/api/ideas/upsert-definition", {
      // Exactly the payload public/ideas.js sends for a rename: no `mode` (so the writer creates the new id),
      // plus previousIdeaId so the old block is removed and its references followed.
      modPath: MOD, category: "country",
      targetRelativeFile: "common/ideas/nova_spirits.txt",
      ideaId: "nv_new_spirit", previousIdeaId: "nv_old_spirit",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "New Spirit", desc: "", picture: "generic_morale_bonus",
      selectedEffects: ["modifier = {\n\twar_support_factor = 0.05\n}"],
    });
    rec("the rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);

    const focus = read(FOCUS);
    rec("swap_ideas' remove_idea followed the rename", /remove_idea\s*=\s*nv_new_spirit/.test(focus), focus);
    rec("add_timed_idea's idea followed the rename", /idea\s*=\s*nv_new_spirit\s+days/.test(focus), focus);
    rec("a bare remove_ideas followed the rename",
      /(^|\n)\s*remove_ideas\s*=\s*nv_new_spirit/.test(focus), focus);
    rec("a has_idea trigger followed the rename", /has_idea\s*=\s*nv_new_spirit/.test(focus), focus);
    rec("…and nothing still names the dead id outside a comment",
      !/(^|\n)[^\n#]*\bnv_old_spirit\b/.test(focus), focus);
    rec("…while the COMMENTED-OUT reward was left exactly as the author wrote it",
      /#\s*remove_ideas\s*=\s*nv_old_spirit/.test(focus), focus);

    console.log("\n[the bug] and in the directories the walker never visited");
    rec("a sibling spirit's allowed = { has_idea } was followed (common/ideas)",
      /allowed\s*=\s*\{\s*has_idea\s*=\s*nv_new_spirit\s*\}/.test(read(IDEAS)), read(IDEAS));
    rec("a decision CATEGORY's visible was followed (common/decisions/categories)",
      /has_idea\s*=\s*nv_new_spirit/.test(read(CAT)), read(CAT));
    rec("a scripted effect was followed (common/scripted_effects)",
      /add_ideas\s*=\s*\{\s*nv_new_spirit\s*\}/.test(read(SEFF)), read(SEFF));
    rec("an advisor's available was followed (common/characters)",
      /has_idea\s*=\s*nv_new_spirit/.test(read(CHARS)), read(CHARS));

    console.log("\n[safety] a longer id that merely CONTAINS the old one is not touched");
    const hist = read(HIST);
    rec("nv_old_spirit_extra survived intact", /nv_old_spirit_extra/.test(hist), hist);
    rec("…and the history has_idea did follow the rename", /has_idea\s*=\s*nv_new_spirit/.test(hist), hist);
    rec("…and an unrelated spirit in the same file was not renamed",
      /nv_other_spirit/.test(read(SEFF)), read(SEFF));

    console.log("\n[the bug] a technology rename must carry has_tech, not just set_technology");
    r = await post("/api/technologies/save", {
      modPath: MOD,
      tech: {
        id: "nv_new_tech", previousId: "nv_old_tech", isMod: true, fileName: "nova_tech.txt",
        research_cost: 1, folder: [{ name: "nova_folder", position: { x: 0, y: 0 } }],
      },
    });
    rec("the technology rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const tf = read(TFOCUS);
    rec("set_technology followed the rename", /set_technology\s*=\s*\{\s*nv_new_tech\s*=\s*1\s*\}/.test(tf), tf);
    rec("…and so did the has_tech prerequisite", /has_tech\s*=\s*nv_new_tech/.test(tf), tf);
    rec("…leaving nothing naming the dead tech", !/nv_old_tech/.test(tf), tf);

    console.log(`\n=== idea/tech reference vocabulary: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
