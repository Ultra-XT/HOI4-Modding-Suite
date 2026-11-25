// #cf-replace-path-blind — THE CONTINUOUS-FOCUS PANEL OFFERED CONTENT replace_path DELETES.
//
// `getActiveRoots(root)` returns every root in load order. Only `getActiveRoots(root, subpath)` drops a root
// whose copy of that directory a `replace_path` has switched off. Three sites in the continuous-focus
// endpoints called the one-argument form, so a mod declaring `replace_path="common/continuous_focus"` — the
// way you say "the base continuous focuses are gone" — was still shown them, and offered them for editing.
//
// The two save sites make it worse than a display fault: both MATERIALISE what they inherit into the mod, so
// the first edit would have written those focuses into a mod whose author had deliberately removed them.
//
// ⚠️ SCOPE, measured rather than assumed. getActiveRoots' subpath form drops only the GAME ROOT — see its own
// comment, which describes a deliberate one-caller-at-a-time migration. A replace_path in HOI4 also hides a
// DEPENDENCY's copy of the directory, and Nova implements that nowhere. That gap is real and is recorded as
// its own item; it is deliberately NOT asserted here, because an assertion that a dependency's palette still
// shows would certify the bug rather than catch it. What is pinned below is the game-root case this fixes.
//
// ⚠️ The control that a mod WITHOUT replace_path still inherits is the load-bearing half — a fix that simply
// stopped inheriting would pass every "must not appear" check here while killing the feature.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfrp-"));
const GAME = path.join(ROOT, "game");
const MODS = path.join(ROOT, "mods");

const palette = (id) =>
  `continuous_focus_palette = {\n\tid = ${id}\n\tdefault = yes\n\tposition = { x = 0 y = 0 }\n` +
  `\tfocus = {\n\t\tid = ${id}_f\n\t\ticon = GFX_goal_generic_construction\n\t\tcost = 1\n\t}\n}\n`;

// A miniature game root shipping a continuous-focus palette — this is what replace_path must hide.
fs.mkdirSync(path.join(GAME, "common", "continuous_focus"), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "");
fs.writeFileSync(path.join(GAME, "common", "continuous_focus", "00_continuous_focus.txt"), palette("vanilla_palette"));

function mkMod(name, opts = {}) {
  const dir = path.join(MODS, name);
  fs.mkdirSync(path.join(dir, "common", "continuous_focus"), { recursive: true });
  const rp = opts.replacePath ? `replace_path="${opts.replacePath}"\n` : "";
  const body = `name="${name}"\nsupported_version="1.19.*"\n${rp}`;
  fs.writeFileSync(path.join(dir, "descriptor.mod"), body);
  fs.writeFileSync(path.join(MODS, `${name}.mod`), `name="${name}"\npath="${dir.split(path.sep).join("/")}"\nsupported_version="1.19.*"\n${rp}`);
  return dir;
}
fs.mkdirSync(MODS, { recursive: true });
const PLAIN = mkMod("cfrpplain");                                                  // inherits vanilla's
const REPLACED = mkMod("cfrpreplaced", { replacePath: "common/continuous_focus" }); // must not

process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const PORT = 53327;

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  const list = (mod) => fetch(`http://127.0.0.1:${PORT}/api/continuous-focus/list?modPath=${encodeURIComponent(mod)}`)
    .then((r) => r.json()).catch((e) => ({ error: String(e) }));
  // Exactly what cfApiSave sends (public/app.js): modPath + file + paletteId, plus the op.
  const save = (mod, body) => fetch(`http://127.0.0.1:${PORT}/api/continuous-focus/save`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: mod }, body)),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: { error: String(e) } }));

  const idsOf = (d) => (d.palettes || []).map((p) => p.id);

  try {
    console.log("\n[CONTROL] a plain mod still inherits the base palette");
    {
      // ⚠️ If this fails, the fix stopped inheritance altogether rather than honouring replace_path — and
      // every "must not appear" assertion below would still pass while the feature was dead.
      const d = await list(PLAIN);
      rec("a mod with no palette of its own sees the game's", idsOf(d).includes("vanilla_palette"), d);
      rec("…marked inherited, not owned", (d.palettes || []).every((p) => p.inMod === false), d.palettes);
    }

    console.log("\n[THE BUG] replace_path means that directory is not loaded at all");
    {
      const d = await list(REPLACED);
      rec("a mod that replace_paths the directory inherits nothing", !idsOf(d).includes("vanilla_palette"), d);
      rec("…and answers cleanly rather than erroring", d.ok === true, d);
    }

    console.log("\n[THE WORSE HALF] the save path MATERIALISES what it inherits");
    {
      const fields = { icon: "GFX_goal_generic_construction", cost: 1 };
      const r1 = await save(PLAIN, { op: "upsert-focus", focusId: "new_focus", fields });
      rec("the plain mod's save succeeds", r1.status === 200 && r1.body && r1.body.ok, r1);
      const seeded = fs.readdirSync(path.join(PLAIN, "common", "continuous_focus"));
      const text = seeded.map((f) => fs.readFileSync(path.join(PLAIN, "common", "continuous_focus", f), "utf8")).join("\n");
      rec("…and it materialised the inherited palette into the mod", /vanilla_palette_f/.test(text), text.slice(0, 200));

      const r2 = await save(REPLACED, { op: "upsert-focus", focusId: "own_focus", fields });
      rec("the replace_path mod's save also succeeds", r2.status === 200 && r2.body && r2.body.ok, r2);
      const files = fs.readdirSync(path.join(REPLACED, "common", "continuous_focus"));
      const written = files.map((f) => fs.readFileSync(path.join(REPLACED, "common", "continuous_focus", f), "utf8")).join("\n");
      rec("…and did NOT resurrect the replaced palette", !/vanilla_palette/.test(written), written.slice(0, 260));
      rec("…while still saving the focus the user actually added", /own_focus/.test(written), written.slice(0, 260));
    }
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[the rule, in source] every continuous-focus root walk names its subpath");
  {
    const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    // ⭐ Derived from the source, not from the three line numbers this was written against.
    const bare = (SRV.match(/getActiveRoots\(modRoot\)\.filter\(\(r\) => path\.resolve\(r\) !== path\.resolve\(modRoot\)\)/g) || []).length;
    const withSub = (SRV.match(/getActiveRoots\(modRoot, "common\/continuous_focus"\)/g) || []).length;
    rec("no continuous-focus root walk omits the subpath", bare === 0, `${bare} still bare`);
    rec("all three sites pass it", withSub === 3, withSub);
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== continuous focus honours replace_path: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
