// #name-pool-header-claims-a-culture-it-did-not-match — DON'T WRITE A FALSE STATEMENT INTO THE USER'S MOD.
//
// Creating a country writes it a common/names pool, seeded from a country of the same graphical_culture —
// and when no such country has a pool, from the richest pool of ANY culture instead. The generated file said,
// on both paths:
//     # Seeded from GER, a base-game country of the same graphical culture (northamerican_gfx).
// On the fallback that is simply untrue: GER is western_european_gfx. Nova wrote a comment into the author's
// own mod asserting something false, and nothing distinguished the two cases.
//
// It is reachable today. Millennium Dawn introduces exactly one culture vanilla does not have,
// `northamerican_gfx`, used by 16 of its 470 country files — and the source search only ever looked in the
// BASE GAME, so every country of a dependency-introduced culture took the fallback.
//
// Two things are asserted here: that a dependency's country is now found (so the fallback is not taken when a
// real match exists), and that when the fallback IS taken the file says so.
//
// ⚠️ The active mod is deliberately NOT searched: its pools are the ones Nova has been writing, so seeding
// from them would copy a copy and the provenance line would name a country the author invented moments ago.
// The last block measures that, because "search all the roots" is the obvious wrong version of this fix.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-namepool-"));
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
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);

// ── a base mod that introduces its own graphical culture, complete with a country of it ─────────────────
const NEWCULT = "nova_test_gfx";
const BASE = path.join(ROOT, "cultbase");
mk(path.join(BASE, "common", "country_tags"));
mk(path.join(BASE, "common", "countries"));
mk(path.join(BASE, "common", "names"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="CultBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "cultbase.mod"),
  'name="CultBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "common", "country_tags", "zz_cult.txt"), 'ZKA = "countries/Zka.txt"\n');
fs.writeFileSync(path.join(BASE, "common", "countries", "Zka.txt"),
  `graphical_culture = ${NEWCULT}\ngraphical_culture_2d = ${NEWCULT}_2d\ncolor = { 10 10 10 }\n`);
fs.writeFileSync(path.join(BASE, "common", "names", "zka_names.txt"), [
  "ZKA = {",
  "\tmale = {",
  '\t\tnames = { "Zkaan" "Zkabor" "Zkacel" "Zkadum" }',
  "\t}",
  '\tsurnames = { "Zkaastra" "Zkabeling" "Zkacourt" }',
  "\tcallsigns = { \"Zed\" }",
  "}",
  "",
].join("\n"));

// ── the add-on that depends on it ───────────────────────────────────────────────────────────────────────
function mkAddon(n) {
  const dir = path.join(ROOT, "addon" + n);
  mk(path.join(dir, "history", "states"));
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="A' + n + '"\ndependencies={\n\t"CultBase"\n}\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "addon" + n + ".mod"),
    'name="A' + n + '"\npath="' + toPosix(dir) + '"\ndependencies={\n\t"CultBase"\n}\nsupported_version="1.19.*"\n');
  return dir;
}
function mkPlain(n) {
  const dir = path.join(ROOT, "plain" + n);
  mk(path.join(dir, "history", "states"));
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="P' + n + '"\nsupported_version="1.19.*"\n');
  return dir;
}

