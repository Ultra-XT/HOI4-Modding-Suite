"use strict";
/**
 * Unified Mod Index (Roadmap Phase 1 — the backbone).
 *
 * A lightweight, read-only scanner that builds a cross-reference graph of a HOI4
 * mod so the editors stop being blind to each other. It is intentionally
 * DECOUPLED from the heavy maker parsers: it only needs ids, types, display
 * names, and the references between entities — not full-fidelity round-tripping.
 *
 * Entity types: focus, idea (national spirit), event, decision, technology,
 * equipment, country (game-start setup).
 *
 * On top of the graph it runs a first set of validation rules that directly
 * answer the user's real questions, e.g. "this spirit is never granted, so it
 * won't appear in game" and "this focus references something that doesn't exist."
 */
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Low-level parsing helpers
// ---------------------------------------------------------------------------

function stripLineComments(text) {
  // HOI4 comments run from # to end of line. Quotes rarely contain #, so this is safe.
  return String(text || "").replace(/#[^\n\r]*/g, "");
}

function findMatchingBrace(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * The DISPLAY name a block declares for itself, at depth 0 — `{ key: "<loc key>" }`, `{ literal: "text" }`,
 * or null when it declares none. #missing-loc-ignores-own-name
 *
 * HOI4 shows whatever a block's own `name =` resolves to, not the block id. A quoted value that is not
 * key-shaped is the displayed text itself and needs no localisation at all; a bare token names the key the
 * game will look up. Only depth 0 counts — a `name =` nested inside `ai_will_do` is a different thing
 * entirely. A character's `instance = { }` blocks are the one place a nested name IS a display name, and
 * characterInstances() reads each of those with this same helper, one instance body at a time.
 */
// Which key a block type uses to name itself. Ideas, characters and MIO blocks say `name =`; a national
// focus says `text =` — and it is the SAME mechanism, so it belongs in the same helper rather than in a
// second one that will drift. #focus-text-key-ignored
//
// #character-key-read-by-its-tail — a bare token is read with the class recruit_character reads a character
// token with (Unicode letters, digits, `_`, `.`, `-`) and then on to the END of the token. This read
// [A-Za-z0-9_.\-] and stopped at the first letter outside it, so Rise of Nations' `name = GER_jürgen_wagner`
// was taken for the key `GER_j`: Mod Health reported `GER_j` missing, and Fix all wrote ` GER_j:0 "GER J"` —
// a key nothing reads — while the game went on showing the raw token. A key read whole may be one that no
// localisation line can hold, and RULE 3 then says so instead of offering a fix (#a-name-the-game-cannot-localise).
const OWN_NAME_KEY_RE = {
  name: /^\s*name\s*=\s*(?:"([^"\r\n]*)"|([\p{L}\p{N}_.-]+))/u,
  text: /^\s*text\s*=\s*(?:"([^"\r\n]*)"|([\p{L}\p{N}_.-]+))/u,
};
// …"on to the end": a character outside the class does not end a token in script. Rise of Nations writes
// `name=USA_terrence_o`shaughnessy`, and that whole token is what the game looks up, not `USA_terrence_o`.
// A token runs until whitespace, a brace, a quote or `=` (the comment mark is stripped before this reads).
const TOKEN_TAIL_RE = /^[^\s{}="]*/;

function ownDisplayName(inner, keyName = "name") {
  const src = String(inner || "");
  const keyRe = OWN_NAME_KEY_RE[keyName] || OWN_NAME_KEY_RE.name;
  let depth = 0;
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "");
    if (depth === 0) {
      const m = keyRe.exec(line);
      if (m) {
        // `field` is the keyword the block actually used, so a message can send the author to the line that
        // exists: a focus writes `text =`, everything else writes `name =`, and telling a focus author to
        // look for `name =` sends them hunting for a line their file does not contain.
        if (m[2]) return { key: m[2] + TOKEN_TAIL_RE.exec(line.slice(m[0].length))[0], field: keyName };
        const lit = m[1] || "";
        // A quoted value that is ALSO key-shaped is ambiguous; HOI4 resolves it as a key if one exists, so
        // treat it as a key and let the caller fall back to "no loc needed" when it does not. "Key-shaped" is
        // what a localisation line can hold — canBeLocalizationKey, the one write-side test — and not the bare
        // token's class above: the game's lookup of a quoted value no line can hold (an accented letter, a space,
        // a ":") always misses, so it prints the text as written, which is what vanilla's and Millennium Dawn's
        // `name = "Jindřich Joch"` rely on (#loc-key-must-be-ascii).
        return canBeLocalizationKey(lit)
          ? { key: lit, field: keyName }
          : { literal: lit, field: keyName };
      }
    }
    for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth = Math.max(0, depth - 1); }
  }
  return null;
}

// #loc-key-must-be-ascii — A LOCALISATION KEY HAS A NARROWER CHARSET THAN A SCRIPT TOKEN. 0 of 3,172,039 key lines
// across vanilla and Millennium Dawn hold a non-ASCII byte; the only characters beyond [A-Za-z0-9_] that appear at
// all are "." (1,258,326) and "-" (6,460). Character script TOKENS meanwhile may hold one — 32 do (25 vanilla, 7 MD)
// — and NONE of those 32 carries a matching key: 30 supply the name as a quoted literal instead, and 2 use an
// accent-folded ASCII key. HOI4 answered the one non-ASCII key Nova wrote with "Expected colon(:)", a parse error in
// a file every character shared. Re-measured 2026-11-13 over the base game and the 14 installed Workshop items: 0 of
// 4,790,502 key lines hold a non-ASCII byte or a ":", and beyond [A-Za-z0-9_] they hold "." (1,971,289), "-" (3,395)
// and, on three Old World Blues lines, "'" — which this does not accept either.
//
// #loc-key-colon — ":" is not a key character: it is what ENDS the key on a localisation line (`key:0 "text"`), and
// Mod Health's own reader, scanLocalization, reads a key up to it. This class held one anyway, copied from the
// readers' class, and as soon as Mod Health's fixers wrote through it, Fix all answered Novum Vexillum's
// `custom_effect_tooltip = "Abstained:"` with ` Abstained::0 "Abstained:"`, a line Mod Health's reader cannot read
// a key from: it reported the row fixed, and its own rescan reported the row again (measured on a copy). The fixers'
// old gate had refused the ":".
//
// This tests the WRITE side only, and this is its one definition. server.js imports it for the Character maker's
// `name = <token>` and for both Mod Health fixers; RULE 3 and RULE 1e below ask it of the key they report, so a row
// whose key no line can hold says so and is never offered to the fixer (#a-name-the-game-cannot-localise); and
// ownDisplayName asks it whether a quoted name can be a key at all. server.js's localisation READERS stay
// deliberately Unicode-aware — narrowing one of those once made an existing key invisible to the parser that had
// just written it (#loc-key-ascii-only).
function canBeLocalizationKey(key) {
  const s = String(key || "");
  return s.length > 0 && /^[A-Za-z0-9_.-]+$/.test(s);
}

// The sentence a row carries when its key can never be written, and the fields that keep the fix tier off it.
// `autoFix: false` is the per-problem veto: the card renders no fix button for it (#replace-path), Fix all's
// filter (isDeterministicFix) skips it, and both fix endpoints refuse it. `locKeyCannotBeWritten` lets the card
// say why there is no button.
function markUnwritableLocKey(row, key, how) {
  if (canBeLocalizationKey(key)) return row;
  // Each character of the key the guard refuses, named — asked of the guard itself, so the charset lives in one place —
  // and the consequence measured for its kind: a letter outside ASCII (#loc-key-must-be-ascii), a ":" (#loc-key-colon).
  const outside = [...new Set([...String(key)].filter((ch) => !canBeLocalizationKey(ch)))];
  const why = outside.some((ch) => ch.codePointAt(0) > 0x7f)
    ? ` (HOI4 stopped reading a file at the one non-ASCII key Nova once wrote, with "Expected colon(:)")`
    : outside.includes(":") ? ` (a ":" is what ends the key on a localisation line: key:0 "text")` : "";
  row.autoFix = false;
  row.locKeyCannotBeWritten = true;
  row.message += ` Nova will not write a localisation line for "${key}": it holds ${outside.map((ch) => `"${ch}"`).join(", ") || "no character at all"}, and a localisation key is spelled in ASCII letters, digits and _ . - only${why}. So there is no auto-fix. ${how}`;
  return row;
}

/**
 * Yield each `key = { ... }` block at the TOP level of `body`, skipping nested
 * blocks. Non-block `key = value` assignments are ignored.
 *
 * #character-key-read-by-its-tail — the key is read with the characters recruit_character reads a character
 * token with (Unicode letters, digits, `_`, `.`, `-`), as one run. It read [A-Za-z0-9_.\-], and because the
 * scan is not anchored a key holding a letter outside that class matched from after the letter: vanilla's
 * `CHL_jorge_gonzález_von_marées = {` was indexed as the character `es`, `PRU_sebastián_lynch` and
 * `PRU_hilarión_lynch` both as `n_lynch` (a false duplicate_id ERROR), and a key ENDING in such a letter —
 * Millennium Dawn's `ITA_giovanni_ridinò` — matched nowhere, so the scan stepped inside the character and
 * yielded its `portraits`, `corps_commander` and `advisor` blocks as characters of their own. Over the base
 * game and the 14 installed Workshop items, 146 character keys hold such a letter and 12 end in one.
 * The class's letter-first rule is NOT taken: this reader has always accepted a key that starts with a digit,
 * and with an unanchored scan a letter-first class would read `1st_army = {` as `st_army`.
 */
function* topLevelBlocks(body) {
  const re = /([\p{L}\p{N}_.-]+)\s*=\s*\{/gu;
  let i = 0;
  while (i < body.length) {
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m) break;
    const open = body.indexOf("{", m.index);
    if (open === -1) break;
    const close = findMatchingBrace(body, open);
    if (close === -1) {
      // Tolerate an unbalanced/unclosed block (some vanilla files — e.g. common/ideas/switzerland.txt —
      // carry a stray brace HOI4 ignores): treat the rest of the body as this block's inner so the
      // entities inside still get indexed, instead of dropping everything from here on (which made the
      // validator cry "broken_reference" for valid vanilla country ideas like SWI_swiss_neutrality).
      yield { key: m[1], inner: body.slice(open + 1) };
      break;
    }
    yield { key: m[1], inner: body.slice(open + 1, close) };
    i = close + 1;
  }
}

/** Collect files with a given extension under a directory (recursive, bounded). */
function collectFiles(dir, ext, max = 4000) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < max) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(ext)) out.push(full);
    }
  }
  return out;
}

// #a-file-nova-could-not-read-scanned-as-clean — AN UNREADABLE FILE AND AN EMPTY ONE ARE NOT THE SAME.
//
// This returns "" when the read fails, and an empty file produces no problems — so a mod containing a file
// Nova could not open scanned as healthy, which is the one thing Mod Health exists to prevent. Measured on
// a scratch mod with one good ideas file and one unreadable one: 2 problems, both about the good file, and
// nothing at all about the other.
//
// The failures are recorded rather than reported from here, because readSafe runs during reference
// extraction as well as validation and the same file would otherwise be named several times.
//
// ⭐ Reporting this cannot cry wolf, and that was measured before it was written: across vanilla and all
// five installed workshop mods — 41,195 files under common/, history/, localisation/, events/ and map/ —
// ZERO failed to read, and there are zero directories named like a data file. It fires only when something
// is genuinely wrong on the user's machine.
const _readFailures = new Map(); // absolute path -> errno/message, deduped
function resetReadFailures() { _readFailures.clear(); }
function takeReadFailures() { return [..._readFailures.entries()].map(([file, error]) => ({ file, error })); }
function readSafe(file) {
  try { return fs.readFileSync(file, "utf8"); }
  catch (e) { _readFailures.set(String(file), (e && e.code) || (e && e.message) || "unknown error"); return ""; }
}

// ---------------------------------------------------------------------------
// Reference extraction — the cross-maker links that matter for validation
// ---------------------------------------------------------------------------

/**
 * Extract outgoing references from a block of HOI4 script. Returns
 * [{ context, type, id }]. Covers the grant/link patterns that connect makers.
 */
