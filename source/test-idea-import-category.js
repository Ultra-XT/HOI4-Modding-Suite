// #import-forces-country-category / #import-reindents-forever
//
// Importing an idea wrote it under `country = { }` whatever category it actually had, because the file
// builder took ONE category for the whole file and the import caller never passed the source's. In HOI4 that
// makes an advisor-slot idea (naval_command_spirit, political_advisor…) a permanent national spirit instead —
// a different game object under the same id, still carrying its now-meaningless ledger and slot keys.
//
// The same builder also re-indented every previously imported block by two more tabs on each import, because
// the text it reads back already carries the indent it added last time. Measured on a real import: 6 tabs
// after the first, 8 after the second, 10 after the third, drifting right without bound.
//
// Hermetic: a fake SOURCE mod supplies the ideas, so no corpus is read.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-import-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}

// The mod being imported INTO.
const MOD = path.join(ROOT, "targetmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TargetMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod being imported FROM — ideas in three different categories.
const SRC = path.join(ROOT, "sourcemod");
fs.mkdirSync(path.join(SRC, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(SRC, "descriptor.mod"), 'name="SourceMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(SRC, "common", "ideas", "src_ideas.txt"), [
  "ideas = {",
  "\tnaval_command_spirit = {",
  "\t\tnua_admiral_idea = {",
  "\t\t\tledger = navy",
  "\t\t\tallowed = {",
  "\t\t\t\talways = yes",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "\tpolitical_advisor = {",
  "\t\tnua_advisor_idea = {",
  "\t\t\tcost = 150",
  "\t\t}",
  "\t}",
  "\tcountry = {",
  "\t\tnua_country_idea = {",
  "\t\t\tremoval_cost = -1",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const IMPORTED = path.join(MOD, "common", "ideas", "focus_editor_imported_ideas.txt");

const PORT = 42191;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importIdea = async (ideaId) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, ideaId, sourceModRoot: SRC }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const text = () => (fs.existsSync(IMPORTED) ? fs.readFileSync(IMPORTED, "utf8") : "");
  // Which container is this idea nested inside?
  const categoryOf = (id) => {
    const t = text();
    const at = t.indexOf(`${id} = {`);
    if (at === -1) return null;
    const before = t.slice(0, at);
    const cats = [...before.matchAll(/\n\t([A-Za-z_][A-Za-z0-9_]*) = \{/g)];
    return cats.length ? cats[cats.length - 1][1] : null;
  };
  const deepestIndent = (id) => {
    const t = text();
    const at = t.indexOf(`${id} = {`);
    if (at === -1) return -1;
    const seg = t.slice(at, at + 400);
    let max = 0;
    for (const line of seg.split("\n")) {
      if (!line.trim()) continue;
      const n = (line.match(/^\t*/) || [""])[0].length;
      if (n > max) max = n;
    }
    return max;
  };

  try {
    console.log("\n[category] each idea keeps the category it had at the source");
    const a = await importIdea("nua_admiral_idea");
    rec("the advisor-slot idea imported", a.status === 200 && a.body && a.body.ok !== false, a.body || a.status);
    rec("…under naval_command_spirit, not country", categoryOf("nua_admiral_idea") === "naval_command_spirit",
      { got: categoryOf("nua_admiral_idea"), file: text().slice(0, 300) });

    const b = await importIdea("nua_advisor_idea");
    rec("a political_advisor idea imported", b.status === 200 && b.body && b.body.ok !== false, b.body || b.status);
    rec("…under political_advisor", categoryOf("nua_advisor_idea") === "political_advisor",
      { got: categoryOf("nua_advisor_idea"), file: text() });

    const c = await importIdea("nua_country_idea");
    rec("a country idea imported", c.status === 200 && c.body && c.body.ok !== false, c.body || c.status);
    rec("…under country", categoryOf("nua_country_idea") === "country", categoryOf("nua_country_idea"));

    rec("the earlier imports kept their categories",
      categoryOf("nua_admiral_idea") === "naval_command_spirit" &&
      categoryOf("nua_advisor_idea") === "political_advisor", text());
    rec("the file is brace-balanced",
      (text().match(/\{/g) || []).length === (text().match(/\}/g) || []).length,
      { open: (text().match(/\{/g) || []).length, close: (text().match(/\}/g) || []).length });

    console.log("\n[indentation] repeated imports must not drift right");
    const after3 = deepestIndent("nua_admiral_idea");
    await importIdea("nua_advisor_idea");
    await importIdea("nua_country_idea");
    const after5 = deepestIndent("nua_admiral_idea");
    rec("the first import's indentation is unchanged after two more imports", after3 === after5,
      { after3, after5 });
    rec("…and is a sane depth, not runaway", after5 > 0 && after5 <= 6, after5);

    console.log("\n[content] the imported block kept its own keys");
    rec("the ledger survived", /ledger = navy/.test(text()), text().slice(0, 400));
    rec("a nested block survived", /always = yes/.test(text()), text().slice(0, 400));

    console.log(`\n=== idea import category + indent: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
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
