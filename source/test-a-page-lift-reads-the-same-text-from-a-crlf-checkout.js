// #a-lift-reads-lf — A TEST THAT LIFTS A FUNCTION OUT OF A SOURCE FILE MUST LIFT THE SAME TEXT FROM ANY CHECKOUT.
//
// THE DEFECT. The map tests RUN the Map editor's own functions: they cut a function's text out of public/map.js and
// execute it (testlib-map-page.js's lift(), and a local `grab(needle, endNeedle)` in the older files). Several of their
// anchors SPAN A LINE END — "…updateSaveButton(); }\n  }", "\n    return items;\n  }", "\n  }\n". core.autocrlf is on and
// there is no .gitattributes, so public/map.js is LF in D:\Nova, where a tool last wrote it, and CRLF in every fresh clone
// and worktree — and in CRLF text those anchors do not exist. Sixteen tests failed in a worktree and passed in D:\Nova
// ("flushMapSaves lifted -> 0", "no end after const riverGrey", "heightmapNote was lifted out of the page -> 0", "helper
// missing"): thirteen over public/map.js, two of them the building-slot writer's riskiest callers, and one each over
// mod-index.js, public/mio-editor.js and public/loading-overlay.js. Every agent working in a worktree had to decide again
// that the red was not theirs, and a failure that is always someone else's is how a real one gets waved through.
//
// THE FIX is one reader, readSource() in testlib-map-page.js: the source is normalised to LF ONCE, where it is read for
// lifting. Not `\r?` through every anchor — that fixes the anchors that exist and none that will. No source file is
// changed; a lifted function runs the same from either. (The three tests that read another file normalise at their own
// read, the way a dozen already did.)
//
// WHAT THIS PINS, in a way that does not depend on how THIS checkout happens to be written:
//   1. two scratch checkouts of the page, one CRLF and one LF, are read as the same text;
//   2. the testlib, LOADED FROM each of them, lifts the same function and finds every line-spanning anchor the tests use;
//   3. no test searches the RAW text of a tracked source for an anchor only an LF checkout holds — measured against the
//      source itself, written both ways, so the next `grab("…}\n  }")` over a bare fs.readFileSync fails here, in D:\Nova,
//      where nothing else would notice it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const P = require("./testlib-map-page.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const lineEnds = (buf) => {
  let crlf = 0, lf = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) { if (i > 0 && buf[i - 1] === 13) crlf++; else lf++; }
  return { crlf, lf };
};
/** True when `s` holds a line end that is not its first character: the part before it has to sit at the END of a line,
 *  and in CRLF text the end of a line is "\r". An anchor that only STARTS with "\n" matches either way. */
const spansLineEnd = (s) => {
  for (let i = s.indexOf("\n", 1); i > 0; i = s.indexOf("\n", i + 1)) if (s[i - 1] !== "\r") return true;
  return false;
};

// ── the scanner for part 3: which searches a test file makes, in what text, for what ──────────────────────────────────
const unescape = (body) => body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, e) => {
  if (e === "n") return "\n";
  if (e === "t") return "\t";
  if (e === "r") return "\r";
  if (e[0] === "u") return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ""), 16));
  if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
  return e;
});
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every static literal of a file — strings (decoded) and regex literals — with where each starts and ends. `M` is the
 *  file with its comments masked, `L` the same with the inside of every literal blanked too: the two are the same length,
 *  so a quote left in `L` is a real delimiter and the text between two of them is read out of `M`. */
