// #country-file-name-collision — creating a country turned its free-text NAME straight into a file identity
// and wrote common/countries/<Name>.txt unconditionally, at all three creation paths.
//
// Two different failures at once:
//
//  1. It OVERWROTE the mod's own definition file — no existence check, no backup, and the write does not go
//     through safeModWrite, so there was nothing to recover from. Reuse a name you already used and the
//     earlier country's graphical_culture and colour are simply gone.
//
//  2. HOI4 resolves common/countries by relative path, so a name matching a base-game or dependency file
//     REPLACES that file wholesale (#no-shadow-write) — the new country hijacks a country that already
//     exists, and everything the original file defined disappears.
//
// Neither needs an unusual name: the collision IS a country name. Vanilla ships 432 files in
// common/countries and Millennium Dawn 469, including Bavaria, Kurdistan, Catalonia, Scotland, Tibet and
// Palestine — exactly what someone inventing a nation types.
//
// The fix renames the FILE, which is safe and invisible: HOI4 finds the definition through the country_tags
// entry (`TAG = "countries/<file>.txt"`), so the filename carries no meaning of its own. That makes the
// registration the thing to check — a renamed file with a stale tag line would point at nothing, which is why
// every case below asserts the tag entry and the file agree.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-countryfile-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const mapData = require("./map-data.js");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/countries", "common/country_tags", "history/countries", "history/states", "localisation/english"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CF"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "history", "states", "1.txt"),
  "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 100\n\tstate_category = rural\n\thistory = {\n\t\towner = OLD\n\t\tvictory_points = { 1 1 }\n\t}\n\tprovinces = { 1 }\n}\n", "utf8");

// The modder's own country definition, already in the mod.
const MINE = "# Kurdistan — hand-tuned by the modder\ngraphical_culture = middle_eastern_gfx\ngraphical_culture_2d = middle_eastern_2d\n\ncolor = { 244 200 21 } # our yellow\n";
const MINE_ABS = path.join(MOD, "common", "countries", "Kurdistan.txt");
fs.writeFileSync(MINE_ABS, MINE, "utf8");

// A pretend base game / dependency shipping its own Bavaria.txt, as vanilla and MD both do.
const BASE = path.join(ROOT, "fakebase");
fs.mkdirSync(path.join(BASE, "common", "countries"), { recursive: true });
const BASE_BAVARIA = path.join(BASE, "common", "countries", "Bavaria.txt");
fs.writeFileSync(BASE_BAVARIA, "graphical_culture = eastern_european_gfx\ncolor = { 1 2 3 }\n", "utf8");

const tagLineFor = (tag) => {
  let out = null;
  const dir = path.join(MOD, "common", "country_tags");
  for (const f of fs.readdirSync(dir)) {
    const m = new RegExp(`^\\s*${tag}\\s*=\\s*"countries/([^"]+)"`, "m").exec(fs.readFileSync(path.join(dir, f), "utf8"));
    if (m) out = m[1];
  }
  return out;
};

const PORT = 39913, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    // ── the helper itself, including the base-game/dependency case (no game install needed) ──────────
    const picked = mapData.pickCountryDefinitionFileName({
      modRoot: MOD, gameRoot: BASE, dependencyRoots: [], safeName: "Bavaria", tag: "Z31",
    });
    ok("a name that exists in the base game does not reuse that filename", picked !== "Bavaria.txt", picked);
    ok("…and the base game's own file is untouched",
      fs.readFileSync(BASE_BAVARIA, "utf8").includes("eastern_european_gfx"), "base file changed");
    const free = mapData.pickCountryDefinitionFileName({
      modRoot: MOD, gameRoot: BASE, dependencyRoots: [], safeName: "Wakanda", tag: "Z32",
    });
    ok("a name that collides with nothing keeps the plain filename", free === "Wakanda.txt", free);

    // ── /api/countries/create must not eat the modder's own Kurdistan.txt ────────────────────────────
    const r1 = await post("/api/countries/create", {
      modPath: MOD, tag: "Z20", name: "Kurdistan", capitalStateId: 1,
      color: "10 20 30", graphicalCulture: "western_european_gfx",
    });
    ok("creating a country whose name collides still succeeds", r1.s === 200 && r1.b && r1.b.ok !== false, r1.b);
    ok("the modder's existing Kurdistan.txt is byte-for-byte unchanged",
      fs.readFileSync(MINE_ABS, "utf8") === MINE, fs.readFileSync(MINE_ABS, "utf8").slice(0, 120));
    const z20File = tagLineFor("Z20");
    ok("the new country got its own file", z20File && z20File !== "Kurdistan.txt", z20File);
    ok("…and the tag registration points at a file that exists",
      z20File && fs.existsSync(path.join(MOD, "common", "countries", z20File)), z20File);
    ok("…which holds the NEW country's colour, not the old one's",
      /10 20 30/.test(fs.readFileSync(path.join(MOD, "common", "countries", z20File), "utf8")),
      fs.readFileSync(path.join(MOD, "common", "countries", z20File), "utf8"));

    // ── the Map's "✨ New country" path shares the same helper ───────────────────────────────────────
    const before = fs.readFileSync(MINE_ABS, "utf8");
    const r2 = await post("/api/map/create-country", {
      modPath: MOD, tag: "Z21", name: "Kurdistan", rgb: [90, 91, 92], states: [1], capitalStateId: 1,
    });
    ok("the Map's New country also succeeds on a colliding name", r2.s === 200 && r2.b && r2.b.ok !== false, r2.b);
    ok("…and it too leaves the modder's file alone", fs.readFileSync(MINE_ABS, "utf8") === before, "file changed");
    const z21File = tagLineFor("Z21");
    ok("…with its own registered file that exists",
      z21File && z21File !== "Kurdistan.txt" && fs.existsSync(path.join(MOD, "common", "countries", z21File)), z21File);
    ok("…and it did not reuse the other new country's file either", z21File !== z20File, { z20File, z21File });

    console.log("\ntest-country-file-collision: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
