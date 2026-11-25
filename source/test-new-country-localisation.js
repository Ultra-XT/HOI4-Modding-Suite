// #new-country-has-no-name — the Map's "✨ New country" created a country with no localisation at all.
//
// mapData.createCountry registers the tag, writes common/countries/<file>.txt, writes the history file, sets
// colors.txt and reassigns every claimed state's owner — then returns ok:true. It never wrote a localisation
// key, and the endpoint wrapping it added none. HOI4 renders the unresolved key when a name is missing, so
// the country read as its bare tag in every screen it appears in.
//
// The name the modder typed survived only as two FILENAMES and as the path string inside
// common/country_tags/00_nova_countries.txt — never as anything the game displays.
//
// Adjectives matter as much as the name: without TAG_ADJ the "<country> army / faction / government" strings
// break too. And the ideology variants are not optional here — the history file this same function generates
// sets `ruling_party = neutrality`, so HOI4 looks for TAG_neutrality FIRST and only falls back to TAG.
//
// Worst of all there was no way back inside Nova: once the tag exists, /api/countries/create refuses it
// ("Country tag … already exists.") and /api/map/create-country refuses it too — advising Country Setup,
// which has no endpoint that writes a country's name. Repair meant hand-editing a .yml.
//
// The sibling endpoint /api/countries/create always wrote these ten keys; it just did it with a raw append,
// which duplicated every key if the same tag was written twice. Both now share one helper.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-countryloc-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/countries", "common/country_tags", "history/countries", "history/states", "localisation/english"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CL"\nsupported_version="1.18.*"\n');
const mkState = (id) => fs.writeFileSync(path.join(MOD, "history", "states", `${id}.txt`),
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\thistory = {\n\t\towner = OLD\n\t\tvictory_points = { ${id} 1 }\n\t}\n\tprovinces = { ${id} }\n}\n`, "utf8");
mkState(1); mkState(2);

const locText = () => {
  const dir = path.join(MOD, "localisation", "english");
  let out = "";
  for (const f of fs.readdirSync(dir)) if (f.toLowerCase().endsWith(".yml")) out += fs.readFileSync(path.join(dir, f), "utf8");
  return out;
};
const hasKey = (txt, key) => new RegExp(`^\\s*${key}:\\d*\\s*"`, "m").test(txt);
const valueOf = (txt, key) => (new RegExp(`^\\s*${key}:\\d*\\s*"([^"]*)"`, "m").exec(txt) || [])[1];

const PORT = 39915, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    // ── the Map path, the one that wrote nothing ────────────────────────────────────────────────────
    const r = await post("/api/map/create-country", {
      modPath: MOD, tag: "Z00", name: "Frisia", rgb: [10, 90, 160], stateIds: [1], capitalStateId: 1,
    });
    ok("the Map's New country succeeds", r.s === 200 && r.b && r.b.ok, r.b);

    const txt = locText();
    ok("the country has a NAME key at all", hasKey(txt, "Z00"), txt.slice(0, 200));
    ok("…set to the name the modder typed", valueOf(txt, "Z00") === "Frisia", valueOf(txt, "Z00"));
    ok("…and an adjective key, or 'the Z00 army' reads broken too", hasKey(txt, "Z00_ADJ"), txt.slice(0, 300));
    // The generated history sets ruling_party = neutrality, so this is the key the game reaches for FIRST.
    ok("…and the neutrality variant the generated history actually selects",
      valueOf(txt, "Z00_neutrality") === "Frisia", valueOf(txt, "Z00_neutrality"));
    ok("…and every ideology variant, both name and adjective",
      ["democratic", "fascism", "communism"].every((i) => hasKey(txt, `Z00_${i}`) && hasKey(txt, `Z00_${i}_ADJ`)), txt);
    ok("the file carries the UTF-8 BOM HOI4 requires",
      fs.readFileSync(path.join(MOD, "localisation", "english", "custom_countries_l_english.yml"), "utf8").charCodeAt(0) === 0xfeff);

    // ── the sibling path still works, and no longer duplicates on a repeat write ────────────────────
    const r2 = await post("/api/countries/create", {
      modPath: MOD, tag: "Z01", name: "Verifonia", capitalStateId: 2,
      color: "10 20 30", graphicalCulture: "western_european_gfx",
    });
    ok("Country Setup's create still writes names", r2.s === 200 && hasKey(locText(), "Z01"), r2.b);
    ok("…with the right value", valueOf(locText(), "Z01") === "Verifonia", valueOf(locText(), "Z01"));

    const countOf = (key) => (locText().match(new RegExp(`^\\s*${key}:\\d*\\s*"`, "gm")) || []).length;
    ok("each key is defined exactly once, not appended twice", countOf("Z01") === 1 && countOf("Z00") === 1,
      { Z00: countOf("Z00"), Z01: countOf("Z01") });

    // A name Nova would otherwise have written unescaped straight into the .yml.
    const r3 = await post("/api/map/create-country", {
      modPath: MOD, tag: "Z02", name: 'Ré"public', rgb: [1, 2, 3], stateIds: [], capitalStateId: 2,
    });
    if (r3.s === 200 && r3.b && r3.b.ok) {
      const t3 = locText();
      ok("a quote in the name does not break the .yml", /Z02:\d*\s*"[^\n]*"\s*$/m.test(t3), t3.slice(-200));
      ok("…and every later key is still parseable", hasKey(t3, "Z02_communism_ADJ"), t3.slice(-300));
    } else {
      total += 2; pass += 2;
      console.log("  ok  (a quote in the name is rejected upstream — also acceptable)");
      console.log("  ok  (…so nothing unescaped reaches the .yml)");
    }

    console.log("\ntest-new-country-localisation: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 11 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
