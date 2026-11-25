"use strict";
// Read-only parser + lossless round-trip serializer for HOI4 common/bookmarks/*.txt — a mod's scenario
// setup (the start-screen). Structure: bookmarks = { bookmark = { name desc date picture default_country
// "TAG" = { history ideology ideas{} focuses{} } … effect{} } }. Reuses unit-data.js's generic top-level
// PDX splitter (which now also handles QUOTED keys, e.g. the "TAG" country blocks), recording each
// statement's offsets so the round-trip is byte-identical: serializeBookmarksFile(parseBookmarksFile(x)) === x.
// Read-only foundation for a future Bookmarks/scenario editor. Does NOT write game files.
const fs = require("fs");
const path = require("path");
const { splitTop } = require("./unit-data.js");

const innerBody = (v) => { const s = String(v || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}"); return (a >= 0 && b > a) ? s.slice(a + 1, b) : ""; };
const scalarOf = (stmts, key) => { const st = stmts.find((x) => x.key === key); if (!st) return null; let v = String(st.value || "").trim(); if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1); return v; };
// `ideas = { a b c }` / `focuses = { … }` are SPACE-SEPARATED bare tokens, not key=value — the generic PDX
// splitter would mis-pair them (a=b, c) and drop the middle, so tokenize on whitespace (comments stripped).
const tokenList = (value) => innerBody(value).replace(/#[^\n]*/g, " ").split(/\s+/).filter(Boolean);

// Fields of a bookmark that are NOT a selectable-country block (everything else with a `{ … }` value is one).
const BOOKMARK_FIELDS = new Set(["name", "desc", "date", "picture", "default_country", "effect", "default", "cyclical_setup"]);

function parseCountry(tag, value) {
  const b = splitTop(innerBody(value));
  const ideas = b.find((s) => s.key === "ideas"), focuses = b.find((s) => s.key === "focuses");
  return {
    tag,
    history: scalarOf(b, "history"),
    ideology: scalarOf(b, "ideology"),
    minor: scalarOf(b, "minor"),
    ideas: ideas ? tokenList(ideas.value) : [],
    focuses: focuses ? tokenList(focuses.value) : [],
  };
}
function parseBookmark(value) {
  const b = splitTop(innerBody(value));
  const countries = [];
  for (const st of b) {
    if (BOOKMARK_FIELDS.has(st.key)) continue;
    if (String(st.value || "").trim()[0] !== "{") continue; // a selectable-country block: "TAG" = { … }
    countries.push(parseCountry(st.key, st.value));
  }
  return {
    name: scalarOf(b, "name"),
    desc: scalarOf(b, "desc"),
    date: scalarOf(b, "date"),
    picture: scalarOf(b, "picture"),
    default_country: scalarOf(b, "default_country"),
    countries,
  };
}

/** Parse a bookmarks file → { bookmarks:[…], _segments, _trailing }. _segments capture every byte for a
 *  byte-identical round-trip; `bookmarks` is the read-only display model. */
function parseBookmarksFile(text) {
  const src = String(text || "");
  const segments = [];
  const bookmarks = [];
  let cursor = 0;
  for (const st of splitTop(src)) {
    segments.push({ gap: src.slice(cursor, st.start), text: src.slice(st.start, st.end) });
    cursor = st.end;
    if (st.key === "bookmarks") {
      for (const bm of splitTop(innerBody(st.value))) if (bm.key === "bookmark") bookmarks.push(parseBookmark(bm.value));
    }
  }
  return { bookmarks, _segments: segments, _trailing: src.slice(cursor) };
}

/** Reproduce the file from a parsed model. Byte-identical to the input when unedited. */
function serializeBookmarksFile(parsed) {
  if (!parsed || !Array.isArray(parsed._segments)) return "";
  let out = "";
  for (const s of parsed._segments) out += s.gap + s.text;
  return out + (parsed._trailing || "");
}

/** Compact summary for a read-only listing/viewer. */
function summarizeBookmarksFile(text) {
  return parseBookmarksFile(text).bookmarks.map((b) => ({
    name: b.name, date: b.date, default_country: b.default_country, countries: b.countries.length,
  }));
}

/** List a mod's bookmark files (common/bookmarks/*.txt). Read-only. */
function listBookmarkFiles(modRoot) {
  const dir = path.join(modRoot, "common", "bookmarks");
  try { return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { return []; }
}

module.exports = { parseBookmarksFile, serializeBookmarksFile, summarizeBookmarksFile, listBookmarkFiles };
