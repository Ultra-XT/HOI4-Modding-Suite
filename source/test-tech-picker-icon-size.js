// #tech-picker-icon-tiny — THE STARTING-TECHNOLOGY BROWSER DREW ITS ICONS AT 34x16.
//
// Reported from play: the country-setup starting-tech browse icons are far too small.
//
// .tech-ico is sized for an INLINE row — a picture sitting beside a line of text, 34x16, hugging the left
// edge. The picker is not that: its tiles are 200px wide and reserve a whole row for the picture, so the
// same 34x16 sprite floated in a 176x40 space. A tech sprite is a single-frame image about 2.1:1 (vanilla's
// are ~144x68), so there was plenty to show.
//
// The inline size is left exactly as it was — the assigned-tech rows and the research page are built around
// it — and the picker opts into a large variant instead. Verified in the browser before shipping: the tiles
// render at 124px with 100x48 icons and 28 of 33 loaded real art.
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

const P = (f) => path.join(__dirname, "public", f);
const ICO = fs.readFileSync(P("tech-icon.js"), "utf8");
const CS = fs.readFileSync(P("country-setup.js"), "utf8");
const CSS = fs.readFileSync(P("styles.css"), "utf8");

// Run the real IIFE against a minimal DOM so html() is the shipped function, not a restatement of it.
function loadHelper() {
  const styleEls = [];
  const doc = {
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "", appendChild() {} }),
    head: { appendChild: (el) => styleEls.push(el) },
    documentElement: { appendChild: (el) => styleEls.push(el) },
    querySelectorAll: () => [],
  };
  const win = { document: doc, localStorage: { getItem: () => "" } };
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "Image", ICO)(win, doc, function Image() {});
  return { api: win.NovaTechIcon, css: styleEls.map((e) => e.textContent).join("\n") };
}

