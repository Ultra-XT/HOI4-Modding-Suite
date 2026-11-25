// #comment-brace-hides-shared-defs — 48 OF 49 SHARED FOCUSES WENT MISSING BECAUSE OF A COMMENT.
//
// indexSharedFocusDefs brace-matched the RAW file text. Its variable was even called `clean`, but nothing
// was cleaned. A `#` comment containing an unmatched `{` throws matchBraceForward off, and `close === -1`
// then BREAKS the loop — abandoning not just that definition but every remaining one in the file.
//
// Vanilla's paraguay_uruguay_shared_branch.txt declares 49 shared focuses and Nova indexed 1. A modder
// linking that branch saw a single ghost node where the game draws 49, so they would place their own
// focuses on coordinates the game already occupies, and the shared-focus manager offered the group as "(1)"
// when the honest number is 49. Nothing is written to disk by this path — it is a read-only display — but
// the trigger is ordinary editing hygiene: commenting out a shared_focus template, which vanilla itself
// ships one of.
//
// ⭐ THE RULE ALREADY EXISTED ~100 lines below in the same file, tagged #comment-brace-hides-tree:
//   "Match braces against a comment-blanked copy so a `#` comment containing an unmatched `{` cannot hide
//    this tree and every tree after it."
// One rule, two callers, one never adopted it — this codebase's most repeated defect.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sharedc-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const srv = require("./server.js");

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

// resolveSharedFocuses is the exported entry point that consumes indexSharedFocusDefs.
const resolve = srv.resolveSharedFocuses;
console.log(`\n[the real code] resolveSharedFocuses exported: ${typeof resolve}`);
rec("the shared-focus resolver is exported", typeof resolve === "function", typeof resolve);

// A tree that pulls in a shared group, and the file defining it.
const TREE = 'focus_tree = {\n\tid = probe_tree\n\tcountry = { factor = 1 }\n\tshared_focus = SF_first\n}\n';
const defs = (withCommentBrace) => [
  "# A template you can copy:",
  ...(withCommentBrace ? ["# shared_focus = {", "#   id = SF_template", "#   x = 0"] : ["# (nothing tricky here)"]),
  "",
  'shared_focus = {\n\tid = SF_first\n\tx = 1\n\ty = 1\n\tcost = 1\n}',
  'shared_focus = {\n\tid = SF_second\n\tx = 2\n\ty = 1\n\tcost = 1\n}',
  'shared_focus = {\n\tid = SF_third\n\tx = 3\n\ty = 1\n\tcost = 1\n}',
].join("\n");

const count = (withCommentBrace) => {
  if (typeof resolve !== "function") return null;
  try {
    const out = resolve(TREE, "PRB", [{ file: "shared.txt", text: defs(withCommentBrace) }]);
    if (Array.isArray(out)) return out.length;
    if (out && Array.isArray(out.focuses)) return out.focuses.length;
    if (out && typeof out === "object") return Object.keys(out).length;
    return null;
  } catch (e) { return { error: e.message }; }
};

console.log("\n[CONTROL] with an ordinary comment, every definition is seen");
{
  const c = count(false);
  console.log(`     resolved: ${JSON.stringify(c)}`);
  // ⚠️ If the control resolves nothing, the fixture is wrong and the case below proves nothing.
  rec("the control fixture resolves something", typeof c === "number" && c > 0, c);
}

console.log("\n[THE BUG] a commented-out template containing an unmatched brace");
{
  const withBrace = count(true);
  const without = count(false);
  console.log(`     with a comment brace: ${JSON.stringify(withBrace)}   without: ${JSON.stringify(without)}`);
  rec("a comment brace no longer hides the definitions",
    typeof withBrace === "number" && withBrace === without, { withBrace, without });
}

console.log("\n[⭐ the real file] vanilla's paraguay_uruguay_shared_branch.txt");
{
  const P = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/paraguay_uruguay_shared_branch.txt";
  if (!fs.existsSync(P)) {
    console.log("     SKIPPED — the game is not installed");
    rec("the corpus check is skipped only because the game is absent", true, "skipped");
  } else {
    const text = fs.readFileSync(P, "utf8");
    // Count the declarations the file really contains, independently of Nova.
    const declared = (text.replace(/#[^\n]*/g, "").match(/(^|[^A-Za-z0-9_])shared_focus[ \t]*=[ \t]*\{/g) || []).length;
    // …and what Nova's own indexer reaches, through the exported resolver.
    const idsIn = (() => {
      try {
        const out = resolve(TREE.replace("SF_first", "GUAY_rekindle_old_gripes"), "PRY", [{ file: P, text }]);
        if (Array.isArray(out)) return out.length;
        if (out && Array.isArray(out.focuses)) return out.focuses.length;
        return null;
      } catch (e) { return { error: e.message }; }
    })();
    console.log(`     the file declares ${declared} shared focuses; the resolver reaches ${JSON.stringify(idsIn)}`);
    rec("the file really does declare many shared focuses", declared > 20, declared);
    // Before the fix this was 1.
    rec("the resolver now reaches more than a single definition", typeof idsIn === "number" && idsIn > 1, idsIn);
  }
}

console.log("\n[the mechanism, in source] the sibling's rule is now adopted here too");
{
  const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const at = SV.indexOf("function indexSharedFocusDefs(");
  const body = at === -1 ? "" : SV.slice(at, SV.indexOf("\nfunction ", at + 10));
  rec("indexSharedFocusDefs was found", at !== -1, "gone");
  rec("…and blanks comments before matching braces", /replace\(\/#\[\^\\n\]\*\/g/.test(body), "still matching raw text");
  // The block must still be sliced from the ORIGINAL, or every stored definition loses its comments.
  rec("…while still slicing the block from the original text", /const block = text\.slice\(/.test(body), "slices from the masked copy");
  // …and the rule it copied is still stated next door, so the two stay findable together.
  rec("the sibling rule is still documented", /#comment-brace-hides-tree/.test(SV), "the sibling tag is gone");
}

console.log(`\n=== shared focus comment brace: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