function literalsOf(M, L) {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (c === '"' || c === "'") {
      const j = L.indexOf(c, i + 1);
      if (j < 0) break;
      out.push({ kind: "string", value: unescape(M.slice(i + 1, j)), at: i, end: j });
      i = j;
    } else if (c === "`") {
      let j = i + 1, depth = 0, dynamic = false;
      for (; j < L.length; j++) {
        if (L[j] === "$" && L[j + 1] === "{") { dynamic = true; depth++; j++; }
        else if (depth && L[j] === "{") depth++;
        else if (depth && L[j] === "}") depth--;
        else if (L[j] === "`" && !depth) break;
      }
      if (!dynamic) out.push({ kind: "string", value: unescape(M.slice(i + 1, j)), at: i, end: j });
      i = j;
    } else if (c === "/") {
      let j = i + 1;
      while (L[j] === " ") j++;
      if (j > i + 1 && L[j] === "/") {   // a blanked body between two slashes: a division has an operand there
        const flags = /^[a-z]*/.exec(L.slice(j + 1, j + 9))[0];
        out.push({ kind: "regex", source: M.slice(i + 1, j), flags, at: i, end: j + flags.length });
        i = j + flags.length;
      }
    }
  }
  return out;
}
/** The call a position is a direct argument of: where its "(" is and what is called — "MASKED.indexOf", ".indexOf" (after
 *  a call or an index), "grab". null inside a [ ] or a { }, and at the top level. */
function callAround(L, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = L[i];
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth > 0) { depth--; continue; }
      if (c !== "(") return null;
      let e = i;
      while (e > 0 && /\s/.test(L[e - 1])) e--;
      let s = e;
      while (s > 0 && /[\w$.]/.test(L[s - 1])) s--;
      return { open: i, callee: L.slice(s, e), calleeAt: s };
    }
  }
  return null;
}
const closeOf = (L, open) => {
  let d = 0;
  for (let i = open; i < L.length; i++) { if (L[i] === "(") d++; else if (L[i] === ")" && --d === 0) return i; }
  return L.length;
};
/** Where the expression that ends just before `end` starts: a chain of names, calls and indexes — MASKED, code(ov), P.MAP. */
function chainStart(L, end) {
  let i = end;
  while (i > 0) {
    while (i > 0 && /\s/.test(L[i - 1])) i--;
    const c = L[i - 1];
    if (c === ")" || c === "]") {
      let d = 0;
      do { i--; if (L[i] === ")" || L[i] === "]") d++; else if (L[i] === "(" || L[i] === "[") d--; } while (i > 0 && d > 0);
    } else if (c && /[\w$]/.test(c)) {
      while (i > 0 && /[\w$]/.test(L[i - 1])) i--;
      if (L[i - 1] !== ".") break;
      i--;
    } else break;
  }
  return i;
}
const STRING_SEARCH = new Set(["indexOf", "lastIndexOf", "includes", "split", "startsWith", "endsWith", "replace", "replaceAll"]);
const REGEX_SEARCH = new Set(["match", "matchAll", "replace", "replaceAll", "split", "search"]);

/**
 * The searches one test file makes in the text of a source it reads, with a needle only an LF checkout holds:
 * [{ line, needle, source, raw }]. `named(value)` answers which tracked sources a string literal names ("map.js",
 * "public/map.js"), each as { name, lf, crlf }. A search is listed when
 *   · its needle is a string that spans a line end, handed to indexOf / includes / split / replace… or to a LOCAL helper
 *     that itself searches with its parameter (`grab`, `lift`, `cut` — found by what they do, not by a list of names), or
 *     a regex literal with a \n in it and no \r;
 *   · the text it searches comes from a readFileSync that names a tracked source — directly, through a local reader
 *     (`read("loading-overlay.js")`), or through whatever was derived from the variable it was stored in (a masked twin,
 *     a slice) — so a search of a fixture's output is not one;
 *   · and the needle is FOUND in that source's LF text and NOT in its CRLF text: measured, not inferred from its shape.
 * `raw` is true when nothing on the way normalised the text: no readSource(), no \r in the read, in anything derived from
 * it, or in the statement the needle is in (which is how "try it with \n, then with \r\n" is written).
 */
