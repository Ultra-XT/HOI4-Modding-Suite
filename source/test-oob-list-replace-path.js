// #replace-path — THE ARMY MAKER SHOWED A STARTING ARMY A TOTAL CONVERSION'S COUNTRIES DO NOT HAVE.
//
// getActiveRoots(modRoot, subpath) drops the game root when the mod or a dependency declares
// `replace_path = "<subpath>"`. The order-of-battle readers called it without one, at three sites: the
// read-only OOB view, readUnitsFileAcrossRoots (which the editable Army Maker loads through), and the
// no-reference fallback that picks a country's units file.
//
// Millennium Dawn declares `replace_path = "history/units"`. So for any MD country without its own OOB file,
// Nova read vanilla's, showed its divisions and templates as the country's starting army, and — because the
// editor seeds the mod's file from whatever it loaded — would have written vanilla's 1936 order of battle
// into a modern-day total conversion on the first save.
//
// The opposite case is the common one and must not change: vanilla's OOB files DO load underneath an
// ordinary overlay mod, and an add-on genuinely inherits them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobrp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VUNITS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/units";
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

// A country whose history names vanilla's OOB, in a mod that ships no units file of its own.
function mkMod(name, replacePath) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.mkdirSync(path.join(dir, "history", "units"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (replacePath ? 'replace_path = "history/units"\n' : ""), "utf8");
  fs.writeFileSync(path.join(dir, "history", "countries", "ALB - Albania.txt"), 'capital = 44\n\noob = "ALB_1936"\n', "utf8");
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
  const p = path.join(__dirname, `.ctl-oob-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43851;
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
  const army = (a, dir) => a.get(`/api/army?tag=ALB&modPath=${encodeURIComponent(dir)}`).then((c) => c.b || {});
  try {
    console.log("\n[ground truth] Millennium Dawn replaces the order-of-battle folder");
    if (!HAVE_VANILLA || !fs.existsSync(path.join(MDROOT, "history", "units"))) {
      console.log("  (skipped — corpora not installed)");
    } else {
      const desc = fs.readFileSync(path.join(MDROOT, "descriptor.mod"), "utf8");
      rec("MD's descriptor replace_path's history/units", /replace_path\s*=\s*"history\/units"/.test(desc), "not found");
      rec("…and vanilla ships hundreds of OOB files it therefore drops",
        fs.readdirSync(VUNITS).filter((f) => /\.txt$/i.test(f)).length > 500,
        fs.readdirSync(VUNITS).filter((f) => /\.txt$/i.test(f)).length);
    }

    if (!HAVE_VANILLA) console.log("\n(vanilla not installed — the behaviour sections need a vanilla OOB to inherit)");
    else {
      console.log("\n[control] a mod that does NOT replace the folder still inherits vanilla's OOB");
      // Without this the fix could be "never inherit", which would empty the Army Maker for every ordinary
      // mod — the case where vanilla's file really does load.
      const plain = mkMod("plain", false);
      let b = await army(api, plain);
      rec("the vanilla OOB file is found", b.exists === true && /ALB_1936/.test(String(b.file)), { file: b.file, exists: b.exists });
      rec("…and its divisions are shown", (b.divisions || []).length > 0, (b.divisions || []).length);
      rec("…and its templates are shown", (b.templates || []).length > 0, (b.templates || []).length);

      console.log("\n[the bug] a mod that replace_path's history/units loads none of vanilla's");
      const rp = mkMod("rp", true);
      b = await army(api, rp);
      rec("the vanilla OOB file is NOT read", b.exists === false, { file: b.file, exists: b.exists });
      rec("…no divisions are attributed to the country", (b.divisions || []).length === 0, (b.divisions || []).length);
      rec("…and no templates either", (b.templates || []).length === 0, (b.templates || []).length);
      rec("the country history is still read, so the OOB reference is still reported",
        Array.isArray(b.oobNames) && b.oobNames.includes("ALB_1936"), b.oobNames);
      rec("…and the endpoint still answers rather than erroring", b.ok !== false, b.error || b.ok);

      console.log("\n[back-out] drop the subpath argument again");
      const built = controlApp("subpath", [[
        '    try { roots = [modRoot, ...getActiveRoots(modRoot, "history/units").filter((r) => r && r !== modRoot).reverse()]; } catch (_) {}',
        "    try { roots = [modRoot, ...getActiveRoots(modRoot).filter((r) => r && r !== modRoot).reverse()]; } catch (_) {}"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const c = await army(capi, rp);
          rec("…and vanilla's order of battle is read again for a mod that replaces the folder",
            c.exists === true && (c.divisions || []).length > 0, { exists: c.exists, divisions: (c.divisions || []).length });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== OOB list replace_path: ${checks} checks, ${fails.length} failed ===`);
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
