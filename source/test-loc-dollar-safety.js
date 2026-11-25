// #literal-loc-replacement, swept across EVERY maker.
//
// A built localisation line is handed to String.replace as the REPLACEMENT, where $& $` $' and $1 are
// backreferences rather than literal text. A name containing one therefore rewrites the file instead of being
// inserted into it: renaming a decision to "Bonds worth $'000" turned a 152-byte .yml into 272 bytes, splicing
// the whole file inside an unterminated quoted value and leaving five duplicated keys.
//
// An earlier sweep fixed ten sites by matching the exact spelling `.replace(re, line)` — and therefore MISSED
// every site that names its variable something else or wraps it in a template literal:
//   * the CHARACTERS writer used `.replace(re, ` ${line}`)`
//   * the IDEAS / national-spirits writer used `.replace(nameRe, nameLine)` / `(descRe, descLine)`
//   * the spirit MODIFIER writer used `.replace(reBrace, `$1$2${formattedLine}`)`, which legitimately wants
//     its capture groups, so it needs a callback rather than escaping
// This test drives each maker's real save endpoint with a hostile name and asserts the file survives, so the
// class cannot come back by adding an eleventh site.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-loc-dollar-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// Every shape that behaves as a backreference, plus a doubled one which collapses to a single dollar.
const HOSTILE = [
  "Bonds worth $'000",
  "Cost $& more",
  "Backtick $` prefix",
  "Group $1 reference",
  "Doubled $$ sign",
];

