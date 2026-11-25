// Saving a technology must not quietly rewrite the parts of it the editor doesn't model.
//
// Three fidelity losses, all triggered by nothing more than dragging a tech one slot:
//   1. #keep-tech-comments  — the parser stripped `#` comments before reading a tech block (a strip
//      that is load-bearing for @variable resolution), so a modder's inline note inside a block that
//      round-trips through extraScript — `Special_Forces ##Still enabled here` in Millennium Dawn's
//      infantry_weapons — came back as a bare `Special_Forces`.
//   2. the serializer re-indented every extraScript line to exactly two tabs, flattening a 30-entry
//      `enable_subunits = { ... }` so its contents sat at the same depth as the key owning them.
//   3. #keep-position-vars — mods author rows and years as variables (`x = @row1 y = @1965`, defined
//      once at the top of the file). Resolving them to literals on save is numerically identical but
//      opts the edited tech out of the modder's shared layout: change @row1 later and it stays put.
//
// A save of an UNCHANGED tech now preserves every line verbatim (key order is normalised — the
// serializer rebuilds the block from its model and appends extraScript last — but no line is added,
// dropped or altered). A save of a MOVED tech writes a literal for the axis that moved and keeps the
// variable on the axis that didn't.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fidelity-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Fidelity"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });

// Shaped exactly like Millennium Dawn's infantry.txt: @variables declared inside `technologies = {`,
// positions referencing them, and a nested block carrying an inline comment.
const FILE = path.join(tdir, "infantry.txt");
const ORIGINAL = [
  "technologies = {",
  "",
  "\t@1965 = 0",
  "\t@1970 = 2",
  "\t@row1 = -2",
  "\t@row2 = 0",
  "",
  "\tprobe_weapons = {",
  "\t\tenable_equipment_modules = {",
  "\t\t\tafv_machine_gun",
  "\t\t\tadditional_mg",
  "\t\t}",
  "\t\tenable_subunits = {",
  "\t\t\tMech_Inf_Bat",
  "\t\t\tinfantry",
  "\t\t\tSpecial_Forces ##Still enabled here. Spec Ops tree improves stats of the special forces",
  "\t\t\tcombat_service_support_company",
  "\t\t}",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1965",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = @row1 y = @1965 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const rd = () => fs.readFileSync(FILE, "utf8");
const blockOf = (text, id) => {
  const m = new RegExp(`^\\t${id}\\s*=\\s*\\{`, "m").exec(text);
  if (!m) return null;
  let d = 0, i = text.indexOf("{", m.index), s = i;
  for (; i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) break; } }
  return text.slice(s + 1, i);
};

const PORT = 39574, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const save = (t) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: [t], equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const t = (cat.technologies || []).find((x) => x.id === "probe_weapons");
    ok("the tech is in the catalog", !!t);
    if (!t) throw new Error("no tech");

    // ── parse ─────────────────────────────────────────────────────────────────────────────────────
    const es = String(t.extraScript || "");
    ok("the @variables resolve to real numbers", t.x === -2 && t.y === 0, { x: t.x, y: t.y });
    ok("extraScript keeps the inline ## comment", /##Still enabled here/.test(es), es.slice(0, 200));
    ok("extraScript keeps the nested indentation", /\n\t\t\t\S/.test(es));
    ok("the @variable tokens are carried for the writer", t.posVarX && t.posVarX.token === "@row1" && t.posVarY && t.posVarY.token === "@1965", { x: t.posVarX, y: t.posVarY });

    // ── save with nothing changed ─────────────────────────────────────────────────────────────────
    const r1 = await save(t);
    ok("unchanged save → 200", r1.s === 200, r1.b);
    // The serializer rebuilds a block from the model, so key ORDER is normalised (extraScript is
    // appended after the modelled keys). Every line must still be there, unchanged, exactly once.
    const lineBag = (s) => s.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim()).sort().join("\n");
    ok("an unchanged save preserves every line verbatim", lineBag(rd()) === lineBag(ORIGINAL), lineBag(rd()) === lineBag(ORIGINAL) ? "" : rd());
    ok("an unchanged save does not change the line count", rd().split("\n").filter((l) => l.trim()).length === ORIGINAL.split("\n").filter((l) => l.trim()).length);
    const b1 = blockOf(rd(), "probe_weapons");
    ok("the comment survived the save", /##Still enabled here/.test(b1), b1);
    const subunits = (blk) => {
      const m = /enable_subunits\s*=\s*\{([\s\S]*?)\n\t\t\}/.exec(blk);
      return m ? m[1].split("\n").filter((l) => /^\t\t\t\S/.test(l)) : [];
    };
    ok("the sub-unit entries kept their 3-tab depth", subunits(b1).length === 4, subunits(b1));
    ok("the position still uses the variables", /position = \{ x = @row1 y = @1965 \}/.test(b1), b1);

    // ── move on one axis only ─────────────────────────────────────────────────────────────────────
    const cat2 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const t2 = (cat2.technologies || []).find((x) => x.id === "probe_weapons");
    const r2 = await save(Object.assign({}, t2, { x: t2.x + 1 }));
    ok("move → 200", r2.s === 200, r2.b);
    const b2 = blockOf(rd(), "probe_weapons");
    ok("the MOVED axis is written as a literal", /x = -1\b/.test(b2), b2);
    ok("the UNMOVED axis keeps its variable", /y = @1965/.test(b2), b2);
    ok("the comment still survives after a move", /##Still enabled here/.test(b2));
    ok("the @variable declarations at the top are untouched", /^\t@row1 = -2$/m.test(rd()) && /^\t@1965 = 0$/m.test(rd()));

    // ── a moved tech that comes back to its original slot re-adopts the variable ───────────────────
    const cat3 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const t3 = (cat3.technologies || []).find((x) => x.id === "probe_weapons");
    ok("after the move the x variable is dropped from the model", !t3.posVarX, t3.posVarX);
    ok("the y variable is still carried", t3.posVarY && t3.posVarY.token === "@1965", t3.posVarY);

    console.log(`\ntest-research-block-fidelity: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 16 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
