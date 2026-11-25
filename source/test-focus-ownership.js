// Round-trip safety test for setFocusTreeOwnership: rewriting a focus_tree's ownership header
// (country selection-weight block + default flag) must NEVER alter any focus = { ... } block or
// other content. This guards the focus-tree ownership editor (#116).
const fs = require("fs");
const { setFocusTreeOwnership } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// Brace balance sanity (a corrupt rewrite would unbalance braces).
function braceBalanced(s) {
  let d = 0;
  for (const ch of s) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) return false; } }
  return d === 0;
}
// Extract every `focus = { ... }` block's id, to confirm focuses are untouched.
function focusIds(s) {
  return (s.match(/(?:^|\n)\s*focus\s*=\s*\{[\s\S]*?\n\s*id\s*=\s*([A-Za-z0-9_]+)/g) || [])
    .map((m) => (m.match(/id\s*=\s*([A-Za-z0-9_]+)\s*$/) || [])[1]).filter(Boolean);
}

// --- Case 1: replace an existing country block + default, two focuses present ---
const tree1 = `focus_tree = {
\tid = my_tree
\tcountry = {
\t\tfactor = 0
\t\tmodifier = {
\t\t\tadd = 10
\t\t\ttag = GER
\t\t}
\t}
\tdefault = no

\tfocus = {
\t\tid = focus_alpha
\t\tx = 1
\t\ty = 1
\t\tcost = 10
\t}
\tfocus = {
\t\tid = focus_beta
\t\tprerequisite = { focus = focus_alpha }
\t\tx = 2
\t\ty = 2
\t}
}
`;
{
  const focusBlocksBefore = tree1.slice(tree1.indexOf("focus = {"));
  const out = setFocusTreeOwnership(tree1, { tag: "GRE", weight: 100, isDefault: false });
  check("case1: brace balanced", braceBalanced(out), out);
  check("case1: id unchanged", /\bid\s*=\s*my_tree\b/.test(out), "");
  check("case1: tag changed to GRE", /tag\s*=\s*GRE\b/.test(out) && !/tag\s*=\s*GER\b/.test(out), "");
  check("case1: weight changed to 100", /add\s*=\s*100\b/.test(out) && !/add\s*=\s*10\b/.test(out), "");
  check("case1: focus blocks byte-identical", out.slice(out.indexOf("focus = {")) === focusBlocksBefore, "focuses changed!");
  check("case1: same focus ids preserved", JSON.stringify(focusIds(out)) === JSON.stringify(["focus_alpha", "focus_beta"]), focusIds(out).join(","));
}

// --- Case 2: no country block present → insert after id; focuses intact ---
const tree2 = `focus_tree = {
\tid = bare_tree
\tfocus = {
\t\tid = solo_focus
\t\tx = 5
\t\ty = 5
\t}
}
`;
{
  const focusBlocksBefore = tree2.slice(tree2.indexOf("focus = {"));
  const out = setFocusTreeOwnership(tree2, { tag: "ITA", weight: 50 });
  check("case2: brace balanced", braceBalanced(out), out);
  check("case2: country block inserted", /country\s*=\s*\{/.test(out) && /tag\s*=\s*ITA\b/.test(out) && /add\s*=\s*50\b/.test(out), "");
  check("case2: focus block byte-identical", out.slice(out.indexOf("focus = {")) === focusBlocksBefore, "focus changed!");
  check("case2: id unchanged", /\bid\s*=\s*bare_tree\b/.test(out), "");
}

// --- Case 3: real Hellenic Ascendancy focus tree (19 focuses) ---
const HELLENIC_TREE = require("path").join(require("os").homedir(), "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "hellenic_ascendancy", "common", "national_focus", "hellenic_ascendancy_focus_tree.txt");
if (fs.existsSync(HELLENIC_TREE)) {
  const orig = fs.readFileSync(HELLENIC_TREE, "utf8");
  const idsBefore = focusIds(orig);
  const out = setFocusTreeOwnership(orig, { tag: "GRE", weight: 1000 });
  check("case3: brace balanced", braceBalanced(out), "");
  check("case3: all focus ids preserved", JSON.stringify(focusIds(out)) === JSON.stringify(idsBefore), `before=${idsBefore.length} after=${focusIds(out).length}`);
  check("case3: focus count > 10 (real tree)", idsBefore.length > 10, "count=" + idsBefore.length);
  check("case3: weight raised to 1000", /add\s*=\s*1000\b/.test(out), "");
  check("case3: tree id unchanged", /\bid\s*=\s*hellenic_ascendancy_tree\b/.test(out), "");
  // The focus section must be byte-identical (only the header changed).
  const focusStart = orig.indexOf("focus = {");
  check("case3: focus section byte-identical", focusStart > 0 && out.slice(out.indexOf("focus = {")) === orig.slice(focusStart), "");
} else {
  console.log("  (skip) case3: Hellenic tree not found on disk");
}

// --- Case 5: MULTIPLE focus_tree blocks → edit only the one matching treeId; the other is untouched ---
const multiTree = `focus_tree = {
\tid = tree_one
\tcountry = {
\t\tfactor = 0
\t\tmodifier = {
\t\t\tadd = 5
\t\t\ttag = AAA
\t\t}
\t}
\tfocus = {
\t\tid = f_one
\t\tx = 0
\t\ty = 0
\t}
}

focus_tree = {
\tid = tree_two
\tcountry = {
\t\tfactor = 0
\t\tmodifier = {
\t\t\tadd = 7
\t\t\ttag = BBB
\t\t}
\t}
\tfocus = {
\t\tid = f_two
\t\tx = 0
\t\ty = 0
\t}
}
`;
{
  const out = setFocusTreeOwnership(multiTree, { treeId: "tree_two", tag: "CCC", weight: 99 });
  check("case5: brace balanced", braceBalanced(out), out);
  // tree_two (the target) is rewritten...
  check("case5: target tree tag → CCC", /tag\s*=\s*CCC\b/.test(out) && !/tag\s*=\s*BBB\b/.test(out), out);
  check("case5: target tree weight → 99", /add\s*=\s*99\b/.test(out), out);
  // ...while tree_one is byte-identical (untouched header + focus).
  const oneBefore = multiTree.slice(0, multiTree.indexOf("focus_tree = {", 1));
  const oneAfter = out.slice(0, out.indexOf("focus_tree = {", 1));
  check("case5: the OTHER tree (tree_one) is byte-identical", oneAfter === oneBefore, oneAfter);
  check("case5: tree_one still tag AAA / weight 5", /tag\s*=\s*AAA\b/.test(out) && /add\s*=\s*5\b/.test(out), "");
  check("case5: both focuses preserved", JSON.stringify(focusIds(out)) === JSON.stringify(["f_one", "f_two"]), focusIds(out).join(","));
}

// --- Case 6: no focus_tree block → throws a clear error (rather than corrupting unrelated text) ---
{
  let threw = false, msg = "";
  try { setFocusTreeOwnership("# just a comment\nsome_other = { id = x }\n", { tag: "GER" }); } catch (e) { threw = true; msg = e.message; }
  check("case6: throws when no focus_tree block", threw && /focus_tree block not found/.test(msg), msg);
}

// --- Case 7: SHARED mode drops the country scoping (the Discord report: picking "Shared / fallback
//     tree" left the tag in place, so the save was a byte-for-byte no-op and the mode looked dead). ---
{
  const out = setFocusTreeOwnership(tree1, { treeId: "my_tree", shared: true, weight: 2, isDefault: true });
  check("case7: shared drops the tag entirely", !/\btag\s*=/.test(out.slice(0, out.indexOf("focus = {"))), out.slice(0, 200));
  // Vanilla's generic tree scores factor = 1, so a shared tree must out-score it (MD ships factor = 2).
  check("case7: writes country = { factor = 2 }", /country\s*=\s*\{\s*factor\s*=\s*2\s*\}/.test(out), out.slice(0, 200));
  check("case7: default = yes", /default\s*=\s*yes\b/.test(out), "");
  check("case7: brace balanced", braceBalanced(out), "");
  check("case7: focuses untouched", focusIds(out).join(",") === "focus_alpha,focus_beta", focusIds(out).join(","));
}

// --- Case 8: a COMPLEX country rule (OR tag list + DLC gate) must never be rebuilt from (tag, weight).
//     Previously the whole block was replaced by a single-tag template: on real files that silently
//     deleted 9 countries and a has_dlc gate on a Save the user never even edited. ---
const complexTree = `focus_tree = {
\tid = shared_tree
\tcountry = {
\t\tfactor = 0
\t\tmodifier = {
\t\t\tadd = 10
\t\t\tOR = {
\t\t\t\ttag = ITA
\t\t\t\ttag = RSI
\t\t\t\ttag = RDS
\t\t\t}
\t\t\thas_dlc = "Gotterdammerung"
\t\t}
\t}
\tdefault = no
\tfocus = {
\t\tid = c_focus
\t\tx = 0
\t\ty = 0
\t}
}
`;
{
  const out = setFocusTreeOwnership(complexTree, { treeId: "shared_tree", tag: "ITA", weight: 55 });
  check("case8: all three countries survive", /tag\s*=\s*ITA/.test(out) && /tag\s*=\s*RSI/.test(out) && /tag\s*=\s*RDS/.test(out), out);
  check("case8: the DLC gate survives", /has_dlc\s*=\s*"Gotterdammerung"/.test(out), out);
  check("case8: the OR block survives", /OR\s*=\s*\{/.test(out), out);
  check("case8: weight patched in place 10 → 55", /add\s*=\s*55\b/.test(out) && !/add\s*=\s*10\b/.test(out), out);
  check("case8: brace balanced", braceBalanced(out), "");
  // Same weight → nothing at all should be rewritten.
  check("case8: no-op save is byte-identical",
    setFocusTreeOwnership(complexTree, { treeId: "shared_tree", tag: "ITA", weight: 10 }) === complexTree, "file churned");
}

// --- Case 9: re-tagging a complex rule must REFUSE rather than delete its conditions ---
{
  let threw = false, msg = "";
  try { setFocusTreeOwnership(complexTree, { treeId: "shared_tree", tag: "GRE", weight: 100 }); } catch (e) { threw = true; msg = e.message; }
  check("case9: refuses to retag a complex rule", threw, "it rewrote the block!");
  check("case9: the error names what would be lost", /ITA/.test(msg) && /RSI/.test(msg) && /RDS/.test(msg), msg);
  let threw2 = false;
  try { setFocusTreeOwnership(complexTree, { treeId: "shared_tree", shared: true, weight: 2 }); } catch (e) { threw2 = true; }
  check("case9: refuses to make a complex rule shared", threw2, "it rewrote the block!");
}

// --- Case 10: `original_tag` is NOT a synonym for `tag` (it follows the tag a country STARTED as,
//     through civil wars / releases). Millennium Dawn uses it on 51 of its 93 trees. ---
const origTagTree = `focus_tree = {
\tid = turkey_focus
\tcountry = {
\t\tfactor = 0
\t\tmodifier = {
\t\t\tadd = 10
\t\t\toriginal_tag = TUR
\t\t}
\t}
\tfocus = {
\t\tid = t_focus
\t\tx = 0
\t\ty = 0
\t}
}
`;
{
  const out = setFocusTreeOwnership(origTagTree, { treeId: "turkey_focus", tag: "TUR", weight: 77 });
  check("case10: stays original_tag (not downgraded to tag)", /original_tag\s*=\s*TUR/.test(out), out);
  check("case10: weight applied", /add\s*=\s*77\b/.test(out), out);
  check("case10: no-op save is byte-identical",
    setFocusTreeOwnership(origTagTree, { treeId: "turkey_focus", tag: "TUR", weight: 10 }) === origTagTree, "file churned");
}

// --- Case 11: a `country =` whose brace is on the NEXT line was not found, so a SECOND country block
//     got inserted beside it and the real one silently kept winning. ---
{
  const nextLine = `focus_tree = {
\tid = nl_tree
\tcountry =
\t{
\t\tfactor = 0
\t\tmodifier = { add = 10 tag = AAA }
\t}
\tfocus = {
\t\tid = nl_focus
\t\tx = 0
\t\ty = 0
\t}
}
`;
  const out = setFocusTreeOwnership(nextLine, { treeId: "nl_tree", tag: "BBB", weight: 30 });
  check("case11: still exactly ONE country block", (out.match(/\bcountry\s*=/g) || []).length === 1, out);
  check("case11: it is the edited one", /tag\s*=\s*BBB/.test(out) && !/tag\s*=\s*AAA/.test(out), out);
  check("case11: brace balanced", braceBalanced(out), "");
}

// --- Case 12: a commented-out `#focus_tree = {` must not be mistaken for the real tree ---
{
  const commented = `# focus_tree = {
#\tid = old_tree
# }
focus_tree = {
\tid = live_tree
\tfocus = {
\t\tid = live_focus
\t\tx = 0
\t\ty = 0
\t}
}
`;
  const out = setFocusTreeOwnership(commented, { tag: "GER", weight: 100 });
  check("case12: the ownership header lands in the LIVE tree", /id = live_tree\n\tcountry = \{/.test(out), out.slice(0, 220));
  check("case12: the comment block is untouched", out.startsWith("# focus_tree = {\n#\tid = old_tree\n# }\n"), out.slice(0, 60));
  check("case12: brace balanced", braceBalanced(out), "");
}

// --- Case 4: endpoint round-trip (GET parse + POST write) on a TEMP mod (real mod untouched) ---
(async () => {
  const http = require("http");
  const os = require("os");
  const path = require("path");
  const { createApp } = require("./server.js");
  const PORT = 3503;
  const req = (method, p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error("Bad JSON: " + b.slice(0, 150))); } });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });

  const app = createApp();
  const srv = app.listen(PORT, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-focus-"));
  try {
    // Make it a real mod dir (descriptor) so guards pass, with a focus tree under common/national_focus.
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Temp Test Mod"\n', "utf8");
    const nfDir = path.join(tmp, "common", "national_focus");
    fs.mkdirSync(nfDir, { recursive: true });
    const rel = "common/national_focus/t.txt";
    fs.writeFileSync(path.join(nfDir, "t.txt"), tree1, "utf8");

    // GET reads current ownership (tree1: tag GER, weight 10, default no).
    const got = await req("GET", `/api/focus/tree-properties?modPath=${encodeURIComponent(tmp)}&relPath=${encodeURIComponent(rel)}`);
    check("case4: GET returns ok", got && got.ok === true, JSON.stringify(got).slice(0, 120));
    const t = (got.trees || [])[0] || {};
    check("case4: GET parses current tag/weight/default", t.tag === "GER" && t.weight === 10 && t.isDefault === false, JSON.stringify(t));

    // POST changes ownership to GRE / weight 1000 / default yes.
    const posted = await req("POST", "/api/focus/tree-properties", { modPath: tmp, relPath: rel, treeId: "my_tree", tag: "GRE", weight: 1000, isDefault: true });
    check("case4: POST reports changed", posted && posted.ok === true && posted.changed === true, JSON.stringify(posted).slice(0, 150));

    const after = fs.readFileSync(path.join(nfDir, "t.txt"), "utf8");
    check("case4: file now owns GRE at weight 1000", /tag\s*=\s*GRE\b/.test(after) && /add\s*=\s*1000\b/.test(after), "");
    check("case4: default flipped to yes", /default\s*=\s*yes\b/.test(after), "");
    check("case4: focuses preserved after endpoint write", focusIds(after).join(",") === "focus_alpha,focus_beta", focusIds(after).join(","));
    check("case4: a backup was created", typeof posted.backupPath === "string" && posted.backupPath.length > 0 && fs.existsSync(posted.backupPath), posted.backupPath || "(none)");

    // A tree scoring 0 can never be selected by any country, so the endpoint must refuse to write one.
    // The reporter's own file was in exactly this state (`add = 0`) — saved fine, did nothing in game.
    const zero = await req("POST", "/api/focus/tree-properties", { modPath: tmp, relPath: rel, treeId: "my_tree", tag: "GRE", weight: 0 });
    check("case4b: weight 0 is refused", !!zero.error && /at least 1|never picked/i.test(zero.error), JSON.stringify(zero).slice(0, 160));

    // The Discord report, end to end: switch the tree to shared and the tag must actually go away.
    const sh = await req("POST", "/api/focus/tree-properties", { modPath: tmp, relPath: rel, treeId: "my_tree", tag: "", shared: true, weight: 2, isDefault: true });
    check("case4c: shared save reports changed", sh && sh.ok === true && sh.changed === true, JSON.stringify(sh).slice(0, 150));
    const shFile = fs.readFileSync(path.join(nfDir, "t.txt"), "utf8");
    check("case4c: the country tag is gone from the file", !/\btag\s*=/.test(shFile.slice(0, shFile.indexOf("focus = {"))), shFile.slice(0, 200));
    check("case4c: now country = { factor = 2 }", /country\s*=\s*\{\s*factor\s*=\s*2\s*\}/.test(shFile), shFile.slice(0, 200));
    check("case4c: focuses still intact", focusIds(shFile).join(",") === "focus_alpha,focus_beta", focusIds(shFile).join(","));
    // And GET must now report it as a shared tree rather than "not assigned".
    const back = await req("GET", `/api/focus/tree-properties?modPath=${encodeURIComponent(tmp)}&relPath=${encodeURIComponent(rel)}`);
    const bt = (back.trees || [])[0] || {};
    check("case4c: GET reads it back as an untagged, scoring tree", bt.tag === "" && bt.hasCountryBlock === true && bt.weight === 2, JSON.stringify(bt));

    // Guard: refuse to write the vanilla game root.
    const vroot = String(require("./server.js").constants.resolveHoi4GameRoot() || "");
    if (vroot) {
      const blocked = await req("POST", "/api/focus/tree-properties", { modPath: vroot, relPath: rel, tag: "GRE" });
      check("case4: refuses to write vanilla game root", !!blocked.error, JSON.stringify(blocked).slice(0, 120));
    }
  } catch (e) {
    fail++; console.log("  FAIL case4 harness →", e.message);
  } finally {
    srv.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nFOCUS-OWNERSHIP TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
