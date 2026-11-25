// Country Setup must not change a country's startup data the user didn't touch.
//
// Four defects, all found by reading real Millennium Dawn country files, saving them unchanged, and
// diffing:
//
//   1. #keep-fractional-popularities — party popularities were written with Math.round(). MD's Angola is
//      democratic 24.5 / communism 69.8 / neutrality 4.7 / nationalist 1.0; rounding each independently
//      changed the country's politics AND broke the total, 100 -> 101. Opening a country and pressing
//      Save was enough.
//   2. #country-history-bom — 94% of vanilla's country files and 79% of MD's begin with a UTF-8 BOM,
//      immediately before the first statement. The key matchers anchor with [ \t]*, which a BOM is not,
//      so `capital` never matched and a SECOND capital was inserted at the top. For a country whose
//      capital the user changed, the file then declared it twice and the game took the wrong one. The
//      BOM was dropped on the way out too.
//   3. #no-country-block-rewrite-without-edit — a save rebuilt set_popularities / set_politics even when
//      nothing about them had changed, discarding MD's per-ideology annotations (#Western, #Emerging)
//      and normalising 0.0 to 0.
//   4. #ambiguous-country-block — when a country declares set_popularities twice (a start state plus a
//      later dated state) the reader resolves to one and the writer replaced the FIRST, so a no-op save
//      stamped the later block's values over the start state. MD's Altai, Kazakhstan, Serbia and Syria
//      are shaped this way. The writer now leaves such a file alone and says why.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const FIX = path.join(os.tmpdir(), "nova-country-fidelity-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(FIX, { recursive: true, force: true });
const cdir = path.join(FIX, "history", "countries");
fs.mkdirSync(cdir, { recursive: true });
fs.writeFileSync(path.join(FIX, "descriptor.mod"), 'name="CountryFidelity"\nsupported_version="1.19.*"\n');

// (a) a BOM file with fractional popularities and annotations, shaped like MD's
const A = path.join(cdir, "AAA - Fracland.txt");
const A_TEXT = "﻿" + [
  "capital = 706",
  "",
  "set_research_slots = 3",
  "set_stability = 0.5",
  "",
  "set_popularities = {",
  "\tdemocratic = 24.5 #Western",
  "\tcommunism = 69.8 #Emerging",
  "\tfascism = 0.0 #Salafist",
  "\tneutrality = 4.7 #Neutrality",
  "\tnationalist = 1.0 #Nationalist",
  "}",
  "set_politics = {",
  "\truling_party = communism",
  "\tlast_election = \"2000.1.1\"",
  "\telection_frequency = 60",
  "\telections_allowed = yes",
  "}",
].join("\n"); // deliberately NO trailing newline, like MD
fs.writeFileSync(A, A_TEXT, "utf8");

