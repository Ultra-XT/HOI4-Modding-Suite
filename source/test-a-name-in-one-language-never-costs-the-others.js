// ⛔ A NAME THAT CANNOT BE WRITTEN IN ONE LANGUAGE NEVER COSTS THE OTHERS. #a-name-in-one-language-never-costs-the-others
//
// Independent review of e1f3586 (names in every language), findings 1–3:
//
// 1. Each of Nova's name writers wrote every other language in one loop with no guard per language. One file Nova cannot
//    rewrite — a translator saves Nova's German file as Windows-1252 (readLocalizationTextForWrite refuses it, rightly: a
//    rewrite would turn every umlaut into "�"), or it is read-only — threw out of the loop. On "+ New state" English and
//    French were named, German threw, Spanish and the rest were never written, and the click answered "its name could not be
//    written … the game will show STATE_5" with no displayName. The page then showed the key, and its next Save wrote
//    `STATE_5:0 "STATE_5"` over the name in English and, by the rename follow, in French. create-region answered 400 after the
//    region was already on disk, so a second click made a second region; set-region-name answered 400 after English was renamed.
// 2. The rename follow wrote through writeUtf8BomFile, which always files its backup under "localisation" — the pool every
//    maker's single-file saves share (cap 200) — so each rename in a ten-language world spent ten backups there.
// 3. Auto-fix's empty-state sweep forgot each deleted state's name in its own pass, each pass rewriting every language's
//    file: 4 deleted states, 40 writes. The batched shape already existed next door ("ONE write for all entries").
//
// Requests are the page's (public/map.js): queueWrite("/api/map/create-state", { name: "", owner }), queueWrite(
// "/api/map/set-state", { stateId, nameKey, fields }), queueWrite("/api/map/set-region-name", { nameKey, name }),
// fetch("/api/map/create-region", { modPath, name }), POST /api/map/auto-fix { modPath }; flushMapSaves adds modPath.
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

