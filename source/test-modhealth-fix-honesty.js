// Two Mod Health buttons that told the user something untrue about what they would do.
//
// #fix-button-on-a-file-that-isnt-there — the "✨ AI Auto-Fix" button is rendered for every problem carrying a
// `file`. country_no_flag sets `file: "gfx/flags/<TAG>.tga"` — a path whose ABSENCE is the entire problem, and
// a binary image no LLM can author. So the card offered the button, and confirm() asked permission to let a
// model rewrite a .tga that does not exist. The server has no branch for that rule, so it fell through to the
// generic AI path and died on "File not found in the mod" — or, with no API key configured, blamed the missing
// key, implying the fix would work once one was added. The problem's own message already names the real fix
// ("Add one in Country Setup → Flag"), which no button offered.
//
// #confirm-names-the-wrong-file — for a deterministic fix the dialog read
// `Re-save "<problem.file>" to fix this automatically?`. For missing_localization, problem.file is the
// ENTITY's script file — the focus tree / ideas / decisions .txt. The server never opens it: it appends the
// key to a localisation .yml (an existing *_l_english.yml, else a new custom_nova_l_english.yml). So the
// dialog took consent for one file and modified a different one, and the named file was byte-identical
// afterwards. It also read as far more invasive than it is, which is a good reason for a careful modder to
// refuse a perfectly safe one-line loc append.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-mhhonesty-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");

