// ⛔ #reference-lookup-is-case-insensitive + #runtime-built-id-guard-not-adopted
//
// broken_reference required an EXACT-case match. On 2026-09-03 that was recorded as 265 references across the
// installed corpus reported broken while an entity of the same type existed differing only in case — 9 of
// vanilla's 20 and 103 of Millennium Dawn's 160 — and the fix as taking broken_reference across the corpus from
// 1,054 to 689, and vanilla's from 34 to 9. Those figures are a record, not a measurement this file repeats: the
// game build they were taken on is gone, and the two vanilla totals (20 and 34) do not agree with each other.
// The evidence that HOI4 resolves a reference differing only in case is the shipping game itself:
//
//   • Man the Guns does `add_idea = ENG_guided_by_britain_RAJ_2`, then in the SAME FILE checks
//     `has_idea = ENG_guided_by_britain_raj_2` and `remove_ideas = ENG_guided_by_britain_raj_2`. The idea is
//     defined as `..._raj_2`. Case-sensitive lookup would make the add resolve to nothing and the
//     Raj-autonomy mechanic would be dead in shipped DLC.
//   • No Step Back defines `NSB_news.200` and `nsb_news.2`, and fires them as `nsb_news.200` and `NSB_news.2`.
//   • Portugal does `add_ideas = por_portuguese_legion` for `POR_portuguese_legion`.
//
// …and this codebase had already established it once: the event_namespace rule records that all 6,577
// vanilla event definitions resolve "once matching is global + case-insensitive". The wiki does not state
// the rule either way, so this leans on what vanilla demonstrably does rather than on inference. That evidence
// is about ideas and events only. Nova's lookup is one function for every type, and this file holds it for a
// focus too; whether the ENGINE resolves a focus, a tech, a decision, an equipment or a focus_tree
// case-insensitively is not established.
//
// Separately: `add_ideas = CZE_trade_agreement_[CZE_idea_country]` builds its id at runtime. The
// add_timed_idea handler already skipped a value followed by `[`, with a comment giving exactly this
// reason — the plain `add_ideas` handler just above it did not. Vanilla's MUN_Czechoslovakia.txt does
// it, and so the literal prefix was reported as a missing idea.
//
// ⚠️ The vanilla firings left after that fix were read by hand and were real — including
// `complete_national_focus = TUR_widespread_illiteracy_idea`, which the rule's own comment cites as a
// genuine type mix-up. Suppressing a class must not suppress the class next to it, and this did not.
//
// ⛔ #a-real-case-pinned-by-name-left-with-the-patch — MEASURED 2026-11-04. That Turkey line is no longer in
// the game, and "...and the documented real one survives", which named it, fails on the installed game with the
// mod-index.js of every commit tried (2026-11-04, and all four again on 2026-11-13): 21289552, which wrote this
// test; b1cda5e2 of 10-23, whose message records the full suite at 1521 of 1525 that day and names the four that
// failed, this test not among them; 2a6d13c4; d0fd200d. Nova did not change: the four commits' mod-index.js give
// the install the same 7 vanilla firings the current one does, and none of them is that one (2026-11-13).
// The GAME did. Steam's content logs record BuildID 25205862 -> 26132856 at 2026-10-27 19:20 (1,482 files
// updated; 1.19.4.1, BuildID 26282552, followed on 10-30), and history/countries/TUR - Turkey.txt carries that
// mtime. The file as it was before survives in 39 of Nova's test worlds in the Documents mod folder (written
// 09-23 to 09-26, one sha1 between them).
// Past the capital line those worlds rewrite, it differs from today's in line 274 alone: that read
// `complete_national_focus = TUR_widespread_illiteracy_idea`, and now reads
// `complete_national_focus = TUR_millet_mektebi_focus`. The idea's grant in the `add_ideas` block (line 174)
// was there before the update and is there after it. Put line 274 back as it was, in a copy of the common,
// events and history folders, and the old test passes 14/14 again; on an unchanged copy it fails 1/14 (both
// again on 2026-11-13, with each of the four commits' mod-index.js).
// Since then 1.19.4.2 (BuildID 26409260, 2026-11-05) and 1.19.5.0 (BuildID 26479645, 2026-11-12) updated 4 and
// 14 files, none under common/, events/ or history/ (Steam's content log and the files' mtimes, 2026-11-13).
//
// The installed game ships no type mix-up that classifyRefs (below) can find (2026-11-04 and 2026-11-13), so no
// vanilla id can take that check's place. And one name typed into the case-only list had been dead from the
// start: the second bullet above said the reverse for .200 until 2026-11-04, yet events/NSB_NewsEvents.txt,
// which defines `NSB_news.200`, is unchanged since 2026-06-30 — so the id an exact-case lookup reports is
// `nsb_news.200`, and "NSB_news.200 is not reported" could not fail. With the case-insensitive lookup backed
// out, that list caught the other four names and never that one.
//
// So the real-install half names no vanilla id it expects. classifyRefs() derives, from the entities and
// references the index itself read out of the installed game, which references differ only in case, which
// are type mix-ups and which no type defines in any case. Every mix-up must fire AND be named; every missing
// one must fire; every case-only one must resolve; and the rule may report nothing else there. When the
// classifier finds none of a class there, that check prints SKIP and says it did not run, instead of failing on
// the game or passing on nothing.
//
// ⛔ #a-test-that-reads-the-rule-moves-with-the-rule — REVIEWED 2026-11-04. Two reviews of that version found
// what deriving every expectation from the index let through, each shown by mutations of mod-index.js that
// changed what RULE 2 reports on a real mod and still passed this file, on the install AND on a copy with the
// Turkey line restored:
//   • every fixture ran with no base game and no dependency, so the half of the lookup that resolves INTO the
//     layers below never ran: dropping vanilla's case-insensitive lookup, letting the lowercase cache lose its
//     mod/vanilla tag, dropping anyType's vanilla loops — each passed. A dependency takes the same path;
//   • classifyRefs read RULE 2's two constants, so a change to either moved the rule and the expectation
//     together: skipping remove_ideas, focus_arg, swap_add_idea or set_technology, letting a focus resolve
//     against a focus_tree, an idea against a focus or a tech against an equipment — each passed. So did
//     judging recruit_character after all, with a character allowed to resolve as an idea, which took vanilla
//     from 7 firings to 35. The 28 extra were characters the game DEFINES, whose ids extractRefs read short
//     (#recruit-character-id-read-short reads them whole now, and #character-key-read-by-its-tail their
//     DEFINITIONS: judged that way today, all 5,371 resolve and vanilla stays at 7 — measured 2026-11-15). Before
//     mh-unicode's #character-key-read-by-its-tail, with the recruits read whole, 25 still fired (32 firings in all,
//     2026-11-13): 23 of the 28, and two CHL advisors whose cut recruit had matched their cut idea_token by
//     accident — all 25 because their DEFINITIONS were read short;
//   • so an id read short passes as "missing": the rule and the classifier read the same short id. Those 28 did,
//     and with add_ideas' `[` guard gone the install half took `CZE_trade_agreement_` for missing too (a fixture
//     caught that one);
//   • the fixtures held three of the contexts RULE 2 judges, so references of one type, or from one kind of
//     entity, or in a context the extractor stopped reading, could go unjudged with nothing here failing.
// ⛔ #a-dropped-definition-moves-the-rule-and-the-classifier-together — REVIEWED AGAIN 2026-11-04 to 2026-11-11, by
// a coverage, a facts and a product-change review of the version the bullets above describe and of the
// recruit_character fix (#recruit-character-id-read-short). Mutations of mod-index.js that changed RULE 2 on an
// installed mod still passed this file:
//   • a definition the index DROPS moves the rule and the classifier together, so "nothing else" held on the
//     install itself: an unclosed block no longer yielded (439 firings there), shared_focus no longer scanned
//     (92), duplicate_archetypes no longer indexed (106) — the review's counts, measured again on 2026-11-13;
//   • the layers below never met the replace_path split Mod Health passes them, nor a tech, a decision or an
//     equipment: giving a dependency the whole chain's replace_path took a Millennium Dawn add-on from 0 to 1,401
//     errors, and dropping the base game's decisions or equipment added false ones on The Road to 56 (the
//     review's census of the game and the 14 installed Workshop items, 2026-11-10);
//   • with no game installed, judging recruit_character with a character allowed to resolve as an idea: the
//     first fixture recruited only a character it defines;
//   • forms more regular than the game's: every event block put its `id` first, the set_technology block held
//     one tech and the prerequisite block one focus, the two entities missing one id differed in host type AND
//     file, no character carried a reference, and the only type mix-ups were an idea and a focus taken for each
//     other and a focus_tree for a focus.
// Now:
//   • the third fixture puts a stand-in base game under the mod as vanillaRoot and a dependency as
//     dependencyRoots. The mod resolves into each layer by case alone for an idea, an event and a focus, and into
//     itself for a focus (the first fixture holds the mod's own idea and event); a type mix-up in the same case
//     (vanilla's Turkey shape) and across a case difference, into each layer, and one of each type pair RULE 2
//     names on the installed corpus, each named; and an id that is only the head of a real one, which must fire
//     as missing;
//   • the same fixture holds a missing reference in every context RULE 2 judges, in the forms the extractor
//     reads (all five event kinds, each in one of its two forms: country_event and unit_leader_event bare, the
//     other three as a block; an event block whose id comes after another key; both keys that make a focus link;
//     a prerequisite block of two focuses; a set_technology block of two techs), of every reference type, from
//     every kind of entity that carries references, a character's advisor included — and one id
//     missing from three entities, two of one kind in one file. Each must fire, as an error, and nothing else
//     may. It also defines what a scanner can drop while its references still read: an equipment through
//     duplicate_archetypes and the numbered variant the game derives from it, the entry in a file of its own and
//     its source in another, as the game writes all 34 of its own; a focus in a shared_focus block; an idea in a
//     file whose last brace is missing; none of their references may fire. And for an idea, a tech, an equipment,
//     an event and a focus, a definition written inside a comment, whose reference must fire as missing, and a
//     brace written in a comment ahead of a real definition, whose reference must resolve. On the installed game,
//     every context, host and reference type its judged references use must be among those this fixture fires;
//   • a fourth fixture indexes a mod and a sibling over a base game and a shared dependency, with the two
//     replace_path lists TYPED IN as computeModIndexPayload builds them (#replace-path-sibling-order): the base
//     game gets every replace_path the chain declares, the dependency only the active mod's. A tech, a decision
//     and an equipment resolve into both layers (with the third fixture's idea, event and focus, six of the seven
//     reference types RULE 2 judges); the dependency's replace_path unloads the base game's folder and not its
//     own; the active mod's unloads its folder in both layers, while the sibling, which declares none, resolves
//     into both; each unloaded finding says replace_path, and every finding is an error;
//   • both constants are PINNED BY VALUE below, each entry with its reason. classifyRefs() still reads the
//     exported ones, so the rule and the classifier cannot disagree; the pin is what makes changing either a
//     deliberate edit of this file;
//   • every reference the classifier calls broken on the installed game, and every one the rule reports there,
//     must stand in its entity's own file as a WHOLE token, not as the head of a longer one. HOI4 ids carry `.`,
//     `-` and accented letters (`AUS_arthur_seyss-inquart`, `COS_josé_maría_barahona`);
//   • no reference the classifier calls missing on the installed game may have a definition site in the game's
//     own script, found by definitionSites() (below), a brace walk that shares no code with the index's
//     scanners: a definition the index drops or reads short makes its references "missing" to the rule and the
//     classifier alike, and this reader still finds it wherever the script writes it. An id the game DERIVES
//     (duplicate_archetypes' numbered variants) is written nowhere, so it has no site; the third fixture holds it,
//     with the entry and its source in two files as the game writes them.
//
// What this file does NOT guard, so that nobody reads more into a pass than it holds:
//   • with no game installed, a definition the index reads SHORT, or drops in a shape the fixtures above do not
//     write: the definition-site check and the whole-token check read the installed game only. On the install,
//     narrow scanFocuses' id class back to f7ec49ea^'s [A-Za-z_][A-Za-z0-9_]* and vanilla goes from 7 firings to
//     48, which fails the definition-site check here; test-focus-id-not-truncated.js (6 checks) and
//     test-a-hyphenated-id-is-not-a-broken-reference.js (2) fail on it, on checks that read no game (2026-11-13).
//     Character KEYS have such a guard now: topLevelBlocks reads them whole (#character-key-read-by-its-tail), and
//     test-a-character-key-is-read-whole.js holds the index to every key the base game's character files spell.
//     An advisor's idea_token has none: scanCharacters still reads it with the ASCII class, so vanilla's
//     events/TOA_Chile.txt `remove_ideas = CHL_jorge_gonzález_von_marées`, read as `CHL_jorge_gonz`, resolves
//     against the token cut at the same letter, and widening the reference side alone would turn The Road to 56's
//     `NIC_anastasio_somoza_garcía_advisor` into a false finding (measured 2026-11-15) — both sides move together
//     or neither does (#focus-id-truncated). Here, widen the idea_token reader alone and this file fails on the
//     install, on the whole-token check (TOA_Chile's cut `CHL_jorge_gonz` then matches no idea_token), and passes
//     with no game. Widen the bare remove_ideas reader alone and it passes everywhere: the whole id then resolves
//     against the character's own key, which topLevelBlocks reads whole (2026-11-19);
//   • a decision or a character scanner that stops stripping comments. The comment fixtures cover the scanners of
//     ideas, techs, equipment, events and focuses; with either of the other two reading comments this file passes
//     (2026-11-19), and the 2026-11-18 review's census found neither changes what Mod Health reports on an
//     installed mod;
//   • what extractRefs never reads, among them (each counted as `key =` outside comments in the installed game's
//     common/, events/ and history/, 2026-11-13): has_completed_focus (16,901), has_idea (7,414), has_tech
//     (3,869), unlock_national_focus (354), activate_targeted_decision (191), has_focus_tree (111), has_decision
//     (107), modify_timed_idea (16), remove_decision (9), the idea a swap_ideas removes (2,294 blocks) and
//     add_tech_bonus' technology. Neither the rule nor this file judges those. Every pattern it does read with,
//     each event kind and both keys that make a focus link, has a missing reference in the third fixture;
//   • case-only resolution for a tech, a decision, an equipment or a focus_tree. The fixtures hold Nova's lookup
//     for an idea, an event and a focus, and narrowing it for the other four passes;
//   • an event kind read in its other form. The third fixture writes each kind in one of its two forms, so a
//     reader that stopped seeing country_event's block form, or news_event's bare form, passes here;
//     test-event-reference-forms.js fails on either (2026-11-19);
//   • a load_focus_tree that resolves into the base game or a dependency. No reference here names a layer's tree,
//     and dropping either layer's focus trees passes (2026-11-19);
//   • whether one entity naming one missing id in two contexts is reported once or twice: nothing decides it,
//     and reporting it once per entity passes (the coverage review's N02);
//   • how computeModIndexPayload in server.js builds the two replace_path lists the fourth fixture passes. The
//     fixture types them in and this file never loads server.js, so swapping the two there, giving the
//     dependencies the chain's list, or giving the base game only the active mod's, passes here. No other
//     test-*.js holds it either: of the three a search of the tracked tests finds that could reach it, this file
//     is one; test-mod-health-does-not-resolve-against-unloaded-content.js passes one list to both options, checks
//     only that server.js names both keys, and passes each of those three changes; and
//     test-a-dependency-that-does-not-resolve-says-so.js writes its replace_path lines only into the launcher .mod,
//     which getModReplacePaths does not read, so both lists are empty there (2026-11-19);
//   • the rest of RULE 2's replace_path variant: that it offers no auto-fix, and a base game's characters, which
//     no layer fixture defines (test-mod-health-does-not-resolve-against-unloaded-content.js holds both); and
//     its wording, which tells a sibling whose own descriptor declares no replace_path that "this mod's
//     descriptor declares a replace_path" (seen 2026-11-13 in the fourth fixture; Mod Health's text, not
//     changed here).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildModIndex, extractRefs, isHoi4GameFolder, BROKEN_REFERENCE_SKIPPED_CONTEXTS, BROKEN_REFERENCE_ALSO_RESOLVES,
} = require("./mod-index.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 190) : JSON.stringify(detail).slice(0, 190))));
  if (!ok) fails.push(label);
};
// A check that could not run says so on a line of its own that begins with SKIP. run-tests.js counts those in
// a passing file and names them in its summary, so a check with nothing to look at cannot read as a pass.
const skip = (label) => { skips++; console.log("  SKIP " + label); };

