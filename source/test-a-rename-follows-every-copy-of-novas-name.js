// ⛔ A RENAME FOLLOWS EVERY COPY OF NOVA'S NAME, AND NEVER HIDES A MODDER'S TRANSLATION. #a-rename-follows-every-copy
//
// Independent review of e1f3586 (names in every language), findings 4–6 and the test gaps of finding 9:
//
// 4. The rename follow looked only in localisation/<lang>/replace/. The redraw of 09-24 (025324d) wrote a region's name into
//    every language BESIDE replace/, and cac3a9f only moved new writes into replace/ — so in every world built between the two
//    (the owner's TEST 27–29), renaming a region changed English and left German and French on the old name. The English
//    "before" was read from replace/ only, too, so nothing followed at all.
// 5. Nova's copy of an English name sits in replace/, where it wins over any file the modder writes. A translation the modder
//    adds later, in a file of their own, was hidden by it — and a rename kept updating Nova's copy over theirs.
// 6. An add-on renaming a state its dependency names (a Nova-made world under it) wrote English only, so German kept showing
//    the dependency's copy of the OLD name. The dependency's copies are Nova's copies too; the add-on writes over them.
// 9. Three rules of localiseNewStateNames no test would miss: a key English writes NOW overwrites a stale line in another
//    language; an old-file line is not moved into replace/ over the modder's own English name; and a modder's translation is
//    found by the file's _l_<lang> suffix wherever under localisation/ it sits (the Toolpack writes them straight into it).
//
// Requests are the page's (public/map.js): queueWrite("/api/map/set-state", { stateId, nameKey, fields }), queueWrite(
// "/api/map/set-region-name", { nameKey, name }), queueWrite("/api/map/create-state", { name: "", owner }) and Generate land's
// body; flushMapSaves adds modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("follow-every-copy");
const BOM = String.fromCharCode(0xfeff);
lib.write(world.GAME, {
  "localisation/english/base_l_english.yml": `${BOM}l_english:\n STATE_1:0 "Earthone"\n`,
  "localisation/german/base_l_german.yml": `${BOM}l_german:\n STATE_1:0 "Erdeins"\n`,
  "localisation/french/base_l_french.yml": `${BOM}l_french:\n STATE_1:0 "Terreun"\n`,
});
const { createApp } = require("./server.js");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*$/gm)) m.set(x[1], x[2]); return m; };
const locFile = (mod, lang, name, replace) => path.join(mod, "localisation", lang, ...(replace ? ["replace"] : []), `${name}_l_${lang}.yml`);
const novaStates = (mod, lang) => locFile(mod, lang, "nova_state_names", true);
const OTHER = ["german", "french"];
const yml = (lang, rows) => `${BOM}l_${lang}:\n` + Object.entries(rows).map(([k, v]) => ` ${k}:0 "${v}"\n`).join("");

