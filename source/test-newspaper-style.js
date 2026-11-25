// Event newspaper-style override: HOI4 renders every news_event in ONE global newspaper frame
// (GFX_event_news_bg), so the paper "look" is a mod-wide choice. This verifies the three endpoints:
// list installed styles, apply (vanilla / copy-from-mod / remove), and that /api/ideas/sprite-url then
// resolves GFX_event_news_bg to the Nova override (so the live preview matches in-game). Run: node test-newspaper-style.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.HOI4_MODS_ROOT = process.env.HOI4_MODS_ROOT || os.tmpdir(); // allow the tmp fixture mod
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== NEWSPAPER STYLE ENDPOINTS ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-np-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="npx"\n');
  // Give the fixture mod a CUSTOM eventwindow.gui (its own layout) so we can prove the newspaper feature
  // NEVER modifies it — the minimize-strip must go into a SEPARATE Nova-owned zz_nova_eventwindow.gui.
  const OWN_MARK = "# MOD-CUSTOM-LAYOUT-KEEPME";
  const ownGui = path.join(mod, "interface", "eventwindow.gui");
  const novaGui = path.join(mod, "interface", "zz_nova_eventwindow.gui");
  fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
  fs.writeFileSync(ownGui, `${OWN_MARK}\nguiTypes = {\n\tcontainerWindowType = {\n\t\tname = "EventWindow"\n\t\tsize = { width = 581 height = 427 }\n\t\tbuttonType = { name = "btn_minimize" spriteType = "GFX_event_button_minimize" position = { x = 10 y = 45 } }\n\t}\n}\n`);
  const PORT = 3719, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const j = async (u, o) => { const r = await fetch(BASE + u, o); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const POST = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const gfx = path.join(mod, "interface", "nova_newspaper.gfx");
  const bg = path.join(mod, "gfx", "interface", "nova_event_news_bg.dds");
  try {
    // 1. list
    let r = await j(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod)}`);
    ok("list returns vanilla first", r.status === 200 && r.body.styles && r.body.styles[0] && r.body.styles[0].id === "vanilla", r.body.styles && r.body.styles.length);
    const modStyle = (r.body.styles || []).find((s) => s.id.startsWith("mod:"));
    ok("at least one installed-mod style found", !!modStyle, (r.body.styles || []).map((s) => s.name));
    ok("current is null before any override", !r.body.current, r.body.current);

    // 2. apply vanilla → writes the override files
    r = await j("/api/events/apply-newspaper-style", POST({ modPath: mod, source: "vanilla" }));
    ok("apply vanilla ok", r.status === 200 && r.body.ok, r.body);
    ok("nova_newspaper.gfx written", fs.existsSync(gfx));
    ok("nova_event_news_bg.dds written", fs.existsSync(bg));
    ok("option-button override written", fs.existsSync(path.join(mod, "gfx", "interface", "nova_event_option_entry.dds")));
    ok("skip-button (minimize) override written", fs.existsSync(path.join(mod, "gfx", "interface", "nova_event_button_minimize.dds")));
    ok("apply reports hasButtons", r.body.hasButtons === true, r.body);
    ok("gfx redefines the button sprites", /GFX_event_option_entry/.test(fs.readFileSync(gfx, "utf8")) && /GFX_event_button_minimize/.test(fs.readFileSync(gfx, "utf8")));

    // NON-DESTRUCTIVE window override: the mod's OWN eventwindow.gui must be untouched; the minimize-strip
    // goes into a SEPARATE zz_nova_eventwindow.gui that preserves the mod's layout minus the skip button.
    ok("mod's OWN eventwindow.gui is NOT modified (custom layout preserved)", fs.readFileSync(ownGui, "utf8").includes(OWN_MARK));
    ok("separate zz_nova_eventwindow.gui override written", fs.existsSync(novaGui));
    // This used to require the sprite reference to be GONE, because the override deleted the whole buttonType.
    // HOI4 fetches `btn_minimize` out of top_Window BY NAME, so deleting it logged "Could not find btn_minimize
    // in window top_Window" once per event opened. The button is now kept and neutralised instead — the
    // property that matters is that the player cannot see or click it, not that the sprite name is absent.
    // See #eventwindow-btn-minimize (test-eventwindow-btn-minimize.js) for the full guarantee.
    const novaGuiText = fs.existsSync(novaGui) ? fs.readFileSync(novaGui, "utf8") : "";
    ok("override keeps the mod's layout", novaGuiText.includes(OWN_MARK));
    ok("…and the minimize button is hidden rather than deleted",
      /"btn_minimize"/.test(novaGuiText) && /position = \{ x = -9000 y = -9000 \}/.test(novaGuiText) && /size = \{ width = 0 height = 0 \}/.test(novaGuiText));
    ok("…with nothing left that could surface it on hover", !/MINIMIZE_EVENT/.test(novaGuiText));

    // 3. list reflects current = vanilla
    r = await j(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod)}`);
    ok("current reflects vanilla", r.body.current && /vanilla/i.test(r.body.current.label || r.body.current.id || ""), r.body.current);

    // 4. preview resolution: sprite-url → the nova override (so the live preview matches)
    r = await j(`/api/ideas/sprite-url?key=GFX_event_news_bg&modPath=${encodeURIComponent(mod)}`);
    ok("sprite-url resolves to the nova override", r.body.url && /nova_event_news_bg/i.test(decodeURIComponent(r.body.url || "")), r.body.url);

    // 5. apply a copied mod style
    if (modStyle) {
      r = await j("/api/events/apply-newspaper-style", POST({ modPath: mod, source: modStyle.id }));
      ok("apply mod style ok", r.status === 200 && r.body.ok, r.body);
      ok("override bg present after mod copy", fs.existsSync(bg));
      r = await j(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod)}`);
      ok("current reflects the mod label", r.body.current && r.body.current.label === modStyle.name, { got: r.body.current, want: modStyle.name });
    }

    // 6. security: arbitrary path is rejected
    r = await j("/api/events/apply-newspaper-style", POST({ modPath: mod, source: "mod:C:/Windows" }));
    ok("rejects a non-installed mod path", r.status === 400, r.body);

    // 7. remove → deletes the override
    r = await j("/api/events/apply-newspaper-style", POST({ modPath: mod, source: "remove" }));
    ok("remove ok", r.status === 200 && r.body.removed, r.body);
    ok("override files deleted on remove", !fs.existsSync(gfx) && !fs.existsSync(bg));
    ok("zz_nova window override deleted on remove", !fs.existsSync(novaGui));
    ok("mod's OWN eventwindow.gui still intact after remove (never touched)", fs.existsSync(ownGui) && fs.readFileSync(ownGui, "utf8").includes(OWN_MARK));
  } catch (e) { fail++; console.error("  EXCEPTION", (e && e.stack) || e); }
  finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    await new Promise((r) => server.close(r));
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} // tmp fixture, not a live mod
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  }
})();
