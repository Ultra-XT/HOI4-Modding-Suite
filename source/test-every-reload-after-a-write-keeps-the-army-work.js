// ⛔ #every-reload-after-a-write-keeps-the-army-work (B4-2, B3-8, B5-3) and #a-removed-country-keeps-its-line (B2-5).
//
// load() asks "You have unsaved changes that will be discarded if you reload. Continue?" about the 🪖 Army tool's unsaved work
// unless it is told the reload re-reads a map a write has just changed ({ afterSave: true }): then the army work is kept
// (armyAfterMapReload keeps it; armySave's fingerprint guards its Save). 🔧 Auto-fix all, 🗺 Redraw regions, 🌍 Generate land,
// ✨ New country, 🏳 Remove / Restore country and 🛟 Restore baseline reloaded bare, so the question came only AFTER the write: a
// Cancel left the page holding a map the disk no longer had (the tool campaign's B4 measured a Terrain edit then sending the old
// Coastal flag back over Auto-fix's repair), a Continue dropped the army work (CAN 14 -> 13 divisions for a write that touched
// only map/definition.csv). And Remove country reloaded with a plain load(), whose rivers overlay replaced its line, and ran no
// check of the map after the write (B2-5), where Restore country, 30 lines below, used the shared check.
//
// Derived from the source, comments and strings masked: EVERY load(...) and reloadAfterImmediateWrite(...) call on the page,
// other than the page's own first load and reloadAfterImmediateWrite's hand-on of its own options, passes { afterSave: true }.
// Then load() itself is RUN (lifted) with unsaved army work, to hold the flag to what it promises.
"use strict";
const P = require("./testlib-map-page.js");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ✓ " + m); else { fails.push(m); console.log("  ✗ " + m + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 600) : "")); } };

(async () => {
  try {
    const SRC = P.MAP;
    const M = maskJsLiterals(maskJsComments(SRC));
    const lineOf = (i) => SRC.slice(0, i).split("\n").length;
    // the span of a function in the masked text, by its opening
    const spanOf = (opening) => { const s = M.indexOf(opening); if (s < 0) throw new Error("no " + opening); let d = 0, i = M.indexOf("{", s); for (; i < M.length; i++) { if (M[i] === "{") d++; else if (M[i] === "}") { d--; if (!d) break; } } return [s, i]; };
    const start = spanOf("async function startMapPage()"), reloader = spanOf("async function reloadAfterImmediateWrite(");
    const calls = [];
    const re = /(?<![A-Za-z0-9_$.])(load|reloadAfterImmediateWrite)\(/g;
    let m;
    while ((m = re.exec(M))) {
      const at = m.index;
      if (/function\s+$/.test(M.slice(Math.max(0, at - 12), at))) continue;   // the declarations
      let d = 0, j = at + m[0].length - 1;
      for (; j < M.length; j++) { if (M[j] === "(") d++; else if (M[j] === ")") { d--; if (!d) break; } }
      const args = M.slice(at + m[0].length, j);
      const inStart = at > start[0] && at < start[1], inReloader = at > reloader[0] && at < reloader[1];
      calls.push({ fn: m[1], line: lineOf(at), afterSave: /\{\s*afterSave:\s*true\s*\}/.test(args), inStart, inReloader, args: args.replace(/\s+/g, " ").slice(-60) });
    }
    const judged = calls.filter((c) => !c.inStart && !c.inReloader);
    ok(judged.length >= 12, `THE CONTROL: ${judged.length} reloads after a write found on the page (load and reloadAfterImmediateWrite)`, calls.map((c) => c.fn + "@" + c.line));
    const bare = judged.filter((c) => !c.afterSave);
    ok(bare.length === 0, "⭐⭐⭐ every one of them passes { afterSave: true }, so unsaved army work is kept and the page takes the disk's map", bare);
    ok(calls.some((c) => c.inStart && c.fn === "load" && !c.afterSave), "…and the page's own first load (startMapPage) is the one bare load, which follows no write", calls.filter((c) => c.inStart));
    ok(calls.some((c) => c.inReloader && /loadOpts/.test(c.args)), "…and reloadAfterImmediateWrite hands its options on to load()", calls.filter((c) => c.inReloader));
    // each immediate writer named in the finding, by its own line
    const has = (needle) => { const i = M.indexOf(needle); return i >= 0 && judged.some((c) => Math.abs(c.line - lineOf(i)) <= 12 && c.afterSave); };
    for (const [what, needle] of [["🔧 Auto-fix all", "close(); await load(summaryLine"], ["🗺 Redraw regions", "reloadAfterImmediateWrite(redrawResultNote(res)"], ["🌍 Generate land", "reloadAfterImmediateWrite(generatedLandResultNote(res)"], ["🛟 Restore baseline", "close(); await load(restoredLine"]]) ok(has(needle), `⭐ ${what} reloads with it`);
    const delSpan = SRC.slice(SRC.indexOf('fetch("/api/map/delete-country"'), SRC.indexOf('fetch("/api/map/delete-country"') + 1400);
    ok(/await reloadAfterImmediateWrite\(`Removed \$\{r\.tag\}/.test(delSpan) && !/\n\s*await load\(\);/.test(delSpan.slice(0, delSpan.indexOf("} catch (e)"))), "⭐⭐ 🏳 Remove country reloads through the shared check with its line, as Restore country does (B2-5)", delSpan.slice(0, 700));

    console.log("\n-- load() itself, run: what the flag promises --");
    const asked = [];
    const run = (opts) => {
      asked.length = 0;
      const pg = P.runPage(["async function load(doneMsg)"], P.loadGlobals({
        armyHasUnsaved: () => true, dirtyMap: false, modPath: () => "C:/m", fetch: async () => ({ json: async () => ({ ok: false, error: "stop here" }) }),
        window: { confirm: (q) => { asked.push(q); return false; } }, offerDropStopped: () => {}, renderCheckpoints: () => {}, checkpointsDropped: 0,
      }));
      return pg.sb.load("line", opts).then(() => pg);
    };
    await run(undefined);
    ok(asked.length === 1, "THE CONTROL: a bare reload with unsaved army work asks the discard question", asked);
    await run({ afterSave: true });
    ok(asked.length === 0, "⭐⭐ a reload after a write does not ask about the army work (it is kept)", asked);
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
  } finally {
    console.log(`\n=== every reload after a write keeps the army work: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
