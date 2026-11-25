// #tech-picker-sends-a-param-nobody-reads — EVERY TECHNOLOGY PICKER LISTED VANILLA AND HID THE USER'S OWN.
//
// /api/technologies/catalog reads `req.query.modPath`. It has never read `sourcePath` — that spelling is
// /api/ideas/catalog's, and the technology picker was copied from the idea picker sitting a few lines above
// it. An unread query parameter is not an error: the handler just fell through to
// `getActiveRoot()`, so the list came back full and plausible and simply did not contain the mod being
// edited. Measured against a scratch mod defining two technologies:
//
//     sourcePath=<mod>   552 technologies, 0 of them the mod's        ← what the pickers sent
//     modPath=<mod>      554 technologies, 2 of them the mod's        ← what the endpoint reads
//     (neither)          552 technologies, 0 of them the mod's        ← byte-identical to sourcePath
//
// So a user who had just built a technology on the Research page could not reference it from a decision, an
// event, a focus effect, or a country's starting techs. Three pages, one copied line.
//
// ⭐ THE TELL, AGAIN: country-setup.js already sent `modPath` — but ADDED beside `sourcePath` rather than
// replacing it, so that page worked, the dead spelling survived to be copied twice more, and nothing
// recorded that it was dead. research.js sends `modPath` alone and was always right. "The fix exists next
// door and one caller never adopted it" is this codebase's most common bug by a distance.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tpmp-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const PUB = path.join(__dirname, "public");
const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "tpmod");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TpMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "tpmod.mod"), 'name="TpMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "technologies", "zz_nova_probe.txt"),
  "technologies = {\n\tnova_probe_tech_one = {\n\t\tresearch_cost = 2\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n\tnova_probe_tech_two = {\n\t\tresearch_cost = 2\n\t\tfolder = { name = infantry_folder position = { x = 1 y = 0 } }\n\t}\n}\n");

const PORT = 52931;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const hit = async (qs) => {
      const j = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?${qs}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const techs = j.technologies || [];
      return { n: techs.length, mine: techs.filter((t) => /^nova_probe_tech_/.test(t.id)).length };
    };
    const BASE = "includeVanilla=1&includeActiveMod=1&lite=1";
    const ENC = encodeURIComponent(MOD);

    console.log("\n[the endpoint] which spelling actually reaches it");
    const withMod = await hit(`${BASE}&modPath=${ENC}`);
    const withSource = await hit(`${BASE}&sourcePath=${ENC}`);
    const withNeither = await hit(BASE);
    console.log(`     modPath ${withMod.n} (${withMod.mine} mine) · sourcePath ${withSource.n} (${withSource.mine} mine) · neither ${withNeither.n} (${withNeither.mine} mine)`);
    // ⚠️ THE FIXTURE MUST HAVE THE PROPERTY BEING MEASURED. If the probe mod's technologies never parsed,
    // every count below would be 0 and every check would agree with every other — a green run measuring
    // nothing at all.
    rec("the fixture's own technologies are readable at all", withMod.mine === 2, withMod);
    rec("…and the catalogue is not otherwise empty", withMod.n > 100, withMod.n);
    rec("`sourcePath` does not reach the catalogue", withSource.mine === 0, withSource);
    rec("…it is indistinguishable from sending nothing", withSource.n === withNeither.n && withSource.mine === withNeither.mine, { withSource, withNeither });

    console.log("\n[the clients] every picker must send the spelling the endpoint reads");
    {
      // ⭐ DERIVED FROM THE SERVER, NOT TYPED HERE. If the endpoint is ever changed to read `sourcePath`
      // too, this test must follow it rather than keep enforcing yesterday's contract.
      const sv = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const at = sv.indexOf('app.get("/api/technologies/catalog"');
      const body = at === -1 ? "" : sv.slice(at, at + 2000);
      rec("the handler was located", at !== -1, "app.get(\"/api/technologies/catalog\") not found");
      const readsModPath = /req\.query\.modPath/.test(body);
      const readsSourcePath = /req\.query\.sourcePath/.test(body);
      console.log(`     the handler reads: modPath=${readsModPath} sourcePath=${readsSourcePath}`);
      rec("the handler reads modPath", readsModPath, body.slice(0, 200));
      rec("…and still does not read sourcePath", !readsSourcePath, "it now does — update the clients, not this test");

      // Every client that calls this endpoint, found by reading the files rather than by listing them here:
      // a sixth page added tomorrow is swept the day it is added.
      const callers = fs.readdirSync(PUB).filter((f) => f.endsWith(".js")).filter((f) => {
        const s = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
        return s.includes("/api/technologies/catalog");
      });
      console.log("     callers: " + callers.join(", "));
      rec("the caller set is real, not an empty sweep", callers.length >= 4, callers);

      const offenders = [];
      for (const f of callers) {
        const s = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
        // The call is built from a URLSearchParams a few lines above the fetch, so look at the whole file's
        // technology-catalogue neighbourhood rather than one line.
        const idx = s.indexOf("/api/technologies/catalog");
        const near = s.slice(Math.max(0, idx - 900), idx + 200);
        const sendsMod = /modPath/.test(near);
        const sendsSource = /sourcePath/.test(near);
        if (!sendsMod || sendsSource) offenders.push(`${f}(modPath=${sendsMod},sourcePath=${sendsSource})`);
      }
      rec("no caller sends the dead spelling, and all send the live one", offenders.length === 0, offenders);
    }

    console.log("\n[CONTROL] the dead spelling is not merely unused — it is a live param NEXT DOOR");
    {
      // Why this bug was invisible: `sourcePath` is not a typo, it is another endpoint's real parameter, so
      // it reads correctly to anyone skimming. If /api/ideas/catalog ever stops reading it this control
      // stops being meaningful and should be re-examined rather than deleted.
      const sv = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      rec("`sourcePath` is a real parameter somewhere in the API", /req\.query\.sourcePath/.test(sv),
        "nothing reads sourcePath any more — this bug's disguise is gone");
    }

    console.log("\n[the cache tags] a fixed page the browser never re-fetches is not fixed");
    {
      const tags = {};
      for (const h of fs.readdirSync(PUB).filter((f) => f.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(PUB, h), "utf8");
        for (const m of html.matchAll(/src="\.{0,2}\/?([A-Za-z0-9._-]+\.js)\?v=([A-Za-z0-9]+)"/g)) tags[m[1]] = m[2];
      }
      for (const f of ["app.js", "decisions.js", "events.js", "country-setup.js"]) {
        rec(`${f} is served with a cache tag`, !!tags[f], Object.keys(tags).slice(0, 6));
      }
    }

    console.log(`\n=== tech picker sends modPath: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
