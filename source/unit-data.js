"use strict";
// Read-only parser + lossless round-trip serializer for HOI4 history/units/*.txt — a country's starting
// Order of Battle. Models the three top-level blocks:
//   • division_template = { name, regiments = { <unit> = { x y } … }, support = { … }, priority, … }
//   • units = { division = { name location division_template … }  air_wings = {…}  navy = {…} }
//   • instant_effect = { add_equipment_to_stockpile = { type amount producer variant_name } … }
// Built on a generic top-level PDX splitter that records each statement's [start,end] so EVERY byte —
// inter-statement whitespace, comments, the leading BOM — is preserved: serializeUnitsFile(parseUnitsFile(x))
// === x, by construction. This is the read-only foundation for a future Division Templates editor (the #1
// missing editor). It does NOT write game files yet.
const fs = require("fs");
const path = require("path");

// Generic Clausewitz top-level statement splitter. Returns [{ key, op, value, text, start, end }] where
// value is the raw RHS (a `{ … }` block incl. braces, a "quoted" string, or a bare scalar) and [start,end)
// are offsets into `body`. Handles quoted strings, # comments and nested braces. Same algorithm as
// server.js splitTopLevelPdxStatements, plus offsets (so callers can preserve the gaps between statements).
function splitTop(body) {
  const out = [];
  const s = String(body || "");
  const n = s.length;
  const isIdent = (c) => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-" || c === ":";
  const skipWs = (i) => {
    while (i < n) {
      const c = s[i];
      if (c === "#") { while (i < n && s[i] !== "\n") i++; }
      else if (c === " " || c === "\t" || c === "\r" || c === "\n") i++;
      else break;
    }
    return i;
  };
  let i = 0;
  while (i < n) {
    i = skipWs(i);
    if (i >= n) break;
    const keyStart = i;
    let key;
    if (s[i] === "\"") {
      // A quoted key, e.g. a bookmark country block:  "PER" = { … }. `key` is unquoted for the model;
      // `text` (from keyStart) still includes the quotes so the round-trip stays byte-perfect.
      let j = i + 1;
      while (j < n && s[j] !== "\"") { if (s[j] === "\\") j++; j++; }
      key = s.substring(i + 1, j);
      i = j + 1;
    } else {
      while (i < n && isIdent(s[i])) i++;
      key = s.substring(keyStart, i);
      if (!key) { i++; continue; } // stray non-identifier char (a lone brace / BOM) — skip, it stays in the gap
    }
    // #bare-token-list — Clausewitz has two shapes here, and this only understood one. `key = value` pairs a
    // key with a value, but `{ a b c d e }` is a LIST of bare tokens with no operators at all. Collecting an
    // OPTIONAL operator and then unconditionally consuming the next token made the list parse as
    // {a:b},{c:d},{e:""} — so a caller taking `.key` off each entry got every SECOND token.
    //
    // That is how GET /api/subunits returned half of each sub_unit's `categories` and `type`: measured against
    // vanilla, 90 of 105 categories blocks and 63 of 100 type blocks came back wrong. It reaches the Division
    // Template Designer, which picks a unit's NATO symbol from those lists and buckets a support company by
    // `types.includes("support")` — so a modded company declaring itself only via `type = { infantry support }`
    // landed in the LINE box instead of SUPPORT.
    const keyEnd = i;
    i = skipWs(i);
    let op = "";
    while (i < n && (s[i] === "=" || s[i] === "<" || s[i] === ">")) { op += s[i]; i++; }
    if (!op) {
      // No operator: this token is a list item, complete in itself. Resume at the token's end so the next
      // iteration reads the FOLLOWING token as its own entry rather than swallowing it as this one's value.
      out.push({ key, op: "", value: "", text: s.substring(keyStart, keyEnd), start: keyStart, end: keyEnd });
      i = keyEnd;
      continue;
    }
    i = skipWs(i);
    const valStart = i;
    if (s[i] === "{") {
      let d = 0;
      for (; i < n; i++) {
        const c = s[i];
        if (c === "\"") { i++; while (i < n && s[i] !== "\"") { if (s[i] === "\\") i++; i++; } }
        else if (c === "#") { while (i < n && s[i] !== "\n") i++; i--; }
        else if (c === "{") d++;
        else if (c === "}") { d--; if (d === 0) { i++; break; } }
      }
    } else if (s[i] === "\"") {
      i++; while (i < n && s[i] !== "\"") { if (s[i] === "\\") i++; i++; } i++;
    } else {
      while (i < n && s[i] !== " " && s[i] !== "\t" && s[i] !== "\r" && s[i] !== "\n" && s[i] !== "#") i++;
    }
    out.push({ key, op, value: s.substring(valStart, i), text: s.substring(keyStart, i), start: keyStart, end: i });
  }
  return out;
}

// Strip the outer { } from a block value → its inner body.
function innerBody(value) {
  const s = String(value || "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  return (a >= 0 && b > a) ? s.slice(a + 1, b) : "";
}
// Unquoted scalar of the first `key` in a list of statements.
function scalarOf(stmts, key) {
  const st = stmts.find((x) => x.key === key);
  if (!st) return null;
  let v = String(st.value || "").trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
  return v;
}
const num = (v) => { if (v == null || v === "") return null; const k = Number(v); return Number.isFinite(k) ? k : v; };

// regiments / support inner body → [{ unit, x, y }] (a unit at a grid slot).
function parseSlots(value) {
  const out = [];
  for (const st of splitTop(innerBody(value))) {
    const sub = splitTop(innerBody(st.value));
    out.push({ unit: st.key, x: num(scalarOf(sub, "x")), y: num(scalarOf(sub, "y")) });
  }
  return out;
}
function parseTemplate(value) {
  // #template-key-case-variant — LOOK THE KEYS UP CASE-INSENSITIVELY. Millennium Dawn writes
  // `Support = { … }` on its special-forces and marine templates, each holding two real support companies,
  // and an exact match reported `support: []` — the designer showed those templates as having none. Only
  // the lookup copy is lowered; the statements themselves are untouched.
  const b = splitTop(innerBody(value)).map((s) => (/[A-Z]/.test(String(s.key)) ? Object.assign({}, s, { key: String(s.key).toLowerCase() }) : s));
  const reg = b.find((s) => s.key === "regiments"), sup = b.find((s) => s.key === "support");
  return {
    name: scalarOf(b, "name"),
    regiments: reg ? parseSlots(reg.value) : [],
    support: sup ? parseSlots(sup.value) : [],
    priority: num(scalarOf(b, "priority")),
    division_names_group: scalarOf(b, "division_names_group"),
    // Common template metadata — modeled so the designer can edit them (and so they round-trip). Any OTHER
    // un-modeled field survives via mergePreservedTemplateBlock. #template-metadata
    template_counter: num(scalarOf(b, "template_counter")),
    is_locked: scalarOf(b, "is_locked"),
    override_model: scalarOf(b, "override_model"),
  };
}
// Whole-line comments sitting directly above a statement, e.g. the `#Popular Defence Forces` headers MD uses
// to group an order of battle. Walks back from the statement's own offset and stops at a blank line or any
// code, so only the block immediately above comes along — a comment separated by a blank line belongs to the
// file, not to this division.
function leadingCommentLines(body, startOff) {
  if (!body || !Number.isFinite(startOff)) return null;
  const lines = String(body).slice(0, startOff).split(/\r?\n/);
  lines.pop(); // the statement's own indentation, not a full line
  const picked = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i].trim();
    if (!t || !t.startsWith("#")) break;
    picked.unshift(t);
  }
  return picked.length ? picked : null;
}

// #oob-edit-deletes-units-block-comments — the WHOLE comment region above a statement, blank lines and all.
//
// leadingCommentLines above stops at the first blank line, on the reasoning that a comment separated by one
// belongs to the file rather than to the statement. That is the right rule for deciding what to CARRY WITH a
// statement that moves. It is the wrong rule for deciding what to KEEP, and keeping is what the units-block
// rebuild is doing: everything the walk refused to attach was simply deleted. Measured by marking ONE
// division dirty (an ordinary edit) across every order of battle that ships: 1,198 comment lines lost from
// 138 of 774 files — Millennium Dawn's CHI_2000_nonnsb.txt goes 249 -> 54, vanilla's ETH_1936_bba.txt
// 299 -> 201, HOL_1936.txt 87 -> 7. Most of what goes are commented-out RESERVE division blocks and ASCII
// section banners, i.e. content the author is deliberately keeping to re-enable later.
//
// Returns the region VERBATIM (comments and the blank lines between them, leading blanks trimmed) so
// re-emitting it reproduces the author's layout rather than a normalised guess at it. Stops at any code, so
// it can never swallow a statement.
function leadingCommentRegion(body, startOff) {
  if (!body || !Number.isFinite(startOff)) return "";
  const lines = String(body).slice(0, startOff).split(/\r?\n/);
  lines.pop(); // the statement's own indentation, not a full line
  let i = lines.length - 1;
  for (; i >= 0; i -= 1) {
    const t = lines[i].trim();
    if (t && !t.startsWith("#")) break;
  }
  const region = lines.slice(i + 1);
  while (region.length && !region[0].trim()) region.shift();   // leading blanks belong to the statement above
  while (region.length && !region[region.length - 1].trim()) region.pop();
  return region.length ? region.join("\n") : "";
}

/** Everything after the LAST statement in a block body: comments with nothing below them to attach to. */
function trailingCommentRegion(body, lastEnd) {
  if (!body || !Number.isFinite(lastEnd)) return "";
  const rest = String(body).slice(lastEnd).split(/\r?\n/);
  rest.shift(); // remainder of the last statement's own line
  const kept = [];
  for (const l of rest) {
    const t = l.trim();
    if (t && !t.startsWith("#")) return "";  // real code down here — not ours to move
    kept.push(l);
  }
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.length ? kept.join("\n") : "";
}

