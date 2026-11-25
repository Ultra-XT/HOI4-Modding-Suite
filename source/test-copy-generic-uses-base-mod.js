// #copy-generic-skips-the-base-mod — COPY THE TREE THE GAME ACTUALLY LOADS.
//
// Found by the dependency-axis hunt, then reproduced by hand before it was believed.
//
// "Copy the generic focus tree" looked in the active mod, then jumped straight to vanilla. The mods in
// between — the ones an add-on DEPENDS on — were never searched, and because `getActiveRoots` was never
// called with the directory, `replace_path` was never consulted either.
//
// So an add-on to a total conversion that replaces `common/national_focus` and ships its own generic tree was
// handed VANILLA's, and told so: `copiedFrom = "the vanilla generic focus tree"`. On the reported fixture, 14
// of the seeded tree's 15 `add_ideas` tokens were defined nowhere in that conversion (which replaces
// `common/ideas` too) — `militarism_focus`, `liberty_ethos_focus`, `volunteer_corps_focus` and the rest. Only
// `neutrality_idea` resolved. Those focuses complete and grant nothing.
//
// `sourceRoot` also feeds `getLocalizationMap`, so the names carried across were vanilla's as well.
//
// Nova already knew the right answer elsewhere: in the same server process, for the same modPath,
// `/api/focus/country-trees` reports the base mod's `generic.txt` as `generic:true / isDefault:true` and
// vanilla's as absent. One endpoint knew which tree the game loads; the copier 4,500 lines away wrote the
// one it doesn't.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-copygen-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-copygen-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function genericTree(prefix, n) {
  const focuses = [];
  for (let i = 0; i < n; i++) {
    focuses.push(`\tfocus = {\n\t\tid = ${prefix}_focus_${i}\n\t\ticon = GFX_goal_generic_construct_civ_factory\n\t\tx = ${i}\n\t\ty = 0\n\t\tcost = 5\n\t}`);
  }
  return `focus_tree = {\n\tid = generic\n\tcountry = { factor = 1 }\n\tdefault = yes\n${focuses.join("\n")}\n}\n`;
}
let seq = 0;
function mkMod(name, opts) {
  const dir = path.join(ROOT, name + (++seq));
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${opts.modName || name}"\nsupported_version="1.19.*"\n`
    + (opts.replacePath ? 'replace_path="common/national_focus"\n' : "")
    + (opts.dependsOn ? `dependencies={ "${opts.dependsOn}" }\n` : ""), "utf8");
  // a .mod registration file, so dependency resolution can find it by name
  fs.writeFileSync(path.join(ROOT, `${name}${seq}.mod`),
    `name="${opts.modName || name}"\npath="${dir.replace(/\\/g, "/")}"\nsupported_version="1.19.*"\n`, "utf8");
  if (opts.generic) {
    fs.writeFileSync(path.join(dir, "common", "national_focus", "generic.txt"), genericTree(name, opts.generic), "utf8");
  }
  return dir;
}
const focusCount = (dir) => {
  const d = path.join(dir, "common", "national_focus");
  let n = 0;
  for (const f of fs.readdirSync(d)) n += (fs.readFileSync(path.join(d, f), "utf8").match(/(?:^|\n)\s*focus\s*=\s*\{/g) || []).length;
  return n;
};

let PORT = 48100;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      copy: (dir, tag) => fetch(`http://127.0.0.1:${PORT}/api/mod/copy-generic-focus-tree`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: dir, tag }),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[an add-on over a base that ships its own generic tree] gets the BASE's");
    const BASE_N = 40;
    mkMod("basetc", { modName: "BaseTC", replacePath: true, generic: BASE_N });
    const addon = mkMod("addon", { modName: "AddOn", dependsOn: "BaseTC" });
    const r = await api.copy(addon, "NUA");
    rec("the copy succeeds", r.b && !r.b.error, r.b);
    rec("…and says it came from the base mod, not vanilla",
      /generic focus tree from/.test(r.b.copiedFrom || "") && !/vanilla/.test(r.b.copiedFrom || ""), r.b.copiedFrom);
    rec("…writing the base mod's tree, not vanilla's", focusCount(addon) === BASE_N,
      { written: focusCount(addon), base: BASE_N });

    console.log("\n[an add-on with NO dependency] still gets vanilla's — the control in the other direction");
    const lone = mkMod("lone", { modName: "Lone" });
    const r2 = await api.copy(lone, "NUB");
    rec("the copy succeeds", r2.b && !r2.b.error, r2.b);
    rec("…and says so", /vanilla/.test(r2.b.copiedFrom || ""), r2.b.copiedFrom);
    rec("…writing a tree that is not the base mod's", focusCount(lone) !== BASE_N && focusCount(lone) > 0,
      focusCount(lone));

    console.log("\n[a mod that ships its OWN generic tree] uses its own, as before");
    const own = mkMod("own", { modName: "Own", generic: 7 });
    const r3 = await api.copy(own, "NUC");
    rec("the copy succeeds", r3.b && !r3.b.error, r3.b);
    rec("…and says it used this mod's own", /this mod's generic focus tree/.test(r3.b.copiedFrom || ""), r3.b.copiedFrom);
    rec("…copying from its own 7-focus tree", focusCount(own) === 14, focusCount(own));
    api.stop(); api = null;

    console.log("\n[back-out] look in the active mod, then jump straight to vanilla");
    {
      const built = controlApp("skipbase", [[
        "        let roots = [];\n        try { roots = getActiveRoots(modPath, \"common/national_focus\") || []; } catch (_) { roots = []; }",
        "        let roots = [];\n        try { roots = [modPath, gameRoot].filter(Boolean); } catch (_) { roots = []; }"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          mkMod("cbase", { modName: "CBase", replacePath: true, generic: BASE_N });
          const caddon = mkMod("caddon", { modName: "CAddOn", dependsOn: "CBase" });
          const c = await capi.copy(caddon, "NUD");
          rec("…the control still copies something", c.b && !c.b.error, c.b);
          rec("…but reaches past the base mod to vanilla", /vanilla/.test(c.b.copiedFrom || ""), c.b.copiedFrom);
          rec("…writing a tree the base mod did not author", focusCount(caddon) !== BASE_N,
            { written: focusCount(caddon), base: BASE_N });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== copy generic uses base mod: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