(async () => {
  try {
    console.log("\n[the helper] the shipped html() and its injected CSS");
    const { api, css } = loadHelper();
    rec("NovaTechIcon loaded", !!(api && typeof api.html === "function"), typeof api);
    rec("…and injected its stylesheet", /\.tech-ico\s*\{/.test(css), css.slice(0, 120));

    const inline = /\.tech-ico\s*\{[^}]*?width:\s*(\d+)px;\s*height:\s*(\d+)px/.exec(css);
    rec("the INLINE size is unchanged at 34x16", !!inline && inline[1] === "34" && inline[2] === "16",
      inline && `${inline[1]}x${inline[2]}`);

    const lg = /\.tech-ico--lg\s*\{[^}]*?width:\s*(\d+)px;\s*height:\s*(\d+)px/.exec(css);
    rec("a large variant exists", !!lg, css);
    if (lg) {
      const w = Number(lg[1]), h = Number(lg[2]);
      rec("…and it is much bigger than the inline size", w >= 80 && h >= 40, `${w}x${h}`);
      const area = (w * h) / (34 * 16);
      rec("…several times the area", area >= 5, `${area.toFixed(1)}x the inline area`);
      // background-size:contain means a wrong ratio only wastes space, never distorts — but a box shaped
      // like the sprite wastes none. Vanilla's tech pictures are about 2.1:1.
      const ratio = w / h;
      rec("…and shaped like a tech sprite (about 2.1:1)", ratio > 1.7 && ratio < 2.6, ratio.toFixed(2));
      rec("…centred rather than left-hugging, because a tile is not a text row",
        /\.tech-ico--lg\s*\{[^}]*background-position:\s*center/.test(css), css.slice(css.indexOf(".tech-ico--lg"), css.indexOf(".tech-ico--lg") + 200));
    }

    console.log("\n[the API] opting in, and not changing anyone else");
    rec("the default call is unchanged — no variant class",
      api.html("infantry_weapons") === '<span class="tech-ico" data-tech="infantry_weapons" title="infantry_weapons"></span>',
      api.html("infantry_weapons"));
    rec("…and asking for the large one adds it",
      /class="tech-ico tech-ico--lg"/.test(api.html("infantry_weapons", { size: "lg" })),
      api.html("infantry_weapons", { size: "lg" }));
    rec("…an unknown size is treated as the default, not as an error",
      !/tech-ico--/.test(api.html("x", { size: "wat" })), api.html("x", { size: "wat" }));
    rec("the id is still escaped into the attribute",
      api.html('a"b').includes("&quot;"), api.html('a"b'));

    console.log("\n[the picker] uses it, and has room for it");
    rec("the starting-tech picker asks for the large icon",
      /NovaTechIcon\.html\(item\.id,\s*\{\s*size:\s*"lg"\s*\}\)/.test(CS), "picker still uses the inline size");
    const row = /height:\s*(\d+)px;\s*display:\s*flex;[^"]*justify-content:\s*center;\s*margin-bottom/.exec(CS);
    rec("…and the picture row is tall enough for it", !!row && Number(row[1]) >= 48, row && row[1]);
    const tile = /\.modal-item-tech\s*\{[\s\S]*?height:\s*(\d+)px/.exec(CSS);
    rec("…and the tile grew so the id and name are not squeezed out",
      !!tile && Number(tile[1]) >= 120, tile && tile[1]);
    if (row && tile) {
      rec("…the tile is taller than the picture row plus its margin", Number(tile[1]) > Number(row[1]) + 8,
        { tile: tile[1], row: row[1] });
    }

    console.log("\n[cache] a CSS change inside a .js file only ships if the tag is bumped");
    // The stylesheet lives INSIDE tech-icon.js, so a page holding a cached copy keeps the old sizes and the
    // fix simply does not arrive. Every page that loads it has to ask for the new version.
    const pages = fs.readdirSync(P("")).filter((f) => f.endsWith(".html"));
    const loaders = pages.filter((f) => fs.readFileSync(P(f), "utf8").includes("tech-icon.js"));
    rec("several pages load tech-icon.js", loaders.length >= 2, loaders);
    const versions = loaders.map((f) => {
      const m = /tech-icon\.js\?v=(\d+)/.exec(fs.readFileSync(P(f), "utf8"));
      return { page: f, v: m ? Number(m[1]) : null };
    });
    rec("…every one of them carries a version", versions.every((x) => x.v !== null), versions);
    rec("…and they all agree, so no page is left on the old stylesheet",
      new Set(versions.map((x) => x.v)).size === 1, versions);
    rec("country-setup.js is versioned too", /country-setup\.js\?v=\d+/.test(fs.readFileSync(P("country-setup.html"), "utf8")),
      "no version on country-setup.js");

    console.log("\n[back-out] put the picker back on the inline size");
    {
      // A client-only change, so the control is on the client source: revert the one call and check that each
      // assertion above actually depends on it. A control that changes nothing measurable is not a control.
      const reverted = CS.replace(/NovaTechIcon\.html\(item\.id,\s*\{\s*size:\s*"lg"\s*\}\)/, "NovaTechIcon.html(item.id)");
      rec("the control patched cleanly", reverted !== CS, "anchor did not match");
      rec("…and the picker check then fails, as it must",
        !/NovaTechIcon\.html\(item\.id,\s*\{\s*size:\s*"lg"\s*\}\)/.test(reverted), "the check does not depend on the call");
      // …and the same for the stylesheet half.
      const cssReverted = css.replace(/\.tech-ico--lg\{[^}]*\}/, "");
      rec("removing the variant leaves nothing for the picker to use",
        !/\.tech-ico--lg/.test(cssReverted), "variant survived the control");
      rec("…while the inline rule is untouched by that removal",
        /\.tech-ico\{[^}]*width:\s*34px/.test(cssReverted), cssReverted.slice(0, 140));
    }

    console.log("\n[still valid]");
    rec("tech-icon.js parses", (() => { try { new Function(ICO); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ICO); return "ok"; } catch (e) { return String(e.message); } })());
    rec("country-setup.js parses", (() => { try { new Function(CS); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(CS); return "ok"; } catch (e) { return String(e.message); } })());

    console.log(`\n=== tech picker icon size: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