// RULE 2's two choices, PINNED BY VALUE (#a-test-that-reads-the-rule-moves-with-the-rule). classifyRefs() reads the
// exported constants, so it can never disagree with the rule about them, and for exactly that reason it cannot
// notice when they change. These pins can. Each entry carries the reason it is there: changing what RULE 2 skips,
// or what else a reference may resolve against, means editing this table and its reason. The installed game's
// numbers were measured 2026-11-04 on 1.19.4.1 and again 2026-11-13 on 1.19.5.0, and came out the same; the
// Workshop's 325 by the facts review on 2026-11-11, over the 14 Workshop items installed then; on 2026-11-13 none
// had updated since 2026-11-08.
const PINNED_SKIPPED_CONTEXTS = new Map([
  ["add_ideas_prefix", "the literal head of an id built at runtime is not an id and never resolves. "
    + "`add_ideas = CZE_trade_agreement_[CZE_idea_country]` (vanilla's events/MUN_Czechoslovakia.txt) records "
    + "`CZE_trade_agreement_`, kept only so the orphan rule sees the grant. The installed game carries 2."],
  ["recruit_character", "RULE 4 (recruit_character_misplaced) judges it. A character is indexed AS an idea, so "
    + "judged here the installed game's 5,371 recruits would all read as type mix-ups (measured 2026-11-15). Until "
    + "topLevelBlocks read a character key whole, 25 of them read as missing ids instead: characters it defines "
    + "whose key carries an accented letter, indexed under its tail (COS_jos\u00e9_mar\u00eda_barahona as a_barahona)."],
]);
const PINNED_ALSO_RESOLVES = new Map([
  ["focus_tree", new Map([["focus", "a load_focus_tree may name a focus of the same id. Inherited from the first "
    + "index (ef73e93e, 2026-05-29), which gives no reason; none of the installed game's 47 load_focus_tree "
    + "references, nor any of the 325 in the installed Workshop mods, resolves only through it."]])],
]);

// How each reference SHOULD resolve, derived from what the index itself read, so the rule's verdicts can be held
// against content nobody typed in:
//   • a reference resolves against entities of its OWN type, exact case first, then case-insensitively — and
//     against any type BROKEN_REFERENCE_ALSO_RESOLVES adds for it (a load_focus_tree may name a focus);
//   • what none of those defines in any case is a TYPE MIX-UP when another type defines it, in any case, and
//     MISSING when no type does.
// It reads RULE 2's two constants from mod-index.js rather than restating them, so it cannot disagree with the
// rule about them — and so it cannot see them change: a context added to the skip list leaves the rule and this
// classifier agreeing on less. The pins above catch that. This catches the rule misjudging what it does judge.
function classifyRefs(entities) {
  const exact = new Map(), lower = new Map();
  for (const e of entities) {
    if (!exact.has(e.type)) { exact.set(e.type, new Set()); lower.set(e.type, new Set()); }
    exact.get(e.type).add(e.id);
    lower.get(e.type).add(String(e.id).toLowerCase());
  }
  const has = (bags, type, id) => !!bags.get(type) && bags.get(type).has(id);
  const out = { caseOnly: [], mixup: [], missing: [] };
  for (const e of entities) {
    for (const r of e.refs || []) {
      if (BROKEN_REFERENCE_SKIPPED_CONTEXTS.has(r.context)) continue;
      if (has(exact, r.type, r.id)) continue;
      const lo = String(r.id).toLowerCase();
      const ref = { entityType: e.type, entityId: e.id, file: e.file, context: r.context, type: r.type, id: r.id };
      if (has(lower, r.type, lo)) { out.caseOnly.push(ref); continue; }
      if ((BROKEN_REFERENCE_ALSO_RESOLVES.get(r.type) || []).some((t) => has(lower, t, lo))) continue;
      const definedAs = [...lower.keys()].filter((t) => lower.get(t).has(lo));
      if (definedAs.length) out.mixup.push(Object.assign(ref, { definedAs }));
      else out.missing.push(ref);
    }
  }
  return out;
}