fs.rmSync(ROOT, { recursive: true, force: true });
const MOD = path.join(ROOT, "mod");
for (const d of [["common", "characters"], ["common", "ideas"], ["common", "decisions"], ["events"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LocDollar"\nsupported_version="1.19.*"\n');

const locDir = path.join(MOD, "localisation", "english");
const locFiles = () => fs.readdirSync(locDir).filter((f) => /\.yml$/i.test(f));
const allLoc = () => locFiles().map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
// A healthy .yml: every value is closed, and no key is defined twice.
const healthy = () => {
  for (const f of locFiles()) {
    const t = fs.readFileSync(path.join(locDir, f), "utf8");
    if ((t.match(/"/g) || []).length % 2 !== 0) return { file: f, why: "odd number of quotes — a value is unterminated" };
    const keys = [...t.matchAll(/^[ \t]*([A-Za-z0-9_.:-]+):\d*/gm)].map((m) => m[1]);
    const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupe) return { file: f, why: "duplicated key " + dupe };
    if ((t.match(/l_english:/g) || []).length > 1) return { file: f, why: "more than one l_english: header" };
  }
  return null;
};
const valueOf = (key) => {
  const m = new RegExp("^[ \\t]*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ':\\d*[ \\t]*"(.*)"', "m").exec(allLoc());
  return m ? m[1] : null;
};

const PORT = 39594, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));

  try {
    // ── CHARACTERS ────────────────────────────────────────────────────────────────────────────────
    // Create it once with a safe name so the rename takes the REPLACE branch — appending was always safe;
    // it is replacing an existing line that corrupts.
    await post("/api/characters/save", {
      modPath: MOD, token: "dollar_char", name: "Safe Name", file: "ZZ_chars.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    await post("/api/characters/save", {
      modPath: MOD, token: "other_char", name: "Another Name", file: "ZZ_chars.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    ok("characters: two names written cleanly", healthy() === null, healthy());
    for (const name of HOSTILE) {
      const r = await post("/api/characters/save", {
        modPath: MOD, token: "dollar_char", name, file: "ZZ_chars.txt",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
      });
      await breathe();
      ok('characters: renaming to "' + name + '" keeps the file healthy', r.s === 200 && healthy() === null, { r: r.b, bad: healthy(), loc: allLoc().slice(0, 300) });
      const expect = name === "Doubled $$ sign" ? name : name; // stored literally either way
      ok("characters: …and stores it literally", valueOf("dollar_char") === expect, { want: expect, got: valueOf("dollar_char") });
      ok("characters: …and leaves the neighbour intact", valueOf("other_char") === "Another Name", valueOf("other_char"));
    }

    // ── NATIONAL SPIRITS / IDEAS ──────────────────────────────────────────────────────────────────
    const spiritBase = {
      modPath: MOD, ideaId: "dollar_spirit", targetRelativeFile: "common/ideas/ZZ_spirits.txt",
      mode: "create", category: "country", picture: "generic_communism_drift_bonus",
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.1\n}"],
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    };
    const rs0 = await post("/api/ideas/upsert-definition", Object.assign({}, spiritBase, { name: "Safe Spirit", desc: "Safe desc." }));
    await breathe();
    ok("spirits: created", rs0.s === 200, rs0.b);
    if (rs0.s === 200) {
      for (const name of HOSTILE) {
        const r = await post("/api/ideas/upsert-definition", Object.assign({}, spiritBase, { mode: "edit", name, desc: "Desc with " + name }));
        await breathe();
        ok('spirits: renaming to "' + name + '" keeps the file healthy', r.s === 200 && healthy() === null, { r: r.b, bad: healthy(), loc: allLoc().slice(0, 300) });
      }
      ok("spirits: the last name is stored literally", valueOf("dollar_spirit") === HOSTILE[HOSTILE.length - 1], valueOf("dollar_spirit"));
      ok("characters' keys were not collateral damage", valueOf("other_char") === "Another Name", valueOf("other_char"));
    }

    // ── DECISIONS (already fixed; pinned here so the sweep covers every maker in one place) ────────
    await post("/api/decisions/save", {
      modPath: MOD, categoryId: "dollar_cat", id: "dollar_dec", name: "Safe Decision",
      cost: 10, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
      available: "always = yes", modifier: "", effect: "add_political_power = 1",
      decisionType: "decision", scope: "national", cooldown: "", targetTrigger: "", removeEffect: "",
    });
    await breathe();
    for (const name of HOSTILE) {
      const r = await post("/api/decisions/save", {
        modPath: MOD, categoryId: "dollar_cat", id: "dollar_dec", name,
        previousId: "dollar_dec", previousCategoryId: "dollar_cat",
        cost: 10, icon: "GFX_decision_generic_decision", days: 0, fireOnce: "no",
        available: "always = yes", modifier: "", effect: "add_political_power = 1",
        decisionType: "decision", scope: "national", cooldown: "", targetTrigger: "", removeEffect: "",
      });
      await breathe();
      ok('decisions: renaming to "' + name + '" keeps the file healthy', r.s === 200 && healthy() === null, { r: r.b, bad: healthy() });
    }
    ok("decisions: the last name is stored literally", valueOf("dollar_dec") === HOSTILE[HOSTILE.length - 1], valueOf("dollar_dec"));

    // ── EVENTS ────────────────────────────────────────────────────────────────────────────────────
    const evBase = {
      modPath: MOD, namespace: "zzdollar", id: "1", type: "country_event",
      picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
      fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
      options: [{ name: "zzdollar.1.a", title: "Fine.", script: "", aiChance: "", trigger: "" }],
    };
    const re0 = await post("/api/events/save", Object.assign({}, evBase, { title: "Safe Event", description: "Safe body." }));
    await breathe();
    ok("events: created", re0.s === 200, re0.b);
    if (re0.s === 200) {
      for (const name of HOSTILE) {
        const r = await post("/api/events/save", Object.assign({}, evBase, { title: name, description: "Body with " + name }));
        await breathe();
        ok('events: retitling to "' + name + '" keeps the file healthy', r.s === 200 && healthy() === null, { r: r.b, bad: healthy() });
      }
      ok("events: the last title is stored literally", valueOf("zzdollar.1.t") === HOSTILE[HOSTILE.length - 1], valueOf("zzdollar.1.t"));
    }

    // ── nothing anywhere ended up duplicated or unterminated ───────────────────────────────────────
    ok("every localisation file is still healthy", healthy() === null, healthy());
    ok("no maker's keys were lost in the crossfire",
      valueOf("other_char") === "Another Name" && valueOf("dollar_char") !== null && valueOf("dollar_dec") !== null,
      { other_char: valueOf("other_char"), dollar_char: valueOf("dollar_char"), dollar_dec: valueOf("dollar_dec") });

    // ── and the source itself: no site may hand an unescaped built line to .replace ────────────────
    // Blank out `//` comments first — this scan's own explanatory comments quote the very pattern it hunts,
    // and matching them produced two false positives the first time it ran.
    const rawSrc = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const src = rawSrc.replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
    // Provably safe interpolations: a clamped number, or a country tag validated to 2-4 letters upstream.
    const SAFE = /sizeRe|ownerRe/;
    const suspicious = [];
    for (const m of src.matchAll(/\.replace\(\s*(\w*[Rr]e\w*)\s*,\s*(`[^`]*\$\{[^`]*`|\w*[Ll]ine\w*|\w*Val\w*)\s*\)/g)) {
      if (/asLiteralReplacement/.test(m[0]) || SAFE.test(m[1])) continue;
      suspicious.push({ line: src.slice(0, m.index).split("\n").length, snippet: m[0].slice(0, 70) });
    }
    ok("no unescaped built-line replacement remains in server.js", suspicious.length === 0, suspicious.slice(0, 6));

    console.log("\ntest-loc-dollar-safety: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 25 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
