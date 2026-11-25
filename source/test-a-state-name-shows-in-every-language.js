// ⛔ A NAME NOVA GIVES A STATE SHOWS IN EVERY LANGUAGE THE GAME RUNS IN. #a-state-name-in-every-language
//
// The base game names all 1,081 of its STATE_n keys and 1,704 VICTORY_POINTS_n keys in each of its ten languages (measured on
// the installed 1.19.3: braz_por, english, french, german, japanese, korean, polish, russian, simp_chinese, spanish), and a
// world Nova generates reuses those keys. Nova wrote its names in English only, so a player in any of the other nine saw
// Earth's names over Nova's world — "Korsika" for a state Nova called "Cacav" (independent review of cac3a9f and abc3f0a).
// Region names already went into every language (#a-region-name-in-every-language); the state writers never adopted it, and
// neither did creating or renaming a region.
//
// Now each of Nova's name writers writes every language the layers below localise, with the English text (a made-up name
// has no translation); a modder's own translation is left alone; forgetting and moving a key reach every language; a rename
// follows into every language's copy that still reads the old English, and not into one someone translated. And a key only
// Nova's OLD English file beside replace/ names moves into replace/ when it is named again (the second finding of the same
// review: the state stayed where the base game's name wins while its victory point went where Nova's does).
//
// Requests are the page's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }), queueWrite(
// "/api/map/move-province", { provinceId, toStateId }), queueWrite("/api/map/set-state", { stateId, nameKey, fields }),
// queueWrite("/api/map/set-region-name", { nameKey, name }), fetch("/api/map/create-region", { modPath, name }), and
// Generate land's body; flushMapSaves adds modPath.
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

const world = lib.makeWorld("every-language");
const BOM = String.fromCharCode(0xfeff);
// the layers below: the base game names the keys a new world reuses in its other languages, as vanilla does in all ten. (Not in
// English here: a renumber refuses to move a key onto one the base game names in ENGLISH — an older rule, tested by
// test-a-renumbered-state-keeps-a-name-of-its-own.js — and section 3 needs the move to happen. English is still a language
// below, with a file of its own.)
lib.write(world.GAME, {
  "localisation/english/state_names_l_english.yml": `${BOM}l_english:\n STATE_1:0 "Earthone"\n`,
  "localisation/german/state_names_l_german.yml": `${BOM}l_german:\n STATE_4:0 "Korsika"\n STATE_5:0 "Sardinien"\n`,
  "localisation/french/state_names_l_french.yml": `${BOM}l_french:\n STATE_4:0 "Corse"\n STATE_5:0 "Sardaigne"\n`,
});
const { createApp } = require("./server.js");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
/** What one file defines: key → raw value (between the outer quotes). */
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*$/gm)) m.set(x[1], x[2]); return m; };
const novaStates = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_state_names_l_${lang}.yml`);
const novaRegions = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_region_names_l_${lang}.yml`);
const LEGACY = (mod) => path.join(mod, "localisation", "english", "nova_state_names_l_english.yml");
const OTHER = ["german", "french"];

