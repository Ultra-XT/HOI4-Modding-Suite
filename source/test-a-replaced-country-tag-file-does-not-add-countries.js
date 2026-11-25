// ⛔ #country-list-ignores-file-replacement — HOI4 REPLACES A common/ FILE WHOLESALE AT THE SAME PATH.
//
// Vanilla lists its country tags in common/country_tags/00_countries.txt. A mod shipping its own file of that
// name replaces it outright, so the tags vanilla declared there DO NOT EXIST in that mod. The country
// catalogue read every file from every root and merged. Measured against the install:
//
//     Old World Blues   745 offered, 424 the game loads   -> 321 countries that do not exist
//     Millennium Dawn   640 offered, 461 loaded           -> 179
//     Novum Vexillum    561 offered, 418 loaded           -> 143
//
// A country tag is the spine of the editor — Country Setup, focus-tree ownership, event and decision scoping,
// state ownership. Offering AFG and ARG inside a Fallout total conversion means anything written against them
// is script the game will not load.
//
// ⭐⭐⭐ TWO LOCATORS FOR ONE THING, and the first fix moved no number at all. collectCountryCatalogByRoots
// walks common/country_tags TWICE: once to build `tagFiles` for the cache fingerprint, and again — a separate
// loop, further down — to actually parse the tags. Pruning only the first reported success and changed
// nothing measurable. Both walks must apply the same ownership rule.
//
// ⚠️ Ownership is FIRST-wins here because `roots` is MOD-FIRST, the reverse of the load-order lists elsewhere
// in server.js.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53539;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ctags-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

