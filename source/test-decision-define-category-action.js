// #decision-category-undefined — THE WARNING NAMED A FIX AND MADE THE USER PERFORM IT.
//
// The decisions sidebar has warned for a while that a decision_category is defined nowhere — not in the mod,
// not in a dependency, not in the base game. The warning is correct and it matters: HOI4 does not load the
// category, so every decision inside it is invisible in game. That is the shape of "many decisions had no
// effect" the user hit earlier with vrf51_cat.
//
// But the only route out lived in the tooltip: "Save any decision in it and Nova will write the definition."
// So the user was told they had a problem, told the remedy in prose, and left to carry it out by hand — for
// something the program can do itself. A warning that names a mechanical remedy should be able to apply it.
//
// No new writing logic: ensureDecisionCategoryDefined already reasons about vanilla, dependencies and
// replace_path (and is why /api/decisions/save-definition gets this right). This exposes it directly instead
// of only as a side effect of saving a decision.
//
// The part worth testing hardest is the DECLINE path. "Define it" must not write a stub for a category the
// base game already defines — that is a duplicate database entry, and the minimal `{ icon = … }` stub would
// discard whatever the real definition carried. Reporting that honestly ("already defined, nothing written")
// rather than as a success is the difference between a fix and a lie.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catdef-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const MOD = path.join(ROOT, "catdefmod");
fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CatDefMod"\nsupported_version="1.19.*"\n', "utf8");

const catFiles = () => {
  const dir = path.join(MOD, "common", "decisions", "categories");
  try { return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; }
};
const catBlob = () => {
  const dir = path.join(MOD, "common", "decisions", "categories");
  let out = "";
  for (const f of catFiles()) out += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
  return out;
};

const PORT = 42731;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const define = (body) => fetch(`http://127.0.0.1:${PORT}/api/decisions/define-category`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[the action] a category nothing defines gets defined");
    let r = await define({ categoryId: "nova_undefined_cat" });
    rec("the request succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it reports that it created the definition", r.b.created === true, r.b);
    rec("…and a categories file now exists", catFiles().length > 0, catFiles());
    rec("…defining exactly that category",
      new RegExp(`(^|\\n)\\s*nova_undefined_cat\\s*=\\s*\\{`).test(catBlob()), catBlob().slice(0, 300));
    rec("…and the reported path is inside the mod",
      String(r.b.path || "").replace(/\\/g, "/").startsWith(MOD.replace(/\\/g, "/")), r.b.path);

    console.log("\n[idempotent] pressing it twice must not write it twice");
    const before = catBlob();
    r = await define({ categoryId: "nova_undefined_cat" });
    rec("the second call succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the category is still defined exactly once",
      (catBlob().match(/(^|\n)\s*nova_undefined_cat\s*=\s*\{/g) || []).length === 1,
      (catBlob().match(/(^|\n)\s*nova_undefined_cat\s*=\s*\{/g) || []).length);
    rec("…and nothing else in the file changed", catBlob() === before, "file drifted on a no-op");

    console.log("\n[the decline] a VANILLA category must NOT be restubbed");
    // The stub is minimal; writing one over a real vanilla definition would drop everything else it carries.
    // Anchored on a category vanilla genuinely ships rather than one I assume it does.
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    let vanillaCat = "";
    try {
      const dir = path.join(V, "common", "decisions", "categories");
      for (const f of fs.readdirSync(dir)) {
        const m = /(^|\n)\s*([A-Za-z0-9_]+)\s*=\s*\{/.exec(fs.readFileSync(path.join(dir, f), "utf8"));
        if (m) { vanillaCat = m[2]; break; }
      }
    } catch (_) {}
    rec("a real vanilla category was found to test against", !!vanillaCat, vanillaCat || "none");
    if (vanillaCat) {
      const beforeDecline = catBlob();
      r = await define({ categoryId: vanillaCat });
      rec("the request succeeded", r.s === 200 && !r.b.error, r.b || r.s);
      rec("…but it did NOT claim to create anything", r.b.created === false, r.b);
      rec("…and it says so explicitly rather than reporting a bare success", r.b.alreadyDefined === true, r.b);
      rec(`…and no stub for ${vanillaCat} was written into the mod`,
        !new RegExp(`(^|\\n)\\s*${vanillaCat}\\s*=\\s*\\{`).test(catBlob()), catBlob().slice(0, 300));
      rec("…and the mod's own categories file is untouched", catBlob() === beforeDecline, "file drifted");
    }

    console.log("\n[input] an id that is not an id must be refused, not written");
    for (const bad of ["", "  ", "has space", "has/slash", "quote\"inside", "brace}here"]) {
      r = await define({ categoryId: bad });
      rec(`refused ${JSON.stringify(bad)}`, r.s === 400 && !!r.b.error, { s: r.s, b: r.b });
    }
    const definedIds = [...catBlob().matchAll(/(?:^|\n)\s*([^\s=]+)\s*=\s*\{/g)].map((m) => m[1]);
    rec("…and every id in the file is still a legal id",
      definedIds.length > 0 && definedIds.every((id) => /^[A-Za-z0-9_]+$/.test(id)), definedIds);

    console.log("\n[the icon] a sprite key that is not one must not reach the file");
    // The id was validated from the start; the ICON was checked with a PREFIX test only, so anything
    // beginning `GFX_decision_category_` was written verbatim — including a stray brace, which closes the
    // category early and swallows the rest of the file.
    for (const badIcon of ['GFX_decision_category_x }', 'GFX_decision_category_x"', "GFX_decision_category_x = {", "not_a_sprite"]) {
      const id = "nova_icon_" + Math.abs(badIcon.length * 7 + badIcon.charCodeAt(22 % badIcon.length));
      r = await define({ categoryId: id, categoryIcon: badIcon });
      rec(`an icon of ${JSON.stringify(badIcon)} did not reach the file`,
        r.s === 200 && !catBlob().includes(badIcon), { s: r.s, wrote: catBlob().includes(badIcon) });
    }
    // …and whatever it fell back to must still be a legal key, and the file must still be parseable.
    const iconVals = [...catBlob().matchAll(/icon\s*=\s*([^\s\r\n]+)/g)].map((m) => m[1]);
    rec("every icon written is a well-formed sprite key",
      iconVals.length > 0 && iconVals.every((v) => /^GFX_decision_category_[A-Za-z0-9_]+$/.test(v)), iconVals);
    let bd = 0, bok = true;
    for (const ch of catBlob()) { if (ch === "{") bd++; else if (ch === "}") { bd--; if (bd < 0) bok = false; } }
    rec("…and the categories file is still brace-balanced", bok && bd === 0, bd);

    console.log("\n[the client] the warning offers the action");
    const dj = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");
    rec("a Define button is rendered on the warning", /class="cat-define-btn"/.test(dj), "button not rendered");
    rec("…and it calls the endpoint", /\/api\/decisions\/define-category/.test(dj), "endpoint not called");
    // The badge sits inside the folder header, whose own click toggles the folder.
    rec("…and it does not also collapse the folder", /ev\.stopPropagation\(\)/.test(dj), "no stopPropagation");
    rec("…and the tooltip no longer tells the user to do it by hand",
      !/Save any decision in it and Nova will write the definition/.test(dj), "stale instruction still present");

    console.log(`\n=== decision define-category action: ${checks} checks, ${fails.length} failed ===`);
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
