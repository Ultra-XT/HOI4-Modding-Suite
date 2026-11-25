// ensureFolderItemTemplates clones a base techtree item template for a custom research folder so its
// techs actually render. The subtle part (and the reason it exists): it must prefer a COMPLETE source
// template — one containing sub_technology_slot_0 — because some base templates (MD's infantry item)
// strip those slots, which made cloned folders log "Could not find sub_technology_slot_0" and drop
// sub-tech display. It must also be idempotent, self-heal an existing-but-incomplete template, skip
// the generic xor/line helpers, and no-op when no base template exists. Pure string in/out → hermetic.
"use strict";
const { ensureFolderItemTemplates } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };

// A well-formed containerWindowType block; `complete` adds a sub_technology_slot_0 child.
const block = (name, complete) =>
  `\tcontainerWindowType = {\n\t\tname = "${name}"\n\t\tsize = { width = 130 height = 130 }\n` +
  `\t\ticonType = { name = "bg" spriteType = "GFX_x" }\n` +
  (complete ? `\t\tinstantTextBoxType = { name = "sub_technology_slot_0" }\n` : ``) +
  `\t}`;
const count = (text, name) => (text.match(new RegExp(`name = "${name}"`, "g")) || []).length;
const dstIsComplete = (text) => /techtree_demo_item[\s\S]*?sub_technology_slot_0[\s\S]*?\n\t\}/.test(text);

// --- Creates the folder's item template, cloned from a COMPLETE source (not the incomplete one). ---
const gui1 = [block("techtree_infantry_item", false), block("techtree_armour_item", true), block("techtree_xor_item", false)].join("\n\n");
const out1 = ensureFolderItemTemplates(gui1, "demo");
check("creates techtree_demo_item", count(out1, "techtree_demo_item") === 1, count(out1, "techtree_demo_item"));
check("cloned template is COMPLETE (has sub_technology_slot_0)", dstIsComplete(out1), out1.slice(out1.indexOf("techtree_demo_item") - 20, out1.indexOf("techtree_demo_item") + 180));

// --- Idempotent: running again does not add a second copy. ---
const out1b = ensureFolderItemTemplates(out1, "demo");
check("idempotent — still exactly one techtree_demo_item", count(out1b, "techtree_demo_item") === 1, count(out1b, "techtree_demo_item"));

// --- No base template at all → returned unchanged (non-MD/-vanilla base, no throw). ---
const none = 'containerWindowType = { name = "unrelated_window" }';
check("no source template → unchanged", ensureFolderItemTemplates(none, "demo") === none);

// --- Only the generic xor/line helpers present → they are excluded, nothing is created. ---
const helpersOnly = [block("techtree_xor_item", false), block("techtree_line_item", false)].join("\n\n");
check("xor/line helpers are not cloned", count(ensureFolderItemTemplates(helpersOnly, "demo"), "techtree_demo_item") === 0);

// --- Self-heal: an existing INCOMPLETE demo template is replaced when a complete source exists. ---
const guiHeal = [block("techtree_armour_item", true), block("techtree_demo_item", false)].join("\n\n");
const outHeal = ensureFolderItemTemplates(guiHeal, "demo");
check("self-heal: incomplete demo template upgraded to complete", dstIsComplete(outHeal), outHeal.slice(outHeal.indexOf("techtree_demo_item") - 20, outHeal.indexOf("techtree_demo_item") + 180));
check("self-heal: still exactly one techtree_demo_item", count(outHeal, "techtree_demo_item") === 1, count(outHeal, "techtree_demo_item"));

// --- small_item variant: created when a _small_item source exists. ---
const guiSmall = [block("techtree_armour_item", true), block("techtree_armour_small_item", true)].join("\n\n");
const outSmall = ensureFolderItemTemplates(guiSmall, "demo");
check("creates techtree_demo_item from normal source", count(outSmall, "techtree_demo_item") === 1, count(outSmall, "techtree_demo_item"));
check("creates techtree_demo_small_item from small source", count(outSmall, "techtree_demo_small_item") === 1, count(outSmall, "techtree_demo_small_item"));

console.log(`\nFOLDER-ITEM-TEMPLATES TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