const world = lib.makeWorld("one-language");
const BOM = String.fromCharCode(0xfeff);
// four languages below, as the base game has ten
lib.write(world.GAME, {
  "localisation/english/base_l_english.yml": `${BOM}l_english:\n STATE_1:0 "Earthone"\n`,
  "localisation/german/base_l_german.yml": `${BOM}l_german:\n STATE_1:0 "Erdeins"\n`,
  "localisation/french/base_l_french.yml": `${BOM}l_french:\n STATE_1:0 "Terreun"\n`,
  "localisation/spanish/base_l_spanish.yml": `${BOM}l_spanish:\n STATE_1:0 "Tierrauno"\n`,
});
const { createApp } = require("./server.js");
const { onModWrite, BACKUP_DIR } = require("./safe-write.js");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*$/gm)) m.set(x[1], x[2]); return m; };
const novaStates = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_state_names_l_${lang}.yml`);
const novaRegions = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_region_names_l_${lang}.yml`);
const GOOD = ["english", "french", "spanish"];
// Windows-1252: "Münster" with a raw 0xFC — valid Latin-1, not UTF-8. Nova refuses to rewrite it, and must refuse ONLY it.
const cp1252 = (lang, key, word) => Buffer.concat([Buffer.from(`l_${lang}:\n ${key}:0 "M`, "latin1"), Buffer.from([0xfc]), Buffer.from(`${word}"\n`, "latin1")]);

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
    rec("create-state is { name: \"\", owner }", /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}/.test(MAPJS));
    rec("…set-region-name is { nameKey, name }", /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MAPJS));
    rec("…create-region is { modPath, name }", /fetch\("\/api\/map\/create-region", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\), name \}\) \}\)/.test(MAPJS));
    rec("…and the page shows the name the server hands back, else the key", /st\.displayName = created\.displayName \|\| created\.name/.test(MAPJS));

    srv = await lib.startServer(createApp);
    const post = (ep, body, mod) => srv.post(ep, body, mod).then((r) => ({ s: r.status, b: r.body }));
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);
    const rename = async (mod, id, name) => { const st = await stateOf(mod, id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (f) => { f.displayName = name; }) }, mod); };

    console.log("\n1. ⭐⭐⭐ Nova's German file is not UTF-8: every other language is still named, and the click says German was not");
    {
      const mod = world.mod("one language bad german", {});
      fs.mkdirSync(path.dirname(novaStates(mod, "german")), { recursive: true });
      fs.writeFileSync(novaStates(mod, "german"), cp1252("german", "STATE_1", "nster"));
      fs.mkdirSync(path.dirname(novaRegions(mod, "german")), { recursive: true });
      fs.writeFileSync(novaRegions(mod, "german"), cp1252("german", "R1", "nsterland"));
      const germanStates = fs.readFileSync(novaStates(mod, "german")), germanRegions = fs.readFileSync(novaRegions(mod, "german"));

      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("+ New state makes state 4", a.s === 200 && a.b.ok === true && a.b.id === 4 && a.b.name === "STATE_4", a.b);
      const en = defs(novaStates(mod, "english")).get("STATE_4");
      rec("⭐⭐⭐ English, French AND Spanish name it — Spanish comes after German, and is not lost to it", !!en && GOOD.every((l) => defs(novaStates(mod, l)).get("STATE_4") === en), GOOD.map((l) => [l, defs(novaStates(mod, l)).get("STATE_4")]));
      rec("⭐⭐⭐ the answer hands back the name, so the page does not fall back to showing the key", a.b.displayName === en && a.b.displayName !== "STATE_4", a.b.displayName);
      rec("⭐⭐ …and says which language could not be written, and why", /German/.test(String(a.b.fileWarning || "")) && /UTF-8/.test(String(a.b.fileWarning || "")), a.b.fileWarning);
      rec("⭐⭐ the German file is left byte for byte as it was", fs.readFileSync(novaStates(mod, "german")).equals(germanStates));

      const r = await rename(mod, 4, "Neustadt");
      rec("⭐⭐ a rename is written, and English, French and Spanish follow", r.s === 200 && r.b.renamed === true && GOOD.every((l) => defs(novaStates(mod, l)).get("STATE_4") === "Neustadt"), { r: r.b, got: GOOD.map((l) => defs(novaStates(mod, l)).get("STATE_4")) });
      rec("⭐⭐ …and the answer says German did not", /German/.test(String(r.b.fileWarning || "")), r.b.fileWarning);

      const c = await post("/api/map/create-region", { name: "Nordmark" }, mod);
      rec("⭐⭐⭐ create-region answers ok — the region is on disk, so the page must add it", c.s === 200 && !!c.b.nameKey, c.b);
      const regionsAfterOne = ((await model(mod)).strategicRegions || []).length;
      rec("⭐⭐ …English, French and Spanish name it, and the answer says German did not", GOOD.every((l) => defs(novaRegions(mod, l)).get(c.b.nameKey) === "Nordmark") && /German/.test(String(c.b.fileWarning || "")), { got: GOOD.map((l) => defs(novaRegions(mod, l)).get(c.b.nameKey)), said: c.b.fileWarning });
      const s = await post("/api/map/set-region-name", { nameKey: c.b.nameKey, name: "Südmark" }, mod);
      rec("⭐⭐ set-region-name answers ok, English renamed, French and Spanish follow", s.s === 200 && s.b.renamed !== false && GOOD.every((l) => defs(novaRegions(mod, l)).get(c.b.nameKey) === "Südmark"), { s: s.b, got: GOOD.map((l) => defs(novaRegions(mod, l)).get(c.b.nameKey)) });
      rec("…one region was made, not two", ((await model(mod)).strategicRegions || []).length === regionsAfterOne, regionsAfterOne);
      rec("⭐⭐ the German region file is left byte for byte as it was", fs.readFileSync(novaRegions(mod, "german")).equals(germanRegions));
    }

    console.log("\n1b. ⭐⭐⭐ Nova's ENGLISH region file is not UTF-8: create-region still answers ok, so the page adds the region it made");
    {
      // The English name is written before any other language and outside their one-language guard, so only the outer guard
      // stands between a bad English file and a 400 for a region that is already on disk (the next click made a second one).
      const mod = world.mod("one language bad english region", {});
      fs.mkdirSync(path.dirname(novaRegions(mod, "english")), { recursive: true });
      fs.writeFileSync(novaRegions(mod, "english"), cp1252("english", "R1", "nsterland"));
      const englishRegions = fs.readFileSync(novaRegions(mod, "english"));
      const before = ((await model(mod)).strategicRegions || []).length;
      const c = await post("/api/map/create-region", { name: "Ostmark" }, mod);
      rec("⭐⭐⭐ create-region answers ok with the region it made", c.s === 200 && c.b.ok !== false && !!c.b.nameKey, { status: c.s, body: c.b });
      rec("⭐⭐ …and says its name could not be written", /could not be written/.test(String(c.b.fileWarning || "")), c.b.fileWarning);
      rec("…exactly one region was made", ((await model(mod)).strategicRegions || []).length === before + 1, before);
      rec("⭐⭐ the English region file is left byte for byte as it was", fs.readFileSync(novaRegions(mod, "english")).equals(englishRegions));
    }

    console.log("\n2. ⭐⭐ A name that is only its own key is never written as a name");
    {
      const mod = world.mod("one language key as name", {});
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const r = await rename(mod, a.b.id, a.b.name);
      rec("⭐⭐ the panel posting \"STATE_4\" for STATE_4 writes no `STATE_4:0 \"STATE_4\"` in any language", ["english", ...GOOD.slice(1), "german"].every((l) => defs(novaStates(mod, l)).get("STATE_4") !== "STATE_4"), { r: r.b, got: ["english", "german", "french", "spanish"].map((l) => defs(novaStates(mod, l)).get("STATE_4")) });
    }

    console.log("\n3. ⭐⭐ A rename's other-language writes are filed as the map edit they are");
    {
      const mod = world.mod("one language backups", {});
      const a = await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      const since = new Set(fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : []);
      await rename(mod, a.b.id, "Neustadt");
      const fresh = (fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : []).filter((n) => !since.has(n) && /nova_state_names_l_(german|french|spanish)/.test(n));
      rec("⭐⭐ each other language's backup is filed under map-setState, not the makers' \"localisation\" pool", fresh.length === 3 && fresh.every((n) => n.split("__")[1] === "map-setState"), fresh.map((n) => n.split("__")[1]));
    }

    console.log("\n4. ⭐⭐ Auto-fix deleting several states rewrites each language's file once, not once per state");
    {
      const mod = world.mod("one language sweep", {});
      for (let i = 0; i < 4; i++) await post("/api/map/create-state", { name: "", owner: "AAA" }, mod);
      rec("PRECONDITION: states 4–7 exist, empty, named in every language", ["english", "german", "french", "spanish"].every((l) => [4, 5, 6, 7].every((id) => defs(novaStates(mod, l)).has(`STATE_${id}`))));
      const writes = new Map();
      onModWrite((p) => { if (/nova_state_names_l_/.test(p) && p.startsWith(mod)) writes.set(p, (writes.get(p) || 0) + 1); });
      const fx = await srv.autoFix(mod);
      const gone = ((fx.body.fixes || {}).emptyStates || {});
      rec("Auto-fix deletes the four empty states", fx.status === 200 && [4, 5, 6, 7].every((id) => !["english"].some((l) => defs(novaStates(mod, l)).has(`STATE_${id}`))), { status: fx.status, emptyStates: gone, error: fx.body.error });
      rec("⭐⭐⭐ …each of the four languages' files written ONCE", writes.size === 4 && [...writes.values()].every((n) => n === 1), [...writes].map(([p, n]) => [path.basename(p), n]));
      rec("…and every language forgot all four", ["german", "french", "spanish"].every((l) => [4, 5, 6, 7].every((id) => !defs(novaStates(mod, l)).has(`STATE_${id}`))));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a name in one language never costs the others: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
