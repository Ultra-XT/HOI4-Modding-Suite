// #inline-handlers-reintroduced — HANDLERS THE PAGE'S OWN CSP BLOCKS.
//
// Every Nova page serves `script-src 'self'`, which forbids inline event handlers. They do not warn at
// author time and they do not throw at run time; they simply never fire, so the control looks wired and is
// inert. A 2026-06-18 pass replaced all of them with the data-fallback / data-hide-on-error pattern and one
// capture-phase listener per page.
//
// Five had come back. The browser said so, driving the real UI on a sandboxed port:
//   "Executing inline event handler violates the following Content Security Policy directive
//    'script-src 'self''. … The action has been blocked."
//   index.html    the focus sidebar's icon preview kept the browser's broken-image glyph instead of hiding
//   index.html    the Genesis toggle did nothing until Done was pressed
//   mio-editor.js three icon lists, same broken-image glyph
//
// ⭐ WHY THIS TEST EXISTS AT ALL. The invariant was already guarded — by e2e-img-fallback.js, which is in
// the OTHER suite: run-tests.js runs test-*.js only, and e2e-*.js are run separately. A rule policed by
// something that does not run on every change is a rule that decays, and this one did. Same check, in the
// suite that actually runs.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const PUB = path.join(__dirname, "public");

// ⚠️ DERIVED FROM THE HTML SPEC'S LIST, not from the handlers that happen to exist today — a sixth written
// tomorrow with onmouseenter= would otherwise sail past.
const EVENTS = [
  "abort", "blur", "cancel", "canplay", "change", "click", "close", "contextmenu", "copy", "cut",
  "dblclick", "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop", "error",
  "focus", "input", "invalid", "keydown", "keypress", "keyup", "load", "loadeddata", "mousedown",
  "mouseenter", "mouseleave", "mousemove", "mouseout", "mouseover", "mouseup", "paste", "play", "pause",
  "reset", "scroll", "select", "submit", "toggle", "wheel",
];
// `on<event> = "` or `on<event>='` immediately inside a tag or a generated markup string.
const INLINE = new RegExp(`\\bon(?:${EVENTS.join("|")})\\s*=\\s*["'\\\\]`, "i");

function filesUnder(dir, re) {
  const out = [];
  const walk = (d) => {
    let e = [];
    try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of e) {
      const f = path.join(d, x.name);
      if (x.isDirectory()) { walk(f); continue; }
      if (re.test(x.name)) out.push(f);
    }
  };
  walk(dir);
  return out;
}