const MAPJS = maskJsComments(read(path.join(__dirname, "public", "map.js")));
const html = read(path.join(__dirname, "public", "map.html"));
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
function panelFields(st, edit) {
  const f = {
    displayName: String(st.displayName || st.name || "").trim(), owner: st.owner || "", clearOwner: false,
    cores: (st.cores || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    manpower: String(st.manpower || 0), category: String(st.category || "").trim(),
    victoryPoints: (st.victoryPoints || []).map((v) => ({ province: parseInt(v.province, 10), value: parseInt(v.value, 10) })).filter((v) => Number.isFinite(v.province) && Number.isFinite(v.value) && v.value > 0),
    buildings: {}, resources: {},
  };
  for (const b of BLD) f.buildings[b] = parseInt((st.buildings && st.buildings[b]) || 0, 10) || 0;
  for (const r of RES) f.resources[r] = parseFloat((st.resources && st.resources[r]) || 0) || 0;
  if (edit) edit(f);
  return f;
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests, as this test sends them");
    rec("set-region-name is { nameKey, name }", /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MAPJS));
    rec("…create-state is { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));

    srv = await lib.startServer(createApp);
    const post = (ep, body, mod) => srv.post(ep, body, mod).then((r) => ({ s: r.status, b: r.body }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);
    const rename = async (mod, id, name) => { const st = await stateOf(mod, id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (f) => { f.displayName = name; }) }, mod); };
    const generate = (mod) => post("/api/map/generate-land", { count: 1, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, mod);

    console.log("\n1. ⭐⭐⭐ A region named by a world of 09-24..09-26, with its copies beside replace/, renames in every language (finding 4)");
    {
      const mod = world.mod("follow legacy regions", {
        "localisation/english/nova_region_names_l_english.yml": yml("english", { R2: "Westmark" }),
        "localisation/german/nova_region_names_l_german.yml": yml("german", { R2: "Westmark" }),
        "localisation/french/nova_region_names_l_french.yml": yml("french", { R2: "Westmark (fr)" }),
      });
      const r = await post("/api/map/set-region-name", { nameKey: "R2", name: "Ostmark" }, mod);
      rec("the rename is written, in English's file where it already is", r.s === 200 && defs(locFile(mod, "english", "nova_region_names", false)).get("R2") === "Ostmark", { r: r.b, en: read(locFile(mod, "english", "nova_region_names", false)) });
      rec("⭐⭐⭐ German's copy beside replace/ follows it", defs(locFile(mod, "german", "nova_region_names", false)).get("R2") === "Ostmark", read(locFile(mod, "german", "nova_region_names", false)));
      rec("⭐⭐ …French's, which someone translated, stays", defs(locFile(mod, "french", "nova_region_names", false)).get("R2") === "Westmark (fr)", read(locFile(mod, "french", "nova_region_names", false)));
      rec("…and no second copy was made in replace/", !fs.existsSync(locFile(mod, "german", "nova_region_names", true)) && !fs.existsSync(locFile(mod, "french", "nova_region_names", true)));
    }

    console.log("\n2. ⭐⭐⭐ A translation the modder adds later is not hidden by Nova's copy (finding 5)");
    {
      // the modder's German file is already there, naming something else, when state 4 is named — so Nova has read it once
      // (and cached what it defines) before they add the translation to it
      const mod = world.mod("follow theirs later", { "localisation/german/my_names_l_german.yml": yml("german", { STATE_9: "Neun" }) });
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("PRECONDITION: state 4 is named, and German carries Nova's copy", a.b.id === 4 && !!defs(novaStates(mod, "german")).get("STATE_4"), defs(novaStates(mod, "german")));
      const theirs = locFile(mod, "german", "my_names", false);
      fs.writeFileSync(theirs, yml("german", { STATE_9: "Neun", STATE_4: "Katzenstadt" }));
      const theirsBytes = fs.readFileSync(theirs);
      const r = await rename(mod, 4, "Cacavia");
      rec("the rename is written, and French follows", r.s === 200 && defs(novaStates(mod, "english")).get("STATE_4") === "Cacavia" && defs(novaStates(mod, "french")).get("STATE_4") === "Cacavia", r.b);
      rec("⭐⭐⭐ German: Nova's copy is gone from replace/, so the modder's \"Katzenstadt\" is what the game shows", !defs(novaStates(mod, "german")).has("STATE_4"), read(novaStates(mod, "german")));
      rec("⭐⭐ …and the modder's file is left byte for byte", fs.readFileSync(theirs).equals(theirsBytes));

      const mod2 = world.mod("follow theirs at naming", {
        "localisation/german/my_names_l_german.yml": yml("german", { STATE_4: "Vierter" }),
        "localisation/german/replace/nova_state_names_l_german.yml": yml("german", { STATE_4: "Stale" }),
      });
      await post("/api/map/create-state", { name: "", owner: "AAA" }, mod2);
      rec("⭐⭐ naming state 4 again takes Nova's old German copy out of the modder's way", !defs(novaStates(mod2, "german")).has("STATE_4"), read(novaStates(mod2, "german")));
    }

    console.log("\n3. ⭐⭐⭐ An add-on renaming a state its dependency names follows the dependency's copies (finding 6)");
    {
      world.mod("Nova World", {
        "localisation/english/replace/nova_state_names_l_english.yml": yml("english", { STATE_3: "Cacav" }),
        "localisation/german/replace/nova_state_names_l_german.yml": yml("german", { STATE_3: "Cacav" }),
        "localisation/french/replace/nova_state_names_l_french.yml": yml("french", { STATE_3: "Kakaw (fr)" }),
      });
      const addon = world.mod("World Addon", {}, ["Nova World"]);
      const st = await stateOf(addon, 3);
      rec("PRECONDITION: the add-on sees state 3 as the dependency names it", st && st.displayName === "Cacav", st && st.displayName);
      const r = await rename(addon, 3, "Neuland");
      rec("the rename goes into the add-on's English file", r.s === 200 && defs(novaStates(addon, "english")).get("STATE_3") === "Neuland", { r: r.b, en: read(novaStates(addon, "english")) });
      rec("⭐⭐⭐ German, where the dependency's copy read the old name, gets the new one in the add-on", defs(novaStates(addon, "german")).get("STATE_3") === "Neuland", read(novaStates(addon, "german")));
      rec("⭐⭐ …French, where the dependency's copy is a translation, is left to it", !defs(novaStates(addon, "french")).has("STATE_3"), read(novaStates(addon, "french")));
    }

    console.log("\n4. ⭐⭐ The naming rules no test would have missed (finding 9)");
    {
      const stale = world.mod("follow stale line", { "localisation/german/replace/nova_state_names_l_german.yml": yml("german", { STATE_4: "Alt" }) });
      await post("/api/map/create-state", { name: "", owner: "AAA" }, stale);
      const en = defs(novaStates(stale, "english")).get("STATE_4");
      rec("⭐⭐ a key English names NOW overwrites a stale line in another language", !!en && defs(novaStates(stale, "german")).get("STATE_4") === en, [en, defs(novaStates(stale, "german")).get("STATE_4")]);

      const guard = world.mod("follow migrate guard", {
        "localisation/english/nova_state_names_l_english.yml": yml("english", { STATE_4: "Altname" }),
        "localisation/english/my_names_l_english.yml": yml("english", { STATE_4: "Theirs" }),
      });
      const g = await generate(guard);
      rec("PRECONDITION: Generate land makes state 4", ((g.b.newStates || [])[0] || {}).name === "STATE_4", g.b.newStates);
      rec("⭐⭐ the old file's STATE_4 is NOT moved into replace/ over the modder's own English name", !defs(novaStates(guard, "english")).has("STATE_4"), read(novaStates(guard, "english")));

      const suffix = world.mod("follow suffix", { "localisation/names_l_german.yml": yml("german", { STATE_4: "Direkt" }) });
      await post("/api/map/create-state", { name: "", owner: "AAA" }, suffix);
      rec("⭐⭐ a German translation straight under localisation/ is found by its _l_german suffix, and left alone", !defs(novaStates(suffix, "german")).has("STATE_4") && !!defs(novaStates(suffix, "french")).get("STATE_4"),
        { german: read(novaStates(suffix, "german")), french: read(novaStates(suffix, "french")) });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a rename follows every copy of Nova's name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
