// #sprite-warm-drops-upload — THE GUARD WAS INSTALLED ON THE ONE TWIN WHERE IT CANNOT FIRE.
//
// /api/upload-gfx registers a newly uploaded sprite straight into the live spriteMapCache entries and then
// calls bumpSpriteWriteEpoch(). Its own comment says why: "a sprite warm that started BEFORE this upload
// will finish afterwards and overwrite the whole entry with the map it built from the pre-upload file list,
// silently dropping this icon for the rest of the session. The bump tells that in-flight warm its result is
// stale so it declines to store it."
//
// The warm it names — warmSpriteTextureMapAsync — did not check the epoch. Neither did
// _getSpriteTextureMapAsyncImpl. The check lived only in getSpriteTextureMap, whose comment claimed it was
// "captured before the first await" and which contains no await at all: fully synchronous, so nothing can
// interleave with it and the guard can never fail there. The mechanism the upload path described did not
// exist on either function that could actually race it.
//
// ⭐ THE CHECK IS DERIVED, NOT A LIST OF THREE NAMES. Naming the functions is how this recurs: a fourth
// builder gets added, nobody updates the list, and the new store is unguarded. So this walks every
// `spriteMapCache.set(` in server.js and requires each one's enclosing function to capture the epoch and
// consult it. A store added tomorrow fails this the day it is added.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const CODE = stripJsComments(SRC); // ⚠️ the fix's own prose names every symbol this greps for

// Walk back from an offset to the enclosing `function name(` / `async function name(`, then forward to its
// matching close brace, so each store is judged against its OWN function and not a fixed window.
function enclosingFunction(code, at) {
  const head = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let best = null, m;
  while ((m = head.exec(code)) !== null) {
    if (m.index > at) break;
    best = { name: m[1], start: m.index };
  }
  if (!best) return null;
  const open = code.indexOf("{", best.start);
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (!d) return { ...best, end: i, body: code.slice(best.start, i + 1) }; }
  }
  return null;
}

console.log("\n[the rule] every sprite-map store must be epoch-guarded");
{
  const stores = [...CODE.matchAll(/spriteMapCache\.set\(/g)].map((m) => m.index);
  console.log(`     spriteMapCache.set( call sites: ${stores.length}`);
  // ⚠️ Assert the sweep found something. A regex that matched nothing would report perfect compliance.
  rec("the sweep found the stores at all", stores.length >= 3, stores.length);

  const offenders = [];
  const seen = [];
  for (const at of stores) {
    const fn = enclosingFunction(CODE, at);
    if (!fn) { offenders.push("(store outside any named function)"); continue; }
    seen.push(fn.name);
    const captures = /const\s+spriteEpochAtStart\s*=\s*spriteWriteEpoch/.test(fn.body);
    const consults = /spriteWriteEpoch\s*[!=]==\s*spriteEpochAtStart/.test(fn.body);
    if (!captures || !consults) offenders.push(`${fn.name}(captures=${captures},consults=${consults})`);
  }
  console.log(`     enclosing functions: ${[...new Set(seen)].join(", ")}`);
  rec("every store's function captures the epoch and checks it", offenders.length === 0, offenders);
}

console.log("\n[⭐ the two that can actually race] must both be guarded");
{
  // The sync builder cannot interleave with anything; these two await repeatedly, and the async impl even
  // yields with setImmediate between batches so uploads CAN be served meanwhile. They are the ones the
  // upload path's comment is about.
  for (const name of ["_getSpriteTextureMapAsyncImpl", "warmSpriteTextureMapAsync"]) {
    const at = CODE.indexOf(`function ${name}(`);
    const fn = at === -1 ? null : enclosingFunction(CODE, at + 10);
    rec(`${name} is findable`, !!fn, "not found");
    if (!fn) continue;
    rec(`…${name} awaits, so a race is real`, /\bawait\b/.test(fn.body), "no await — is this still the async twin?");
    rec(`…and it consults the epoch before storing`,
      /spriteWriteEpoch\s*!==\s*spriteEpochAtStart/.test(fn.body), fn.body.slice(0, 200));
  }
}

console.log("\n[⚠️ the twin where it CANNOT fire] documented, not silently kept");
{
  const at = CODE.indexOf("function getSpriteTextureMap(");
  const fn = at === -1 ? null : enclosingFunction(CODE, at + 10);
  rec("the synchronous builder is findable", !!fn, "not found");
  if (fn) {
    // If this ever gains an await the guard starts mattering — and this check stops being interesting,
    // which is the right time to re-read it rather than delete it.
    rec("it is still fully synchronous", !/\bawait\b/.test(fn.body), "it now awaits — the guard here is live, update this note");
    rec("…and it keeps the guard anyway", /spriteEpochAtStart/.test(fn.body), "guard removed");
  }
}

console.log("\n[the producer] the upload path must still bump the epoch");
{
  // If the bump ever goes away, all three guards above become dead code that can never trigger — the
  // mirror image of the original defect, and just as quiet.
  rec("bumpSpriteWriteEpoch exists", /function bumpSpriteWriteEpoch\(\)/.test(CODE), "gone");
  const calls = (CODE.match(/bumpSpriteWriteEpoch\(\)/g) || []).length - 1; // minus the definition
  console.log(`     bumpSpriteWriteEpoch() call sites: ${calls}`);
  rec("…and something actually calls it", calls >= 1, calls);
  // …specifically the upload handler, which is the only producer of a mid-scan sprite.
  const up = CODE.indexOf('"/api/upload-gfx"');
  const near = up === -1 ? "" : CODE.slice(up, up + 9000);
  rec("the upload handler is findable", up !== -1, "not found");
  rec("…and it bumps after registering the sprite", /bumpSpriteWriteEpoch\(\)/.test(near), "no bump in the upload handler");
}

console.log(`\n=== sprite warm keeps upload: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
