// Two ways a NO-EDIT character save destroyed content, both from reading one of two blocks that HOI4 reads
// as a pair.
//
// #duplicate-portrait-category-deletes-portraits — a `portraits = { }` block may declare the same category
// twice, and vanilla does it 27 times. GER.txt gives Karl Dönitz
//     portraits = { army = { large = GFX_portrait_GER_karl_donitz small = …_small } army = { small = GFX_idea_donitz } }
// and USA.txt gives MacArthur the mirror shape. 22 of the 27 are strictly DISJOINT — one block carries
// `small`, the other `large` — which is only meaningful if the engine reads both. (The hunt report said all
// 27; measuring says 22. The rest define `small` twice, where HOI4's own repeated-key rule applies and the
// last wins. The merge implements both cases.) Nova read only the LAST and
// rewrote the whole portraits block from it, so a save deleted either the character's large portrait or his
// advisor-button icon. `GFX_idea_douglas_macarthur` is defined in interface/ideas.gfx and referenced from
// nowhere else in common/: it IS the button art for his army_chief idea.
//
// #multi-advisor-merge-takes-first-block-conditions — a character can hold two `advisor = { }` blocks, and
// thirty vanilla characters do. Nova's READER takes the LAST (#duplicate-role-key) and the carry-forward
// drops the LAST (#character-role-replaces-wrong-occurrence), but the MERGE took the FIRST — so the advisor
// was rebuilt from the last block's managed fields with the FIRST block's allowed / available / visible /
// ai_will_do grafted onto it. Göring's air chief came back carrying the political advisor's
// `visible = { always = no }`, which makes an advisor permanently unhireable.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chdup-"));
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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "chdup");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ChDup"\nsupported_version="1.19.*"\n', "utf8");
for (const f of ["GER.txt", "USA.txt", "ENG.txt", "FRA.txt"]) {
  try { fs.copyFileSync(path.join(V, "common", "characters", f), path.join(MOD, "common", "characters", f)); } catch (_) {}
}

