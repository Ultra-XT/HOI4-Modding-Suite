// #sprite-picker-type — every "Browse icons" list must offer icons of the kind it claims.
//
// The filter matched loosely (`kLower.includes("leader")`, `kLower.includes("event")`), so the browsers were
// padded with things that are not pictures at all:
//
//   * the FOCUS browser was half junk — 2706 of 5495 entries were `_shine` sprites, the animated glow HOI4
//     draws OVER an icon while the focus is available. Pick one and the focus gets a halo and no icon.
//   * the PORTRAIT browser carried 100 entries matched on the word "leader" alone, and not one was a
//     portrait: game-rule icons (GFX_change_leader_rule_never), window furniture
//     (GFX_armyoverview_naval_leader_frame, GFX_faction_leader_crown) and other makers' icons
//     (GFX_decision_bul_imprison_leaders_zveno, GFX_focus_CHI_change_in_leadership).
//   * the EVENT browser offered the event WINDOW's own chrome as event pictures: GFX_event_header_bg,
//     GFX_event_item_bg, GFX_event_leader_frame, GFX_event_button_minimize, GFX_event_pic_clip …
//
// The news-event pictures are the reason this cannot simply be pinned to one prefix: 282 of the event
// browser's entries are `GFX_news_event_*` and they are entirely legitimate, so a naive "report_event only"
// rule would throw away a third of the list. This test pins both halves — the junk stays out, the real
// pictures stay in.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// A bare mod: the browsers scan the BASE GAME's sprites, which is what we are asserting about.
const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sprite-types-"));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpriteTypes"\nsupported_version="1.19.*"\n');

const PORT = 39561, app = createApp();
const server = app.listen(PORT, async () => {
  const list = async (type) => {
    const j = await fetch(`http://127.0.0.1:${PORT}/api/sprites?type=${type}&modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    return (j.sprites || []).map((s) => String(s.key || s.name || s));
  };
  try {
    const types = ["portrait", "event", "decision", "focus", "idea", "tech"];
    const all = {};
    for (const t of types) all[t] = await list(t);

    // The sprite map needs the real base game. If it isn't there the run proves nothing — say so loudly
    // rather than passing an empty list.
    ok("the base game's sprites were scanned", types.every((t) => all[t].length > 50),
      Object.fromEntries(types.map((t) => [t, all[t].length])));

    // ── no browser may offer a shine overlay ──────────────────────────────────────────────────────
    for (const t of types) {
      const shine = all[t].filter((k) => /_shine$/i.test(k));
      ok(`${t}: no _shine overlays offered as icons`, shine.length === 0, { count: shine.length, sample: shine.slice(0, 3) });
    }

    // ── portraits ─────────────────────────────────────────────────────────────────────────────────
    const badPortrait = all.portrait.filter((k) => !/^GFX_portrait_/i.test(k) && !/_portrait$/i.test(k));
    ok("portrait: every entry is a portrait sprite", badPortrait.length === 0, badPortrait.slice(0, 6));
    ok("portrait: game-rule icons are gone", !all.portrait.some((k) => /change_leader_rule/i.test(k)));
    ok("portrait: window frames are gone", !all.portrait.some((k) => /_frame$/i.test(k)));
    ok("portrait: other makers' icons are gone", !all.portrait.some((k) => /^GFX_(decision|focus|goal)_/i.test(k)));
    ok("portrait: the real portraits are still there", all.portrait.filter((k) => /^GFX_portrait_/i.test(k)).length > 1000,
      all.portrait.length);

    // ── events: chrome out, news IN ───────────────────────────────────────────────────────────────
    // ⚠️ NOT a name-prefix test. An event's `picture =` names a spriteType, and the name is whatever that
    // sprite was declared as — GFX_report_event_* / GFX_news_event_* is vanilla's own convention, not a rule
    // of the engine. Millennium Dawn writes `picture = GFX_ace_promoted` and 2,100 more like it, all real
    // sprites in gfx/event_pictures/, so the browser admits art by its home directory as well. This fixture
    // sees vanilla only, where that rule adds exactly 0 sprites — but pinning the prefix here would turn any
    // future mod-bearing fixture into a false failure. What the check is really for is unchanged:
    // event-WINDOW furniture must not be offered as a picture. #event-picture-picker-blind-to-mod-art
    const badEvent = all.event.filter((k) =>
      /_shine$/i.test(k) || /(?:_bg|_background|_icon_strip|_frame|_strip|_clip)$/i.test(k));
    ok("event: no event-window furniture is offered as a picture", badEvent.length === 0, badEvent.slice(0, 8));
    for (const chrome of ["GFX_event_header_bg", "GFX_event_item_bg", "GFX_event_leader_frame", "GFX_event_button_minimize", "GFX_event_pic_clip"]) {
      ok(`event: ${chrome} is not offered as a picture`, !all.event.includes(chrome));
    }
    ok("event: news-event pictures are KEPT", all.event.filter((k) => /^GFX_news_event_/i.test(k)).length > 100,
      all.event.filter((k) => /^GFX_news_event_/i.test(k)).length);
    ok("event: report-event pictures are KEPT", all.event.filter((k) => /^GFX_report_event_/i.test(k)).length > 100,
      all.event.filter((k) => /^GFX_report_event_/i.test(k)).length);

    // ── focus: the shine cull must not have taken the real icons with it ──────────────────────────
    // ⚠️ This was a NAME-PREFIX test, and the prefix is a vanilla convention rather than a rule of the
    // engine — a focus's `icon =` takes a spriteType name, whatever that sprite was declared as. Vanilla's
    // own soviet.txt, persia.txt and abdacom_shared_branch.txt set `icon = GFX_SOV_*` on 176 focuses, and
    // Millennium Dawn names its focus art plainly (7,073 of the 7,074 icons its trees use). The picker now
    // admits art by its home directory, gfx/interface/goals/, so the prefix test would reject real icons.
    // What this check was actually protecting stays: UI FURNITURE must not be offered as focus art.
    // #focus-picker-blind-to-mod-art
    const furniture = all.focus.filter((k) =>
      /_shine$/i.test(k) || /(?:_bg|_background|_icon_strip)$/i.test(k) || /^GFX_frontend_/i.test(k));
    ok("focus: no UI furniture is offered as focus art", furniture.length === 0, furniture.slice(0, 5));
    ok("focus: the conventionally-named icons are all still there",
      all.focus.filter((k) => /^GFX_(focus|goal)_/i.test(k)).length > 1500,
      all.focus.filter((k) => /^GFX_(focus|goal)_/i.test(k)).length);
    ok("focus: a substantial list survives the shine cull", all.focus.length > 1500, all.focus.length);
    ok("focus: a known vanilla icon is still offered", all.focus.some((k) => /^GFX_goal_generic_construct_civ_factory$/i.test(k)));

    // ── the other two browsers keep their own convention ──────────────────────────────────────────
    ok("idea: every entry is an idea sprite", all.idea.every((k) => /^GFX_idea_/i.test(k)),
      all.idea.filter((k) => !/^GFX_idea_/i.test(k)).slice(0, 5));
    ok("tech: every entry is a _medium/_small picture", all.tech.every((k) => /_(medium|small)$/i.test(k)),
      all.tech.filter((k) => !/_(medium|small)$/i.test(k)).slice(0, 5));

    console.log("\ntest-sprite-picker-types: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
