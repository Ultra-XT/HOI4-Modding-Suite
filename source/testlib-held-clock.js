// A clock that does not tick, for the tests of #a-same-tick-write-keeps-its-stamp.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// A cache kept "while the file is the file it read" compares what stat says of the file, and on Windows that moves only as far as
// the clock and the file id let it: a time moves with the clock tick (15.6 ms at the default; 0.5 ms on 09-30 while some
// program had asked for finer, which is why the same test failed 8 runs in 10 in batch 3b and 0 in 20 on this machine on
// 09-30), a folder's size is 0 and its id never changes, and Node reports a file id as a double, which cannot hold every id
// NTFS hands out (all 2,000 rename-overs measured in a scratch folder on 10-01 got one above 2^53, though none of them rounded
// to the id before it). A test cannot choose the tick. And pinning the time the way test-a-same-size-write-is-not-read-stale.js
// does is not enough for a stamp that reads the CHANGED time too: fs.utimesSync sets a file's modified time back and moves its
// changed time to now (measured 09-30 and 10-01, scratchpad wf-b3c/stamp/probe-pin.js).
//
// holdTheClock(paths) does: from the call until release(), fs.statSync and fs.promises.stat report each of those paths with the
// times and the file id it has NOW, whatever is written there after — its size and everything else stay real. For a folder, and
// for a stamp of size and times alone, that is exactly a write that landed inside the same tick as the one before it; for a
// stamp that reads the file id too it is the worst case, a new id that reads as the old one. Either way the one case a stat
// cannot see, made to happen every run rather than sometimes.
"use strict";
const fs = require("fs");
const path = require("path");

const HELD_FIELDS = ["atimeMs", "mtimeMs", "ctimeMs", "birthtimeMs", "atimeNs", "mtimeNs", "ctimeNs", "birthtimeNs", "ino"];
const keyOf = (p) => { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; };

function holdTheClock(paths) {
  const realSync = fs.statSync, realAsync = fs.promises.stat;
  const held = new Map();
  for (const p of paths) {
    try { held.set(keyOf(p), { num: realSync(p), big: realSync(p, { bigint: true }) }); } catch (_) { /* not there: nothing to hold */ }
  }
  const dress = (real, p, opts) => {
    let h = null;
    try { h = held.get(keyOf(p)); } catch (_) { h = null; }
    if (!h || !real) return real;
    const was = opts && opts.bigint ? h.big : h.num;
    const out = Object.create(Object.getPrototypeOf(real));
    for (const k of Object.keys(real)) out[k] = real[k];
    for (const k of HELD_FIELDS) if (k in was) out[k] = was[k];
    return out;
  };
  fs.statSync = function statSync(p, opts) { return dress(realSync.apply(fs, arguments), p, opts); };
  fs.promises.stat = async function stat(p, opts) { return dress(await realAsync.apply(fs.promises, arguments), p, opts); };
  return function release() { fs.statSync = realSync; fs.promises.stat = realAsync; };
}

module.exports = { holdTheClock };
