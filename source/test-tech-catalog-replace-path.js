// #tech-catalog-ignores-replace-path — THE RESEARCH TREE OFFERED 549 TECHNOLOGIES A TOTAL CONVERSION DOES NOT
// HAVE, AND NONE OF THE ONES IT DOES.
//
// collectAllEquipments has honoured replace_path since #replace-path: a mod declaring
// `replace_path = "common/units/equipment"` does not load vanilla's equipment, so Nova must not offer it —
// building a design on content that doesn't exist crashes the game. collectAllTechnologies, its sibling, and
// the source for the research-tree catalogue, the Country Setup "add starting tech" picker and the
// unknown-id guard, scanned vanilla + the active mod and nothing else.
//
// Millennium Dawn declares `replace_path = "common/technologies"` AND re-ships 7 of vanilla's 13 filenames.
// Measured: the catalogue returned 1,506 technologies for an MD-shaped mod against the 988 MD actually has.
// 549 of the entries came from vanilla's files, and 515 of those ids are declared nowhere in MD — every one a
// legal drop target for a prerequisite, a folder placement or a `set_technology` grant that would then
// reference nothing. (The other 34 are ids MD redefines itself, so they belong there.)
//
// The mirror-image half: a dependency mod's technologies DO load, before the active mod's. An add-on built on
// a total conversion could not see a single one of the base mod's techs — so the tree it is extending was
// invisible while the phantom vanilla techs sat in its place.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tcrp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VTECH = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies";
const MDROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const HAVE_VANILLA = fs.existsSync(VTECH);
const HAVE_MD = fs.existsSync(path.join(MDROOT, "common", "technologies"));

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

