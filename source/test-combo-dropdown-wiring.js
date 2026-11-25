// #combo-modal / #combo-not-shared — THE COUNTRY LIST IN "WHICH COUNTRY USES THIS TREE" COULD NOT BE SCROLLED.
//
// Reported from the focus editor: the tag dropdown opened as a plain list that ran off the bottom of the
// window with nothing to scroll, so only the first couple of dozen tags were reachable out of the 364 vanilla
// and 385 Millennium Dawn ones.
//
// The cause was not new code. Nova already had the fix — a styled, searchable, scrollable panel that replaces
// the native <datalist> popup, written when the SAME complaint came in about the Military maker. Its own
// comment said the panel had a hard max-height "so it can never bleed off-screen again". But it lived inside
// army.js, and its styles inside army.html's inline <style>, so index.html, characters.html,
// country-setup.html and research.html kept the native popup and kept the bug. The widget now lives in
// public/nova-combo.js + styles.css and every page that has an `<input list="…">` loads it.
//
// Moving it surfaced a second bug that only the focus editor could hit: its tag input sits inside a <dialog>
// opened with showModal(), and a modal does two things to the rest of the document — it paints above it (the
// top layer beats every z-index) and it makes it INERT. A panel appended to <body> was therefore buried AND
// dead: correctly positioned, correctly sized, correctly scrollable, and neither visible nor clickable.
// Making it a top-layer popover fixed only the painting half; inertness follows the DOM tree. The panel is
// now appended into the modal itself.
//
// This test guards the wiring, which is the part that actually regressed and the part a future page will get
// wrong: a maker adds an `<input list="…">`, forgets the script, and ships the native popup again.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const PUB = path.join(__dirname, "public");

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

const htmlFiles = fs.readdirSync(PUB).filter((f) => /\.html$/i.test(f));
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

// every `<input … list="X">` on a page, and the datalist ids the page declares
function listInputsOf(text) {
  return [...text.matchAll(/<input\b[^>]*\slist=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
}
function datalistIdsOf(text) {
  return new Set([...text.matchAll(/<datalist\b[^>]*\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
}

(async () => {
  try {
    console.log("\n[the widget exists once, in a shared file]");
    const comboJs = path.join(PUB, "nova-combo.js");
    rec("public/nova-combo.js exists", fs.existsSync(comboJs), "missing");
    const js = fs.existsSync(comboJs) ? fs.readFileSync(comboJs, "utf8") : "";
    rec("…and it parses", (() => { try { new Function(js); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(js); return "ok"; } catch (e) { return String(e.message); } })());
    rec("…and exposes NovaCombo", /window\.NovaCombo\s*=/.test(js), "no window.NovaCombo");
    const armyJs = fs.readFileSync(path.join(PUB, "army.js"), "utf8");
    rec("army.js no longer carries its own copy",
      !/function\s+novaCombo\s*\(/.test(armyJs) && !/_comboPanel\s*=\s*document\.createElement/.test(armyJs), "army.js still defines the widget");

    console.log("\n[every page with a list input loads it]");
    const offenders = [];
    let pagesWithLists = 0;
    for (const f of htmlFiles) {
      const t = read(f);
      const lists = listInputsOf(t);
      if (!lists.length) continue;
      pagesWithLists++;
      if (!/nova-combo\.js/.test(t)) offenders.push(`${f} (${lists.length} list inputs)`);
    }
    rec("at least five pages use `<input list=…>`", pagesWithLists >= 5, pagesWithLists);
    rec("…and none of them ships the native popup", offenders.length === 0, offenders);

    console.log("\n[no dangling list= attributes]");
    // A `list="X"` with no <datalist id="X"> is a dead dropdown either way — the native popup shows nothing
    // and the widget skips the input entirely (upgradeCombos requires the element to exist).
    const dangling = [];
    for (const f of htmlFiles) {
      const t = read(f);
      const ids = datalistIdsOf(t);
      for (const l of listInputsOf(t)) if (!ids.has(l)) dangling.push(`${f}: list="${l}"`);
    }
    rec("every list= attribute names a datalist that exists", dangling.length === 0, dangling);

    console.log("\n[the panel can be scrolled and cannot leave the window]");
    const css = fs.readFileSync(path.join(PUB, "styles.css"), "utf8");
    const rule = (/\.nova-combo\s*\{[\s\S]*?\}/.exec(css) || [""])[0];
    rec(".nova-combo is styled in the SHARED stylesheet", !!rule, "no .nova-combo rule in styles.css");
    rec("…it scrolls", /overflow-y:\s*auto/.test(rule), rule);
    rec("…it is capped in height", /max-height:\s*\d/.test(rule), rule);
    rec("…and the cap includes its border, so the measured height is the real one",
      /box-sizing:\s*border-box/.test(rule), rule);
    rec("…it is position:fixed so no ancestor's overflow can clip it", /position:\s*fixed/.test(rule), rule);
    rec("…and no inherited edge can stretch it", /inset:\s*auto/.test(rule), rule);
    rec("army.html no longer styles it privately", !/\.nova-combo\s*\{/.test(read("army.html")), "army.html still has the rule");

    console.log("\n[a modal dialog must not bury or deaden the panel]");
    rec("the panel is hosted inside a modal <dialog> when the input is in one",
      /closest\(["']dialog["']\)/.test(js) && /matches\(["']:modal["']\)/.test(js), "no modal host selection");
    rec("…and the placement measures from the same rounded offset it positions at",
      /const topPx = Math\.round/.test(js) && /window\.innerHeight - topPx - GAP/.test(js), "placement still measures the raw rect");
    rec("picking a value does not reopen the panel on top of the choice",
      /_picking/.test(js) && /if \(_picking\) return;/.test(js), "no _picking guard");

    console.log("\n[back-out] drop the script from the focus editor again");
    {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-combo-ctl-"));
      const t = read("index.html");
      const stripped = t.replace(/\s*<script src="\.\/nova-combo\.js[^"]*"><\/script>/, "");
      rec("the control actually removed the tag", stripped !== t && !/nova-combo\.js/.test(stripped),
        stripped === t ? "no change" : "still referenced");
      fs.writeFileSync(path.join(tmp, "index.html"), stripped, "utf8");
      const back = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
      rec("…and index.html then ships list inputs with no dropdown",
        listInputsOf(back).length > 0 && !/nova-combo\.js/.test(back), "control did not reproduce it");
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }

    console.log(`\n=== combo dropdown wiring: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
