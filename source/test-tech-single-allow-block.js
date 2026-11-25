// #two-allow-blocks-when-or-prereq-meets-authored-gate — A TECHNOLOGY GOT TWO `allow` BLOCKS AND ONLY ONE
// OF THE RULES IT ASKED FOR.
//
// Nova generates an `allow` gate for an OR prerequisite across non-mod parents, and the modder's own gate
// comes back verbatim through extraScript. A technology that already said
//     allow = { has_dlc = "No Step Back" }
// and then gained an OR prerequisite was written with BOTH blocks, side by side. A technology holds ONE
// `allow` trigger, so only one survives: either the DLC restriction or the prerequisite is enforced, and
// which one is parse-order roulette. The modder asked for both.
//
// Not a shape real content ever uses: parsing every technology block in vanilla (552) and Millennium Dawn
// (988), 0 of 1,540 declare `allow` more than once. Vanilla stacks conditions inside one gate.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-1allow-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const MOD = path.join(ROOT, "orprobe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Or"\nsupported_version="1.19.*"\n', "utf8");
const F = path.join(MOD, "common", "technologies", "nova_orprobe.txt");
const SEED = [
  "technologies = {",
  "\tor_probe_child = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tallow = {",
  '\t\t\thas_dlc = "No Step Back"',
  "\t\t}",
  "\t\tfolder = { name = infantry_folder position = { x = 18 y = 0 } }",
  "\t\tcategories = { infantry_weapons }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(F, SEED, "utf8");
const read = () => fs.readFileSync(F, "utf8");
const allowCount = (t) => (t.match(/(^|\n)\s*allow\s*=\s*\{/g) || []).length;

const PORT = 43545;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] no real technology declares `allow` twice");
    let techs = 0, dupes = 0;
    for (const root of ["D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
      "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(path.join(root, "common", "technologies", f), "utf8"); } catch (_) { continue; }
        t = t.replace(/#[^\n]*/g, "");
        // depth-1 blocks inside `technologies = { … }` are the technologies themselves
        for (const m of t.matchAll(/(^|\n)\t([A-Za-z0-9_]+)\s*=\s*\{/g)) {
          const open = t.indexOf("{", m.index);
          let d = 0, close = -1;
          for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { close = i; break; } } }
          if (close < 0) continue;
          techs++;
          if ((t.slice(open + 1, close).match(/(^|\n)\t\tallow\s*=\s*\{/g) || []).length > 1) dupes++;
        }
      }
    }
    rec("both technology corpora were readable", techs > 1000, techs);
    rec("…and NOT ONE technology declares `allow` more than once", dupes === 0, { techs, dupes });

    console.log("\n[the bug] an OR prerequisite must join the author's gate, not sit beside it");
    rec("the fixture starts with one allow block", allowCount(SEED) === 1, allowCount(SEED));
    const c = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`);
    const t = (c.b.technologies || c.b.techs || []).find((x) => x.id === "or_probe_child");
    rec("the technology read back", !!t, (c.b.technologies || []).map((x) => x.id).slice(0, 5));
    rec("…with the author's gate preserved as extra script",
      /has_dlc/.test(String((t || {}).extraScript || "")), (t || {}).extraScript);
    const r = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: [Object.assign({}, t, { prerequisites: [{ type: "OR", techs: ["tech_mountaineers", "tech_recon"] }] })],
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("there is exactly ONE allow block", allowCount(read()) === 1, { count: allowCount(read()), file: read() });
    rec("…and it holds the OR prerequisite", /OR\s*=\s*\{[\s\S]*?has_tech\s*=\s*tech_mountaineers/.test(read()), read());
    rec("…AND the author's DLC gate", /has_dlc = "No Step Back"/.test(read()), read());
    rec("…and the file is brace-balanced",
      (read().match(/\{/g) || []).length === (read().match(/\}/g) || []).length, read());

    console.log("\n[control] a second save is stable — the merge must not re-nest or duplicate");
    const c2 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`);
    const t2 = (c2.b.technologies || c2.b.techs || []).find((x) => x.id === "or_probe_child");
    await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [], technologies: [t2],
    });
    rec("still exactly one allow block", allowCount(read()) === 1, { count: allowCount(read()), file: read() });
    rec("…still holding both conditions",
      /has_tech\s*=\s*tech_mountaineers/.test(read()) && /has_dlc = "No Step Back"/.test(read()), read());
    const after2 = read();
    const c3 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`);
    const t3 = (c3.b.technologies || c3.b.techs || []).find((x) => x.id === "or_probe_child");
    await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [], technologies: [t3],
    });
    rec("…and a third save changes nothing at all", read() === after2, { a: after2, b: read() });

    console.log("\n[control] a technology with ONE allow block is untouched");
    const G = path.join(MOD, "common", "technologies", "nova_single.txt");
    fs.writeFileSync(G, [
      "technologies = {",
      "\tsingle_gate_tech = {",
      "\t\tresearch_cost = 1",
      "\t\tallow = {",
      '\t\t\thas_dlc = "By Blood Alone"',
      "\t\t}",
      "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const c4 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}`);
    const t4 = (c4.b.technologies || c4.b.techs || []).find((x) => x.id === "single_gate_tech");
    const r4 = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [], technologies: [t4],
    });
    rec("the save succeeded", r4.s === 200 && !r4.b.error, r4.b || r4.s);
    const single = fs.readFileSync(G, "utf8");
    rec("it still has exactly one allow block", allowCount(single) === 1, single);
    rec("…with its condition intact", /has_dlc = "By Blood Alone"/.test(single), single);

    console.log(`\n=== technology single allow block: ${checks} checks, ${fails.length} failed ===`);
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
