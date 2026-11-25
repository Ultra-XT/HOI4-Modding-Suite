// A country file a mod does not load is not copied into it: setting a capital or removing a country in a mod that replaces
// history/countries reads only the country files that mod loads.
// #a-country-file-the-mod-does-not-load-is-not-copied-in
//
// findCountryHistoryFiles (map-data.js) lists a tag's history/countries files, base layers first and the mod's over them by name.
// It read the base layers through baseRootsFor, which honours a dependency's replace_path and never the active mod's. A mod that
// declares replace_path="history/countries" loads none of the base game's country files, but they were listed anyway, so:
//   · setCountryCapital (POST /api/map/set-capital, the Map page's capital click) found the base game's file for a tag the mod has no
//     file for and wrote a copy of it into the mod with the capital changed — the base game's oob, technologies and politics included,
//     into a total conversion that had replaced them. Measured on 9e6e578 (batch 8 probe-A-callers.js): "AAA - Aland.txt" arrived in
//     the mod carrying `oob = "AAA_1936"` and `set_technology`.
//   · deleteCountry (POST /api/map/delete-country) accepted a tag the mod does not load at all and wrote a stub over a file that never
//     loads, with a snapshot of it, instead of saying the country is not on the map.
// Every shipping total conversion measured declares this replace_path (MD, OWB, NV, RoN, workshop 3721160655). layersBelow is the
// sibling that answers "what loads beneath this mod".
//
// Requests are the page's: queueWrite("/api/map/set-capital", { tag: owner, stateId: sid }) (flushMapSaves adds modPath), and
// fetch("/api/map/delete-country", { body: JSON.stringify({ modPath: modPath(), tag, reassignTo }) }).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b8-country-files-replace-path");
const AAA = 'capital = 1\noob = "AAA_1936"\nset_technology = {\n\tinfantry_weapons = 1\n}\n';
lib.write(world.GAME, {
  "history/countries/AAA - Aland.txt": AAA,
  "history/countries/CCC - Cee.txt": 'capital = 3\noob = "CCC_1936"\n',
});
const { createApp } = require("./server.js");

const countryFiles = (mod) => { const d = path.join(mod, "history", "countries"); try { return fs.readdirSync(d).sort(); } catch (_) { return []; } };
const readCountry = (mod, f) => { try { return fs.readFileSync(path.join(mod, "history", "countries", f), "utf8"); } catch (_) { return ""; } };

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("the page still queues set-capital as { tag: owner, stateId: sid }", /queueWrite\("\/api\/map\/set-capital", \{ tag: owner, stateId: sid \}\)/.test(MAP));
      rec("…and posts delete-country as { modPath: modPath(), tag, reassignTo }", /fetch\("\/api\/map\/delete-country", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\), tag, reassignTo \}\) \}\)/.test(MAP));
    }
    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("\n1. ⭐⭐⭐ Set AAA's capital in a mod that replaces history/countries and has no file for AAA");
    {
      const mod = world.mod("capital replace", {
        "descriptor.mod": 'name="capital replace"\nsupported_version="1.*"\nreplace_path="history/countries"\n',
        "history/countries/BBB - Bee.txt": "capital = 2\n",
      });
      const m0 = await model(mod);
      rec("CONTROL: the mod loads no capital for AAA", !Object.prototype.hasOwnProperty.call(m0.capitals || {}, "AAA"), m0.capitals);
      const r = await srv.post("/api/map/set-capital", { tag: "AAA", stateId: 2 }, mod);
      rec("set-capital answers 200 ok", r.status === 200 && r.body.ok === true, r.body);
      const carrying = countryFiles(mod).filter((f) => /AAA_1936|set_technology/.test(readCountry(mod, f)));
      rec("⭐⭐⭐ no file in the mod carries the base game's AAA oob or technologies", carrying.length === 0, { carrying, files: countryFiles(mod) });
      const aaa = countryFiles(mod).filter((f) => /^AAA\b/i.test(f));
      rec("⭐⭐ AAA's file in the mod sets the capital and nothing else", aaa.length === 1 && readCountry(mod, aaa[0]).trim() === "capital = 2", aaa.map((f) => [f, readCountry(mod, f)]));
      rec("⭐ the model shows AAA's capital at state 2", ((await model(mod)).capitals || {}).AAA === 2, (await model(mod)).capitals);
    }

    console.log("\n2. CONTROL: a mod that loads the base game's AAA file overrides it whole, capital changed and the rest kept");
    {
      const mod = world.mod("capital plain", {});
      const r = await srv.post("/api/map/set-capital", { tag: "AAA", stateId: 2 }, mod);
      const txt = readCountry(mod, "AAA - Aland.txt");
      rec("set-capital answers 200 ok and copies the loaded file under its own name", r.status === 200 && r.body.ok === true && countryFiles(mod).includes("AAA - Aland.txt"), { body: r.body, files: countryFiles(mod) });
      rec("…with capital = 2 and the oob and technologies kept", /capital = 2/.test(txt) && /oob = "AAA_1936"/.test(txt) && /set_technology/.test(txt), txt);
    }

    console.log("\n3. ⭐⭐ Remove CCC, a country a mod that replaces history/countries does not load at all");
    {
      const mod = world.mod("remove replace", {
        "descriptor.mod": 'name="remove replace"\nsupported_version="1.*"\nreplace_path="history/countries"\n',
        "history/countries/BBB - Bee.txt": "capital = 2\n",
      });
      const r = await srv.post("/api/map/delete-country", { tag: "CCC", reassignTo: "" }, mod);
      rec("⭐⭐ it is told CCC is not on the map", r.status === 400 && r.body.ok === false && /isn't present on the map/.test(String(r.body.error || "")), { status: r.status, body: r.body });
      rec("⭐⭐ …and no stub over a file that never loads is written", !countryFiles(mod).some((f) => /^CCC\b/i.test(f)), countryFiles(mod));
      // (⛔ #a-removal-archive-lives-outside-the-mod, B2-28: it would be in Nova's store for the mod; an older Nova put it in the mod's .nova)
      rec("⭐ …and no removal snapshot is taken", !fs.existsSync(path.join(require("./map-data.js").removedCountriesDir(mod), "CCC.json"))
        && !fs.existsSync(path.join(mod, ".nova", "removed_countries", "CCC.json")));
    }

    console.log("\n4. CONTROL: in a mod that loads CCC's base file, removing CCC shadows that file with a stub");
    {
      const mod = world.mod("remove plain", {});
      const r = await srv.post("/api/map/delete-country", { tag: "CCC", reassignTo: "" }, mod);
      rec("delete-country answers ok and writes the stub under the base file's name", r.status === 200 && r.body.ok === true && countryFiles(mod).includes("CCC - Cee.txt") && !/capital/.test(readCountry(mod, "CCC - Cee.txt").replace(/#[^\n]*/g, "")), { body: r.body, files: countryFiles(mod) });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a country file a mod does not load is not copied into it: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
