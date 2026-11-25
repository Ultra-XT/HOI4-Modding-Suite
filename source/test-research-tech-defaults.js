// Saving must not turn a field a tech OMITS into an explicit setting (#no-invented-tech-fields), and
// annotations on its equipment list must survive (#keep-enable-equip-raw).
//
// research_cost and start_year are the only two tech fields the parser invents a value for when the
// block doesn't declare them (1 and 1936). The writer emitted them unconditionally, so a re-save stamped
// `start_year = 1936` onto every tech that had deliberately left it out — 81 in vanilla, 55 in
// Millennium Dawn. In a mod whose tree begins in 1965 that hands the tech its ahead-of-time discount
// from the first day of the game.
//
// The same pass found trailing notes being dropped from enable_equipments; Millennium Dawn has 20 live
// ones, several reading `#not created`.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tdef-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="TechDefaults"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });

const FILE = path.join(tdir, "probe.txt");
const ORIGINAL = [
  "technologies = {",
  // declares NEITHER research_cost NOR start_year — like MD's SP_Anti_Air_* and vanilla's mountain_tanks
  "\tbare_tech = {",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  // declares both
  "\tfull_tech = {",
  "\t\tresearch_cost = 2.5",
  "\t\tstart_year = 1965",
  "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
  "\t}",
  // an annotated equipment list
  "\tequip_tech = {",
  "\t\tenable_equipments = {",
  "\t\t\thelicopter_a #not created",
  "\t\t\thelicopter_b",
  "\t\t}",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1970",
  "\t\tfolder = { name = infantry_folder position = { x = 4 y = 0 } }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const rd = () => fs.readFileSync(FILE, "utf8");
const blockOf = (id) => {
  const t = rd();
  const m = new RegExp(`(?:^|\\n)\\t${id}\\s*=\\s*\\{`).exec(t);
  if (!m) return "";
  let d = 0, i = t.indexOf("{", m.index), s = i;
  for (; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) break; } }
  return t.slice(s + 1, i);
};

const PORT = 39581, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const save = (t) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: [t], equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const load = async (id) => (await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).technologies.find((t) => t.id === id);
  try {
    const bare = await load("bare_tech");
    ok("the bare tech is in the catalog", !!bare);
    ok("it still gets display defaults", bare.researchCost === 1 && bare.startYear === 1936, { c: bare.researchCost, y: bare.startYear });
    ok("the parser records that it declared neither",
      bare.authoredFields && bare.authoredFields.research_cost === false && bare.authoredFields.start_year === false, bare.authoredFields);

    const r1 = await save(bare);
    ok("save → 200", r1.s === 200, r1.b);
    ok("no start_year was invented (the fix)", !/\bstart_year\s*=/.test(blockOf("bare_tech")), blockOf("bare_tech"));
    ok("no research_cost was invented", !/\bresearch_cost\s*=/.test(blockOf("bare_tech")), blockOf("bare_tech"));
    ok("its folder placement is still written", /position = \{ x = 0 y = 0 \}/.test(blockOf("bare_tech")), blockOf("bare_tech"));

    // a tech that DOES declare them keeps them at their own values
    const full = await load("full_tech");
    ok("a declaring tech is marked authored",
      full.authoredFields && full.authoredFields.research_cost === true && full.authoredFields.start_year === true, full.authoredFields);
    const r2 = await save(full);
    ok("save → 200", r2.s === 200, r2.b);
    ok("an authored research_cost is kept", /\bresearch_cost\s*=\s*2\.5\b/.test(blockOf("full_tech")), blockOf("full_tech"));
    ok("an authored start_year is kept", /\bstart_year\s*=\s*1965\b/.test(blockOf("full_tech")), blockOf("full_tech"));

    // a user who actually SETS the field on a bare tech gets it written
    const bare2 = await load("bare_tech");
    const r3 = await save(Object.assign({}, bare2, { startYear: 1975, researchCost: 4 }));
    ok("save → 200", r3.s === 200, r3.b);
    ok("a start_year the user set IS written", /\bstart_year\s*=\s*1975\b/.test(blockOf("bare_tech")), blockOf("bare_tech"));
    ok("a research_cost the user set IS written", /\bresearch_cost\s*=\s*4\b/.test(blockOf("bare_tech")), blockOf("bare_tech"));

    // enable_equipments annotations survive an unchanged save
    const eq = await load("equip_tech");
    ok("the equipment list parsed correctly", JSON.stringify(eq.enableEquipments) === JSON.stringify(["helicopter_a", "helicopter_b"]), eq.enableEquipments);
    ok("its raw text is carried", typeof eq.enableEquipmentsRaw === "string" && /#not created/.test(eq.enableEquipmentsRaw), eq.enableEquipmentsRaw);
    const r4 = await save(eq);
    ok("save → 200", r4.s === 200, r4.b);
    ok("the annotation survives", /helicopter_a #not created/.test(blockOf("equip_tech")), blockOf("equip_tech"));
    ok("both equipments are still listed", /helicopter_a/.test(blockOf("equip_tech")) && /helicopter_b/.test(blockOf("equip_tech")));

    // editing the list rebuilds it without re-emitting the stale text
    const eq2 = await load("equip_tech");
    const r5 = await save(Object.assign({}, eq2, { enableEquipments: ["helicopter_a", "helicopter_b", "helicopter_c"] }));
    ok("edited save → 200", r5.s === 200, r5.b);
    ok("the added equipment is written", /helicopter_c/.test(blockOf("equip_tech")), blockOf("equip_tech"));
    ok("helicopter_a appears exactly once", (blockOf("equip_tech").match(/helicopter_a/g) || []).length === 1, blockOf("equip_tech"));

    ok("the file is still brace-balanced", (() => { const s = rd().replace(/#.*$/gm, ""); return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length; })());

    console.log(`\ntest-research-tech-defaults: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