function parseUnits(value) {
  const divisions = [], airWings = [], navy = [];
  const body = innerBody(value);
  for (const st of splitTop(body)) {
    if (st.key === "division") {
      const d = splitTop(innerBody(st.value));
      // officer = { name = "…" } is HOI4's native per-division commander at game start (verified: 115
      // uses in vanilla). start_equipment_factor is the 0–1 starting equipment readiness. Both are read
      // so the UI can show them; _raw still keeps the block verbatim so a preserve-merge save re-emits any
      // un-modeled field (start_experience_factor, force_equipment_variants, …) unchanged.
      // officer = { name = "…" [portraits = { army = { small large } }] }. Nova models only the name, but the
      // officer block can carry a portraits sub-block (MD ships it on ~97 divisions). Capture the non-name
      // statements verbatim so a dirty regenerate (via genDivision) doesn't delete the commander's portrait. #div-preserve
      const offSt = d.find((x) => x.key === "officer");
      const offInner = offSt ? splitTop(innerBody(offSt.value)) : [];
      const officer = offSt ? scalarOf(offInner, "name") : null;
      // #oob-save-indentation-grows-unbounded — NORMALISE to depth 0 here, so what is stored is canonical
      // regardless of how deep it sat in the file. `.trim()` only strips the FIRST line, so a multi-line
      // `portraits = { army = { … } }` kept its original inner indentation and the emitter then prepended
      // three more tabs to every line — compounding by +3 per save. Vanilla's HUN_wuw_1936.txt went from 5
      // leading tabs to 20 over five edits.
      const officerExtra = offInner.filter((s) => s.key !== "name")
        .map((s) => _reindent(String(s.text), 0)).filter((s) => s.trim()).join("\n");
      const ef = scalarOf(d, "start_equipment_factor");
      const xf = scalarOf(d, "start_experience_factor");
      const mf = scalarOf(d, "start_manpower_factor"); // 0–1 starting manpower readiness; MD ships 0.5/0.8 — a
      // dirty-division regenerate dropped it (genDivision never emitted it), so an edited unit reverted to full. #div-preserve
      // force_equipment_variants = { <archetype> = { owner creator version_name } … } — pins a specific
      // DESIGNED variant to this division's equipment at game start (NSB). #5b
      // A division may legally REPEAT the statement — MD writes one archetype per line (7 on CUB's name_order 86;
      // 817 of MD's 5121 divisions have >1). A `.find` read only the FIRST, so every later block was invisible to
      // the model and genDivision silently deleted it on any regeneration (e.g. a template rename dirties every
      // division using it) — leaving divisions with rifles only. filter + flatten ALL of them. #5b
      const forceVariants = [];
      for (const fevSt of d.filter((x) => x.key === "force_equipment_variants")) {
        for (const av of splitTop(innerBody(fevSt.value))) {
          if (!av.key || !/^\{/.test(String(av.value || "").trim())) continue;
          const iv = splitTop(innerBody(av.value));
          const amt = scalarOf(iv, "amount"); // vanilla uses amount = N (e.g. BT-5 amount = 250) — must not be dropped
          forceVariants.push({ archetype: av.key, owner: scalarOf(iv, "owner"), creator: scalarOf(iv, "creator"), version_name: scalarOf(iv, "version_name"), amount: (amt == null || amt === "") ? null : num(amt) });
        }
      }
      // division_name = { is_name_ordered=yes name_order=N [name=…] } gives the division its ordered name; a
      // division-level owner = TAG gifts the unit to another country at game start. Neither is emitted by
      // genDivision, so model them as first-class fields that round-trip GET→save→emit — otherwise ANY edit that
      // regenerates the block (e.g. a template rename that dirties every division using it) silently drops the
      // ordered name / gifted owner. #div-preserve
      const dnSt = d.find((x) => x.key === "division_name");
      const divisionName = dnSt ? innerBody(dnSt.value).trim() : null;
      const owner = scalarOf(d, "owner");
      // #oob-save-eats-location-comments — Millennium Dawn annotates every division's province with the place
      // name (`location = 12862\t\t#As Shajarah`) across all 924 of its OOB files, and section headers like
      // `#Popular Defence Forces` group them. genDivision re-emits location from the parsed number, so a save
      // stripped all of it: on one 325-line Sudanese OOB, 17 place names and 2 headers, silently.
      //
      // The comment is only re-emitted when the location is UNCHANGED. A division moved to another province
      // must not keep a comment naming the old one — a stale label is worse than none, so the parsed value it
      // belonged to is remembered and compared at write time.
      // Read the comment off the division's RAW text, not the location statement's: splitTop ends a statement
      // at the end of its value, so `location = 12862\t\t#As Shajarah` gives a text of just `location = 12862`.
      const locComment = ((/\blocation\s*=\s*\d+[ \t]*(#[^\n\r]*)/.exec(String(st.text || "")) || [])[1] || "").trim();
      divisions.push({
        locationComment: locComment || null,
        locationCommentFor: locComment ? num(scalarOf(d, "location")) : null,
        leadComment: leadingCommentLines(body, st.start),
        // …and the full region, blank lines and all, for the rebuild to re-emit verbatim.
        // #oob-edit-deletes-units-block-comments
        leadRegion: leadingCommentRegion(body, st.start),
        name: scalarOf(d, "name"), location: num(scalarOf(d, "location")), template: scalarOf(d, "division_template"),
        officer: officer || null, officerExtra: officerExtra || "", equipmentFactor: (ef == null || ef === "") ? null : num(ef),
        experience: (xf == null || xf === "") ? null : num(xf), forceVariants,
        manpowerFactor: (mf == null || mf === "") ? null : num(mf),
        owner: (owner == null || owner === "") ? null : owner, divisionName: divisionName || null, _raw: st.text,
      });
    } else if (st.key === "air_wings") airWings.push(st.text);
    else if (st.key === "navy" || st.key === "fleet") navy.push(st.text); // MD naval OOB uses `fleet`, not `navy`
  }
  return { divisions, airWings, navy };
}
/** Stockpile entries from a body that is ALREADY a list of top-level statements — a whole country-history
 * file, for instance. Split out from parseStockpile because that one strips a wrapper brace pair first (its
 * caller hands it an `instant_effect = { … }` value), and running it over a whole file therefore parsed the
 * range between the FIRST `{` and the LAST `}` — which drops the first block entirely and only looked right
 * on files that happen to declare several. #stockpile-in-country-history-invisible */
function parseStockpileBody(body) {
  const out = [];
  // add_equipment_to_stockpile blocks are often wrapped in DLC-gated `if`/`else` (etc.), e.g.
  // `if = { limit = { has_dlc = … } add_equipment_to_stockpile = { … } … }`. Recurse into those wrappers so
  // the display model doesn't silently undercount DLC equipment.
  const walk = (body) => {
    for (const st of splitTop(body)) {
      // CASE-INSENSITIVELY. Paradox script keywords are, and vanilla uses it: CHI - China.txt wraps both of
      // its stockpile blocks in `IF = {` in capitals, eight levels deep, so a case-sensitive comparison
      // reported that country as having no starting equipment at all. #stockpile-in-country-history-invisible
      const key = String(st.key || "").toLowerCase();
      if (key === "add_equipment_to_stockpile") {
        const e = splitTop(innerBody(st.value));
        out.push({ type: scalarOf(e, "type"), amount: num(scalarOf(e, "amount")), producer: scalarOf(e, "producer"), variant_name: scalarOf(e, "variant_name") });
      } else if (key === "if" || key === "else" || key === "else_if" || key === "hidden_effect" || key === "random") {
        walk(innerBody(st.value));
      }
    }
  };
  walk(body);
  return out;
}

/** Stockpile entries from an `instant_effect = { … }` VALUE (the wrapper braces are stripped first). */
function parseStockpile(value) {
  return parseStockpileBody(innerBody(value));
}

/**
 * Parse a history/units file into a read-only model. `_segments` + `_trailing` capture every byte so the
 * serializer can reproduce the file exactly; `templates`/`units`/`stockpiles` are the display model.
 */
function parseUnitsFile(text) {
  const src = String(text || "");
  const stmts = splitTop(src);
  const templates = [], units = { divisions: [], airWings: [], navy: [] }, stockpiles = [];
  const segments = [];
  let cursor = 0;
  for (const st of stmts) {
    segments.push({ gap: src.slice(cursor, st.start), text: src.slice(st.start, st.end), key: st.key });
    cursor = st.end;
    if (st.key === "division_template") templates.push(Object.assign(parseTemplate(st.value), { _raw: st.text }));
    else if (st.key === "units") { const u = parseUnits(st.value); units.divisions.push(...u.divisions); units.airWings.push(...u.airWings); units.navy.push(...u.navy); }
    else if (st.key === "instant_effect") stockpiles.push(...parseStockpile(st.value));
    // Some OOB files put these at the FILE top level rather than inside a `units = {}` wrapper.
    else if (st.key === "air_wings") units.airWings.push(st.text);
    else if (st.key === "navy" || st.key === "fleet") units.navy.push(st.text);
  }
  return { templates, units, stockpiles, _segments: segments, _trailing: src.slice(cursor) };
}

/** Reproduce the file from a parsed model. Byte-identical to the input when unedited. */
function serializeUnitsFile(parsed) {
  if (!parsed || !Array.isArray(parsed._segments)) return "";
  let out = "";
  for (const s of parsed._segments) out += s.gap + s.text;
  return out + (parsed._trailing || "");
}

/** Compact summary for a read-only listing/viewer. */
function summarizeUnitsFile(text) {
  const m = parseUnitsFile(text);
  return {
    templates: m.templates.map((t) => ({ name: t.name, regiments: t.regiments.length, support: t.support.length })),
    divisions: m.units.divisions.length,
    airWings: m.units.airWings.length,
    navy: m.units.navy.length,
    stockpileTypes: m.stockpiles.length,
  };
}

/**
 * Aggregate a country's OOB across its (DLC-variant) files into one read-only picture: unique division
 * templates (by name), de-duped division instances, and equipment stockpile summed by type. MD splits a
 * country into TAG_year_{bba,nonbba,nsb,nonnsb}.txt — templates/divisions in one, DLC equipment in others —
 * so the full starting army only emerges by combining them. `files` = [{ templates, divisions, stockpiles }].
 */
function aggregateOob(files) {
  const tpl = new Map(), stock = new Map(), divSeen = new Set(), divisions = [];
  for (const f of files || []) {
    for (const t of f.templates || []) if (t && t.name && !tpl.has(t.name)) tpl.set(t.name, { name: t.name, regiments: (t.regiments || []).length, support: (t.support || []).length });
    for (const d of f.divisions || []) { const k = (d.name || "") + "|" + (d.location == null ? "" : d.location) + "|" + (d.template || ""); if (divSeen.has(k)) continue; divSeen.add(k); divisions.push(d); }
    for (const s of f.stockpiles || []) { if (!s || !s.type) continue; stock.set(s.type, (stock.get(s.type) || 0) + (Number(s.amount) || 0)); }
  }
  const stockpile = [...stock.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
  return { templates: [...tpl.values()], divisions, stockpile };
}

/** List a country's units files in a mod root (history/units/<TAG>_*.txt). Read-only. */
function listCountryUnitFiles(modRoot, tag) {
  const dir = path.join(modRoot, "history", "units");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; }
  const T = String(tag || "").trim().toUpperCase();
  if (T) files = files.filter((f) => f.toUpperCase().startsWith(T + "_") || f.toUpperCase() === T + ".TXT");
  return files.sort();
}

// ── Editing / write support (Army Maker) ─────────────────────────────────────────────────────────
// The parser above is round-trip-only (serializeUnitsFile reproduces UNCHANGED input). To EDIT an OOB
// we regenerate the division_template + units blocks from the model while PRESERVING every block the
// Army Maker doesn't manage (equipment stockpiles / instant_effect, air wings, fleets, comments) —
// the same drop-nothing preserve-merge the other makers use. Un-modeled fields on a template/division
// that the user DIDN'T touch survive because we re-emit that block's original raw text (matched by name
// for templates, by name|location|template for divisions).

// HOI4 quoted strings have no escape sequence — a literal " just ends the string. So sanitise: drop
// quotes + newlines rather than backslash-escaping them.
//
// Strip what would break the quoted `name = "…"` line or the surrounding script — CR, LF, the other C0
// controls, DEL, and braces (an unbalanced { or } in a name would trip the brace guard or corrupt the block).
//
// #name-sanitize-deletes-a-legal-hash — and NOT `#`, which this deleted on the reasoning that "Nova's brace
// checker treats it as a comment even mid-name". That checker is braceBalanceOf in mod-index.js, and it tests
// `inStr` BEFORE it tests `#`, so a hash inside a quoted string has not started a comment there for some
// time. The checker was fixed; this never adopted it. A hash inside a quoted string is legal Clausewitz and
// Paradox's own content uses it — vanilla writes `version_name = "FT mod. #31"` in AFG_1936_nsb.txt and
// `"van #Voorst tot Voorst"` in 00_names.txt. Deleting it renumbered Road to 56's "Nacistas Militia #1…#7"
// to "…1…7".
//
// Nor the TAB, for the same reason: deleting it ran "Armored\tDivision" together as "ArmoredDivision".
//
// Measured over 118,381 real names, templates, officers and variant names in the corpus: 0 braces, 0 CR/LF,
// 0 other controls, 27 hashes, 6 tabs. Nothing relies on a brace, and everything that carries a hash or a tab
// put it there on purpose. Same set as the arsenal's cleanVarName, so both write paths sanitize identically.
// #name-sanitize
/**
 * Emit a PDX quoted string whose closing quote cannot be escaped away.
 *
 * #oob-name-backslash — this stripped `"` but left `\` alone. splitTop (the reader in this file) honours `\`
 * as an escape but does NOT unescape, so a name arrives in the model still carrying its backslashes.
 * Millennium Dawn ships exactly that, in both Venezuela OOBs:
 *     name = "11 Brigada de Blindados \"Brigadier Pedro Ruiz Rondon\""
 * Deleting the quotes from `\"Brigadier…\"` left `\Brigadier…\`, so the line came back out as
 *     name = "11 Brigada de Blindados \Brigadier Pedro Ruiz Rondon\"
 * where the final `\"` escapes the CLOSING quote — the string runs on past the end of the name and swallows
 * whatever follows it.
 *
 * So escape pairs are preserved as-is, a bare quote is escaped rather than deleted (which is how MD's own
 * files write one), and a trailing lone backslash is doubled so it can never eat the closing quote.
 */
function qstr(v) {
  const raw = String(v == null ? "" : v).replace(/[\x00-\x08\x0a-\x1f\x7f{}]/g, ""); // \x09 (tab) and # survive
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") {
      if (i + 1 < raw.length) { out += "\\" + raw[i + 1]; i++; } // keep an existing escape pair intact
      else out += "\\\\";                                        // trailing lone backslash — double it
    } else if (c === '"') out += '\\"';                          // bare quote — escape, don't delete
    else out += c;
  }
  return `"${out}"`;
}
const _tok = (v) => String(v == null ? "" : v).replace(/[^\w.:-]/g, "");

function genDivisionTemplate(t) {
  const L = ["division_template = {"];
  L.push(`\tname = ${qstr(t.name || "New Template")}`);
  if (t.division_names_group) L.push(`\tdivision_names_group = ${_tok(t.division_names_group)}`);
  if (t.template_counter != null && t.template_counter !== "") L.push(`\ttemplate_counter = ${clampInt(t.template_counter, 0, 1e9)}`);
  if (t.is_locked === "yes" || t.is_locked === true) L.push(`\tis_locked = yes`);
  if (t.override_model) L.push(`\toverride_model = ${_tok(t.override_model)}`);
  L.push("\tregiments = {");
  for (const s of t.regiments || []) if (s && s.unit) L.push(`\t\t${_tok(s.unit)} = { x = ${clampInt(s.x, 0, 1000)} y = ${clampInt(s.y, 0, 1000)} }`);
  L.push("\t}");
  const sup = (t.support || []).filter((s) => s && s.unit);
  if (sup.length) {
    L.push("\tsupport = {");
    for (const s of sup) L.push(`\t\t${_tok(s.unit)} = { x = ${clampInt(s.x, 0, 1000)} y = ${clampInt(s.y, 0, 1000)} }`);
    L.push("\t}");
  }
  if (t.priority != null && t.priority !== "") L.push(`\tpriority = ${clampInt(t.priority, 0, 1000)}`);
  return L.join("\n") + "\n}";
}

// Preserve every top-level field the regenerated template block does NOT itself emit — so editing a
// template's regiments/priority no longer DROPS un-modeled fields (is_locked, template_counter,
// override_model, force_equipment_variants, type, …). Same drop-nothing contract as the equipment writer.
// #template-metadata
// Every top-level key genDivisionTemplate CAN emit — a cleared one (e.g. unchecking is_locked, blanking the
// names group) is intentionally absent from the regenerated block, so it must NOT be re-added from the old
// block or the clear silently reverts. Only keys OUTSIDE this set (force_equipment_variants, type, …) are
// genuinely un-modeled and preserved. #template-preserve (matches MIO_OWNED_KEYS / the module+upgrade writers)
const TEMPLATE_OWNED_KEYS = new Set(["name", "division_names_group", "template_counter", "is_locked", "override_model", "regiments", "support", "priority"]);
function mergePreservedTemplateBlock(newBlock, oldRaw) {
  try {
    if (!oldRaw) return newBlock;
    const oldInner = innerBody(oldRaw);
    const oldSts = splitTop(oldInner);
    // #template-key-case-variant — compare keys case-insensitively, or `Support` is not recognised as one
    // Nova owns, gets carried forward as an unknown field, and sits beside the `support` the generator
    // emits. `spelling` remembers how the author wrote each owned key so it can go back that way.
    const lower = (k) => String(k == null ? "" : k).toLowerCase();
    const newKeys = new Set(splitTop(innerBody(newBlock)).map((s) => lower(s.key)));
    const spelling = new Map();

    // #oob-save-eats-template-comments — the same shape as the divisions and the equipment block: this kept
    // old top-level statements BY KEY, and a comment is not a statement. Millennium Dawn annotates its
    // templates ("#Motorized Brigade (trucks?)" above the regiments of Jidong Bubing Lu), and a save that
    // regenerated the template deleted every one.
    //
    // Two placements are needed, because the comment can sit above a field Nova REBUILDS (regiments, name)
    // as well as above one it merely preserves. For a rebuilt field the comment is injected above that key's
    // new line; for a preserved one it rides along with the text. genDivisionTemplate never emits comments,
    // so nothing can be duplicated by running this twice.
    const commentsFor = new Map();
    for (const s of oldSts) {
      const lead = leadingCommentLines(oldInner, s.start);
      if (lead) commentsFor.set(lower(s.key), lead);
    }

    const keep = [];
    for (const s of oldSts) {
      const lk = lower(s.key);
      if (newKeys.has(lk) || TEMPLATE_OWNED_KEYS.has(lk)) {
        if (lk !== s.key) spelling.set(lk, s.key); // the author's casing, to be restored below
        continue;
      }
      const lead = commentsFor.get(s.key);
      if (lead) for (const c of lead) keep.push(c);
      keep.push(String(s.text).trim());
    }

    let merged = newBlock;
    // …and the author's CASING on the keys it rewrote, before anything else touches the text. Rewriting
    // `Support` to `support` would change a template nobody asked to change. #template-key-case-variant
    for (const [lk, asWritten] of spelling) {
      const re = new RegExp(`(^|\\n)([ \\t]*)${lk}(\\s*=)`, "g");
      merged = merged.replace(re, (_m, lead, ind, tail) => `${lead}${ind}${asWritten}${tail}`);
    }
    // Put back the annotations on fields the generator rewrote.
    for (const [key, lead] of commentsFor) {
      if (!newKeys.has(key)) continue;
      const re = new RegExp(`(^|\\n)([ \\t]*)${key}\\s*=`);
      const m = re.exec(merged);
      if (!m) continue;
      const at = m.index + (m[1] ? m[1].length : 0);
      const indent = m[2] || "\t";
      merged = merged.slice(0, at) + lead.map((c) => indent + c).join("\n") + "\n" + merged.slice(at);
    }

    if (!keep.length) return merged;
    const lastClose = merged.lastIndexOf("}");
    if (lastClose < 0) return merged;
    const before = merged.slice(0, lastClose).replace(/\s*$/, "\n");
    return before + keep.map((l) => "\t" + l).join("\n") + "\n" + merged.slice(lastClose);
  } catch (_) { return newBlock; }
}

function genDivision(d) {
  // Section headers grouping an order of battle ("#Popular Defence Forces") sit above the division they
  // introduce, so they are re-emitted above it rather than collected elsewhere.
  // #oob-save-eats-location-comments
  const L = [];
  // #oob-edit-deletes-units-block-comments — prefer the FULL region over the contiguous run. leadComment
  // stops at the first blank line, so a division introduced by a paragraph of author notes — Millennium
  // Dawn's AFG_2000 opens its units block with eleven lines of sourcing across three paragraphs — kept only
  // the last paragraph and silently dropped the rest the moment that division was edited. The region is
  // verbatim (blank lines included), so the author's layout comes back exactly as written.
  if (typeof d.leadRegion === "string" && d.leadRegion.trim()) {
    for (const c of d.leadRegion.replace(/\r/g, "").split("\n")) L.push(c.trim() ? `\t${c.trim()}` : "");
  } else if (Array.isArray(d.leadComment)) {
    for (const c of d.leadComment) L.push(`\t${c}`);
  }
  L.push("\tdivision = {");
  // Un-modeled-by-the-UI but must survive an edit: the ordered-name block and a gifted owner tag. #div-preserve
  if (d.divisionName != null && String(d.divisionName).trim() !== "") {
    const dn = String(d.divisionName).trim();
    // If the preserved inner spans lines or carries a `#` comment (real MD data does — e.g. FRA's
    // `name_order = 1 #Change…`), keep the closing brace on its OWN line so a trailing comment can't swallow it
    // and unbalance the file. Plain one-liners stay one-line. #div-preserve
    if (/[#\n]/.test(dn)) L.push(`\t\tdivision_name = {\n\t\t\t${dn.replace(/\r?\n[ \t]*/g, "\n\t\t\t")}\n\t\t}`);
    else L.push(`\t\tdivision_name = { ${dn} }`);
  }
  if (d.name) L.push(`\t\tname = ${qstr(d.name)}`);
  if (d.owner != null && String(d.owner).trim() !== "") L.push(`\t\towner = ${_tok(String(d.owner).trim())}`);
  // Re-attach the place-name comment, but ONLY when the province is unchanged — a division moved elsewhere
  // must not keep a label naming where it used to be. #oob-save-eats-location-comments
  {
    // A MISSING location must not become province 0. `clampInt(null, 0, …)` is Math.floor(Number(null)) = 0,
    // which is finite, so the guard passed and the division was written as `location = 0`. Province 0 does
    // not exist, so the division simply never spawns — a silent nothing rather than a visible error.
    // Refusing is the honest answer: HOI4 has no default location, so there is nothing sensible to write.
    // #oob-location-zero
    const rawLoc = Number(d.location);
    const hasLoc = d.location != null && d.location !== "" && Number.isFinite(rawLoc) && rawLoc >= 1;
    if (hasLoc) {
      const loc = clampInt(d.location, 1, 1e7);
      const keepComment =
        d.locationComment &&
        d.locationCommentFor != null &&
        Number(d.locationCommentFor) === Number(d.location);
      L.push(`\t\tlocation = ${loc}${keepComment ? `\t\t${d.locationComment}` : ""}`);
    }
    // …and when there is no usable province, WRITE NOTHING rather than `location = 0`.
    //
    // clampInt(null, 0, …) is Math.floor(Number(null)) = 0, which is finite, so the old guard passed and the
    // division was written at province 0. Province 0 does not exist, so the division never spawns — a silent
    // nothing rather than a visible error, and a claim about the file that is simply false.
    //
    // Omitting is deliberately chosen over throwing. A division can legitimately arrive here with no location
    // because the SOURCE FILE is already broken: real Millennium Dawn data contains
    // `name_order = 1 #Change in 2016 }` where the `}` sits inside a comment, so the division_name block
    // swallows the `location` line — HOI4 reads it exactly the same way. Refusing would block the user from
    // saving a file that was already broken before Nova touched it; writing 0 would add a lie to it. Writing
    // nothing leaves it no worse and does not invent a province. #oob-location-zero
  }
  L.push(`\t\tdivision_template = ${qstr(d.template)}`);
  // Native per-division commander (officer = { name = "…" [portraits = { … }] }) — verified in vanilla + MD OOB.
  // Re-emit any preserved non-name officer statements (portraits) so an edit never drops the commander's art.
  if (d.officer != null && String(d.officer).trim() !== "") {
    // Re-indent rather than PREPEND: the stored value is at depth 0, and prepending to lines that already
    // carry depth is what made this grow by three tabs per save. #oob-save-indentation-grows-unbounded
    const extra = d.officerExtra ? "\n" + _reindent(String(d.officerExtra).trim(), 3) : "";
    L.push(extra
      ? `\t\tofficer = {\n\t\t\tname = ${qstr(String(d.officer).trim())}${extra}\n\t\t}`
      : `\t\tofficer = { name = ${qstr(String(d.officer).trim())} }`);
  }
  // Starting equipment readiness (0–1). MD ships 0.01; vanilla omits (→ full).
  if (d.equipmentFactor != null && d.equipmentFactor !== "") {
    const ef = Number(d.equipmentFactor);
    if (!isNaN(ef)) L.push(`\t\tstart_equipment_factor = ${Math.max(0, Math.min(1, ef))}`);
  }
  if (d.experience != null && d.experience !== "") L.push(`\t\tstart_experience_factor = ${safeNum(d.experience, 0)}`);
  // Starting manpower readiness (0–1). MD ships 0.5/0.8; vanilla omits (→ full). Preserved so an edit doesn't
  // silently restore a partially-manned division to full strength. #div-preserve
  if (d.manpowerFactor != null && d.manpowerFactor !== "") {
    const mf = Number(d.manpowerFactor);
    if (!isNaN(mf)) L.push(`\t\tstart_manpower_factor = ${Math.max(0, Math.min(1, mf))}`);
  }
  // Pin designed variants to this division's starting equipment (force_equipment_variants). #5b
  if (Array.isArray(d.forceVariants) && d.forceVariants.length) {
    // owner is MANDATORY in HOI4 — skip an entry with no owner rather than emit a dangling `owner = ` token.
    const entries = d.forceVariants.filter((v) => v && v.archetype && v.owner != null && String(v.owner).trim() !== "").map((v) => {
      let s = `${_tok(v.archetype)} = { owner = ${_tok(v.owner)}`;
      if (v.creator) s += ` creator = ${_tok(v.creator)}`;
      if (v.version_name != null && String(v.version_name).trim() !== "") s += ` version_name = ${qstr(v.version_name)}`;
      if (v.amount != null && v.amount !== "") s += ` amount = ${Math.max(0, Math.floor(Number(v.amount)) || 0)}`; // vanilla amount = N — must survive
      return s + " }";
    });
    if (entries.length) L.push(`\t\tforce_equipment_variants = { ${entries.join(" ")} }`);
  }
  return L.join("\n") + "\n\t}";
}

/**
 * Rewrite ONE division's raw block in place, touching only the values that actually changed.
 *
 * #oob-edit-regenerates-the-whole-division — genDivision rebuilds a block from the parsed model, and the model
 * has no field for a comment. A CLEAN division keeps its comments because its raw bytes are re-emitted; the one
 * division the user edited did not. Round-tripping every real division through Nova's own parser and emitter:
 * 12,291 of 58,548 lose 16,487 comment lines across 803 files. What goes are the author's notes on the block
 * itself —
 *
 *     division = { # "1 Aussa Yekilili Sefari"          (7,127 of them)
 *         #name = "Farah Military District"             (2,481 commented-out alternative names)
 *         division_template = "Infantry Division"  # Frontline unit, experienced
 *         location = 3010#Edmonton Alberta
 *         start_equipment_factor = 0.5 #0.7            (what the value used to be)
 *
 * — every one of which is a note the author left for themselves.
 *
 * Splicing preserves them by construction, and with them the statement order, the indentation and any key
 * Nova does not model. Only the values that differ from what was parsed are rewritten; an edit that changes
 * the location rewrites the location token and nothing else.
 *
 * Returns null when the block cannot be spliced safely, so the caller falls back to genDivision.
 */
function patchDivisionRaw(raw, orig, ed) {
  const s = String(raw == null ? "" : raw).replace(/\r/g, "");
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  const inner = s.slice(open + 1, close);
  const stmts = splitTop(inner);
  if (!stmts.length) return null;

  const edits = []; // {start, end, text} — offsets into `inner`, applied back to front
  const all = (key) => stmts.filter((x) => x.key === key);
  const one = (key) => stmts.find((x) => x.key === key) || null;
  const valueSpan = (st) => ({ start: st.end - String(st.value).length, end: st.end });

  // The whole line a statement sits on, plus its newline — used to DELETE a statement. A trailing comment on
  // that line describes the value being removed, so it goes with it; a comment on its OWN line does not.
  const lineSpan = (st) => {
    let a = st.start;
    while (a > 0 && inner[a - 1] !== "\n") a--;
    if (inner.slice(a, st.start).trim() !== "") a = st.start; // something else shares the line — cut the statement only
    let b = st.end;
    while (b < inner.length && inner[b] !== "\n") b++;
    if (inner.slice(st.end, b).replace(/#[^\n]*/, "").trim() !== "") b = st.end; // another statement follows — keep it
    else if (b < inner.length) b++;
    return { start: a, end: b };
  };

  // Indentation to give a NEWLY added statement: whatever its siblings use.
  const siblingIndent = (() => {
    for (const st of stmts) {
      let a = st.start;
      while (a > 0 && inner[a - 1] !== "\n") a--;
      const lead = inner.slice(a, st.start);
      if (lead.trim() === "" && lead.length) return lead;
    }
    return "\t\t";
  })();
  const additions = [];

  // Comparing a value the client round-tripped through JSON against one the parser produced: "3010" and 3010
  // are the same location, and null / "" / undefined are all "absent". Anything else compares as text.
  const norm = (v) => (v == null || v === "") ? null : (typeof v === "number" ? String(v) : String(v).trim());
  const sameNum = (a, b) => {
    const x = norm(a), y = norm(b);
    if (x === null || y === null) return x === y;
    const fa = Number(x), fb = Number(y);
    return (Number.isFinite(fa) && Number.isFinite(fb)) ? fa === fb : x === y;
  };

  // A scalar field: rewrite the value where it stands, add a line, or remove the line.
  const scalar = (key, oldVal, newVal, render, same) => {
    const eq = same || ((a, b) => norm(a) === norm(b));
    if (eq(oldVal, newVal)) return true;
    const st = one(key);
    if (norm(newVal) === null) { if (st) edits.push(Object.assign(lineSpan(st), { text: "" })); return true; }
    const text = render(newVal);
    if (text == null) return false;
    if (st) { const sp = valueSpan(st); edits.push({ start: sp.start, end: sp.end, text }); }
    else additions.push(siblingIndent + key + " = " + text);
    return true;
  };

  // ── the modelled fields ─────────────────────────────────────────────────────────────────────────
  if (!scalar("name", orig.name, ed.name, (v) => qstr(v))) return null;
  if (!scalar("owner", orig.owner, ed.owner, (v) => _tok(String(v).trim()))) return null;
  if (!scalar("division_template", orig.template, ed.template, (v) => qstr(v))) return null;

  // location — the same rule genDivision applies: a missing or unusable province writes NOTHING rather than
  // province 0, which does not exist and would silently stop the division spawning. #oob-location-zero
  {
    const rawLoc = Number(ed.location);
    const usable = ed.location != null && ed.location !== "" && Number.isFinite(rawLoc) && rawLoc >= 1;
    const moved = !sameNum(orig.location, usable ? ed.location : null);
    if (!scalar("location", orig.location, usable ? ed.location : null, (v) => String(clampInt(v, 1, 1e7)), sameNum)) return null;
    // …and a division that MOVED must not keep the label naming where it used to be. Millennium Dawn
    // annotates every division's province with its place name (`location = 12862\t\t#As Shajarah`); preserving
    // the line verbatim would leave 10,861 divisions across the corpus captioned with the wrong city. A stale
    // label is worse than none — the same rule genDivision applies. #oob-save-eats-location-comments
    const locSt = moved ? one("location") : null;
    if (locSt) {
      let b = locSt.end;
      while (b < inner.length && inner[b] !== "\n") b++;
      const trail = inner.slice(locSt.end, b);
      const h = trail.indexOf("#");
      if (h >= 0 && trail.slice(0, h).trim() === "") edits.push({ start: locSt.end, end: b, text: "" });
    }
  }

  const clamp01 = (v) => { const n = Number(v); return isNaN(n) ? null : String(Math.max(0, Math.min(1, n))); };
  if (!scalar("start_equipment_factor", orig.equipmentFactor, ed.equipmentFactor, clamp01, sameNum)) return null;
  if (!scalar("start_manpower_factor", orig.manpowerFactor, ed.manpowerFactor, clamp01, sameNum)) return null;
  if (!scalar("start_experience_factor", orig.experience, ed.experience, (v) => safeNum(v, 0), sameNum)) return null;

  // officer — only the commander's NAME is modelled; the portraits block beside it is preserved by leaving
  // the rest of the officer block exactly where it is.
  if (norm(orig.officer) !== norm(ed.officer)) {
    const off = one("officer");
    if (norm(ed.officer) === null) { if (off) edits.push(Object.assign(lineSpan(off), { text: "" })); }
    else if (!off) additions.push(siblingIndent + "officer = { name = " + qstr(String(ed.officer).trim()) + " }");
    else {
      // Rewrite the name INSIDE the officer block, so a portraits sub-block is untouched.
      const oInner = innerBody(off.value);
      const oAt = off.end - String(off.value).length + String(off.value).indexOf("{") + 1;
      const nameSt = splitTop(oInner).find((x) => x.key === "name");
      if (!nameSt) return null;
      const sp = { start: oAt + nameSt.end - String(nameSt.value).length, end: oAt + nameSt.end };
      edits.push({ start: sp.start, end: sp.end, text: qstr(String(ed.officer).trim()) });
    }
  }

  // division_name — the ordered-name block. Compared on its inner text, the same normalisation _divKey uses.
  {
    const a = (orig.divisionName || "").replace(/\s+/g, " ").trim();
    const b = (ed.divisionName || "").replace(/\s+/g, " ").trim();
    if (a !== b) {
      const st = one("division_name");
      if (!b) { if (st) edits.push(Object.assign(lineSpan(st), { text: "" })); }
      else {
        const dn = String(ed.divisionName).trim();
        // A trailing `#` inside the block keeps the closing brace on its own line, or the comment swallows it
        // and the file stops parsing. Same rule as genDivision. #div-preserve
        const body = /[#\n]/.test(dn)
          ? "{\n" + siblingIndent + "\t" + dn.replace(/\r?\n[ \t]*/g, "\n" + siblingIndent + "\t") + "\n" + siblingIndent + "}"
          : "{ " + dn + " }";
        if (st) { const sp = valueSpan(st); edits.push({ start: sp.start, end: sp.end, text: body }); }
        else additions.push(siblingIndent + "division_name = " + body);
      }
    }
  }

  // force_equipment_variants — a division may legally REPEAT the statement (817 of Millennium Dawn's 5,121 do),
  // so when the set changes every one of them is removed and a single block written in their place. #5b
  {
    const sig = (list) => (list || []).filter((v) => v && v.archetype).map((v) =>
      [v.archetype, v.owner == null ? "" : v.owner, v.creator == null ? "" : v.creator,
       v.version_name == null ? "" : v.version_name, v.amount == null || v.amount === "" ? "" : Number(v.amount)].join("|")).join(";");
    if (sig(orig.forceVariants) !== sig(ed.forceVariants)) {
      const existing = all("force_equipment_variants");
      const entries = (ed.forceVariants || [])
        .filter((v) => v && v.archetype && v.owner != null && String(v.owner).trim() !== "")
        .map((v) => {
          let x = _tok(v.archetype) + " = { owner = " + _tok(v.owner);
          if (v.creator) x += " creator = " + _tok(v.creator);
          if (v.version_name != null && String(v.version_name).trim() !== "") x += " version_name = " + qstr(v.version_name);
          if (v.amount != null && v.amount !== "") x += " amount = " + Math.max(0, Math.floor(Number(v.amount)) || 0);
          return x + " }";
        });
      const text = entries.length ? "force_equipment_variants = { " + entries.join(" ") + " }" : "";
      if (existing.length) {
        // Rewrite the FIRST in place so it keeps its position and any comment above it; drop the rest.
        for (let k = existing.length - 1; k >= 1; k--) edits.push(Object.assign(lineSpan(existing[k]), { text: "" }));
        const sp = lineSpan(existing[0]);
        const lead = inner.slice(sp.start, existing[0].start);
        edits.push({ start: sp.start, end: sp.end, text: text ? lead + text + "\n" : "" });
      } else if (text) additions.push(siblingIndent + text);
    }
  }

  // ── apply, back to front so earlier offsets stay valid ──────────────────────────────────────────
  edits.sort((a, b) => b.start - a.start);
  for (let k = 1; k < edits.length; k++) {
    if (edits[k].end > edits[k - 1].start) return null; // overlapping spans — refuse rather than corrupt
  }
  let out = inner;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  if (additions.length) {
    // Append before the close, after whatever the last line is — never onto a line ending in a comment.
    //
    // …and PUT THE CLOSING BRACE'S OWN INDENT BACK. The block's final line is the whitespace before its `}`;
    // stripping that to append cleanly and not restoring it left the brace at column 0, which then made
    // _reindent's `min` zero and pushed every line of the block a tab deeper.
    const closeIndent = (out.match(/[ \t]*$/) || [""])[0];
    const tail = out.replace(/[ \t]*$/, "");
    const sep = /\n[ \t]*$/.test(out) ? "" : "\n";
    out = tail + sep + additions.join("\n") + "\n" + closeIndent;
  }
  return s.slice(0, open + 1) + out + s.slice(close);
}

// Identity of a division for the preserve-merge. divisionName MUST be part of it: MD comments out the real
// `name` on ordered-name divisions (`#name = "86 División de Infanteria"`), so d.name is null and a
// name|location|template key degenerates to `|location|template` — every sibling sharing a garrison province +
// template then collides (424 such divisions across 31 MD files). With a plain Map that silently re-emitted ONE
// sibling's raw bytes in place of all of them: measured 10 divisions destroyed + 5 duplicated in a single save,
// brace-balanced and count-preserving, so nothing downstream noticed. #div-key-collision
const _divKey = (d) => `${d.name || ""}|${d.location == null ? "" : d.location}|${d.template || ""}|${(d.divisionName || "").replace(/\s+/g, " ").trim()}`;
// Re-indent a preserved raw block to sit at `tabs` depth (its first line lost its leading indent to
// splitTop; inner lines keep their original relative indent).
//
// #oob-save-indentation-grows-unbounded — this used to PREPEND tabs to every line, and called the result a
// "harmless over-indent". Harmless once; not harmless N times. The inner lines already carry the indentation
// the PREVIOUS save gave them, so every save that regenerates the units block pushes every untouched
// division one tab deeper, for ever. Measured: 543 of the 774 order-of-battle files that ship with Hearts of
// Iron IV and Millennium Dawn grow on the FIRST edit, and Millennium Dawn's CHI_2000_nonnsb.txt goes from 3
// leading tabs to 9 over six saves, +602 bytes each time, with edited divisions sitting at depth 2 beside
// untouched ones at depth 9. HOI4 does not care, but the modder's file and every diff of it do.
//
// So: NORMALISE first. Strip the block's own common indentation, then apply `tabs` once — which makes the
// operation idempotent, so re-saving an already-correct block is a no-op. Same rule as reindentPdxStatement
// in server.js, which had this right; this is the sibling that never adopted it.
// A preserved comment region, re-indented to one tab inside `units = {}`. Blank lines stay blank — a tab on
// an empty line is trailing whitespace, and the author's paragraph breaks are the point of keeping the region
// verbatim in the first place. #oob-edit-deletes-units-block-comments
const _reindentComments = (region) =>
  String(region).replace(/\r/g, "").split("\n").map((l) => (l.trim() ? "\t" + l.trim() : "")).join("\n");

const _reindent = (raw, tabs) => {
  const lines = String(raw).replace(/\r/g, "").split("\n");
  const leadOf = (l) => l.match(/^[\t ]*/)[0].length;
  // #reindent-flattened-by-a-column-zero-comment — a whole-line comment gets NO vote on the block's common
  // indentation. Writing `#` hard against the left margin is how a modder disables a line, and vanilla's four
  // YUG order-of-battle files do exactly that inside a division. Counting it made `min` 0, so nothing was
  // stripped and every line kept its old indent on top of the new pad — the whole division came back a tab
  // deeper than its untouched siblings. Only visible once such a comment started surviving an edit at all.
  let min = Infinity;
  for (let k = 1; k < lines.length; k += 1) {
    if (!lines[k].trim() || lines[k].trim().startsWith("#")) continue;
    const lead = leadOf(lines[k]);
    if (lead < min) min = lead;
  }
  // …and if the block is nothing BUT comments, they get their vote back rather than no measurement at all.
  if (min === Infinity) for (let k = 1; k < lines.length; k += 1) {
    if (!lines[k].trim()) continue;
    const lead = leadOf(lines[k]);
    if (lead < min) min = lead;
  }
  if (min === Infinity) min = 0;
  // #reindent-pads-a-space-indented-file-with-a-tab — PAD WITH THE UNIT THE BLOCK USES. Three Old World Blues
  // order-of-battle files are indented with four spaces throughout; a literal tab mixed the two and rewrote
  // every line of a file nobody had edited. `min` is the block's own one-level indent, so a space-indented
  // block gets spaces back and a tab-indented one is unaffected.
  const innerLines = lines.slice(1).filter((l) => l.trim());
  const spaceIndented = min > 0 && innerLines.length > 0 && innerLines.every((l) => !/^\t/.test(l));
  const unit = spaceIndented ? " ".repeat(min) : "\t";
  const pad = unit.repeat(Math.max(0, tabs));
  return lines
    // Math.min: slicing `min` off a line indented LESS than min would cut into its content — on the very
    // lines this is about, it would have eaten the `#`.
    .map((l, i) => (i === 0 ? pad + l.trim() : (l.trim() ? pad + l.slice(Math.min(min, leadOf(l))) : "")))
    .join("\n");
};

/**
 * Where a NEW division_template should be inserted so it precedes the `units` block. #oob-template-after-units
 *
 * Returns the offset of the top-level `units` statement, walked BACK over the blank lines and whole-line
 * comments directly above it — a comment there describes the units block, so a template inserted between the
 * two would separate them. Returns -1 if there is no top-level units block.
 *
 * Depth-aware and comment/quote-aware: `units` also appears as a key inside other blocks, and matching one of
 * those would move a template into the middle of something else.
 */
function topLevelUnitsInsertionPoint(text) {
  const s = String(text || "");
  let depth = 0, inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (c === "#") { const nl = s.indexOf("\n", i); if (nl === -1) break; i = nl; continue; }
    if (c === "{") { depth++; continue; }
    if (c === "}") { depth--; continue; }
    if (depth !== 0) continue;
    if (c !== "u" || !/^units\s*=\s*\{/.test(s.slice(i))) continue;
    // start of the line holding `units`
    let lineStart = s.lastIndexOf("\n", i - 1) + 1;
    // walk back over blank lines and whole-line comments so an attached note stays with its block
    while (lineStart > 0) {
      const prevEnd = lineStart - 1;
      // `lastIndexOf(needle, -1)` does NOT search backwards — JS clamps a negative fromIndex to 0. So at
      // lineStart === 1 this returned 0 on any text whose first character is a newline, giving prevStart = 1
      // again: lineStart never advanced, `prevStart === 0` was never true, and the loop spun forever. It
      // pinned the Node event loop at 100% CPU, so the WHOLE server stopped answering — an unrelated request
      // 3s later got nothing, and the process burned 519 CPU seconds before being killed. Nothing was
      // written, so the user's edit was lost and Nova had to be force-quit.
      //
      // The trigger is narrow but reachable from an ordinary edit: the merged text has to begin with a
      // newline AND every line from there down to the top-level `units` statement has to be blank or a
      // comment — which is what dropping the first division_template leaves behind.
      // #oob-insertion-point-infinite-loop
      const prevStart = prevEnd <= 0 ? 0 : s.lastIndexOf("\n", prevEnd - 1) + 1;
      const line = s.slice(prevStart, prevEnd).trim();
      if (line !== "" && line.charCodeAt(0) !== 35 /* # */) break;
      // Belt and braces, and NOT redundant in the way that phrase usually implies: this guard ALONE stops
      // the hang even with the arithmetic above wrong, which the control proved by having to remove both
      // before any shape timed out. Any future edit that stops the walk-back advancing must end the loop
      // rather than take the server down — a scan that cannot make progress has nothing left to find.
      if (prevStart >= lineStart) break;
      lineStart = prevStart;
      if (prevStart === 0) break;
    }
    return lineStart;
  }
  return -1;
}

/**
 * Regenerate an OOB file's text from an edited LAND model, preserving everything else verbatim.
 * originalText: current file contents (or "" for a brand-new file). edited: { templates:[…], divisions:[…] }.
 * Each item may carry `_dirty`; when it's falsy AND a matching original block exists, that block's ORIGINAL
 * raw text is re-emitted (so un-modeled fields are never dropped). New/edited items are generated clean.
 */
// #oob-merge-unpins-the-bom — A UTF-8 BOM IS THE FILE'S ENCODING MARKER, NOT ITS FIRST BYTE OF CONTENT.
//
// This module's contract says every byte survives a round trip "incl. the leading BOM", and for a no-edit save
// it does. But a save that ADDS a division_template takes a branch that treats the BOM as ordinary body text,
// and there the BOM stops being first:
//
//   • new templates go in immediately BEFORE the top-level `units` block (#oob-template-after-units). When
//     `units` is the FIRST statement — which is the shape of every naval/air OOB file — that insertion point
//     is offset 0, so the generated template was spliced in AHEAD of the BOM.
//   • a file with no top-level statement at all (comment-only, of which the corpus ships plenty) is entirely
//     `_trailing`, and _trailing is appended AFTER the generated block — same outcome.
//   • and `head.replace(/\s*$/, "")` DELETES a lone BOM outright, because JS `\s` matches U+FEFF.
//
// 📊 Measured 2026-09-17 by calling this function over every history/units file of the six installed maps and
// adding one template — the ordinary "second save" path:
//
//     map              files   with a BOM   BOM no longer first   stray U+FEFF in the body
//     vanilla            609          605                   148                        146
//     Millennium Dawn    844            0                     0                          0
//     Road to 56         464          413                    91                         79
//     Old World Blues    846          841                    75                         69
//     Novum Vexillum     502          502                   133                        131
//     Rise of Nations   3064          167                    44                         38
//                                    ────                  ───                        ───
//                                    2528                  491                        463
//
// ⭐ THE FIX ALREADY EXISTS NEXT DOOR, IN THE OTHER HALF OF THE SAME SAVE. The naval/air OOB endpoint hoists
// the BOM off before calling addNavalAirOob and puts it back on the write (`const bom = existing.charCodeAt(0)
// === 0xFEFF ? … ; safeModWrite(filePath, bom + out, …)`). The LAND endpoint, in the same file, calls straight
// into mergeOob with the BOM still attached. One caller adopted it and the other never did.
//
// Fixed HERE rather than at that caller, because the invariant is this module's own: hoisting the marker off
// the front, merging the body, and pinning it back means no present or future caller has to know. A file with
// no BOM is untouched, and a no-edit merge is still byte-identical (verified over all 6,329 corpus files).
// ⚠️ A RUN of them, not one. Road to 56 ships three OOB files that begin with TWO U+FEFFs
// (NIR_motor_cavalry.txt, WLL_motor_cavalry.txt, WLS_motor_cavalry.txt) — an editor has re-saved a file that
// already had a BOM. Lifting only the first left the second inside the body, where the same insertion branch
// could move it, and re-attaching "a BOM" rather than "the ones that were there" silently dropped one: a
// no-edit save of those three files came back one byte shorter, which test-oob-corpus-roundtrip.js caught on
// the corpus it reads and the fixtures did not. Take the whole run and put the whole run back.
function mergeOob(originalText, edited) {
  const src = String(originalText || "");
  let i = 0;
  while (src.charCodeAt(i) === 0xfeff) i++;
  if (!i) return mergeOobBody(src, edited);
  return src.slice(0, i) + mergeOobBody(src.slice(i), edited);
}

function mergeOobBody(originalText, edited) {
  const orig = originalText
    ? parseUnitsFile(originalText)
    : { templates: [], units: { divisions: [], airWings: [], navy: [] }, stockpiles: [], _segments: [], _trailing: "" };

  // Match each ORIGINAL division_template block to its EDITED template by the template's IDENTITY, so a
  // RENAME lands on the right block (its un-modeled fields — role/obsolete/division_cap/… — preserved IN
  // PLACE) and two same-named templates don't collapse into one. Identity = the load-time name the client
  // echoes back as _origName; absent (older callers) it falls back to the current name. Same-identity
  // templates are consumed POSITIONALLY via a queue, exactly like divisions (#div-key-collision). #tpl-identity
  const tplIdOf = (t) => (t._origName != null && t._origName !== "") ? String(t._origName) : String(t.name);
  const editedTplQueue = new Map(); // identity → [edited templates, in payload order]
  for (const t of edited.templates || []) {
    if (!t || t.name == null) continue;
    const k = tplIdOf(t);
    if (!editedTplQueue.has(k)) editedTplQueue.set(k, []);
    editedTplQueue.get(k).push(t);
  }
  const tplNameByRaw = new Map(); // a division_template segment's raw text → its parsed name
  for (const t of orig.templates) if (t && t._raw != null) tplNameByRaw.set(t._raw, t.name);
  // A CONSUMING QUEUE per key, not a single value: two divisions can still be genuinely identical (same name,
  // location, template and ordered-name block), and last-write-wins would collapse them into one repeated block.
  // Queueing maps each original 1:1 onto its edited counterpart positionally. #div-key-collision
  // The queue carries the original's COMMENT METADATA alongside its raw text, and is consumed once per
  // division whichever branch runs below. /api/army returns a projection of each division — location, name,
  // template and the handful of modelled fields — so a comment cannot travel to the browser and back. It has
  // to be recovered here, from the file, exactly like the equipment stat variables and the MIO allowed block.
  // Consuming one entry per division either way keeps duplicates mapped 1:1 (#div-key-collision).
  // #oob-save-eats-location-comments
  const divRaw = new Map();
  // …and the same entries keyed WITHOUT the template, for the rename fallback below.
  const divLoose = new Map();
  for (const d of orig.units.divisions) {
    if (!d) continue;
    const k = _divKey(d);
    const loose = `${d.name || ""}|${d.location == null ? "" : d.location}|${(d.divisionName || "").replace(/\s+/g, " ").trim()}`;
    if (!divRaw.has(k)) divRaw.set(k, []);
    if (!divLoose.has(loose)) divLoose.set(loose, []);
    const entry = {
      raw: d._raw != null ? d._raw : null,
      // …and the ORIGINAL parsed values, so a dirty division can be spliced rather than rebuilt: knowing what
      // a field WAS is what makes it possible to rewrite only the ones that changed.
      // #oob-edit-regenerates-the-whole-division
      orig: d,
      meta: {
        locationComment: d.locationComment || null,
        locationCommentFor: d.locationCommentFor != null ? d.locationCommentFor : null,
        leadComment: Array.isArray(d.leadComment) ? d.leadComment : null,
        leadRegion: typeof d.leadRegion === "string" ? d.leadRegion : "",
      },
    };
    divRaw.get(k).push(entry);
    divLoose.get(loose).push(entry);
  }

  // Regenerated units-block content (edited divisions + preserved in-units air/navy) — built once; used
  // only when we can't re-emit the original units block verbatim.
  const unitsInner = [];
  for (const d of edited.divisions || []) {
    const k = _divKey(d);
    // The SAME entry object sits in both maps, so consuming it from one must consume it from the other —
    // otherwise a later division could inherit comments already given to an earlier one. A `used` flag is
    // simpler than keeping the two queues in sync.
    const takeFrom = (map, key) => {
      const q = map.has(key) ? map.get(key) : null;
      if (!q) return null;
      while (q.length && q[0].used) q.shift();
      if (!q.length) return null;
      const e = q.shift();
      e.used = true;
      return e;
    };
    let origEntry = takeFrom(divRaw, k);
    // …and a FALLBACK that ignores the template. `_divKey` includes d.template, so renaming a template moved
    // every division that used it to a key matching nothing in divRaw: origEntry came back null and
    // genDivision ran with no comment metadata, losing both the `# Reykjavik` province label and the
    // `# I Corps` section header on divisions that took the dirty branch precisely so those could be
    // restored. Matched on name+location+divisionName, which identifies the same division across a template
    // rename. #oob-template-rename-loses-comments
    if (!origEntry) {
      const loose = `${d.name || ""}|${d.location == null ? "" : d.location}|${(d.divisionName || "").replace(/\s+/g, " ").trim()}`;
      origEntry = takeFrom(divLoose, loose);
    }
    if (!d._dirty && origEntry && origEntry.raw != null) {
      // …AND THE COMMENT LINES ABOVE IT. `raw` is the division statement alone; the section headers a modder
      // uses to group an order of battle live in meta.leadComment and were simply dropped here, so editing
      // ONE division deleted the headers above every division the user never touched. Measured on real
      // content: SOV_1939.txt went from 115 whole-line comments to 15 — losing
      // `####### Zapadnye TVD (Western Theatre Military District) (CO: Voroshilov) #######` and every
      // Armiya/Korps header — GER_1939 48 -> 6, ITA_1939 86 -> 43. The response said ok and the brace and
      // division counts were unchanged, so nothing signalled it. #oob-clean-division-drops-lead-comments
      // …and the FULL region, so blank-separated comment runs and commented-out reserve division blocks
      // survive too, not only the contiguous run directly above. #oob-edit-deletes-units-block-comments
      const region = (origEntry.meta && origEntry.meta.leadRegion) || "";
      const leadText = region ? _reindentComments(region) + "\n" : "";
      unitsInner.push(leadText + _reindent(String(origEntry.raw).trim(), 1));
    } else {
      // SPLICE the changed values into the original block when there is one, so the division the user edited
      // keeps its comments, its statement order, its indentation and any key Nova does not model — exactly
      // like the clean divisions above. Rebuilding from the model deleted 16,487 comment lines across 803 real
      // order-of-battle files, one edit at a time. #oob-edit-regenerates-the-whole-division
      const patched = (origEntry && origEntry.raw != null && origEntry.orig)
        ? patchDivisionRaw(origEntry.raw, origEntry.orig, d)
        : null;
      if (patched != null) {
        const region = (origEntry.meta && origEntry.meta.leadRegion) || "";
        const leadText = region ? _reindentComments(region) + "\n" : "";
        unitsInner.push(leadText + _reindent(patched.trim(), 1));
      } else {
        // No original to splice into (a NEW division), or a block whose shape the splice would not rewrite
        // safely. Hand genDivision the comments the client could not carry, recovered from the original file.
        unitsInner.push(genDivision(origEntry ? Object.assign({}, d, origEntry.meta) : d));
      }
    }
  }
  for (const seg of orig._segments || []) {
    if (seg.key !== "units") continue;
    // CARRY EVERY NON-DIVISION STATEMENT, not just air wings and navies. This listed the two shapes it knew
    // about and silently deleted the rest — a bare `ship = { … }` written directly inside `units`, and an
    // `instant_effect` block, both went 2 -> 0 and 1 -> 0 when an unrelated division was edited, with the
    // response reporting ok. The divisions are rebuilt above, so anything that is NOT a division belongs to
    // the original file and has to come across untouched. #oob-units-block-drops-unknown-statements
    const uInner = innerBody(seg.text.slice(seg.text.indexOf("{")));
    let lastEnd = 0;
    for (const st of splitTop(uInner)) {
      lastEnd = Math.max(lastEnd, st.end);
      if (st.key === "division") continue; // rebuilt above, in the user's order
      // …with the comment lines above it, for the same reason the divisions need theirs: `st.text` is the
      // statement alone, and a note explaining what an unmodelled block is for belongs to it.
      const region = leadingCommentRegion(uInner, st.start);
      const leadText = region ? _reindentComments(region) + "\n" : "";
      unitsInner.push(leadText + _reindent(String(st.text).trim(), 1));
      lastEnd = Math.max(lastEnd, st.end);
    }
    // …and whatever sits BELOW the last statement, which has nothing to attach itself to and was therefore
    // dropped outright. This is where the commented-out reserve divisions at the foot of an order of battle
    // live — vanilla's MON_1939.txt keeps two, ETH_1936_bba.txt nineteen.
    // #oob-edit-deletes-units-block-comments
    const tail = trailingCommentRegion(uInner, lastEnd);
    if (tail) unitsInner.push(_reindentComments(tail));
  }
  const unitsBlock = unitsInner.length ? "units = {\n" + unitsInner.join("\n") + "\n}" : "";

  // "Untouched" divisions = nothing dirty AND the exact same division set as loaded. When so, we re-emit
  // every original units block RAW (preserving its inner separator comments verbatim). Only when divisions
  // actually change do we regenerate + consolidate into ONE units block (some inner layout is then lost).
  const origDivKeys = orig.units.divisions.map(_divKey).sort();
  const editedDivKeys = (edited.divisions || []).map(_divKey).sort();
  const keepUnitsRaw = !(edited.divisions || []).some((d) => d && d._dirty)
    && origDivKeys.length === editedDivKeys.length
    && origDivKeys.every((k, i) => k === editedDivKeys[i]);

  // Walk the original segments IN ORDER, carrying each segment's leading `gap` (top-level comments + blank
  // lines) so hand-authored layout survives. Regenerate only the managed blocks, in place. An unchanged
  // model reproduces the file (gap+text per segment + _trailing); edits touch only what changed.
  const emittedTpl = new Set(); // edited template OBJECTS already placed (identity, so duplicates don't alias)
  let unitsEmitted = false;
  let out = "";
  for (const seg of orig._segments || []) {
    const gap = seg.gap || "";
    if (seg.key === "division_template") {
      const name = tplNameByRaw.get(seg.text);
      const q = name != null ? editedTplQueue.get(String(name)) : undefined;
      const et = q && q.length ? q.shift() : undefined; // consume positionally (same-named blocks stay distinct)
      if (et === undefined) continue; // no edited counterpart for this block → deleted → drop it (and its comment)
      emittedTpl.add(et);
      // On edit, regenerate the managed parts BUT preserve any un-modeled top-level field from the original
      // block (role, obsolete, division_cap, force_allow_recruiting, is_locked, …) so editing — or RENAMING —
      // a template never drops them. mergePreservedTemplateBlock treats `name` as owned, so the new name wins.
      out += gap + (et._dirty ? mergePreservedTemplateBlock(genDivisionTemplate(et), seg.text) : String(seg.text));
    } else if (seg.key === "units") {
      if (keepUnitsRaw) { out += gap + String(seg.text); unitsEmitted = true; continue; } // preserve each units block verbatim
      if (unitsEmitted) continue;    // divisions changed → consolidate into the FIRST units segment
      if (!unitsBlock) continue;     // no divisions / air / navy left → drop the now-empty units block
      out += gap + unitsBlock; unitsEmitted = true;
    } else {
      out += gap + String(seg.text); // instant_effect / top-level air_wings/navy / comments / unknown — verbatim
    }
  }

  // Blocks with no original position: NEW templates, and a units block if the file had none.
  const newTemplates = [];
  for (const t of edited.templates || []) if (t && t.name != null && !emittedTpl.has(t)) newTemplates.push(genDivisionTemplate(t));

  // #oob-template-after-units — appending a NEW template here put it AFTER the units block that already sat
  // in the file, so a division inside units referenced a template defined later in the same file. Nothing in
  // real content is shaped that way: 0 of 609 vanilla OOB files, 0 of 924 Millennium Dawn files, and 0 of
  // 6,443 files across vanilla plus six installed workshop mods contain such a forward reference.
  //
  // It only bites on the SECOND save — the ordinary path. Save one writes templates then units, correctly;
  // save two adds a template and it lands at the bottom. So put new templates where every real file puts
  // them: immediately before the units block, ahead of any comment attached to it, so a hand-written note
  // stays with the block it describes.
  if (newTemplates.length && unitsEmitted) {
    const at = topLevelUnitsInsertionPoint(out);
    if (at !== -1) {
      const head = out.slice(0, at).replace(/\s*$/, "");
      const tail = out.slice(at).replace(/^\n+/, "");
      out = (head ? head + "\n\n" : "") + newTemplates.join("\n\n") + "\n\n" + tail;
      newTemplates.length = 0; // placed
    }
  }

  const appends = [...newTemplates];
  if (unitsBlock && !unitsEmitted) appends.push(unitsBlock);
  for (const block of appends) { out = out.replace(/\s*$/, ""); out += (out ? "\n\n" : "") + block; }

  out += orig._trailing || "";
  // #oob-roundtrip-adds-eof-newline — a no-edit save must not change bytes, and this changed 1,120 of the
  // 1,533 order-of-battle files that ship with Hearts of Iron IV and Millennium Dawn. None of them ends with
  // a newline; this added one, so opening any of them and pressing Save produced a diff on a file the user
  // had not touched. Harmless to the game, and precisely the property the round-trip contract exists to
  // protect: once a no-edit save is expected to churn, a real unintended change stops being visible.
  //
  // A file that HAD a trailing newline still keeps one, and a file Nova creates from nothing still gets one
  // (originalText is empty, so the second clause applies).
  // An EMPTY original is a new file, not a file that chose to end without a newline — Millennium Dawn ships a
  // 0-byte BOS_2000_nonbba.txt, and turning that into "\n" is the same unasked-for churn.
  //
  // #oob-roundtrip-trims-a-whitespace-only-file — `.length`, not `.trim()`. A file that is whitespace and
  // nothing else is still a file the modder has, and asking "is there content" classified it as new: its
  // trailing newline was stripped. Rise of Nations' NZL_INT.txt and NZL_TAC.txt are two bytes each, `\r\n`,
  // and a no-edit save left them holding a lone carriage return — not a line ending on any system. A
  // 0-byte original still has length 0 and still takes the new-file branch, so the case above is unchanged.
  const hadTrailingNewline = String(originalText || "").length ? /\n$/.test(originalText) : !!String(out || "").trim();
  if (hadTrailingNewline && !/\n$/.test(out)) out += "\n";
  else if (!hadTrailingNewline) out = out.replace(/\n+$/, "");
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Naval + Air order of battle WRITER (gap #9). Generates fleet/task_force/ship + air_wings PDX that matches
// vanilla history/units/*.txt exactly, and injects it into an OOB file preserving everything else verbatim.
// Ship `owner = TAG` is UNQUOTED, air-wing `owner = "TAG"` is QUOTED — both verified against vanilla ARG.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// Index of the `}` matching the `{` at openIdx, skipping # comments and "quoted" strings (HOI4 strings
// have no escapes — a literal " ends the string). Returns -1 if unbalanced.
function findClose(text, openIdx) {
  const s = String(text); let d = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { i++; while (i < s.length && s[i] !== '"') i++; }
    else if (c === "#") { while (i < s.length && s[i] !== "\n") i++; }
    else if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return i; }
  }
  return -1;
}

// ship = { name="…" [pride_of_the_fleet=yes] definition=<archetype> equipment = { <eq> = { amount owner [creator] [version_name] } } }
// Non-finite / huge coercion guard for the naval+air writers (unit-data has no formatHoi4Number). Number("1e999")
// is Infinity (passes a bare `Number(v) || 0`), and any |n| >= 1e21 stringifies as `1e+21` — neither is a valid
// Clausewitz integer token, so `amount`/`location`/`naval_base` could write a file HOI4 can't parse. #num-finite
function clampInt(v, lo, hi) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
// Decimal-safe (mirrors server.js formatHoi4Number): finite, clamped so toFixed never emits exponential, trailing
// zeros trimmed. For 0–1 factors / counters that must keep their decimals. #num-finite
function safeNum(v, def) { let n = Number(v); if (!Number.isFinite(n)) return def; if (n > 1e18) n = 1e18; else if (n < -1e18) n = -1e18; const s = n.toFixed(6).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1"); return s === "-0" ? "0" : s; }
function genShip(s, indent = "\t\t\t") {
  const eqKey = _tok(s.equipment || s.definition);
  const inner = [`amount = ${clampInt(s.amount, 1, 1e9)}`, `owner = ${_tok(s.owner)}`];
  if (s.creator) inner.push(`creator = ${_tok(s.creator)}`);
  if (s.version_name) inner.push(`version_name = ${qstr(s.version_name)}`);
  let l = `${indent}ship = { name = ${qstr(s.name || "Ship")}`;
  if (s.pride === true || s.pride === "yes") l += ` pride_of_the_fleet = yes`;
  l += ` definition = ${_tok(s.definition)} equipment = { ${eqKey} = { ${inner.join(" ")} } } }`;
  return l;
}
function genTaskForce(tf) {
  const L = [`\t\ttask_force = {`, `\t\t\tname = ${qstr(tf.name || "Task Force")}`];
  // Only emit location for a REAL province (>0). A blank base coerces to 0, and `location = 0` references the
  // dummy province 0 (no port) — omit it instead so the game places the fleet at the country's default. #naval-base-zero
  if (Number.isFinite(Number(tf.location)) && Number(tf.location) > 0) L.push(`\t\t\tlocation = ${clampInt(tf.location, 1, 1e7)}`);
  for (const s of tf.ships || []) L.push(genShip(s));
  L.push(`\t\t}`);
  return L.join("\n");
}
function genFleet(f) {
  const L = [`\tfleet = {`, `\t\tname = ${qstr(f.name || "Fleet")}`];
  if (Number.isFinite(Number(f.naval_base)) && Number(f.naval_base) > 0) L.push(`\t\tnaval_base = ${clampInt(f.naval_base, 1, 1e7)}`); // >0 only — see genTaskForce #naval-base-zero
  const tfs = f.taskForces && f.taskForces.length ? f.taskForces
    : (f.ships && f.ships.length ? [{ name: f.name || "Task Force", location: f.naval_base, ships: f.ships }] : []);
  for (const tf of tfs) L.push(genTaskForce(tf));
  L.push(`\t}`);
  return L.join("\n");
}
// one air_wings state entry:  <state> = { <eq> = { owner = "TAG" amount = N } … }
function genAirGroupLines(groups) {
  // Floor amount to 1 like genShip (clampInt(s.amount, 1, …)): a 0-plane wing is a dead OOB entry that hands the
  // country nothing, so the write choke point never emits `amount = 0`. #air-amount-floor
  return (groups || []).map((g) => `\t\t${_tok(g.equipment)} = { owner = ${qstr(_tok(g.owner))} amount = ${clampInt(g.amount, 1, 1e9)} }`).join("\n");
}
function genAirStateEntry(w) {
  return `\t${clampInt(w.state, 0, 1e7)} = {\n${genAirGroupLines(w.groups)}\n\t}`;
}

/**
 * Add fleets and/or air wings to an OOB file, preserving every existing byte (divisions, comments,
 * instant_effect, hand-authored fleets/wings). Fleets go into the first top-level `units` block (created if
 * absent); air wings merge by state into the first top-level `air_wings` block (created if absent) — a state
 * that already exists gets the new group lines injected, otherwise a new `<state> = {…}` entry is added.
 * originalText "" → a fresh file. Returns brace-balanced text ending in a newline.
 */
function addNavalAirOob(originalText, spec) {
  // The BOM is lifted off here for the same reason mergeOob lifts it (#oob-merge-unpins-the-bom), and the
  // whole run of them, so the body this works on starts at real content.
  //
  // Today's caller already hoists it — the naval/air endpoint is where that pattern was RIGHT, and the land
  // one is where it was missing. So this is not a live defect: measured over vanilla's 396 BOM'd order-of-
  // battle files, every one keeps its BOM through this function as it stands. What it does NOT survive is a
  // file that is a BOM and nothing else, because `text.replace(/\s*$/, "")` below treats the BOM as trailing
  // whitespace (JS `\s` matches U+FEFF) and deletes it, and `text.trim()` then reads the file as empty.
  //
  // Doing it here rather than relying on the caller is the point: leaving one of this module's two OOB
  // writers BOM-safe and the other BOM-fragile is exactly the asymmetry that produced the original bug, and
  // the next caller to arrive has no way to know which kind it is holding.
  const src = String(originalText || "");
  let bomLen = 0;
  while (src.charCodeAt(bomLen) === 0xfeff) bomLen++;
  const bom = src.slice(0, bomLen);
  let text = src.slice(bomLen);
  const fleets = (spec && spec.fleets || []).map((f) => genFleet(f));
  const wings = (spec && spec.airWings || []);

  if (fleets.length) {
    const unitsSt = splitTop(text).find((s) => s.key === "units");
    const fleetText = fleets.join("\n");
    if (unitsSt) {
      const openIdx = text.indexOf("{", unitsSt.start);
      const closeIdx = findClose(text, openIdx);
      if (closeIdx < 0) throw new Error("The units block is not brace-balanced.");
      text = text.slice(0, closeIdx).replace(/\s*$/, "\n") + fleetText + "\n" + text.slice(closeIdx);
    } else {
      text = text.replace(/\s*$/, "") + (text.trim() ? "\n\n" : "") + "units = {\n" + fleetText + "\n}\n";
    }
  }

  if (wings.length) {
    let awSt = splitTop(text).find((s) => s.key === "air_wings");
    if (!awSt) {
      text = text.replace(/\s*$/, "") + (text.trim() ? "\n\n" : "") + "air_wings = {\n}\n";
      awSt = splitTop(text).find((s) => s.key === "air_wings");
    }
    for (const w of wings) {
      // re-locate the block each pass (text shifts as we inject)
      awSt = splitTop(text).find((s) => s.key === "air_wings");
      const openIdx = text.indexOf("{", awSt.start);
      const closeIdx = findClose(text, openIdx);
      if (closeIdx < 0) throw new Error("The air_wings block is not brace-balanced.");
      const stateKey = String(Number(w.state) || 0);
      // does this state already exist inside the air_wings block?
      const body = text.slice(openIdx + 1, closeIdx);
      const inner = splitTop(body).find((s) => s.key === stateKey);
      const groupLines = genAirGroupLines(w.groups);
      if (inner) {
        const exOpenAbs = openIdx + 1 + body.indexOf("{", inner.start);
        const exCloseAbs = findClose(text, exOpenAbs);
        if (exCloseAbs < 0) throw new Error("An air_wings state block is not brace-balanced.");
        text = text.slice(0, exCloseAbs).replace(/\s*$/, "\n") + groupLines + "\n\t" + text.slice(exCloseAbs);
      } else {
        text = text.slice(0, closeIdx).replace(/\s*$/, "\n") + genAirStateEntry(w) + "\n" + text.slice(closeIdx);
      }
    }
  }
  if (!/\n$/.test(text)) text += "\n";
  return bom + text;
}

// Parse a common/units/*.txt file's `sub_units = { <key> = { … } }` block → the battalion/company palette
// for the division-template designer. Mods rename every key (Millennium Dawn uses Mot_Inf_Bat, not infantry),
// so the designer MUST scan these rather than hardcode a list. Returns per sub-unit: its combat_width, group
// (support = eligible for the support box), type/categories tags, equipment `need`, and a few display stats.
function parseSubUnitsFile(text) {
  const out = [];
  for (const top of splitTop(String(text || ""))) {
    if (top.key !== "sub_units") continue;
    for (const su of splitTop(innerBody(top.value))) {
      if (!su.key) continue;
      const b = splitTop(innerBody(su.value));
      const listOf = (key) => { const st = b.find((x) => x.key === key); return st ? splitTop(innerBody(st.value)).map((x) => x.key) : []; };
      const need = {};
      const needSt = b.find((x) => x.key === "need");
      if (needSt) for (const n of splitTop(innerBody(needSt.value))) need[n.key] = num(String(n.value).trim());
      const group = scalarOf(b, "group");
      const types = listOf("type");
      const numStat = (k) => num(scalarOf(b, k)); // undefined-safe number of a scalar stat
      out.push({
        key: su.key,
        group: group || null,
        types,
        categories: listOf("categories"),
        // Visual designer: the sub-unit's own icon/symbol hints + a short label.
        sprite: scalarOf(b, "sprite") || null,
        mapIconCategory: scalarOf(b, "map_icon_category") || null,
        abbreviation: (scalarOf(b, "abbreviation") || "").replace(/^"|"$/g, "") || null,
        combat_width: numStat("combat_width"),
        max_strength: numStat("max_strength"),
        max_organisation: numStat("max_organisation"),
        manpower: numStat("manpower"),
        // Combat stats the in-game designer shows (many are 0 on infantry — its punch comes from equipment).
        soft_attack: numStat("soft_attack"),
        hard_attack: numStat("hard_attack"),
        defense: numStat("defense"),
        breakthrough: numStat("breakthrough"),
        ap_attack: numStat("ap_attack"),
        air_attack: numStat("air_attack"),
        armor_value: numStat("armor_value"),
        hardness: numStat("hardness"),
        maximum_speed: numStat("maximum_speed"),
        recon: numStat("recon"),
        suppression: numStat("suppression"),
        entrenchment: numStat("entrenchment"),
        supply_consumption: numStat("supply_consumption"),
        weight: numStat("weight"),
        active: scalarOf(b, "active"),                 // "yes"/"no"/null (null = defaults available)
        special_forces: scalarOf(b, "special_forces") === "yes",
        need,
        // A sub-unit belongs in the SUPPORT box if its group is support or its type list includes support.
        isSupport: group === "support" || types.includes("support"),
      });
    }
  }
  return out;
}

// parseStockpile is exported because `add_equipment_to_stockpile` is a COUNTRY-HISTORY command as well as an
// instant_effect one — /api/units has to read the country history to see a stockpile Nova itself wrote there,
// and vanilla seeds one for 8 countries the same way. #stockpile-in-country-history-invisible
module.exports = { topLevelUnitsInsertionPoint, splitTop, parseUnitsFile, serializeUnitsFile, summarizeUnitsFile, aggregateOob, listCountryUnitFiles, genDivisionTemplate, genDivision, patchDivisionRaw, mergeOob, parseSubUnitsFile, genShip, genTaskForce, genFleet, addNavalAirOob, parseStockpile, parseStockpileBody };
