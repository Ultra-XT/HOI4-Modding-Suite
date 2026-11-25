// No page may pull a font from an external host (fonts.googleapis.com / fonts.gstatic.com): the app's CSP
// (style-src 'self' 'unsafe-inline'; font-src 'self' data:) blocks them, so such a <link> is dead weight that
// only logs a CSP violation on every load — and the app is an OFFLINE desktop tool anyway. Fonts must be
// 'self' or system. Run: node test-no-external-fonts.js  (auto-picked up by run-tests.js)
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(() => {
  console.log("=== No external font links (CSP-blocked, offline app) ===");
  const dir = path.join(__dirname, "public");
  const htmls = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
  ok("found the public HTML pages", htmls.length >= 8, htmls.length);
  const offenders = [];
  for (const f of htmls) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(txt)) offenders.push(f);
  }
  ok("no page links an external Google font" + (offenders.length ? " (offenders: " + offenders.join(", ") + ")" : ""), offenders.length === 0);
  console.log(`\nNO-EXTERNAL-FONTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