function lineEndSearchesOf(source, named) {
  const text = String(source).replace(/\r\n/g, "\n");
  const M = maskJsComments(text), L = maskJsLiterals(text);
  const lits = literalsOf(M, L);
  const mentionsCr = (a, b) => M.slice(a, b).indexOf("\\r") !== -1;
  const namedIn = (a, b) => lits.filter((l) => l.kind === "string" && l.at >= a && l.at < b).flatMap((l) => named(l.value));

  // what each name stands for: the text L[a..b) — a value's initialiser, or a function's body — and its parameters
  const decls = [];
  let m;
  const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)/g;
  while ((m = DECL.exec(L))) {
    const a = m.index + m[0].length;
    let b = a, depth = 0;
    for (; b < L.length; b++) {
      const c = L[b];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") { if (--depth < 0) break; }
      else if (c === ";" && depth === 0) break;
    }
    const arrow = /^\s*(?:async\s*)?(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>/.exec(L.slice(a, b));
    decls.push({ name: m[1], at: m.index, a, b, params: arrow ? (arrow[1] != null ? arrow[1] : arrow[2]) : null });
  }
  const FUNC = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^()]*)\)/g;
  while ((m = FUNC.exec(L))) {
    const body = jsBodyAt(L, m.index);
    if (body) decls.push({ name: m[1], at: m.index, a: body[0], b: body[1], params: m[2] });
  }
  decls.sort((x, y) => x.at - y.at);
  for (const d of decls) d.params = d.params == null ? null : d.params.split(",").map((p) => p.trim().split(/\s*=/)[0]).filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
  // the declaration a name refers to at `pos`: the nearest one above it, else the first below (a hoisted function)
  const declOf = (name, pos) => {
    let hit = null;
    for (const d of decls) if (d.name === name) { if (d.at < pos || !hit) hit = d; if (d.at >= pos) break; }
    return hit;
  };
  const isFn = (d) => !!(d.params && d.params.length);
  // a local reader: a function with a parameter, around a readFileSync — read("loading-overlay.js")
  const readers = decls.filter((d) => isFn(d) && /\breadFileSync\s*\(/.test(L.slice(d.a, d.b)));
  const readsIn = (code, pos, blind) => /\breadFileSync\s*\(/.test(code) || (blind && /\breadSource\s*\(/.test(code))
    || readers.some((r) => (blind || !mentionsCr(r.a, r.b)) && declOf(r.name, pos) === r && new RegExp("(?<![.\\w$])" + esc(r.name) + "\\s*\\(").test(code));

  /** The sources whose text the expression L[a..b) holds. `blind`: whether or not it was normalised on the way. */
  const heldIn = (a, b, pos, blind, seen) => {
    const code = L.slice(a, b);
    if (!blind && (mentionsCr(a, b) || /\breadSource\s*\(/.test(code))) return [];
    const out = new Set();
    if (readsIn(code, pos, blind)) namedIn(a, b).forEach((s) => out.add(s));
    for (const id of new Set(code.match(/[A-Za-z_$][\w$]*/g) || [])) heldBy(id, pos, blind, seen).forEach((s) => out.add(s));
    return [...out];
  };
  const heldBy = (name, pos, blind, seen) => {
    const d = declOf(name, pos);
    if (!d || seen.has(d) || isFn(d)) return [];
    seen.add(d);
    return heldIn(d.a, d.b, d.at, blind, seen);
  };
  // a local search helper: a function that searches some text for one of its own parameters
  const helpers = new Map();
  for (const d of decls) {
    if (!isFn(d)) continue;
    const body = L.slice(d.a, d.b), recv = new Set();
    for (const p of d.params) {
      const RE = new RegExp("([A-Za-z_$][\\w$.]*)\\.(?:lastIndexOf|indexOf|includes)\\(\\s*" + esc(p) + "\\b", "g");
      let h;
      while ((h = RE.exec(body))) recv.add(h[1].split(".")[0]);
    }
    if (recv.size) helpers.set(d, [...recv]);
  }

  const found = [];
  for (const l of lits) {
    const call = callAround(L, l.at);
    const dot = call ? call.callee.lastIndexOf(".") : -1;
    const method = dot >= 0 ? call.callee.slice(dot + 1) : "";
    let searched = null;   // (blind) -> the sources whose text this literal is searched for in
    if (l.kind === "string") {
      if (!spansLineEnd(l.value) || !call) continue;
      const helper = dot < 0 ? declOf(call.callee, l.at) : null;
      if (dot >= 0 && STRING_SEARCH.has(method)) {
        const end = call.calleeAt + dot;
        searched = (blind) => heldIn(chainStart(L, end), end, l.at, blind, new Set());
      } else if (helper && helpers.has(helper)) {
        searched = (blind) => [...new Set(helpers.get(helper).flatMap((r) => (helper.params.includes(r)
          ? heldIn(call.open + 1, closeOf(L, call.open), l.at, blind, new Set())   // the text is one of the arguments
          : heldBy(r, l.at, blind, new Set()))))];
      } else continue;
    } else {
      if (!/\\n/.test(l.source) || /\\r/.test(l.source)) continue;
      const after = /^\s*\.(?:test|exec)\s*\(/.exec(L.slice(l.end + 1, l.end + 40));
      if (after) {
        const open = l.end + after[0].length;
        searched = (blind) => heldIn(open + 1, closeOf(L, open), l.at, blind, new Set());
      } else if (dot >= 0 && REGEX_SEARCH.has(method)) {
        const end = call.calleeAt + dot;
        searched = (blind) => heldIn(chainStart(L, end), end, l.at, blind, new Set());
      } else continue;
    }
    let re = null;
    if (l.kind === "regex") { try { re = new RegExp(l.source, l.flags.replace(/[gy]/g, "")); } catch (_) { continue; } }
    const lfOnly = (s) => (re ? re.test(s.lf) && !re.test(s.crlf) : s.lf.includes(l.value) && !s.crlf.includes(l.value));
    const stmtEnd = L.indexOf(";", l.at);
    const bothWays = mentionsCr(L.lastIndexOf(";", l.at) + 1, stmtEnd < 0 ? L.length : stmtEnd);
    const rawHit = bothWays ? null : searched(false).find(lfOnly);
    const hit = rawHit || searched(true).find(lfOnly);
    if (hit) found.push({ line: M.slice(0, l.at).split("\n").length, needle: l.kind === "regex" ? "/" + l.source + "/" + l.flags : JSON.stringify(l.value), source: hit.name, raw: !!rawHit });
  }
  return found;
}

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lift-eol-"));
try {
  // ── two checkouts of one page ─────────────────────────────────────────────────────────────────────────────────────
  // What the testlib loads is read out of ITS OWN source, so a module it gains comes along without this file being told.
  const LIB = "testlib-map-page.js";
  const libSource = fs.readFileSync(path.join(__dirname, LIB), "utf8");
  const needed = [...new Set([...maskJsComments(libSource).matchAll(/require\("\.\/([^"]+)"\)/g)].map((m) => m[1]))];
  const asLf = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8").replace(/\r\n/g, "\n");
  const checkout = (name, eol) => {
    const dir = path.join(SCRATCH, name);
    for (const rel of [LIB, ...needed, "public/map.js"]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), eol === "\n" ? asLf(rel) : asLf(rel).replace(/\n/g, "\r\n"));
    }
    return dir;
  };
  const CRLF_DIR = checkout("crlf", "\r\n"), LF_DIR = checkout("lf", "\n");
  const crlfPage = path.join(CRLF_DIR, "public", "map.js"), lfPage = path.join(LF_DIR, "public", "map.js");

  console.log("\n=== 0. the fixture: one page, written the two ways a checkout writes it ===");
  const endsCrlf = lineEnds(fs.readFileSync(crlfPage)), endsLf = lineEnds(fs.readFileSync(lfPage));
  rec(`the CRLF checkout's page is CRLF throughout (${endsCrlf.crlf} line ends)`, endsCrlf.crlf > 1000 && endsCrlf.lf === 0, endsCrlf);
  rec(`the LF checkout's page is LF throughout (${endsLf.lf} line ends)`, endsLf.lf === endsCrlf.crlf && endsLf.crlf === 0, endsLf);
  rec("…so the two files differ on disk, and a raw read tells them apart",
    fs.readFileSync(crlfPage, "utf8") !== fs.readFileSync(lfPage, "utf8"));
  rec("the testlib's needs were read out of its source, the comment masker among them",
    needed.includes("testlib-strip-comments.js"), needed);

  console.log("\n=== 1. the reader gives one text for both ===");
  const fromCrlf = P.readSource(crlfPage), fromLf = P.readSource(lfPage);
  rec("⭐ readSource() reads the CRLF page and the LF page as the same text", fromCrlf === fromLf && fromLf.length > 100000,
    { crlf: fromCrlf.length, lf: fromLf.length });
  rec("…with no CR left in it", fromCrlf.indexOf("\r") === -1, fromCrlf.indexOf("\r"));
  rec("…and it is the text this run's lifts are cut from", P.MAP === fromLf, { page: P.MAP.length, fixture: fromLf.length });

  console.log("\n=== 2. the testlib, loaded from each checkout, lifts the same function ===");
  const inCrlf = require(path.join(CRLF_DIR, LIB)), inLf = require(path.join(LF_DIR, LIB));
  rec("⭐ loaded from the CRLF checkout, the page text the testlib holds has no CR", inCrlf.MAP.indexOf("\r") === -1, inCrlf.MAP.indexOf("\r"));
  rec("…and it is the text the LF checkout holds", inCrlf.MAP === inLf.MAP && inCrlf.MASKED === inLf.MASKED);

  // One function, picked from the page rather than named here: the first declared at the IIFE's own indent. Its end is
  // written the way the failing tests wrote theirs — an anchor that spans a line end.
  const first = /\n  function ([A-Za-z_$][\w$]*)\(/.exec(P.MASKED);
  const OPENING = first ? "function " + first[1] + "(" : "", END = "\n  }\n";
  rec("a function to lift was found in the page", !!first && spansLineEnd(END), first && first[1]);
  let a = "", b = "", here = "", threw = null;
  try { a = inCrlf.lift(OPENING, END); b = inLf.lift(OPENING, END); here = P.lift(OPENING, END); } catch (e) { threw = String(e && e.message); }
  rec(`⭐ ${first ? first[1] : "it"}() lifts to the same text from the CRLF checkout and the LF one`, !threw && a.length > 40 && a === b, threw || { crlf: a.length, lf: b.length });
  rec("…which is the text this checkout lifts too", a === here && here.startsWith(OPENING) && here.endsWith(END), { here: here.length });
  let fn = null;
  try { fn = vm.runInNewContext("(" + a + ")", {}); } catch (e) { fn = String(e && e.message); }
  rec("…and it is still a function when evaluated", typeof fn === "function", typeof fn === "function" ? null : fn);

  // CONTROL — the defect itself. The same lift over the CRLF page read RAW finds the opening and no end.
  const rawCrlf = fs.readFileSync(crlfPage, "utf8");
  let rawThrew = null;
  try { P.liftFrom(rawCrlf, maskJsComments(rawCrlf), OPENING, END); } catch (e) { rawThrew = String(e && e.message); }
  rec("CONTROL: read raw, the CRLF page has no such end — the lift throws, as it did in every worktree",
    /no end after/.test(rawThrew || ""), rawThrew);
  // …and an anchor that only STARTS at a line end still matches raw CRLF, which is why some lifts worked there and
  // nobody saw a pattern: but what it cuts is not the same text.
  let luck = "";
  try { luck = P.liftFrom(rawCrlf, maskJsComments(rawCrlf), OPENING, "\n  }"); } catch (_) { luck = ""; }
  rec("CONTROL: an anchor that only starts at a line end does match raw CRLF, and cuts text with CRs in it",
    luck.length > a.length - END.length && luck.indexOf("\r") !== -1 && !spansLineEnd("\n  }"), { length: luck.length });

  console.log("\n=== 3. no test searches the raw text of a source for an anchor only an LF checkout holds ===");
  // The sources are the tracked ones, from git, the way test-no-source-file-has-mixed-line-endings.js derives its set;
  // the tests are the ones on disk, so a test not yet committed is read too.
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { cwd: __dirname, maxBuffer: 64 * 1024 * 1024 }).toString("utf8").split("\0").filter(Boolean);
  } catch (e) {
    // Not a skip. A guard that cannot run must say so out loud — a skip reads as a pass.
    rec("git ls-files could enumerate the tracked files", false, String(e && e.message).slice(0, 120));
  }
  const sources = tracked.filter((f) => /\.(js|css|html)$/i.test(f));
  const bothWays = new Map();
  const textOf = (rel) => {
    if (!bothWays.has(rel)) {
      let lf = null;
      try { lf = asLf(rel); } catch (_) { /* tracked, and not on disk: nothing to search */ }
      bothWays.set(rel, lf == null ? null : { name: rel, lf, crlf: lf.replace(/\n/g, "\r\n") });
    }
    return bothWays.get(rel);
  };
  const named = (value) => {
    const v = String(value).replace(/^\.\//, "").replace(/\\/g, "/");
    if (!/\.(js|css|html)$/i.test(v) || /\s/.test(v)) return [];
    return sources.filter((f) => f === v || f.endsWith("/" + v)).map(textOf).filter(Boolean);
  };
  // (a file that is gone between the listing and the read is another running test's scratch, not a test)
  const files = fs.readdirSync(__dirname).filter((f) => /^(test|testlib)-.*\.js$/.test(f)).sort()
    .map((f) => { try { return { f, text: asLf(f) }; } catch (_) { return null; } }).filter(Boolean);
  const scans = files.map(({ f, text }) => ({ f, searches: lineEndSearchesOf(text, named) }));
  const searching = scans.filter((x) => x.searches.length);
  const offenders = searching.filter((x) => x.searches.some((s) => s.raw));
  rec(`the scan read ${files.length} test files against ${sources.length} tracked sources`, files.length > 500 && sources.length > 50,
    { files: files.length, sources: sources.length });
  rec(`${searching.length} of them search a source they read for an anchor only its LF text holds`, searching.length > 0, searching.length);
  rec("⭐ …and every one reads it LF — readSource() from testlib-map-page.js, or a CRLF→LF replace where it is read",
    offenders.length === 0,
    offenders.map((x) => { const s = x.searches.find((y) => y.raw); return `${x.f}:${s.line} ${s.needle.slice(0, 70)} over a raw ${s.source}`; }));

  // The anchors the tests hand the testlib, over the two loaded checkouts: every line-spanning string a test holds that the
  // page holds too is at the same place in both. (Most such strings are a fixture's text; only those the page holds count.)
  const anchors = new Set();
  for (const { text } of files) {
    for (const l of literalsOf(maskJsComments(text), maskJsLiterals(text))) if (l.kind === "string" && spansLineEnd(l.value) && P.MASKED.indexOf(l.value) !== -1) anchors.add(l.value);
  }
  const moved = [...anchors].filter((n) => inCrlf.MASKED.indexOf(n) !== inLf.MASKED.indexOf(n) || inCrlf.MASKED.indexOf(n) < 0);
  rec(`⭐ each of the ${anchors.size} line-spanning strings the tests hold that the page holds is found in the CRLF checkout, where the LF one has it`,
    anchors.size > 0 && moved.length === 0, moved.map((n) => JSON.stringify(n).slice(0, 80)));
  rec("CONTROL: …and not one of them is in the CRLF page read raw", anchors.size > 0 && [...anchors].every((n) => rawCrlf.indexOf(n) === -1),
    [...anchors].filter((n) => rawCrlf.indexOf(n) !== -1).map((n) => JSON.stringify(n).slice(0, 80)));

  console.log("\n=== 4. the scanner tells right from wrong ===");
  // A page of its own, so these do not move when public/map.js does.
  const PAGE = "(function () {\n  async function f() {\n    try { x(); } finally { y(); }\n  }\n  var tok = function (s) {\n    return s;\n  };\n})();\n";
  const fixture = (value) => (value === "page.js" ? [{ name: "page.js", lf: PAGE, crlf: PAGE.replace(/\n/g, "\r\n") }] : []);
  const searchesIn = (src) => lineEndSearchesOf(src, fixture);
  const caught = (src) => searchesIn(src).some((s) => s.raw);
  const RAW = 'const MAP = fs.readFileSync(path.join(__dirname, "public", "page.js"), "utf8");\n';
  const LF = 'const MAP = require("./testlib-map-page.js").readSource("public", "page.js");\n';
  const GRAB = "const grab = (needle, endNeedle) => { const s = MAP.indexOf(needle); const e = MAP.indexOf(endNeedle, s); return MAP.slice(s, e); };\n";
  const GRABBED = 'const F = grab("async function f", "} finally { y(); }\\n  }");\n';
  rec("a raw read and a grab() whose end spans a line end is caught", caught(RAW + GRAB + GRABBED));
  rec("…so is one searched with indexOf directly", caught(RAW + 'const e = MAP.indexOf("}\\n  }\\n", 5);\n'));
  rec("…one through a helper of any other name, found by what it does",
    caught(RAW + "function cutOut(from, to) { const a = MAP.indexOf(from); return MAP.slice(a, MAP.indexOf(to, a)); }\n" + 'cutOut("function f", "}\\n  }");\n'));
  rec("…one through a helper that is handed the text", caught(RAW + "const cut = (src, to) => src.slice(0, src.indexOf(to));\n" + 'cut(MAP, "}\\n  }");\n'));
  rec("…one over the comment-masked twin of the raw text", caught(RAW + "const MASKED = maskJsComments(MAP);\n" + 'const e = MASKED.indexOf("}\\n  }\\n");\n'));
  rec("…a regex that ends on a line end, matched against it", caught(RAW + "const m = MAP.match(/var tok = function[\\s\\S]*?\\n  \\};\\n/);\n"));
  rec("…or tested against it", caught(RAW + "ok(/finally \\{ y\\(\\); \\}\\n\\s*\\}/.test(MAP));\n"));
  rec("…and a source read through a local reader",
    caught('const read = (f) => { try { return fs.readFileSync(path.join(PUB, f), "utf8"); } catch (_) { return ""; } };\nconst ov = read("page.js");\nconst at = ov.indexOf("(function () {\\n  async function f");\n'));
  const viaReadSource = searchesIn(LF + GRAB + GRABBED);
  rec("the same search over readSource() is seen, and is not raw", viaReadSource.length === 1 && viaReadSource[0].raw === false, viaReadSource);
  rec("nor is one over a read normalised where it is read",
    !caught(RAW.replace('"utf8");', '"utf8").replace(/\\r\\n/g, "\\n");') + 'const e = MAP.indexOf("}\\n  }\\n", 5);\n'));
  rec("…over a reader that normalises",
    !caught('const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8").replace(/\\r\\n/g, "\\n");\nconst ov = read("page.js");\nconst at = ov.indexOf("(function () {\\n  async function f");\n'));
  rec("…normalised where it is searched", !caught(RAW + 'ok(/finally \\{ y\\(\\); \\}\\n\\s*\\}/.test(MAP.replace(/\\r\\n/g, "\\n")));\n'));
  rec("…or tried both ways in one statement",
    !caught(RAW + 'const at = MAP.indexOf("}\\n  }") >= 0 ? MAP.indexOf("}\\n  }") : MAP.indexOf("}\\r\\n  }");\n'));
  rec("an anchor that only starts at a line end is left alone — it matches either way",
    searchesIn(RAW + GRAB + 'const F = grab("function f", "\\n  }");\n').length === 0);
  rec("so is a needle the source does not hold: that search fails in every checkout",
    searchesIn(RAW + 'const e = MAP.indexOf("} finally { z(); }\\n  }");\n').length === 0);
  rec("so is the same needle searched for in another text, a fixture's output",
    searchesIn(RAW + 'const out = fs.readFileSync(path.join(dir, "out.txt"), "utf8");\nconst e = out.indexOf("}\\n  }\\n");\n').length === 0);
  rec("so is a string that spans a line end but is written or joined, not searched for",
    searchesIn(RAW + 'fs.writeFileSync(p, "}\\n  }\\n"); const t = rows.join("}\\n  }\\n");\n').length === 0);
  rec("and a search named only in a comment",
    searchesIn(RAW + '// MAP.indexOf("}\\n  }\\n") would not match a CRLF page\n').length === 0);
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  // a scratch folder this file made itself, under the system temp directory and nowhere else
  if (SCRATCH.startsWith(os.tmpdir()) && path.basename(SCRATCH).startsWith("nova-lift-eol-")) fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log(`\n=== a page lift reads the same text from a CRLF checkout: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
