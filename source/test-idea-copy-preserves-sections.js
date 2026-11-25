// #create-path-drops-unmodelled-idea-sections — COPYING A SPIRIT INTO YOUR MOD PRODUCED A HOLLOW ONE.
//
// "Copy an inherited spirit into my mod" and the Duplicate button both take the CREATE branch, which built
// the block from NOTHING (buildMinimalCountryIdeaBlock) and then merged in only the sections the country form
// models. Everything else in the source went missing — and for many ideas the missing part IS the idea:
//
//   AFG_renew_soviet_trade_agreement  lost `targeted_modifier = { tag = SOU license_purchase_cost = -0.30 … }`
//   AST_referendum_aviation_idea      lost `research_bonus = { air_equipment = 0.15 }`, leaving a 5%
//                                     air-base build bonus in place of what the author wrote
//   ENG_the_kings_party_idea          lost `available = { has_government = neutrality }` — its gate
//
// The user copies a spirit in order to KEEP it. The save reported success.
//
// The EDIT branch has always merged into the existing text; the create branch simply never got the same
// treatment. Seeding from the source block and merging the form's sections into it makes copy behave like
// edit: every un-modelled key survives and anything the user changed still wins. A spirit created from
// scratch has no source block and still gets the minimal one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideacp-"));
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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// The SOURCE is a scratch copy of three vanilla idea files — the real corpus is never written to.
const SRC = path.join(ROOT, "srcmod");
fs.mkdirSync(path.join(SRC, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(SRC, "descriptor.mod"), 'name="Src"\nsupported_version="1.19.*"\n', "utf8");
for (const f of ["afghanistan.txt", "australia.txt", "britain.txt"]) {
  try { fs.copyFileSync(path.join(V, "common", "ideas", f), path.join(SRC, "common", "ideas", f)); } catch (_) {}
}
const MOD = path.join(ROOT, "dest");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Dest"\nsupported_version="1.19.*"\n', "utf8");

const blockIn = (text, id) => {
  const m = new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).exec(text);
  if (!m) return "";
  const o = text.indexOf("{", m.index);
  let d = 0, c = -1;
  for (let i = o; i < text.length; i++) {
    if (text[i] === "{") d++;
    else if (text[i] === "}") { d--; if (!d) { c = i; break; } }
  }
  return c > 0 ? text.slice(o + 1, c) : "";
};
const keysOf = (block) => [...new Set([...block.matchAll(/(^|\n)\s*([a-z_]+)\s*=/g)].map((m) => m[2]))];
const readDir = (root) => {
  const d = path.join(root, "common", "ideas");
  let out = "";
  for (const f of fs.readdirSync(d)) out += fs.readFileSync(path.join(d, f), "utf8") + "\n";
  return out;
};

const PORT = 43461;
const srv = createApp().listen(PORT, async () => {
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const copy = (id) => post("/api/ideas/upsert-definition", {
    modPath: MOD, sourceRoot: SRC, category: "country",
    targetRelativeFile: "common/ideas/copied.txt",
    targetLocalizationPath: "localisation/english/copied_l_english.yml",
    ideaId: id, name: id, desc: "", selectedEffects: [],
  });

  try {
    console.log("\n[ground truth] the parts that were being dropped are the idea's actual effect");
    const srcAll = readDir(SRC);
    rec("the source files were readable", srcAll.length > 10000, srcAll.length);
    rec("AFG_renew_soviet_trade_agreement carries a targeted_modifier",
      /targeted_modifier/.test(blockIn(srcAll, "AFG_renew_soviet_trade_agreement")), "not found");
    rec("AST_referendum_aviation_idea carries a research_bonus",
      /research_bonus/.test(blockIn(srcAll, "AST_referendum_aviation_idea")), "not found");
    rec("ENG_the_kings_party_idea carries an available gate",
      /available/.test(blockIn(srcAll, "ENG_the_kings_party_idea")), "not found");

    console.log("\n[the bug] a copy must keep every key the source had");
    for (const id of ["AFG_renew_soviet_trade_agreement", "AST_referendum_aviation_idea", "ENG_the_kings_party_idea"]) {
      const before = keysOf(blockIn(srcAll, id));
      const r = await copy(id);
      rec(`${id} copied`, r.s === 200 && !r.b.error, r.b || r.s);
      const after = keysOf(blockIn(readDir(MOD), id));
      const lost = before.filter((k) => !after.includes(k));
      rec(`…keeping all ${before.length} of its keys`, lost.length === 0, { lost, before, after });
    }
    // …and the specific values, not merely the key names.
    const dest = readDir(MOD);
    rec("the targeted_modifier's own values came across",
      /license_purchase_cost\s*=\s*-?0\.3/.test(blockIn(dest, "AFG_renew_soviet_trade_agreement")),
      blockIn(dest, "AFG_renew_soviet_trade_agreement"));
    rec("the research_bonus' value came across",
      /air_equipment\s*=\s*0\.15/.test(blockIn(dest, "AST_referendum_aviation_idea")),
      blockIn(dest, "AST_referendum_aviation_idea"));
    rec("the available gate came across",
      /has_government\s*=\s*neutrality/.test(blockIn(dest, "ENG_the_kings_party_idea")),
      blockIn(dest, "ENG_the_kings_party_idea"));
    rec("…and the file is brace-balanced",
      (dest.match(/\{/g) || []).length === (dest.match(/\}/g) || []).length, "unbalanced");

    console.log("\n[control] a spirit created FROM SCRATCH still gets the minimal block");
    const fresh = await post("/api/ideas/upsert-definition", {
      modPath: MOD, category: "country",
      targetRelativeFile: "common/ideas/copied.txt",
      targetLocalizationPath: "localisation/english/copied_l_english.yml",
      ideaId: "nv_brand_new", name: "Brand New", desc: "",
      picture: "generic_morale_bonus",
      selectedEffects: ["modifier = {\n\twar_support_factor = 0.05\n}"],
    });
    rec("the save succeeded", fresh.s === 200 && !fresh.b.error, fresh.b || fresh.s);
    const nb = blockIn(readDir(MOD), "nv_brand_new");
    rec("…and it holds exactly what was asked for",
      /war_support_factor\s*=\s*0\.05/.test(nb) && /picture\s*=\s*generic_morale_bonus/.test(nb), nb);
    rec("…with no inherited leftovers", !/targeted_modifier|research_bonus/.test(nb), nb);

    console.log("\n[control] the user's OWN edits still win over the source");
    const edited = await post("/api/ideas/upsert-definition", {
      modPath: MOD, sourceRoot: SRC, category: "country",
      targetRelativeFile: "common/ideas/copied2.txt",
      targetLocalizationPath: "localisation/english/copied_l_english.yml",
      ideaId: "AST_referendum_aviation_idea", name: "Changed", desc: "",
      picture: "generic_morale_bonus",
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.99\n}"],
    });
    rec("the save succeeded", edited.s === 200 && !edited.b.error, edited.b || edited.s);
    const eb = blockIn(fs.readFileSync(path.join(MOD, "common", "ideas", "copied2.txt"), "utf8"), "AST_referendum_aviation_idea");
    rec("the edited modifier is what the user typed", /political_power_gain\s*=\s*0\.99/.test(eb), eb);
    rec("…the picture they chose is used", /picture\s*=\s*generic_morale_bonus/.test(eb), eb);
    rec("…and the un-modelled research_bonus STILL survived alongside it",
      /research_bonus/.test(eb) && /air_equipment\s*=\s*0\.15/.test(eb), eb);

    console.log(`\n=== idea copy preserves sections: ${checks} checks, ${fails.length} failed ===`);
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
