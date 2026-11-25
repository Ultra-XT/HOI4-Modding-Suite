// #military-cannot-duplicate — EVERY OTHER MAKER HAD DUPLICATE; THE MILITARY TAB DID NOT.
//
// Events, Decisions, Characters, National Spirits, Focus Tree and Research all offer Duplicate. The Military
// tab — the newest maker — offered none, so a modder who had built "1936 Infantry" and wanted "1940 Infantry"
// with two battalions changed had to make a new template and lay out the whole regiment grid again. A
// division template is the most laborious thing in the app to rebuild: five regiment columns plus support.
//
// ⚠️ THE TRAP THIS TEST EXISTS FOR: a template carries `_origName`, its stable identity. The save matches it
// against the original block in the file so that RENAMING a template edits that block instead of adding a
// second one (#tpl-identity). A copy that inherited `_origName` would make the save rewrite the ORIGINAL
// template — the copy would eat its source, and the modder would lose the thing they were copying.
//
// So the copy drops `_origName` and everything else is carried, including `_overflowRegiments` /
// `_overflowSupport` — the battalions a raised-defines mod has beyond the five columns the grid can draw.
// A "duplicate" that quietly dropped those would not be a duplicate.
//
// Verified in the running UI on Millennium Dawn's USA (read-only — nothing was saved there):
//     16 templates → 17 · "Infantry Brigade" → "Infantry Brigade (copy)" next to it
//     meta identical ("6× line · 4× support") · copy selected · source name unchanged
//     the deploy dropdown picked the new name up
// The save round-trip below runs against a scratch mod, because that is the half that can destroy content.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");

console.log("\n[the control exists and is reachable]");
{
  rec("duplicateTemplate exists", /function duplicateTemplate\(/.test(JS), "not defined");
  rec("every template row carries a duplicate button", /class="tpl-dup" data-dup=/.test(JS), "no button in the row markup");
  rec("…and it is wired", /\.tpl-dup[\s\S]{0,160}duplicateTemplate\(/.test(JS), "not wired");
  // The row selects on click; without stopPropagation the copy button would also re-select the row.
  rec("…without the row's click stealing it", /\.tpl-dup[\s\S]{0,120}stopPropagation/.test(JS), "no stopPropagation");
  rec("the button is styled", /\.tpl-row \.tpl-dup/.test(HTML), "unstyled");
}

const FN = (() => {
  const at = JS.indexOf("function duplicateTemplate(");
  if (at === -1) return "";
  const open = JS.indexOf("{", at);
  let d = 0;
  for (let i = open; i < JS.length; i++) {
    if (JS[i] === "{") d++;
    else if (JS[i] === "}") { d--; if (d === 0) return JS.slice(at, i + 1); }
  }
  return "";
})();

console.log("\n[THE TRAP] the copy must not inherit the original's identity");
{
  rec("the function body is found", FN.length > 200, FN.length);
  rec("_origName is deleted from the copy", /delete copy\._origName/.test(FN), FN.slice(0, 240));
  rec("the copy is a deep copy, not a shared reference", /JSON\.parse\(JSON\.stringify\(/.test(FN), "shallow copy");
  rec("the copy gets a unique name", /\(copy\)/.test(FN) && /while \(S\.model\.templates\.some/.test(FN), "name may collide");
  rec("it is marked unsaved", /setUnsaved\(true\)/.test(FN), "no dirty flag");
  rec("…and the deploy dropdown is refreshed", /renderDeploy\(\)/.test(FN), "dropdown would not see it");
}

// ── The half that can destroy content: does saving a duplicate keep BOTH? ─────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dup-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "dupmod");
for (const d of ["common/country_tags", "common/countries", "history/countries", "history/units", "localisation/english"]) {
  fs.mkdirSync(path.join(MOD, d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DupMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "dupmod.mod"), `name="DupMod"\npath="${toPosix(MOD)}"\nsupported_version="1.19.*"\n`);
fs.writeFileSync(path.join(MOD, "common", "country_tags", "01_countries.txt"), 'NVA = "countries/Nova.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Nova.txt"), "graphical_culture = western_european_gfx\n");
fs.writeFileSync(path.join(MOD, "history", "countries", "NVA - Nova.txt"), 'capital = 1\noob = "NVA_1936"\n');

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(53423, () => r(s)); });
  const post = (u, b) => fetch("http://127.0.0.1:53423" + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
  const oobText = () => {
    try { const dir = path.join(MOD, "history", "units"); const f = fs.readdirSync(dir)[0];
          return f ? fs.readFileSync(path.join(dir, f), "utf8") : ""; } catch (_) { return ""; }
  };
  const mkTpl = (name, extra) => Object.assign({
    name, regiments: [{ unit: "infantry", x: 0, y: 0 }, { unit: "infantry", x: 0, y: 1 }], support: [],
  }, extra || {});

  console.log("\n[the save round-trip] a duplicate must ADD a template, never replace its source");
  {
    // 1. an original, saved once so it has a block in the file and an identity
    const first = await post("/api/army/save", { modPath: MOD, tag: "NVA", templates: [mkTpl("Line Infantry", { _origName: "Line Infantry" })], divisions: [] });
    rec("the original saves", first.status === 200 && !first.body.error, first.body.error);
    rec("…and is in the file", /Line Infantry/.test(oobText()), oobText().slice(0, 200));

    // 2. the original plus a duplicate — the copy carries NO _origName, exactly as duplicateTemplate leaves it
    const both = await post("/api/army/save", { modPath: MOD, tag: "NVA", divisions: [], templates: [
      mkTpl("Line Infantry", { _origName: "Line Infantry" }),
      mkTpl("Line Infantry (copy)", { _dirty: true }),
    ] });
    rec("saving the pair succeeds", both.status === 200 && !both.body.error, both.body.error);
    const txt = oobText();
    rec("the ORIGINAL is still there", /name = "Line Infantry"/.test(txt), txt.slice(0, 300));
    rec("…and so is the copy", /name = "Line Infantry \(copy\)"/.test(txt), txt.slice(0, 300));
    const blocks = (txt.match(/division_template\s*=\s*\{/g) || []).length;
    rec("there are two templates, not one rewritten", blocks === 2, `${blocks} division_template blocks`);
  }

  srv.closeAllConnections(); srv.close();
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n=== duplicate division template: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
