// Nova never writes into a Steam Workshop download, whichever writer asks: the shared write gate refuses it in one plain sentence.
// ⛔ #nova-wrote-into-a-workshop-download (B2-20, B0-4)
//
// THE DEFECT (campaign B2-20, verified 2026-11-13; B0-4 is its root cause). The subscribed Workshop item of The Road to 56
// (820260968) held ✨ New country's output from 2026-07-19 — zz_nova_countries.txt (Z00, Z01), their country and history files, and a
// colors.txt.bak beside colors.txt — so every copy of that mod started with Nova's own FATAL country_tag_after_dynamic_marker. Rise of
// Nations held five newspaper-style files applied from another Workshop item, and on 2026-11-05 Nova wrote a names file into Workshop
// 2624254320 again. Only the world run refused a Workshop folder; safeModWrite's gate (assertModWritablePath) refused the HOI4 user
// folder, the game folder and copies the game does not load, and let every other writer into the Workshop.
//
// A Workshop download is its author's: Steam puts the author's files back whenever the author updates it, and a file Nova added stays
// behind in it. Now the gate refuses any write under a Workshop content root, before anything is touched, and says what to do. A
// modder's own mod folder is never refused.
//
// Driven three ways: the gate itself (server.js assertModWritablePath), safe-write.js's safeModWrite (every writer's one door, as
// server.js configures it), and the state panel's own request (stageStateWrite's set-state body, as flushMapSaves posts it).
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

// The world and the decoy Workshop exist BEFORE server.js is required: it decides its roots while it loads.
const world = lib.makeWorld("b2-20-workshop");
const WS = path.join(world.ROOT, "steam", "steamapps", "workshop", "content", "394360");
fs.mkdirSync(WS, { recursive: true });
process.env.HOI4_WORKSHOP_ROOT = WS;
const ITEM = path.join(WS, "820260968");
lib.write(ITEM, {
  "descriptor.mod": 'name="A Workshop Mod"\nsupported_version="1.*"\n',
  "history/states/1-A.txt": lib.st(1, "4"),
  "common/countries/colors.txt": "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\n",
});
const OWN = world.mod("My Own Mod", { "history/states/1-A.txt": lib.st(1, "4") });

