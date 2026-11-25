// #advisor-idea-token-follows — an advisor's idea_token did not follow its character.
//
// An advisor is registered in game by `idea_token`, which defaults to the character's own token. Nothing
// updated it when the token changed, so:
//
//   • Duplicating an advisor gave the copy the ORIGINAL's idea_token. Two advisors under one idea id collide
//     — one silently replaces the other in game, and Nova's own Mod Health reports it as a duplicate idea
//     defined twice in the same file. That is how this bug was found: the app caught it in a mod built
//     entirely through the app.
//   • Renaming an advisor moved the block and its localisation but left the advisor registered under the old
//     id, so the renamed character's advisor answered to a name nothing else in the mod uses.
//
// The token now follows the character — but ONLY when it was the default. A deliberately custom idea_token is
// the modder's own id and is left exactly as they wrote it, which is the half a blunt "always overwrite" fix
// would have broken.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-advisor-token-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "advisor_token_probe");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AdvisorTokenProbe"\nsupported_version="1.19.*"\n');

const FILE = "ZZ_advisors.txt";
const abs = path.join(MOD, "common", "characters", FILE);
const read = () => { try { return fs.readFileSync(abs, "utf8"); } catch (_) { return ""; } };
const tokensIn = (t) => [...t.matchAll(/(?:^|\n)\t([A-Za-z_][\w-]*) = \{/g)].map((m) => m[1]);
const ideaTokens = (t) => [...t.matchAll(/idea_token\s*=\s*([\w-]+)/g)].map((m) => m[1]);
const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39587, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 165));
  const save = (token, name, extra) => post("/api/characters/save", Object.assign({
    modPath: MOD, token, name, file: FILE,
    portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
    roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: token,
  }, extra || {}));

  try {
    await save("zz_first_advisor", "First Advisor"); await breathe();
    await save("zz_other_advisor", "Other Advisor"); await breathe();
    ok("two advisors were created", tokensIn(read()).length === 2, tokensIn(read()));
    ok("…each registered under its own idea token",
      new Set(ideaTokens(read())).size === 2, ideaTokens(read()));

    // ── DUPLICATE: the copy must not inherit the original's idea_token ────────────────────────────
    // The client is what rewrites the box, so the source is asserted; the server half is that it writes
    // whatever it is given, verified by sending the corrected value here.
    await breathe();
    const dup = await save("zz_first_advisor_copy", "First Advisor (copy)", { advisorIdeaToken: "zz_first_advisor_copy" });
    await breathe();
    ok("saving the copy → 200", dup.s === 200, dup.b);
    const afterDup = read();
    ok("…the original is still there", tokensIn(afterDup).includes("zz_first_advisor"), tokensIn(afterDup));
    ok("…and the copy beside it", tokensIn(afterDup).includes("zz_first_advisor_copy"), tokensIn(afterDup));
    ok("…every idea token is still unique", new Set(ideaTokens(afterDup)).size === ideaTokens(afterDup).length, ideaTokens(afterDup));
    ok("…the copy's advisor answers to its own id", /zz_first_advisor_copy[\s\S]*?idea_token = zz_first_advisor_copy/.test(afterDup), ideaTokens(afterDup));
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
      const i = src.indexOf('dupCharBtn.addEventListener("click"');
      const body = i === -1 ? "" : src.slice(i, i + 2200);
      ok("the Duplicate handler moves the idea token to the copy",
        /advisorIdeaToken/.test(body) && /=\s*copyId/.test(body),
        body ? body.slice(0, 200) : "duplicate handler not found");
    }

    // ── RENAME: the idea token follows the character ──────────────────────────────────────────────
    // The client sends the token it LOADED with, which is the old one — exactly the payload that used to
    // leave the advisor registered under a dead id.
    await breathe();
    const ren = await save("zz_other_renamed", "Other Advisor", {
      previousToken: "zz_other_advisor", previousFile: FILE, advisorIdeaToken: "zz_other_advisor",
    });
    await breathe();
    ok("renaming → 200", ren.s === 200, ren.b);
    const afterRen = read();
    ok("…the old token is gone", !tokensIn(afterRen).includes("zz_other_advisor"), tokensIn(afterRen));
    ok("…the advisor is registered under the NEW id",
      /zz_other_renamed[\s\S]*?idea_token = zz_other_renamed/.test(afterRen), ideaTokens(afterRen));
    ok("…and nothing still names the old one", !ideaTokens(afterRen).includes("zz_other_advisor"), ideaTokens(afterRen));
    ok("…the file is still valid", balanced(afterRen), afterRen.slice(0, 200));

    // ── a CUSTOM idea token is the modder's own id and must be left alone ─────────────────────────
    // This is the half a blunt "always set idea_token = token" fix would have destroyed. HOI4 lets an advisor
    // register under any id, and mods use that (one idea shared by a slot, ids suffixed _advisor, …).
    await breathe();
    await save("zz_custom_holder", "Custom Holder", { advisorIdeaToken: "zz_shared_advisor_idea" });
    await breathe();
    const custom = await save("zz_custom_renamed", "Custom Holder", {
      previousToken: "zz_custom_holder", previousFile: FILE, advisorIdeaToken: "zz_shared_advisor_idea",
    });
    await breathe();
    ok("renaming a character with a CUSTOM idea token → 200", custom.s === 200, custom.b);
    ok("…the custom token was left exactly as written",
      ideaTokens(read()).includes("zz_shared_advisor_idea"), ideaTokens(read()));
    ok("…and was NOT rewritten to the new character token",
      !ideaTokens(read()).includes("zz_custom_renamed"), ideaTokens(read()));

    // ── an ordinary re-save changes nothing ───────────────────────────────────────────────────────
    await breathe();
    const before = read();
    await save("zz_first_advisor", "First Advisor", { previousToken: "zz_first_advisor", previousFile: FILE });
    await breathe();
    ok("re-saving under the same token keeps every idea token",
      JSON.stringify(ideaTokens(read()).sort()) === JSON.stringify(ideaTokens(before).sort()), ideaTokens(read()));
    ok("…and the file is still valid", balanced(read()), read().slice(0, 200));

    console.log("\ntest-advisor-idea-token: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