try {
  const files = filesUnder(PUB, /\.(html|js)$/i);
  console.log(`\n[the sweep] ${files.length} files under public/`);
  // ⚠️ If the sweep finds no files, every check below passes for the wrong reason.
  rec("there are files to check", files.length > 10, files.length);

  const hits = [];
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
    const lines = t.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A property assignment (el.onclick = …) is fine — it is not an inline ATTRIBUTE.
      if (/\.\s*on[a-z]+\s*=/.test(line) && !INLINE.test(line)) continue;
      if (!INLINE.test(line)) continue;
      // …and neither is a line that merely talks about one.
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("<!--")) continue;
      hits.push(`${path.relative(PUB, f)}:${i + 1}  ${trimmed.slice(0, 110)}`);
    }
  }
  for (const h of hits.slice(0, 12)) console.log(`     ${h}`);
  rec("no page carries an inline event handler the CSP would block", hits.length === 0, hits.slice(0, 12));

  console.log("\n[the replacement] the pattern those handlers were converted to must be present");
  {
    // Each page that marks images this way needs a capture-phase listener, because `error` does not bubble.
    const marked = [];
    const listeners = [];
    for (const f of files.filter((x) => /\.js$/i.test(x))) {
      let t = "";
      try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      if (/data-hide-on-error|data-fallback=/.test(t)) marked.push(path.basename(f));
      // ⚠️ A WINDOW WIDE ENOUGH FOR THE BODY. This was capped at 400 characters and reported app.js and
      // ideas.js as having NO capture listener when both do — an under-report that would have hidden the
      // real regression it exists to catch.
      if (/addEventListener\("error"[\s\S]{0,2000}?,\s*true\s*\)/.test(t)) listeners.push(path.basename(f));
    }
    console.log(`     files that MARK images: ${marked.join(", ") || "(none)"}`);
    console.log(`     files that install a capture listener: ${listeners.join(", ") || "(none)"}`);
    rec("images are marked with the data attributes", marked.length > 0, marked);
    rec("…and at least one capture-phase listener exists to act on them", listeners.length > 0, listeners);
    // The listener belongs to the PAGE, not to every file that marks an image: mio-editor.js marks three
    // and installs none, which is correct — ideas.js, loaded by the same page, carries it.
    for (const rel of ["app.js", "ideas.js", "research.js"]) {
      rec(`${rel} installs its listener in the capture phase (error does not bubble)`,
        listeners.includes(rel), listeners);
    }

    // The two shared listeners must handle BOTH halves — the swap and the hide. research.js has always had
    // both; app.js and ideas.js had only the swap, which is why mio-editor.js's icons had nowhere to turn.
    for (const rel of ["app.js", "ideas.js", "research.js"]) {
      let t = "";
      try { t = fs.readFileSync(path.join(PUB, rel), "utf8"); } catch (_) { continue; }
      rec(`${rel} handles data-fallback`, /dataset\.fallback/.test(t), "no swap branch");
      rec(`${rel} handles data-hide-on-error`, /dataset\.hideOnError/.test(t), "no hide branch");
    }
  }

  console.log("\n[the specific ones] the handlers this replaced");
  {
    const idx = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
    rec("the focus icon preview hides via the data attribute",
      /id="sb-icon-preview"[^>]*data-hide-on-error/.test(idx), "not converted");
    rec("the Genesis toggle no longer carries an inline onchange",
      /id="genesisSettingsToggle"(?![^>]*onchange)/.test(idx), "still inline");
    const app = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
    rec("…and is wired in JS instead",
      /genesisSettingsToggle[\s\S]{0,200}?addEventListener\("change"/.test(app), "no listener");
    const mio = fs.readFileSync(path.join(PUB, "mio-editor.js"), "utf8");
    const marks = (mio.match(/data-hide-on-error/g) || []).length;
    console.log(`     mio-editor.js icon marks: ${marks}`);
    rec("all three MIO icon lists use the data attribute", marks === 3, marks);
  }

  console.log("\n[the ?v= convention] the edited scripts carry a bumped token");
  {
    // ⚠️ CONVENTION, NOT MECHANISM — measured, because the obvious reading is wrong. Nova marks its page
    // scripts with a ?v= token and several tests assert minimum versions, which reads as "a fix without a
    // bump is served from cache and never runs". It is not: express.static is configured
    // { etag: false, lastModified: false } and the server sends `Cache-Control: no-store, max-age=0` with
    // no ETag and no Last-Modified for every static file, so nothing is stored to go stale. 35 of Nova's
    // 80 page scripts carry no token at all and are fine.
    //
    // The token still earns its place as a visible marker that a file changed, and existing tests depend on
    // it, so the three edited here are bumped to match. Nobody should spend effort adding the other 35.
    const idx = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
    const ideas = fs.readFileSync(path.join(PUB, "ideas.html"), "utf8");
    const tok = (html, file) => {
      const m = new RegExp(`${file.replace(".", "\\.")}\\?v=([A-Za-z]*)(\\d+)`).exec(html);
      return m ? { prefix: m[1], n: Number(m[2]) } : null;
    };
    const a = tok(idx, "app.js"), i = tok(ideas, "ideas.js"), m = tok(ideas, "mio-editor.js");
    console.log(`     app.js?v=${a ? a.prefix + a.n : "(none)"}   ideas.js?v=${i ? i.prefix + i.n : "(none)"}   mio-editor.js?v=${m ? m.prefix + m.n : "(none)"}`);
    rec("app.js carries a version token", !!a && a.n >= 31, a);
    rec("ideas.js carries a version token", !!i && i.n >= 55, i);
    rec("mio-editor.js carries a version token", !!m && m.n >= 11, m);
  }

  console.log(`\n=== no inline event handlers: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
