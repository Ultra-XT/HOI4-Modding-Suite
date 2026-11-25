// When Nova cannot start, one dialog is the entire user experience. On 2026-08-29 a user hit it and got:
//
//     Failed to start Focus Editor:
//     ERR_FAILED (-2) loading 'http://127.0.0.1:60299/home.html'
//
// Two defects in one box. "Focus Editor" is the former name of a single PAGE — renamed to "Focus Tree"
// during the reorg — not the name of the product, which is "Nova Modding Suite". And "ERR_FAILED (-2)" is a
// raw Chromium code handed to a modder with no next step. The users here are not programmers; a failure
// screen that does not say what to do is barely better than a crash.
//
// This pins both halves. It does NOT merely grep the source — a grep would pass on a message that named the
// product and still said nothing useful. Instead it lifts describeStartupFailure out of main.js and RUNS it
// against stubs, so what is asserted is the text a user would actually see.
//
// ⚠️ Comments are stripped first, and that is not a formality here: the fix's own explanatory comment quotes
// the exact string "Focus Editor" that section 1 forbids. Without stripping, this test fails on the prose
// that documents the fix.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const MAIN = path.join(__dirname, "main.js");
const RAW = fs.readFileSync(MAIN, "utf8");
const SRC = stripJsComments(RAW);

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Lift a top-level `function name(...) { … }` out of a source file by matching braces from its opening one.
// Template holes like ${port} contribute one "{" and one "}" each, so they stay balanced under a plain count.
function extractFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return null;
}

try {
  console.log("1. The product is called by its own name");
  // The old text named a page, not the app. Stripped source only — the fix's comment quotes the old string.
  rec("main.js no longer calls the app \"Focus Editor\"", !/Focus Editor/.test(SRC),
    "that is a page's former name, and the page is now called Focus Tree");
  rec("…and the failure dialog is titled with the product", /showErrorBox\(\s*"Nova could not start"/.test(SRC));
  rec("…which matches package.json's productName", (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    const product = (pkg.build && pkg.build.productName) || pkg.productName || "";
    return /^Nova/.test(product);
  })(), "Nova Modding Suite");

  console.log("\n2. The message is generated, not hard-coded");
  const fnSrc = extractFunction(SRC, "describeStartupFailure");
  rec("describeStartupFailure exists and was extracted", !!fnSrc && fnSrc.length > 200,
    fnSrc ? fnSrc.length + " chars" : "NOT FOUND");
  if (!fnSrc) throw new Error("cannot continue without the function");

  // Run it against stubs. serverHandle and constants are main.js module scope, so they are injected.
  const make = (port, defaultPort) =>
    new Function("serverHandle", "constants", fnSrc + "; return describeStartupFailure;")(
      port == null ? null : { port },
      { DEFAULT_PORT: defaultPort }
    );

  const ERR = new Error("ERR_FAILED (-2) loading 'http://127.0.0.1:60299/home.html'");

  console.log("\n3. What the user actually reads for the reported failure");
  const onFallback = make(60299, 47821)(ERR);
  rec("it does not open with a raw error code", !/^ERR_/.test(onFallback.trim()));
  rec("it says what went wrong in plain words", /background service/i.test(onFallback));
  rec("it gives a numbered next step", /1\./.test(onFallback) && /2\./.test(onFallback));
  rec("…and the first step is the one that usually works", /Close every Nova window/i.test(onFallback));
  rec("it still carries the raw detail for a bug report", onFallback.includes("ERR_FAILED (-2)"));
  rec("…labelled as such, so the user knows to paste it", /bug report/i.test(onFallback));

  console.log("\n4. It uses the evidence it actually has");
  // The port fallback is a real clue: it means something already held the default port.
  rec("a fallback port is reported when one was used", /60299/.test(onFallback) && /47821/.test(onFallback));
  // Over-correction control: on the DEFAULT port there was no fallback, so claiming one would be a lie.
  const onDefault = make(47821, 47821)(ERR);
  rec("…and NOT invented when the default port was used", !/fell back/i.test(onDefault));
  const noServer = make(null, 47821)(ERR);
  rec("…and not claimed when no server handle exists", !/fell back/i.test(noServer));

  console.log("\n5. A failure that is not a load error still gets guidance");
  const other = make(47821, 47821)(new Error("EACCES: permission denied, open 'descriptor.mod'"));
  rec("non-load failures are handled too", /could not finish starting up/i.test(other));
  rec("…with a next step", /launch again/i.test(other));
  rec("…and the raw detail", other.includes("EACCES"));

  console.log("\n6. These checks would reject the message that was actually shipped");
  // No bug left to back out, so compose the old one and confirm every property above fails on it.
  const OLD = "Failed to start Focus Editor:\n" + ERR.message;
  rec("the old text would be caught by the naming check", /Focus Editor/.test(OLD));
  rec("…by the plain-words check", !/background service/i.test(OLD));
  rec("…by the next-step check", !/1\./.test(OLD) || !/Close every Nova window/i.test(OLD));
  rec("…and by the bug-report-label check", !/bug report/i.test(OLD));
  // And the inverse, so the checks are not passing vacuously on everything.
  rec("the new text is not the old shape", !/Focus Editor/.test(onFallback));

  console.log("\n7. The comment-stripping is load-bearing");
  // Proof, not assertion: the raw file DOES contain the forbidden string, in the comment explaining the fix.
  rec("raw main.js still contains \"Focus Editor\" in prose", /Focus Editor/.test(RAW),
    "so a test that skipped stripJsComments would fail on its own documentation");
  rec("…and stripping is what removes it", !/Focus Editor/.test(SRC));

  console.log(`\n=== the startup error is worth reading: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
