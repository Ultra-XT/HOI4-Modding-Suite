// #replace-path — THE FOCUS TREE PICKER LISTED 67 VANILLA TREES A TOTAL CONVERSION DOES NOT LOAD.
//
// getActiveRoots(modRoot, subpath) drops the game root when the mod or a dependency declares
// `replace_path = "<subpath>"`, because vanilla's copy of that folder is then not loaded in game and offering
// its content means offering things that do not exist. The subpath argument is opt-in and callers are
// migrated one at a time with a test each. The focus-tree list called it without one.
//
// Millennium Dawn declares `replace_path = "common/national_focus"` and re-ships 25 of vanilla's 81 focus
// filenames. So its focus picker showed all 67 of vanilla's country trees on top of MD's own — each one
// openable and editable, and each one a tree the game will never load. Saving an edit to one writes a file
// into the mod that does nothing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ftrp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VFOCUS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
const MDROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const HAVE_VANILLA = fs.existsSync(VFOCUS);

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

function mkMod(name, replacePath) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (replacePath ? 'replace_path = "common/national_focus"\n' : ""), "utf8");
  fs.writeFileSync(path.join(dir, "common", "national_focus", "own.txt"), [
    "focus_tree = {",
    `\tid = ${name}_own_tree`,
    "\tcountry = {",
    "\t\tfactor = 0",
    "\t\tmodifier = { add = 10 tag = ZZA }",
    "\t}",
    "\tfocus = {",
    `\t\tid = ${name}_own_focus`,
    "\t\ticon = GFX_goal_generic_construction",
    "\t\tx = 0",
    "\t\ty = 0",
    "\t\tcost = 10",
    "\t\tcompletion_reward = { add_political_power = 10 }",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  return dir;
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-ft-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43821;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  const api = await serve(createApp());
  const trees = (a, dir) => a.get(`/api/focus/country-trees?modPath=${encodeURIComponent(dir)}`)
    .then((c) => (c.b && c.b.trees) || []);
  try {
    console.log("\n[ground truth] Millennium Dawn replaces the focus folder AND re-ships its filenames");
    if (!HAVE_VANILLA || !fs.existsSync(path.join(MDROOT, "common", "national_focus"))) {
      console.log("  (skipped — corpora not installed)");
    } else {
      const desc = fs.readFileSync(path.join(MDROOT, "descriptor.mod"), "utf8");
      rec("MD's descriptor replace_path's common/national_focus",
        /replace_path\s*=\s*"common\/national_focus"/.test(desc), "not found");
      const vf = new Set(fs.readdirSync(VFOCUS).filter((f) => /\.txt$/i.test(f)));
      const mf = fs.readdirSync(path.join(MDROOT, "common", "national_focus")).filter((f) => /\.txt$/i.test(f));
      // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy re-ships far fewer of
      // vanilla's focus filenames than the 25 pinned here. The sections below use fixtures, not MD; what this
      // ground truth shows is that a real total conversion replaces the folder AND still ships some of vanilla's
      // names. That is asserted, and the counts are printed rather than typed.
      const shared = mf.filter((f) => vf.has(f)).length;
      console.log(`     vanilla ships ${vf.size} focus files; MD ships ${mf.length}, ${shared} of them under vanilla's names`);
      rec("…and still re-ships some of vanilla's focus filenames", vf.size > 0 && shared > 0, { vanilla: vf.size, shared });
    }

    if (!HAVE_VANILLA) console.log("\n(vanilla not installed — the behaviour sections need vanilla trees to hide)");
    else {
      console.log("\n[control] a mod that does NOT replace the folder still sees every vanilla tree");
      // Vanilla's focus trees DO load underneath an ordinary overlay mod, and hiding them would break the
      // picker for the common case — which is exactly why getActiveRoots' subpath argument is opt-in.
      const plain = mkMod("plain", false);
      let list = await trees(api, plain);
      rec("vanilla's country trees are listed", list.filter((t) => !t.inMod).length > 50, list.length);
      rec("…alongside the mod's own", list.some((t) => t.treeId === "plain_own_tree" && t.inMod), list.map((t) => t.treeId).slice(0, 6));

      console.log("\n[the bug] a mod that replace_path's the folder loads none of vanilla's");
      const rp = mkMod("rp", true);
      list = await trees(api, rp);
      rec("not one vanilla tree is offered", list.filter((t) => !t.inMod).length === 0,
        list.filter((t) => !t.inMod).map((t) => t.fileName).slice(0, 8));
      rec("…and the mod's own tree still is", list.some((t) => t.treeId === "rp_own_tree"), list.map((t) => t.treeId));
      rec("…so the picker is not simply empty", list.length >= 1, list.length);

      console.log("\n[back-out] drop the subpath argument again");
      const built = controlApp("subpath", [[
        '      const roots = getActiveRoots(modRoot, "common/national_focus"); // [vanilla, ...deps, mod] — mod overrides vanilla',
        "      const roots = getActiveRoots(modRoot);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const l = await trees(capi, rp);
          rec("…and vanilla's trees are listed again for a mod that replaces the folder",
            l.filter((t) => !t.inMod).length > 50, l.length);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== focus tree list replace_path: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.rmSync(p, { force: true }); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
