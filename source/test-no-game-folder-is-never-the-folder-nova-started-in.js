// ⛔ #nova-does-not-find-the-game — WITH NO GAME FOUND, NOTHING IS READ FROM THE FOLDER NOVA HAPPENED TO BE STARTED IN.
//
// When Nova finds no game, every reader of resolveHoi4GameRoot gets NO_GAME_FOLDER: a folder under Nova's app data that never
// exists, so each reads nothing — "never \"\", which path.resolve turns into the current folder". GAME_ROOT, the global beside
// it, is "" then, and the research page's glyph route still used it raw (review D-F4): its last-resort font pair was
// path.join(GAME_ROOT, "gfx", "fonts", <name>), a RELATIVE path, so a <current folder>\gfx\fonts\<name>.fnt and .dds were read
// as the base game's font. Measured by the review with decoy files: the route's answer turned from "Font … wasn't found" into
// a DDS parse error. Here the decoys sit in the folder this process is started in, the game is not found
// (NOVA_TEST_GAME_DETECTION=off), and the route must answer that the font is not there; and GAME_ROOT is read nowhere but where
// it is set and where main.js reads it, derived from the source.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, server.js's app data is a sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

const PORT = 54787;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};

const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-no-game-cwd-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const CWD = path.join(T, "where Nova was started");
// A decoy font pair: read, its .dds is no DDS and the route says so; not read, the route says the font is not there.
write(path.join(CWD, "gfx", "fonts", "nova_decoy_font.fnt"), "info face=\"decoy\" size=10\ncommon lineHeight=10 base=8 scaleW=4 scaleH=4 pages=1\n");
write(path.join(CWD, "gfx", "fonts", "nova_decoy_font.dds"), "this is not a DDS file");
const MOD = path.join(T, "mods", "blank");
write(path.join(MOD, "descriptor.mod"), 'version="1.0"\nname="Blank"\nsupported_version="1.19.*"\n');
const startedIn = process.cwd();
process.chdir(CWD);
delete process.env.HOI4_ROOT;
process.env.NOVA_TEST_GAME_DETECTION = "off";
const S = require("./server.js");

let server = null;
(async () => {
  try {
    const app = S.createApp();
    server = await new Promise((res, rej) => { const s = app.listen(PORT, "127.0.0.1", () => res(s)); s.once("error", rej); });
    const glyph = async (q) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/research/glyph-text?text=1936&font=nova_decoy_font${q || ""}`);
      const type = r.headers.get("content-type") || "";
      return { status: r.status, error: /json/.test(type) ? String((await r.json()).error || "") : `(${type})` };
    };

    console.log("\n1. (no game found, and Nova started in a folder holding gfx\\fonts\\nova_decoy_font.fnt and .dds)");
    ok(S.hoi4GameFolderFound() === false && S.resolveHoi4GameRoot() === S.NO_GAME_FOLDER && S.constants.GAME_ROOT === "",
      "no game: every reader gets NO_GAME_FOLDER, and GAME_ROOT is \"\"", [S.resolveHoi4GameRoot(), S.constants.GAME_ROOT]);
    ok(path.resolve(process.cwd()).toLowerCase() === path.resolve(CWD).toLowerCase(), "…and the current folder is the one with the decoys", process.cwd());

    console.log("\n2. ⭐⭐⭐ the research page's glyph route (research.js asks it for a textbox's font) reads no font from it");
    const bare = await glyph("");
    if (bare.status === 501) console.log("  SKIPPED sharp is unavailable here, so the route answers before it looks for a font");
    else {
      ok(bare.status === 400 && /Font "nova_decoy_font" wasn't found/.test(bare.error),
        "⭐⭐⭐ with no mod named: the font is not there — the current folder's decoy is not the base game's font", bare);
      const withMod = await glyph(`&modPath=${encodeURIComponent(MOD)}`);
      ok(withMod.status === 400 && /Font "nova_decoy_font" wasn't found/.test(withMod.error), "⭐⭐ …and with the page's mod named, the same", withMod);
      // CONTROL: the decoys are readable — a route that DOES look in that folder (it is named as the mod) reads them and fails on
      // the .dds, which is what the answer above would be had Nova looked there. Without it the check above could not bite.
      const control = await glyph(`&modPath=${encodeURIComponent(CWD)}`);
      ok(control.status === 400 && !/wasn't found/.test(control.error) && control.error.length > 0,
        "CONTROL: named as the mod, that folder's decoy IS read (and its .dds refused), so \"not found\" above means not read", control);
    }

    console.log("\n3. ⭐⭐ GAME_ROOT is read nowhere but where it is set and where main.js reads it (derived from the source)");
    const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r/g, "");
    const code = maskJsLiterals(raw);
    const note = /function\s+noteGameRootServed\s*\(/.exec(code);
    const noteSpan = note ? jsBodyAt(code, note.index) : null;
    const uses = [...code.matchAll(/(?<![.\w$])GAME_ROOT(?![\w$])/g)].map((m) => m.index);
    const lineOf = (i) => code.slice(0, i).split("\n").length;
    const stray = uses.filter((i) => {
      if (noteSpan && i > noteSpan[0] && i < noteSpan[1]) return false;                    // where it is set, from the answer
      if (/^let\s+$/.test(code.slice(Math.max(0, i - 4), i))) return false;              // its declaration
      const around = code.slice(Math.max(0, i - 40), i + 40);
      if (/get\s+GAME_ROOT\s*\(\s*\)\s*\{\s*return\s+GAME_ROOT\s*;\s*\}/.test(around)) return false;   // constants.GAME_ROOT (main.js)
      return true;
    }).map((i) => `server.js:${lineOf(i)}: ${raw.split("\n")[lineOf(i) - 1].trim().slice(0, 120)}`);
    ok(!!noteSpan && uses.length >= 4, "precondition: noteGameRootServed and GAME_ROOT's uses are found", { noteSpan, uses: uses.length });
    ok(stray.length === 0, "⭐⭐ no reader of GAME_ROOT: \"\" with no game, so any path built from it is relative — ask resolveHoi4GameRoot", stray);
  } catch (e) {
    fail++;
    console.log("  FAIL threw: " + (e && e.stack || e));
  } finally {
    try { if (server) server.close(); } catch (_) {}
    try { process.chdir(startedIn); } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
    try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
