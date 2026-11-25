// ⛔ #the-commander-picker-offered-nothing-on-vanilla — 920 GENERALS, AND THE PICKER SHOWED NONE OF THEM.
//
// The Military maker's "pick a commander" browser lists the mod's own characters plus its BASE MOD's. Its
// own comment gives the reason: "an add-on on Millennium Dawn has almost no characters of its own — the
// generals it wants to deploy belong to MD, and the game loads them all the same."
//
// That sentence is equally true of a mod built directly on the base game, which is the commoner case, and
// the endpoint listed dependency mods only. Measured: a scratch mod with no dependencies got 0 characters
// and an EMPTY picker; the same mod declared as an MD add-on got 2,466 characters and 29 generals for
// Germany. Vanilla ships 920 corps_commanders and field_marshals across 232 files, 43 of them German, and
// the game loads every one.
//
// Fixed by resolving through getActiveRoots(root, "common/characters") — the replace_path-aware chain in
// load order — rather than appending the game root by hand. That distinction is load-bearing and this test
// proves it: Millennium Dawn declares `replace_path = "common/characters"`, so an MD add-on must STILL be
// offered no vanilla names, because the game will not load them.
//
// ⛔ AND THE NAMES ARRIVED AS RAW KEYS. A localisation value may itself be a reference — vanilla ships
//     GER_gerd_von_rundstedt: "$gerd_von_rundstedt$"
// and the game substitutes the inner key. The character reader did one lookup and stopped, so 194 of
// vanilla's 5,404 characters displayed their name as `$something$`. resolveLocReferences, with a cycle
// guard and a depth cap, was already in the same file. Across the corpus 6,769 loc values are entirely one
// such reference, so this is not a character quirk.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53703);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 340) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
if (!fs.existsSync(path.join(GAME, "common", "characters"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cmdp-ad-")); roots.push(appdata);
  const mkMod = (name, deps) => {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cmdp-")); roots.push(m);
    fs.writeFileSync(path.join(m, "descriptor.mod"),
      `version="1.0"\nname="${name}"\n` + (deps ? `dependencies={\n\t"${deps}"\n}\n` : ""), "utf8");
    return m;
  };

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

  // What vanilla really ships — counted here, not taken from Nova, so the two can disagree.
  const vanillaGenerals = (() => {
    const dir = path.join(GAME, "common", "characters");
    let files = 0, generals = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".txt")) continue;
      files++;
      const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
      generals += (t.match(/\b(corps_commander|field_marshal)\s*=\s*\{/g) || []).length;
    }
    return { files, generals };
  })();

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 200; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }

      // Exactly what public/army.js's openCommanderBrowser sends, and exactly how it flattens the answer.
      const commandersFor = async (root, tag) => {
        const d = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?includeBaseMod=1&modPath=${encodeURIComponent(root)}`).then((r) => r.json());
        const flat = [];
        for (const f of (d.files || [])) for (const c of (f.characters || [])) flat.push({ ...c, _base: false });
        for (const f of (d.baseModFiles || [])) for (const c of (f.characters || [])) flat.push({ ...c, _base: true });
        const mine = flat.filter((c) => {
          const file = String(c.file || "").toUpperCase();
          const tok = String(c.token || "").toUpperCase();
          return file === tag + ".TXT" || file.startsWith(tag + "_") || tok.startsWith(tag + "_");
        });
        return { d, flat, mine, generals: mine.filter((c) => c.roleGeneral) };
      };

      console.log("\n-- ⭐ the premise: the base game ships the generals a new mod wants --");
      {
        ok(vanillaGenerals.generals > 500,
          `${vanillaGenerals.generals} generals and field marshals across ${vanillaGenerals.files} vanilla files`, vanillaGenerals);
      }

      console.log("\n-- ⛔ a mod built on vanilla can pick a commander --");
      {
        const mod = mkMod("OnVanilla", "");
        const r = await commandersFor(mod, "GER");
        ok(r.flat.length > 1000, `${r.flat.length} characters are offered as reference`, r.flat.length);
        ok(r.generals.length > 20, `${r.generals.length} German generals in the picker — it used to be zero`, r.generals.length);
        const names = r.generals.map((c) => c.name || c.token);
        ok(names.some((n) => /Rundstedt/.test(n)), "…including von Rundstedt", names.slice(0, 6));
        ok((r.d.files || []).length === 0, "…while the EDITABLE list is still only this mod's own", (r.d.files || []).length);
      }

      console.log("\n-- ⭐ CONTROL: replace_path is honoured, so an MD add-on gets NO vanilla names --");
      {
        if (!fs.existsSync(MD)) ok(true, "(Millennium Dawn not installed — control skipped)");
        else {
          const desc = fs.readFileSync(path.join(MD, "descriptor.mod"), "utf8");
          ok(/replace_path\s*=\s*"common\/characters"/.test(desc),
            "Millennium Dawn really does replace common/characters", "the premise of this control is gone");
          const addon = mkMod("MD Addon", "Millennium Dawn: A Modern Day Mod");
          const r = await commandersFor(addon, "GER");
          const sources = new Set((r.d.baseModFiles || []).map((f) => f.source));
          ok(sources.size > 0, "the add-on gets base-mod characters", [...sources]);
          ok(![...sources].some((s) => /Hearts of Iron IV/i.test(String(s))),
            "…and NOT vanilla's, because the game would not load them either", [...sources]);
          ok(r.generals.length > 0, "…and it still has generals to pick", r.generals.length);
        }
      }

      console.log("\n-- ⛔ a name that is a reference to another name resolves --");
      {
        const mod = mkMod("Names", "");
        const r = await commandersFor(mod, "GER");
        const raw = r.flat.filter((c) => /^\$[A-Za-z0-9_.\-]+\$$/.test(String(c.name || "")));
        ok(raw.length === 0, "no character's name is shown as a raw $key$", raw.slice(0, 4).map((c) => c.name));
        // The specific one, so a regression names itself.
        const rundstedt = r.flat.find((c) => String(c.token) === "GER_gerd_von_rundstedt");
        ok(rundstedt && rundstedt.name === "Gerd von Rundstedt",
          "GER_gerd_von_rundstedt resolves through its $gerd_von_rundstedt$ indirection", rundstedt && rundstedt.name);
        // And the premise, from the shipped files.
        const loc = fs.readFileSync(path.join(GAME, "localisation", "english", "nsb_characters_l_english.yml"), "utf8");
        ok(/GER_gerd_von_rundstedt:\s*"\$gerd_von_rundstedt\$"/.test(loc),
          "…and vanilla really does write it that way", "the premise moved; re-derive this test");
      }

      console.log("\n-- ⭐ CONTROL: the shared resolver is what does it --");
      {
        const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        ok(/function resolveLocReferences\(/.test(SRV), "resolveLocReferences still exists");
        ok(/if \(key && n\[key\]\) return resolveLocReferences\(n\[key\], n\);/.test(SRV),
          "…and the character reader uses it rather than its own one-shot lookup");
        ok(/depth > 6/.test(SRV), "…which has a depth cap, so a self-referential key cannot hang the scan");
        ok(/trackedSeen\.has\(key\)/.test(SRV), "…and a cycle guard");
      }

      console.log("\n-- ⭐ CONTROL: the editable list is not flooded --");
      {
        // The whole reason base characters are returned SEPARATELY. If they ever leak into `files`, the
        // sidebar fills with 5,000 read-only names and the maker becomes unusable.
        const mod = mkMod("Flood", "");
        const d = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?includeBaseMod=1&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
        ok((d.files || []).length === 0, "a mod with no characters has an empty editable list", (d.files || []).length);
        ok((d.baseModFiles || []).length > 100, "…while the reference list is full", (d.baseModFiles || []).length);
        ok((d.baseModFiles || []).every((f) => f.baseMod === true), "…and every reference file is marked as such");
        // Without includeBaseMod the answer must stay empty — the sidebar's own contract.
        const plain = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
        ok((plain.baseModFiles || []).length === 0, "…and it is opt-in, so the sidebar never pays for it", (plain.baseModFiles || []).length);
      }
    } catch (e) {
      ok(false, "threw: " + e.message + "\n" + e.stack);
    } finally {
      try { srv.kill(); } catch (_) {}
      setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
      for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
      console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
      process.exitCode = fail ? 1 : 0;
      setTimeout(() => process.exit(fail ? 1 : 0), 1200);
    }
  })();
}
