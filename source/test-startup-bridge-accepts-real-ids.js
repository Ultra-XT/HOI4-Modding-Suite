// #startup-bridge-narrower-than-the-savers + #culture-case-mangled
//
// (1) assertStartupItemId guards the writers that add an item to a country's game-start history. Its
// CHARACTER branch was widened once already, under a comment describing the trap exactly: Nova "would create
// a character it then refused to add to a country, and told the user the game could not load script the game
// ships". The other two branches had the identical fault and were never widened with it.
//
//   EVENT — the namespace may itself contain dots. Vanilla ships add_namespace = MUN_czech.news, Millennium
//   Dawn israel.coalition, The Road to 56 thirty-nine of them; 54 of 1,977 namespaces across the corpus are
//   dotted and 611 event ids are therefore multi-segment. /api/events/save accepts them, so an event Nova
//   had just written could not then be granted to a country at game start.
//
//   DECISION and SPIRIT — an interior hyphen is legal and shipping content uses it: 23 idea ids carry one,
//   and the decision save deliberately permits '-' and '.' for ids already on disk, naming Millennium Dawn's
//   Communist-State_invite.
//
// (2) The Country Setup → Map bridge lowercased graphical_culture. It is a bareword the game looks up
// verbatim and mods ship mixed-case ones — Rise of Nations declares `graphical_culture = SWI` — so the Map
// received "swi", the create endpoint stored what it was given, and the country ended up with a culture
// token nothing defines. HOI4 then silently falls back to a default look. The TAG on the line above is
// upper-cased because a tag is defined to be upper-case; a culture has no such rule, so the correct
// transform is none.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
// ⚠️ stripJsComments because this fix's own comments quote every pattern below — and NORMALISE THE LINE
// ENDINGS, because the patterns below anchor on a bare `\n`. This repo checks out with core.autocrlf=true,
// so server.js is CRLF in a fresh working tree (and after any stash/checkout round trip); `;\n` then never
// matches `;\r\n`, the guard's expression cannot be lifted, and this test fails for a reason that has
// nothing to do with the guard. Normalising once here covers every pattern in the file.
const CODE = stripJsComments(SV).replace(/\r\n/g, "\n");

console.log("\n[the gate] lifted out of server.js and executed, not restated");
{
  // Pull the real `ok = ...` expression out of assertStartupItemId and run it, so this tests the shipped
  // guard rather than a copy that could drift from it.
  const at = CODE.indexOf("function assertStartupItemId(");
  const body = at === -1 ? "" : CODE.slice(at, CODE.indexOf("\nfunction ", at + 10));
  rec("the guard is findable", at !== -1 && !!body, "not found");
  const m = /const ok = type === "event"([\s\S]*?);\n/.exec(body);
  rec("…and its expression is extractable", !!m, body.slice(0, 200));
  if (m) {
    // eslint-disable-next-line no-new-func
    const isOk = new Function("id", "type", `const ok = type === "event"${m[1]}; return ok;`);

    console.log("\n[events] a dotted namespace is legal HOI4 and the saver already accepts it");
    rec("a plain event id passes", isOk("germany.1", "event") === true, isOk("germany.1", "event"));
    // THE BUG: refused, so an event in a dotted namespace could never be granted at game start.
    rec("a dotted namespace passes", isOk("israel.coalition.5", "event") === true, isOk("israel.coalition.5", "event"));
    rec("…and a two-dot one", isOk("MUN_czech.news.12", "event") === true, isOk("MUN_czech.news.12", "event"));
    console.log("  CONTROLS — the shape must still be <namespace>.<integer>");
    rec("no trailing number is refused", isOk("germany.abc", "event") === false, isOk("germany.abc", "event"));
    rec("a bare namespace is refused", isOk("germany.", "event") === false, isOk("germany.", "event"));
    rec("no dot at all is refused", isOk("plain", "event") === false, isOk("plain", "event"));
    rec("a leading digit is refused", isOk("1germany.1", "event") === false, isOk("1germany.1", "event"));

    console.log("\n[decisions and spirits] an interior hyphen is legal and shipping content uses it");
    rec("a plain id passes", isOk("nova_decision", "decision") === true, isOk("nova_decision", "decision"));
    // THE BUG: Millennium Dawn's own decision id was refused by the bridge.
    rec("Communist-State_invite passes", isOk("Communist-State_invite", "decision") === true, isOk("Communist-State_invite", "decision"));
    rec("a hyphenated spirit id passes", isOk("AST_curtiss-wright_organization_idea", "spirit") === true, isOk("AST_curtiss-wright_organization_idea", "spirit"));
    rec("…and NKO_Marxism-Leninism", isOk("NKO_Marxism-Leninism", "spirit") === true, isOk("NKO_Marxism-Leninism", "spirit"));
    console.log("  CONTROLS — the first character rule is the one HOI4 really has");
    rec("a leading hyphen is refused", isOk("-leading", "decision") === false, isOk("-leading", "decision"));
    rec("a leading digit is refused", isOk("9bad", "decision") === false, isOk("9bad", "decision"));
    rec("a space is refused", isOk("has space", "decision") === false, isOk("has space", "decision"));
    rec("a brace is refused, which is what this guard exists for",
      isOk("bad}id", "decision") === false, isOk("bad}id", "decision"));

    console.log("\n[the sibling] the character branch that was widened first still is");
    rec("a hyphenated vanilla character passes", isOk("AUS_arthur_seyss-inquart", "character") === true, isOk("AUS_arthur_seyss-inquart", "character"));
    rec("…and an accented one", isOk("IRE_Éamon_de_valera", "character") === true, isOk("IRE_Éamon_de_valera", "character"));
  }
}

