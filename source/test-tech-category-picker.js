// #tech-category-picker-scrapes-instead-of-reading — THE PICKER GUESSED, AND GUESSED WRONG THREE WAYS.
//
// The Focus editor's research-bonus picker asks /api/vanilla/tech-categories for the list of technology
// categories an `add_tech_bonus` may name. That endpoint did not READ the categories; it SCRAPED them, with
// a bare /\bcategory\s*=\s*(\w+)/g over vanilla's national_focus files. Three consequences, all measured:
//
//   1. IT OFFERS THREE VALUES THAT ARE NOT CATEGORIES. `add_faction_goal_slot = { category = short_term }`
//      matches the same regex, so `short_term`, `medium_term` and `long_term` are in the list — vanilla's own
//      china_nationalist_sea.txt even comments "# options: short_term, medium_term, long_term". Picking one
//      writes an add_tech_bonus HOI4 rejects. This is the half that corrupts a file rather than a label.
//   2. IT MISSES 32 REAL ONES. Vanilla DECLARES 133 technology_categories in common/technology_tags; the
//      scrape found 104, so 32 declared categories — cat_mobile_warfare and the doctrine trees among them —
//      could not be picked at all, because no vanilla focus happens to mention them.
//   3. IT IGNORES THE MOD. The endpoint reads the game root only. Rise of Nations declares 164 categories of
//      its own, Old World Blues 132, Novum Vexillum 128, The Road to 56 40 — none of them offered, ever.
//
// And the labels: 130 of the 133 have an English name, and the picker showed the raw token, so its search
// matched only tokens ("Battleship" found nothing though bb_tech is "Battleship models").
//
// The authoritative source is the declaration — `technology_categories = { … }` in common/technology_tags —
// read across the mod's own root chain, which is what every other catalogue endpoint in this file does.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techcat-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

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
const toPosix = (p) => p.split(path.sep).join("/");
const matchBrace = (s, o) => { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
const walk = (dir, out) => { let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; } for (const x of e) { const p = path.join(dir, x.name); if (x.isDirectory()) walk(p, out); else if (x.name.toLowerCase().endsWith(".txt")) out.push(p); } };
const declaredIn = (root) => {
  const out = new Set();
  const files = []; walk(path.join(root, "common", "technology_tags"), files);
  for (const f of files) {
    let t = ""; try { t = fs.readFileSync(f, "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    for (const m of t.matchAll(/(?:^|\n)\s*technology_categories\s*=\s*\{/g)) {
      const o = t.indexOf("{", m.index), c = matchBrace(t, o);
      if (o === -1 || c === -1) break;
      for (const tok of t.slice(o + 1, c).split(/\s+/)) if (tok && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) out.add(tok);
    }
  }
  return out;
};

// A mod declaring a category of its own, so "does it honour modPath" is answerable.
const MOD = path.join(ROOT, "catmod");
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CatMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "catmod.mod"), 'name="CatMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "technology_tags", "zz_cats.txt"),
  "technology_categories = {\n\tzeph_orbital_tech\n\tzeph_deep_sea_tech\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "zz_cats_l_english.yml"),
  "\uFEFFl_english:\n zeph_orbital_tech: \"Orbital Systems\"\n", "utf8");

