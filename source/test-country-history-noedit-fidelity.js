// OPENING A COUNTRY AND PRESSING SAVE REWROTE THE FILE — AND FOR SPAIN, CHANGED WHO GOVERNS IT.
//
// Four defects in the country-history round trip, all found by copying the shipping corpora into a scratch
// mod, reading every country back through Nova's own endpoints, handing the answer straight back unchanged,
// and diffing the bytes:
//
//   #tech-save-reformats-whole-history-file-and-drops-bom
//     A no-edit tech save rewrote all 364 vanilla country history files: the managed block was stripped from
//     wherever the author put it and re-appended at the end of the head, blank lines collapsed, trailing
//     whitespace stripped, and the byte-order mark trimmed off (String.trim() eats U+FEFF; 333 of vanilla's
//     355 and 304 of Millennium Dawn's 386 country files ship one). 326 of vanilla's 364 files write a comment
//     line — usually `# Starting tech` — directly above the block, and relocating the block left every one of
//     those comments describing whatever happened to follow it. Two files put the comment on the open line
//     itself, and that one was deleted outright: Paradox's own `set_technology = { #WARNING: Do not just
//     remove techs from here -> It can impact a lot of stuff…` in SOV. It was also the last country-history
//     writer using a raw fs.writeFileSync, so the whole-file reorganisation had no backup behind it.
//
//   #nested-set-politics-read-as-the-countrys-politics
//     The block reader took the FIRST `set_politics` at ANY depth. stripDatedBlocks() only removes
//     `YYYY.M.D = { … }`, so an `if = { limit = { … } set_politics = { … } }` survives it. Spain writes three
//     of those for its civil war, at lines 114-134, before its real top-level block at line 329 — so Nova
//     showed Spain as non-aligned with elections off, and saving wrote that over the real block. `democratic`
//     / `1933.2.16` / 36 / yes became `neutrality` / `1936.1.1` / 48 / no. getVal() had already been taught
//     depth-0-last-wins for scalars (#scalar-edit-lands-on-overridden-statement); its sibling never adopted it.
//
//   #no-country-block-rewrite-without-edit  (two holes)
//     (a) The unchanged-block guard only fired when a block already existed, so the 14 vanilla countries that
//         declare no set_politics at all (ARM, AZR, BLR, GEO, KAZ, LAO…) had four lines of political
//         configuration fabricated for them on a save that changed nothing. The wiki does not document what
//         the engine defaults to when set_politics is absent, so Nova was pinning values it cannot know are
//         no-ops.
//     (b) An OMITTED key inside an existing block compared unequal to the reader's default, so Hawaii and
//         Turkey — whose blocks leave election_frequency out — gained `election_frequency = 48` on every save.
//
//   #partial-set-popularities-rewritten-on-no-edit-save
//     The reader seeds all four standard ideologies at 0 and the comparison was key-wise, so Albania's
//     `set_popularities = { neutrality = 100 }` never matched what came back and was rewritten to four lines.
//
// After the fixes: all 364 vanilla country history files, and Millennium Dawn's, are byte-identical after a
// no-edit country-details save and a no-edit tech save.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chfid-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VDIR = path.join(VANILLA, "history", "countries");
const HAVE_VANILLA = fs.existsSync(VDIR);

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

