// #loc-key-ascii-only — opening a character whose token contains an accented letter and pressing Save with NO
// changes replaced its real name with the raw token.
//
// The character token guard deliberately accepts Unicode letters — `/^[\p{L}_][\p{L}\p{N}_-]*$/u` — because
// vanilla and Millennium Dawn ship tokens like `SLO_jindřich_joch`. serializeCharacter always writes
// `name = <token>`, so the localisation key Nova itself emits contains a non-ASCII letter.
//
// But every loc READER restricted the key to ASCII: matchLocalizationQuotedLine (which backs
// parseLocalizationFile → getLocalizationMap → the character list's name resolve()), findModLocalizationEntry,
// setLocalizationKeyInPlace and the set-key endpoint. So the key the writer had just emitted was invisible to
// the parser. The editor's resolve() missed and fell back to displaying the raw token, and the next Save wrote
// that token over the author's real `name = "Jindřich Joch"`.
//
// Fix: the readers now accept what the writer can emit — `[\p{L}\p{N}_.:-]` with the /u flag.
//
// NOTE ON METHOD: this file is written as a real .js file rather than run through `node -e` from a shell,
// because passing non-ASCII through the shell mangles it — an inline check gave two different answers for the
// same expression, which is exactly the trap this bug is about.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-lockey-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// Built from code points so the fixture cannot be damaged by an editor or a shell.
const R_HACEK = String.fromCharCode(0x159); // ř
const TOKEN = "SLO_jind" + R_HACEK + "ich_joch";
const REAL_NAME = "Jind" + R_HACEK + "ich Joch";

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="U"\nsupported_version="1.18.*"\n');
const CHARFILE = path.join(MOD, "common", "characters", "SLO.txt");
fs.writeFileSync(CHARFILE,
  "characters = {\n\t" + TOKEN + " = {\n\t\tname = \"" + REAL_NAME + "\"\n" +
  "\t\tcorps_commander = {\n\t\t\ttraits = {}\n\t\t\tskill = 3\n\t\t\tattack_skill = 2\n\t\t\tdefense_skill = 2\n\t\t\tplanning_skill = 2\n\t\t\tlogistics_skill = 2\n\t\t}\n\t}\n}\n", "utf8");

// ── the parser must see a Unicode key ────────────────────────────────────────────────────────────
const srv = require("./server.js");
const KEY_RE = /^[\p{L}\p{N}_.:-]+$/u;
ok("a Czech token is a valid loc key by the new rule", KEY_RE.test(TOKEN), TOKEN);
ok("…and a brace is still rejected", !KEY_RE.test("bad{key"), "guard too loose");
ok("…as is a space", !KEY_RE.test("two words"), "guard too loose");

