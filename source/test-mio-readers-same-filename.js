// #mio-readers-ignore-same-filename — WHICH ROOT OWNS EACH FILENAME, NOT JUST EACH ID.
//
// `_mioRoots` returns [gameRoot, …extras, …deps, modRoot] and its own comment already states the intent —
// "active mod LAST so its same-basename files win" — but only the per-ID merge honoured it. HOI4 loads only
// the LAST copy of a common/ file at a given relative path, so a mod shipping its own copy of a vanilla
// organizations file replaces it wholesale and every company that file defined which the mod does not
// redefine is dead. Both MIO readers went on offering them.
//
// Measured: after a mod hand-writes its own 00_generic_organization.txt containing one company, the
// "who designs this variant" picker still offered generic_tank_organization and
// generic_medium_tank_organization for USA/medium_tank_chassis, and the trait list did not move (815 either
// way). With the rule applied those become 0 phantoms, companies 31 → 2 and traits 815 → 450.
//
// The WRITER was fixed earlier the same day to refuse to CREATE such a shadow, so this is now reachable only
// through a file the author wrote by hand — which the writer cannot prevent and modders do routinely. That
// is why the fixture below writes the file directly rather than going through POST /api/mio.
//
// ⚠️ ORDERING: roots are lowest-priority-FIRST here, so the owner of a basename is the HIGHEST index — the
// same as the module scanner and the OPPOSITE of the battalion palette, whose list is built the other way
// round. Both readers share one helper precisely so the arithmetic cannot be right in one and wrong in the
// other, and every case below asserts the mod's OWN company survives, because inverted arithmetic keeps
// vanilla and drops the mod while the totals still look plausible.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioread-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const ORG_REL = ["common", "military_industrial_organization", "organizations"];
const ORG = path.join(GAME, ...ORG_REL);
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(opts) {
  const o = opts || {};
  const n = "MR" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, ...ORG_REL), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n'
    + (o.deps ? 'dependencies={ "' + o.deps + '" }\n' : "")
    + (o.replace ? 'replace_path="common/military_industrial_organization/organizations"\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
// Top-level org ids, walked by BRACES. Guessing indentation broke a probe earlier today.
function orgIdsIn(text) {
  const src = String(text).replace(/#.*$/gm, "");
  const out = [];
  let depth = 0, m;
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{|\{|\}/g;
  while ((m = re.exec(src)) !== null) {
    if (m[0] === "}") { depth--; continue; }
    if (m[0] === "{") { depth++; continue; }
    if (depth === 0) out.push(m[1]);
    depth++;
  }
  return out;
}
const ORG_ONE = (id) => id + " = {\n\ticon = GFX_idea_generic_air_manufacturer_3\n"
  + "\tallowed = { original_tag = USA }\n\tequipment_type = { mio_cat_eq_all_medium_tank }\n"
  + "\ttrait = { token = " + id + "_trait\n\t\tname = " + id + "_trait\n\t\ttype = organization\n"
  + "\t\tequipment_bonus = { reliability = 0.05 } }\n}\n";
const putOrgs = (mod, file, id) => fs.writeFileSync(path.join(mod, ...ORG_REL, file), ORG_ONE(id));

let PORT = 50410;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      companies: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/mio/for-equipment?modPath="
        + encodeURIComponent(mod) + "&archetype=medium_tank_chassis&tag=USA")
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      traits: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/mio/traits?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const idsOf = (r) => new Set((r.companies || []).map((c) => c.id));

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(ORG)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] the organizations file a mod is most likely to shadow");
    let victim = "", victimIds = [];
    for (const f of fs.readdirSync(ORG).filter((x) => x.endsWith(".txt"))) {
      const ids = orgIdsIn(fs.readFileSync(path.join(ORG, f), "latin1"));
      if (ids.length > victimIds.length) { victim = f; victimIds = ids; }
    }
    console.log(`  ${victim} defines ${victimIds.length} companies`);
    rec("fixture: there is a real vanilla file to shadow", victimIds.length > 5, { victim, n: victimIds.length });

    api = await serve(createApp());

    console.log("\n[control] a mod that shadows nothing sees everything");
    const plain = mkMod({});
    const baseC = await api.companies(plain.dir);
    const baseT = await api.traits(plain.dir);
    const baseIds = idsOf(baseC);
    rec("both endpoints answer", baseC.ok === true && baseT.ok === true, { c: baseC.ok, t: baseT.ok });
    rec("…offering companies", baseIds.size > 0, baseIds.size);
    rec("…and traits", (baseT.traits || []).length > 0, (baseT.traits || []).length);
    // Which of the victim file's companies this filtered view actually shows — the number that must fall to 0.
    const visible = victimIds.filter((k) => baseIds.has(k));
    rec("…including some from the file we are about to shadow", visible.length > 0, visible);

    console.log("\n[the mod ships that filename] its companies stop being offered");
    {
      const mod = mkMod({});
      putOrgs(mod.dir, victim, "mr_only_org");
      const c = await api.companies(mod.dir);
      const t = await api.traits(mod.dir);
      const ids = idsOf(c);
      rec("the endpoint answers", c.ok === true, c);
      rec("…and the mod's OWN company is offered", ids.has("mr_only_org"),
        "the mod's own company was dropped — the ownership test is inverted");
      rec("…while none of the replaced file's are",
        visible.every((k) => !ids.has(k)), visible.filter((k) => ids.has(k)));
      rec("…so the company count really moved", ids.size < baseIds.size, { before: baseIds.size, after: ids.size });
      rec("…and the TRAIT list moved too", (t.traits || []).length < (baseT.traits || []).length,
        { before: (baseT.traits || []).length, after: (t.traits || []).length });
    }

    console.log("\n[a dependency ships it] the base mod shadows vanilla, the add-on shadows the base");
    {
      const b = mkMod({});
      putOrgs(b.dir, victim, "mr_base_org");
      const addon = mkMod({ deps: b.name });
      const c1 = idsOf(await api.companies(addon.dir));
      rec("the add-on sees the BASE MOD's company", c1.has("mr_base_org"), "base company missing");
      rec("…and not vanilla's from the file the base replaced",
        visible.every((k) => !c1.has(k)), visible.filter((k) => c1.has(k)));

      putOrgs(addon.dir, victim, "mr_addon_org");
      const c2 = idsOf(await api.companies(addon.dir));
      rec("…and its own file beats the base mod's", c2.has("mr_addon_org"), "own company missing");
      rec("…so the base's company from that filename is gone too", !c2.has("mr_base_org"), "base company still offered");
    }

    console.log("\n[replace_path] the rule that already worked still does");
    {
      const mod = mkMod({ replace: true });
      putOrgs(mod.dir, "zz_only.txt", "mr_replace_org");
      const ids = idsOf(await api.companies(mod.dir));
      rec("a declared replace_path collapses to the mod's own",
        ids.size === 1 && ids.has("mr_replace_org"), [...ids].slice(0, 5));
    }

    api.stop(); api = null;
    console.log(`\n=== mio readers same filename: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
