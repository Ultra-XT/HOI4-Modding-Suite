// A map message that quotes a line from hoi4.exe says which launch writes it to error.log.
// ⛔ #a-map-message-says-which-launch-writes-the-line (tool campaign B6-25, the data half)
//
// THE DEFECT. Map Errors' rows said "HOI4 logs "no provinces in state"", "it logs "MAP_ERROR: …" and, unless the game was started
// with -debug, shows "Failed to load the map"", "HOI4 logs "Trying to set province building in state that doesn't own it"" … for
// lines a normal launch never writes. The 1.19.4.1 byte-read (engine-1194 combine, "Text a swap leaves half-true") found that
// every MAP_ERROR, the unit reader's lines, mapbuildings' port line and the strait line go out on the log flag word 0x10004, whose
// one file entry sits behind the debug byte that only -debug and -crash_data_log set; and the failed-load routine skips its screen
// on that same byte — so "logs X and, unless -debug, refuses" described two launches that exclude each other. The advice in each
// message was right; the owner's playtests read error.log, and these words sent the reader looking for lines that are not there.
// Re-read on the installed 1.19.5.0 (2026-11-12) the same way this test reads it: every line reworded is still on 0x10004.
//
// THE CHECKS.
//   1. The rows the Map Errors popup renders, for the finding's own shapes (an emptied state, a province building in a state that
//      does not hold the province, land left in no state), through GET /api/map/validate?modPath — the page's request.
//   2. DERIVED FROM THE SOURCE AND THE ENGINE: every line quoted inside a template literal of map-data.js (comments masked) is
//      looked up in the installed hoi4.exe — the strings that contain it, every RIP-relative LEA of them, and the flag word the log
//      entry is handed just before (`mov dword ptr [rsp+20h], imm32`, then the call). A line every one of whose sites is on 0x10004
//      is a -debug line, and its sentence must name -debug BEFORE quoting it. Without the exe this half prints a skip line.
//   3. Without the exe as well: a quoted "MAP_ERROR: …" line is a -debug line (the prefix itself is written on 0x10004), so the
//      same rule holds for every one, and nothing in map-data.js says `logs "MAP_ERROR`.
"use strict";

const fs = require("fs");
const path = require("path");

// The real game folder, read BEFORE the fixture world points HOI4_ROOT at its own little game.
const GAME_CANDIDATES = [process.env.HOI4_ROOT, "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
  "C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV"].filter(Boolean);
const REAL_EXE = GAME_CANDIDATES.map((g) => path.join(g, "hoi4.exe")).find((p) => { try { return fs.statSync(p).size > 10 * 1024 * 1024; } catch (_) { return false; } }) || null;

const lib = require("./testlib-two-layer-map.js");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

// ── the source side: every template literal of map-data.js, its ${…} holes made one placeholder, cut into sentences ──────────────
const HOLE = "\u0001";
/** Every template literal (nested ones too) as { line, text }: the STRUCTURE is read from maskJsLiterals (string, regex and template
 *  text blanked, delimiters and `${` kept, so a backtick or brace inside a regex or string is not one), the TEXT from maskJsComments. */