const tagFilesOf = (root) => {
  try { return fs.readdirSync(path.join(root, "common", "country_tags")).filter((f) => f.toLowerCase().endsWith(".txt")); }
  catch (_) { return []; }
};
function tagsIn(file) {
  const out = new Set();
  let t;
  try { t = fs.readFileSync(file, "utf8"); } catch (_) { return out; }
  t = t.replace(/#[^\n]*/g, "");
  // ⚠️ A tag is a letter followed by two ALPHANUMERICS, not three letters: vanilla's dynamic tags are D01…D75,
  // and a [A-Z]{3} model reported 75 phantoms against vanilla itself — my probe, not Nova.
  for (const m of t.matchAll(/(^|\n)\s*([A-Z][A-Z0-9]{2})\s*=/g)) out.add(m[2]);
  return out;
}
// ⚠️ MOVED WITH THE FIX (#a-world-owner-is-a-country, review cr1 WC-2) — the descriptor's replace_path="common/country_tags" is the
// other half of the rule: the base game's tag files do not load AT ALL under it, whatever their names. This expectation merged
// vanilla's in, as the catalogue did, and so expected 669 tags of Hearts of Minecraft, which declares the replace_path and loads 316.
// Read off the descriptor, never typed in.
const replacesCountryTags = (modRoot) => {
  let d = "";
  try { d = fs.readFileSync(path.join(modRoot, "descriptor.mod"), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { return false; }
  return [...d.matchAll(/(?:^|\n)\s*replace_path\s*=\s*"([^"]*)"/g)].some((m) => m[1].replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() === "common/country_tags");
};
// What the game loads, plus the one extra source the catalogue deliberately surfaces.
function expectedTags(modRoot) {
  const roots = [modRoot && modRoot !== GAME && replacesCountryTags(modRoot) ? null : GAME, modRoot].filter(Boolean);
  const owner = new Map();
  // Load order vanilla → mod, so the LAST root to ship a basename owns it.
  for (const r of roots) for (const f of tagFilesOf(r)) owner.set(f.toLowerCase(), r);
  const out = new Set();
  for (const r of roots) {
    for (const f of tagFilesOf(r)) {
      if (owner.get(f.toLowerCase()) !== r) continue;
      for (const tag of tagsIn(path.join(r, "common", "country_tags", f))) out.add(tag);
    }
  }
  // A mod's OWN history/countries file marks a country as part of the mod — a deliberate path in
  // collectCountryCatalogByRoots ("a vanilla add-on that customizes LUX without re-declaring the tag").
  // Rise of Nations ships ten such files for tags it never declares; omitting this reported Nova wrong for
  // its own content.
  if (modRoot && modRoot !== GAME) {
    let hf = [];
    try { hf = fs.readdirSync(path.join(modRoot, "history", "countries")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    for (const f of hf) { const m = f.match(/^([A-Za-z0-9]{2,3})(?=[ _.\-]|$)/); if (m) out.add(m[1].toUpperCase()); }
  }
  return out;
}

(async () => {
  let server;
  try {
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. BOTH walks apply the ownership rule");
    rec("ownership is recorded once", /const tagFileOwner = new Map\(\)/.test(SERVER));
    const filters = (SERVER.match(/tagFileOwner\.get\(f\.toLowerCase\(\)\) === rt/g) || []).length;
    rec("…and BOTH country_tags walks filter on it", filters === 2,
      filters + " filters — the fingerprint walk and the parse walk");
    rec("…with FIRST-wins, because roots is mod-first",
      /for \(const f of files\) \{ const b = f\.toLowerCase\(\); if \(!tagFileOwner\.has\(b\)\) tagFileOwner\.set\(b, rt\); \}/.test(SERVER),
      "last-wins here would keep vanilla's copy");

    console.log("\n2. Measured against every installed root");
    if (!fs.existsSync(path.join(GAME, "common", "country_tags"))) {
      rec("a vanilla install to measure against", false, "cannot verify");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const served = async (root) => {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/countries/catalog?modPath=${encodeURIComponent(root)}`);
        const b = await r.json();
        const arr = Array.isArray(b) ? b : (b.items || b.countries || []);
        return new Set(arr.map((x) => (typeof x === "string" ? x : (x.tag || ""))).filter(Boolean));
      };

      const roots = [["vanilla", GAME]];
      try {
        for (const d of fs.readdirSync(WS)) {
          const p = path.join(WS, d);
          if (tagFilesOf(p).length) roots.push([d, p]);
        }
      } catch (_) {}
      rec("there are installed mods with country tags", roots.length > 2, roots.length + " roots");

      // ⚠️ The fixture must contain BOTH kinds or this measures half the rule.
      const shadowing = roots.filter(([, p]) => p !== GAME &&
        tagFilesOf(p).some((f) => tagFilesOf(GAME).some((v) => v.toLowerCase() === f.toLowerCase())));
      const notShadowing = roots.filter(([, p]) => p !== GAME && !shadowing.some(([, q]) => q === p));
      rec("…some SHADOW vanilla's country_tags", shadowing.length > 0, shadowing.map(([n]) => n));
      rec("…and some do not", notShadowing.length > 0, notShadowing.map(([n]) => n));

      for (const [name, root] of roots) {
        const got = await served(root);
        const want = expectedTags(root);
        const extra = [...got].filter((t) => !want.has(t));
        const missing = [...want].filter((t) => !got.has(t));
        rec(`${name}: offers exactly the countries the game loads`, extra.length === 0 && missing.length === 0,
          `${got.size} offered, ${want.size} expected` + (extra.length ? ` | extra: ${extra.slice(0, 8)}` : "")
          + (missing.length ? ` | missing: ${missing.slice(0, 8)}` : ""));
      }

      console.log("\n3. ⭐ Controls and the old behaviour");
      for (const [name, root] of notShadowing) {
        const got = await served(root);
        const vanillaTags = expectedTags(GAME);
        const kept = [...vanillaTags].filter((t) => got.has(t)).length;
        rec(`${name} shadows nothing, so it keeps ALL of vanilla's tags`, kept === vanillaTags.size,
          `${kept} of ${vanillaTags.size}`);
      }
      // The union with no prune — what the catalogue used to answer.
      const OLD = (root) => {
        const out = new Set();
        for (const r of [root, GAME]) for (const f of tagFilesOf(r)) for (const t of tagsIn(path.join(r, "common", "country_tags", f))) out.add(t);
        return out;
      };
      let proved = 0;
      for (const [name, root] of shadowing) {
        const oldSet = OLD(root), want = expectedTags(root);
        const phantom = [...oldSet].filter((t) => !want.has(t));
        if (!phantom.length) continue;
        proved++;
        rec(`${name}: the old union invented ${phantom.length} countries`, phantom.length > 0, phantom.slice(0, 6));
        const got = await served(root);
        rec(`…and none of them is offered now`, phantom.every((t) => !got.has(t)));
      }
      rec("at least one installed mod exhibited the bug", proved > 0, proved + " mods");
      // ⭐ #a-world-owner-is-a-country — …and the replace_path half, on a mod that declares it (Hearts of Minecraft, Old World Blues):
      // the base game's tags it does not declare itself are not offered, whatever its tag files are called
      const replacing = roots.filter(([, p]) => p !== GAME && replacesCountryTags(p));
      rec("some installed mods replace common/country_tags outright (replace_path in the descriptor)", replacing.length > 0, replacing.map(([n]) => n));
      for (const [name, root] of replacing) {
        const got = await served(root), want = expectedTags(root);
        const leaked = [...expectedTags(GAME)].filter((t) => got.has(t) && !want.has(t));
        rec(`${name}: none of the base game's tags it does not declare is offered`, leaked.length === 0, leaked.slice(0, 8));
      }
    }

    console.log(`\n=== a replaced country-tag file does not add countries: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
