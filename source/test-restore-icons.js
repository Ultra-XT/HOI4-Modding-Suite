// Tests buildRestoredFocusIconsGfx + the /api/focus/restore-base-icons endpoint: re-register the
// vanilla GFX_goal_* focus icons a mod uses (those present in vanilla's goals.gfx).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");
const { createApp, buildRestoredFocusIconsGfx, constants } = server;
const PORT = 3621;

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// --- pure helper ---
{
  const focusTexts = ["icon = GFX_goal_generic_alliance\nicon = GFX_goal_dlc_only_thing"];
  const vanGfx = 'SpriteType = { name = "GFX_goal_generic_alliance" texturefile = "gfx/interface/goals/alliance.dds" }';
  const r = buildRestoredFocusIconsGfx(focusTexts, vanGfx);
  check("restores a vanilla goal icon used by the focuses", r.restored.includes("GFX_goal_generic_alliance"), r.restored.join(","));
  check("skips an icon not present in vanilla goals.gfx", r.skipped.includes("GFX_goal_dlc_only_thing"), r.skipped.join(","));
  check("generated .gfx references the vanilla .dds", /texturefile = "gfx\/interface\/goals\/alliance\.dds"/.test(r.content), "");
  check("generated .gfx is brace-balanced", (() => { let d = 0; for (const c of r.content) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })(), "");
}

// --- pure helper: previously-uncovered branches ---
{
  // Dedup + sort: the same icon referenced across several focus texts appears once, output sorted.
  const van = 'SpriteType = { name = "GFX_goal_b" texturefile = "b.dds" }\nSpriteType = { name = "GFX_goal_a" texturefile = "a.dds" }';
  const r = buildRestoredFocusIconsGfx(["icon = GFX_goal_b", "icon = GFX_goal_a\nicon = GFX_goal_b"], van);
  check("each used icon is restored once (deduped)", r.restored.filter((x) => x === "GFX_goal_b").length === 1, r.restored.join(","));
  check("restored list is sorted", JSON.stringify(r.restored) === JSON.stringify(["GFX_goal_a", "GFX_goal_b"]), r.restored.join(","));

  // Goal-only guarantee: a non-goal icon (GFX_focus_*, or a bare token) must NOT be picked up.
  const r2 = buildRestoredFocusIconsGfx(["icon = GFX_focus_secret\nicon = GFX_goal_a\nicon = some_token"], van);
  check("only GFX_goal_* icons are considered (GFX_focus_* ignored)", JSON.stringify([...r2.restored, ...r2.skipped]) === JSON.stringify(["GFX_goal_a"]), JSON.stringify([r2.restored, r2.skipped]));

  // First-wins when vanilla defines the same goal name twice.
  const dupVan = 'SpriteType = { name = "GFX_goal_a" texturefile = "first.dds" }\nSpriteType = { name = "GFX_goal_a" texturefile = "second.dds" }';
  const r3 = buildRestoredFocusIconsGfx(["icon = GFX_goal_a"], dupVan);
  check("duplicate vanilla name → first texturefile wins", /texturefile = "first\.dds"/.test(r3.content) && !/second\.dds/.test(r3.content), r3.content);

  // No icon references → nothing restored or skipped (still a valid, brace-balanced wrapper).
  const r4 = buildRestoredFocusIconsGfx(["focus = { id = x }"], van);
  check("no icon refs → empty restored + skipped", r4.restored.length === 0 && r4.skipped.length === 0, JSON.stringify([r4.restored, r4.skipped]));

  // Robustness: non-array focusTexts and null vanilla gfx must not throw.
  let threw = false, out = null;
  try { out = buildRestoredFocusIconsGfx(null, null); } catch (_) { threw = true; }
  check("null inputs → no throw, empty result", !threw && out && out.restored.length === 0 && out.skipped.length === 0, JSON.stringify(out));
}

// --- endpoint (real vanilla goals.gfx) ---
(async () => {
  const s = createApp().listen(PORT, "127.0.0.1");
  await new Promise((r) => s.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-restoreicons-"));
  try {
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Restore Test"\n', "utf8");
    const nf = path.join(tmp, "common", "national_focus");
    fs.mkdirSync(nf, { recursive: true });
    fs.writeFileSync(path.join(nf, "t.txt"), "focus_tree = { id = t\n\tfocus = { id = f icon = GFX_goal_generic_alliance x=0 y=0 } }\n", "utf8");

    const data = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ modPath: tmp });
      const r = http.request({ host: "127.0.0.1", port: PORT, path: "/api/focus/restore-base-icons", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({}); } }); });
      r.on("error", reject); r.write(body); r.end();
    });
    const hasVanilla = constants.resolveHoi4GameRoot() && fs.existsSync(path.join(constants.resolveHoi4GameRoot(), "interface", "goals.gfx"));
    if (hasVanilla) {
      check("endpoint restored >=1 icon", data.ok && data.restored >= 1, JSON.stringify(data).slice(0, 120));
      check("endpoint wrote the restoration .gfx into the mod", fs.existsSync(path.join(tmp, "interface", "nova_restored_focus_icons.gfx")), "");
    } else {
      console.log("  (skip) vanilla goals.gfx not available");
    }
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    s.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nRESTORE-ICONS TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
