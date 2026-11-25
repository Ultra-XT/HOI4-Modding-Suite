// #research-speed-ignores-dependencies — THE NUMBER ON THE RESEARCH PAGE WAS WRONG FOR EVERY ADD-ON.
//
// The Research page shows a country's research-speed bonus, summed from the ideas it starts with.
// getCountryResearchSpeedBonus searched `[modRoot, gameRoot]` — the last of the two-root readers in
// server.js — so a mod's DEPENDENCIES were never looked in and every idea a base mod grants was worth zero.
//
// 🈯 Millennium Dawn defines **808** ideas carrying research_speed_factor. For an add-on over MD, all 808
// counted as nothing.
//
// The same loop ADDED UP every copy of an idea it came across rather than taking the one the game loads.
// Between vanilla and MD the overlap is zero today (measured: 189 vanilla ids with the modifier, 808 MD ids,
// 0 shared), so that half was latent rather than observed — but overriding a vanilla idea to change its
// research_speed_factor is exactly the case that hits it.
//
// ⚠️ getActiveRoots returns LOAD order, lowest priority FIRST, and this search takes the first hit — so the
// list must be reversed. The override case below is what catches getting that backwards: without the
// reverse the dependency's value is returned instead of the mod's own, and the number still looks sane.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rspeed-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);
const ideaBlock = (id, factor) => [
  "ideas = {",
  "\tcountry = {",
  "\t\t" + id + " = {",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { research_speed_factor = " + factor + " }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

// ── the BASE mod: defines two speed ideas ───────────────────────────────────────────────────────────────
const BASE = path.join(ROOT, "rsbase");
mk(path.join(BASE, "common", "ideas"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="RSBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "rsbase.mod"),
  'name="RSBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
// ⚠️ ONE OF THESE IDS HAS A CAPITAL IN IT, ON PURPOSE. Every id here used to be lowercase, which made the
// fixture blind to the shape of the content it claims to rescue: 708 of Millennium Dawn's 808
// research-speed ideas carry a capital (ARM_state_ateism, SAL_closed_nation), and the lookup is
// case-sensitive. An all-lowercase fixture passes whether or not those 708 are counted.
fs.writeFileSync(path.join(BASE, "common", "ideas", "rsbase_ideas.txt"),
  ideaBlock("DEP_Speed_Idea", "0.10") + ideaBlock("shared_speed_idea", "0.20"));

// ── the ADD-ON: grants both, and OVERRIDES the second with its own value ────────────────────────────────
// The grant lives in the ADD-ON's own history so this measures the definition lookup and nothing else.
// The override is in a differently-named file, so it is a duplicate id resolved by load order rather than a
// wholesale same-path replacement.
const ADDON = path.join(ROOT, "rsaddon");
mk(path.join(ADDON, "common", "ideas"));
mk(path.join(ADDON, "history", "countries"));
mk(path.join(ADDON, "common", "country_tags"));
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="RSAddon"\ndependencies={\n\t"RSBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "rsaddon.mod"),
  'name="RSAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"RSBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDON, "common", "ideas", "rsaddon_ideas.txt"), ideaBlock("shared_speed_idea", "0.05"));
fs.writeFileSync(path.join(ADDON, "common", "country_tags", "zz_rs.txt"), 'QQA = "countries/Qqa.txt"\n');
mk(path.join(ADDON, "common", "countries"));
fs.writeFileSync(path.join(ADDON, "common", "countries", "Qqa.txt"), "graphical_culture = western_european_gfx\n");
fs.writeFileSync(path.join(ADDON, "history", "countries", "QQA - Land.txt"),
  "capital = 1\nadd_ideas = {\n\tDEP_Speed_Idea\n\tshared_speed_idea\n}\n");

// A mod with the same grants but NO dependency, to show the reading works at all.
const SOLO = path.join(ROOT, "rssolo");
mk(path.join(SOLO, "common", "ideas"));
mk(path.join(SOLO, "history", "countries"));
mk(path.join(SOLO, "common", "country_tags"));
mk(path.join(SOLO, "common", "countries"));
fs.writeFileSync(path.join(SOLO, "descriptor.mod"), 'name="RSSolo"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "rssolo.mod"),
  'name="RSSolo"\npath="' + toPosix(SOLO) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(SOLO, "common", "ideas", "rssolo_ideas.txt"), ideaBlock("own_speed_idea", "0.30"));
fs.writeFileSync(path.join(SOLO, "common", "country_tags", "zz_rs.txt"), 'QQB = "countries/Qqb.txt"\n');
fs.writeFileSync(path.join(SOLO, "common", "countries", "Qqb.txt"), "graphical_culture = western_european_gfx\n");
fs.writeFileSync(path.join(SOLO, "history", "countries", "QQB - Land.txt"),
  "capital = 1\nadd_ideas = {\n\town_speed_idea\n}\n");

let PORT = 50504;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

(async () => {
  let srv = null;
  try {
    console.log("\n[ground truth] a real base mod carries a lot of these");
    {
      const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/ideas";
      if (fs.existsSync(MD)) {
        let n = 0;
        const walk = (d) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const q = path.join(d, e.name);
            if (e.isDirectory()) walk(q);
            else if (e.name.endsWith(".txt")) n += (fs.readFileSync(q, "latin1").match(/research_speed_factor/g) || []).length;
          }
        };
        walk(MD);
        console.log("     Millennium Dawn research_speed_factor lines: " + n);
        rec("a base mod really does carry hundreds of these", n > 200, n);
      } else console.log("     (Millennium Dawn not installed — skipped)");
    }

    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const bonus = async (tag, mod) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/country-techs?tag=${tag}&modPath=${encodeURIComponent(mod)}`)
        .then((x) => x.json()).catch((e) => ({ error: String(e) }));
      return r;
    };

    console.log("\n[CONTROL FIRST — a mod with no dependencies] the reading works at all");
    {
      const r = await bonus("QQB", SOLO);
      rec("the endpoint answers", !r.error, r.error || "ok");
      rec("…and its own idea counts", near(r.ideasResearchSpeedBonus, 0.30), r.ideasResearchSpeedBonus);
    }

    console.log("\n[an add-on] a base mod's idea must count for something");
    {
      const r = await bonus("QQA", ADDON);
      rec("the endpoint answers", !r.error, r.error || "ok");
      // dep_speed_idea 0.10 (base only) + shared_speed_idea 0.05 (the add-on's own override wins) = 0.15.
      // Before the fix this was 0.05: the base mod's idea was invisible.
      rec("…the dependency-only idea is counted", Number(r.ideasResearchSpeedBonus) > 0.05 + 1e-9,
        r.ideasResearchSpeedBonus);
      // That idea's id carries a capital, so this also proves the ids are not case-folded on the way in.
      // They were, into a case-sensitive lookup, which is why reaching the dependency's files was only
      // half the fix. #research-speed-lowercases-ids-into-nothing
      rec("…and an id with a CAPITAL in it is found, not silently skipped",
        near(r.ideasResearchSpeedBonus, 0.15), r.ideasResearchSpeedBonus);
      rec("…and the total is exactly what the game would load (0.10 + 0.05)",
        near(r.ideasResearchSpeedBonus, 0.15), r.ideasResearchSpeedBonus);
    }

    console.log("\n[⚠️ THE ORDER + DOUBLE-COUNT CONTROL] one value per idea, from the copy that loads");
    {
      const r = await bonus("QQA", ADDON);
      const v = Number(r.ideasResearchSpeedBonus);
      // 0.30 would mean both copies of shared_speed_idea were added (0.10 + 0.20 + 0.05 would be 0.35;
      // 0.10 + 0.20 = 0.30 if the mod's own copy lost to the dependency's and both were summed).
      rec("…not the sum of every copy", !near(v, 0.35) && !near(v, 0.30), v);
      // 0.10 + 0.20 = 0.30 is also what an UNREVERSED root list produces, so the exact value above is the
      // check that distinguishes "found the dependency" from "found it and preferred it wrongly".
      rec("…and the mod's own override is the one that counted", near(v, 0.15), v);
    }

    console.log("\n[CONTROL — a country with no ideas] stays at zero rather than inventing a bonus");
    {
      fs.writeFileSync(path.join(ADDON, "common", "country_tags", "zz_rs2.txt"), 'QQC = "countries/Qqc.txt"\n');
      fs.writeFileSync(path.join(ADDON, "common", "countries", "Qqc.txt"), "graphical_culture = western_european_gfx\n");
      fs.writeFileSync(path.join(ADDON, "history", "countries", "QQC - Land.txt"), "capital = 1\n");
      const r = await bonus("QQC", ADDON);
      rec("no ideas, no bonus", near(r.ideasResearchSpeedBonus || 0, 0), r.ideasResearchSpeedBonus);
    }

    console.log(`\n=== research speed dependencies: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
