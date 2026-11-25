// Two defects in the technology picker (the prompt behind "+ Add Dependency", the prerequisite/parent
// prompt, the OR-group prompt and the mutually-exclusive prompt — all four share validTechSuggestions).
//
// ⛔ #picker-cap-hides-techs — MEASURE A CAP AGAINST THE REAL CORPUS.
// The datalist was built from `suggestions.slice(0, 1500)`, keeping the FIRST 1500 and dropping the rest
// without a word. validTechSuggestions appends in load order — this mod, then base mod, then vanilla — so the
// truncation ate the VANILLA end: on a big mod a base-game tech could not be picked as a prerequisite and
// nothing said why. Measured across the installed mods: Rise of Nations offers 2,196 technologies, 696 of
// them past the cap. Verified live: the picker now renders all 2,196.
//
// ⛔ #picker-calls-everything-this-mod — LABEL BY OWNERSHIP, NOT BY WHICH ARRAY IT CAME OUT OF.
// Every entry drawn from allTechs was labelled "this mod". True while allTechs was mod-only — and
// #overlay-blindness then made allTechs the FULL catalogue, because a mod is an overlay and the tree must
// show what the game shows. That turned the label into a lie for every inherited tech and killed the one
// thing it exists to say. Measured live on Road to 56 before the fix: 818 of 818 entries read "this mod",
// vanilla's own `infantry_weapons` among them; after, 812 "this mod" and 6 "vanilla".
//
// ⭐ A fix arming a latent bug next door is a recorded shape here. The tell was that not one entry in the
// entire list said "vanilla".
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53536;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-picker-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

