// A country the map editor creates must have a flag. #new-country-has-no-flag
//
// FOUND BY THE OWNER, in HOI4's own log after playing a mod built with Nova's New country tool:
//
//   [flagtextureatlas.cpp:510]: Error loading flag for country NVA : Ideology neutrality :
//                               Path gfx/flags/ : File not found
//
// createCountry wrote the tag, the definition, the colour, the history and the state owners — everything
// except the one asset the game reaches for the moment the country is drawn.
//
// ⚠️ The file set is measured from vanilla, not guessed. For a minor like LUX the base game ships exactly:
//
//     gfx/flags/LUX_<ideology>.tga         82x52   (four ideologies; there is NO bare top-level LUX.tga)
//     gfx/flags/medium/LUX_<ideology>.tga  41x26
//     gfx/flags/small/LUX_<ideology>.tga   10x7    plus small/LUX.tga
//
// This test drives the REAL endpoint over HTTP with the body public/map.js sends, then reads the bytes back.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// ⚠️ A PLAIN CONSTANT, deliberately — do NOT reach for process.env.NOVA_PORT here.
//
// That env var is how run-tests.js and test-no-test-hijacks-the-users-server.js recognise a test that drives
// the LIVE app — the server the runner pre-flights, or worse, the user's own open Nova. This test starts a
// server of its own instead, which is the other option the guard names, and the runner reads `PORT = 54731`
// as a claim so no other test binds it at the same time. Using the env name made this file read as a live
// test that had not joined the live set, and the guard caught it immediately.
const PORT = 54731;
const IDEOLOGIES = ["communism", "democratic", "fascism", "neutrality"];

// ── what vanilla actually ships, so the expected set is derived and not typed in ─────────────────────
console.log("\n=== 🈯 the file set vanilla ships for a minor country ===");
let wantTop = [], wantMedium = [], wantSmall = [];
{
  const F = path.join(GAME, "gfx", "flags");
  if (!fs.existsSync(F)) { console.log("  ..   (the base game is not installed)"); }
  else {
    const has = (dir, n) => fs.existsSync(path.join(F, dir, n));
    wantTop = IDEOLOGIES.filter((i) => has("", `LUX_${i}.tga`));
    wantMedium = IDEOLOGIES.filter((i) => has("medium", `LUX_${i}.tga`));
    wantSmall = IDEOLOGIES.filter((i) => has("small", `LUX_${i}.tga`));
    ok(wantTop.length === 4, `vanilla ships all four ideologies at the main size for LUX`, wantTop);
    ok(wantMedium.length >= 3, `…and ${wantMedium.length} at medium`, wantMedium);
    ok(!fs.existsSync(path.join(F, "LUX.tga")),
      "⚠️ …and NO bare top-level LUX.tga — the naming is per-ideology", true);
    ok(fs.existsSync(path.join(F, "small", "LUX.tga")),
      "…but small/LUX.tga does exist, so the small folder gets a bare one too");
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flag-"));
const appdata = path.join(tmp, "appdata");
const mod = path.join(tmp, "mod");
fs.mkdirSync(mod, { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="FLAGTEST"\nsupported_version="1.19.*"\n');

const post = (url, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
    let b = ""; res.on("data", (c) => (b += c));
    res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ raw: b.slice(0, 200) }); } });
  });
  req.on("error", (e) => resolve({ error: String(e) }));
  req.setTimeout(240000, () => { req.destroy(); resolve({ error: "timeout" }); });
  req.write(data); req.end();
});

