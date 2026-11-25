// ⛔ #generate-land-is-gated-only-in-the-browser — THE DIALOG WAS THE WHOLE GATE.
//
// public/map.js, on the 🌍 Generate land click:
//
//     let landCount = 0; for (const t of provinceType.values()) if (t === "land") landCount++;
//     const danger = landCount > 50;      // a from-scratch (Delete-map) canvas has 0 land; a real mod has thousands
//     …
//     setGenBtnEnabled(!danger);          // the Generate button is DISABLED until "GENERATE" is typed
//
// …and public/map.html words it: "⚠ This map already has N land provinces. Generate land is meant for a
// blank ocean canvas — running it on a populated map (like Millennium Dawn) adds land into the seas and
// spins up many new states, which can leave the map a mess. To start fresh, do 🗑 Delete map → 💾 Save
// first. To proceed anyway, type GENERATE below."
//
// NONE OF IT REACHED THE ENDPOINT. POST /api/map/generate-land checked the mod root and nothing else, so a
// caller that never opened the page rebuilt the world with no question asked and `ok: true` in reply. This
// is not hypothetical tooling: the flow driver that built the owner's test worlds POSTs this exact route.
//
// 🚫 THE SIBLING GATE DOES NOT COVER IT. map-data's generatedLandClaim answers a different question — "does
// this mod own the shapes it is about to reuse?" — and returns before it measures anything when the mod owns
// its provinces.bmp. Measured over the six installed maps, each asked as if it were the mod being edited, at
// the Generate-land slider's own default of 35% of the ocean:
//
//     map      land     sea   page gates?  claim.over
//     vanilla 10154    3133   yes          false
//     MD      13221    3139   yes          false
//     R56     10278    3146   yes          false
//     OWB     20624    1113   yes          false
//     NV      13552    3134   yes          false
//     RoN     10212    3134   yes          false
//
// Every shipping map owns its world, so the older gate is inert on all six by design (its own test pins
// that), and a text box in a browser was the only thing left.
//
// ⭐ The fix moves no prose into server.js. The page keeps its dialog; the endpoint measures the land itself,
// off the same effective definition.csv it is about to rewrite (landProvincesInEffectiveDefinition, which
// already existed for the Delete map refusal and had never been exported), and refuses a caller that did not
// say it meant to rebuild an existing world. The page only ever POSTs from behind that dialog, so it always
// says so and nothing a human sees changes.
//
// Run: node test-generate-land-is-gated-outside-the-browser-too.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const ok = (label, cond, extra) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails.push(label);
};

// ⚠️ A plain constant, not process.env.NOVA_PORT — that name marks a test that drives the LIVE app. This one
// starts its own server, and the runner reads the constant as this file's claim on the port.
const PORT = 54612;

// ⛔ IS THIS SERVER OURS? A port that answers is not a server you started. Writing the sibling of this test,
// the chosen port was already held by another Nova on this machine: the spawn died with EADDRINUSE (stdio is
// "ignore", so it said nothing), the readiness probe got a cheerful 200 from the stranger, and the checks ran
// against an app that did not have the change. The suite's own runner learned this the hard way — its
// live-app tests "used to fall back to the app's own default port and drive whatever was listening".
//
// Readiness is therefore not "something answered": it is "something answered AND it is standing in this
// test's fixture world". The game root is the tell — ours is a temp directory with a fake hoi4.exe in it.
const answersAsOurs = async (getter, modRoot, gameRoot) => {
  const m = await getter("/api/map/model?modPath=" + encodeURIComponent(modRoot));
  return !!(m && m.ok === true && m.gameRoot
    && path.resolve(String(m.gameRoot)).toLowerCase() === path.resolve(gameRoot).toLowerCase());
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genlandgate-"));
const APPDATA = path.join(tmp, "appdata");
const HOME = path.join(tmp, "home");
const HOI4_USER = path.join(tmp, "hoi4user");
for (const d of [APPDATA, HOME, path.join(HOI4_USER, "logs")]) fs.mkdirSync(d, { recursive: true });
process.env.NOVA_HOME_DIR = HOME;

const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const MAPJS = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
const MAPHTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");

const w = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};

