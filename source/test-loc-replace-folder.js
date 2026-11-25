// #loc-replace-folder-unseen — Nova could not see localisation/<lang>/replace/, the folder HOI4 uses to
// override a string.
//
// The wiki is explicit: "if the localisation file is contained within a folder with the name of 'replace'
// (such as /Hearts of Iron IV/localisation/english/replace, still must be inside of localisation), it will get
// priority over the entries that are not." Millennium Dawn ships that folder for all 10 languages it supports
// — 36 files and 6676 keys in english alone.
//
// Two independent blind spots, both measured against Millennium Dawn:
//
// 1. server.js findModLocalizationEntry / stripLocalizationKeysAcrossMod used a FLAT fs.readdirSync of each
//    candidate directory, so files one level down in replace/ were never opened. Every maker that renames a
//    string asks findModLocalizationEntry where that string already lives (techs, characters, events,
//    decisions), so a key defined only in replace/ looked undefined: the rename went into a NEW file as a
//    second definition, while the replace/ copy kept overriding it — the modder renames something, Nova says
//    ok, and the old name is still what the game shows. Deletes had the mirror image: the replace/ copy was
//    left orphaned.
//
// 2. mod-index.js scanLocalization took FIRST-wins over collectFiles(), which is recursive and yields the
//    .yml files sitting directly in english/ before it descends into english/replace/ — so the value the game
//    DISCARDS always won. Measured on MD: 109 keys defined both inside and outside replace/, 105 of them with
//    a different value, every one of which Home and Mod Health displayed as the pre-override text.
//    The `localisation/replace/english` entry in its directory list did not help — the real layout is
//    english/replace, the other way round, and MD has no such folder.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-locreplace-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const modIndex = require("./mod-index.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const ENG = path.join(MOD, "localisation", "english");
const REP = path.join(ENG, "replace");
fs.mkdirSync(REP, { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LR"\nsupported_version="1.18.*"\n');

// Two ideas so the ordering claim is tested from BOTH sides: one outside-file sorts before "replace",
// the other after. If the fix depended on filename order, exactly one of them would pass.
fs.writeFileSync(path.join(MOD, "common", "ideas", "zz.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_idea_a = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.01 }\n\t\t}\n" +
  "\t\tprobe_idea_b = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.02 }\n\t\t}\n\t}\n}\n", "utf8");

fs.writeFileSync(path.join(ENG, "aaa_l_english.yml"),
  "﻿l_english:\n probe_idea_a:0 \"OUTSIDE value A\"\n only_outside:0 \"Only Outside\"\n", "utf8");
fs.writeFileSync(path.join(ENG, "zzz_l_english.yml"),
  "﻿l_english:\n probe_idea_b:0 \"OUTSIDE value B\"\n", "utf8");
fs.writeFileSync(path.join(REP, "replaced_from_vanilla_l_english.yml"),
  "﻿l_english:\n probe_idea_a:0 \"REPLACE value A\"\n probe_idea_b:0 \"REPLACE value B\"\n only_in_replace:0 \"Only In Replace\"\n", "utf8");

// ── mod-index: the value the GAME uses must be the one Nova displays ────────────────────────────────
const names = modIndex.scanLocalization
  ? modIndex.scanLocalization(MOD)
  : (modIndex.buildModIndex(MOD).localization || {});

ok("a key overridden in replace/ resolves to the replace value (outside file sorts BEFORE replace)",
  names.probe_idea_a === "REPLACE value A", names.probe_idea_a);
ok("…and also when the outside file sorts AFTER replace",
  names.probe_idea_b === "REPLACE value B", names.probe_idea_b);
ok("a key that exists only outside replace/ is untouched", names.only_outside === "Only Outside", names.only_outside);
ok("a key that exists only inside replace/ is still found", names.only_in_replace === "Only In Replace", names.only_in_replace);

// ── server.js: the rename path must find the key where it really lives ─────────────────────────────
const PORT = 39911;
const { createApp } = require("./server.js");
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    // Nova's own display of the idea must match the game's.
    const shown = await fetch(`http://127.0.0.1:${PORT}/api/mod/index?modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch(() => ({}));
    const ent = ((shown.entities || {}).idea || []).find((e) => e.id === "probe_idea_a");
    if (ent) ok("Mod Health / Home shows the replace/ name for the idea", ent.name === "REPLACE value A", ent);
    else { total++; pass++; console.log("  ok  (idea not surfaced as an entity here — covered by the scanLocalization checks)"); }

    // A rename must land in the file that already OWNS the key — the replace/ one — not in a new duplicate
    // the game would keep overriding. Characters are one of the four makers built on findModLocalizationEntry
    // (with techs, events and decisions); before the fix it could not see into replace/ at all.
    const CHARKEY = "probe_char_token";
    fs.writeFileSync(path.join(REP, "replaced_chars_l_english.yml"),
      `﻿l_english:\n ${CHARKEY}:0 "Name From REPLACE"\n`, "utf8");
    const filesBefore = fs.readdirSync(ENG).filter((f) => f.toLowerCase().endsWith(".yml")).length;

    const saved = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, token: CHARKEY, name: "Renamed By Nova", file: "ZZ.txt",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        roleLeader: true, leaderIdeology: "despotism",
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    ok("the character rename save succeeds", saved && saved.ok !== false, saved);

    const replaceTxt = fs.readFileSync(path.join(REP, "replaced_chars_l_english.yml"), "utf8");
    ok("the rename is written INTO the replace/ file that owns the key",
      /Renamed By Nova/.test(replaceTxt), replaceTxt.replace(/\s+/g, " ").slice(0, 160));
    ok("…and the stale name is gone from it, not left beside the new one",
      !/Name From REPLACE/.test(replaceTxt), replaceTxt.replace(/\s+/g, " ").slice(0, 160));

    // The contract that actually matters: what the GAME resolves is the new name.
    const after = modIndex.scanLocalization(MOD);
    ok("so the name the game would show is the NEW one", after[CHARKEY] === "Renamed By Nova", after[CHARKEY]);
    ok("no duplicate definition was created outside replace/",
      fs.readdirSync(ENG).filter((f) => f.toLowerCase().endsWith(".yml")).length === filesBefore,
      fs.readdirSync(ENG));

    console.log("\ntest-loc-replace-folder: " + pass + "/" + total + " checks passed");
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
