// FIXED, and now in the suite. This file spent a while renamed OUT of test-*.js as a deliberately-failing
// reproduction, because the obvious fix made things worse: simply suppressing the non-ASCII key lost the
// author's name EVERYWHERE, not just in game, since Nova's readers are Unicode-aware by design
// (#loc-key-ascii-only records that narrowing one of those once caused real data loss).
//
// What made it fixable was doing what the corpora actually do rather than what seemed tidy: 30 of the 32
// vanilla+Millennium Dawn characters whose token holds a non-ASCII letter carry their name as a QUOTED
// LITERAL in script and no loc key at all (MD ships `name = "John M. \"Jack\" Keane"`). So serializeCharacter
// now branches — a token that can be a loc key still writes `name = <token>`, and one that cannot writes the
// display name inline. The name survives either way, which is the invariant test-loc-key-unicode.js guards;
// its two key-existence assertions were retargeted at "the name survives" in the same change.
//
// ---------------------------------------------------------------------------------------------------
//
// #loc-key-must-be-ascii — a character SCRIPT token may contain a non-ASCII letter, but a localisation KEY
// may not. Nova wrote the key anyway, and HOI4 answered:
//
//   Expected colon(:) at line 22 and column 10 in localisation/english/custom_characters_l_english.yml
//
// The line is unusable, and the parse error lands in the middle of a file shared by every character.
//
// The two rules genuinely differ, which is why this is counted rather than assumed — and why the READERS in
// this module deliberately accept the wider charset (#loc-key-ascii-only records that narrowing them once
// caused real data loss, by making an existing key invisible to the parser that had just written it):
//
//   localisation KEYS containing a non-ASCII character: 0 of 1,329,624 (vanilla), 0 of 1,846,048 (MD)
//   character SCRIPT tokens containing one:            25 (vanilla), 7 (MD)
//   of vanilla's 25 such tokens, loc keys matching:     0  (23 have none; 2 use an accent-folded key)
//
// Millennium Dawn's SLO_jindřich_joch — the token the other comment cites — carries
// `name = "Jindřich Joch"` as a literal in script instead of using a key.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lockey-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "ckmod");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CkMod"\nsupported_version="1.19.*"\n', "utf8");

const LOC = path.join(MOD, "localisation", "english", "custom_characters_l_english.yml");

// Every localisation line HOI4 will accept: ` key:0 "value"` with an ASCII key.
const parsesAsLoc = (text) => {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const bad = [];
  for (const l of lines) {
    if (!l.trim() || /^\s*#/.test(l) || /^\s*l_[a-z_]+:\s*$/.test(l)) continue;
    if (!/^[ \t]*[\x21-\x39\x3b-\x7e]+:\d*[ \t]*"/.test(l)) bad.push(l);
  }
  return bad;
};

const PORT = 42465;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (token, name) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, token, name, file: "custom_characters.txt",
        portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
        roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: token,
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const loc = () => (fs.existsSync(LOC) ? fs.readFileSync(LOC, "utf8") : "");

  try {
    console.log("\n[control] an ASCII token still gets its localisation key");
    // First, so the guard cannot be "never write localisation".
    let r = await save("NUA_konstantin_ryhl", "Konstantin Ryhl");
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the loc key was written", /NUA_konstantin_ryhl:\d*\s*"Konstantin Ryhl"/.test(loc()), loc());

    console.log("\n[non-ASCII token] must NOT write an unparseable key");
    r = await save("NUA_jindřich_joch", "Jindřich Joch");
    rec("the save still succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    // Strip the BOM before looking: U+FEFF is itself non-ASCII, so it makes the `l_english:` header line
    // match a naive "non-ASCII key" pattern and the assertion fails on a perfectly good file.
    rec("NO key containing a non-ASCII character was written",
      !/^[ \t]*[^\s:]*[^\x00-\x7F][^\s:]*:/m.test(loc().replace(/^﻿/, "")), loc());
    rec("…specifically not the ř key", !/jindřich_joch\s*:/.test(loc()), loc());

    console.log("\n[the whole file must still parse]");
    // This is the real damage: one bad key makes HOI4 report a parse error inside a file every character
    // shares, not merely lose one name.
    const bad = parsesAsLoc(loc());
    rec("every line in the file is a valid localisation entry", bad.length === 0, bad.slice(0, 3));
    rec("the ASCII character's name is still intact",
      /NUA_konstantin_ryhl:\d*\s*"Konstantin Ryhl"/.test(loc()), loc());

    console.log("\n[the character itself is still written]");
    // Refusing the KEY must not refuse the CHARACTER — the script block is valid either way.
    const script = fs.readFileSync(path.join(MOD, "common", "characters", "custom_characters.txt"), "utf8");
    rec("the non-ASCII character exists in script", /NUA_jindřich_joch\s*=\s*\{/.test(script), script.slice(0, 400));
    // THE POINT OF THE WHOLE DESIGN. Refusing the key must not cost the author their text — that is what
    // made the first attempt at this fix a regression rather than a fix. The name moves into the script.
    rec("…carrying the display name as a quoted literal instead of a lost key",
      /name\s*=\s*"Jindřich Joch"/.test(script), script.slice(0, 400));
    rec("…and so does the ASCII one", /NUA_konstantin_ryhl\s*=\s*\{/.test(script), script.slice(0, 400));

    console.log("\n[accented VALUES are still fine — only keys are restricted]");
    r = await save("NUA_rene_dubois", "René Dubois");
    rec("an accented display NAME is accepted", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and written with its accent intact", /NUA_rene_dubois:\d*\s*"René Dubois"/.test(loc()), loc());
    rec("the file still parses", parsesAsLoc(loc()).length === 0, parsesAsLoc(loc()).slice(0, 3));

    console.log(`\n=== loc key must be ascii: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
