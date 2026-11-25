// CUSTOM-TAB DELETE invariants (#tab-delete-verify).
//
// Deleting a tab writes to the mod immediately (folder def + GUI container + sprite), so it is one of
// the few genuinely destructive-on-click paths left. It used to mutate the editor FIRST and then fire
// the request as `try { await fetch(...) } catch (_) {}` — ignoring the status and the body. A failed
// delete therefore left the folder in the mod while the editor showed the tab gone and had already
// moved its techs to infantry: an orphaned tab that still shows in-game, with no error reported.
//
// The create path already had the right discipline ("a failed scaffold never shows a phantom tab").
// These checks keep delete matching it, and keep create from regressing to delete's old shape.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// ---- DELETE ----
const di = src.indexOf("/api/research/delete-custom-folder");
ok(di !== -1, "the delete endpoint is called");
// grab a window around the call: the request, its verification, and what follows
const region = src.slice(Math.max(0, di - 1200), di + 1800);

ok(!/try \{\s*await fetch\("\/api\/research\/delete-custom-folder"[\s\S]{0,400}?\} catch \(_\) \{\}/.test(src),
  "the delete response is no longer swallowed by an empty catch");
ok(/if \(!res\.ok \|\| !data \|\| data\.error\) throw new Error/.test(region),
  "the delete verifies status AND body before believing it worked");
ok(/the server refused the delete \(HTTP \$\{res\.status\}\)/.test(region),
  "a bad status produces an explicit message");
ok(/Nothing was changed — the tab and its technologies are untouched\./.test(region),
  "the failure message tells the user nothing was changed");
ok(/Couldn’t delete the tab/.test(region), "a failed delete is reported, not silent");

// ORDERING: the server call must precede the editor mutations, or a failure has already changed things.
const callIdx = src.indexOf('body: JSON.stringify({ folderKey: deletedFolder');
const filterIdx = src.indexOf("customTabs = customTabs.filter(t => t.key !== tabKey);");
const rehomeIdx = src.indexOf('t.folder = "infantry_folder";');
ok(callIdx !== -1 && filterIdx !== -1 && rehomeIdx !== -1, "all three delete steps are present");
ok(callIdx < filterIdx, "the mod is stripped BEFORE the tab leaves the editor's store");
ok(callIdx < rehomeIdx, "the mod is stripped BEFORE the techs are reassigned to infantry");
// and the failure path must bail out entirely
const bail = src.slice(callIdx, filterIdx);
ok(/return;/.test(bail), "a failed delete returns without touching the editor state");

// ---- CREATE (the pattern delete was made to match) ----
const ci = src.indexOf("/api/research/create-custom-folder");
ok(ci !== -1, "the create endpoint is called");
const cregion = src.slice(ci, ci + 1200);
ok(/if \(!res\.ok \|\| data\.error\) throw new Error/.test(cregion),
  "create still verifies status AND body");
const pushIdx = src.indexOf("customTabs.push({ name, key, folder, layout, ledger });");
ok(pushIdx !== -1 && ci < pushIdx, "create still scaffolds BEFORE showing the tab in the editor");
ok(/a failed scaffold never shows a phantom tab/.test(src), "create's ordering rationale is still documented");
ok(/Icon upload failed: /.test(src), "a failed icon upload aborts the create rather than continuing");

console.log(`test-research-tabdelete: ${checks} checks passed`);
