// Regression: the icon picker must return sprite names in their ORIGINAL case. HOI4 looks up sprite names
// case-sensitively (GFX_focus_DEN_national_unity), but Nova's sprite map is keyed lowercase for resolution.
// The picker used to reconstruct the name from that lowercase key, so a browsed country-specific focus icon
// got stored as GFX_focus_den_national_unity — which renders in the detail popup but shows "?" on the focus
// tree node (a user-reported in-game bug). parseSpriteMapFromFile now preserves the original case in a side
// map, persisted in the sprite-map disk cache, and getFilteredSprites hands the picker the exact name.
//
// Deterministic: builds a temp mod with a mixed-case focus sprite (no vanilla needed). Run: node test-sprite-icon-case.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

const PORT = 3601;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spritecase-"));
  try {
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="SpriteCase"\n', "utf8");
    // A focus sprite whose name has UPPERCASE segments (like a country tag) + a real texture file.
    const gfxDir = path.join(mod, "interface"); fs.mkdirSync(gfxDir, { recursive: true });
    const texDir = path.join(mod, "gfx", "interface", "goals"); fs.mkdirSync(texDir, { recursive: true });
    fs.writeFileSync(path.join(texDir, "focus_ZZ_wonder.dds"), Buffer.alloc(128, 1)); // dummy texture
    fs.writeFileSync(path.join(gfxDir, "custom.gfx"),
      'spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_focus_ZZ_Wonder_Weapon"\n\t\ttexturefile = "gfx/interface/goals/focus_ZZ_wonder.dds"\n\t}\n}\n', "utf8");

    const d = await (await fetch(`${BASE}/api/focus/sprites?modPath=${encodeURIComponent(mod)}`)).json();
    const keys = (d.sprites || []).map((x) => x.key);
    ok("focus sprite list returned", Array.isArray(d.sprites) && d.sprites.length > 0);
    ok("picker returns the EXACT original case (GFX_focus_ZZ_Wonder_Weapon)", keys.includes("GFX_focus_ZZ_Wonder_Weapon"),
      keys.filter((k) => /zz_wonder/i.test(k)));
    ok("picker does NOT lowercase it (the bug)", !keys.includes("GFX_focus_zz_wonder_weapon"));
  } catch (e) {
    fail++; console.log("  FAIL harness -> " + e.message);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((r) => server.close(r));
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nSPRITE ICON CASE TEST: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
