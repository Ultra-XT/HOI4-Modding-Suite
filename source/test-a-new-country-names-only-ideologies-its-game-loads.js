// Every country creator must write a government that names only ideologies the game loads.
// #new-country-has-vanilla-ideologies (the two creators that never adopted it)  +  #ideologies-read-with-the-tech-roots
//
// 1. /api/mod/create-template (the onboarding wizard) and /api/countries/create (Country Setup) wrote literal
//    text: `ruling_party = neutrality` and popularities for democratic / fascism / communism / neutrality.
//    The Map's creator had already been fixed for exactly this — map-data.js createCountry discovers the
//    ideologies with findIdeologies, which is exported for the purpose — and neither server-side creator
//    adopted it.
//
//    Measured over the six shipping maps: every one ships common/ideologies/00_ideologies.txt, the same basename
//    as vanilla's, so each replaces vanilla's file wholesale. Old World Blues declares people, intellectuals,
//    elites, ruler; Novum Vexillum declares 12 (islamist … communist). Neither declares any of vanilla's four,
//    and 0 of their ruling_party values names one. A country made through either server creator on top of
//    them named a ruling party and four popularities that game has never heard of. Both endpoints are
//    reachable there: the wizard takes a `dependencies` list, and Country Setup creates in the active mod.
//
// 2. createCountry resolved those ideologies from the root list the endpoint computed for
//    common/TECHNOLOGIES. The subpath decides what replace_path removes, and getActiveRoots answers [mod] alone
//    when the mod's own descriptor declares replace_path = "common/technologies". A mod that does that and
//    inherits vanilla's ideologies got findIdeologies([mod]) = [] — so the country was written with no
//    set_politics and no set_popularities at all, while the endpoint answered ok:true. Latent (no installed
//    mod has that shape today), but the coupling is invisible: change a mod's technology replace_path and its
//    new countries silently lose their government.
//
// Fixtures: an add-on over a base mod that ships its own 00_ideologies.txt (Old World Blues' shape), and a
// mod that replaces common/technologies and ships no ideologies. Each creator is driven with its client's body.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cc-ideo-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const HAVE_GAME = fs.existsSync(path.join(GAME, "common", "ideologies")) && fs.existsSync(path.join(GAME, "history", "states"));
const toPosix = (p) => p.split(path.sep).join("/");
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c, "utf8"); };