// ---------------------------------------------------------------------------------------------------
// Fixtures. Modelled byte-for-byte on the real shapes above so the test still means something on a
// machine with no HOI4 install; the corpus round trip below runs only when vanilla is present.
// ---------------------------------------------------------------------------------------------------
const BOM = "\ufeff";
const FIX = {
  // SOV: BOM, a comment ON the open line, trailing whitespace inside the block, content after it.
  WARN: BOM + [
    "capital = 219",
    "",
    "# Starting tech",
    "set_technology = { #WARNING: Do not just remove techs from here -> It can impact a lot of stuff",
    "\tinfantry_weapons = 1",
    "\ttech_support = 1\t\t",
    "\tgw_artillery = 1",
    "}",
    "",
    "set_stability = 0.6",
    "",
    "1939.1.1 = {",
    "\tset_technology = {",
    "\t\tinfantry_weapons2 = 1",
    "\t}",
    "}",
    "",
  ].join("\n"),
  // SPR: three nested set_politics for the civil war, then the real top-level one.
  SPA: BOM + [
    "capital = 41",
    "",
    "if = {",
    "\tlimit = { has_dlc = \"La Resistance\" }",
    "\tevery_country = {",
    "\t\tset_politics = {",
    "\t\t\truling_party = neutrality",
    "\t\t}",
    "\t}",
    "}",
    "",
    "set_politics = {",
    "\truling_party = democratic",
    "\tlast_election = \"1933.2.16\"",
    "\telection_frequency = 36",
    "\telections_allowed = yes",
    "}",
    "",
    "set_popularities = {",
    "\tdemocratic = 47",
    "\tfascism = 30",
    "\tcommunism = 23",
    "}",
    "",
  ].join("\n"),
  // HAW: a politics block that deliberately omits election_frequency.
  HAWX: BOM + [
    "capital = 629",
    "",
    "set_politics = {",
    "\truling_party = neutrality",
    "\tlast_election = \"1936.1.1\"",
    "\telections_allowed = no",
    "}",
    "",
  ].join("\n"),
  // ARM: no set_politics at all, but popularities are declared.
  NOPOL: BOM + [
    "capital = 230",
    "",
    "set_popularities = {",
    "\tdemocratic = 30",
    "\tfascism = 34",
    "\tcommunism = 36",
    "}",
    "",
  ].join("\n"),
  // ALB: a partial popularities block — one ideology, the other three simply absent.
  PART: BOM + [
    "capital = 44",
    "",
    "set_politics = {",
    "\truling_party = neutrality",
    "\tlast_election = \"1933.3.5\"",
    "\telection_frequency = 48",
    "\telections_allowed = no",
    "}",
    "",
    "set_popularities = {",
    "\tneutrality = 100 # King Zog is not up for debate",
    "}",
    "",
  ].join("\n"),
};
// Tags vanilla does not use. HAW and PAR are real vanilla countries, and a fixture under one of those tags
// picks up the vanilla file's technologies through getCountryTechnologies' game+mod merge — which is a real
// behaviour worth testing, but not the one this file is about.
const NAME = { WARN: "WAR - Warnland.txt", SPA: "SPA - Spainish.txt", HAWX: "ZZH - Hawaiiish.txt", NOPOL: "NOP - Nopolitics.txt", PART: "ZZP - Partial.txt" };

