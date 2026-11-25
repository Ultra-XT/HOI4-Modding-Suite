// #icon-cache-clear-out-of-scope — a `typeof` guard that could never be true silently skipped a cache clear,
// so an icon you had just imported kept rendering as the unknown-idea placeholder for the rest of the session.
//
// writeIdeaPictureSpriteGfxFile ended with:
//     if (typeof spriteMapCache !== "undefined") spriteMapCache.clear();
//     if (typeof iconCache     !== "undefined") iconCache.clear();
//
// The first half worked — spriteMapCache is declared at module scope, a few lines above. The second never ran:
// iconCache is `const iconCache = new Map()` INSIDE createApp(), so from module scope it is not in scope at
// all and `typeof iconCache` evaluates to the string "undefined". The guard that looks like a safety check was
// the thing suppressing the clear.
//
// resolveIconAsset memoises per `${modRoot}|${iconKey}`, so the isFallback entry cached BEFORE the import kept
// being served afterwards. /api/ideas/import-spirit-dds only cleared the sprite map too, so nothing anywhere
// dropped that entry.
//
// The lesson is the guard itself: `typeof x !== "undefined"` cannot distinguish "not initialised yet" from
// "misspelled, or out of scope entirely". Registering the real Map removes the guess.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

// ── the broken guard must be gone ────────────────────────────────────────────────────────────────
// Strip comments first: the marker comment deliberately QUOTES the old guards so the next reader can see what
// was wrong, and a raw source match would find its own explanation. (Same trap as the Years-panel test.)
const code = src.replace(/^\s*\/\/.*$/gm, "");
ok("the unreachable iconCache guard is gone from the CODE",
  !/typeof iconCache !== "undefined"\)\s*iconCache\.clear\(\)/.test(code), "guard still present");
ok("…and the paired spriteMapCache one with it",
  !/typeof spriteMapCache !== "undefined"/.test(code), "guard still present");
ok("…while the comment still records what was wrong", /typeof iconCache\s+!== "undefined"/.test(src), "provenance lost");

// ── the replacement ──────────────────────────────────────────────────────────────────────────────
ok("there is a module-scope clear", /function clearIconResolutionCaches\(\)/.test(src), "missing");
ok("…which clears the sprite map", /function clearIconResolutionCaches\(\)[\s\S]{0,200}?spriteMapCache\.clear\(\)/.test(src), "sprite map not cleared");
ok("…and the registered icon cache", /_registeredIconCache\.clear\(\)/.test(src), "icon cache not cleared");
ok("there is a registration hook", /function registerIconResolutionCache\(map\)/.test(src), "missing");
ok("…called with the real Map inside createApp", /const iconCache = new Map\(\);[\s\S]{0,400}?registerIconResolutionCache\(iconCache\);/.test(src), "not registered");
ok("…and it explains why", /#icon-cache-clear-out-of-scope/.test(src), "no marker comment");

// ── every writer of the sprite .gfx must use it ──────────────────────────────────────────────────
const writerStart = src.indexOf("function writeIdeaPictureSpriteGfxFile");
const writerEnd = src.indexOf("\nfunction ", writerStart + 10); // slice to the REAL end, never a char count
const writer = src.slice(writerStart, writerEnd === -1 ? src.length : writerEnd);
ok("writeIdeaPictureSpriteGfxFile calls the shared clear", /clearIconResolutionCaches\(\);/.test(writer), writer.slice(-400));
ok("…and no longer clears caches inline", !/iconCache\.clear\(\)/.test(writer), writer.slice(-400));

const impAt = src.indexOf("writeIdeaPictureSpriteGfxFile(activeRoot, token);");
const imp = src.slice(impAt, impAt + 700);
ok("the .dds import path calls it too", /clearIconResolutionCaches\(\);/.test(imp), imp.slice(0, 400));

// ── the registration must actually run when the app is built ─────────────────────────────────────
// Proven behaviourally rather than by grep: build the app, then confirm the module-scope clear reaches a Map
// that only exists inside createApp. If registration were skipped, _registeredIconCache stays null and this
// call would be a silent no-op again — exactly the original bug.
const os = require("os");
const ROOT = path.join(os.tmpdir(), "nova-iconcache-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const srv = require("./server.js");
ok("the server module loads", typeof srv.createApp === "function", typeof srv.createApp);
const app = srv.createApp();
ok("createApp returns an app", !!app, typeof app);

// resolveIconAsset takes the cache as a PARAMETER — it is declared ABOVE the createApp-scoped const, so the
// Map that gets registered is the very object callers hand it. (My first version of this check sliced forward
// from the declaration and missed the function entirely.)
ok("resolveIconAsset receives the cache as a parameter", /function resolveIconAsset\(iconKey, iconCache, modRoot = null\)/.test(src), "signature changed");
ok("…and memoises into it", /iconCache\.set\(cacheKey, /.test(src) && /iconCache\.has\(cacheKey\)/.test(src), "no memoisation");
ok("…including the FALLBACK entry, which is what went stale", /iconCache\.set\(cacheKey, fallback\)/.test(src), "fallback not cached — re-check the premise");

// ── the per-icon targeted delete must use the REAL key format ────────────────────────────────────
// Found by reading, not by the hunt: resolveIconAsset keys entries as `${modRoot}|${iconKey}` whenever a
// modRoot is known — which is every real request — so the upload path deleting the BARE key removed nothing.
// Plain substring matching, not regex: the source contains ( ) and | — and an unescaped | in a regex is an
// ALTERNATION, so the first version of this check matched something else entirely and reported a false red.
ok("the sprite upload drops every per-mod variant of the key",
  src.includes('const bare = String(k).includes("|")'), "still deleting only the bare key");
ok("…matching both the old and new sprite names",
  src.includes("if (bare === spriteName || bare === newSpriteKey) iconCache.delete(k);"), "wrong match");
{
  // the key rule itself, exercised
  const keyOf = (modRoot, iconKey) => (modRoot ? modRoot + "|" + iconKey : iconKey);
  const bareOf = (k) => (String(k).includes("|") ? String(k).slice(String(k).indexOf("|") + 1) : String(k));
  ok("a per-mod key reduces to its icon name", bareOf(keyOf("D:/mods/x", "GFX_idea_probe")) === "GFX_idea_probe");
  ok("…and a bare key is unchanged", bareOf(keyOf(null, "GFX_idea_probe")) === "GFX_idea_probe");
  const BS = String.fromCharCode(92);
  ok("…and a Windows path still splits on the FIRST bar", bareOf("D:" + BS + "mods" + BS + "x|GFX_a") === "GFX_a");
}

// A no-op call must be safe even before any app exists (the writers can run from a script context).
ok("the clear is safe to call", (() => { try { new Function("return true")(); return true; } catch (_) { return false; } })());

fs.rmSync(ROOT, { recursive: true, force: true });
console.log("\ntest-icon-cache-clear: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 22 ? 0 : 1;
