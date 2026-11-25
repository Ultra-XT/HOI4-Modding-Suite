// #tech-picker-reads-the-wrong-key — A PICKER THAT COULD NEVER, ONCE, SHOW ANYTHING.
//
// The Decisions and Events makers both offer a "technology" quick-insert chip beside every script box. Both
// read the catalogue like this:
//     items = (data.items || data || []).map(t => ({ id: t.id, name: t.name || t.id }));
// /api/technologies/catalog answers `{ technologies, equipments, customTabs, researchPreview, baseModTechs }`
// — there is no `items`. So `data.items` is undefined, the `|| data` fallback yields a plain OBJECT, `.map`
// is not a function, it throws, and the surrounding catch writes "Failed to load items." into the dialog.
// Not "sometimes": every single time, for every mod. The spirit/event/decision tabs of the same dialog work,
// so it reads as a data problem rather than a bug.
//
// 🈯 The identical defect was already found and fixed once, in public/app.js:9910, and its comment describes
// exactly this chain — "Reading `payload.items` was undefined → it fell through to the `|| payload` fallback
// (a plain object) → `.map` threw → the Set-Technology picker was ALWAYS empty". Two siblings never adopted
// it. public/research.js also reads the real key.
//
// This test replays the CLIENT'S OWN EXPRESSION, lifted out of the shipped file, against the REAL endpoint —
// so it measures what the page does, not what a copy of the page would do.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techpick-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

// Pull the mapping expression out of the shipped page and run it. Copying it here instead would let the page
// be fixed, or re-broken, without this test noticing.
function clientMapper(file) {
  const src = fs.readFileSync(path.join(__dirname, "public", file), "utf8");
  const m = /items = \((data[^)]*)\)\.map\(t => \(\{ id: t\.id, name: t\.name \|\| t\.id \}\)\);/.exec(src);
  if (!m) return null;
  // eslint-disable-next-line no-new-func
  return { expr: m[1], fn: Function("data", `return (${m[1]}).map(t => ({ id: t.id, name: t.name || t.id }));`) };
}

let PORT = 51970;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });

    console.log("\n[the endpoint] what /api/technologies/catalog actually answers");
    // The exact query the two pages build: includeVanilla + includeActiveMod + sourcePath + lite=1.
    const qs = new URLSearchParams({ includeVanilla: "1", includeActiveMod: "1", sourcePath: GAME, lite: "1" });
    const data = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?${qs}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const keys = Object.keys(data || {});
    console.log(`     top-level keys: ${JSON.stringify(keys)}`);
    rec("the endpoint answers", keys.length > 0 && !data.error, data && data.error);
    rec("…under `technologies`", Array.isArray(data.technologies) && data.technologies.length > 100, (data.technologies || []).length);
    rec("…and there is no `items` key at all", data.items === undefined, data.items);

    console.log("\n[the pages] each one's own expression, run against that response");
    for (const file of ["decisions.js", "events.js"]) {
      const mapper = clientMapper(file);
      rec(`${file}: the mapping expression is findable`, !!mapper, "pattern not found — was it rewritten?");
      if (!mapper) continue;
      console.log(`     ${file} maps from: ${mapper.expr}`);
      let out = null, threw = null;
      try { out = mapper.fn(data); } catch (e) { threw = e.message; }
      rec(`${file}: it does not throw`, !threw, threw);
      rec(`${file}: …and yields the technologies`, Array.isArray(out) && out.length > 100, out ? out.length : threw);
      rec(`${file}: …each with an id`, Array.isArray(out) && out.every((t) => t && typeof t.id === "string" && t.id), (out || []).slice(0, 2));
      if (Array.isArray(out) && out.length) console.log(`     ${file} first row: ${JSON.stringify(out[0])}`);
      // The picker is a NAME picker; ids alone would make it as useless as the empty list it replaced.
      const named = (out || []).filter((t) => t.name && t.name !== t.id).length;
      console.log(`     ${file}: ${named} of ${(out || []).length} rows carry a real name`);
      rec(`${file}: …and most carry a resolved name`, named > 200, named);
    }

    console.log("\n[CONTROL] the already-correct sibling still reads the real key");
    {
      // app.js was fixed for this exact defect; if a sweep 'tidied' it back the picker would break again.
      const app = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      rec("app.js still reads payload.technologies first", /payload\.technologies \|\| payload\.items/.test(app), "the fixed sibling regressed");
    }

    console.log("\n[CONTROL] no page reads a bare `data` as an array again");
    {
      // `(x.items || x || [])` is the shape that turns a missing key into a plain object and then throws.
      const offenders = [];
      for (const f of fs.readdirSync(path.join(__dirname, "public")).filter((f) => f.endsWith(".js"))) {
        const s = fs.readFileSync(path.join(__dirname, "public", f), "utf8");
        for (const m of s.matchAll(/\(\s*(\w+)\.items \|\| \1 \|\| \[\]\s*\)/g)) offenders.push(`${f}: ${m[0]}`);
      }
      rec("the `(x.items || x || [])` shape is gone from every page", offenders.length === 0, offenders);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== tech picker reads the real key: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