let PORT = 50498;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      create: (mod, tag, culture) => fetch(`http://127.0.0.1:${PORT}/api/countries/create`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: mod, tag, name: "Nova " + tag, capitalStateId: 1, graphicalCulture: culture, color: "10 20 30" }),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const poolText = (mod, tag) => {
  try { return fs.readFileSync(path.join(mod, "common", "names", `nova_${tag}_names.txt`), "utf8"); }
  catch (_) { return ""; }
};

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] a real base mod does introduce a culture of its own");
    if (fs.existsSync(path.join(MD, "common", "countries"))) {
      const cults = (dir) => {
        const s = new Set();
        for (const n of fs.readdirSync(dir)) {
          if (!n.endsWith(".txt")) continue;
          const t = fs.readFileSync(path.join(dir, n), "latin1").replace(/#.*$/gm, "");
          for (const m of t.matchAll(/graphical_culture\s*=\s*([A-Za-z0-9_]+)/g)) s.add(m[1]);
        }
        return s;
      };
      const v = cults(path.join(VANILLA, "common", "countries"));
      const m = cults(path.join(MD, "common", "countries"));
      const only = [...m].filter((x) => !v.has(x));
      console.log(`     vanilla ${v.size} cultures, Millennium Dawn ${m.size}; MD-only: ${only.join(", ") || "none"}`);
      rec("Millennium Dawn introduces a culture vanilla has no country for",
        only.length === 1 && only[0] === "northamerican_gfx", only);
    } else console.log("     (Millennium Dawn not installed — skipped)");

    api = await serve(createApp());

    console.log("\n[a dependency's culture] seeds from the dependency, not from vanilla's fallback");
    {
      const mod = mkAddon(1);
      const r = await api.create(mod, "NXA", NEWCULT);
      rec("the country is created", r.s === 200 && r.b.ok === true, r.b.error || r.b);
      rec("…seeded from the BASE MOD's country of that culture",
        r.b.nameList && r.b.nameList.sourceTag === "ZKA", r.b.nameList);
      const txt = poolText(mod, "NXA");
      rec("…and the names really are the base mod's", /Zkaan|Zkabor/.test(txt), txt.slice(0, 300));
      rec("…with a header that claims a culture match", /same graphical culture/.test(txt), txt.slice(0, 400));
      rec("…and does not claim it came from the base game", !/base-game country of the same/.test(txt), txt.slice(0, 400));
    }

    console.log("\n[a culture NOBODY has] still gets a pool — and the file says where it really came from");
    {
      const mod = mkAddon(2);
      const r = await api.create(mod, "NXB", "no_such_culture_gfx");
      rec("the country is created", r.s === 200 && r.b.ok === true, r.b.error || r.b);
      rec("…and still gets a pool (a country with no names is worse than a mismatched one)",
        r.b.nameList && r.b.nameList.sourceTag, r.b.nameList);
      const txt = poolText(mod, "NXB");
      rec("…the header does NOT claim a culture match", !/same graphical culture/.test(txt), txt.slice(0, 500));
      rec("…it says the source is a different culture", /DIFFERENT culture/.test(txt), txt.slice(0, 500));
      rec("…and it names the culture that found nothing", txt.includes("no_such_culture_gfx"), txt.slice(0, 500));
    }

    console.log("\n[CONTROL — a plain mod, a vanilla culture] must behave exactly as before");
    {
      const mod = mkPlain(1);
      const r = await api.create(mod, "NXC", "asian_gfx");
      rec("the country is created", r.s === 200 && r.b.ok === true, r.b.error || r.b);
      rec("…seeded from a base-game tag", r.b.nameList && /^[A-Z0-9]{3}$/.test(r.b.nameList.sourceTag || ""), r.b.nameList);
      const txt = poolText(mod, "NXC");
      rec("…with the culture-match header", /same graphical culture \(asian_gfx\)/.test(txt), txt.slice(0, 400));
      rec("…and it is NOT the fallback wording", !/DIFFERENT culture/.test(txt), txt.slice(0, 400));
    }

    console.log("\n[⚠️ CONTROL — no self-harvest] a second country must not be seeded from the first");
    {
      const mod = mkPlain(2);
      const r1 = await api.create(mod, "NXD", "asian_gfx");
      const r2 = await api.create(mod, "NXE", "asian_gfx");
      rec("both are created", r1.b.ok === true && r2.b.ok === true, { a: r1.b.error, b: r2.b.error });
      rec("…and both name the SAME source, not each other",
        r1.b.nameList && r2.b.nameList && r1.b.nameList.sourceTag === r2.b.nameList.sourceTag,
        { first: r1.b.nameList && r1.b.nameList.sourceTag, second: r2.b.nameList && r2.b.nameList.sourceTag });
      rec("…and neither was seeded from the other's tag",
        r2.b.nameList && r2.b.nameList.sourceTag !== "NXD", r2.b.nameList);
    }

    console.log("\n[CONTROL — the add-on's own culture wins nothing it should not] the base mod alone is unaffected");
    {
      const r = await api.create(BASE, "NXF", NEWCULT);
      rec("the base mod can still create a country of its own culture",
        r.s === 200 && r.b.ok === true, r.b.error || r.b);
      // Its own ZKA pool is in the ACTIVE mod here, which is excluded — so this correctly takes the fallback
      // rather than seeding a country from a file the same mod already owns.
      const txt = poolText(BASE, "NXF");
      rec("…and does not harvest its own pool", r.b.nameList && r.b.nameList.sourceTag !== "ZKA", r.b.nameList);
      rec("…saying honestly that the source is a different culture", /DIFFERENT culture/.test(txt), txt.slice(0, 400));
    }

    api.stop(); api = null;
    console.log(`\n=== name pool culture source: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
