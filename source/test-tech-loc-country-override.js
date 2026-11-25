// #tech-save-clobbers-generic-loc-with-country-name — AN ORDINARY TECHNOLOGY SAVE REPLACED THE NAME EVERY
// COUNTRY SEES WITH THE SELECTED COUNTRY'S OWN.
//
// `<tech_id>` is the key every country sees; `<TAG>_<tech_id>` is one country's override. Millennium Dawn is
// built on that distinction — its localisation/english/equipment_l_english.yml carries 10,751 TAG_-prefixed
// keys, with ` infantry_weapons: "Small Arms 1965"` as the generic and ` ARG_infantry_weapons: "FN FAL"` as
// Argentina's.
//
// The catalogue resolves a tech's display name COUNTRY-FIRST, which is right — the editor is showing one
// country's tree. But it reported only the STRING, so the writer put that string back under the GENERIC key
// and every other country started showing the selected country's weapon. The research page always loads with
// a country selected (one is auto-selected on page load), so this fired on ordinary saves. Worse, it fired on
// techs the user never opened: saveAllChanges pulls a dirty tech's prerequisite-PARENTS into the same batch,
// so editing a child's research cost destroyed its parent's generic name.
//
// The fix is to carry the key back alongside the value and write the name where it came from. A RENAME is
// the exception: the country override belongs to the OLD id and is stripped, so a renamed tech writes the
// plain key rather than a stale country one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tloc-"));
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

const MOD = path.join(ROOT, "tloc");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TLoc"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "technologies", "auth.txt"), [
  "technologies = {",
  "\tauth_smallarms = {",
  "\t\tresearch_cost = 1",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "\tauth_child = {",
  "\t\tresearch_cost = 1",
  "\t\tauth_smallarms = 1",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 2 } }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const LOC = path.join(MOD, "localisation", "english", "aa_author_tech_l_english.yml");
const LOC_SRC = "\uFEFFl_english:\n"
  + ' auth_smallarms:0 "Small Arms 1965"\n'
  + ' auth_smallarms_desc:0 "The generic description every country sees."\n'
  + ' SOV_auth_smallarms:0 "AKM"\n'
  + ' SOV_auth_smallarms_desc:0 "The Union variant."\n'
  + ' auth_child:0 "Child Tech"\n';
fs.writeFileSync(LOC, LOC_SRC, "utf8");

const valueOf = (key) => {
  const dir = path.join(MOD, "localisation", "english");
  for (const f of fs.readdirSync(dir)) {
    const m = new RegExp(`^\\s*${key}:\\d*\\s*"([^"]*)"`, "m").exec(fs.readFileSync(path.join(dir, f), "utf8"));
    if (m) return m[1];
  }
  return null;
};

