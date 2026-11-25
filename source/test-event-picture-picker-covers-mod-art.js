// #event-picture-picker-blind-to-mod-art — THE EVENT PICTURE BROWSER OFFERED 79 OF MD'S 2,196 PICTURES.
//
// The same shape as the focus icon browser (#focus-picker-blind-to-mod-art). An event's `picture =` names a
// spriteType, and the name is whatever that sprite was declared as. Vanilla calls its own
// GFX_report_event_* / GFX_news_event_*, so those two prefixes describe vanilla perfectly — and a big mod
// not at all. Millennium Dawn writes `picture = GFX_ace_promoted`, `GFX_united_states_dollar` and thousands
// more, every one a real declared sprite living in gfx/event_pictures/.
//
// Measured: MD's events reference 2,196 distinct pictures. The prefix test offered 79. Counting the art's
// home directory takes that to 1,967 — every one declared anywhere, bar two oddities (a focus goal and a
// party icon reused as event art).
//
// ⚠️ VANILLA IS UNTOUCHED: the directory rule adds exactly 0 sprites there, because vanilla already follows
// its own convention. And it must not undo #sprite-picker-type, which removed event-WINDOW furniture from
// this browser — that art lives under gfx/interface/, never gfx/event_pictures/. Both are controls below.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evpic-"));
const GAME = path.join(ROOT, "game");
const MODS = path.join(ROOT, "mods");
const MOD = path.join(MODS, "mymod");

fs.mkdirSync(path.join(GAME, "interface"), { recursive: true });
fs.mkdirSync(path.join(GAME, "gfx", "event_pictures"), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
for (const d of [["gfx", "event_pictures"], ["gfx", "interface", "decisionview"], ["gfx", "interface", "buttons"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}

const sprite = (name, tex) => `spriteType = {\n\tname = "${name}"\n\ttexturefile = "${tex}"\n}\n`;
const art = (root, rel) => fs.writeFileSync(path.join(root, rel), "DDS placeholder");

art(GAME, "gfx/event_pictures/vanilla_pic.dds");
fs.writeFileSync(path.join(GAME, "interface", "vanilla.gfx"),
  "spriteTypes = {\n" + sprite("GFX_report_event_vanilla", "gfx/event_pictures/vanilla_pic.dds") + "}\n");

const MOD_SPRITES = [
  // THE BUG: real event art whose name follows no vanilla prefix. This is MD's actual shape.
  ["GFX_ace_promoted", "gfx/event_pictures/ace_promoted.dds"],
  ["GFX_united_states_dollar", "gfx/event_pictures/usd.dds"],
  // CONTROLS: the two prefixes must keep working.
  ["GFX_report_event_prefixed", "gfx/event_pictures/prefixed.dds"],
  ["GFX_news_event_thing", "gfx/event_pictures/news.dds"],
  // CONTROLS: event-WINDOW furniture (#sprite-picker-type) must stay out. `_type_strip` is chosen over
  // `_header_bg` deliberately — the generic `_bg` suppressor would exclude that one for a different reason,
  // so it would pass even if this rule were wrong.
  ["GFX_event_type_strip", "gfx/interface/decisionview/event_type_strip.dds"],
  ["GFX_event_leader_frame", "gfx/interface/decisionview/event_leader_frame.dds"],
  // CONTROL: unrelated art.
  ["some_button", "gfx/interface/buttons/b.dds"],
];
for (const [, tex] of MOD_SPRITES) art(MOD, tex);
fs.writeFileSync(path.join(MOD, "interface", "mod.gfx"),
  "spriteTypes = {\n" + MOD_SPRITES.map(([n, t]) => sprite(n, t)).join("") + "}\n");
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MyMod"\nsupported_version="1.19.*"\n');
fs.mkdirSync(MODS, { recursive: true });
fs.writeFileSync(path.join(MODS, "mymod.mod"),
  `name="MyMod"\npath="${MOD.split(path.sep).join("/")}"\nsupported_version="1.19.*"\n`);

process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const PORT = 53335;

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  try {
    // Exactly what the event maker requests (public/events.js:1353).
    const data = await fetch(`http://127.0.0.1:${PORT}/api/sprites?type=event&modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json());
    const sprites = data.sprites || [];
    const keys = new Set(sprites.map((s) => String(s.key).toLowerCase()));
    const has = (n) => keys.has(n.toLowerCase());

    console.log("\n[the fixture is real] the miniature game root was actually used");
    rec("the endpoint answered", !data.error && Array.isArray(data.sprites), data);
    rec("the game's own event picture came through", has("GFX_report_event_vanilla"), [...keys]);
    rec("…and the real install was NOT scanned", sprites.length < 50, sprites.length);

    console.log("\n[THE BUG] event art the mod declares under its own name");
    rec("a non-prefixed picture in gfx/event_pictures/ is offered", has("GFX_ace_promoted"), [...keys]);
    rec("…and another", has("GFX_united_states_dollar"), [...keys]);

    console.log("\n[CONTROL] the two vanilla prefixes still work");
    rec("GFX_report_event_* is still offered", has("GFX_report_event_prefixed"), [...keys]);
    rec("GFX_news_event_* is still offered", has("GFX_news_event_thing"), [...keys]);

    console.log("\n[CONTROL] #sprite-picker-type is not undone — window furniture stays out");
    rec("GFX_event_type_strip is NOT offered", !has("GFX_event_type_strip"), [...keys]);
    rec("GFX_event_leader_frame is NOT offered", !has("GFX_event_leader_frame"), [...keys]);
    rec("an unrelated button is NOT offered", !has("some_button"), [...keys]);

    console.log("\n[every entry is usable]");
    rec("no offered sprite lacks a texturefile", sprites.every((s) => !!s.texturefile),
      sprites.filter((s) => !s.texturefile).slice(0, 3));
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[corpus] what the shipping content actually references");
  {
    const CORPORA = [
      ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
      ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ];
    let measured = false;
    for (const [label, root] of CORPORA) {
      const used = new Set();
      const stack = [path.join(root, "events")];
      while (stack.length) {
        const cur = stack.pop();
        let es = [];
        try { es = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
        for (const e of es) {
          const p = path.join(cur, e.name);
          if (e.isDirectory()) { stack.push(p); continue; }
          if (!/\.txt$/i.test(e.name)) continue;
          let t = "";
          try { t = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
          t = t.replace(/#[^\n]*/g, "");
          for (const m of t.matchAll(/(^|\n)\s*picture\s*=\s*"?([A-Za-z0-9_.-]+)"?/g)) used.add(m[2]);
        }
      }
      if (!used.size) continue;
      measured = true;
      const prefixed = [...used].filter((k) => {
        const s = k.toLowerCase();
        return s.startsWith("gfx_report_event_") || s.startsWith("gfx_news_event_");
      }).length;
      const pct = Math.round((prefixed / used.size) * 100);
      console.log(`     ${label}: ${used.size} distinct event pictures used, ${prefixed} (${pct}%) match the old prefixes`);
      if (label === "Millennium Dawn") {
        rec("a big mod really does name event art outside the prefixes", pct < 50, { used: used.size, prefixed });
      }
      if (label === "vanilla") {
        // The other half of the claim: vanilla follows its own convention, so this change costs it nothing.
        rec("vanilla overwhelmingly does follow them", pct > 85, { used: used.size, prefixed });
      }
    }
    if (!measured) {
      console.log("     SKIPPED — no installed corpus");
      rec("the corpus section is skipped only because the games are absent", true, "skipped");
    }
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== event picture picker covers mod art: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