// A token in HOI4 script runs until whitespace, an operator, a quote or a comment mark. An id the extractor read is
// WHOLE where it stands with one of those, or the file's edge, on both sides. Where the next character would carry
// it on (`-`, `.`, an accented letter, `[`), what was read is only the head of a longer id, and a "missing" verdict
// on it says nothing about the id the file actually names.
const TOKEN_END = /[\s={}<>!?"#]/;
const endsToken = (ch) => ch === undefined || TOKEN_END.test(ch);
function standsWhole(text, id) {
  if (!id) return false;
  for (let i = text.indexOf(id); i !== -1; i = text.indexOf(id, i + 1)) {
    if (endsToken(i === 0 ? undefined : text[i - 1]) && endsToken(text[i + id.length])) return true;
  }
  return false;
}
// Comments go the way extractRefs strips them (`#` to the end of the line), so a whole id in a comment cannot vouch
// for a short one in the code.
const stripComments = (s) => String(s || "").replace(/#[^\n\r]*/g, "");

// #a-dropped-definition-moves-the-rule-and-the-classifier-together — classifyRefs counts what the index's scanners
// read, so a scanner that DROPS a definition (an unclosed block, a folder it stopped reading, a form it stopped
// matching) or reads it SHORT makes the rule and the classifier call every reference to it missing together, and
// "nothing else" still holds. So the install half also asks a reader that shares no code with those scanners where
// the game's own script defines each id. A brace walk over common/ and events/, recording:
//   • every `KEY = {` block key at depth 1 or more under common/. Ideas, techs, equipment, decisions, characters and
//     duplicate_archetypes entries all have this shape, and so does much that defines nothing, which only makes the
//     walk generous: it can call an id defined that is not, never miss one written in that shape;
//   • `id = X` directly inside a focus, shared_focus, joint_focus or focus_tree block under common/;
//   • `idea_token = X` under common/ (an advisor's idea);
//   • `id = X` directly inside a top-level event block of any kind under events/.
// Ids are compared lowercased, as the classifier's "in any case" is. What no walk can see is an id the game DERIVES
// (duplicate_archetypes' numbered variants), which the third fixture holds.
const ID_BLOCKS = new Set(["focus", "shared_focus", "joint_focus", "focus_tree"]);
const EVENT_BLOCKS = new Set(["country_event", "news_event", "state_event", "unit_leader_event", "operative_leader_event"]);
function definitionSites(root) {
  const sites = new Map();
  const add = (id, rel) => { const k = String(id).toLowerCase(); if (!sites.has(k)) sites.set(k, rel); };
  const walkFile = (abs, rel, inCommon) => {
    let s = "";
    try { s = fs.readFileSync(abs, "utf8"); } catch (_) { return; }
    // Comments out the way extractRefs strips them, then quoted strings, so a brace inside one is text. \s takes a
    // byte-order mark for whitespace too, so one glued to the first key does not hide it.
    const toks = stripComments(s).replace(/"[^"\r\n]*"/g, " _q_ ").match(/[{}=]|[^\s{}=]+/g) || [];
    const stack = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === "{") { stack.push(""); continue; }
      if (t === "}") { stack.pop(); continue; }
      if (toks[i + 1] !== "=" || toks[i + 2] === undefined || toks[i + 2] === "}") continue;
      if (toks[i + 2] === "{") {
        if (inCommon && stack.length) add(t, rel);
        stack.push(t);
        i += 2;
        continue;
      }
      const top = stack[stack.length - 1];
      if (t === "id" && (inCommon ? ID_BLOCKS.has(top) : stack.length === 1 && EVENT_BLOCKS.has(top))) add(toks[i + 2], rel);
      else if (t === "idea_token" && inCommon) add(toks[i + 2], rel);
      i += 2;
    }
  };
  const walkDir = (abs, rel, inCommon) => {
    let es = [];
    try { es = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
    for (const d of es) {
      if (d.isDirectory()) walkDir(path.join(abs, d.name), rel + "/" + d.name, inCommon);
      else if (/\.txt$/i.test(d.name)) walkFile(path.join(abs, d.name), rel + "/" + d.name, inCommon);
    }
  };
  walkDir(path.join(root, "common"), "common", true);
  walkDir(path.join(root, "events"), "events", false);
  return sites;
}

const scratch = [];
const mk = (prefix, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  }
  return root;
};

