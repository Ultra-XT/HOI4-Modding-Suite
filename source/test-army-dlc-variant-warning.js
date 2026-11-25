// #army-dlc-variant-silent — the Military page edited one branch of a DLC-split army and said nothing.
//
// A country's order of battle is routinely split across DLC branches. Millennium Dawn's Germany reads:
//     if = { limit = { has_dlc = "No Step Back" } set_oob = "GER_2000_nsb"
//            else = { set_oob = "GER_2000_nonnsb" } }
// so which file the game loads depends on which DLC the PLAYER owns. Nova opens exactly one of them
// (pickLandOobFile takes the file with the most divisions + templates) and saves exactly that one.
//
// The server has always computed `landVariants` for precisely this — its own comment reads "so the UI can
// warn that editing one file doesn't update the others" — and the map editor's 🪖 Army tool renders it.
// The Military page dropped the field on the floor, so a modder rebalanced Germany, saw "✓ Saved 13
// templates + 22 divisions", and every No Step Back owner still got the old army.
//
// Measured: 148 of Millennium Dawn's 244 OOB-referencing countries ship more than one land-bearing OOB
// file; vanilla does it too. Verified live against the real Millennium Dawn install: loading GER now shows
// "GER's army is split across 2 DLC variants … Saving does not change GER_2000_nsb.txt (22 divisions)",
// and a single-file country (LUX) shows nothing.
//
// Nothing is destroyed here and the file Nova names is written correctly — the bug is that the modder is
// never told the job is half done, and cannot find out from this page.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-armyvariant-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["history/countries", "history/units"].forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AV"\nsupported_version="1.18.*"\n');

// A DLC-split country, shaped exactly like Millennium Dawn's.
fs.writeFileSync(path.join(MOD, "history", "countries", "GER - Germany.txt"),
  `capital = 64\nif = {\n\tlimit = { has_dlc = "No Step Back" }\n\tset_oob = "GER_2000_nsb"\n\telse = { set_oob = "GER_2000_nonnsb" }\n}\n`, "utf8");

const oob = (tpl, divs) => `division_template = {\n\tname = "${tpl}"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\nunits = {\n` +
  Array.from({ length: divs }, (_, i) =>
    `\tdivision = {\n\t\tname = "${i + 1}. Div"\n\t\tlocation = 64\n\t\tdivision_template = "${tpl}"\n\t\tstart_experience_factor = 0.3\n\t}\n`).join("") + "}\n";
fs.writeFileSync(path.join(MOD, "history", "units", "GER_2000_nsb.txt"), oob("Panzer", 3), "utf8");
fs.writeFileSync(path.join(MOD, "history", "units", "GER_2000_nonnsb.txt"), oob("Panzer", 3), "utf8");

// A country with a single OOB — the warning must NOT fire for it.
fs.writeFileSync(path.join(MOD, "history", "countries", "LUX - Luxembourg.txt"),
  `capital = 64\noob = "LUX_2000"\n`, "utf8");
fs.writeFileSync(path.join(MOD, "history", "units", "LUX_2000.txt"), oob("Garde", 1), "utf8");

const PORT = 39917, app = createApp();
const server = app.listen(PORT, async () => {
  const army = (tag) => fetch(`http://127.0.0.1:${PORT}/api/army?modPath=${encodeURIComponent(MOD)}&tag=${tag}`).then((r) => r.json());
  try {
    // ── the server must hand the UI what it needs to warn ───────────────────────────────────────────
    const ger = await army("GER");
    ok("the split country loads", ger && ger.ok, ger && ger.error);
    ok("…and reports BOTH land OOB variants", Array.isArray(ger.landVariants) && ger.landVariants.length === 2,
      ger.landVariants);
    ok("…naming the file being edited among them",
      (ger.landVariants || []).some((v) => v.file === ger.file), { file: ger.file, variants: ger.landVariants });
    ok("…and the sibling that will NOT be saved",
      (ger.landVariants || []).some((v) => v.file !== ger.file), ger.landVariants);
    ok("…each with a division count to show", (ger.landVariants || []).every((v) => Number.isFinite(Number(v.divisions))),
      ger.landVariants);

    const lux = await army("LUX");
    ok("a single-OOB country loads", lux && lux.ok, lux && lux.error);
    ok("…and reports no variants to warn about", !(lux.landVariants || []).length, lux.landVariants);

    // ── the Military page must actually CONSUME it — the whole bug was that it did not ──────────────
    const js = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");
    ok("the Military page reads landVariants from the response", /landVariants/.test(js), "army.js ignores it");
    ok("…renders a warning element for it", /armyVariantWarn/.test(js) && /id="armyVariantWarn"/.test(html),
      "no warning element");
    ok("…and repeats it on save, so “✓ Saved” cannot read as “the army is saved”",
      /split across DLC variants/.test(js), "save status says nothing");

    console.log("\ntest-army-dlc-variant-warning: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 10 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
