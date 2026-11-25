// The Save button on the Decisions page threw before it ever reached the server.
//
// `advVal` was declared with `const` alongside the rest of the Advanced fields, but `cancelTrigger` — several
// lines ABOVE that — already called it. `const` bindings are in the temporal dead zone until their
// declaration runs, so every save of an ORDINARY decision died on
//
//     ReferenceError: Cannot access 'advVal' before initialization
//
// before the fetch, before any status text was set. Nothing was written and nothing was said: the button
// looked like it simply did nothing. Only MISSIONS saved, because the mission branch of that ternary never
// reaches the call — and the endpoint itself was fine the whole time, which is why every API-level decision
// test stayed green through it. It took driving the real page to find.
//
// The guard below is deliberately scoped to the ONE handler it is about. A first attempt scanned every
// maker's client for "arrow helper called above its own declaration" and produced nothing but false
// positives — these files are one big closure, so a regex cannot tell which function a call belongs to, and
// it flagged two sibling functions that each declare their own `buildSection`, plus every helper called from
// inside a callback body (which runs later, and is therefore legal). Inside a single handler whose exact
// braces can be found, the same question IS answerable.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");

// ── the handler's exact span ─────────────────────────────────────────────────────────────────────
const handlerStart = src.indexOf('saveDecisionBtn.addEventListener("click"');
ok("the save handler is still wired to the button", handlerStart !== -1);

const bodyOpen = src.indexOf("{", src.indexOf("=>", handlerStart));
let depth = 0, bodyClose = -1, inStr = false, strCh = "";
for (let i = bodyOpen; i < src.length; i++) {
  const ch = src[i], prev = src[i - 1];
  if (inStr) { if (ch === strCh && prev !== "\\") inStr = false; continue; }
  if (ch === '"' || ch === "'" || ch === "`") { inStr = true; strCh = ch; continue; }
  if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
  if (ch === "{") depth++;
  else if (ch === "}") { depth--; if (depth === 0) { bodyClose = i; break; } }
}
ok("…and its body is brace-balanced", bodyClose !== -1, { bodyOpen, bodyClose });
const body = src.slice(bodyOpen, bodyClose === -1 ? undefined : bodyClose);

// ── the exact regression ─────────────────────────────────────────────────────────────────────────
{
  const decl = body.indexOf("const advVal = (elId)");
  const firstUse = body.indexOf("advVal(");
  ok("the handler still defines advVal", decl !== -1);
  ok("advVal is DECLARED before it is first called", decl !== -1 && firstUse !== -1 && decl < firstUse,
    { declaredAt: decl, firstCalledAt: firstUse });
  const cancel = body.indexOf('advVal("decisionCancelTriggerAdv")');
  ok("…including the cancel_trigger read that first tripped it", cancel === -1 || decl < cancel,
    { declaredAt: decl, cancelTriggerAt: cancel });
}

// ── the same class, but only WITHIN this handler, where scope is unambiguous ──────────────────────
// Every `const NAME = (…) => …` in the handler body must be declared before any call to NAME that is not
// itself inside a nested arrow (those run later, so calling upward is fine).
{
  const code = body.replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
  const offenders = [];
  for (const m of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    const name = m[1], declAt = m.index;
    const callRe = new RegExp(`(?<![.\\w$])${name}\\s*\\(`, "g");
    let c;
    while ((c = callRe.exec(code)) !== null) {
      if (c.index >= declAt) break;
      const lineStart = code.lastIndexOf("\n", c.index) + 1;
      const lineEnd = code.indexOf("\n", c.index);
      if (code.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).includes("=>")) continue; // nested arrow
      offenders.push({ name, calledAt: c.index, declaredAt: declAt });
      break;
    }
  }
  ok("no helper in the save handler is called above its own declaration", offenders.length === 0, offenders.slice(0, 4));
}

// ── and the handler still reaches the endpoint ───────────────────────────────────────────────────
ok("the handler posts to /api/decisions/save", /fetch\("\/api\/decisions\/save"/.test(body));
ok("…and re-enables the button afterwards", /saveDecisionBtn\.disabled = false/.test(body) || /finally/.test(body), "no re-enable found");

console.log("\ntest-decision-save-handler: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 8 ? 0 : 1;
