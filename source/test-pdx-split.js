// splitTopLevelPdxStatements is the bedrock of round-trip preservation in EVERY maker (characters, events,
// decisions, equipment, ideas re-read the on-disk block and carry un-modeled statements forward via this
// walker). If its string/comment/brace handling regressed, a quoted "}" or a commented "{" would mis-split
// a block and silently corrupt the mod on save — across many makers at once. This locks the adversarial cases.
"use strict";
const { splitTopLevelPdxStatements } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const keys = (s) => splitTopLevelPdxStatements(s).map((x) => x.key);

// 1. A quoted VALUE containing braces and a hash must not break statement boundaries.
{
  const st = splitTopLevelPdxStatements(`name = "A } { # not a comment"\nflag = yes\n`);
  check("quoted value with }{# → 2 statements", st.length === 2, JSON.stringify(st.map((x) => x.key)));
  check("first key=name, value keeps the whole quoted string", st[0].key === "name" && /"A \} \{ # not a comment"/.test(st[0].value), st[0].value);
  check("second statement is flag=yes", st[1].key === "flag" && /yes/.test(st[1].value));
}

// 2. A BLOCK whose body has a quoted "}" must close on the REAL brace, not the one inside the string.
{
  const st = splitTopLevelPdxStatements(`modifier = {\n\tcustom = "close } brace inside"\n\tx = 1\n}\nafter = yes\n`);
  check("block with in-string } → exactly 2 statements (modifier + after)", st.length === 2, JSON.stringify(st.map((x) => x.key)));
  const mod = st.find((x) => x.key === "modifier");
  check("modifier block captured WHOLE (has custom + x, ends with })", mod && /custom\s*=/.test(mod.value) && /x\s*=\s*1/.test(mod.value) && /\}\s*$/.test(mod.value), mod && mod.value);
  check("'after' survived as its own statement (block didn't swallow it)", st.some((x) => x.key === "after"));
}

// 3. A # comment containing braces must not change brace depth.
{
  const st = splitTopLevelPdxStatements(`block = {\n\t# a comment with } and { braces\n\treal = 1\n}\ntail = 2\n`);
  check("comment with braces → 2 statements", st.length === 2, JSON.stringify(st.map((x) => x.key)));
  const blk = st.find((x) => x.key === "block");
  check("block kept its real key past the comment", blk && /real\s*=\s*1/.test(blk.value));
  check("'tail' not swallowed by the comment's stray brace", st.some((x) => x.key === "tail" && /2/.test(x.value)));
}

// 4. Escaped quote inside a string must not end the string early.
{
  const st = splitTopLevelPdxStatements(`txt = "he said \\"hi\\" }"\nnext = 1\n`);
  check("escaped quote → 2 statements (string not ended early)", st.length === 2, JSON.stringify(st.map((x) => x.key)));
  check("next=1 parsed after the escaped-quote string", st.some((x) => x.key === "next"));
}

// 5. Nested blocks are captured whole (one top-level statement).
{
  const st = splitTopLevelPdxStatements(`outer = {\n\tinner = {\n\t\ta = 1\n\t}\n\tb = 2\n}\n`);
  check("nested blocks → 1 top-level statement", st.length === 1 && st[0].key === "outer", JSON.stringify(st.map((x) => x.key)));
  check("outer value contains the whole inner block + b", /inner\s*=\s*\{[\s\S]*a\s*=\s*1[\s\S]*\}/.test(st[0].value) && /b\s*=\s*2/.test(st[0].value), st[0].value);
}

// 6. A realistic mix round-trips its keys in order (the common case the preservers rely on).
{
  const body = `id = test.1\ntitle = "T"\nis_triggered_only = yes\noption = {\n\tname = a\n\tadd_political_power = 10\n}\n`;
  check("mixed body keys in order", JSON.stringify(keys(body)) === JSON.stringify(["id", "title", "is_triggered_only", "option"]), JSON.stringify(keys(body)));
}

// 7. Empty / whitespace input → no statements, no throw.
check("empty input → []", splitTopLevelPdxStatements("").length === 0);
check("whitespace/comment-only input → []", splitTopLevelPdxStatements("  \n# just a comment\n  ").length === 0);

console.log(`\nPDX-SPLIT TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