try {
  console.log("\n-- RULE 2's own choices, pinned by value --");
  {
    const now = [...BROKEN_REFERENCE_SKIPPED_CONTEXTS].sort();
    const pinned = [...PINNED_SKIPPED_CONTEXTS.keys()].sort();
    rec("RULE 2 skips exactly the contexts pinned here (" + pinned.join(", ") + ")",
      JSON.stringify(now) === JSON.stringify(pinned), { now, pinned });
    const flat = (m) => [...m].map(([t, l]) => t + " -> " + [...(l instanceof Map ? l.keys() : l)].sort().join(", ")).sort();
    const alsoNow = flat(BROKEN_REFERENCE_ALSO_RESOLVES), alsoPinned = flat(PINNED_ALSO_RESOLVES);
    rec("...and lets a reference resolve against another type only where pinned here (" + alsoPinned.join("; ") + ")",
      JSON.stringify(alsoNow) === JSON.stringify(alsoPinned), { now: alsoNow, pinned: alsoPinned });
    for (const [ctx, why] of PINNED_SKIPPED_CONTEXTS) console.log("         rule 2 does not judge " + ctx + ": " + why);
    for (const [t, m] of PINNED_ALSO_RESOLVES) for (const [o, why] of m) console.log("         " + t + " also resolves as " + o + ": " + why);
  }

  console.log("\n-- the whole-token check the install half relies on tells a cut id from a whole one --");
  rec("an id cut at a hyphen is not whole", !standsWhole("recruit_character = AUS_arthur_seyss-inquart\n", "AUS_arthur_seyss"));
  rec("...nor one cut at an accented letter", !standsWhole("recruit_character = COS_jos\u00e9_mar\u00eda_barahona\n", "COS_jos"));
  rec("...nor the literal head of an id built at runtime",
    !standsWhole("add_ideas = CZE_trade_agreement_[CZE_idea_country]\n", "CZE_trade_agreement_"));
  rec("...while one between whitespace, braces, operators or the file's edge is",
    standsWhole("add_ideas = { POR_a POR_b }", "POR_a") && standsWhole("set_technology={x_tech=1}", "x_tech")
      && standsWhole("NSB_news.201", "NSB_news.201"));

  console.log("\n-- the definition-site reader the install half relies on finds definitions, and only definitions --");
  {
    // Every shape definitionSites() claims to read, next to a reference of each kind it must not take for one. The
    // events file opens with a byte-order mark glued to its first event, as files saved by some editors do.
    const O = mk("nova-refsites-", {
      [path.join("common", "ideas", "o.txt")]: "ideas = {\n\tcountry = {\n\t\tO_idea = {\n\t\t\ton_add = { add_ideas = O_granted_idea }\n\t\t}\n\t}\n}\n",
      [path.join("common", "characters", "o.txt")]: "characters = {\n\tO_character = {\n\t\tadvisor = {\n\t\t\tslot = political_advisor\n"
        + "\t\t\tidea_token = O_advisor_token\n\t\t}\n\t}\n}\n",
      [path.join("common", "technologies", "o.txt")]: "technologies = {\n\tO_tech = {\n\t\tpath = { leads_to_tech = O_next_tech }\n"
        + "\t\tenable_equipments = { O_enabled_equipment }\n\t}\n}\n",
      [path.join("common", "units", "equipment", "o.txt")]: "equipments = {\n\tO_equipment = { year = 1936 }\n}\n"
        + "duplicate_archetypes = {\n\tO_dup_equipment = { archetype = O_equipment }\n}\n",
      [path.join("common", "decisions", "o.txt")]: "o_category = {\n\tO_decision = {\n\t\tcomplete_effect = {\n"
        + "\t\t\tactivate_decision = O_activated_decision\n\t\t\tset_technology = { O_set_tech = 1 }\n"
        + "\t\t\tcountry_event = { id = o.3 }\n\t\t}\n\t}\n}\n",
      [path.join("common", "national_focus", "o.txt")]: "focus_tree = {\n\tid = O_tree\n\tfocus = {\n\t\tid = O_focus\n"
        + "\t\tprerequisite = { focus = O_prerequisite_focus }\n\t}\n}\nshared_focus = {\n\tid = O_shared_focus\n}\n",
      [path.join("events", "o.txt")]: "\uFEFFcountry_event = {\n\tid = o.1\n\toption = {\n\t\tname = o.1.a\n\t\tcountry_event = o.2\n"
        + "\t\tnews_event = { id = o.4 days = 1 }\n\t}\n}\nadd_namespace = o\nnews_event = { days = 1 id = o.5 }\n",
    });
    const sites = definitionSites(O);
    const DEFINED = ["O_idea", "O_character", "O_advisor_token", "O_tech", "O_equipment", "O_dup_equipment", "O_decision",
      "O_tree", "O_focus", "O_shared_focus", "o.1", "o.5"];
    const USED = ["O_granted_idea", "O_next_tech", "O_enabled_equipment", "O_activated_decision", "O_set_tech", "o.3",
      "O_prerequisite_focus", "o.2", "o.4"];
    const unseen = DEFINED.filter((id) => !sites.has(id.toLowerCase()));
    rec("it finds every definition shape it relies on: an idea, a character and its advisor's idea, a tech, an equipment "
      + "and a duplicate_archetypes entry, a decision, a focus tree, a focus, a shared focus, a top-level event either way",
      unseen.length === 0, unseen);
    const taken = USED.filter((id) => sites.has(id.toLowerCase()));
    rec("...and takes no reference for one: a grant, a tech link, an enabled equipment, an activated decision, a "
      + "set_technology entry, a prerequisite, an event fired by id or in block form",
      taken.length === 0, taken.map((id) => id + " in " + sites.get(id.toLowerCase())));
  }

  console.log("\n-- a reference differing only in case resolves, the way the engine resolves it --");
  const root = mk("nova-refcase-", {
    "descriptor.mod": 'name="ref case"\n',
    [path.join("common", "ideas", "i.txt")]: "ideas = {\n\tcountry = {\n"
      + "\t\tPOR_portuguese_legion = { removal_cost = -1 }\n"
      + "\t\tCZE_trade_agreement_to_HUN = { removal_cost = -1 }\n"
      + "\t}\n}\n",
    [path.join("common", "characters", "c.txt")]: "characters = {\n\tPOR_a_general = {\n\t\tname = POR_a_general\n\t}\n}\n",
    [path.join("events", "e.txt")]: "add_namespace = nsb_news\n"
      + "news_event = { id = nsb_news.200 }\n"
      + "country_event = {\n\tid = nsb_news.9\n\toption = {\n\t\tname = o\n"
      // referenced in the OTHER case — vanilla does this
      + "\t\tnews_event = { id = NSB_news.200 days = 1 }\n"
      + "\t\tadd_ideas = por_portuguese_legion\n"
      // runtime-built: the literal prefix is not an id
      + "\t\tadd_ideas = CZE_trade_agreement_[CZE_idea_country]\n"
      // a recruited character: RULE 4 judges where one may be recruited, and RULE 2 must leave it alone. A
      // character is indexed AS an idea, so judged as a reference the installed game's 5,371 recruits would all
      // read as type mix-ups (measured 2026-11-15; see PINNED_SKIPPED_CONTEXTS).
      + "\t\trecruit_character = POR_a_general\n"
      // ...and one the mod does NOT define. Judge recruit_character with a character allowed to resolve as an
      // idea, and the defined one above still resolves, so only this one shows the context is no longer skipped.
      // Without it that change (the coverage review's K7b) passed with no game installed (measured 2026-11-13).
      + "\t\trecruit_character = POR_a_general_nobody_defined\n"
      // the CONTROL: genuinely absent
      + "\t\tadd_ideas = an_idea_that_does_not_exist\n"
      + "\t}\n}\n",
    [path.join("localisation", "english", "l_l_english.yml")]:
      "\uFEFFl_english:\n POR_portuguese_legion:0 \"A\"\n CZE_trade_agreement_to_HUN:0 \"B\"\n nsb_news.200:0 \"C\"\n nsb_news.9:0 \"D\"\n",
  });

  const idx = buildModIndex(root, {});
  const broken = idx.problems.filter((p) => p.rule === "broken_reference").map((p) => p.refId);

  rec("an event fired in the other case is not broken", !broken.includes("NSB_news.200"), broken);
  rec("an idea granted in the other case is not broken", !broken.includes("por_portuguese_legion"), broken);

  console.log("\n-- a runtime-built id is not reported as a missing one --");
  rec("the literal prefix is not a broken reference", !broken.some((r) => /^CZE_trade_agreement_$/.test(r)), broken);
  const refs = extractRefs("add_ideas = CZE_trade_agreement_[CZE_idea_country]");
  rec("...and it is not pushed as an ordinary reference at all",
    !refs.some((r) => r.context === "add_ideas"), refs);
  rec("...but the PREFIX is still recorded, so the grant is still seen",
    refs.some((r) => r.context === "add_ideas_prefix" && r.id === "CZE_trade_agreement_"), refs);
  rec("the same guard covers swap_ideas' add_idea",
    !extractRefs("add_idea = CZE_trade_agreement_[X]").some((r) => r.context === "swap_add_idea"),
    extractRefs("add_idea = CZE_trade_agreement_[X]"));
  const timed = extractRefs("add_timed_idea = { idea = CZE_trade_agreement_[X] days = 30 }");
  rec("...and add_timed_idea's, which records the prefix instead",
    !timed.some((r) => r.context === "add_ideas") && timed.some((r) => r.context === "add_ideas_prefix" && r.id === "CZE_trade_agreement_"),
    timed);

  console.log("\n-- what has a rule of its own is not judged as a reference --");
  // classifyRefs (above) reads the rule's skip list rather than restating it, so if recruit_character dropped out
  // of that list, the rule and the classifier would move together and the real-install checks would still pass.
  // The pin at the top fails then, and so does this.
  rec("a recruited character is not reported as a broken reference (RULE 4 judges it), defined or not",
    !broken.includes("POR_a_general") && !broken.includes("POR_a_general_nobody_defined"), broken);

  console.log("\n-- THE CONTROLS: what is genuinely missing must still be reported --");
  rec("a genuinely absent idea is still broken", broken.includes("an_idea_that_does_not_exist"), broken);
  rec("exactly one thing is reported broken", broken.length === 1, broken);
  // The real-install checks at the bottom trust classifyRefs() to find what the game ships, and print SKIP when
  // it finds nothing. A classifier blind to a class would make that check a permanent skip, so prove it here,
  // on content whose answer is known.
  const fx = classifyRefs(idx.entities);
  const fxCase = fx.caseOnly.map((r) => r.id).sort();
  rec("the classifier the real-install checks trust finds exactly the two case-only references here",
    JSON.stringify(fxCase) === JSON.stringify(["NSB_news.200", "por_portuguese_legion"]), fxCase);
  rec("...and exactly one missing reference, the control",
    fx.missing.length === 1 && fx.missing[0].id === "an_idea_that_does_not_exist", fx.missing);

  console.log("\n-- a type mix-up is still named: in vanilla's own shape, and across a case difference --");
  // An idea used where a FOCUS is meant. The first line is vanilla's own, as its Turkey history had it at line 274
  // until the 2026-10-27 update: the same case as the idea, so only the TYPE is wrong. A lookup that let an id
  // resolve against any type holding it exactly would swallow that line and still catch the second, which
  // differs in case as well, so a fixture holding only the second missed the very shape vanilla shipped.
  const root2 = mk("nova-refmix-", {
    "descriptor.mod": 'name="mix"\n',
    [path.join("common", "ideas", "i.txt")]: "ideas = {\n\tcountry = {\n"
      + "\t\tTUR_widespread_illiteracy_idea = { removal_cost = -1 }\n"
      + "\t\ttur_a_case_mixup_idea = { removal_cost = -1 }\n"
      + "\t}\n}\n",
    [path.join("history", "countries", "TUR - Turkey.txt")]: "complete_national_focus = TUR_widespread_illiteracy_idea\n"
      + "complete_national_focus = TUR_a_case_mixup_idea\n",
  });
  const idx2 = buildModIndex(root2, {});
  const p2 = idx2.problems.filter((p) => p.rule === "broken_reference");
  const named = (id) => p2.some((p) => p.refId === id && /there IS a idea called/i.test(p.message));
  rec("vanilla's own mix-up (the same case, the wrong type) is reported, and named as the idea it is",
    named("TUR_widespread_illiteracy_idea"), p2.map((p) => p.message));
  rec("...and so is one that differs in case as well", named("TUR_a_case_mixup_idea"), p2.map((p) => p.message));
  rec("...and nothing else is", p2.length === 2, p2.map((p) => p.refId));
  const fxMix = classifyRefs(idx2.entities).mixup.map((r) => r.id + " as " + r.definedAs.join("+")).sort();
  rec("...and the classifier the real-install check trusts sees both as mix-ups, defined as ideas",
    JSON.stringify(fxMix) === JSON.stringify(["TUR_a_case_mixup_idea as idea", "TUR_widespread_illiteracy_idea as idea"]), fxMix);

  console.log("\n-- the layers below: a stand-in base game (vanillaRoot) and a dependency (dependencyRoots) --");
  // getVanillaIdSet and getDependencyIdSet scan these roots directly, and the dependency's ids join the base game's
  // in the set RULE 2 resolves against. The mod defines an idea, an event and a focus of its own as well, so the
  // lowercase mirror of each type is built from the MOD first: a cache that forgot which layer a mirror belongs to
  // would answer the base game's lookups with the mod's ids.
  const IDEAS = (ids) => "ideas = {\n\tcountry = {\n" + ids.map((i) => "\t\t" + i + " = { removal_cost = -1 }\n").join("") + "\t}\n}\n";
  const TREE = (tree, focus) => "focus_tree = {\n\tid = " + tree + "\n\tcountry = { factor = 0 }\n"
    + "\tfocus = {\n\t\tid = " + focus + "\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n";
  const EVENT = (ns, id) => "add_namespace = " + ns + "\ncountry_event = {\n\tid = " + id
    + "\n\tis_triggered_only = yes\n\toption = { name = " + id + ".a }\n}\n";
  const BASE = mk("nova-refbase-", {
    [path.join("common", "ideas", "base_ideas.txt")]: IDEAS(["BASE_reserve_idea"]),
    [path.join("common", "national_focus", "base_focus.txt")]: TREE("base_tree", "BASE_reform_focus"),
    [path.join("events", "base_events.txt")]: EVENT("base_news", "base_news.7"),
  });
  const DEP = mk("nova-refdep-", {
    "descriptor.mod": 'name="a dependency"\n',
    [path.join("common", "ideas", "dep_ideas.txt")]: IDEAS(["DEP_reserve_idea"]),
    [path.join("common", "national_focus", "dep_focus.txt")]: TREE("dep_tree", "DEP_reform_focus"),
    [path.join("events", "dep_events.txt")]: EVENT("dep_news", "dep_news.7"),
  });
  const MOD = mk("nova-reflayered-", {
    "descriptor.mod": 'name="layered"\n',
    [path.join("common", "ideas", "mod_ideas.txt")]: "ideas = {\n\tcountry = {\n\t\tMOD_own_idea = {\n\t\t\tremoval_cost = -1\n"
      + "\t\t\ton_add = { country_event = mod_news.405 }\n\t\t}\n\t}\n}\n",
    [path.join("common", "national_focus", "mod_focus.txt")]: "focus_tree = {\n\tid = MOD_own_tree\n\tcountry = { factor = 0 }\n"
      + "\tfocus = {\n\t\tid = MOD_own_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n"
      + "\tfocus = {\n\t\tid = MOD_second_focus\n"
      // two links in one block, as 1,882 of the installed game's 11,545 focus prerequisite blocks are (2026-11-13):
      // the second sits further from `prerequisite =` than the first
      + "\t\tprerequisite = { focus = MOD_missing_prerequisite_focus focus = MOD_missing_other_prerequisite_focus }\n"
      + "\t\tmutually_exclusive = { focus = MOD_missing_exclusive_focus }\n"
      + "\t\trelative_position_id = MOD_missing_anchor_focus\n"
      + "\t\tx = 2\n\t\ty = 0\n\t\tcost = 10\n"
      + "\t\tcompletion_reward = {\n"
      + "\t\t\tcountry_event = mod_news.404\n"
      + "\t\t\tnews_event = { id = mod_news.406 days = 1 }\n"
      + "\t\t\tswap_ideas = { remove_idea = MOD_own_idea add_idea = mod_missing_swapped_idea }\n"
      + "\t\t}\n\t}\n}\n",
    [path.join("events", "mod_events.txt")]: "add_namespace = mod_news\n"
      + "country_event = {\n\tid = mod_news.1\n\tis_triggered_only = yes\n"
      + "\ttrigger = { focus_progress = { focus = MOD_missing_progress_focus progress > 0 } }\n"
      + "\toption = {\n\t\tname = mod_news.1.a\n"
      + "\t\tcomplete_national_focus = MOD_missing_completed_focus\n"
      + "\t\tremove_ideas = mod_missing_removed_idea\n"
      + "\t\tremove_ideas = { mod_missing_listed_removed_idea }\n"
      + "\t\tremove_ideas = { idea = mod_missing_keyed_removed_idea }\n"
      // a block form with its id AFTER another key, as 271 of the installed game's brace-free event blocks are (7,963
      // put it first; 2026-11-13), e.g. events/Baltic.txt:63 `country_event = { days = 5 id = soviet.6 }`
      + "\t\tstate_event = { days = 1 id = mod_news.407 }\n"
      + "\t\tunit_leader_event = mod_news.408\n"
      + "\t\toperative_leader_event = { id = mod_news.409 }\n"
      + "\t\tcountry_event = BASE_news.7\n"
      + "\t\tcountry_event = DEP_news.7\n"
      + "\t\tcountry_event = MOD_own_idea\n"
      + "\t\tcountry_event = mod_news.501\n\t\tcountry_event = mod_news.502\n\t\tcountry_event = mod_news.503\n"
      + "\t}\n}\n",
    [path.join("common", "decisions", "mod_decisions.txt")]: "mod_category = {\n\tmod_own_decision = {\n\t\tcost = 10\n"
      + "\t\tcomplete_effect = {\n"
      + "\t\t\tactivate_decision = mod_missing_decision\n"
      + "\t\t\tactivate_decision = { mod_missing_listed_decision }\n"
      + "\t\t\tadd_ideas = mod_missing_granted_idea\n"
      + "\t\t}\n\t}\n"
      // the same missing idea from a second entity of the same kind, in the same file
      + "\tmod_second_decision = {\n\t\tcost = 10\n\t\tcomplete_effect = { add_ideas = mod_missing_granted_idea }\n\t}\n}\n",
    [path.join("common", "technologies", "mod_tech.txt")]: "technologies = {\n\tmod_own_tech = {\n"
      + "\t\tpath = { leads_to_tech = mod_missing_next_tech research_cost_coeff = 1 }\n"
      + "\t\txor = { mod_missing_xor_tech }\n"
      + "\t\tdependencies = { mod_missing_dependency_tech = 1 }\n"
      + "\t\tsub_technologies = { mod_missing_sub_tech }\n"
      + "\t\tprerequisite = { mod_missing_prerequisite_tech }\n"
      + "\t\tenable_equipments = { mod_missing_equipment mod_dup_equipment mod_dup_equipment_1 mod_own_tech }\n"
      + "\t\tenable_equipments = { mod_commented_out_equipment mod_after_comment_equipment }\n"
      + "\t}\n}\n",
    // duplicate_archetypes defines an equipment with no `X = {` of its own, and DERIVES a numbered variant of it for
    // every numbered variant of its source. No reader of the script can find mod_dup_equipment_1 written anywhere, so
    // only a fixture holds it (#duplicate-archetypes-uindexed). The installed game has 34 such entries (2026-11-13),
    // and every one sits in a file of its own that takes its source's variants from another file: 13 in
    // x_plane_airframes.txt from plane_airframes.txt, 21 in x_tank_chassis.txt from tank_chassis.txt (2026-11-19). So
    // the source is here and the entry is in a file that sorts after it. While both sat in this one file, deriving a
    // variant only from the entry's own file passed this test, and took the install from 7 firings to 106 (2026-11-19).
    [path.join("common", "units", "equipment", "mod_equipment.txt")]: "equipments = {\n"
      + "\tmod_src_equipment = {\n\t\tis_archetype = yes\n\t}\n"
      + "\tmod_src_equipment_1 = {\n\t\tarchetype = mod_src_equipment\n\t}\n}\n",
    // ...and the entry, in a file of its own that sorts after the source's
    [path.join("common", "units", "equipment", "x_mod_equipment.txt")]: "duplicate_archetypes = {\n\tmod_dup_equipment = {\n\t\tarchetype = mod_src_equipment\n\t}\n}\n",
    // Two definitions a scanner can drop while every reference to them still reads: a focus in a shared_focus block (the
    // installed game has 335, in 7 national_focus files), and an idea in a file whose outer block is never closed,
    // which Clausewitz closes at the end of the file (vanilla's common/ideas/switzerland.txt opens one brace more than
    // it closes; both 2026-11-13). On the install the definition-site check holds both; these hold them with no game.
    [path.join("common", "national_focus", "mod_shared.txt")]: "shared_focus = {\n\tid = MOD_shared_focus\n"
      + "\tx = 0\n\ty = 0\n\tcost = 10\n}\n",
    [path.join("common", "ideas", "mod_unclosed_ideas.txt")]: "ideas = {\n\tcountry = {\n"
      + "\t\tMOD_unclosed_idea = { removal_cost = -1 }\n\t}\n",
    // A definition written in a comment defines nothing, and a brace written in a comment opens or closes nothing: each
    // scanner reads its files with comments stripped. One of each for five of the seven scanners RULE 2 resolves
    // against: ideas, techs, equipment, events and focuses (decisions and characters have none; see the header). A
    // scanner that kept comments would drop every definition after such a brace: Novum Vexillum's
    // common/ideas/republic_of_korea.txt has 15 comment lines holding a brace, the first at line 37
    // (`# kor_tools  = {`), ahead of ideas such as KOR_anarchist_society_1 at line 1569 (read 2026-11-19).
    [path.join("common", "ideas", "mod_commented_ideas.txt")]: "ideas = {\n\tcountry = {\n"
      + "\t\t# MOD_commented_out_idea = {\n\t\t#\tremoval_cost = -1\n\t\t# }\n"
      + "\t\t# the old category closed here }\n"
      + "\t\tMOD_after_comment_idea = { removal_cost = -1 }\n\t}\n}\n",
    [path.join("common", "technologies", "mod_commented_tech.txt")]: "technologies = {\n"
      + "\t# mod_commented_out_tech = { research_cost = 1 }\n"
      + "\t# }\n"
      + "\tmod_after_comment_tech = { research_cost = 1 }\n}\n",
    [path.join("common", "units", "equipment", "mod_commented_equipment.txt")]: "equipments = {\n"
      + "\t# mod_commented_out_equipment = { is_archetype = yes }\n"
      + "\t# }\n"
      + "\tmod_after_comment_equipment = { is_archetype = yes }\n}\n",
    [path.join("events", "mod_commented_events.txt")]: "# country_event = { id = mod_news.501 }\n"
      + "country_event = {\n\tid = mod_news.502\n\tis_triggered_only = yes\n\t# an old option = {\n}\n"
      + "country_event = {\n\tid = mod_news.503\n\tis_triggered_only = yes\n}\n",
    [path.join("common", "national_focus", "mod_commented_focus.txt")]: "focus_tree = {\n\tid = MOD_commented_tree\n\tcountry = { factor = 0 }\n"
      + "\t# focus = { id = MOD_commented_out_focus }\n"
      + "\tfocus = {\n\t\tid = MOD_braced_comment_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t\t# an old reward = {\n\t}\n"
      + "\tfocus = {\n\t\tid = MOD_after_comment_focus\n\t\tx = 1\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n",
    [path.join("common", "continuous_focus", "mod_palette.txt")]: "continuous_focus_palette = {\n\tid = mod_palette\n"
      + "\tfocus = {\n\t\tid = mod_continuous_focus\n\t\tidea = mod_missing_continuous_idea\n\t}\n}\n",
    // A character carries references too, in an advisor's effects, as vanilla's SOV_lev_trotsky fires mexico.22 from
    // its on_add (common/characters/SOV.txt). The index hosts them as an idea marked fromCharacter, so a rule that
    // skipped a character's references would pass a fixture whose only idea host is a national spirit.
    [path.join("common", "characters", "mod_characters.txt")]: "characters = {\n\tMOD_own_character = {\n"
      + "\t\tname = MOD_own_character\n\t\tadvisor = {\n\t\t\tslot = political_advisor\n"
      + "\t\t\tidea_token = MOD_own_character_advisor\n\t\t\ton_add = { country_event = mod_news.410 }\n\t\t}\n\t}\n}\n",
    [path.join("history", "countries", "MOD - Modland.txt")]: "capital = 1\n"
      + "add_ideas = mod_missing_granted_idea\n"
      + "add_ideas = { mod_missing_listed_idea }\n"
      + "add_ideas = { idea = mod_missing_keyed_idea }\n"
      // the timed idea and the tree block name their id after another key, which the readers take either way: the
      // installed game writes 9 of its 1,734 add_timed_idea blocks so (3 in events/WTT_Manchukou.txt) and none of its
      // 55 load_focus_tree blocks. The set_technology block holds two techs, the missing one second, as 1,353 of the
      // game's set_technology blocks hold two or more (all 2026-11-13).
      + "add_timed_idea = { days = 30 idea = mod_missing_timed_idea }\n"
      + "set_technology = { mod_own_tech = 1 mod_missing_set_tech = 1 }\n"
      + "load_focus_tree = mod_missing_tree\n"
      + "load_focus_tree = { keep_completed = yes tree = mod_missing_block_tree }\n"
      + "ideas = { mod_missing_starting_idea }\n"
      + "add_ideas = base_RESERVE_idea\n"
      + "add_ideas = dep_RESERVE_idea\n"
      + "complete_national_focus = base_REFORM_focus\n"
      + "complete_national_focus = dep_REFORM_focus\n"
      + "complete_national_focus = mod_OWN_focus\n"
      + "complete_national_focus = BASE_reserve_idea\n"
      + "complete_national_focus = DEP_reserve_idea\n"
      + "add_ideas = base_REFORM_focus\n"
      + "add_ideas = dep_REFORM_focus\n"
      + "complete_national_focus = MOD_own_tree\n"
      + "add_ideas = BASE_reserve\n"
      + "add_ideas = DEP_reserve\n"
      + "add_ideas = MOD_own\n"
      + "load_focus_tree = MOD_own_focus\n"
      // type mix-ups of the other pairs RULE 2 names on the installed corpus (see MIXUPS)
      + "add_ideas = mod_own_decision\n"
      + "set_technology = { mod_src_equipment = 1 }\n"
      + "complete_national_focus = MOD_shared_focus\n"
      + "add_ideas = MOD_unclosed_idea\n"
      + "add_ideas = MOD_commented_out_idea\n"
      + "add_ideas = MOD_after_comment_idea\n"
      + "set_technology = { mod_commented_out_tech = 1 mod_after_comment_tech = 1 }\n"
      + "complete_national_focus = MOD_commented_out_focus\n"
      + "complete_national_focus = MOD_braced_comment_focus\n"
      + "complete_national_focus = MOD_after_comment_focus\n",
  });
  const idxC = buildModIndex(MOD, { vanillaRoot: BASE, dependencyRoots: [DEP] });
  const pC = idxC.problems.filter((p) => p.rule === "broken_reference");
  const key = (entityType, entityId, context, id) => entityType + " " + entityId + " | " + context + " = " + id;
  const firedC = new Map(pC.map((p) => [key(p.entityType, p.entityId, p.refContext, p.refId), p]));
  const readC = new Set();
  for (const e of idxC.entities) for (const r of e.refs || []) readC.add(key(e.type, e.id, r.context, r.id));
  const why = (k) => k + (readC.has(k) ? "  (read, not reported as expected)" : "  (never read by the extractor)");
  const firesMissing = (x) => { const p = firedC.get(key(...x)); return !!p && !p.message.includes("there IS a "); };

  // [entity type, entity id, context, id]. Into each layer, and into the mod itself.
  const RESOLVE = [
    ["country", "MOD", "add_ideas", "base_RESERVE_idea"],
    ["country", "MOD", "add_ideas", "dep_RESERVE_idea"],
    ["event", "mod_news.1", "country_event", "BASE_news.7"],
    ["event", "mod_news.1", "country_event", "DEP_news.7"],
    ["country", "MOD", "complete_national_focus", "base_REFORM_focus"],
    ["country", "MOD", "complete_national_focus", "dep_REFORM_focus"],
    ["country", "MOD", "complete_national_focus", "mod_OWN_focus"],
  ];
  const resolvedButFired = RESOLVE.map((x) => key(...x)).filter((k) => firedC.has(k));
  rec("a reference differing only in case resolves into the base game and the dependency (an idea, an event, a focus) "
    + "and into the mod (a focus)",
    resolvedButFired.length === 0, resolvedButFired.map((k) => firedC.get(k).message));

  const DERIVED = [
    ["tech", "mod_own_tech", "enable_equipments", "mod_dup_equipment"],
    ["tech", "mod_own_tech", "enable_equipments", "mod_dup_equipment_1"],
  ];
  const derivedButFired = DERIVED.map((x) => key(...x)).filter((k) => firedC.has(k));
  rec("an equipment duplicate_archetypes declares resolves, and so does the numbered variant it derives",
    derivedButFired.length === 0, derivedButFired.map((k) => why(k)));
  const DROPPABLE = [
    ["country", "MOD", "complete_national_focus", "MOD_shared_focus"],
    ["country", "MOD", "add_ideas", "MOD_unclosed_idea"],
  ];
  const droppedButFired = DROPPABLE.map((x) => key(...x)).filter((k) => firedC.has(k));
  rec("a focus a shared_focus defines resolves, and so does an idea in a file whose last brace is missing",
    droppedButFired.length === 0, droppedButFired.map((k) => why(k)));
  const COMMENTED_OUT = [
    ["country", "MOD", "add_ideas", "MOD_commented_out_idea"],
    ["country", "MOD", "set_technology", "mod_commented_out_tech"],
    ["tech", "mod_own_tech", "enable_equipments", "mod_commented_out_equipment"],
    ["event", "mod_news.1", "country_event", "mod_news.501"],
    ["country", "MOD", "complete_national_focus", "MOD_commented_out_focus"],
  ];
  const quietCommented = COMMENTED_OUT.filter((x) => !firesMissing(x));
  rec("a definition written in a comment defines nothing: an idea, a tech, an equipment, an event, a focus",
    quietCommented.length === 0, quietCommented.map((x) => why(key(...x))));
  const AFTER_A_COMMENTED_BRACE = [
    ["country", "MOD", "add_ideas", "MOD_after_comment_idea"],
    ["country", "MOD", "set_technology", "mod_after_comment_tech"],
    ["tech", "mod_own_tech", "enable_equipments", "mod_after_comment_equipment"],
    ["event", "mod_news.1", "country_event", "mod_news.502"],
    ["event", "mod_news.1", "country_event", "mod_news.503"],
    ["country", "MOD", "complete_national_focus", "MOD_braced_comment_focus"],
    ["country", "MOD", "complete_national_focus", "MOD_after_comment_focus"],
  ];
  const braceFired = AFTER_A_COMMENTED_BRACE.map((x) => key(...x)).filter((k) => firedC.has(k));
  rec("a brace written in a comment closes nothing: what follows it still defines, in each of those five",
    braceFired.length === 0, braceFired.map((k) => why(k)));

  // [..., the type the id IS]. The first two are vanilla's Turkey shape (the same case, the wrong type), into
  // each layer; the next two differ in case as well; the fifth is a focus_tree where a focus is meant. The last four
  // are, inside the mod, the other type pairs RULE 2 names a mix-up for on the installed corpus (the coverage
  // review's census of the game and the 14 Workshop items, 2026-11-10: an equipment that is a tech, a tech that is
  // an equipment, an event that is an idea, an idea that is a decision). The pin on BROKEN_REFERENCE_ALSO_RESOLVES
  // fails if any pair is relaxed there; these fail too if the pin is moved in step.
  const MIXUPS = [
    ["country", "MOD", "complete_national_focus", "BASE_reserve_idea", "idea"],
    ["country", "MOD", "complete_national_focus", "DEP_reserve_idea", "idea"],
    ["country", "MOD", "add_ideas", "base_REFORM_focus", "focus"],
    ["country", "MOD", "add_ideas", "dep_REFORM_focus", "focus"],
    ["country", "MOD", "complete_national_focus", "MOD_own_tree", "focus_tree"],
    ["tech", "mod_own_tech", "enable_equipments", "mod_own_tech", "tech"],
    ["country", "MOD", "set_technology", "mod_src_equipment", "equipment"],
    ["event", "mod_news.1", "country_event", "MOD_own_idea", "idea"],
    ["country", "MOD", "add_ideas", "mod_own_decision", "decision"],
  ];
  const unnamed = MIXUPS.filter(([t, id, ctx, ref, is]) => {
    const p = firedC.get(key(t, id, ctx, ref));
    return !p || !p.message.includes("there IS a " + is + " called");
  });
  rec("a type mix-up fires, named as what the id is: into each layer, in the same case and across a case difference, "
    + "and in every type pair the installed corpus mixes up", unnamed.length === 0, unnamed.map((x) => why(key(x[0], x[1], x[2], x[3]))));

  const HEADS = [
    ["country", "MOD", "add_ideas", "BASE_reserve"],
    ["country", "MOD", "add_ideas", "DEP_reserve"],
    ["country", "MOD", "add_ideas", "MOD_own"],
  ];
  const quietHeads = HEADS.filter((x) => !firesMissing(x));
  rec("the head of a real id is not that id, in any layer: each fires as missing",
    quietHeads.length === 0, quietHeads.map((x) => why(key(...x))));

  rec("the one relaxation pinned above holds: a load_focus_tree naming a focus resolves",
    !firedC.has(key("country", "MOD", "load_focus_tree", "MOD_own_focus")), pC.map((p) => p.refContext + " = " + p.refId));

  // Every context RULE 2 judges, in the forms the extractor reads (every event kind, each in one of its two forms, and
  // both keys that make a focus link), of every reference type, from every kind of entity that carries references.
  // A rule that skipped one type, one host or one context, or an extractor that stopped reading one, leaves a line
  // here quiet.
  const MISSING = [
    ["idea", "MOD_own_idea", "country_event", "mod_news.405"],
    ["idea", "MOD_own_character", "country_event", "mod_news.410"],
    ["focus", "MOD_second_focus", "focus_link", "MOD_missing_prerequisite_focus"],
    ["focus", "MOD_second_focus", "focus_link", "MOD_missing_other_prerequisite_focus"],
    ["focus", "MOD_second_focus", "focus_link", "MOD_missing_exclusive_focus"],
    ["focus", "MOD_second_focus", "relative_position_id", "MOD_missing_anchor_focus"],
    ["focus", "MOD_second_focus", "country_event", "mod_news.404"],
    ["focus", "MOD_second_focus", "country_event", "mod_news.406"],
    ["focus", "MOD_second_focus", "swap_add_idea", "mod_missing_swapped_idea"],
    ["event", "mod_news.1", "focus_arg", "MOD_missing_progress_focus"],
    ["event", "mod_news.1", "complete_national_focus", "MOD_missing_completed_focus"],
    ["event", "mod_news.1", "remove_ideas", "mod_missing_removed_idea"],
    ["event", "mod_news.1", "remove_ideas", "mod_missing_listed_removed_idea"],
    ["event", "mod_news.1", "remove_ideas", "mod_missing_keyed_removed_idea"],
    ["event", "mod_news.1", "country_event", "mod_news.407"],
    ["event", "mod_news.1", "country_event", "mod_news.408"],
    ["event", "mod_news.1", "country_event", "mod_news.409"],
    ["decision", "mod_own_decision", "activate_decision", "mod_missing_decision"],
    ["decision", "mod_own_decision", "activate_decision", "mod_missing_listed_decision"],
    ["decision", "mod_own_decision", "add_ideas", "mod_missing_granted_idea"],
    ["decision", "mod_second_decision", "add_ideas", "mod_missing_granted_idea"],
    ["tech", "mod_own_tech", "leads_to_tech", "mod_missing_next_tech"],
    ["tech", "mod_own_tech", "xor", "mod_missing_xor_tech"],
    ["tech", "mod_own_tech", "dependencies", "mod_missing_dependency_tech"],
    ["tech", "mod_own_tech", "sub_technologies", "mod_missing_sub_tech"],
    ["tech", "mod_own_tech", "prerequisite", "mod_missing_prerequisite_tech"],
    ["tech", "mod_own_tech", "enable_equipments", "mod_missing_equipment"],
    ["continuous_focus", "mod_palette", "continuous_focus", "mod_missing_continuous_idea"],
    ["country", "MOD", "add_ideas", "mod_missing_granted_idea"],
    ["country", "MOD", "add_ideas", "mod_missing_listed_idea"],
    ["country", "MOD", "add_ideas", "mod_missing_keyed_idea"],
    ["country", "MOD", "add_ideas", "mod_missing_timed_idea"],
    ["country", "MOD", "set_technology", "mod_missing_set_tech"],
    ["country", "MOD", "load_focus_tree", "mod_missing_tree"],
    ["country", "MOD", "load_focus_tree", "mod_missing_block_tree"],
    ["country", "MOD", "history_ideas", "mod_missing_starting_idea"],
  ];
  const quietMissing = MISSING.filter((x) => !firesMissing(x));
  rec("a missing reference fires as missing in every context, form, reference type and host here (" + MISSING.length + ")",
    quietMissing.length === 0, quietMissing.map((x) => why(key(...x))));
  rec("...an id missing from three entities is reported for each: two of one kind in one file, one of another elsewhere",
    firesMissing(["country", "MOD", "add_ideas", "mod_missing_granted_idea"])
      && firesMissing(["decision", "mod_own_decision", "add_ideas", "mod_missing_granted_idea"])
      && firesMissing(["decision", "mod_second_decision", "add_ideas", "mod_missing_granted_idea"]),
    pC.filter((p) => p.refId === "mod_missing_granted_idea").map((p) => p.entityType + " " + p.entityId));
  const notErrors = pC.filter((p) => p.severity !== "error");
  rec("...every one of them is an error", pC.length > 0 && notErrors.length === 0,
    notErrors.map((p) => p.severity + ": " + p.refContext + " = " + p.refId));
  const expectedC = new Set(MISSING.concat(HEADS, COMMENTED_OUT).map((x) => key(...x)).concat(MIXUPS.map((x) => key(x[0], x[1], x[2], x[3]))));
  const extraC = pC.filter((p) => !expectedC.has(key(p.entityType, p.entityId, p.refContext, p.refId)));
  rec("...and nothing else is reported (" + pC.length + " firings)", extraC.length === 0,
    extraC.map((p) => key(p.entityType, p.entityId, p.refContext, p.refId)));
  // What the fixture holds, for the install half to measure the game against.
  const held = { context: new Set(), host: new Set(), "reference type": new Set() };
  for (const x of MISSING) {
    if (!firesMissing(x)) continue;
    const p = firedC.get(key(...x));
    held.context.add(p.refContext); held.host.add(p.entityType); held["reference type"].add(p.refType);
  }

  console.log("\n-- the layers as Mod Health passes them: the chain's replace_path for the base game, the active mod's for a dependency --");
  // #replace-path-sibling-order — server.js's computeModIndexPayload gives vanillaReplacedFolders every replace_path the
  // active mod AND its dependencies declare (the base game is the lowest layer, so anyone replacing a folder unloads
  // its copy) and dependencyReplacedFolders only the active mod's (a dependency does not erase itself, and a sibling's
  // order is a playset choice no descriptor records). The third fixture passes neither. Here a dependency replaces
  // events/ and the mod that depends on it replaces common/ideas; a sibling depends on the same dependency and
  // replaces nothing. Each layer also defines a tech, a decision and an equipment, which the third fixture's layers do
  // not; with the third fixture's idea, event and focus, a reference resolves into the layers in six of the seven
  // reference types RULE 2 judges, and in none here as a focus_tree. The sibling is indexed FIRST: it asks the base
  // game with a different replace_path list than the mod does, and asks its dependency with the same empty list the
  // third fixture's mod used, so a cache keyed on less than the layer AND the list would hand one of them another's
  // answer.
  {
    const LAYER = (p) => ({
      [path.join("events", p + "_events.txt")]: EVENT(p + "_ns", p + "_ns.1"),
      [path.join("common", "ideas", p + "_ideas.txt")]: IDEAS([p + "_layer_idea"]),
      [path.join("common", "technologies", p + "_tech.txt")]: "technologies = {\n\t" + p + "_layer_tech = {\n\t\tresearch_cost = 1\n\t}\n}\n",
      [path.join("common", "decisions", p + "_decisions.txt")]: p + "_category = {\n\t" + p + "_layer_decision = {\n\t\tcost = 10\n\t}\n}\n",
      [path.join("common", "units", "equipment", p + "_equipment.txt")]: "equipments = {\n\t" + p + "_layer_equipment = {\n\t\tyear = 1936\n\t}\n}\n",
    });
    // The same references from either mod: into both layers, of every type, and one id no layer defines.
    const USER = (p, tag, descriptor) => ({
      "descriptor.mod": descriptor,
      [path.join("events", p + "_events.txt")]: "add_namespace = " + p + "_ns\ncountry_event = {\n\tid = " + p + "_ns.1\n"
        + "\tis_triggered_only = yes\n\toption = {\n\t\tname = " + p + "_ns.1.a\n"
        + "\t\tcountry_event = b4_ns.1\n\t\tcountry_event = d4_ns.1\n"
        + "\t\tadd_ideas = b4_layer_idea\n\t\tadd_ideas = d4_layer_idea\n"
        + "\t\tactivate_decision = b4_layer_decision\n\t\tactivate_decision = d4_layer_decision\n"
        + "\t\tadd_ideas = " + p + "_missing_idea\n\t}\n}\n",
      [path.join("common", "technologies", p + "_tech.txt")]: "technologies = {\n\t" + p + "_own_tech = {\n\t\tresearch_cost = 1\n"
        + "\t\tenable_equipments = { b4_layer_equipment d4_layer_equipment }\n\t}\n}\n",
      [path.join("history", "countries", tag + " - Layered.txt")]: "capital = 1\nset_technology = { b4_layer_tech = 1 d4_layer_tech = 1 }\n",
    });
    const B4 = mk("nova-refrp-base-", LAYER("b4"));
    const D4 = mk("nova-refrp-dep-", Object.assign({ "descriptor.mod": 'name="rp dep"\nreplace_path="events"\n' }, LAYER("d4")));
    const S4 = mk("nova-refrp-sibling-", USER("s4", "S4Z", 'name="rp sibling"\ndependencies = { "rp dep" }\n'));
    const M4 = mk("nova-refrp-mod-", USER("m4", "M4Z", 'name="rp mod"\nreplace_path="common/ideas"\ndependencies = { "rp dep" }\n'));
    // What computeModIndexPayload builds from those descriptors, TYPED IN: the active mod's list, and the chain's. This
    // file does not load server.js, so how it builds them is not held here (see the header).
    const DEP_RP = ["events"];
    const optsFor = (own) => ({ vanillaRoot: B4, dependencyRoots: [D4], vanillaReplacedFolders: own.concat(DEP_RP), dependencyReplacedFolders: own });
    const fired4 = new Map();
    for (const [p, root, own] of [["s4", S4, []], ["m4", M4, ["common/ideas"]]]) {
      for (const x of buildModIndex(root, optsFor(own)).problems) if (x.rule === "broken_reference") fired4.set(p + " " + x.refContext + " = " + x.refId, x);
    }
    const unloadedMsg = (k) => fired4.has(k) && /replace_path/.test(fired4.get(k).message);
    const BOTH = (refs) => ["s4", "m4"].flatMap((p) => refs.map((r) => p + " " + r));
    const typed = BOTH(["set_technology = b4_layer_tech", "set_technology = d4_layer_tech", "activate_decision = b4_layer_decision",
      "activate_decision = d4_layer_decision", "enable_equipments = b4_layer_equipment", "enable_equipments = d4_layer_equipment"]);
    rec("a tech, a decision and an equipment resolve into the base game and into the dependency",
      typed.every((k) => !fired4.has(k)), typed.filter((k) => fired4.has(k)));
    rec("a dependency's replace_path does not unload the dependency's own folder",
      BOTH(["country_event = d4_ns.1"]).every((k) => !fired4.has(k)), [...fired4.keys()]);
    rec("...but it unloads the base game's, for the mod that depends on it and its sibling alike, said as unloaded",
      BOTH(["country_event = b4_ns.1"]).every(unloadedMsg), [...fired4].map(([k, x]) => k + ": " + x.message.slice(0, 120)));
    rec("the active mod's replace_path unloads that folder in the base game AND in its dependency, each said as unloaded",
      ["m4 add_ideas = b4_layer_idea", "m4 add_ideas = d4_layer_idea"].every(unloadedMsg), [...fired4].map(([k, x]) => k + ": " + x.message.slice(0, 120)));
    rec("...while the sibling, which replaces nothing, resolves both",
      ["s4 add_ideas = b4_layer_idea", "s4 add_ideas = d4_layer_idea"].every((k) => !fired4.has(k)), [...fired4.keys()]);
    rec("an id no layer defines still fires as plain missing, in either mod",
      ["s4 add_ideas = s4_missing_idea", "m4 add_ideas = m4_missing_idea"].every((k) => fired4.has(k)
        && !/replace_path|there IS a /.test(fired4.get(k).message)), [...fired4].map(([k, x]) => k + ": " + x.message.slice(0, 120)));
    const expected4 = new Set(BOTH(["country_event = b4_ns.1"]).concat(["m4 add_ideas = b4_layer_idea", "m4 add_ideas = d4_layer_idea",
      "s4 add_ideas = s4_missing_idea", "m4 add_ideas = m4_missing_idea"]));
    rec("...and nothing else is reported (" + fired4.size + " firings)", [...fired4.keys()].every((k) => expected4.has(k)),
      [...fired4.keys()].filter((k) => !expected4.has(k)));
    rec("...every one an error, the unloaded ones included", fired4.size > 0 && [...fired4.values()].every((x) => x.severity === "error"),
      [...fired4].map(([k, x]) => x.severity + ": " + k));
  }

  console.log("\n-- against the real install, if it is here --");
  const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (isHoi4GameFolder(G)) {
    const v = buildModIndex(G, { vanillaRoot: null, dependencyRoots: [] });
    const vb = v.problems.filter((p) => p.rule === "broken_reference");
    // (final-v120 re-derived the Turkey check for 1.20 on 2026-11-20 as one that runs only while the installed TUR history still says
    // `complete_national_focus = TUR_widespread_illiteracy_idea`, and SKIPs otherwise. The classifier below holds that and more: every
    // mix-up the installed game ships must fire and be named, and with none there the check SKIPs and says so.)
    // #a-real-case-pinned-by-name-left-with-the-patch — what to expect is read out of the installed game by the
    // same index the rule reads, never typed in here. See the header.
    const live = classifyRefs(v.entities);
    const same = (p, r) => p.entityType === r.entityType && p.entityId === r.entityId
      && p.refContext === r.context && p.refType === r.type && p.refId === r.id;
    if (live.mixup.length) {
      const quiet = live.mixup.filter((r) => !vb.some((p) => same(p, r)
        && r.definedAs.some((t) => p.message.includes("there IS a " + t + " called"))));
      rec("every type mix-up the installed game ships fires, named as what it is (" + live.mixup.length + ")",
        quiet.length === 0, quiet.length ? quiet : live.mixup.map((r) => r.context + " = " + r.id));
    } else {
      skip("every type mix-up the installed game ships fires: the classifier finds none in it. Vanilla's own, "
        + "complete_national_focus = TUR_widespread_illiteracy_idea, which the 2026-10-27 update replaced (see the header). "
        + "This check did NOT run; the second and third fixtures hold the class, in that shape and across a case "
        + "difference, into the mod and into each layer below it.");
    }
    if (live.missing.length) {
      const quiet = live.missing.filter((r) => !vb.some((p) => same(p, r) && !p.message.includes("there IS a ")));
      rec("every reference no type defines in any case fires, as missing (" + live.missing.length + ")",
        quiet.length === 0, quiet.length ? quiet : live.missing.map((r) => r.context + " = " + r.id));
    } else {
      skip("every reference no type defines in any case fires: the classifier finds none in the installed game. "
        + "This check did NOT run; the fixtures' missing references hold the class.");
    }
    // Matched exactly: entity, context, type and id. A pattern like /^NSB_news\./ also matches NSB_news.201, which
    // is genuinely absent in EVERY case and must keep firing — the sloppy version of this assertion failed for that
    // reason, and a suppression test that cannot tell "resolved" from "still broken" is worse than no test.
    if (live.caseOnly.length) {
      const stillThere = live.caseOnly.filter((r) => vb.some((p) => same(p, r)));
      rec("every reference it ships that differs only in case resolves (" + live.caseOnly.length + ")",
        stillThere.length === 0, stillThere.length ? stillThere : live.caseOnly.map((r) => r.id));
    } else {
      skip("every reference it ships that differs only in case resolves: the classifier finds none in it. This "
        + "check did NOT run; the first and third fixtures hold the class.");
    }
    // ...and nothing else. This replaces "vanilla's broken references are down to single figures" (fewer than 15),
    // a threshold typed onto game content: on the installed game the rule may report exactly the references the
    // classifier says nothing resolves. A finding of a shape the classifier ALSO gets wrong passes this — which is
    // what the whole-token check below, and the pins and fixtures above, are for.
    const expected = live.mixup.concat(live.missing);
    const extra = vb.filter((p) => !expected.some((r) => same(p, r)));
    rec("...and the rule reports nothing else on the installed game (" + vb.length + " firings)", extra.length === 0,
      extra.length ? extra.map((p) => p.refContext + " = " + p.refId + " in " + p.entityId) : vb.map((p) => p.refId));
    // An id read short is "missing" to the rule and to the classifier alike, because both read the same short id.
    // So each one has to stand WHOLE where it was read from: in its entity's own file, comments stripped.
    const texts = new Map();
    const fileText = (rel) => {
      if (!texts.has(rel)) { let s = ""; try { s = fs.readFileSync(path.join(G, rel), "utf8"); } catch (_) { /* reported below */ } texts.set(rel, stripComments(s)); }
      return texts.get(rel);
    };
    const toRead = new Map();
    for (const r of expected) toRead.set(key(r.entityType, r.entityId, r.context, r.id), { file: r.file, id: r.id });
    for (const p of vb) toRead.set(key(p.entityType, p.entityId, p.refContext, p.refId), { file: p.file, id: p.refId });
    if (toRead.size) {
      const cut = [...toRead].filter(([, r]) => !standsWhole(fileText(r.file), r.id));
      rec("every reference called broken there stands WHOLE in its entity's own file, not as the head of a longer id ("
        + toRead.size + ")", cut.length === 0, cut.length ? cut.map(([k, r]) => k + " in " + r.file) : [...toRead.keys()]);
    } else {
      skip("every reference called broken on the installed game stands whole in its own file: nothing there is "
        + "called broken. This check did NOT run.");
    }
    // A definition the index dropped or read short: the rule and the classifier both call its references missing,
    // and only a reader of the game's script that is not the index can tell (see definitionSites).
    if (live.missing.length) {
      const sites = definitionSites(G);
      const definedAfterAll = live.missing.filter((r) => sites.has(String(r.id).toLowerCase()));
      rec("no reference called missing there has a definition site in the game's own script, read without the index's "
        + "scanners (" + live.missing.length + " missing, " + sites.size + " sites)", definedAfterAll.length === 0,
        definedAfterAll.map((r) => r.context + " = " + r.id + " is defined in " + sites.get(String(r.id).toLowerCase())));
    } else {
      skip("no reference called missing on the installed game has a definition site there: nothing there is called "
        + "missing. This check did NOT run.");
    }
    // The third fixture holds a missing reference in every context, host and reference type it names. Measured
    // against what the installed game's references use, so a context the extractor starts producing cannot sit
    // outside the fixture unnoticed if the installed game uses it. On 2026-11-13 it used 17 of the 19 contexts
    // RULE 2 judges: no tech prerequisite block and no history `ideas = { }` block occur there, so the fixture
    // alone holds those two.
    const used = { context: new Set(), host: new Set(), "reference type": new Set() };
    for (const e of v.entities) for (const r of e.refs || []) {
      if (PINNED_SKIPPED_CONTEXTS.has(r.context)) continue;
      used.context.add(r.context); used.host.add(e.type); used["reference type"].add(r.type);
    }
    const gaps = [];
    for (const k of Object.keys(used)) for (const x of used[k]) if (!held[k].has(x)) gaps.push(k + " " + x);
    rec("every context, host and reference type the installed game's references use has a missing reference firing "
      + "in the third fixture (" + used.context.size + " contexts, " + used.host.size + " hosts, "
      + used["reference type"].size + " reference types)", gaps.length === 0, gaps.length ? gaps : [...used.context].sort());
  } else {
    skip("the real-install checks: no game at " + G + " (set HOI4_ROOT). They did NOT run, and the fixtures above "
      + "do not stand in for them: only they check that every context, host and reference type the game's "
      + "references use has a firing in the third fixture, that every id called broken there stands whole in its "
      + "own file, and that none called missing is defined in the game's own script.");
  }
} finally {
  for (const r of scratch) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
  + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
process.exitCode = fails.length ? 1 : 0;
