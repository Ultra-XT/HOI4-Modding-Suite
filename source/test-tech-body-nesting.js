// #tech-body-nesting — a block nested inside a tech's ai_will_do or modifier was flattened on save.
//
// HOI4 lets an ai_will_do carry conditional weighting:
//
//     ai_will_do = {
//         factor = 1
//         modifier = {
//             factor = 3
//             has_war = yes
//         }
//     }
//
// Nova stored that body by trimming every line, so the modifier's contents came back at the same depth as
// the modifier itself — the block read as nonsense after nothing more than dragging an unrelated tech, and
// it compounded on every subsequent save. HOI4 does not care about whitespace; the modder reading their own
// file does, and this is a file Nova rewrites constantly.
//
// The two bodies were flattened in DIFFERENT ways, which is why fixing only the writer was not enough:
// ai_will_do trimmed each line (everything to column zero), while modifier trimmed the whole string (first
// line to column zero, the rest left indented). Both are now normalised to a common base at parse time and
// re-indented from that normal form on write, so the two agree.
//
// Found by authoring real HOI4 constructs into the demo mod's techs and dragging one tech in the editor —
// the same drag-save-diff that cleared the focus tree.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-tech-nesting-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "tech_nesting_probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TechNesting"\nsupported_version="1.19.*"\n');

const FILE = path.join(MOD, "common", "technologies", "custom_technologies.txt");
const ORIGINAL = [
  "technologies = {",
  "\tzz_probe_tech = {",
  "\t\tresearch_cost = 2",
  "\t\tstart_year = 1936",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 1 y = 1 }",
  "\t\t}",
  "",
  "\t\tai_will_do = {",
  "\t\t\tfactor = 1",
  "\t\t\tmodifier = {",
  "\t\t\t\tfactor = 3",
  "\t\t\t\thas_war = yes",
  "\t\t\t}",
  "\t\t}",
  "",
  "\t\tmodifier = {",
  "\t\t\tarmy_org_factor = 0.03",
  "\t\t\ttraining_time_army_factor = -0.05",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const read = () => { try { return fs.readFileSync(FILE, "utf8"); } catch (_) { return ""; } };
const balanced = (t) => { let d = 0; for (const c of String(t).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39613, app = createApp();
const server = app.listen(PORT, async () => {
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  try {
    fs.writeFileSync(FILE, ORIGINAL, "utf8");
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const tech = (cat.technologies || cat.techs || []).find((t) => t.id === "zz_probe_tech");
    ok("the tech was read back from the mod", !!tech, Object.keys(cat).join(","));
    if (!tech) throw new Error("tech not in catalog");

    // Save it back UNCHANGED. A round trip that alters the file is the bug.
    const res = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: [tech] }),
    }).then((r) => r.json());
    await breathe();
    ok("saving it back → ok", res && (res.ok || res.success), res);

    const after = read();
    ok("the nested modifier keeps its depth", /\n\t{4}factor = 3\b/.test(after), after.slice(after.indexOf("ai_will_do"), after.indexOf("ai_will_do") + 140));
    ok("…and so does its sibling line", /\n\t{4}has_war = yes\b/.test(after), after.slice(after.indexOf("ai_will_do"), after.indexOf("ai_will_do") + 140));
    ok("…the keys around it stay at their own depth", /\n\t{3}factor = 1\b/.test(after) && /\n\t{3}modifier = \{/.test(after), after.slice(after.indexOf("ai_will_do"), after.indexOf("ai_will_do") + 140));

    // The top-level modifier block was flattened a DIFFERENT way (whole-string trim), so its first line
    // lost its indent while the rest kept theirs. Both lines must come out at the same depth.
    ok("the tech's own modifier lines share one depth",
      /\n\t{3}army_org_factor = 0\.03\b/.test(after) && /\n\t{3}training_time_army_factor = -0\.05\b/.test(after),
      after.slice(after.indexOf("modifier = {", after.indexOf("ai_will_do") + 40), after.indexOf("modifier = {", after.indexOf("ai_will_do") + 40) + 140));

    ok("…the file is still valid", balanced(after), after.slice(0, 200));
    ok("…and nothing was dropped", /ai_will_do/.test(after) && /has_war = yes/.test(after) && /army_org_factor/.test(after), after.slice(0, 300));

    // Saving a SECOND time must not drift further — the old bug compounded every save.
    const cat2 = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const tech2 = (cat2.technologies || cat2.techs || []).find((t) => t.id === "zz_probe_tech");
    await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, technologies: [tech2] }),
    }).then((r) => r.json());
    await breathe();
    ok("a second save changes nothing further", read() === after, "drifted");

    console.log("\ntest-tech-body-nesting: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 8 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