const MAPJS = maskJsComments(read(path.join(__dirname, "public", "map.js")));
const html = read(path.join(__dirname, "public", "map.html"));
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
/** stageStateWrite's reading of the panel, filled from the model the way showInfo fills it (as the renumbered-names test). */
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
  const pid = (st.provinces || [])[0];
  if (pid !== undefined) {
    const pb = st.provinceBuildings && st.provinceBuildings[pid];
    f.provinceBuildings = [{ province: pid, building: "naval_base", level: parseInt((pb && pb.naval_base) || 0, 10) || 0 }];
  }
  if (edit) edit(f);
  return f;
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests, as this test sends them");
    rec("create-state is { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…set-region-name is { nameKey, name }", /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MAPJS));
    rec("…create-region is { modPath, name }", /fetch\("\/api\/map\/create-region", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\), name \}\) \}\)/.test(MAPJS));
    rec("…Generate land is { modPath, count, seed, ownerMode, owner, replacesExistingWorld }", /JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\)/.test(MAPJS));

    srv = await lib.startServer(createApp);
    const post = (ep, body, mod) => srv.post(ep, body, mod).then((r) => ({ s: r.status, b: r.body }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);
    const rename = async (mod, id, name) => { const st = await stateOf(mod, id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (f) => { f.displayName = name; }) }, mod); };
    const generate = (mod) => post("/api/map/generate-land", { count: 1, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true }, mod);

    console.log("\n1. ⭐⭐⭐ Generate land names its state and victory point in every language below, not English alone");
    {
      const mod = world.mod("every language generate", {});
      const g = await generate(mod);
      const made = (g.b.newStates || [])[0] || {};
      rec("Generate land makes one state with a victory point", g.s === 200 && g.b.ok === true && !!made.name && !!(made.vp && made.vp.province), { status: g.s, error: g.b.error, newStates: g.b.newStates });
      const en = defs(novaStates(mod, "english")), vp = made.vp ? `VICTORY_POINTS_${made.vp.province}` : "";
      rec("English names both, the point after its state", !!en.get(made.name) && en.get(vp) === en.get(made.name), { state: en.get(made.name), vp: en.get(vp) });
      for (const lang of OTHER) {
        const d = defs(novaStates(mod, lang));
        rec(`⭐⭐⭐ ${lang} names both too, with the same text — not the base game's "${lang === "german" ? "Korsika" : "Corse"}"`, d.get(made.name) === en.get(made.name) && d.get(vp) === en.get(vp), { [lang]: [d.get(made.name), d.get(vp)] });
        rec(`…in ${lang}'s own file, with its BOM and its l_${lang}: header`, read(novaStates(mod, lang)).startsWith(`${BOM}l_${lang}:`), read(novaStates(mod, lang)).slice(0, 24));
      }
      rec("the answer says three languages carry the names", g.b.nameLocalisation && g.b.nameLocalisation.languages === 3, g.b.nameLocalisation);
    }

    console.log("\n2. ⭐⭐ A modder's own translation of the key is theirs, and stays");
    {
      const mod = world.mod("every language theirs", { "localisation/german/my_names_l_german.yml": `${BOM}l_german:\n STATE_4:0 "Vierter"\n` });
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("+ New state makes state 4, keyed STATE_4", a.b.ok === true && a.b.id === 4 && a.b.name === "STATE_4", a.b);
      rec("⭐⭐ German: Nova writes nothing over the modder's \"Vierter\"", !defs(novaStates(mod, "german")).has("STATE_4") && /STATE_4:0 "Vierter"/.test(read(path.join(mod, "localisation", "german", "my_names_l_german.yml"))), read(novaStates(mod, "german")));
      rec("…French, which the modder did not translate, gets Nova's name", !!defs(novaStates(mod, "french")).get("STATE_4") && defs(novaStates(mod, "french")).get("STATE_4") === defs(novaStates(mod, "english")).get("STATE_4"), [defs(novaStates(mod, "french")).get("STATE_4"), defs(novaStates(mod, "english")).get("STATE_4")]);
    }

    console.log("\n3. ⭐⭐⭐ A rename follows into every language; Auto-fix forgets and moves a key in every language");
    {
      const mod = world.mod("every language edits", {});
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const b = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("two states, 4 and 5", a.b.id === 4 && b.b.id === 5, { a: a.b, b: b.b });
      rec("a province moves into state 5", (await post("/api/map/move-province", { provinceId: 5, toStateId: 5 }, mod)).b.ok === true);
      const r1 = await rename(mod, 5, "Hué");
      rec("state 5 is renamed \"Hué\"", r1.s === 200 && ((await stateOf(mod, 5)) || {}).displayName === "Hué", r1.b);
      rec("⭐⭐⭐ …and German and French follow, not left on the made-up name", OTHER.every((l) => defs(novaStates(mod, l)).get("STATE_5") === "Hué"), OTHER.map((l) => defs(novaStates(mod, l)).get("STATE_5")));
      // someone translates French in Nova's own file, then renames again: German follows, French keeps its translation
      fs.writeFileSync(novaStates(mod, "french"), read(novaStates(mod, "french")).replace('STATE_5:0 "Hué"', 'STATE_5:0 "Hué (fr)"'));
      await rename(mod, 5, "Huế");
      rec("⭐⭐ a second rename: German follows to \"Huế\", French keeps the translation someone made", defs(novaStates(mod, "german")).get("STATE_5") === "Huế" && defs(novaStates(mod, "french")).get("STATE_5") === "Hué (fr)",
        OTHER.map((l) => defs(novaStates(mod, l)).get("STATE_5")));
      const fx = await srv.autoFix(mod);
      rec("Auto-fix deletes the empty state 4 and renumbers 5 into it", JSON.stringify(((fx.body.fixes || {}).stateGaps || {}).renumbered) === JSON.stringify([{ from: 5, to: 4 }]), { status: fx.status, stateGaps: (fx.body.fixes || {}).stateGaps, error: fx.body.error });
      const s4 = await stateOf(mod, 4);
      rec("⭐⭐ the key moves with it — Nova's own German and French copies are not \"named outside Nova's file\"", s4 && s4.name === "STATE_4" && s4.displayName === "Huế", s4 && [s4.name, s4.displayName]);
      rec("⭐⭐⭐ …in every language: STATE_4 is the moved name, STATE_5 is gone, and the empty state's made-up name went with it",
        defs(novaStates(mod, "english")).get("STATE_4") === "Huế" && defs(novaStates(mod, "german")).get("STATE_4") === "Huế" && defs(novaStates(mod, "french")).get("STATE_4") === "Hué (fr)"
          && ["english", ...OTHER].every((l) => !defs(novaStates(mod, l)).has("STATE_5")),
        ["english", ...OTHER].map((l) => [l, read(novaStates(mod, l)).replace(BOM, "")]));
    }

    console.log("\n4. ⭐⭐ A key only Nova's old English file names leaves it when it is named again, and the state and its point go into replace/ together (review #2)");
    {
      // ⚠️ MOVED WITH #a-new-state-takes-no-name-a-gone-state-left. This section asserted the new state was ADOPTED as "Altname" —
      // but no state 4 loads, so that line is a gone state's, and adopting it is the shape that handed world 1's names to world 2
      // after Delete map → Generate land twice (test-a-new-state-takes-no-name-a-gone-state-left.js). What review #2 is about still
      // holds and is still pinned: the key leaves the old file, where the base game's name wins, and the state and its point sit in
      // replace/, reading the same name in every language — now a made-up one of the new state's own.
      const mod = world.mod("every language legacy", { "localisation/english/nova_state_names_l_english.yml": `${BOM}l_english:\n STATE_4:0 "Altname"\n` });
      const g = await generate(mod);
      const made = (g.b.newStates || [])[0] || {};
      rec("PRECONDITION: Generate land's new state is 4, the key the old file names", made.id === 4 && made.name === "STATE_4", g.b.newStates);
      const en = defs(novaStates(mod, "english")), vp = made.vp ? `VICTORY_POINTS_${made.vp.province}` : "";
      const name = en.get("STATE_4");
      rec("⭐⭐ the state's name is in replace/ and out of the old file — a made-up name, not the gone state's \"Altname\"", /^[A-Z][a-z]{3,10}$/.test(String(name)) && name !== "Altname" && !defs(LEGACY(mod)).has("STATE_4"), { replace: name, legacy: read(LEGACY(mod)) });
      rec("⭐⭐ …so the state and its point sit in the same file, reading the same name", !!vp && en.get(vp) === name, en.get(vp));
      rec("…and every language has both", OTHER.every((l) => defs(novaStates(mod, l)).get("STATE_4") === name && defs(novaStates(mod, l)).get(vp) === name), OTHER.map((l) => [...defs(novaStates(mod, l))]));
      rec("the old file keeps its BOM and header", read(LEGACY(mod)).startsWith(`${BOM}l_english:`), read(LEGACY(mod)).slice(0, 20));
    }

    console.log("\n5. ⭐⭐ A region made or renamed in the map editor is named in every language, as a redraw names them");
    {
      const mod = world.mod("every language regions", {});
      const c = await post("/api/map/create-region", { name: "Nordmark" }, mod);
      const key = c.b.nameKey;
      rec("create-region makes a region with a name key", c.s === 200 && !!key, c.b);
      rec("⭐⭐ English, German and French all name it \"Nordmark\"", ["english", ...OTHER].every((l) => defs(novaRegions(mod, l)).get(key) === "Nordmark"), ["english", ...OTHER].map((l) => defs(novaRegions(mod, l)).get(key)));
      const r = await post("/api/map/set-region-name", { nameKey: key, name: "Südmark" }, mod);
      rec("⭐⭐ a rename follows into every language", r.s === 200 && ["english", ...OTHER].every((l) => defs(novaRegions(mod, l)).get(key) === "Südmark"), { r: r.b, got: ["english", ...OTHER].map((l) => defs(novaRegions(mod, l)).get(key)) });
    }

    console.log("\n6. ⭐ A name the mod already has with a quote in it comes back to the page as the game shows it (review of abc3f0a, the same class)");
    {
      const mod = world.mod("every language quote", { "localisation/english/my_names_l_english.yml": `${BOM}l_english:\n STATE_4:0 "The \\"Old\\" Shore"\n` });
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("⭐ create-state hands back displayName `The \"Old\" Shore`, not with its escapes — the panel posts it back on the next Save", a.b.displayName === 'The "Old" Shore', a.b.displayName);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a state name shows in every language: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
