// Focus-tree country labelling (/api/focus/country-trees). A focus_tree's owner can be written
// `tag = GER` OR `original_tag = GER`; `\btag` can't match `original_tag` (underscore is a word char), so
// MD's netherlands_focus (original_tag = HOL) used to fall through to a stray `tag = BRA` buried in a
// focus effect and got labelled "Brazil". The fix matches original_tag, and when there's NO country-block
// tag at all, derives the owner from the most common focus-id prefix (HOL_*) instead of a stray tag.
// Run: npm run test:focus-country-label
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-foclabel-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Nova Focus Label E2E"\nreplace_path="common/national_focus"\n');
  // (1) owner via original_tag = HOL, with a stray `tag = BRA` deep inside a focus effect (the trap).
  // It also inherits a shared group whose offset is per-country — so the resolved tag (HOL vs the stray
  // BRA) decides WHERE the shared focuses land. This is the exact mechanism behind the overlap: under
  // the old BRA mislabel no offset matched and the shared tree piled onto the main tree.
  mk(path.join(mod, "common", "national_focus", "netherlands.txt"),
    'focus_tree = {\n' +
    '\tid = netherlands_focus\n' +
    '\tcountry = {\n\t\tfactor = 0\n\t\tmodifier = {\n\t\t\tadd = 20\n\t\t\toriginal_tag = HOL\n\t\t}\n\t}\n' +
    '\tshared_focus = SH_eu\n' +
    '\tfocus = {\n\t\tid = HOL_Paars\n\t\tx = 0\n\t\ty = 0\n\t\tcompletion_reward = { create_faction = { } add_to_faction = { tag = BRA } }\n\t}\n' +
    '\tfocus = {\n\t\tid = HOL_Shell\n\t\tx = 2\n\t\ty = 0\n\t\tcompletion_reward = { BRA = { add_to_faction = { tag = BRA } } }\n\t}\n' +
    '}\n');
  // A shared group with a per-country offset: HOL moves it down 10 rows, BRA would move it down 99.
  mk(path.join(mod, "common", "national_focus", "eu_shared.txt"),
    'shared_focus = {\n\tid = SH_eu\n\ticon = GFX_goal_generic_construct_civ_factory\n\tx = 5\n\ty = 0\n' +
    '\toffset = { x = 0 y = 10 trigger = { tag = HOL } }\n' +
    '\toffset = { x = 0 y = 99 trigger = { tag = BRA } }\n}\n');
  // (2) NO country block at all → must fall back to the focus-id prefix (FRA), NOT a stray `tag = GER`.
  mk(path.join(mod, "common", "national_focus", "france_like.txt"),
    'focus_tree = {\n\tid = france_like_focus\n' +
    '\tfocus = {\n\t\tid = FRA_a\n\t\tx = 0\n\t\ty = 0\n\t\tcompletion_reward = { every_country = { tag = GER } }\n\t}\n' +
    '\tfocus = {\n\t\tid = FRA_b\n\t\tx = 2\n\t\ty = 0\n\t}\n' +
    '}\n');
  // (3) plain `tag = GER` still works (no regression).
  mk(path.join(mod, "common", "national_focus", "germany.txt"),
    'focus_tree = {\n\tid = ger_focus\n\tcountry = {\n\t\tmodifier = { add = 10 tag = GER }\n\t}\n' +
    '\tfocus = { id = GER_a x = 0 y = 0 }\n}\n');
  return mod;
}

function get(port, url) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${url}`, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on("error", reject);
  });
}

(async () => {
  console.log("=== FOCUS country labelling (original_tag + focus-id fallback) ===");
  const mod = buildMod();
  const PORT = 3743;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  try {
    const j = await get(PORT, `/api/focus/country-trees?modPath=${encodeURIComponent(mod)}`);
    const trees = j.trees || [];
    const tagOf = (file) => { const e = trees.find((t) => t.fileName === file); return e ? e.tag : "(missing)"; };

    ok("original_tag = HOL is read as HOL (not the stray tag = BRA)  [the bug]", tagOf("netherlands.txt") === "HOL", { got: tagOf("netherlands.txt"), trees: trees.map((t) => t.fileName + ":" + t.tag) });
    ok("no country block → owner from the focus-id prefix FRA (not a stray tag = GER)", tagOf("france_like.txt") === "FRA", { got: tagOf("france_like.txt") });
    ok("plain `tag = GER` still resolves to GER (no regression)", tagOf("germany.txt") === "GER", { got: tagOf("germany.txt") });
    ok("netherlands.txt is NOT labelled BRA anymore", tagOf("netherlands.txt") !== "BRA");

    ok("endpoint returned a tree list", Array.isArray(trees) && trees.length >= 3, { n: trees.length });

    // End-to-end overlap fix: because the tree resolves to HOL, its inherited shared focus gets the HOL
    // offset (y=10), NOT the BRA offset (y=99) — i.e. the shared tree lands where MD intended instead of
    // piling onto the main tree. (Base y=0 + HOL offset 10 = 10.)
    const sh = await get(PORT, `/api/focus/shared?modPath=${encodeURIComponent(mod)}&relPath=${encodeURIComponent("common/national_focus/netherlands.txt")}`);
    ok("shared endpoint resolves the tree's tag as HOL", sh.tag === "HOL", { tag: sh.tag });
    const sf = (sh.focuses || []).find((f) => f.id === "SH_eu");
    ok("the inherited shared focus gets the HOL offset (y=10), not the BRA offset (y=99)  [the overlap fix]", sf && sf.y === 10, { sf });
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nFOCUS-COUNTRY-LABEL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
