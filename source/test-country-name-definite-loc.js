// #new-country-has-no-definite-name — A NOVA-MADE COUNTRY READ "NVX_neutrality_DEF" IN EVERY SENTENCE THAT
// NAMED IT.
//
// #new-country-has-no-name fixed a country being created with NO localisation at all, and wrote two of the
// three forms HOI4 reads: the name (`<KEY>`) and the adjective (`<KEY>_ADJ`). The third is `<KEY>_DEF`, the
// definite form, read through [GetNameDef] / [GetNameDefCap] wherever a sentence needs "the <country>" —
// "…has declared war on the German Reich". A missing key renders as the key itself, so every one of those
// sites showed the raw token.
//
// It is not a rare form. Vanilla's own localisation uses GetNameDef* 75,185 times — MORE than GetAdjective*
// at 65,115 — and both corpora ship the key at the same coverage as the adjective:
//   vanilla: 319 tags with <TAG>_ADJ, 318 with <TAG>_DEF; 353 with an ideology _ADJ, 362 with an ideology _DEF
//   MD:      384 tags with an ideology _ADJ, 384 with an ideology _DEF
//
// The VALUE follows the convention measured over vanilla's 3,168 <KEY>/<KEY>_DEF pairs: a bare proper name is
// its own definite form (869 pairs — "Albania"/"Albania"), a constructed state name takes the article (2,136
// pairs — "German Reich"/"the German Reich"). The four forms Nova generates split exactly that way.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cdef-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VROOT = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MDROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const HAVE_VANILLA = fs.existsSync(path.join(VROOT, "localisation", "english"));

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

