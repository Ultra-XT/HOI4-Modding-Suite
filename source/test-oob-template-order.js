// #oob-template-after-units — mergeOob appended a NEW division_template AFTER the `units` block that already
// sat in the file, so a division inside units referenced a template defined later in the same file.
//
// Nothing in real content is shaped that way, which is the whole argument for calling it wrong: 0 of 609
// vanilla OOB files, 0 of 924 Millennium Dawn files, and 0 of 6,443 files across vanilla plus six installed
// workshop mods contain such a forward reference.
//
// It only bites on the SECOND save, which is the ordinary path: save one writes templates then units,
// correctly; save two adds a template and it lands at the bottom.
//
// The model is seeded as real PDX and read back through GET /api/army rather than hand-built. The first
// version of this test guessed the `regiments` payload shape wrong, every save was refused with 400, and two
// checks then passed vacuously against an empty file.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobord-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "oobmod");
fs.mkdirSync(path.join(MOD, "history", "units"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OobMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "TST - Testland.txt"), 'capital = 1\noob = "TST_1936"\n', "utf8");

const OOB = path.join(MOD, "history", "units", "TST_1936.txt");

const SEED = [
  "division_template = {",
  '\tname = "Line Infantry"',
  "\tregiments = {",
  "\t\tinfantry = { x = 0 y = 0 }",
  "\t}",
  "}",
  "",
  "units = {",
  "\tdivision = {",
  '\t\tname = "1. Infantry"',
  "\t\tlocation = 1",
  '\t\tdivision_template = "Line Infantry"',
  "\t\tstart_experience_factor = 0.1",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42463;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (u) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${u}`);
    return r.json().catch(() => null);
  };
  const save = async (templates, divisions, file = "TST_1936.txt") => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tag: "TST", file, templates, divisions }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = (p = OOB) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

  // offset of a top-level `units = {`, ignoring comments and quoted strings
  const unitsAt = (s) => {
    let depth = 0, inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (inQ) continue;
      if (c === "#") { const nl = s.indexOf("\n", i); if (nl === -1) break; i = nl; continue; }
      if (c === "{") { depth++; continue; }
      if (c === "}") { depth--; continue; }
      if (depth === 0 && c === "u" && /^units\s*=\s*\{/.test(s.slice(i))) return i;
    }
    return -1;
  };
  // Offset of the division_template block that actually HOLDS this name.
  //
  // NOT `division_template\s*=\s*\{[\s\S]*?name = "X"` — a non-greedy match still starts at the EARLIEST
  // possible position, so that pattern matches from the FIRST template block and spans forward to the name,
  // returning ~0 for every template in the file. Every ordering assertion then compared 0 against the units
  // offset and passed no matter where the template really was. The control caught it: injecting the original
  // bug produced NOT CAUGHT against a green test.
  const templateAt = (s, name) => {
    const re = /division_template\s*=\s*\{/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const open = s.indexOf("{", m.index);
      let d = 0, end = -1;
      for (let i = open; i < s.length; i++) {
        if (s[i] === "{") d += 1;
        else if (s[i] === "}") { d -= 1; if (d === 0) { end = i; break; } }
      }
      if (end === -1) break;
      if (new RegExp(`name\\s*=\\s*"${name}"`).test(s.slice(open, end))) return m.index;
      re.lastIndex = end;
    }
    return -1;
  };
  const copyTemplate = (t, newName) => Object.assign({}, JSON.parse(JSON.stringify(t)), { name: newName, _dirty: true });

  try {
    console.log("\n[read] seed the file and load the model Nova itself produces");
    fs.writeFileSync(OOB, SEED, "utf8");
    const a = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=TST`);
    rec("the OOB was read", Array.isArray(a && a.templates) && a.templates.length === 1, a && a.templates);
    rec("…and its division", Array.isArray(a && a.divisions) && a.divisions.length === 1, a && a.divisions);
    if (!a || !a.templates || !a.templates.length) throw new Error("could not load the seeded OOB");

    console.log("\n[baseline] the seeded file already has templates before units");
    let t = read();
    rec("the seed is templates-first", templateAt(t, "Line Infantry") < unitsAt(t),
      { tpl: templateAt(t, "Line Infantry"), units: unitsAt(t) });

    console.log("\n[save 2] adding a template to an EXISTING file — the shape that broke");
    const newTpl = copyTemplate(a.templates[0], "Mountain Rifles");
    const newDiv = Object.assign({}, JSON.parse(JSON.stringify(a.divisions[0])),
      { name: "2. Mountain", division_template: "Mountain Rifles", _dirty: true });
    let r = await save([...a.templates, newTpl], [...a.divisions, newDiv]);
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("the NEW template is present", /name = "Mountain Rifles"/.test(t), t.slice(0, 600));
    rec("the NEW template precedes the units block", templateAt(t, "Mountain Rifles") < unitsAt(t),
      { tpl: templateAt(t, "Mountain Rifles"), units: unitsAt(t), file: t });
    rec("the ORIGINAL template still precedes it too", templateAt(t, "Line Infantry") < unitsAt(t),
      { tpl: templateAt(t, "Line Infantry"), units: unitsAt(t) });
    rec("NO division references a template defined later in the file",
      (() => {
        const u = unitsAt(t);
        if (u === -1) return false;
        for (const m of t.matchAll(/division_template\s*=\s*"([^"]+)"/g)) {
          if (m.index < u) continue;                        // that is a template block's own name field
          if (templateAt(t, m[1]) > m.index) return false;  // forward reference
        }
        return true;
      })(), t);
    rec("the file is brace-balanced", (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length, t);

    console.log("\n[comments] a note attached to the units block stays attached to it");
    // Insertion must go ABOVE the comment, not between the comment and the block it describes.
    fs.writeFileSync(OOB, read().replace(/(^|\n)(units\s*=\s*\{)/, "$1# the standing army\n$2"), "utf8");
    const a2 = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=TST`);
    const third = copyTemplate(a2.templates[0], "Coastal Guard");
    r = await save([...a2.templates, third], a2.divisions.map((d) => Object.assign({}, d, { _dirty: true })));
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    t = read();
    rec("the comment is still directly above the units block",
      /#\s*the standing army\s*\n\s*units\s*=\s*\{/.test(t),
      t.slice(Math.max(0, unitsAt(t) - 140), unitsAt(t) + 40));
    rec("…and the newest template sits above that comment", templateAt(t, "Coastal Guard") < unitsAt(t),
      { tpl: templateAt(t, "Coastal Guard"), units: unitsAt(t) });

    console.log("\n[control] a file with NO units block still gets one appended");
    // Guards against a fix that only ever inserts and never appends.
    const OOB2 = path.join(MOD, "history", "units", "TST_tpl_only.txt");
    fs.writeFileSync(OOB2, [
      "division_template = {",
      '\tname = "Solo"',
      "\tregiments = {",
      "\t\tinfantry = { x = 0 y = 0 }",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const a3 = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=TST&file=TST_tpl_only.txt`);
    const soloTpl = (a3 && a3.templates && a3.templates.length ? a3.templates : [copyTemplate(a.templates[0], "Solo")]);
    const soloDiv = Object.assign({}, JSON.parse(JSON.stringify(a.divisions[0])),
      { name: "1. Solo", division_template: soloTpl[0].name, _dirty: true });
    r = await save(soloTpl, [soloDiv], "TST_tpl_only.txt");
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const t2 = read(OOB2);
    rec("a units block was created", unitsAt(t2) !== -1, t2);
    rec("…and the template still precedes it", templateAt(t2, soloTpl[0].name) < unitsAt(t2),
      { tpl: templateAt(t2, soloTpl[0].name), units: unitsAt(t2), file: t2 });

    console.log(`\n=== oob template order: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