// (b) a country that declares set_popularities twice — a start state plus a later dated state
const B = path.join(cdir, "BBB - Twiceland.txt");
const B_TEXT = [
  "2000.1.1 = {",
  "\tcapital = 12",
  "\tset_popularities = {",
  "\t\tdemocratic = 5.0",
  "\t\tcommunism = 60.0",
  "\t\tneutrality = 35.0",
  "\t}",
  "\tset_politics = {",
  "\t\truling_party = communism",
  "\t\tlast_election = \"2000.1.1\"",
  "\t\telection_frequency = 60",
  "\t\telections_allowed = yes",
  "\t}",
  "}",
  "2015.1.1 = {",
  "\tset_popularities = {",
  "\t\tdemocratic = 17.0",
  "\t\tcommunism = 3.0",
  "\t\tneutrality = 80.0",
  "\t}",
  "\tset_politics = {",
  "\t\truling_party = neutrality",
  "\t\tlast_election = \"2015.5.7\"",
  "\t\telection_frequency = 60",
  "\t\telections_allowed = yes",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(B, B_TEXT, "utf8");

const read = (p) => fs.readFileSync(p, "utf8");
const hasBom = (p) => read(p).charCodeAt(0) === 0xfeff;
// Strip the BOM before counting — a `(?:^|\n)[ \t]*` anchor does not match across one, which is
// precisely the blind spot that caused the duplicate-capital bug in the first place.
const noBom = (p) => read(p).replace(/^﻿/, "");
const capitals = (p) => (noBom(p).match(/(?:^|\n)[ \t]*capital[ \t]*=/g) || []).length;
const popSum = (p) => {
  const m = /set_popularities\s*=\s*\{([\s\S]*?)\}/.exec(read(p));
  if (!m) return null;
  return [...m[1].matchAll(/=\s*([0-9.]+)/g)].map((x) => parseFloat(x[1])).reduce((a, b) => a + b, 0);
};

const PORT = 39585, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const cycle = async (tag) => {
    const d = await get("/api/history/country-details?tag=" + tag + "&modPath=" + encodeURIComponent(FIX));
    const r = await post("/api/history/save-country-details", { tag, modPath: FIX, details: d.details });
    return { d, r };
  };
  try {
    // ── the BOM + fractional country ──────────────────────────────────────────────────────────────
    ok("the fixture starts with a BOM", hasBom(A));
    ok("its popularities total 100", popSum(A) === 100, popSum(A));
    const a1 = await cycle("AAA");
    ok("save → 200", a1.r.s === 200, a1.r.b);
    ok("the popularities are still fractional", /democratic\s*=\s*24\.5/.test(read(A)), read(A));
    ok("the total is still 100 (not 101)", popSum(A) === 100, popSum(A));
    ok("capital is declared exactly once", capitals(A) === 1, capitals(A));
    ok("the BOM survived", hasBom(A));
    ok("the ideology annotations survived", /#Western/.test(read(A)) && /#Emerging/.test(read(A)), read(A));
    ok("an unchanged save is BYTE-IDENTICAL", read(A) === A_TEXT, { len: read(A).length, was: A_TEXT.length });

    // saving repeatedly must not accumulate anything
    // Pause between the repeat saves — rewriting one file back-to-back is the shape behavioural
    // antivirus watches for, and the assertion is about drift, not speed.
    const breathe = () => new Promise((r) => setTimeout(r, 250));
    await breathe(); await cycle("AAA");
    await breathe(); await cycle("AAA");
    ok("three saves leave it byte-identical", read(A) === A_TEXT);

    // ── an actual edit still lands ────────────────────────────────────────────────────────────────
    const d = await get("/api/history/country-details?tag=AAA&modPath=" + encodeURIComponent(FIX));
    const edited = Object.assign({}, d.details, { capital: 999 });
    const r2 = await post("/api/history/save-country-details", { tag: "AAA", modPath: FIX, details: edited });
    ok("edit → 200", r2.s === 200, r2.b);
    ok("the new capital is written", /(?:^|\n)[ \t]*capital[ \t]*=[ \t]*999/.test(noBom(A)), read(A));
    ok("and still only once", capitals(A) === 1, capitals(A));
    ok("the BOM survived the edit", hasBom(A));
    ok("the popularities were left alone by a capital edit", /democratic\s*=\s*24\.5\s*#Western/.test(read(A)), read(A));

    // ── the ambiguous two-block country ───────────────────────────────────────────────────────────
    const b1 = await cycle("BBB");
    ok("save → 200", b1.r.s === 200, b1.r.b);
    ok("the START-STATE popularities are untouched",
      /democratic\s*=\s*5\.0[\s\S]*communism\s*=\s*60\.0/.test(read(B)), read(B).slice(0, 400));
    ok("the later block is untouched too",
      /democratic\s*=\s*17\.0[\s\S]*communism\s*=\s*3\.0/.test(read(B)));
    ok("the start-state ruling party is still communism",
      /ruling_party\s*=\s*communism/.test(read(B)));
    ok("it still declares set_popularities exactly twice",
      (read(B).match(/set_popularities\s*=\s*\{/g) || []).length === 2);
    ok("the ambiguous file is byte-identical", read(B) === B_TEXT);

    console.log("\ntest-country-history-fidelity: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