// ── which rules may offer a fix button ────────────────────────────────────────────────────────────
ok("there is an explicit no-autofix list", /const NO_AUTOFIX = new Set\(/.test(src), "no list");
ok("country_no_flag is on it", /"country_no_flag"/.test(src.slice(src.indexOf("NO_AUTOFIX"), src.indexOf("NO_AUTOFIX") + 400)), src.slice(src.indexOf("NO_AUTOFIX"), src.indexOf("NO_AUTOFIX") + 400));
ok("orphan_spirit is still on it", /"orphan_spirit"/.test(src.slice(src.indexOf("NO_AUTOFIX"), src.indexOf("NO_AUTOFIX") + 400)));
// ⚠️ The window below is deliberately generous: the entries carry the REASON each rule is excluded, so the
// set grows by paragraphs rather than by lines, and a tight slice would fail as an explanation is added.
// #fix-button-on-a-file-nova-could-not-open — the rule means Nova could not READ the file, so a fix path
// that reads first dies exactly where the scan did; and if a retry succeeds, the problem was a lock rather
// than the contents and a model would rewrite a file that was never wrong.
const NO_AUTOFIX_BLOCK = src.slice(src.indexOf("NO_AUTOFIX"), src.indexOf("NO_AUTOFIX") + 2600);
ok("a file Nova could not open is on it too", /"file_unreadable"/.test(NO_AUTOFIX_BLOCK),
  "file_unreadable can still be handed to a model");
// The fix is to install a mod or correct its name — neither knowable from the file. And its `file` is
// descriptor.mod, which EXISTS, so the generic path would not fail safely: it would edit the descriptor,
// most likely by deleting the dependency line, silently changing load order.
ok("a missing dependency is on it", /"dependency_not_found"/.test(NO_AUTOFIX_BLOCK),
  "dependency_not_found can still be handed to a model");
// ⛔ THE ONE WHERE THE CARD CONTRADICTED ITSELF: this rule's own help text ends "there is no auto-fix",
// and the card offered one. Both halves are asserted, so they cannot drift apart again.
ok("…and the cross-file duplicate the help text says has no auto-fix",
  /"loc_duplicate_key_across_files"/.test(NO_AUTOFIX_BLOCK),
  "the card offers a fix the explainer says does not exist");
ok("…and that help text still says so",
  /loc_duplicate_key_across_files:[\s\S]{0,900}?there is no auto-fix/.test(src),
  "the explainer no longer promises there is no auto-fix");
// ⚠️ ANCHORED ON THE SMALLEST THING THAT CARRIES THE MEANING. This used to match the whole condition
// verbatim — `if (p.file && !NO_AUTOFIX.has(p.rule))` — and broke the moment a second, per-PROBLEM gate was
// added beside it (`&& p.autoFix !== false`, for a broken_reference whose cause is a replace_path rather
// than a typo). The rule that matters is that the render path consults the list at all.
ok("the render gate uses it", /!NO_AUTOFIX\.has\(p\.rule\)/.test(src), "gate not wired");
// …and the per-problem gate, which a rule-level list cannot express: one rule can be fixable in general
// while a single finding under it is not.
ok("…and a problem may also veto its own fix button", /p\.autoFix\s*!==\s*false/.test(src), "per-problem gate not wired");
ok("…and it explains why a flag can't be auto-fixed", /fix-button-on-a-file-that-isnt-there/.test(src), "no marker comment");

// ── the confirm text must describe what actually changes ──────────────────────────────────────────
// Bound the slice to the STATEMENT, not to a magic character count. This read `+ 900`, which was long
// enough for three branches and silently too short for five: adding a deterministic rule pushed the
// later wordings out of the window and three assertions failed while the code they check was correct.
// A correct rule with a detector too literal is the commonest way a guard on this project goes wrong,
// and the deterministic tier is expected to keep growing.
const confirmStart = src.indexOf("const confirmMsg");
const confirmEnd = src.indexOf("if (!confirm(confirmMsg))", confirmStart);
const confirmBlock = src.slice(confirmStart, confirmEnd === -1 ? confirmStart + 2000 : confirmEnd);
// #deterministic-tier-typed-in-four-places — this asserted the literal `problem.rule ===
// "missing_localization"`, which pinned HOW the branch was written rather than WHAT it promises. The
// membership now lives in one set so the tier can be widened in a single place, and a second rule
// (tooltip_key_no_localization) has the identical repair — a key written into a .yml, script untouched —
// so it must get the identical wording. Assert the property, and assert every loc-only rule is in the set.
const locOnlyBlock = src.slice(src.indexOf("const LOC_ONLY_FIXES"), src.indexOf("const LOC_ONLY_FIXES") + 300);
ok("the loc-only rules are named in one set", /const LOC_ONLY_FIXES = new Set\(/.test(src), "no set");
ok("missing_localization is one of them", /"missing_localization"/.test(locOnlyBlock), locOnlyBlock);
ok("so is the tooltip key, which is the same repair", /"tooltip_key_no_localization"/.test(locOnlyBlock), locOnlyBlock);
ok("missing_localization gets its own wording", /LOC_ONLY_FIXES\.has\(problem\.rule\)/.test(confirmBlock), confirmBlock);
ok("…which says only a localisation file is touched", /Only a localisation \.yml is touched/.test(confirmBlock), confirmBlock);
ok("…and says the named script file is NOT modified", /is not modified/.test(confirmBlock), confirmBlock);
ok("other deterministic fixes keep the plain re-save wording", /Re-save "\$\{problem\.file\}"/.test(confirmBlock), confirmBlock);
ok("…and AI fixes keep theirs", /Let the AI try to fix this error/.test(confirmBlock), confirmBlock);
// Every deterministic rule whose repair is NOT a plain re-save needs wording that says what it really does.
// Consent to a re-save is not consent to a deletion, and it is not consent to editing a line either.
ok("deleting duplicate lines says DELETE, not re-save", /Delete \$\{\(problem\.copies/.test(confirmBlock), confirmBlock);
ok("…and promises the game is unchanged, which is why it is safe",
  /nothing changes in game/.test(confirmBlock), confirmBlock);
ok("closing an unterminated quote says which line it edits", /Close the quote at the end of line \$\{problem\.line\}/.test(confirmBlock), confirmBlock);

// ── the pasted report must be sendable, and must say what it left out ─────────────────────────────
// #copy-report-is-too-big-to-paste — it listed every problem: 3.05 MB on Rise of Nations, 0.73 MB on Road
// to 56. A GitHub issue caps near 65 KB and a Discord message at 2,000 characters, so the button people
// press to ask for help produced something they could not send. Capped PER RULE (five examples of each of
// nineteen rules diagnoses more than two hundred duplicate_ids), which brought Rise of Nations to 21 KB,
// verified in the running app.
const reportBlock = src.slice(src.indexOf("function buildReport"), src.indexOf("async function copyReport"));
ok("the report caps how many it lists", /const PER_RULE\s*=\s*\d+/.test(reportBlock), "no cap");
ok("…per RULE, so every problem type still appears", /shown\[p\.rule\]/.test(reportBlock), reportBlock.slice(0, 120));
ok("…and says what it did not list", /Not listed:/.test(reportBlock), "silent truncation");
ok("…naming how many of each were omitted", /n2 \+ " more " \+ r/.test(reportBlock), "omission line does not name the counts");
// The SUMMARY must stay complete — that is what makes a truncated report still triageable.
ok("the by-type summary is not capped", /By type: /.test(reportBlock) && !/By type[\s\S]{0,200}PER_RULE/.test(reportBlock));
// …and the MAP section too, or capping only half of it leaves the report just as unsendable: Old World
// Blues alone produces 761 map findings. Verified in the running app at 19.2 KB with both sections capped.
ok("the map/version section is capped as well", /const PER_LABEL\s*=\s*\d+/.test(reportBlock), "map section uncapped");
ok("…and states its omissions too", (reportBlock.match(/Not listed:/g) || []).length >= 2, "only one section says what it left out");

// A panel must not promise a completeness another panel stopped providing.
// #copy-report-is-too-big-to-paste — the crash panel told the user "use 📋 Copy report above for the
// complete list", which the cap made false; and "use Show more" would be false too, since MAX_ROWS slices
// the list before the DOM so the toggle only un-collapses what is already rendered.
{
  // ⚠️ __dirname, not ROOT — ROOT here is the scratch mods folder, not the repo.
  // ⚠️ And comments are stripped, because the marker comment beside the fix quotes both wordings it
  // replaced; a check over raw source would find its own explanation and pass.
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const crashSrc = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8"));
  ok("the crash panel no longer promises Copy report has everything",
    !/complete list/i.test(crashSrc), "stale completeness claim");
  ok("…and does not promise Show more reveals the unrendered rows",
    !/Show more<\/b> below to see them all/i.test(crashSrc), "second false claim");
  ok("…while still saying how many it left out", /more, not listed here/.test(crashSrc), crashSrc.slice(0, 80));
}

// ── and the promise must be true: the entity's script file must come back byte-identical ──────────
const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MH"\nsupported_version="1.18.*"\n');
const SCRIPT = path.join(MOD, "common", "ideas", "probe_ideas.txt");
const SCRIPT_BYTES = "ideas = {\n\tcountry = {\n\t\tprobe_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { stability_factor = 0.05 }\n\t\t}\n\t}\n}\n";
fs.writeFileSync(SCRIPT, SCRIPT_BYTES, "utf8");

const PORT = 39969, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const before = fs.readFileSync(SCRIPT);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/modhealth/fix`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        problem: { rule: "missing_localization", entityId: "probe_spirit", file: "common/ideas/probe_ideas.txt" },
      }),
    }).then((x) => x.json());
    ok("the localisation fix succeeds", r && r.ok !== false && !r.error, r);
    ok("…the named script file is byte-identical afterwards",
      Buffer.compare(fs.readFileSync(SCRIPT), before) === 0, "script file was modified");

    const locFiles = fs.readdirSync(path.join(MOD, "localisation", "english")).filter((f) => /\.yml$/i.test(f));
    ok("…a localisation file is what actually changed", locFiles.length > 0, locFiles);
    const locText = locFiles.map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n");
    ok("…and it now defines the key", /probe_spirit:\d*\s*"/.test(locText), locText.slice(0, 200));

    console.log("\ntest-modhealth-fix-honesty: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
