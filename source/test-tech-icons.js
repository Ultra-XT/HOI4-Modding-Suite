// Tests registerTechIconSprites: aliases GFX_<tech>_medium/_small/_large to a tech's picked icon so
// the research node shows the picture in-game instead of the green-circle placeholder. Writes only a
// dedicated, fully-managed nova_tech_icons.gfx (additive, brace-safe, idempotent).
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");
const { registerTechIconSprites } = server;

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (t) => { let d = 0; for (const c of String(t).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-techicons-"));
try {
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Icon Test"\n', "utf8");
  // A mod sprite the user could pick as a tech's icon, pointing at a real .dds.
  fs.mkdirSync(path.join(tmp, "interface"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "interface", "icons.gfx"),
    'spriteTypes = {\n\tspriteType = { name = "GFX_my_marine_icon" texturefile = "gfx/interface/technologies/marine.dds" }\n}\n', "utf8");
  fs.mkdirSync(path.join(tmp, "gfx", "interface", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "gfx", "interface", "technologies", "marine.dds"), "DDSfake", "utf8");

  const file = path.join(tmp, "interface", "nova_tech_icons.gfx");

  // hel_marines + hel_cyber get the icon; placeholder one is the unresolved default key → skipped.
  const r = registerTechIconSprites(tmp, { hel_marines: "GFX_my_marine_icon", hel_cyber: "GFX_my_marine_icon", hel_doctrine_core: "GFX_hel_doctrine_core_medium" });
  check("reports the resolved techs registered (2), self-ref skipped", r.registered === 2 && r.skipped >= 1, JSON.stringify(r));

  const gfx = fs.readFileSync(file, "utf8");
  check("registers all three size sprites per tech (medium/small/large)", /name = "GFX_hel_marines_medium"/.test(gfx) && /name = "GFX_hel_marines_small"/.test(gfx) && /name = "GFX_hel_marines_large"/.test(gfx), "");
  check("points the sprite at the picked icon's in-game gfx/ texture path", /name = "GFX_hel_marines_medium"[\s\S]*?texturefile = "gfx\/interface\/technologies\/marine\.dds"/.test(gfx), gfx.slice(0, 300));
  check("registers the second tech too", /name = "GFX_hel_cyber_medium"/.test(gfx), "");
  check("does NOT alias a tech to its own placeholder GFX_<tech>_medium key", !/name = "GFX_hel_doctrine_core_/.test(gfx), "");
  check("gfx is a valid spriteTypes file, brace-balanced", /spriteTypes\s*=\s*\{/.test(gfx) && balanced(gfx), "");

  // Idempotent: same input → identical file.
  const before = fs.readFileSync(file, "utf8");
  registerTechIconSprites(tmp, { hel_marines: "GFX_my_marine_icon", hel_cyber: "GFX_my_marine_icon", hel_doctrine_core: "GFX_hel_doctrine_core_medium" });
  check("idempotent: re-running produces the identical file", fs.readFileSync(file, "utf8") === before, "");

  // Unresolvable icon key → skipped (no crash, not written).
  const r2 = registerTechIconSprites(tmp, { hel_nato: "GFX_does_not_exist_anywhere" });
  check("unresolvable icon key is skipped, not written", r2.registered === 0 && !/GFX_hel_nato_/.test(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""), JSON.stringify(r2));

  // Equipment ids register exactly like techs (same GFX_<id>_medium convention). The save path merges
  // the tech + equipment icon maps into a single registerTechIconSprites call, so an equipment id must
  // produce its sprite too (a node that enables it with show_equipment_icon draws GFX_<equip>_medium).
  const r3 = registerTechIconSprites(tmp, { hel_marines_tech: "GFX_my_marine_icon", hel_marine_kit: "GFX_my_marine_icon" });
  const gfx3 = fs.readFileSync(file, "utf8");
  check("merged tech+equipment map registers an equipment id too", r3.registered === 2 && /name = "GFX_hel_marine_kit_medium"/.test(gfx3), JSON.stringify(r3));

  // Empty map → the managed file is removed.
  registerTechIconSprites(tmp, {});
  check("clearing all icons removes the managed gfx file", !fs.existsSync(file), "");
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nTECH-ICONS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
