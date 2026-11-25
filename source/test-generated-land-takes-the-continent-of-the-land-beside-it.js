// Generated land takes the continent of the land beside it, not always continent 1.
// #generated-land-is-all-europe
//
// generateLand stamped `continent = 1` on every province it turned into land. It takes a `continent`
// option and the endpoint forwards one, but the Generate-land dialog offers only a percentage and a seed and
// its fetch sends {modPath, count, seed} — so every user-reachable call wrote 1.
//
// Continent 1 is the FIRST name in map/continent.txt: `europe` in vanilla and in four of the five workshop
// maps (Old World Blues ships its own list, where 1 is `west_coast`). Vanilla script asks
// `is_on_continent = europe` 294 times with comments masked — AI strategy, faction joining rules,
// achievements, raids, events — more than any other continent. So new land in the Pacific beside Japan
// answered YES to every one of them. HOI4 loads it; this is a wrong answer, not a crash.
//
// Conservative fix, matching the sibling that already does it: fixInlandSeas copies a land neighbour's
// continent when it turns sea into land. Generated land now takes the continent most common among the
// existing land it touches in provinces.bmp, and a generated province that touches no existing land takes
// the continent of the generated land it is joined to. Land that reaches no existing land keeps the old
// default, and an explicit `continent` from a caller still wins. On a canvas with no land at all — the
// Delete-map workflow — nothing changes, because there is nothing to derive from.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gencont-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let n = 0;

// One row of eight 4×4 blocks, province id = block + 1:
//
//   [1 land c3][2 sea][3 sea][4 sea, no region][5 sea][6 land c5][7 sea, no region][8 sea]
//
// Only sea WITH a strategic region is eligible, so 4 and 7 stay sea and wall the rest apart.
//   2 touches land 1                     → 3
//   3 touches only generated 2           → 3, through the land it joins
//   5 touches land 6 (and the wall 4)    → 5
//   8 touches only the wall 7            → nothing to derive from → the default
const TYPES = { 1: ["land", "plains", 3], 2: ["sea", "ocean", 0], 3: ["sea", "ocean", 0], 4: ["sea", "ocean", 0],
  5: ["sea", "ocean", 0], 6: ["land", "forest", 5], 7: ["sea", "ocean", 0], 8: ["sea", "ocean", 0] };
const EXPECT = { 2: 3, 3: 3, 5: 5, 8: 1 };
const colour = (id) => [id * 20, 0, 0];

function makeMod({ withLand = true, withBitmap = true } = {}) {
  const mod = path.join(SANDBOX, `mod-${++n}`);
  mk(path.join(mod, "descriptor.mod"), 'name="GenCont"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= 8; id++) {
    let [type, terrain, cont] = TYPES[id];
    if (!withLand && type === "land") { type = "sea"; terrain = "ocean"; cont = 0; }
    const [r, g, b] = colour(id);
    rows.push(`${id};${r};${g};${b};${type};false;${terrain};${cont}`);
  }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "strategicregions", "1-Sea.txt"), 'strategic_region = {\n\tid = 1\n\tname = "REGION_1"\n\tprovinces = { 2 3 5 8 }\n}\n');
  if (withBitmap) {
    const W = 32, H = 4, rgb = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b] = colour(Math.floor(x / 4) + 1), o = (y * W + x) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
    mk(path.join(mod, "map", "provinces.bmp"), md.writeBmp24({ width: W, height: H, rgb }));
  }
  return mod;
}
const continentOf = (mod, id) => {
  const row = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "";
  const c = row.split(";");
  return { type: c[4], continent: Number(c[7]), row };
};

// Send what the client sends. Derive the body's keys from the dialog's own fetch, then map them exactly as
// POST /api/map/generate-land does.
const CLIENT = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const fetchAt = CLIENT.indexOf('fetch("/api/map/generate-land"');
const bodyMatch = fetchAt === -1 ? null : /JSON\.stringify\(\{([^}]*)\}\)/.exec(CLIENT.slice(fetchAt, fetchAt + 400));
const clientKeys = bodyMatch ? bodyMatch[1].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean) : [];
function generateAsTheServerDoes(modRoot, b) {
  return md.generateLand({
    modRoot, gameRoot: null, dependencyRoots: [],
    count: b.count, provincesPerState: b.provincesPerState, seed: b.seed, owner: b.owner, manpower: b.manpower, continent: b.continent,
  });
}

try {
  console.log("[control] what the Generate-land dialog sends");
  rec("the dialog's fetch was found", clientKeys.length > 0, clientKeys);
  rec("…and it sends no continent (so the server's default decides)", clientKeys.length > 0 && !clientKeys.includes("continent"), clientKeys);

  console.log("\n1. ⛔ Generated land takes the continent of the land it touches");
  {
    const mod = makeMod();
    const body = {};
    for (const k of clientKeys) if (k !== "modPath") body[k] = { count: 4, seed: 1 }[k];
    const g = generateAsTheServerDoes(mod, body);
    rec("the generator converted all four eligible provinces", g.changed === true && g.flippedProvinces === 4, { changed: g.changed, flipped: g.flippedProvinces, error: g.error });
    for (const id of [2, 3, 5, 8]) rec(`province ${id} is land`, continentOf(mod, id).type === "land", continentOf(mod, id).row);
    rec("⭐⭐⭐ province 2, beside continent-3 land, is on continent 3", continentOf(mod, 2).continent === EXPECT[2], continentOf(mod, 2).row);
    rec("⭐⭐⭐ province 5, beside continent-5 land, is on continent 5", continentOf(mod, 5).continent === EXPECT[5], continentOf(mod, 5).row);
    rec("⭐⭐ province 3, joined to that land only through province 2, follows it", continentOf(mod, 3).continent === EXPECT[3], continentOf(mod, 3).row);
    rec("⭐ province 8, which reaches no existing land, keeps the default", continentOf(mod, 8).continent === EXPECT[8], continentOf(mod, 8).row);
    rec("the existing land was not touched", continentOf(mod, 1).continent === 3 && continentOf(mod, 6).continent === 5, [continentOf(mod, 1).row, continentOf(mod, 6).row]);
    rec("the walls stayed sea", continentOf(mod, 4).type === "sea" && continentOf(mod, 7).type === "sea", [continentOf(mod, 4).row, continentOf(mod, 7).row]);
  }

  console.log("\n2. A continent a caller CHOSE still wins");
  {
    const mod = makeMod();
    const g = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: 4, seed: 1, continent: 4 });
    rec("the generator ran", g.changed === true && g.flippedProvinces === 4, g.error);
    rec("⭐⭐ every generated province is on the chosen continent", [2, 3, 5, 8].every((id) => continentOf(mod, id).continent === 4), [2, 3, 5, 8].map((id) => continentOf(mod, id).row));
  }

  console.log("\n3. A blank canvas (the Delete-map workflow) is unchanged");
  {
    const mod = makeMod({ withLand: false, withBitmap: false });
    const g = generateAsTheServerDoes(mod, { count: 4, seed: 1 });
    rec("the generator ran with no provinces.bmp and no land anywhere", g.changed === true && g.flippedProvinces === 4, g.error);
    const got = [];
    for (let id = 1; id <= 8; id++) if (continentOf(mod, id).type === "land") got.push(continentOf(mod, id).continent);
    rec("⭐ every generated province is on the default continent, as before", got.length === 4 && got.every((c) => c === 1), got);
  }

  console.log(`\n=== generated land takes the continent of the land beside it: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