let PORT = 52410;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    // `refresh` defaults ON so each section starts from a real read. The cache section below deliberately
    // turns it OFF — with refresh=1 the cache is bypassed entirely and a cache test measures nothing, which
    // is exactly how a back-out of the cache key first slipped through green.
    const cats = (mod, refresh = true) => {
      const qs = [];
      if (mod) qs.push(`modPath=${encodeURIComponent(mod)}`);
      if (refresh) qs.push("refresh=1");
      return fetch(`http://127.0.0.1:${PORT}/api/vanilla/tech-categories${qs.length ? "?" + qs.join("&") : ""}`)
        .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    };
    const idsOf = (d) => ((d && d.categories) || []).map((c) => (typeof c === "string" ? c : c.id));

    console.log("\n[ground truth] the declaration, not a scrape of who happens to mention one");
    const vanillaDeclared = declaredIn(GAME);
    {
      // What the old scrape found, reproduced here so the comparison is not taken on trust.
      const focusFiles = []; walk(path.join(GAME, "common", "national_focus"), focusFiles);
      const scraped = new Set();
      for (const f of focusFiles) {
        let t = ""; try { t = fs.readFileSync(f, "latin1"); } catch (_) { continue; }
        for (const m of t.matchAll(/\bcategory\s*=\s*([A-Za-z0-9_]+)/g)) scraped.add(m[1]);
      }
      const bogus = [...scraped].filter((c) => !vanillaDeclared.has(c));
      const missed = [...vanillaDeclared].filter((c) => !scraped.has(c));
      console.log(`     declared ${vanillaDeclared.size} · a focus-file scrape finds ${scraped.size}`);
      console.log(`     scraped but not a category: ${bogus.join(", ")}`);
      console.log(`     declared but never scraped: ${missed.length}`);
      if (!vanillaDeclared.size) console.log("     (no HOI4 install — skipped)");
      else {
        rec("vanilla declares its categories where they can be read", vanillaDeclared.size > 100, vanillaDeclared.size);
        rec("…and a focus-file scrape genuinely picks up non-categories", bogus.length >= 3, bogus);
        rec("…and genuinely misses declared ones", missed.length >= 20, missed.length);
      }
    }

    console.log("\n[the endpoint] returns the declared categories");
    if (vanillaDeclared.size) {
      const d = await cats("");
      const ids = idsOf(d);
      console.log(`     ${ids.length} returned`);
      rec("it answers", ids.length > 100, ids.length);
      // 1. THE FILE-CORRECTNESS HALF: these three are faction-goal slots, not technology categories.
      for (const bad of ["short_term", "medium_term", "long_term"]) {
        rec(`${bad} is no longer offered`, !ids.includes(bad), ids.filter((i) => /_term$/.test(i)));
      }
      // 2. the ones the scrape could never see
      rec("…and the declared-but-unmentioned ones now are", ids.includes("cat_mobile_warfare"), ids.filter((i) => /mobile_warfare/.test(i)));
      rec("…so the count matches the declaration", ids.length >= vanillaDeclared.size, { got: ids.length, declared: vanillaDeclared.size });
      rec("…and every returned id really is declared", ids.every((i) => vanillaDeclared.has(i)), ids.filter((i) => !vanillaDeclared.has(i)).slice(0, 5));
    }

    console.log("\n[the mod] its own categories are offered, and the game's still are");
    {
      const d = await cats(MOD);
      const ids = idsOf(d);
      console.log(`     ${ids.length} returned for the mod`);
      rec("the mod's own category is offered", ids.includes("zeph_orbital_tech"), ids.filter((i) => /zeph/.test(i)));
      rec("…and its second one too", ids.includes("zeph_deep_sea_tech"), ids.filter((i) => /zeph/.test(i)));
      // A mod ADDS to the game's categories; it does not replace them.
      if (vanillaDeclared.size) rec("…without losing the base game's", ids.includes("armor"), ids.length);
    }

    console.log("\n[labels] the picker can show a name");
    if (vanillaDeclared.size) {
      const d = await cats(MOD);
      const list = (d && d.categories) || [];
      const objs = list.filter((c) => c && typeof c === "object");
      rec("entries carry an id and a label", objs.length === list.length && objs.every((c) => typeof c.id === "string"), list.slice(0, 2));
      const named = objs.filter((c) => c.label && c.label !== c.id);
      console.log(`     ${named.length} of ${objs.length} carry a resolved name · e.g. ${named.slice(0, 3).map((c) => `${c.id} => ${JSON.stringify(c.label)}`).join(" | ")}`);
      rec("…and most resolve", named.length > 100, named.length);
      const mine = objs.find((c) => c.id === "zeph_orbital_tech");
      rec("…including the mod's own", mine && mine.label === "Orbital Systems", mine);
      // CONTROL: a category with no localisation must still be offered, with a usable fallback.
      const unl = objs.find((c) => c.id === "zeph_deep_sea_tech");
      rec("CONTROL: an unlocalised category is still offered", !!unl, "dropped");
      rec("CONTROL: …and its label is not blank", unl && String(unl.label || "").trim().length > 0, unl);
    }

    console.log("\n[the cache] one mod's categories are not served to another");
    {
      // The old cache was a single global with no notion of which root it came from. ⚠️ These calls must NOT
      // pass refresh=1, or the cache is bypassed and the check proves nothing.
      const a = idsOf(await cats(MOD, false));        // warms the cache for the mod
      const b = idsOf(await cats("", false));         // …and now asks for the game alone
      console.log(`     mod: ${a.length} · game-only: ${b.length}  (both served through the cache)`);
      rec("the mod's answer is right", a.includes("zeph_orbital_tech"), a.filter((i) => /zeph/.test(i)));
      rec("…and its extra categories do not leak into the game-only answer", !b.includes("zeph_orbital_tech"), b.filter((i) => /zeph/.test(i)));
      rec("…and asking for the mod again still includes them", idsOf(await cats(MOD, false)).includes("zeph_orbital_tech"), "lost on the second call");
    }

    console.log("\n[the pages] both pickers show the label and search it");
    {
      const app = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
      rec("the wizard list renders a label, not the bare token", !/btn\.textContent = cat;/.test(app), "still `btn.textContent = cat`");
      rec("…and its filter matches the label too", /techBonusWizard[\s\S]{0,600}?label/.test(app), "search still token-only");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== tech category picker: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