(async () => {
  console.log("\n=== …and a country the map editor creates has them ===");
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), NOVA_APP_DATA_DIR: appdata, HOI4_MOD_ROOT: mod },
  });
  const done = () => { try { srv.kill(); } catch (_) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
  process.on("exit", done);

  // wait for it to answer
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await new Promise((r) => {
      const q = http.get({ host: "127.0.0.1", port: PORT, path: "/api/settings/allow-vanilla-edits" }, (res) => { res.resume(); r(true); });
      q.on("error", () => r(false));
      q.setTimeout(1500, () => { q.destroy(); r(false); });
    });
  }
  ok(up, `the server answered on ${PORT}`);

  if (up) {
    // Give the mod a state to hand the new country, the way the map page would have one.
    fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
    fs.writeFileSync(path.join(mod, "history", "states", "900-Flagland.txt"),
      'state = {\n\tid = 900\n\tname = "STATE_900"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');

    // Exactly the body public/map.js's submitNewCountry sends.
    const res = await post("/api/map/create-country", {
      modPath: mod, tag: "ZQ7", name: "Flagland", rgb: [12, 200, 90], stateIds: [900], capitalStateId: 900,
    });
    ok(res && res.ok === true, "the country is created", res && (res.error || res.raw));

    if (res && res.ok) {
      ok(res.flagFiles > 0, `⭐⭐⭐ …and it reports writing ${res.flagFiles} flag file(s)`, res.flagFiles);
      const F = path.join(mod, "gfx", "flags");
      const missTop = IDEOLOGIES.filter((i) => !fs.existsSync(path.join(F, `ZQ7_${i}.tga`)));
      const missMed = IDEOLOGIES.filter((i) => !fs.existsSync(path.join(F, "medium", `ZQ7_${i}.tga`)));
      const missSml = IDEOLOGIES.filter((i) => !fs.existsSync(path.join(F, "small", `ZQ7_${i}.tga`)));
      ok(missTop.length === 0, "⭐⭐⭐ every ideology has a main-size flag — the one the game asked for", missTop);
      ok(missMed.length === 0, "…and a medium one", missMed);
      ok(missSml.length === 0, "…and a small one", missSml);
      ok(fs.existsSync(path.join(F, "small", "ZQ7.tga")), "…plus small/ZQ7.tga, as vanilla ships");

      // The bytes must be a real TGA at the size vanilla uses, not an empty or malformed file.
      const buf = fs.readFileSync(path.join(F, "ZQ7_neutrality.tga"));
      ok(buf.length > 18, "the flag has content", buf.length);
      ok(buf.readUInt8(2) === 2, "…it is an uncompressed true-colour TGA (type 2)", buf.readUInt8(2));
      ok(buf.readUInt16LE(12) === 82 && buf.readUInt16LE(14) === 52,
        "⭐⭐ …at vanilla's main flag size, 82x52", [buf.readUInt16LE(12), buf.readUInt16LE(14)]);
      ok(buf.readUInt8(16) === 32, "…32-bit", buf.readUInt8(16));
      // …and painted in the colour the author picked (BGRA on disk).
      const px = buf.slice(18, 22);
      ok(px[0] === 90 && px[1] === 200 && px[2] === 12,
        "⭐⭐ …in the colour the New country dialog chose, so it matches the map", [...px]);

      const small = fs.readFileSync(path.join(F, "small", "ZQ7_neutrality.tga"));
      ok(small.readUInt16LE(12) === 10 && small.readUInt16LE(14) === 7,
        "…and the small one is 10x7", [small.readUInt16LE(12), small.readUInt16LE(14)]);

      // ⚠️ CONTROL: it must never overwrite a flag that already exists.
      const victim = path.join(F, "ZQ7_neutrality.tga");
      fs.writeFileSync(victim, Buffer.from("NOT A FLAG, THE AUTHOR'S OWN FILE"));
      const again = await post("/api/map/create-country", {
        modPath: mod, tag: "ZQ8", name: "Second", rgb: [1, 2, 3], stateIds: [900], capitalStateId: 900,
      });
      void again;
      ok(String(fs.readFileSync(victim)) === "NOT A FLAG, THE AUTHOR'S OWN FILE",
        "⚠️⚠️ an existing flag file is never overwritten", String(fs.readFileSync(victim)).slice(0, 40));
    }
  }

  done();
  console.log(`\n=== a new country gets a flag: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