(async () => {
  let server;
  try {
    const RESEARCH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));

    console.log("1. The cap");
    rec("the 1500 slice is gone", !/suggestions\.slice\(0, 1500\)/.test(RESEARCH));
    const capM = /const MAX_SUGGESTIONS = (\d+);/.exec(RESEARCH);
    rec("there is a named ceiling", !!capM, capM && capM[1]);
    rec("…and a truncation ANNOUNCES itself", /ids listed — type an id in full if it is not offered/.test(RESEARCH),
      "a silently short picker is indistinguishable from a tech that does not exist");
    rec("…and it is only added when something was actually dropped", /if \(hidden > 0\)/.test(RESEARCH),
      "appending the note unconditionally would be its own small lie");

    console.log("\n2. The label is derived from ownership");
    rec("an entry is labelled by isMod", /t\.isMod \? "this mod" :/.test(RESEARCH));
    rec("…falling back to the base-mod id set", /baseModIds\.has\(t\.id\) \? "base mod" : "vanilla"/.test(RESEARCH));
    rec("…which is built from baseModTechs", /const baseModIds = new Set\(\(baseModTechs \|\| \[\]\)/.test(RESEARCH));
    rec("nothing labels the whole array 'this mod' any more",
      !/allTechs\.forEach\(\(t\) => \{ if \(!t\.isSubTech\) add\(t, "this mod"\); \}\)/.test(RESEARCH));

    console.log("\n3. Measured against the installed mods");
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const catalog = async (root) =>
      (await (await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(root)}`)).json());

    const mods = [];
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "common", "technologies"))) mods.push([d, p]);
      }
    } catch (_) {}
    rec("there are installed mods to measure", mods.length > 1, mods.length);

    // ⏱️ COUNT FROM THE FILES, NOT FROM THE CATALOGUE. Asking the endpoint for every installed mod meant a
    // full catalogue build per mod and cost this test 99 SECONDS on its own — a sixth of the suite's budget
    // to establish one number. Counting the ids each mod would contribute is a cheap file parse, and it is
    // also INDEPENDENT of the code under test, which makes the cap comparison better evidence rather than
    // worse. Only the ONE mod whose labels are checked below still needs a real catalogue.
    const idsDeclaredBy = (root) => {
      const ids = new Set();
      let files = [];
      try { files = fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => f.endsWith(".txt")); } catch (_) { return ids; }
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(path.join(root, "common", "technologies", f), "utf8"); } catch (_) { continue; }
        for (const m of t.replace(/#[^\n]*/g, "").matchAll(/(^|\n)\t([A-Za-z0-9_@.\-]+)\s*=\s*\{/g)) ids.add(m[2]);
      }
      return ids;
    };
    const GAME_ROOT = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    let biggest = { name: "", n: 0 };
    for (const [name, root] of mods) {
      // A mod's picker offers its own ids plus whatever it inherits from the base game.
      const n = new Set([...idsDeclaredBy(root), ...idsDeclaredBy(GAME_ROOT)]).size;
      if (n > biggest.n) biggest = { name, n };
    }
    // …and which mod INHERITS is a file question too, so the catalogue is built exactly once. Looping mods
    // until one happened to inherit still cost a build per mod: HOI4 replaces a common/ file wholesale at the
    // same path, so a mod inherits precisely when it leaves one of vanilla's technologies filenames alone and
    // does not replace_path the directory.
    const techFilenames = (root) => {
      try { return fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => f.endsWith(".txt")).map((f) => f.toLowerCase()); }
      catch (_) { return []; }
    };
    const vanillaFiles = new Set(techFilenames(GAME_ROOT));
    let inheriting = null;
    for (const [name, root] of mods) {
      let desc = "";
      try { desc = fs.readFileSync(path.join(root, "descriptor.mod"), "utf8"); } catch (_) {}
      if (/replace_path\s*=\s*"common\/technologies"/.test(desc)) continue;
      const own = new Set(techFilenames(root));
      if (![...vanillaFiles].some((f) => !own.has(f))) continue;   // shadows every one → inherits nothing
      const d = await catalog(root);
      const techs = (d.technologies || []).filter((t) => !t.isSubTech);
      const inherited = techs.filter((t) => !t.isMod);
      if (inherited.length) { inheriting = { name, root, techs, inherited }; break; }
    }
    rec("the biggest installed picker list was measured", biggest.n > 0, `${biggest.name}: ${biggest.n} ids`);
    // ⭐ DERIVED: the ceiling must clear the real corpus, not a number someone liked.
    rec("…and the ceiling clears it", capM && Number(capM[1]) > biggest.n,
      `cap ${capM && capM[1]} vs ${biggest.n}`);
    // …and the OLD cap did not, or this whole section proves nothing.
    rec("…while the old 1500 cap did NOT", biggest.n > 1500,
      `${biggest.name} exceeded it by ${biggest.n - 1500}`);

    console.log("\n4. The label rule, composed");
    // ⚠️ THE FIXTURE MUST CONTAIN AN INHERITED TECH. Every installed mod except one ships its own copy of
    // vanilla's technology files, so almost everything really IS the mod's own — a fixture without a single
    // inherited tech would make this check pass while measuring nothing.
    if (!inheriting) {
      rec("an installed mod that INHERITS at least one technology", false,
        "every installed mod shadows all of vanilla's technology files — cannot measure the label");
    } else {
      rec(`${inheriting.name} inherits some technologies`, inheriting.inherited.length > 0,
        `${inheriting.inherited.length} inherited of ${inheriting.techs.length}`);
      const baseModIds = new Set();
      const labelOf = (t) => (t.isMod ? "this mod" : (baseModIds.has(t.id) ? "base mod" : "vanilla"));
      const OLD = () => "this mod";

      const counts = {};
      inheriting.techs.forEach((t) => { const l = labelOf(t); counts[l] = (counts[l] || 0) + 1; });
      rec("the picker now distinguishes inherited techs", (counts["vanilla"] || 0) === inheriting.inherited.length,
        counts);
      rec("…and still calls the mod's own techs its own",
        (counts["this mod"] || 0) === inheriting.techs.filter((t) => t.isMod).length, counts);
      // ⭐ CONTROL: the old rule labelled every one of them "this mod".
      const oldCounts = {};
      inheriting.techs.forEach((t) => { const l = OLD(t); oldCounts[l] = (oldCounts[l] || 0) + 1; });
      rec("the OLD rule called every inherited tech the mod's own",
        oldCounts["this mod"] === inheriting.techs.length && !oldCounts["vanilla"], oldCounts);
      // A specific inherited id, named from the data rather than typed in.
      const sample = inheriting.inherited[0];
      rec(`…e.g. "${sample.id}" now reads vanilla, not this mod`, labelOf(sample) === "vanilla",
        `${labelOf(sample)} (was "${OLD(sample)}")`);
    }

    console.log(`\n=== the tech picker tells the truth: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