const histOf = (mod, tag) => {
  const d = path.join(mod, "history", "countries");
  try {
    const f = fs.readdirSync(d).find((x) => x.toUpperCase().startsWith(tag + " "));
    return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
  } catch (_) { return ""; }
};
const blockBody = (h, key) => {
  const t = String(h || "").replace(/#[^\n]*/g, "");
  const m = new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*\\{`).exec(t);
  if (!m) return null;
  const open = t.indexOf("{", m.index);
  let d = 0;
  for (let i = open; i < t.length; i++) {
    if (t[i] === "{") d++;
    else if (t[i] === "}") { d--; if (!d) return t.slice(open + 1, i); }
  }
  return null;
};
// What a created country's history says about its government.
function government(h) {
  const pol = blockBody(h, "set_politics");
  const pop = blockBody(h, "set_popularities");
  const ruling = pol ? ((/ruling_party\s*=\s*([A-Za-z0-9_]+)/.exec(pol) || [])[1] || null) : null;
  const pops = pop ? [...pop.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)/g)].map((x) => ({ id: x[1], n: Number(x[2]) })) : [];
  return { hasPolitics: pol !== null, hasPopularities: pop !== null, ruling, pops };
}

const PORT = 54142;
const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  .catch((e) => ({ status: 0, body: { error: String(e) } }));

(async () => {
  let srv = null;
  try {
    if (!HAVE_GAME) {
      console.log("  (the base game is not installed — skipped)");
      return;
    }
    const vanilla = md.findIdeologies([GAME]);

    console.log("\n1. [ground truth] total conversions replace vanilla's ideologies by basename");
    {
      const vFiles = fs.readdirSync(path.join(GAME, "common", "ideologies")).filter((f) => /\.txt$/i.test(f));
      for (const [name, id] of [["Old World Blues", "2265420196"], ["Novum Vexillum", "1827273767"]]) {
        const dir = path.join(WS, id, "common", "ideologies");
        if (!fs.existsSync(dir)) { console.log(`     (${name} not installed)`); continue; }
        const own = md.findIdeologies([path.join(WS, id), GAME]);
        const same = vFiles.filter((f) => fs.existsSync(path.join(dir, f)));
        console.log(`     ${name}: ships ${same.join(", ")} · declares ${own.length}: ${own.join(", ")}`);
        rec(`${name} replaces vanilla's ideology file by basename`, same.length === vFiles.length, same);
        rec(`…and declares none of vanilla's ${vanilla.length}`, own.length > 0 && !own.some((i) => vanilla.includes(i)), own);
      }
    }

    // Old World Blues' shape: a base mod shipping its own file under vanilla's ideology basename(s).
    const BASE_NAME = `NovaCCIdeoBase${process.pid}`; // workshop mods are matched by name first — keep it unique
    const base = path.join(ROOT, "ccbase");
    w(path.join(base, "descriptor.mod"), `name="${BASE_NAME}"\nsupported_version="1.19.*"\n`);
    w(path.join(ROOT, "ccbase.mod"), `name="${BASE_NAME}"\npath="${toPosix(base)}"\nsupported_version="1.19.*"\n`);
    const vIdeoFiles = fs.readdirSync(path.join(GAME, "common", "ideologies")).filter((f) => /\.txt$/i.test(f));
    vIdeoFiles.forEach((f, i) => w(path.join(base, "common", "ideologies", f), i === 0
      ? "ideologies = {\n\tpeople = {\n\t\ttypes = {\n\t\t\tpeople_subtype = {\n\t\t\t}\n\t\t}\n\t}\n\truler = {\n\t\ttypes = {\n\t\t\truler_subtype = {\n\t\t\t}\n\t\t}\n\t}\n}\n"
      : "ideologies = {\n}\n"));
    const mkAddon = (name) => {
      const dir = path.join(ROOT, name);
      w(path.join(dir, "descriptor.mod"), `name="${name}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
      w(path.join(ROOT, `${name}.mod`), `name="${name}"\npath="${toPosix(dir)}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
      fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
      return dir;
    };
    const baseIdeologies = md.findIdeologies([mkAddon("cc-probe"), base, GAME]);
    rec("the base mod's game loads exactly its own ideologies", baseIdeologies.join() === "people,ruler", baseIdeologies);
    const capital = fs.readdirSync(path.join(GAME, "history", "states")).map((x) => /^(\d+)-/.exec(x)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b)[0];

    const judge = (label, h, allowed) => {
      const g = government(h);
      rec(`${label}: the history declares set_politics and set_popularities`, g.hasPolitics && g.hasPopularities, h.slice(0, 300));
      rec(`⭐⭐⭐ ${label}: its ruling party is an ideology the game loads`, !!g.ruling && allowed.includes(g.ruling), { ruling: g.ruling, allowed });
      rec(`⭐⭐⭐ ${label}: every popularity names an ideology the game loads`, g.pops.length > 0 && g.pops.every((p) => allowed.includes(p.id)), { pops: g.pops, allowed });
      rec(`${label}: …and every loaded ideology has one, summing to 100`,
        allowed.every((i) => g.pops.some((p) => p.id === i)) && g.pops.reduce((s, p) => s + p.n, 0) === 100, g.pops);
    };

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("\n2. On an add-on over a total conversion, all three creators");
    {
      const mapMod = mkAddon("cc-map");
      const r1 = await post("/api/map/create-country", { modPath: mapMod, tag: "ZQA", name: "Mapland", rgb: [10, 20, 30], stateIds: [capital], capitalStateId: capital });
      rec("the Map's creator creates the country", r1.body && r1.body.ok === true, r1.body);
      judge("Map", histOf(mapMod, "ZQA"), baseIdeologies);

      const setupMod = mkAddon("cc-setup");
      const r2 = await post("/api/countries/create", { modPath: setupMod, tag: "ZQB", name: "Setupland", color: "10 20 30", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("Country Setup creates the country", r2.body && r2.body.ok === true, r2.body);
      judge("Country Setup", histOf(setupMod, "ZQB"), baseIdeologies);

      const r3 = await post("/api/mod/create-template", { modName: "CC Wizard Ideo", countryName: "Wizardia", countryTag: "ZQW", capitalStateId: capital, color: "120 10 50", dependencies: [BASE_NAME] });
      rec("the wizard creates the starter mod", r3.body && r3.body.ok === true, r3.body);
      judge("Wizard", r3.body && r3.body.modRoot ? histOf(r3.body.modRoot, "ZQW") : "", baseIdeologies);
    }

    console.log("\n3. ⛔ A mod that replaces common/technologies but inherits vanilla's ideologies");
    {
      const mkTc = (name) => {
        const dir = path.join(ROOT, name);
        const desc = `name="${name}"\nsupported_version="1.19.*"\nreplace_path="common/technologies"\n`;
        w(path.join(dir, "descriptor.mod"), desc);
        w(path.join(ROOT, `${name}.mod`), `${desc}path="${toPosix(dir)}"\n`);
        w(path.join(dir, "common", "technologies", "tc.txt"),
          "technologies = {\n\ttc_basic_rifles = {\n\t\tstart_year = 1930\n\t\tenable_subunits = {\n\t\t\tinfantry\n\t\t}\n\t\tresearch_cost = 1\n\t}\n}\n");
        fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
        return dir;
      };
      rec("CONTROL: the mod ships no ideologies, so the game loads vanilla's", !fs.existsSync(path.join(mkTc("cc-tc-probe"), "common", "ideologies")) && vanilla.length > 0, vanilla);

      const mapMod = mkTc("cc-tc-map");
      const r1 = await post("/api/map/create-country", { modPath: mapMod, tag: "ZQC", name: "Techonly", rgb: [1, 2, 3], stateIds: [capital], capitalStateId: capital });
      rec("the Map's creator creates the country", r1.body && r1.body.ok === true, r1.body);
      const h1 = histOf(mapMod, "ZQC");
      rec("CONTROL: …granting the mod's own tech, so the technology roots really were [mod] alone", /tc_basic_rifles\s*=\s*1/.test(h1), h1.slice(0, 200));
      judge("Map (technologies replaced)", h1, vanilla);

      const setupMod = mkTc("cc-tc-setup");
      const r2 = await post("/api/countries/create", { modPath: setupMod, tag: "ZQD", name: "Techsetup", color: "1 2 3", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("Country Setup creates the country", r2.body && r2.body.ok === true, r2.body);
      judge("Country Setup (technologies replaced)", histOf(setupMod, "ZQD"), vanilla);
    }

    console.log("\n4. CONTROL — on the base game every creator still picks neutrality");
    {
      const plain = path.join(ROOT, "cc-plain");
      w(path.join(plain, "descriptor.mod"), 'name="cc-plain"\nsupported_version="1.19.*"\n');
      fs.mkdirSync(path.join(plain, "history", "states"), { recursive: true });
      const r1 = await post("/api/countries/create", { modPath: plain, tag: "ZQE", name: "Plainland", color: "1 2 3", graphicalCulture: "western_european_gfx", capitalStateId: capital });
      rec("Country Setup creates the country", r1.body && r1.body.ok === true, r1.body);
      const g = government(histOf(plain, "ZQE"));
      rec("…ruled by neutrality, as before", g.ruling === "neutrality" && vanilla.includes("neutrality"), g);
      judge("Country Setup (base game)", histOf(plain, "ZQE"), vanilla);
    }

    console.log(`\n=== a new country names only ideologies its game loads: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