function buildMod(dir) {
  const hist = path.join(dir, "history", "countries");
  fs.mkdirSync(hist, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="Fid"\nsupported_version="1.19.*"\n', "utf8");
  for (const k of Object.keys(FIX)) fs.writeFileSync(path.join(hist, NAME[k]), FIX[k], "utf8");
  return hist;
}
const MOD = path.join(ROOT, "fid");
const HIST = buildMod(MOD);
const fileOf = (k) => path.join(HIST, NAME[k]);
const readF = (k) => fs.readFileSync(fileOf(k), "utf8");
const tagOf = (k) => NAME[k].slice(0, 3);

// ---------------------------------------------------------------------------------------------------
// Back-out controls. Each writes ONE targeted edit into a copy of server.js beside the original (so its
// relative requires still resolve), loads it, and re-runs the exact check the fix is supposed to make pass.
// A control that does not break the check is not a control. Anchors are single-line: server.js is CRLF in
// the working tree, so anything containing \n silently fails to match.
// ---------------------------------------------------------------------------------------------------
const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43711;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      srv: s,
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Drive one country through both no-edit round trips in a throwaway mod, and report whether the file moved.
async function noEditRun(api, dir) {
  const hist = path.join(dir, "history", "countries");
  const moved = [];
  for (const k of Object.keys(FIX)) {
    const tag = tagOf(k), p = path.join(hist, NAME[k]);
    const before = fs.readFileSync(p, "utf8");
    const d = await api.get(`/api/history/country-details?tag=${tag}&modPath=${encodeURIComponent(dir)}`);
    if (d.s === 200 && d.b.details) await api.post("/api/history/save-country-details", { tag, modPath: dir, details: d.b.details });
    const g = await api.get(`/api/technologies/country-techs?tag=${tag}&modPath=${encodeURIComponent(dir)}`);
    const ids = (g.b && (g.b.techs || g.b.technologies)) || [];
    if (ids.length) await api.post("/api/technologies/save-country-techs", { modPath: dir, tag, techIds: ids });
    if (fs.readFileSync(p, "utf8") !== before) moved.push(k);
  }
  return moved;
}

(async () => {
  const api = await serve(createApp());
  try {
    // -------------------------------------------------------------------------------------------
    console.log("\n[ground truth] what the shipping corpora actually put around set_technology / set_politics");
    if (!HAVE_VANILLA) {
      console.log("  (vanilla not installed — corpus sections skipped)");
    } else {
      const files = fs.readdirSync(VDIR).filter((f) => /\.txt$/i.test(f));
      let above = 0, onOpen = 0, withBlock = 0, noPol = 0, noPolButPop = 0;
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(path.join(VDIR, f), "utf8"); } catch (_) { continue; }
        const lines = t.split(/\r?\n/);
        let has = false;
        lines.forEach((l, i) => {
          const m = /^set_technology\s*=\s*\{(.*)$/.exec(l);
          if (!m) return;
          has = true;
          if (/#/.test(m[1])) onOpen++;
          if (/^#/.test((lines[i - 1] || "").trim())) above++;
        });
        if (has) withBlock++;
        const masked = t.replace(/#[^\n]*/g, "");
        const top = (k) => new RegExp(`(^|\\n)set_${k}\\s*=\\s*\\{`, "i").test(masked);
        if (!top("politics")) { noPol++; if (top("popularities")) noPolButPop++; }
      }
      rec("vanilla ships 364 country history files", files.length === 364, files.length);
      rec("…363 of them declare a top-level set_technology", withBlock === 363, withBlock);
      rec("…326 write a comment line directly above it", above === 326, above);
      rec("…and 2 put the comment ON the opening line (SOV's WARNING, BUL's `#VANILLA & DLC`)", onOpen === 2, onOpen);
      rec("…14 countries declare NO set_politics at all", noPol === 14, noPol);
      rec("…8 of those DO declare popularities, so the file is not simply empty", noPolButPop === 8, noPolButPop);
    }

    // -------------------------------------------------------------------------------------------
    console.log("\n[the bug] a save that changes nothing must write nothing");
    const moved = await noEditRun(api, MOD);
    rec("no country history file moved a single byte", moved.length === 0, moved);
    for (const k of Object.keys(FIX)) rec(`  …${NAME[k]} is byte-identical`, readF(k) === FIX[k], { got: readF(k), want: FIX[k] });

    // -------------------------------------------------------------------------------------------
    console.log("\n[the bug] the editor must show the UNCONDITIONAL politics, not a nested one");
    const spa = await api.get(`/api/history/country-details?tag=SPA&modPath=${encodeURIComponent(MOD)}`);
    const pol = (spa.b.details || {}).politics || {};
    rec("Spain reads as democratic, not the nested `neutrality`", pol.rulingParty === "democratic", pol);
    rec("…with its own election date", pol.lastElection === "1933.2.16", pol);
    rec("…and its own election frequency", Number(pol.electionFrequency) === 36, pol);
    rec("…and elections allowed", String(pol.electionsAllowed) === "yes", pol);

    // -------------------------------------------------------------------------------------------
    console.log("\n[the bug] no block is invented, and no omitted key is materialised");
    rec("a country with no set_politics still has none", !/set_politics/.test(readF("NOPOL")), readF("NOPOL"));
    rec("a country with no set_popularities is not given four zeroes", !/set_popularities/.test(readF("HAWX")), readF("HAWX"));
    rec("a block that omits election_frequency still omits it", !/election_frequency/.test(readF("HAWX")), readF("HAWX"));
    rec("a partial set_popularities still lists one ideology",
      (readF("PART").match(/^\t[a-z_]+ = /gm) || []).filter((l) => /democratic|fascism|communism|neutrality/.test(l)).length === 1, readF("PART"));
    rec("…with the author's comment on it", /neutrality = 100 # King Zog is not up for debate/.test(readF("PART")), readF("PART"));

    // -------------------------------------------------------------------------------------------
    console.log("\n[control] a REAL edit still lands — the fix must not be `never write anything`");
    let r = await api.post("/api/history/save-country-details", {
      tag: "SPA", modPath: MOD, details: { politics: { rulingParty: "fascism", lastElection: "1933.2.16", electionFrequency: 36, electionsAllowed: "yes" } },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("Spain's TOP-LEVEL ruling party changed", /(^|\n)set_politics = \{\n\truling_party = fascism/.test(readF("SPA")), readF("SPA"));
    rec("…and the nested civil-war block was left alone", /\t\t\truling_party = neutrality/.test(readF("SPA")), readF("SPA"));
    rec("…exactly one top-level set_politics", (readF("SPA").match(/(^|\n)set_politics/g) || []).length === 1, readF("SPA"));

    r = await api.post("/api/history/save-country-details", {
      tag: "NOP", modPath: MOD, details: { politics: { rulingParty: "communism", lastElection: "", electionFrequency: 48, electionsAllowed: "no" } },
    });
    rec("a real party choice DOES create the missing block", /ruling_party = communism/.test(readF("NOPOL")), readF("NOPOL"));
    rec("…without smuggling in the keys the user never set",
      !/election_frequency/.test(readF("NOPOL")) && !/last_election/.test(readF("NOPOL")), readF("NOPOL"));

    r = await api.post("/api/history/save-country-details", {
      tag: "ZZP", modPath: MOD, details: { popularities: { democratic: 0, fascism: 0, communism: 20, neutrality: 80 } },
    });
    rec("a real popularity edit lands", /communism = 20/.test(readF("PART")) && /neutrality = 80/.test(readF("PART")), readF("PART"));
    rec("…keeping the author's key first", /set_popularities = \{\n\tneutrality = 80/.test(readF("PART")), readF("PART"));
    rec("…and not writing the ideologies still at zero", !/democratic/.test(readF("PART")), readF("PART"));

    // -------------------------------------------------------------------------------------------
    console.log("\n[control] a REAL tech edit rewrites the block WHERE THE AUTHOR PUT IT");
    const warnBefore = readF("WARN");
    r = await api.post("/api/technologies/save-country-techs", { modPath: MOD, tag: "WAR", techIds: ["infantry_weapons", "gw_artillery"] });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const warn = readF("WARN");
    rec("the tech was removed", !/tech_support/.test(warn), warn);
    rec("the BOM survived", warn.charCodeAt(0) === 0xfeff, warn.charCodeAt(0));
    rec("the comment above still sits directly above the block", /# Starting tech\nset_technology = \{/.test(warn), warn);
    rec("Paradox's WARNING on the opening line survived", /set_technology = \{ #WARNING: Do not just remove techs/.test(warn), warn);
    rec("the block did not move past set_stability", warn.indexOf("set_technology") < warn.indexOf("set_stability"), warn);
    rec("the dated block was not touched", /1939\.1\.1 = \{[\s\S]*infantry_weapons2 = 1/.test(warn), warn);
    rec("…and exactly one top-level set_technology remains",
      (warn.match(/(^|\n)set_technology/g) || []).length === 1, warn);
    rec("the file did change (this control is load-bearing)", warn !== warnBefore, "unchanged");

    // -------------------------------------------------------------------------------------------
    console.log("\n[corpus] every vanilla country, read back and handed straight to the writer");
    if (!HAVE_VANILLA) console.log("  (skipped — vanilla not installed)");
    else {
      const CMOD = path.join(ROOT, "corpus");
      const chist = path.join(CMOD, "history", "countries");
      fs.mkdirSync(chist, { recursive: true });
      fs.writeFileSync(path.join(CMOD, "descriptor.mod"), 'name="C"\nsupported_version="1.19.*"\n', "utf8");
      const files = fs.readdirSync(VDIR).filter((f) => /\.txt$/i.test(f));
      for (const f of files) fs.copyFileSync(path.join(VDIR, f), path.join(chist, f));
      let changed = [], bomLost = 0, ran = 0;
      for (const f of files) {
        const tag = f.slice(0, 3), p = path.join(chist, f);
        const before = fs.readFileSync(p);
        const d = await api.get(`/api/history/country-details?tag=${tag}&modPath=${encodeURIComponent(CMOD)}`);
        if (d.s !== 200 || !d.b.details) continue;
        ran++;
        await api.post("/api/history/save-country-details", { tag, modPath: CMOD, details: d.b.details });
        const g = await api.get(`/api/technologies/country-techs?tag=${tag}&modPath=${encodeURIComponent(CMOD)}`);
        const ids = (g.b && (g.b.techs || g.b.technologies)) || [];
        if (ids.length) await api.post("/api/technologies/save-country-techs", { modPath: CMOD, tag, techIds: ids });
        const after = fs.readFileSync(p);
        if (!after.equals(before)) changed.push(f);
        if (before[0] === 0xef && after[0] !== 0xef) bomLost++;
      }
      rec("every vanilla country was exercised", ran > 350, ran);
      rec("…and NOT ONE file changed", changed.length === 0, changed.slice(0, 8));
      rec("…and NOT ONE lost its byte-order mark", bomLost === 0, bomLost);
    }
    api.stop();

    // -------------------------------------------------------------------------------------------
    // Back-outs. One fix at a time, each re-running the check it is supposed to make pass.
    // -------------------------------------------------------------------------------------------
    const CONTROLS = [
      {
        label: "noop",
        why: "back out the unchanged-grants early return",
        pairs: [["    if (sorted.length === headOwned.size && sorted.every((id) => headOwned.has(id))) return { unmanaged };",
          "    if (false) return { unmanaged };"]],
        check: (m) => m.includes("WARN"),
        note: "a no-edit tech save rewrites the file again",
      },
      {
        label: "inplace",
        why: "back out the in-place block rewrite (re-append at the end of the head)",
        pairs: [["      if (first) {", "      if (false && first) {"]],
        check: null, // checked below with a real edit
        note: "the block is torn out from under its comment",
      },
      {
        label: "nested",
        why: "back out the depth-0 guard in the block reader",
        pairs: [["          if (pdxDepthAt(src, m.index) === 0) last = { m, src };", "          last = last || { m, src };"]],
        check: null,
        note: "Spain reads as the nested civil-war block again",
      },
      {
        label: "invent",
        why: "back out the no-block-invented guard",
        pairs: [["      const polUntouched = !polOnDisk", "      const polUntouched = false && !polOnDisk"]],
        check: (m) => m.includes("NOPOL"),
        note: "a country with no politics gets one fabricated",
      },
      {
        label: "omitted",
        why: "back out the omitted-key-is-not-a-difference guard",
        pairs: [["      const declared = { lastEl: !!(polOnDisk && polOnDisk.lastEl), freq: !!(polOnDisk && polOnDisk.freq), allowed: !!(polOnDisk && polOnDisk.allowed) };",
          "      const declared = { lastEl: true, freq: true, allowed: true };"]],
        check: (m) => m.includes("HAWX"),
        note: "election_frequency = 48 is materialised",
      },
      {
        label: "popinvent",
        why: "back out the no-popularities-block-invented guard",
        pairs: [["      const popUntouched = !onDisk && Object.values(wanted).every((n) => Number(n) === 0);",
          "      const popUntouched = false;"]],
        check: (m) => m.includes("HAWX"),
        note: "four zeroed ideologies are fabricated",
      },
      {
        label: "pops",
        why: "back out the absent-ideology-is-zero comparison",
        pairs: [["        if (Number(a[k] || 0) !== Number(b[k] || 0)) return false;", "        if (a[k] !== b[k]) return false;"]],
        check: (m) => m.includes("PART"),
        note: "a partial popularities block is rewritten and its comment dropped",
      },
      {
        label: "poporder",
        why: "back out the author's-key-set-and-order emitter",
        pairs: [["      (ordered.length ? ordered : entries).forEach(([k, v]) => {", "      entries.forEach(([k, v]) => {"]],
        check: null, // only reachable on a REAL edit — sameNumbers short-circuits the no-edit path
        note: "the three ideologies the file never mentioned are written back as zeroes",
      },
    ];

    for (const c of CONTROLS) {
      console.log(`\n[back-out: ${c.label}] ${c.why}`);
      const built = controlApp(c.label, c.pairs);
      if (built.error) { rec(`the control patched cleanly (${c.label})`, false, built.error); continue; }
      const dir = path.join(ROOT, "ctl-" + c.label);
      buildMod(dir);
      const capi = await serve(built.createApp());
      try {
        const m = await noEditRun(capi, dir);
        if (c.check) {
          rec(`…and the no-edit save DOES move the file (${c.note})`, c.check(m), { moved: m });
        } else if (c.label === "nested") {
          const d = await capi.get(`/api/history/country-details?tag=SPA&modPath=${encodeURIComponent(dir)}`);
          rec("…and Spain reads back as the nested `neutrality`",
            ((d.b.details || {}).politics || {}).rulingParty === "neutrality", (d.b.details || {}).politics);
        } else if (c.label === "poporder") {
          await capi.post("/api/history/save-country-details", {
            tag: "ZZP", modPath: dir, details: { popularities: { democratic: 0, fascism: 0, communism: 20, neutrality: 80 } },
          });
          const t = fs.readFileSync(path.join(dir, "history", "countries", NAME.PART), "utf8");
          rec("…and the zeroed ideologies are written back into the block", /democratic = 0/.test(t), t);
        } else if (c.label === "inplace") {
          await capi.post("/api/technologies/save-country-techs", { modPath: dir, tag: "WAR", techIds: ["infantry_weapons", "gw_artillery"] });
          const t = fs.readFileSync(path.join(dir, "history", "countries", NAME.WARN), "utf8");
          rec("…and the block is no longer under its comment", !/# Starting tech\nset_technology = \{/.test(t), t);
        }
      } finally { capi.stop(); }
    }

    console.log(`\n=== country history no-edit fidelity: ${checks} checks, ${fails.length} failed ===`);
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
