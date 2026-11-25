// #nonlatin-mod-name-slug — a mod name written entirely in a non-Latin script could only ever be created ONCE.
//
// slugifyModName lowercases and applies .replace(/[^a-z0-9]+/g, "_"), which erases every character of a name
// written in Chinese, Japanese, Korean, Cyrillic, Greek, Arabic or Hebrew. The trim then empties the string
// and the `|| "new_mod"` fallback made EVERY such name collapse to the same literal slug.
//
// /api/mod/create builds both the mod folder and the launcher .mod path from that slug, then hard-fails if
// either exists. So the first such mod was created — in a folder called "new_mod", which is not what the user
// typed — and the second was refused with "Mod already exists for slug 'new_mod'. Choose another mod name.",
// advice that cannot be followed: every other name in their own script produces that same slug. A name with
// even one Latin character was fine ("Révolution" → r_volution), which is why this never surfaced in English
// testing.
//
// Mod FOLDER names stay ASCII deliberately — HOI4's launcher and the descriptor's `path=` are not reliably
// unicode-safe, and descriptor.mod already carries the real name for display. The fix derives a stable
// per-name suffix when the ASCII slug is empty: same name → same folder, different names → different folders.
//
// public/home.js mirrors the function so the folder shown in the New Mod modal is the folder created; this
// test runs BOTH real sources and compares them, because a drifted mirror silently lies to the user.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-slug-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// ── the two implementations must agree, run from the real sources ────────────────────────────────
const srvSrc = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const cliSrc = fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");
const cut = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));
const serverSlug = new Function(cut(srvSrc, "function modNameHashSuffix", "function escapeDescriptorString") + "\nreturn slugifyModName;")();
const clientSlug = new Function(cut(cliSrc, "  function modNameHashSuffix", "  function initNewMod") + "\nreturn slugPreview;")();

const NONLATIN = ["新时代", "Новая Эпоха", "レッドサン", "Ελλάδα", "العربية", "עברית", "한국", "中国", "日本"];
const LATIN = ["Révolution", 'My "Quoted" Mod', "Cold War 1962", "  Spaced  Out  "];

ok("server and client slug functions were both found", typeof serverSlug === "function" && typeof clientSlug === "function");
[...NONLATIN, ...LATIN, "", "   "].forEach((n) => {
  ok("server and client agree on " + JSON.stringify(n), serverSlug(n) === clientSlug(n), { server: serverSlug(n), client: clientSlug(n) });
});

// ── distinct names must produce distinct folders ─────────────────────────────────────────────────
const slugs = NONLATIN.map(serverSlug);
ok("every non-Latin name gets its own slug", new Set(slugs).size === NONLATIN.length, slugs);
ok("…and none of them is the old shared fallback", !slugs.includes("new_mod"), slugs);
ok("…all of them are filesystem-safe ASCII", slugs.every((s) => /^[a-z0-9_]+$/.test(s)), slugs);
ok("the same name still maps to the same folder (stable, not random)", serverSlug("新时代") === serverSlug("新时代"), serverSlug("新时代"));

// ── the cases that already worked must not change ────────────────────────────────────────────────
ok('"Révolution" is unchanged', serverSlug("Révolution") === "r_volution", serverSlug("Révolution"));
ok('a quoted name is unchanged', serverSlug('My "Quoted" Mod') === "my_quoted_mod", serverSlug('My "Quoted" Mod'));
ok("a plain name is unchanged", serverSlug("Cold War 1962") === "cold_war_1962", serverSlug("Cold War 1962"));
ok("an empty name still falls back to new_mod", serverSlug("") === "new_mod", serverSlug(""));
ok("…and so does whitespace", serverSlug("   ") === "new_mod", serverSlug("   "));

// ── end to end through the real endpoint ─────────────────────────────────────────────────────────
const PORT = 39989, app = createApp();
const server = app.listen(PORT, async () => {
  const create = (modName) => fetch(`http://127.0.0.1:${PORT}/api/mod/create`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modName }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    const results = [];
    for (const n of NONLATIN.slice(0, 4)) results.push([n, await create(n)]);
    ok("EVERY non-Latin mod name can be created (only the first could before)",
      results.every(([, r]) => r.body && r.body.ok), results.map(([n, r]) => [n, r.status, r.body && (r.body.error || r.body.slug)]));

    const folders = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    ok("…each in its own folder", folders.length === 4, folders);
    ok("…and none called new_mod", !folders.includes("new_mod"), folders);

    // descriptor.mod must still carry the REAL name — the folder is ASCII, the display name is not
    const first = results[0][1].body.slug;
    const desc = fs.readFileSync(path.join(ROOT, first, "descriptor.mod"), "utf8");
    ok("descriptor.mod carries the name the user actually typed", desc.includes('name="新时代"'), desc.slice(0, 200));
    ok("…and its path= points at the ASCII folder", desc.includes(`path="mod/${first}"`), desc.slice(0, 200));
    ok("a launcher .mod was written for it", fs.existsSync(path.join(ROOT, `${first}.mod`)), fs.readdirSync(ROOT));

    // the duplicate guard must still work — and now say something followable
    const dup = await create("新时代");
    ok("creating the SAME name twice is still refused", dup.body && !dup.body.ok && !!dup.body.error, dup);
    ok("…and the message names the folder rather than a mystery slug", /already exists in the folder/.test(dup.body.error || ""), dup.body.error);
    ok("…and no longer gives advice that cannot be followed", !/Choose another mod name\.$/.test(dup.body.error || ""), dup.body.error);

    // a Latin name still works alongside them
    const lat = await create("Cold War 1962");
    ok("a Latin-named mod still creates normally", lat.body && lat.body.ok && lat.body.slug === "cold_war_1962", lat.body);

    console.log("\ntest-mod-name-nonlatin-slug: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 28 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
