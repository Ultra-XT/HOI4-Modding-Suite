// The Map page's "Ready" line, LATCHED, for every e2e-map-*.js that waits for the map to load.
//
// ⚠️ NOT NAMED e2e-*.js OR test-*.js ON PURPOSE — run-e2e.js runs every `e2e-*.js` and run-tests.js every `test-*.js`, and
// either would execute a helper as a test file.
//
// ⛔ #map-ready-lasts-a-millisecond — WHY A WAIT ON THE STATUS TEXT MISSES IT. A first load of public/map.js sets the rivers
// overlay's src BEFORE the provinces bitmap's (load(): `if (riversShow) loadRiversOverlay(…)`, then the provinces-bmp src), and
// rivers are on by default. The provinces onload builds the map and writes "Ready — W×Hpx. …" (buildFromImage); the rivers onload
// then writes "🌊 Rivers overlay on." over it, and nothing writes Ready again. On a fixture that ships its own tiny rivers.bmp the
// two land 0.6 to 2.6 ms apart, while page.waitForFunction polls once per animation frame (about 16.7 ms): it saw Ready only when
// a frame happened to fall inside that window. e2e-map-layers-legend.js failed 1 run in 3 alone and e2e-map-rivers.js 4 in 6, each
// a 30 s timeout, with nothing wrong in the page (triage-2 and triage-8, 2026-11-03/04, measured over 32 instrumented loads). Every
// other map file passed only because the base game's 5632×2048 rivers.bmp encodes about 55 ms slower, and their "map reaches
// Ready" re-reads of #mapStatus lean on that same gap.
//
// A MutationObserver's callback runs at the end of the task that wrote the line, before the next image's onload can run, and it
// reads the text each write ADDED, so the latch below cannot miss it. ⚠️ Do NOT widen a wait to the rivers line instead: when the
// rivers PNG wins the race its line comes FIRST, before the map is built. And do NOT raise the timeout: nothing writes Ready again,
// so a longer wait only fails slower.
//
// ⛔ #a-ready-its-own-load-replaced-is-not-ready — …AND READY IS NOT THE LAST WORD OF ITS OWN TASK. buildFromImage writes "Ready — …"
// and only THEN runs the render's tail (refreshProblems, applyDeepLink, syncCountryColorInput), inside img.onload's try/catch, whose
// catch writes "Render error: …". A throw in that tail replaces Ready in the same task, before any frame can show it: the rAF waits
// could never pass on that, and a latch that listened for Ready alone passed it in all 39 files. The review of 11aa5c5d showed it
// with two faults (applyDeepLink's null check in the wrong order; syncCountryColorInput's no-country branch throwing): rivers,
// layers-legend, bucketfill and deeplink PASSED with the new bytes and FAILED with the old. No unit test reaches either fault (none
// calls applyDeepLink; the one that lifts syncCountryColorInput picks a country first), so these waits were their only guard.
// So a line that says a LOAD FAILED un-latches Ready. Those lines are DERIVED from public/map.js when this file is required, never
// typed here: every setStatus(…) in load() that is a failure exit, i.e. inside a `catch`, in an image's `onerror`, or followed by
// `return;`. The render tail's catch is the one that can follow Ready in its own task; the others (the model fetch failing, a mod
// with no map, the bitmap failing to load) can follow an EARLIER Ready only through a later load in the same document (a Save's
// reload, Fix all), and a map that a later load failed to read is not Ready either, so they count the same. If load() no longer
// has a catch inside its image's onload, requiring this file THROWS: the latch could not tell a render error from Ready, and a
// helper that cannot answer must say so rather than pass.
// NOT a failure of the load, so it does not un-latch (and was not derived, being outside load()): the rivers overlay's own 404
// ("No rivers.bmp found for this mod — rivers overlay unavailable."): the map under it is drawn and Ready, and with no rivers.bmp
// anywhere every map test would cry wolf. Nor a deep link's outcome ("No state is owned by TAG."), nor a tool's hint. The race fix
// stands: "🌊 Rivers overlay on." is none of these.
//
// What it never does: report Ready EARLIER than the old `/Ready/i` waits could. It turns true only at the end of the task that wrote
// a Ready line that the same task did not replace with a failure; a failure in a LATER task un-latches it, and so the old re-read of
// the text would have failed there too.
"use strict";

const fs = require("fs");
const path = require("path");
const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

const LOAD_HEAD = "async function load(doneMsg)";
const RENDER_CATCH = "catch in an image's onload";

const lineOf = (s, at) => { let n = 1; for (let k = 0; k < at; k++) if (s.charCodeAt(k) === 10) n++; return n; };

// The index of the `close` that pairs the `open` at `at`, in comment- and literal-masked code (a bracket left there is code).
function pairOf(code, at, open, close) {
  let d = 0;
  for (let i = at; i < code.length; i++) {
    if (code[i] === open) d++;
    else if (code[i] === close && --d === 0) return i;
  }
  return -1;
}