function templatesOf(raw) {
  const C = maskJsComments(raw), L = maskJsLiterals(raw), n = L.length;
  const starts = [0];
  for (let i = 0; i < n; i++) if (L[i] === "\n") starts.push(i + 1);
  const lineOf = (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
  const out = [];
  const scan = (start) => {
    let text = "", j = start + 1;
    while (j < n && L[j] !== "`") {
      if (L[j] === "$" && L[j + 1] === "{") {
        let d = 1, k = j + 2;
        while (k < n && d > 0) {
          if (L[k] === "`") { k = scan(k) + 1; continue; }
          if (L[k] === "{") d++; else if (L[k] === "}") d--;
          k++;
        }
        text += HOLE; j = k; continue;
      }
      text += C[j]; j++;
    }
    out.push({ line: lineOf(start), text });
    return j;
  };
  for (let i = 0; i < n; i++) if (L[i] === "`") i = scan(i);
  return out;
}
/** The double-quoted spans of a text, each with the sentence it sits in up to the quote (sentences end at . ! ? + space + capital,
 *  outside quotes). */
function quotesOf(text) {
  const out = [];
  let sentenceStart = 0, inQ = false, qStart = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (!inQ) { inQ = true; qStart = i; }
      else { inQ = false; out.push({ quote: text.slice(qStart + 1, i), before: text.slice(sentenceStart, qStart) }); }
      continue;
    }
    if (!inQ && /[.!?]/.test(c) && /\s/.test(text[i + 1] || "") && /[A-Z"“(]/.test(text[i + 2] || "")) sentenceStart = i + 1;
  }
  return out;
}
// A piece shorter than 12 characters ("countries/", "MAP_ERROR:") is part of too many unrelated strings to name one line.
const fragmentsOf = (q) => q.split(/…|\.\.\.|\u0001/).map((s) => s.trim()).filter((s) => s.length >= 12);

// ── the engine side: the installed hoi4.exe, read only ────────────────────────────────────────────────────────────────────────
function engineReader(exePath) {
  const buf = fs.readFileSync(exePath);
  const pe = buf.readUInt32LE(0x3c), nSec = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20), opt = pe + 24;
  const IB = Number(buf.readBigUInt64LE(opt + 24));
  const secs = [];
  for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: buf.readUInt32LE(s + 12), size: buf.readUInt32LE(s + 16), raw: buf.readUInt32LE(s + 20), ch: buf.readUInt32LE(s + 36) }); }
  const fileToVa = (off) => { const s = secs.find((x) => off >= x.raw && off < x.raw + x.size); return s ? IB + s.va + (off - s.raw) : -1; };
  const vaToFile = (va) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size); return s ? rva - s.va + s.raw : -1; };
  /** fragment -> the VAs of every NUL-terminated string that contains it */
  const stringsWith = (frag) => {
    const needle = Buffer.from(frag, "latin1"), out = new Set();
    let at = -1;
    while ((at = buf.indexOf(needle, at + 1)) !== -1) { let st = at; while (st > 0 && buf[st - 1] !== 0 && at - st < 400) st--; const va = fileToVa(st); if (va !== -1) out.add(va); }
    return [...out];
  };
  /** one pass over the executable sections: every RIP-relative LEA whose target is one of `targets` */
  const leasTo = (targets) => {
    const want = new Set(targets), out = new Map();
    for (const s of secs.filter((x) => x.ch & 0x20000000)) {
      for (let i = s.raw; i + 7 <= s.raw + s.size; i++) {
        if ((buf[i] & 0xfb) !== 0x48 || buf[i + 1] !== 0x8d || (buf[i + 2] & 0xc7) !== 0x05) continue;
        const va = IB + s.va + (i - s.raw), tgt = va + 7 + buf.readInt32LE(i + 3);
        if (want.has(tgt)) { if (!out.has(tgt)) out.set(tgt, []); out.get(tgt).push(va); }
      }
    }
    return out;
  };
  /** the flag word handed to the log entry just before a LEA: the nearest `mov dword ptr [rsp+20h], imm32` followed by a call */
  const flagBefore = (leaVa) => {
    const off = vaToFile(leaVa);
    for (let k = off - 8; k >= off - 0x240; k--) {
      if (buf[k] === 0xc7 && buf[k + 1] === 0x44 && buf[k + 2] === 0x24 && buf[k + 3] === 0x20) {
        for (let j = k + 8; j + 5 <= off; j++) if (buf[j] === 0xe8) return buf.readUInt32LE(k + 4);
      }
    }
    return null;
  };
  return { stringsWith, leasTo, flagBefore, size: buf.length };
}

const RAW = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
const QUOTES = templatesOf(RAW).flatMap((t) => quotesOf(t.text).map((q) => ({ ...q, line: t.line })));
const DEBUG_NAMED = /-debug\b/;

