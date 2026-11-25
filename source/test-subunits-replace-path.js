// #replace-path — THE DIVISION DESIGNER OFFERED BATTALIONS A TOTAL CONVERSION DOES NOT HAVE.
//
// /api/subunits lists every `sub_units = { … }` key the game will load, so the designer can build a division
// template out of them rather than a hardcoded list — mods rename these wholesale (Millennium Dawn calls its
// battalions Mot_Inf_Bat, mech_inf_hq). It resolved its roots with a bare getActiveRoots(modRoot).
//
// MD declares `replace_path = "common/units"`, so vanilla's sub_units do not load for it. Nova listed them
// anyway, beside MD's own — and a template built out of one references a battalion the game does not have.
//
// The other half must not change: vanilla's sub_units DO load underneath an ordinary overlay mod, and the
// designer would be empty without them. That is why getActiveRoots' subpath argument is opt-in.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-surp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VUNITS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units";
const MDROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const HAVE_VANILLA = fs.existsSync(VUNITS);

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
  fs.mkdirSync(path.join(dir, "common", "units"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (replacePath ? 'replace_path = "common/units"\n' : ""), "utf8");
  fs.writeFileSync(path.join(dir, "common", "units", "own.txt"), [
    "sub_units = {",
    `\t${name}_own_battalion = {`,
    "\t\tsprite = infantry",
    "\t\tmap_icon_category = infantry",
    "\t\tpriority = 500",
    "\t\tactive = yes",
    "\t\ttype = { infantry }",
    "\t\tgroup = infantry",
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
  const p = path.join(__dirname, `.ctl-su-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43881;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Every sub_units key vanilla declares — the list the game will NOT load for a mod that replaces the folder.
function vanillaSubunitKeys() {
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(VUNITS).filter((f) => /\.txt$/i.test(f)); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(VUNITS, f), "utf8"); } catch (_) { continue; }
    t = t.replace(/#[^\n]*/g, "");
    const m = /sub_units\s*=\s*\{/.exec(t);
    if (!m) continue;
    const open = t.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < t.length; i += 1) {
      if (t[i] === "{") d += 1;
      else if (t[i] === "}") { d -= 1; if (!d) { close = i; break; } }
    }
    if (close === -1) continue;
    for (const mm of t.slice(open + 1, close).matchAll(/(^|\n)\t([A-Za-z0-9_]+)\s*=\s*\{/g)) out.add(mm[2]);
  }
  return out;
}

(async () => {
  const api = await serve(createApp());
  const subunits = (a, dir) => a.get(`/api/subunits?modPath=${encodeURIComponent(dir)}`)
    .then((c) => (c.b && (c.b.subunits || c.b.units || c.b.items || [])) || []);
  try {
    console.log("\n[ground truth] Millennium Dawn replaces common/units and renames its battalions");
    if (!HAVE_VANILLA || !fs.existsSync(path.join(MDROOT, "common", "units"))) {
      console.log("  (skipped — corpora not installed)");
    } else {
      const desc = fs.readFileSync(path.join(MDROOT, "descriptor.mod"), "utf8");
      rec("MD's descriptor replace_path's common/units", /replace_path\s*=\s*"common\/units"/.test(desc), "not found");
      rec("…and vanilla declares a sub_units list it therefore drops", vanillaSubunitKeys().size > 20, vanillaSubunitKeys().size);
    }

    if (!HAVE_VANILLA) console.log("\n(vanilla not installed — the behaviour sections need vanilla sub_units to hide)");
    else {
      const vk = vanillaSubunitKeys();
      const idOf = (u) => (typeof u === "string" ? u : (u.id || u.key || u.name || ""));

      console.log("\n[control] a mod that does NOT replace the folder still sees every vanilla battalion");
      const plain = mkMod("plain", false);
      let list = await subunits(api, plain);
      rec("vanilla's sub_units are listed", list.filter((u) => vk.has(idOf(u))).length > 20,
        { shown: list.length, vanilla: list.filter((u) => vk.has(idOf(u))).length });
      rec("…alongside the mod's own", list.some((u) => idOf(u) === "plain_own_battalion"), list.map(idOf).slice(0, 8));

      console.log("\n[the bug] a mod that replace_path's common/units loads none of vanilla's");
      const rp = mkMod("rp", true);
      list = await subunits(api, rp);
      rec("not one vanilla battalion is offered", list.filter((u) => vk.has(idOf(u))).length === 0,
        list.filter((u) => vk.has(idOf(u))).map(idOf).slice(0, 8));
      rec("…and the mod's own battalion still is", list.some((u) => idOf(u) === "rp_own_battalion"), list.map(idOf));

      console.log("\n[back-out] drop the subpath argument again");
      const built = controlApp("subpath", [[
        '      try { roots = [modRoot, ...getActiveRoots(modRoot, "common/units").filter((r) => r && r !== modRoot).reverse()]; } catch (_) {}',
        "      try { roots = [modRoot, ...getActiveRoots(modRoot).filter((r) => r && r !== modRoot).reverse()]; } catch (_) {}"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const l = await subunits(capi, rp);
          rec("…and vanilla's battalions are listed again for a mod that replaces the folder",
            l.filter((u) => vk.has(idOf(u))).length > 20, l.length);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== subunits replace_path: ${checks} checks, ${fails.length} failed ===`);
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