// The `{` of the innermost block that holds `at` (not before `floor`), or -1.
function enclosingOpen(code, at, floor) {
  let d = 0;
  for (let i = at - 1; i >= floor; i--) {
    if (code[i] === "}") d++;
    else if (code[i] === "{") { if (d === 0) return i; d--; }
  }
  return -1;
}

const tail = (code, end) => code.slice(Math.max(0, end - 160), end).replace(/\s+$/, "");

// Why the setStatus call at `at` (its argument closing at `argClose`) is a failure exit of load(), or null when it is not one.
function failureExit(code, bodyOpen, at, argClose) {
  if (/\.onerror\s*=\s*\(\s*\)\s*=>$/.test(tail(code, at))) return "an image's onerror";
  const blk = enclosingOpen(code, at, bodyOpen);
  if (blk > bodyOpen) {
    const before = tail(code, blk);
    if (/\.onerror\s*=\s*\(\s*\)\s*=>$/.test(before)) return "an image's onerror";
    if (/\bcatch(\s*\(\s*[A-Za-z_$][\w$]*\s*\))?$/.test(before)) {
      // …and is that catch inside an image's onload handler (the render: buildFromImage and its tail)?
      for (let b = enclosingOpen(code, blk, bodyOpen); b > bodyOpen; b = enclosingOpen(code, b, bodyOpen)) {
        if (/\.onload\s*=\s*\(\s*\)\s*=>$/.test(tail(code, b))) return RENDER_CATCH;
      }
      return "catch";
    }
  }
  if (/^\s*;\s*return\b/.test(code.slice(argClose + 1, argClose + 80))) return "followed by return";
  return null;
}

function unquote(raw) {
  const q = raw[0], body = raw.slice(1, -1);
  if (q === '"') { try { return JSON.parse(raw); } catch (_) { /* a JS-only escape: fall through */ } }
  return body.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\(.)/g, (all, cp, u4, x2, ch) =>
    cp ? String.fromCodePoint(parseInt(cp, 16)) : u4 ? String.fromCharCode(parseInt(u4, 16)) : x2 ? String.fromCharCode(parseInt(x2, 16))
      : ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" })[ch] || ch);
}

// The literal text a line written by `setStatus(<from..to>)` starts with: each string or template that opens an operand of the
// argument at its top level (right after the `(`, a `?` or a `:`). `whole` when nothing is concatenated after it.
function operandHeads(src, code, from, to) {
  const heads = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") { depth++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; continue; }
    if (c !== '"' && c !== "'" && c !== "`") continue;
    let end = -1;
    if (c === "`") {
      // A template: its text is blanked, `${ … }` is code; its head is the text up to the first `${`.
      let k = i + 1, inner = 0;
      for (; k < to; k++) {
        if (code[k] === "$" && code[k + 1] === "{" && inner === 0) { inner = 1; k++; continue; }
        if (inner) { if (code[k] === "{") inner++; else if (code[k] === "}") inner--; continue; }
        if (code[k] === "`") break;
      }
      end = k;
    } else {
      end = code.indexOf(c, i + 1);
    }
    if (end < 0 || end >= to) throw new Error("testlib-map-ready.js: an unterminated literal in a setStatus() of load(), at line " + lineOf(src, i));
    let p = i - 1;
    while (p >= from && /\s/.test(code[p])) p--;
    const opensOperand = depth === 0 && (p < from || code[p] === "?" || code[p] === ":");
    if (opensOperand) {
      let n = end + 1;
      while (n < to && /\s/.test(code[n])) n++;
      let text, whole;
      if (c === "`") {
        const raw = src.slice(i + 1, end), sub = raw.indexOf("${");
        text = sub < 0 ? raw : raw.slice(0, sub);
        whole = sub < 0 && code[n] !== "+";
      } else {
        text = unquote(src.slice(i, end + 1));
        whole = code[n] !== "+";
      }
      heads.push({ text, whole });
    }
    i = end;
  }
  return heads;
}

/** Every line public/map.js's load() writes to #mapStatus when a load FAILS, read out of its source: [{ text, whole, why, line }].
 *  `whole`: the line is exactly `text`; otherwise it starts with `text` ("Render error: " + e.message). Throws when load() cannot be
 *  found, or has no catch inside its image's onload (then nothing here can tell a render error from Ready). */
