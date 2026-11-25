// #template-key-case-variant — MILLENNIUM DAWN WRITES `Support = { … }`, AND THE DESIGNER SHOWED THOSE
// TEMPLATES AS HAVING NO SUPPORT COMPANIES.
//
// The third instance of the shape behind #event-key-case-variant and #decision-key-case-variant, found the
// same way: census the top-level keys of every real block, then ask which the maker models and which it
// preserves. Across the corpus, division templates carry `Support` (4) and `Priority` (1) against 5,450 and
// 2,042 canonical ones — Millennium Dawn's GER_2000_nsb.txt and GER_2000_nonnsb.txt, on its special-forces
// and marine templates, each holding two real support companies.
//
// parseTemplate matched the key exactly, so `support` came back EMPTY. The write half is gentler than the
// event and decision cases — mergePreservedTemplateBlock treats the capitalised key as un-modelled and
// carries it forward, so an untouched save and even a rename keep it. But the designer showed a template
// that HAS support companies as though it had none, and the moment the user added one:
//
//     support = { engineer = { x = 0 y = 0 } }     <- Nova's, from a list it thought was empty
//     …
//     Support = { L_Recce_Comp = { … } … }         <- the author's, preserved
//
// Two support blocks in one template. Which one HOI4 honours decides whether the division gets a recce
// company and a helicopter CSS, or one engineer company.
//
// ⭐ Scope is exactly the template path, because that is what the corpus shows: real `division = { }` blocks
// have ZERO case variants across all 58,548 of them, so the division reader is deliberately left alone.
"use strict";
const fs = require("fs");
const path = require("path");
const U = require("./unit-data.js");

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

const ROOTS = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
  ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
  ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
];

const FILE = [
  "division_template = {",
  '\tname = "GER Spezialkraefte"',
  "\tdivision_names_group = GER_SOF_01",
  "\tregiments = {",
  "\t\tSpecial_Forces = { x = 0 y = 0 }",
  "\t}",
  "\tSupport = {",
  "\t\tL_Recce_Comp = { x = 0 y = 0 }",
  "\t\thelicopter_combat_service_support = { x = 0 y = 1 }",
  "\t}",
  "\tPriority = 2",
  "}",
  "units = {",
  '\tdivision = { name = "1st" location = 100 division_template = "GER Spezialkraefte" }',
  "}",
  "",
].join("\n");

const modelOf = (t, over) => Object.assign({
  name: t.name, regiments: t.regiments, support: t.support, priority: t.priority,
  division_names_group: t.division_names_group, _origName: t.name,
}, over || {});
const saveWith = (tpl) => {
  const p = U.parseUnitsFile(FILE);
  return U.mergeOob(FILE, {
    templates: [tpl],
    divisions: (p.units.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] })),
  });
};

