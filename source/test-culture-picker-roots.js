// #culture-picker-offers-six-of-nine — OFFER WHAT THE GAME HAS, NOT A LIST TYPED INTO THE HTML.
//
// Country Setup's graphical-culture dropdown was six hardcoded <option> tags. The base game ships NINE.
//
// 🈯 Measured on vanilla's common/countries: asian 89, african 64, western_european 62, eastern_european 56,
// southamerican 38, middle_eastern 32 — all offered — and then commonwealth_gfx 22 (Canada, Australia, New
// Zealand, South Africa, the Raj…), asian_european_gfx 1 and sami_gfx 1, which could not be chosen at all.
// 24 of vanilla's 365 countries used a culture Nova had no way to select.
//
// Being a fixed list it was also blind to base mods, in the same way as every other reader in this pass:
// Millennium Dawn introduces northamerican_gfx, used by 16 of its 470 country files, and an add-on author
// could not pick it. That is the culture the name-pool seeder now knows how to seed from — a culture you
// cannot choose is one the seeder never sees, so the two halves belong together.
//
// ⚠️ The six hardcoded values remain as a FLOOR. A scan finding nothing must leave a usable dropdown, not an
// empty one — and the control for that is a mod which replaces common/countries and ships none of its own.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cults-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);
const SHIPPED_SIX = ["western_european_gfx", "eastern_european_gfx", "asian_gfx",
  "southamerican_gfx", "middle_eastern_gfx", "african_gfx"];