function deriveLoadFailureLines(source) {
  const src = String(source).replace(/\r\n/g, "\n");
  const code = maskJsLiterals(src);
  const at = code.indexOf(LOAD_HEAD);
  if (at < 0 || code.indexOf(LOAD_HEAD, at + LOAD_HEAD.length) >= 0) {
    throw new Error("testlib-map-ready.js: public/map.js must hold exactly one `" + LOAD_HEAD + "`; the load-failure lines cannot be derived");
  }
  const body = jsBodyAt(code, at);
  if (!body) throw new Error("testlib-map-ready.js: no body found for public/map.js's `" + LOAD_HEAD + "`");
  const [open, close] = body;
  const lines = [];
  const call = /\bsetStatus\(/g;
  call.lastIndex = open;
  for (let m = call.exec(code); m && m.index < close; m = call.exec(code)) {
    const argOpen = m.index + m[0].length - 1;
    const argClose = pairOf(code, argOpen, "(", ")");
    if (argClose < 0 || argClose > close) throw new Error("testlib-map-ready.js: an unclosed setStatus( in load(), at line " + lineOf(src, m.index));
    const why = failureExit(code, open, m.index, argClose);
    if (!why) continue;
    const heads = operandHeads(src, code, argOpen + 1, argClose);
    if (!heads.length) throw new Error("testlib-map-ready.js: load()'s failure exit at public/map.js line " + lineOf(src, m.index) + " writes no literal to know it by");
    for (const h of heads) {
      if (h.text.length < 4 || /\bReady\b/.test(h.text)) {
        throw new Error("testlib-map-ready.js: load()'s failure exit at public/map.js line " + lineOf(src, m.index) + " starts " + JSON.stringify(h.text) + ", which cannot tell a failure from Ready");
      }
      lines.push({ text: h.text, whole: h.whole, why, line: lineOf(src, m.index) });
    }
  }
  if (!lines.some((l) => l.why === RENDER_CATCH)) {
    throw new Error("testlib-map-ready.js: public/map.js's load() has no setStatus(…) in a catch inside its image's onload, so this helper " +
      "cannot tell a render that threw after its Ready line from a Ready map (#a-ready-its-own-load-replaced-is-not-ready); re-derive it");
  }
  return lines;
}

const LOAD_FAILURE_LINES = deriveLoadFailureLines(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));

/** Arm the latch on a page (or a browser context), ONCE and BEFORE its first goto. Every document loaded from then on starts
 *  with window.__mapSawReady = false, turns it true at the end of the task that wrote a Ready line into #mapStatus, and false again
 *  when a later line says a load failed (window.__mapLoadFailed then holds that line); a reload or a goto starts it over.
 *  window.__mapStatusSeen keeps every line #mapStatus showed in this document, in order, for checks that ask what came after. */
async function armMapReady(target) {
  await target.addInitScript((failures) => {
    window.__mapSawReady = false;
    window.__mapLoadFailed = null;
    window.__mapStatusSeen = [];
    const failed = (t) => failures.some((f) => (f.whole ? t === f.text : t.startsWith(f.text)));
    const seen = (text) => {
      const t = String(text || "");
      const log = window.__mapStatusSeen;
      if (log.length < 200 && log[log.length - 1] !== t) log.push(t);
      // A failure first: its message may quote anything, the word Ready included.
      if (failed(t)) { window.__mapSawReady = false; window.__mapLoadFailed = t; }
      else if (/\bReady\b/.test(t)) { window.__mapSawReady = true; window.__mapLoadFailed = null; }
    };
    new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target;
        // setStatus is `statusEl.textContent = t`: one childList record on #mapStatus, whose added text node is the line.
        if (t && t.id === "mapStatus") for (const n of r.addedNodes) seen(n.textContent);
        else if (t && t.nodeType === 3 && t.parentNode && t.parentNode.id === "mapStatus") seen(t.data);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, LOAD_FAILURE_LINES.map((l) => ({ text: l.text, whole: l.whole })));
}

/** Wait until the CURRENT document's map has said Ready, and nothing since has said its load failed. A load that FAILED ends the
 *  wait at once: plain, it throws (naming the line); with orError it returns, the way the "Ready|error|…" waits stopped on a load
 *  error, so the caller's "map reaches Ready" check fails on the spot instead of after 30 s. A timeout says what #mapStatus said. */
async function waitForMapReady(page, { timeout = 30000, orError = false } = {}) {
  try {
    await page.waitForFunction((orErr) => window.__mapSawReady === true || window.__mapLoadFailed != null
      || (orErr && /error|Error|Could not|No definition/i.test((document.getElementById("mapStatus") || {}).textContent || "")), orError, { timeout });
  } catch (e) {
    let seen = null;
    try { seen = await mapStatusSeen(page); } catch (_) { /* the page is gone: the timeout says enough */ }
    throw Object.assign(new Error(String((e && e.message) || e) + (seen ? "\n#mapStatus said, in order: " + JSON.stringify(seen) : "")), { cause: e });
  }
  if (orError) return;
  const failure = await page.evaluate(() => window.__mapLoadFailed);
  if (failure != null) {
    throw new Error("the map's load failed after it began: #mapStatus said " + JSON.stringify(failure) + "\n#mapStatus said, in order: " + JSON.stringify(await mapStatusSeen(page)));
  }
}

/** Did the current document's map say Ready, with no later line saying its load failed? The "map reaches Ready" checks: a re-read
 *  of #mapStatus races the rivers line too. False when Ready was replaced by a load failure, in its own task or later. */
async function mapSawReady(page) {
  return page.evaluate(() => window.__mapSawReady === true);
}

/** Every line #mapStatus showed in the current document, in order (at most 200). */
async function mapStatusSeen(page) {
  return page.evaluate(() => (window.__mapStatusSeen || []).slice());
}

module.exports = { armMapReady, waitForMapReady, mapSawReady, mapStatusSeen, deriveLoadFailureLines, LOAD_FAILURE_LINES };
