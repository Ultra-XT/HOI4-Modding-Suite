// #idea-name-loc-redirect-ignored — AN IDEA'S `name = <key>` DECIDES WHICH LOCALISATION KEY THE GAME READS,
// AND NOVA READ A DIFFERENT ONE.
//
// Vanilla's britain.txt has `ENG_the_kings_party_idea = { name = ENG_the_kings_party … }` and the text lives
// at `ENG_the_kings_party: "The King's Party"` — there is no `ENG_the_kings_party_idea` key in the game at
// all. Measured: 1,237 vanilla ideas and 2,698 Millennium Dawn ideas redirect their name to a DIFFERENT key,
// usually so several levels of one idea share a display name (AFG_idea_tribal_support_1/_2 →
// AFG_idea_tribal_support).
//
// Reading only `<ideaId>` meant the editor showed an EMPTY name and description for all of them. Typing a new
// name then wrote it under `<ideaId>` — a key the game never reads — so the spirit kept its old name in game
// while the save reported success. The mod also gained a dead key, and the editor's own list showed the raw
// id where the name should be.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-namekey-"));
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

const MOD = path.join(ROOT, "namekey");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NameKey"\nsupported_version="1.19.*"\n', "utf8");

const IDEAS = path.join(MOD, "common", "ideas", "nk_ideas.txt");
fs.writeFileSync(IDEAS, [
  "ideas = {",
  "\tcountry = {",
  "\t\tnk_reform_2 = {",
  // The redirect: the display name lives under a DIFFERENT key, shared with nk_reform_1.
  "\t\t\tname = nk_reform",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { war_support_factor = 0.05 }",
  "\t\t}",
  "\t\tnk_plain = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { political_power_gain = 0.1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
const LOC = path.join(MOD, "localisation", "english", "nk_l_english.yml");
fs.writeFileSync(LOC, "\uFEFFl_english:\n"
  + ' nk_reform:0 "The Great Reform"\n'
  + ' nk_reform_desc:0 "A sweeping change."\n'
  + ' nk_plain:0 "A Plain Spirit"\n'
  + ' nk_plain_desc:0 "Nothing special."\n', "utf8");

const valueOf = (key) => {
  const dir = path.join(MOD, "localisation", "english");
  for (const f of fs.readdirSync(dir)) {
    const m = new RegExp(`^\\s*${key}:\\d*\\s*"([^"]*)"`, "m").exec(fs.readFileSync(path.join(dir, f), "utf8"));
    if (m) return m[1];
  }
  return null;
};

const PORT = 43449;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the redirect is ordinary, and the id-keyed entry does not exist");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const matchBrace = (s, i) => { let d = 0; for (; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
    let redirects = 0, ideas = 0;
    let ideaFiles = [];
    try { ideaFiles = fs.readdirSync(path.join(V, "common", "ideas")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    for (const f of ideaFiles) {
      let t = "";
      try { t = fs.readFileSync(path.join(V, "common", "ideas", f), "utf8"); } catch (_) { continue; }
      t = t.replace(/#[^\n\r]*/g, "");
      const im = /(^|\n)\s*ideas\s*=\s*\{/.exec(t);
      if (!im) continue;
      const s0 = t.indexOf("{", im.index);
      const inner = t.slice(s0 + 1, matchBrace(t, s0));
      const re = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/g;
      let m;
      while ((m = re.exec(inner)) !== null) {
        const s = inner.indexOf("{", m.index);
        const e = matchBrace(inner, s);
        if (e < 0) break;
        const body = inner.slice(s + 1, e);
        re.lastIndex = e;
        const re2 = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/g;
        let m2;
        while ((m2 = re2.exec(body)) !== null) {
          const s2 = body.indexOf("{", m2.index);
          const e2 = matchBrace(body, s2);
          if (e2 < 0) break;
          const ib = body.slice(s2 + 1, e2);
          re2.lastIndex = e2;
          ideas++;
          const nm = /(^|\n)\s*name\s*=\s*([A-Za-z0-9_]+)/.exec(ib);
          if (nm && nm[2] !== m2[2]) redirects++;
        }
      }
    }
    rec("vanilla's ideas were readable", ideas > 3000, ideas);
    rec("…and over a thousand redirect their name to a different key", redirects > 800, { ideas, redirects });
    // …and the id-keyed entry genuinely does not exist for the canonical example.
    let locAll = "";
    try {
      for (const f of fs.readdirSync(path.join(V, "localisation", "english"))) {
        if (/\.yml$/i.test(f)) locAll += fs.readFileSync(path.join(V, "localisation", "english", f), "utf8");
      }
    } catch (_) {}
    rec("ENG_the_kings_party is a real key", /(^|\n)\s*ENG_the_kings_party\s*:/.test(locAll), "not found");
    rec("…while ENG_the_kings_party_idea is NOT", !/(^|\n)\s*ENG_the_kings_party_idea\s*:/.test(locAll),
      "the id-keyed entry exists after all — the premise would be wrong");

    console.log("\n[the bug] the editor must read the key the GAME reads");
    const r = await get(`/api/ideas/edit-payload?modPath=${encodeURIComponent(MOD)}&ideaId=nk_reform_2&definitionFile=common/ideas/nk_ideas.txt&sourceRoot=${encodeURIComponent(MOD)}`);
    rec("the payload came back", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the redirected NAME is shown", (r.b.localizedName || r.b.name) === "The Great Reform",
      { localizedName: r.b.localizedName, name: r.b.name });
    rec("…and the redirected DESCRIPTION", (r.b.localizedDesc || r.b.desc) === "A sweeping change.",
      { localizedDesc: r.b.localizedDesc, desc: r.b.desc });

    console.log("\n[control] an idea WITHOUT a redirect still reads its own key");
    const r2 = await get(`/api/ideas/edit-payload?modPath=${encodeURIComponent(MOD)}&ideaId=nk_plain&definitionFile=common/ideas/nk_ideas.txt&sourceRoot=${encodeURIComponent(MOD)}`);
    rec("the payload came back", r2.s === 200 && !r2.b.error, r2.b || r2.s);
    rec("its own name is shown", (r2.b.localizedName || r2.b.name) === "A Plain Spirit",
      { localizedName: r2.b.localizedName, name: r2.b.name });
    rec("…and its own description", (r2.b.localizedDesc || r2.b.desc) === "Nothing special.",
      { localizedDesc: r2.b.localizedDesc, desc: r2.b.desc });

    console.log("\n[the reader] the key is taken from the block, and comments do not count");
    const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("the helper exists", /function ideaNameKeyFromBlock/.test(SRC), "missing");
    rec("…and masks comments before looking",
      /ideaNameKeyFromBlock[\s\S]{0,300}?replace\(\/#\[\^\\n\\r\]\*\/g, ""\)/.test(SRC), "no comment mask");
    // DERIVED, never typed in. The old form hardcoded "=== 3" and recognised only the INLINE
    // ideaNameKeyFromBlock( spelling, so a caller that resolves the key into a variable first — which is
    // what the import path does now that it honours the redirect (#idea-name-loc-redirect-ignored) — failed
    // a test whose invariant it actually satisfies. Two traps in one line: a typed-in count goes stale the
    // moment the fix adds a compliant caller, and a bare scanLocalizationForIdea\( count also matches the
    // FUNCTION'S OWN DEFINITION LINE, which is why the raw number reads 4 for 3 callers.
    {
      const { stripJsComments } = require("./testlib-strip-comments.js");
      const code = stripJsComments(SRC); // a fix's own prose can contain the string being counted
      const sites = [];
      const callRe = /(function\s+)?scanLocalizationForIdea\(/g;
      let cm;
      while ((cm = callRe.exec(code)) !== null) {
        if (cm[1]) continue; // the definition, not a call
        let i = callRe.lastIndex, depth = 1, args = 1;
        for (; i < code.length && depth > 0; i++) {
          const ch = code[i];
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          else if (ch === "," && depth === 1) args++;
        }
        sites.push(args);
      }
      rec("CONTROL: the call sites were found at all", sites.length >= 3, sites);
      rec("…and every caller passes the name-key override", sites.length > 0 && sites.every((n) => n >= 3), sites);
    }
    rec("…while the parameter is optional, so an unaware caller behaves as before",
      /function scanLocalizationForIdea\(rootPath, ideaId, nameKeyOverride\)/.test(SRC), "signature changed incompatibly");
    rec("…and the description follows the same key",
      /const descKey = `\$\{nameKey\}_desc`;/.test(SRC), "desc still keyed off the id");

    console.log(`\n=== idea name-key redirect: ${checks} checks, ${fails.length} failed ===`);
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
