// #new-country-has-no-names — A COUNTRY WITH NO NAME POOL CANNOT NAME ITS PEOPLE.
//
// From HOI4's error.log during the play-test, once per generated character:
//   character_manager.cpp:261: Failed to generate a name for a character of origins Nova Union and for
//   country Nova Union
//
// Nova's country creators wrote the tag, the common/countries file (with a graphical_culture), the history
// file, the capital and the localisation — but never a common/names entry. Every ace, operative and randomly
// generated officer that country produced came out unnamed.
//
// Measured, not assumed: of vanilla's 439 tags, 364 declare a graphical_culture and 361 of those 364 declare
// a name list (1.19.4.1; the pins below). The two go together and Nova was writing only the first half. There are 9 graphical_cultures
// and every one has vanilla countries with a pool, so the new country's pool is SOURCED from the richest
// vanilla pool of its own culture rather than invented — a big pool means fewer repeated officers, and it
// lands on a country the author will recognise. Ties break alphabetically, so the choice is deterministic.
//
// The file is never named 00_names.txt: HOI4 replaces a vanilla file with a mod file of the same basename, so
// that name would take every other country's names down with it. Shipping mods do exactly what Nova now does
// — BP_names.txt, RON_names.txt and r56_names.txt all sit alongside vanilla's 00_names.txt.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cnames-"));
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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-cnames-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
function braceBalance(text) {
  let d = 0, q = false;
  const t = text.replace(/#.*$/gm, "");
  for (const c of t) { if (c === '"') q = !q; else if (!q && c === "{") d++; else if (!q && c === "}") d--; }
  return d;
}

let modSeq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++modSeq));
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  return dir;
}

let PORT = 46300;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      create: (mod, tag, culture, name) => fetch(`http://127.0.0.1:${PORT}/api/countries/create`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: mod, tag, name: name || ("Nova " + tag), capitalStateId: 1, graphicalCulture: culture, color: "10 20 30" }),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const namesDir = (mod) => path.join(mod, "common", "names");
const namesFiles = (mod) => { try { return fs.readdirSync(namesDir(mod)); } catch (_) { return []; } };

