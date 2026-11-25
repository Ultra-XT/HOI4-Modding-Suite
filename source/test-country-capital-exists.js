// #capital-must-exist — creating a country accepted a capital state that does not exist.
//
// The number typed into "Capital State ID" went straight into history/countries/<TAG> - <name>.txt with no
// check beyond "is it a positive number", so `capital = 99999` was written and the UI reported "Country Nova
// Union (NUA) created successfully!". A capital pointing at a state that does not exist leaves the country
// with no capital at all: the game logs the bad id and everything keyed off a capital — victory points,
// capital-scoped effects, the AI — has nothing to work with.
//
// Nothing is written at the point the id is checked, so refusing costs the modder only a corrected number.
//
// The reason this is a lookup rather than a range check: an ADD-ON has no states of its own. Every state an
// add-on to Millennium Dawn can name lives in the mod it depends on, so the search has to cover the mod, its
// declared dependencies AND the base game — otherwise the guard would reject perfectly valid capitals, which
// is worse than the bug.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-capital-test");
// MODS_ROOT resolves once, at require time, and only to a directory that already exists.
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "capital_probe");
fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CapitalProbe"\nsupported_version="1.19.*"\n');
// One state of the mod's own, so the mod-root branch of the lookup is covered too.
fs.writeFileSync(path.join(MOD, "history", "states", "9001-Probeland.txt"),
  "state = {\n\tid = 9001\n\tname = \"STATE_9001\"\n\tprovinces = { 1 }\n}\n", "utf8");

const histDir = path.join(MOD, "history", "countries");
const wrote = (tag) => {
  try { return fs.readdirSync(histDir).some((f) => f.startsWith(tag + " ")); } catch (_) { return false; }
};

const PORT = 39553, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));
  const create = (tag, name, capitalStateId) => post("/api/countries/create", {
    modPath: MOD, tag, name, color: "59 125 216", graphicalCulture: "western_european_gfx", capitalStateId,
  });

  try {
    // ── a capital that does not exist is refused, and nothing is written ───────────────────────────
    const rBad = await create("ZZA", "Nowhere Land", 99999);
    await breathe();
    ok("a nonexistent capital state is refused", rBad.s >= 400 || !!rBad.b.error, rBad.b);
    ok("…and the message names the state", /99999/.test(rBad.b.error || ""), rBad.b.error);
    ok("…and says where it looked", /dependencies|base game/i.test(rBad.b.error || ""), rBad.b.error);
    ok("…and no country file was written", !wrote("ZZA"), (() => { try { return fs.readdirSync(histDir); } catch (_) { return "no dir"; } })());
    ok("…nor a tag entry", !fs.existsSync(path.join(MOD, "common", "country_tags", "custom_countries.txt"))
      || !/ZZA/.test(fs.readFileSync(path.join(MOD, "common", "country_tags", "custom_countries.txt"), "utf8")));

    // ── the mod's OWN state is accepted ───────────────────────────────────────────────────────────
    await breathe();
    const rOwn = await create("ZZB", "Probe Union", 9001);
    await breathe();
    ok("a state defined by the mod itself is accepted", rOwn.s === 200 && !rOwn.b.error, rOwn.b);
    ok("…and the country was written", wrote("ZZB"));
    const hist = fs.readdirSync(histDir).filter((f) => f.startsWith("ZZB "))
      .map((f) => fs.readFileSync(path.join(histDir, f), "utf8"))[0] || "";
    ok("…with that capital", /^capital = 9001\b/m.test(hist), hist.slice(0, 120));

    // ── a BASE GAME state is accepted (the ordinary case) ─────────────────────────────────────────
    await breathe();
    const rVanilla = await create("ZZC", "Vanilla Capital", 64);
    await breathe();
    // Only meaningful when the base game is actually installed; say so rather than passing silently.
    const gameHasStates = fs.existsSync(path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "history", "states"));
    if (gameHasStates) {
      ok("a base-game state is accepted", rVanilla.s === 200 && !rVanilla.b.error, rVanilla.b);
      ok("…and that country was written too", wrote("ZZC"));
    } else {
      console.log("  --  base game not installed; skipped the vanilla-state checks");
    }

    // ── the old guards still hold ─────────────────────────────────────────────────────────────────
    await breathe();
    const rZero = await create("ZZD", "Zero Capital", 0);
    ok("capital 0 is still refused", rZero.s >= 400 || !!rZero.b.error, rZero.b);
    await breathe();
    const rNaN = await create("ZZE", "No Capital", "banana");
    ok("a non-numeric capital is still refused", rNaN.s >= 400 || !!rNaN.b.error, rNaN.b);

    console.log("\ntest-country-capital-exists: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 9 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
