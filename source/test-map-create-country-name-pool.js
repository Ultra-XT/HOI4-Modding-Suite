// #map-create-country-skips-the-name-pool — THE FOURTH CREATOR NEVER ADOPTED THE FIX.
//
// A country needs a common/names pool as well as a graphical_culture. Vanilla ships both together for 360 of
// the 364 tags that declare a culture, and without a pool HOI4 cannot name generated characters: aces,
// operatives and officers come out blank and the log reads "Failed to generate a name for a character".
//
// Three of Nova's four country creators call seedCountryNameList — the new-mod wizard, Country Setup, and
// the all-countries grant. /api/map/create-country did not, and that is the one the RECOMMENDED flow ends
// at: Country Setup's "Draw it on the Map" hands straight over to it. So the path Nova itself steers a
// first-time author down was the one path that produced a country which could not name its own people.
//
// The same seam dropped the CULTURE. Country Setup's dialog is the only place that asks for it; the Map has
// no picker and sent none, so the endpoint's western_european_gfx default overwrote whatever the author had
// chosen a moment earlier — and then the name pool was seeded to match that default.
//
// ⚠️ The control that matters is the one where no culture is supplied: the Map is still reachable directly,
// and the default must survive untouched. A fix that simply always sends something would pass every other
// check here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapnames-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const n = "MAPN" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
const braceBalance = (t) => {
  let d = 0, q = false;
  for (const c of t.replace(/#.*$/gm, "")) { if (c === '"') q = !q; else if (!q && c === "{") d++; else if (!q && c === "}") d--; }
  return d;
};
const poolOf = (mod, tag) => {
  try { return fs.readFileSync(path.join(mod, "common", "names", `nova_${tag}_names.txt`), "utf8"); }
  catch (_) { return ""; }
};
// Resolve the country's definition the way HOI4 does: common/country_tags maps the tag to a path under
// common/. Scanning common/countries for "a file mentioning the tag" instead picks up colors.txt, which the
// create also appends to — a helper that finds the wrong file reports a defect that is not there.
const definitionOf = (mod, tag) => {
  const tagsDir = path.join(mod, "common", "country_tags");
  try {
    for (const f of fs.readdirSync(tagsDir)) {
      if (!f.endsWith(".txt")) continue;
      const t = fs.readFileSync(path.join(tagsDir, f), "utf8").replace(/#.*$/gm, "");
      const m = new RegExp("^\\s*" + tag + '\\s*=\\s*"([^"]+)"', "mi").exec(t);
      if (m) return fs.readFileSync(path.join(mod, "common", m[1]), "utf8");
    }
  } catch (_) {}
  return "";
};

let PORT = 50502;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the structural point] the other creators all seed a pool");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const calls = (SRV.match(/seedCountryNameList\(/g) || []).length - 1; // minus the declaration
      console.log("     seedCountryNameList call sites: " + calls);
      rec("every country creator reaches the seeder — this endpoint was the odd one out",
        calls >= 4, calls);
    }

    const states = (() => {
      const dir = path.join(GAME, "history", "states");
      if (!fs.existsSync(dir)) return [];
      const ids = [];
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).slice(0, 40)) {
        const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(dir, f), "latin1"));
        if (m) ids.push(Number(m[1]));
        if (ids.length >= 2) break;
      }
      return ids;
    })();
    if (states.length < 2) {
      console.log("\n  (no HOI4 install — the writing half cannot be exercised; the seam checks still run)");
    }

    api = await serve(createApp());

    if (states.length >= 2) {
      console.log("\n[creating a country on the Map] it gets a pool, like the other three creators");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ATL", name: "Atlantis", rgb: [63, 167, 214],
          stateIds: states, capitalStateId: states[0],
        });
        rec("the country is created", r.ok === true, r);
        rec("…and the reply names the pool it wrote", r.nameList && r.nameList.file, r.nameList);
        const txt = poolOf(mod, "ATL");
        rec("…which is on disk", txt.length > 0, "no nova_ATL_names.txt");
        rec("…declaring the new tag", /^ATL\s*=\s*\{/m.test(txt), txt.slice(0, 200));
        rec("…with names and surnames in it",
          /names\s*=\s*\{[^}]*[A-Za-z]/.test(txt) && /surnames\s*=\s*\{[^}]*[A-Za-z]/.test(txt), txt.slice(0, 400));
        rec("…brace-balanced", braceBalance(txt) === 0, braceBalance(txt));
        rec("…and NOT named 00_names.txt, which would replace vanilla's wholesale",
          !fs.existsSync(path.join(mod, "common", "names", "00_names.txt")), "wrote 00_names.txt");
      }

      console.log("\n[the culture reaches the country AND the pool]");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ATB", name: "Eastlands", rgb: [10, 20, 30],
          stateIds: states, capitalStateId: states[0], culture: "asian_gfx",
        });
        rec("the country is created", r.ok === true, r);
        rec("…written with the culture that was asked for",
          /graphical_culture\s*=\s*asian_gfx/.test(definitionOf(mod, "ATB")), definitionOf(mod, "ATB").slice(0, 200));
        const txt = poolOf(mod, "ATB");
        rec("…and the pool was seeded from that same culture",
          /same graphical culture \(asian_gfx\)/.test(txt), txt.slice(0, 400));
      }

      console.log("\n[⚠️ CONTROL — no culture supplied] the Map is still reachable directly");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ATC", name: "Westlands", rgb: [30, 20, 10],
          stateIds: states, capitalStateId: states[0],
        });
        rec("the country is created", r.ok === true, r);
        rec("…keeping the endpoint's own default",
          /graphical_culture\s*=\s*western_european_gfx/.test(definitionOf(mod, "ATC")),
          definitionOf(mod, "ATC").slice(0, 200));
        rec("…and it still gets a pool", poolOf(mod, "ATC").length > 0, "no pool");
        rec("…seeded from that default rather than from nothing",
          /same graphical culture \(western_european_gfx\)/.test(poolOf(mod, "ATC")), poolOf(mod, "ATC").slice(0, 400));
      }

      console.log("\n[CONTROL — a failed create writes no pool] nothing half-made is left behind");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ATD", name: "Nowhere", rgb: [1, 2, 3],
          stateIds: [], capitalStateId: null,
        });
        rec("a claim with no states is refused", r.ok !== true, r);
        rec("…and no pool was written for it", poolOf(mod, "ATD") === "", "a pool was left behind");
      }
    }

    console.log("\n[the hand-over] the culture survives the trip from Country Setup to the Map");
    {
      const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
      const MJ = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      rec("Country Setup reads the culture it asked the author for",
        /getElementById\("ccGraphicalCulture"\)/.test(CS), "the picker is never read for the hand-over");
      rec("…and carries it in the link", /q\.set\("newculture", culture\)/.test(CS), "not carried");
      rec("the Map reads it back", /q\.get\("newculture"\)/.test(MJ), "not parsed");
      rec("…into the pending country", /culture: \/\^\[a-z0-9_\]\{1,64\}\$\/\.test\(nCulture\)/.test(MJ), "not stored");
      rec("…and sends it on to the create",
        /pendingCountry && pendingCountry\.culture \? \{ culture: pendingCountry\.culture \} : \{\}/.test(MJ),
        "the create body still omits it");
      rec("…only when there is one, so a direct visit keeps the server's default",
        /\.\.\.\(pendingCountry && pendingCountry\.culture/.test(MJ), "sent unconditionally");
    }

    api.stop(); api = null;
    console.log(`\n=== map create country name pool: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