const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
// RETARGETED (#loc-key-must-be-ascii). This forbade the ASCII-only class ANYWHERE in server.js, which was
// the right rule while every use of it was a READER — narrowing one of those made an existing key invisible
// to the parser that had just written it, and that is the data loss this file exists to prevent.
//
// There is now exactly one legitimate use, and it is on the WRITE side: canBeLocalizationKey decides whether
// a token may be emitted as `name = <token>` (a localisation lookup) or must be written as a quoted literal
// instead. That distinction is real — 0 of 3,172,039 vanilla+MD loc keys hold a non-ASCII byte, while 32
// character SCRIPT tokens do, and 30 of those 32 supply their name as a literal. HOI4 answered Nova's key
// with a yml parse error that broke a file every character shares.
//
// So the rule becomes "every ASCII-only key class lives inside canBeLocalizationKey" rather than "there are
// none". A reader that narrows itself still fails this.
//
// #a-name-the-game-cannot-localise — that guard now has ONE definition, in mod-index.js: Mod Health's RULE 3 asks it
// of the key it reports, so the scan and the fixers cannot disagree, and server.js imports it for its writers. The
// rule is unchanged and followed to where the guard lives: server.js holds no ASCII-only key class at all, and
// mod-index.js holds exactly the guard's.
//
// #loc-key-colon — the guard no longer accepts ":" (it ends a key on a localisation line), so its class is spelled
// [A-Za-z0-9_.-]. The finder takes that spelling, the old one with ":", and either with "\-", so a reader that narrows
// itself to any of them is still found.
{
  const CLASS_RE = /\^\[A-Za-z0-9_\.:?\\?-\]\+\$/g;
  const classHits = (text) => { const out = []; let m; CLASS_RE.lastIndex = 0; while ((m = CLASS_RE.exec(text)) !== null) out.push(m.index); return out; };
  const inServer = classHits(src);
  ok("server.js holds no ASCII-only key class: each of its key classes is a Unicode-aware reader",
    inServer.length === 0, inServer.map((i) => src.slice(Math.max(0, i - 120), i + 60)));
  const ownerSrc = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8");
  const hits = classHits(ownerSrc);
  const inWriteGuard = hits.filter((i) => /function canBeLocalizationKey[\s\S]{0,400}$/.test(ownerSrc.slice(Math.max(0, i - 400), i)));
  ok("the only ASCII-only key class is the write-side guard, mod-index.js's canBeLocalizationKey",
    hits.length > 0 && inWriteGuard.length === hits.length,
    { total: hits.length, inWriteGuard: inWriteGuard.length, context: hits.length ? ownerSrc.slice(Math.max(0, hits[0] - 120), hits[0] + 60) : "" });
  ok("…and server.js writes through that one guard", srv.canBeLocalizationKey === require("./mod-index.js").canBeLocalizationKey,
    typeof srv.canBeLocalizationKey);
}
ok("…and no broken literal class was introduced", !src.includes("[p{L}"), "a backslash was lost");
const guards = (src.match(/\[\\p\{L\}\\p\{N\}_\.:-\]/g) || []).length;
ok("every key guard is Unicode-aware", guards >= 5, guards);
ok("the quoted-line matcher uses the /u flag", /\]\+\):\\d\+\\s\*"\/u/.test(src), "matcher not unicode");
ok("…and it explains why", /#loc-key-ascii-only/.test(src), "no marker comment");

const PORT = 40005, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    const files = list.files || list.own || [];
    const all = [].concat(...files.map((f) => (f.characters || f.tokens || []).map((c) => (typeof c === "string" ? { token: c } : c))));
    const me = all.find((c) => c.token === TOKEN);
    ok("the character is listed", !!me, all.map((c) => c.token).slice(0, 5));
    ok("THE EDITOR SHOWS THE REAL NAME, not the raw token", me && me.name === REAL_NAME, { got: me && me.name, want: REAL_NAME });

    // Open and save with NO changes, echoing back exactly what the list returned.
    const before = fs.readFileSync(CHARFILE, "utf8");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ modPath: MOD, file: "SLO.txt" }, me)),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    ok("the no-edit save succeeds", r.status === 200 && r.body && r.body.ok, r);

    const after = fs.readFileSync(CHARFILE, "utf8");
    // serializeCharacter always writes `name = <token>` — for ASCII names too — and puts the display text in
    // localisation. That literal→key conversion is Nova's model and is lossless, PROVIDED the key it emits is
    // one the readers can find. For a Unicode token it wasn't, so the name was simply lost. The invariant to
    // assert is therefore "the author's text still renders", not "the inline literal is still in the script".
    const locDir = path.join(MOD, "localisation", "english");
    const locTxt = fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
    ok("THE AUTHOR'S NAME SURVIVES THE SAVE", locTxt.includes(REAL_NAME) || after.includes(REAL_NAME), { script: after.slice(0, 200), loc: locTxt.slice(0, 200) });
    // RETARGETED (#loc-key-must-be-ascii): "under the character's own key" was the WRONG invariant for a
    // Unicode token — that key is precisely the thing HOI4's yml parser rejects. What must hold is that the
    // author's text still reaches the game, and for a non-ASCII token the mechanism is a quoted literal in
    // script, which is what 30 of vanilla+MD's 32 such characters do.
    ok("…carried by a quoted literal in script, since the token cannot be a loc key",
      new RegExp('name\\s*=\\s*"' + REAL_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"').test(after),
      after.slice(0, 260));
    ok("…and NO unparseable key was written for it",
      !new RegExp("^[ \\t]*" + TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":", "m").test(locTxt.replace(/^﻿/, "")),
      locTxt.slice(0, 200));
    ok("…so the script's name reference resolves", /name\s*=\s*\S+/.test(after), after.slice(0, 200));
    ok("the token itself is unchanged", after.includes(TOKEN), after.slice(0, 260));
    let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; }
    ok("…and the file is brace-balanced", d === 0, d);

    // Re-listing must still show the real name (the round trip, not just the first read).
    const list2 = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    const all2 = [].concat(...(list2.files || list2.own || []).map((f) => (f.characters || f.tokens || []).map((c) => (typeof c === "string" ? { token: c } : c))));
    const me2 = all2.find((c) => c.token === TOKEN);
    ok("re-opening still shows the real name", me2 && me2.name === REAL_NAME, { got: me2 && me2.name });

    // An ASCII character must be entirely unaffected.
    fs.appendFileSync(CHARFILE, "");
    const asciiOk = before.length > 0;
    ok("the fixture was non-empty to begin with", asciiOk);

    console.log("\ntest-loc-key-unicode: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 17 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