const SW = require("./safe-write.js");
const server = require("./server.js");
const { createApp, assertModWritablePath } = server;
const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const SAFE = maskJsComments(fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8"));
const bodyOf = (src, sig) => {
  const at = src.indexOf(sig);
  if (at < 0) return "";
  let d = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return "";
};
const refusalOf = (fn) => { try { fn(); return ""; } catch (e) { return String((e && e.message) || e); } };
const SENTENCE = /Steam Workshop download/;

(async () => {
  let srv = null;
  try {
    console.log("0. The gate, as the source has it");
    const gate = bodyOf(SERVER, "function assertModWritablePath(");
    rec("⭐ assertModWritablePath asks assertNotAWorkshopDownload", /assertNotAWorkshopDownload\(absPath\);/.test(gate), gate);
    const own = bodyOf(SERVER, "function assertNotAWorkshopDownload(");
    rec("⭐ …which judges the path against every Workshop content root (workshopContentRoots, the world run's own list)", /workshopContentRoots\(\)/.test(own) && /isUnderAnyRoot\(/.test(own), own.slice(0, 400));
    rec("the world run's own refusal judges the same roots", /isUnderAnyRoot\(modRoot, workshopContentRoots\(\)\)/.test(SERVER));
    const write = bodyOf(SAFE, "function safeModWrite(");
    rec("safeModWrite asks the gate (cfg.assertWritable) before it backs up or writes anything",
      /^function safeModWrite\([^)]*\) \{\s*assertNotStrayWrite\(absPath\);\s*cfg\.assertWritable\(absPath\);/.test(write), write.slice(0, 200));
    rec("…and server.js hands it this gate", /safeWrite\.configure\(\{[\s\S]{0,80}assertWritable: assertModWritablePath,/.test(SERVER));

    console.log("\n1. ⛔ The gate itself");
    const inItem = path.join(ITEM, "common", "country_tags", "zz_nova_countries.txt");
    const why = refusalOf(() => assertModWritablePath(inItem));
    rec("⭐⭐⭐ a file inside a Workshop download is refused", SENTENCE.test(why), why);
    rec("⭐⭐ …in one plain sentence: whose it is, that Steam overwrites it, and what to do instead",
      /which is its author's/.test(why) && /Steam overwrites it/.test(why) && /Copy it into your own mod folder first/.test(why) && /Nothing was written\./.test(why), why);
    rec("⭐ …naming the Workshop item's folder, not the file", why.indexOf(ITEM) !== -1 && why.indexOf("zz_nova_countries") === -1, why);
    rec("⭐ the Workshop content folder itself is refused too", SENTENCE.test(refusalOf(() => assertModWritablePath(path.join(WS, "stray.txt")))));
    rec("⭐⭐⭐ THE CONTROL: the modder's own mod folder is not refused", refusalOf(() => assertModWritablePath(path.join(OWN, "history", "states", "1-A.txt"))) === "");
    rec("⭐⭐ …nor a folder that only looks like one (a sibling named like the content root)",
      refusalOf(() => assertModWritablePath(path.join(path.dirname(WS), "394360-backup", "x", "common", "x.txt"))) === "");

    console.log("\n2. ⛔ safeModWrite, the one door every writer uses");
    const fresh = path.join(ITEM, "common", "names", "nova_TSL_names.txt");
    const swWhy = refusalOf(() => SW.safeModWrite(fresh, "TSL = {}\n", "test"));
    rec("⭐⭐⭐ a new file into the Workshop download is refused", SENTENCE.test(swWhy), swWhy);
    rec("⭐⭐⭐ …and nothing was made: no file, no folder", !fs.existsSync(fresh) && !fs.existsSync(path.dirname(fresh)));
    const colors = path.join(ITEM, "common", "countries", "colors.txt");
    const colorsBefore = fs.readFileSync(colors, "utf8");
    const owWhy = refusalOf(() => SW.safeModWrite(colors, colorsBefore + "Z00 = {\n\tcolor = rgb { 1 2 3 }\n}\n", "test"));
    rec("⭐⭐⭐ overwriting one of its files is refused", SENTENCE.test(owWhy), owWhy);
    rec("⭐⭐⭐ …the file is as it was, and no .bak or temp file was left beside it",
      fs.readFileSync(colors, "utf8") === colorsBefore && fs.readdirSync(path.dirname(colors)).join("|") === "colors.txt", fs.readdirSync(path.dirname(colors)));
    const ownFile = path.join(OWN, "common", "names", "nova_TSL_names.txt");
    fs.mkdirSync(path.dirname(ownFile), { recursive: true });   // (safeModWrite writes into a folder its caller made)
    const ownWhy = refusalOf(() => SW.safeModWrite(ownFile, "TSL = {}\n", "test"));
    rec("THE CONTROL: the same write into the modder's own mod goes through", ownWhy === "" && fs.existsSync(ownFile) && fs.readFileSync(ownFile, "utf8") === "TSL = {}\n", ownWhy);

    console.log("\n3. ⛔ The state panel's own Save, aimed at the Workshop download");
    srv = await lib.startServer(createApp);
    const before = lib.tree(ITEM);
    // stageStateWrite's body for a population typed into the panel; flushMapSaves adds modPath
    const r = await srv.post("/api/map/set-state", { stateId: 1, nameKey: "STATE_1", fields: { manpower: 777 } }, ITEM);
    rec("⭐⭐⭐ the Save is refused, and says why", r.body.ok !== true && SENTENCE.test(JSON.stringify(r.body)), r);
    rec("⭐⭐⭐ …and the Workshop download is byte-for-byte as it was", lib.written(before, lib.tree(ITEM)).length === 0, lib.written(before, lib.tree(ITEM)));
    const rn = await srv.post("/api/map/set-state", { stateId: 1, nameKey: "STATE_1", fields: { displayName: "Workshopia" } }, ITEM);
    // (refused by the mod-root gate now, before the name is asked: the sentence is the answer's error — review of 8f4500a3, R1)
    rec("⭐⭐ a rename alone is refused as a failed save (not ok), and says why", rn.body.ok !== true && SENTENCE.test(String(rn.body.error || rn.body.nameRefused || "")) && rn.body.renamed !== true, rn);
    rec("⭐⭐ …and nothing was written for it either", lib.written(before, lib.tree(ITEM)).length === 0, lib.written(before, lib.tree(ITEM)));
    const ownBefore = fs.readFileSync(path.join(OWN, "history", "states", "1-A.txt"), "utf8");
    const c = await srv.post("/api/map/set-state", { stateId: 1, nameKey: "STATE_1", fields: { manpower: 777 } }, OWN);
    const ownAfter = fs.readFileSync(path.join(OWN, "history", "states", "1-A.txt"), "utf8");
    rec("THE CONTROL: the same Save on the modder's own mod is written", c.body.ok === true && ownAfter !== ownBefore && /manpower\s*=\s*777/.test(ownAfter), { res: c.body, ownAfter });
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a Workshop download is never written: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  else if (checks < 20) { console.log("   too few checks ran"); process.exitCode = 1; }
})();