console.log("\n[ground truth] real templates capitalise these keys");
{
  let sup = 0, pri = 0, files = 0;
  const where = [];
  for (const [label, root] of ROOTS) {
    const dir = path.join(root, "history", "units");
    let names = []; try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
    for (const n of names) {
      let t; try { t = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      const s = (t.match(/(^|\n)[ \t]*Support\s*=\s*\{/g) || []).length;
      const p = (t.match(/(^|\n)[ \t]*Priority\s*=/g) || []).length;
      if (s || p) { files++; sup += s; pri += p; if (where.length < 4) where.push(`${label}/${n}`); }
    }
  }
  console.log(`     Support ${sup}, Priority ${pri}, across ${files} files: ${where.join(", ")}`);
  if (!files) rec("no corpus installed — the ground-truth check is skipped", true, "");
  else rec("⭐ real content writes the capitalised key", sup >= 2, { sup, pri, where });
}

console.log("\n[the capitalised key is read]");
const parsed = U.parseUnitsFile(FILE);
const tpl = (parsed.templates || [])[0];
{
  rec("the template parsed", !!tpl, tpl);
  // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY.
  rec("…and the fixture really does capitalise it", /(^|\n)\t*Support\s*=/.test(FILE), "");
  rec("⭐ both support companies reach the designer", tpl && (tpl.support || []).length === 2, tpl && tpl.support);
  rec("…by name", tpl && (tpl.support || []).map((s) => s.unit).join(",") === "L_Recce_Comp,helicopter_combat_service_support", tpl && tpl.support);
  rec("⭐ …and the capitalised Priority too", tpl && Number(tpl.priority) === 2, tpl && tpl.priority);
  rec("CONTROL: the regiments were never affected", tpl && (tpl.regiments || []).length === 1, tpl && tpl.regiments);
}

console.log("\n[a save that changes nothing changes nothing]");
{
  const noop = saveWith(modelOf(tpl));
  rec("⭐ byte-identical", noop === FILE, JSON.stringify(noop.slice(0, 200)));
}

console.log("\n[adding a company keeps the ones that were already there]");
{
  const out = saveWith(modelOf(tpl, { support: (tpl.support || []).concat([{ unit: "engineer", x: 0, y: 2 }]), _dirty: true }));
  rec("⭐ exactly one support block", (out.match(/\bsupport\s*=\s*\{/gi) || []).length === 1, out);
  rec("⭐ …holding all three companies",
    ["L_Recce_Comp", "helicopter_combat_service_support", "engineer"].every((u) => out.includes(u)), out);
  rec("…spelled the way the author wrote it", /(^|\n)\t*Support\s*=/.test(out) && !/(^|\n)\t*support\s*=/.test(out), out);
  rec("…and Priority keeps its capital too", /(^|\n)\t*Priority\s*=/.test(out), out);
}

console.log("\n[CONTROL] the ordinary lowercase form is untouched by all this");
{
  const LOW = FILE.replace("\tSupport = {", "\tsupport = {").replace("\tPriority = 2", "\tpriority = 2");
  const p = U.parseUnitsFile(LOW);
  const t = (p.templates || [])[0];
  rec("a lowercase template reads its companies", t && (t.support || []).length === 2, t && t.support);
  const out = U.mergeOob(LOW, {
    templates: [modelOf(t, { support: (t.support || []).concat([{ unit: "engineer", x: 0, y: 2 }]), _dirty: true })],
    divisions: (p.units.divisions || []).map((d) => ({ name: d.name, location: d.location, template: d.template, forceVariants: [] })),
  });
  rec("…and a save writes one lowercase block", (out.match(/\bsupport\s*=\s*\{/gi) || []).length === 1 && /(^|\n)\t*support\s*=/.test(out), out);
  rec("…no capital borrowed from anywhere", !/(^|\n)\t*Support\s*=/.test(out), out);
}

console.log("\n[RUN IT] every real template, no-edit");
{
  let files = 0, templates = 0, differed = 0, capitalised = 0;
  const examples = [];
  for (const [label, root] of ROOTS) {
    const dir = path.join(root, "history", "units");
    let names = []; try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
    for (const n of names) {
      let t; try { t = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
      let p; try { p = U.parseUnitsFile(t); } catch (_) { continue; }
      if (!(p.templates || []).length) continue;
      files++;
      for (const x of p.templates) {
        templates++;
        if (x._raw && /(^|\n)[ \t]*(Support|Priority)\s*=/.test(x._raw)) capitalised++;
      }
      // A no-edit save of the whole file must not change a byte.
      let out;
      try {
        out = U.mergeOob(t, {
          templates: (p.templates || []).map((x) => modelOf(x)),
          divisions: (p.units.divisions || []).map((d) => ({
            name: d.name, location: d.location, template: d.template, officer: d.officer, officerExtra: d.officerExtra,
            equipmentFactor: d.equipmentFactor, experience: d.experience, manpowerFactor: d.manpowerFactor,
            forceVariants: d.forceVariants, owner: d.owner, divisionName: d.divisionName,
          })),
        });
      } catch (_) { continue; }
      if (out !== t) { differed++; if (examples.length < 4) examples.push(`${label}/${n}`); }
    }
  }
  console.log(`     ${files} files · ${templates} templates · ${capitalised} with a capitalised key · files a no-edit save changed ${differed}`);
  rec("the corpus (or at least the fixture) was read", templates >= 1, templates);
  // ⭐ ASSERT THE CORPUS CONTAINS THE SHAPE, or the run proves nothing about it.
  if (files) rec("CONTROL: the corpus really holds capitalised templates", capitalised >= 2, capitalised);
  rec("RUN: ⭐ a no-edit save changes no file", differed === 0, { differed, examples });
}

console.log(`\n=== template key keeps its case: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
