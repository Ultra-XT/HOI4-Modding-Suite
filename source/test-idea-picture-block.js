// National-spirit (idea) picture write helpers, previously untested. buildMinimalCountryIdeaBlock makes
// a fresh idea block for the "set spirit picture" path; mergePictureIntoIdeaBlock sets/updates the
// picture of an EXISTING idea block WITHOUT clobbering the rest (round-trip). Both normalise the picture
// token by stripping the GFX_idea_ prefix (HOI4 idea `picture =` wants the bare key, not the sprite name).
"use strict";
const { buildMinimalCountryIdeaBlock, mergePictureIntoIdeaBlock } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const pictureLines = (s) => (s.match(/^\s*picture\s*=/gm) || []).length;

// --- buildMinimalCountryIdeaBlock ---
const b1 = buildMinimalCountryIdeaBlock("GRE_reform_spirit", "GFX_idea_my_pic");
check("minimal block opens with the idea id", /^GRE_reform_spirit\s*=\s*\{/.test(b1), b1);
check("minimal block strips GFX_idea_ prefix from picture", /picture\s*=\s*my_pic\b/.test(b1) && !/GFX_idea_/.test(b1), b1);
check("minimal block has an (empty) modifier block", /modifier\s*=\s*\{\s*\}/.test(b1.replace(/\n/g, " ")), b1);
check("minimal block is brace-balanced", balanced(b1), b1);

const b2 = buildMinimalCountryIdeaBlock("GRE_reform_spirit", "");
check("no picture token → no picture line", pictureLines(b2) === 0, b2);
check("no-picture block still has id + modifier + balanced", /GRE_reform_spirit\s*=\s*\{/.test(b2) && /modifier\s*=\s*\{/.test(b2) && balanced(b2), b2);

const b3 = buildMinimalCountryIdeaBlock("GRE_reform_spirit", "bare_token");
check("a bare token (no GFX_idea_) is used as-is", /picture\s*=\s*bare_token\b/.test(b3), b3);

// --- mergePictureIntoIdeaBlock ---
const existing = `GRE_reform_spirit = {\n\tpicture = old_pic\n\tmodifier = {\n\t\tstability_factor = 0.1\n\t}\n}`;
const m1 = mergePictureIntoIdeaBlock(existing, "GFX_idea_new_pic");
check("replaces an existing picture (stripped)", /picture\s*=\s*new_pic\b/.test(m1) && !/old_pic/.test(m1), m1);
check("does not duplicate the picture line", pictureLines(m1) === 1, pictureLines(m1));
check("preserves the rest of the block (modifier)", /stability_factor\s*=\s*0\.1/.test(m1), m1);
check("merged block stays brace-balanced", balanced(m1), m1);

// Block with NO picture → insert one after the opening brace, before the existing body.
const noPic = `GRE_reform_spirit = {\n\tmodifier = {\n\t\twar_support_factor = 0.05\n\t}\n}`;
const m2 = mergePictureIntoIdeaBlock(noPic, "added_pic");
check("inserts a picture when the block had none", pictureLines(m2) === 1 && /picture\s*=\s*added_pic\b/.test(m2), m2);
check("inserted picture sits inside the idea block, body preserved", /GRE_reform_spirit\s*=\s*\{[\s\S]*picture\s*=\s*added_pic[\s\S]*war_support_factor/.test(m2) && balanced(m2), m2);

// Empty token → block returned unchanged (no-op, never blanks the picture).
check("empty token leaves the block unchanged", mergePictureIntoIdeaBlock(existing, "") === existing);
check("whitespace-only token leaves the block unchanged", mergePictureIntoIdeaBlock(existing, "   ") === existing);

console.log(`\nIDEA-PICTURE-BLOCK TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
