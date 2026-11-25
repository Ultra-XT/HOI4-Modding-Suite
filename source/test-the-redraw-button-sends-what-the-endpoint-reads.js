// 🗺 #a-rebuilt-world-needs-its-own-regions — THE REDRAW BUTTON AND ITS ENDPOINT AGREE.
//
// The page sends two requests: the button posts a dry run and fills a confirm dialog from its summary; the dialog's Redraw
// posts the write. Both bodies are DERIVED from public/map.js here (not typed in), replayed against a real server over the
// region fixture, and the dialog's own text function (redrawRegionsBody) is lifted out of the page and RUN on the summary the
// server actually sent — so a key the page reads and the server does not send shows up as a missing number, not as nothing.
// Response bodies are read before the disk.
//   · the dry run answers the plan and writes nothing
//   · a request that says neither dryRun nor confirm is refused and writes nothing
//   · the confirmed write redraws the regions and names them in Nova's own loc file, from the base region a new region lies
//     in (the fixture ships no localisation, so the name comes from the base file's name, "East Sea" from 5-East Sea.txt)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld, treeHash } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};

const W = makeRegionWorld("endpoint");
process.env.HOI4_ROOT = W.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(W.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(W.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

// ── what the page sends, read out of the page ──
const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const MASKED = maskJsComments(MAP);
const handler = (btn) => { const a = MASKED.indexOf(`$("${btn}").addEventListener`); const b = MASKED.indexOf("addEventListener(", a + 30); return a < 0 ? "" : MAP.slice(a, b > a ? b : a + 4000); };
const bodyOf = (h) => { const m = /fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(h); return m ? m[1] : ""; };
const dryText = bodyOf(handler("mapRedrawRegions")), writeText = bodyOf(handler("mapRedrawConfirmBtn"));
rec("the button's request body was found in public/map.js", /dryRun:\s*true/.test(dryText), dryText);
rec("the dialog's request body was found in public/map.js", /confirm:\s*true/.test(writeText), writeText);
const build = (text) => vm.runInNewContext("(" + text + ")", { modPath: () => W.MOD });
// the dialog's own text, lifted out of the page and run
const fnAt = MASKED.indexOf("function redrawRegionsBody(");
const fnEnd = MASKED.indexOf("\n  }\n", fnAt);
const redrawRegionsBody = fnAt < 0 ? null : vm.runInNewContext("(" + MAP.slice(fnAt, fnEnd + 4) + ")", {});
rec("redrawRegionsBody was lifted out of the page", typeof redrawRegionsBody === "function");

const { createApp } = require("./server.js");
(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (body) => fetch(base + "/api/map/rebuild-regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

    const t0 = treeHash(W.MOD);
    const dry = await post(build(dryText));
    rec("⭐ the dry run is answered with a plan", dry.status === 200 && dry.body.ok === true && dry.body.dryRun === true && dry.body.summary, dry.body);
    const s = dry.body.summary || {};
    rec("…counting regions, land, sea, lakes and files", [s.regions, s.landRegions, s.seaRegions, s.lakesToSea, (s.files || {}).regionFiles].every((x) => Number.isFinite(x)), s);
    rec("…and the queue and coast measures the dialog quotes", s.queue && Number.isFinite(s.queue.queue) && Number.isFinite(s.coastDrawnAfter), s);
    rec("⭐ the dry run wrote nothing", JSON.stringify(treeHash(W.MOD)) === JSON.stringify(t0));
    const html = redrawRegionsBody ? redrawRegionsBody(s) : "";
    rec("⭐⭐ the dialog built from the server's summary names every number it promises", html.includes(`${s.regions} strategic regions`) && html.includes(`${s.lakesToSea} lake`) && html.includes(`${s.coastDrawnAfter}%`) && !/NaN|undefined/.test(html), html);

    const neither = await post({ modPath: W.MOD });
    rec("a request that says neither dryRun nor confirm is refused", neither.status === 400 && neither.body.ok === false, neither.body);
    rec("…and writes nothing", JSON.stringify(treeHash(W.MOD)) === JSON.stringify(t0));

    const w = await post(build(writeText));
    rec("⭐ the confirmed redraw is written", w.status === 200 && w.body.ok === true && w.body.written > 0, w.body);
    rec("…with the region names written into Nova's own names file", w.body.regionNames && w.body.regionNames.written > 0 && !w.body.regionNames.error, w.body.regionNames);
    const locFile = path.join(W.MOD, "localisation", "english", "replace", "nova_region_names_l_english.yml");
    const loc = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    const md = require("./map-data.js");
    const m = md.buildMapModel({ modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] });
    const eastId = m.provinceToRegion[W.PROV.lakeSea];
    const east = m.strategicRegions.find((r) => +r.id === +eastId) || {};
    // the base game here ships no localisation, so the base key's name is written into Nova's names file from its file name
    rec("⭐⭐ the sea region holding the old lake is named from the base region it lies in (\"East Sea\"), by that region's own key", east.name === "STRATEGICREGION_5" && new RegExp(`${east.name}:\\d*\\s*"East Sea"`).test(loc), { eastId, name: east.name, loc: loc.slice(0, 600) });
    const defined = new Set((loc.match(/^\s*([A-Za-z0-9_.]+):/gm) || []).map((l) => l.trim().replace(/:$/, "")));
    const unnamed = m.strategicRegions.filter((r) => r.provinces.length && !defined.has(r.name));
    rec("every region that holds provinces has a name", unnamed.length === 0, { unnamed: unnamed.map((r) => `${r.id}:${r.name}`), defined: [...defined] });
    const values = (loc.match(/"[^"]*"/g) || []);
    rec("no two regions share a display name", new Set(values).size === values.length, values);
    // the dialog's counts add up, and island seas are sea regions
    rec("the plan's land, sea and lake regions add up to its total", s.landRegions + s.seaRegions + (s.lakeRegions || 0) === s.regions && s.seaRegions >= (s.islandSeaRegions || 0), s);
    // ⭐ #a-second-redraw-promises-nothing: a second dry run on the redrawn map has nothing to write, and the dialog says so
    const again = await post(build(dryText));
    const ah = again.body.summary && redrawRegionsBody ? redrawRegionsBody(again.body.summary) : "";
    rec("⭐ a second press finds nothing to write, and the dialog says the regions already match", again.body.ok && again.body.summary.nothingToWrite === true && /already match/.test(ah) && !/Writes/.test(ah), { summary: again.body.summary, ah });

    // ⛔ #a-second-redraw-keeps-stale-names — the land changes and the map is redrawn again. Names an earlier redraw wrote are
    // Nova's own and are redone; no two regions may end up sharing a display name (review of 60ed681: a kept "East Sea" and a
    // new "East Sea"). Two new states of land in the east sea, cols 14-15 rows 4-7:
    const defFile = path.join(W.MOD, "map", "definition.csv");
    const raise = [W.idAt(14, 4), W.idAt(15, 4), W.idAt(14, 5), W.idAt(15, 5), W.idAt(14, 6), W.idAt(15, 6), W.idAt(14, 7), W.idAt(15, 7)];
    fs.writeFileSync(defFile, fs.readFileSync(defFile, "utf8").split("\n").map((l) => { const c = l.split(";"); return raise.includes(+c[0]) ? [c[0], c[1], c[2], c[3], "land", "true", "plains", "1"].join(";") : l; }).join("\n"));
    fs.writeFileSync(path.join(W.MOD, "history", "states", "20-S.txt"), `state={\n\tid=20\n\tname="STATE_20"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${raise.slice(0, 4).join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
    fs.writeFileSync(path.join(W.MOD, "history", "states", "21-S.txt"), `state={\n\tid=21\n\tname="STATE_21"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${raise.slice(4).join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
    const w2 = await post(build(writeText));
    rec("the redraw after the land changed is written", w2.status === 200 && w2.body.ok === true, w2.body);
    const loc2 = fs.readFileSync(locFile, "utf8");
    const m2 = md.buildMapModel({ modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] });
    const value = (k) => { const mm = new RegExp(`^\\s*${k}:\\d*\\s*"([^"]*)"`, "m").exec(loc2); return mm ? mm[1] : null; };
    const shown = m2.strategicRegions.filter((r) => r.provinces.length).map((r) => ({ id: r.id, key: r.name, name: value(r.name) }));
    rec("every region that holds provinces still has a name", shown.every((x) => x.name), shown);
    const names = shown.map((x) => x.name);
    rec("⭐⭐ no two regions share a display name after a second redraw", new Set(names).size === names.length, shown);
    // …and the rule underneath it (#a-redraw-keeps-the-modders-names). Nova's own names file is shared with the map editor's
    // ✎ Rename, so a name there is the redraw's to redo only while it still holds what the redraw recorded writing:
    //   · stale: the file AND the record both say "OLD AUTO NAME" — an earlier redraw's name → redone
    //   · renamed: renamed through the page's own request (set-region-name, as Save posts it) → the modder's, kept
    //   · theirs: defined in a loc file of the modder's own → kept, and not overwritten in Nova's file either
    // two NOVA_REGION_ keys, and a base region's key whose name the redraw wrote itself (this base game ships no localisation)
    const novaOnes = shown.filter((x) => /^NOVA_REGION_\d+$/.test(x.key));
    const renamedOne = shown.find((x) => /^STRATEGICREGION_\d+$/.test(x.key) && new RegExp(`^[ \\t]*${x.key}:`, "m").test(loc2));
    rec("the fixture has two regions named by Nova and one by a base key Nova named", novaOnes.length >= 2 && !!renamedOne, shown);
    const [staleOne, theirsOne] = novaOnes;
    fs.writeFileSync(locFile, fs.readFileSync(locFile, "utf8").replace(new RegExp(`(^[ \\t]*${staleOne.key}:\\d*[ \\t]*)"[^"]*"`, "m"), (_m, p) => `${p}"OLD AUTO NAME"`));
    const recordPath = md.regionNameRecordPath(W.MOD);
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    rec("the redraw kept a record of the names it wrote", record[staleOne.key] === staleOne.name, { key: staleOne.key, recorded: record[staleOne.key] });
    record[staleOne.key] = "OLD AUTO NAME";
    fs.writeFileSync(recordPath, JSON.stringify(record));
    const rn = await fetch(base + "/api/map/set-region-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameKey: renamedOne.key, name: "Sea of Storms", modPath: W.MOD }) }).then((r) => r.json());
    rec("the region is renamed through the map editor's own request", rn && rn.ok !== false, rn);
    fs.writeFileSync(path.join(W.MOD, "localisation", "english", "my_names_l_english.yml"), `﻿l_english:\n ${theirsOne.key}:0 "MY OWN NAME"\n`);
    // the dry run first: a name out of date and a line of Nova's hiding the modder's are both something to write, and the
    // dialog says so (second review: the dry run called a stale name "nothing to write")
    const d3 = await post(build(dryText));
    const h3 = redrawRegionsBody ? redrawRegionsBody(d3.body.summary || {}) : "";
    rec("⭐⭐ the dry run counts the name out of date and the line hiding the modder's, and the dialog says both",
      d3.body.ok && d3.body.summary.nothingToWrite === false && d3.body.summary.namesStale >= 1 && d3.body.summary.namesHidden >= 1 && /out of date/.test(h3) && /hidden by a line in Nova's names file/.test(h3),
      { summary: d3.body.summary, h3: h3.slice(-400) });
    const w3 = await post(build(writeText));
    const loc3 = fs.readFileSync(locFile, "utf8");
    const v3 = (k) => { const mm = new RegExp(`^[ \\t]*${k}:\\d*[ \\t]*"([^"]*)"`, "m").exec(loc3); return mm ? mm[1] : null; };
    rec("⭐⭐ a name an earlier redraw wrote, still as it wrote it, is redone", w3.body.ok && v3(staleOne.key) === staleOne.name, { key: staleOne.key, now: v3(staleOne.key), want: staleOne.name, names: w3.body.regionNames });
    rec("⭐⭐⭐ a name the modder typed through Rename is kept", v3(renamedOne.key) === "Sea of Storms", { key: renamedOne.key, now: v3(renamedOne.key) });
    // …and Nova's own line for it goes: Nova's file is under replace/, which wins, so the line it had would have shown instead of
    // theirs in game (second review of the redraw's names; followRenameInOtherLanguages already dropped such a line)
    rec("⭐⭐ a name the modder wrote in their own loc file is kept, and Nova's line that would hide it is removed", w3.body.regionNames && w3.body.regionNames.kept >= 2 && w3.body.regionNames.dropped >= 1 && v3(theirsOne.key) === null
      && /MY OWN NAME/.test(fs.readFileSync(path.join(W.MOD, "localisation", "english", "my_names_l_english.yml"), "utf8")), { key: theirsOne.key, inNovaFile: v3(theirsOne.key), names: w3.body.regionNames });

    // #a-names-left-unwritten — a region whose key has no name (a names write that failed, a line removed) is something to
    // write: the next press must offer Redraw, not "already match" with the button hidden
    fs.writeFileSync(locFile, fs.readFileSync(locFile, "utf8").split(/\r?\n/).filter((l) => !new RegExp(`^[ \\t]*${staleOne.key}:`).test(l)).join("\n"));
    const d4 = await post(build(dryText));
    const h4 = redrawRegionsBody ? redrawRegionsBody(d4.body.summary || {}) : "";
    rec("⭐⭐ a region with no name makes the next press something to write", d4.body.ok && d4.body.summary.nothingToWrite === false && d4.body.summary.namesMissing >= 1 && /no name yet/.test(h4) && !/already match/.test(h4), { summary: d4.body.summary, h4: h4.slice(0, 200) });

  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
