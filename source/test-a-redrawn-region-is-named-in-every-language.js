// #a-region-name-in-every-language — A REDRAWN REGION HAS A NAME IN EVERY LANGUAGE THE GAME LOADS.
//
// Vanilla names its strategic regions in ten languages. The first Redraw wrote every region's name under a NOVA_REGION_<id>
// key, in English only, so every other language showed the raw key. Round one of the review of 60ed681 fixed half of that: a
// region named after a base region takes that region's OWN key, and its translations below keep resolving. Round two found
// the other half. Every name Nova makes up (the smaller pieces of a split sea, a region named after a state) was still
// English-only. Driven through the endpoint with the bodies public/map.js sends, over a base game that names its regions in
// English AND German:
//   · a name Nova makes up is in both languages' own files, each with its own l_<lang>: header;
//   · a base key the layers below already name is written into neither file.
// Its own file, so its process starts with HOI4_ROOT on this world: a process that switches game roots meets a base-game loc
// index cached from the first one.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};

const G = makeRegionWorld("lang", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
rec("the dialog's request body was found in public/map.js", /confirm:\s*true/.test(bodyText), bodyText);
const body = vm.runInNewContext("(" + bodyText + ")", { modPath: () => G.MOD });

const { createApp } = require("./server.js");
(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/map/rebuild-regions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    rec("the redraw over a base game with two languages is written", r.status === 200 && r.body.ok === true && r.body.regionNames && !r.body.regionNames.error, r.body);
    rec("…and it says how many languages it named the regions in", r.body.regionNames && r.body.regionNames.languages === 2, r.body.regionNames);
    const en = path.join(G.MOD, "localisation", "english", "replace", "nova_region_names_l_english.yml");
    const de = path.join(G.MOD, "localisation", "german", "replace", "nova_region_names_l_german.yml");
    const enText = fs.existsSync(en) ? fs.readFileSync(en, "utf8") : "", deText = fs.existsSync(de) ? fs.readFileSync(de, "utf8") : "";
    const enKeys = (enText.match(/^[ \t]*(NOVA_REGION_\d+):/gm) || []).map((l) => l.trim().replace(/:$/, ""));
    rec("Nova names at least one region itself", enKeys.length >= 1, enText.slice(0, 300));
    rec("⭐⭐⭐ the German file carries every one of those names, under its own l_german: header", /^﻿?l_german:/.test(deText) && enKeys.every((k) => new RegExp(`^[ \\t]*${k}:`, "m").test(deText)), { enKeys, de: deText.slice(0, 300) });
    rec("⭐⭐ a base key the layers below already name is written into neither file", !/STRATEGICREGION_/.test(enText) && !/STRATEGICREGION_/.test(deText), { en: enText.slice(0, 300) });
    // …and every region that holds provinces resolves in German: by the base game's own German name, or by Nova's German file
    const md = require("./map-data.js");
    const m = md.buildMapModel({ modRoot: G.MOD, gameRoot: G.GAME, dependencyRoots: [] });
    const baseDe = fs.readFileSync(path.join(G.GAME, "localisation", "german", "regions_l_german.yml"), "utf8");
    const unnamed = m.strategicRegions.filter((x) => x.provinces.length && !new RegExp(`^[ \\t]*${x.name}:`, "m").test(baseDe + "\n" + deText));
    rec("⭐⭐ every region that holds provinces has a German name", unnamed.length === 0, unnamed.map((x) => `${x.id}:${x.name}`));
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