// Top-level technology ids declared by every .txt in a common/technologies directory.
// ⚠️ MOVED 2026-09-11 — BY BRACE DEPTH, NOT BY ONE TAB. This used to take every `<id> = {` indented with exactly one
// tab. The owner's reinstalled Millennium Dawn writes the blocks INSIDE its ukr_zhytomyr_* technologies
// (custom_tech.txt) with one tab too, so this reader counted `allow` as a technology MD declares and "every
// technology MD declares is still there" failed on every commit — a fault in the probe, not the catalogue. A
// technology is a direct child of `technologies = { }`; that is what HOI4 reads and what this counts now.
function techIdsInDir(dir) {
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    t = t.replace(/#[^\n]*/g, "");
    const re = /([A-Za-z0-9_@.\-]+)\s*=\s*\{|\{|\}/g;
    let depth = 0, inTechs = false, m;
    while ((m = re.exec(t)) !== null) {
      if (m[0] === "}") { depth--; if (depth <= 0) { depth = 0; inTechs = false; } continue; }
      if (m[0] !== "{") {
        if (depth === 0) inTechs = m[1] === "technologies";
        else if (depth === 1 && inTechs && !m[1].startsWith("@")) out.add(m[1]);
      }
      depth++;
    }
  }
  return out;
}

function mkMod(name, opts) {
  const o = opts || {};
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${o.modName || name}"\nsupported_version="1.19.*"\n`
    + (o.replacePath ? 'replace_path = "common/technologies"\n' : "")
    + (o.dependsOn ? `dependencies = { "${o.dependsOn}" }\n` : ""), "utf8");
  if (o.seedFrom) {
    for (const f of fs.readdirSync(path.join(o.seedFrom, "common", "technologies")).filter((x) => /\.txt$/i.test(x))) {
      fs.copyFileSync(path.join(o.seedFrom, "common", "technologies", f), path.join(dir, "common", "technologies", f));
    }
  }
  if (o.ownTech) {
    // One file per MOD, not one filename shared by all of them. When every fixture mod wrote `own.txt`,
    // a base mod and its add-on shipped the same basename — which HOI4 replaces wholesale — so the
    // dependency-layering checks below were quietly measuring same-filename replacement instead.
    // That case is now covered on purpose, at the end of this file and in
    // test-tech-same-filename-shadow.js. #tech-catalog-ignores-same-filename
    const ownFile = o.ownFile || `own_${name}.txt`;
    fs.writeFileSync(path.join(dir, "common", "technologies", ownFile), [
      "technologies = {",
      `\t${o.ownTech} = {`,
      "\t\tresearch_cost = 1",
      "\t\tstart_year = 1936",
      "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
  }
  if (o.register) {
    fs.writeFileSync(path.join(ROOT, `${name}.mod`),
      `name="${o.modName || name}"\npath="${dir.replace(/\\/g, "/")}"\nsupported_version="1.19.*"\n`, "utf8");
  }
  return dir;
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  // Bust the technology catalogue cache. The on-disk cache is keyed by roots + a parser fingerprint that
  // both the fixed build and the backed-out one produce identically, so without this a control is handed
  // the RESULT THE FIX ALREADY COMPUTED and passes while proving nothing. (The depscan control did exactly
  // that on its first run.)
  // ⚠️ DERIVE THE TAG, DO NOT SPELL IT. This was hard-coded as "|tcp16" and broke the moment the tag moved
  // to tcp17 — correctly, since the anchor check is designed to fail loudly rather than silently patch
  // nothing, but it is a maintenance trap: the tag is SUPPOSED to move every time the parser changes, so
  // pinning its value here guarantees this file breaks on a routine bump. Read whatever it currently is.
  const tagMatch = /fingerprintDirs\(dirs\b[^)]*\) \+ "\|(tcp\d+)"/.exec(src);   // (any arguments after dirs)
  if (!tagMatch) return { error: "could not find the parser cache tag in server.js" };
  const TAG = "|" + tagMatch[1];
  for (const [from, to] of pairs.concat([[TAG, TAG + "-ctl-" + label]])) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-tc-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43791;
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
  const catalog = (a, dir) => a.get(`/api/technologies/catalog?lite=1&modPath=${encodeURIComponent(dir)}`)
    .then((c) => (c.b && (c.b.technologies || c.b.techs)) || []);
  try {
    console.log("\n[ground truth] Millennium Dawn replaces the technology directory AND re-ships its filenames");
    if (!HAVE_VANILLA || !HAVE_MD) console.log("  (skipped — corpora not installed)");
    else {
      const desc = fs.readFileSync(path.join(MDROOT, "descriptor.mod"), "utf8");
      rec("MD's descriptor replace_path's common/technologies",
        /replace_path\s*=\s*"common\/technologies"/.test(desc), "not found");
      const vf = new Set(fs.readdirSync(VTECH).filter((f) => /\.txt$/i.test(f)));
      const mf = fs.readdirSync(path.join(MDROOT, "common", "technologies")).filter((f) => /\.txt$/i.test(f));
      const shared = mf.filter((f) => vf.has(f)).length;
      // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy re-ships one fewer of vanilla's
      // technology filenames than the 7 pinned here, so the check failed while the catalogue was unchanged. What the
      // sections below rely on is that MD replaces the directory AND still ships some of vanilla's names; that is
      // asserted, and the counts are printed rather than typed.
      console.log(`     vanilla ships ${vf.size} technology files; MD ships ${mf.length}, ${shared} of them under vanilla's names`);
      rec("…and still re-ships some of vanilla's technology filenames, which replaces them on name alone",
        vf.size > 0 && shared > 0, { shared, vanillaFiles: vf.size });
    }

    if (!HAVE_VANILLA) console.log("\n(vanilla not installed — the behaviour sections need a vanilla catalogue to hide)");
    else {
      const vanillaIds = techIdsInDir(VTECH);
      rec("vanilla declares a substantial technology catalogue", vanillaIds.size > 500, vanillaIds.size);

      console.log("\n[control] a mod that does NOT replace the directory still sees every vanilla technology");
      // Without this the fix could be "hide vanilla always", which breaks every ordinary mod: vanilla's
      // technologies DO load underneath an overlay mod and the tree must show them.
      const plain = mkMod("plain", { ownTech: "plain_own_tech" });
      let list = await catalog(api, plain);
      rec("vanilla's technologies are listed", list.filter((t) => vanillaIds.has(t.id)).length > 500,
        list.filter((t) => vanillaIds.has(t.id)).length);
      rec("…alongside the mod's own", list.some((t) => t.id === "plain_own_tech" && t.isMod), list.length);

      console.log("\n[the bug] a mod that replace_path's common/technologies loads none of vanilla's");
      const rp = mkMod("rp", { replacePath: true, ownTech: "rp_own_tech" });
      list = await catalog(api, rp);
      rec("not one vanilla technology is offered", list.filter((t) => vanillaIds.has(t.id)).length === 0,
        list.filter((t) => vanillaIds.has(t.id)).map((t) => t.id).slice(0, 8));
      rec("…and the mod's own technology still is", list.some((t) => t.id === "rp_own_tech"), list.map((t) => t.id));

      if (HAVE_MD) {
        console.log("\n[the bug] the same shape with Millennium Dawn's real technology files");
        const mdIds = techIdsInDir(path.join(MDROOT, "common", "technologies"));
        const phantom = [...vanillaIds].filter((id) => !mdIds.has(id));
        // (MOVED 2026-09-11: this pinned 515; the count is printed and only its existence is asserted.)
        console.log(`     ${phantom.length} of vanilla's ${vanillaIds.size} technologies are declared nowhere in MD's ${mdIds.size}`);
        rec("vanilla technologies declared nowhere in MD's own files exist, so the next check is not vacuous",
          phantom.length > 0, phantom.length);
        const mdLike = mkMod("mdlike", { replacePath: true, seedFrom: MDROOT });
        list = await catalog(api, mdLike);
        rec("…and NOT ONE of them is offered", list.filter((t) => phantom.includes(t.id)).length === 0,
          list.filter((t) => phantom.includes(t.id)).slice(0, 8).map((t) => t.id));
        const missing = [...mdIds].filter((id) => !list.some((t) => t.id === id));
        rec("…while every technology MD declares is still there", missing.length === 0, missing.slice(0, 8));
      }

      console.log("\n[the bug] an add-on sees the BASE MOD's technologies, which load before its own");
      mkMod("basetc", { modName: "BaseTC", replacePath: true, ownTech: "base_tc_rifles", register: true });
      const addon = mkMod("addon", { dependsOn: "BaseTC", ownTech: "addon_own_tech" });
      list = await catalog(api, addon);
      const byId = new Map(list.map((t) => [t.id, t]));
      rec("the base mod's technology is listed", byId.has("base_tc_rifles"), list.map((t) => t.id));
      rec("…as content the add-on may NOT edit", byId.get("base_tc_rifles") && !byId.get("base_tc_rifles").isMod,
        byId.get("base_tc_rifles"));
      rec("the add-on's own technology is editable", !!(byId.get("addon_own_tech") || {}).isMod, byId.get("addon_own_tech"));
      rec("…and vanilla's are gone, because the BASE replaces the directory",
        list.filter((t) => vanillaIds.has(t.id)).length === 0, list.filter((t) => vanillaIds.has(t.id)).slice(0, 8));

      // …and the case this fixture used to hit by accident, now on purpose. Every mod here once wrote its
      // technologies to `own.txt`, so the add-on's file shared a basename with the base mod's — which HOI4
      // replaces wholesale. The checks above were measuring that instead of dependency layering.
      // #tech-catalog-ignores-same-filename
      console.log("\n[same filename] an add-on that ships the BASE's filename replaces that file, as the game does");
      mkMod("basetc2", { modName: "BaseTC2", ownTech: "base_tc2_rifles", ownFile: "shared_name.txt", register: true });
      const shadowAddon = mkMod("addon2", { dependsOn: "BaseTC2", ownTech: "addon2_own_tech", ownFile: "shared_name.txt" });
      const shadowList = await catalog(api, shadowAddon);
      rec("the base mod's technology is NOT offered, because its file was replaced",
        !shadowList.some((t) => t.id === "base_tc2_rifles"), shadowList.map((t) => t.id).slice(0, 10));
      rec("…while the add-on's own still is", shadowList.some((t) => t.id === "addon2_own_tech"),
        shadowList.map((t) => t.id).slice(0, 10));
    }
    api.stop();

    console.log("\n[back-out] each half, removed on its own");
    if (!HAVE_VANILLA) console.log("  (skipped — needs vanilla)");
    else {
      const vanillaIds = techIdsInDir(VTECH);
      const rpDir = path.join(ROOT, "rp");
      const addonDir = path.join(ROOT, "addon");

      let built = controlApp("skipvanilla", [[
        "    const scanRoots = [skipVanillaTech ? null : gameRoot, ...depRoots, activeRoot].filter(Boolean);",
        "    const scanRoots = [gameRoot, ...depRoots, activeRoot].filter(Boolean);"], [
        "    if (!skipVanillaTech) {", "    if (true) {"]]);
      if (built.error) rec("the control patched cleanly (skipvanilla)", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const list = await catalog(capi, rpDir);
          rec("[skipvanilla] back out the replace_path check → vanilla's technologies are offered again",
            list.filter((t) => vanillaIds.has(t.id)).length > 500, list.length);
        } finally { capi.stop(); }
      }

      built = controlApp("depscan", [[
        "        scanRoot(depRoot, false, ++_scanIdxT);", "        if (depRoot === null) scanRoot(depRoot, false);"]]);
      if (built.error) rec("the control patched cleanly (depscan)", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const list = await catalog(capi, addonDir);
          rec("[depscan] back out the dependency scan → the base mod's tree is invisible again",
            !list.some((t) => t.id === "base_tc_rifles"), list.map((t) => t.id));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech catalog replace_path: ${checks} checks, ${fails.length} failed ===`);
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
