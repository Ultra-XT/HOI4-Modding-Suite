// #tech-file-shadows-base — saving a tech into a file named after a vanilla or dependency technologies file
// made the mod's one-tech file REPLACE it in game.
//
// HOI4 resolves common/technologies by relative path, so a mod file at the same relative path as a base-game
// or dependency one replaces it wholesale. Vanilla's infantry.txt defines 89 technologies; a mod that writes
// its own common/technologies/infantry.txt containing one tech ships a game where the other 88 do not exist.
//
// The trigger is the "Target Script File" field on the tech sidebar, which is free text and is taken
// verbatim as the destination. Typing "infantry.txt" for an infantry tech, or a Millennium Dawn filename in
// an MD add-on, is a reasonable thing for this audience to do, and Nova said nothing.
//
// Nothing on disk is destroyed: the original file is untouched (safeModWrite refuses to write into the game
// root) and deleting the shadow file restores everything. The breakage is purely in-game — and invisible
// from inside Nova, because the tech catalog goes on reading the game-root copy either way.
//
// Fixed the way the decisions and country paths already do it: redirect to a nova_-prefixed filename via
// nonShadowingFileName. Seeding the original's contents into the mod (writeEquipmentToFile's approach) would
// also work, but it hands the modder 88 definitions they never asked to own.
//
// The redirect applies ONLY to a collision that would be newly created. A mod that already owns its own
// common/technologies/infantry.txt is overriding vanilla deliberately and maintains that file; redirecting
// its next save would split its technologies across two files and strand the original. The first version of
// this fix redirected unconditionally and test-research-block-fidelity caught it — its fixture writes to a
// mod-owned infantry.txt, so the save silently went elsewhere and the assertions read the untouched file.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-techshadow-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TS"\nsupported_version="1.18.*"\n');

const techDir = path.join(MOD, "common", "technologies");
const VANILLA_TECH_DIR = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies";
const haveVanilla = fs.existsSync(path.join(VANILLA_TECH_DIR, "infantry.txt"));

const mkTech = (id, file) => ({
  id, fileName: file, isMod: true, researchCost: 1, startYear: 1936,
  folder: "infantry_folder", x: 0, y: 0, categories: ["infantry_tech"],
  enableEquipments: [], prerequisites: [], leadsTo: [], xor: [], dependencies: [], subTechnologies: [],
});

const PORT = 39927, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (techs) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modPath: MOD, technologies: techs }),
  }).then((r) => r.json());

  try {
    // ── a name that collides with a VANILLA technologies file ───────────────────────────────────────
    if (haveVanilla) {
      const vanillaDefs = (fs.readFileSync(path.join(VANILLA_TECH_DIR, "infantry.txt"), "utf8")
        .match(/(?:^|\n)\t[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/g) || []).length;
      ok("precondition: vanilla's infantry.txt really does define many technologies", vanillaDefs > 20, vanillaDefs);

      const r = await save([mkTech("nova_shadow_probe", "infantry.txt")]);
      ok("saving a tech into a vanilla filename succeeds", r && r.ok !== false, r);
      ok("…but NOT at common/technologies/infantry.txt, which would replace vanilla's",
        !fs.existsSync(path.join(techDir, "infantry.txt")), fs.readdirSync(techDir));
      const written = fs.readdirSync(techDir).filter((f) => /\.txt$/i.test(f));
      ok("…it lands in a nova_-prefixed file instead", written.includes("nova_infantry.txt"), written);
      ok("…and that file really contains the tech", /nova_shadow_probe\s*=\s*\{/.test(
        fs.readFileSync(path.join(techDir, "nova_infantry.txt"), "utf8")), written);
      ok("vanilla's own infantry.txt is untouched",
        fs.existsSync(path.join(VANILLA_TECH_DIR, "infantry.txt"))
        && (fs.readFileSync(path.join(VANILLA_TECH_DIR, "infantry.txt"), "utf8")
          .match(/(?:^|\n)\t[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/g) || []).length === vanillaDefs, "vanilla changed");
    } else {
      total += 5; pass += 5;
      console.log("  ok  (Hearts of Iron IV not installed — vanilla-collision cases skipped) x5");
    }

    // ── a name that collides with nothing is left exactly as typed ──────────────────────────────────
    const r2 = await save([mkTech("nova_plain_probe", "my_custom_techs.txt")]);
    ok("a non-colliding filename still saves", r2 && r2.ok !== false, r2);
    ok("…and is used verbatim, with no nova_ prefix added",
      fs.existsSync(path.join(techDir, "my_custom_techs.txt")) && !fs.existsSync(path.join(techDir, "nova_my_custom_techs.txt")),
      fs.readdirSync(techDir));

    // ── saving twice must not keep re-prefixing ─────────────────────────────────────────────────────
    if (haveVanilla) {
      await save([mkTech("nova_shadow_probe", "infantry.txt")]);
      const after = fs.readdirSync(techDir).filter((f) => /\.txt$/i.test(f));
      ok("re-saving does not produce nova_nova_infantry.txt", !after.some((f) => /^nova_nova_/.test(f)), after);
      ok("…and the tech is still defined exactly once",
        (fs.readFileSync(path.join(techDir, "nova_infantry.txt"), "utf8").match(/nova_shadow_probe\s*=\s*\{/g) || []).length === 1,
        after);
    } else { total += 2; pass += 2; console.log("  ok  (re-save cases skipped) x2"); }

    // ── a mod that ALREADY owns that filename is left alone ─────────────────────────────────────────
    // Overriding a vanilla file wholesale is a legitimate thing to do on purpose, and such a mod maintains
    // that file. Redirecting its next save would split its technologies across two files and strand the
    // original — so the redirect applies only to a collision that would be NEWLY created.
    if (haveVanilla) {
      const OWNED = path.join(techDir, "armor.txt");
      fs.writeFileSync(OWNED, "technologies = {\n\tmy_existing_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = armor_folder position = { x = 0 y = 0 } }\n\t}\n}\n", "utf8");
      const r3 = await save([mkTech("nova_owned_probe", "armor.txt")]);
      ok("saving into a vanilla-named file the mod ALREADY owns succeeds", r3 && r3.ok !== false, r3);
      const ownedTxt = fs.readFileSync(OWNED, "utf8");
      ok("…the tech goes into that same file, not a nova_ copy",
        /nova_owned_probe\s*=\s*\{/.test(ownedTxt) && !fs.existsSync(path.join(techDir, "nova_armor.txt")),
        fs.readdirSync(techDir));
      ok("…and the tech already in it is still there",
        /my_existing_tech\s*=\s*\{/.test(ownedTxt), ownedTxt);
    } else { total += 3; pass += 3; console.log("  ok  (already-owned cases skipped) x3"); }

    console.log("\ntest-tech-file-no-shadow: " + pass + "/" + total + " checks passed");
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
