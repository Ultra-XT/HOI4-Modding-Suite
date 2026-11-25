// #character-rename-orphans-recruit — renaming a character left every `recruit_character` naming the old
// token, so the country silently got no leader, advisor or general at game start.
//
// The save already renamed the definition and stripped the old localisation key. What it never followed were
// the `recruit_character = <old token>` lines Nova itself had written into history/countries (the recruit
// bridge / set-startup with itemType "character"). Nova owns those lines, so it has to follow its own rename.
//
// Same narrowness as the spirit focus-reward walk, since a token is an ordinary word:
//   - only a `recruit_character = <token>` value
//   - whole-word only, so renaming SLO_joch does NOT touch SLO_joch_jr
//   - never inside a comment
//
// Also fixed here: loadedToken was set on load and never refreshed, so a SECOND rename in one editing session
// still sent the ORIGINAL token as previousToken — the server removed an already-removed block and left the
// INTERMEDIATE character behind as a duplicate. (MIO was built without this defect for the same reason.)
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-charrename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/characters", "history/countries"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="R"\nsupported_version="1.18.*"\n');
const CHARS = path.join(MOD, "common", "characters", "custom_characters.txt");
fs.writeFileSync(CHARS,
  "characters = {\n\tSLO_joch = {\n\t\tname = SLO_joch\n\t\tcorps_commander = {\n\t\t\tskill = 3\n\t\t}\n\t}\n" +
  "\tSLO_joch_jr = {\n\t\tname = SLO_joch_jr\n\t\tcorps_commander = {\n\t\t\tskill = 2\n\t\t}\n\t}\n}\n", "utf8");
const HIST = path.join(MOD, "history", "countries", "ABC - Testland.txt");
fs.writeFileSync(HIST,
  "capital = 1\n\nrecruit_character = SLO_joch\nrecruit_character = SLO_joch_jr\nrecruit_character = someone_else\n" +
  "#recruit_character = SLO_joch\n", "utf8");

const PORT = 40015, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (token, previousToken) => fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, token, previousToken: previousToken || "", previousFile: previousToken ? "custom_characters.txt" : "",
      name: "Jan Joch", file: "custom_characters.txt", roleGeneral: true, generalType: "corps_commander", genSkill: 3,
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const hist = () => fs.readFileSync(HIST, "utf8");
  const chars = () => fs.readFileSync(CHARS, "utf8");
  const tokens = () => (chars().match(/^\t([\p{L}_][\p{L}\p{N}_-]*)\s*=\s*\{/gmu) || []).map((s) => s.trim().replace(/\s*=\s*\{$/, ""));
  try {
    const r = await save("SLO_jan_joch", "SLO_joch");
    ok("the rename succeeds", r.status === 200 && r.body && !r.body.error, r);

    // ── the definition ───────────────────────────────────────────────────────────────────────────
    ok("the new token is defined", /SLO_jan_joch\s*=\s*\{/.test(chars()), chars().slice(0, 200));
    ok("…and the old one is gone", !/(?:^|\n)\s*SLO_joch\s*=\s*\{/.test(chars()), chars().slice(0, 300));
    ok("…while the LOOKALIKE character survives", /SLO_joch_jr\s*=\s*\{/.test(chars()), tokens());
    ok("…so there are still two characters", tokens().length === 2, tokens());

    // ── THE BUG: the recruit line ────────────────────────────────────────────────────────────────
    const h = hist();
    ok("THE RECRUIT LINE FOLLOWS THE RENAME", /^recruit_character = SLO_jan_joch$/m.test(h), h);
    ok("…and no live line still names the old token", !/^recruit_character = SLO_joch$/m.test(h), h);
    ok("the LOOKALIKE recruit is untouched", /^recruit_character = SLO_joch_jr$/m.test(h), h);
    ok("…as is an unrelated one", /^recruit_character = someone_else$/m.test(h), h);
    ok("…and a COMMENTED recruit is left exactly as written", /^#recruit_character = SLO_joch$/m.test(h), h);

    // ── a SECOND rename in the same session ─────────────────────────────────────────────────────
    const r2 = await save("SLO_final_joch", "SLO_jan_joch"); // client re-anchors loadedToken after each save
    ok("a second rename succeeds", r2.status === 200 && r2.body && !r2.body.error, r2);
    ok("…the newest token is defined", /SLO_final_joch\s*=\s*\{/.test(chars()), tokens());
    ok("…NO intermediate character is left behind", !/SLO_jan_joch\s*=\s*\{/.test(chars()), tokens());
    ok("…still exactly two characters", tokens().length === 2, tokens());
    ok("…and the recruit line followed again", /^recruit_character = SLO_final_joch$/m.test(hist()), hist());

    let d = 0; for (const c of chars()) { if (c === "{") d++; else if (c === "}") d--; }
    ok("the characters file is brace-balanced", d === 0, d);

    // ── a plain re-save must change nothing ─────────────────────────────────────────────────────
    const before = hist();
    const r3 = await save("SLO_final_joch", "SLO_final_joch");
    ok("re-saving with the same token succeeds", r3.status === 200 && !r3.body.error, r3);
    ok("…and the history is byte-identical", hist() === before, hist());

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("there is a recruit-rename walk", /function renameCharacterRecruits\(modRoot, oldToken, newToken\)/.test(src), "missing");
    ok("…called only on a token change", /if \(tokenChanged\) \{ try \{ renameCharacterRecruits\(activeRoot, previousToken, token\); \}/.test(src), "not wired to tokenChanged");
    ok("…and it explains why", /#character-rename-orphans-recruit/.test(src), "no marker comment");
    const cli = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
    ok("the client re-anchors loadedToken after a save", /loadedToken = body\.token;/.test(cli), "second rename would duplicate");
    ok("the cache version was bumped",
      // Match the number, not the word — the label changes with the reason for the bump (`portraitfield32`).
      (() => { const m = /characters\.js\?v=[a-z]+(\d+)/i.exec(fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8")); return !!m && Number(m[1]) >= 30; })(), "stale cache version");

    console.log("\ntest-character-rename-recruit: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