const PORT = 43413;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the duplicate-category shape is vanilla's, not a corruption");
    let dupCats = 0, disjoint = 0;
    let charFiles = [];
    try { charFiles = fs.readdirSync(path.join(V, "common", "characters")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    for (const f of charFiles) {
      const t = fs.readFileSync(path.join(V, "common", "characters", f), "utf8");
      for (const m of t.matchAll(/portraits\s*=\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g)) {
        const inner = m[1];
        for (const cat of ["army", "civilian", "navy"]) {
          const blocks = [...inner.matchAll(new RegExp(`${cat}\\s*=\\s*\\{([^{}]*)\\}`, "g"))].map((x) => x[1]);
          if (blocks.length < 2) continue;
          dupCats++;
          const keys = blocks.map((b) => new Set([...b.matchAll(/(^|\n|\s)(large|small)\s*=/g)].map((k) => k[2])));
          const overlap = [...keys[0]].some((k) => keys.slice(1).some((s) => s.has(k)));
          if (!overlap) disjoint++;
        }
      }
    }
    rec("the character corpus was readable", charFiles.length > 40, charFiles.length);
    rec("vanilla declares a portrait category twice, repeatedly", dupCats >= 20, { dupCats, disjoint });
    // The hunt report claimed all of them are disjoint. Measured: 22 of 27. The rest (FRA_rene_emile_godfroy)
    // define `small` in both blocks, where HOI4's own repeated-key rule applies and the LAST wins. Both cases
    // are what the merge implements, so the assertion is the measurement rather than the claim.
    rec("…and the great majority are DISJOINT, which is why both blocks are live content",
      dupCats > 0 && disjoint >= dupCats - 6 && disjoint >= 20, { dupCats, disjoint });

    console.log("\n[the bug] both blocks must be read");
    const l = await get(`/api/characters/list?modPath=${encodeURIComponent(MOD)}`);
    rec("the characters read back", l.s === 200 && (l.b.files || []).length >= 3, (l.b.files || []).map((f) => f.file));
    const find = (tok) => {
      for (const f of l.b.files || []) {
        const c = (f.characters || []).find((x) => x.token === tok || x.id === tok);
        if (c) return c;
      }
      return null;
    };
    for (const [tok, large, small] of [
      ["GER_karl_donitz", "GFX_portrait_GER_karl_donitz", "GFX_idea_donitz"],
      ["USA_douglas_macarthur", "GFX_portrait_USA_douglas_macarthur", "GFX_idea_douglas_macarthur"],
      ["ENG_bernard_montgomery", "GFX_portrait_ENG_bernard_montgomery", "GFX_idea_bernard_montgomery"],
      ["FRA_maxime_weygand", "GFX_portrait_FRA_maxime_weygand", "GFX_idea_maxime_weygand"],
    ]) {
      const c = find(tok);
      rec(`${tok} was found`, !!c, tok);
      rec(`…keeps the LARGE portrait from the first block`, c && c.portraitArmyLarge === large,
        c && { got: c.portraitArmyLarge, want: large });
      rec(`…and the advisor icon from the second`, c && c.portraitArmySmall === small,
        c && { got: c.portraitArmySmall, want: small });
    }
    // …and the civilian side of the same character, which lives in a different category.
    const goring = find("GER_hermann_goring");
    rec("a character with civilian AND army portraits keeps both sides",
      goring && goring.portraitCivLarge === "GFX_portrait_GER_hermann_goring" && goring.portraitArmySmall === "GFX_idea_goering",
      goring && { civ: goring.portraitCivLarge, army: goring.portraitArmySmall });

    console.log("\n[the other bug] the role merge must take the LAST advisor block");
    const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("_matchNamedBlock can return the last occurrence", /function _matchNamedBlock\(text, key, opts\)/.test(SRC), "no opts");
    rec("…and roleMerge asks for it", /const oldRole = _matchNamedBlock\(oldInner, key, \{ last: true \}\);/.test(SRC),
      "roleMerge still takes the first");
    rec("…which now matches the reader, that always took the last",
      /function charSubBlock\(blockText, key\)[\s\S]{0,400}?last = v;/.test(SRC), "reader shape changed");
    // …and vanilla really does ship the two-advisor shape this protects.
    let twoAdvisor = 0;
    for (const f of charFiles) {
      const t = fs.readFileSync(path.join(V, "common", "characters", f), "utf8");
      for (const m of t.matchAll(/(^|\n)\t([A-Za-z0-9_.-]+)\s*=\s*\{/g)) {
        const start = m.index + m[0].length;
        const end = t.indexOf("\n\t}", start);
        if (end < 0) continue;
        const body = t.slice(start, end);
        if ((body.match(/(^|\n)\t\tadvisor\s*=\s*\{/g) || []).length >= 2) twoAdvisor++;
      }
    }
    rec("vanilla ships characters with TWO advisor blocks", twoAdvisor >= 10, twoAdvisor);

    console.log("\n[control] the merged read is key-wise, not a blind concatenation");
    // If both blocks define the same key, the LAST must win — the convention charSubBlock already used and
    // the one HOI4 applies to a repeated key. A concatenation would return both and the scalar reader would
    // pick whichever it saw first.
    const F2 = path.join(MOD, "common", "characters", "ZZZ_probe.txt");
    fs.writeFileSync(F2, [
      "characters = {",
      "\tzzz_probe_char = {",
      '\t\tname = "Probe"',
      "\t\tportraits = {",
      "\t\t\tarmy = { large = GFX_first_large small = GFX_first_small }",
      "\t\t\tarmy = { large = GFX_second_large }",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const l2 = await get(`/api/characters/list?modPath=${encodeURIComponent(MOD)}`);
    let probe = null;
    for (const f of l2.b.files || []) {
      const c = (f.characters || []).find((x) => x.token === "zzz_probe_char" || x.id === "zzz_probe_char");
      if (c) { probe = c; break; }
    }
    rec("the probe character was read", !!probe, (l2.b.files || []).map((f) => f.file));
    rec("a repeated key takes the LAST value", probe && probe.portraitArmyLarge === "GFX_second_large",
      probe && probe.portraitArmyLarge);
    rec("…and a key only the first block had still survives", probe && probe.portraitArmySmall === "GFX_first_small",
      probe && probe.portraitArmySmall);

    console.log(`\n=== character duplicate blocks: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