/** A 24-bit bottom-up BMP, W×H, one province per row so every province is a real, findable shape. */
function bmp(W, H) {
  const rowSize = Math.floor((24 * W + 31) / 32) * 4;
  const buf = Buffer.alloc(54 + rowSize * H, 0);
  buf.write("BM", 0);
  buf.writeUInt32LE(54 + rowSize * H, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18);
  buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < H; y++) {
    const id = y + 1;
    for (let x = 0; x < W; x++) {
      const o = 54 + y * rowSize + x * 3;
      buf[o] = id & 255; buf[o + 1] = id & 255; buf[o + 2] = id & 255;
    }
  }
  return buf;
}

/** definition.csv rows for N provinces of which `land` are land (ids 1..land), the rest sea. */
function csv(N, land) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= N; i++) {
    rows.push(`${i};${i};${i};${i};${i <= land ? "land" : "sea"};false;${i <= land ? "plains" : "ocean"};${i <= land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
}

const N = 120;
// A stand-in game root. resolveHoi4GameRoot only tests that hoi4.exe EXISTS, so the layer below is ours and
// the real install is never read — this test must not depend on what is on the machine.
const GAME = path.join(tmp, "game");
w(GAME, "hoi4.exe", "not a real executable");
w(GAME, "map/definition.csv", csv(N, 60));
fs.writeFileSync(path.join(GAME, "map", "provinces.bmp"), bmp(N, N));
w(GAME, "map/strategicregions/1-all.txt",
  'strategic_region = { id = 1 name = "R" provinces = { ' + Array.from({ length: N }, (_, i) => i + 1).join(" ") + " } }");

const MODS = path.join(tmp, "mods");

/** A mod that owns its whole world, with `land` of its N provinces already land. Its one strategic region holds provinces
 *  1..`regionTo` (all N by default): Generate land raises only a sea province that has a region. */
function mkMod(name, land, regionTo = N) {
  const mod = path.join(MODS, name);
  w(mod, "descriptor.mod", 'name="' + name + '"\nsupported_version="1.19.*"\n');
  w(mod, "map/definition.csv", csv(N, land));
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp(N, N));
  w(mod, "map/strategicregions/1-all.txt",
    'strategic_region = { id = 1 name = "R" provinces = { ' + Array.from({ length: regionTo }, (_, i) => i + 1).join(" ") + " } }");
  return mod;
}

const post = (url, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({
    host: "127.0.0.1", port: PORT, path: url, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
  }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 300) }; } j.__status = res.statusCode; resolve(j); });
  });
  req.on("error", (e) => resolve({ error: String(e) }));
  req.setTimeout(240000, () => { req.destroy(); resolve({ error: "timeout" }); });
  req.write(data); req.end();
});

const get = (p) => new Promise((resolve) => {
  const q = http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } resolve(j); });
  });
  q.on("error", () => resolve({}));
  q.setTimeout(20000, () => { q.destroy(); resolve({}); });
});

const landNow = (mod) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")
  .split("\n").filter((l) => /^\d+;/.test(l) && !l.startsWith("0;") && l.split(";")[4] === "land").length;

console.log("\n=== 1. ⭐ THE PAGE'S NUMBER AND THE ENDPOINT'S ARE ONE NUMBER ===");
// Derived out of both sources, never typed here. A drift between them is the cousin trap: the page would
// demand a typed GENERATE in cases the endpoint waves through, or the endpoint would refuse a click the
// page never questioned, and each side would look correct on its own.
const pageThreshold = /const danger = landCount > (\d+);/.exec(MAPJS);
const srvThreshold = /const GENERATE_LAND_POPULATED_MAP_LAND = (\d+);/.exec(SERVER);
ok("public/map.js still gates its dialog on a land count", !!pageThreshold, pageThreshold && pageThreshold[1]);
ok("server.js names the same threshold for the endpoint", !!srvThreshold, srvThreshold && srvThreshold[1]);
ok("⭐⭐ …and they are the SAME number",
  !!pageThreshold && !!srvThreshold && pageThreshold[1] === srvThreshold[1],
  { page: pageThreshold && pageThreshold[1], server: srvThreshold && srvThreshold[1] });
const THRESHOLD = pageThreshold ? parseInt(pageThreshold[1], 10) : 50;

console.log("\n=== 2. THE PAGE KEEPS ITS DIALOG, AND SAYS A HUMAN SAW IT ===");
// The whole body object, not a fragment: a fragment is satisfied by the key appearing in any nearby literal.
// ⚠️ MOVED WITH THE FIX (twice now). The page also sends `ownerMode` and `owner` since
// #a-generated-world-nobody-rules — the Generate land dialog gained a "Who owns it" control, because every
// world Nova had ever generated was ownerless and the owner's launch of one wrote 166,849 error lines. The
// assertion this guards is `replacesExistingWorld: true`, and it is still in the literal.
ok("⛔ the page's generate-land POST declares that a human confirmed it",
  /body: JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\)/.test(MAPJS));
ok("…and the red populated-map panel is still the thing that asks",
  /This map already has <b id="mapGenLandCount">/.test(MAPHTML) && /type <b>GENERATE<\/b>/.test(MAPHTML));
ok("…and the typed-GENERATE box still gates the button",
  /setGenBtnEnabled\(String\(e\.target\.value\)\.trim\(\)\.toUpperCase\(\) === "GENERATE"\)/.test(MAPJS));
ok("…wired with addEventListener, never an inline handler (CSP: script-src 'self')",
  !/onclick=|onerror=/.test(MAPHTML.slice(MAPHTML.indexOf('id="mapGenConfirm"'), MAPHTML.indexOf('id="mapGenConfirm"') + 3000)));

console.log("\n=== 3. 🈯 THE CORPUS: every shipping map is over that line, so the gate is not decoration ===");
{
  // Derived from what is installed. Each map asked as if it were the mod being edited, exactly as the
  // endpoint asks it. A map under the line would mean the page's own dialog never fires either.
  const md = require("./map-data.js");
  const GAME_REAL = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
  let roots = [];
  try { roots = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => fs.statSync(d).isDirectory()); } catch (_) { roots = []; }
  if (fs.existsSync(path.join(GAME_REAL, "map", "definition.csv"))) roots.unshift(GAME_REAL);
  const maps = roots.filter((r) => fs.existsSync(path.join(r, "map", "definition.csv")));
  if (!maps.length) console.log("     (no installed maps here — the corpus half cannot run)");
  else {
    const counts = maps.map((r) => ({ map: path.basename(r), land: md.landProvincesInEffectiveDefinition({ modRoot: r, gameRoot: GAME_REAL, dependencyRoots: [] }) }));
    console.log("     " + counts.map((c) => c.map + "=" + c.land).join("  "));
    ok("⭐⭐ every installed map is a populated world by this measure",
      counts.every((c) => c.land > THRESHOLD), counts.filter((c) => c.land <= THRESHOLD));
  }
}

const done = (srv) => {
  try { srv.kill(); } catch (_) {}
  // Scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1).
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
};

(async () => {
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: {
      ...process.env, PORT: String(PORT), APPDATA, XDG_CONFIG_HOME: APPDATA,
      NOVA_APP_DATA_DIR: path.join(APPDATA, "NovaModdingSuite"),
      NOVA_HOME_DIR: HOME, HOI4_MOD_ROOT: MODS, HOI4_USER_DIR: HOI4_USER, HOI4_ROOT: GAME,
    },
  });
  process.on("exit", () => done(srv));

  try {
    const probe = mkMod("readiness", 0);
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (srv.exitCode !== null) break;   // spawn died (EADDRINUSE, most likely) — stop waiting
      up = await answersAsOurs(get, probe, GAME).catch(() => false);
    }
    ok(`⛔ the server answering on ${PORT} is the one this test started (it stands in this test's game root)`,
      up, { childExited: srv.exitCode, hint: "another Nova may be holding this port" });
    if (!up) throw new Error("no server of ours");

    console.log("\n=== 4. ⛔ RUN IT: a populated world, POSTed the way a script POSTs ===");
    {
      const mod = mkMod("populated", 60);   // over the line the page gates on
      const before = fs.readFileSync(path.join(mod, "map", "definition.csv"));
      const r = await post("/api/map/generate-land", { modPath: mod, count: 20, seed: 3 });
      ok("⭐⭐⭐ the endpoint refuses a caller that did not say it meant to rebuild this world",
        r.ok === false && r.refusedPopulatedMap === true, { status: r.__status, ok: r.ok, error: String(r.error || r.raw || "").slice(0, 140) });
      ok("…with a 400, so a client that only reads the status still stops", r.__status === 400, r.__status);
      ok("…and it COUNTS the land rather than guessing", r.landProvinces === 60, r.landProvinces);
      ok("…and the refusal names that count, so the caller can judge it", typeof r.error === "string" && r.error.indexOf("60 land provinces") !== -1, String(r.error || "").slice(0, 200));
      ok("…and says how to start fresh instead", typeof r.error === "string" && /blank-to-sea/.test(r.error));
      ok("…and how to proceed on purpose", typeof r.error === "string" && /replacesExistingWorld/.test(r.error));
      ok("⭐⭐⭐ NOTHING WAS WRITTEN: definition.csv is byte-identical",
        Buffer.compare(before, fs.readFileSync(path.join(mod, "map", "definition.csv"))) === 0);
      ok("…and the land count is untouched", landNow(mod) === 60, landNow(mod));
    }

    console.log("\n=== 5. …AND IT IS NOT A BLANKET REFUSAL: the same call, meant ===");
    {
      const mod = mkMod("populated-meant", 60);
      const r = await post("/api/map/generate-land", { modPath: mod, count: 20, seed: 3, replacesExistingWorld: true });
      ok("⭐⭐ the flag the page sends lets the identical call through",
        r.ok === true && r.refusedPopulatedMap !== true, { ok: r.ok, error: String(r.error || r.raw || "").slice(0, 160) });
      ok("…and land really was generated", landNow(mod) > 60, landNow(mod));
    }

    console.log("\n=== 6. 🚫 THE CRY-WOLF CONTROL: a blanked canvas is waved straight through ===");
    {
      // The owner's own sequence is Delete map → Save → Generate land, and his flow driver does it by POST
      // with no flag at all. That path must not have acquired a new refusal.
      // #generate-land-leaves-no-sea-cut-off — as in 7: one province per row, and seed 3 grows its 20 over all 120 rows in four bands
      // that wall four seas off. Since a sea may cross another of the click's pockets on its way out (review R-P1), every one of them
      // goes back to the ocean, every pick stays sea, and the click makes no land — its own 400, not this gate's. Only the rows it
      // raises have a region here, so it cuts nothing off: the gate is what this tests.
      const COUNT = 20;
      const mod = mkMod("blank-canvas", 0, COUNT);
      const r = await post("/api/map/generate-land", { modPath: mod, count: COUNT, seed: 3 });
      ok("⭐⭐⭐ a map with no land needs no acknowledgement — the blank→generate flow is unchanged",
        r.ok === true && r.refusedPopulatedMap !== true, { ok: r.ok, error: String(r.error || r.raw || "").slice(0, 160) });
      ok("…and it generated land", landNow(mod) > 0, landNow(mod));
    }

    console.log("\n=== 7. THE BOUNDARY, both sides of it ===");
    {
      // #generate-land-leaves-no-sea-cut-off — one province per row, so a band raised in the middle of the sea walls the rows above
      // it off from the rows below, and Generate land now keeps such a band sea (a click that makes no land is its own 400). Only the
      // COUNT rows next to the land have a region here, so the click raises exactly those and cuts nothing off: this is the gate's test.
      const COUNT = 10;
      const at = mkMod("at-threshold", THRESHOLD, THRESHOLD + COUNT);        // exactly AT the line: the page does not gate (>)
      const r1 = await post("/api/map/generate-land", { modPath: at, count: COUNT, seed: 3 });
      ok(`a map with exactly ${THRESHOLD} land provinces is allowed, as the page's \`>\` allows it`,
        r1.ok === true, { ok: r1.ok, error: String(r1.error || "").slice(0, 120) });
      const over = mkMod("over-threshold", THRESHOLD + 1, THRESHOLD + 1 + COUNT);
      const r2 = await post("/api/map/generate-land", { modPath: over, count: COUNT, seed: 3 });
      ok(`…and one more than that is refused, on the same side of the line as the page's dialog`,
        r2.ok === false && r2.refusedPopulatedMap === true, { ok: r2.ok, land: r2.landProvinces });
    }
  } catch (e) {
    fails.push("threw: " + (e && e.message));
    console.log("  FAIL threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
  }

  done(srv);
  console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
