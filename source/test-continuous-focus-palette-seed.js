// #cf-palette-shadows-base — adding ONE continuous focus deleted all fourteen the base game ships.
//
// The continuous-focus panel shows the inherited palette when the mod has none of its own, so the client
// sends that palette's file name back with the save — `generic.txt`. The server's "materialise the inherited
// palette" branch only runs when NO file name was sent, so the save fell through to a second branch that
// wrote a BARE palette to <mod>/common/continuous_focus/generic.txt.
//
// Same basename and the same `generic_focus` palette id means HOI4 loads the mod's file INSTEAD of the base
// one. So a mod whose author added a single continuous focus shipped a palette containing only that focus,
// and the game lost continuous_naval_production, continuous_air_production, continuous_non_factory_construct
// and the rest — with nothing on screen to suggest it, because the panel was showing the one focus it had
// just written.
//
// The fix seeds the file from the inherited palette of the same name before appending. The test asserts both
// halves: the base game's focuses survive, and the new one is there.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-cf-seed-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const vanillaCf = path.join(GAME, "common", "continuous_focus", "generic.txt");

const MOD = path.join(ROOT, "cf_seed_probe");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CfSeedProbe"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "national_focus", "probe_tree.txt"),
  "focus_tree = {\n\tid = probe_tree\n\tcountry = {\n\t\tfactor = 0\n\t}\n}\n", "utf8");

const modCf = path.join(MOD, "common", "continuous_focus", "generic.txt");
const countFocuses = (t) => (t.match(/(^|\n)\s*focus\s*=\s*\{/g) || []).length;

const PORT = 39549, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));

  try {
    if (!fs.existsSync(vanillaCf)) {
      console.log("  --  base game not installed; this test needs its continuous_focus palette");
      process.exitCode = 0;
      return;
    }
    const vanillaText = fs.readFileSync(vanillaCf, "utf8");
    const vanillaCount = countFocuses(vanillaText);
    ok("the base game ships a populated palette to inherit from", vanillaCount >= 10, vanillaCount);
    ok("the mod starts with no palette of its own", !fs.existsSync(modCf));

    // Exactly what the panel sends once it has rendered the INHERITED palette: the base file's name.
    const r = await post("/api/continuous-focus/save", {
      modPath: MOD, file: "generic.txt", paletteId: "generic_focus", op: "upsert-focus",
      focusId: "probe_continuous_iron",
      fields: { name: "Iron Rationing", icon: "GFX_goal_generic_construct_civ_factory", daily_cost: 5, modifier: "stability_factor = 0.05" },
      position: { x: 50, y: 1000 },
    });
    await breathe();
    ok("saving a continuous focus → 200", r.s === 200 && !r.b.error, r.b);
    ok("…the mod now has its own palette file", fs.existsSync(modCf));

    const modText = fs.readFileSync(modCf, "utf8");
    const modCount = countFocuses(modText);

    // THE REGRESSION: the base game's focuses must still be in there.
    ok("the base game's continuous focuses survived", modCount >= vanillaCount,
      { vanilla: vanillaCount, mod: modCount });
    for (const known of ["continuous_naval_production", "continuous_air_production", "continuous_non_factory_construct"]) {
      ok(`…including ${known}`, modText.includes(known), modText.slice(0, 200));
    }
    ok("…and the new focus was added", /probe_continuous_iron/.test(modText), modText.slice(0, 200));
    ok("…so the file grew rather than replaced", modCount === vanillaCount + 1,
      { vanilla: vanillaCount, mod: modCount });
    ok("…and it is still brace-balanced", (() => {
      let d = 0; for (const ch of modText.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; }
      return d === 0;
    })(), modText.slice(0, 200));

    // A SECOND focus must not re-seed and duplicate everything.
    await breathe();
    const r2 = await post("/api/continuous-focus/save", {
      modPath: MOD, file: "generic.txt", paletteId: "generic_focus", op: "upsert-focus",
      focusId: "probe_continuous_two",
      fields: { name: "Second", icon: "GFX_goal_generic_construct_civ_factory", daily_cost: 3, modifier: "war_support_factor = 0.02" },
      position: { x: 50, y: 1000 },
    });
    await breathe();
    ok("a second continuous focus → 200", r2.s === 200 && !r2.b.error, r2.b);
    const after2 = fs.readFileSync(modCf, "utf8");
    ok("…the palette grew by exactly one", countFocuses(after2) === vanillaCount + 2,
      { expected: vanillaCount + 2, got: countFocuses(after2) });
    ok("…and the first one is still there once", (after2.match(/probe_continuous_iron/g) || []).length === 1,
      (after2.match(/probe_continuous_iron/g) || []).length);

    console.log("\ntest-continuous-focus-palette-seed: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    if (process.exitCode !== 0 || total > 0) process.exitCode = pass === total && total >= 10 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
