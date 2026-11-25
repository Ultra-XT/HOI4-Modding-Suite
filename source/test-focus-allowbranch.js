/*
 * Regression guard for the focus `allow_branch` field wiring.
 *
 * The LOGIC (template emit, rewrite upsert, removal, byte-for-byte preservation) is verified
 * in-browser against the real shipped functions — app.js can't be executed headlessly because
 * its top-level code touches the DOM. What this test protects is the WIRING: a future refactor
 * (human or AI) must not silently drop one of the integration points, which would make the field
 * render but never save/load. Each assertion below maps to one required hook.
 *
 * Run: node test-focus-allowbranch.js
 */
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

let fail = 0;
const ok = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) fail++; };

console.log("focus allow_branch wiring:");

// 1. HTML: the Advanced-section field + its AI generator button.
ok("index.html has #sb-focus-allowbranch textarea",
  /id="sb-focus-allowbranch"/.test(indexHtml));
ok("index.html has the allow_branch AI button",
  /data-target="sb-focus-allowbranch"[\s\S]*?data-type="allow_branch"/.test(indexHtml));

// 2. Live-change listener (so editing the field marks the focus dirty).
ok("app.js wires sb-focus-allowbranch into the input listeners",
  /"sb-focus-available",\s*"sb-focus-allowbranch"/.test(appJs));

// 3. Load focus -> sidebar.
ok("app.js loads focus.allowBranch into the field",
  /allowBranchEl\.value\s*=\s*focus\.allowBranch/.test(appJs));

// 4. Read sidebar -> focus.
ok("app.js reads the field back into focus.allowBranch",
  /focus\.allowBranch\s*=\s*allowBranchEl\.value\.trim\(\)/.test(appJs));

// 5. Parse existing block -> allowBranch + sourceAllowBranch (source needed for the dirty diff).
ok("app.js parses allowBranch from the block",
  /allowBranch:\s*extractFocusSectionBody\(blockText,\s*"allow_branch"\)/.test(appJs));
ok("app.js parses sourceAllowBranch from the block",
  /sourceAllowBranch:\s*extractFocusSectionBody\(blockText,\s*"allow_branch"\)/.test(appJs));

// 6. Existing-focus save: upsert the allow_branch section only when changed.
ok("app.js upserts allow_branch in rewriteFocusBlockConditions",
  /upsertSection\(out,\s*"allow_branch",\s*focus\.allowBranch\)/.test(appJs));
ok("app.js guards the upsert with a source comparison",
  /\(focus\.allowBranch \|\| ""\)\s*!==\s*\(focus\.sourceAllowBranch \|\| ""\)/.test(appJs));

// 7. New-focus save: focusBlockTemplate must emit the trigger section, and the call site must
//    feed it the typed value from the parsed focus.
ok("focusBlockTemplate emits allow_branch",
  /emitTriggerSection\("allow_branch",\s*focus\.allowBranch\)/.test(appJs));
// The call site used to name each field it forwarded. That whitelist drifted: it listed the trigger fields
// and nothing else, so a new focus's icon and cost — set from the sidebar, like these are — were read from
// the creation-time snapshot instead and silently lost on the first save. It now forwards the whole parsed
// focus, which covers allowBranch and every other field at once. Assert THAT, or this test would push the
// implementation back toward the list that dropped them.
ok("new-focus call site forwards the whole parsed focus (not a hand-listed subset)",
  /const merged = \{\s*\.\.\.focus,\s*\.\.\.full\s*\}/.test(appJs));

console.log("\n  " + (11 - fail) + "/11 passed");
process.exit(fail ? 1 : 0);