(async () => {
  console.log("1. ⭐⭐⭐ The rows Map Errors renders for the finding's own shapes");
  const world = lib.makeWorld("which-launch");
  const { createApp } = require("./server.js");
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    // State 3 emptied (its province 3 then belongs to no state), and state 1 setting a naval base on province 2, which is state 2's.
    const mod = world.mod("which launch", {
      "history/states/3-C.txt": lib.st(3, ""),
      "history/states/1-A.txt": lib.st(1, "4", { history: "\t\tbuildings = {\n\t\t\t2 = { naval_base = 1 }\n\t\t}\n" }),
    });
    const v = await srv.validate(mod);
    const rows = (v && v.problems) || [];
    const text = (re) => rows.filter((p) => re.test(String(p.message || "")));
    const empty = text(/no provinces in state/), stray = text(/Trying to set province building in state that doesn't own it/), stateless = text(/has no state\./);
    rec("CONTROL: validate answers, and renders a row for each shape (empty state, stray building, stateless land)",
      v && v.ok !== false && empty.length >= 1 && stray.length >= 1 && stateless.length >= 1, rows.map((p) => p.rule));
    const SAID = [/logs "no provinces in state"/, /logs "MAP_ERROR:/, /logs "Trying to set province building in state that doesn't own it"/];
    const saying = rows.filter((p) => SAID.some((re) => re.test(String(p.message || "")))).map((p) => `${p.rule}: ${String(p.message).slice(0, 200)}`);
    rec("⭐⭐⭐ no row says HOI4 logs a line a normal launch never writes", saying.length === 0, saying);
    const named = (p, line) => quotesOf(String(p.message || "")).filter((q) => q.quote.includes(line)).every((q) => DEBUG_NAMED.test(q.before));
    rec("⭐⭐ the empty-state row still quotes both lines, each AFTER saying only a -debug launch writes it",
      empty.every((p) => /"MAP_ERROR: no air base site defined for state"/.test(p.message) && named(p, "no provinces in state") && named(p, "MAP_ERROR: no air base site")), empty.map((p) => p.message));
    rec("⭐⭐ …and still says the map loads and carries on, and what a normal launch does when a game starts",
      empty.every((p) => /carries on/.test(p.message) && /unless launched with -debug, it stops with "Failed to load the map"/.test(p.message)), empty.map((p) => p.message));
    rec("⭐⭐ the stray-building row still quotes its line, after saying only a -debug launch writes it",
      stray.every((p) => named(p, "Trying to set province building in state that doesn't own it") && /skips the building/.test(p.message)), stray.map((p) => p.message));
    rec("⭐⭐ the stateless-land row: a normal launch refuses the map, and only a -debug launch writes the MAP_ERROR line",
      stateless.every((p) => /refuses to load that map/.test(p.message) && /unless the game was started with -debug it shows "Failed to load the map"/.test(p.message) && named(p, "MAP_ERROR: The land province")),
      stateless.map((p) => p.message));
  } catch (e) {
    rec("section 1 ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }

  console.log("\n2. ⭐⭐⭐ DERIVED: every line map-data.js quotes, classified by the installed hoi4.exe");
  rec("CONTROL: the template reader finds the quoted lines of map-data.js's messages", QUOTES.length >= 100 && QUOTES.some((q) => q.quote === "Failed to load the map"), QUOTES.length);
  if (!REAL_EXE) console.log("  SKIP — no hoi4.exe is installed in a known Steam folder: the engine-derived half did not run");
  else {
    const exe = engineReader(REAL_EXE);
    // the controls: lines the 1.19.4.1 byte-read measured on 0x10004, and one a launch WITHOUT -debug wrote (0x1000)
    const known = { "no provinces in state": "debug", "is not adjacent with THROUGH": "debug", "Trying to set invalid province building": "debug" };
    const NORMAL = "Strategic location for province";
    // the fragments to look up: every literal piece of each quoted span, longest first
    const byFrag = new Map();
    const look = (f) => { if (!byFrag.has(f)) byFrag.set(f, exe.stringsWith(f)); };
    for (const q of QUOTES) {
      const frags = fragmentsOf(q.quote).sort((a, b) => b.length - a.length);
      if (!frags.length) continue;
      q.frags = frags;
      frags.forEach(look);
    }
    Object.keys(known).forEach(look); look(NORMAL);
    const leas = exe.leasTo([...new Set([...byFrag.values()].flat())]);
    /** The longest piece the exe references decides: "debug" when EVERY site that references a string holding it hands the log
     *  0x10004, "other" when any site hands another word or none this reader can see (a printf-style logger), null when no site
     *  references it. Conservative on purpose: a line is called a -debug line only on the engine's whole word. */
    const classify = (frags) => {
      for (const f of frags) {
        const words = [];
        for (const sva of byFrag.get(f) || []) for (const l of leas.get(sva) || []) words.push(exe.flagBefore(l));
        if (!words.length) continue;
        return words.every((w) => w === 0x10004) ? "debug" : "other";
      }
      return null;
    };
    const ctl = Object.keys(known).map((line) => ({ line, got: classify([line]) }));
    rec(`CONTROL: the engine reader classifies lines the byte-read measured (${(exe.size / 1e6).toFixed(1)} MB exe)`, ctl.every((c) => c.got === known[c.line]), ctl);
    const ctlNormal = classify([NORMAL]);
    rec("CONTROL: …and does not call a normal-launch line a -debug one (the strategic-location line a launch without -debug wrote)", ctlNormal !== "debug", ctlNormal);
    const debugQuotes = QUOTES.filter((q) => q.frags && classify(q.frags) === "debug");
    console.log(`       (${QUOTES.length} quoted spans in map-data.js's templates; ${debugQuotes.length} of them are lines every site of which hands the log 0x10004)`);
    rec("the -debug lines quoted in map-data.js were found", debugQuotes.length >= 25, debugQuotes.length);
    const unqualified = debugQuotes.filter((q) => !DEBUG_NAMED.test(q.before)).map((q) => `map-data.js:${q.line}: …${q.before.slice(-90)}"${q.quote.slice(0, 80)}"`);
    rec("⭐⭐⭐ every -debug line map-data.js quotes comes after words saying only a -debug launch writes it", unqualified.length === 0, unqualified);
  }

  console.log("\n3. ⭐⭐ Without the exe: a MAP_ERROR line is a -debug line");
  {
    const mapErr = QUOTES.filter((q) => /^MAP_ERROR:/.test(q.quote));
    rec("the MAP_ERROR lines map-data.js quotes were found", mapErr.length >= 10, mapErr.length);
    const bare = mapErr.filter((q) => !DEBUG_NAMED.test(q.before)).map((q) => `map-data.js:${q.line}: …${q.before.slice(-90)}"${q.quote.slice(0, 60)}"`);
    rec("⭐⭐ every one comes after words saying only a -debug launch writes it", bare.length === 0, bare);
    const LIVE = maskJsComments(RAW);
    const logsMapError = (LIVE.match(/\blogs?\s+(?:it\s+)?\(?["“]MAP_ERROR/g) || []).length;
    rec("⭐⭐ …and no live text of map-data.js says HOI4 logs a MAP_ERROR line", logsMapError === 0, logsMapError);
  }

  console.log(`\n=== a map message says which launch writes the line: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
