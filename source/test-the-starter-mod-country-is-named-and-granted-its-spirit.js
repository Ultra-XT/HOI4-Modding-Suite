// The onboarding wizard's country must be granted its starting spirit, and be named the way the game reads names.
// #wizard-grants-its-spirit-with-a-statement-that-does-not-exist  +  #wizard-country-has-no-definite-name
//
// 1. /api/mod/create-template ended the country's history with `ideas = { <tag>_starting_spirit }`. There is
//    no such statement. Measured over the six shipping maps' history/countries (2,431 files as each game
//    loads them): 0 use a bare `ideas =` at any depth, while 1,565 use `add_ideas` — and at
//    the top level the block form
//    `add_ideas = { … }` is the one they write (vanilla 75, R56 207, OWB 299, NV 310, RoN 195, MD 2 files; the
//    single-token form appears in 23). effects_documentation.md has `## add_ideas` and no `ideas`. Nova's own
//    national-spirit writer (setIdeaInHistoryText) already writes `add_ideas = {`, its comment noting a bare
//    `ideas = {}` errors "Unknown effect-type: ideas". The spirit is defined correctly in common/ideas — only
//    the statement was wrong — so the starter country simply never had it.
//
// 2. The same handler wrote two country loc keys by hand: `<TAG>` and `<TAG>_ADJ`, the adjective's value being
//    the literal placeholder "<Name> adj" (0 values ending " adj" in the 1,565,818 english loc lines read for
//    the six maps, each mod over vanilla). No `<TAG>_DEF`, so every [GetNameDef] — "…has declared war on the
//    <country>" — renders the raw key. And no form for the ruling party, which HOI4 reads FIRST: measured over
//    the six maps' 2,428 non-dynamic tags, the name/adjective/definite forms exist for EVERY declared ideology
//    on 2,111 (vanilla 344/364, MD 379/385, R56 389/435, OWB 336/354, NV 269/343, RoN 394/547), and all three
//    forms for the ruling party on 2,236 of the 2,383 that name one.
//    writeCountryNameLocalization, the helper both other creators share, already writes those forms. The wizard
//    never called it — and the helper named its ideology forms for vanilla's four whatever the mod loads.
//
// Fixtures: an add-on over a base mod that ships its own ideologies under vanilla's basename (Old World Blues'
// shape), and a standalone starter mod as the control. Driven with the body public/app.js sends.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cc-wiz-"));
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
const MAPS = [GAME, ...["2777392649", "820260968", "2265420196", "1827273767", "2026448968"].map((id) => path.join(WS, id))];
const HAVE_GAME = fs.existsSync(path.join(GAME, "common", "ideologies")) && fs.existsSync(path.join(GAME, "history", "states"));
const toPosix = (p) => p.split(path.sep).join("/");
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c, "utf8"); };

// Every `key = …` statement with its depth, comments masked.
function statements(text) {
  const t = String(text || "").replace(/#[^\n]*/g, "");
  const out = [];
  let depth = 0, m;
  const re = /([A-Za-z0-9_.\-]+)\s*=\s*(\{)?|\{|\}/g;
  while ((m = re.exec(t)) !== null) {
    if (m[0] === "{") { depth++; continue; }
    if (m[0] === "}") { depth--; continue; }
    let body = "";
    if (m[2]) {
      const open = m.index + m[0].length - 1;
      let d = 0, close = -1;
      for (let i = open; i < t.length; i++) {
        if (t[i] === "{") d++;
        else if (t[i] === "}") { d--; if (!d) { close = i; break; } }
      }
      body = close > open ? t.slice(open + 1, close) : "";
    }
    out.push({ key: m[1], depth, body });
    if (m[2]) depth++;
  }
  return out;
}
const histOf = (mod, tag) => {
  const d = path.join(mod, "history", "countries");
  try {
    const f = fs.readdirSync(d).find((x) => x.toUpperCase().startsWith(tag + " "));
    return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
  } catch (_) { return ""; }
};
// Every english loc line in the mod: key -> [values] (a key defined twice shows up twice).
function locOf(mod) {
  const out = new Map();
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/l_english\.yml$/i.test(e.name)) {
        for (const m of fs.readFileSync(full, "utf8").matchAll(/(?:^|\n)[ \t]*([A-Za-z0-9_.\-]+):\d*[ \t]*"([^\n]*)"/g)) {
          if (!out.has(m[1])) out.set(m[1], []);
          out.get(m[1]).push(m[2]);
        }
      }
    }
  };
  walk(path.join(mod, "localisation"));
  return out;
}

