// #delete-unwires-what-it-did-not-delete — Delete Character on a BASE-MOD character deleted nothing, reported
// success, and silently stripped that character out of the user's OWN country history.
//
// /api/characters/delete builds `abs = activeRoot/common/characters/<file>` from the file name the client
// sends. For a base-mod (dependency) character that path does not exist under the active mod, so the entire
// delete body was skipped by `if (fs.existsSync(abs))` — correctly, a dependency is read-only. But
// unwireStartupItemEverywhere(activeRoot, token, "character") sat OUTSIDE that guard and ran anyway, against
// the user's own mod, removing every `recruit_character = <token>` line they had written in
// history/countries. The handler then returned ok:true.
//
// The page's own message made it worse: "Deleted <token>. A backup of the original file was saved
// automatically — recoverable if needed." No backup existed, because no character file was ever written. The
// country silently lost that leader/advisor/general at game start, from a button that claimed to have done
// something else entirely, and the sidebar still listed the character (nothing was deleted).
//
// Removing a base-mod character from your own history is a legitimate thing to want — but it is a DIFFERENT
// action from Delete, and it must not happen under this label.
//
// Two-sided fix: the server now refuses when no definition was actually removed (so the unwire cannot run),
// and the client no longer offers Delete on a base-mod character at all.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-chardel-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const BASE = path.join(ROOT, "basemod"), MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(BASE, "common", "characters"), { recursive: true });
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="BaseMod"\nsupported_version="1.18.*"\n');
const BASEFILE = path.join(BASE, "common", "characters", "BASE_people.txt");
fs.writeFileSync(BASEFILE, "characters = {\n\tbase_guy = {\n\t\tname = base_guy\n\t\tcountry_leader = { ideology = despotism }\n\t}\n}\n", "utf8");

fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="probe"\nsupported_version="1.18.*"\ndependencies={\n\t"BaseMod"\n}\n');
const OWNFILE = path.join(MOD, "common", "characters", "custom_characters.txt");
fs.writeFileSync(OWNFILE, "characters = {\n\tmy_own_guy = {\n\t\tname = my_own_guy\n\t\tcountry_leader = { ideology = despotism }\n\t}\n}\n", "utf8");
const HIST = path.join(MOD, "history", "countries", "ABC - Testland.txt");
const HIST_BYTES = "capital = 1\n\nrecruit_character = base_guy\nrecruit_character = my_own_guy\n\nset_politics = {\n\truling_party = neutrality\n}\n";
fs.writeFileSync(HIST, HIST_BYTES, "utf8");

const PORT = 39991, app = createApp();
const server = app.listen(PORT, async () => {
  const del = (token, file) => fetch(`http://127.0.0.1:${PORT}/api/characters/delete`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, token, file }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    // ── deleting a base-mod character ────────────────────────────────────────────────────────────
    const baseBefore = fs.readFileSync(BASEFILE, "utf8");
    const r = await del("base_guy", "BASE_people.txt");
    ok("deleting a base-mod character is REFUSED", r.status >= 400 && r.body && r.body.error, r);
    ok("…the message says there is nothing to delete", /nothing to delete/i.test(r.body.error || ""), r.body.error);
    ok("…names the character", (r.body.error || "").includes("base_guy"), r.body.error);
    ok("…explains that a dependency is read-only", /read-only/i.test(r.body.error || ""), r.body.error);
    ok("…and states plainly that nothing was changed", /Nothing in your mod was modified/i.test(r.body.error || ""), r.body.error);

    ok("the base mod's file is untouched", fs.readFileSync(BASEFILE, "utf8") === baseBefore, "base mod modified");
    ok("…and still defines the character", /base_guy\s*=\s*\{/.test(fs.readFileSync(BASEFILE, "utf8")), "definition gone");

    // THE BUG: the user's own history must be byte-identical
    ok("THE USER'S OWN HISTORY IS BYTE-IDENTICAL", fs.readFileSync(HIST, "utf8") === HIST_BYTES, fs.readFileSync(HIST, "utf8"));
    ok("…their recruit_character line survives", /recruit_character\s*=\s*base_guy/.test(fs.readFileSync(HIST, "utf8")), "recruit line stripped");
    ok("…and so does the unrelated one", /recruit_character\s*=\s*my_own_guy/.test(fs.readFileSync(HIST, "utf8")), "collateral damage");

    // ── a character that does not exist at all ───────────────────────────────────────────────────
    const r2 = await del("no_such_guy", "custom_characters.txt");
    ok("deleting a token that is in no file is refused too", r2.status >= 400 && r2.body.error, r2);
    ok("…and the history is still intact", fs.readFileSync(HIST, "utf8") === HIST_BYTES, "history touched");

    // ── the real delete must still work, unwire included ─────────────────────────────────────────
    const r3 = await del("my_own_guy", "custom_characters.txt");
    ok("deleting the mod's OWN character still succeeds", r3.status === 200 && r3.body.ok, r3);
    const own = fs.existsSync(OWNFILE) ? fs.readFileSync(OWNFILE, "utf8") : "";
    ok("…the definition is gone", !/my_own_guy\s*=\s*\{/.test(own), own);
    const hist = fs.readFileSync(HIST, "utf8");
    ok("…and the unwire DID run for it", !/recruit_character\s*=\s*my_own_guy/.test(hist), hist);
    ok("…while the base-mod character's line is still there", /recruit_character\s*=\s*base_guy/.test(hist), hist);

    // ── the source contract ──────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const h = src.slice(src.indexOf('app.post("/api/characters/delete"'), src.indexOf('app.post("/api/mod/create"'));
    ok("the handler tracks whether a definition was really removed", /let removedDefinition = false;/.test(h), h.slice(0, 400));
    ok("…sets it only after the write", /safeModWrite\(abs, txt, "character-delete"\);\s*[\r\n]+\s*removedDefinition = true;/.test(h), "flag not tied to the write");
    ok("…and the unwire is gated behind it", h.indexOf("if (!removedDefinition)") < h.indexOf('unwireStartupItemEverywhere(activeRoot, token, "character")'), "unwire still ungated");
    ok("…and it explains why", /#delete-unwires-what-it-did-not-delete/.test(h), "no marker comment");

    // the client must not offer the button at all
    const cli = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
    const at = cli.indexOf("Loaded base-mod character");
    const block = cli.slice(Math.max(0, at - 1400), at);
    ok("the base-mod card hides the Delete button", /\$\("deleteCharBtn"\)\.classList\.add\("is-hidden"\)/.test(block), block.slice(-500));
    ok("…and says why", /#delete-unwires-what-it-did-not-delete/.test(cli), "no marker comment in client");
    ok("loadChar still un-hides it for the mod's own characters", /\$\("deleteCharBtn"\)\.classList\.remove\("is-hidden"\)/.test(cli), "own characters lost their Delete");
    ok("the client cache version was bumped",
      // A cache version is bumped by ANY later change to the same file, so pinning an exact value makes every
      // future bump a false failure — which is what happened when the advisor-slot fix moved this to
      // advtok29. Assert it is at least the version this fix shipped at.
      // …and for the same reason the WORD must not be pinned either — it is renamed with the reason for the
      // bump (`advtok` → `portraitfield`). Only the number means anything here.
      (() => { const m = /characters\.js\?v=[a-z]+(\d+)/i.exec(fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8")); return !!m && Number(m[1]) >= 28; })(), "stale cache version");

    console.log("\ntest-character-delete-basemod: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 22 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