function extractRefs(text) {
  // #focus-id-truncated, ON THE REFERENCE SIDE — every id pattern below read `[A-Za-z0-9_]`, but a HOI4 id
  // may contain a hyphen or a dot and shipped content is full of them. `scanFocuses` was already widened for
  // exactly this ("a focus id may contain a hyphen or a dot, and both occur in shipped content"), so the
  // DEFINITION was indexed under its real name while the REFERENCE to it was truncated at the hyphen — and
  // the two then failed to match.
  //
  // Strictly measured over the installed corpus (a reported broken_reference where a real entity of the same
  // type exists whose id continues past it with a character the narrow class cannot represent):
  //
  //     96 false broken_reference ERRORS — 14 of them on the SHIPPING BASE GAME, 41% of vanilla's total
  //     relative_position_id 78 · add_ideas 13 · swap_add_idea 3 · leads_to_tech 2
  //     vanilla: AST_the_irish_anti -> AST_the_irish_anti-britain_pact
  //              ETH_anti           -> ETH_anti-italian_propaganda
  //              ETH_re             -> ETH_re-convene_the_parliament
  //              ETH_the_second_italo -> ETH_the_second_italo-ethiopian_war
  //
  // ⭐ `ETH_anti-italian_propaganda` is named in the comment of the fix that widened the definition side.
  // The same id, the same hyphen, the other half of the same bug, left behind.
  //
  // ASCII is enough here and the `u` flag is not needed: across vanilla and every installed mod, ZERO ids of
  // a referenced type (idea, focus, tech, decision, event) contain a non-ASCII character. The class matches
  // the one scanFocuses already uses, so the two sides now agree by construction.
  // ⚠ Re-measured 2026-11-04 over the base game and the 14 installed Workshop items, that holds for references
  // except where an IDEA is an advisor: vanilla's events/TOA_Chile.txt does
  // `remove_ideas = CHL_jorge_gonzález_von_marées`, read here as `CHL_jorge_gonz`, which resolves only because
  // scanCharacters reads the advisor's idea_token with the same class and cuts it at the same letter; and The
  // Road to 56 lists `NIC_anastasio_somoza_garcía_advisor` in an add_ideas block, which pushIdeaList drops.
  // Character KEYS, which the index holds as ideas, carry such letters far more often (146 over the same set), and
  // topLevelBlocks reads those whole (#character-key-read-by-its-tail). That leaves both cases above as they were, and
  // changes what widening this side alone would do: the first would now resolve against the character's whole key,
  // but the second would still become a false finding, because an idea_token that differs from its character's key
  // is indexed only as scanCharacters reads it, with this class. Measured 2026-11-15 with this side's idea readers
  // widened: the base game 7 broken_reference -> 7, The Road to 56 52 -> 53 (that token). So this side and
  // scanCharacters' idea_token class move together or neither does. The one context widened here is
  // recruit_character, at the end.
  const t = stripLineComments(text);
  const refs = [];
  // A trailing `.` or `-` is punctuation, never part of an id — the widened classes are greedy, so trim it
  // here rather than relying on a `\b` that no longer means what it did when the class was word-only.
  // `call` is the keyword the file wrote, where one context stands for several (#an-event-call-is-named-as-written).
  const push = (context, type, id, call) => {
    const clean = String(id || "").replace(/[.\-]+$/, "");
    if (clean) refs.push(call ? { context, type, id: clean, call } : { context, type, id: clean });
  };
  // #runtime-built-id-guard-not-adopted — A VALUE FOLLOWED BY `[` IS AN ID BUILT AT RUN TIME, and every class below stops
  // at the `[`, so what a reader captured there is only the literal prefix. The Digital Frontier's events/00_Ages_events.txt
  // does `remove_ideas = age_ability_[ABILITY]` inside a meta_effect (ABILITY is "[?v]": one of its 52 age_ability_<n>), and
  // pushed as a reference that prefix made broken_reference report a missing idea "age_ability_" — an ERROR with an AI
  // fix button, about script the game runs as written. Three readers asked (add_ideas, add_timed_idea, swap_ideas' add_idea);
  // remove_ideas, activate_decision, the keyed `{ idea = X }` form and most of the rest did not. So every reader that
  // captures an id pushes through pushAt (save set_technology's inner reader and recruit_character, which say why where
  // they stand), and pushAt asks once: is the character after the match — past any `.` or `-` a trailing \b gave
  // back, as in `ns.[N]` — a `[`? The prefix of a runtime-built GRANT is still recorded, as add_ideas_prefix below.
  // test-an-id-built-at-run-time-is-not-a-broken-reference.js derives the readers from this function and probes each.
  const builtAtRunTime = (s, end) => { let j = end; while (s[j] === "." || s[j] === "-") j++; return s[j] === "["; };
  // `call` is the keyword written, where it is not the context's own name (#a-reference-is-named-by-the-call-it-writes).
  const pushAt = (context, type, m, s = t, call) => { if (!builtAtRunTime(s, m.index + m[0].length)) push(context, type, m[1], call); };
  // #idea-list-block-has-two-forms — BOTH of these are legal inside the braces:
  //     add_ideas = { X Y }        bare ids
  //     add_ideas = { idea = X }   an `idea =` key — and this is the form VANILLA writes
  // Splitting the body on whitespace alone reads the second as a reference to an idea literally called
  // "idea". It stayed hidden while remove_ideas was skipped wholesale; the moment that skip came off, the
  // shipping base game produced two findings — `remove_ideas = { idea = organization_of_african_unity_
  // member_idea }` in common/decisions/African_Union_decisions.txt and the same shape twice in
  // events/WUW_Germany.txt. A rule that fires on vanilla is a bug in the rule, so both list readers take
  // the keyed form first and only then split what is left. An id built at run time pushes nothing in either form:
  // the keyed one goes through pushAt (#runtime-built-id-guard-not-adopted), and a bare `foo_[ROOT]` fails the split's
  // whole-token test.
  const pushIdeaList = (context, body) => {
    let rest = String(body || "");
    for (const km of rest.matchAll(/\bidea\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt(context, "idea", km, rest);
    rest = rest.replace(/\bidea\s*=\s*[A-Za-z_][A-Za-z0-9_.\-]*/g, " ");
    rest.split(/\s+/).map((s) => s.trim()).filter(Boolean)
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(s))
      .forEach((id) => push(context, "idea", id));
  };

  // add_ideas = X   |   add_ideas = { X Y ... }
  for (const m of t.matchAll(/add_ideas\s*=\s*\{([^{}]*)\}/g)) pushIdeaList("add_ideas", m[1]);
  // Vanilla's MUN_Czechoslovakia.txt does `add_ideas = CZE_trade_agreement_[CZE_idea_country]`, an id built at run time:
  // pushAt skips it (#runtime-built-id-guard-not-adopted), and its prefix is recorded as add_ideas_prefix below.
  for (const m of t.matchAll(/add_ideas\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)\b/g)) pushAt("add_ideas", "idea", m);

  // add_timed_idea = { idea = X days = N } — an unambiguous grant, and the single biggest reason
  // orphan_spirit cried wolf: not recognising it made 1,302 Millennium Dawn spirits and 879 vanilla ones
  // look as though nothing in the mod ever granted them. Reusing the "add_ideas" context means the
  // orphan rule's grantedIdeas set needs no change. #orphan-spirit-crywolf
  //
  // Deliberately NOT modify_timed_idea: that presupposes the idea is already present, so treating it as a
  // grant would hide a genuinely unwired spirit.
  // `add_timed_idea = { idea = tribute_idea_[ROOTTAG] }` builds the id at run time: pushAt skips it, and the prefix is recorded
  // below.
  for (const m of t.matchAll(/add_timed_idea\s*=\s*\{[^{}]*?\bidea\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("add_ideas", "idea", m, t, "add_timed_idea");

  // A grant whose id is BUILT AT RUNTIME: `add_timed_idea = { idea = tribute_idea_[ROOTTAG] }` resolves to a
  // different idea per country, and the patterns above can only see the literal prefix before the `[`. Every
  // idea sharing that prefix is granted, so record the prefix separately — recording it as an ordinary id
  // would make broken_reference flag a reference to something that does not literally exist.
  // In Millennium Dawn this single construct accounts for 448 spirits. #orphan-spirit-crywolf
  for (const m of t.matchAll(/(?:\badd_ideas?\b|\bidea)\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)\[/g)) {
    // A 1-2 character prefix would match most of the mod; require enough to be meaningful.
    if (m[1].length >= 3) push("add_ideas_prefix", "idea_prefix", m[1]);
  }

  // remove_ideas (so we don't treat a spirit that's only ever removed as "granted")
  // — recorded separately, not counted as a grant. The Digital Frontier's `remove_ideas = age_ability_[ABILITY]` is built at
  // run time, and was reported as a missing idea "age_ability_" until this reader went through pushAt.
  for (const m of t.matchAll(/remove_ideas\s*=\s*\{([^{}]*)\}/g)) pushIdeaList("remove_ideas", m[1]);
  for (const m of t.matchAll(/remove_ideas\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)\b/g)) pushAt("remove_ideas", "idea", m);

  // swap_ideas = { remove_idea = X add_idea = Y } — the ADDED idea Y is granted in game, so it must
  // exist (and counts as a grant for the orphan-spirit rule). The removed one is treated like
  // remove_ideas: not validated, not a grant. The \badd_idea\b boundary never matches `add_ideas`.
  for (const m of t.matchAll(/\badd_idea\b\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("swap_add_idea", "idea", m, t, "add_idea");

  // set_technology = { X = 1 Y = 0 }. Not through pushAt: this match ends at the value, and an id built at run time
  // (`X_[A] = 1`) never matches, since the class has to reach the `=`.
  for (const m of t.matchAll(/set_technology\s*=\s*\{([^{}]*)\}/g)) {
    for (const mm of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_.\-]*)\s*=\s*[01]/g)) push("set_technology", "tech", mm[1]);
  }

  // Firing an event: `<kind>_event = X` or `<kind>_event = { id = X days = 5 … }`.
  //
  // Only country_event's BLOCK form was recognised, and only country/news in the bare form — so a
  // `news_event = { id = X days = 3 }`, any state_event, and the two leader-scoped kinds all read as
  // "nothing fires this". Measured against the corpora that is not a rounding error: with these patterns
  // missing, 668 of vanilla's 6578 events and 737 of Millennium Dawn's 9336 look unfired. With them, zero
  // do — shipping content never leaves an event dangling, which is what makes an orphan-event rule worth
  // having at all.
  const EVENT_KINDS = "country_event|news_event|state_event|unit_leader_event|operative_leader_event";
  // An id built at run time — Millennium Dawn's scripted effect does `country_event = MD_cyber.1[TYPE]` — is skipped by pushAt.
  // #an-event-call-is-named-as-written — every kind is filed under the one context "country_event" (RULE 2 and the reference
  // test key on it), and broken_reference named that context: the base game's poland.2101 does `news_event = { id =
  // NSB_news.201 }` and was told it calls it "via country_event". The ref now carries the keyword the file wrote, as `call`:
  // the match begins with it. Each reader keeps its one capture group, the id, which the run-time-id test derives them by.
  const pushEvent = (m) => { if (!builtAtRunTime(t, m.index + m[0].length)) push("country_event", "event", m[1], /^[A-Za-z_]+/.exec(m[0])[0]); };
  for (const m of t.matchAll(new RegExp(`(?:${EVENT_KINDS})\\s*=\\s*\\{[^{}]*\\bid\\s*=\\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)`, "g"))) pushEvent(m);
  for (const m of t.matchAll(new RegExp(`(?:${EVENT_KINDS})\\s*=\\s*([A-Za-z_][A-Za-z0-9_.]*)\\b`, "g"))) pushEvent(m);

  // activate_decision = X   |   activate_decision = { X Y ... }
  //
  // Nova writes these itself (the "➕ Add to country" wiring, focus rewards, event options), so a rename or a
  // delete can leave one pointing at an id that no longer exists — and HOI4 does not log an unknown id here,
  // it just never makes the decision available. Without this pattern Mod Health reported such a mod as clean,
  // which is the worst outcome for a rule set whose whole job is to catch exactly this.
  //
  // Safe to validate: decision ids are in the known-id universe on both sides — scanDecisions runs for the
  // mod, for vanilla, and for declared dependencies — so an add-on activating a Millennium Dawn decision
  // resolves rather than crying wolf. Millennium Dawn's `activate_decision = investments_project_[INDEX]_decision` builds the id
  // at run time: the bare form goes through pushAt, and a bare token in the block form fails its whole-token test.
  for (const m of t.matchAll(/activate_decision\s*=\s*\{([^{}]*)\}/g)) {
    m[1].split(/\s+/).map(s => s.trim()).filter(Boolean)
      .filter(s => /^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(s))
      .forEach(id => push("activate_decision", "decision", id));
  }
  for (const m of t.matchAll(/activate_decision\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)\b/g)) pushAt("activate_decision", "decision", m);

  // complete_national_focus = X / unlock_national_focus etc.
  // #focus-id-truncated — these must use the SAME identifier class as the focus DEFINITION scan, which
  // allows hyphens and dots. Widening only the definition side made every reference to a hyphenated focus
  // resolve to a truncated id that no longer exists, turning a fixed bug into 37 new broken_reference
  // reports on Millennium Dawn. Both sides move together or neither does.
  for (const m of t.matchAll(/complete_national_focus\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("complete_national_focus", "focus", m);

  // load_focus_tree = X   |   load_focus_tree = { tree = X ... }
  for (const m of t.matchAll(/load_focus_tree\s*=\s*\{[^{}]*\btree\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("load_focus_tree", "focus_tree", m);
  for (const m of t.matchAll(/load_focus_tree\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("load_focus_tree", "focus_tree", m);

  // focus links: prerequisite = { focus = X } and mutually_exclusive = { focus = X }
  // (a focus DEFINITION is `focus = {` and won't match `focus = X`).
  //
  // ONLY THOSE TWO KEYS ARE LINKS (#focus-progress-not-a-link). `focus = X` is also a TRIGGER argument —
  // `focus_progress = { focus = X progress > 0 }` asks how far X has got, and naming yourself there is
  // perfectly legal. Labelling every occurrence focus_link made focus_self_reference fire on Paradox's own
  // content: both of vanilla's firings are baltic_shared.txt, where BALTIC_restore_workers_republic checks
  // its own progress inside ai_will_do, right next to Paradox's comment about not wanting several Baltic
  // states down the same path. So look BACK for the enclosing key and only call it a link when it is one;
  // everything else gets a context the self-reference rule ignores.
  for (const m of t.matchAll(/\bfocus\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) {
    const before = t.slice(Math.max(0, m.index - 220), m.index);
    // The nearest `<key> = {` opened before this point, still unclosed.
    let depth = 0, enclosing = "";
    for (let i = before.length - 1; i >= 0; i--) {
      const ch = before[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          const km = /([A-Za-z_][A-Za-z0-9_.\-]*)\s*=\s*$/.exec(before.slice(0, i));
          enclosing = km ? km[1] : "";
          break;
        }
        depth--;
      }
    }
    // #a-reference-is-named-by-the-call-it-writes — the block the file wrote it in (prerequisite, focus_progress…) names the call,
    // not the context: the base game's usa.3 was told it calls USA_pearl_harbor_gambit "via focus_arg", a word no file holds.
    pushAt(enclosing === "prerequisite" || enclosing === "mutually_exclusive" ? "focus_link" : "focus_arg",
      "focus", m, t, enclosing || "focus");
  }

  // focus layout anchor: `relative_position_id = X` positions a focus relative to another focus in the
  // tree. If X doesn't exist, HOI4 drops the focus to the origin (overlapping mess) — a real, easy-to-
  // make bug when copying focuses. The key is focus-only, so capturing it here is false-positive-safe.
  for (const m of t.matchAll(/relative_position_id\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("relative_position_id", "focus", m);

  // tech graph edges
  for (const m of t.matchAll(/leads_to_tech\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) pushAt("leads_to_tech", "tech", m);

  // recruit_character — captured so we can WARN when it appears in a focus/event (it only executes
  // in game-start history files). NOT validated as a broken_reference (characters index as ideas).
  //
  // #recruit-character-id-read-short — A CHARACTER TOKEN IS NOT THE SHAPE OF THE OTHER IDS HERE. This read
  // [A-Za-z_][A-Za-z0-9_.]* and stopped at the first hyphen or accented letter: it read vanilla's
  // `recruit_character = AUS_arthur_seyss-inquart` as `AUS_arthur_seyss`, COS_josé_maría_barahona as `COS_jos`,
  // IRE_Éamon_de_valera as `IRE_`. Over the base game and the 14 installed Workshop items, 154 recruit_character
  // references read short (counted once per file, as extractRefs returns them), 30 of them vanilla's; with this
  // class, none (measured 2026-11-04, and again 2026-11-13 on 1.19.5.0). Every one sits in country history, which
  // RULE 4 does not judge, so the cut was latent: over the same set RULE 4 fires twice, both times on a whole id,
  // with the old class and the new alike (2026-11-13). A focus, event or decision recruiting such a character
  // would have been warned under the head, a character that exists nowhere.
  // It is the class Nova already VALIDATES a character token with everywhere else (the Character maker's save
  // guard, the startup bridge, renameCharacterRecruits): Unicode letters, digits, `_`, `.` and `-`. Validates,
  // not finds: the startup bridge and renameCharacterRecruits then find the token in a history file with
  // `<id>\b`, an ASCII word boundary, so an id that is the head of another at a `-` or a `.` matches the longer
  // one too, and an id that ends in a `.` or a non-ASCII letter is never found. Hearts of Minecraft recruits both
  // SRF_Federal-Government and SRF_Federal-Government-2: removing the first from its country removes both lines,
  // and renaming it rewrites the second as `<new>-2` (server.js's own functions run in memory on that file,
  // 2026-11-13, as the product-change review found on 2026-11-10). That is server.js's to fix, not this reader's.
  // Pushed as read, not through push(): that trims a trailing `.` or `-` as punctuation, and a character token may
  // END in a dot — Novum Vexillum defines `USA_john_nicholson_jr.` and recruits it by that name. Only RULE 4
  // judges these, and RULE 2 skips the context, so nothing resolves against the wider id. Not through pushAt either:
  // RULE 4 judges WHERE a recruit stands, which is as true of one built at run time.
  for (const m of t.matchAll(/recruit_character\s*=\s*([\p{L}_][\p{L}\p{N}_.-]*)/gu)) refs.push({ context: "recruit_character", type: "character", id: m[1] });

  // de-dupe by context+type+id
  const seen = new Set();
  return refs.filter(r => { const k = `${r.context}|${r.type}|${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Tech-graph references that live ONLY inside a tech block: `prerequisite`, `xor`, `dependencies`,
 * and `sub_technologies` point at OTHER tech ids; `enable_equipments` points at equipment archetypes.
 * These are deliberately kept OUT of the generic extractRefs() — a focus's `prerequisite = { focus =
 * X }` would otherwise be misread as a tech ref — so this runs only from scanTechnologies(), against a
 * single tech's inner body. The broken_reference rule already accepts ids from the mod, its
 * dependencies, AND vanilla, so a link to e.g. a Millennium Dawn tech/equipment is NOT flagged; only a
 * genuinely missing/renamed target is.
 */
function extractTechGraphRefs(techInner) {
  const refs = [];
  const seen = new Set();
  const push = (context, type, id) => {
    const k = `${context}|${type}|${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    refs.push({ context, type, id });
  };
  const pushTechIds = (context, body) => {
    // Flatten nested OR{}/braces and `id = 0|1` assignments down to bare identifiers, then keep only
    // things that look like a tech id. Numbers (the = 0 / = 1 values) and the OR/AND/NOT logic
    // keywords inside a prerequisite block are dropped.
    const flat = String(body || "").replace(/[{}=]/g, " ");
    for (const tok of flat.split(/\s+/)) {
      const s = tok.trim();
      if (!s) continue;
      if (/^-?\d+(?:\.\d+)?$/.test(s)) continue;
      if (/^(?:OR|AND|NOT)$/i.test(s)) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(s)) continue;
      push(context, "tech", s);
    }
  };
  const pushEquipmentIds = (body) => {
    // enable_equipments may wrap ids in a DLC gate: `limit = { has_dlc = "X" } infantry_equipment_0`.
    // Strip every nested { ... } block (repeatedly, for safety), then strip `key =` assignments so the
    // gate's keys (limit, has_dlc, …) don't survive as bare ids — what's left are the equipment ids.
    let s = String(body || "");
    let prev;
    do { prev = s; s = s.replace(/\{[^{}]*\}/g, " "); } while (s !== prev);
    s = s.replace(/[A-Za-z_][A-Za-z0-9_.]*\s*=/g, " ");
    for (const tok of s.split(/\s+/)) {
      const id = tok.trim();
      if (id && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) push("enable_equipments", "equipment", id);
    }
  };
  for (const blk of topLevelBlocks(stripLineComments(techInner))) {
    if (blk.key === "prerequisite" || blk.key === "xor" ||
        blk.key === "dependencies" || blk.key === "sub_technologies") {
      pushTechIds(blk.key, blk.inner);
    } else if (blk.key === "enable_equipments") {
      pushEquipmentIds(blk.inner);
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Localization (for display names)
// ---------------------------------------------------------------------------

// #loc-replace-folder-unseen — a file inside a `replace` folder OVERRIDES one that is not. The HOI4 wiki
// gives localisation/<lang>/replace/ as the reliable way to override a string, and Millennium Dawn uses it
// heavily: 6676 keys in english/replace, 109 of them also defined outside it, and 105 of those with a
// DIFFERENT value.
//
// This took first-wins over collectFiles(), which is recursive and yields every .yml sitting directly in
// english/ before it descends into english/replace/ — so the value the game DISCARDS always won, and Home and
// Mod Health listed 105 Millennium Dawn entities under text the game never shows. The listed `replace/english`
// directory did not help: the real layout is english/replace, the other way round, and MD has no such folder.
//
// Two passes instead: everything outside replace/ first-wins as before, then replace/ overrides.
// #loc-scan-only-looked-in-english — AND THE GAME LOOKS EVERYWHERE UNDER localisation/.
//
// This started its walk at localisation/english/, so a mod that drops its .yml straight into
// localisation/ — which the game is perfectly happy with — had EVERY key invisible to Mod Health. Measured
// over the installed corpus: 7,645 english keys in 3 mods, including one whose entire 3,315-key
// localisation Nova could not see.
//
// The damage was not just false "missing localisation" findings. The deterministic auto-fix then wrote a
// PLACEHOLDER for a key that already had authored text: TPT_GUARANTEE reads "§HGuarantee§!" in
// _tpt_l_english.yml, and one "Fix all" click added `TPT_GUARANTEE:0 "TPT GUARANTEE"` to another file.
// Keys merge across files, so which of those the player sees is a coin toss — a deterministic fix
// overwriting the author's own words with a humanised version of the key. The problem also never cleared,
// so "Fix all" reported 31 fixes, wrote nothing on the second click, and offered the same 31 for ever.
//
// The wiki settles both halves (hoi4.paradoxwikis.com/Localisation, checked 2026-09-04):
//   folder — "Localisation is stored within the /Hearts of Iron IV/localisation/ folder, in which any
//            sub-folder can be used."
//   name   — "The filename has to contain the language's internal name as the file will not be loaded
//            otherwise."
// So the walk starts at localisation/ and the LANGUAGE comes from the filename, which is the game's own
// test. That second half is not free: 11 files in the corpus sit inside localisation/english/ with an
// `l_english:` header but a name the game rejects (RON_Bhutan_I_english.yml — a capital I for the l — and
// _Non_Aligned_Political_l_english.yml.yml). Their 750 keys DO NOT LOAD in game, so Nova counting them as
// present was a false negative, and reporting those entities as unlocalised is correct rather than a
// regression.
//
// localisation/english/replace/ is still reached, because the walk is recursive and inReplace() matches a
// `replace` segment at any depth.
function scanLocalization(root) {
  const names = {};
  const all = [];
  for (const sub of ["localisation", "localization"]) {
    for (const f of collectFiles(path.join(root, sub), ".yml")) {
      if (/_l_english\.yml$/i.test(path.basename(f))) all.push(f);
    }
  }
  const inReplace = (f) => String(f).split(/[\\/]+/).some((seg) => seg.toLowerCase() === "replace");

  // First-wins within each pass; the replace/ pass then overrides whatever the first one settled on.
  const absorb = (files, claimed) => {
    for (const f of files) {
      const txt = readSafe(f);
      // ANCHOR ON THE OPENING QUOTE, NOT THE END OF THE LINE (#loc-line-trailing-comment).
      //
      // The old pattern required the closing quote to be the last thing on the line, so any value carrying a
      // trailing `#` comment simply did not resolve — 344 such lines in vanilla's english localisation and
      // 746 in Millennium Dawn's. Paradox ships them: SEA_focus_l_english.yml:566 reads
      //     JAP_hakko_ichiu: "Hakko Ichiu" # Hakkō Ichiu
      // and Nova called that focus unlocalised. It also demanded at least one space after the version
      // number, which `key:0"value"` does not have.
      //
      // Two Mod Health rules read this map, so both were poisoned: 20 of vanilla's missing_localization
      // firings and 13 of its 33 tooltip_key_no_localization firings were keys that DO exist.
      //
      // Take the value up to the LAST unescaped quote on the line — everything after it is a comment.
      for (const line of txt.split(/\r?\n/)) {
        const head = /^\s*([A-Za-z0-9_.\-]+):\s*\d*\s*"/.exec(line);
        if (!head) continue;
        const key = head[1];
        if (claimed.has(key)) continue;
        const valueStart = head[0].length;
        let end = -1;
        for (let i = line.length - 1; i >= valueStart; i--) {
          if (line[i] !== '"') continue;
          let slashes = 0;
          for (let j = i - 1; j >= valueStart && line[j] === "\\"; j--) slashes++;
          if (slashes % 2 === 0) { end = i; break; }
        }
        claimed.add(key);
        names[key] = end === -1 ? line.slice(valueStart) : line.slice(valueStart, end);
      }
    }
  };
  absorb(all.filter((f) => !inReplace(f)), new Set());
  absorb(all.filter(inReplace), new Set());
  return names;
}

// #modhealth-vanilla-substring, A SECOND TIME — ASK WHICH ROOT IS THE GAME, DO NOT READ A PATH.
//
// This decided "is this the base game?" with `/steamapps[\/]common[\/]hearts of iron iv/i` against the whole
// path, and it is not anchored at the end. Two ways that is wrong, and the first one loses rules silently:
//
//   D:/…/steamapps/common/Hearts of Iron IV/mod/my_mod   -> matched  -> a MOD kept inside the game folder
//                                                                       lost the BOM, duplicate-key and
//                                                                       malformed-value rules entirely
//   D:/Games/HOI4, C:/GOG/Hearts of Iron IV              -> no match -> a non-Steam install is not
//                                                                       recognised as the game at all
//
// The identical mistake, one layer up, is what `test-modhealth-vanilla-detection.js` was written for: a mod
// called "Vanilla Plus" had its crash checks switched off by `/vanilla/i.test(path)`. That test states the
// rule in its own header — *never infer identity from a word appearing somewhere in a path the user chose* —
// and this caller never adopted it.
//
// hoi4.exe is the decisive marker and does not care where the game is installed: a mod folder has none.
// Every sprite name declared by any .gfx file under these roots. Walked from the ROOT, not from interface/:
// HOI4 keeps a great many of its sprites in dlc/<name>/interface/, and missing those makes perfectly good
// base-game icons look undeclared.
//
// ⚠️ DELIBERATELY NOT CACHED ACROSS SCANS — #sprite-name-cache-never-refreshes, which this codebase has
// already paid for once. server.js's declaredSpriteNames() was "a plain Map with no TTL and no invalidation:
// populated once per root, then frozen for the life of the process", so after /api/upload-gfx wrote the
// user's new icon the focus save went on insisting that icon did not exist until the app was restarted. A
// validator that fires on the user's own successful action teaches people to ignore it. server.js solved it
// by keying on spriteWriteEpoch; mod-index cannot see that counter, and a module-level Map here would
// reproduce the identical bug in Mod Health — upload an icon, rescan, and the focus is still reported blank.
//
// A cache would buy nothing within a scan anyway: this is called exactly once per buildModIndex. It only
// spans scans, which is exactly the staleness. Measured cost of rebuilding: ~300ms for vanilla's 374 .gfx
// files, ~140-260ms for a large mod — paid once on an explicit rescan, against a scan that already takes
// seconds. Correctness is worth that.
function collectSpriteNames(roots) {
  const out = new Set();
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let es = [];
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.gfx$/i.test(e.name)) continue;
      let t = "";
      try { t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
      for (const m of t.matchAll(/\bname\s*=\s*"([^"]+)"/g)) out.add(m[1]);
      for (const m of t.matchAll(/\bname\s*=\s*([A-Za-z0-9_.\-]+)/g)) out.add(m[1]);
    }
  };
  for (const r of roots || []) { if (r) walk(String(r), 0); }
  return out;
}

// A block's own statements, with every NESTED { } group blanked out. Newlines are preserved so line-anchored
// matching still means what it says, and lengths are preserved so any offsets stay valid. Used to tell a
// focus's own `icon =` from one belonging to a create_equipment_variant nested inside its completion_reward.
function topLevelStatements(inner) {
  let t = String(inner || "");
  for (let i = 0; i < 12; i++) {                      // innermost-out; 12 is far deeper than any real block
    const next = t.replace(/\{[^{}]*\}/g, (m) => m.replace(/[^\n]/g, " "));
    if (next === t) break;
    t = next;
  }
  return t;
}

// ⛔ #nova-does-not-find-the-game — WHAT MAKES A FOLDER THE GAME'S, ON EVERY SYSTEM STEAM SHIPS IT FOR. Steam's own launch
// configs for app 394360 (appcache/appinfo.vdf, read 2026-11-03): Windows runs hoi4.exe, Linux runs run_hoi4 (a script that
// runs the `hoi4` beside it), macOS runs hoi4.app; the content is one depot for all three, and run_hoi4 rides in it (the owner's
// Windows install has it too, so run_hoi4 alone says nothing). A native Linux install seen through Wine — Nova under Proton —
// holds no hoi4.exe at all: with hoi4.exe as the only marker, detection never found it and the Game folder setting refused it.
// server.js asks this one helper for every "is this the game's folder?" (detection, the setting, /api/root).
const HOI4_GAME_MARKERS = [["hoi4.exe"], ["hoi4.app"], ["hoi4", "run_hoi4"]];
function isHoi4GameFolder(dir, existsSync = fs.existsSync, join = path.join) {
  if (!dir) return false;
  const has = (name) => { try { return !!existsSync(join(String(dir), name)); } catch (_) { return false; } };
  return HOI4_GAME_MARKERS.some((names) => names.every(has));
}

function looksLikeVanilla(root) {
  return isHoi4GameFolder(root);
}

// HOI4 localisation .yml files MUST be saved as UTF-8 WITH a byte-order mark (BOM). Without it the
// game fails to read the file, so EVERY name in that file shows as its raw key in-game — a silent,
// classic bug. Our own parser reads BOM-less files fine (so missing_localization won't catch it),
// which is exactly why this needs its own check. Only the mod's own loc files are scanned.
function scanLocBomIssues(modRoot) {
  const problems = [];
  const dirs = [path.join(modRoot, "localisation"), path.join(modRoot, "localization")];
  const seen = new Set();
  // #cross-file-duplicate-keys-were-invisible — and the rule had it exactly backwards. See the pass at the
  // bottom of this function; this map is filled as the files are read so they are not read twice.
  // "lang|key" -> "rel|hash" while a key has been seen ONCE, and an ARRAY of those once it is seen again.
  // ⚠️ Shape chosen for memory, and measured. Holding a {rel, value} object in an array for every key
  // occurrence cost +158MB and +2s on Rise of Nations (386MB -> 544MB heap), because the overwhelming
  // majority of keys occur exactly once and each was paying for an array, an object and a full copy of its
  // line — and a line can be a whole paragraph of description. A singleton is now one short string, and only
  // the value's HASH is kept: the rule needs nothing from a value except whether two copies are equal. A
  // hash collision would suppress one finding, never invent one.
  // "|" is a safe separator — it cannot appear in a Windows path or in a language name.
  const crossKeys = new Map();
  const hashLine = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return h;
  };
  for (const d of dirs) {
    for (const f of collectFiles(d, ".yml")) {
      const rel = path.relative(modRoot, f).replace(/\\/g, "/");
      if (seen.has(rel)) continue;
      seen.add(rel);
      let txt = "";
      try { txt = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      if (!txt) continue; // empty file: nothing to mis-read
      if (txt.charCodeAt(0) !== 0xFEFF) {
        problems.push({
          severity: "warning",
          rule: "loc_missing_bom",
          entityType: "localisation",
          entityId: rel.split("/").pop(),
          file: rel,
          message: `Localisation file "${rel}" is not saved as UTF-8 with a BOM. HOI4 won't read it, so every name in it shows as its raw key in-game. Re-save it as "UTF-8 with BOM" (a.k.a. UTF-8-BOM).`,
        });
      }

      // Same-file duplicate loc key: HOI4 keeps only the LAST occurrence, so the earlier line(s) are
      // dead text — usually an accidental copy-paste that silently overwrites the intended string.
      // A commented line (`#key:0 "…"`) starts with `#`, so the key regex naturally skips it.
      // Verified false-positive-free against all 198 vanilla english loc files (0 same-file dupes).
      // #locdup-fix-is-only-safe-when-the-copies-match — record whether the copies carry the SAME text,
      // because that is what decides whether deleting them is a derivation or a judgement.
      //
      // HOI4 keeps the last occurrence, so the earlier lines are already dead and removing them cannot
      // change what the game shows. But measured over the installed corpus, 1,027 of 2,256 duplicated keys
      // (46%) carry DIFFERENT text on their copies, and the differences are real authored content:
      // Millennium Dawn's `CZE_unify_the_nations_2` has a title on one line and a whole paragraph of
      // description on the other, and its `MODIFIER_ARMY_LEADER_MAX_ARMY_SIZE` says "Lieutenant General"
      // on one and "General" on the other. Deleting either is the author's call, not Nova's.
      //
      // The other 1,229 are byte-identical, where deletion is provably lossless. Only those may be offered
      // to the deterministic tier, and `allIdentical` is how the fix path and the UI know which is which.
      // The language comes from the FILENAME — the game's own test, and the only thing that decides which
      // keys can collide with which. A file the game will not load at all contributes nothing.
      const langMatch = /_l_([a-z_]+)\.yml$/i.exec(rel.split("/").pop() || "");
      const lang = langMatch ? langMatch[1].toLowerCase() : null;

      // ⛔ #a-key-in-each-language-section-is-not-a-duplicate — A COPY COLLIDES ONLY UNDER THE SAME LANGUAGE HEADER.
      // The base game's localisation/languages.yml has ten sections (l_english:, l_braz_por:, … l_korean:) and each defines the
      // same ten keys once: every language's name, written in every language. Counted per FILE, each key read as "defined 10
      // times", identical, so it went to the deterministic tier, and Fix all deleted 9 of the 10 copies: nine languages' names
      // gone from the file. Measured on the 1.20 base game copied as a mod: those 10 rows were the rule's whole output on
      // vanilla. So the copies are counted per (header, key) — a file with one header, the normal case, counts as it always did
      // — and locRemoveIdenticalDuplicates (server.js) groups the same way, so the fix cannot reach across a header either.
      const counts = new Map();
      let section = "";
      for (const line of txt.split(/\r?\n/)) {
        const hm = /^\s*(l_[a-z_]+)\s*:\s*$/i.exec(line);
        if (hm) { section = hm[1].toLowerCase(); continue; }
        const km = /^\s*([A-Za-z0-9_.\-]+):\d*\s+"/.exec(line);
        if (!km) continue;
        if (lang) {
          const ck = lang + "|" + km[1];
          const entry = rel + "|" + hashLine(line.replace(/\s+$/, ""));
          const prev = crossKeys.get(ck);
          if (prev === undefined) crossKeys.set(ck, entry);              // the common case: one short string
          else if (typeof prev === "string") crossKeys.set(ck, [prev, entry]);
          else prev.push(entry);
        }
        const sk = section + "|" + km[1];
        if (!counts.has(sk)) counts.set(sk, { key: km[1], lines: [] });
        // The whole line, trimmed of trailing whitespace: what "identical" has to mean for a deletion to be
        // certainly lossless is that the surviving line says everything the removed one did.
        counts.get(sk).lines.push(line.replace(/\s+$/, ""));
      }
      // One finding per key, as before: the sections that repeat it, together.
      const repeated = new Map();
      for (const g of counts.values()) {
        if (g.lines.length < 2) continue;
        if (!repeated.has(g.key)) repeated.set(g.key, []);
        repeated.get(g.key).push(g.lines);
      }
      for (const [key, groups] of repeated) {
        const copies = groups.reduce((n, g) => n + g.length, 0);
        const allIdentical = groups.every((g) => new Set(g).size === 1);
        problems.push({
          severity: "warning",
          rule: "loc_duplicate_key",
          entityType: "localisation",
          entityId: key,
          file: rel,
          copies,
          allIdentical,
          message: `Localisation key "${key}" is defined ${copies} times in "${rel}". HOI4 keeps only the last one, so the earlier copies are dead text — `
            + (allIdentical
              ? `and here every copy says the same thing, so removing the earlier ones changes nothing in game.`
              : `but the copies say DIFFERENT things, so which one you meant is your call: keep the right text, or rename them if they were meant to be different keys.`),
        });
      }

      // A MALFORMED VALUE LINE — the gap where Mod Health was SILENT on real breakage
      // (#loc-value-line-malformed). The loc rules checked the BOM and same-file duplicates and nothing at
      // all about whether a line parses. Millennium Dawn ships 11 lines with an unterminated quote and 6
      // with no space after the colon; vanilla ships 0 of each, so this cannot cry wolf on the base game.
      // Verified by hand: MD_focus_GER_l_english.yml:3855 has no closing quote and sits between two
      // correctly-quoted siblings — a typo, not a convention.
      //
      // Scoped to lines that clearly MEAN to be a loc entry (`key:` optionally followed by a version), so a
      // comment, a blank line or the `l_english:` header cannot trigger it.
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/^﻿/, "");
        if (!line.trim() || /^\s*#/.test(line)) continue;
        if (/^\s*l_[a-z_]+\s*:\s*$/i.test(line)) continue; // the language header
        const head = /^\s*([A-Za-z0-9_.\-]+):(\d*)(.*)$/.exec(line);
        if (!head) continue;
        const rest = head[3];
        // Count unescaped quotes: a well-formed value has exactly two.
        let quotes = 0;
        for (let c = 0; c < rest.length; c++) {
          if (rest[c] !== '"') continue;
          let slashes = 0;
          for (let j = c - 1; j >= 0 && rest[j] === "\\"; j--) slashes++;
          if (slashes % 2 === 0) quotes++;
        }
        // #odd-quotes-is-not-unterminated — ONE unescaped quote is unterminated. THREE is not.
        //
        // This fired on any ODD count, on the reasoning that "one is missing". But HOI4 reads a localisation
        // value from the FIRST quote to the LAST quote on the line, and this codebase already depends on
        // that: locLineRegExp uses a greedy `".*"` precisely so it matches the unescaped inner quotes vanilla
        // ships (test-a-loc-comment-does-not-hide-the-line pins it). Under the last-quote rule a third quote
        // is ordinary literal text — an inch mark, or a quoted phrase inside a sentence:
        //
        //   vanilla  GER_destroyer_2_desc: "The Zerstörer 1934 class … armed with five 5" guns and eight
        //            torpedo tubes. 16 ships were built…"        <- reads correctly in the shipping game
        //   R56      r56.startup.event.02.description: "… nie masz włączonych darmowy DLC "Poland: U…"
        //
        // Measured over the installed mods: the rule fired 398 times and **338 of those (85%) read fine**.
        // Vanilla ships 22 lines of the same shape — they are only invisible because the loc rules skip the
        // base game, so this never showed up as the cry-wolf it was. A rule that is wrong 85% of the time on
        // shipping content is a bug in the rule.
        //
        // What is left is the case that is certainly broken, and all 60 of them are: an opening quote with
        // nothing after it, including MD's `CUB_CBI_73M: "CBI-73M\"` where the only closing candidate is
        // ESCAPED and so is part of the text.
        if (quotes !== 1) continue;
        problems.push({
          severity: "warning",
          rule: "loc_value_malformed",
          entityType: "localisation",
          entityId: head[1],
          file: rel,
          line: i + 1,
          message: `Localisation line ${i + 1} of "${rel}" (key "${head[1]}") has an unterminated quote. HOI4 stops reading the value there, so this key — and often the lines after it — show wrong or not at all.`,
        });
      }
    }
  }

  // #cross-file-duplicate-keys-were-invisible — AND THE RULE WAS THE WRONG WAY ROUND.
  //
  // The same-file check above is the SAFE case: HOI4 keeps the last occurrence, deterministically, so the
  // earlier lines are dead and the author can be told exactly what happens. The DANGEROUS case is the same
  // key in two different files of the same language, and it was not checked at all — `counts` is built
  // inside the per-file loop, so nothing ever compared one file to another. The wiki is explicit that there
  // is no rule to lean on here: "The value that'll get chosen does not seem to have a consistent pattern,
  // but seems to prioritise base game files." Between two files of a MOD there is no tiebreak at all.
  //
  // What that costs a player: Millennium Dawn's naval panel reads "Sub Visibility" or "Sub Stealth"
  // depending which of two replace/ files wins, and Rise of Nations shows Canada as "British North America"
  // or "$OVERLORDADJ$ Canada". A modder who cleans every duplicate Nova used to show them still ships the
  // undefined ones. Nova's own test-map-rename-in-place.js noted this gap in passing and nothing was done.
  //
  // Three filters, each measured over the base game and all 10 installed workshop mods:
  //   · group by the FILENAME's language, or every foo_l_english/foo_l_french pair collides on every key;
  //   · skip keys whose copies straddle replace/ and non-replace/ — that is the documented override, and
  //     it is how a mod is SUPPOSED to overwrite a string. Two copies BOTH inside replace/ are kept: same
  //     tier, no tiebreak, and that is exactly where Millennium Dawn's real conflicts live;
  //   · skip byte-identical copies — whichever file wins, the player sees the same string.
  // After all three: 1,565 conflicting keys, and VANILLA REPORTS ZERO across its 2,073 loc files.
  //
  // Emitted ONE FINDING PER FILE PAIR, not per key. Per key would be 1,565 cards, 1,245 of them on Rise of
  // Nations — the orphan_spirit shape, true and unactionable at volume. Per pair it is 289, and RoN's worst
  // single card covers 235 keys with one instruction: you ship both of these files, pick one.
  //
  // NOT in the deterministic fix tier, and it must never be: which copy survives is the author's call, the
  // same reason duplicate_id is advisory. It also needs its own rule id — reusing loc_duplicate_key would
  // route it into locRemoveIdenticalDuplicates, which scans a single file and would hand the user a Fix
  // button that always fails.
  const pairKeys = new Map();      // "relA | relB" -> [keys]
  for (const [ck, hits] of crossKeys) {
    if (typeof hits === "string") continue;     // seen once: cannot be a cross-file duplicate
    // Each entry is "rel|hash"; rel cannot contain "|", so the LAST one splits them.
    const cut = (e) => e.lastIndexOf("|");
    const files = [...new Set(hits.map((e) => e.slice(0, cut(e))))];
    if (files.length < 2) continue;
    const inReplace = (f) => f.toLowerCase().split("/").includes("replace");
    if (files.some(inReplace) && files.some((f) => !inReplace(f))) continue;
    if (new Set(hits.map((e) => e.slice(cut(e) + 1))).size === 1) continue;   // every copy identical
    const id = files.slice().sort().join(" | ");
    if (!pairKeys.has(id)) pairKeys.set(id, []);
    pairKeys.get(id).push(ck.slice(ck.indexOf("|") + 1));
  }
  for (const [pair, keys] of pairKeys) {
    const shown = keys.slice(0, 6).join(", ") + (keys.length > 6 ? `, …` : "");
    problems.push({
      severity: "warning",
      rule: "loc_duplicate_key_across_files",
      entityType: "localisation",
      entityId: keys[0],
      file: pair.split(" | ")[0],
      files: pair.split(" | "),
      copies: keys.length,
      keys: keys.slice(0, 50),
      // #the-message-named-only-two-files — a key can collide across THREE files or more, and the message
      // used [0] and [1] regardless. A user would fix the two they were shown and ship the third.
      message: `${keys.length} localisation key${keys.length === 1 ? " is" : "s are"} defined with DIFFERENT text in `
        + (pair.split(" | ").length === 2
          ? `both "${pair.split(" | ")[0]}" and "${pair.split(" | ")[1]}"`
          : `all ${pair.split(" | ").length} of ${pair.split(" | ").map((f) => `"${f}"`).join(", ")}`)
        + ` (${shown}). HOI4 has no defined winner between two files of the same language, so which text a player sees is not something you chose — and it can differ between installs. Keep the wording you want in one file and delete it from the other.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Per-type entity scanners
// ---------------------------------------------------------------------------

// Pull a tech's research-folder name + grid position (for placement validation).
// ⚠️ THIS READS ONLY LITERAL COORDINATES, AND THAT IS SAFE ONLY WHILE RULE 5 STAYS SCOPED.
//
// Measured 2026-09-02 across the vanilla install and every installed workshop mod: 5,721 technologies carry
// a folder position and this reads **1,245 of them — 21.8%**. The other 4,476 use an @variable coordinate
// (`position = { x = @rocket_artillery y = 6 }`), which the `(-?\d+)` groups cannot match, so x and y come
// back null.
//
// That is currently harmless, and deliberately so:
//   • Rule 5 (tech_negative_position) only fires for techs in novaPlacedFolders, and Nova writes literal
//     integers — never an @variable — so every position it judges is one this can read.
//   • Rule 6 (tech_unknown_folder) needs only `name`, which parses independently of the position.
//   • A null coordinate fails `typeof x === "number"`, so it can never produce a FALSE POSITIVE either.
//
// ⛔ But if Rule 5 is ever widened past Nova's own placements, this parser becomes the limit: the rule would
// silently examine barely a fifth of the tree and read exactly like a rule that found nothing — the shape
// recorded as "a rule that only goes QUIET is indistinguishable from a DEAD one". Resolving @variables needs
// the file's @var table, which server.js's parseFolderFromBlock already threads through a resolver; borrow
// that rather than widening the regex here.
function parseTechFolder(inner) {
  const nameM = /folder\s*=\s*\{[\s\S]*?name\s*=\s*([A-Za-z0-9_]+)/.exec(inner);
  const posM = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)\s*\}/.exec(inner);
  if (!nameM && !posM) return null;
  return {
    name: nameM ? nameM[1] : null,
    x: posM ? parseInt(posM[1], 10) : null,
    y: posM ? parseInt(posM[2], 10) : null,
  };
}

function scanTechnologies(root) {
  const out = [];
  for (const file of collectFiles(path.join(root, "common", "technologies"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    for (const top of topLevelBlocks(txt)) {
      if (top.key !== "technologies") continue;
      for (const tech of topLevelBlocks(top.inner)) {
        out.push({
          type: "tech",
          id: tech.key,
          file,
          refs: [...extractRefs(tech.inner), ...extractTechGraphRefs(tech.inner)],
          folder: parseTechFolder(tech.inner),
        });
      }
    }
  }
  return out;
}

// The set of research-folder names defined under a root (common/technology_tags/*.txt).
function getTechnologyFolders(root) {
  const set = new Set();
  if (!root) return set;
  for (const file of collectFiles(path.join(root, "common", "technology_tags"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    for (const top of topLevelBlocks(txt)) {
      if (top.key !== "technology_folders") continue;
      for (const folder of topLevelBlocks(top.inner)) set.add(folder.key);
    }
  }
  return set;
}

function scanEquipment(root) {
  const out = [];
  // #duplicate-archetypes-uindexed — `duplicate_archetypes` is a second, equally real way to define equipment:
  //
  //   duplicate_archetypes = { motorized_equipment = { archetype = infantry_equipment … } }
  //
  // declares motorized_equipment AND, for every infantry_equipment_N already defined, a matching
  // motorized_equipment_N. Only the `equipments` block was indexed, so every reference to a duplicated
  // archetype read as dangling — 142 firings, 44% of all broken_reference reports across both corpora, on
  // content that works perfectly. Vanilla ships 34 of these, Millennium Dawn 29.
  //
  // Two passes are required: the numbered variants can only be expanded once every `equipments` id is known,
  // and the source archetype is frequently defined in a different file from the duplicate.
  const dupSpecs = [];
  for (const file of collectFiles(path.join(root, "common", "units", "equipment"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    for (const top of topLevelBlocks(txt)) {
      if (top.key === "equipments") {
        for (const eq of topLevelBlocks(top.inner)) {
          out.push({ type: "equipment", id: eq.key, file, refs: [] });
        }
      } else if (top.key === "duplicate_archetypes") {
        for (const dup of topLevelBlocks(top.inner)) {
          const src = (/\barchetype\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/.exec(dup.inner) || [])[1] || "";
          dupSpecs.push({ id: dup.key, src, file });
        }
      }
    }
  }
  const known = new Set(out.map((e) => e.id));
  for (const spec of dupSpecs) {
    if (!known.has(spec.id)) out.push({ type: "equipment", id: spec.id, file: spec.file, refs: [] });
    if (!spec.src) continue;
    // `<src>_1`, `<src>_2`… each imply a `<dup>_N` of the same number.
    const suffix = new RegExp(`^${spec.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d+)$`);
    for (const id of known) {
      const m = suffix.exec(id);
      if (!m) continue;
      const derived = `${spec.id}_${m[1]}`;
      if (!known.has(derived)) out.push({ type: "equipment", id: derived, file: spec.file, refs: [] });
    }
  }
  return out;
}

// #a-nameless-advisor-is-named-by-its-trait — AN ADVISOR WITH NO NAME OF ITS OWN IS SHOWN UNDER ITS TRAIT.
//
// The base game (1.20) ships 1,273 advisor characters whose name key has no English localisation — BLZ_communist_guy,
// BLZ_aa2, BLZ_ar: an advisor role (slot, idea_token, one trait) and a portrait, nothing else — and 941 old-style advisor
// ideas in common/ideas built the same way (bavaria.txt's BAY_democratic_guy: a picture and one trait, in a slot
// common/idea_tags declares a character_slot). The only text any of them has is the trait's — traits_l_english.yml writes
// army_armored_2 as "Armor\n(Expert)", broken to sit under a portrait — and that is what the game shows. RULE 3 reported
// all 2,214 (of the base game's 2,645 rows), and Fix all wrote a made-up name ("BLZ aa2") over the trait's for any mod that
// copied such a file. So a name key with no localisation — the character's own, or one it declares (28 of the 1,273 declare
// one: 21 their own key, 7 another; the files hold no other text for those either) — resolves to the first trait of each
// advisor role, when that is a trait the game loads, is localised, and the character holds advisor roles only
// (#a-trait-names-an-advisor-only-if-the-game-loads-it). That is 2,213 of the 2,214; the one
// left, RAJ_GOE_ivar_kreuge, has no trait. A nameless leader or general, or an advisor whose trait has no text, is reported.
function firstTraitOf(inner) {
  for (const b of topLevelBlocks(String(inner || ""))) {
    if (b.key !== "traits") continue;
    const first = b.inner.trim().split(/\s+/)[0];
    return first || null;
  }
  return null;
}

// The idea categories the game loads (common/idea_tags), for RULE 3. Roots highest priority first: a file at the same
// relative path in a higher root replaces the lower one wholesale, as HOI4 replaces any common/ file, and the caller has
// already left out a root whose folder a replace_path unloaded.
//   characterSlots — every `character_slot = X`: an idea in slot X is an advisor (#a-nameless-advisor-is-named-by-its-trait).
//   hiddenSlots    — the slots of categories declaring `hidden = yes` (a category with no `slot =` lines is its own
//                    slot), and only where every category declaring that slot says so. #a-hidden-idea-needs-no-name
//   `ledger = hidden` is not this: the national-spirit category `country` declares it, and its ideas are on screen.
function readIdeaCategories(roots) {
  const characterSlots = new Set();
  const declared = new Map(); // slot -> [hidden?, ...] one per category declaring it
  const taken = new Set();
  for (const root of roots || []) {
    if (!root) continue;
    const dir = path.join(root, "common", "idea_tags");
    for (const file of collectFiles(dir, ".txt")) {
      const rel = path.relative(dir, file).replace(/\\/g, "/").toLowerCase();
      if (taken.has(rel)) continue;
      taken.add(rel);
      for (const top of topLevelBlocks(stripLineComments(readSafe(file)))) {
        if (top.key !== "idea_categories") continue;
        for (const cat of topLevelBlocks(top.inner)) {
          const own = topLevelStatements(cat.inner);
          const hidden = /(^|\s)hidden\s*=\s*yes\b/i.test(own);
          const slots = [...own.matchAll(/(^|\s)slot\s*=\s*([A-Za-z0-9_.-]+)/g)].map((m) => m[2]);
          for (const m of own.matchAll(/(^|\s)character_slot\s*=\s*([A-Za-z0-9_.-]+)/g)) characterSlots.add(m[2]);
          for (const s of slots.length ? slots : [cat.key]) { if (!declared.has(s)) declared.set(s, []); declared.get(s).push(hidden); }
        }
      }
    }
  }
  const hiddenSlots = new Set([...declared].filter(([, flags]) => flags.every(Boolean)).map(([s]) => s));
  return { characterSlots, hiddenSlots };
}

// #a-trait-names-an-advisor-only-if-the-game-loads-it — the leader traits the game loads (common/country_leader's
// `leader_traits = { X = { … } }`), for RULE 3. Roots highest priority first, a same-path file replacing the lower one, as
// readIdeaCategories. A nameless advisor is shown under its trait's text only when that trait exists: a key with text that
// no layer defines as a trait (a focus key, a trait the mod renamed or a replace_path unloaded) is dropped by the game,
// and the advisor shows its raw key. Every trait of the base game's 1.20 nameless advisors, and of its advisor-slot ideas,
// is defined there, so this costs the base game nothing.
function readLeaderTraits(roots) {
  const out = new Set();
  const taken = new Set();
  for (const root of roots || []) {
    if (!root) continue;
    const dir = path.join(root, "common", "country_leader");
    for (const file of collectFiles(dir, ".txt")) {
      const rel = path.relative(dir, file).replace(/\\/g, "/").toLowerCase();
      if (taken.has(rel)) continue;
      taken.add(rel);
      for (const top of topLevelBlocks(stripLineComments(readSafe(file)))) {
        if (top.key !== "leader_traits") continue;
        for (const trait of topLevelBlocks(top.inner)) out.add(trait.key);
      }
    }
  }
  return out;
}

function scanIdeas(root) {
  const out = [];
  for (const file of collectFiles(path.join(root, "common", "ideas"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    for (const top of topLevelBlocks(txt)) {
      if (top.key !== "ideas") continue;
      for (const category of topLevelBlocks(top.inner)) {
        for (const idea of topLevelBlocks(category.inner)) {
          // skip the rare `designer = yes`-style block keys that aren't ideas
          if (idea.key === "designer") continue;
          // An idea may name the key it DISPLAYS under (#missing-loc-ignores-own-name). HOI4 shows whatever
          // the block's own `name =` resolves to, not the block id — vanilla does this in its own files —
          // so a rule that only tests the id calls correctly-localised content unlocalised. Recorded here so
          // missing_localization can test the key the game will actually read.
          // #a-nameless-advisor-is-named-by-its-trait — the first trait, which names an advisor-slot idea that declares no
          // name the game can localise (RULE 3 asks the idea categories which slots are advisor slots).
          const firstTrait = firstTraitOf(idea.inner);
          out.push({
            type: "idea", id: idea.key, category: category.key, file,
            ownName: ownDisplayName(idea.inner),
            ...(firstTrait ? { firstTrait } : {}),
            refs: extractRefs(idea.inner),
          });
        }
      }
    }
  }
  return out;
}

// #character-named-by-its-instance — a character's `instance = { }` blocks, each a complete alternative body that
// applies when its `allowed` trigger holds (vanilla's DLC variants: `has_dlc = "X"` in one, `NOT = { has_dlc = "X" }`
// in the other). Returns null when there are none; otherwise each instance's own display name (null where it names
// none, so the character's own applies) and whether the instances COVER every case — one with no `allowed` (or an
// empty one), or two whose triggers are each other's complement: T and NOT = { T }, or x = yes and x = no. Anything
// else may leave a case where no instance applies and the character's own name shows; that is not judged here, it
// is counted as possible. Trigger text is compared with whitespace collapsed, so only the written shape matters.
function characterInstances(inner) {
  const names = [];
  const triggers = [];
  for (const blk of topLevelBlocks(String(inner || ""))) {
    if (blk.key !== "instance") continue;
    names.push(ownDisplayName(blk.inner));
    const allowed = [...topLevelBlocks(blk.inner)].filter((b) => b.key === "allowed");
    // Two `allowed` blocks in one instance is a shape nothing installed writes; it is neither "always" nor half
    // of a pair here.
    triggers.push(allowed.length === 0 ? "" : allowed.length === 1
      ? allowed[0].inner.replace(/\s+/g, " ").replace(/\s*([={}])\s*/g, "$1").trim() : null);
  }
  if (!names.length) return null;
  const set = new Set(triggers.filter((t) => t !== null));
  const cover = set.has("") || [...set].some((t) => set.has(`NOT={${t}}`)
    || (/=yes$/.test(t) && set.has(t.replace(/=yes$/, "=no"))));
  return { names, cover };
}

function scanCharacters(root) {
  const out = [];
  for (const file of collectFiles(path.join(root, "common", "characters"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    for (const top of topLevelBlocks(txt)) {
      if (top.key !== "characters") continue;
      for (const char of topLevelBlocks(top.inner)) {
        // Characters are indexed as ideas (advisors literally generate an idea token, so
        // add_ideas references to them resolve), but they are NOT national spirits: a leader or
        // general is recruited via recruit_character, and advisors are hired — none are "added"
        // via add_ideas at game start. Mark them so the orphan-spirit rule skips them.
        // …and a character almost always declares its own display name, either as a quoted literal or as a
        // loc key that differs from its token. Recording it is what stops missing_localization demanding a
        // key equal to the character id: 2,467 of Millennium Dawn's 2,469 characters fired, which is the
        // implausible-number tell. #missing-loc-ignores-own-name
        // #character-named-by-its-instance — or declares it once per `instance = { }` block: 883 characters over
        // the base game and the 14 installed Workshop items are built that way, and none of them names itself at
        // depth 0. Reading depth 0 alone tested the token, which the game never shows for them: vanilla's
        // CHL_jorge_gonzález_von_marées is named CHL_jorge_gonzalez_von_marees in both of its instances, which
        // vanilla localises, and Fix all wrote a key for the token instead.
        const inst = characterInstances(char.inner);
        // #a-nameless-advisor-is-named-by-its-trait — a character whose every block is an advisor role or its portraits
        // (no other role, no instance) carries each role's first trait, which names it where its own name has no text.
        const blocks = [...topLevelBlocks(char.inner)];
        const advisorOnly = blocks.some((b) => b.key === "advisor") && blocks.every((b) => b.key === "advisor" || b.key === "portraits");
        out.push({
          type: "idea", id: char.key, file, fromCharacter: true,
          ownName: ownDisplayName(char.inner),
          ...(inst ? { instances: inst.names, instancesCover: inst.cover } : {}),
          ...(advisorOnly ? { advisorTraits: blocks.filter((b) => b.key === "advisor").map((b) => firstTraitOf(b.inner)) } : {}),
          refs: extractRefs(char.inner),
        });
        // An advisor is referenced by its advisor `idea_token`, which routinely DIFFERS from the character
        // key (e.g. character `ENG_bernard_montgomery` declares `idea_token = bernard_montgomery`, and
        // history does `add_ideas = { bernard_montgomery }`). Index every advisor idea_token too — without
        // this, EVERY vanilla advisor reference (hundreds, inherited by any standalone mod) was falsely
        // reported as "idea does not exist". refs:[] so we don't double-count the character's own refs.
        for (const tk of String(char.inner).matchAll(/\bidea_token\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)) {
          if (tk[1] && tk[1] !== char.key) out.push({ type: "idea", id: tk[1], file, fromCharacter: true, advisorToken: true, refs: [] });
        }
      }
    }
  }
  return out;
}

function scanDecisions(root) {
  const out = [];
  for (const file of collectFiles(path.join(root, "common", "decisions"), ".txt")) {
    // skip the category-definition folder
    if (/[\\/]categories[\\/]/.test(file)) continue;
    const txt = stripLineComments(readSafe(file));
    for (const category of topLevelBlocks(txt)) {
      for (const dec of topLevelBlocks(category.inner)) {
        out.push({ type: "decision", id: dec.key, category: category.key, file, refs: extractRefs(dec.inner) });
      }
    }
  }
  return out;
}

function scanEvents(root) {
  const out = [];
  const re = /\b(country_event|news_event|state_event|unit_leader_event|operative_leader_event)\s*=\s*\{/g;
  for (const file of collectFiles(path.join(root, "events"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    let m;
    while ((m = re.exec(txt)) !== null) {
      const open = txt.indexOf("{", m.index);
      const close = findMatchingBrace(txt, open);
      if (close === -1) break;
      const inner = txt.slice(open + 1, close);
      const idM = /\bid\s*=\s*([A-Za-z0-9_][A-Za-z0-9_.]*)/.exec(inner);
      if (idM) {
        // Capture whether the event is hidden and whether each `option = { ... }` has a name. A
        // VISIBLE event whose option has no name shows no clickable button in game (the player can't
        // dismiss it — a soft-lock); a hidden event legitimately uses a nameless option, so it's
        // exempt from that lint.
        // HOI4 keywords are case-insensitive — vanilla itself uses `Hidden = yes` (e.g. usa.50), so
        // these MUST be matched case-insensitively or a hidden event is mis-classified as visible and
        // the visible-event lints (no options / no title) cry wolf.
        const hidden = /\bhidden\s*=\s*yes/i.test(inner);
        const hasTitle = /\btitle\s*=/i.test(inner);
        const options = [];
        const optRe = /\boption\s*=\s*\{/gi;
        let om;
        while ((om = optRe.exec(inner)) !== null) {
          const oOpen = inner.indexOf("{", om.index);
          if (oOpen === -1) break;
          const oClose = findMatchingBrace(inner, oOpen);
          if (oClose === -1) break;
          const oInner = inner.slice(oOpen + 1, oClose);
          // #an-option-that-cannot-show-needs-no-name — an option whose own trigger is exactly `always = no` is never
          // offered, so it needs no button text: 1.20's BA_romania.24 (TTBE_Romania.txt) keeps one beside its two named
          // options. Only that exact trigger; any other may hold, and is judged as before.
          const triggers = [...topLevelBlocks(oInner)].filter((b) => b.key.toLowerCase() === "trigger");
          const neverShown = triggers.length === 1 && /^always=no$/i.test(triggers[0].inner.replace(/\s+/g, ""));
          options.push(neverShown ? { hasName: /\bname\s*=\s*\S/i.test(oInner), neverShown } : { hasName: /\bname\s*=\s*\S/i.test(oInner) });
          optRe.lastIndex = oClose + 1;
        }
        // Triggered-only means the event has no mean-time-to-happen of its own, so SOMETHING has to fire it
        // or it can never occur. Case-insensitive for the same reason as `hidden` above — vanilla varies.
        const triggeredOnly = /\bis_triggered_only\s*=\s*yes/i.test(inner);
        out.push({ type: "event", id: idM[1], file, refs: extractRefs(inner), hidden, hasTitle, options, triggeredOnly });
      }
      re.lastIndex = close + 1;
    }
  }
  return out;
}

/**
 * Collect every event namespace declared via `add_namespace = X` under a root's events/ dir,
 * lower-cased. HOI4 treats add_namespace globally and case-insensitively, so an event id's
 * namespace just has to be declared *somewhere* (this mod, a dependency, or vanilla).
 */
/** Country tags this ROOT declares itself, from common/country_tags/*.txt (`TAG = "countries/Name.txt"`).
 *  Only a tag the mod introduces is the mod's responsibility to draw a flag for. */
/** `custom_effect_tooltip = KEY` targets used by THIS root's own script, with the file each came from.
 *
 *  The effect prints the localisation for KEY into a tooltip. With no localisation the player is shown the
 *  raw key, so the target needs text exactly as much as an idea or a focus does — but it is not an entity,
 *  so the missing-localisation rule never looked at it. */
function scanTooltipKeyRefs(root) {
  const out = [];
  if (!root) return out;
  const seen = new Set();
  for (const sub of ["common", "events"]) {
    for (const f of collectFiles(path.join(root, sub), ".txt")) {
      let t = "";
      try { t = stripLineComments(fs.readFileSync(f, "utf8")); } catch (_) { continue; }
      // CAPTURE THE WHOLE TOKEN, THEN DISCARD WHAT IS NOT A LOC KEY (#tooltip-key-engine-generator).
      //
      // The old pattern stopped at `|` and `[`, so it invented keys nobody wrote. Paradox's own
      // pipe-argument form `custom_effect_tooltip = tech_effect|revolutionary_mass_assault` was truncated to
      // `tech_effect` — an engine-side generator that correctly has no loc entry in any of the ten shipped
      // languages, and which Nova then reported as a missing key. Millennium Dawn's
      // `tooltip_EU_parliament_focus_[EUXXX]_approve` was truncated to a fragment the same way.
      //
      // A value containing |, [, ], $ or @ is built at runtime or handled by the engine, and this rule
      // cannot know what it resolves to — so it must not guess. Fail OPEN and stay quiet.
      //
      // #a-quoted-tooltip-is-text — A QUOTED VALUE NO LOCALISATION LINE CAN HOLD IS TEXT, NOT A KEY. The value is
      // read whole, quoted or bare, and the game treats both alike: it looks the string up and, when nothing
      // defines it, prints the string itself. A value canBeLocalizationKey refuses (a ":", a space, a letter
      // outside ASCII) can never be defined by any localisation line, so that lookup always misses and the game
      // prints the value exactly as written — and quoted, that is the text the modder wrote. Novum Vexillum heads
      // its vote results with `custom_effect_tooltip = "Yes:"`, in an event whose every other string is quoted
      // text, and vanilla's SOV debug decisions print "THIS ACTIVATES THE PARANOIA SYSTEM" the same way. This
      // reported "Yes:" as a missing key, and the row told the modder to add a key no line can hold. It is the
      // test ownDisplayName applies to a quoted `name =`. A quoted value that CAN be a key is still looked up, so
      // it stays a key; a bare token is always one, and one no line can hold is still reported (RULE 1e).
      // Measured 2026-11-19 over the base game and the 15 installed Workshop items: 528 quoted values no line can
      // hold (524 hold a space, which the old pattern skipped only because it could not match them), 0 bare ones.
      for (const m of t.matchAll(/custom_effect_tooltip\s*=\s*(?:"([^"\r\n]*)"|([^\s"{}]+))/g)) {
        const quoted = m[1] !== undefined;
        const key = quoted ? m[1] : m[2];
        if (/[|[\]$@]/.test(key)) continue;
        if (quoted && !canBeLocalizationKey(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, file: path.relative(root, f).replace(/\\/g, "/") });
      }
    }
  }
  return out;
}

/** Brace balance of one Clausewitz file, ignoring # comments and "quoted strings".
 *  Returns { depth, negative } — depth > 0 means unclosed blocks, negative means a stray closer appeared. */
function braceBalanceOf(text) {
  let depth = 0, inStr = false, inCom = false, negative = false;
  const t = String(text || "");
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (inCom) { if (c === "\n") inCom = false; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === "#") { inCom = true; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth < 0) negative = true; }
  }
  return { depth, negative };
}

/** The MOD's OWN script files whose braces do not balance.
 *
 *  Deliberately limited to the directories the makers read, and to the active mod — see the rule below. */
function scanUnbalancedModFiles(root) {
  const out = [];
  if (!root) return out;
  for (const sub of ["common", "events", "history"]) {
    for (const f of collectFiles(path.join(root, sub), ".txt")) {
      let t = "";
      try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      const b = braceBalanceOf(t);
      if (b.depth !== 0 || b.negative) {
        out.push({ file: path.relative(root, f).replace(/\\/g, "/"), depth: b.depth, negative: b.negative });
      }
    }
  }
  return out;
}

function scanModDeclaredCountryTags(root) {
  const out = new Set();
  if (!root) return out;
  const dir = path.join(root, "common", "country_tags");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    let txt = "";
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    for (const m of txt.replace(/#.*$/gm, "").matchAll(/(^|\n)\s*([A-Z0-9]{3})\s*=\s*"/g)) out.add(m[2]);
  }
  return out;
}

/** Division name groups this ROOT defines, from common/units/names_divisions/*.txt (`GROUP = { … }`).
 *  Lower-cased: HOI4 resolves these case-insensitively (vanilla defines `GER_Inf_01`, and a mod writing
 *  `GER_INF_01` still works — a case-sensitive check reported that as missing when it was not). */
function scanDivisionNameGroups(root) {
  const out = new Set();
  if (!root) return out;
  const dir = path.join(root, "common", "units", "names_divisions");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    let txt = "";
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    for (const m of stripLineComments(txt).matchAll(/(^|\n)\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*\{/g)) out.add(m[2].toLowerCase());
  }
  return out;
}

/** `division_names_group` values referenced by THIS root's own order-of-battle files, with the file they
 *  came from. Only the mod's own history/units — a dependency's OOB is not the modder's to fix. */
function scanOobNameGroupRefs(root) {
  const out = [];
  if (!root) return out;
  const dir = path.join(root, "history", "units");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    let txt = "";
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    for (const m of stripLineComments(txt).matchAll(/division_names_group\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)) {
      out.push({ group: m[1], file: "history/units/" + f });
    }
  }
  return out;
}

/** Does this root supply a base flag for `tag`? HOI4 also accepts .dds, and the medium/small variants are
 *  generated from the base one, so the base file is what decides whether a flag exists at all. */
/**
 * Does this root supply a usable flag for TAG?
 *
 * #flag-rule-cried-wolf — this used to demand `gfx/flags/<TAG>.tga` and nothing else, but that is not how
 * HOI4 resolves a flag. The game looks for `<TAG>_<ruling ideology>.tga` FIRST and only falls back to the
 * bare `<TAG>.tga`, so the base file is optional — and the shipping game mostly omits it: 331 of vanilla's
 * 430 declared tags have no `<TAG>.tga`, including GER, ENG, SOV, FRA, USA, ITA, JAP, CHI and POL, whose
 * flags obviously render.
 *
 * So the rule fired on flags that work, told the modder "HOI4 shows a blank placeholder" (which is false),
 * and pointed them at Country Setup to add one — advice that would have overwritten working art. It produced
 * 409 warnings on Millennium Dawn, 408 of them wrong.
 *
 * An ideology variant now counts. The bare file is still accepted, since a mod may legitimately ship only it.
 */
function countryFlagExists(root, tag) {
  if (!root || !tag) return false;
  const dir = path.join(root, "gfx", "flags");
  const exts = [".tga", ".dds", ".png"];
  if (exts.some((ext) => { try { return fs.statSync(path.join(dir, tag + ext)).isFile(); } catch (_) { return false; } })) return true;
  // …or any per-ideology variant: <TAG>_communism.tga, <TAG>_fascism.tga, …
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (_) { return false; }
  const prefix = String(tag).toLowerCase() + "_";
  return entries.some((f) => {
    const lower = f.toLowerCase();
    return lower.startsWith(prefix) && exts.some((ext) => lower.endsWith(ext));
  });
}

function scanNamespaces(root) {
  const out = new Set();
  if (!root) return out;
  for (const file of collectFiles(path.join(root, "events"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    // Namespaces may contain dots — vanilla declares e.g. `add_namespace = MUN_czech.news`, whose
    // events are `MUN_czech.news.1`. Capture the full dotted token, not just the part before the dot.
    for (const m of txt.matchAll(/\badd_namespace\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)/g)) out.add(m[1].toLowerCase());
  }
  return out;
}

function scanContinuousFocuses(root) {
  // A continuous focus APPLIES a modifier idea via `idea = X`; that idea IS used (the palette adds it
  // while the focus is active), so it must not be flagged as an orphan national spirit.
  const out = [];
  for (const file of collectFiles(path.join(root, "common", "continuous_focus"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    const refs = [];
    for (const m of txt.matchAll(/\bidea\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)) refs.push({ context: "continuous_focus", type: "idea", id: m[1] });
    if (refs.length) out.push({ type: "continuous_focus", id: path.basename(file, ".txt"), file, refs });
  }
  return out;
}

function scanFocuses(root) {
  const out = [];
  const re = /\b(shared_focus|joint_focus|focus)\s*=\s*\{/g;
  for (const file of collectFiles(path.join(root, "common", "national_focus"), ".txt")) {
    const txt = stripLineComments(readSafe(file));
    let m;
    while ((m = re.exec(txt)) !== null) {
      const open = txt.indexOf("{", m.index);
      const close = findMatchingBrace(txt, open);
      if (close === -1) break;
      const inner = txt.slice(open + 1, close);
      // #focus-id-truncated — a focus id may contain a hyphen or a dot, and both occur in shipped content.
      // Stopping at the first one silently TRUNCATED the id, which is a straight bug rather than a tuning
      // question: missing_localization then looked up a key that does not exist, and duplicate_id manufactured
      // bogus pairs — ETH_anti-italian_propaganda and ETH_anti-tank_guns both indexed as "ETH_anti".
      // 14 vanilla and 30 Millennium Dawn ids were affected.
      const idM = /\bid\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/.exec(inner);
      // #focus-text-key-ignored — A FOCUS NAMES ITS OWN LOCALISATION KEY WITH `text =`, and HOI4 reads that
      // key instead of the focus id. Paradox's own files say why they do it:
      //     text = CHI_the_soviet_volunteer_group_focus   #avoid hash collision with different loc
      //     text = ETH_peoples_army_focus                 #otherwise conflicts with Mass Assault doctrine
      // The scanner recorded id/refs/hasIcon and nothing else, so missing_localization tested the id and
      // called correctly-localised focuses unlocalised: 586 of Road to 56's 1,905 firings (31%), 61 of Old
      // World Blues', 29 of Rise of Nations', 28 of Novum Vexillum's, 6 of vanilla's — 710 in all.
      //
      // The second half is worse than the noise. Where the `text` key really IS missing, the message named
      // the focus ID, and the deterministic auto-fix writes the key the message names — so Mod Health would
      // add a loc entry HOI4 never reads, mark the problem fixed, and leave the game showing the same raw
      // key. `ownName` is the field missing_localization already consults for ideas and characters, so
      // recording it here is all that was needed. #missing-loc-ignores-own-name
      if (idM) out.push({
        type: "focus", id: idM[1], file,
        ownName: ownDisplayName(inner, "text"),
        refs: extractRefs(inner),
        // #a-nested-icon-is-anchored-too — the focus's OWN icon is a statement of the focus block, and
        // line-anchoring alone does not find it. A national_focus file is full of `icon =` lines belonging
        // to create_equipment_variant blocks inside completion_reward, and those are line-anchored as well,
        // just indented. Anchoring happens to work only while the focus's own icon is written FIRST, which
        // is the convention but not a rule: put the variant above it and the reader takes the wrong one
        // (measured — GFX_DEN_basic_small_fighter_2 reported against a focus whose icon was fine).
        //
        // Blank the nested { } groups first, preserving newlines so the anchoring still means something,
        // and read what is left. hasIcon uses the same text: a focus whose ONLY `icon =` is inside a
        // variant genuinely has no icon of its own, and focus_no_icon should say so.
        ...(() => {
          // ⚠️ [ \t]* and NOT \s* — the match must not cross a newline. Blanking a nested group leaves
          // `icon =` followed by whitespace where the block used to be (some focuses write `icon = { … }`
          // for a conditional icon), and \s* then runs past the blanks and the newline to grab the
          // identifier off the NEXT statement — reading `x` out of `x = 0`. Measured: that alone put 56
          // invented findings on the shipping base game.
          const top = topLevelStatements(inner);
          return {
            hasIcon: /(?:^|\n)[ \t]*icon[ \t]*=/i.test(top),
            iconName: (/(?:^|\n)[ \t]*icon[ \t]*=[ \t]*"?([A-Za-z0-9_.\-]+)"?/.exec(top) || [])[1] || null,
          };
        })(),
      });
      re.lastIndex = close + 1;
    }
    // also record focus_tree ids so load_focus_tree refs resolve
    for (const tree of txt.matchAll(/\bfocus_tree\s*=\s*\{[^{}]*?\bid\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/gs)) {
      out.push({ type: "focus_tree", id: tree[1], file, refs: [] });
    }
  }
  return out;
}

/**
 * Country history files grant STARTING national spirits with the bare
 * `ideas = { spirit_a spirit_b }` block — not the `add_ideas` effect form. Pull
 * those out so a spirit set at game start counts as "granted". (Elsewhere
 * `ideas = { ... }` is the idea *definition* wrapper, so this is history-only.)
 */
function extractHistoryStartingIdeas(text) {
  const t = stripLineComments(text);
  const refs = [];
  const re = /\bideas\s*=\s*\{/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const open = t.indexOf("{", m.index);
    if (open === -1) break;
    const close = findMatchingBrace(t, open);
    if (close === -1) break;
    let inner = t.slice(open + 1, close);
    // drop nested blocks (e.g. hidden_ideas = {...}) and key = assignments
    // #focus-id-truncated (reference side) — a hyphenated idea listed in a country's game-start `ideas = {}`
    // block was thrown away by the narrow filter, so the spirit read as ungranted. Same class as extractRefs.
    inner = inner.replace(/\{[^{}]*\}/g, " ").replace(/[A-Za-z_][A-Za-z0-9_.\-]*\s*=\s*/g, " ");
    inner.split(/\s+/).map(s => s.trim()).filter(Boolean)
      .filter(s => /^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(s))
      .forEach(id => refs.push({ context: "history_ideas", type: "idea", id }));
    re.lastIndex = close + 1;
  }
  return refs;
}

function scanCountryHistory(root) {
  const out = [];
  for (const file of collectFiles(path.join(root, "history", "countries"), ".txt")) {
    const txt = readSafe(file);
    const tag = (path.basename(file).match(/^([A-Z]{2,3})\b/) || [])[1] || path.basename(file, ".txt");
    const refs = extractRefs(txt).concat(extractHistoryStartingIdeas(txt));
    out.push({ type: "country", id: tag, file, refs });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vanilla id set (so references to vanilla content aren't flagged as broken)
// ---------------------------------------------------------------------------

let _vanillaCache = null;
let _vanillaCacheRoot = null;
let _vanillaLocCache = null;
let _vanillaLocCacheRoot = null;
let _depCache = null;
let _depCacheKey = null;
let _depLocCache = null;
let _depLocCacheKey = null;

function buildIdSets(entities) {
  const sets = {};
  for (const e of entities) {
    if (!sets[e.type]) sets[e.type] = new Set();
    sets[e.type].add(e.id);
  }
  return sets;
}

// ⛔ #replace-path — A REFERENCE RESOLVED AGAINST CONTENT THE GAME WILL NOT LOAD READS AS HEALTHY.
//
// Mod Health took a vanillaRoot and every dependencyRoot unconditionally, and `knownExactOrCase` consulted
// those id sets directly. So a mod declaring replace_path = "common/ideas" and granting a VANILLA idea was
// reported clean — while in game the idea does not load and the focus silently does nothing. Measured with a
// positive control: an idea that exists nowhere is flagged, a real vanilla idea is not, and a real vanilla
// idea under replace_path is not either. That last one is a false clean.
//
// This is the dangerous direction. A reader that OFFERS unloaded content is visible and annoying; a
// validator that ACCEPTS a reference to unloaded content is the exact failure the screen exists to prevent.
// Reachable on Nova's core use case: Millennium Dawn declares replace_path = "common/ideas".
//
// ⭐ Filtered per ENTITY, by the folder its own file sits in — never by entity TYPE and never from a
// scanner→folder table. Both of those are wrong here: scanCharacters emits type "idea" (advisors ARE ideas)
// from common/characters, so suppressing the type would drop entities from a folder the mod never replaced;
// and scanDecisions reads TWO folders (common/decisions and events), so suppressing the scanner would be
// wrong in one direction or the other. The entity knows where it came from — ask it.
//
// Exact directory match, which is also the non-recursive rule for free: replace_path = "common/units" does
// not hide common/units/equipment, because the directory strings differ (#replace-path-not-recursive).
function replacedFolderSet(list) {
  const out = new Set();
  for (const p of list || []) {
    const s = String(p || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (s) out.add(s);
  }
  return out;
}
// Returns { kept, dropped }. The DROPPED half is not waste: a reference that fails only because the mod
// unloaded the folder needs a different sentence from one that names something nobody has ever defined.
// "does not exist in the mod or vanilla" is actively misleading there — the modder greps vanilla, finds it,
// and concludes Nova is wrong. #replace-path
function partitionEntitiesByReplacedFolders(entities, root, replaced) {
  if (!replaced || !replaced.size) return { kept: entities, dropped: [] };
  // Memoised BY DIRECTORY, not per entity. Vanilla alone is tens of thousands of entities spread across a
  // handful of folders, and the first cut of this resolved a path once per entity — inside a throwaway
  // one-element array, no less. One resolve per directory is the same answer for a fraction of the work.
  const memo = new Map();
  const dirIsReplaced = (file) => {
    const dir = path.dirname(file);
    let hit = memo.get(dir);
    if (hit === undefined) {
      hit = false;
      try {
        const rel = path.relative(root, dir);
        // A file OUTSIDE this root, or sitting directly in it, has no folder here to replace.
        if (rel && !rel.startsWith("..")) hit = replaced.has(rel.replace(/\\/g, "/").toLowerCase());
      } catch (_) { hit = false; }
      memo.set(dir, hit);
    }
    return hit;
  };
  const kept = [], dropped = [];
  for (const e of entities) {
    ((!e || !e.file || !dirIsReplaced(e.file)) ? kept : dropped).push(e);
  }
  return { kept, dropped };
}

// Returns { ids, unloaded }: what a reference MAY resolve against, and what this mod's replace_path took
// away. `unloaded` never participates in resolution — it exists so the message can tell the modder which of
// the two situations they are in. ⚠️ It is deliberately NOT stashed inside `ids`: unionIdSets iterates every
// key as a Set of ids, so an extra key of a different shape throws.
function getVanillaIdSet(vanillaRoot, replacedFolders) {
  if (!vanillaRoot) return { ids: {}, unloaded: {} };
  // The cache key carries the replaced set: the same root answers differently for a mod that replaces a
  // folder than for one that does not, and this cache lives for the process.
  const replaced = replacedFolderSet(replacedFolders);
  const cacheKey = vanillaRoot + "|" + [...replaced].sort().join(",");
  if (_vanillaCache && _vanillaCacheRoot === cacheKey) return _vanillaCache;
  const entities = [
    ...scanTechnologies(vanillaRoot),
    ...scanEquipment(vanillaRoot),
    ...scanIdeas(vanillaRoot),
    ...scanCharacters(vanillaRoot),
    ...scanEvents(vanillaRoot),
    ...scanFocuses(vanillaRoot),
    ...scanDecisions(vanillaRoot),
  ];
  const split = partitionEntitiesByReplacedFolders(entities, vanillaRoot, replaced);
  _vanillaCache = { ids: buildIdSets(split.kept), unloaded: buildIdSets(split.dropped) };
  _vanillaCacheRoot = cacheKey;
  return _vanillaCache;
}

function getVanillaLocSet(vanillaRoot) {
  if (!vanillaRoot) return new Set();
  if (_vanillaLocCache && _vanillaLocCacheRoot === vanillaRoot) return _vanillaLocCache;
  const names = scanLocalization(vanillaRoot);
  _vanillaLocCache = new Set(Object.keys(names));
  _vanillaLocCacheRoot = vanillaRoot;
  return _vanillaLocCache;
}

/** #a-cache-holds-the-old-game — every cache this module keeps, for a change of the game folder (server.js resetGameFolderCaches). */
function clearCachesForAGameChange() {
  clearVanillaCache();
  _depGrantCache = null;
  _depGrantCacheKey = "";
}

function clearVanillaCache() {
  _vanillaCache = null;
  _vanillaCacheRoot = null;
  _vanillaLocCache = null;
  _vanillaLocCacheRoot = null;
  _depCache = null;
  _depCacheKey = null;
  _depLocCache = null;
  _depLocCacheKey = null;
}

// Union of one or more {type: Set} id maps into a FRESH object with FRESH sets — never mutates
// the inputs (critical: the vanilla id set is cached and shared).
function unionIdSets(...sets) {
  const out = {};
  for (const s of sets) {
    if (!s) continue;
    for (const type of Object.keys(s)) {
      if (!out[type]) out[type] = new Set();
      for (const id of s[type]) out[type].add(id);
    }
  }
  return out;
}

// Build the merged id set for a mod's declared dependencies (e.g. Millennium Dawn for an add-on).
// Treated like vanilla for validation: references INTO these mods are valid, but their entities
// are not the active mod's own (so they don't trigger the active mod's orphan-spirit rule).
// `replacedFolders` here is only what the ACTIVE MOD declares, and that asymmetry is deliberate.
//
// A mod always loads AFTER the mods it depends on (that is what `dependencies` is for), so the active mod's
// own replace_path unloads its dependencies' copies as surely as vanilla's. But a DEPENDENCY's replace_path
// does not erase itself, and whether it also unloads a SIBLING dependency depends on launcher playset order,
// which appears in no descriptor. So the caller passes the chain's declarations for vanilla — always the
// lowest layer, so it goes either way — and only the active mod's for the dependencies.
// #replace-path-sibling-order
function getDependencyIdSet(dependencyRoots, replacedFolders) {
  if (!Array.isArray(dependencyRoots) || dependencyRoots.length === 0) return { ids: {}, unloaded: {} };
  const replaced = replacedFolderSet(replacedFolders);
  const key = dependencyRoots.slice().sort().join("|") + "||" + [...replaced].sort().join(",");
  if (_depCache && _depCacheKey === key) return _depCache;
  let merged = {};
  let mergedUnloaded = {};
  for (const root of dependencyRoots) {
    if (!root) continue;
    const entities = [
      ...scanTechnologies(root),
      ...scanEquipment(root),
      ...scanIdeas(root),
      ...scanCharacters(root),
      ...scanEvents(root),
      ...scanFocuses(root),
      ...scanDecisions(root),
    ];
    const split = partitionEntitiesByReplacedFolders(entities, root, replaced);
    merged = unionIdSets(merged, buildIdSets(split.kept));
    mergedUnloaded = unionIdSets(mergedUnloaded, buildIdSets(split.dropped));
  }
  _depCache = { ids: merged, unloaded: mergedUnloaded };
  _depCacheKey = key;
  return _depCache;
}

function getDependencyLocSet(dependencyRoots) {
  if (!Array.isArray(dependencyRoots) || dependencyRoots.length === 0) return new Set();
  const key = dependencyRoots.slice().sort().join("|");
  if (_depLocCache && _depLocCacheKey === key) return _depLocCache;
  const out = new Set();
  for (const root of dependencyRoots) {
    if (!root) continue;
    const names = scanLocalization(root);
    for (const k of Object.keys(names)) out.add(k);
  }
  _depLocCache = out;
  _depLocCacheKey = key;
  return out;
}

let _depGrantCache = null, _depGrantCacheKey = "";
// Ideas GRANTED by the dependencies (add_ideas / swap_add_idea in a dep's focuses, events, decisions,
// on_actions). An active-mod spirit that OVERRIDES a dependency's spirit is still ADDED in game by the
// dependency's own content, so the orphan-spirit rule must count these — else copying a dependency's spirit
// into an add-on (to customise it) false-flags it as "never added". (Reproduced: 84 MD EGY ideas copied.)
function getDependencyGrantedIdeaSet(dependencyRoots) {
  if (!Array.isArray(dependencyRoots) || dependencyRoots.length === 0) return new Set();
  const key = dependencyRoots.slice().sort().join("|");
  if (_depGrantCache && _depGrantCacheKey === key) return _depGrantCache;
  const out = new Set();
  // Broad scan: ANY add_ideas / swap_add_idea / history ideas={} anywhere in the dep's common/, events/, or
  // history/ grants the idea — focuses, decisions, on_actions, SCRIPTED EFFECTS (MD grants heavily through
  // these), events, country setup. A targeted per-type scan missed scripted-effect grants, so walk the trees.
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.name.endsWith(".txt")) continue;
      let txt; try { txt = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
      try { for (const r of extractRefs(txt)) { if (r.context === "add_ideas" || r.context === "history_ideas" || r.context === "swap_add_idea") out.add(r.id); } } catch (_) {}
      // MD frequently grants a spirit via a scripted effect invoked with `idea = <id>` (the effect does
      // add_ideas = [?idea]); extractRefs can't resolve that dynamic add. Treat a standalone `idea = <id>` as a
      // grant too. \b avoids matching add_idea / has_idea / remove_idea (those are preceded by '_'); `ideas =`
      // isn't matched either (no '=' right after "idea"). Lenient by design — better to miss a true orphan in a
      // dependency than to false-flag an inherited spirit the dependency really does grant.
      try { for (const m of txt.matchAll(/\bidea\s*=\s*([A-Za-z_][A-Za-z0-9_.-]*)/g)) out.add(m[1]); } catch (_) {}
    }
  };
  for (const root of dependencyRoots) {
    if (!root) continue;
    walk(path.join(root, "common"));
    walk(path.join(root, "events"));
    walk(path.join(root, "history"));
  }
  _depGrantCache = out; _depGrantCacheKey = key;
  return out;
}

// #orphan-spirit-crywolf — the same broad walk, over the ACTIVE mod.
//
// A dependency's grants were found by walking its whole common/ + events/ + history/, precisely because mods
// grant heavily through scripted effects and on_actions. The active mod got only the narrow per-type scanners,
// so a spirit the mod granted from anywhere those scanners do not model read as orphaned — 958 of Millennium
// Dawn's firings and 408 of vanilla's came from that asymmetry alone. Vanilla's own `ideas = {}` blocks in
// common/bookmarks are in the same category.
//
// Deliberately NOT lenient, unlike the dependency scan above: no bare `idea = <id>` fallback. That fallback
// exists so an inherited spirit is never falsely flagged, where the cost of missing a true orphan is somebody
// else's problem. In the user's OWN mod a missed orphan is the thing this rule is for, so only real grant
// forms count here.
// Returns { ids, prefixes } — kept apart because a prefix is matched with startsWith, not equality, and
// folding the two together would let a short prefix silence every idea beginning with it.
function getModGrantedIdeaSet(modRoot) {
  const ids = new Set();
  const prefixes = new Set();
  if (!modRoot) return { ids, prefixes };
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.name.endsWith(".txt")) continue;
      let txt; try { txt = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
      try {
        for (const r of extractRefs(txt)) {
          if (r.context === "add_ideas" || r.context === "history_ideas" || r.context === "swap_add_idea"
            || r.context === "continuous_focus") ids.add(r.id);
          else if (r.context === "add_ideas_prefix") prefixes.add(r.id);
        }
      } catch (_) {}
    }
  };
  walk(path.join(modRoot, "common"));
  walk(path.join(modRoot, "events"));
  walk(path.join(modRoot, "history"));
  return { ids, prefixes };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// RULE 2 (broken_reference) — what it does not judge as a reference at all, and what else a reference may resolve
// against. Kept here, and exported, so test-a-reference-resolves-the-way-the-engine-resolves.js classifies the
// installed game's references by the rule's own choices (#a-real-case-pinned-by-name-left-with-the-patch). That
// test also PINS both by value, with a reason for each entry, because a classifier that reads them moves with them
// (#a-test-that-reads-the-rule-moves-with-the-rule): changing either means editing that test's table too.
//   • add_ideas_prefix — a runtime-built id's literal prefix is not an id and will never resolve; it exists only to tell
//     the orphan rule which ideas are granted dynamically (#orphan-spirit-crywolf).
//   • recruit_character — has a rule of its own (RULE 4); characters index as ideas.
const BROKEN_REFERENCE_SKIPPED_CONTEXTS = new Set(["add_ideas_prefix", "recruit_character"]);
// load_focus_tree points at a focus_tree id; a focus id of the same name is accepted too. Inherited from the first
// index (ef73e93e), which gave no reason; measured 2026-11-04, no installed content resolves only through it.
const BROKEN_REFERENCE_ALSO_RESOLVES = new Map([["focus_tree", ["focus"]]]);

// roots: { modRoot, vanillaRoot, dependencyRoots } — needed by rules that ask WHOSE content a problem is,
// rather than only what the parsed entities say. Optional, so callers that only want entity-level rules still work.
function validate(entities, modIds, vanillaIds, modLocKeys = new Set(), vanillaLocKeys = new Set(), knownFolders = new Set(), knownNamespaces = new Set(), dependencyGrantedIdeas = new Set(), roots = {}) {
  const problems = [];

  // Group mod entities to check for duplicate IDs (a second definition silently overwrites the first in game
  // — one item the modder authored just vanishes). focus/idea/event/tech/equipment collide on a GLOBAL id.
  // A decision collides only WITHIN its category (HOI4 keys decisions by category+id, so the same id in two
  // categories is legal — grouping on category+id avoids crying wolf on that). continuous_focus is excluded:
  // its scanned "id" is the file basename, not the real focus id, so it can't be duplicate-checked here.
  const seenEntities = {}; // `${type}:${id}` -> [entity1, entity2, ...]
  for (const e of entities) {
    // AN ADVISOR TOKEN IS NOT A DEFINITION (#duplicate-id-advisor-token). It is indexed as an idea purely so
    // `add_ideas = <token>` resolves; the thing actually defined is the CHARACTER. Counting it made vanilla
    // report douglas_macarthur, ernst_thalmann, maxime_weygand, kijuro_shidehara and kingoro_hashimoto as
    // duplicates — each is one character with DLC-gated `instance` variants or two advisor roles, which is
    // exactly how the base game is written. The flag already existed and the orphan-spirit rule already
    // honoured it; this loop did not.
    if (e.advisorToken) continue;
    let key;
    if (e.type === "idea" && e.fromCharacter) {
      // …and a CHARACTER indexed as an idea belongs in its own namespace. Sharing the idea namespace meant a
      // character and a real idea of the same name collided, which is legal in game — they are different
      // databases.
      key = `character:${e.id}`;
    } else if (e.type === "focus" || e.type === "idea" || e.type === "event" || e.type === "tech" || e.type === "equipment") {
      key = `${e.type}:${e.id}`;
    } else if (e.type === "decision") {
      key = `decision:${e.category || ""}:${e.id}`;
    } else {
      continue;
    }
    if (!seenEntities[key]) {
      seenEntities[key] = [];
    }
    seenEntities[key].push(e);
  }

  // #duplicate-id-counted-once-per-copy — ONE defect, ONE row. This pushed a problem for every COPY, and
  // every copy produced a byte-identical message (the message already names all the locations), so a panel
  // about duplicates showed literal duplicates. It also inflated the ERROR COUNT that drives the health
  // score: Rise of Nations reported 7,020 duplicate-id errors for 3,507 duplicated ids, and its total error
  // count fell 7,574 -> 4,061 once each was counted once. Measured inflation is 2.00x on vanilla, Millennium
  // Dawn and Rise of Nations, 2.32x on Road to 56 and 4.67x on Novum Vexillum (an id defined five times).
  //
  // The old shape existed so the modder could click through to EACH definition — but nothing was gained by
  // the repeats, because every row named every file already. The row now carries `files` (all of them) and
  // `copies` (how many definitions), and `file` still anchors the first one so the existing UI is unchanged.
  for (const [key, list] of Object.entries(seenEntities)) {
    if (list.length > 1) {
      const uniqueFiles = [...new Set(list.map((e) => e.file))];
      // Name every file, but do not let one id defined in forty files produce an unreadable message.
      const MAX_NAMED = 6;
      const named = uniqueFiles.slice(0, MAX_NAMED).join(", ")
        + (uniqueFiles.length > MAX_NAMED ? ` and ${uniqueFiles.length - MAX_NAMED} more` : "");
      const type = list[0].type;
      const id = list[0].id;
      problems.push({
        severity: "error",
        rule: "duplicate_id",
        entityType: type,
        entityId: id,
        file: list[0].file,
        files: uniqueFiles,
        copies: list.length,
        message: `Duplicate ${type} ID "${id}" is defined ${list.length} times `
          + (uniqueFiles.length > 1 ? `across ${uniqueFiles.length} files: ${named}` : `in ${named}`)
          + `. This will cause one definition to overwrite the other in game.`,
      });
    }
  }

  // Who grants each idea? Either the add_ideas effect (focus/event/decision) or
  // the bare `ideas = { ... }` startup block in a country history file.
  const grantedIdeas = new Set();
  // Literal prefixes of ids the mod builds at runtime — see the add_ideas_prefix note in extractRefs.
  const grantedPrefixes = [];
  for (const e of entities) {
    for (const r of e.refs) {
      if (r.context === "add_ideas" || r.context === "history_ideas" || r.context === "swap_add_idea" || r.context === "continuous_focus") grantedIdeas.add(r.id);
      else if (r.context === "add_ideas_prefix") grantedPrefixes.push(r.id);
    }
  }
  // #orphan-spirit-crywolf — the entity refs above only cover what the per-type scanners model. Mods grant
  // heavily from places those scanners do not open (scripted effects, on_actions, bookmarks), which is exactly
  // why the DEPENDENCY scan walks the whole tree. Do the same for the active mod, or a spirit granted from one
  // of those files reads as orphaned purely because of where the grant lives.
  try {
    const own = getModGrantedIdeaSet(roots && roots.modRoot);
    for (const id of own.ids) grantedIdeas.add(id);
    for (const p of own.prefixes) grantedPrefixes.push(p);
  } catch (_) {}

  // #orphan-spirit-cried-wolf — whole idea CATEGORIES are never granted by script, by design, in any mod:
  // the player picks them in the designer or army-spirit UI. Warning that they are "never added by any focus,
  // event, decision, or country setup — it won't appear in game" is simply false for these, and it was 383 of
  // Millennium Dawn's orphan warnings. In the shipping base game 42% of all ideas (2613 of 6203) are never
  // granted by any add_ideas anywhere, concentrated in exactly these categories.
  const isNeverGrantedCategory = (cat) => {
    const c = String(cat || "").toLowerCase();
    if (!c) return false;
    // Equipment/industry designers and the country's industrial concerns — bought in the designer UI.
    if (/^(tank|aircraft|naval|materiel|air)_manufacturer$/.test(c)) return true;
    if (c === "industrial_concern" || c === "materiel_manufacturer") return true;
    // Army/navy/air/academy spirits and the command spirits — selected, not granted.
    if (/_spirit$/.test(c)) return true;
    // Advisor slots: filled by hiring a character, which is why fromCharacter ideas are already exempt.
    if (/^(political_advisor|army_chief|navy_chief|air_chief|high_command|theorist)$/.test(c)) return true;
    return false;
  };

  // RULE 1 — orphan national spirit: a mod idea that nothing ever adds.
  for (const e of entities) {
    if (e.type !== "idea" || e.fromCharacter) continue; // characters are recruited/hired, not added
    if (isNeverGrantedCategory(e.category)) continue;   // designer/spirit/advisor categories are chosen, not added
    // Granted by THIS mod, or by a dependency (an add-on may override a dep spirit the dep still grants).
    if (grantedPrefixes.some((p) => e.id.startsWith(p))) continue; // granted through a runtime-built id
    if (!grantedIdeas.has(e.id) && !dependencyGrantedIdeas.has(e.id)) {
      problems.push({
        severity: "warning",
        rule: "orphan_spirit",
        entityType: e.type,
        entityId: e.id,
        file: e.file,
        // #orphan-spirit-crywolf — the old wording asserted a fact about the game this rule cannot know
        // ("it won't appear in game"), which reads as certainty for something that is only ever an educated
        // guess: a spirit can be granted from a scripted GUI, or through an id built at runtime that no
        // static scan can follow. Say what was actually checked, and name the escape hatch.
        message: `Nothing in this mod adds "${e.id}" — no add_ideas, add_timed_idea, swap_ideas or game-start ideas block references it. If it is granted from a scripted GUI or through an id built at runtime, ignore this.`,
      });
    }
  }

  // RULE 1b — a country the MOD ITSELF defines, with no flag anywhere.
  //
  // HOI4 draws a country's flag on the selection screen, the diplomacy list, every unit counter, every event
  // popup and every peace conference. A tag with no gfx/flags/<TAG>.tga gets a blank/placeholder in all of
  // them — the single most visible thing that can be missing from a new country, and nothing checked for it.
  // The mod this campaign built ran clean through Mod Health for weeks while its only country had no flag.
  //
  // Scoped the same way as every other rule here: only tags the mod DECLARES in its own
  // common/country_tags, and only when no layer supplies the flag — a mod that adds content to an existing
  // country, or an add-on whose parent already ships the art, is not the one missing anything.
  for (const tag of scanModDeclaredCountryTags(roots.modRoot)) {
    // D01–D99 are HOI4's reserved DYNAMIC country tags — the pool civil wars and released puppets draw from.
    // They ship deliberately flagless (the game builds their flag at runtime from the originating country),
    // and they were the entire remainder of this rule once ideology variants were accepted: 75 of vanilla's
    // 75 and 75 of Millennium Dawn's 76. Exempting them leaves vanilla at 0 and MD at 1 real warning.
    if (/^D\d\d$/.test(tag)) continue;
    if (countryFlagExists(roots.modRoot, tag)) continue;
    if ((Array.isArray(roots.dependencyRoots) ? roots.dependencyRoots : []).some((r) => countryFlagExists(r, tag))) continue;
    if (roots.vanillaRoot && countryFlagExists(roots.vanillaRoot, tag)) continue;
    problems.push({
      severity: "warning",
      rule: "country_no_flag",
      entityType: "country",
      entityId: tag,
      file: "gfx/flags/" + tag + ".tga",
      message: `Country "${tag}" has no flag — gfx/flags/${tag}.tga is missing. HOI4 shows a blank placeholder wherever the flag appears (country select, diplomacy, unit counters, events). Add one in Country Setup → Flag; Nova writes the .tga plus the medium/small sizes and the ideology variants.`,
    });
  }

  // RULE 1c — a division template naming a division_names_group nothing defines.
  //
  // HOI4 resolves the group against common/units/names_divisions. When it does not exist, every division
  // built from that template goes nameless in game — visible on the map, the army list and every order.
  //
  // Nova already knew how to detect this; the knowledge just lived in one place you had to walk to. The Army
  // maker says it in the response to saving a country's order of battle, so you only ever hear it if you
  // happen to open and re-save that exact country. The mod this campaign built shipped a template pointing at
  // a group defined nowhere, and Mod Health called it clean.
  //
  // Case-INSENSITIVE, which is not a detail: vanilla defines GER_Inf_01, and a mod that writes GER_INF_01
  // works fine. A case-sensitive check reports real, working groups as missing.
  {
    const refs = scanOobNameGroupRefs(roots.modRoot);
    if (refs.length) {
      const defined = new Set([
        ...scanDivisionNameGroups(roots.modRoot),
        ...scanDivisionNameGroups(roots.vanillaRoot),
        ...(Array.isArray(roots.dependencyRoots) ? roots.dependencyRoots : []).flatMap((r) => [...scanDivisionNameGroups(r)]),
      ]);
      const seenGroup = new Set();
      for (const r of refs) {
        const key = r.group.toLowerCase();
        if (defined.has(key) || seenGroup.has(key)) continue;
        seenGroup.add(key);
        problems.push({
          severity: "warning",
          rule: "division_names_group_undefined",
          entityType: "unit",
          entityId: r.group,
          file: r.file,
          message: `Division name group "${r.group}" is used by an order of battle but is defined nowhere — not in this mod, its dependencies, or the base game. Divisions built from that template will have no name in game. Define it under common/units/names_divisions, or clear the field to fall back to the country's default names.`,
        });
      }
    }
  }

  // RULE 1c — one of the mod's own files does not have balanced braces.
  //
  // This is the root cause behind a confusing symptom I hit on four makers in a row: a single unclosed `{`
  // makes the whole file unreadable, so every OTHER item in it disappears from the editor. Open Research and
  // your techs are simply not there. The makers themselves behave correctly — every one of them REFUSES the
  // save and leaves the file byte-for-byte alone, which is the outcome that matters — but nothing told the
  // modder why their content had vanished.
  //
  // Worth reporting because it is genuinely rare in real content: 13 of vanilla's 4269 script files and 1 of
  // Millennium Dawn's 5586 are unbalanced. Only the ACTIVE MOD's own files are checked, exactly like the map
  // and buildings rules — vanilla's thirteen are not the modder's to fix, and the shipping game plays fine
  // with them, so claiming otherwise would be the cry-wolf this campaign has spent several commits removing.
  //
  // A warning rather than an error, and worded for what is certainly true: HOI4's own parser recovers from
  // some of these (it must — vanilla ships them), but Nova cannot read the file, so its contents are missing
  // from the editors.
  // #brace-message-outlived-its-own-fix — SAY WHAT IS STILL TRUE.
  //
  // This claimed "Nova can't read this file, so anything defined in it is missing from the makers", which
  // WAS true and stopped being true the day four readers were taught to close an unclosed block at EOF the
  // way Clausewitz does (#ideas-file-missing-its-last-brace). Measured on a scratch mod whose ideas file is
  // one `}` short: the spirit appears in the catalogue, and Mod Health said it was missing from the makers.
  //
  // What IS certainly true is the half nobody was told: the WRITE path refuses. Nova's own save error
  // already words it exactly right — "Nova can read past a missing one, but it will not write into a file
  // whose braces do not add up" — so a modder met a confident, wrong claim in one panel and the correct one
  // only if they tried to save. Reading past a missing brace and writing into the file are different
  // questions, and only the first has a good answer.
  //
  // The two cases are not the same and must not be worded the same: end of file can close a block that was
  // left open, but nothing can supply a `{` that was never written, so a stray `}` really can cut content
  // off — for the parser and for Nova.
  for (const bad of scanUnbalancedModFiles(roots.modRoot)) {
    const message = bad.negative
      ? `${bad.file} has a closing brace with nothing open. HOI4 cannot recover from a stray "}" the way it recovers from a missing one, so anything after it may be dropped — and Nova will not save into this file until it adds up. Find the extra "}".`
      : `${bad.file} leaves ${bad.depth} block${bad.depth === 1 ? "" : "s"} unclosed. HOI4 closes an open block at end of file and Nova now reads it the same way, so the content is probably still there — but Nova will NOT save into this file until the braces add up, so nothing in it can be edited. Add the missing "}".`;
    problems.push({
      severity: "warning",
      rule: "file_unbalanced_braces",
      entityType: "file",
      entityId: bad.file,
      file: bad.file,
      negative: !!bad.negative,
      depth: bad.depth,
      message,
    });
  }

  // RULE 1e — a custom_effect_tooltip pointing at a localisation key that has no text.
  //
  // The effect exists to print a sentence into a tooltip. With no localisation behind the key, the player is
  // shown the raw id — "nua_marines_tt" sitting in the middle of a focus tooltip. Visible, and the sort of
  // slip anyone makes: the effect and its text live in different files, so writing one and forgetting the
  // other takes no carelessness at all. I did it twice myself while building the demo mod for this campaign,
  // which is what prompted the rule.
  //
  // A tooltip key is not an entity, so the existing missing-localisation rule never looked at it.
  //
  // Measured before building, as the rules in this file now are: 14 of vanilla's 4719 tooltip keys have no
  // text (0.3%) and 77 of Millennium Dawn's 6132 (1.3%). Comparable to the unbalanced-braces rule and far
  // from the 5-20% ideas that were dropped. Only the ACTIVE MOD's own script is scanned, and a key with text
  // anywhere — the mod, a dependency, or the base game — counts as resolved.
  for (const ref of scanTooltipKeyRefs(roots.modRoot)) {
    if (modLocKeys.has(ref.key) || vanillaLocKeys.has(ref.key)) continue;
    // #a-name-the-game-cannot-localise — the same repair as RULE 3's, so the same refusal: a key no localisation
    // line can hold is not offered to the fixer, and its row does not tell the modder to add it to one. A QUOTED
    // value like that never gets here — scanTooltipKeyRefs sets it aside as text the game prints as written
    // (#a-quoted-tooltip-is-text) — so what is left is a bare token the game looks up, always misses and shows raw.
    // None is installed: over the base game and the 15 installed Workshop items every bare tooltip value not built at
    // run time can be a key (measured 2026-11-19). Novum Vexillum's quoted "Yes:"/"No:"/"Abstained:" were the only such rows.
    const writable = canBeLocalizationKey(ref.key);
    problems.push(markUnwritableLocKey({
      severity: "warning",
      rule: "tooltip_key_no_localization",
      entityType: "localisation",
      entityId: ref.key,
      file: ref.file,
      message: writable
        ? `custom_effect_tooltip shows "${ref.key}", but no localisation defines that key — in game the player sees the raw id instead of a sentence. Add ${ref.key} to a localisation file, or drop the tooltip line.`
        : `custom_effect_tooltip shows "${ref.key}", and no localisation can define that key — in game the player sees the raw id instead of a sentence.`,
    }, ref.key, `The repair is in the script: point the tooltip at an ASCII key and localise that, write the text itself as a quoted literal (custom_effect_tooltip = "…"), which the game prints as written, or drop the tooltip line.`));
  }

  // RULE 2 — broken reference: a ref whose target exists in neither mod nor vanilla.
  //
  // #reference-lookup-is-case-insensitive — MATCH THE WAY THE ENGINE MATCHES.
  //
  // Requiring an exact-case match reported 265 references across the installed corpus as broken when an
  // entity of the same type exists differing only in case — 9 of vanilla's 20 (45%) and 103 of Millennium
  // Dawn's 160 (64%). The evidence that HOI4 resolves them comes from the shipping game itself:
  //
  //   • Man the Guns does `add_idea = ENG_guided_by_britain_RAJ_2`, then later checks
  //     `has_idea = ENG_guided_by_britain_raj_2` and `remove_ideas = ENG_guided_by_britain_raj_2` — in the
  //     SAME FILE. The idea is defined as `..._raj_2`. If lookup were case-sensitive the add would resolve
  //     to nothing and the Raj-autonomy mechanic would be dead in shipped DLC.
  //   • No Step Back defines `NSB_news.200` and `nsb_news.2`, and fires them as `nsb_news.200`
  //     (common/national_focus/soviet.txt) and `NSB_news.2` (events/Poland.txt). Measured 2026-11-04; until then this
  //     line gave .200's direction reversed.
  //   • Vanilla's Portugal does `add_ideas = por_portuguese_legion` for `POR_portuguese_legion`.
  //
  // …and this codebase had already established it once: the event_namespace rule notes it verified all
  // 6,577 vanilla event definitions resolve "once matching is global + case-insensitive". The wiki does not
  // state the rule either way, so this leans on what vanilla demonstrably does rather than on inference.
  //
  // Exact match is still tried first, so nothing that resolved before resolves differently now; the
  // lowercase mirrors are built once, lazily, and only for the types actually consulted.
  const _lowerBags = new Map();
  const lowerBag = (bag, tag, type) => {
    const key = tag + ":" + type;
    if (!_lowerBags.has(key)) {
      const out = new Set();
      const src = bag[type];
      if (src) for (const id of src) out.add(String(id).toLowerCase());
      _lowerBags.set(key, out);
    }
    return _lowerBags.get(key);
  };
  const knownExactOrCase = (type, id) => {
    if (modIds[type] && modIds[type].has(id)) return true;
    if (vanillaIds[type] && vanillaIds[type].has(id)) return true;
    const lower = String(id).toLowerCase();
    if (lowerBag(modIds, "m", type).has(lower)) return true;
    if (lowerBag(vanillaIds, "v", type).has(lower)) return true;
    return false;
  };
  const known = (type, id) => {
    if (knownExactOrCase(type, id)) return true;
    // load_focus_tree points at a focus_tree id; also accept a focus id of same name (BROKEN_REFERENCE_ALSO_RESOLVES)
    for (const t of BROKEN_REFERENCE_ALSO_RESOLVES.get(type) || []) { if (knownExactOrCase(t, id)) return true; }
    return false;
  };
  // The type an id IS actually defined as (if any), so a broken reference can say "X is an idea, not a
  // focus" — that's a REAL bug (a type mix-up / leftover that silently does nothing in game, e.g. vanilla's
  // own Turkey history did `complete_national_focus = TUR_widespread_illiteracy_idea` until the 2026-10-27 update put
  // TUR_millet_mektebi_focus there). We DETECT it, not hide it.
  const anyType = (id) => {
    for (const t in modIds) { if (modIds[t] && modIds[t].has(id)) return t; }
    for (const t in vanillaIds) { if (vanillaIds[t] && vanillaIds[t].has(id)) return t; }
    // …and case-insensitively too, or the "there IS a <type> called X" half of the message would go quiet
    // for exactly the ids the lookup above now resolves. A type mix-up is still a real bug worth naming.
    for (const t in modIds) { if (lowerBag(modIds, "m", t).has(String(id).toLowerCase())) return t; }
    for (const t in vanillaIds) { if (lowerBag(vanillaIds, "v", t).has(String(id).toLowerCase())) return t; }
    return null;
  };
  for (const e of entities) {
    for (const r of e.refs) {
      // #remove-ideas-was-never-validated — this used to `continue` on every remove_ideas reference, with
      // the reason "removing a vanilla/other idea is fine". That does not hold: anyType() below already
      // resolves ids from vanilla AND from dependencies, so a genuinely inherited idea was never going to
      // be reported. What the skip actually hid was the TYPO. A modder writes
      // `remove_ideas = tor_industrial_bases` for tor_industrial_base; in game the focus completes, the
      // player is told the spirit is gone, and it stays for the rest of the campaign — a permanent malus
      // with nothing in any log. The identical typo one line up in add_ideas was reported as an error, so
      // the panel was inconsistent about the same mistake.
      //
      // Measured across the base game and all 10 installed workshop mods: +104 findings, of which 102 are
      // in mods and 20 of 20 sampled across six different mods were TRUE (the id is defined nowhere in the
      // mod, its dependencies or vanilla). The 2 that landed on VANILLA were not remove_ideas' fault at
      // all — they were the `idea = X` block form being mis-parsed, fixed in pushIdeaList above, and the
      // base game is back to zero.
      // A runtime-built id's literal prefix is not an id and will never resolve — it exists only to tell the
      // orphan rule which ideas are granted dynamically. #orphan-spirit-crywolf
      // recruit_character is handled by its own rule below (chars index as ideas). Both are in
      // BROKEN_REFERENCE_SKIPPED_CONTEXTS, which the reference test classifies by and pins by value.
      if (BROKEN_REFERENCE_SKIPPED_CONTEXTS.has(r.context)) continue;
      if (!known(r.type, r.id)) {
        const other = anyType(r.id);
        // #an-event-call-is-named-as-written — the keyword the file wrote (news_event, state_event…), where the context
        // files several under one name; refContext stays the context, which the reference test and the callers key on.
        const via = r.call || r.context;
        problems.push({
          severity: "error",
          rule: "broken_reference",
          entityType: e.type,
          entityId: e.id,
          file: e.file,
          refContext: r.context,
          ...(r.call ? { refCall: r.call } : {}),
          refType: r.type,
          refId: r.id,
          message: (other && other !== r.type)
            ? `${e.type} "${e.id}" references ${r.type} "${r.id}" via ${via}, but no ${r.type} by that name exists — there IS a ${other} called "${r.id}", so this is a type mix-up (a typo or leftover): the ${via} silently does nothing in game.`
            // #replace-path — A REFERENCE THE MOD UNLOADED IS A DIFFERENT PROBLEM FROM A TYPO, AND SAYING
            // "does not exist" ABOUT IT IS SIMPLY WRONG. It does exist; this mod's own descriptor stopped
            // the game loading it. A modder told the first thing greps the base game, finds it, and
            // concludes Nova is broken — so name the cause and the two ways out.
            : (roots.unloadedIds && roots.unloadedIds[r.type] && roots.unloadedIds[r.type].has(r.id))
              ? `${e.type} "${e.id}" references ${r.type} "${r.id}" via ${via}. That ${r.type} exists in the base game or a mod below this one, but this mod's descriptor declares a replace_path over the folder it lives in, so the game never loads it and the ${via} silently does nothing. Define your own "${r.id}", or drop that replace_path.`
              : `${e.type} "${e.id}" references ${r.type} "${r.id}" via ${via}, but that ${r.type} does not exist in the mod or vanilla.`,
          // ⛔ NOT AUTO-FIXABLE, and the card must know without parsing the sentence above.
          //
          // An ordinary broken_reference is a mistyped id, and a model correcting it to the near-match is a
          // reasonable thing to offer. This variant is not that. Its two real repairs are "author the missing
          // content" — which is asking a model to INVENT a vanilla event into somebody's mod — and "drop a
          // replace_path", a descriptor change whose blast radius is the whole folder. Neither belongs behind
          // a one-click button.
          //
          // Same conclusion the country_no_flag note reached, for the same reason: the problem's own message
          // already names the real fix, so the button would only offer a worse answer than the text beside it.
          autoFix: (roots.unloadedIds && roots.unloadedIds[r.type] && roots.unloadedIds[r.type].has(r.id)) ? false : undefined,
        });
      }
    }
  }

  // RULE — a VISIBLE event with a nameless option has no clickable button in game, so the player
  // can't dismiss it (a soft-lock). Hidden events legitimately use a nameless option, so they're
  // exempt. Only mod events are checked (vanilla/dependency events are passed in for reference only).
  for (const e of entities) {
    if (e.type !== "event" || e.hidden || !Array.isArray(e.options)) continue;
    // #an-option-that-cannot-show-needs-no-name — an option that is never offered needs no name; counted only while the
    // event has an option that can show, so an event made of such options alone is judged as before.
    const shown = e.options.filter((o) => o && !o.neverShown);
    const nameless = (shown.length ? shown : e.options).filter((o) => o && !o.hasName).length;
    if (nameless > 0) {
      problems.push({
        severity: "warning",
        rule: "event_option_no_name",
        entityType: "event",
        entityId: e.id,
        file: e.file,
        message: `Event "${e.id}" has ${nameless} option(s) with no name — a visible event needs a named option button or the player can't close it. Give each option a name, or mark the event hidden = yes.`,
      });
    }
  }

  // RULE — a VISIBLE event with no title shows raw "missing-text" as its header in-game. Hidden events
  // legitimately have none. (hidden is detected case-insensitively, so `Hidden = yes` is respected.)
  for (const e of entities) {
    if (e.type !== "event" || e.hidden || e.hasTitle !== false) continue;
    problems.push({
      severity: "warning",
      rule: "event_no_title",
      entityType: "event",
      entityId: e.id,
      file: e.file,
      message: `Event "${e.id}" is visible but has no title — it will show raw "missing-text" as its header in-game. Add a title, or mark the event hidden = yes.`,
    });
  }

  // RULE — an event id's namespace must be declared via `add_namespace` somewhere (this mod, a
  // dependency, or vanilla). HOI4 registers namespaces globally and case-insensitively; an event in
  // an UNdeclared namespace is never registered, so it — and anything that tries to fire it — silently
  // does nothing. Verified false-positive-free against vanilla (all 6,577 vanilla event defs resolve
  // once matching is global + case-insensitive). The `size` guard skips the rule when the namespace
  // set couldn't be collected, so it never cries wolf on incomplete data.
  if (knownNamespaces && knownNamespaces.size) {
    for (const e of entities) {
      if (e.type !== "event") continue;
      const nm = /^(.*)\.\d+$/.exec(e.id || "");
      if (!nm) continue; // not the `namespace.number` form — skip
      if (!knownNamespaces.has(nm[1].toLowerCase())) {
        problems.push({
          severity: "error",
          rule: "event_namespace_undeclared",
          entityType: "event",
          entityId: e.id,
          file: e.file,
          // Same distinction the broken_reference message draws: a namespace the mod UNLOADED is not an
          // undeclared one, and saying "not declared in ... vanilla" about it is false — the modder greps
          // the base game, finds the declaration, and concludes Nova is wrong. The repair is the same line
          // either way, but the reason they are typing it is not.
          message: (roots.unloadedNamespaces && roots.unloadedNamespaces.has(nm[1].toLowerCase()))
            ? `Event "${e.id}" uses the namespace "${nm[1]}". It IS declared by "add_namespace = ${nm[1]}" in the base game or a mod below this one — but this mod's descriptor declares a replace_path over the folder that declaration lives in, so the game never loads it and the event won't register. Add "add_namespace = ${nm[1]}" to one of this mod's own event files.`
            : `Event "${e.id}" uses the namespace "${nm[1]}", but no "add_namespace = ${nm[1]}" is declared in the mod, its dependencies, or vanilla — the event won't register and won't fire.`,
        });
      }
    }
  }

  // RULE — a VISIBLE event with NO options at all gives the player a pop-up with no button to close
  // it (a hard soft-lock). Hidden events legitimately have none. Only mod events are checked.
  for (const e of entities) {
    if (e.type !== "event" || e.hidden || !Array.isArray(e.options)) continue;
    if (e.options.length === 0) {
      problems.push({
        severity: "warning",
        rule: "event_no_options",
        entityType: "event",
        entityId: e.id,
        file: e.file,
        message: `Event "${e.id}" is visible but has no options — the player gets a pop-up with no button to close it (a soft-lock). Add at least one option, or mark the event hidden = yes.`,
      });
    }
  }

  // RULE — a focus that references ITSELF. Self-prerequisite/mutually-exclusive can never be satisfied;
  // a self relative_position_id makes HOI4 drop the focus to the tree origin (overlapping the others).
  for (const e of entities) {
    if (e.type !== "focus" || !Array.isArray(e.refs)) continue;
    const self = e.refs.find((r) => r.id === e.id && (r.context === "focus_link" || r.context === "relative_position_id"));
    if (self) {
      const what = self.context === "relative_position_id"
        ? "is positioned relative to itself (relative_position_id = its own id), so HOI4 drops it to the tree origin"
        : "lists itself as a prerequisite or mutually-exclusive focus, which can never be satisfied";
      problems.push({
        severity: "warning",
        rule: "focus_self_reference",
        entityType: "focus",
        entityId: e.id,
        file: e.file,
        message: `Focus "${e.id}" ${what}. Remove the self-reference.`,
      });
    }
  }

  // RULE — a focus whose icon names a sprite NOTHING DECLARES. HOI4 draws its default "?" placeholder there,
  // exactly like a focus with no `icon` at all — measured in game 2026-09-05 (see
  // test-a-focus-icon-must-name-a-real-sprite.js for the three-cell experiment, which also established that
  // sprite lookup is CASE-SENSITIVE). The editor cannot show you this either — it substitutes its own
  // placeholder image when a sprite is missing, so the node looks fine in Nova. That is the same reason the focus SAVE
  // path already warns about this (server.js, unresolvedFocusIconWarning); the health scan never did, so a
  // modder only learned about it if they happened to re-save that particular tree.
  //
  // Measured over the base game and all 10 installed workshop mods:
  //   vanilla        0 of 11,016 focus icons   <- the cry-wolf control, and it must stay zero
  //   most mods      0 to 5
  //   Rise of Nations  307 of 21,121 (1.45%), all genuine — GFX_focus_Attack_NOR and friends
  //
  // ⚠️ TWO things make that vanilla zero, and both were learned the hard way while measuring:
  //   · sprites are declared in .gfx files ANYWHERE under a root, including dlc/<name>/interface/.
  //     GFX_DEN_basic_small_fighter_2 looks like a vanilla bug until you walk dlc038_arms_against_tyranny.
  //   · the icon must be the FOCUS's own. A national_focus file is full of `icon =` lines belonging to
  //     create_equipment_variant blocks inside completion_reward, and counting those reports ten
  //     non-existent bugs against the shipping base game.
  //
  // Scoped to focuses deliberately. Under the same treatment idea pictures sit at 1.6% and decision icons
  // at 5.6%, which is too loose to warn on — the same judgement server.js already recorded.
  //
  // Not in the deterministic tier: choosing an icon is not something a program can derive.
  {
    // validate() receives the roots inside `roots`, not as bare bindings — same as the country-flag rule.
    const spriteRoots = [roots && roots.modRoot, ...((roots && roots.dependencyRoots) || []), roots && roots.vanillaRoot].filter(Boolean);
    const sprites = collectSpriteNames(spriteRoots);
    // No usable inventory (a bare fixture with no interface/ anywhere) → say nothing rather than flag all.
    if (sprites.size >= 1000) {
      for (const e of entities) {
        if (e.type !== "focus" || !e.iconName) continue;
        const raw = e.iconName;
        const cands = [raw, `GFX_${raw}`, `GFX_focus_${raw}`, `GFX_goal_${raw}`];
        if (cands.some((c) => sprites.has(c))) continue;
        problems.push({
          severity: "warning",
          rule: "focus_icon_unresolved",
          entityType: "focus",
          entityId: e.id,
          file: e.file,
          refType: "sprite",
          refId: raw,
          message: `Focus "${e.id}" uses icon "${raw}", but nothing declares that sprite — not this mod, its dependencies, or the base game. In game the node draws the default "?" placeholder, exactly like a focus with no icon at all. Sprite names are case-sensitive, so check the capitals as well as the spelling — or upload an icon under this name. Nova's focus editor substitutes its own placeholder for a missing sprite, so the node can look right there.`,
        });
      }
    }
  }

  // RULE — a focus with no `icon` field renders as the default "?" placeholder in-game. Every vanilla
  // focus has an icon, so a missing one is a real (and easy-to-miss) authoring slip, not a vanilla
  // pattern — zero false positives.
  for (const e of entities) {
    if (e.type !== "focus" || e.hasIcon !== false) continue;
    problems.push({
      severity: "warning",
      rule: "focus_no_icon",
      entityType: "focus",
      entityId: e.id,
      file: e.file,
      message: `Focus "${e.id}" has no icon — it will show the default "?" placeholder in-game. Set an icon (the GFX_… sprite) for it in the focus editor.`,
    });
  }

  // RULE 3 — missing localization: a mod focus, idea, or decision without a localization name key
  const hasLoc = (key) => {
    return modLocKeys.has(key) || vanillaLocKeys.has(key);
  };
  // What the idea categories of every loaded layer declare (readIdeaCategories), for the two cases below.
  const ideaCats = (roots && roots.ideaCategories) || { characterSlots: new Set(), hiddenSlots: new Set() };
  // #a-nameless-advisor-is-named-by-its-trait — the key the game reads has no text, and the game shows the advisor's trait.
  // #a-trait-names-an-advisor-only-if-the-game-loads-it — a trait some loaded layer defines, with text (readLeaderTraits).
  const leaderTraits = (roots && roots.leaderTraits) || new Set();
  const namesAnAdvisor = (t) => !!t && leaderTraits.has(t) && hasLoc(t);
  const namedByItsTrait = (e) => (e.fromCharacter
    ? Array.isArray(e.advisorTraits) && e.advisorTraits.length > 0 && e.advisorTraits.every(namesAnAdvisor)
    : e.type === "idea" && ideaCats.characterSlots.has(e.category) && namesAnAdvisor(e.firstTrait));
  for (const e of entities) {
    if (e.type !== "focus" && e.type !== "idea" && e.type !== "decision") continue;
    // #a-hidden-idea-needs-no-name — an idea in a slot its category declares `hidden = yes` is never on screen, so it needs
    // no name: the base game leaves its 46 hidden_ideas ones unlocalised (32 in comchina.txt), and Fix all named them.
    if (e.type === "idea" && !e.fromCharacter && ideaCats.hiddenSlots.has(e.category)) continue;
    // #missing-loc-crywolf — an advisor's idea_token is not a displayed entity. It exists so the advisor can
    // be referenced as an idea; the NAME the player sees comes from the character, which has its own key. The
    // token itself never needs localising, and demanding one accounted for 1,628 Millennium Dawn firings.
    // The flag is already set at scan time, and the counts loop below already honours it — the rule did not.
    if (e.advisorToken) continue;
    // TEST THE KEY THE GAME WILL READ (#missing-loc-ignores-own-name). An entity that declares its own
    // `name =` displays under THAT, so demanding a key equal to the block id called correctly-localised
    // content unlocalised — 88% of Millennium Dawn's 5,630 firings and 36% of vanilla's 4,138 were this.
    // A quoted literal needs no localisation at all.
    //
    // #character-named-by-its-instance — a character made of `instance` blocks shows the name of whichever
    // instance applies: that instance's own `name =`, or, where it declares none, the character's (its depth-0
    // name, else its token) — and the character's own as well when the instances leave a case uncovered (see
    // characterInstances). EVERY key in that set has to resolve, and the first that does not is reported. Over
    // the base game and the 14 installed Workshop items no character leaves two unresolved.
    const display = e.ownName;
    const shown = e.instances
      ? e.instances.map((n) => n || display).concat(e.instancesCover ? [] : [display])
      : [display];
    const keys = [];
    for (const d of shown) {
      if (d && d.literal !== undefined) continue;
      const key = d && d.key ? d.key : e.id;
      if (!keys.some((k) => k.key === key)) keys.push({ key, d, fromInstance: !!d && d !== display });
    }
    const missing = keys.filter((k) => !hasLoc(k.key));
    if (missing.length && !namedByItsTrait(e)) {
      const { key: locKey, d: declared, fromInstance } = missing[0];
      const field = (declared && declared.field) || "name";
      const row = {
        severity: "warning",
        rule: "missing_localization",
        entityType: e.type,
        entityId: e.id,
        file: e.file,
        // #autofix-writes-the-entity-id — THE KEY TO WRITE, not the id to write it under. The rule learned
        // to REPORT the key the game reads (an entity that declares `name =`/`text =` displays under that),
        // but /api/modhealth/fix still wrote `problem.entityId`, so the deterministic auto-fix added a key
        // HOI4 never reads, marked the problem fixed, and left the game showing the same raw text. 240 rows
        // across the installed corpus resolve to a key that is not the id (131 Rise of Nations, 51 Millennium
        // Dawn, 28 Road to 56, 16 Old World Blues, 9 vanilla, 5 Novum Vexillum).
        locKey,
        // Name the key the GAME looks up, which is not always the id — otherwise the message sends the
        // author to add a key that would still not be read.
        message: (locKey === e.id
          ? `Missing localization name key "${e.id}" for ${e.type} "${e.id}". In-game, the ID will be displayed instead of a proper name.`
          : fromInstance
            ? `Missing localization key "${locKey}" for ${e.type} "${e.id}" — an instance of it declares name = ${locKey}, so that is the key HOI4 reads whenever that instance applies, not its id. In-game the raw key will be displayed instead of a proper name.`
            : `Missing localization key "${locKey}" for ${e.type} "${e.id}" — it declares ${field} = ${locKey}, so that is the key HOI4 reads, not its id. In-game the raw key will be displayed instead of a proper name.`)
          + (missing.length > 1 ? ` It can also show ${missing.slice(1).map((k) => `"${k.key}"`).join(", ")}, which no localisation defines either.` : ""),
      };
      // #a-name-the-game-cannot-localise — the key the game reads is reported whole now, and it may be one no
      // localisation line can hold: Rise of Nations' `name = GER_jürgen_wagner` cannot be named by any line, so
      // writing it would break a .yml and writing anything else would be a key nothing reads. The repair is in
      // the script, which is not a single-answer edit, so the row says so and the fix tier leaves it alone.
      problems.push(markUnwritableLocKey(row, locKey, locKey === e.id
        ? `The repair is in the script: rename "${e.id}" in ASCII and localise that${e.type === "decision" ? "" : `, or give it a name as a quoted literal (${e.type === "focus" ? "text" : "name"} = "…"), which the game prints as written`}.`
        : `The repair is in the script: spell the ${field} = token in ASCII and localise that, or write the name as a quoted literal (${field} = "…"), which the game prints as written.`));
    }
  }

  // RULE 4 — recruit_character in the wrong place. HOI4 only executes recruit_character from
  // game-start history files; in a focus reward or event effect it does nothing (and logs a
  // warning). Catch it so a modder doesn't end up with characters that never appear (the exact
  // bug found by an in-game test of an add-on).
  // #recruit-character-rule-narrower-than-its-own-help-text — the gate listed focus and event, while the
  // panel's explanation of this very rule (public/modhealth.js) says "Inside a focus, event, or DECISION it
  // does nothing". A decision is the most natural third place to reach for the effect, and it was the one
  // Nova promised to catch and did not. Found by a known-answer fault-injection test: recruit_character
  // written into a decision's available = { } block went unreported.
  //
  // The gate is now the legal home rather than a list of illegal ones — country history is the ONE place
  // HOI4 executes this, so anything else is worth naming, and a fourth container added later is covered by
  // construction instead of needing another name added here.
  for (const e of entities) {
    if (e.type === "country") continue;
    for (const r of e.refs) {
      if (r.context !== "recruit_character") continue;
      problems.push({
        severity: "warning",
        rule: "recruit_character_misplaced",
        entityType: e.type,
        entityId: e.id,
        file: e.file,
        refType: "character",
        refId: r.id,
        message: `${e.type} "${e.id}" uses recruit_character = ${r.id}, but recruit_character only works in a country's game-start history file — here it does nothing. Add the character to the country via Country Setup (history) instead.`,
      });
    }
  }

  // RULE 5 — a tech at a negative research-folder grid position won't render ("Found no grid box").
  // Catch the exact placement bug that hid an add-on's techs in-game.
  //
  // …EXCEPT a negative position is not a bug (#tech-position-not-absolute). `folder.position` is a SLOT
  // OFFSET from the gridbox the tech's chain resolves to, not an absolute coordinate, and mod-index never
  // opens a .gui file so it cannot know where that origin is. The rule fired 57 times on the SHIPPING base
  // game — CAS1/2/3, heavy_fighter1/2/3, the MtG cruiser/carrier/submarine hull line, light and amphibious
  // tanks, the special-forces doctrine branches — all of which obviously render in game. 57 of 57 wrong is
  // not a rule, it is noise, and noise is what makes a health panel unreadable.
  //
  // Kept only for the case it was actually written for: a tech Nova placed itself, where Nova wrote the
  // gridbox and the origin really is the folder frame. Detected by Nova's own marker in the mod's .gui.
  // Anything else is left to the research editor, which DOES read the gui and already reports a tech whose
  // chain resolves to no gridbox at all — the real "Found no grid box" condition this message claims.
  const novaPlacedFolders = (() => {
    const out = new Set();
    try {
      // roots.modRoot — validate() receives the mod root inside `roots`, not as a bare binding. A bare
      // `modRoot` here threw, the surrounding catch swallowed it, and the gate silently matched nothing,
      // which reads exactly like the rule working. The test that expects a firing is what caught it.
      const dir = path.join(roots.modRoot, "interface");
      for (const f of fs.readdirSync(dir)) {
        if (!/\.gui$/i.test(f)) continue;
        const txt = readSafe(path.join(dir, f));
        if (!/NOVA_(?:NEW_TECH_)?GRIDBOXES/.test(txt)) continue;
        for (const m of txt.matchAll(/name\s*=\s*"([A-Za-z0-9_]+)_tree"/g)) out.add(m[1]);
      }
    } catch (_) { /* no interface dir — nothing Nova placed */ }
    return out;
  })();
  for (const e of entities) {
    if (e.type !== "tech" || !e.folder) continue;
    if (!novaPlacedFolders.has(e.id)) continue; // not Nova's placement — the origin is unknown, so stay quiet
    const { x, y, name } = e.folder;
    if ((typeof x === "number" && x < 0) || (typeof y === "number" && y < 0)) {
      problems.push({
        severity: "warning",
        rule: "tech_negative_position",
        entityType: e.type,
        entityId: e.id,
        file: e.file,
        message: `Technology "${e.id}" has a negative research-tree position (x=${x}, y=${y})${name ? ` in folder "${name}"` : ""}. HOI4 won't draw it ("Found no grid box") — use non-negative x/y.`,
      });
    }
  }

  // RULE 6 — a tech assigned to a research folder that isn't defined by the mod, its dependencies,
  // or the base game. It will have no tab/grid box and won't appear in the research screen. Only
  // applied when we actually know some folders (knownFolders non-empty), to avoid false positives.
  if (knownFolders && knownFolders.size > 0) {
    for (const e of entities) {
      if (e.type !== "tech" || !e.folder || !e.folder.name) continue;
      if (!knownFolders.has(e.folder.name)) {
        problems.push({
          severity: "warning",
          rule: "tech_unknown_folder",
          entityType: e.type,
          entityId: e.id,
          file: e.file,
          message: `Technology "${e.id}" is in research folder "${e.folder.name}", which isn't defined in this mod, its dependencies, or the base game — it won't appear in any research tab. Create the folder (Research → custom tab) or use an existing folder.`,
        });
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Public: build the index
// ---------------------------------------------------------------------------

/**
 * Build the unified index for a mod.
 * @param {string} modRoot absolute path to the mod
 * @param {{vanillaRoot?: string}} [opts]
 * @returns {{ entities, problems, counts, byId, incoming }}
 */
function buildModIndex(modRoot, opts = {}) {
  // #a-file-nova-could-not-read-scanned-as-clean — per scan, so a failure from an earlier run of a
  // long-lived server cannot be reported against this mod.
  resetReadFailures();
  const entities = [
    ...scanFocuses(modRoot),
    ...scanContinuousFocuses(modRoot),
    ...scanIdeas(modRoot),
    ...scanCharacters(modRoot),
    ...scanEvents(modRoot),
    ...scanDecisions(modRoot),
    ...scanTechnologies(modRoot),
    ...scanEquipment(modRoot),
    ...scanCountryHistory(modRoot),
  ];

  // display names
  const names = scanLocalization(modRoot);
  for (const e of entities) {
    e.displayName = names[e.id] || e.id;
    e.file = path.relative(modRoot, e.file).replace(/\\/g, "/");
  }

  // id sets + incoming reference map
  const modIds = buildIdSets(entities);
  // External (non-mod) content the mod may legitimately reference = vanilla + declared
  // dependencies (e.g. Millennium Dawn for an add-on). Merged into one set; references into it
  // are valid, but these entities are NOT the active mod's own, so they don't suppress the
  // mod's own orphan-spirit / missing-loc rules.
  // #replace-path — content the mod has unloaded is NOT something a reference may resolve against.
  // The two lists differ on purpose; see getDependencyIdSet. The caller supplies them because it is the
  // caller that reads descriptors — mod-index stays a pure function of its inputs rather than becoming a
  // fourth place that parses replace_path.
  const _vanillaSplit = getVanillaIdSet(opts.vanillaRoot, opts.vanillaReplacedFolders);
  const _depSplit = getDependencyIdSet(opts.dependencyRoots, opts.dependencyReplacedFolders);
  const vanillaIds = unionIdSets(_vanillaSplit.ids, _depSplit.ids);
  // What this mod's replace_path took away. NEVER consulted when resolving — only when explaining, so the
  // message can say "your descriptor unloaded it" instead of the flatly wrong "it does not exist".
  const unloadedIds = unionIdSets(_vanillaSplit.unloaded, _depSplit.unloaded);

  const modLocKeys = new Set(Object.keys(names));
  const vanillaLocKeys = new Set([
    ...getVanillaLocSet(opts.vanillaRoot),
    ...getDependencyLocSet(opts.dependencyRoots),
  ]);

  const incoming = {}; // `${type}:${id}` -> [{ from, fromType, context }]
  for (const e of entities) {
    for (const r of e.refs) {
      const key = `${r.type}:${r.id}`;
      if (!incoming[key]) incoming[key] = [];
      incoming[key].push({ from: e.id, fromType: e.type, context: r.context });
    }
  }

  // Research folders defined by the mod + its dependencies + vanilla. A tech in a folder not in
  // this set won't render in any research tab (it has no grid box / no tab).
  // #replace-path — these two are the same question as the id sets above, one layer along: a technology
  // folder or an `add_namespace` declaration in a folder the mod unloaded is not something the game knows
  // either. Each scanner reads exactly ONE directory (derived from source, not assumed), so suppressing a
  // whole root's contribution is precise here — no per-entity work needed.
  //
  // Same asymmetry as everywhere else tonight: vanilla answers to the whole chain's declarations because it
  // is the lowest layer; a dependency answers only to the ACTIVE mod's, because a dependency does not erase
  // itself and a sibling's order is a launcher playset choice no descriptor records.
  const _repVanilla = replacedFolderSet(opts.vanillaReplacedFolders);
  const _repDeps = replacedFolderSet(opts.dependencyReplacedFolders);
  const _depRootList = Array.isArray(opts.dependencyRoots) ? opts.dependencyRoots : [];
  const _fromBase = (folder, scan) => [
    ...(_repVanilla.has(folder) ? [] : scan(opts.vanillaRoot)),
    ..._depRootList.flatMap((r) => (_repDeps.has(folder) ? [] : [...scan(r)])),
  ];

  const knownFolders = new Set([
    ...getTechnologyFolders(modRoot),
    ..._fromBase("common/technology_tags", getTechnologyFolders),
  ]);

  // Event namespaces declared by the mod + its dependencies + vanilla (global, case-insensitive).
  // A mod event whose id namespace isn't in here was never `add_namespace`-d, so it can't register.
  const knownNamespaces = new Set([
    ...scanNamespaces(modRoot),
    ..._fromBase("events", scanNamespaces),
  ]);
  // The mirror of `unloadedIds`, for the message only: namespaces that WOULD have been known had this mod
  // not replaced events/. Never consulted when deciding whether to report — only when explaining.
  const unloadedNamespaces = new Set();
  if (_repVanilla.has("events") || _repDeps.has("events")) {
    for (const src of [
      ...(_repVanilla.has("events") && opts.vanillaRoot ? [opts.vanillaRoot] : []),
      ...(_repDeps.has("events") ? _depRootList : []),
    ]) {
      for (const ns of scanNamespaces(src)) if (!knownNamespaces.has(ns)) unloadedNamespaces.add(ns);
    }
  }

  // #a-nameless-advisor-is-named-by-its-trait / #a-hidden-idea-needs-no-name — the idea categories the game loads, the mod's
  // own first; a layer whose common/idea_tags the chain replaced contributes nothing, as in _fromBase.
  const ideaCategories = readIdeaCategories([
    modRoot,
    ...(_repDeps.has("common/idea_tags") ? [] : _depRootList),
    ...(_repVanilla.has("common/idea_tags") ? [] : [opts.vanillaRoot]),
  ]);
  // #a-trait-names-an-advisor-only-if-the-game-loads-it — the same layers, for common/country_leader.
  const leaderTraits = readLeaderTraits([
    modRoot,
    ...(_repDeps.has("common/country_leader") ? [] : _depRootList),
    ...(_repVanilla.has("common/country_leader") ? [] : [opts.vanillaRoot]),
  ]);

  const dependencyGrantedIdeas = getDependencyGrantedIdeaSet(opts.dependencyRoots);
  const problems = validate(entities, modIds, vanillaIds, modLocKeys, vanillaLocKeys, knownFolders, knownNamespaces, dependencyGrantedIdeas,
    // unloadedIds rides in `roots` for the same reason everything else does: validate() takes its extras in
    // this bag rather than as bare bindings. It explains a failed reference; it never resolves one.
    { modRoot, vanillaRoot: opts.vanillaRoot, dependencyRoots: opts.dependencyRoots, unloadedIds, unloadedNamespaces, ideaCategories, leaderTraits });
  // Loc-file BOM check (mod only — vanilla's files are correct and there are thousands of them).
  if (!looksLikeVanilla(modRoot)) {
    problems.push(...scanLocBomIssues(modRoot));
  }

  // #a-file-nova-could-not-read-scanned-as-clean — say what this scan could NOT look at.
  //
  // Every other rule here reports something wrong with the mod. This one reports something wrong with the
  // SCAN, which is why it names the read error: a file Nova could not open was not checked, so "no
  // problems" is not a statement about it. HOI4 opens files in its own process and may well read it fine,
  // so this is a warning about the scan's coverage rather than a claim that the mod is broken.
  for (const { file, error } of takeReadFailures()) {
    const rel = path.relative(modRoot, file).replace(/\\/g, "/");
    if (rel.startsWith("..")) continue;   // outside this mod (vanilla or a dependency) — not the user's file
    problems.push({
      severity: "warning",
      rule: "file_unreadable",
      entityType: "file",
      entityId: rel.split("/").pop(),
      file: rel,
      message: `Nova couldn't open "${rel}" (${error}), so nothing in it was checked — a clean result here does ` +
        `not cover that file. It is usually another program holding it: close Hearts of Iron IV and any editor ` +
        `that has it open, then scan again.`,
    });
  }

  const counts = {};
  // Advisor idea_tokens are indexed as `idea` entities so add_ideas references resolve, but they are
  // reference TARGETS derived from a character, not separate overview content — exclude them from the
  // spirit/character/idea overview counts (the character that owns the token is already counted).
  for (const e of entities) { if (e.type === "idea" && e.advisorToken) continue; counts[e.type] = (counts[e.type] || 0) + 1; }
  // Characters are indexed as `idea` entities (with fromCharacter) so the dependency/orphan logic
  // treats them uniformly. Split them back out for the contents overview so "Spirits" means genuine
  // national spirits and "Characters" is reported on its own — otherwise the spirit count is inflated.
  counts.character = entities.filter(e => e.type === "idea" && e.fromCharacter && !e.advisorToken).length;
  counts.spirit = (counts.idea || 0) - counts.character;
  counts.problems = problems.length;
  counts.errors = problems.filter(p => p.severity === "error").length;
  counts.warnings = problems.filter(p => p.severity === "warning").length;

  return { entities, problems, counts, incoming };
}

module.exports = {
  buildModIndex,
  extractRefs,
  // exported for tests: the walker filters with e.isFile(), so the only way a read fails is a lock or a
  // permission change BETWEEN the walk and the read — a real race (launching HOI4 mid-scan, an antivirus
  // quarantine) that cannot be staged from a test through buildModIndex. The mechanism is proven here
  // instead. #a-file-nova-could-not-read-scanned-as-clean
  readSafe,
  takeReadFailures,
  resetReadFailures,
  scanLocalization, // exported so the replace/-folder precedence can be tested directly
  scanFocuses,
  scanIdeas,
  scanEvents,
  scanDecisions,
  scanTechnologies,
  scanEquipment,
  scanCountryHistory,
  extractHistoryStartingIdeas,
  clearVanillaCache,
  clearCachesForAGameChange, // #a-cache-holds-the-old-game
  isHoi4GameFolder,          // #nova-does-not-find-the-game — what makes a folder the game's (server.js asks it everywhere)
  HOI4_GAME_MARKERS,
  BROKEN_REFERENCE_SKIPPED_CONTEXTS, // RULE 2's own choices — the reference test classifies by them and pins them
  BROKEN_REFERENCE_ALSO_RESOLVES,
  getDependencyIdSet,
  getDependencyLocSet,
  // low-level (exported for tests)
  topLevelBlocks,
  canBeLocalizationKey, // #loc-key-must-be-ascii — the one write-side test of a loc key; server.js imports it from here
  findMatchingBrace,
  extractTechGraphRefs,
};
