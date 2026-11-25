// #template-decision-category-undefined — THE NEW-MOD TEMPLATE SHIPPED A DECISION THE GAME NEVER SHOWS.
//
// The user, after playing a Nova-built mod: "many decisions had no effect and idk if thats a nova issue or
// that they were actually empty." This is the Nova issue half, and it is in the very first thing a new user
// touches — the New Mod front door.
//
// /api/mod/create-template scaffolds a country and writes common/decisions/custom_decisions.txt containing
// `<tag>_decisions = { <tag>_chambers_decision = { … } }`. A decision lives inside a decision_category, and
// HOI4 only loads a category that is DEFINED in common/decisions/categories. `<tag>_decisions` is
// tag-specific, so nothing defines it — not the mod, not vanilla. The decision was therefore invisible in
// game no matter what the player did.
//
// Everything ELSE about the generated decision was already correct, which is what made this hard to see:
// the loc key is written, and the `<tag>_decision_unlocked` flag its `visible` block tests really is set, by
// the generated focus's completion_reward. Only the category definition was missing.
//
// Confirmed against the user's real mods before fixing: `sea` (atl_decisions) and `testx` (pal_decisions)
// both carry the symptom on disk.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tplcat-"));
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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 42911;
const app = createApp();
const srv = app.listen(PORT, async () => {
  try {
    console.log("\n[the template] a brand-new mod, exactly as the front door creates it");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mod/create-template`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modName: "catprobe", displayName: "Cat Probe",
        countryTag: "ZQX", countryName: "Quixland", capitalStateId: 1, color: "120 10 50",
      }),
    });
    const body = await r.json().catch(() => ({}));
    rec("the template was created", r.status === 200 && body && body.ok, { s: r.status, b: body });

    const MOD = path.join(ROOT, "catprobe");
    const decFile = path.join(MOD, "common", "decisions", "custom_decisions.txt");
    rec("…and it wrote a decisions file", fs.existsSync(decFile), decFile);
    const decTxt = fs.existsSync(decFile) ? fs.readFileSync(decFile, "utf8") : "";
    const category = (/^([A-Za-z0-9_]+)\s*=\s*\{/m.exec(decTxt) || [])[1] || "";
    const decision = (/\n\t([A-Za-z0-9_]+)\s*=\s*\{/.exec(decTxt) || [])[1] || "";
    rec("…containing a decision inside a category", !!category && !!decision, { category, decision });

    console.log("\n[the bug] that category must actually be DEFINED, or the game never loads it");
    const catDir = path.join(MOD, "common", "decisions", "categories");
    rec("a categories directory exists", fs.existsSync(catDir), catDir);
    const catFiles = fs.existsSync(catDir) ? fs.readdirSync(catDir).filter((f) => /\.txt$/i.test(f)) : [];
    rec("…with a file in it", catFiles.length > 0, catFiles);
    const catBlob = catFiles.map((f) => fs.readFileSync(path.join(catDir, f), "utf8")).join("\n");
    const definedRe = new RegExp(`(^|\\n)\\s*${category}\\s*=\\s*\\{`);
    rec(`…defining ${category}`, definedRe.test(catBlob), catBlob.slice(0, 300));
    rec("…with an icon, so it renders", /(^|\n)\s*icon\s*=\s*GFX_decision_category_[A-Za-z0-9_]+/.test(catBlob),
      catBlob.slice(0, 300));

    // The category name is tag-specific, so nothing else can be covering for it. Prove that rather than
    // assume it — if vanilla happened to define one by this name the bug would not exist.
    let inVanilla = false;
    try {
      const vd = path.join(V, "common", "decisions", "categories");
      for (const f of fs.readdirSync(vd)) {
        if (definedRe.test(fs.readFileSync(path.join(vd, f), "utf8"))) inVanilla = true;
      }
    } catch (_) {}
    rec("…and vanilla does NOT define it, so the mod's own definition is the only one",
      inVanilla === false, "vanilla unexpectedly defines " + category);

    console.log("\n[the rest of the generated decision was already right]");
    // Stated because it is why this was easy to miss: only the category was wrong.
    const allTxt = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.txt$/i.test(e.name)) allTxt.push(p);
      }
    })(MOD);
    const blob = allTxt.map((p) => fs.readFileSync(p, "utf8")).join("\n");
    const flag = (/has_country_flag\s*=\s*([A-Za-z0-9_]+)/.exec(decTxt) || [])[1] || "";
    rec("the decision is gated on a country flag", !!flag, decTxt.slice(0, 200));
    rec("…and something in the mod actually SETS that flag",
      !!flag && new RegExp(`set_country_flag\\s*=\\s*${flag}`).test(blob), flag);
    rec("…the decision has an effect", /complete_effect\s*=\s*\{/.test(decTxt), decTxt.slice(0, 300));
    let loc = "";
    const ld = path.join(MOD, "localisation", "english");
    if (fs.existsSync(ld)) for (const f of fs.readdirSync(ld)) loc += fs.readFileSync(path.join(ld, f), "utf8") + "\n";
    rec("…and a name the player will see", new RegExp(`^[ \\t]*${decision}:`, "m").test(loc.replace(/^\ufeff/, "")),
      loc.slice(0, 200));

    console.log("\n[safety] the category file the game has to parse");
    let depth = 0, ok = true;
    for (const ch of catBlob) { if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth < 0) ok = false; } }
    rec("the categories file is brace-balanced", ok && depth === 0, depth);
    rec("…and defines exactly one category, not a duplicate",
      (catBlob.match(new RegExp(`(^|\\n)\\s*${category}\\s*=\\s*\\{`, "g")) || []).length === 1,
      (catBlob.match(new RegExp(`(^|\\n)\\s*${category}\\s*=\\s*\\{`, "g")) || []).length);

    console.log(`\n=== template decision category: ${checks} checks, ${fails.length} failed ===`);
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