const PORT = 54188;
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

    console.log("\n1. [ground truth] how shipping country histories grant a starting spirit");
    {
      let files = 0, bare = 0, add = 0;
      for (const root of MAPS) {
        const dir = path.join(root, "history", "countries");
        let names = [];
        try { names = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
        for (const f of names) {
          const st = statements(fs.readFileSync(path.join(dir, f), "utf8"));
          files++;
          if (st.some((s) => s.key === "ideas")) bare++;
          if (st.some((s) => s.key === "add_ideas")) add++;
        }
      }
      console.log(`     ${files} country history files: bare \`ideas =\` in ${bare}, \`add_ideas\` in ${add}`);
      rec("no shipping country history uses a bare `ideas =` statement", files > 300 && bare === 0, { files, bare });
      rec("…and hundreds use add_ideas", add > 100, add);
    }

    const BASE_NAME = `NovaCCWizBase${process.pid}`; // workshop mods are matched by name first — keep it unique
    const base = path.join(ROOT, "ccbase");
    w(path.join(base, "descriptor.mod"), `name="${BASE_NAME}"\nsupported_version="1.19.*"\n`);
    w(path.join(ROOT, "ccbase.mod"), `name="${BASE_NAME}"\npath="${toPosix(base)}"\nsupported_version="1.19.*"\n`);
    fs.readdirSync(path.join(GAME, "common", "ideologies")).filter((f) => /\.txt$/i.test(f)).forEach((f, i) =>
      w(path.join(base, "common", "ideologies", f), i === 0
        ? "ideologies = {\n\tpeople = {\n\t\ttypes = {\n\t\t\tpeople_subtype = {\n\t\t\t}\n\t\t}\n\t}\n\truler = {\n\t\ttypes = {\n\t\t\truler_subtype = {\n\t\t\t}\n\t\t}\n\t}\n}\n"
        : "ideologies = {\n}\n"));
    const capital = fs.readdirSync(path.join(GAME, "history", "states")).map((x) => /^(\d+)-/.exec(x)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b)[0];

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const judge = (label, mod, tag, name) => {
      const h = histOf(mod, tag);
      const st = statements(h);
      const spirit = `${tag.toLowerCase()}_starting_spirit`;
      console.log(`\n   [${label}] the starting spirit`);
      rec(`⭐⭐⭐ ${label}: the history has no bare \`ideas =\` statement`, !st.some((s) => s.key === "ideas"), st.filter((s) => s.key === "ideas").map((s) => s.body.trim()));
      const grant = st.filter((s) => s.key === "add_ideas" && s.depth === 0);
      rec(`⭐⭐⭐ ${label}: …it grants ${spirit} with a top-level add_ideas block`, grant.some((s) => new RegExp(`(^|\\s)${spirit}(\\s|$)`).test(s.body)), grant.map((s) => s.body.trim()));
      const ideas = fs.existsSync(path.join(mod, "common", "ideas")) ? fs.readdirSync(path.join(mod, "common", "ideas")).map((f) => fs.readFileSync(path.join(mod, "common", "ideas", f), "utf8")).join("\n") : "";
      rec(`${label}: …and the spirit it grants is defined in the mod`, new RegExp(`(^|\\s)${spirit}\\s*=\\s*\\{`).test(ideas));

      console.log(`\n   [${label}] the country's name`);
      const loc = locOf(mod);
      const ruling = (/ruling_party\s*=\s*([A-Za-z0-9_]+)/.exec(h.replace(/#[^\n]*/g, "")) || [])[1] || null;
      rec(`${label}: the history names a ruling party`, !!ruling, h.slice(0, 300));
      for (const k of [tag, `${tag}_ADJ`, `${tag}_DEF`]) {
        const vals = loc.get(k) || [];
        rec(`⭐⭐ ${label}: ${k} is defined exactly once`, vals.length === 1, vals);
      }
      rec(`⭐⭐⭐ ${label}: the adjective is not a placeholder`, (loc.get(`${tag}_ADJ`) || []).every((v) => !/ adj$/i.test(v)) && (loc.get(`${tag}_ADJ`) || [])[0] === name, loc.get(`${tag}_ADJ`));
      const placeholders = [...loc.entries()].filter(([, vs]) => vs.some((v) => / adj$/i.test(v))).map(([k]) => k);
      rec(`${label}: …and no localisation value in the mod ends in " adj"`, placeholders.length === 0, placeholders);
      if (ruling) {
        for (const k of [`${tag}_${ruling}`, `${tag}_${ruling}_ADJ`, `${tag}_${ruling}_DEF`]) {
          rec(`⭐⭐⭐ ${label}: ${k} — the form the game reads first for its ruling party — is defined once`, (loc.get(k) || []).length === 1, loc.get(k));
        }
      }
      return { ruling, loc };
    };

    console.log("\n2. The wizard, making an add-on over a total conversion");
    const addonIdeologies = md.findIdeologies([base, GAME]);
    {
      const r = await post("/api/mod/create-template", { modName: "CC Wizard Addon", countryName: "Wizardia", countryTag: "ZQW", capitalStateId: capital, color: "120 10 50", dependencies: [BASE_NAME] });
      rec("the starter mod is created", r.body && r.body.ok === true, r.body);
      if (r.body && r.body.modRoot) {
        const { ruling, loc } = judge("Wizard add-on", r.body.modRoot, "ZQW", "Wizardia");
        rec("…its ruling party is one of the base mod's ideologies", addonIdeologies.includes(ruling), { ruling, addonIdeologies });
        const dead = md.findIdeologies([GAME]).filter((i) => !addonIdeologies.includes(i) && loc.has(`ZQW_${i}`));
        rec("…and it carries no name form for an ideology that game does not have", dead.length === 0, dead);
      }
    }

    console.log("\n3. The other two creators name the ruling party's forms too, on the same add-on");
    {
      const mkAddon = (name) => {
        const dir = path.join(ROOT, name);
        w(path.join(dir, "descriptor.mod"), `name="${name}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
        w(path.join(ROOT, `${name}.mod`), `name="${name}"\npath="${toPosix(dir)}"\ndependencies={\n\t"${BASE_NAME}"\n}\nsupported_version="1.19.*"\n`);
        fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
        return dir;
      };
      for (const [label, ep, mod, tag, body] of [
        ["Map", "/api/map/create-country", mkAddon("cc-map"), "ZQA", (m) => ({ modPath: m, tag: "ZQA", name: "Mapland", rgb: [1, 2, 3], stateIds: [capital], capitalStateId: capital })],
        ["Country Setup", "/api/countries/create", mkAddon("cc-setup"), "ZQB", (m) => ({ modPath: m, tag: "ZQB", name: "Setupland", color: "1 2 3", graphicalCulture: "western_european_gfx", capitalStateId: capital })],
      ]) {
        const r = await post(ep, body(mod));
        rec(`${label} creates the country`, r.body && r.body.ok === true, r.body);
        const h = histOf(mod, tag);
        const ruling = (/ruling_party\s*=\s*([A-Za-z0-9_]+)/.exec(h) || [])[1];
        const loc = locOf(mod);
        rec(`⭐⭐ ${label}: ${tag}_${ruling}_DEF is defined for the ruling party its history names`, !!ruling && (loc.get(`${tag}_${ruling}_DEF`) || []).length === 1, { ruling, keys: [...loc.keys()].filter((k) => k.startsWith(tag)) });
        rec(`${label}: …alongside the bare ${tag} / ${tag}_ADJ / ${tag}_DEF`, [tag, `${tag}_ADJ`, `${tag}_DEF`].every((k) => (loc.get(k) || []).length === 1), [...loc.keys()].filter((k) => k.startsWith(tag)));
      }
    }

    console.log("\n4. CONTROL — a standalone starter mod on the base game");
    {
      const r = await post("/api/mod/create-template", { modName: "CC Wizard Plain", countryName: "Plainia", countryTag: "ZQV", capitalStateId: capital, color: "120 10 50", dependencies: [] });
      rec("the starter mod is created", r.body && r.body.ok === true, r.body);
      if (r.body && r.body.modRoot) {
        const { ruling, loc } = judge("Wizard standalone", r.body.modRoot, "ZQV", "Plainia");
        rec("…ruled by neutrality", ruling === "neutrality", ruling);
        rec("…with the constructed party names the shared helper has always written", (loc.get("ZQV_democratic_DEF") || [])[0] === "the Republic of Plainia", loc.get("ZQV_democratic_DEF"));
        rec("…and the wizard's own focus/event/decision loc untouched", (loc.get("zqv_starting_spirit") || [])[0] === "Plainia Legacy", loc.get("zqv_starting_spirit"));
      }
    }

    console.log(`\n=== the starter mod's country is named and granted its spirit: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
