// #designer-slot-change-silent-noop — CHANGING A COMPANY'S SLOT DID NOTHING, AND SAID IT HAD WORKED.
//
// The enclosing category block is what MAKES a designer idea a tank designer rather than a ship designer —
// it is not a label. Vanilla's common/ideas/zzz_generic.txt nests each company inside its slot:
//     ideas = { tank_manufacturer = { designer = yes  <company> = { … } }  naval_manufacturer = { … } }
//
// The slot dropdown is a real, visible control in designer mode. Changing it and saving returned
// {"ok":true,…}, left common/ideas byte-identical, and re-opening the company still reported the old slot:
// the edit path updates the block where it already sits, and `category` was consulted only when creating one.
// A user who converted a tank designer to a naval one shipped a mod that still offers it in the tank slot.
//
// The move is surgical rather than a whole-file rebuild. buildImportedIdeasFileText would group correctly but
// also re-indent and reorder every OTHER block in the user's own file, which is not what "change this one
// company's slot" asked for.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slot-"));
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

const MOD = path.join(ROOT, "slot");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Slot"\nsupported_version="1.19.*"\n', "utf8");

const IDEAS = path.join(MOD, "common", "ideas", "custom_ideas.txt");
const SEED = [
  "ideas = {",
  "\ttank_manufacturer = {",
  "\t\tdesigner = yes",
  "",
  "\t\tnv_novagrad_works = {",
  "\t\t\tpicture = generic_tank_manufacturer_1",
  "\t\t\tallowed = { original_tag = GER }",
  "\t\t\tresearch_bonus = { armor = 0.15 }",
  "\t\t\ttraits = { tank_manufacturer }",
  "\t\t}",
  "",
  "\t\tnv_other_works = {",
  "\t\t\tpicture = generic_tank_manufacturer_2",
  "\t\t\ttraits = { tank_manufacturer }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(IDEAS, SEED, "utf8");

const read = () => fs.readFileSync(IDEAS, "utf8");
// Which container holds `id`? Walk the containers and ask each one.
const containerOf = (text, id) => {
  const matchBrace = (s, i) => { let d = 0; for (; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
  const im = /(^|\n)\s*ideas\s*=\s*\{/.exec(text);
  if (!im) return "";
  const s0 = text.indexOf("{", im.index);
  const inner = text.slice(s0 + 1, matchBrace(text, s0));
  const re = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const s = inner.indexOf("{", m.index);
    const e = matchBrace(inner, s);
    if (e < 0) break;
    re.lastIndex = e;
    if (new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).test(inner.slice(s + 1, e))) return m[2];
  }
  return "";
};

const PORT = 43533;
const srv = createApp().listen(PORT, async () => {
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const save = (cat) => post("/api/ideas/upsert-definition", {
    modPath: MOD, mode: "edit", category: cat,
    targetRelativeFile: "common/ideas/custom_ideas.txt",
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    ideaId: "nv_novagrad_works", name: "Novagrad Works", desc: "",
    picture: "generic_tank_manufacturer_1", traits: "tank_manufacturer",
    selectedEffects: ["research_bonus = {\n\tarmor = 0.15\n}", "allowed = {\n\toriginal_tag = GER\n}"],
  });

  try {
    console.log("\n[ground truth] the container IS the slot");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    let gen = "";
    try { gen = fs.readFileSync(path.join(V, "common", "ideas", "zzz_generic.txt"), "utf8"); } catch (_) {}
    rec("vanilla's generic companies file was readable", gen.length > 1000, gen.length);
    rec("…and it nests companies inside slot containers",
      /tank_manufacturer\s*=\s*\{[\s\S]*?designer\s*=\s*yes/.test(gen)
      && /naval_manufacturer\s*=\s*\{[\s\S]*?designer\s*=\s*yes/.test(gen), "shape not found");

    console.log("\n[the fixture] the company starts in the tank slot");
    rec("nv_novagrad_works is under tank_manufacturer", containerOf(SEED, "nv_novagrad_works") === "tank_manufacturer",
      containerOf(SEED, "nv_novagrad_works"));

    console.log("\n[the bug] changing the slot must MOVE the block");
    const r = await save("naval_manufacturer");
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the company is now under naval_manufacturer",
      containerOf(read(), "nv_novagrad_works") === "naval_manufacturer", { got: containerOf(read(), "nv_novagrad_works"), file: read() });
    rec("…and the new container carries the designer flag",
      /naval_manufacturer\s*=\s*\{[\s\S]*?designer\s*=\s*yes/.test(read()), read());
    rec("…the company kept its own content", /research_bonus/.test(read()) && /armor\s*=\s*0\.15/.test(read()), read());
    rec("…it is defined exactly ONCE", (read().match(/nv_novagrad_works\s*=\s*\{/g) || []).length === 1, read());
    rec("…its SIBLING stayed in the tank slot", containerOf(read(), "nv_other_works") === "tank_manufacturer",
      { got: containerOf(read(), "nv_other_works"), file: read() });
    rec("…and the file is brace-balanced",
      (read().match(/\{/g) || []).length === (read().match(/\}/g) || []).length, read());

    console.log("\n[control] moving it back works too");
    const r2 = await save("tank_manufacturer");
    rec("the save succeeded", r2.s === 200 && !r2.b.error, r2.b || r2.s);
    rec("it is back under tank_manufacturer", containerOf(read(), "nv_novagrad_works") === "tank_manufacturer",
      { got: containerOf(read(), "nv_novagrad_works"), file: read() });
    rec("…still exactly once", (read().match(/nv_novagrad_works\s*=\s*\{/g) || []).length === 1, read());

    console.log("\n[control] a save that does NOT change the slot must not shuffle the file");
    const before = read();
    const r3 = await save("tank_manufacturer");
    rec("the save succeeded", r3.s === 200 && !r3.b.error, r3.b || r3.s);
    rec("the company is still where it was", containerOf(read(), "nv_novagrad_works") === "tank_manufacturer",
      containerOf(read(), "nv_novagrad_works"));
    rec("…and its sibling has not moved either", containerOf(read(), "nv_other_works") === "tank_manufacturer",
      containerOf(read(), "nv_other_works"));
    rec("…and nothing was duplicated",
      (read().match(/nv_novagrad_works\s*=\s*\{/g) || []).length === 1
      && (read().match(/nv_other_works\s*=\s*\{/g) || []).length === 1, read());

    console.log(`\n=== designer slot move: ${checks} checks, ${fails.length} failed ===`);
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