// ── a base mod introducing a culture of its own ─────────────────────────────────────────────────────────
const BASE = path.join(ROOT, "cultbase");
mk(path.join(BASE, "common", "countries"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="CultBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "cultbase.mod"),
  'name="CultBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "common", "countries", "Zka.txt"), "graphical_culture = nova_arctic_gfx\n");
fs.writeFileSync(path.join(BASE, "common", "countries", "Zkb.txt"), "graphical_culture = nova_arctic_gfx\n");

const ADDON = path.join(ROOT, "cultaddon");
mk(ADDON);
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="CultAddon"\ndependencies={\n\t"CultBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "cultaddon.mod"),
  'name="CultAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"CultBase"\n}\nsupported_version="1.19.*"\n');

// ── a mod that REPLACES common/countries and ships none — the floor's reason to exist ───────────────────
const BARE = path.join(ROOT, "barecult");
mk(path.join(BARE, "common", "countries"));
fs.writeFileSync(path.join(BARE, "descriptor.mod"),
  'name="BareCult"\nsupported_version="1.19.*"\nreplace_path="common/countries"\n');
fs.writeFileSync(path.join(ROOT, "barecult.mod"),
  'name="BareCult"\npath="' + toPosix(BARE) + '"\nsupported_version="1.19.*"\nreplace_path="common/countries"\n');

let PORT = 50506;
(async () => {
  let srv = null;
  try {
    console.log("\n[ground truth] what the base game actually ships");
    let vanillaCultures = new Map();
    if (fs.existsSync(path.join(VANILLA, "common", "countries"))) {
      for (const f of fs.readdirSync(path.join(VANILLA, "common", "countries"))) {
        if (!f.endsWith(".txt")) continue;
        const m = /graphical_culture\s*=\s*([A-Za-z0-9_]+)/.exec(
          fs.readFileSync(path.join(VANILLA, "common", "countries", f), "latin1").replace(/#.*$/gm, ""));
        if (m) vanillaCultures.set(m[1], (vanillaCultures.get(m[1]) || 0) + 1);
      }
      const missing = [...vanillaCultures.keys()].filter((c) => !SHIPPED_SIX.includes(c)).sort();
      const lost = missing.reduce((s, c) => s + vanillaCultures.get(c), 0);
      console.log(`     vanilla cultures: ${vanillaCultures.size}; unofferable before: ${missing.join(", ")} (${lost} countries)`);
      rec("the base game really does ship more than the six that were hardcoded",
        vanillaCultures.size === 9 && missing.length === 3, [...vanillaCultures.keys()].sort());
      rec("…and the missing ones are not obscure — Commonwealth alone covers 22 countries",
        (vanillaCultures.get("commonwealth_gfx") || 0) >= 20, vanillaCultures.get("commonwealth_gfx"));
    } else console.log("     (no HOI4 install — ground truth skipped)");

    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const cultures = async (mod) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/countries/graphical-cultures?modPath=${encodeURIComponent(mod)}`)
        .then((x) => x.json()).catch((e) => ({ error: String(e) }));
      return r;
    };

    console.log("\n[a plain mod] gets every culture the base game defines");
    {
      const PLAIN = path.join(ROOT, "plaincult");
      mk(PLAIN);
      fs.writeFileSync(path.join(PLAIN, "descriptor.mod"), 'name="Plain"\nsupported_version="1.19.*"\n');
      const r = await cultures(PLAIN);
      rec("the endpoint answers", r && r.ok === true, r);
      const ids = (r.cultures || []).map((c) => c.id);
      if (vanillaCultures.size) {
        rec("…all nine, not six", ids.length === 9, ids);
        rec("…including the three that could not be picked before",
          ["commonwealth_gfx", "asian_european_gfx", "sami_gfx"].every((c) => ids.includes(c)), ids);
      }
      rec("…the six the page shipped with are all still there", SHIPPED_SIX.every((c) => ids.includes(c)), ids);
      const cw = (r.cultures || []).find((c) => c.id === "commonwealth_gfx");
      if (cw) {
        rec("…each carries how many countries use it, so an unfamiliar token is a real choice", cw.count >= 20, cw);
        rec("…and a readable label rather than the raw token", cw.label === "Commonwealth", cw);
      }
      rec("…ordered by how common they are", (r.cultures || []).every((c, i, a) => i === 0 || a[i - 1].count >= c.count),
        (r.cultures || []).map((c) => c.id + ":" + c.count));
    }

    console.log("\n[an add-on] can pick a culture its BASE MOD introduced");
    {
      const r = await cultures(ADDON);
      const hit = (r.cultures || []).find((c) => c.id === "nova_arctic_gfx");
      rec("the base mod's own culture is offered", !!hit, (r.cultures || []).map((c) => c.id));
      rec("…counted from the base mod's countries", hit && hit.count === 2, hit);
      rec("…and labelled from its token rather than shown raw", hit && hit.label === "Nova Arctic", hit);
      rec("…without losing the base game's", (r.cultures || []).some((c) => c.id === "asian_gfx"),
        (r.cultures || []).map((c) => c.id));
    }

    console.log("\n[⚠️ CONTROL — replace_path=\"common/countries\"] the two sources obey DIFFERENT rules");
    {
      // This is the case that separates the two halves. replace_path="common/countries" stops vanilla's
      // COUNTRIES loading — but common/graphicalculturetype.txt sits one level up and still loads, so the
      // game still knows every base-game culture. The declaration must survive; the counts must not.
      const r = await cultures(BARE);
      const ids = (r.cultures || []).map((c) => c.id);
      rec("the endpoint still answers", r && r.ok === true, r);
      rec("…the base game's DECLARED cultures are still offered, because that file still loads",
        ["commonwealth_gfx", "sami_gfx", ...SHIPPED_SIX].every((c) => ids.includes(c)), ids);
      rec("…and every one is marked declared", (r.cultures || []).filter((c) => c.declared).length >= 8,
        (r.cultures || []).map((c) => c.id + ":" + c.declared));
      rec("…but NO country is counted, because vanilla's countries do not load",
        (r.cultures || []).every((c) => c.count === 0), (r.cultures || []).map((c) => c.id + ":" + c.count));
      // asian_european_gfx is used by a vanilla country but never declared, so with those countries gone
      // there is nothing left to have found it — which is the proof the counts really came from the files.
      rec("…and a used-but-undeclared culture disappears with the countries that used it",
        !ids.includes("asian_european_gfx"), ids);
    }

    console.log("\n[⚠️ THE DECLARATION IS ONE FILE] a mod's own copy REPLACES the base game's wholesale");
    {
      // Millennium Dawn does exactly this: its graphicalculturetype.txt declares northamerican_gfx and
      // drops sami_gfx. Old World Blues declares 26 cultures of its own. Treating the declaration as a
      // union across roots would offer cultures the game has stopped knowing about.
      const DECL = path.join(ROOT, "declmod");
      mk(path.join(DECL, "common"));
      fs.writeFileSync(path.join(DECL, "descriptor.mod"), 'name="Decl"\nsupported_version="1.19.*"\n');
      fs.writeFileSync(path.join(ROOT, "declmod.mod"),
        'name="Decl"\npath="' + toPosix(DECL) + '"\nsupported_version="1.19.*"\n');
      fs.writeFileSync(path.join(DECL, "common", "graphicalculturetype.txt"),
        "western_european_gfx\nwestern_european_2d\nnova_wasteland_gfx\nnova_wasteland_2d\n");
      const r = await cultures(DECL);
      const ids = (r.cultures || []).map((c) => c.id);
      rec("the mod's own declared culture is offered", ids.includes("nova_wasteland_gfx"), ids);
      rec("…labelled from its token", (r.cultures || []).find((c) => c.id === "nova_wasteland_gfx").label === "Nova Wasteland",
        (r.cultures || []).find((c) => c.id === "nova_wasteland_gfx"));
      // The declaration is REPLACED, not merged — and the `declared` flag is where that is observable.
      // sami_gfx is still OFFERED here, because vanilla's Sami country uses it and a used culture is a
      // usable one (vanilla's own asian_european_gfx is used and declared nowhere). What must not happen is
      // it being presented as declared: this mod's declaration is the only one the game reads, and it does
      // not list sami_gfx.
      const decl = new Map((r.cultures || []).map((c) => [c.id, c.declared]));
      rec("…the mod's own declaration is what marks a culture declared",
        decl.get("nova_wasteland_gfx") === true && decl.get("western_european_gfx") === true,
        [...decl]);
      rec("…and a base-game culture it omits is NOT presented as declared",
        decl.get("sami_gfx") === false && decl.get("commonwealth_gfx") === false, [...decl]);
      rec("…so the declaration was replaced wholesale rather than merged with the base game's",
        (r.cultures || []).filter((c) => c.declared).length === 2,
        (r.cultures || []).filter((c) => c.declared).map((c) => c.id));
      rec("…the `_2d` entries are not offered as cultures", !ids.some((c) => /_2d$/.test(c)), ids);
      // The six-value floor still applies, so the dropdown can never be unusable.
      rec("…while the shipped six remain available", SHIPPED_SIX.every((c) => ids.includes(c)), ids);
    }

    console.log("\n[the page uses it] a picker nothing fills is the bug, moved");
    {
      const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
      const HTML = fs.readFileSync(path.join(__dirname, "public", "country-setup.html"), "utf8");
      rec("Country Setup fetches the list", /api\/countries\/graphical-cultures/.test(CS), "never fetched");
      rec("…and fills the select from it", /fillGraphicalCultures/.test(CS), "never filled");
      rec("…when the create dialog opens, AFTER the form reset that would undo it",
        /createCountryForm\.reset\(\);[\s\S]{0,400}?fillGraphicalCultures\(\)/.test(CS.replace(/\r\n/g, "\n")),
        "not called after reset");
      rec("…and the markup keeps its own options as the fallback",
        SHIPPED_SIX.every((c) => HTML.includes('value="' + c + '"')), "static options removed");
    }

    console.log(`\n=== culture picker roots: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