console.log("\n[⭐ the savers] the bridge must not be narrower than what wrote the content");
{
  // The defect is a DISAGREEMENT, so assert the other side too. If the event saver is ever narrowed, these
  // two should be looked at together rather than this one being widened further.
  const evSaver = /\/\^\[A-Za-z_\]\[A-Za-z0-9_\]\*\(\?:\\\.\[A-Za-z0-9_\]\+\)\*\$\//.test(CODE);
  rec("the event saver still accepts dot-separated namespaces", evSaver, "the event save guard changed shape");
}

console.log("\n[graphical culture] a token the game matches verbatim must not be case-folded");
{
  const CS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8"));
  const at = CS.indexOf("ccGraphicalCulture");
  const near = at === -1 ? "" : CS.slice(Math.max(0, at - 200), at + 200);
  rec("the bridge's culture read is findable", at !== -1, "not found");
  // THE BUG: .trim().toLowerCase() turned Rise of Nations' SWI into swi.
  rec("it no longer lowercases the culture", !/ccGraphicalCulture[\s\S]{0,80}toLowerCase/.test(near), near.slice(0, 200));
  // CONTROL: the TAG on the neighbouring line must still be upper-cased — a tag IS defined to be upper-case.
  rec("…while the tag is still upper-cased", /ccTag[\s\S]{0,80}toUpperCase/.test(CS), "the tag stopped being normalised");
}

console.log("\n[the corpus] a mixed-case culture is not hypothetical");
{
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  const found = [];
  try {
    for (const d of fs.readdirSync(WS)) {
      let nm = "";
      try { nm = (/name="([^"]+)"/.exec(fs.readFileSync(path.join(WS, d, "descriptor.mod"), "latin1")) || [])[1] || ""; } catch (_) {}
      const cdir = path.join(WS, d, "common", "countries");
      let dir = [];
      try { dir = fs.readdirSync(cdir).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
      // ⚠️ Only stop on a MIXED-CASE hit. A first version broke on the first file declaring any culture at
      // all, so a lowercase one ended the search for that mod and the check reported "none found" about a
      // corpus that plainly has one.
      for (const f of dir) {
        let t = "";
        try { t = fs.readFileSync(path.join(cdir, f), "latin1"); } catch (_) { continue; }
        const m = /graphical_culture\s*=\s*([A-Za-z_]+)/.exec(t);
        if (m && /[A-Z]/.test(m[1])) { found.push(`${nm.slice(0, 20)}:${m[1]}`); break; }
      }
    }
  } catch (_) {}
  console.log(`     mixed-case graphical_culture in installed mods: ${found.join(", ") || "(none found)"}`);
  rec("at least one installed mod ships a mixed-case culture", found.length > 0,
    "none found — the case-folding would then be harmless, though still wrong");
}

console.log(`\n=== startup bridge accepts real ids: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
