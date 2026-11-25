// #character-rename — editing a character's token used to CLONE it instead of renaming.
//
// The save wrote the character under whatever token was in the box and left the old block exactly where it
// was. Changing NUA_helena_vex to NUA_helena_vexler produced TWO characters — the original still carrying its
// own country_leader role, and a copy under the new token — plus two localisation keys, one of them now
// naming a character that no longer exists under that id.
//
// For a country leader that is not cosmetic: the mod ends up with two leaders for one country.
//
// The page has its own ⧉ Duplicate button, so editing the id was never the way to copy a character. The save
// now removes the previous block when the client names one, using the same span finder and the same
// localisation strip the DELETE path uses — so a rename cleans up exactly as thoroughly as a delete.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-char-rename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "rename_probe");
const cDir = path.join(MOD, "common", "characters");
fs.mkdirSync(cDir, { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="RenameProbe"\nsupported_version="1.19.*"\n');

const FILE = "ZZ_rename.txt";
const abs = path.join(cDir, FILE);
const read = () => fs.readFileSync(abs, "utf8");
const tokensIn = (t) => [...t.matchAll(/(?:^|\n)\t([A-Za-z_][\w-]*) = \{/g)].map((m) => m[1]);
const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
const locAll = () => fs.readdirSync(path.join(MOD, "localisation", "english"))
  .map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n");

const PORT = 39537, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));
  const save = (token, name, extra) => post("/api/characters/save", Object.assign({
    modPath: MOD, token, name, file: FILE,
    portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
    roleLeader: true, leaderIdeology: "despotism",
  }, extra || {}));

  try {
    // three characters, so a rename has neighbours on both sides to leave alone
    for (const [tok, nm] of [["zz_first", "First Person"], ["zz_middle", "Middle Person"], ["zz_last", "Last Person"]]) {
      await save(tok, nm);
      await breathe();
    }
    ok("three characters were created", tokensIn(read()).length === 3, tokensIn(read()));

    // ── rename the MIDDLE one ─────────────────────────────────────────────────────────────────────
    await breathe();
    const r = await save("zz_renamed", "Middle Person", { previousToken: "zz_middle", previousFile: FILE });
    await breathe();
    ok("renaming → 200", r.s === 200, r.b);
    const after = read();
    const toks = tokensIn(after);
    ok("…there are still exactly THREE characters", toks.length === 3, toks);
    ok("…the old token is gone", !toks.includes("zz_middle"), toks);
    ok("…the new token is there", toks.includes("zz_renamed"), toks);
    ok("…both neighbours survived", toks.includes("zz_first") && toks.includes("zz_last"), toks);
    ok("…the file is still valid", balanced(after), after.slice(0, 200));

    const loc = locAll();
    ok("the old localisation key is gone", !/(^|\n)\s*zz_middle:/.test(loc), loc);
    ok("…the new one names the character", /zz_renamed:\d*\s*"Middle Person"/.test(loc), loc);
    ok("…and the neighbours' keys are untouched", /zz_first:/.test(loc) && /zz_last:/.test(loc), loc);

    // ── an ordinary re-save must NOT remove anything ──────────────────────────────────────────────
    // previousToken is only sent when the token actually changed; sending the SAME token must be a no-op.
    await breathe();
    const same = await save("zz_renamed", "Middle Person", { previousToken: "zz_renamed", previousFile: FILE });
    await breathe();
    ok("re-saving under the same token → 200", same.s === 200, same.b);
    ok("…still three characters", tokensIn(read()).length === 3, tokensIn(read()));
    ok("…the character still exists", tokensIn(read()).includes("zz_renamed"), tokensIn(read()));

    // ── a previousToken that is not on disk must not disturb the file ─────────────────────────────
    await breathe();
    const before = read();
    const ghost = await save("zz_renamed", "Middle Person", { previousToken: "zz_never_existed", previousFile: FILE });
    await breathe();
    ok("a previousToken that never existed → 200", ghost.s === 200, ghost.b);
    ok("…and changed nothing", tokensIn(read()).length === 3 && balanced(read()), tokensIn(read()));
    void before;

    // ── ⧉ DUPLICATE must COPY, never move ─────────────────────────────────────────────────────────
    // The rename cleanup keys on the token the form was LOADED with, and Duplicate changes the token in the
    // box — so if it forgets to clear that memory, saving the copy removes the original. The dialog promises
    // "the original is untouched", and for one commit it was not: the copy replaced it.
    //
    // Server-side, the guarantee is simply that a save with NO previousToken removes nothing; the client-side
    // half (clearing the loaded token) is asserted against the source below.
    await breathe();
    const dup = await save("zz_renamed_copy", "Middle Person (copy)");   // note: no previousToken
    await breathe();
    ok("saving a duplicate → 200", dup.s === 200, dup.b);
    const dupToks = tokensIn(read());
    ok("…the ORIGINAL is still there", dupToks.includes("zz_renamed"), dupToks);
    ok("…and the copy exists beside it", dupToks.includes("zz_renamed_copy"), dupToks);
    ok("…so there are now four characters", dupToks.length === 4, dupToks);
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
      const start = src.indexOf('dupCharBtn.addEventListener("click"');
      const body = start === -1 ? "" : src.slice(start, start + 1800);
      ok("the Duplicate handler forgets the loaded token", /loadedToken\s*=\s*null/.test(body),
        start === -1 ? "duplicate handler not found" : body.slice(0, 200));
    }

    console.log("\ntest-character-rename: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
