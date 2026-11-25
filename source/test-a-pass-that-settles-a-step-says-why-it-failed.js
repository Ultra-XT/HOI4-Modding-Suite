// An Auto-fix step that FAILS while the click settles its repairs says so in the click's answer.
// ⛔ #a-pass-that-settles-a-step-says-why-it-failed (tool campaign B6-1, the data half)
//
// THE DEFECT. autoFixMap runs a few steps a SECOND time once the fixers that move provinces have run: the region rounds, the second
// inland-sea + stateless-land pass, the final empty-state sweep with its gap-closer, and the port settle. Each sat in
//
//     try { … } catch (e) { /* leave the first-pass results as-is */ }
//
// and also dropped an error a pass RETURNED (closeStateIdGaps answers { error } when it cannot close a gap). And fixEmptyStates
// itself caught a deleteState that threw with `catch (_) {}`. A write refused part-way (a read-only state file, the shape a file
// copied out of a Workshop folder has, or one the running game holds open) then came back as a click that had nothing to say: the
// state the click could not remove stayed FATAL on the screen, and the answer carried no word of why.
//
// THE FIXTURES are the two smallest shapes that reach each silent spot with a REAL refusal (nothing is stubbed):
//   1. a read-only state file holding a real state and an EMPTY one of the mod's own — the first sweep tries to delete the empty
//      one, and the rewrite of that file is refused;
//   2. a country's capital in an empty state below the top id — the first sweep skips it (a capital), fixForeignCapitals moves the
//      capital, the SECOND sweep deletes it, and the gap-closer must then renumber the top state, whose file is read-only.
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath } (public/map.js #mapErrFix).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("settle-says-why");
const { createApp } = require("./server.js");

const rulesOf = (v) => { const t = {}; for (const p of (v && v.problems) || []) t[p.rule] = (t[p.rule] || 0) + 1; return t; };
const READ_ONLY = /read-only or in use/;
const locked = [];
const lock = (f) => { fs.chmodSync(f, 0o444); locked.push(f); };

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ The first sweep's delete is REFUSED — and the click says which state it left, and why");
    {
      // The mod overrides the base game's 3-C.txt by name, and that file also declares a state of the mod's own, 4, with no provinces.
      const EMPTY4 = 'state = {\n\tid = 4\n\tname = "STATE_4"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n}\n';
      const mod = world.mod("settle says why one", { "history/states/3-C.txt": lib.st(3, "3") + "\n" + EMPTY4 });
      const FILE = path.join(mod, "history", "states", "3-C.txt");
      lock(FILE);
      const bytes = fs.readFileSync(FILE);
      const before = rulesOf(await srv.validate(mod));
      rec("CONTROL: validate names the empty state the sweep exists for", (before.empty_state || 0) + (before.empty_state_with_content || 0) >= 1, before);
      const res = await srv.autoFix(mod);
      const es = ((res.body && res.body.fixes) || {}).emptyStates || {};
      rec("the click answers 200 ok (a refused write is not a failed click)", res.status === 200 && res.body && res.body.ok === true, { status: res.status, error: res.body && res.body.error });
      rec("CONTROL: the refusal was real — the read-only file is byte-identical and still declares state 4",
        fs.readFileSync(FILE).equals(bytes) && /id = 4/.test(fs.readFileSync(FILE, "utf8")));
      rec("…and nothing claims state 4 was deleted", !(es.deleted || []).includes(4), es);
      const s = (es.skipped || []).find((x) => x && x.id === 4);
      rec("⭐⭐⭐ the answer names state 4 as an empty state the click left alone", !!s, es);
      rec("⭐⭐⭐ …with the refusal's own words as the reason", !!s && READ_ONLY.test(String(s.reason || "")), s);
    }

    console.log("\n2. ⭐⭐⭐ The SECOND sweep's gap-closer is refused — and the click says so on that step");
    {
      // replace_path makes every state the mod's own, so the second sweep's delete is clean and the gap it opens is the mod's.
      const mod = world.mod("settle says why two", {
        "descriptor.mod": 'name="settle says why two"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-A.txt": lib.st(1, "4"),
        "history/states/2-B.txt": lib.st(2, ""),
        "history/states/3-C.txt": lib.st(3, "2 3 5"),
        "history/countries/AAA - Aaa.txt": "capital = 2\n",
      });
      const TOP = path.join(mod, "history", "states", "3-C.txt");
      lock(TOP);
      const before = rulesOf(await srv.validate(mod));
      rec("CONTROL: validate names the empty CAPITAL state (the shape the second sweep exists for)", (before.empty_capital_state || 0) >= 1, before);
      const res = await srv.autoFix(mod);
      const fixes = (res.body && res.body.fixes) || {};
      rec("the click answers 200 ok", res.status === 200 && res.body && res.body.ok === true, { status: res.status, error: res.body && res.body.error });
      rec("CONTROL: the capital moved off state 2 and the SECOND sweep deleted it, opening gap 2",
        ((fixes.capitals || {}).fixed || 0) >= 1 && ((fixes.emptyStates || {}).deleted || []).includes(2) && !fs.existsSync(path.join(mod, "history", "states", "2-B.txt")),
        { capitals: fixes.capitals, emptyStates: fixes.emptyStates });
      rec("CONTROL: the renumber was refused — the top state's read-only file still declares id 3", /id = 3/.test(fs.readFileSync(TOP, "utf8")));
      const sg = fixes.stateGaps || {};
      console.log(`       (stateGaps.error = ${JSON.stringify(sg.error || null).slice(0, 300)})`);
      rec("…and nothing claims the gap was closed", !(sg.renumbered || []).some((r) => r && r.to === 2), sg);
      rec("⭐⭐⭐ the gap-closer's step carries the refusal in `error`, the field the page says for a step", typeof sg.error === "string" && READ_ONLY.test(sg.error), sg);
      rec("⭐⭐ …and `settleError` says it came from the pass that settles the other repairs", typeof sg.settleError === "string" && sg.settleError.length > 0, sg);
      const after = rulesOf(await srv.validate(mod));
      rec("CONTROL: the gap is still on the screen — the click had something to say", (after.state_id_gap || 0) >= 1, after);
    }

    console.log("\n3. ⭐⭐ Derived from the source: no catch in the click, once it starts writing, swallows what it caught");
    {
      const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
      const C = maskJsComments(SRC), Lt = maskJsLiterals(SRC);
      const catchesIn = (fnName, fromMarker) => {
        const a = C.indexOf(`function ${fnName}(`);
        const span = a < 0 ? null : jsBodyAt(Lt, a);
        if (!span) return null;
        const from = fromMarker ? C.indexOf(fromMarker, span[0]) : span[0];
        const out = [];
        const re = /catch\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{/g;
        re.lastIndex = from;
        let m;
        while ((m = re.exec(C)) && m.index < span[1]) {
          const open = m.index + m[0].length - 1;
          let d = 0, close = -1;
          for (let j = open; j < span[1]; j++) { if (Lt[j] === "{") d++; else if (Lt[j] === "}" && --d === 0) { close = j; break; } }
          out.push({ line: SRC.slice(0, m.index).split("\n").length, body: close < 0 ? null : C.slice(open + 1, close).trim() });
        }
        return out;
      };
      const click = catchesIn("autoFixMap", "const fixes = {}");
      rec("autoFixMap and its catch clauses were found", Array.isArray(click) && click.length >= 40, click && click.length);
      const empty = (click || []).filter((c) => c.body === "" || c.body == null).map((c) => c.line);
      rec("⭐⭐ every catch in autoFixMap after `const fixes = {}` does something with what it caught (none is empty)", empty.length === 0, { emptyCatchAtLines: empty });
      const sweep = catchesIn("fixEmptyStates");
      rec("fixEmptyStates and its catch clauses were found", Array.isArray(sweep) && sweep.length >= 1, sweep);
      const emptySweep = (sweep || []).filter((c) => c.body === "" || c.body == null).map((c) => c.line);
      rec("⭐⭐ …and fixEmptyStates swallows no delete (none of its catches is empty)", emptySweep.length === 0, { emptyCatchAtLines: emptySweep });
    }
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    for (const f of locked) { try { fs.chmodSync(f, 0o644); } catch (_) {} }
    world.cleanup();
  }

  console.log(`\n=== a pass that settles a step says why it failed: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
