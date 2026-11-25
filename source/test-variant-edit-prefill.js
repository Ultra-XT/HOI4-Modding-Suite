// #edit-variant-prefill — THE DESIGNER LISTED YOUR OWN DESIGNS WITH NO WAY TO OPEN ONE.
//
// Reported from play: edit-variant should prefill everything and overwrite, plus a "brand new" button.
//
// The OVERWRITE half already worked, and that is the interesting part of the diagnosis. /api/equipment/
// variant/save does `readCountryVariants(...).filter((v) => v.name !== name)` and then pushes — saving a
// design under an existing name has always replaced it, and the server comment calls that "the intended
// upsert". What was missing was the PREFILL: the Designer's own "Designed variants on TAG" list offered a
// delete × and nothing else, so editing a design meant retyping every field from scratch and hoping you
// matched the name.
//
// A prefill DID exist — openVariantInDesigner, reached from the arsenal's variant detail as "🔧 Rebuild in
// the Designer". It was never offered from the Designer's own list. Same shape as the gridbox and icon bugs:
// the capability is written, one caller has it, its sibling does not.
//
// The two save routes must not be confused, which is why the prefill is split out rather than reused whole:
//   · a Nova-managed design is upserted BY NAME (this list)
//   · the arsenal's Rebuild targets an arbitrary create_equipment_variant by file + blockIdx
// Setting editingVariant on a name-upsert would send the save down the block-rewrite route.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}
const ARMY = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i === -1) return "";
  let d = 0, end = -1;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  return src.slice(i, end);
}

(async () => {
  try {
    console.log("\n[ground truth] the overwrite half was already there");
    rec("saving a design drops any existing one of the same name first",
      /readCountryVariants\(activeRoot, tag\)\.filter\(\(v\) => v\.name !== name\)/.test(SERVER), "no upsert");
    rec("…and then pushes the new one", /merged\.push\(variant\);/.test(SERVER), "no push");
    rec("…while a name owned by the base game or a dependency is still refused",
      /already ships a variant named/.test(SERVER), "collision guard gone");

    console.log("\n[the prefill] split out so both routes can use it");
    const pre = fnBody(ARMY, "prefillDesignerFrom");
    rec("prefillDesignerFrom exists", !!pre, "not found");
    rec("…and sets every field of the form", ["dsgName", "dsgIcon", "dsgObsolete", "dsgChassis", "dsgTier", "dsgDesigner", "dsgTag"]
      .every((id) => pre.includes(id)), ["dsgName", "dsgIcon", "dsgObsolete", "dsgChassis", "dsgTier", "dsgDesigner", "dsgTag"].filter((id) => !pre.includes(id)));
    rec("…including the modules", /S\.equip\.pick = Object\.assign\(\{\}, v\.modules \|\| \{\}\)/.test(pre), "modules not loaded");
    rec("…and repaints the blueprint from them", /renderBlueprint\(c\)/.test(pre), "blueprint not repainted");
    rec("…it declines rather than half-loading when the chassis is missing", /if \(!c\) return false;/.test(pre), "no guard");
    rec("…and asks before discarding work in progress",
      /S\.equip\.variantDirty && !confirm/.test(pre), "silently discards");
    rec("…and claims NO edit target of its own — that is the caller's business",
      !/editingVariant =/.test(pre), "prefill decides the save route");

    console.log("\n[two routes] a name-upsert and a block rewrite must not be confused");
    const openArsenal = fnBody(ARMY, "openVariantInDesigner");
    const openOwn = fnBody(ARMY, "editNovaVariantInDesigner");
    rec("the arsenal's Rebuild still claims its block", /editingVariant = \{ file: v\.file, blockIdx: v\.blockIdx/.test(openArsenal), "block target lost");
    rec("editNovaVariantInDesigner exists", !!openOwn, "not found");
    rec("…and explicitly claims none", /S\.equip\.editingVariant = null;/.test(openOwn), "claims a block it does not have");
    rec("…mapping the stored {slot, module} LIST to the picks the Designer keys by slot",
      /Object\.fromEntries\(\(Array\.isArray\(v\.modules\) \? v\.modules : \[\]\)\.map\(\(m\) => \[m\.slot, m\.module\]\)\)/.test(openOwn),
      "modules not reshaped");
    rec("…reading the stored chassisType, not a `type` the JSON does not have",
      /type: v\.chassisType/.test(openOwn), "wrong field");
    rec("…and telling the user that saving under the same name replaces it",
      /Save under the same name to replace it/.test(openOwn), "no explanation");

    console.log("\n[reachable] the Designer's own list now offers it");
    const list = fnBody(ARMY, "loadDesignerVariants");
    rec("each row has an edit control", /class="dr-edit" data-i="\$\{vs\.indexOf\(v\)\}"/.test(list), "no edit control");
    rec("…wired to open that design", /editNovaVariantInDesigner\(v, tag\)/.test(list), "not wired");
    rec("…and the delete it always had is still there", /class="dr-del" data-name=/.test(list), "delete lost");
    rec("the row styling places the two together", /\.deploy-row \.dr-edit/.test(HTML), "unstyled");

    console.log("\n[brand new] a design that has nothing to do with the last one");
    const nu = fnBody(ARMY, "startBrandNewVariant");
    rec("startBrandNewVariant exists", !!nu, "not found");
    rec("…clears the picked modules", /S\.equip\.pick = \{\};/.test(nu), "modules kept");
    rec("…clears the name and icon", /\["dsgName", ""\], \["dsgIcon", ""\]/.test(nu), "fields kept");
    rec("…drops any edit target", /S\.equip\.editingVariant = null;/.test(nu), "still pointed at a design");
    rec("…asks before discarding work in progress", /variantDirty && !confirm/.test(nu), "silently discards");
    rec("…and rebuilds the form", /onDesignerChange\(\)/.test(nu), "form not repainted");
    rec("the button exists", /id="dsgNewBtn"/.test(ARMY), "no button");
    rec("…and is wired", /nb\.addEventListener\("click", startBrandNewVariant\)/.test(ARMY), "not wired");

    console.log("\n[back-out] take the edit control off the list again");
    {
      const reverted = ARMY.replace(/<span class="dr-edit" data-i="\$\{vs\.indexOf\(v\)\}"[\s\S]{0,200}?<\/span>/, "");
      rec("the control patched cleanly", reverted !== ARMY, "anchor did not match");
      rec("…and the list is back to delete-only",
        !/class="dr-edit"/.test(fnBody(reverted, "loadDesignerVariants")), "edit control survived");
      const noNew = ARMY.replace(/id="dsgNewBtn"/, 'id="dsgNewBtnX"');
      rec("…and removing the brand-new button is detectable", !/id="dsgNewBtn"/.test(noNew), "assertion not load-bearing");
    }

    console.log("\n[still valid]");
    rec("army.js parses", (() => { try { new Function(ARMY); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ARMY); return "ok"; } catch (e) { return String(e.message); } })());
    rec("army.js is versioned so the change ships", /army\.js\?v=\d+/.test(HTML), "no version");

    console.log(`\n=== variant edit prefill: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
