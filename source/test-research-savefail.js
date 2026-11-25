// SAVE-FAILURE invariants (#save-failure-status, #save-failure-retry).
//
// Three properties, each of which was violated and each of which loses the user's work quietly:
//   1. the save must judge success by the HTTP STATUS as well as the body — checking only
//      `result.error` let an HTTP 500 whose JSON lacked that key run the entire success path;
//   2. a staged write that FAILED must stay in its pending map so Save retries it, instead of being
//      announced once and thrown away;
//   3. the post-save catalog reload must not race the flushes — it ends in clearDirty(), so firing it
//      un-awaited wiped the dirty flag the failure handling had just set, leaving a queued retry that
//      the editor no longer believed in.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const i = src.indexOf("async function saveAllChanges");
ok(i !== -1, "saveAllChanges exists");
const open = src.indexOf("{", i);
let d = 0, end = open;
for (let j = open; j < src.length; j++) {
  if (src[j] === "{") d++;
  else if (src[j] === "}") { d--; if (!d) { end = j; break; } }
}
const body = src.slice(open + 1, end);

// ---- 1. STATUS IS PART OF SUCCESS ----
ok(/if \(!res\.ok \|\| !result \|\| result\.error\)/.test(body),
  "the save fails on a bad HTTP status, an unparseable body, OR an error field");
ok(/try \{ result = await res\.json\(\); \} catch \(_\) \{ result = null; \}/.test(body),
  "an unparseable response body is treated as failure, not as an empty success");
ok(/HTTP \$\{res\.status\}/.test(body), "the thrown message names the status so the user learns something");
// the success path must be downstream of that throw
const throwIdx = body.indexOf("the server rejected the save");
const clearIdx = body.indexOf("clearDirty();");
ok(throwIdx !== -1 && clearIdx !== -1 && throwIdx < clearIdx,
  "the failure check runs BEFORE dirty/dirtyTechIds/pendingDeletions are cleared");

// ---- 2. FAILED FLUSHES STAY QUEUED ----
ok(/let flushFailures = 0;/.test(body), "flush failures are counted");
const flushCount = (body.match(/const stillPending = \{\};/g) || []).length;
ok(flushCount === 2, `both staged flushes keep their failures (found ${flushCount} of 2)`);
ok(/guiLabelFontPending = stillPending;/.test(body), "the font flush keeps failures queued");
ok(/guiLabelTextPending = stillPending;/.test(body), "the text flush keeps failures queued");
ok(!/guiLabelFontPending = \{\};/.test(body), "the font flush no longer clears its queue unconditionally");
ok(!/guiLabelTextPending = \{\};/.test(body), "the text flush no longer clears its queue unconditionally");
ok(/stillPending\[key\] = p; flushFailures \+= 1;/.test(body), "each failure is retained AND counted");
ok(/press Save Changes again to retry/.test(body), "the alert tells the user the write is still pending");
ok(/if \(flushFailures > 0\) \{ dirty = true; return false; \}/.test(body),
  "a partial save re-marks dirty and reports failure to the caller");

// ---- 3. THE RELOAD MUST NOT RACE THE FLUSHES ----
ok(/const reloadPromise = loadCatalog\(\);/.test(body), "the post-save reload is kept as a promise");
ok(/await reloadPromise;/.test(body), "the reload is awaited before the final dirty decision");
const relIdx = body.indexOf("await reloadPromise");
const decIdx = body.indexOf("if (flushFailures > 0)");
ok(relIdx !== -1 && decIdx !== -1 && relIdx < decIdx,
  "...and it is awaited BEFORE that decision, or clearDirty() inside loadCatalog would undo it");

// the observability hooks the live test depends on
ok(/window\.__researchStagedTextCount/.test(src), "staged label-text count is exposed for testing");
ok(/window\.__researchStagedFontCount/.test(src), "staged label-font count is exposed for testing");

console.log(`test-research-savefail: ${checks} checks passed`);
