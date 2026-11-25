// #focus-id-unique-per-file-only — THE EDITOR CHECKED A NEW FOCUS ID AGAINST THE ONE TREE THAT WAS OPEN.
//
// Focus ids are GLOBALLY unique in Hearts of Iron IV, not per-file. Measured on the shipping game: 81
// national_focus files, 10,608 distinct focus ids, and ZERO id appearing in more than one file — vanilla
// holds the invariant absolutely. Nova's `getAllFocusIdsSet()` reads `parsed.focuses`, i.e. only the tree
// currently loaded, so creating or renaming a focus onto an id ANOTHER TREE IN THE SAME MOD already uses was
// accepted without a word. Two consequences, both silent:
//   * the second focus never loads — the game keeps one of them;
//   * both trees fight over one localisation string, because the loc key IS the focus id.
//
// Nova already knew this from the other direction: #starter-tree-duplicate-ids exists because copying the
// generic tree twice produced two trees with the same 56 focus ids. The knowledge lived in the copier and
// never reached the editor.
//
// The fix is server-side (/api/focus/all-ids) plus two client call sites. A same-mod collision is refused —
// objective data loss — while a collision with the base game or a dependency is only WARNED about, the same
// existence-vs-suitability split the character and technology guards use (#overlay-uniqueness).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusid-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "focusid");
const NF = path.join(MOD, "common", "national_focus");
fs.mkdirSync(NF, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FocusId"\nsupported_version="1.19.*"\n', "utf8");

const tree = (treeId, tag, focuses) => [
  "focus_tree = {",
  `\tid = ${treeId}`,
  `\tcountry = { factor = 0 modifier = { add = 10 tag = ${tag} } }`,
  ...focuses.flatMap((f) => ["\tfocus = {", `\t\tid = ${f}`, "\t\tx = 1", "\t\ty = 1", "\t\tcost = 10", "\t}"]),
  "}",
  "",
].join("\n");

fs.writeFileSync(path.join(NF, "alpha.txt"), tree("nv_alpha_tree", "AAA", ["nv_shared_name", "nv_alpha_only"]), "utf8");
fs.writeFileSync(path.join(NF, "beta.txt"), tree("nv_beta_tree", "BBB", ["nv_beta_only"]), "utf8");
// A commented-out focus id must NOT count as taken — a comment is not a definition.
fs.appendFileSync(path.join(NF, "beta.txt"), "# focus = { id = nv_commented_out x = 1 y = 1 }\n", "utf8");
// …and the shape that actually needs the comment mask: an old id commented out ABOVE the live one, inside a
// real focus block. Unmasked, the lazy `id =` search finds the commented line first, so the scan records the
// DEAD id and never records the live one — the lookup then blocks a name that is free and allows one that is
// taken. Ordinary modder practice; a whole-line `#focus = {` is not, because the regex needs `focus` after
// only whitespace and never matches a line starting with `#` either way.
fs.writeFileSync(path.join(NF, "gamma.txt"), [
  "focus_tree = {",
  "\tid = nv_gamma_tree",
  "\tcountry = { factor = 0 modifier = { add = 10 tag = CCC } }",
  "\tfocus = {",
  "\t\t# id = nv_renamed_away",
  "\t\tid = nv_gamma_live",
  "\t\tx = 1",
  "\t\ty = 1",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 43351;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const ids = () => fetch(`http://127.0.0.1:${PORT}/api/focus/all-ids?modPath=${encodeURIComponent(MOD)}`)
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] vanilla never reuses a focus id across files");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
    let vfiles = [];
    try { vfiles = fs.readdirSync(V).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    rec("vanilla's focus directory was readable", vfiles.length > 40, vfiles.length);
    const seen = new Map();
    for (const f of vfiles) {
      const masked = fs.readFileSync(path.join(V, f), "utf8").replace(/#[^\n\r]*/g, "");
      for (const m of masked.matchAll(/(^|\n)\s*(?:shared_)?focus\s*=\s*\{[\s\S]{0,400}?\bid\s*=\s*([A-Za-z0-9_.:-]+)/g)) {
        if (!seen.has(m[2])) seen.set(m[2], new Set());
        seen.get(m[2]).add(f);
      }
    }
    const dupes = [...seen.entries()].filter(([, s]) => s.size > 1);
    rec("…across ten thousand focus ids", seen.size > 8000, seen.size);
    rec("…NOT ONE appears in two files", dupes.length === 0, dupes.slice(0, 5).map(([k, s]) => k + ":" + [...s].join("|")));

    console.log("\n[the endpoint] every focus id in the mod, and where it lives");
    let r = await ids();
    rec("the lookup succeeded", r.s === 200 && r.b.ok, r.b || r.s);
    rec("it found the first tree's ids", r.b.mine && r.b.mine.nv_shared_name === "alpha.txt", r.b.mine);
    rec("…and the SECOND tree's, which the editor never had open", r.b.mine && r.b.mine.nv_beta_only === "beta.txt", r.b.mine);
    rec("a COMMENTED-OUT focus is not counted as taken",
      !(r.b.mine && Object.prototype.hasOwnProperty.call(r.b.mine, "nv_commented_out")), r.b.mine);
    rec("a focus_tree's OWN id is not mistaken for a focus id",
      !(r.b.mine && Object.prototype.hasOwnProperty.call(r.b.mine, "nv_alpha_tree")), r.b.mine);
    rec("an id commented out ABOVE the live one is not recorded",
      !(r.b.mine && Object.prototype.hasOwnProperty.call(r.b.mine, "nv_renamed_away")), r.b.mine);
    rec("…and the LIVE id under it is", r.b.mine && r.b.mine.nv_gamma_live === "gamma.txt", r.b.mine);

    console.log("\n[inherited] the base game's ids are reported SEPARATELY, not merged in");
    rec("vanilla ids came back as inherited, not as the mod's own",
      r.b.inherited && Object.keys(r.b.inherited).length > 1000
      && !Object.keys(r.b.mine).some((k) => Object.prototype.hasOwnProperty.call(r.b.inherited, k)),
      { mine: Object.keys(r.b.mine || {}).length, inherited: Object.keys(r.b.inherited || {}).length });
    rec("…and a real vanilla focus is among them",
      r.b.inherited && Object.prototype.hasOwnProperty.call(r.b.inherited, "GER_industrial_expansion"),
      Object.keys(r.b.inherited || {}).slice(0, 5));

    console.log("\n[the client] the two id-entry paths consult it, and treat the two cases differently");
    const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
    rec("the lookup helper exists", /async function loadFocusIdsAcrossMod/.test(APP), "missing");
    rec("…and the create path calls it",
      /const allIds = getAllFocusIdsSet\(\);[\s\S]{0,400}?loadFocusIdsAcrossMod\(\)/.test(APP), "create path not wired");
    rec("…and the rename path calls it",
      /ids\.delete\(selected\.id\);[\s\S]{0,400}?loadFocusIdsAcrossMod\(\)/.test(APP), "rename path not wired");
    rec("a SAME-MOD collision is refused outright",
      /is already used by \$\{mineFile\} in this mod/.test(APP), "no same-mod refusal");
    rec("…while an INHERITED one only warns",
      /return `WARN:Focus ID/.test(APP) && /clash\.startsWith\("WARN:"\)/.test(APP), "no warn/refuse split");
    rec("both handlers are async, or the await would be a syntax error",
      /async function applyCreateFocus\(/.test(APP) && /async function applySelectedFocusIdEdit\(/.test(APP), "not async");
    rec("the cache is dropped after a save, or it goes stale immediately",
      /invalidateFocusIdsAcrossMod\(\);/.test(APP) && /markDirty\(false\);\s*\n\s*\/\/ #focus-id-unique-per-file-only/.test(APP),
      "not invalidated on save");
    rec("a failed lookup does not block editing",
      /return null;\s*\n\s*\}\s*\n\s*return focusIdsAcrossModCache;/.test(APP), "no fallback");

    console.log("\n[the rule itself] the reason a same-mod clash is fatal");
    // The loc key IS the focus id, so two focuses with one id also collide in localisation.
    rec("Nova writes the focus id as its own localisation key",
      /\$\{focusId\}:0|focus\.id\}:0|`\$\{id\}:0/.test(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"))
      || /removeLocalizationStanzasForFocusId/.test(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")),
      "could not confirm the loc-key convention");

    console.log(`\n=== focus id global uniqueness: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