(async () => {
  let api = null;
  const haveVanilla = fs.existsSync(path.join(VANILLA, "common", "names"));
  try {
    console.log("\n[ground truth] the two halves vanilla always ships together");
    if (haveVanilla) {
      const tagToFile = new Map();
      for (const f of fs.readdirSync(path.join(VANILLA, "common", "country_tags"))) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        const t = fs.readFileSync(path.join(VANILLA, "common", "country_tags", f), "utf8").replace(/#.*$/gm, "");
        for (const m of t.matchAll(/^\s*([A-Za-z][A-Za-z0-9]{2})\s*=\s*"([^"]+)"/gm)) tagToFile.set(m[1].toUpperCase(), m[2]);
      }
      const cultured = new Map();
      for (const [tag, rel] of tagToFile) {
        try {
          const m = /graphical_culture\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(VANILLA, "common", rel), "utf8").replace(/#.*$/gm, ""));
          if (m) cultured.set(tag, m[1]);
        } catch (_) {}
      }
      const named = new Set();
      for (const f of fs.readdirSync(path.join(VANILLA, "common", "names"))) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        const t = fs.readFileSync(path.join(VANILLA, "common", "names", f), "utf8").replace(/#.*$/gm, "");
        for (const m of t.matchAll(/^[ \t]*([A-Za-z][A-Za-z0-9]{2})[ \t]*=[ \t]*\{/gm)) named.add(m[1].toUpperCase());
      }
      const withCultureNoNames = [...cultured.keys()].filter((t) => !named.has(t)).sort();
      // Pinned exactly rather than as a percentage: if a game patch changes which countries ship a pool, that
      // is worth being told about, because it is the evidence the whole fix rests on.
      // Measured on hoi4.exe 1.19.4.1 (Operation Postern v1.19.4.1.99a5, installed 2026-10-30), 2026-11-03:
      // DDR JAN WGR, 361 of 364. First pinned 2026-08-16 as DDR GHA JAN WGR, 360 of 364, which 1.19.3 still gave
      // (the suite of 2026-10-22 passed it); 1.19.4.0 (2026-10-27) gave Ghana a pool in common/names/00_names.txt
      // ("#Ghana", GHA = { … }), and 1.19.4.1 keeps it — the pattern growing stronger, which is this pin doing its job.
      rec("a vanilla country with a graphical_culture has a name pool — all but three of them",
        withCultureNoNames.join(" ") === "DDR JAN WGR", withCultureNoNames);
      rec("…which is 361 of 364, so the pattern is the rule and not a coincidence",
        [...cultured.keys()].filter((t) => named.has(t)).length === 361 && cultured.size === 364,
        { both: [...cultured.keys()].filter((t) => named.has(t)).length, cultured: cultured.size });
      rec("…and there are enough of them for that to mean something", cultured.size >= 300, cultured.size);
      const cultures = new Set(cultured.values());
      const uncovered = [...cultures].filter((c) => ![...cultured.entries()].some(([t, cc]) => cc === c && named.has(t)));
      rec("…so every graphical_culture has somewhere to seed from", uncovered.length === 0, uncovered);
      rec("…across a small, closed set of cultures", cultures.size > 0 && cultures.size <= 20, cultures.size);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[creating a country] now writes it a pool");
    const mod = mkMod();
    const r = await api.create(mod, "NUX", "asian_gfx");
    rec("the country is created", r.s === 200 && r.b.ok === true, r.b.error || r.b);
    rec("…and reports the pool it wrote", r.b.nameList && r.b.nameList.file, r.b.nameList);
    rec("…naming the base-game country it was seeded from",
      r.b.nameList && /^[A-Z0-9]{3}$/.test(r.b.nameList.sourceTag || ""), r.b.nameList);
    const files = namesFiles(mod);
    rec("…on disk under common/names", files.length === 1, files);
    rec("…under its own filename, NOT 00_names.txt (which would replace vanilla's)",
      files[0] === "nova_NUX_names.txt", files);
    const txt = files.length ? fs.readFileSync(path.join(namesDir(mod), files[0]), "utf8") : "";
    rec("…declaring the new tag", /^NUX\s*=\s*\{/m.test(txt), txt.slice(0, 200));
    rec("…with names in it", /names\s*=\s*\{[^}]*[A-Za-z]/.test(txt), txt.slice(0, 400));
    rec("…and surnames", /surnames\s*=\s*\{[^}]*[A-Za-z]/.test(txt), "no surnames");
    rec("…brace-balanced", braceBalance(txt) === 0, braceBalance(txt));
    rec("…and a header that says where the names came from and to replace them",
      /Seeded from [A-Z0-9]{3}/.test(txt) && /Replace these with names of your own/.test(txt), txt.slice(0, 300));
    rec("…explaining the symptom it prevents",
      /Failed to generate a name for a character/.test(txt), txt.slice(0, 400));

    console.log("\n[the culture chooses the source]");
    const asianTag = r.b.nameList && r.b.nameList.sourceTag;
    const mod2 = mkMod();
    const r2 = await api.create(mod2, "NUY", "african_gfx");
    const africanTag = r2.b.nameList && r2.b.nameList.sourceTag;
    rec("a different culture seeds from a different country", asianTag && africanTag && asianTag !== africanTag,
      { asianTag, africanTag });
    if (haveVanilla && asianTag && africanTag) {
      const cultureOf = (tag) => {
        for (const f of fs.readdirSync(path.join(VANILLA, "common", "country_tags"))) {
          if (!f.toLowerCase().endsWith(".txt")) continue;
          const t = fs.readFileSync(path.join(VANILLA, "common", "country_tags", f), "utf8").replace(/#.*$/gm, "");
          const m = new RegExp(`^\\s*${tag}\\s*=\\s*"([^"]+)"`, "m").exec(t);
          if (m) {
            const c = /graphical_culture\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(VANILLA, "common", m[1]), "utf8").replace(/#.*$/gm, ""));
            return c ? c[1] : null;
          }
        }
        return null;
      };
      rec("…and the source really is of the culture that was asked for",
        cultureOf(asianTag) === "asian_gfx" && cultureOf(africanTag) === "african_gfx",
        { asian: cultureOf(asianTag), african: cultureOf(africanTag) });
    }
    const rSame = await api.create(mkMod(), "NUZ", "asian_gfx");
    rec("…and the same culture always picks the same source — deterministic, not readdir order",
      rSame.b.nameList && rSame.b.nameList.sourceTag === asianTag,
      { first: asianTag, second: rSame.b.nameList && rSame.b.nameList.sourceTag });

    console.log("\n[it does not overwrite what is already there]");
    const again = await api.create(mod, "NUX", "asian_gfx");
    rec("re-creating the same tag writes no second pool", !again.b.nameList, again.b.nameList);
    rec("…and leaves the one file alone", namesFiles(mod).length === 1, namesFiles(mod));
    const mod3 = mkMod();
    fs.mkdirSync(namesDir(mod3), { recursive: true });
    fs.writeFileSync(path.join(namesDir(mod3), "authors_own.txt"), 'NUW = {\n\tmale = { names = { Ada } }\n}\n', "utf8");
    const r3 = await api.create(mod3, "NUW", "asian_gfx");
    rec("a tag the author already gave a pool is left alone", !r3.b.nameList, r3.b.nameList);
    rec("…and their file is untouched",
      fs.readFileSync(path.join(namesDir(mod3), "authors_own.txt"), "utf8").includes("Ada") && namesFiles(mod3).length === 1,
      namesFiles(mod3));
    if (haveVanilla) {
      const r4 = await api.create(mkMod(), "GER", "western_european_gfx", "Not Germany");
      rec("a tag the BASE GAME already names is left alone too", !r4.b.nameList, r4.b.nameList);
    }
    api.stop(); api = null;

    console.log("\n[an EXISTING country] is told, and offered the same pool");
    // The seeder runs at CREATE, which leaves every country made before it — and every one carved out by
    // hand — without a pool and with nothing saying so. Country Setup now reports it where the author is
    // looking at that country, and carries the fix rather than just the news.
    {
      const em = mkMod();
      fs.mkdirSync(path.join(em, "history", "countries"), { recursive: true });
      fs.mkdirSync(path.join(em, "common", "country_tags"), { recursive: true });
      fs.mkdirSync(path.join(em, "common", "countries"), { recursive: true });
      fs.writeFileSync(path.join(em, "common", "country_tags", "custom.txt"), 'NUP = "countries/Older.txt"\n', "utf8");
      fs.writeFileSync(path.join(em, "common", "countries", "Older.txt"), "graphical_culture = african_gfx\ngraphical_culture_2d = african_2d\n\ncolor = { 1 2 3 }\n", "utf8");
      fs.writeFileSync(path.join(em, "history", "countries", "NUP - Older.txt"), "capital = 1\nset_research_slots = 3\n", "utf8");

      const capi = await serve(createApp());
      try {
        const d = await capi.get(`/api/history/country-details?tag=NUP&modPath=${encodeURIComponent(em)}`);
        rec("country details load", d.s === 200 && !d.b.error, d.b.error || Object.keys(d.b || {}));
        rec("…and report that this country has no pool", d.b.hasNameList === false, d.b.hasNameList);
        rec("…saying what breaks, in the game's own words",
          /Failed to generate a name for a character/.test(d.b.nameListNote || ""), d.b.nameListNote);
        rec("…and naming the country it is about", /^NUP /.test(d.b.nameListNote || ""), d.b.nameListNote);

        const seeded = await capi.post("/api/countries/seed-name-list", { modPath: em, tag: "NUP" });
        rec("the offer writes a pool", seeded.b.ok === true && seeded.b.nameList && seeded.b.nameList.file, seeded.b);
        rec("…reading the country's OWN culture, not a default",
          seeded.b.culture === "african_gfx", seeded.b.culture);
        const written = fs.readFileSync(path.join(em, "common", "names", seeded.b.nameList.file), "utf8");
        rec("…and the header says how it got there, not that the country was just created",
          /written by Nova from Country Setup/.test(written), written.slice(0, 120));
        rec("…declaring the tag, brace-balanced", /^NUP\s*=\s*\{/m.test(written) && braceBalance(written) === 0, braceBalance(written));

        const after = await capi.get(`/api/history/country-details?tag=NUP&modPath=${encodeURIComponent(em)}`);
        rec("…and the note is gone next time the country is opened",
          after.b.hasNameList === true && !after.b.nameListNote, { has: after.b.hasNameList, note: after.b.nameListNote });
        const twice = await capi.post("/api/countries/seed-name-list", { modPath: em, tag: "NUP" });
        rec("…a second press cannot double-write it", twice.b.ok === false && /already has a name pool/.test(twice.b.error || ""), twice.b);
        rec("…and only one file was ever written",
          fs.readdirSync(path.join(em, "common", "names")).length === 1, fs.readdirSync(path.join(em, "common", "names")));

        const bad = await capi.post("/api/countries/seed-name-list", { modPath: em, tag: "TOOLONG" });
        rec("a tag that is not a tag is refused", bad.b.ok === false && /3 characters/.test(bad.b.error || ""), bad.b);
        if (haveVanilla) {
          const van = await capi.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(em)}`);
          rec("a base-game country that already has a pool is not nagged",
            van.b.hasNameList === true && !van.b.nameListNote, { has: van.b.hasNameList, note: van.b.nameListNote });
        }
      } finally { capi.stop(); }
    }

    console.log("\n[a mod that REPLACES common/names] is told it has no pool, and can be given one");
    // #replace-path-common-names — countryRootsFor asked getActiveRoots for the roots WITHOUT naming the
    // directory, and then pushed the game root back in on the very next line — so the whole feature ignored
    // replace_path twice over. A mod declaring replace_path = "common/names" loads NO base pools at all,
    // yet Nova reported hasNameList:true for GER and answered the offer with "already has a name pool —
    // nothing to add". Its generated characters come out unnamed and the one control that fixes that
    // refuses to run. The same undo existed a second time inside seedCountryNameList, and only surfaced
    // once the first was fixed and the symptom changed rather than disappearing.
    if (haveVanilla) {
      const rp = path.join(ROOT, 'rp' + (++modSeq));
      fs.mkdirSync(path.join(rp, 'history', 'countries'), { recursive: true });
      fs.writeFileSync(path.join(rp, 'descriptor.mod'),
        'name="m"\nsupported_version="1.19.*"\nreplace_path="common/names"\n', 'utf8');
      fs.writeFileSync(path.join(rp, 'history', 'countries', 'GER - Germany.txt'), 'capital = 1\n', 'utf8');
      const capi2 = await serve(createApp());
      try {
        const d = await capi2.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(rp)}`);
        rec('a base-game country is reported as having NO pool once the directory is replaced',
          d.b.hasNameList === false, d.b.hasNameList);
        rec('…and the note says so', /has no name pool/.test(d.b.nameListNote || ''), d.b.nameListNote);
        const seeded = await capi2.post('/api/countries/seed-name-list', { modPath: rp, tag: 'GER' });
        rec('…and one can actually be written', seeded.b.ok === true, seeded.b);
        rec('…into the mod, where the game will load it',
          fs.existsSync(path.join(rp, 'common', 'names', 'nova_GER_names.txt')),
          fs.existsSync(path.join(rp, 'common', 'names')) ? fs.readdirSync(path.join(rp, 'common', 'names')) : []);
      } finally { capi2.stop(); }
    }

    console.log("\n[the Country Setup panel] shows it, and clears it between countries");
    {
      const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
      const HTML = fs.readFileSync(path.join(__dirname, "public", "country-setup.html"), "utf8");
      rec("the note box exists in the markup", /id="csNameListNote"/.test(HTML), "no box");
      rec("…hidden until it applies", /id="csNameListNote"[^>]*display:\s*none/.test(HTML), "starts visible");
      rec("…with the fix beside it, not just the news", /id="csSeedNameListBtn"/.test(HTML), "no button");
      rec("the client renders only what the endpoint says",
        /const note = \(data && data\.nameListNote\) \|\| "";/.test(CS) && /if \(!note\) \{ box\.style\.display = "none"; return; \}/.test(CS),
        "decides for itself");
      rec("…and re-shows the button when a different country is opened",
        /seedBtn\.style\.display = ""; \/\/ a previous country's "done" state must not carry over/.test(CS), "state carries over");
      rec("…posting to the seed endpoint", /"\/api\/countries\/seed-name-list"/.test(CS), "not wired");
      rec("…and saying where the names came from once it lands",
        /seeded from \$\{r\.nameList\.sourceTag\}/.test(CS), "no provenance");
      rec("…refusing politely with no country selected", /if \(!selectedTag\)/.test(CS), "no guard");
      rec("country-setup.js parses", (() => { try { new Function(CS); return true; } catch (e) { return String(e.message); } })() === true,
        (() => { try { new Function(CS); return "ok"; } catch (e) { return String(e.message); } })());
      rec("…and is versioned so the change ships", /country-setup\.js\?v=\d+/.test(HTML), "no version");
    }

    console.log("\n[the sibling creator] the Map's ✨ New country does it too");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const calls = (SRV.match(/seedCountryNameList\(/g) || []).length;
      rec("both creators call the seeder, not just one", calls >= 3, calls + " occurrences (1 definition + callers)");
      rec("…and the map creator passes the culture it hardcodes",
        /seedCountryNameList\(modRoot, countryTag, countryName, "western_european_gfx"\)/.test(SRV), "not wired");
      rec("…and returns it so the client can say so", /focusTreePath,\s*\r?\n\s*localizationPath,\s*\r?\n\s*nameList,/.test(SRV), "not returned");
    }

    console.log("\n[back-out] stop seeding the pool");
    {
      const built = controlApp("noseed", [[
        "      const nameList = seedCountryNameList(modPath, tag, name, graphicalCulture);",
        "      const nameList = null;"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cmod = mkMod();
          const c = await capi.create(cmod, "NUV", "asian_gfx");
          rec("…the control still creates the country", c.b.ok === true, c.b);
          rec("…with a graphical_culture", fs.existsSync(path.join(cmod, "common", "countries")), "no countries file");
          rec("…and no pool to name its people from", namesFiles(cmod).length === 0, namesFiles(cmod));
        } finally { capi.stop(); }
      }
    }

    console.log("\n[back-out] stop telling an existing country about it");
    {
      const built = controlApp("nonote", [[
        '      const hasNameList = countryHasNameList(modPath, tag);',
        '      const hasNameList = true;']]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cmod = mkMod();
          fs.mkdirSync(path.join(cmod, "history", "countries"), { recursive: true });
          fs.writeFileSync(path.join(cmod, "history", "countries", "NUQ - Quiet.txt"), "capital = 1\n", "utf8");
          const c = await capi.get(`/api/history/country-details?tag=NUQ&modPath=${encodeURIComponent(cmod)}`);
          rec("…the details still load", c.s === 200 && !c.b.error, c.b.error);
          rec("…and the missing pool goes unmentioned", !c.b.nameListNote, c.b.nameListNote);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== new country name list: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
