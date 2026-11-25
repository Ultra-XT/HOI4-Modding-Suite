// #decision-key-case-variant — THE SAME SHAPE AS #event-key-case-variant, IN THE DECISION MAKER.
//
// Real decisions in the installed corpus write `Cost` (17), `Available` (22), `Is_good` (5),
// `remove_Effect` (3) and `target_ROOT_trigger` (1). Nova keyed the parser's field map by the EXACT
// spelling and tested managedDecisionKeys with a case-sensitive Set, so such a decision was:
//
//   • read as empty — the editor showed no cost and no availability, and
//   • not recognised as managed — so the preserve pass carried the author's lines forward…
//   • …while the maker wrote its own, from the empty form, beside them.
//
// Measured through the real endpoints. A decision written with `Cost = 25` and `Available = { has_war = no }`
// came back as:
//
//     cost = 0                       <- Nova's, from a form field that was never filled
//     available = { }                <- Nova's, empty
//     …
//     Cost = 25                      <- the author's, preserved
//     Available = { has_war = no }
//
// Two cost keys and two available blocks in one decision. Which one HOI4 honours decides whether it costs
// 25 political power and requires peace, or costs nothing and is always available.
//
// Three coordinated changes, for the same reason as the event fix — reading it without managing it leaves
// the duplicate, and managing it without reading it deletes the value outright.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
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

const ROOTS = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
  ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
  ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
];

const decFile = (lines) => ["probe_category = {", "", "\tprobe_decision = {", ...lines, "\t}", "}", ""].join("\n");
const BODY_CAPS = [
  "\t\ticon = generic_prepare_civil_war",
  "\t\tCost = 25",
  "\t\tAvailable = {",
  "\t\t\thas_war = no",
  "\t\t}",
  "\t\tIs_good = yes",
  "\t\tcomplete_effect = {",
  "\t\t\tadd_political_power = 10",
  "\t\t}",
];
const BODY_LOWER = BODY_CAPS.map((l) => l.replace("Cost", "cost").replace("Available", "available").replace("Is_good", "is_good"));

(async () => {
  console.log("\n[ground truth] real decisions capitalise these keys");
  {
    const counts = { Cost: 0, Available: 0, Is_good: 0 };
    let files = 0;
    for (const [, root] of ROOTS) {
      const dir = path.join(root, "common", "decisions");
      if (!fs.existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const d = stack.pop();
        let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
        for (const e of ents) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { stack.push(p); continue; }
          if (!e.name.endsWith(".txt")) continue;
          let t; try { t = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
          files++;
          for (const k of Object.keys(counts)) counts[k] += (t.match(new RegExp(`(^|\\n)[ \\t]*${k}\\s*=`, "g")) || []).length;
        }
      }
    }
    console.log(`     across ${files} decision files: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    if (!files) rec("no corpus installed — the ground-truth check is skipped", true, "");
    else rec("⭐ real content uses the capitalised keys", counts.Cost + counts.Available + counts.Is_good >= 20, counts);
  }

  const PORT = 53483, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dec-case-"));
  const decPath = path.join(mod, "common", "decisions", "probe.txt");
  try {
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Decision Case Test"\n');
    fs.mkdirSync(path.dirname(decPath), { recursive: true });

    const load = async () => {
      const list = await fetch(`${BASE}/api/decisions/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      let found = null;
      const walk = (v) => {
        if (!v || typeof v !== "object") return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (v.id === "probe_decision") { found = found || v; return; }
        Object.values(v).forEach(walk);
      };
      walk(list);
      return found;
    };
    // SEND WHAT THE CLIENT SENDS — the payload shape from public/decisions.js.
    const save = (d) => fetch(`${BASE}/api/decisions/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, categoryId: "probe_category", id: "probe_decision", fileName: "probe.txt",
        categoryIcon: "", previousId: "probe_decision", previousCategoryId: "probe_category",
        name: (d && d.name) || "Probe",
        cost: (d && d.cost) != null ? String(d.cost) : "",
        icon: (d && d.icon) || "generic_prepare_civil_war",
        days: "", fireOnce: false, available: (d && d.available) || "", modifier: "",
        effect: (d && d.effect) || "", decisionType: "decision", scope: "", cooldown: "",
        targetTrigger: "", removeEffect: "", activation: "", cancelTrigger: "", selectableMission: false,
        cancelEffect: "", targetRootTrigger: "", targetArray: "", aiHintPpCost: "", fixedRandomSeed: "",
        targetNonExisting: false, targetsDynamic: false, isGood: (d && d.isGood) || false,
        visible: "", allowed: "", aiWillDo: "",
      }),
    }).then((r) => r.json());

    console.log("\n[the capitalised keys are read]");
    fs.writeFileSync(decPath, decFile(BODY_CAPS), "utf8");
    const capD = await load();
    rec("the decision parsed", !!capD, capD);
    rec("⭐ the cost reaches the editor", capD && String(capD.cost) === "25", capD && capD.cost);
    rec("⭐ …and the availability", capD && /has_war/.test(String(capD.available || "")), capD && capD.available);

    console.log("\n[a save writes ONE of each, in the author's spelling]");
    await save(capD);
    const after = fs.readFileSync(decPath, "utf8");
    rec("⭐ exactly one cost key", (after.match(/\bcost\s*=/gi) || []).length === 1, after);
    rec("⭐ exactly one available block", (after.match(/\bavailable\s*=/gi) || []).length === 1, after);
    rec("…the cost is the author's 25, not a form default of 0", /\bCost\s*=\s*25\b/.test(after) && !/\bcost\s*=\s*0\b/.test(after), after);
    rec("…the availability still holds its trigger", /has_war\s*=\s*no/.test(after), after);
    rec("⭐ …and each key is spelled the way the file spelled it", /\bCost\s*=/.test(after) && /\bAvailable\s*=/.test(after), after);
    rec("…including Is_good", /\bIs_good\s*=/.test(after) && (after.match(/\bis_good\s*=/gi) || []).length === 1, after);

    console.log("\n[CONTROL] the ordinary lowercase form is untouched by all this");
    fs.writeFileSync(decPath, decFile(BODY_LOWER), "utf8");
    const lowD = await load();
    rec("a lowercase decision reads its cost", lowD && String(lowD.cost) === "25", lowD && lowD.cost);
    await save(lowD);
    const afterLow = fs.readFileSync(decPath, "utf8");
    rec("…and a save writes one lowercase cost", (afterLow.match(/\bcost\s*=/gi) || []).length === 1 && /(^|\n)\s*cost\s*=\s*25/.test(afterLow), afterLow);
    rec("…no capital borrowed from anywhere", !/\bCost\s*=/.test(afterLow) && !/\bAvailable\s*=/.test(afterLow), afterLow);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
  }

  console.log(`\n=== decision key keeps its case: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