const PORT = 43437;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const catalog = (country) => get(`/api/technologies/catalog?modPath=${encodeURIComponent(MOD)}${country ? `&country=${country}` : ""}`)
    .then((c) => (c.b.technologies || c.b.techs || []).filter((t) => /^auth_/.test(t.id)));

  try {
    console.log("\n[ground truth] real mods layer a per-country override over a generic key");
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    let generic = 0, overrides = 0;
    try {
      const t = fs.readFileSync(path.join(MD, "localisation", "english", "equipment_l_english.yml"), "utf8");
      for (const m of t.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)) (/^[A-Z]{3}_/.test(m[1]) ? overrides++ : generic++);
    } catch (_) {}
    rec("Millennium Dawn's equipment loc was readable", generic + overrides > 1000, { generic, overrides });
    rec("…and thousands of its keys are TAG_ overrides", overrides > 5000, { generic, overrides });

    console.log("\n[the catalogue] reports WHICH key the displayed name came from");
    const withCountry = await catalog("SOV");
    const sa = withCountry.find((t) => t.id === "auth_smallarms");
    rec("the tech resolved country-first for display", sa && sa.name === "AKM", sa && sa.name);
    rec("…and says the value came from the country key", sa && sa.nameKey === "SOV_auth_smallarms", sa && sa.nameKey);
    rec("…and the same for the description", sa && sa.descriptionKey === "SOV_auth_smallarms_desc", sa && sa.descriptionKey);
    const child = withCountry.find((t) => t.id === "auth_child");
    rec("a tech with NO country override reports the plain key", child && child.nameKey === "auth_child", child && child.nameKey);

    console.log("\n[the bug] a save must not write one country's name over the generic key");
    // Exactly what the client sends: the whole catalogue objects, with one tech's cost changed. The parent is
    // in the batch only because it is a prerequisite of the changed child — the user never opened it.
    const s = await post("/api/technologies/save-batch", {
      modPath: MOD, countryTag: "SOV", equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: withCountry.map((t) => Object.assign({}, t, t.id === "auth_child" ? { researchCost: 1.25 } : {})),
    });
    rec("the save succeeded", s.s === 200 && !s.b.error, s.b || s.s);
    rec("the GENERIC name is untouched", valueOf("auth_smallarms") === "Small Arms 1965", valueOf("auth_smallarms"));
    rec("…and the generic description too",
      valueOf("auth_smallarms_desc") === "The generic description every country sees.", valueOf("auth_smallarms_desc"));
    rec("…while the country override still says what it said",
      valueOf("SOV_auth_smallarms") === "AKM", valueOf("SOV_auth_smallarms"));
    rec("…and the edit that was actually requested landed",
      /research_cost = 1\.25/.test(fs.readFileSync(path.join(MOD, "common", "technologies", "auth.txt"), "utf8")),
      fs.readFileSync(path.join(MOD, "common", "technologies", "auth.txt"), "utf8"));

    console.log("\n[control] editing the name WITH a country selected updates that country's override");
    const again = await catalog("SOV");
    const s2 = await post("/api/technologies/save-batch", {
      modPath: MOD, countryTag: "SOV", equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: again.map((t) => (t.id === "auth_smallarms" ? Object.assign({}, t, { name: "AK-74" }) : t)),
    });
    rec("the save succeeded", s2.s === 200 && !s2.b.error, s2.b || s2.s);
    rec("the country override took the new name", valueOf("SOV_auth_smallarms") === "AK-74", valueOf("SOV_auth_smallarms"));
    rec("…and the generic is STILL untouched", valueOf("auth_smallarms") === "Small Arms 1965", valueOf("auth_smallarms"));

    console.log("\n[control] with NO country selected, the generic key is what gets edited");
    const plain = await catalog("");
    const sa2 = plain.find((t) => t.id === "auth_smallarms");
    rec("the catalogue resolves the generic name", sa2 && sa2.name === "Small Arms 1965", sa2 && sa2.name);
    rec("…and reports the plain key", sa2 && sa2.nameKey === "auth_smallarms", sa2 && sa2.nameKey);
    const s3 = await post("/api/technologies/save-batch", {
      modPath: MOD, equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: plain.map((t) => (t.id === "auth_smallarms" ? Object.assign({}, t, { name: "Small Arms 1970" }) : t)),
    });
    rec("the save succeeded", s3.s === 200 && !s3.b.error, s3.b || s3.s);
    rec("the generic key took the new name", valueOf("auth_smallarms") === "Small Arms 1970", valueOf("auth_smallarms"));
    rec("…and the country override is untouched", valueOf("SOV_auth_smallarms") === "AK-74", valueOf("SOV_auth_smallarms"));

    console.log("\n[control] a RENAME writes the plain key, not a stale country one");
    // The country override belongs to the OLD id and is stripped, so re-using SOV_<old> would be wrong.
    const beforeRename = await catalog("SOV");
    const s4 = await post("/api/technologies/save-batch", {
      modPath: MOD, countryTag: "SOV", equipments: [], customTabs: [], countryTechIds: null, deletions: [],
      technologies: beforeRename.map((t) => (t.id === "auth_smallarms"
        ? Object.assign({}, t, { id: "auth_renamed", previousId: "auth_smallarms", name: "Renamed Arms" }) : t)),
    });
    rec("the save succeeded", s4.s === 200 && !s4.b.error, s4.b || s4.s);
    rec("the new id's GENERIC key holds the name", valueOf("auth_renamed") === "Renamed Arms", valueOf("auth_renamed"));
    rec("…and no SOV_<newid> key was invented", valueOf("SOV_auth_renamed") === null, valueOf("SOV_auth_renamed"));

    console.log(`\n=== tech loc country override: ${checks} checks, ${fails.length} failed ===`);
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