function tagsOf(root) {
  const s = new Set();
  try {
    for (const f of fs.readdirSync(path.join(root, "common", "country_tags"))) {
      const t = fs.readFileSync(path.join(root, "common", "country_tags", f), "utf8").replace(/#[^\n]*/g, "");
      for (const m of t.matchAll(/(^|\n)\s*([A-Z]{3})\s*=\s*"/g)) s.add(m[2]);
    }
  } catch (_) {}
  return s;
}
function locKeysOf(root) {
  const s = new Set();
  const walk = (d) => {
    let e = [];
    try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of e) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) walk(p);
      else if (/\.yml$/i.test(x.name)) {
        try { for (const m of fs.readFileSync(p, "utf8").matchAll(/(^|\n)\s*([A-Za-z0-9_.:-]+):/g)) s.add(m[2]); } catch (_) {}
      }
    }
  };
  walk(path.join(root, "localisation"));
  return s;
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
  const p = path.join(__dirname, `.ctl-cd-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A minimal mod the country maker will accept: a tag file, a countries dir, a state to be the capital.
function mkMod(name) {
  const dir = path.join(ROOT, name);
  for (const rel of [["common", "country_tags"], ["common", "countries"], ["history", "countries"],
    ["history", "states"], ["localisation", "english"]]) fs.mkdirSync(path.join(dir, ...rel), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "common", "country_tags", "00_countries.txt"), 'ZZQ = "countries/Placeholder.txt"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "countries", "Placeholder.txt"),
    "graphical_culture = western_european_gfx\ngraphical_culture_2d = western_european_2d\n\ncolor = { 10 10 10 }\n", "utf8");
  fs.writeFileSync(path.join(dir, "history", "states", "1-Placeholder.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 100\n\tprovinces = { 1 }\n\thistory = { owner = ZZQ }\n}\n', "utf8");
  return dir;
}

let PORT = 43941;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Every NVX line the mod's english localisation carries, as key -> value.
function locOf(dir) {
  const out = {};
  const base = path.join(dir, "localisation", "english");
  let files = [];
  try { files = fs.readdirSync(base); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(base, f), "utf8"); } catch (_) { continue; }
    for (const m of t.matchAll(/(^|\n)\s*(NVX[A-Za-z0-9_]*):\d*\s*"([^"]*)"/g)) out[m[2]] = m[3];
  }
  return out;
}

(async () => {
  const api = await serve(createApp());
  const create = (a, dir) => a.post("/api/countries/create", {
    modPath: dir, tag: "NVX", name: "Novaxia", color: "51 102 204",
    graphicalCulture: "western_european_gfx", capitalStateId: 1,
  });
  try {
    console.log("\n[ground truth] the definite form is not optional — both corpora ship it for every country");
    if (!HAVE_VANILLA) console.log("  (skipped — vanilla not installed)");
    else {
      const IDE = ["fascism", "democratic", "communism", "neutrality"];
      const vTags = tagsOf(VROOT), vKeys = locKeysOf(VROOT);
      let adj = 0, def = 0, iAdj = 0, iDef = 0;
      for (const t of vTags) {
        if (vKeys.has(`${t}_ADJ`)) adj++;
        if (vKeys.has(`${t}_DEF`)) def++;
        if (IDE.some((i) => vKeys.has(`${t}_${i}_ADJ`))) iAdj++;
        if (IDE.some((i) => vKeys.has(`${t}_${i}_DEF`))) iDef++;
      }
      rec("vanilla declares 364 country tags", vTags.size === 364, vTags.size);
      rec("…318 carry <TAG>_DEF, against 319 carrying <TAG>_ADJ", def === 318 && adj === 319, { def, adj });
      rec("…and 362 carry an ideology _DEF, MORE than the 353 carrying an ideology _ADJ",
        iDef === 362 && iAdj === 353, { iDef, iAdj });
      if (fs.existsSync(path.join(MDROOT, "localisation"))) {
        // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn and the fresh copy declares more tags than
        // the 385 this pinned, so "384 of its 385" failed while the claim still held. The claim was never the
        // number: it is that a real mod ships the definite form wherever it ships the adjective. That is now
        // asserted as a set, against whatever MD is installed, and the counts are printed rather than typed.
        const mTags = tagsOf(MDROOT), mKeys = locKeysOf(MDROOT);
        const withAdj = [], withDef = new Set();
        for (const t of mTags) {
          if (IDE.some((i) => mKeys.has(`${t}_${i}_ADJ`))) withAdj.push(t);
          if (IDE.some((i) => mKeys.has(`${t}_${i}_DEF`))) withDef.add(t);
        }
        console.log(`     Millennium Dawn: ${mTags.size} tags — ${withAdj.length} with an ideology _ADJ, ${withDef.size} with an ideology _DEF`);
        rec("Millennium Dawn ships ideology adjectives at all (the comparison below is not vacuous)",
          withAdj.length > 0, { tags: mTags.size });
        rec("…and every tag with an ideology _ADJ also ships an ideology _DEF",
          withAdj.every((t) => withDef.has(t)), withAdj.filter((t) => !withDef.has(t)).slice(0, 10));
      }
    }

    console.log("\n[the bug] a country created by the maker carries all three forms");
    const mod = mkMod("defmod");
    const r = await create(api, mod);
    rec("the country was created", r.s === 200 && r.b && r.b.ok, r.b || r.s);
    const loc = locOf(mod);
    for (const k of ["NVX", "NVX_neutrality", "NVX_democratic", "NVX_fascism", "NVX_communism"]) {
      rec(`  ${k} has a name, an adjective AND a definite form`,
        !!loc[k] && !!loc[`${k}_ADJ`] && !!loc[`${k}_DEF`],
        { name: loc[k], adj: loc[`${k}_ADJ`], def: loc[`${k}_DEF`] });
    }

    console.log("\n[the value] a bare name is its own definite form; a constructed one takes the article");
    rec("the plain name is bare", loc.NVX_DEF === "Novaxia", loc.NVX_DEF);
    rec("…and so is the non-aligned name, which is the same string", loc.NVX_neutrality_DEF === "Novaxia", loc.NVX_neutrality_DEF);
    rec("the republic takes `the`", loc.NVX_democratic_DEF === "the Republic of Novaxia", loc.NVX_democratic_DEF);
    rec("…the empire too", loc.NVX_fascism_DEF === "the Novaxia Empire", loc.NVX_fascism_DEF);
    rec("…and the socialist republic", loc.NVX_communism_DEF === "the Socialist Republic of Novaxia", loc.NVX_communism_DEF);
    rec("no definite form was written as `the the …`", !Object.values(loc).some((v) => /^the the /i.test(v)), loc);

    console.log("\n[control] the name and adjective the earlier fix added are untouched");
    // Without this the change could have replaced the two working forms instead of adding a third.
    rec("the plain name still reads Novaxia", loc.NVX === "Novaxia", loc.NVX);
    rec("the adjective is the bare name, not the state form", loc.NVX_democratic_ADJ === "Novaxia", loc.NVX_democratic_ADJ);
    rec("the party names are unchanged",
      loc.NVX_fascism === "Novaxia Empire" && loc.NVX_communism === "Socialist Republic of Novaxia",
      { f: loc.NVX_fascism, c: loc.NVX_communism });
    rec("exactly 15 NVX keys were written — five forms × name/adjective/definite",
      Object.keys(loc).length === 15, Object.keys(loc));
    api.stop();

    console.log("\n[back-out] stop emitting the definite form");
    const built = controlApp("nodef", [[
      '    out.push({ key: `${T}${suffix}_DEF`, value: value === n ? value : `the ${value}` });',
      "    if (suffix === null) out.push({ key: `${T}${suffix}_DEF`, value });"]]);
    if (built.error) rec("the control patched cleanly", false, built.error);
    else {
      const capi = await serve(built.createApp());
      const cmod = mkMod("ctlmod");
      try {
        await create(capi, cmod);
        const cloc = locOf(cmod);
        rec("…and the country is created with no definite form at all",
          !cloc.NVX_DEF && !cloc.NVX_neutrality_DEF && !cloc.NVX_fascism_DEF, cloc);
        rec("…while its name and adjective still land, so the control is narrow",
          cloc.NVX === "Novaxia" && cloc.NVX_ADJ === "Novaxia", cloc);
      } finally { capi.stop(); }
    }

    console.log(`\n=== country definite-form localisation: ${checks} checks, ${fails.length} failed ===`);
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
